import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { ToolCallResult, ToolDefinition, PathResolver } from "./types";
import { MAX_READ_BYTES } from "./types";

// ============================================================================
// Types
// ============================================================================

interface GrepMatch {
    file: string;
    line: number;
    content: string;
}

// ============================================================================
// Tool definition
// ============================================================================

export const grepToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "grep",
        description:
            "Search for a text pattern (regex or literal) across file contents in a directory tree. " +
            "Returns matching file paths with line numbers and the matched line content. " +
            "Use this to find where something is defined, used, or referenced.",
        parameters: {
            type: "object",
            properties: {
                pattern: {
                    type: "string",
                    description:
                        "The text or regex pattern to search for in file contents (e.g. 'handleLocalOpenAISDK', 'TODO', 'import.*from').",
                },
                directory: {
                    type: "string",
                    description:
                        "Directory to search recursively. Defaults to the workspace root.",
                },
                include: {
                    type: "string",
                    description:
                        "Optional glob to filter which files to search (e.g. '*.ts', '*.{js,tsx}'). If omitted, searches all text files.",
                },
            },
            required: ["pattern"],
        },
    },
};

// ============================================================================
// Handler
// ============================================================================

export function handleGrepTool(
    callId: string,
    args: Record<string, any>,
    workspaceRoot: string,
    resolvePath: PathResolver,
): ToolCallResult {
    const directory = args.directory
        ? resolvePath(args.directory)
        : workspaceRoot;
    const { pattern } = args;
    const includeGlob: string | null = args.include ?? null;

    // --- Compile regex ---
    let regex: RegExp;
    try {
        regex = new RegExp(pattern, "g");
    } catch {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: `Invalid regex pattern: "${pattern}"`,
            }),
        };
    }

    // --- Glob → regex for file filtering ---
    let fileFilter: RegExp | null = null;
    if (includeGlob) {
        const globRegex = includeGlob
            .replace(/\./g, "\\.")
            .replace(/\*/g, ".*")
            .replace(/\{/g, "(?:")
            .replace(/\}/g, ")")
            .replace(/,/g, "|");
        fileFilter = new RegExp(globRegex + "$", "i");
    }

    // --- Walk ---
    const results: GrepMatch[] = [];
    const MAX_MATCHES = 200;

    function walk(dir: string, depth: number): void {
        if (depth <= 0 || results.length >= MAX_MATCHES) return;

        let entries: string[];
        try {
            entries = readdirSync(dir);
        } catch {
            return;
        }

        for (const name of entries) {
            if (results.length >= MAX_MATCHES) return;
            if (name.startsWith(".") || name === "node_modules") continue;

            const fullPath = path.join(dir, name);
            let st;
            try {
                st = statSync(fullPath);
            } catch {
                continue;
            }

            if (st.isDirectory()) {
                walk(fullPath, depth - 1);
            } else if (st.isFile() && st.size <= MAX_READ_BYTES) {
                if (fileFilter && !fileFilter.test(name)) continue;

                let content: string;
                try {
                    content = readFileSync(fullPath, "utf-8");
                } catch {
                    continue; // binary or encoding issue
                }

                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (results.length >= MAX_MATCHES) return;
                    if (regex.test(lines[i]!)) {
                        regex.lastIndex = 0; // reset for next test
                        results.push({
                            file: fullPath,
                            line: i + 1,
                            content: lines[i]!.slice(0, 300),
                        });
                    }
                }
            }
        }
    }

    walk(directory, 8);

    return {
        tool_call_id: callId,
        role: "tool",
        content: JSON.stringify({
            pattern,
            directory,
            matches: results,
            count: results.length,
            truncated: results.length >= MAX_MATCHES,
        }),
    };
}
