// ============================================================================
// Home page
// ============================================================================

import { useEffect, useState } from "react";
import {
    BUILTIN_AGENTS,
    getAgentDetectionPayload,
} from "../store/BUILTIN_AGENTS";

const API_BASE = "http://localhost:8390";

export function Home() {
    const [installed, setInstalled] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const payload = getAgentDetectionPayload();
        fetch(`${API_BASE}/api/agents/detect`, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agents: payload }),
        })
            .then((res) => res.json())
            .then((data: { installed: Record<string, boolean> }) => {
                setInstalled(data.installed ?? {});
            })
            .catch(() => {
                // Server not available — no dots shown
            });
    }, []);

    return (
        <main className="flex flex-col items-center px-8 pt-16 pb-24 min-h-screen">
            {/* ---- Hero ---- */}
            <section className="flex flex-col items-center text-center max-w-[680px] gap-5 pt-8">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 text-[0.8rem] font-semibold text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-full backdrop-blur-[16px] reveal-1">
                    <span className="w-[7px] h-[7px] rounded-full bg-[var(--success)] inline-block" />
                    Conversational AI Agent Hub
                </div>

                {/* Title */}
                <h1 className="text-[clamp(2.8rem,7vw,4.5rem)] font-extrabold tracking-[-0.03em] leading-[1.1] m-0 reveal-2">
                    <span className="text-gradient">timeversation</span>
                </h1>

                {/* Subtitle */}
                <p className="text-[1.15rem] text-[var(--text-secondary)] leading-[1.7] max-w-[480px] m-0 reveal-3">
                    All your CLI coding agents, unified in one conversation.
                    <br />
                    Stop switching terminals. Start shipping faster.
                </p>
            </section>

            {/* ---- Agent Icons ---- */}
            <section className="flex flex-col items-center gap-6 mt-14 max-w-[720px] w-full reveal-4">
                <h2 className="text-[0.85rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-dim)] m-0">
                    Supported Agents
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 w-full">
                    {BUILTIN_AGENTS.map((agent) => {
                        const IconComponent = agent.icon;
                        const isInstalled = installed[agent.slug];
                        return (
                            <div
                                key={agent.slug}
                                title={agent.description}
                                className="glass-card relative flex flex-col items-center gap-2.5 px-4 py-5 transition-all duration-300 hover:-translate-y-0.5"
                            >
                                {/* Installed indicator */}
                                {isInstalled && (
                                    <span
                                        className="absolute top-2 right-2 w-[8px] h-[8px] rounded-full bg-[var(--success)] animate-pulse"
                                        title="Installed"
                                    />
                                )}

                                {IconComponent ? (
                                    <IconComponent size={40} />
                                ) : (
                                    <div className="w-10 h-10 rounded-lg bg-[var(--border-subtle)]" />
                                )}
                                <span className="text-[0.8rem] font-semibold text-[var(--text-primary)] leading-tight text-center">
                                    {agent.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ---- Features ---- */}
            <section className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5 max-w-[820px] w-full mt-18">
                {FEATURES.map((f) => (
                    <div
                        key={f.title}
                        className="glass-card px-6 py-7 flex flex-col gap-3"
                    >
                        <span className="inline-flex">{f.icon}</span>
                        <h3 className="text-[1.1rem] font-bold m-0 text-[var(--text-primary)]">
                            {f.title}
                        </h3>
                        <p className="text-[0.9rem] leading-[1.65] text-[var(--text-secondary)] m-0">
                            {f.body}
                        </p>
                    </div>
                ))}
            </section>
        </main>
    );
}

// ============================================================================
// Feature cards
// ============================================================================

const FEATURES = [
    {
        icon: (
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--primary)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
            </svg>
        ),
        title: "Multi-Agent Chat",
        body: "Talk to Claude Code, Codex, Qwen, Gemini CLI, and more — all in one unified conversation interface.",
    },
    {
        icon: (
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
            </svg>
        ),
        title: "Zero-Config Detection",
        body: "Auto-discovers installed agents on your system. No setup needed — just open and go.",
    },
    {
        icon: (
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--success)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
        ),
        title: "Local & Private",
        body: "Everything runs on your machine. Your code, prompts, and conversations never leave your computer.",
    },
];
