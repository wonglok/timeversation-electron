// ============================================================================
// Shared types & helpers for node-llama-tools
// ============================================================================

import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

// ============================================================================
// Constants
// ============================================================================

/** Max bytes to read from a file in one operation. */
export const MAX_READ_BYTES = 256_000;

/** Timeout for a single bash command in milliseconds. */
export const BASH_TIMEOUT_MS = 30_000;

// ============================================================================
// Tool-call types
// ============================================================================

export interface ToolCallRequest {
    id: string;
    name: string;
    arguments: string; // JSON string
}

export interface ToolCallResult {
    tool_call_id: string;
    role: "tool";
    content: string;
}

// ============================================================================
// Tool definition (OpenAI function-calling schema shape)
// ============================================================================

export interface ToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, { type: string; description: string }>;
            required: string[];
        };
    };
}

// ============================================================================
// Path resolver (with traversal protection)
// ============================================================================

export type PathResolver = (p: string) => string;

export function createPathResolver(
    workspacePath: string,
    sessionPath: string,
): PathResolver {
    const workspaceRoot = workspacePath || sessionPath;

    return (p: string): string => {
        const raw = path.isAbsolute(p) ? p : path.join(workspaceRoot, p);
        const resolved = existsSync(raw) ? realpathSync(raw) : raw;
        const rootResolved = existsSync(workspaceRoot)
            ? realpathSync(workspaceRoot)
            : workspaceRoot;

        if (
            !resolved.startsWith(rootResolved + path.sep) &&
            resolved !== rootResolved
        ) {
            throw new Error(
                `Path traversal denied: "${p}" resolves outside workspace.`,
            );
        }
        return resolved;
    };
}
