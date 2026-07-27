import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { BUILTIN_AGENTS, type AgentDefinition } from "./byoa.ts";

// ============================================================================
// Types
// ============================================================================

export interface ChatRequest {
    /** Binary agent name to run (e.g. "claude", "codex") */
    agentName: string;
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
/**
 * Look up an agent by display name in the built-in registry and return its
 * definition plus the binary command to spawn.  Returns `null` if the name
 * doesn't match a known agent.
 */
function resolveAgent(agentName: string): {
    definition: AgentDefinition;
    command: string;
} | null {
    const nameLower = agentName.toLowerCase();
    const def = BUILTIN_AGENTS.find(
        (a) => a.name.toLowerCase() === nameLower,
    );
    if (!def || def.commands.length === 0) return null;
    return { definition: def, command: def.commands[0]! };
}

export async function* chatStream(req: ChatRequest): AsyncGenerator<ChatChunk> {
    const { agentName, prompt, cwd, timeout = 120_000, signal } = req;

    if (signal?.aborted) return;

    // --- Validate agentName against known registry ---
    const resolved = resolveAgent(agentName);
    if (!resolved) {
        yield {
            text: `[Error] Unknown agent: "${agentName}". It is not in the recognized agent registry.`,
            stream: "stderr",
        };
        return;
    }
    const { command } = resolved;

    const events = new EventEmitter();
    const chunks: ChatChunk[] = [];
    let done = false;
    let error: Error | undefined;

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

    // Ensure workspace sessions directory exists
    const tempFolder = app.getPath("temp");
    const workspace = `${tempFolder}/sessions`;

    try {
        mkdirSync(workspace, { recursive: true });
    } catch (err) {
        yield {
            text: `[Error] Failed to create workspace directory: ${(err as Error).message}`,
            stream: "stderr",
        };
        return;
    }

    let child: ChildProcess;

    try {
        child = spawn(
            command,
            ["-p", prompt, "--dangerously-skip-permissions"],
            {
                cwd: cwd ?? workspace,
                stdio: ["ignore", "pipe", "pipe"],
                env: { ...process.env },
                timeout,
                signal,
            },
        );
    } catch (err) {
        yield {
            text: `[Error] Failed to spawn ${command}: ${(err as Error).message}`,
            stream: "stderr",
        };
        return;
    }

    // --- Register event handlers ---

    child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        console.log(`[${command}:stdout]`, text);
        push({ text, stream: "stdout" });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        console.log(`[${command}:stderr]`, text);
        push({ text, stream: "stderr" });
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
            finish(); // must signal done so the generator exits
        } else if (code === "ETIMEDOUT" || code === "ABORT_ERR") {
            push({
                text: `[Error] ${command} timed out after ${timeout / 1000}s`,
                stream: "stderr",
            });
            finish(); // must signal done so the generator exits
        } else {
            fail(err);
        }
    });

    // --- Yield chunks as they arrive ---

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

    // --- Report fatal error ---

    if (error) {
        yield {
            text: `[Error] ${error.message}`,
            stream: "stderr",
        };
    }

    // --- Cleanup ---

    if (child && !child.killed) {
        child.kill("SIGKILL");
    }
}
