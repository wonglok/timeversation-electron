import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow } from "electron";
import { isIP } from "node:net";
import {
    BringYourOwnAgent,
    BUILTIN_AGENTS,
    type AgentDetectionResult,
} from "./bring-agents/byoa.ts";
import { chatStream } from "./bring-agents/chat.ts";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Express app
// ============================================================================

function createServer({ win }: { win: BrowserWindow }) {
    const app = express();
    const byoa = new BringYourOwnAgent();

    app.use(cors());
    app.use(express.json());

    // --- Health ---
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // --- Agent registry ---
    app.get("/api/agents", (_req, res) => {
        res.json({ agents: byoa.agents });
    });

    // --- Scan all agents (batch) ---
    app.post("/api/agents/scan", async (_req, res) => {
        try {
            const results = await byoa.scan();
            const installed = results.filter((r) => r.installed);
            res.json({
                total: results.length,
                installed: installed.length,
                results,
            });
        } catch (err) {
            res.status(500).json({
                error: "Agent scan failed",
                message: (err as Error).message,
            });
        }
    });

    // --- Scan installed only ---
    app.get("/api/agents/installed", async (_req, res) => {
        try {
            const installed = await byoa.getInstalled();
            res.json(installed);
        } catch (err) {
            res.status(500).json({
                error: "Installed agent scan failed",
                message: (err as Error).message,
            });
        }
    });

    // --- SSE streaming scan (real-time results to the frontend) ---
    app.get("/api/agents/scan/stream", (req, res) => {
        // SSE headers
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        });

        let aborted = false;

        req.on("close", () => {
            aborted = true;
        });

        void (async () => {
            try {
                for await (const result of byoa.scanStream()) {
                    if (aborted) break;
                    const data: AgentDetectionResult = result;
                    res.write(`data: ${JSON.stringify(data)}\n\n`);
                }
                if (!aborted) {
                    res.write("event: done\ndata: {}\n\n");
                }
            } catch (err) {
                if (!aborted) {
                    res.write(
                        `event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`,
                    );
                }
            } finally {
                if (!aborted) res.end();
            }
        })();
    });

    // --- Chat: send a prompt to an agent (SSE stream) ---
    app.post("/api/chat/send", (req, res) => {
        const { agentName, message, cwd } = req.body as {
            agentName?: string;
            message?: string;
            cwd?: string;
        };

        if (!agentName || !message) {
            res.status(400).json({
                error: "Missing required fields",
                message: "`agentName` and `message` are required.",
            });
            return;
        }

        // --- Validate agentName against the known registry ---
        const agentDef = byoa.agents.find(
            (a) => a.name.toLowerCase() === agentName.toLowerCase(),
        );
        if (!agentDef) {
            res.status(400).json({
                error: "Unknown agent",
                message: `"${agentName}" is not a recognized agent.`,
            });
            return;
        }

        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        });

        let aborted = false;
        let settled = false;

        req.on("close", () => {
            aborted = true;
            if (!settled) {
                handle.abort();
            }
        });

        const end = () => {
            if (settled) return;
            settled = true;
            if (!aborted) res.end();
        };

        const handle = chatStream(agentName, message, cwd, {
            onChunk: (chunk) => {
                if (aborted) return;
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            },
            onError: (err) => {
                if (aborted) return;
                res.write(
                    `event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`,
                );
                end();
            },
            onDone: () => {
                if (aborted) return;
                res.write("event: done\ndata: {}\n\n");
                end();
            },
        });
    });
    return app;
}

export async function startServer({
    win,
    port,
    workspacePath,
}: {
    win: BrowserWindow;
    port?: number;
    workspacePath?: string;
}) {
    //
    //
    const app = createServer({ win });
    const PORT = port || Number(process.env.PORT) || 8390;

    // In production, serve the built frontend
    const distPath = path.join(__dirname, "..", "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
    });

    return app.listen(PORT, () => {
        console.log(`Express server running at http://localhost:${PORT}`);
    });
}
