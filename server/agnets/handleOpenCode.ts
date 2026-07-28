import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { client, ndJsonStream, methods } from "@agentclientprotocol/sdk";
import {
    ClientConnection,
    ClientHandlerContext,
} from "@agentclientprotocol/sdk";
import * as schema from "@agentclientprotocol/sdk";
import { getConversationsDb } from "../routes/conversations";
import { appendThreadMessage } from "../store/threadStore";

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

    // Accumulated assistant text for the current turn — collected from
    // session/update notifications so we can persist it to the thread.
    let assistantText = "";

    // Forward session/update notifications as raw ACP NDJSON lines and
    // accumulate text chunks for thread persistence.
    app.onNotification(
        methods.client.session.update,
        (ctx: ClientHandlerContext<schema.SessionNotification>) => {
            writeSSEEvent(res, JSON.stringify(ctx.params));

            // Collect agent_message_chunk text for the thread
            const update = (ctx.params as any).update;
            if (update?.sessionUpdate === "agent_message_chunk") {
                const text: string = update?.content?.text ?? "";
                if (text) assistantText += text;
            }
        },
    );

    // Register the connection-scoped handler that drives the full session
    // lifecycle.  `app.onConnect` + `app.connect` replaces the older
    // `app.connectWith` callback style.
    app.onConnect(async (connection: ClientConnection) => {
        const ctx = connection.agent;

        try {
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

            // Resolve the agent-side session — reuse an existing one when the
            // conversation already has a stored sessionId so context is preserved
            // across turns, otherwise create a fresh session.
            const convId: string | undefined = req.body.conversationId;
            let activeSessionId: string;

            if (convId) {
                const db = await getConversationsDb(workspacePath);
                const conv = db.data.conversations.find((c) => c.id === convId);

                if (conv?.sessionId) {
                    // Load the stored session to restore full conversation
                    // context.  `session/load` replays history back to the
                    // client via notifications AND restores the agent's
                    // internal state so it remembers prior turns.
                    writeSSEEvent(
                        res,
                        JSON.stringify({
                            type: "system",
                            subtype: "session_load",
                            sessionId: conv.sessionId,
                            conversationId: convId,
                        }),
                    );

                    await ctx.request(methods.agent.session.load, {
                        cwd: cwd,
                        sessionId: conv.sessionId,
                        mcpServers: [],
                        _meta: { conversationId: convId },
                    });

                    activeSessionId = conv.sessionId;
                } else if (conv) {
                    // First message in this conversation — create a session
                    const created: any = await ctx.request(
                        methods.agent.session.new,
                        {
                            cwd: cwd,
                            mcpServers: [],
                            _meta: { conversationId: convId },
                        },
                    );

                    activeSessionId = created.sessionId;

                    writeSSEEvent(
                        res,
                        JSON.stringify({
                            type: "system",
                            subtype: "session",
                            session_id: activeSessionId,
                        }),
                    );

                    // Persist so subsequent messages reuse this session
                    conv.sessionId = activeSessionId;
                    conv.updatedAt = new Date().toISOString();
                    await db.write();
                } else {
                    // Conversation not found in DB — one-off session
                    const created: any = await ctx.request(
                        methods.agent.session.new,
                        { cwd: cwd, mcpServers: [] },
                    );
                    activeSessionId = created.sessionId;
                }
            } else {
                // No conversation tracking — one-off session
                const created: any = await ctx.request(
                    methods.agent.session.new,
                    { cwd: cwd, mcpServers: [] },
                );
                activeSessionId = created.sessionId;

                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "system",
                        subtype: "session",
                        session_id: activeSessionId,
                    }),
                );
            }

            // Save user message to the conversation thread before prompting.
            if (convId) {
                appendThreadMessage(workspacePath, convId, "user", message);
            }

            // Reset accumulated text so we only capture the new response,
            // not replayed history from a session/load.
            assistantText = "";

            // Prompt against the resolved session.  Session updates (text
            // chunks, tool calls, etc.) are forwarded to the client by the
            // onNotification handler registered above.
            const resp: any = await ctx.request(methods.agent.session.prompt, {
                sessionId: activeSessionId,
                prompt: [{ type: "text" as const, text: message }],
            });

            // Persist accumulated assistant text to the thread.
            if (convId && assistantText.trim()) {
                await appendThreadMessage(
                    workspacePath,
                    convId,
                    "assistant",
                    assistantText,
                );
            }

            // Emit result event matching claude's stream-json result schema
            writeSSEEvent(
                res,
                JSON.stringify({
                    type: "result",
                    subtype: "success",
                    is_error: false,
                    result: resp?.stopReason ?? "end_turn",
                    stop_reason: resp?.stopReason ?? "end_turn",
                    session_id: activeSessionId,
                    num_turns: 1,
                }),
            );

            writeSSEEvent(res, "[DONE]");
            end();
        } catch (err: any) {
            if (err?.code === "ECONNRESET" || err?.name === "AbortError") {
                writeSSEEvent(res, "[DONE]");
            } else {
                writeSSEEvent(res, err?.message ?? "ACP failed", "error");
            }
            end();
        }
    });

    // Establish the connection — fires the onConnect handler.  Wait for the
    // underlying transport to close before returning control.
    const connection = app.connect(stream);
    await connection.closed;
};
