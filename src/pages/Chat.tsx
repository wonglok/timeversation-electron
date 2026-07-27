// ============================================================================
// Chat page — converse with a specific CLI agent via SSE streaming
// ============================================================================

import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BUILTIN_AGENTS } from "../store/BUILTIN_AGENTS";

const API_BASE = "http://localhost:8390";

interface Message {
    role: "user" | "agent";
    content: string;
}

export function Chat() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const agent = BUILTIN_AGENTS.find((a) => a.slug === slug);

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

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

    // ------------------------------------------------------------------
    // SSE stream consumer (with TextDecoder for proper UTF-8 streaming)
    // ------------------------------------------------------------------
    async function streamAgentReply(
        slug: string,
        message: string,
        onChunk: (text: string) => void,
        onDone: () => void,
        onError: (msg: string) => void,
        signal: AbortSignal,
    ) {
        try {
            const res = await fetch(`${API_BASE}/api/chat/stream`, {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug, message }),
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

                // Decode incrementally so split multi-byte UTF-8 codepoints are
                // handled correctly across chunk boundaries.
                buffer += decoder.decode(value, { stream: true });

                // SSE frames are separated by double-CRLF (or double-LF as a
                // lenient fallback).  The server emits `\r\n\r\n` so we match that
                // first, then fall back to `\n\n`.
                const delim = buffer.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
                const parts = buffer.split(delim);
                // The last element is an incomplete frame; keep it in the buffer.
                buffer = parts.pop() ?? "";

                for (const part of parts) {
                    const raw = part.trim();
                    if (!raw) continue;

                    // -- Parse the SSE frame --
                    let eventType = "message";
                    const dataLines: string[] = [];

                    for (const line of raw.split(/\r?\n/)) {
                        if (line.startsWith("event:")) {
                            eventType = line.slice(6).trim();
                        } else if (line.startsWith("data:")) {
                            // Rejoin consecutive `data:` lines with \n — the
                            // server emits multi-line payloads this way.
                            dataLines.push(line.slice(5).replace(/^ /, ""));
                        }
                        // Ignore comments (`:…`) and unknown fields.
                    }

                    const data = dataLines.join("\n");

                    if (!data && eventType === "message") continue;

                    switch (eventType) {
                        case "message":
                            if (data === "[DONE]") {
                                onDone();
                                return;
                            }
                            onChunk(data);
                            break;
                        case "stderr":
                            // Pass stderr as regular output so the user can see it
                            onChunk(data);
                            break;
                        case "error":
                            onError(data);
                            return;
                    }
                }
            }

            // Final decode to flush any trailing bytes (handles edge case where
            // the stream ends mid-codepoint).
            buffer += decoder.decode();
            if (buffer.trim()) {
                // Try to salvage a last partial frame
                const raw = buffer.trim();
                let data = "";
                for (const line of raw.split(/\r?\n/)) {
                    if (line.startsWith("data:")) {
                        data += line.slice(5).replace(/^ /, "");
                    }
                }
                if (data && data !== "[DONE]") {
                    onChunk(data);
                }
            }

            // If the stream ended without [DONE], treat as done
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

        // Add user message + empty agent placeholder
        const userMsg: Message = { role: "user", content: text };
        const agentMsg: Message = { role: "agent", content: "" };
        setMessages((prev) => [...prev, userMsg, agentMsg]);

        const abortController = new AbortController();
        abortRef.current = abortController;

        streamAgentReply(
            agent!.slug,
            text,
            // onChunk — append to the last (agent) message
            (chunk) => {
                setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "agent") {
                        // If content is empty, don't add leading newline
                        last.content = last.content
                            ? last.content + "\n" + chunk
                            : chunk;
                    }
                    return updated;
                });
            },
            // onDone
            () => {
                setSending(false);
                abortRef.current = null;
            },
            // onError
            (msg) => {
                setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "agent") {
                        last.content = last.content
                            ? last.content + "\n\n> ⚠ " + msg
                            : "> ⚠ " + msg;
                    }
                    return updated;
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
                {messages.length === 0 && (
                    <div className="flex flex-col items-center gap-2 mt-16 text-center">
                        <p className="text-[var(--text-dim)] text-sm">
                            Start a conversation with {agent.name}
                        </p>
                        <p className="text-[var(--text-dim)] text-xs">
                            Messages are sent directly to your local CLI agent
                        </p>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[85%] px-4 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                                msg.role === "user"
                                    ? "bg-[var(--tiffany)] text-white rounded-br-sm"
                                    : "glass-card rounded-bl-sm text-[var(--text-primary)]"
                            }`}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}

                {sending && (
                    <div className="flex justify-start">
                        <div className="glass-card px-4 py-2.5 rounded-xl rounded-bl-sm text-sm text-[var(--text-dim)]">
                            <span className="loading-dot mr-1" />
                            <span
                                className="loading-dot mr-1"
                                style={{ animationDelay: "0.15s" }}
                            />
                            <span
                                className="loading-dot"
                                style={{ animationDelay: "0.3s" }}
                            />
                        </div>
                    </div>
                )}
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
