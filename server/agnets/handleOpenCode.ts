import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { client, ndJsonStream, methods } from "@agentclientprotocol/sdk";
import {
    ClientContext,
    ClientHandlerContext,
    ActiveSession,
} from "@agentclientprotocol/sdk";
import * as schema from "@agentclientprotocol/sdk";

// ============================================================================
// SSE encoder (same format as handleClaude.ts)
// ============================================================================

const encoder = new TextEncoder();

function encodeLine(field: string, value: string): Uint8Array {
    return encoder.encode(`${field}: ${value}\r\n`);
}

function writeSSEEvent(
    res: NodeJS.WritableStream,
    data: string,
    event?: string,
): void {
    const parts: Uint8Array[] = [];

    if (event) parts.push(encodeLine("event", event));

    if (data === "") {
        parts.push(encodeLine("data", ""));
    } else {
        for (const line of data.split("\n")) {
            parts.push(encodeLine("data", line));
        }
    }

    parts.push(encoder.encode("\r\n"));

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
// Handler — Agent Client Protocol via stdio
// ============================================================================

export const handleOpenCode = async ({
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
        stdio: ["pipe", "pipe", "inherit"],
    });

    // If opencode exits before we write, stdin gets EPIPE.  Suppress it and
    // let the close/error handlers surface the real problem.
    let spawnError: string | null = null;

    proc.on("error", (err) => {
        spawnError = err.message;
    });

    // proc.on("close", (code) => {
    //     if (code !== 0 && code !== null && spawnError === null) {
    //         spawnError = `opencode exited with code ${code}`;
    //     }
    // });

    // req.on("close", () => {
    //     if (proc.exitCode === null && !proc.killed) proc.kill();
    // });

    // Wait one tick for the process to either start or fail
    await new Promise((r) => setTimeout(r, 50));

    if (spawnError || proc.exitCode !== null) {
        writeSSEEvent(res, spawnError ?? "opencode failed to start", "error");
        return end();
    }

    // --- ACP stream from stdio ---
    const stream = ndJsonStream(
        Writable.toWeb(proc.stdin!),
        Readable.toWeb(proc.stdout!),
    );

    const app = client({ name: "timeversation" });

    // Forward session/update notifications as raw ACP NDJSON lines.
    // This matches the same schema that `claude --output-format stream-json` emits.
    app.onNotification(
        methods.client.session.update,
        (ctx: ClientHandlerContext<schema.SessionNotification>) => {
            writeSSEEvent(res, JSON.stringify(ctx.params));
        },
    );

    app.connectWith(stream, async (ctx: ClientContext) => {
        const init: any = await ctx.request(methods.agent.initialize, {
            protocolVersion: 1,
            clientCapabilities: {
                fs: { writeTextFile: true, readTextFile: true },
                terminal: true,
            },
            agentCapabilities: {
                sessionCapabilities: {
                    list: {},
                    loadSession: true,
                    resume: {},
                },
            },
        });

        // Emit init event matching claude's stream-json init schema
        writeSSEEvent(
            res,
            JSON.stringify({
                type: "system",
                subtype: "init",
                cwd,
                session_id: init?.sessionId ?? null,
                model: init?.agentMetadata?.model ?? "unknown",
            }),
        );

        // Try to load an existing session matching the conversationId
        const convId: string | undefined = req.body.conversationId;
        let session: ActiveSession;

        if (convId) {
            // List sessions and search for one with matching _meta.conversationId
            const list = await ctx.request(methods.agent.session.list, {
                cwd: cwd,
            });

            const existing = list.sessions.find(
                (s) => s._meta?.conversationId === convId,
            );

            if (existing) {
                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "system",
                        subtype: "session_load",
                        sessionId: existing.sessionId,
                        conversationId: convId,
                    }),
                );

                await ctx.request(methods.agent.session.load, {
                    cwd: cwd,
                    sessionId: existing.sessionId,
                    mcpServers: [],
                    _meta: { conversationId: convId },
                });
            }
        }

        // Build a new session if we didn't load an existing one
        session = await ctx
            .buildSession({
                cwd: cwd,
                mcpServers: [],
                _meta: { conversationId: convId || "" },
            })
            .start();

        // Emit session event matching claude's stream-json session schema
        writeSSEEvent(
            res,
            JSON.stringify({
                type: "system",
                subtype: "session",
                session_id: session.sessionId,
            }),
        );

        try {
            const promptPromise = session.prompt([
                { type: "text", text: message },
            ]);

            // Stream updates until stop. Each update is forwarded as-is
            // by the onNotification handler above.
            while (true) {
                const msg = await session.nextUpdate();
                if (msg.kind === "stop") break;

                // onNotification already forwards the raw params; nothing extra needed
                const contents = (msg as any).update?.contents;
                if (contents) {
                    writeSSEEvent(
                        res,
                        JSON.stringify({
                            type: "assistant",
                            message: {
                                role: "assistant",
                                content: contents,
                            },
                            session_id: session.sessionId,
                        }),
                    );
                }
            }

            const resp: any = await promptPromise;

            // Emit result event matching claude's stream-json result schema
            writeSSEEvent(
                res,
                JSON.stringify({
                    type: "result",
                    subtype: "success",
                    is_error: false,
                    duration_ms: resp?.durationMs ?? 0,
                    result: resp?.stopReason ?? "end_turn",
                    stop_reason: resp?.stopReason ?? "end_turn",
                    session_id: session.sessionId,
                    num_turns: 1,
                }),
            );

            writeSSEEvent(res, "[DONE]");
            end();
        } finally {
            try {
                session.dispose();
            } catch {
                /* ok */
            }
        }
    })
        .then(() => {})
        .catch((err: any) => {
            if (err?.code === "ECONNRESET" || err?.name === "AbortError") {
                writeSSEEvent(res, "[DONE]");
            } else {
                writeSSEEvent(res, err?.message ?? "ACP failed", "error");
            }
            end();
        });
};
