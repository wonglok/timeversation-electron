// ============================================================================
// Electron shell tools — showItemInFolder, openPath, openExternal, beep
// ============================================================================
// These tools expose the Electron `shell` API so the agent can interact with
// the user's desktop environment: reveal files in the file manager, open
// files with default applications, launch external URLs in the browser, and
// play a system beep for user attention.
// ============================================================================

import { shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ToolCallResult, ToolDefinition, PathResolver } from "./types";

// ============================================================================
// Tool definitions
// ============================================================================

export const showItemInFolderToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "show_item_in_folder",
        description:
            "Reveal a file or folder in the system file manager (Finder on macOS, Explorer on Windows). " +
            "The file is selected if possible. Use this when the user asks to 'show', 'reveal', or 'open folder' for a file.",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description:
                        "Absolute or relative path to the file or folder to reveal.",
                },
            },
            required: ["path"],
        },
    },
};

export const openPathToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "open_path",
        description:
            "Open a file or directory with the system's default application. " +
            "For directories this opens them in the file manager; for files it opens them " +
            "with the associated app (e.g. .pdf in Preview, .html in the browser). " +
            "Use this when the user asks to 'open' or 'launch' a specific file.",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description:
                        "Absolute or relative path to the file or folder to open.",
                },
            },
            required: ["path"],
        },
    },
};

export const openExternalToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "open_external",
        description:
            "Open a URL or external protocol link in the user's default browser. " +
            "Supports http://, https://, and mailto: protocols. " +
            "Use this when the user asks to open a website, link, or documentation page.",
        parameters: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description:
                        "The URL to open (e.g. 'https://github.com', 'mailto:user@example.com').",
                },
            },
            required: ["url"],
        },
    },
};

export const beepToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "beep",
        description:
            "Play a system beep / notification sound. " +
            "Use this to get the user's attention when a long-running task completes " +
            "or when manual intervention is needed.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    },
};

// ============================================================================
// Handlers
// ============================================================================

export function handleShowItemInFolderTool(
    callId: string,
    args: Record<string, any>,
    resolvePath: PathResolver,
): ToolCallResult {
    const targetPath = resolvePath(args.path);

    if (!existsSync(targetPath)) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: `Path not found: ${targetPath}`,
            }),
        };
    }

    const success = shell.showItemInFolder(targetPath);
    return {
        tool_call_id: callId,
        role: "tool",
        content: JSON.stringify({
            success,
            path: targetPath,
            action: "showItemInFolder",
        }),
    };
}

export function handleOpenPathTool(
    callId: string,
    args: Record<string, any>,
    resolvePath: PathResolver,
): ToolCallResult {
    const targetPath = resolvePath(args.path);

    if (!existsSync(targetPath)) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: `Path not found: ${targetPath}`,
            }),
        };
    }

    // Fire-and-forget: shell.openPath is async but the agent doesn't need
    // to wait for the external app to launch.
    shell.openPath(targetPath).then((error) => {
        if (error) {
            console.error(
                `[open_path] Failed to open "${targetPath}": ${error}`,
            );
        }
    });

    return {
        tool_call_id: callId,
        role: "tool",
        content: JSON.stringify({
            success: true,
            path: targetPath,
            action: "openPath",
            note: "Launch request sent — the file will open in the default application.",
        }),
    };
}

export function handleOpenExternalTool(
    callId: string,
    args: Record<string, any>,
): ToolCallResult {
    const { url } = args;

    if (!url || typeof url !== "string") {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: "A valid URL string is required.",
            }),
        };
    }

    // Basic validation: only allow http, https, and mailto schemes.
    if (!/^(https?|mailto):\/\//i.test(url)) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: `URL scheme not allowed: "${url}". Only http://, https://, and mailto: are supported.`,
            }),
        };
    }

    // Fire-and-forget: shell.openExternal is async.
    shell.openExternal(url).catch((err) => {
        console.error(`[open_external] Failed to open "${url}":`, err);
    });

    return {
        tool_call_id: callId,
        role: "tool",
        content: JSON.stringify({
            success: true,
            url,
            action: "openExternal",
            note: "Launch request sent — the URL will open in the default browser.",
        }),
    };
}

export function handleBeepTool(callId: string): ToolCallResult {
    shell.beep();
    return {
        tool_call_id: callId,
        role: "tool",
        content: JSON.stringify({
            success: true,
            action: "beep",
        }),
    };
}
