import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { BrowserWindow } from "electron";
import { createChatRouter } from "./routes/chat";
import { createConversationsRouter } from "./routes/conversations";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

    // --- Conversations ---
    const conversationsRouter = await createConversationsRouter({ workspacePath });
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
