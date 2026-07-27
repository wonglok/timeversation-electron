import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { BrowserWindow } from "electron";
import * as claudeAgent from "./agnets/claude";
import * as opencodeAgent from "./agnets/opencode";
// import { existsSync, statSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Agent config registry — maps slug → agent invocation config
// ============================================================================

interface AgentConfig {
    cmd: string;
    args: string[];
}

const AGENT_CONFIGS: Record<string, AgentConfig> = {
    "claude-code": {
        cmd: claudeAgent.cmd,
        args: claudeAgent.args,
    },
    opencode: {
        cmd: opencodeAgent.cmd,
        args: opencodeAgent.args,
    },
};

//

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
// Helpers
// ============================================================================

/** Check whether a CLI binary is available on the system PATH */
function isCommandInstalled(cmd: string): boolean {
    try {
        execFileSync("which", [cmd], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

// ============================================================================
// Express app
// ============================================================================

function createServer({ win }: { win: BrowserWindow }) {
    const app = express();

    app.use(cors());
    app.use(express.json());

    // --- Health ---
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // --- Agent Detection ---
    app.post("/api/agents/detect", (req, res) => {
        const { agents } = req.body as {
            agents?: Array<{ slug: string; cliName: string }>;
        };

        if (!Array.isArray(agents)) {
            res.status(400).json({ error: "agents array is required" });
            return;
        }

        const installed: Record<string, boolean> = {};
        for (const agent of agents) {
            installed[agent.slug] = agent.cliName
                ? isCommandInstalled(agent.cliName)
                : false;
        }

        res.json({ installed });
    });

    // --- Chat ---
    app.post("/api/chat/send", (req, res) => {
        const { slug, message } = req.body as {
            slug?: string;
            message?: string;
        };

        if (!slug || !message) {
            res.status(400).json({ error: "slug and message are required" });
            return;
        }

        const config = AGENT_CONFIGS[slug];
        if (!config) {
            res.status(404).json({
                error: `No agent config found for slug: ${slug}`,
            });
            return;
        }

        try {
            // Replace placeholder with the user's message
            const resolvedArgs = config.args.map((arg) =>
                arg === "__REPLACE_ME_WITH_PROMPT__" ? message : arg,
            );

            const stdout = execFileSync(config.cmd, resolvedArgs, {
                encoding: "utf-8",
                timeout: 120_000,
                maxBuffer: 10 * 1024 * 1024,
            });

            res.json({ reply: stdout.trim() || "(no output)" });
        } catch (err: any) {
            const errorText =
                err.stderr || err.stdout || err.message || "Unknown error";
            res.json({ reply: `Error: ${errorText}` });
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
