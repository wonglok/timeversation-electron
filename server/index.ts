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
import { chatStream, type ChatChunk } from "./bring-agents/chat.ts";
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
        const { command, message, cwd } = req.body as {
            command?: string;
            message?: string;
            cwd?: string;
        };

        if (!command || !message) {
            res.status(400).json({
                error: "Missing required fields",
                message: "`command` and `message` are required.",
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

        req.on("close", () => {
            aborted = true;
        });

        void (async () => {
            try {
                for await (const chunk of chatStream({
                    command,
                    prompt: message,
                    cwd,
                })) {
                    if (aborted) break;
                    const data: ChatChunk = chunk;
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
