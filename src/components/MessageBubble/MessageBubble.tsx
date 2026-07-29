// ============================================================================
// MessageBubble — reusable chat message components
//
// Two tiers:
//   MessageBubble    — simple { role, content } for generic CLI agents
//   AcpBubble        — rich ACP bubble dispatcher for Claude Code / Kimi etc.
// ============================================================================

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useState } from "react";
import type { SimpleMessage, Bubble, BubbleGroup, AcpUsage } from "./types";

// ============================================================================
// Helpers
// ============================================================================

function fmtTokens(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

function fmtCost(usd: number): string {
    if (usd >= 1) return `$${usd.toFixed(2)}`;
    return `${(usd * 100).toFixed(1)}c`;
}

function fmtDuration(ms: number): string {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
}

// ============================================================================
// Simple message bubble (Chat.tsx)
// ============================================================================

export function MessageBubble({ message }: { message: SimpleMessage }) {
    const isUser = message.role === "user";

    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
                className={`max-w-[85%] px-4 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser
                        ? "bg-[var(--tiffany)] text-white rounded-br-sm"
                        : "glass-card rounded-bl-sm text-[var(--text-primary)]"
                }`}
            >
                {message.content}
            </div>
        </div>
    );
}

// ============================================================================
// Loading indicator
// ============================================================================

export function LoadingBubble() {
    return (
        <div className="flex justify-start">
            <div className="glass-card px-4 py-2.5 rounded-xl rounded-bl-sm text-sm text-[var(--text-dim)]">
                <span className="loading-dot mr-1" />
                <span
                    className="loading-dot mr-1"
                    style={{ animationDelay: "0.15s" }}
                />
                <span
                    className="loading-dot"
                    style={{ animationDelay: "0.3s" }}
                />
            </div>
        </div>
    );
}

// ============================================================================
// Empty state
// ============================================================================

export function EmptyChat({
    title,
    subtitle,
}: {
    title: string;
    subtitle?: string;
}) {
    return (
        <div className="flex flex-col items-center gap-2 mt-16 text-center">
            <p className="text-[var(--text-dim)] text-sm">{title}</p>
            {subtitle && (
                <p className="text-[var(--text-dim)] text-xs">{subtitle}</p>
            )}
        </div>
    );
}

// ============================================================================
// Collapsible (shared by thinking & tool-use bubbles)
// ============================================================================

export function Collapsible({
    label,
    children,
    defaultOpen = false,
}: {
    label: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden text-xs w-full">
            <button
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer select-none"
                onClick={() => setOpen(!open)}
            >
                {/* Chevron icon */}
                <svg
                    className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="font-medium">{label}</span>
            </button>
            {open && (
                <div className="px-3 py-2 border-t border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {children}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// ACP bubble sub-types
// ============================================================================

/** Assistant text bubble (left-aligned glass card). */
export function TextBubble({ text }: { text: string }) {
    return (
        <div className="flex justify-start">
            <div className="max-w-[85%] px-4 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap glass-card rounded-bl-sm text-[var(--text-primary)]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {text}
                </ReactMarkdown>
            </div>
        </div>
    );
}

/** Collapsible thinking / reasoning bubble. */
export function ThinkingBubble({ text }: { text: string }) {
    return (
        <div className="flex justify-start max-w-[85%]">
            <Collapsible label="Thinking">{text}</Collapsible>
        </div>
    );
}

/** Collapsible tool-use bubble showing name + JSON input. */
export function ToolUseBubble({
    toolName,
    toolInput,
}: {
    toolName: string;
    toolInput?: Record<string, unknown>;
}) {
    return (
        <div className="flex justify-start max-w-[85%]">
            <Collapsible label={`Tool: ${toolName}`}>
                {toolInput ? JSON.stringify(toolInput, null, 2) : "(no input)"}
            </Collapsible>
        </div>
    );
}

/** Centered system pill (init, hook, error). */
export function SystemPill({
    label,
    detail,
}: {
    label: string;
    detail?: string;
}) {
    return (
        <div className="flex justify-center">
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.65rem] text-[var(--text-dim)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                <span className="font-medium">{label}</span>
                {detail && (
                    <span className="opacity-70 max-w-60 truncate">
                        {detail}
                    </span>
                )}
            </div>
        </div>
    );
}

/** Result footer — token usage, cost, duration. */
export function ResultFooter({
    usage,
    cost,
    durationMs,
}: {
    usage?: AcpUsage;
    cost?: number;
    durationMs?: number;
}) {
    const parts: string[] = [];
    if (usage) {
        parts.push(`${fmtTokens(usage.input_tokens)} in`);
        parts.push(`${fmtTokens(usage.output_tokens)} out`);
    }
    if (cost !== undefined) parts.push(fmtCost(cost));
    if (durationMs !== undefined) parts.push(fmtDuration(durationMs));

    if (!parts.length) return null;

    return (
        <div className="flex justify-center mt-1">
            <span className="text-[0.6rem] text-[var(--text-dim)] tracking-wide uppercase">
                {parts.join(" · ")}
            </span>
        </div>
    );
}

// ============================================================================
// ACP bubble dispatcher — renders any Bubble.kind
// ============================================================================

export function AcpBubble({ bubble }: { bubble: Bubble }) {
    switch (bubble.kind) {
        case "user":
            return (
                <div className="flex justify-end">
                    <div className="max-w-[85%] px-4 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap bg-[var(--tiffany)] text-white rounded-br-sm">
                        {bubble.text}
                    </div>
                </div>
            );

        case "text":
            return <TextBubble text={bubble.text ?? ""} />;

        case "thinking":
            return <ThinkingBubble text={bubble.text ?? ""} />;

        case "tool_use":
            return (
                <ToolUseBubble
                    toolName={bubble.toolName ?? "unknown"}
                    toolInput={bubble.toolInput}
                />
            );

        case "system":
            return (
                <SystemPill
                    label={
                        bubble.systemSubtype === "init"
                            ? "Session ready"
                            : bubble.systemSubtype === "error"
                              ? "Error"
                              : bubble.systemSubtype === "hook"
                                ? "Hook"
                                : "System"
                    }
                    detail={
                        bubble.systemSubtype === "error"
                            ? bubble.text
                            : bubble.systemDetail
                    }
                />
            );

        case "result":
            // Rendered as a group footer — invisible as standalone
            return null;

        default:
            return null;
    }
}

// ============================================================================
// Grouping — groups bubbles by groupId, extracts result footer
// ============================================================================

export function groupBubbles(bubbles: Bubble[]): BubbleGroup[] {
    const map = new Map<string, Bubble[]>();

    for (const b of bubbles) {
        const list = map.get(b.groupId);
        if (list) {
            list.push(b);
        } else {
            map.set(b.groupId, [b]);
        }
    }

    const groups: BubbleGroup[] = [];

    for (const [id, list] of map) {
        // Pull the result bubble out and use it as a footer
        const resultIdx = list.findIndex((b) => b.kind === "result");
        let resultFooter: BubbleGroup["resultFooter"];

        if (resultIdx >= 0) {
            const r = list[resultIdx]!;
            resultFooter = {
                usage: r.usage,
                cost: r.cost,
                durationMs: r.durationMs,
            };
            list.splice(resultIdx, 1);
        }

        if (list.length > 0 || resultFooter) {
            groups.push({ id, bubbles: list, resultFooter });
        }
    }

    return groups;
}
