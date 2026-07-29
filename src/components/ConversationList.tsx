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

function EditIcon() {
    return (
        <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
    );
}

function FolderIcon() {
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
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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
        renameConversation,
        deleteConversation,
        setActiveId,
    } = useConversationsStore();

    const API_BASE = "http://localhost:8390";

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

    // ---- Inline rename state ----
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (renamingId) {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }
    }, [renamingId]);

    function startRename(conv: Conversation) {
        setRenamingId(conv.id);
        setRenameValue(conv.title);
    }

    async function commitRename() {
        const id = renamingId;
        const title = renameValue.trim();
        setRenamingId(null);
        setRenameValue("");
        if (id && title) {
            await renameConversation(id, title);
        }
    }

    function cancelRename() {
        setRenamingId(null);
        setRenameValue("");
    }

    function handleRenameKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter") {
            e.preventDefault();
            commitRename();
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancelRename();
        }
    }

    async function handleOpenFolder(conv: Conversation) {
        if (!conv.sessionId) return;
        try {
            await fetch(
                `${API_BASE}/api/conversations/${conv.id}/open-folder`,
                {
                    method: "POST",
                    mode: "cors",
                },
            );
        } catch (_) {
            // Silently fail — folder open is best-effort
        }
    }

    function handleSelect(id: string) {
        navigate(`/chat/${slug}/${id}`);
    }

    return (
        <aside className="w-64 shrink-0 flex flex-col h-screen border-r border-[var(--border-subtle)] bg-[var(--bg-card)]">
            {/* Header */}
            <header className="flex items-center gap-3 py-4 px-6 border-b border-[var(--border-subtle)] shrink-0 bg-gray-500">
                <button
                    className=" !px-3 !py-1.5 text-sm text-white border-white border rounded-lg"
                    onClick={() => navigate("/")}
                >
                    Back
                </button>
            </header>

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
                    const isRenaming = renamingId === conv.id;
                    return (
                        <div
                            key={conv.id}
                            onClick={() => !isRenaming && handleSelect(conv.id)}
                            className={`group relative flex flex-col gap-0.5 px-4 py-2.5 mx-2 rounded-lg transition-all duration-200 ${
                                isActive
                                    ? "bg-[var(--tiffany-glow)] border border-[var(--border-glow)]"
                                    : "hover:bg-[var(--border-subtle)] border border-transparent"
                            } ${isRenaming ? "cursor-text" : "cursor-pointer"}`}
                        >
                            {/* Title */}
                            <div className="flex items-center gap-2">
                                {isRenaming ? (
                                    <input
                                        ref={renameInputRef}
                                        value={renameValue}
                                        onChange={(e) =>
                                            setRenameValue(e.target.value)
                                        }
                                        onKeyDown={handleRenameKeyDown}
                                        onBlur={commitRename}
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex-1 text-[0.8rem] font-medium bg-transparent border-b border-[var(--border-glow)] text-[var(--text-primary)] outline-none min-w-0"
                                    />
                                ) : (
                                    <span
                                        className="text-[0.8rem] font-medium text-[var(--text-primary)] truncate flex-1 leading-tight"
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            startRename(conv);
                                        }}
                                        title="Double-click to rename"
                                    >
                                        {conv.title}
                                    </span>
                                )}

                                {/* Action buttons (visible on hover) */}
                                {!isRenaming && (
                                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                                        {/* Rename button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startRename(conv);
                                            }}
                                            className="flex items-center justify-center w-5 h-5 rounded text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
                                            title="Rename conversation"
                                        >
                                            <EditIcon />
                                        </button>

                                        {/* Open folder button */}
                                        {conv.sessionId && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenFolder(conv);
                                                }}
                                                className="flex items-center justify-center w-5 h-5 rounded text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
                                                title="Open session folder"
                                            >
                                                <FolderIcon />
                                            </button>
                                        )}

                                        {/* Delete button */}
                                        <button
                                            onClick={(e) =>
                                                handleDelete(e, conv)
                                            }
                                            className="flex items-center justify-center w-5 h-5 rounded text-[var(--text-dim)] hover:text-red-400 hover:bg-red-50 transition-colors"
                                            title="Delete conversation"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                )}
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
