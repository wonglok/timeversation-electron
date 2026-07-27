import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAgentsStore } from "../store/agents.ts";
import { useChatStore } from "../store/chat.ts";
import type { ChatMessage } from "../store/chat.ts";
import { Icon, resolveIconName } from "../components/icons.tsx";

// ============================================================================
// Sub-components
// ============================================================================

function MessageBubble({ msg }: { msg: ChatMessage }) {
    const isUser = msg.role === "user";
    const isStreaming = !isUser && msg.content === "";

    return (
        <div
            className={`flex ${isUser ? "justify-end" : "justify-start"} w-full`}
        >
            <div
                className={`glass-card max-w-[75%] px-4 py-3 ${
                    isUser
                        ? "bg-[var(--primary)]/10 border-[var(--border-glow)]"
                        : ""
                }`}
            >
                {isStreaming ? (
                    <span className="inline-block w-2 h-4 bg-[var(--primary)] animate-pulse rounded-sm" />
                ) : (
                    <pre className="text-sm text-[var(--text-primary)] whitespace-pre-wrap font-sans m-0 leading-relaxed">
                        {msg.content}
                    </pre>
                )}
            </div>
        </div>
    );
}

function EmptyChat() {
    return (
        <div className="flex flex-col items-center text-center max-w-[360px] mt-24 gap-3">
            <Icon
                name="sparkles"
                size="2.5rem"
                className="text-[var(--text-dim)]"
            />
            <p className="text-lg font-bold text-[var(--text-primary)] m-0">
                Select an agent and start chatting
            </p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed m-0">
                Pick an installed agent from the sidebar, set a working
                directory, and send a message. The agent's response will stream
                in real-time.
            </p>
        </div>
    );
}

function ChatInput({
    onSend,
    disabled,
}: {
    onSend: (text: string) => void;
    disabled: boolean;
}) {
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = useCallback(() => {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onSend(trimmed);
        setValue("");
        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    }, [value, disabled, onSend]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend],
    );

    const handleInput = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, []);

    return (
        <div className="flex items-end gap-2.5 w-full">
            <textarea
                ref={textareaRef}
                className="input-field flex-1 resize-none"
                rows={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                disabled={disabled}
            />
            <button
                type="button"
                className="btn-primary shrink-0"
                onClick={handleSend}
                disabled={disabled || !value.trim()}
            >
                <Icon name="sparkles" size="1rem" />
                Send
            </button>
        </div>
    );
}

// ============================================================================
// Chat page
// ============================================================================

export function Chat() {
    const [searchParams] = useSearchParams();
    const preselectedAgent = searchParams.get("agent");

    const { results, status: scanStatus, startScan } = useAgentsStore();
    const {
        messages,
        selectedAgent,
        cwd,
        sending,
        error,
        setAgent,
        setCwd,
        sendMessage,
        cancelSend,
        clearMessages,
        clearError,
    } = useChatStore();

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // Auto-scan on mount if not yet scanned
    useEffect(() => {
        if (scanStatus === "idle" && results.length === 0) {
            startScan();
        }
    }, [scanStatus, results.length, startScan]);

    // Pre-select agent from query param
    useEffect(() => {
        if (preselectedAgent && results.length > 0 && !selectedAgent) {
            const match = results.find(
                (r) =>
                    r.installed &&
                    r.agent.name.toLowerCase() ===
                        preselectedAgent.toLowerCase(),
            );
            if (match) setAgent(match);
        }
    }, [preselectedAgent, results, selectedAgent, setAgent]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const installed = results.filter((r) => r.installed);

    const handleSend = useCallback(
        (content: string) => {
            void sendMessage(content);
        },
        [sendMessage],
    );

    return (
        <main className="flex h-screen box-border">
            {/* ---- Sidebar ---- */}
            <aside
                className={`${
                    sidebarOpen ? "w-72" : "w-0 overflow-hidden"
                } shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-deep)] flex flex-col gap-4 p-5 transition-[width] duration-200`}
            >
                {/* Sidebar toggle */}
                <button
                    type="button"
                    className="btn-secondary self-end text-xs px-2 py-1"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                >
                    {sidebarOpen ? "←" : "→"}
                </button>

                {/* Agent selector */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                        Agent
                    </label>
                    {installed.length === 0 ? (
                        <p className="text-xs text-[var(--text-dim)] m-0">
                            {scanStatus === "scanning"
                                ? "Scanning for agents…"
                                : "No agents detected. Run a scan first."}
                        </p>
                    ) : (
                        <select
                            className="select-field w-full"
                            value={selectedAgent?.agent.name ?? ""}
                            onChange={(e) => {
                                const name = e.target.value;
                                const agent = installed.find(
                                    (a) => a.agent.name === name,
                                );
                                setAgent(agent ?? null);
                            }}
                        >
                            <option value="">Select an agent…</option>
                            {installed.map((r) => (
                                <option key={r.agent.name} value={r.agent.name}>
                                    {r.agent.name}
                                    {r.version ? ` (v${r.version})` : ""}
                                </option>
                            ))}
                        </select>
                    )}

                    {selectedAgent && (
                        <div className="flex items-center gap-2 mt-1">
                            <Icon
                                name={resolveIconName(selectedAgent.agent.icon)}
                                size="1rem"
                            />
                            <span className="text-xs text-[var(--text-secondary)]">
                                <code>
                                    {selectedAgent.binaryPath ??
                                        selectedAgent.agent.commands[0]}
                                </code>
                            </span>
                        </div>
                    )}
                </div>

                {/* Working directory */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                        Working Directory
                    </label>
                    <input
                        className="input-field w-full"
                        type="text"
                        value={cwd}
                        onChange={(e) => setCwd(e.target.value)}
                        placeholder="./tempdir or ~/projects/my-app"
                    />
                </div>

                {/* Clear chat */}
                {messages.length > 0 && (
                    <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={clearMessages}
                    >
                        Clear chat
                    </button>
                )}
            </aside>

            {/* ---- Main chat area ---- */}
            <section className="flex-1 flex flex-col min-w-0">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
                    {messages.length === 0 && <EmptyChat />}

                    {messages.map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} />
                    ))}
                    <div ref={messagesEndRef} />

                    {/* Error banner */}
                    {error && (
                        <div className="flex items-center gap-2 mt-3 py-2.5 px-4 text-sm text-amber-900 bg-amber-100/15 border border-amber-300/25 rounded-[10px]">
                            <Icon
                                name="alert-triangle"
                                size="1rem"
                                className="shrink-0"
                            />
                            <span className="flex-1">{error}</span>
                            <button
                                type="button"
                                className="text-xs font-semibold text-amber-900/70 hover:text-amber-900"
                                onClick={clearError}
                            >
                                Dismiss
                            </button>
                        </div>
                    )}
                </div>

                {/* Input bar */}
                <div className="shrink-0 px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <ChatInput onSend={handleSend} disabled={sending} />
                    {sending && (
                        <div className="flex items-center gap-2 mt-2">
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--primary)] animate-pulse" />
                            <span className="text-xs text-[var(--text-secondary)]">
                                {selectedAgent?.agent.name} is thinking…
                            </span>
                            <button
                                type="button"
                                className="text-xs text-[var(--text-dim)] hover:text-[var(--text-secondary)] ml-auto"
                                onClick={cancelSend}
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}
