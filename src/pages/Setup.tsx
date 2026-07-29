// ============================================================================
// Setup page — download & manage local LLM models from Hugging Face
// ============================================================================

import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:8390";
const HF_REPO = "google/gemma-4-E2B-it-qat-q4_0-gguf";
const HF_API = `https://huggingface.co/api/models/${HF_REPO}`;

// ============================================================================
// Types
// ============================================================================

interface HfSibling {
    rfilename: string;
    size?: number;
}

interface DownloadedFile {
    name: string;
    size: number;
    path: string;
}

interface ModelsResponse {
    modelsDir: string;
    files: DownloadedFile[];
    loaded: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ============================================================================
// SVG Icons
// ============================================================================

function DownloadIcon() {
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
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}

function CheckCircleIcon() {
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
        >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22,4 12,14.01 9,11.01" />
        </svg>
    );
}

function ArrowLeftIcon() {
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
        >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12,19 5,12 12,5" />
        </svg>
    );
}

function SpinnerIcon() {
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

function FolderIcon() {
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
        >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    );
}

// ============================================================================
// Component
// ============================================================================

export function Setup() {
    const navigate = useNavigate();

    // --- State ---
    const [hfFiles, setHfFiles] = useState<HfSibling[]>([]);
    const [hfLoading, setHfLoading] = useState(true);
    const [hfError, setHfError] = useState<string | null>(null);

    const [downloaded, setDownloaded] = useState<DownloadedFile[]>([]);
    const [loadedModel, setLoadedModel] = useState<string | null>(null);

    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadLog, setDownloadLog] = useState<string[]>([]);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    const logEndRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // --- Fetch Hugging Face file list ---
    const fetchHfFiles = useCallback(async () => {
        setHfLoading(true);
        setHfError(null);
        try {
            const res = await fetch(HF_API, { mode: "cors" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const siblings: HfSibling[] = data.siblings ?? [];
            // Only show .gguf files
            setHfFiles(
                siblings.filter((s) => s.rfilename.endsWith(".gguf")),
            );
        } catch (err) {
            setHfError(
                err instanceof Error ? err.message : "Failed to fetch files",
            );
        } finally {
            setHfLoading(false);
        }
    }, []);

    // --- Fetch downloaded models from backend ---
    const fetchDownloaded = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/llm/models`, {
                mode: "cors",
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: ModelsResponse = await res.json();
            setDownloaded(data.files);
            setLoadedModel(data.loaded);
        } catch {
            // Server not available — no models shown
        }
    }, []);

    // --- Initial load ---
    useEffect(() => {
        fetchHfFiles();
        fetchDownloaded();
    }, [fetchHfFiles, fetchDownloaded]);

    // --- Auto-scroll download log ---
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [downloadLog]);

    // --- Start download ---
    async function handleDownload(repo: string, filename: string) {
        setDownloading(filename);
        setDownloadLog([]);
        setDownloadError(null);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch(`${API_BASE}/api/llm/models/pull`, {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo }),
                signal: controller.signal,
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let buf = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buf += decoder.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data: ")) continue;

                    const jsonStr = trimmed.slice(6);
                    try {
                        const event = JSON.parse(jsonStr);

                        if (event.type === "progress") {
                            setDownloadLog((prev) => [...prev, event.text]);
                        } else if (event.type === "done") {
                            setDownloadLog((prev) => [
                                ...prev,
                                "Download complete.",
                            ]);
                            await fetchDownloaded();
                        } else if (event.type === "error") {
                            setDownloadError(event.message);
                        }
                    } catch {
                        // Skip malformed JSON lines
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                setDownloadError(
                    err instanceof Error ? err.message : "Download failed",
                );
            }
        } finally {
            setDownloading(null);
            abortRef.current = null;
        }
    }

    // --- Cancel download ---
    function handleCancel() {
        abortRef.current?.abort();
    }

    // --- Check if a file is downloaded ---
    const downloadedNames = new Set(downloaded.map((d) => d.name));
    const downloadedSizeByName = new Map(
        downloaded.map((d) => [d.name, d.size]),
    );

    return (
        <main className="flex flex-col px-6 pt-16 pb-16 min-h-screen bg-[var(--bg-canvas)]">
            {/* ---- Header ---- */}
            <div className="flex items-center gap-3 mb-10">
                <button
                    onClick={() => navigate("/menu")}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-[11px] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                    <ArrowLeftIcon />
                    Back
                </button>
                <div className="flex-1" />
            </div>

            {/* ---- Title ---- */}
            <section className="flex flex-col items-center text-center mb-10">
                <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[var(--text-primary)] m-0">
                    Model Setup
                </h1>
                <p className="text-[12px] text-[var(--text-dim)] mt-2 max-w-[420px] leading-relaxed">
                    Download GGUF models from Hugging Face to run locally with
                    node-llama-cpp.
                </p>
                <a
                    href={`https://huggingface.co/${HF_REPO}/tree/main`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--tiffany)] mt-1 hover:underline"
                >
                    {HF_REPO}
                </a>
            </section>

            {/* ---- Models Grid ---- */}
            <section className="flex flex-col items-center w-full max-w-[680px] mx-auto">
                {/* Section label */}
                <div className="flex items-center gap-2 mb-4 w-full">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-dim)]">
                        Available models
                    </span>
                    <span className="text-[10px] text-[var(--text-dim)] tabular-nums">
                        {downloaded.length}/{hfFiles.length} downloaded
                    </span>
                </div>

                {/* Loading */}
                {hfLoading && (
                    <div className="flex items-center gap-2 text-[12px] text-[var(--text-dim)] py-8">
                        <SpinnerIcon />
                        Fetching model list from Hugging Face...
                    </div>
                )}

                {/* Error */}
                {hfError && (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <p className="text-[12px] text-red-400">{hfError}</p>
                        <button
                            onClick={fetchHfFiles}
                            className="px-3 py-1 rounded-sm text-[11px] font-medium text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-panel)] hover:border-[var(--tiffany)] transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* File cards */}
                {!hfLoading && !hfError && (
                    <div className="flex flex-col gap-2 w-full">
                        {hfFiles.map((file) => {
                            const isDownloaded = downloadedNames.has(
                                file.rfilename,
                            );
                            const localSize = downloadedSizeByName.get(
                                file.rfilename,
                            );
                            const isDownloading =
                                downloading === file.rfilename;

                            return (
                                <div
                                    key={file.rfilename}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-sm border transition-colors ${
                                        isDownloaded
                                            ? "bg-[var(--bg-surface)] border-[var(--border-panel)]"
                                            : "bg-[var(--bg-panel)] border-transparent"
                                    }`}
                                >
                                    {/* Status icon */}
                                    <span
                                        className={
                                            isDownloaded
                                                ? "text-[var(--tiffany)]"
                                                : "text-[var(--text-dim)]"
                                        }
                                    >
                                        {isDownloaded ? (
                                            <CheckCircleIcon />
                                        ) : (
                                            <FolderIcon />
                                        )}
                                    </span>

                                    {/* File info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate m-0">
                                            {file.rfilename}
                                        </p>
                                        <p className="text-[10px] text-[var(--text-dim)] m-0">
                                            {isDownloaded && localSize
                                                ? `Downloaded — ${formatBytes(localSize)}`
                                                : file.size
                                                  ? formatBytes(file.size)
                                                  : "Unknown size"}
                                        </p>
                                    </div>

                                    {/* Action button */}
                                    {isDownloaded ? (
                                        <span className="text-[10px] text-[var(--tiffany)] font-medium">
                                            Ready
                                        </span>
                                    ) : isDownloading ? (
                                        <button
                                            onClick={handleCancel}
                                            className="flex items-center gap-1.5 px-3 py-1 rounded-sm text-[11px] font-medium text-red-400 bg-red-400/10 border border-red-400/30 hover:bg-red-400/20 transition-colors"
                                        >
                                            <SpinnerIcon />
                                            Cancel
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() =>
                                                handleDownload(
                                                    `hf:${HF_REPO}`,
                                                    file.rfilename,
                                                )
                                            }
                                            className="flex items-center gap-1.5 px-3 py-1 rounded-sm text-[11px] font-medium text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-panel)] hover:border-[var(--tiffany)] hover:bg-[var(--bg-hover)] transition-colors"
                                        >
                                            <DownloadIcon />
                                            Download
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        {hfFiles.length === 0 && (
                            <p className="text-[12px] text-[var(--text-dim)] text-center py-8">
                                No .gguf files found in this repository.
                            </p>
                        )}
                    </div>
                )}
            </section>

            {/* ---- Download progress log ---- */}
            {(downloadLog.length > 0 || downloadError) && (
                <section className="mt-8 w-full max-w-[680px] mx-auto">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-dim)]">
                            Download progress
                        </span>
                    </div>
                    <div className="bg-[var(--bg-panel)] border border-[var(--border-panel)] rounded-sm p-3 max-h-[200px] overflow-y-auto font-mono text-[11px] leading-relaxed text-[var(--text-dim)]">
                        {downloadLog.map((line, i) => (
                            <div key={i} className="whitespace-pre-wrap">
                                {line}
                            </div>
                        ))}
                        {downloadError && (
                            <div className="text-red-400 mt-1">
                                Error: {downloadError}
                            </div>
                        )}
                        <div ref={logEndRef} />
                    </div>
                </section>
            )}

            {/* ---- Loaded model indicator ---- */}
            {loadedModel && (
                <section className="mt-6 w-full max-w-[680px] mx-auto">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-dim)]">
                            Loaded model
                        </span>
                        <span className="text-[10px] text-[var(--tiffany)] font-mono">
                            {loadedModel.split("/").pop()}
                        </span>
                    </div>
                </section>
            )}
        </main>
    );
}
