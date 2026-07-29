// ============================================================================
// ConversationList — left sidebar with conversation history
// ============================================================================

import { useEffect, useCallback, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useConversationsStore } from "../store/conversations";
import { BUILTIN_AGENTS } from "../store/BUILTIN_AGENTS";
import type { Conversation } from "../store/conversations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function PlusIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function ChatIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
    );
}

function WarningIcon() {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-yellow-500"
        >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
        </svg>
    );
}

// ---------------------------------------------------------------------------
// Confirm delete modal
// ---------------------------------------------------------------------------

function ConfirmDeleteModal({
    conversation,
    onConfirm,
    onCancel,
}: {
    conversation: Conversation;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const confirmRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        // Focus the confirm button on mount so Enter works naturally,
        // but user can Tab to Cancel if needed.
        confirmRef.current?.focus();

        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
            }
        }

        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onCancel]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onCancel}
        >
            <div
                className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-2xl w-[340px] p-6 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Icon + Title */}
                <div className="flex items-center gap-3">
                    <WarningIcon />
                    <h3 className="text-[0.9rem] font-semibold text-[var(--text-primary)] m-0">
                        Delete conversation?
                    </h3>
                </div>

                {/* Description */}
                <p className="text-[0.75rem] text-[var(--text-dim)] m-0 leading-relaxed">
                    This will permanently delete "
                    <span className="text-[var(--text-primary)] font-medium">
                        {conversation.title}
                    </span>
                    " and all its messages. This action cannot be undone.
                </p>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-1">
                    <button
                        className="px-3.5 py-1.5 rounded-lg text-[0.75rem] font-medium text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        ref={confirmRef}
                        className="px-3.5 py-1.5 rounded-lg text-[0.75rem] font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                        onClick={onConfirm}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                onConfirm();
                            }
                        }}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConversationList() {
    const navigate = useNavigate();
    const { slug, conversationId } = useParams<{
        slug: string;
        conversationId?: string;
    }>();
    const {
        conversations,
        activeId,
        loading,
        fetchConversations,
        createConversation,
        deleteConversation,
        setActiveId,
    } = useConversationsStore();

    // Sync URL param to store
    useEffect(() => {
        setActiveId(conversationId ?? null);
    }, [conversationId, setActiveId]);

    // Fetch conversations on mount
    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    // Filter to current agent
    const filtered = conversations.filter((c) => c.agentSlug === slug);

    // Get agent name for a given slug
    const agentName = useCallback((agentSlug: string) => {
        return (
            BUILTIN_AGENTS.find((a) => a.slug === agentSlug)?.name ?? agentSlug
        );
    }, []);

    async function handleNew() {
        const conv = await createConversation({
            agentSlug: slug!,
            title: "New conversation",
        });
        if (conv) {
            navigate(`/chat/${slug}/${conv.id}`);
        }
    }

    const [pendingDelete, setPendingDelete] = useState<Conversation | null>(
        null,
    );

    function handleDelete(e: React.MouseEvent, conv: Conversation) {
        e.stopPropagation();
        setPendingDelete(conv);
    }

    async function handleConfirmDelete() {
        if (!pendingDelete) return;
        const id = pendingDelete.id;
        setPendingDelete(null);
        await deleteConversation(id);
        if (activeId === id) {
            navigate(`/chat/${slug}`);
        }
    }

    function handleCancelDelete() {
        setPendingDelete(null);
    }

    function handleSelect(id: string) {
        navigate(`/chat/${slug}/${id}`);
    }

    return (
        <aside className="w-64 shrink-0 flex flex-col h-screen border-r border-[var(--border-subtle)] bg-[var(--bg-card)]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--border-subtle)]">
                <h3 className="text-[0.8rem] font-bold text-[var(--text-primary)] m-0 tracking-[-0.01em]">
                    Conversations
                </h3>
                <button
                    className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
                    onClick={handleNew}
                    title="New conversation"
                >
                    <PlusIcon />
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto py-2">
                {loading && filtered.length === 0 && (
                    <p className="text-[0.75rem] text-[var(--text-dim)] text-center py-8">
                        Loading...
                    </p>
                )}

                {!loading && filtered.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-10 px-4">
                        <ChatIcon />
                        <p className="text-[0.75rem] text-[var(--text-dim)] text-center leading-relaxed">
                            No conversations yet.
                            <br />
                            Send a message to start one.
                        </p>
                    </div>
                )}

                {filtered.map((conv) => {
                    const isActive = conv.id === activeId;
                    return (
                        <div
                            key={conv.id}
                            onClick={() => handleSelect(conv.id)}
                            className={`group relative flex flex-col gap-0.5 px-4 py-2.5 mx-2 rounded-lg cursor-pointer transition-all duration-200 ${
                                isActive
                                    ? "bg-[var(--tiffany-glow)] border border-[var(--border-glow)]"
                                    : "hover:bg-[var(--border-subtle)] border border-transparent"
                            }`}
                        >
                            {/* Title */}
                            <div className="flex items-center gap-2">
                                <span className="text-[0.8rem] font-medium text-[var(--text-primary)] truncate flex-1 leading-tight">
                                    {conv.title}
                                </span>

                                {/* Delete button */}
                                <button
                                    onClick={(e) => handleDelete(e, conv)}
                                    className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded text-[var(--text-dim)] hover:text-red-400 hover:bg-red-50 shrink-0 transition-colors"
                                    title="Delete conversation"
                                >
                                    <TrashIcon />
                                </button>
                            </div>

                            {/* Meta */}
                            <div className="flex items-center gap-2 text-[0.65rem] text-[var(--text-dim)]">
                                <span>{agentName(conv.agentSlug)}</span>
                                <span className="opacity-50">·</span>
                                <span>{relativeTime(conv.updatedAt)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Confirm delete modal */}
            {pendingDelete && (
                <ConfirmDeleteModal
                    conversation={pendingDelete}
                    onConfirm={handleConfirmDelete}
                    onCancel={handleCancelDelete}
                />
            )}
        </aside>
    );
}
