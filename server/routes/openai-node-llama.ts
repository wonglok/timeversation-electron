// ============================================================================
// Local LLM router — OpenAI-compatible chat endpoint via node-llama-cpp
// ============================================================================

import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { app, shell } from "electron";
import {
    getLlama,
    createModelDownloader,
    readGgufFileInfo,
    GgufInsights,
    type LlamaModel,
    type LlamaContext,
    type LlamaContextSequence,
    type ModelDownloader,
} from "node-llama-cpp";
import {
    OpenAIMock,
    type OpenAIMockConfig,
    type ChatCompletionCreateParams,
} from "../node-llama-cpp/OpenAISDKMock.js";

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
    const resolvedModelsDir =
        modelsDir ?? path.join(app.getPath("appData"), "ai-models");

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
            try {
                state.context.dispose();
            } catch {
                /* ignore */
            }
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
        const {
            messages,
            stream = true,
            temperature,
            max_tokens,
        } = (req.body ?? {}) as ChatCompletionCreateParams & {
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
            const message = err instanceof Error ? err.message : String(err);
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
            const message = err instanceof Error ? err.message : String(err);
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
    // POST /models/check — check model compatibility with current system
    // ------------------------------------------------------------------

    router.post("/models/check", async (req, res) => {
        const { modelPath: targetPath } = req.body as {
            modelPath?: string;
        };

        // Resolve path: if user provides a name/filename, resolve it within
        // the models dir (strip any traversal). Otherwise find the first .gguf.
        let resolvedPath: string | null;

        if (targetPath) {
            // Only allow a plain filename — strip any directory components
            const safeName = path.basename(targetPath);
            if (!safeName.endsWith(".gguf")) {
                res.status(400).json({
                    error: "modelPath must be a .gguf filename or omitted",
                });
                return;
            }
            resolvedPath = path.join(resolvedModelsDir, safeName);
        } else {
            resolvedPath = findGgufFile(resolvedModelsDir);
        }

        if (!resolvedPath) {
            res.status(400).json({
                error: "No model path provided and no .gguf found in models directory",
            });
            return;
        }

        // Guard: verify the resolved real path stays inside the models directory
        if (!fs.existsSync(resolvedPath)) {
            res.status(404).json({
                error: `Model file not found: ${path.basename(resolvedPath)}`,
            });
            return;
        }

        const modelsRoot = path.resolve(resolvedModelsDir);
        const realPath = fs.realpathSync(resolvedPath);
        if (!realPath.startsWith(modelsRoot + path.sep)) {
            res.status(403).json({ error: "Access denied" });
            return;
        }

        try {
            const llama = await getLlama();
            const modelMetadata = await readGgufFileInfo(resolvedPath);

            const insights = await GgufInsights.from(modelMetadata, llama);
            const resolvedConfig =
                await insights.configurationResolver.resolveAndScoreConfig();
            const flashAttentionConfig =
                await insights.configurationResolver.resolveAndScoreConfig({
                    flashAttention: true,
                });

            res.json({
                modelPath: resolvedPath,
                metadata: {
                    version: modelMetadata.version,
                    tensorCount: Number(modelMetadata.tensorCount),
                    splicedParts: modelMetadata.splicedParts,
                    totalTensorCount: Number(modelMetadata.totalTensorCount),
                    metadataSize: modelMetadata.metadataSize,
                },
                compatibility: {
                    score: resolvedConfig.compatibilityScore,
                    percent: `${Math.round(resolvedConfig.compatibilityScore * 100)}%`,
                },
                flashAttention: {
                    score: flashAttentionConfig.compatibilityScore,
                    percent: `${Math.round(flashAttentionConfig.compatibilityScore * 100)}%`,
                },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: { message } });
        }
    });

    // ------------------------------------------------------------------
    // POST /models/pull — download model from Hugging Face (SSE progress)
    // ------------------------------------------------------------------

    // Track active downloads so we can cancel them
    let activeDownloader: ModelDownloader | null = null;
    router.post("/models/pull", async (req, res) => {
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

        const abortController = new AbortController();

        // // Clean up on client disconnect
        // req.on("close", () => {
        //     abortController.abort();
        //     if (activeDownloader) {
        //         activeDownloader.cancel().catch(() => {});
        //         activeDownloader = null;
        //     }
        // });

        try {
            const downloader = await createModelDownloader({
                modelUri: repo,
                dirPath: resolvedModelsDir,
                showCliProgress: false,
                onProgress: (status) => {
                    res.write(
                        `data: ${JSON.stringify({
                            type: "progress",
                            downloadedSize: status.downloadedSize,
                            totalSize: status.totalSize,
                        })}\n\n`,
                    );
                },
            });

            activeDownloader = downloader;

            const modelPath = await downloader.download({
                signal: abortController.signal,
            });

            activeDownloader = null;

            // Unload current model so next chat request picks up the new one
            if (state) {
                try {
                    state.context.dispose();
                } catch {
                    /* ignore */
                }
                state = null;
                currentModelPath = null;
            }

            res.write(
                `data: ${JSON.stringify({
                    type: "done",
                    success: true,
                    path: modelPath,
                    name: path.basename(modelPath),
                })}\n\n`,
            );
            res.end();
        } catch (err) {
            activeDownloader = null;

            if ((err as Error).name === "AbortError") {
                res.write(
                    `data: ${JSON.stringify({
                        type: "cancelled",
                        message: "Download cancelled",
                    })}\n\n`,
                );
            } else {
                const message =
                    err instanceof Error ? err.message : String(err);
                res.write(
                    `data: ${JSON.stringify({
                        type: "error",
                        message,
                    })}\n\n`,
                );
            }
            res.end();
        }
    });

    // ------------------------------------------------------------------
    // POST /models/cancel — cancel an active download
    // ------------------------------------------------------------------

    router.post("/models/cancel", async (_req, res) => {
        if (activeDownloader) {
            try {
                await activeDownloader.cancel();
                activeDownloader = null;
                res.json({ ok: true });
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : String(err);
                res.status(500).json({ error: { message } });
            }
        } else {
            res.json({ ok: true, message: "No active download" });
        }
    });

    // ------------------------------------------------------------------
    // POST /models/check-remote — compatibility check for a remote model URI
    // ------------------------------------------------------------------

    router.post("/models/check-remote", async (req, res) => {
        const { repo } = req.body as { repo?: string };

        if (!repo) {
            res.status(400).json({
                error: "repo is required (e.g. hf:user/repo:file.gguf)",
            });
            return;
        }

        // Only allow hf: URIs — prevents local file access via file:// or /abs/path
        if (!/^hf:[a-zA-Z0-9_.\-/]+[a-zA-Z0-9_.\-/:]+$/.test(repo)) {
            res.status(400).json({
                error: "repo must be an hf: URI (e.g. hf:user/repo:file.gguf)",
            });
            return;
        }

        try {
            const llama = await getLlama();
            const modelMetadata = await readGgufFileInfo(repo);

            const insights = await GgufInsights.from(modelMetadata, llama);
            const resolvedConfig =
                await insights.configurationResolver.resolveAndScoreConfig();
            const flashAttentionConfig =
                await insights.configurationResolver.resolveAndScoreConfig({
                    flashAttention: true,
                });

            res.json({
                repo,
                metadata: {
                    version: modelMetadata.version,
                    tensorCount: Number(modelMetadata.tensorCount),
                    splicedParts: modelMetadata.splicedParts,
                    totalTensorCount: Number(modelMetadata.totalTensorCount),
                    metadataSize: modelMetadata.metadataSize,
                },
                compatibility: {
                    score: resolvedConfig.compatibilityScore,
                    percent: `${Math.round(resolvedConfig.compatibilityScore * 100)}%`,
                },
                flashAttention: {
                    score: flashAttentionConfig.compatibilityScore,
                    percent: `${Math.round(flashAttentionConfig.compatibilityScore * 100)}%`,
                },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: { message } });
        }
    });

    // ------------------------------------------------------------------
    // POST /models/open-dir — open the models directory in file manager
    // ------------------------------------------------------------------

    router.post("/models/open-dir", async (_req, res) => {
        try {
            const dir = resolvedModelsDir;
            fs.mkdirSync(dir, { recursive: true });
            const openErr = await shell.openPath(dir);
            if (openErr) {
                res.status(500).json({ error: openErr });
                return;
            }
            res.json({ ok: true, path: dir });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: { message } });
        }
    });

    return router;
}
