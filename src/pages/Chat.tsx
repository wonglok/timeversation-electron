// ============================================================================
// Chat page — agent lookup + layout shell (sidebar, header, ChatBox)
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
            width="48"
            height="48"
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

    // Redirect home if agent not found
    if (!agent) {
        return (
            <main className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-[var(--text-secondary)]">Agent not found.</p>
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
                {/* Tool options bar — Photoshop style */}
                <header className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border-panel)] bg-[var(--bg-surface)] shrink-0">
                    <div className="flex items-center gap-2">
                        {IconComponent && <IconComponent size={18} />}
                        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                            {agent.name}
                        </span>
                        <span className="text-[10px] text-[var(--text-dim)] bg-[var(--bg-panel)] px-1.5 py-0.5 rounded-sm font-mono">
                            {agent.cliName}
                        </span>
                    </div>
                </header>

                {conversationId && (
                    <ChatBox
                        key={`${slug}-${conversationId}`}
                        agentSlug={agent.slug}
                        agentName={agent.name}
                    />
                )}

                {!conversationId && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 bg-[var(--bg-canvas)]">
                        <div className="text-[var(--text-dim)] opacity-40">
                            <ChatIcon />
                        </div>
                        <div className="text-center">
                            <p className="text-[12px] text-[var(--text-dim)] m-0 leading-relaxed">
                                Select a conversation from the sidebar
                                <br />
                                or start a new one.
                            </p>
                        </div>
                        <button
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[11px] font-medium text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-panel)] hover:border-[var(--tiffany)] hover:bg-[var(--bg-hover)] transition-colors"
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
