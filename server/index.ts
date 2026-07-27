import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import { BrowserWindow } from "electron";
import { BringYourOwnAgent } from "./bring-agents/byoa.ts";
// import { chatStream } from "./bring-agents/chat.ts";
import { runClaudePrompt } from "./bring-agents/agents/claude.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// SSE helpers
// ============================================================================

const encoder = new TextEncoder();

/** Encode an SSE frame as bytes: "data: <json>\n\n" */
function sseEvent(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Encode an SSE data-only frame: "data: <json>\n\n" */
function sseData(data: unknown): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

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
                    res.write(sseData(result));
                }
                if (!aborted) {
                    res.write(sseEvent("done", {}));
                }
            } catch (err) {
                if (!aborted) {
                    res.write(
                        sseEvent("error", { message: (err as Error).message }),
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

        // --- Validate agentName against the known registry (name or slug) ---
        const nameLower = agentName.toLowerCase();
        const agentDef = byoa.agents.find(
            (a) => a.slug === nameLower || a.name.toLowerCase() === nameLower,
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

        const end = () => {
            if (settled) return;
            settled = true;
            if (!aborted) res.end();
        };

        // --- Validate & sanitize working directory ---
        let safeCwd: string | undefined;
        if (cwd) {
            safeCwd = path.resolve(cwd);
            // Reject paths that don't exist or aren't directories
            if (!existsSync(safeCwd) || !statSync(safeCwd).isDirectory()) {
                res.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                    "X-Accel-Buffering": "no",
                });
                res.write(
                    sseData({
                        text: `[Error] Invalid working directory: "${cwd}". The path must exist and be a directory.`,
                        stream: "stderr",
                    }),
                );
                res.write(sseEvent("done", {}));
                res.end();
                return;
            }
        }
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
