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
		const command = selectedAgent.agent.commands[0];

		try {
			const response = await fetch(`${baseUrl}/api/chat/send`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "text/event-stream",
				},
				body: JSON.stringify({ command, message: content.trim(), cwd }),
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

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				const parts = buffer.split("\n\n");
				buffer = parts.pop() ?? "";

				for (const part of parts) {
					const lines = part.split("\n");
					for (const line of lines) {
						if (line.startsWith("data: ")) {
							const json = line.slice(6);
							if (json === "{}") continue; // done signal
							try {
								const chunk: { text: string; stream: string } =
									JSON.parse(json);
								// Append text to the assistant message
								set((s) => {
									const msgs = [...s.messages];
									const last = msgs[msgs.length - 1];
									if (last && last.role === "assistant") {
										msgs[msgs.length - 1] = {
											...last,
											content: last.content + chunk.text,
										};
									}
									return { messages: msgs };
								});
							} catch {
								// Skip unparseable frames
							}
						}
					}
				}
			}

			// Process remaining buffer
			if (buffer.trim()) {
				const line = buffer.trim();
				if (line.startsWith("data: ")) {
					const json = line.slice(6);
					if (json !== "{}") {
						try {
							const chunk: { text: string; stream: string } =
								JSON.parse(json);
							set((s) => {
								const msgs = [...s.messages];
								const last = msgs[msgs.length - 1];
								if (last && last.role === "assistant") {
									msgs[msgs.length - 1] = {
										...last,
										content: last.content + chunk.text,
									};
								}
								return { messages: msgs };
							});
						} catch {
							/* skip */
						}
					}
				}
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
