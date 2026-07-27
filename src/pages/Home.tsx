// ============================================================================
// Home page
// ============================================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BUILTIN_AGENTS,
    getAgentDetectionPayload,
} from "../store/BUILTIN_AGENTS";

const API_BASE = "http://localhost:8390";

//

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

    return (
        <main className="flex flex-col items-center px-8 pt-16 pb-24 min-h-screen">
            {/* ---- Hero ---- */}
            <section className="flex flex-col items-center text-center max-w-[680px] gap-5 pt-8">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 text-[0.8rem] font-semibold text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-full backdrop-blur-[16px] reveal-1">
                    <span className="w-[7px] h-[7px] rounded-full bg-[var(--tiffany)] inline-block" />
                    use your already paid agent
                </div>

                {/* Title */}
                <h1 className="text-[clamp(2.8rem,7vw,4.5rem)] font-extrabold tracking-[-0.03em] leading-[1.1] m-0 reveal-2">
                    <span className="text-gradient">timeversation</span>
                </h1>

                {/* Subtitle */}
                <p className="text-[1.15rem] text-[var(--text-secondary)] leading-[1.7] max-w-[480px] m-0 reveal-3">
                    New kind of conversation that saves your time.
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
                                title={
                                    isInstalled
                                        ? `Open chat with ${agent.name}`
                                        : agent.description
                                }
                                onClick={
                                    isInstalled
                                        ? () => {
                                              navigate(`/chat/${agent.slug}`);
                                          }
                                        : undefined
                                }
                                className={`glass-card relative flex flex-col items-center gap-2.5 px-4 py-5 transition-all duration-300 ${
                                    isInstalled
                                        ? "cursor-pointer hover:-translate-y-0.5 hover:ring-2 hover:ring-[var(--tiffany-glow)]"
                                        : "opacity-50 cursor-default"
                                }`}
                            >
                                {/* Installed indicator */}
                                {isInstalled && (
                                    <span
                                        className="absolute top-2 right-2 w-[8px] h-[8px] rounded-full bg-lime-400 lime-pulse-dot"
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
        </main>
    );
}
