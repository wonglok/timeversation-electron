// ============================================================================
// Local LLM router — OpenAI-compatible chat endpoint via node-llama-cpp
// ============================================================================

import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
    getLlama,
    type LlamaModel,
    type LlamaContext,
    type LlamaContextSequence,
} from "node-llama-cpp";
import {
    OpenAIMock,
    type OpenAIMockConfig,
    type ChatCompletionCreateParams,
} from "../node-llama-cpp/OpenAISDKMock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Types
// ============================================================================

interface LlmState {
    model: LlamaModel;
    context: LlamaContext;
    sequence: LlamaContextSequence;
    client: OpenAIMock;
    modelPath: string;
}

// ============================================================================
// Router factory
// ============================================================================

export async function createOpenAiNodeLlamaRouter({
    modelsDir,
}: {
    modelsDir?: string;
} = {}) {
    const router = Router();
    const resolvedModelsDir = modelsDir ?? path.join(__dirname, "..", "..", "models");

    // ------------------------------------------------------------------
    // Model state (lazy singleton)
    // ------------------------------------------------------------------

    let state: LlmState | null = null;
    let currentModelPath: string | null = null;

    /** Find the first .gguf file in the models directory */
    function findGgufFile(dir: string): string | null {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
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

    /** Load (or return cached) the Llama model + OpenAIMock client */
    async function getClient(): Promise<OpenAIMock> {
        if (state && currentModelPath === state.modelPath) {
            return state.client;
        }

        const modelPath = findGgufFile(resolvedModelsDir);
        if (!modelPath) {
            throw new Error(
                `No .gguf model found in ${resolvedModelsDir}. ` +
                    `Download a model first via POST /api/llm/models/pull.`,
            );
        }

        // Dispose previous state if switching models
        if (state) {
            try { state.context.dispose(); } catch { /* ignore */ }
        }

        const llama = await getLlama();
        const model = await llama.loadModel({ modelPath });
        const contextSize = Number(process.env.LLM_CONTEXT_SIZE) || 8192;
        const context = await model.createContext({ contextSize });
        const sequence = context.getSequence();

        const config: OpenAIMockConfig = {
            model,
            context,
            contextSequence: sequence,
            modelName: path.basename(modelPath, ".gguf"),
            systemPrompt:
                "You are a helpful assistant. Keep responses clear and concise.",
        };

        const client = new OpenAIMock(config);
        state = { model, context, sequence, client, modelPath };
        currentModelPath = modelPath;

        return client;
    }

    // ------------------------------------------------------------------
    // POST /chat — OpenAI-compatible chat completions (SSE streaming)
    // ------------------------------------------------------------------

    router.post("/chat", async (req, res) => {
        const { messages, stream = true, temperature, max_tokens } =
            (req.body ?? {}) as ChatCompletionCreateParams & {
                messages: NonNullable<ChatCompletionCreateParams["messages"]>;
            };

        if (!messages || !Array.isArray(messages)) {
            res.status(400).json({ error: "messages array is required" });
            return;
        }

        if (stream) {
            // --- SSE streaming ---
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("X-Accel-Buffering", "no");
            res.flushHeaders();

            try {
                const client = await getClient();
                const result = await client.chat.completions.create({
                    messages,
                    stream: true,
                    temperature,
                    max_tokens,
                });

                for await (const chunk of result) {
                    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                }
                res.write("data: [DONE]\n\n");
                res.end();
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : String(err);
                res.write(
                    `data: ${JSON.stringify({ error: { message } })}\n\n`,
                );
                res.write("data: [DONE]\n\n");
                res.end();
            }
        } else {
            // --- Non-streaming ---
            try {
                const client = await getClient();
                const completion = await client.chat.completions.create({
                    messages,
                    stream: false,
                    temperature,
                    max_tokens,
                });
                res.json(completion);
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : String(err);
                res.status(500).json({ error: { message } });
            }
        }
    });

    // ------------------------------------------------------------------
    // POST /reset — clear conversation history
    // ------------------------------------------------------------------

    router.post("/reset", async (_req, res) => {
        try {
            const client = await getClient();
            client.chat.completions.resetHistory();
            res.json({ ok: true });
        } catch (err) {
            const message =
                err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: { message } });
        }
    });

    // ------------------------------------------------------------------
    // GET /models — list downloaded .gguf files
    // ------------------------------------------------------------------

    router.get("/models", (_req, res) => {
        try {
            const files: Array<{ name: string; size: number; path: string }> =
                [];
            if (fs.existsSync(resolvedModelsDir)) {
                const entries = fs.readdirSync(resolvedModelsDir, {
                    withFileTypes: true,
                });
                for (const entry of entries) {
                    if (entry.isFile() && entry.name.endsWith(".gguf")) {
                        const fullPath = path.join(
                            resolvedModelsDir,
                            entry.name,
                        );
                        const stat = fs.statSync(fullPath);
                        files.push({
                            name: entry.name,
                            size: stat.size,
                            path: fullPath,
                        });
                    }
                }
            }
            res.json({
                modelsDir: resolvedModelsDir,
                files,
                loaded: currentModelPath ?? null,
            });
        } catch (err) {
            const message =
                err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: { message } });
        }
    });

    // ------------------------------------------------------------------
    // GET /models/status — quick status check
    // ------------------------------------------------------------------

    router.get("/models/status", (_req, res) => {
        res.json({
            loaded: currentModelPath ?? null,
            modelName: currentModelPath
                ? path.basename(currentModelPath)
                : null,
            modelsDir: resolvedModelsDir,
        });
    });

    // ------------------------------------------------------------------
    // POST /models/pull — download model from Hugging Face (SSE progress)
    // ------------------------------------------------------------------

    router.post("/models/pull", (req, res) => {
        const { repo } = req.body as { repo?: string };

        if (!repo) {
            res.status(400).json({
                error: "repo is required (e.g. hf:google/gemma-4-E2B-it-qat-q4_0-gguf)",
            });
            return;
        }

        // Ensure models directory exists
        fs.mkdirSync(resolvedModelsDir, { recursive: true });

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        let child: ChildProcess;

        try {
            child = spawn(
                "npx",
                [
                    "node-llama-cpp",
                    "pull",
                    "--dir",
                    resolvedModelsDir,
                    repo,
                ],
                {
                    stdio: ["ignore", "pipe", "pipe"],
                    env: { ...process.env, FORCE_COLOR: "0" },
                },
            );
        } catch (err) {
            const message =
                err instanceof Error ? err.message : String(err);
            res.write(
                `data: ${JSON.stringify({ type: "error", message })}\n\n`,
            );
            res.end();
            return;
        }

        // Stream stdout line-by-line as progress events
        let buffer = "";
        child.stdout?.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                res.write(
                    `data: ${JSON.stringify({ type: "progress", text: trimmed })}\n\n`,
                );
            }
        });

        // Stream stderr as progress too (some tools write progress to stderr)
        let errBuffer = "";
        child.stderr?.on("data", (chunk: Buffer) => {
            errBuffer += chunk.toString();
            const lines = errBuffer.split("\n");
            errBuffer = lines.pop() ?? "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                res.write(
                    `data: ${JSON.stringify({ type: "progress", text: trimmed })}\n\n`,
                );
            }
        });

        child.on("close", (code) => {
            // Flush remaining buffers
            for (const buf of [buffer, errBuffer]) {
                const trimmed = buf.trim();
                if (trimmed) {
                    res.write(
                        `data: ${JSON.stringify({ type: "progress", text: trimmed })}\n\n`,
                    );
                }
            }

            if (code === 0) {
                // Unload current model if it was replaced
                if (state) {
                    try { state.context.dispose(); } catch { /* ignore */ }
                    state = null;
                    currentModelPath = null;
                }
                res.write(
                    `data: ${JSON.stringify({ type: "done", success: true })}\n\n`,
                );
            } else {
                res.write(
                    `data: ${JSON.stringify({ type: "error", message: `Pull exited with code ${code}` })}\n\n`,
                );
            }
            res.end();
        });

        child.on("error", (err) => {
            res.write(
                `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`,
            );
            res.end();
        });

        // Clean up on client disconnect
        req.on("close", () => {
            if (child && !child.killed) {
                child.kill();
            }
        });
    });

    return router;
}
