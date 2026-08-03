import { Router } from "express";
// import { handleClaude } from "../agnets/handleClaude";
import { handleOpenCode } from "../agnets/handleOpenCode";
// import { handleLocalPiAgent } from "../agnets/handleLocalPiAgent";
import { BrowserWindow } from "electron";
// import { handleKimiCode } from "../agnets/handleKimiCode";
// import { handleCodex } from "../agnets/handleCodex";
import { handleCodexSDK } from "../agnets/handleCodexSDK";
import { handleClaudeSession } from "../agnets/handleClaudeSession";
import { handleKimiCodeSession } from "../agnets/handleKimiCodeSession";
import { handleLocalNodeLlamaSDK } from "../agnets/handleLocalNodeLlamaSDK";
import { handlePIAgentSession } from "../agnets/handlePIAgentSession";

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

        if (false) {
        } else if (message && slug === "claude-code-session") {
            handleClaudeSession({
                workspacePath,
                req,
                res,
                message,
                conversationId: req.body.conversationId,
            });
        } else if (message && slug === "opencode") {
            handleOpenCode({
                workspacePath,
                req,
                res,
                message,
                conversationId: req.body.conversationId,
            });
        } else if (message && slug === "kimi-code") {
            handleKimiCodeSession({
                workspacePath,
                req,
                res,
                message,
                conversationId: req.body.conversationId,
            });
        } else if (message && slug === "openai-codex-sdk") {
            handleCodexSDK({
                workspacePath,
                req,
                res,
                message,
                conversationId: req.body.conversationId,
            });
        } else if (message && slug === "local") {
            //

            handleLocalNodeLlamaSDK({
                workspacePath,
                req,
                res,
                message,
                conversationId: req.body.conversationId,
            });
        } else if (message && slug === "pi-coding-agent") {
            handlePIAgentSession({
                workspacePath,
                req,
                res,
                message,
                conversationId: req.body.conversationId,
            });
        }
    });

    return router;
};
