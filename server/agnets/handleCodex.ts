import { app } from "electron";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
// ============================================================================
// SSE encoder helpers
// ============================================================================

const encoder = new TextEncoder();

/** Encode a single SSE field line (e.g. "data: hello") as UTF-8 bytes. */
function encodeLine(field: string, value: string): Uint8Array {
    return encoder.encode(`${field}: ${value}\r\n`);
}

/**
 * Emit an SSE event.
 * - `data` may contain embedded newlines; each line becomes its own `data:` field.
 * - `event` is optional (omitted → default "message" event).
 * - Always terminates the event with an extra `\r\n`.
 */
function writeSSEEvent(
    res: NodeJS.WritableStream,
    data: string,
    event?: string,
): void {
    const parts: Uint8Array[] = [];

    if (event) {
        parts.push(encodeLine("event", event));
    }

    if (data === "") {
        // Empty data — emit a single empty data line
        parts.push(encodeLine("data", ""));
    } else {
        // Split on \n so each physical line gets its own `data:` prefix
        for (const line of data.split("\n")) {
            parts.push(encodeLine("data", `${line}\n`));
        }
    }

    // Terminate the event
    parts.push(encoder.encode("\r\n"));

    // Write as a single Buffer to avoid many small writes
    const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) {
        merged.set(p, offset);
        offset += p.length;
    }
    res.write(merged);
}

// ============================================================================
// Agent config registry
// ============================================================================

interface AgentConfig {
    cmd: string;
    args: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve CLI args, injecting the user message for the placeholder token */
function resolveArgs(config: AgentConfig, message: string): string[] {
    const resolved = config.args.map((arg) =>
        arg === "__REPLACE_ME_WITH_PROMPT__" ? message : arg,
    );
    // Append -- so the user message is never interpreted as a flag,
    // regardless of which agent config is used.
    resolved.push("--");
    return resolved;
}

export const handleCodex = ({
    req,
    res,
    message,
    workspacePath = "",
}: {
    req: any;
    res: any;
    message: string;
    workspacePath?: string;
}) => {
    // --- SSE headers ---
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // nginx buffering off
    });

    // Send an initial comment to flush headers
    res.write(encoder.encode(":ok\r\n\r\n"));

    // --- Resolve session working directory ---
    const appDataPath = app.getPath("appData");
    const sid = req.body.sessionID || crypto.randomUUID();
    const sessionPath = path.join(appDataPath, "session", sid);
    try {
        mkdirSync(sessionPath, { recursive: true });
    } catch (_) {
        // directory already exists — fine
    }
    const config = {
        cmd: "codex",
        args: [
            "exec",
            "--skip-git-repo-check",
            "__REPLACE_ME_WITH_PROMPT__",
            "--add-dir",
            JSON.stringify(sessionPath),
        ],
    };

    const resolvedArgs = resolveArgs(config, message);

    // --- Spawn codex process (no shell — argument array is safe) ---
    const proc = spawn(config.cmd, resolvedArgs, {
        env: process.env,
        cwd: sessionPath,
        stdio: ["ignore", "pipe", "pipe"],
    });

    // --- UTF-8 decoders ---
    const stdoutDecoder = new TextDecoder();
    const stderrDecoder = new TextDecoder();

    let stdoutBuf = "";
    let stderrBuf = "";

    function pipeChunk(
        raw: Buffer,
        decoder: TextDecoder,
        bufRef: { buf: string },
        writeLine: (line: string) => void,
    ) {
        const text = decoder.decode(raw, { stream: true });
        bufRef.buf += text;
        const lines = bufRef.buf.split("\n");
        bufRef.buf = lines.pop() ?? "";
        for (const line of lines) {
            writeLine(line);
        }
    }

    function flushDecoder(
        decoder: TextDecoder,
        bufRef: { buf: string },
        writeSSE: (data: string, event?: string) => void,
        event?: string,
    ) {
        const tail = decoder.decode();
        bufRef.buf += tail;
        if (bufRef.buf) {
            writeSSE(bufRef.buf, event);
            bufRef.buf = "";
        }
    }

    // --- stdout → SSE ---
    proc.stdout.on("data", (raw: Buffer) => {
        pipeChunk(raw, stdoutDecoder, { buf: stdoutBuf }, (line) =>
            writeSSEEvent(res, line),
        );
    });

    // --- stderr → SSE named events ---
    proc.stderr.on("data", (raw: Buffer) => {
        pipeChunk(raw, stderrDecoder, { buf: stderrBuf }, (line) =>
            writeSSEEvent(res, line, "stderr"),
        );
    });

    // --- Process complete ---
    proc.on("close", (code, signal) => {
        flushDecoder(
            stdoutDecoder,
            { buf: stdoutBuf },
            writeSSEEvent.bind(null, res),
        );
        flushDecoder(
            stderrDecoder,
            { buf: stderrBuf },
            writeSSEEvent.bind(null, res),
            "stderr",
        );

        if (code === 0) {
            writeSSEEvent(res, "[DONE]");
        } else if (signal) {
            writeSSEEvent(
                res,
                `Process terminated by signal: ${signal}`,
                "error",
            );
        } else {
            writeSSEEvent(
                res,
                `Process exited with code ${code ?? "unknown"}`,
                "error",
            );
        }
        res.end();
    });

    // // --- Process spawn error ---
    // proc.on("error", (err) => {
    //     writeSSEEvent(res, err.message, "error");
    //     res.end();
    // });

    // // --- Client disconnect → kill process ---
    // req.on("close", () => {
    //     if (proc.exitCode === null && !proc.killed) {
    //         proc.kill();
    //     }
    // });
};
