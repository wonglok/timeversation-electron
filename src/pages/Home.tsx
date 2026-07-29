// ============================================================================
// Home page — agent launcher dashboard
// ============================================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BUILTIN_AGENTS,
    getAgentDetectionPayload,
} from "../store/BUILTIN_AGENTS";

const API_BASE = "http://localhost:8390";

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

function ChevronRightIcon() {
    return (
        <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M9 18l6-6-6-6" />
        </svg>
    );
}

function InstalledDot() {
    return (
        <svg width="6" height="6" viewBox="0 0 6 6">
            <circle cx="3" cy="3" r="3" fill="currentColor" />
        </svg>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Home() {
    const navigate = useNavigate();
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

    const installedCount =
        Object.values(installed).filter(Boolean).length;

    return (
        <main className="flex flex-col items-center px-6 pt-20 pb-16 min-h-screen bg-[var(--bg-canvas)]">
            {/* ---- Hero ---- */}
            <section className="flex flex-col items-center text-center max-w-[560px] gap-3">
                {/* Title */}
                <h1 className="text-[24px] font-bold tracking-[-0.02em] text-[var(--text-primary)] m-0">
                    Timeversation
                </h1>

                {/* Subtitle */}
                <p className="text-[13px] text-[var(--text-dim)] leading-relaxed max-w-[380px] m-0">
                    Conversations that create working hours.
                </p>
            </section>

            {/* ---- Agent Grid ---- */}
            <section className="flex flex-col items-center gap-4 mt-12 max-w-[680px] w-full">
                {/* Section label — Photoshop panel-header style */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-dim)]">
                        Available agents
                    </span>
                    <span className="text-[10px] text-[var(--text-dim)] tabular-nums">
                        {installedCount}/{BUILTIN_AGENTS.length} installed
                    </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 w-full">
                    {BUILTIN_AGENTS.map((agent) => {
                        const IconComponent = agent.icon;
                        const isInstalled = installed[agent.slug];
                        const isDark = agent.iconBg === "dark";

                        return (
                            <div
                                key={agent.slug}
                                title={
                                    isInstalled
                                        ? `Open chat with ${agent.name}`
                                        : `${agent.name} — ${agent.description}`
                                }
                                onClick={
                                    isInstalled
                                        ? () => {
                                              navigate(
                                                  `/chat/${agent.slug}`,
                                              );
                                          }
                                        : undefined
                                }
                                className={`relative flex flex-col items-center gap-2 px-4 py-4 rounded-sm border transition-all duration-150 select-none ${
                                    isDark
                                        ? isInstalled
                                            ? "bg-[#1E2D3B] border-[#2D404F] cursor-pointer hover:border-[var(--tiffany)] hover:bg-[#233645] hover:shadow-sm"
                                            : "bg-[#1A2733] border-transparent cursor-default opacity-60"
                                        : isInstalled
                                            ? "bg-[var(--bg-surface)] border-[var(--border-panel)] cursor-pointer hover:border-[var(--tiffany)] hover:shadow-sm"
                                            : "bg-[var(--bg-panel)] border-transparent cursor-default opacity-60"
                                }`}
                            >
                                {/* Installed indicator */}
                                {isInstalled && (
                                    <span
                                        className="absolute top-2 right-2 text-[var(--tiffany)]"
                                        title="Installed"
                                    >
                                        <InstalledDot />
                                    </span>
                                )}

                                {/* Icon */}
                                {IconComponent ? (
                                    <IconComponent
                                        size={isInstalled ? 36 : 32}
                                    />
                                ) : (
                                    <div className="w-9 h-9 rounded-sm bg-[var(--border-subtle)]" />
                                )}

                                {/* Name */}
                                <span
                                    className={`text-[12px] font-semibold leading-tight text-center ${
                                        isDark
                                            ? "text-[#E8ECF0]"
                                            : "text-[var(--text-primary)]"
                                    }`}
                                >
                                    {agent.name}
                                </span>

                                {/* CLI name — mono pill */}
                                <span
                                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm leading-none ${
                                        isDark
                                            ? "text-[#8CA0B0] bg-[#16232F]"
                                            : "text-[var(--text-dim)] bg-[var(--bg-panel)]"
                                    }`}
                                >
                                    {agent.cliName}
                                </span>

                                {/* Hover hint */}
                                {isInstalled && (
                                    <span className="hidden absolute bottom-2 right-2 text-[var(--tiffany)] opacity-0 group-hover:opacity-100 transition-opacity">
                                        <ChevronRightIcon />
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ---- Footer ---- */}
            <p className="mt-10 text-[10px] text-[var(--text-dim)]">
                All agents run locally on your machine.
            </p>
        </main>
    );
}
