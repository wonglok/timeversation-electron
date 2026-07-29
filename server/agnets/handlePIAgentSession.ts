import { app } from "electron";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { getConversationsDb } from "../routes/conversations";
import { appendThreadMessage } from "../store/threadStore";

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
        // Split on \n so each physical line gets its own `data:` prefix.
        // encodeLine already appends \r\n as the line terminator, so we
        // must NOT append an extra \n here.
        for (const line of data.split("\n")) {
            parts.push(encodeLine("data", line));
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
// Claude Session handler — full conversation + session persistence via
// the Claude Code CLI (`--continue` with per-conversation working directory).
// ============================================================================

export const handlePIAgentSession = async ({
    req,
    res,
    message,
    workspacePath = "",
    conversationId,
}: {
    req: any;
    res: any;
    message: string;
    workspacePath?: string;
    conversationId?: string;
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

    // --- Resolve session directory from stored sessionId ---
    const appDataPath = app.getPath("appData");
    let sessionId: string;
    let sessionPath: string;

    if (conversationId) {
        try {
            const db = await getConversationsDb(workspacePath);
            const conv = db.data.conversations.find(
                (c) => c.id === conversationId,
            );
            if (conv?.sessionId) {
                // Reuse the existing session directory so --continue picks up
                // prior conversation context.
                sessionId = conv.sessionId;
            } else {
                // First turn — generate a new session id and persist it.
                sessionId = crypto.randomUUID();
                if (conv) {
                    conv.sessionId = sessionId;
                    conv.updatedAt = new Date().toISOString();
                    await db.write();
                }
            }
        } catch (_) {
            sessionId = crypto.randomUUID();
        }
    } else {
        // No conversation tracking — one-off session
        sessionId = crypto.randomUUID();
    }

    sessionPath = path.join(
        appDataPath,
        "timeversation",
        "sessions",
        sessionId,
    );
    try {
        mkdirSync(sessionPath, { recursive: true });
    } catch (_) {
        // Directory already exists — fine
    }

    // --- Persist user message to thread store ---
    if (conversationId) {
        appendThreadMessage(workspacePath, conversationId, "user", message);
    }

    // Accumulate assistant output lines for thread persistence.
    // Claude Code stream-json wraps the actual text in `assistant` events
    // with `text` content blocks — we accumulate raw lines and extract
    // text during the final flush.
    let assistantText = "";

    // --- CLI args ---
    // --print: non-interactive, process prompt and exit
    // --continue (-c): resume previous session
    // --session-dir: isolate session storage per conversation so --continue
    //                picks up the right conversation context.
    const args = [
        "--print",
        "-c",
        "--session-dir",
        sessionPath,
        JSON.stringify(message),
    ];

    // --- Spawn pi process ---
    const proc = spawn("pi", args, {
        env: process.env,
        cwd: sessionPath,
        stdio: ["pipe", "pipe", "ignore"],
    });

    // --- UTF-8 decoders ---
    const stdoutDecoder = new TextDecoder();
    const stderrDecoder = new TextDecoder();

    // Use objects so mutations inside pipeChunk/flushDecoder propagate
    // back to the caller (strings are copied by value, objects are shared).
    const stdoutBuf = { buf: "" };
    const stderrBuf = { buf: "" };

    function pipeChunk(
        raw: Buffer,
        decoder: InstanceType<typeof TextDecoder>,
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
        decoder: InstanceType<typeof TextDecoder>,
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
        pipeChunk(raw, stdoutDecoder, stdoutBuf, (line) => {
            // Collect text from assistant message blocks for thread persistence
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === "assistant") {
                    const blocks = parsed.message?.content;
                    if (Array.isArray(blocks)) {
                        for (const block of blocks) {
                            if (block.type === "text" && block.text) {
                                assistantText += block.text;
                            }
                        }
                    }
                }
            } catch (_) {
                // Non-JSON line (e.g. raw text) — still forward it
            }
            writeSSEEvent(res, line);
        });
    });

    // // --- stderr → SSE named events ---
    // proc.stderr.on("data", (raw: Buffer) => {
    //     pipeChunk(raw, stderrDecoder, stderrBuf, (line) =>
    //         writeSSEEvent(res, line, "stderr"),
    //     );
    // });

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

    // --- Process complete ---
    proc.on("close", async (code, signal) => {
        // Flush any trailing bytes
        flushDecoder(stdoutDecoder, stdoutBuf, writeSSEEvent.bind(null, res));
        flushDecoder(
            stderrDecoder,
            stderrBuf,
            writeSSEEvent.bind(null, res),
            "stderr",
        );

        // Persist accumulated assistant text to thread
        if (conversationId && assistantText.trim()) {
            await appendThreadMessage(
                workspacePath,
                conversationId,
                "assistant",
                assistantText.trim(),
            );
        }

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
};
