import { useEffect, useRef, useCallback } from "react";
import { useAgentsStore } from "../store/agents.ts";
import type { AgentResult } from "../store/agents.ts";
import { Icon, resolveIconName } from "../components/icons.tsx";

// ============================================================================
// Sub-components
// ============================================================================

function AgentCard({ result }: { result: AgentResult }) {
	const { agent, installed, version, binaryPath, error } = result;
	const iconName = resolveIconName(agent.icon);

	return (
		<div
			className={`glass-card flex flex-col gap-2.5 p-4 transition-opacity duration-300 ${
				installed ? "opacity-100" : "opacity-55"
			}`}
		>
			{/* Icon + name */}
			<div className="flex items-center gap-2.5">
				<Icon name={iconName} size="1.5rem" />
				<div>
					<div className="text-base font-bold text-[var(--text-primary)]">
						{agent.name}
					</div>
					{installed && version && (
						<div className="text-xs text-[var(--primary)] font-semibold mt-px">
							v{version}
						</div>
					)}
				</div>
			</div>

			{/* Status badge */}
			{installed ? (
				<span className="inline-flex items-center gap-1 self-start py-0.5 px-2 text-[0.7rem] font-bold text-emerald-700 bg-emerald-100/15 rounded">
					<Icon name="check-circle" size="0.75rem" />
					Installed
				</span>
			) : (
				<span
					className="inline-flex self-start py-0.5 px-2 text-[0.7rem] font-semibold text-[var(--text-dim)] bg-black/5 rounded"
					title={error}
				>
					Not found
				</span>
			)}

			{/* Binary path */}
			{installed && binaryPath && (
				<div className="text-[0.72rem] text-[var(--text-dim)]">
					<code>{binaryPath}</code>
				</div>
			)}
		</div>
	);
}

function ProgressBar({ checked, total }: { checked: number; total: number }) {
	const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

	return (
		<div className="flex w-full max-w-[520px] flex-col gap-2">
			<div className="flex justify-between">
				<span className="text-xs text-[var(--text-secondary)] font-medium">
					Scanning… {checked} / {total}
				</span>
				<span className="text-xs text-[var(--primary)] font-bold">
					{pct}%
				</span>
			</div>
			<div className="progress-bar h-[5px]">
				<div
					className="progress-bar-fill"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center text-center max-w-[400px] mt-12 gap-3">
			<Icon name="search" size="2.5rem" className="text-[var(--text-dim)]" />
			<p className="text-lg font-bold text-[var(--text-primary)] m-0">
				Discover your installed agents
			</p>
			<p className="text-base text-[var(--text-secondary)] leading-relaxed m-0">
				Hit <strong>Scan for Agents</strong> to detect every CLI coding
				agent on your system — Claude Code, Kilo Code, Codex, Qwen,
				Kimi, Pi, and more. Results stream in live.
			</p>
		</div>
	);
}

// ============================================================================
// Agents page
// ============================================================================

export function Agents() {
	const { status, results, checked, total, error, startScan, reset } =
		useAgentsStore();

	const controllerRef = useRef<AbortController | null>(null);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			controllerRef.current?.abort();
		};
	}, []);

	const handleScan = useCallback(() => {
		// Abort any in-flight scan
		controllerRef.current?.abort();
		controllerRef.current = startScan();
	}, [startScan]);

	const handleCancel = useCallback(() => {
		controllerRef.current?.abort();
		reset();
	}, [reset]);

	const isScanning = status === "scanning";
	const installed = results.filter((r) => r.installed);
	const missing = results.filter((r) => !r.installed);

	return (
		<main className="flex flex-col items-center min-h-screen pt-12 px-8 pb-20 box-border">
			{/* ---- Hero ---- */}
			<section className="flex flex-col items-center text-center max-w-[640px] gap-4 pt-4">
				<div className="reveal-1 inline-flex items-center gap-2 py-1 px-4 text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-full backdrop-blur-2xl">
					<span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
					BYOA &middot; Bring Your Own Agent
				</div>

				<h1 className="reveal-2 text-[clamp(2rem,5.5vw,3.2rem)] font-extrabold tracking-[-0.03em] leading-tight m-0">
					<span className="text-gradient">Your Agents,</span>
					<br />
					One Conversation
				</h1>

				<p className="reveal-3 text-lg text-[var(--text-secondary)] leading-relaxed max-w-[440px] m-0">
					Detect every CLI coding agent installed on your machine.
					<br />
					All of them ready at your fingertips — no lock-in.
				</p>

				{/* Action buttons */}
				<div className="reveal-4 flex gap-3 mt-2">
					{isScanning ? (
						<button
							type="button"
							className="btn-secondary"
							onClick={handleCancel}
						>
							Cancel scan
						</button>
					) : (
						<>
							<button
								type="button"
								className="btn-primary"
								onClick={handleScan}
							>
								<Icon name="search" size="1rem" className="mr-1 inline-block" />
								Scan for Agents
							</button>
							{status === "done" && (
								<button
									type="button"
									className="btn-secondary"
									onClick={handleScan}
								>
									Rescan
								</button>
							)}
						</>
					)}
				</div>
			</section>

			{/* ---- Error ---- */}
			{status === "error" && error && (
				<div className="mt-6 py-3 px-5 text-sm text-amber-900 bg-amber-100/15 border border-amber-300/25 rounded-[10px] max-w-[520px] text-center flex items-center gap-2">
					<Icon name="alert-triangle" size="1rem" className="shrink-0" />
					{error}
				</div>
			)}

			{/* ---- Progress ---- */}
			{isScanning && (
				<section className="w-full max-w-[820px] mt-10">
					<ProgressBar checked={checked} total={total || 18} />
				</section>
			)}

			{/* ---- Live results during scan ---- */}
			{isScanning && results.length > 0 && (
				<section className="w-full max-w-[820px] mt-10">
					<h2 className="flex items-center gap-2 text-lg font-bold mb-4 text-[var(--text-primary)]">
						Found {installed.length} agent
						{installed.length !== 1 ? "s" : ""} so far…
					</h2>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
						{results.map((r) => (
							<AgentCard key={r.agent.name} result={r} />
						))}
					</div>
				</section>
			)}

			{/* ---- Results (done) ---- */}
			{status === "done" && results.length > 0 && (
				<>
					{/* Installed */}
					{installed.length > 0 && (
						<section className="w-full max-w-[820px] mt-10">
							<h2 className="flex items-center gap-2 text-lg font-bold mb-4 text-[var(--text-primary)]">
								<Icon name="check-circle" size="1.15rem" />
								Installed ({installed.length})
							</h2>
							<div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
								{installed.map((r) => (
									<AgentCard key={r.agent.name} result={r} />
								))}
							</div>
						</section>
					)}

					{/* Not found */}
					{missing.length > 0 && (
						<section className="w-full max-w-[820px] mt-10">
							<h2 className="text-lg font-bold mb-4 text-[var(--text-dim)]">
								Not found ({missing.length})
							</h2>
							<div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
								{missing.map((r) => (
									<AgentCard key={r.agent.name} result={r} />
								))}
							</div>
						</section>
					)}
				</>
			)}

			{/* ---- Empty state ---- */}
			{status === "idle" && <EmptyState />}
		</main>
	);
}
