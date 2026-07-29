import { app } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { Codex } from "@openai/codex-sdk";
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
// Codex SDK handler — uses @openai/codex-sdk to stream agent replies via SSE
// ============================================================================

export const handleCodexSDK = async ({
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

    // --- Resolve session directory ---
    const appDataPath = app.getPath("appData");
    const dirSessionId = conversationId || crypto.randomUUID();
    const sessionPath = path.join(appDataPath, "timeversation", "sessions", dirSessionId);
    try {
        mkdirSync(sessionPath, { recursive: true });
    } catch (_) {
        // Directory already exists — fine
    }

    // Abort controller so we can cancel the turn when the client disconnects
    const ac = new AbortController();

    // --- Resolve thread: resume from stored sessionId or start fresh ---
    const codex = new Codex({
        config: {
            sandboxed: false,
            skipGitRepoCheck: true,
        },
    });

    let thread;
    let threadId: string | null = null;

    if (conversationId) {
        try {
            const db = await getConversationsDb(workspacePath);
            const conv = db.data.conversations.find(
                (c) => c.id === conversationId,
            );
            if (conv?.sessionId) {
                // Resume the existing Codex thread so context carries over
                thread = codex.resumeThread(conv.sessionId, {
                    workingDirectory: sessionPath,
                    skipGitRepoCheck: true,
                });
                threadId = conv.sessionId;

                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "thread.started",
                        thread_id: threadId,
                    }),
                );
            }
        } catch (_) {
            // DB read failed — fall through to start a fresh thread
        }
    }

    if (!thread) {
        thread = codex.startThread({
            workingDirectory: sessionPath,
            skipGitRepoCheck: true,
        });
    }

    // --- Persist user message ---
    if (conversationId) {
        appendThreadMessage(workspacePath, conversationId, "user", message);
    }

    // Accumulate assistant text for thread persistence
    let assistantText = "";

    // --- Client disconnect → abort turn ---
    req.on("close", () => {
        if (!ac.signal.aborted) {
            ac.abort();
        }
    });

    try {
        // Run the turn with streaming events
        const { events } = await thread.runStreamed(message, {
            signal: ac.signal,
        });

        // Iterate the async generator and forward each event as SSE
        for await (const event of events) {
            // Collect agent_message text for thread persistence
            if (
                event.type === "item.completed" &&
                event.item.type === "agent_message"
            ) {
                assistantText += event.item.text;
            }

            // Persist thread ID on the first thread.started event so
            // subsequent turns in this conversation can resume the thread.
            if (
                event.type === "thread.started" &&
                !threadId &&
                conversationId
            ) {
                threadId = event.thread_id;
                try {
                    const db = await getConversationsDb(workspacePath);
                    const conv = db.data.conversations.find(
                        (c) => c.id === conversationId,
                    );
                    if (conv) {
                        conv.sessionId = threadId;
                        conv.updatedAt = new Date().toISOString();
                        await db.write();
                    }
                } catch (_) {
                    // Best-effort persistence
                }
            }

            // Forward the event as an SSE data line
            writeSSEEvent(res, JSON.stringify(event));
        }

        // --- Persist assistant text ---
        if (conversationId && assistantText.trim()) {
            await appendThreadMessage(
                workspacePath,
                conversationId,
                "assistant",
                assistantText.trim(),
            );
        }

        // Signal end of stream
        writeSSEEvent(res, "[DONE]");
    } catch (err: any) {
        if (err.name === "AbortError") {
            // Client disconnected — graceful stop
            writeSSEEvent(res, "[DONE]");
        } else {
            writeSSEEvent(
                res,
                JSON.stringify({
                    type: "error",
                    message: err.message ?? "Codex SDK stream failed",
                }),
                "error",
            );
        }
    } finally {
        res.end();
    }
};
