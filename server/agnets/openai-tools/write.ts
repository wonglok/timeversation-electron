import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ToolCallResult, ToolDefinition, PathResolver } from "./types";

// ============================================================================
// Tool definition
// ============================================================================

export const writeToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "write",
        description:
            "Write content to a file, creating it if it doesn't exist or overwriting if it does. " +
            "Creates parent directories automatically. " +
            "Prefer `edit` for modifying existing files — use `write` only for creating new files.",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description:
                        "Absolute or relative path to the file to write.",
                },
                content: {
                    type: "string",
                    description:
                        "The complete text content to write to the file.",
                },
            },
            required: ["path", "content"],
        },
    },
};

// ============================================================================
// Handler
// ============================================================================

export function handleWriteTool(
    callId: string,
    args: Record<string, any>,
    resolvePath: PathResolver,
): ToolCallResult {
    const filePath = resolvePath(args.path);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, args.content, "utf-8");

    return {
        tool_call_id: callId,
        role: "tool",
        content: JSON.stringify({
            success: true,
            path: filePath,
            bytesWritten: Buffer.byteLength(args.content, "utf-8"),
        }),
    };
}
