import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { ToolCallResult, ToolDefinition, PathResolver } from "./types";

// ============================================================================
// Tool definition
// ============================================================================

export const lsToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "ls",
        description:
            "List the contents of a directory. Returns entries with type prefixes: [DIR] for directories, [FILE] for files. " +
            "Use this to explore the project structure.",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description:
                        "Absolute or relative path to the directory to list.",
                },
            },
            required: ["path"],
        },
    },
};

// ============================================================================
// Handler
// ============================================================================

export function handleLsTool(
    callId: string,
    args: Record<string, any>,
    resolvePath: PathResolver,
): ToolCallResult {
    const dirPath = resolvePath(args.path);

    if (!existsSync(dirPath)) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: `Directory not found: ${dirPath}`,
            }),
        };
    }

    const st = statSync(dirPath);
    if (!st.isDirectory()) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: `Path is not a directory: ${dirPath}`,
            }),
        };
    }

    const entries = readdirSync(dirPath).map((name) => {
        const fullPath = path.join(dirPath, name);
        try {
            const prefix = statSync(fullPath).isDirectory()
                ? "[DIR] "
                : "[FILE]";
            return `${prefix} ${name}`;
        } catch {
            return `[???] ${name}`;
        }
    });

    return {
        tool_call_id: callId,
        role: "tool",
        content: JSON.stringify({ path: dirPath, entries }),
    };
}
