import {
    LlamaChat,
    type LlamaModel,
    type LlamaContext,
    type LlamaContextSequence,
    type ChatHistoryItem,
    type ChatModelResponse,
    type ChatModelFunctionCall,
    type ChatModelFunctions,
} from "node-llama-cpp";

// ============================================================================
// Helpers
// ============================================================================

function randomHex(len: number): string {
    const chars = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < len; i++) {
        out += chars[Math.floor(Math.random() * 16)];
    }
    return out;
}

// ============================================================================
// Tool helpers
// ============================================================================

/**
 * Convert OpenAI-format tool definitions into `node-llama-cpp` model functions.
 *
 * `ChatModelFunctions` (used by `LlamaChat.generateResponse`) has no `handler`
 * field — just `description` and `params`.  Function execution is done by the
 * caller, which matches the external agent-loop pattern where the client
 * executes tools and sends results back.
 */
function convertOpenAiToolsToModelFunctions(
    tools: ChatCompletionTool[],
): ChatModelFunctions {
    const functions: Record<string, { description?: string; params?: any }> = {};

    for (const tool of tools) {
        if (tool.type !== "function") continue;
        functions[tool.function.name] = {
            description: tool.function.description,
            params: tool.function.parameters as any,
        };
    }

    return functions;
}

// ============================================================================
// Types
// ============================================================================

export interface OpenAIMockConfig {
    model: LlamaModel;
    context: LlamaContext;
    contextSequence: LlamaContextSequence;
    /** Model name reported in API responses (defaults to `"local-model"`). */
    modelName?: string;
    /** Pre-built LlamaChat instance. Takes precedence over contextSequence. */
    llamaChat?: LlamaChat;
    systemPrompt?: string;
    /**
     * Optional model functions merged with `tools` from each `create()` call.
     */
    modelFunctions?: ChatModelFunctions;
    /**
     * Handlers keyed by tool/function name.  When provided, the mock runs the
     * full function-calling loop **internally** and never returns `tool_calls`
     * to the client.  When omitted (default), function calls are returned to
     * the client so it can execute tools and feed results back in the next
     * request.
     */
    toolHandlers?: Record<
        string,
        (args: Record<string, unknown>) => unknown | Promise<unknown>
    >;
}

export interface ChatCompletionTool {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}

/**
 * A single-item tool definition where the JSON schema and the handler
 * live together — no need to keep a separate `tools` array and
 * `toolHandlers` map in sync by name.
 */
export interface ToolDefinition<
    Args extends Record<string, unknown> = Record<string, unknown>,
> {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    handler: (args: Args) => unknown | Promise<unknown>;
}

export interface DefinedTool {
    definition: ChatCompletionTool;
    handler: (args: Record<string, unknown>) => unknown | Promise<unknown>;
    name: string;
}

export interface ChatCompletionMessageToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}

export interface ChatCompletionMessage {
    role: "system" | "user" | "assistant" | "function" | "tool";
    content: string | null;
    name?: string;
    tool_calls?: ChatCompletionMessageToolCall[];
    tool_call_id?: string;
}

export interface ChatCompletionCreateParams {
    model?: string;
    messages: ChatCompletionMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean | null;
    stop?: string | string[];
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    tools?: ChatCompletionTool[];
    tool_choice?:
        | "auto"
        | "none"
        | "required"
        | { type: "function"; function: { name: string } };
}

export interface ChatCompletionChoice {
    index: number;
    message: {
        role: "assistant";
        content: string | null;
        tool_calls?: ChatCompletionMessageToolCall[];
    };
    finish_reason: "stop" | "length" | "tool_calls";
}

export interface ChatCompletion {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: ChatCompletionChoice[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface ChatCompletionChunkChoice {
    index: number;
    delta: {
        role?: "assistant";
        content?: string;
        tool_calls?: ChatCompletionMessageToolCall[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | null;
}

export interface ChatCompletionChunk {
    id: string;
    object: "chat.completion.chunk";
    created: number;
    model: string;
    choices: ChatCompletionChunkChoice[];
}

// ============================================================================
// defineTool + collectTools
// ============================================================================

export function defineTool<
    Args extends Record<string, unknown> = Record<string, unknown>,
>(tool: ToolDefinition<Args>): DefinedTool {
    return {
        name: tool.name,
        definition: {
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        },
        handler: tool.handler as (
            args: Record<string, unknown>,
        ) => unknown | Promise<unknown>,
    };
}

export interface CollectedTools {
    tools: ChatCompletionTool[];
    toolHandlers: Record<
        string,
        (args: Record<string, unknown>) => unknown | Promise<unknown>
    >;
}

export function collectTools(...defined: DefinedTool[]): CollectedTools {
    return {
        tools: defined.map((d) => d.definition),
        toolHandlers: Object.fromEntries(
            defined.map((d) => [d.name, d.handler]),
        ),
    };
}

// ============================================================================
// Internal: generation result
// ============================================================================

interface GenerationResult {
    content: string;
    toolCalls: ChatCompletionMessageToolCall[] | undefined;
    finishReason: ChatCompletionChoice["finish_reason"];
}

// ============================================================================
// ChatCompletionStream
// ============================================================================

export class ChatCompletionStream implements AsyncIterable<ChatCompletionChunk> {
    public readonly controller: AbortController = new AbortController();
    private readonly _id: string;
    private readonly _model: string;
    private readonly _created: number;
    private readonly _api: ChatCompletionsAPI;
    private readonly _functions: ChatModelFunctions | undefined;
    private _iterate: AsyncGenerator<ChatCompletionChunk>;

    constructor(
        api: ChatCompletionsAPI,
        model: string,
        functions: ChatModelFunctions | undefined,
    ) {
        this._api = api;
        this._id = `chatcmpl-${randomHex(29)}`;
        this._model = model;
        this._created = Math.floor(Date.now() / 1000);
        this._functions = functions;
        this._iterate = this._iterateImpl();
    }

    private async *_iterateImpl(): AsyncGenerator<ChatCompletionChunk> {
        // First chunk carries the role.
        yield {
            id: this._id,
            object: "chat.completion.chunk",
            created: this._created,
            model: this._model,
            choices: [
                { index: 0, delta: { role: "assistant" }, finish_reason: null },
            ],
        };

        try {
            const result = await this._api._runGenerationLoop(
                this._functions,
            );

            // Yield accumulated text.
            if (result.content) {
                yield {
                    id: this._id,
                    object: "chat.completion.chunk",
                    created: this._created,
                    model: this._model,
                    choices: [
                        {
                            index: 0,
                            delta: { content: result.content },
                            finish_reason: null,
                        },
                    ],
                };
            }

            // Yield tool calls if present.
            if (result.toolCalls && result.toolCalls.length > 0) {
                yield {
                    id: this._id,
                    object: "chat.completion.chunk",
                    created: this._created,
                    model: this._model,
                    choices: [
                        {
                            index: 0,
                            delta: { tool_calls: result.toolCalls },
                            finish_reason: null,
                        },
                    ],
                };
            }

            // Final chunk with finish_reason.
            yield {
                id: this._id,
                object: "chat.completion.chunk",
                created: this._created,
                model: this._model,
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: result.finishReason,
                    },
                ],
            };
        } catch (err) {
            // Emit error then re-throw
            yield {
                id: this._id,
                object: "chat.completion.chunk",
                created: this._created,
                model: this._model,
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: "stop",
                    },
                ],
            };
            throw err;
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk> {
        return this._iterate;
    }

    /** Consume all chunks and assemble a full ChatCompletion. */
    async finalChatCompletion(): Promise<ChatCompletion> {
        let content = "";
        let toolCalls: ChatCompletionMessageToolCall[] | undefined;
        let finishReason: ChatCompletionChoice["finish_reason"] = "stop";

        for await (const chunk of this) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) content += delta.content;
            if (delta?.tool_calls) toolCalls = delta.tool_calls;
            if (chunk.choices[0]?.finish_reason) {
                finishReason = chunk.choices[0].finish_reason;
            }
        }

        return {
            id: this._id,
            object: "chat.completion",
            created: this._created,
            model: this._model,
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: content || null,
                        tool_calls: toolCalls,
                    },
                    finish_reason: finishReason,
                },
            ],
        };
    }
}

// ============================================================================
// ChatCompletionsAPI
// ============================================================================

export class ChatCompletionsAPI {
    private _llamaChat: LlamaChat;
    private _contextSequence: LlamaContextSequence;
    private _modelName: string;

    // --- Persistent chat state (survives across requests) ---
    private _chatHistory: ChatHistoryItem[] = [];
    private _contextWindow: ChatHistoryItem[] | undefined;
    private _lastShiftMetadata: any;

    // --- Message tracking ---
    // Counts of user/tool messages already incorporated into `_chatHistory`.
    // Reset when the last user-message content changes (signals a new
    // conversation or multi-turn follow-up).
    private _trackedUserCount = 0;
    private _trackedToolCount = 0;
    private _lastTrackedUserContent: string | null = null;

    // --- Tool handling ---
    private _toolHandlers?: Record<
        string,
        (args: Record<string, unknown>) => unknown | Promise<unknown>
    >;

    // Map of generated call IDs → {name, params} for matching tool results.
    private _generatedCalls: Map<
        string,
        { name: string; params: any }
    > = new Map();

    // Config-level model functions (backward compat).
    private _modelFunctions?: ChatModelFunctions;

    constructor(
        llamaChat: LlamaChat,
        contextSequence: LlamaContextSequence,
        modelName: string,
        modelFunctions?: ChatModelFunctions,
        toolHandlers?: Record<
            string,
            (args: Record<string, unknown>) => unknown | Promise<unknown>
        >,
        systemPrompt?: string,
    ) {
        this._llamaChat = llamaChat;
        this._contextSequence = contextSequence;
        this._modelName = modelName;
        this._modelFunctions = modelFunctions;
        this._toolHandlers = toolHandlers;

        if (systemPrompt) {
            this._chatHistory.push({ type: "system", text: systemPrompt });
        }
    }

    // =========================================================================
    // Message syncing
    // =========================================================================

    /**
     * Incorporate new messages from an OpenAI-format messages array into the
     * internal chat history.
     *
     * Returns any **new** tool-result messages that need to be applied as
     * function-call results before the next generation round.
     */
    private _syncMessages(
        messages: ChatCompletionMessage[],
    ): ChatCompletionMessage[] {
        const userMessages = messages.filter((m) => m.role === "user");
        const toolMessages = messages.filter((m) => m.role === "tool");

        const lastUser = userMessages[userMessages.length - 1] ?? null;

        // --- Detect conversation boundary ---
        // When the last user-message content changes, re-anchor the counters
        // so the new user message is picked up.  Chat history is NOT cleared
        // here — call `resetHistory()` for a full context wipe.
        if (lastUser && lastUser.content !== this._lastTrackedUserContent) {
            this._trackedUserCount = 0;
            this._trackedToolCount = 0;
        }
        this._lastTrackedUserContent = lastUser?.content ?? null;

        // --- Push new user messages into chat history ---
        for (let i = this._trackedUserCount; i < userMessages.length; i++) {
            const msg = userMessages[i]!;
            this._chatHistory.push({
                type: "user",
                text: msg.content ?? "",
            });
        }
        this._trackedUserCount = userMessages.length;

        // --- Handle system messages (dedup, insert at front) ---
        const systemMessages = messages.filter((m) => m.role === "system");
        for (const msg of systemMessages) {
            const text = msg.content ?? "";
            if (
                !this._chatHistory.some(
                    (h) => h.type === "system" && h.text === text,
                )
            ) {
                this._chatHistory.unshift({ type: "system", text });
            }
        }

        // --- Collect new tool messages ---
        const newToolMessages = toolMessages.slice(this._trackedToolCount);
        this._trackedToolCount = toolMessages.length;

        return newToolMessages;
    }

    /**
     * Apply tool results from the client back into the chat history so the
     * model can continue generation.
     *
     * Each tool message is matched to a previously generated function call
     * via `tool_call_id`.  The result is pushed as a `ChatModelFunctionCall`
     * into a new model-response slot.
     */
    private _applyToolResults(toolMessages: ChatCompletionMessage[]): void {
        if (toolMessages.length === 0) return;

        // Find the last model response in chat history.  Results are appended
        // to this same slot (matching the reference pattern) rather than
        // pushed into a new model response, so the model sees function calls
        // and their results as a contiguous assistant turn.
        let lastModelIdx = -1;
        for (let i = this._chatHistory.length - 1; i >= 0; i--) {
            if (this._chatHistory[i]!.type === "model") {
                lastModelIdx = i;
                break;
            }
        }

        if (lastModelIdx === -1) {
            // No model response yet — create one.
            this._chatHistory.push({ type: "model", response: [] });
            lastModelIdx = this._chatHistory.length - 1;
        }

        const modelResponse = this._chatHistory[lastModelIdx]! as ChatModelResponse;

        for (const tm of toolMessages) {
            const callInfo = this._generatedCalls.get(tm.tool_call_id ?? "");

            let parsed: unknown;
            try {
                parsed = JSON.parse(tm.content ?? "{}");
            } catch {
                parsed = tm.content;
            }

            const fcItem: ChatModelFunctionCall = {
                type: "functionCall",
                name: callInfo?.name ?? "unknown",
                params: callInfo?.params ?? {},
                result: parsed,
            };

            modelResponse.response.push(fcItem);
        }

        // Clear matched calls from the tracking map.
        for (const tm of toolMessages) {
            this._generatedCalls.delete(tm.tool_call_id ?? "");
        }
    }

    // =========================================================================
    // Function resolution
    // =========================================================================

    /** Merge config-level model functions with per-request OpenAI tools. */
    private _resolveFunctions(params: ChatCompletionCreateParams): {
        functions: ChatModelFunctions | undefined;
    } {
        const toolChoice = params.tool_choice ?? "auto";

        if (toolChoice === "none") {
            return { functions: undefined };
        }

        const fromTools =
            params.tools && params.tools.length > 0
                ? convertOpenAiToolsToModelFunctions(params.tools)
                : undefined;

        const merged: Record<string, any> = {
            ...((this._modelFunctions as Record<string, any>) ?? {}),
            ...((fromTools as Record<string, any>) ?? {}),
        };

        return {
            functions:
                Object.keys(merged).length > 0
                    ? (merged as ChatModelFunctions)
                    : undefined,
        };
    }

    // =========================================================================
    // Generation loop
    // =========================================================================

    /**
     * Run the function-calling generation loop.
     *
     * When `toolHandlers` are configured the loop runs to completion
     * (executing handlers internally); otherwise it returns after the first
     * `generateResponse()` call so the client can execute tools.
     *
     * @internal — exposed for ChatCompletionStream use.
     */
    async _runGenerationLoop(
        functions: ChatModelFunctions | undefined,
    ): Promise<GenerationResult> {
        let fullContent = "";
        const allToolCalls: ChatCompletionMessageToolCall[] = [];

        const hasHandlers =
            this._toolHandlers != null &&
            Object.keys(this._toolHandlers).length > 0;

        // When handlers are available, limit iterations to prevent loops.
        const maxIterations = hasHandlers ? 100 : 1;

        for (let iter = 0; iter < maxIterations; iter++) {
            // Ensure a model response slot exists for the model to complete.
            if (
                this._chatHistory.length === 0 ||
                this._chatHistory[this._chatHistory.length - 1]!.type !==
                    "model"
            ) {
                this._chatHistory.push({ type: "model", response: [] });
            }

            const res = await this._llamaChat.generateResponse(
                this._chatHistory,
                {
                    functions: functions as any,
                    contextShift: {
                        lastEvaluationMetadata: this._lastShiftMetadata,
                    },
                    lastEvaluationContextWindow: {
                        history: this._contextWindow,
                    },
                },
            );

            // Update persisted state from the evaluation result.
            this._chatHistory = res.lastEvaluation.cleanHistory;
            this._contextWindow = res.lastEvaluation.contextWindow;
            this._lastShiftMetadata =
                res.lastEvaluation.contextShiftMetadata;

            // Accumulate text the model generated before calling functions.
            if (res.response) {
                fullContent += res.response;
            }

            // No function calls → model is done generating.
            if (!res.functionCalls || res.functionCalls.length === 0) {
                break;
            }

            if (hasHandlers) {
                // --- Internal loop: execute handlers, feed results back ---
                const callItems: ChatModelFunctionCall[] = [];

                for (const fc of res.functionCalls) {
                    const handler = this._toolHandlers![fc.functionName];
                    let result: unknown;

                    if (handler) {
                        try {
                            result = await handler(fc.params);
                        } catch (err) {
                            result = {
                                error:
                                    err instanceof Error
                                        ? err.message
                                        : String(err),
                            };
                        }
                    } else {
                        result = {
                            error: `No handler registered for tool "${fc.functionName}".`,
                        };
                    }

                    callItems.push({
                        type: "functionCall",
                        name: fc.functionName,
                        params: fc.params,
                        rawCall: fc.raw,
                        result,
                    } satisfies ChatModelFunctionCall);
                }

                // Mark the first call item as starting a new chunk (needed
                // for proper context sequence state with parallel function
                // calling, and avoids redundant context shifts).
                if (callItems.length > 0) {
                    callItems[0]!.startsNewChunk = true;
                }

                // Push results into both the main history and the context
                // window so they stay in sync.
                if (
                    this._chatHistory.length === 0 ||
                    this._chatHistory[this._chatHistory.length - 1]!.type !==
                        "model"
                ) {
                    this._chatHistory.push({
                        type: "model",
                        response: [],
                    });
                }
                if (
                    this._contextWindow &&
                    (this._contextWindow.length === 0 ||
                        this._contextWindow[this._contextWindow.length - 1]!
                            .type !== "model")
                ) {
                    this._contextWindow.push({
                        type: "model",
                        response: [],
                    });
                }

                const modelResponse = this._chatHistory[
                    this._chatHistory.length - 1
                ]! as ChatModelResponse;
                const ctxResponse = this._contextWindow?.[
                    this._contextWindow.length - 1
                ] as ChatModelResponse | undefined;

                for (const item of callItems) {
                    modelResponse.response.push(item);
                    ctxResponse?.response.push(item);
                }
            } else {
                // --- External loop: return function calls to the client ---
                for (const fc of res.functionCalls) {
                    const id = `call_${randomHex(24)}`;
                    this._generatedCalls.set(id, {
                        name: fc.functionName,
                        params: fc.params,
                    });
                    allToolCalls.push({
                        id,
                        type: "function",
                        function: {
                            name: fc.functionName,
                            arguments: JSON.stringify(fc.params),
                        },
                    });
                }

                // The model response with function calls (undefined results)
                // is already in cleanHistory.  Stop here so the client can
                // execute the tools and send results back.
                break;
            }
        }

        const finishReason: ChatCompletionChoice["finish_reason"] =
            allToolCalls.length > 0 ? "tool_calls" : "stop";

        return {
            content: fullContent,
            toolCalls:
                allToolCalls.length > 0 ? allToolCalls : undefined,
            finishReason,
        };
    }

    // =========================================================================
    // Public API
    // =========================================================================

    async create(
        params: ChatCompletionCreateParams & { stream: true },
    ): Promise<ChatCompletionStream>;
    async create(
        params: ChatCompletionCreateParams & { stream?: false | null },
    ): Promise<ChatCompletion>;
    async create(
        params: ChatCompletionCreateParams,
    ): Promise<ChatCompletion | ChatCompletionStream> {
        const modelName = params.model ?? this._modelName;

        // 1. Sync messages — push new user messages to history, collect
        //    any pending tool results from the client.
        const newToolMessages = this._syncMessages(params.messages);

        // 2. Apply tool results as function-call results in chat history.
        this._applyToolResults(newToolMessages);

        // 3. Resolve functions from config + per-request tools.
        const { functions } = this._resolveFunctions(params);

        if (params.stream) {
            return new ChatCompletionStream(this, modelName, functions);
        }

        // --- Non-streaming path ---
        const id = `chatcmpl-${randomHex(29)}`;
        const created = Math.floor(Date.now() / 1000);

        const result = await this._runGenerationLoop(functions);

        return {
            id,
            object: "chat.completion",
            created,
            model: modelName,
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: result.content || null,
                        tool_calls: result.toolCalls,
                    },
                    finish_reason: result.finishReason,
                },
            ],
        };
    }

    /** Dispose the current LlamaChat, create a fresh one, and reset all tracked state. */
    resetHistory(): void {
        // Preserve system messages from the current history.
        const systemMessages = this._chatHistory.filter(
            (h) => h.type === "system",
        );

        this._llamaChat.dispose();
        this._llamaChat = new LlamaChat({
            contextSequence: this._contextSequence,
        });
        this._chatHistory = [...systemMessages];
        this._contextWindow = undefined;
        this._lastShiftMetadata = undefined;
        this._trackedUserCount = 0;
        this._trackedToolCount = 0;
        this._lastTrackedUserContent = null;
        this._generatedCalls.clear();
    }
}

// ============================================================================
// OpenAIMock (top-level client)
// ============================================================================

export class OpenAIMock {
    public readonly chat: {
        completions: ChatCompletionsAPI;
    };

    constructor(config: OpenAIMockConfig) {
        const llamaChat =
            config.llamaChat ??
            new LlamaChat({
                contextSequence: config.contextSequence,
            });

        const modelName = config.modelName ?? "local-model";

        this.chat = {
            completions: new ChatCompletionsAPI(
                llamaChat,
                config.contextSequence,
                modelName,
                config.modelFunctions,
                config.toolHandlers,
                config.systemPrompt,
            ),
        };
    }
}
