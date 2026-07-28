import { Router } from "express";
import { handleClaude } from "../agnets/handleClaude";
import { handleOpenCode } from "../agnets/handleOpenCode";
import { handleCodex } from "../agnets/handleCodex";
import { BrowserWindow } from "electron";

export const createChatRouter = async ({
    win,
    workspacePath,
}: {
    win: BrowserWindow;
    workspacePath?: string;
}) => {
    // ============================================================================
    // Router
    // ============================================================================

    const router = Router();

    // ---------------------------------------------------------------------------
    // POST /api/chat/stream — SSE streaming endpoint
    // ---------------------------------------------------------------------------
    router.post("/stream", (req, res) => {
        const { slug, message } = req.body as {
            slug?: string;
            message?: string;
        };

        if (!slug || !message) {
            res.status(400).json({ error: "slug and message are required" });
            return;
        }

        if (message && slug === "claude-code") {
            handleClaude({
                workspacePath,
                req,
                res,
                message,
            });
        } else if (message && slug === "opencode") {
            handleOpenCode({
                workspacePath,
                req,
                res,
                message,
            });
        } else if (message && slug === "openai-codex-cli") {
            handleCodex({
                workspacePath,
                req,
                res,
                message,
            });
        }
    });

    return router;
};
