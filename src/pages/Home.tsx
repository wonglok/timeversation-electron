// ============================================================================
// Home page — Timeversation landing / introduction (2026 sizing)
// ============================================================================

import { useNavigate } from "react-router-dom";

// ============================================================================
// SVG Icons
// ============================================================================

function LogoIcon() {
    return (
        <svg
            width="56"
            height="56"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--tiffany)]"
        >
            <path d="M14 4h20M14 44h20M16 4v10a8 8 0 0 0 8 8h0a8 8 0 0 0 8-8V4" />
            <path d="M16 44V34a8 8 0 0 1 8-8h0a8 8 0 0 1 8 8v10" />
            <path d="M24 22v4" opacity={0.5} />
            <path d="M20 24h8" opacity={0.3} />
        </svg>
    );
}

function ArrowRightIcon() {
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
            <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
    );
}

function ChatLinesIcon() {
    return (
        <svg
            width="18"
            height="18"
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
            width="18"
            height="18"
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
            width="18"
            height="18"
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
        <main className="flex flex-col items-center px-6 pt-24 pb-20 min-h-screen bg-[var(--bg-canvas)]">
            {/* ---- Hero ---- */}
            <section className="flex flex-col items-center text-center max-w-[640px] gap-5 reveal-1">
                {/* Logo */}
                <div className="mb-3">
                    <LogoIcon />
                </div>

                {/* Title */}
                <h1 className="text-[36px] font-bold tracking-[-0.03em] text-[var(--text-primary)] m-0 leading-tight">
                    Timeversation
                </h1>

                {/* Tagline */}
                <p className="text-[16px] text-[var(--text-dim)] leading-relaxed max-w-[460px] m-0">
                    Conversations that create working hours.
                </p>

                {/* Description */}
                <p className="text-[14px] text-[var(--text-dim)] leading-relaxed max-w-[420px] m-0 mt-1">
                    A desktop workspace for coding agents — track conversations,
                    manage multiple AI assistants, and turn dialogue into
                    productive work sessions.
                </p>
            </section>

            {/* ---- Feature highlights ---- */}
            <section className="flex flex-wrap justify-center gap-5 mt-16 max-w-[640px] reveal-2">
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
                        className="flex flex-col items-center text-center gap-2 px-5 py-4 w-[176px]"
                    >
                        <span className="text-[var(--tiffany)]">{f.icon}</span>
                        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                            {f.label}
                        </span>
                        <span className="text-[11px] text-[var(--text-dim)] leading-relaxed">
                            {f.desc}
                        </span>
                    </div>
                ))}
            </section>

            {/* ---- CTA ---- */}
            <section className="mt-16 reveal-3">
                <button
                    className="btn-primary text-[15px] px-7 py-3.5 gap-2.5"
                    onClick={() => navigate("/menu")}
                >
                    Get Started
                    <ArrowRightIcon />
                </button>
            </section>

            {/* ---- Footer ---- */}
            <p className="mt-12 text-[11px] text-[var(--text-dim)]">
                Reuse paid agents or run local models for your creative
                workflow.
            </p>
        </main>
    );
}
