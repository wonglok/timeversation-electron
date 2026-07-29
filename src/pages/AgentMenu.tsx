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

function LoaderIcon({ size = 16 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-spin text-[var(--text-dim)]"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
}

// Skeleton placeholder card shown while agents are being detected
function SkeletonCard() {
    return (
        <div className="flex flex-col items-center gap-2 px-4 py-4 rounded-sm border border-transparent bg-[var(--bg-panel)] animate-pulse">
            <div className="w-9 h-9 rounded-sm bg-[var(--border-subtle)]" />
            <div className="w-16 h-3 rounded-sm bg-[var(--border-subtle)]" />
            <div className="w-12 h-2.5 rounded-sm bg-[var(--border-subtle)]" />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentMenu() {
    const navigate = useNavigate();
    const [installed, setInstalled] = useState<Record<string, boolean>>({});
    const [checking, setChecking] = useState(true);

    const checkInstalled = () => {
        setChecking(true);
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
            })
            .finally(() => {
                setChecking(false);
            });
    };

    useEffect(() => {
        checkInstalled();
    }, []);

    const installedCount = Object.values(installed).filter(Boolean).length;
    const agentList = BUILTIN_AGENTS.filter((r) => r.slug !== "local");

    return (
        <main className="flex flex-col items-center px-6 pt-12 pb-16 min-h-screen bg-[var(--bg-canvas)]">
            {/* ---- Back link ---- */}
            <div className="w-full max-w-[680px] mb-6">
                <button
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
                    onClick={() => navigate("/")}
                >
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
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>
            </div>

            {/* ---- Hero ---- */}
            <section className="flex flex-col items-center text-center max-w-[560px] gap-3">
                {/* Title */}
                <h1 className="text-[24px] font-bold tracking-[-0.02em] text-[var(--text-primary)] m-0">
                    Pick an Agent
                </h1>

                {/* Subtitle */}
                <p className="text-[13px] text-[var(--text-dim)] leading-relaxed max-w-[380px] m-0">
                    Timeversation can resue locally installed agent, so that you
                    dont have to buy a new plan.
                </p>
            </section>

            {/* ---- Agent Grid ---- */}
            <section className="flex flex-col items-center gap-4 mt-12 max-w-[680px] w-full">
                {/* Section label — Photoshop panel-header style */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-dim)]">
                        Available agents
                    </span>
                    {checking ? (
                        <LoaderIcon size={12} />
                    ) : (
                        <span className="text-[10px] text-[var(--text-dim)] tabular-nums">
                            {installedCount}/{agentList.length} installed
                        </span>
                    )}
                    <button
                        className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Refresh agent status"
                        onClick={checkInstalled}
                        disabled={checking}
                    >
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={checking ? "animate-spin" : ""}
                        >
                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                        </svg>
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 w-full">
                    {checking
                        ? Array.from({ length: agentList.length }).map((_, i) => (
                              <SkeletonCard key={i} />
                          ))
                        : agentList.map((agent) => {
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
                                    {/* Status indicator */}
                                    {isInstalled ? (
                                        <span
                                            className="absolute top-2 right-2 text-[var(--tiffany)]"
                                            title="Installed"
                                        >
                                            <InstalledDot />
                                        </span>
                                    ) : null}

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
                        },
                    )}
                </div>
            </section>

            {/* ---- Local AI Section ---- */}
            <section className="flex flex-col items-center gap-4 mt-10 max-w-[680px] w-full">
                {/* Section label */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-dim)]">
                        Local AI
                    </span>
                </div>

                {/* Local LLM card */}
                <div
                    className="glass-card flex items-center gap-4 px-5 py-4 w-full cursor-pointer hover:border-[var(--tiffany-soft)] transition-colors group"
                    onClick={() => navigate("/setup")}
                >
                    {/* Icon */}
                    <div className="shrink-0 text-[var(--tiffany)]">
                        <svg
                            width="36"
                            height="36"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            {/* CPU chip body */}
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            {/* Pins */}
                            <path d="M8 1v2M16 1v2M8 21v2M16 21v2M21 8h2M21 16h2M1 8h2M1 16h2" />
                            {/* Inner brain/neural pattern */}
                            <circle cx="9" cy="10" r="1.5" />
                            <circle cx="15" cy="10" r="1.5" />
                            <circle cx="12" cy="15" r="1.5" />
                            <path d="M9 10l3 5 3-5" opacity={0.6} />
                            {/* Signal waves */}
                            <path
                                d="M18 8v1M18 15v1M20 7v3M20 14v3"
                                opacity={0.4}
                            />
                        </svg>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                            Local LLM Setup
                        </span>
                        <span className="block text-[10px] text-[var(--text-dim)] font-mono mt-0.5">
                            node-llama-cpp
                        </span>
                    </div>

                    {/* Arrow hint */}
                    <span className="shrink-0 text-[var(--text-dim)] group-hover:text-[var(--tiffany)] transition-colors">
                        <ChevronRightIcon />
                    </span>
                </div>
            </section>

            {/* ---- Footer ---- */}
            <p className="mt-10 text-[10px] text-[var(--text-dim)]">
                All agents run locally on your machine.
            </p>
        </main>
    );
}
