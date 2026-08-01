// ============================================================================
// Local LLM router — model download and remote compatibility checks
// ============================================================================

import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import {
    getLlama,
    createModelDownloader,
    readGgufFileInfo,
    GgufInsights,
} from "node-llama-cpp";

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
        modelsDir ??
        path.join(app.getPath("appData"), "timeversation", "ai-models");

    // ------------------------------------------------------------------
    // POST /models/pull — download model from Hugging Face (SSE progress)
    // ------------------------------------------------------------------

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

            const modelPath = await downloader.download({
                signal: abortController.signal,
            });

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

    return router;
}
