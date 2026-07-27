// ============================================================================
// Built-in agent registry
// ============================================================================

/** Definition of a CLI coding agent to detect */
export interface AgentDefinition {
    /** Human-readable display name */
    name: string;
    /** URL-friendly unique slug (e.g. "claude-code") */
    slug: string;
    /** CLI command(s) to try — first that resolves wins */
    commands: string[];
    /** Args to pass for version / detection (e.g. ["--version"]) */
    detectionArgs: string[];
    /** Regex to extract semver from combined stdout+stderr; group 1 = version */
    versionRegex?: RegExp;
    /** Short description of the agent */
    description?: string;
    /** Homepage or repo URL */
    homepage?: string;
    /** Icon / logo identifier (emoji or URL) for UI display */
    icon?: string;
}

/**
 * Registry of known CLI coding agents and how to detect them.
 * Each entry lists possible binary names (first match wins) and the args
 * to invoke for a version/detection check.
 */
export const BUILTIN_AGENTS: AgentDefinition[] = [
    {
        name: "Claude Code",
        slug: "claude-code",
        commands: ["claude"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Anthropic's agentic coding CLI tool",
        homepage: "https://docs.anthropic.com/en/docs/claude-code",
        icon: "claude",
    },
    {
        name: "Kilo Code",
        slug: "kilo-code",
        commands: ["kilocode"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Open-source AI coding agent with multi-provider support",
        homepage: "https://github.com/kilocode/kilocode",
        icon: "kilocode",
    },
    {
        name: "OpenAI Codex CLI",
        slug: "openai-codex-cli",
        commands: ["codex"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "OpenAI's terminal-based coding agent",
        homepage: "https://github.com/openai/codex",
        icon: "codex",
    },
    {
        name: "Qwen Code",
        slug: "qwen-code",
        commands: ["qwencode", "qwen-code", "qwen"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Alibaba's Qwen-powered coding CLI agent",
        homepage: "https://github.com/QwenLM/qwen-code",
        icon: "qwen",
    },
    {
        name: "OpenCode",
        slug: "opencode",
        commands: ["opencode"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Open-source terminal coding agent with MCP support",
        homepage: "https://github.com/opencode-ai/opencode",
        icon: "opencode",
    },
    {
        name: "Kimi Code",
        slug: "kimi-code",
        commands: ["kimicode", "kimi-code", "kimi"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Moonshot AI's Kimi-powered coding agent",
        homepage: "https://github.com/MoonshotAI/kimi-code",
        icon: "kimi",
    },
    {
        name: "Pi Coding Agent",
        slug: "pi-coding-agent",
        commands: ["pi", "pi-coding-agent", "pi-agent"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Pi AI coding assistant CLI",
        homepage: "https://github.com/pi-ai/pi-coding-agent",
        icon: "pi",
    },
    {
        name: "Gemini CLI",
        slug: "gemini-cli",
        commands: ["gemini"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Google's Gemini-powered CLI agent",
        homepage: "https://github.com/google-gemini/gemini-cli",
        icon: "gemini",
    },
    {
        name: "Cursor CLI",
        slug: "cursor-cli",
        commands: ["cursor"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Cursor AI editor CLI tools",
        homepage: "https://cursor.com",
        icon: "cursor",
    },
    {
        name: "GitHub Copilot (gh extension)",
        slug: "github-copilot",
        commands: ["gh"],
        detectionArgs: ["copilot", "--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "GitHub Copilot via gh CLI extension",
        homepage: "https://docs.github.com/en/copilot",
        icon: "copilot",
    },
    {
        name: "Cline CLI",
        slug: "cline-cli",
        commands: ["cline"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Cline's autonomous coding agent CLI",
        homepage: "https://github.com/cline/cline",
        icon: "cline",
    },
];
