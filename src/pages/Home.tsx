import { Icon } from "../components/icons.tsx";
import type { IconName } from "../components/icons.tsx";

// ============================================================================
// Data
// ============================================================================

const AGENT_ICONS: { icon: IconName; name: string }[] = [
    { icon: "claude", name: "Claude Code" },
    { icon: "codex", name: "Codex" },
    { icon: "kilocode", name: "Kilo Code" },
    { icon: "qwen", name: "Qwen Code" },
    { icon: "opencode", name: "OpenCode" },
    { icon: "kimi", name: "Kimi Code" },
    { icon: "pi", name: "Pi Agent" },
    { icon: "cline", name: "Cline" },
    { icon: "copilot", name: "Copilot" },
    { icon: "gemini", name: "Gemini CLI" },
];

// ============================================================================
// Home page
// ============================================================================

export function Home() {
    return (
        <main style={styles.root}>
            {/* ---- Hero ---- */}
            <section style={styles.hero}>
                {/* Badge */}
                <div style={styles.badge} className="reveal-1">
                    <span style={styles.badgeDot} />
                    Conversational AI Agent Hub
                </div>

                {/* Title */}
                <h1 style={styles.title} className="reveal-2">
                    <span className="text-gradient">timeversation</span>
                </h1>

                {/* Subtitle */}
                <p style={styles.subtitle} className="reveal-3">
                    All your CLI coding agents, unified in one conversation.
                    <br />
                    Stop switching terminals. Start shipping faster.
                </p>

                {/* Agent icon row */}
                <div style={styles.agentRow} className="reveal-3">
                    {AGENT_ICONS.map((a) => (
                        <span
                            key={a.name}
                            style={styles.agentIcon}
                            title={a.name}
                        >
                            <Icon name={a.icon} size="1.5rem" />
                        </span>
                    ))}
                </div>
            </section>
        </main>
    );
}

// ============================================================================
// Inline styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
    root: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "4rem 2rem 6rem",
        minHeight: "100vh",
        boxSizing: "border-box",
    },

    /* Hero */
    hero: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        maxWidth: 680,
        gap: "1.25rem",
        paddingTop: "2rem",
    },

    badge: {
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.35rem 1rem",
        fontSize: "0.8rem",
        fontWeight: 600,
        color: "var(--text-secondary)",
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 999,
        backdropFilter: "blur(16px)",
    },

    badgeDot: {
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: "var(--success)",
        display: "inline-block",
    },

    title: {
        fontSize: "clamp(2.8rem, 7vw, 4.5rem)",
        fontWeight: 800,
        letterSpacing: "-0.03em",
        lineHeight: 1.1,
        margin: 0,
    },

    subtitle: {
        fontSize: "1.15rem",
        color: "var(--text-secondary)",
        lineHeight: 1.7,
        maxWidth: 480,
        margin: 0,
    },

    /* Agent row */
    agentRow: {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0.45rem",
        maxWidth: 520,
    },

    agentIcon: {
        padding: "0.35rem",
        cursor: "default",
        transition: "transform 0.2s",
    },

    /* CTA */
    ctaWrapper: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.6rem",
        marginTop: "0.75rem",
    },

    ctaButton: {
        fontSize: "1.05rem",
        padding: "0.85rem 2.5rem",
        borderRadius: 12,
    },

    ctaHint: {
        fontSize: "0.8rem",
        color: "var(--text-dim)",
        margin: 0,
    },

    /* Features */
    features: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: "1.25rem",
        maxWidth: 820,
        width: "100%",
        marginTop: "4.5rem",
    },

    featureCard: {
        padding: "1.75rem 1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
    },

    featureIcon: {
        display: "inline-flex",
    },

    featureTitle: {
        fontSize: "1.1rem",
        fontWeight: 700,
        margin: 0,
        color: "var(--text-primary)",
    },

    featureBody: {
        fontSize: "0.9rem",
        lineHeight: 1.65,
        color: "var(--text-secondary)",
        margin: 0,
    },

    /* Divider */
    divider: {
        width: "100%",
        maxWidth: 820,
        margin: "4rem 0 3rem",
    },

    /* Footer */
    footer: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1.25rem",
        textAlign: "center",
    },

    footerText: {
        fontSize: "1.3rem",
        fontWeight: 600,
        color: "var(--text-primary)",
        margin: 0,
    },
};
