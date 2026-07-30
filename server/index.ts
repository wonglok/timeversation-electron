import express from "express";
import cors from "cors";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { app as electronApp, BrowserWindow } from "electron";
import { createChatRouter } from "./routes/chat";
import { createConversationsRouter } from "./routes/conversations";
import { createOpenAiNodeLlamaRouter } from "./routes/openai-node-llama";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = homedir();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve the user's full login-shell PATH by sourcing their shell rc file.
 * Cached after first call — avoids spawning a shell on every agent check.
 */
let _loginPath: string | null = null;

function getLoginPath(): string {
    if (_loginPath !== null) return _loginPath;

    const shell = process.env.SHELL || "/bin/zsh";
    const shellName = path.basename(shell);
    const rcFile =
        shellName === "zsh"
            ? ".zshrc"
            : shellName === "bash"
              ? ".bashrc"
              : null;

    // Build the shell snippet: source the rc file then print PATH
    let shellCmd: string;
    if (rcFile) {
        const rcPath = path.join(HOME, rcFile);
        shellCmd = `[ -f "${rcPath}" ] && . "${rcPath}" 2>/dev/null; echo "$PATH"`;
    } else {
        shellCmd = `echo "$PATH"`;
    }

    const result = spawnSync(shell, ["-l", "-c", shellCmd], {
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, HOME },
        timeout: 5000,
        encoding: "utf-8",
    });

    _loginPath =
        result.status === 0 && result.stdout
            ? result.stdout.trim()
            : (process.env.PATH ?? "");
    return _loginPath;
}

/** Check whether a CLI binary is available in the user's full shell environment. */
function isCommandInstalled(cmd: string): boolean {
    const dirs = new Set<string>();

    // 1. Login-shell PATH (sources .zshrc / .bashrc)
    const loginPath = getLoginPath();
    for (const p of loginPath.split(path.delimiter)) {
        if (p) dirs.add(p);
    }

    // 2. Common home-directory locations
    for (const sub of [
        ".local/bin",
        "bin",
        "node_modules/.bin",
        ".npm-global/bin",
        ".bun/bin",
        ".cargo/bin",
        "go/bin",
        ".yarn/bin",
    ]) {
        dirs.add(path.join(HOME, sub));
    }

    for (const dir of dirs) {
        try {
            accessSync(path.join(dir, cmd), constants.X_OK);
            return true;
        } catch {
            // Not in this directory — keep looking
        }
    }

    return false;
}

// ============================================================================
// Express app
// ============================================================================

async function createServer({
    win,
    workspacePath,
}: {
    workspacePath?: string;
    win: BrowserWindow;
}) {
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
    const chatRouter = await createChatRouter({ win, workspacePath });
    app.use("/api/chat", chatRouter);

    // --- Local LLM (node-llama-cpp) ---
    const modelsDir = path.join(
        electronApp.getPath("appData"),
        "timversation",
        "ai-models",
    );
    const llmRouter = await createOpenAiNodeLlamaRouter({ modelsDir });
    app.use("/api/llm", llmRouter);

    // --- Conversations ---
    const conversationsRouter = await createConversationsRouter({
        workspacePath,
    });
    app.use("/api/conversations", conversationsRouter);

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
    const app = await createServer({ win, workspacePath });
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
