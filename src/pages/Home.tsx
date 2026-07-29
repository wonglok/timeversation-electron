// ============================================================================
// Home page — Timeversation landing / introduction
// ============================================================================

import { useNavigate } from "react-router-dom";

// ============================================================================
// SVG Icons
// ============================================================================

function LogoIcon() {
    return (
        <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--tiffany)]"
        >
            {/* Hourglass shape — conversations creating working hours */}
            <path d="M14 4h20M14 44h20M16 4v10a8 8 0 0 0 8 8h0a8 8 0 0 0 8-8V4" />
            <path d="M16 44V34a8 8 0 0 1 8-8h0a8 8 0 0 1 8 8v10" />
            {/* Flow lines connecting both halves */}
            <path d="M24 22v4" opacity={0.5} />
            <path d="M20 24h8" opacity={0.3} />
        </svg>
    );
}

function ArrowRightIcon() {
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
            <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
    );
}

function ChatLinesIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}

function LayersIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
        </svg>
    );
}

function ClockIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
        </svg>
    );
}

// ============================================================================
// Component
// ============================================================================

export function Home() {
    const navigate = useNavigate();

    return (
        <main className="flex flex-col items-center px-6 pt-20 pb-16 min-h-screen bg-[var(--bg-canvas)]">
            {/* ---- Hero ---- */}
            <section className="flex flex-col items-center text-center max-w-[560px] gap-4 reveal-1">
                {/* Logo */}
                <div className="mb-2">
                    <LogoIcon />
                </div>

                {/* Title */}
                <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)] m-0">
                    Timeversation
                </h1>

                {/* Tagline */}
                <p className="text-[15px] text-[var(--text-dim)] leading-relaxed max-w-[420px] m-0">
                    Conversations that create working hours.
                </p>

                {/* Description */}
                <p className="text-[12px] text-[var(--text-dim)] leading-relaxed max-w-[380px] m-0 mt-1">
                    A desktop workspace for coding agents — track conversations,
                    manage multiple AI assistants, and turn dialogue into
                    productive work sessions.
                </p>
            </section>

            {/* ---- Feature highlights ---- */}
            <section className="flex flex-wrap justify-center gap-4 mt-12 max-w-[560px] reveal-2">
                {[
                    {
                        icon: <ChatLinesIcon />,
                        label: "Multi-agent",
                        desc: "Claude Code, Codex, Kimi, and more — all in one place.",
                    },
                    {
                        icon: <LayersIcon />,
                        label: "Conversation tracking",
                        desc: "Every session saved, searchable, and organized by agent.",
                    },
                    {
                        icon: <ClockIcon />,
                        label: "Local or remote",
                        desc: "Use installed CLI agents or run a local LLM on your machine.",
                    },
                ].map((f) => (
                    <div
                        key={f.label}
                        className="flex flex-col items-center text-center gap-1.5 px-4 py-3 w-[160px]"
                    >
                        <span className="text-[var(--tiffany)]">{f.icon}</span>
                        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                            {f.label}
                        </span>
                        <span className="text-[10px] text-[var(--text-dim)] leading-relaxed">
                            {f.desc}
                        </span>
                    </div>
                ))}
            </section>

            {/* ---- CTA ---- */}
            <section className="mt-12 reveal-3">
                <button
                    className="btn-primary text-[14px] px-6 py-3 gap-2"
                    onClick={() => navigate("/menu")}
                >
                    Get Started
                    <ArrowRightIcon />
                </button>
            </section>

            {/* ---- Footer ---- */}
            <p className="mt-10 text-[10px] text-[var(--text-dim)]">
                Reuse paid agents or run local models for your creative
                workflow.
            </p>
        </main>
    );
}
