// ============================================================================
// Chat page — converse with a specific CLI agent
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

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

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

    async function handleSend() {
        const text = input.trim();
        if (!text || sending) return;

        setInput("");
        setSending(true);
        setMessages((prev) => [...prev, { role: "user", content: text }]);

        try {
            const res = await fetch(`${API_BASE}/api/chat/send`, {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug: agent!.slug, message: text }),
            });
            const data = await res.json();
            setMessages((prev) => [
                ...prev,
                { role: "agent", content: data.reply ?? "(no response)" },
            ]);
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    role: "agent",
                    content: "Failed to reach agent. Is the server running?",
                },
            ]);
        } finally {
            setSending(false);
        }
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
                <button
                    className="btn-primary !px-4 !py-2"
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                >
                    Send
                </button>
            </div>
        </main>
    );
}
