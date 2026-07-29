// ============================================================================
// ChatBox — self-contained chat dialogue (messages + input + all logic)
// ============================================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useConversationsStore } from "../../store/conversations";
import type { Bubble } from "../MessageBubble/types";
import {
    AcpBubble,
    LoadingBubble,
    EmptyChat,
    ResultFooter,
    groupBubbles,
} from "../MessageBubble/MessageBubble";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatBoxProps {
    agentSlug: string;
    agentName: string;
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

const API_BASE = "http://localhost:8390";

let _bubbleId = 0;
function nextId(): string {
    return `b-${++_bubbleId}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatBox({ agentSlug, agentName }: ChatBoxProps) {
    const { conversationId } = useParams<{ conversationId?: string }>();
    const navigate = useNavigate();
    const { activeId, createConversation, fetchThread } =
        useConversationsStore();

    // ---- State ----
    const [bubbles, setBubbles] = useState<Bubble[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);

    // ---- Refs ----
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const loadedConvRef = useRef<string | undefined>(undefined);
    const groupRef = useRef<string>("");
    const codexItemMapRef = useRef<Map<string, string>>(new Map());

    // ---- Effects ----

    // Auto-scroll to bottom when bubbles change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [bubbles]);

    // Load thread messages when opening an existing conversation
    useEffect(() => {
        if (!conversationId || conversationId === loadedConvRef.current) return;
        loadedConvRef.current = conversationId;

        fetchThread(conversationId).then((messages) => {
            if (!messages.length) return;
            const loaded: Bubble[] = [];
            for (const msg of messages) {
                const group = nextId();
                loaded.push({
                    id: nextId(),
                    kind: msg.role === "user" ? "user" : "text",
                    groupId: group,
                    text: msg.content,
                } as Bubble);
            }
            setBubbles(loaded);
        });
    }, [conversationId, fetchThread]);

    // Clean up any in-flight stream on unmount
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    // ---- Bubble management ----

    const MERGE_KINDS: Bubble["kind"][] = ["text", "thinking"];

    const appendBubble = useCallback(
        (
            kind: Bubble["kind"],
            opts: Partial<Omit<Bubble, "id" | "kind" | "groupId">>,
        ) => {
            setBubbles((prev) => {
                // Merge consecutive text or thinking bubbles in the same group.
                // OpenCode sends tiny one-word chunks — merging avoids flicker.
                if (
                    MERGE_KINDS.includes(kind) &&
                    opts.text &&
                    groupRef.current
                ) {
                    const last = prev[prev.length - 1];
                    if (
                        last &&
                        last.groupId === groupRef.current &&
                        last.kind === kind
                    ) {
                        const updated = [...prev];
                        updated[prev.length - 1] = {
                            ...last,
                            text: (last.text ?? "") + opts.text,
                        };
                        return updated;
                    }
                }

                const bubble: Bubble = {
                    id: nextId(),
                    kind,
                    groupId: groupRef.current,
                    ...opts,
                } as Bubble;
                return [...prev, bubble];
            });
        },
        [],
    );

    /**
     * Replace an existing bubble's text in-place (used by Codex SDK where
     * item.updated carries the FULL accumulated text, not a delta).
     */
    const updateBubbleById = useCallback(
        (bubbleId: string, updates: Partial<Omit<Bubble, "id">>) => {
            setBubbles((prev) => {
                const idx = prev.findIndex((b) => b.id === bubbleId);
                if (idx === -1) return prev;
                const next = [...prev];
                next[idx] = { ...next[idx], ...updates } as Bubble;
                return next;
            });
        },
        [],
    );

    // ---- Codex SDK event parsing ----
    //
    // The @openai/codex-sdk emits typed ThreadEvent JSON objects.  We detect
    // them by their dotted `type` field ("item.started", "turn.completed", …)
    // and map each item kind to the appropriate Bubble.
    //
    // For streaming text items (agent_message, reasoning) the SDK sends
    // item.started → item.updated* → item.completed, where each payload
    // carries the FULL accumulated text.  We create the bubble on the first
    // event and replace text on subsequent events (unlike OpenCode/Claude
    // where each chunk is a delta that gets appended).

    /** Map a Codex ThreadItem to a bubble, creating or updating as needed. */
    function handleCodexItem(
        item: any,
        eventType: "item.started" | "item.updated" | "item.completed",
    ): void {
        const itemId: string = item.id;
        const existingBubbleId = codexItemMapRef.current.get(itemId);

        switch (item.type) {
            // -- Streaming text: agent reply --
            case "agent_message": {
                const text: string = item.text ?? "";
                if (existingBubbleId) {
                    updateBubbleById(existingBubbleId, { text });
                } else {
                    const bid = nextId();
                    codexItemMapRef.current.set(itemId, bid);
                    setBubbles((prev) => [
                        ...prev,
                        {
                            id: bid,
                            kind: "text",
                            groupId: groupRef.current,
                            text,
                        } as Bubble,
                    ]);
                }
                break;
            }

            // -- Streaming text: agent reasoning --
            case "reasoning": {
                const text: string = item.text ?? "";
                if (existingBubbleId) {
                    updateBubbleById(existingBubbleId, { text });
                } else {
                    const bid = nextId();
                    codexItemMapRef.current.set(itemId, bid);
                    setBubbles((prev) => [
                        ...prev,
                        {
                            id: bid,
                            kind: "thinking",
                            groupId: groupRef.current,
                            text,
                        } as Bubble,
                    ]);
                }
                break;
            }

            // -- Command execution: show on completion --
            case "command_execution":
                if (eventType === "item.completed") {
                    appendBubble("tool_use", {
                        toolName: item.command ?? "command",
                        toolInput: {
                            command: item.command,
                            aggregated_output: item.aggregated_output,
                            exit_code: item.exit_code,
                        } as any,
                    });
                }
                break;

            // -- File changes: show on completion --
            case "file_change":
                if (eventType === "item.completed") {
                    const changes = (item.changes ?? []) as Array<{
                        path: string;
                        kind: string;
                    }>;
                    const summary = changes
                        .map((c) => `${c.kind} ${c.path}`)
                        .join(", ");
                    appendBubble("system", {
                        systemSubtype: "file",
                        systemDetail: `Files ${item.status}: ${summary || "no changes"}`,
                    });
                }
                break;

            // -- MCP tool call: show on completion --
            case "mcp_tool_call":
                if (eventType === "item.completed") {
                    appendBubble("tool_use", {
                        toolName: `${item.server ?? "mcp"}/${item.tool ?? "unknown"}`,
                        toolInput: item.arguments as any,
                    });
                }
                break;

            // -- Web search: show as system bubble --
            case "web_search":
                if (eventType === "item.completed") {
                    appendBubble("system", {
                        systemSubtype: "search",
                        systemDetail: `Web search: ${item.query ?? ""}`,
                    });
                }
                break;

            // -- Todo list: show as system bubble --
            case "todo_list":
                if (eventType === "item.completed") {
                    const items: Array<{ text: string; completed: boolean }> =
                        item.items ?? [];
                    const done = items.filter((t) => t.completed).length;
                    appendBubble("system", {
                        systemSubtype: "plan",
                        systemDetail: `Plan: ${done}/${items.length} tasks`,
                        text: items.map((t) => `- [${t.completed ? "x" : " "}] ${t.text}`).join("\n"),
                    });
                }
                break;

            // -- Error item --
            case "error":
                appendBubble("system", {
                    systemSubtype: "error",
                    text: item.message ?? "Unknown error",
                });
                break;
        }
    }

    /** Top-level Codex SDK ThreadEvent dispatcher. */
    function handleCodexSDKEvent(parsed: any): boolean {
        // Quick guard: only handle known Codex SDK event types
        const isCodexType =
            parsed.type &&
            (parsed.type.startsWith("thread.") ||
                parsed.type.startsWith("turn.") ||
                parsed.type.startsWith("item."));
        const isStreamError =
            parsed.type === "error" &&
            typeof parsed.message === "string" &&
            !parsed.item;
        if (!isCodexType && !isStreamError) {
            return false;
        }

        switch (parsed.type) {
            case "thread.started":
                // Store thread_id for later resumption (server-side persists it)
                appendBubble("system", {
                    systemSubtype: "init",
                    systemDetail: `Codex thread ready`,
                });
                break;

            case "turn.started":
                // New turn — nothing to show
                break;

            case "item.started":
            case "item.updated":
            case "item.completed":
                if (parsed.item) {
                    handleCodexItem(parsed.item, parsed.type);
                }
                break;

            case "turn.completed":
                if (parsed.usage) {
                    appendBubble("result", {
                        usage: {
                            input_tokens: parsed.usage.input_tokens ?? 0,
                            output_tokens: parsed.usage.output_tokens ?? 0,
                        },
                    });
                }
                break;

            case "turn.failed":
                appendBubble("system", {
                    systemSubtype: "error",
                    text: parsed.error?.message ?? "Turn failed",
                });
                break;

            case "error":
                // Top-level stream error (non-item)
                if (isStreamError) {
                    appendBubble("system", {
                        systemSubtype: "error",
                        text: parsed.message ?? "Stream error",
                    });
                }
                break;
        }

        return true;
    }

    // ---- OpenCode ACP parsing ----

    function parseOpenCodeUpdate(notif: {
        sessionId: string;
        update: any;
    }): void {
        const { update } = notif;

        switch (update.sessionUpdate) {
            case "agent_message_chunk":
                if (update.content?.text) {
                    appendBubble("text", { text: update.content.text });
                }
                break;

            case "agent_thought_chunk":
                if (update.content?.text) {
                    appendBubble("thinking", { text: update.content.text });
                }
                break;

            case "tool_call":
                appendBubble("tool_use", {
                    toolName: update.title ?? "unknown",
                    toolInput: update.input,
                });
                break;

            case "tool_call_update":
                if (
                    update.status === "completed" ||
                    update.status === "failed"
                ) {
                    appendBubble("system", {
                        systemSubtype: "tool",
                        systemDetail: `Tool ${update.toolCallId}: ${update.status}`,
                    });
                }
                break;

            case "usage_update":
                appendBubble("result", {
                    usage: {
                        input_tokens: update.used ?? 0,
                        output_tokens: 0,
                    },
                    cost: update.cost?.amount ?? 0,
                });
                break;

            case "plan":
            case "available_commands_update":
            case "user_message_chunk":
                break;

            case "current_mode_update":
                appendBubble("system", {
                    systemSubtype: "mode",
                    systemDetail: `Mode: ${update.mode}`,
                });
                break;

            default:
                break;
        }
    }

    function parseAcpLine(line: string): void {
        if (!line.trim()) return;

        line = line.trim().replace("data: ", "").replace("event: ", "");

        if (line === ":ok" || line === "[DONE]") return;

        let parsed: any;
        try {
            parsed = JSON.parse(line);
        } catch {
            appendBubble("text", { text: line });
            return;
        }

        if (!parsed || typeof parsed !== "object") {
            appendBubble("text", { text: line });
            return;
        }

        // --- OpenCode ACP format ---
        if (parsed.sessionId && parsed.update?.sessionUpdate) {
            parseOpenCodeUpdate(parsed);
            return;
        }

        // --- Codex SDK format ---
        // ThreadEvent types: thread.*, turn.*, item.*, error
        if (handleCodexSDKEvent(parsed)) {
            return;
        }

        // --- Kimi Code format ---
        // Kimi outputs { "role": "assistant", "content": "..." } in text
        // mode, and the same role-based format in stream-json mode for the
        // final response object.
        if (parsed.role) {
            switch (parsed.role) {
                case "assistant":
                    if (typeof parsed.content === "string" && parsed.content) {
                        appendBubble("text", { text: parsed.content });
                    }
                    break;
                case "user":
                    // User messages are already shown from local state; ignore.
                    break;
                case "system":
                case "tool":
                    if (typeof parsed.content === "string" && parsed.content) {
                        appendBubble("system", {
                            systemSubtype: "tool",
                            systemDetail: parsed.content,
                        });
                    }
                    break;
            }
            return;
        }

        // --- Claude Code stream-json format ---
        if (!parsed.type) {
            appendBubble("text", { text: line });
            return;
        }

        switch (parsed.type) {
            case "system":
                switch (parsed.subtype) {
                    case "init":
                        appendBubble("system", {
                            systemSubtype: "init",
                            systemDetail: parsed.model
                                ? `${parsed.model} · ${parsed.tools?.length ?? 0} tools`
                                : `${parsed.tools?.length ?? 0} tools available`,
                        });
                        break;
                    case "session_load":
                        break;
                    case "hook_response":
                        if (parsed.stderr) {
                            appendBubble("system", {
                                systemSubtype: "hook",
                                systemDetail: `${parsed.hook_name ?? "hook"} finished`,
                                text: parsed.stderr,
                            });
                        }
                        break;
                    case "hook_started":
                    case "hook_progress":
                    case "thinking_tokens":
                        break;
                }
                break;

            case "assistant": {
                const blocks = parsed.message?.content;
                if (!Array.isArray(blocks)) break;
                for (const block of blocks) {
                    switch (block.type) {
                        case "thinking":
                            appendBubble("thinking", {
                                text: block.thinking ?? "",
                            });
                            break;
                        case "text":
                            appendBubble("text", { text: block.text ?? "" });
                            break;
                        case "tool_use":
                            appendBubble("tool_use", {
                                toolName: block.name ?? "unknown",
                                toolInput: block.input,
                            });
                            break;
                    }
                }
                break;
            }

            case "result":
                if (parsed.subtype === "success") {
                    appendBubble("result", {
                        usage: parsed.usage,
                        cost: parsed.total_cost_usd,
                        durationMs: parsed.duration_ms,
                    });
                } else if (parsed.is_error) {
                    appendBubble("system", {
                        systemSubtype: "error",
                        text: parsed.result ?? "Unknown error",
                    });
                }
                break;
        }
    }

    // ---- SSE stream consumer ----

    async function streamAgentReply(
        message: string,
        onDone: () => void,
        onError: (msg: string) => void,
        signal: AbortSignal,
    ) {
        try {
            const res = await fetch(`${API_BASE}/api/chat/stream`, {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slug: agentSlug,
                    message,
                    conversationId,
                }),
                signal,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => null);
                onError(err?.error ?? `Server returned ${res.status}`);
                return;
            }

            const reader = res.body?.getReader();
            if (!reader) {
                onError("No response body");
                return;
            }

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const parts = buffer.split("\n");
                buffer = parts.pop() ?? "";

                for (const line of parts) {
                    parseAcpLine(line);
                }
            }

            // Final flush
            buffer += decoder.decode();
            if (buffer.trim()) {
                parseAcpLine(buffer.trim());
            }

            onDone();
        } catch (err: any) {
            if (err.name === "AbortError") return;
            onError(err.message ?? "Stream failed");
        }
    }

    // ---- Send / Stop ----

    async function handleSend() {
        const text = input.trim();
        if (!text || sending) return;

        setInput("");
        setSending(true);

        // Auto-create conversation if there isn't an active one
        let convId = activeId;
        if (!convId) {
            const title = text.length > 40 ? text.slice(0, 40) + "..." : text;
            const conv = await createConversation({
                agentSlug,
                title,
            });
            if (conv) {
                convId = conv.id;
                navigate(`/chat/${agentSlug}/${conv.id}`, { replace: true });
            }
        }

        // Start a new group for this conversation turn
        groupRef.current = nextId();
        codexItemMapRef.current.clear();

        // Add user bubble
        appendBubble("user", { text });

        const abortController = new AbortController();
        abortRef.current = abortController;

        await streamAgentReply(
            text,
            () => {
                setSending(false);
                abortRef.current = null;
            },
            (msg) => {
                appendBubble("system", {
                    systemSubtype: "error",
                    text: msg,
                });
                setSending(false);
                abortRef.current = null;
            },
            abortController.signal,
        );
    }

    function handleStop() {
        abortRef.current?.abort();
        abortRef.current = null;
        setSending(false);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    // ---- Render ----

    return (
        <div className="flex-1 flex flex-col min-w-0 overflow-scroll">
            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto py-6 flex flex-col gap-4 max-w-[720px] mx-auto w-full px-4"
            >
                {bubbles.length === 0 && (
                    <EmptyChat
                        title={`Start a conversation with ${agentName}`}
                        subtitle="Messages are sent directly to your local CLI agent"
                    />
                )}

                {groupBubbles(bubbles).map((group) => (
                    <div key={group.id} className="flex flex-col gap-1.5">
                        {group.bubbles.map((b) => (
                            <AcpBubble key={b.id} bubble={b} />
                        ))}
                        {group.resultFooter && (
                            <ResultFooter
                                usage={group.resultFooter.usage}
                                cost={group.resultFooter.cost}
                                durationMs={group.resultFooter.durationMs}
                            />
                        )}
                    </div>
                ))}

                {sending && <LoadingBubble />}
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 py-4 px-6 border-t border-[var(--border-subtle)] shrink-0 max-w-[720px] mx-auto w-full">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${agentName}...`}
                    disabled={sending}
                    rows={1}
                    className="input-field flex-1 resize-none max-h-32"
                />
                {sending ? (
                    <button
                        className="btn-primary !px-4 !py-2 bg-red-500 hover:bg-red-600"
                        onClick={handleStop}
                    >
                        Stop
                    </button>
                ) : (
                    <button
                        className="btn-primary !px-4 !py-2"
                        onClick={handleSend}
                        disabled={!input.trim()}
                    >
                        Send
                    </button>
                )}
            </div>
        </div>
    );
}
