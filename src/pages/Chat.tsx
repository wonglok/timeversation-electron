// ============================================================================
// Chat page — agent lookup + layout shell (sidebar, header, ChatBox)
// ============================================================================

import { useParams, useNavigate } from "react-router-dom";
import { BUILTIN_AGENTS } from "../store/BUILTIN_AGENTS";
import { ConversationList } from "../components/ConversationList";
import { ChatBox } from "../components/ChatBox/ChatBox";

export function Chat() {
    const { slug, conversationId } = useParams<{
        slug: string;
        conversationId?: string;
    }>();
    const navigate = useNavigate();
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

    return (
        <main className="flex h-screen">
            {/* ---- Sidebar ---- */}
            <ConversationList />

            {/* ---- Chat Area ---- */}
            <div className="flex-1 flex flex-col h-screen min-w-0">
                {/* Header */}
                <header className="flex items-center gap-3 py-4 px-6 border-b border-[var(--border-subtle)] shrink-0">
                    <button
                        className="btn-secondary !px-3 !py-1.5 text-sm"
                        onClick={() => navigate("/")}
                    >
                        Back
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

                {conversationId && (
                    <ChatBox
                        key={JSON.stringify({ conversationId, slug, agent })}
                        agentSlug={agent.slug}
                        agentName={agent.name}
                    />
                )}
            </div>
        </main>
    );
}
