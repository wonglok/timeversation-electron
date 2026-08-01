// ============================================================================
// Local LLM router — model download and remote compatibility checks
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
} from "node-llama-cpp";
import { getLoadedModelPath } from "../agnets/handleLocalNodeLlamaSDK";

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

    // Track the active download AbortController so /cancel can stop it
    let activeDownloadAbort: AbortController | null = null;

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
                loaded: getLoadedModelPath(),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: message });
        }
    });

    // ------------------------------------------------------------------
    // POST /models/cancel — cancel an active download
    // ------------------------------------------------------------------

    router.post("/models/cancel", (_req, res) => {
        if (activeDownloadAbort) {
            activeDownloadAbort.abort();
            activeDownloadAbort = null;
        }
        res.json({ cancelled: true });
    });

    // ------------------------------------------------------------------
    // POST /models/open-dir — open the models folder in the system file manager
    // ------------------------------------------------------------------

    router.post("/models/open-dir", (_req, res) => {
        try {
            if (!fs.existsSync(resolvedModelsDir)) {
                fs.mkdirSync(resolvedModelsDir, { recursive: true });
            }
            shell.openPath(resolvedModelsDir);
            res.json({ opened: resolvedModelsDir });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: message });
        }
    });

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
        activeDownloadAbort = abortController;

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
            activeDownloadAbort = null;
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
            activeDownloadAbort = null;
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
