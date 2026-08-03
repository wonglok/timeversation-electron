// ============================================================================
// node-llama-tools — aggregator
// ============================================================================
// Exports tool definitions, a dispatcher, and a buildSessionFunctions helper
// that wraps tools for node-llama-cpp's LlamaChatSession function-calling API
// with SSE events for the chat UI.
// ============================================================================

import { defineChatSessionFunction } from "node-llama-cpp";
import type { ToolCallRequest, ToolCallResult, ToolDefinition } from "./types";
import { createPathResolver } from "./types";

// Tool definition + handler imports
import { readToolDefinition, handleReadTool } from "./read";
import { writeToolDefinition, handleWriteTool } from "./write";
import { editToolDefinition, handleEditTool } from "./edit";
import { bashToolDefinition, handleBashTool } from "./bash";
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

/** Ordered list of tool names (for init events / debug output). */
export const TOOL_NAMES: string[] = TOOLS.map((t) => t.function.name);

/** Tool name + description pairs (for system prompts). */
export const TOOL_NAMES_DESC: string[] = TOOLS.map(
    (t) => `${t.function.name}: ${t.function.description}`,
);

// ============================================================================
// Dispatcher
// ============================================================================

export function executeToolCall(
    call: ToolCallRequest,
    workspacePath: string,
    sessionPath: string,
): ToolCallResult {
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

// ============================================================================
// buildSessionFunctions — wraps tools for LlamaChatSession with SSE events
// ============================================================================

function randomHex(len: number): string {
    const chars = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < len; i++) {
        out += chars[Math.floor(Math.random() * 16)];
    }
    return out;
}

/**
 * Build a session functions object for node-llama-cpp's LlamaChatSession.
 * Each tool handler sends `tool_call` and `tool_result` SSE events before
 * returning the parsed result to the model.
 */
export function buildSessionFunctions(
    res: NodeJS.WritableStream,
    workspacePath: string,
    sessionPath: string,
) {
    const sessionFunctions: Record<string, any> = {};

    for (const tool of TOOLS) {
        const toolName = tool.function.name;

        sessionFunctions[toolName] = defineChatSessionFunction({
            description: tool.function.description,
            params: tool.function.parameters as any,
            handler: async (params: any) => {
                const callId = `call_${randomHex(24)}`;
                const argsStr = JSON.stringify(params);

                // Notify client of tool invocation
                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "tool_call",
                        tool_call_id: callId,
                        name: toolName,
                        arguments: argsStr,
                    }),
                );

                // Execute
                const result = executeToolCall(
                    { id: callId, name: toolName, arguments: argsStr },
                    workspacePath,
                    sessionPath,
                );

                // Notify client of tool result
                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "tool_result",
                        tool_call_id: result.tool_call_id,
                        content: result.content,
                    }),
                );

                // Return parsed result to the model
                try {
                    return JSON.parse(result.content);
                } catch {
                    return result.content;
                }
            },
        } as any);
    }

    return sessionFunctions as any;
}

// ============================================================================
// SSE helpers (inline, same format as the handler)
// ============================================================================

const encoder = new TextEncoder();

function encodeLine(field: string, value: string): Uint8Array {
    return encoder.encode(`${field}: ${value}\r\n`);
}

function writeSSEEvent(
    res: NodeJS.WritableStream,
    data: string,
    event?: string,
): void {
    const parts: Uint8Array[] = [];

    if (event) {
        parts.push(encodeLine("event", event));
    }

    if (data === "") {
        parts.push(encodeLine("data", ""));
    } else {
        for (const line of data.split("\n")) {
            parts.push(encodeLine("data", `${line}\n`));
        }
    }

    parts.push(encoder.encode("\r\n"));

    const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) {
        merged.set(p, offset);
        offset += p.length;
    }
    res.write(merged);
}
