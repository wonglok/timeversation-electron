import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { BUILTIN_AGENTS, type AgentDefinition } from "./byoa.ts";

// ============================================================================
// Types
// ============================================================================

export interface ChatChunk {
    /** Text content of this chunk */
    text: string;
    /** Which stream produced this chunk */
    stream: "stdout" | "stderr";
}

export interface ChatCallbacks {
    /** Called for each chunk of stdout/stderr output */
    onChunk: (chunk: ChatChunk) => void;
    /** Called when a fatal error occurs (process won't produce more output) */
    onError: (error: Error) => void;
    /** Called when the process has exited and all output has been delivered */
    onDone: () => void;
}

// ============================================================================
// Agent resolution
// ============================================================================

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
    const def = BUILTIN_AGENTS.find((a) => a.name.toLowerCase() === nameLower);
    if (!def || def.commands.length === 0) return null;
    return { definition: def, command: def.commands[0]! };
}

// ============================================================================
// Chat stream
// ============================================================================

/**
 * Spawn a CLI coding agent with a one-shot prompt and stream stdout/stderr
 * chunks to the provided callbacks in real time.
 *
 * Returns an object with an `abort()` method to kill the child process.
 */
export function chatStream(
    agentName: string,
    prompt: string,
    cwd: string | undefined,
    callbacks: ChatCallbacks,
    signal?: AbortSignal,
): { abort: () => void } {
    const { onChunk, onError, onDone } = callbacks;

    // --- Validate agentName against known registry ---
    const resolved = resolveAgent(agentName);
    if (!resolved) {
        onChunk({
            text: `[Error] Unknown agent: "${agentName}". It is not in the recognized agent registry.`,
            stream: "stderr",
        });
        onDone();
        return { abort: () => {} };
    }
    const { command } = resolved;

    // --- Ensure workspace sessions directory exists ---
    const tempFolder = app.getPath("temp");
    const workspace = `${tempFolder}/sessions`;

    try {
        mkdirSync(workspace, { recursive: true });
    } catch (err) {
        onChunk({
            text: `[Error] Failed to create workspace directory: ${(err as Error).message}`,
            stream: "stderr",
        });
        onDone();
        return { abort: () => {} };
    }

    // --- Spawn the agent process ---
    let child: ChildProcess;
    const timeout = 120_000;

    try {
        const args = [
            "-p",
            prompt,
            "--verbose",
            "--print",
            "--output-format",
            "stream-json",
            "--dangerously-skip-permissions",
        ];

        child = spawn(command, args, {
            cwd: cwd ?? workspace,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env },
            timeout,
            signal,
        });
    } catch (err) {
        onChunk({
            text: `[Error] Failed to spawn ${command}: ${(err as Error).message}`,
            stream: "stderr",
        });
        onDone();
        return { abort: () => {} };
    }

    let settled = false;

    const done = () => {
        if (settled) return;
        settled = true;
        onDone();
    };

    const error = (err: Error) => {
        if (settled) return;
        settled = true;
        onError(err);
    };

    // --- Register event handlers (call callbacks directly) ---

    child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        console.log(`[${command}:stdout]`, text);
        onChunk({ text, stream: "stdout" });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        console.log(`[${command}:stderr]`, text);
        onChunk({ text, stream: "stderr" });
    });

    child.on("close", (_code, _sig) => {
        done();
    });

    child.on("error", (err: Error & { code?: string }) => {
        const code = err.code;
        if (code === "ENOENT") {
            onChunk({
                text: `[Error] Command not found: ${command}. Is it installed and in your PATH?`,
                stream: "stderr",
            });
            done();
        } else if (code === "ETIMEDOUT" || code === "ABORT_ERR") {
            onChunk({
                text: `[Error] ${command} timed out after ${timeout / 1000}s`,
                stream: "stderr",
            });
            done();
        } else {
            error(err);
        }
    });

    // --- Return abort handle ---
    return {
        abort: () => {
            if (!child.killed) {
                child.kill("SIGKILL");
            }
        },
    };
}
