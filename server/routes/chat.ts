import { Router } from "express";
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

    router.post("/stream", (req, res) => {
        const { slug, message } = req.body as {
            slug?: string;
            message?: string;
        };
    });

    return router;
};
