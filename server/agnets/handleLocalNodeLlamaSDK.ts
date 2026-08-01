// ============================================================================
// Local node-llama-cpp agent handler
// ============================================================================
// Uses LlamaChatSession for local GGUF model inference with automatic
// function-calling loop and SSE streaming.
// ============================================================================

import { mkdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import {
    getLlama,
    LlamaChatSession,
    type LlamaModel,
    type LlamaContext,
} from "node-llama-cpp";
import { appendThreadMessage, getThreadMessages } from "../store/threadStore";
import {
    TOOL_NAMES,
    TOOL_NAMES_DESC,
    buildSessionFunctions,
} from "./node-llama-tools";

// ============================================================================
// Constants
// ============================================================================

const resolvedModelsDir = path.join(
    app.getPath("appData"),
    "timeversation",
    "ai-models",
);

// ============================================================================
// Types
// ============================================================================

interface LlmState {
    model: LlamaModel;
    context: LlamaContext;
    modelPath: string;
}

// ============================================================================
// Model state (lazy singleton — model + context are reused across requests)
// ============================================================================

let state: LlmState | null = null;
let currentModelPath: string | null = null;

/** Return the file path of the currently loaded model, or null if none. */
export function getLoadedModelPath(): string | null {
    return currentModelPath;
}

function disposeState() {
    if (!state) return;
    try {
        state.context.dispose();
    } catch {
        /* ignore */
    }
    try {
        state.model.dispose();
    } catch {
        /* ignore */
    }
    state = null;
    currentModelPath = null;
}

async function findGgufFile(dir: string): Promise<string | null> {
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".gguf")) {
                return path.join(dir, entry.name);
            }
        }
        return null;
    } catch {
        return null;
    }
}

// ============================================================================
// Model loading — model + context are reused, session is per-request
// ============================================================================

async function ensureModelLoaded(): Promise<LlmState> {
    if (state && currentModelPath === state.modelPath) {
        return state;
    }

    const modelPath = await findGgufFile(resolvedModelsDir);
    if (!modelPath) {
        throw new Error(
            `No .gguf model found in ${resolvedModelsDir}. ` +
                `Download a model first via POST /api/llm/models/pull.`,
        );
    }

    disposeState();

    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });
    const contextSize = Number(process.env.LLM_CONTEXT_SIZE) || 128000;
    const context = await model.createContext({ contextSize });

    state = { model, context, modelPath };
    currentModelPath = modelPath;

    return state;
}

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
// Agent handler
// ============================================================================

export const handleLocalNodeLlamaSDK = async ({
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
        "X-Accel-Buffering": "no",
    });

    // Flush headers immediately so the client sees the connection is alive
    // before we spend time loading the model (which can take seconds).
    res.flushHeaders();
    res.write(encoder.encode(":ok\r\n\r\n"));

    // --- Session directory ---
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
        /* ok */
    }

    const ac = new AbortController();
    // req.on("close", () => {
    //     if (!ac.signal.aborted) ac.abort();
    // });

    // --- Persist user message ---
    if (conversationId) {
        appendThreadMessage(workspacePath, conversationId, "user", message);
    }

    // Session is scoped outside the try block so we can dispose it in
    // `finally` and return the sequence to the context pool.
    let session: LlamaChatSession | null = null;

    try {
        const { context } = await ensureModelLoaded();

        // --- Load conversation history (for multi-turn context) ---
        let historyBlock = "";
        if (conversationId) {
            const msgs = await getThreadMessages(workspacePath, conversationId);
            if (msgs.length > 0) {
                historyBlock =
                    "\n# Conversation so far\n" +
                    msgs.map((m) => `${m.role}: ${m.content}`).join("\n") +
                    "\n\nContinue the conversation naturally.";
            }
        }

        // --- System prompt ---
        const systemPrompt = `# Role
You are an ai coding agent to help user.

# Tools
The tools you have are:
${TOOL_NAMES_DESC.join("\n")}

# Rule
You workspace is at: ${sessionPath}
You must only work at folder: ${sessionPath}
${historyBlock}`;

        // --- Build functions ---
        const functions = buildSessionFunctions(
            res,
            workspacePath,
            sessionPath,
        );

        // --- Create a fresh session per request (systemPrompt in constructor) ---
        session = new LlamaChatSession({
            contextSequence: context.getSequence(),
            systemPrompt,
        });

        // --- Init event ---
        writeSSEEvent(
            res,
            JSON.stringify({
                type: "system",
                subtype: "init",
                session_path: sessionPath,
                workspace_path: workspacePath || sessionPath,
                tools: TOOL_NAMES,
            }),
        );

        // --- Stream ---
        // onTextChunk fires only for the main text response.
        // onResponseChunk fires for ALL chunks including thinking/CoT segments.
        // We stream both types to the client immediately as they arrive.
        // The ChatBox's appendBubble merges consecutive same-kind bubbles,
        // so many small chunks coalesce into a single ThinkingBubble / TextBubble.
        let fullResponse = "";

        // Debug: log model inference start (check server console)
        console.log(
            "[local-llama] promptWithMeta starting (model: %s)",
            currentModelPath,
        );

        const result = await session.promptWithMeta(message, {
            functions: functions as any,
            onTextChunk: (chunk: string) => {
                if (!chunk) return; // skip empty boundary markers
                console.log("[local-llama] onTextChunk: %s", chunk);
                fullResponse += chunk;
                writeSSEEvent(
                    res,
                    JSON.stringify({
                        type: "text",
                        content: chunk,
                    }),
                );
            },
            onResponseChunk: (chunk) => {
                // Skip chunks with no text — node-llama-cpp emits zero-length
                // chunks as segment start/end boundary markers.
                if (!chunk.text) return;
                console.log(
                    "[local-llama] onResponseChunk type=%s segmentType=%s text=%s",
                    chunk.type ?? "undefined",
                    chunk.segmentType ?? "undefined",
                    chunk.text,
                );
                if (chunk.type === "segment") {
                    if (chunk.segmentType === "thought") {
                        writeSSEEvent(
                            res,
                            JSON.stringify({
                                type: "thinking",
                                content: chunk.text,
                            }),
                        );
                    }
                    // "comment" segments are handled internally by
                    // node-llama-cpp's function-calling machinery.
                }
                // type === undefined chunks are main text, already
                // handled by onTextChunk — no need to double-emit.
            },
            signal: ac.signal,
            stopOnAbortSignal: true,
            maxTokens: 4096,
        });

        console.log(
            "[local-llama] promptWithMeta done — stopReason=%s responseText=%s",
            result.stopReason,
            result.responseText,
        );

        // --- Persist ---
        const finalText = result.responseText?.trim() || fullResponse.trim();
        if (conversationId && finalText) {
            await appendThreadMessage(
                workspacePath,
                conversationId,
                "assistant",
                finalText,
            );
        }

        // --- Result footer with stop reason ---
        writeSSEEvent(
            res,
            JSON.stringify({
                type: "result",
                subtype: result.stopReason === "abort" ? "error" : "success",
                stop_reason: result.stopReason,
            }),
        );

        writeSSEEvent(res, JSON.stringify({ type: "agent_done" }));
        writeSSEEvent(res, "[DONE]");
    } catch (err: any) {
        console.error("[local-llama] error:", err.message ?? err);
        if (err.name === "AbortError") {
            writeSSEEvent(res, "[DONE]");
        } else {
            writeSSEEvent(
                res,
                JSON.stringify({
                    type: "error",
                    message: err.message ?? "Agent loop stream failed",
                }),
                "error",
            );
            // Signal stream end so the client stops waiting for more data
            writeSSEEvent(res, "[DONE]");
        }
    } finally {
        if (session) {
            try {
                session.dispose({ disposeSequence: true });
            } catch {
                /* best-effort cleanup */
            }
        }
        res.end();
    }
};
