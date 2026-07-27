import { Router } from "express";
import { execFileSync } from "node:child_process";
import * as claudeAgent from "../agnets/claude";
import * as opencodeAgent from "../agnets/opencode";

// ============================================================================
// Agent config registry
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

// ============================================================================
// Router
// ============================================================================

const router = Router();

// POST /api/chat/send
router.post("/send", (req, res) => {
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
        res.status(404).json({ error: `No agent config found for slug: ${slug}` });
        return;
    }

    try {
        // Inject `--` before the user message to prevent flag smuggling
        const resolvedArgs = config.args.map((arg) =>
            arg === "__REPLACE_ME_WITH_PROMPT__" ? ["--", message] : arg,
        ).flat();

        const stdout = execFileSync(config.cmd, resolvedArgs, {
            encoding: "utf-8",
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
        });

        res.json({ reply: stdout.trim() || "(no output)" });
    } catch (err: any) {
        // Log full details server-side; return generic error to client
        console.error("[chat] agent execution failed:", err.stderr || err.stdout || err.message);
        res.json({ reply: "Error: agent execution failed. Check the server logs for details." });
    }
});

export default router;
