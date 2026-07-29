// ============================================================================
// Conversations store — manages the conversation list from the JSON DB API
// ============================================================================

import { create } from "zustand";

const API_BASE = "http://localhost:8390";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Conversation {
    id: string;
    title: string;
    agentSlug: string;
    sessionId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ThreadMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
}

interface ConversationsState {
    conversations: Conversation[];
    activeId: string | null;
    loading: boolean;

    // Actions
    fetchConversations: () => Promise<void>;
    createConversation: (params: {
        agentSlug: string;
        title?: string;
    }) => Promise<Conversation | null>;
    renameConversation: (
        id: string,
        title: string,
    ) => Promise<Conversation | null>;
    deleteConversation: (id: string) => Promise<void>;
    setActiveId: (id: string | null) => void;
    fetchThread: (conversationId: string) => Promise<ThreadMessage[]>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useConversationsStore = create<ConversationsState>((set, get) => ({
    conversations: [],
    activeId: null,
    loading: false,

    fetchConversations: async () => {
        set({ loading: true });
        try {
            const res = await fetch(`${API_BASE}/api/conversations`, {
                mode: "cors",
            });
            if (!res.ok) return;
            const data: Conversation[] = await res.json();
            set({ conversations: data, loading: false });
        } catch {
            set({ loading: false });
        }
    },

    createConversation: async ({ agentSlug, title }) => {
        try {
            const res = await fetch(`${API_BASE}/api/conversations`, {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentSlug, title }),
            });
            if (!res.ok) return null;
            const conv: Conversation = await res.json();
            set((s) => ({
                conversations: [conv, ...s.conversations],
                activeId: conv.id,
            }));
            return conv;
        } catch {
            return null;
        }
    },

    renameConversation: async (id, title) => {
        try {
            const res = await fetch(
                `${API_BASE}/api/conversations/${id}`,
                {
                    method: "PATCH",
                    mode: "cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title }),
                },
            );
            if (!res.ok) return null;
            const updated: Conversation = await res.json();
            set((s) => ({
                conversations: s.conversations.map((c) =>
                    c.id === id ? updated : c,
                ),
            }));
            return updated;
        } catch {
            return null;
        }
    },

    deleteConversation: async (id) => {
        // Optimistic removal
        const prev = get().conversations;
        set((s) => ({
            conversations: s.conversations.filter((c) => c.id !== id),
            activeId: s.activeId === id ? null : s.activeId,
        }));
        try {
            const res = await fetch(`${API_BASE}/api/conversations/${id}`, {
                method: "DELETE",
                mode: "cors",
            });
            if (!res.ok) {
                // Rollback on failure
                set({ conversations: prev });
            }
        } catch {
            set({ conversations: prev });
        }
    },

    setActiveId: (id) => {
        set({ activeId: id });
    },

    fetchThread: async (conversationId) => {
        try {
            const res = await fetch(
                `${API_BASE}/api/conversations/${conversationId}/thread`,
                { mode: "cors" },
            );
            if (!res.ok) return [];
            return await res.json();
        } catch {
            return [];
        }
    },
}));
