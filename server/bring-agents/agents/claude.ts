import { spawn, type ChildProcess } from "node:child_process";

export interface RunClaudeOptions {
    cwd: string;
    userPrompt: string;
    systemPrompt?: string;
    write: (text: string) => void;
    error: (message: string) => void;
    close: () => void;
}

/**
 * Spawn the Claude Code CLI in headless mode and stream stdout via callbacks.
 * Returns an abort handle so the caller can kill the process on disconnect.
 */
export function runClaudePrompt(opts: RunClaudeOptions): { abort: () => void } {
    const { userPrompt, systemPrompt, cwd, write, error, close } = opts;

    const args = [
        "-p",
        userPrompt,
        "--output-format",
        "stream-json",
        "--dangerously-skip-permissions",
    ];

    if (systemPrompt) {
        args.push("--system-prompt", systemPrompt);
    }

    const claudeProcess: ChildProcess = spawn("claude", args, {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
    });

    let settled = false;

    const done = () => {
        if (settled) return;
        settled = true;
        close();
    };

    const fail = (message: string) => {
        if (settled) return;
        settled = true;
        error(message);
    };

    claudeProcess.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        console.log(`[claude:stdout]`, text);
        write(text);
    });

    claudeProcess.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        console.log(`[claude:stderr]`, text);
        // stderr from claude often carries verbose / progress output
        // rather than fatal errors, so forward it as regular output
        write(text);
    });

    claudeProcess.on("close", (code) => {
        console.log(`[claude] Process exited with code ${code}`);
        done();
    });

    claudeProcess.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
            fail("Command not found: claude. Is it installed and in your PATH?");
        } else {
            fail(`Process error: ${err.message}`);
        }
    });

    return {
        abort: () => {
            if (!claudeProcess.killed) {
                claudeProcess.kill("SIGKILL");
            }
        },
    };
}
