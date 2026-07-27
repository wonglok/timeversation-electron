import { Router } from "express";
import { handleClaude } from "../agnets/handleClaude";
import { handleOpenCode } from "../agnets/handleOpenCode";

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
            req,
            res,
            message,
        });
    } else if (message && slug === "opencode") {
        //
        handleOpenCode({
            req,
            res,
            message,
        });
        //
    }
});

export default router;
