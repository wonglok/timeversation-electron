import { app } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { appendThreadMessage } from "../store/threadStore";
import {
    createAgentSession,
    ModelRuntime,
    SessionManager,
    SettingsManager,
    createExtensionRuntime,
    type AgentSession,
    type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

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
// Pi Coding Agent handler — uses @earendil-works/pi-coding-agent configured
// to talk to a local LLM instead of the built-in provider list.
// ============================================================================

export const handleLocalPiAgent = async ({
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

    // Abort signal for client disconnect
    let aborted = false;
    let session: AgentSession | null = null;

    req.on("close", () => {
        aborted = true;
        session?.abort();
    });

    // --- Persist user message ---
    if (conversationId) {
        appendThreadMessage(workspacePath, conversationId, "user", message);
    }

    let assistantText = "";

    try {
        // --- Build model runtime with local LLM provider ---
        const modelRuntime = await ModelRuntime.create({
            authPath: path.join(sessionPath, "auth.json"),
            modelsPath: null, // Don't use models.json — we register manually
        });

        // Register the local LLM as a custom provider
        modelRuntime.registerProvider("local-llm", {
            name: "Local LLM",
            baseUrl: "http://localhost:8390/api/llm",
            apiKey: "ppap",
            models: [
                {
                    id: "default",
                    name: "Local LLM",
                    reasoning: true,
                    input: ["text"],
                    contextWindow: 128_000,
                    maxTokens: 8_192,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                },
            ],
        });

        const model = modelRuntime.getModel("local-llm", "default");
        if (!model) {
            throw new Error("Failed to resolve local LLM model");
        }

        // --- Create agent session with full coding tools ---
        const result = await createAgentSession({
            cwd: sessionPath,
            model,
            thinkingLevel: "high",
            modelRuntime,
            sessionManager: SessionManager.inMemory(sessionPath),
            settingsManager: SettingsManager.inMemory({
                compaction: { enabled: false },
                retry: { enabled: false },
            }),
            resourceLoader: {
                getExtensions: () => ({
                    extensions: [],
                    errors: [],
                    runtime: createExtensionRuntime(),
                }),
                getSkills: () => ({ skills: [], diagnostics: [] }),
                getPrompts: () => ({ prompts: [], diagnostics: [] }),
                getThemes: () => ({ themes: [], diagnostics: [] }),
                getAgentsFiles: () => ({ agentsFiles: [] }),
                getSystemPrompt: () =>
                    `You are a helpful coding assistant with tool access.
You can read, write, edit files, and execute bash commands.
Work in the directory: ${sessionPath}
Be concise and direct in your responses.`,
                getAppendSystemPrompt: () => [],
                extendResources: () => {},
                reload: async () => {},
            },
            tools: ["read", "bash", "edit", "write", "grep"],
        });

        session = result.session;

        // --- Subscribe to events → forward as SSE ---
        session.subscribe((event: AgentSessionEvent) => {
            if (aborted) return;

            switch (event.type) {
                case "message_start":
                    // New message starting — reset per-message accumulators
                    break;

                case "message_update": {
                    const evt = event.assistantMessageEvent;
                    if (evt.type === "text_delta" && evt.delta) {
                        assistantText += evt.delta;
                        writeSSEEvent(
                            res,
                            JSON.stringify({
                                type: "text",
                                content: evt.delta,
                            }),
                        );
                    } else if (evt.type === "thinking_delta" && evt.delta) {
                        writeSSEEvent(
                            res,
                            JSON.stringify({
                                type: "thinking",
                                content: evt.delta,
                            }),
                        );
                    }
                    break;
                }

                case "message_end":
                    // Message completed — text already accumulated
                    break;

                case "tool_execution_start":
                    writeSSEEvent(
                        res,
                        JSON.stringify({
                            type: "tool_use",
                            toolName: event.toolName ?? "unknown",
                            toolInput: event.args,
                        }),
                    );
                    break;

                case "tool_execution_end":
                    // Tool finished
                    break;

                case "agent_end":
                case "agent_settled":
                    // Turn complete
                    break;

                case "compaction_start":
                case "compaction_end":
                    // Ignore compaction events
                    break;

                default:
                    // Forward unknown events for debugging
                    break;
            }
        });

        // --- Send the message and wait for the turn to complete ---
        await session.sendUserMessage(message);

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
        if (aborted || err.name === "AbortError") {
            writeSSEEvent(res, "[DONE]");
        } else {
            writeSSEEvent(
                res,
                JSON.stringify({
                    type: "error",
                    message: err.message ?? "Pi Agent stream failed",
                }),
                "error",
            );
        }
    } finally {
        session?.dispose();
        res.end();
    }
};
