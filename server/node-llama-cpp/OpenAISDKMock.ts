import {
    LlamaChatSession,
    defineChatSessionFunction,
    isChatModelResponseFunctionCall,
    type LlamaModel,
    type LlamaContext,
    type LlamaContextSequence,
    type ChatSessionModelFunctions,
    type ChatSessionModelFunction,
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
// Push-buffer — bridges callback-driven chunks to an async iterator
// ============================================================================

class ChunkBuffer {
    private _buffer: Array<{ text: string; done: boolean }> = [];
    private _waiter: { resolve: () => void } | null = null;
    private _closed = false;

    push(text: string): void {
        if (this._closed) return;
        this._buffer.push({ text, done: false });
        this._waiter?.resolve();
    }

    close(): void {
        if (this._closed) return;
        this._buffer.push({ text: "", done: true });
        this._waiter?.resolve();
    }

    async *iterate(): AsyncGenerator<{ text: string; done: boolean }> {
        let i = 0;
        while (true) {
            while (i < this._buffer.length) {
                const item = this._buffer[i++]!;
                yield item;
                if (item.done) return;
            }
            if (this._closed) return;
            await new Promise<void>((r) => {
                this._waiter = { resolve: r };
            });
            this._waiter = null;
        }
    }
}

// ============================================================================
// Tool helpers
// ============================================================================

/**
 * Convert OpenAI-format tool definitions into `node-llama-cpp` model functions.
 *
 * Each tool's `function.name` is used as the key. Handlers are looked up from
 * `toolHandlers` by name; tools without a matching handler get a stub that
 * returns an error object so the model can react gracefully.
 */
function convertOpenAiToolsToModelFunctions(
    tools: ChatCompletionTool[],
    toolHandlers?: Record<
        string,
        (args: Record<string, unknown>) => unknown | Promise<unknown>
    >,
): ChatSessionModelFunctions {
    const functions: Record<string, ChatSessionModelFunction<any>> = {};

    for (const tool of tools) {
        if (tool.type !== "function") continue;

        const name = tool.function.name;
        const description = tool.function.description;
        const handler = toolHandlers?.[name];

        // OpenAI tool `parameters` is JSON Schema — runtime-compatible with
        // GbnfJsonSchema but TS types differ, so cast through `any`.
        functions[name] = defineChatSessionFunction({
            description,
            params: tool.function.parameters,
            handler: handler
                ? (args: any) => handler(args as Record<string, unknown>)
                : (args: any) => ({
                      error: `No handler registered for tool "${name}".`,
                      calledWith: args,
                  }),
        } as any);
    }

    return functions;
}

/** Extract tool calls from the last model response in chat history. */
function extractToolCallsFromHistory(
    session: LlamaChatSession,
): ChatCompletionMessageToolCall[] {
    const history = session.getChatHistory();
    const lastModel = [...history].reverse().find((h) => h.type === "model");
    if (!lastModel || lastModel.type !== "model") return [];

    return lastModel.response
        .filter(isChatModelResponseFunctionCall)
        .map((fc) => ({
            id: `call_${randomHex(24)}`,
            type: "function" as const,
            function: {
                name: fc.name,
                arguments: JSON.stringify(fc.params),
            },
        }));
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
    chatSession?: LlamaChatSession;
    systemPrompt?: string;
    modelFunctions?: ChatSessionModelFunctions;
    /**
     * Handlers keyed by tool/function name. Used when `tools` are passed
     * to `create()` and a matching handler needs to execute.
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
 *
 * Use {@link defineTool} to create one, then {@link collectTools} to
 * split into the parts the adapter expects.
 */
export interface ToolDefinition<
    Args extends Record<string, unknown> = Record<string, unknown>,
> {
    /** Function name the model sees (must be a valid identifier). */
    name: string;
    /** Natural-language description so the model knows when to call it. */
    description?: string;
    /** JSON Schema for the function parameters (optional). */
    parameters?: Record<string, unknown>;
    /** The implementation. Called when the model invokes this tool. */
    handler: (args: Args) => unknown | Promise<unknown>;
}

/**
 * The result of {@link defineTool} — carries both the OpenAI-format
 * tool definition and the handler, keyed by name.
 */
export interface DefinedTool {
    /** The OpenAI-format tool descriptor (for `tools` array in create params). */
    definition: ChatCompletionTool;
    /** The handler function. */
    handler: (args: Record<string, unknown>) => unknown | Promise<unknown>;
    /** The tool name (same as `definition.function.name`). */
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
    /** OpenAI-style tool definitions. Converted to model functions internally. */
    tools?: ChatCompletionTool[];
    /**
     * Controls which (if any) tool is called.
     * - `"auto"` (default) — the model decides
     * - `"none"` — no tools are used
     * - `"required"` — the model must call a tool
     * - `{ type: "function", function: { name } }` — force a specific tool
     */
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
// defineTool + collectTools — co-located schema + handler
// ============================================================================

/**
 * Define a tool where the JSON schema and handler live as a single item.
 *
 * Use {@link collectTools} to split a set of defined tools into the
 * `tools` array and `toolHandlers` map that the adapter consumes.
 */
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

/** Result of {@link collectTools}. */
export interface CollectedTools {
    /** Ready to pass as `tools` to `client.chat.completions.create()`. */
    tools: ChatCompletionTool[];
    /** Ready to pass as `toolHandlers` to `OpenAIMock` config or merge at call-site. */
    toolHandlers: Record<
        string,
        (args: Record<string, unknown>) => unknown | Promise<unknown>
    >;
}

/**
 * Split an array of {@link DefinedTool} items into the separate
 * `tools` list and `toolHandlers` map that the adapter expects.
 *
 * ```ts
 * const weather = defineTool({ name: "get_weather", ..., handler });
 * const calc    = defineTool({ name: "calculate", ..., handler });
 *
 * const collected = collectTools(weather, calc);
 *
 * // Pass to config:
 * const client = new OpenAIMock({ ...config, toolHandlers: collected.toolHandlers });
 *
 * // Pass to create():
 * const res = await client.chat.completions.create({
 *     messages: [...],
 *     tools: collected.tools,
 * });
 * ```
 */
export function collectTools(...defined: DefinedTool[]): CollectedTools {
    return {
        tools: defined.map((d) => d.definition),
        toolHandlers: Object.fromEntries(
            defined.map((d) => [d.name, d.handler]),
        ),
    };
}

// ============================================================================
// ChatCompletionStream
// ============================================================================

export class ChatCompletionStream implements AsyncIterable<ChatCompletionChunk> {
    public readonly controller: AbortController = new AbortController();
    private readonly _id: string;
    private readonly _model: string;
    private readonly _created: number;

    constructor(
        chatSession: LlamaChatSession,
        prompt: string,
        model: string,
        modelFunctions?: ChatSessionModelFunctions,
    ) {
        this._id = `chatcmpl-${randomHex(29)}`;
        this._model = model;
        this._created = Math.floor(Date.now() / 1000);

        const buffer = new ChunkBuffer();

        const generation = chatSession
            .prompt(prompt, {
                signal: this.controller.signal,
                stopOnAbortSignal: true,
                functions: modelFunctions as ChatSessionModelFunctions,
                onTextChunk(text) {
                    buffer.push(text);
                },
            })
            .then(() => buffer.close())
            .catch((err) => {
                if (err !== this.controller.signal?.reason) {
                    buffer.close();
                    throw err;
                }
                buffer.close();
            });

        this._iterate = this._iterateImpl(buffer, generation, chatSession);
    }

    private _iterate: AsyncGenerator<ChatCompletionChunk>;

    private async *_iterateImpl(
        buffer: ChunkBuffer,
        generation: Promise<void>,
        session: LlamaChatSession,
    ): AsyncGenerator<ChatCompletionChunk> {
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

        // Emit text chunks as they arrive.
        for await (const { text, done } of buffer.iterate()) {
            if (done) break;
            if (text.length === 0) continue;
            yield {
                id: this._id,
                object: "chat.completion.chunk",
                created: this._created,
                model: this._model,
                choices: [
                    {
                        index: 0,
                        delta: { content: text },
                        finish_reason: null,
                    },
                ],
            };
        }

        // Wait for generation to finish (throws if it failed).
        await generation;

        // Inspect history for tool calls.
        const toolCalls = extractToolCallsFromHistory(session);

        if (toolCalls.length > 0) {
            // Emit a chunk with tool_calls before the terminal chunk.
            yield {
                id: this._id,
                object: "chat.completion.chunk",
                created: this._created,
                model: this._model,
                choices: [
                    {
                        index: 0,
                        delta: { tool_calls: toolCalls },
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
                    finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
                },
            ],
        };
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
// Completions API
// ============================================================================

export class ChatCompletionsAPI {
    private _session: LlamaChatSession;
    private _contextSequence: LlamaContextSequence;
    private _modelName: string;
    private _modelFunctions?: ChatSessionModelFunctions;
    private _toolHandlers?: Record<
        string,
        (args: Record<string, unknown>) => unknown | Promise<unknown>
    >;
    private _promptedMessageCount = 0;

    constructor(
        session: LlamaChatSession,
        contextSequence: LlamaContextSequence,
        modelName: string,
        modelFunctions?: ChatSessionModelFunctions,
        toolHandlers?: Record<
            string,
            (args: Record<string, unknown>) => unknown | Promise<unknown>
        >,
    ) {
        this._session = session;
        this._contextSequence = contextSequence;
        this._modelName = modelName;
        this._modelFunctions = modelFunctions;
        this._toolHandlers = toolHandlers;
    }

    /** Track how many tool-call turns we've consumed so we don't re-prompt stale tool results. */
    private _promptedToolCallCount = 0;

    /**
     * Extract the next prompt from an OpenAI-format messages array.
     *
     * Two modes:
     * 1. New user messages present → extract the last user message as the prompt.
     * 2. No new user messages, but tool results are present (agent loop fed
     *    tool outputs back without a new user message) → format the tool
     *    results as a continuation prompt so the model can respond to them.
     */
    private _extractPrompt(messages: ChatCompletionMessage[]): string | null {
        const userMessages = messages.filter((m) => m.role === "user");

        // --- Path 1: there are new user messages ---
        if (userMessages.length > this._promptedMessageCount) {
            const newMessages = userMessages.slice(this._promptedMessageCount);
            this._promptedMessageCount += newMessages.length;
            const last = newMessages[newMessages.length - 1]!;
            return last.content;
        }

        // --- Path 2: no new user messages — check for pending tool results ---
        // The agent loop appends assistant (with tool_calls) + tool messages
        // after each turn. Count tool messages to detect new tool turns.
        const toolMessages = messages.filter((m) => m.role === "tool");

        if (toolMessages.length > this._promptedToolCallCount) {
            // New tool results have arrived — build a continuation prompt.
            const newToolMessages = toolMessages.slice(
                this._promptedToolCallCount,
            );
            this._promptedToolCallCount = toolMessages.length;

            const parts = newToolMessages.map((tm) => {
                const parsed = (() => {
                    try {
                        return JSON.parse(tm.content ?? "{}");
                    } catch {
                        return tm.content;
                    }
                })();
                return `Tool result (${tm.tool_call_id}): ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`;
            });

            if (parts.length > 0) {
                // Also update the user-message count so future calls with
                // the same tool results don't re-enter this path.
                this._promptedMessageCount = userMessages.length;
                return (
                    "The tool results are listed below. Continue with your response " +
                    "based on these results. If the task is complete, summarize what was done.\n\n" +
                    parts.join("\n\n")
                );
            }
        }

        // --- Path 3: nothing new at all ---
        return null;
    }

    /** Merge config-level model functions with per-request OpenAI tools. */
    private _resolveFunctions(params: ChatCompletionCreateParams): {
        functions: ChatSessionModelFunctions | undefined;
        toolsWereRequested: boolean;
    } {
        const toolChoice = params.tool_choice ?? "auto";

        // "none" — strip all functions regardless of what was passed.
        if (toolChoice === "none") {
            return { functions: undefined, toolsWereRequested: false };
        }

        const fromTools =
            params.tools && params.tools.length > 0
                ? convertOpenAiToolsToModelFunctions(
                      params.tools,
                      this._toolHandlers,
                  )
                : undefined;

        // Merge: per-request tools take precedence over config-level functions.
        const merged: Record<string, ChatSessionModelFunction<any>> = {
            ...((this._modelFunctions as
                | Record<string, ChatSessionModelFunction<any>>
                | undefined) ?? {}),
            ...((fromTools as
                | Record<string, ChatSessionModelFunction<any>>
                | undefined) ?? {}),
        };

        const hasFunctions = Object.keys(merged).length > 0;

        return {
            functions: hasFunctions ? merged : undefined,
            toolsWereRequested: params.tools != null && params.tools.length > 0,
        };
    }

    async create(
        params: ChatCompletionCreateParams & { stream: true },
    ): Promise<ChatCompletionStream>;
    async create(
        params: ChatCompletionCreateParams & { stream?: false | null },
    ): Promise<ChatCompletion>;
    async create(
        params: ChatCompletionCreateParams,
    ): Promise<ChatCompletion | ChatCompletionStream> {
        const prompt = this._extractPrompt(params.messages);
        if (prompt == null) {
            throw new Error(
                "No new user message found in messages array. " +
                    "Each create() call must include at least one user message " +
                    "that has not been prompted yet.",
            );
        }

        const modelName = params.model ?? this._modelName;
        const { functions } = this._resolveFunctions(params);

        if (params.stream) {
            return new ChatCompletionStream(
                this._session,
                prompt,
                modelName,
                functions,
            );
        }

        // Non-streaming path.
        const id = `chatcmpl-${randomHex(29)}`;
        const created = Math.floor(Date.now() / 1000);
        let content = "";

        await this._session.prompt(prompt, {
            functions,
            onTextChunk(text) {
                content += text;
            },
        });

        // Inspect history for tool calls that fired during this turn.
        const toolCalls = extractToolCallsFromHistory(this._session);
        const finishReason: ChatCompletionChoice["finish_reason"] =
            toolCalls.length > 0 ? "tool_calls" : "stop";

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
                        content: content || null,
                        tool_calls:
                            toolCalls.length > 0 ? toolCalls : undefined,
                    },
                    finish_reason: finishReason,
                },
            ],
        };
    }

    /** Dispose the current session, create a fresh one, and reset tracked message count. */
    resetHistory(): void {
        this._session.dispose();
        this._session = new LlamaChatSession({
            contextSequence: this._contextSequence,
        });
        this._promptedMessageCount = 0;
        this._promptedToolCallCount = 0;
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
        const session =
            config.chatSession ??
            new LlamaChatSession({
                contextSequence: config.contextSequence,
                systemPrompt: config.systemPrompt,
            });

        const modelName = config.modelName ?? "local-model";

        this.chat = {
            completions: new ChatCompletionsAPI(
                session,
                config.contextSequence,
                modelName,
                config.modelFunctions,
                config.toolHandlers,
            ),
        };
    }
}
