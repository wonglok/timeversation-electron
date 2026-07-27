import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

// ============================================================================
// Types
// ============================================================================

export interface ChatRequest {
	/** Binary command to run (e.g. "claude", "codex") */
	command: string;
	/** The user prompt to send */
	prompt: string;
	/** Working directory for the agent process */
	cwd?: string;
	/** Timeout in ms (default: 120_000) */
	timeout?: number;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
}

export interface ChatChunk {
	/** Text content of this chunk */
	text: string;
	/** Which stream produced this chunk */
	stream: "stdout" | "stderr";
}

// ============================================================================
// Chat stream — async generator
// ============================================================================

/**
 * Spawn a CLI coding agent with a one-shot prompt and yield stdout/stderr
 * chunks as they arrive.  Suitable for piping into an SSE response.
 *
 * Uses `-p <prompt>` argument (covers claude, kilocode, codex, etc.).
 */
export async function* chatStream(
	req: ChatRequest,
): AsyncGenerator<ChatChunk> {
	const { command, prompt, cwd, timeout = 120_000, signal } = req;

	if (signal?.aborted) return;

	const events = new EventEmitter();
	const chunks: ChatChunk[] = [];
	let done = false;
	let error: Error | undefined;
	let resolved = false;

	const push = (chunk: ChatChunk) => {
		chunks.push(chunk);
		events.emit("chunk");
	};

	const finish = () => {
		done = true;
		events.emit("chunk");
	};

	const fail = (err: Error) => {
		error = err;
		done = true;
		events.emit("chunk");
	};

	let child: ChildProcess;

	try {
		child = spawn(command, ["-p", prompt], {
			cwd: cwd ?? process.cwd(),
			stdio: ["ignore", "pipe", "pipe"],
			timeout,
			signal,
		});
	} catch (err) {
		yield {
			text: `[Error] Failed to spawn ${command}: ${(err as Error).message}`,
			stream: "stderr",
		};
		return;
	}

	child.stdout?.on("data", (chunk: Buffer) => {
		push({ text: chunk.toString(), stream: "stdout" });
	});

	child.stderr?.on("data", (chunk: Buffer) => {
		push({ text: chunk.toString(), stream: "stderr" });
	});

	child.on("close", (_code, _sig) => {
		finish();
	});

	child.on("error", (err: Error & { code?: string }) => {
		const code = err.code;
		if (code === "ENOENT") {
			push({
				text: `[Error] Command not found: ${command}. Is it installed and in your PATH?`,
				stream: "stderr",
			});
		} else if (code === "ETIMEDOUT" || code === "ABORT_ERR") {
			push({
				text: `[Error] ${command} timed out after ${timeout / 1000}s`,
				stream: "stderr",
			});
		} else {
			fail(err);
		}
	});

	// Yield chunks as they arrive
	while (!done || chunks.length > 0) {
		if (chunks.length > 0) {
			yield chunks.shift()!;
		} else if (!done) {
			// Wait for next chunk or completion
			await new Promise<void>((r) => {
				events.once("chunk", r);
			});
		}
	}

	if (error) {
		yield {
			text: `[Error] ${error.message}`,
			stream: "stderr",
		};
	}

	// Cleanup
	if (!child.killed) {
		child.kill("SIGKILL");
	}
}
