import { existsSync, readFileSync, statSync } from "node:fs";
import type { ToolCallResult, ToolDefinition, PathResolver } from "./types";
import { MAX_READ_BYTES } from "./types";

// ============================================================================
// Tool definition
// ============================================================================

export const readToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "read",
        description:
            "Read the contents of a file at the given path. Returns the file content as a string. " +
            `Files larger than ${MAX_READ_BYTES} bytes will be rejected.`,
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description:
                        "Absolute or relative path to the file to read.",
                },
            },
            required: ["path"],
        },
    },
};

// ============================================================================
// Handler
// ============================================================================

export function handleReadTool(
    callId: string,
    args: Record<string, any>,
    resolvePath: PathResolver,
): ToolCallResult {
    const filePath = resolvePath(args.path);

    if (!existsSync(filePath)) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: `File not found: ${filePath}`,
            }),
        };
    }

    const st = statSync(filePath);
    if (st.isDirectory()) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: `Path is a directory, not a file: ${filePath}`,
            }),
        };
    }

    if (st.size > MAX_READ_BYTES) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: `File too large (${st.size} bytes). Max is ${MAX_READ_BYTES} bytes.`,
                path: filePath,
                size: st.size,
            }),
        };
    }

    const content = readFileSync(filePath, "utf-8");
    return {
        tool_call_id: callId,
        role: "tool",
        content: JSON.stringify({ path: filePath, content }),
    };
}
