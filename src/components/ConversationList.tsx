// ============================================================================
// ConversationList — left sidebar (2026 sizing)
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
            width="18"
            height="18"
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
            width="18"
            height="18"
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
            width="15"
            height="15"
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
            width="13"
            height="13"
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
            width="15"
            height="15"
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
            width="28"
            height="28"
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
                className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl w-[360px] p-7 flex flex-col gap-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3.5">
                    <WarningIcon />
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)] m-0">
                        Delete conversation?
                    </h3>
                </div>
                <p className="text-[13px] text-[var(--text-dim)] m-0 leading-relaxed">
                    This will permanently delete "
                    <span className="text-[var(--text-primary)] font-medium">
                        {conversation.title}
                    </span>
                    " and all its messages. This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2.5 pt-1">
                    <button
                        className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        ref={confirmRef}
                        className="px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
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

    useEffect(() => {
        setActiveId(conversationId ?? null);
    }, [conversationId, setActiveId]);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    const filtered = conversations.filter((c) => c.agentSlug === slug);

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
                { method: "POST", mode: "cors" },
            );
        } catch (_) {
            // Best-effort
        }
    }

    function handleSelect(id: string) {
        navigate(`/chat/${slug}/${id}`);
    }

    return (
        <aside className="w-[260px] shrink-0 flex flex-col h-screen border-r border-[var(--border-panel)] bg-[var(--bg-panel)]">
            {/* Back navigation */}
            <div className="px-3.5 py-2.5 border-b border-[var(--border-panel)]">
                <button
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors"
                    onClick={() => {
                        if (slug === "local") {
                            navigate("/setup");
                        } else {
                            navigate("/menu");
                        }
                    }}
                >
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
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    Home
                </button>
            </div>

            {/* Panel header */}
            <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border-panel)]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.045em] text-[var(--text-dim)] select-none">
                    Conversations
                </span>
                <button
                    className="flex items-center justify-center w-6 h-6 rounded-md text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors"
                    onClick={handleNew}
                    title="New conversation"
                >
                    <PlusIcon />
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto py-1.5">
                {loading && filtered.length === 0 && (
                    <p className="text-[12px] text-[var(--text-dim)] text-center py-10">
                        Loading...
                    </p>
                )}

                {!loading && filtered.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-12 px-4">
                        <ChatIcon />
                        <p className="text-[12px] text-[var(--text-dim)] text-center leading-relaxed">
                            No conversations yet
                        </p>
                    </div>
                )}

                {filtered.map((conv) => {
                    const isActive = conv.id === activeId;
                    const isRenaming = renamingId === conv.id;
                    return (
                        <div
                            key={conv.id}
                            onClick={() =>
                                !isRenaming && handleSelect(conv.id)
                            }
                            className={`group relative flex flex-col gap-1 mx-1.5 my-0.5 px-3.5 py-2 rounded-md transition-colors duration-150 cursor-pointer ${
                                isActive
                                    ? "bg-[var(--bg-surface)] border-l-[3px] border-l-[var(--tiffany)] shadow-sm"
                                    : "border-l-[3px] border-l-transparent hover:bg-[var(--bg-surface)]"
                            } ${isRenaming ? "cursor-text" : ""}`}
                        >
                            <div className="flex items-center gap-2 min-w-0">
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
                                        className="flex-1 text-[13px] font-medium bg-transparent border-b border-[var(--tiffany)] text-[var(--text-primary)] outline-none min-w-0 py-0.5"
                                    />
                                ) : (
                                    <span
                                        className="text-[13px] font-medium text-[var(--text-primary)] truncate flex-1 leading-snug"
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            startRename(conv);
                                        }}
                                        title="Double-click to rename"
                                    >
                                        {conv.title}
                                    </span>
                                )}

                                {!isRenaming && (
                                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startRename(conv);
                                            }}
                                            className="flex items-center justify-center w-5 h-5 rounded-md text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-black/5 transition-colors"
                                            title="Rename"
                                        >
                                            <EditIcon />
                                        </button>
                                        {conv.sessionId && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenFolder(conv);
                                                }}
                                                className="flex items-center justify-center w-5 h-5 rounded-md text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-black/5 transition-colors"
                                                title="Open folder"
                                            >
                                                <FolderIcon />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) =>
                                                handleDelete(e, conv)
                                            }
                                            className="flex items-center justify-center w-5 h-5 rounded-md text-[var(--text-dim)] hover:text-red-500 hover:bg-red-50 transition-colors"
                                            title="Delete"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)]">
                                <span>{agentName(conv.agentSlug)}</span>
                                <span className="opacity-40">·</span>
                                <span>{relativeTime(conv.updatedAt)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

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
