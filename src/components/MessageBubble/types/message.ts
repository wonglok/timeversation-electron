// ============================================================================
// UI message model — the shape used by React components to render bubbles.
// ============================================================================

import type { AcpUsage } from "./acp";

// ---- Simple two-role message (used by Chat.tsx for generic agents) ----

export interface SimpleMessage {
    role: "user" | "agent";
    content: string;
}

// ---- Rich bubble kinds (used by ClaudeChat.tsx for ACP agents) ----

export type BubbleKind =
    | "user"
    | "text"
    | "thinking"
    | "tool_use"
    | "system"
    | "result";

/** A single rendered bubble in the chat. */
export interface Bubble {
    /** Unique identifier for React keys. */
    id: string;
    /** Which visual treatment to use. */
    kind: BubbleKind;
    /**
     * Conversation turn this bubble belongs to.
     * All bubbles from the same send → reply cycle share the same groupId.
     */
    groupId: string;
    // -- text / thinking content --
    text?: string;
    // -- tool_use --
    toolName?: string;
    toolInput?: Record<string, unknown>;
    // -- result footer --
    usage?: AcpUsage;
    cost?: number;
    durationMs?: number;
    // -- system pill --
    systemSubtype?: string;
    systemDetail?: string;
}

// ---- Grouped bubbles (one group per conversation turn) ----

export interface BubbleGroup {
    id: string;
    bubbles: Bubble[];
    resultFooter?: {
        usage?: AcpUsage;
        cost?: number;
        durationMs?: number;
    };
}
