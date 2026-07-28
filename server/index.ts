import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow } from "electron";
import { createChatRouter } from "./routes/chat";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

    // --- Chat ---
    const chatRouter = await createChatRouter({ win, workspacePath });
    app.use("/api/chat", chatRouter);

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
    setTimeout(() => {
        // @ts-ignore
        import("../byoa/packages/server/src/index.ts");
    });

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
