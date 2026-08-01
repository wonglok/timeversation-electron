// ============================================================================
// Chat page — agent lookup + layout shell (2026 sizing)
// ============================================================================

import { useParams, useNavigate } from "react-router-dom";
import { BUILTIN_AGENTS } from "../store/BUILTIN_AGENTS";
import { ConversationList } from "../components/ConversationList";
import { ChatBox } from "../components/ChatBox/ChatBox";
import { useConversationsStore } from "../store/conversations";

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function ChatIcon() {
    return (
        <svg
            width="52"
            height="52"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--text-dim)]"
        >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M8 9h8M8 13h6" />
        </svg>
    );
}

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

function FolderOpenIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <path d="M2 9h20" />
        </svg>
    );
}

export function Chat() {
    const { slug, conversationId } = useParams<{
        slug: string;
        conversationId?: string;
    }>();
    const navigate = useNavigate();
    const createConversation = useConversationsStore(
        (s) => s.createConversation,
    );
    const agent = BUILTIN_AGENTS.find((a) => a.slug === slug);

    if (!agent) {
        return (
            <main className="flex flex-col items-center justify-center min-h-screen gap-5">
                <p className="text-[14px] text-[var(--text-secondary)]">
                    Agent not found.
                </p>
                <button
                    className="btn-secondary"
                    onClick={() => {
                        navigate("/");
                    }}
                >
                    Back to Home
                </button>
            </main>
        );
    }

    const IconComponent = agent.icon;

    async function handleNewConversation() {
        const conv = await createConversation({
            agentSlug: slug!,
            title: "New conversation",
        });
        if (conv) {
            navigate(`/chat/${slug}/${conv.id}`);
        }
    }

    return (
        <main className="flex h-screen bg-[var(--bg-canvas)]">
            {/* ---- Sidebar ---- */}
            <ConversationList />

            {/* ---- Workspace (Chat Area) ---- */}
            <div className="flex-1 flex flex-col h-screen min-w-0">
                {/* Tool options bar */}
                <header className="flex items-center gap-4 px-5 py-2.5 border-b border-[var(--border-panel)] bg-[var(--bg-surface)] shrink-0">
                    <div className="flex items-center gap-2.5">
                        {IconComponent && <IconComponent size={20} />}
                        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                            {agent.name}
                        </span>
                        <span className="text-[11px] text-[var(--text-dim)] bg-[var(--bg-panel)] px-2 py-0.5 rounded-sm font-mono">
                            {agent.cliName}
                        </span>
                    </div>

                    {/* Right-side actions */}
                    <div className="flex-1" />
                    {conversationId && (
                        <button
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-panel)] transition-colors"
                            title="Open session folder"
                            onClick={() => {
                                window.ipcRenderer.invoke(
                                    "open-session-folder",
                                    conversationId,
                                );
                            }}
                        >
                            <FolderOpenIcon />
                            <span>Open Folder</span>
                        </button>
                    )}
                </header>

                {conversationId && (
                    <ChatBox
                        key={`${slug}-${conversationId}`}
                        agentSlug={agent.slug}
                        agentName={agent.name}
                    />
                )}

                {!conversationId && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 bg-[var(--bg-canvas)]">
                        <div className="text-[var(--text-dim)] opacity-40">
                            <ChatIcon />
                        </div>
                        <div className="text-center">
                            <p className="text-[13px] text-[var(--text-dim)] m-0 leading-relaxed">
                                Select a conversation from the sidebar
                                <br />
                                or start a new one.
                            </p>
                        </div>
                        <button
                            className="flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-medium text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-panel)] hover:border-[var(--tiffany)] hover:bg-[var(--bg-hover)] transition-colors"
                            onClick={handleNewConversation}
                        >
                            <PlusIcon />
                            New conversation
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}
