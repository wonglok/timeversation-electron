// ============================================================================
// Chat page — converse with a specific CLI agent via SSE streaming
// ============================================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BUILTIN_AGENTS } from "../store/BUILTIN_AGENTS";
import {
    AcpBubble,
    LoadingBubble,
    EmptyChat,
    ResultFooter,
    groupBubbles,
} from "../components/MessageBubble/MessageBubble";
import type { Bubble } from "../components/MessageBubble/types";

const API_BASE = "http://localhost:8390";

let _bubbleId = 0;
function nextId(): string {
    return `b-${++_bubbleId}`;
}

let sessionID = `${crypto.randomUUID()}`;

export function Chat() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const agent = BUILTIN_AGENTS.find((a) => a.slug === slug);

    const [bubbles, setBubbles] = useState<Bubble[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Auto-scroll to bottom when bubbles change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [bubbles]);

    // Clean up any in-flight stream on unmount
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    // Redirect home if agent not found
    if (!agent) {
        return (
            <main className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-[var(--text-secondary)]">Agent not found.</p>
                <button className="btn-secondary" onClick={() => navigate("/")}>
                    Back to Home
                </button>
            </main>
        );
    }

    const IconComponent = agent.icon;

    // Track the current turn's groupId so consecutive text blocks merge
    const groupRef = useRef<string>("");

    // ------------------------------------------------------------------
    // Append a bubble — merges consecutive text blocks in the same group
    // ------------------------------------------------------------------
    const appendBubble = useCallback(
        (
            kind: Bubble["kind"],
            opts: Partial<Omit<Bubble, "id" | "kind" | "groupId">>,
        ) => {
            setBubbles((prev) => {
                // Merge consecutive "text" bubbles in the same group
                if (kind === "text" && opts.text && groupRef.current) {
                    const last = prev[prev.length - 1];
                    if (
                        last &&
                        last.groupId === groupRef.current &&
                        last.kind === "text"
                    ) {
                        const updated = [...prev];
                        updated[prev.length - 1] = {
                            ...last,
                            text: last.text! + opts.text,
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

    // ------------------------------------------------------------------
    // Parse a single NDJSON line into Bubble(s)
    // ------------------------------------------------------------------
    function parseAcpLine(line: string): void {
        if (!line.trim()) return;

        // console.log(line);
        line = line.trim().replace("data: ", "").replace("event: ", "");

        if (line === ":ok") {
            return;
        }
        if (line === "[DONE]") {
            return;
        }

        let parsed: any;
        try {
            parsed = JSON.parse(line);
        } catch {
            // Non-JSON — emit as raw text
            appendBubble("text", { text: line });
            return;
        }

        if (!parsed || typeof parsed !== "object" || !parsed.type) {
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
                        // Too noisy for chat UI — skip
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

    // ------------------------------------------------------------------
    // SSE stream consumer
    // ------------------------------------------------------------------
    async function streamAgentReply(
        slug: string,
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
                body: JSON.stringify({ slug, message, sessionID }),
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

                // Split on LF for NDJSON (the server sends NDJSON via SSE)
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

    // ------------------------------------------------------------------
    // Send handler
    // ------------------------------------------------------------------
    async function handleSend() {
        const text = input.trim();
        if (!text || sending) return;

        setInput("");
        setSending(true);

        // Start a new group for this conversation turn
        groupRef.current = nextId();

        // Add user bubble
        appendBubble("user", { text });

        const abortController = new AbortController();
        abortRef.current = abortController;

        await streamAgentReply(
            agent!.slug,
            text,
            // onDone
            () => {
                setSending(false);
                abortRef.current = null;
            },
            // onError
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

    return (
        <main className="flex flex-col h-screen max-w-[720px] mx-auto px-4">
            {/* ---- Header ---- */}
            <header className="flex items-center gap-3 py-4 border-b border-[var(--border-subtle)] shrink-0">
                <button
                    className="btn-secondary !px-3 !py-1.5 text-sm"
                    onClick={() => navigate("/")}
                >
                    ← Back
                </button>

                <div className="flex items-center gap-2.5 ml-1">
                    {IconComponent && <IconComponent size={28} />}
                    <div>
                        <h2 className="text-[0.95rem] font-bold text-[var(--text-primary)] m-0 leading-tight">
                            {agent.name}
                        </h2>
                        <p className="text-[0.7rem] text-[var(--text-dim)] m-0">
                            {agent.cliName}
                        </p>
                    </div>
                </div>
            </header>

            {/* ---- Messages ---- */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto py-6 flex flex-col gap-4"
            >
                {bubbles.length === 0 && (
                    <EmptyChat
                        title={`Start a conversation with ${agent.name}`}
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

            {/* ---- Input ---- */}
            <div className="flex items-end gap-2 py-4 border-t border-[var(--border-subtle)] shrink-0">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${agent.name}…`}
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
        </main>
    );
}
