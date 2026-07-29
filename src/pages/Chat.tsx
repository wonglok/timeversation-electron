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
                <button className="btn-secondary" onClick={() => navigate("/")}>
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
        <main className="flex h-screen">
            {/* ---- Sidebar ---- */}
            <ConversationList />

            {/* ---- Chat Area ---- */}
            <div className="flex-1 flex flex-col h-screen min-w-0">
                {/* Header */}
                <header className="flex items-center gap-3 py-4 px-6 border-b border-[var(--border-subtle)] shrink-0">
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

                {conversationId && (
                    <ChatBox
                        key={JSON.stringify({ conversationId, slug, agent })}
                        agentSlug={agent.slug}
                        agentName={agent.name}
                    />
                )}
                {!conversationId && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
                        <ChatIcon />
                        <div className="text-center">
                            <h3 className="text-[0.95rem] font-semibold text-[var(--text-primary)] m-0 mb-1">
                                No conversation selected
                            </h3>
                            <p className="text-[0.8rem] text-[var(--text-dim)] m-0 leading-relaxed">
                                Select a conversation from the sidebar
                                <br />
                                or start a new one.
                            </p>
                        </div>
                        <button
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[0.8rem] font-medium text-[var(--text-primary)] bg-[var(--tiffany-glow)] border border-[var(--border-glow)] hover:brightness-110 transition-all"
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
