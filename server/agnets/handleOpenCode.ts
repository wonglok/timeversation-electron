import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { client, ndJsonStream, methods } from "@agentclientprotocol/sdk";
import type {
    ClientContext,
    ClientHandlerContext,
    ActiveSession,
} from "@agentclientprotocol/sdk";
import * as schema from "@agentclientprotocol/sdk";

// ============================================================================
// SSE encoder
// ============================================================================

const encoder = new TextEncoder();

function writeSSEEvent(
    res: NodeJS.WritableStream,
    data: string,
    event?: string,
): void {
    const parts: Uint8Array[] = [];

    if (event) parts.push(encoder.encode(`event: ${event}\r\n`));

    if (data === "") {
        parts.push(encoder.encode("data:\r\n"));
    } else {
        for (const line of data.split("\n")) {
            parts.push(encoder.encode(`data: ${line}\r\n`));
        }
    }

    parts.push(encoder.encode("\r\n"));

    const len = parts.reduce((s, p) => s + p.length, 0);
    const buf = new Uint8Array(len);
    let off = 0;
    for (const p of parts) {
        buf.set(p, off);
        off += p.length;
    }
    res.write(buf);
}

// ============================================================================
// Handler — Agent Client Protocol via stdio
// ============================================================================

export const handleOpenCode = ({
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
        "X-Accel-Buffering": "no",
    });
    res.write(encoder.encode(":ok\r\n\r\n"));

    const cwd = workspacePath || process.cwd();
    let done = false;
    const end = () => {
        if (!done) {
            done = true;
            res.end();
        }
    };

    // --- Spawn opencode in ACP mode ---
    const proc = spawn("opencode", ["acp"], {
        env: process.env,
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdin!.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code !== "EPIPE") {
            writeSSEEvent(res, err.message, "error");
            // end();
        }
    });

    proc.on("error", (err) => {
        writeSSEEvent(res, err.message, "error");
        // end();
    });

    // req.on("close", () => {
    //     if (proc.exitCode === null && !proc.killed) proc.kill();
    // });

    // --- ACP stream from stdio ---
    const stream = ndJsonStream(
        Writable.toWeb(proc.stdin!),
        Readable.toWeb(proc.stdout!),
    );

    const app = client({ name: "timeversation" });

    app.onNotification(
        methods.client.session.update,
        (ctx: ClientHandlerContext<schema.SessionNotification>) => {
            writeSSEEvent(res, JSON.stringify(ctx.params));
        },
    );

    app.connectWith(stream, async (ctx: ClientContext) => {
        const init: any = await ctx.request(methods.agent.initialize, {
            protocolVersion: "1.0",
            clientCapabilities: {
                fs: { writeTextFile: true, readTextFile: true },
                terminal: true,
            },
        });

        writeSSEEvent(
            res,
            JSON.stringify({
                type: "system",
                subtype: "init",
                model: init?.agentMetadata?.model ?? "unknown",
            }),
        );

        const session: ActiveSession = await ctx.buildSession(cwd).start();

        writeSSEEvent(
            res,
            JSON.stringify({
                type: "system",
                subtype: "session",
                sessionId: session.sessionId,
            }),
        );

        try {
            const promptPromise = session.prompt(message);

            while (true) {
                const msg = await session.nextUpdate();
                if (msg.kind === "stop") break;
                const contents = (msg as any).update?.contents;
                if (contents) {
                    writeSSEEvent(
                        res,
                        JSON.stringify({
                            type: "assistant",
                            message: { role: "assistant", content: contents },
                        }),
                    );
                }
            }

            const resp: any = await promptPromise;
            writeSSEEvent(
                res,
                JSON.stringify({
                    type: "result",
                    subtype: "success",
                    stop_reason: resp?.stopReason ?? "end_turn",
                }),
            );
        } finally {
            try {
                session.dispose();
            } catch {
                /* ok */
            }
        }
    })
        .then(() => {
            writeSSEEvent(res, "[DONE]");
            end();
        })
        .catch((err: any) => {
            if (err?.code === "ECONNRESET" || err?.name === "AbortError") {
                writeSSEEvent(res, "[DONE]");
            } else {
                writeSSEEvent(res, err?.message ?? "ACP failed", "error");
            }
            end();
        });
};
