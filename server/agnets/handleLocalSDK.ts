import { app } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { appendThreadMessage, getThreadMessages } from "../store/threadStore";
import { OpenAI } from "openai";
import { ChatCompletion } from "openai/resources/index.mjs";
import { getConversationsDb } from "../routes/conversations";

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

export const handleLocalSDK = async ({
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
    const sessionPath = path.join(
        appDataPath,
        "timeversation",
        "sessions",
        dirSessionId,
    );
    try {
        mkdirSync(sessionPath, { recursive: true });
    } catch (_) {
        // Directory already exists — fine
    }

    // Abort controller so we can cancel the turn when the client disconnects
    const ac = new AbortController();

    // let thread;
    // let threadId: string | null = null;

    if (conversationId) {
        try {
            const db = await getConversationsDb(workspacePath);
            const conv = db.data.conversations.find(
                (c) => c.id === conversationId,
            );
            if (conv?.sessionId) {
                // // Resume the existing Codex thread so context carries over
                // thread = codex.resumeThread(conv.sessionId, {
                //     workingDirectory: sessionPath,
                //     skipGitRepoCheck: true,
                // });
                // threadId = conv.sessionId;
                // writeSSEEvent(
                //     res,
                //     JSON.stringify({
                //         type: "thread.started",
                //         thread_id: threadId,
                //     }),
                // );
            }
        } catch (_) {
            // DB read failed — fall through to start a fresh thread
        }
    }

    // if (!thread) {
    //     thread = codex.startThread({
    //         workingDirectory: sessionPath,
    //         skipGitRepoCheck: true,
    //     });
    // }

    // --- Persist user message ---
    if (conversationId) {
        appendThreadMessage(workspacePath, conversationId, "user", message);
    }

    // // Accumulate assistant text for thread persistence

    // --- Client disconnect → abort turn ---
    req.on("close", () => {
        if (!ac.signal.aborted) {
            ac.abort();
        }
    });

    try {
        const client = new OpenAI({
            apiKey: "ppap",
            baseURL: `http://localhost:8390/api/llm`,
        });

        const msg = await getThreadMessages(
            workspacePath,
            conversationId as string,
        );
        // console.log(msg);

        let assistantText = "";
        let thinkingText = "";

        // --- Step 1: Ask a question that triggers a tool call ---
        const responseStream = await client.chat.completions.create({
            model: `default`,
            reasoning_effort: "high",
            messages: [
                ...msg.map((r) => {
                    return {
                        content: r.content,
                        role: r.role,
                    };
                }),
                { role: "user", content: message },
            ],
            stream: true,
        });

        for await (let item of responseStream) {
            const delta = item.choices[0]?.delta as
                | Record<string, any>
                | undefined;

            // Handle thinking/reasoning tokens (e.g. DeepSeek, o1-style models)
            if (delta?.reasoning_content) {
                thinkingText += delta.reasoning_content;
                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "thinking",
                        content: delta.reasoning_content,
                    }),
                );
            }

            // Handle regular text content
            if (delta?.content) {
                assistantText += delta.content;
                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "text",
                        content: delta.content,
                    }),
                );
            }
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
