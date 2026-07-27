import { create } from "zustand";
import type { AgentResult } from "./agents.ts";

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}

interface ChatState {
    messages: ChatMessage[];
    selectedAgent: AgentResult | null;
    cwd: string;
    sending: boolean;
    error: string | null;
    controller: AbortController | null;

    setAgent: (agent: AgentResult | null) => void;
    setCwd: (path: string) => void;
    sendMessage: (content: string) => Promise<void>;
    cancelSend: () => void;
    clearMessages: () => void;
    clearError: () => void;
}

// ============================================================================
// Store
// ============================================================================

let nextId = 0;
function uid(): string {
    return `msg-${++nextId}-${Date.now()}`;
}

export const useChatStore = create<ChatState>((set, get) => ({
    messages: [],
    selectedAgent: null,
    cwd: "",
    sending: false,
    error: null,
    controller: null,

    setAgent: (agent) => {
        set({ selectedAgent: agent });
    },

    setCwd: (path) => {
        set({ cwd: path });
    },

    sendMessage: async (content: string) => {
        const { selectedAgent, cwd, controller: existingController } = get();
        if (!selectedAgent || !content.trim()) return;

        // Abort any in-flight send
        existingController?.abort();

        const userMsg: ChatMessage = {
            id: uid(),
            role: "user",
            content: content.trim(),
            timestamp: Date.now(),
        };

        const assistantMsg: ChatMessage = {
            id: uid(),
            role: "assistant",
            content: "",
            timestamp: Date.now(),
        };

        set({
            messages: [...get().messages, userMsg, assistantMsg],
            sending: true,
            error: null,
        });

        const controller = new AbortController();
        set({ controller });

        const baseUrl = "http://localhost:8390";
        const name = selectedAgent.agent.name;

        try {
            const response = await fetch(`${baseUrl}/api/chat/send`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                },
                body: JSON.stringify({
                    agentName: name,
                    message: content.trim(),
                    cwd,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                set({
                    sending: false,
                    error: `Server returned ${response.status}`,
                });
                return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                set({ sending: false, error: "No response body" });
                return;
            }

            const decoder = new TextDecoder();
            let buffer = "";

            // Helper: append text to the last assistant message
            const appendText = (text: string | undefined | null) => {
                if (text == null || text === "") return;
                set((s) => {
                    const msgs = [...s.messages];
                    const last = msgs[msgs.length - 1];
                    if (last && last.role === "assistant") {
                        msgs[msgs.length - 1] = {
                            ...last,
                            content: last.content + text,
                        };
                    }
                    return { messages: msgs };
                });
            };

            /** Process one complete SSE frame (delimited by \n\n) */
            const processFrame = (frame: string) => {
                const lines = frame.split("\n");
                let eventType = "";
                for (const line of lines) {
                    if (line.startsWith("event: ")) {
                        eventType = line.slice(7).trim();
                    } else if (line.startsWith("data: ")) {
                        const json = line.slice(6);
                        if (json === "{}") continue;

                        if (eventType === "error") {
                            try {
                                const err: { message?: string } =
                                    JSON.parse(json);
                                set({
                                    sending: false,
                                    error:
                                        err.message ?? "Unknown server error",
                                });
                            } catch {
                                set({
                                    sending: false,
                                    error: "Unknown server error",
                                });
                            }
                            continue;
                        }

                        try {
                            const chunk: {
                                text?: string;
                                stream?: string;
                            } = JSON.parse(json);
                            appendText(chunk.text);
                        } catch {
                            // Skip unparseable frames
                        }
                    }
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Decode the chunk — stream:true handles partial multi-byte
                // characters that may be split across chunk boundaries
                buffer += decoder.decode(value, { stream: true });

                // Split on SSE frame delimiter
                const parts = buffer.split("\n\n");
                // The last element may be an incomplete frame — keep it for next iteration
                buffer = parts.pop() ?? "";

                for (const part of parts) {
                    if (part) processFrame(part);
                }
            }

            // Flush the decoder — finalize any buffered multi-byte sequences
            buffer += decoder.decode();

            // Process any remaining complete frame
            if (buffer.trim()) {
                processFrame(buffer.trim());
            }

            set({ sending: false, controller: null });
        } catch (err) {
            if ((err as DOMException).name === "AbortError") {
                set({ sending: false, controller: null });
                return;
            }
            set({
                sending: false,
                error: (err as Error).message ?? "Unknown error",
                controller: null,
            });
        }
    },

    cancelSend: () => {
        const { controller } = get();
        controller?.abort();
        set({ sending: false, controller: null });
    },

    clearMessages: () => {
        const { controller } = get();
        controller?.abort();
        set({ messages: [], sending: false, error: null, controller: null });
    },

    clearError: () => {
        set({ error: null });
    },
}));
