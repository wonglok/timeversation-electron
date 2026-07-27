import { execSync } from "node:child_process";
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

export const handleOpenCode = ({
    req,
    res,
    message,
}: {
    req: any;
    res: any;
    message: string;
}) => {
    const config = {
        cmd: "opencode",
        args: ["run", "__REPLACE_ME_WITH_PROMPT__"],
    };

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

    // Build a shell-safe command string for execSync
    const cmdline = [config.cmd, ...resolvedArgs]
        .map((arg) => {
            // Single-quote escape: replace ' with '\'' and wrap in quotes
            if (/[ \t\n'"$`\\]/.test(arg)) {
                return `'${arg.replace(/'/g, "'\\''")}'`;
            }
            return arg;
        })
        .join(" ");

    try {
        const stdout = execSync(cmdline, {
            env: process.env,
            cwd: process.cwd(),
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 50 * 1024 * 1024, // 50 MB
        });

        // Emit each line as an SSE data event (preserving empty lines)
        const lines = stdout.split("\n");
        // If stdout ends with \n, split gives a trailing "" — drop it so we
        // don't emit a spurious blank line at the end.
        const last = lines[lines.length - 1];
        const clean = last === "" ? lines.slice(0, -1) : lines;

        for (const line of clean) {
            writeSSEEvent(res, line);
        }

        writeSSEEvent(res, "[DONE]");
        res.end();
    } catch (err: any) {
        // execSync throws on non-zero exit — stderr is on err.stderr
        if (err.stdout) {
            for (const line of String(err.stdout).split("\n")) {
                writeSSEEvent(res, line);
            }
        }
        if (err.stderr) {
            for (const line of String(err.stderr).split("\n")) {
                if (line) writeSSEEvent(res, line, "stderr");
            }
        }

        if (err.signal) {
            writeSSEEvent(
                res,
                `Process terminated by signal: ${err.signal}`,
                "error",
            );
        } else {
            writeSSEEvent(
                res,
                `Process exited with code ${err.status ?? "unknown"}`,
                "error",
            );
        }
        res.end();
    }
};
