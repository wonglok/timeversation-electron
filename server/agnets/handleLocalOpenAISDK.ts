import { app } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { appendThreadMessage, getThreadMessages } from "../store/threadStore";
import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { TOOLS, TOOL_NAMES, executeToolCall } from "./openai-tools";
import type { ToolCallResult } from "./openai-tools/types";

// ============================================================================
// Agent-loop constants
// ============================================================================

/** Maximum number of LLM → tool → LLM turns before we force-stop. */
const MAX_AGENT_TURNS = 100;

// ============================================================================
// SSE encoder helpers
// ============================================================================

const encoder = new TextEncoder();

/** Encode a single SSE field line (e.g. "data: hello") as UTF-8 bytes. */
function encodeLine(field: string, value: string): Uint8Array {
    return encoder.encode(`${field}: ${value}\r\n`);
}

/**
 * Emit an SSE event.
 * - `data` may contain embedded newlines; each line becomes its own `data:` field.
 * - `event` is optional (omitted → default "message" event).
 * - Always terminates the event with an extra `\r\n`.
 */
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

// ============================================================================
// Agent Loop handler
// ============================================================================

export const handleLocalOpenAISDK = async ({
    req,
    res,
    message,
    workspacePath = "",
    conversationId,
}: {
    req: any;
    res: any;
    message: string;
    workspacePath?: string;
    conversationId?: string;
}) => {
    // --- SSE headers ---
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });

    // Send an initial comment to flush headers
    res.write(encoder.encode(":ok\r\n\r\n"));

    // --- Resolve session directory ---
    const appDataPath = app.getPath("appData");
    const dirSessionId = conversationId || crypto.randomUUID();
    const sessionPath = path.join(
        appDataPath,
        "timeversation",
        "sessions",
        dirSessionId,
    );
    try {
        mkdirSync(sessionPath, { recursive: true });
    } catch (_) {
        // Directory already exists — fine
    }

    // Abort controller so we can cancel the turn when the client disconnects
    const ac = new AbortController();

    // --- Persist user message ---
    if (conversationId) {
        appendThreadMessage(workspacePath, conversationId, "user", message);
    }

    // // --- Client disconnect → abort turn ---
    // req.on("close", () => {
    //     if (!ac.signal.aborted) {
    //         ac.abort();
    //     }
    // });

    try {
        const client = new OpenAI({
            apiKey: "ppap",
            baseURL: `http://localhost:8390/api/llm`,
        });

        const msg = await getThreadMessages(
            workspacePath,
            conversationId as string,
        );

        // --- Build the initial message list ---
        const conversationMessages: ChatCompletionMessageParam[] = [
            ...msg.map((r) => ({
                content: r.content,
                role: r.role as "user" | "assistant",
            })),
            { role: "user", content: message },
        ];

        let fullAssistantText = "";

        // --- Write init event ---
        writeSSEEvent(
            res,
            JSON.stringify({
                type: "system",
                subtype: "init",
                session_path: sessionPath,
                workspace_path: workspacePath || sessionPath,
                tools: TOOL_NAMES,
            }),
        );

        // =====================================================================
        // Agent Loop
        // =====================================================================

        for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
            if (ac.signal.aborted) break;

            writeSSEEvent(res, JSON.stringify({ type: "agent_turn", turn }));

            // --- Stream the LLM response ---
            const responseStream = await client.chat.completions.create({
                model: `default`,
                reasoning_effort: "high",
                messages: conversationMessages,
                tools: TOOLS,
                stream: true,
            });

            let turnText = "";

            // Accumulate tool-call fragments by index
            const toolCallsByIndex = new Map<
                number,
                {
                    id: string;
                    type: "function";
                    function: { name: string; arguments: string };
                }
            >();

            for await (const item of responseStream) {
                if (ac.signal.aborted) break;

                const delta = item.choices[0]?.delta as
                    | Record<string, any>
                    | undefined;

                // --- Thinking / reasoning tokens ---
                if (delta?.reasoning_content) {
                    writeSSEEvent(
                        res,
                        JSON.stringify({
                            type: "thinking",
                            content: delta.reasoning_content,
                        }),
                    );
                }

                // --- Text content ---
                if (delta?.content) {
                    turnText += delta.content;
                    writeSSEEvent(
                        res,
                        JSON.stringify({
                            type: "text",
                            content: delta.content,
                        }),
                    );
                }

                // --- Tool-call deltas ---
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index as number;
                        const existing = toolCallsByIndex.get(idx) ?? {
                            id: "",
                            type: "function" as const,
                            function: { name: "", arguments: "" },
                        };

                        if (tc.id) existing.id = tc.id;
                        if (tc.function?.name)
                            existing.function.name += tc.function.name;
                        if (tc.function?.arguments)
                            existing.function.arguments +=
                                tc.function.arguments;

                        toolCallsByIndex.set(idx, existing);
                    }
                }
            }

            if (ac.signal.aborted) break;

            // --- Collect completed tool calls (sorted by index) ---
            const toolCalls = Array.from(toolCallsByIndex.entries())
                .sort(([a], [b]) => a - b)
                .map(([, tc]) => ({
                    id: tc.id,
                    type: tc.type,
                    function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                    },
                }));

            // --- Branch: no tool calls → final response ---
            if (toolCalls.length === 0) {
                fullAssistantText += turnText;

                conversationMessages.push({
                    role: "assistant",
                    content: turnText || null,
                });

                if (conversationId && fullAssistantText.trim()) {
                    await appendThreadMessage(
                        workspacePath,
                        conversationId,
                        "assistant",
                        fullAssistantText.trim(),
                    );
                }

                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "agent_done",
                        total_turns: turn + 1,
                    }),
                );
                writeSSEEvent(res, "[DONE]");
                res.end();
                return;
            }

            // --- Branch: tool calls present → execute & loop ---
            fullAssistantText += turnText;

            // Forward tool-call events to the client
            for (const tc of toolCalls) {
                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "tool_call",
                        tool_call_id: tc.id,
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                    }),
                );
            }

            // Build the assistant message with tool calls
            conversationMessages.push({
                role: "assistant",
                content: turnText || null,
                tool_calls: toolCalls,
            } as ChatCompletionMessageParam);

            // Execute each tool call and collect results
            const toolResults: ToolCallResult[] = [];
            for (const tc of toolCalls) {
                const result = executeToolCall(
                    {
                        id: tc.id,
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                    },
                    workspacePath,
                    sessionPath,
                );

                toolResults.push(result);

                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "tool_result",
                        tool_call_id: result.tool_call_id,
                        content: result.content,
                    }),
                );
            }

            // Append tool-result messages to the conversation
            for (const tr of toolResults) {
                conversationMessages.push({
                    role: "tool",
                    tool_call_id: tr.tool_call_id,
                    content: tr.content,
                } as ChatCompletionMessageParam);
            }
        }

        // --- Max turns reached ---
        if (conversationId && fullAssistantText.trim()) {
            await appendThreadMessage(
                workspacePath,
                conversationId,
                "assistant",
                fullAssistantText.trim(),
            );
        }

        writeSSEEvent(
            res,
            JSON.stringify({
                type: "agent_done",
                total_turns: MAX_AGENT_TURNS,
                warning: "Max agent turns reached — loop terminated.",
            }),
        );
        writeSSEEvent(res, "[DONE]");
    } catch (err: any) {
        if (err.name === "AbortError") {
            writeSSEEvent(res, "[DONE]");
        } else {
            writeSSEEvent(
                res,
                JSON.stringify({
                    type: "error",
                    message: err.message ?? "Agent loop stream failed",
                }),
                "error",
            );
        }
    } finally {
        res.end();
    }
};
