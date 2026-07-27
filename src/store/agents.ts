import { create } from "zustand";

// Mirrors AgentDetectionResult from server/bring-agents/byoa.ts
export interface AgentResult {
    agent: {
        name: string;
        commands: string[];
        detectionArgs: string[];
        versionRegex?: RegExp;
        description?: string;
        homepage?: string;
        icon?: string;
    };
    installed: boolean;
    version?: string;
    binaryPath?: string;
    rawOutput?: string;
    error?: string;
}

type ScanStatus = "idle" | "scanning" | "done" | "error";

interface AgentsState {
    status: ScanStatus;
    results: AgentResult[];
    checked: number;
    total: number;
    error: string | null;

    /** Begin scanning via SSE stream. Returns an AbortController to cancel. */
    startScan: (baseUrl?: string) => AbortController;
    /** Reset back to idle */
    reset: () => void;
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
    status: "idle",
    results: [],
    checked: 0,
    total: 0,
    error: null,

    startScan: (baseUrl = "http://localhost:8390") => {
        const controller = new AbortController();
        const { reset } = get();

        // Reset before starting
        reset();
        set({ status: "scanning", total: 0 });

        const url = `${baseUrl}/api/agents/scan/stream`;

        // Use fetch with streaming so we can abort cleanly
        void (async () => {
            try {
                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: { Accept: "text/event-stream" },
                });

                if (!response.ok) {
                    set({
                        status: "error",
                        error: `Server returned ${response.status}`,
                    });
                    return;
                }

                const reader = response.body?.getReader();
                if (!reader) {
                    set({ status: "error", error: "No response body" });
                    return;
                }

                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    // Parse SSE frames: split on double-newline
                    const parts = buffer.split("\n\n");
                    // Last part may be incomplete — keep in buffer
                    buffer = parts.pop() ?? "";

                    for (const part of parts) {
                        const lines = part.split("\n");
                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                const json = line.slice(6);
                                if (json === "{}") continue; // done signal
                                try {
                                    const result: AgentResult =
                                        JSON.parse(json);
                                    set((s) => ({
                                        results: [...s.results, result],
                                        checked: s.checked + 1,
                                    }));
                                } catch {
                                    // Skip unparseable frames
                                }
                            }
                        }
                    }
                }

                // Process any remaining buffer
                if (buffer.trim()) {
                    const line = buffer.trim();
                    if (line.startsWith("data: ")) {
                        const json = line.slice(6);
                        if (json !== "{}") {
                            try {
                                const result: AgentResult = JSON.parse(json);
                                set((s) => ({
                                    results: [...s.results, result],
                                    checked: s.checked + 1,
                                }));
                            } catch {
                                /* skip */
                            }
                        }
                    }
                }

                set({ status: "done" });
            } catch (err) {
                if ((err as DOMException).name === "AbortError") {
                    // User cancelled — reset to idle
                    set({ status: "idle", results: [], checked: 0, total: 0 });
                    return;
                }
                set({
                    status: "error",
                    error: (err as Error).message ?? "Unknown error",
                });
            }
        })();

        return controller;
    },

    reset: () => {
        set({
            status: "idle",
            results: [],
            checked: 0,
            total: 0,
            error: null,
        });
    },
}));
