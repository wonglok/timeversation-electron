// ============================================================================
// find — locate files by name pattern
// ============================================================================

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { ToolCallResult, ToolDefinition, PathResolver } from "./types";

export const findToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "find",
        description:
            "Find files by name or path pattern. Returns matching file paths. " +
            "Use this to locate files when you know the name but not the location.",
        parameters: {
            type: "object",
            properties: {
                pattern: {
                    type: "string",
                    description: "Substring or glob-like pattern to match against file names/paths (e.g. 'handleClaude', '.test.ts', 'package.json').",
                },
                directory: {
                    type: "string",
                    description: "Directory to search recursively. Defaults to the workspace root.",
                },
            },
            required: ["pattern"],
        },
    },
};

export function handleFindTool(
    callId: string,
    args: Record<string, any>,
    workspaceRoot: string,
    resolvePath: PathResolver,
): ToolCallResult {
    const searchDir = args.directory ? resolvePath(args.directory) : workspaceRoot;

    const results: string[] = [];
    walkFind(searchDir, args.pattern, results, 8);

    return {
        tool_call_id: callId,
        role: "tool",
        content: JSON.stringify({
            directory: searchDir,
            pattern: args.pattern,
            matches: results.slice(0, 200),
            count: results.length,
        }),
    };
}

function walkFind(dir: string, pattern: string, results: string[], maxDepth: number): void {
    if (maxDepth <= 0) return;

    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return;
    }

    for (const name of entries) {
        if (name.startsWith(".") || name === "node_modules") continue;

        const fullPath = path.join(dir, name);
        if (name.toLowerCase().includes(pattern.toLowerCase())) {
            results.push(fullPath);
        }

        let st;
        try {
            st = statSync(fullPath);
        } catch {
            continue;
        }
        if (st.isDirectory()) {
            walkFind(fullPath, pattern, results, maxDepth - 1);
        }
    }
}
