import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { ToolCallResult, ToolDefinition, PathResolver } from "./types";
import { MAX_READ_BYTES } from "./types";

// ============================================================================
// Tool definition
// ============================================================================

export const editToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "edit",
        description:
            "Perform exact string replacement in an existing file. " +
            "Finds `old_string` in the file and replaces it with `new_string`. " +
            "The match must be exact (including whitespace and indentation) and unique. " +
            "If `replace_all` is true, replaces every occurrence instead. " +
            "This is the preferred way to modify files — only use `write` for creating new files.",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description:
                        "Absolute or relative path to the file to edit.",
                },
                old_string: {
                    type: "string",
                    description:
                        "The exact text to find and replace. Must match exactly including whitespace.",
                },
                new_string: {
                    type: "string",
                    description:
                        "The replacement text. Must be different from old_string.",
                },
                replace_all: {
                    type: "boolean",
                    description:
                        "If true, replace all occurrences. Default: false (single replacement, errors if not unique).",
                },
            },
            required: ["path", "old_string", "new_string"],
        },
    },
};

// ============================================================================
// Handler
// ============================================================================

export function handleEditTool(
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

    const oldContent = readFileSync(filePath, "utf-8");
    const oldStr = args.old_string;
    const newStr = args.new_string;

    if (oldStr === newStr) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: "old_string and new_string are identical — no change needed.",
            }),
        };
    }

    // --- Replace all ---
    if (args.replace_all) {
        const count = oldContent.split(oldStr).length - 1;
        if (count === 0) {
            return {
                tool_call_id: callId,
                role: "tool",
                content: JSON.stringify({
                    error: "old_string not found in file (0 occurrences).",
                    path: filePath,
                }),
            };
        }
        const newContent = oldContent.replaceAll(oldStr, newStr);
        writeFileSync(filePath, newContent, "utf-8");
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                success: true,
                path: filePath,
                replacements: count,
            }),
        };
    }

    // --- Single replacement (must be unique) ---
    const firstIdx = oldContent.indexOf(oldStr);
    if (firstIdx === -1) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: "old_string not found in file.",
                path: filePath,
            }),
        };
    }

    const secondIdx = oldContent.indexOf(oldStr, firstIdx + oldStr.length);
    if (secondIdx !== -1) {
        const line = oldContent.slice(0, firstIdx).split("\n").length;
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error:
                    "old_string is not unique — found at least 2 occurrences. " +
                    "Use replace_all: true to replace all, or provide more surrounding context to make the match unique.",
                path: filePath,
                firstMatchLine: line,
                hint: "Include more surrounding lines in old_string to disambiguate.",
            }),
        };
    }

    const newContent =
        oldContent.slice(0, firstIdx) +
        newStr +
        oldContent.slice(firstIdx + oldStr.length);
    writeFileSync(filePath, newContent, "utf-8");

    const lineNum = oldContent.slice(0, firstIdx).split("\n").length;
    return {
        tool_call_id: callId,
        role: "tool",
        content: JSON.stringify({
            success: true,
            path: filePath,
            replacements: 1,
            line: lineNum,
        }),
    };
}
