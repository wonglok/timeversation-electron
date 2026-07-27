// ============================================================================
// Built-in agent registry
// ============================================================================

import type { ComponentType } from "react";

// Colorful brand icons
import ClaudeCodeColor from "@lobehub/icons/es/ClaudeCode/components/Color";
import CodexColor from "@lobehub/icons/es/Codex/components/Color";
import QwenColor from "@lobehub/icons/es/Qwen/components/Color";
import KimiColor from "@lobehub/icons/es/Kimi/components/Color";
import GeminiCLIColor from "@lobehub/icons/es/GeminiCLI/components/Color";

// Monochrome brand icons (no Color variant in package)
import KiloCodeIcon from "@lobehub/icons/es/KiloCode";
import OpenCodeIcon from "@lobehub/icons/es/OpenCode";
import PiIcon from "@lobehub/icons/es/Pi";
import GithubCopilotIcon from "@lobehub/icons/es/GithubCopilot";
import CursorIcon from "@lobehub/icons/es/Cursor";
import ClineIcon from "@lobehub/icons/es/Cline";

// ============================================================================
// Types
// ============================================================================

/** Props accepted by lobehub brand icon components */
export interface AgentIconProps {
    size?: string | number;
    color?: string;
    className?: string;
    style?: React.CSSProperties;
}

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
    /** Icon component from @lobehub/icons for UI display */
    icon?: ComponentType<AgentIconProps>;
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Registry of known CLI coding agents and how to detect them.
 * Each entry lists possible binary names (first match wins) and the args
 * to invoke for a version/detection check.
 */
export const BUILTIN_AGENTS: AgentDefinition[] = [
    {
        name: "Claude Code",
        slug: "claude-code",
        commands: [
            "claude",
            "-p",
            "__REPLACE_ME_WITH_PROMPT__",
            "--print",
            "--verbose",
            "--output-format",
            "stream-json",
            "--verbose",
        ],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Anthropic's agentic coding CLI tool",
        homepage: "https://docs.anthropic.com/en/docs/claude-code",
        icon: ClaudeCodeColor,
    },
    {
        name: "OpenAI Codex CLI",
        slug: "openai-codex-cli",
        commands: ["codex"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "OpenAI's terminal-based coding agent",
        homepage: "https://github.com/openai/codex",
        icon: CodexColor,
    },
    {
        name: "Qwen Code",
        slug: "qwen-code",
        commands: ["qwencode", "qwen-code", "qwen"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Alibaba's Qwen-powered coding CLI agent",
        homepage: "https://github.com/QwenLM/qwen-code",
        icon: QwenColor,
    },
    {
        name: "OpenCode",
        slug: "opencode",
        commands: ["opencode"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Open-source terminal coding agent with MCP support",
        homepage: "https://github.com/opencode-ai/opencode",
        icon: OpenCodeIcon,
    },
    {
        name: "Kimi Code",
        slug: "kimi-code",
        commands: ["kimicode", "kimi-code", "kimi"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Moonshot AI's Kimi-powered coding agent",
        homepage: "https://github.com/MoonshotAI/kimi-code",
        icon: KimiColor,
    },
    {
        name: "Gemini CLI",
        slug: "gemini-cli",
        commands: ["gemini"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Google's Gemini-powered CLI agent",
        homepage: "https://github.com/google-gemini/gemini-cli",
        icon: GeminiCLIColor,
    },
    {
        name: "Cursor CLI",
        slug: "cursor-cli",
        commands: ["cursor"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Cursor AI editor CLI tools",
        homepage: "https://cursor.com",
        icon: CursorIcon,
    },

    {
        name: "Pi Coding Agent",
        slug: "pi-coding-agent",
        commands: ["pi", "pi-coding-agent", "pi-agent"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Pi AI coding assistant CLI",
        homepage: "https://github.com/pi-ai/pi-coding-agent",
        icon: PiIcon,
    },

    // {
    //     name: "Kilo Code",
    //     slug: "kilo-code",
    //     commands: ["kilocode"],
    //     detectionArgs: ["--version"],
    //     versionRegex: /(\d+\.\d+\.\d+)/,
    //     description: "Open-source AI coding agent with multi-provider support",
    //     homepage: "https://github.com/kilocode/kilocode",
    //     icon: KiloCodeIcon,
    // },

    // {
    //     name: "GitHub Copilot (gh extension)",
    //     slug: "github-copilot",
    //     commands: ["gh"],
    //     detectionArgs: ["copilot", "--version"],
    //     versionRegex: /(\d+\.\d+\.\d+)/,
    //     description: "GitHub Copilot via gh CLI extension",
    //     homepage: "https://docs.github.com/en/copilot",
    //     icon: GithubCopilotIcon,
    // },
    // {
    //     name: "Cline CLI",
    //     slug: "cline-cli",
    //     commands: ["cline"],
    //     detectionArgs: ["--version"],
    //     versionRegex: /(\d+\.\d+\.\d+)/,
    //     description: "Cline's autonomous coding agent CLI",
    //     homepage: "https://github.com/cline/cline",
    //     icon: ClineIcon,
    // },
];

// ============================================================================
// Helpers
// ============================================================================

/** Payload shape for the POST /api/agents/detect endpoint */
export interface AgentDetectionPayload {
    slug: string;
    commands: string[];
}

/**
 * Extract a minimal detection payload from the registry.
 * Each entry carries the agent slug and its primary binary as `commands[0]`.
 */
export function getAgentDetectionPayload(): AgentDetectionPayload[] {
    return BUILTIN_AGENTS.map((agent) => {
        const primary = agent.commands[0];
        return {
            slug: agent.slug,
            // Only send the primary binary for detection
            commands: primary ? [primary] : [],
        };
    });
}
