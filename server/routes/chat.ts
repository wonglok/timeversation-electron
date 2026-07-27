import { Router } from "express";
import { spawn } from "node:child_process";
import * as claudeAgent from "../agnets/claude";
import * as opencodeAgent from "../agnets/opencode";

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
// Agent config registry
// ============================================================================

interface AgentConfig {
    cmd: string;
    args: string[];
}

const AGENT_CONFIGS: Record<string, AgentConfig> = {
    "claude-code": {
        cmd: claudeAgent.cmd,
        args: claudeAgent.args,
    },
    opencode: {
        cmd: opencodeAgent.cmd,
        args: opencodeAgent.args,
    },
};

// ============================================================================
// Helpers
// ============================================================================

/** Resolve CLI args, injecting the user message for the placeholder token */
function resolveArgs(config: AgentConfig, message: string): string[] {
    return config.args
        .map((arg) =>
            arg === "__REPLACE_ME_WITH_PROMPT__" ? ["--", message] : arg,
        )
        .flat();
}

// ============================================================================
// Router
// ============================================================================

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/chat/send — fire-and-collect (non-streaming fallback)
// ---------------------------------------------------------------------------
router.post("/send", async (req, res) => {
    const { slug, message } = req.body as {
        slug?: string;
        message?: string;
    };

    if (!slug || !message) {
        res.status(400).json({ error: "slug and message are required" });
        return;
    }

    const config = AGENT_CONFIGS[slug];
    if (!config) {
        res.status(404).json({
            error: `No agent config found for slug: ${slug}`,
        });
        return;
    }

    const resolvedArgs = resolveArgs(config, message);

    try {
        const reply = await new Promise<string>((resolve, reject) => {
            const proc = spawn(config.cmd, resolvedArgs, {
                env: process.env,
                cwd: process.cwd(),
                stdio: ["pipe", "pipe", "pipe"],
            });

            let stdout = "";
            let stderr = "";

            proc.stdout.on("data", (data: Buffer) => {
                stdout += data.toString();
            });

            proc.stderr.on("data", (data: Buffer) => {
                stderr += data.toString();
            });

            proc.on("close", (code) => {
                if (code === 0) {
                    resolve(stdout.trim() || "(no output)");
                } else {
                    reject(
                        new Error(
                            stderr.trim() || `Process exited with code ${code}`,
                        ),
                    );
                }
            });

            proc.on("error", (err) => {
                reject(err);
            });
        });

        res.json({ reply });
    } catch (err: any) {
        console.error("[chat] agent execution failed:", err.message);
        res.json({
            reply: "Error: agent execution failed. Check the server logs for details.",
        });
    }
});

// ---------------------------------------------------------------------------
// POST /api/chat/stream — SSE streaming endpoint
// ---------------------------------------------------------------------------
router.post("/stream", (req, res) => {
    const { slug, message } = req.body as {
        slug?: string;
        message?: string;
    };

    if (!slug || !message) {
        res.status(400).json({ error: "slug and message are required" });
        return;
    }

    const config = AGENT_CONFIGS[slug];
    if (!config) {
        res.status(404).json({
            error: `No agent config found for slug: ${slug}`,
        });
        return;
    }

    // --- SSE headers ---
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // nginx buffering off
    });

    // Send an initial comment to flush headers
    res.write(encoder.encode(":ok\r\n\r\n"));

    const resolvedArgs = resolveArgs(config, message);

    const proc = spawn(config.cmd, resolvedArgs, {
        env: process.env,
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
    });

    // --- UTF-8 text decoders for each stream ---
    const stdoutDecoder = new TextDecoder();
    const stderrDecoder = new TextDecoder();

    // --- Per-stream partial-line buffers ---
    let stdoutBuf = "";
    let stderrBuf = "";

    /**
     * Feed a raw Uint8Array chunk through a TextDecoder, then emit every
     * *complete* line to the SSE writer, keeping trailing partial text in bufRef.
     */
    function pipeChunk(
        raw: Buffer,
        decoder: TextDecoder,
        bufRef: { buf: string },
        writeLine: (line: string) => void,
    ) {
        // Decode incrementally — handles split multi-byte UTF-8 codepoints
        const text = decoder.decode(raw, { stream: true });
        bufRef.buf += text;

        // Split on LF, preserving empty lines between consecutive LFs
        const lines = bufRef.buf.split("\n");
        bufRef.buf = lines.pop() ?? "";

        for (const line of lines) {
            writeLine(line);
        }
    }

    /** Flush any remaining decoded bytes from a decoder + buffer */
    function flushDecoder(
        decoder: TextDecoder,
        bufRef: { buf: string },
        writeSSE: (data: string, event?: string) => void,
        event?: string,
    ) {
        // Final decode pass to flush any buffered UTF-8 continuation bytes
        const tail = decoder.decode();
        bufRef.buf += tail;

        if (bufRef.buf) {
            writeSSE(bufRef.buf, event);
            bufRef.buf = "";
        }
    }

    // --- stdout → SSE data chunks ---
    proc.stdout.on("data", (raw: Buffer) => {
        pipeChunk(raw, stdoutDecoder, { buf: stdoutBuf }, (line) =>
            writeSSEEvent(res, line),
        );
    });

    // --- stderr → SSE named-event chunks ---
    proc.stderr.on("data", (raw: Buffer) => {
        pipeChunk(raw, stderrDecoder, { buf: stderrBuf }, (line) =>
            writeSSEEvent(res, line, "stderr"),
        );
    });

    // --- Process complete ---
    proc.on("close", (code) => {
        // Flush any trailing UTF-8 bytes and partial lines
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
        } else {
            writeSSEEvent(res, `Process exited with code ${code}`, "error");
        }
        res.end();
    });

    // --- Process spawn error ---
    proc.on("error", (err) => {
        writeSSEEvent(res, err.message, "error");
        res.end();
    });

    // --- Client disconnect → kill process ---
    req.on("close", () => {
        if (!proc.killed) {
            proc.kill();
        }
    });
});

export default router;
