// ============================================================================
// Setup page — download & manage local LLM models from Hugging Face
// ============================================================================

import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

// ============================================================================
// Constants
// ============================================================================

const API_BASE = "http://localhost:8390";

// ============================================================================
// Types
// ============================================================================

interface ModelFile {
    name: string;
    size: number;
    path: string;
}

interface ModelsList {
    modelsDir: string;
    files: ModelFile[];
    loaded: string | null;
}

interface SseProgress {
    type: "progress";
    downloadedSize: number;
    totalSize: number;
}

interface SseDone {
    type: "done";
    success: boolean;
    path: string;
    name: string;
}

interface SseCancelled {
    type: "cancelled";
    message: string;
}

interface SseError {
    type: "error";
    message: string;
}

type SseEvent = SseProgress | SseDone | SseCancelled | SseError;

interface ModelCompatInfo {
    modelPath: string;
    metadata: {
        version: number;
        tensorCount: number;
        splicedParts: number;
        totalTensorCount: number;
        metadataSize: number;
    };
    compatibility: { score: number; percent: string };
    flashAttention: { score: number; percent: string };
}

// ============================================================================
// Preset models for quick download
// ============================================================================

const PRESET_MODELS: Array<{ label: string; repo: string }> = [
    {
        label: "Gemma 4 E2B (Q6_K)",
        repo: "hf:giladgd/gemma-4-E2B-it-GGUF:Q6_K",
    },
    {
        label: "Gemma 4 E4B (Q4_K_M)",
        repo: "hf:giladgd/gemma-4-E4B-it-GGUF:Q4_K_M",
    },
    {
        label: "Gemma 4 12B (Q4_K_M)",
        repo: "hf:giladgd/gemma-4-12B-it-GGUF:Q4_K_M",
    },
    {
        label: "Gemma 4 26B-A4B (Q8_0)",
        repo: "hf:giladgd/gemma-4-26B-A4B-it-GGUF:Q8_0",
    },
];

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatPercent(downloaded: number, total: number): string {
    if (total === 0) return "0%";
    return `${Math.round((downloaded / total) * 100)}%`;
}

// ============================================================================
// SVG Icons
// ============================================================================

function ArrowLeftIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
    );
}

function DownloadIcon({ size = 16 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
        </svg>
    );
}

function FolderIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </svg>
    );
}

function FileIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <path d="M14 2v6h6" />
        </svg>
    );
}

function XIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

function AlertIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.8 1.6 18a2 2 0 0 0 1.7 3h17.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
        </svg>
    );
}

function ChipIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M9 2H5a3 3 0 0 0-3 3v4M15 2h4a3 3 0 0 1 3 3v4M9 22H5a3 3 0 0 1-3-3v-4M15 22h4a3 3 0 0 0 3-3v-4M2 12h20M12 2v20" />
        </svg>
    );
}

function LoaderIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-spin"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
}

function CircleDotIcon() {
    return (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
            <circle cx="4" cy="4" r="4" />
        </svg>
    );
}

// ============================================================================
// Component
// ============================================================================

export function SetupLLM() {
    const navigate = useNavigate();

    // --- State ---
    const [models, setModels] = useState<ModelsList | null>(null);
    const [repo, setRepo] = useState("hf:giladgd/gemma-4-E2B-it-GGUF:Q6_K");
    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<{
        downloaded: number;
        total: number;
        name?: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadingModel, setLoadingModel] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const [showPresets, setShowPresets] = useState(false);
    const [presetCompat, setPresetCompat] = useState<
        Record<string, { score: number; percent: string } | null>
    >({});
    const [checkingPresets, setCheckingPresets] = useState(false);

    // --- Check remote compatibility for preset models ---
    const checkPresetCompat = useCallback(async () => {
        setCheckingPresets(true);
        const results: Record<
            string,
            { score: number; percent: string } | null
        > = {};

        await Promise.all(
            PRESET_MODELS.map(async (preset) => {
                try {
                    const res = await fetch(
                        `${API_BASE}/api/llm/models/check-remote`,
                        {
                            method: "POST",
                            mode: "cors",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ repo: preset.repo }),
                        },
                    );
                    if (!res.ok) {
                        results[preset.repo] = null;
                        return;
                    }
                    const data = await res.json();
                    results[preset.repo] = {
                        score: data.compatibility.score,
                        percent: data.compatibility.percent,
                    };
                } catch {
                    results[preset.repo] = null;
                }
            }),
        );

        setPresetCompat(results);
        setCheckingPresets(false);
    }, []);

    // Auto-check preset compatibility on mount
    useEffect(() => {
        checkPresetCompat();
    }, [checkPresetCompat]);

    // --- Fetch models list ---
    const fetchModels = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/llm/models`, {
                mode: "cors",
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: ModelsList = await res.json();
            setModels(data);
        } catch {
            // Server may not be ready
        }
    }, []);

    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

    // --- Download model ---
    const startDownload = useCallback(async () => {
        if (!repo.trim()) return;

        setDownloading(true);
        setError(null);
        setDownloadProgress(null);

        const controller = new AbortController();
        abortRef.current = controller;

        let modelName = repo.trim();

        try {
            const res = await fetch(`${API_BASE}/api/llm/models/pull`, {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo: repo.trim() }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(
                    (err as { error?: string }).error ||
                        `Server returned ${res.status}`,
                );
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                // Keep the last partial line in the buffer
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data: ")) continue;

                    const jsonStr = trimmed.slice(6);
                    try {
                        const event: SseEvent = JSON.parse(jsonStr);

                        switch (event.type) {
                            case "progress":
                                setDownloadProgress({
                                    downloaded: event.downloadedSize,
                                    total: event.totalSize,
                                    name: modelName,
                                });
                                break;
                            case "done":
                                setDownloadProgress(null);
                                setRepo("");
                                break;
                            case "cancelled":
                                setDownloadProgress(null);
                                break;
                            case "error":
                                setError(event.message);
                                setDownloadProgress(null);
                                break;
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") {
                setDownloadProgress(null);
            } else if (!controller.signal.aborted) {
                setError(
                    err instanceof Error ? err.message : "Download failed",
                );
                setDownloadProgress(null);
            }
        } finally {
            setDownloading(false);
            abortRef.current = null;
            fetchModels();
        }
    }, [repo, fetchModels]);

    // --- Cancel download ---
    const cancelDownload = useCallback(async () => {
        abortRef.current?.abort();
        try {
            await fetch(`${API_BASE}/api/llm/models/cancel`, {
                method: "POST",
                mode: "cors",
            });
        } catch {
            // Best effort
        }
    }, []);

    // --- Load model and navigate to chat ---
    const loadModel = useCallback(
        async (modelPath: string) => {
            setLoadingModel(modelPath);
            try {
                const res = await fetch(`${API_BASE}/api/llm/models/load`, {
                    method: "POST",
                    mode: "cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        filename: modelPath.split("/").pop(),
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(
                        (err as { error?: string }).error ||
                            "Failed to load model",
                    );
                }
                await fetchModels();
                navigate("/chat/local");
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to load model",
                );
            } finally {
                setLoadingModel(null);
            }
        },
        [fetchModels, navigate],
    );

    // --- Select preset ---
    const selectPreset = (presetRepo: string) => {
        setRepo(presetRepo);
        setShowPresets(false);
    };

    // --- Derived state ---
    const hasModels = (models?.files.length ?? 0) > 0;

    // ==================================================================
    // Render
    // ==================================================================

    return (
        <main className="flex flex-col items-center px-6 pt-12 pb-16 min-h-screen bg-[var(--bg-canvas)]">
            {/* ---- Back link ---- */}
            <div className="w-full max-w-[680px] mb-6">
                <Link
                    to="/menu"
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
                >
                    <ArrowLeftIcon />
                    Back
                </Link>
            </div>

            {/* ---- Header ---- */}
            <section className="flex flex-col items-center text-center max-w-[560px] gap-2 mb-10">
                <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[var(--text-primary)] m-0">
                    Model Setup
                </h1>
                <p className="text-[13px] text-[var(--text-dim)] leading-relaxed max-w-[420px] m-0">
                    Download and manage local LLM models from Hugging Face.
                    Models are stored in your app data directory.
                </p>
            </section>

            {/* ---- Download Section ---- */}
            <section className="w-full max-w-[680px] mb-10">
                <div className="ps-panel p-5">
                    {/* Panel header */}
                    <div className="ps-panel-header -mx-5 -mt-5 mb-4 rounded-t-sm">
                        Download Model
                    </div>

                    {/* Repo input row */}
                    <div className="flex gap-2">
                        {/* Presets dropdown button */}
                        <div className="relative">
                            <button
                                type="button"
                                className="btn-secondary text-[12px] px-3 py-2 gap-1.5"
                                onClick={() => setShowPresets(!showPresets)}
                            >
                                <span className="whitespace-nowrap">
                                    Presets
                                </span>
                                <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </button>

                            {/* Preset dropdown menu */}
                            {showPresets && (
                                <div className="absolute left-0 top-full mt-1 z-10 border border-[var(--border-subtle)] rounded-sm bg-[var(--bg-surface)] shadow-sm min-w-[280px]">
                                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-dim)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                                        <span>Preset Models</span>
                                        {checkingPresets && <LoaderIcon />}
                                    </div>
                                    {PRESET_MODELS.map((preset) => {
                                        const compat =
                                            presetCompat[preset.repo];
                                        const isChecking =
                                            checkingPresets &&
                                            compat === undefined;

                                        return (
                                            <button
                                                key={preset.repo}
                                                type="button"
                                                className="w-full text-left px-3 py-2 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-subtle)] last:border-b-0 flex items-center gap-2"
                                                onClick={() =>
                                                    selectPreset(preset.repo)
                                                }
                                            >
                                                <span className="flex-1 min-w-0">
                                                    <span className="font-medium">
                                                        {preset.label}
                                                    </span>
                                                    <span className="block text-[10px] text-[var(--text-dim)] font-mono mt-0.5 truncate">
                                                        {preset.repo}
                                                    </span>
                                                </span>
                                                {/* Compatibility dot */}
                                                {isChecking ? (
                                                    <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-[var(--text-dim)] animate-pulse" />
                                                ) : compat ? (
                                                    <span
                                                        className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                                                            compat.score >= 0.8
                                                                ? "bg-lime-400 lime-pulse-dot"
                                                                : compat.score >=
                                                                    0.5
                                                                  ? "bg-amber-400"
                                                                  : "bg-red-400"
                                                        }`}
                                                        title={`Compatibility: ${compat.percent}`}
                                                    />
                                                ) : (
                                                    <span
                                                        className="shrink-0 w-2.5 h-2.5 rounded-full bg-[var(--border-subtle)]"
                                                        title="Compatibility unknown"
                                                    />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex-1">
                            <input
                                type="text"
                                className="input-field w-full text-[12px]"
                                placeholder="hf:user/repo or hf:user/repo:file.gguf"
                                value={repo}
                                onChange={(e) => setRepo(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !downloading) {
                                        startDownload();
                                    }
                                }}
                                disabled={downloading}
                            />
                        </div>

                        {!downloading ? (
                            <button
                                className="btn-primary text-[12px] px-4 py-2"
                                onClick={startDownload}
                                disabled={!repo.trim()}
                            >
                                <DownloadIcon size={14} />
                                Download
                            </button>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                <button
                                    className="btn-secondary text-[12px] px-4 py-2 text-red-500 border-red-200 hover:border-red-300 hover:bg-red-50 w-full"
                                    onClick={cancelDownload}
                                >
                                    <XIcon />
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="mt-4 flex items-start gap-2 p-3 rounded-sm bg-red-50 border border-red-200 text-[12px] text-red-700">
                            <span className="shrink-0 mt-0.5 text-red-400">
                                <AlertIcon />
                            </span>
                            <div className="flex-1 min-w-0">{error}</div>
                            <button
                                type="button"
                                className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
                                onClick={() => setError(null)}
                            >
                                <XIcon />
                            </button>
                        </div>
                    )}

                    <div className="mt-3">
                        {downloadProgress && (
                            <div className="w-full">
                                {/* Progress bar on top */}
                                <div className="progress-bar mb-1">
                                    <div
                                        className="progress-bar-fill"
                                        style={{
                                            width:
                                                downloadProgress.total > 0
                                                    ? `${Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%`
                                                    : "20%",
                                            transition:
                                                downloadProgress.total > 0
                                                    ? "width 0.3s var(--transition-easing)"
                                                    : "none",
                                            animation:
                                                downloadProgress.total === 0
                                                    ? "pulse-ring 2s ease-out infinite"
                                                    : undefined,
                                        }}
                                    />
                                </div>
                                {/* Description text below progress bar */}
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-[var(--text-dim)] tabular-nums">
                                        {downloadProgress.total > 0
                                            ? formatPercent(
                                                  downloadProgress.downloaded,
                                                  downloadProgress.total,
                                              )
                                            : formatBytes(
                                                  downloadProgress.downloaded,
                                              )}
                                    </span>
                                    <span className="text-[var(--text-dim)] tabular-nums">
                                        {formatBytes(
                                            downloadProgress.downloaded,
                                        )}
                                        {downloadProgress.total > 0 && (
                                            <>
                                                /
                                                {formatBytes(
                                                    downloadProgress.total,
                                                )}
                                            </>
                                        )}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* ---- Models Directory Info ---- */}
            {models && (
                <section className="w-full max-w-[680px] mb-8">
                    <div className="flex items-center gap-2">
                        <FolderIcon />
                        <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                            Models directory
                        </span>
                        <code className="text-[10px] text-[var(--text-dim)] truncate max-w-[400px]">
                            {models.modelsDir}
                        </code>
                        <button
                            type="button"
                            className="btn-secondary text-[11px] px-2.5 py-1 gap-1 shrink-0"
                            onClick={async () => {
                                try {
                                    await fetch(
                                        `${API_BASE}/api/llm/models/open-dir`,
                                        {
                                            method: "POST",
                                            mode: "cors",
                                        },
                                    );
                                } catch {
                                    // Best effort
                                }
                            }}
                            title="Open models folder in file manager"
                        >
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <path d="M15 3h6v6" />
                                <path d="M10 14 21 3" />
                            </svg>
                            Open Folder
                        </button>
                    </div>
                </section>
            )}

            {/* ---- Downloaded Models List ---- */}
            <section className="w-full max-w-[680px]">
                <div className="glass-card">
                    <div className="ps-panel-header px-4 py-2.5 flex items-center justify-between">
                        <span>Downloaded Models</span>
                        <span className="text-[10px] font-normal normal-case tracking-normal tabular-nums">
                            {models?.files.length ?? 0} model
                            {(models?.files.length ?? 0) !== 1 ? "s" : ""}
                        </span>
                    </div>

                    {!hasModels && (
                        <div className="px-4 py-8 text-center">
                            <div className="text-[var(--text-dim)] opacity-30 mb-3">
                                <ChipIcon />
                            </div>
                            <p className="text-[12px] text-[var(--text-dim)] m-0">
                                No models downloaded yet.
                            </p>
                            <p className="text-[11px] text-[var(--text-dim)] mt-1 m-0">
                                Enter a Hugging Face repo above to get started.
                            </p>
                        </div>
                    )}

                    {hasModels && (
                        <div className="divide-y divide-[var(--border-subtle)]">
                            {models!.files.map((file) => {
                                const isLoaded = file.path === models!.loaded;

                                return (
                                    <div
                                        key={file.path}
                                        className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                                            isLoaded
                                                ? "bg-[var(--bg-hover)]"
                                                : "hover:bg-[var(--bg-hover)]"
                                        }`}
                                    >
                                        {/* Icon */}
                                        <span
                                            className={`shrink-0 ${
                                                isLoaded
                                                    ? "text-[var(--tiffany)]"
                                                    : "text-[var(--text-dim)]"
                                            }`}
                                        >
                                            <FileIcon />
                                        </span>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`text-[12px] font-medium truncate ${
                                                        isLoaded
                                                            ? "text-[var(--text-primary)]"
                                                            : "text-[var(--text-primary)]"
                                                    }`}
                                                >
                                                    {file.name}
                                                </span>
                                                {isLoaded && (
                                                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-[var(--tiffany-deep)] bg-[var(--tiffany-glow)] px-1.5 py-0.5 rounded-sm">
                                                        <CircleDotIcon />
                                                        Loaded
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-[var(--text-dim)] font-mono">
                                                {formatBytes(file.size)}
                                            </span>

                                            {/* Compatibility info */}
                                            {compat && (
                                                <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                                                    <span
                                                        className={`inline-flex items-center gap-1 ${
                                                            compat.compatibility
                                                                .score >= 0.8
                                                                ? "text-green-600"
                                                                : compat
                                                                        .compatibility
                                                                        .score >=
                                                                    0.5
                                                                  ? "text-amber-600"
                                                                  : "text-red-600"
                                                        }`}
                                                    >
                                                        {compat.compatibility
                                                            .score >= 0.8 ? (
                                                            <CheckIcon />
                                                        ) : (
                                                            <AlertIcon />
                                                        )}
                                                        Compat:{" "}
                                                        {
                                                            compat.compatibility
                                                                .percent
                                                        }
                                                    </span>
                                                    <span className="text-[var(--text-dim)]">
                                                        Flash Attn:{" "}
                                                        {
                                                            compat
                                                                .flashAttention
                                                                .percent
                                                        }
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {/* Load model */}
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-medium text-[var(--tiffany-deep)] hover:text-white hover:bg-[var(--tiffany)] transition-colors disabled:opacity-40"
                                                onClick={() =>
                                                    loadModel(file.path)
                                                }
                                                disabled={
                                                    loadingModel === file.path
                                                }
                                            >
                                                {loadingModel === file.path ? (
                                                    <LoaderIcon />
                                                ) : (
                                                    <svg
                                                        width="12"
                                                        height="12"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth={2}
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M5 12h14M12 5l7 7-7 7" />
                                                    </svg>
                                                )}
                                                Load
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* ---- Footer tip ---- */}
            <p className="my-8 text-[10px] text-[var(--text-dim)] text-center max-w-[400px] leading-relaxed">
                Models are downloaded to your app data directory and run locally
                via node-llama-cpp. Larger models require more RAM and disk
                space.
            </p>
        </main>
    );
}
