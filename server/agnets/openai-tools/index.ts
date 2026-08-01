// ============================================================================
// OpenAI tools — aggregator
// ============================================================================
// This module exports the combined tool definitions array for the OpenAI
// function-calling API, plus a dispatcher that routes incoming tool-call
// requests to the correct handler.
// ============================================================================

import type { ToolCallRequest, ToolCallResult, ToolDefinition } from "./types";
import { createPathResolver } from "./types";

import { readToolDefinition, handleReadTool } from "./read";
import { bashToolDefinition, handleBashTool } from "./bash";
import { editToolDefinition, handleEditTool } from "./edit";
import { writeToolDefinition, handleWriteTool } from "./write";
import { grepToolDefinition, handleGrepTool } from "./grep";
import { findToolDefinition, handleFindTool } from "./find";
import { lsToolDefinition, handleLsTool } from "./ls";
import {
    showItemInFolderToolDefinition,
    openPathToolDefinition,
    openExternalToolDefinition,
    beepToolDefinition,
    handleShowItemInFolderTool,
    handleOpenPathTool,
    handleOpenExternalTool,
    handleBeepTool,
} from "./shell";

// Re-export types for consumers
export type { ToolCallRequest, ToolCallResult, ToolDefinition };

// ============================================================================
// Combined tool definitions
// ============================================================================

export const TOOLS: ToolDefinition[] = [
    readToolDefinition,
    bashToolDefinition,
    editToolDefinition,
    writeToolDefinition,
    grepToolDefinition,
    findToolDefinition,
    lsToolDefinition,
    showItemInFolderToolDefinition,
    openPathToolDefinition,
    openExternalToolDefinition,
    beepToolDefinition,
];

/** Ordered list of tool names (used in init events / debug output). */
export const TOOL_NAMES: string[] = TOOLS.map((t) => t.function.name);

/** Ordered list of tool names (used in init events / debug output). */
export const TOOL_NAMES_DESC: string[] = TOOLS.map(
    (t) => `${t.function.name}: ${t.function.description}`,
);

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Route a tool-call request to the correct handler.
 *
 * @param call   Parsed tool-call from the LLM (id, name, JSON arguments).
 * @param workspacePath  The user's workspace directory.
 * @param sessionPath    Fallback directory when no workspace is set.
 */
export function executeToolCall(
    call: ToolCallRequest,
    workspacePath: string,
    sessionPath: string,
): ToolCallResult {
    // Parse arguments
    let args: Record<string, any>;
    try {
        args = JSON.parse(call.arguments);
    } catch {
        return {
            tool_call_id: call.id,
            role: "tool",
            content: JSON.stringify({
                error: "Failed to parse tool arguments as JSON.",
                raw_arguments: call.arguments,
            }),
        };
    }

    const workspaceRoot = workspacePath || sessionPath;
    const resolvePath = createPathResolver(workspacePath, sessionPath);

    try {
        switch (call.name) {
            case "read":
                return handleReadTool(call.id, args, resolvePath);

            case "bash":
                return handleBashTool(call.id, args, workspaceRoot);

            case "edit":
                return handleEditTool(call.id, args, resolvePath);

            case "write":
                return handleWriteTool(call.id, args, resolvePath);

            case "grep":
                return handleGrepTool(
                    call.id,
                    args,
                    workspaceRoot,
                    resolvePath,
                );

            case "find":
                return handleFindTool(
                    call.id,
                    args,
                    workspaceRoot,
                    resolvePath,
                );

            case "ls":
                return handleLsTool(call.id, args, resolvePath);

            case "show_item_in_folder":
                return handleShowItemInFolderTool(call.id, args, resolvePath);

            case "open_path":
                return handleOpenPathTool(call.id, args, resolvePath);

            case "open_external":
                return handleOpenExternalTool(call.id, args);

            case "beep":
                return handleBeepTool(call.id);

            default:
                return {
                    tool_call_id: call.id,
                    role: "tool",
                    content: JSON.stringify({
                        error: `Unknown tool: ${call.name}`,
                    }),
                };
        }
    } catch (err: any) {
        return {
            tool_call_id: call.id,
            role: "tool",
            content: JSON.stringify({
                error: true,
                message: err.message ?? "Tool execution failed",
            }),
        };
    }
}
