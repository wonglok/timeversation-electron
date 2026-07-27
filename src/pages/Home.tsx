import { useCallback } from "react";
import { Link } from "react-router-dom";
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
	{ icon: "handshake", name: "Aider" },
	{ icon: "gemini", name: "Gemini CLI" },
	{ icon: "cat", name: "Tabby" },
];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
	{
		icon: "sparkles",
		title: "Bring Your Own Agents",
		body: "Claude Code, Kilo Code, Codex, Qwen, Kimi, Pi — every CLI agent you already use, detected and ready in one place. No lock-in, no switching.",
	},
	{
		icon: "kilocode",
		title: "CLI at Your Fingertips",
		body: "Spawn any agent, pipe results between them, and orchestrate multi-agent workflows — all from a single conversational interface that feels native.",
	},
	{
		icon: "hourglass",
		title: "Save Hours Every Week",
		body: "Stop juggling terminals. One prompt reaches the right agent. Context flows across sessions. What used to take twenty minutes now takes one.",
	},
];

// ============================================================================
// Home page
// ============================================================================

export function Home() {
	const handleLogin = useCallback(() => {
		// Electron's windowOpenHandler catches this and opens in the default browser
		window.open("http://inter-site.com", "_blank");
	}, []);

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

				{/* CTA buttons */}
				<div style={styles.ctaWrapper} className="reveal-4">
					<Link to="/chat" className="btn-primary">
						<Icon name="sparkles" size="1.05rem" className="mr-1 inline-block" />
						Start Chatting
					</Link>
					<button
						type="button"
						className="btn-secondary"
						style={styles.ctaButton}
						onClick={handleLogin}
					>
						<Icon name="lock" size="1.05rem" className="mr-1 inline-block" />
						Login to Timversation
					</button>
					<p style={styles.ctaHint}>
						Connect your agents and pick up where you left off
					</p>
				</div>

				{/* Link to BYOA scanner */}
				<Link
					to="/agents"
					className="btn-secondary reveal-4"
				>
					See which agents are installed on your machine →
				</Link>
			</section>

			{/* ---- Features ---- */}
			<section style={styles.features}>
				{FEATURES.map((f, i) => (
					<div
						key={f.title}
						className={`glass-card reveal-${i + 1}`}
						style={styles.featureCard}
					>
						<span style={styles.featureIcon}>
							<Icon name={f.icon} size="2rem" />
						</span>
						<h3 style={styles.featureTitle}>{f.title}</h3>
						<p style={styles.featureBody}>{f.body}</p>
					</div>
				))}
			</section>

			{/* ---- Divider ---- */}
			<hr className="hr-glow" style={styles.divider} />

			{/* ---- Footer CTA ---- */}
			<footer style={styles.footer}>
				<p style={styles.footerText}>
					Ready to stop context-switching?
				</p>
				<button
					type="button"
					className="btn-primary"
					onClick={handleLogin}
				>
					Get Started — it's free
				</button>
			</footer>
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
