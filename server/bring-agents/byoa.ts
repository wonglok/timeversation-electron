import { spawn, type ChildProcess } from "node:child_process";

// ============================================================================
// Types
// ============================================================================

/** Definition of a CLI coding agent to detect */
export interface AgentDefinition {
    /** Human-readable display name */
    name: string;
    /** CLI command(s) to try — first that resolves wins */
    commands: string[];
    /** Args to pass for version / detection (e.g. ["--version"]) */
    detectionArgs: string[];
    /** Regex to extract semver from combined stdout+stderr; group 1 = version */
    versionRegex?: RegExp;
    /** Short description of the agent */
    description?: string;
    /** Homepage or repo URL */
    homepage?: string;
    /** Icon / logo identifier (emoji or URL) for UI display */
    icon?: string;
}

/** Result of detecting a single agent */
export interface AgentDetectionResult {
    agent: AgentDefinition;
    installed: boolean;
    /** Extracted version string, if detected */
    version?: string;
    /** The specific binary command that resolved */
    binaryPath?: string;
    /** Raw stdout from the detection command (first 2000 chars) */
    rawOutput?: string;
    /** Error message if detection failed */
    error?: string;
}

/** Options for scanning */
export interface ScanOptions {
    /** Timeout per detection attempt in ms (default: 8000) */
    timeout?: number;
    /** Agents to scan (defaults to BUILTIN_AGENTS) */
    agents?: AgentDefinition[];
    /** AbortSignal for cancelling the scan */
    signal?: AbortSignal;
}

/** Progress event emitted during streaming scan */
export interface ScanProgressEvent {
    /** How many agents have been checked so far */
    checked: number;
    /** Total agents to check */
    total: number;
    /** The latest result */
    result: AgentDetectionResult;
}

// ============================================================================
// Built-in agent registry
// ============================================================================

/**
 * Registry of known CLI coding agents and how to detect them.
 * Each entry lists possible binary names (first match wins) and the args
 * to invoke for a version/detection check.
 */
export const BUILTIN_AGENTS: AgentDefinition[] = [
    {
        name: "Claude Code",
        commands: ["claude"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Anthropic's agentic coding CLI tool",
        homepage: "https://docs.anthropic.com/en/docs/claude-code",
        icon: "claude",
    },
    {
        name: "Kilo Code",
        commands: ["kilocode"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Open-source AI coding agent with multi-provider support",
        homepage: "https://github.com/kilocode/kilocode",
        icon: "kilocode",
    },
    {
        name: "OpenAI Codex CLI",
        commands: ["codex"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "OpenAI's terminal-based coding agent",
        homepage: "https://github.com/openai/codex",
        icon: "codex",
    },
    {
        name: "Qwen Code",
        commands: ["qwencode", "qwen-code", "qwen"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Alibaba's Qwen-powered coding CLI agent",
        homepage: "https://github.com/QwenLM/qwen-code",
        icon: "qwen",
    },
    {
        name: "OpenCode",
        commands: ["opencode"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Open-source terminal coding agent with MCP support",
        homepage: "https://github.com/opencode-ai/opencode",
        icon: "opencode",
    },
    {
        name: "Kimi Code",
        commands: ["kimicode", "kimi-code", "kimi"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Moonshot AI's Kimi-powered coding agent",
        homepage: "https://github.com/MoonshotAI/kimi-code",
        icon: "kimi",
    },
    {
        name: "Pi Coding Agent",
        commands: ["pi", "pi-coding-agent", "pi-agent"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Pi AI coding assistant CLI",
        homepage: "https://github.com/pi-ai/pi-coding-agent",
        icon: "pi",
    },
    {
        name: "Gemini CLI",
        commands: ["gemini"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Google's Gemini-powered CLI agent",
        homepage: "https://github.com/google-gemini/gemini-cli",
        icon: "gemini",
    },
    {
        name: "Aider",
        commands: ["aider"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description:
            "AI pair programming in your terminal with multi-model support",
        homepage: "https://github.com/Aider-AI/aider",
        icon: "handshake",
    },
    {
        name: "Amazon Q Developer CLI",
        commands: ["q"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "AWS Q Developer command-line coding assistant",
        homepage: "https://aws.amazon.com/q/developer/",
        icon: "cloud",
    },
    {
        name: "Cursor CLI",
        commands: ["cursor"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Cursor AI editor CLI tools",
        homepage: "https://cursor.com",
        icon: "cursor",
    },
    {
        name: "Windsurf CLI",
        commands: ["windsurf"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Codeium's Windsurf IDE command-line interface",
        homepage: "https://codeium.com/windsurf",
        icon: "windsurf",
    },
    {
        name: "GitHub Copilot (gh extension)",
        commands: ["gh"],
        detectionArgs: ["copilot", "--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "GitHub Copilot via gh CLI extension",
        homepage: "https://docs.github.com/en/copilot",
        icon: "copilot",
    },
    {
        name: "Tabby",
        commands: ["tabby"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Self-hosted AI coding assistant with open-source models",
        homepage: "https://github.com/TabbyML/tabby",
        icon: "cat",
    },
    {
        name: "Cline CLI",
        commands: ["cline"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Cline's autonomous coding agent CLI",
        homepage: "https://github.com/cline/cline",
        icon: "cline",
    },
    {
        name: "Roo Code",
        commands: ["roo-code", "roocode"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Roo Code AI coding assistant CLI",
        homepage: "https://github.com/RooVetGit/Roo-Code",
        icon: "roocode",
    },
    {
        name: "Node.js (baseline)",
        commands: ["node"],
        detectionArgs: ["--version"],
        versionRegex: /^v(\d+\.\d+\.\d+)/m,
        description: "Node.js JavaScript runtime (baseline check)",
        homepage: "https://nodejs.org",
        icon: "heart",
    },
    {
        name: "Bun (baseline)",
        commands: ["bun"],
        detectionArgs: ["--version"],
        versionRegex: /(\d+\.\d+\.\d+)/,
        description: "Bun all-in-one JavaScript runtime & toolkit",
        homepage: "https://bun.sh",
        icon: "package",
    },
];

// ============================================================================
// Utility: spawn a command and collect stdio
// ============================================================================

interface SpawnResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
}

/**
 * Spawn a command with piped stdio, collect all output, and resolve with the
 * result.  Rejects on spawn errors (ENOENT, etc.) and kills the child if the
 * timeout expires.
 */
function spawnForOutput(
    command: string,
    args: string[],
    timeoutMs: number,
    signal?: AbortSignal,
): Promise<SpawnResult> {
    return new Promise<SpawnResult>((resolve, reject) => {
        // If already aborted, bail early
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }

        let settled = false;

        const child: ChildProcess = spawn(command, args, {
            stdio: ["ignore", "pipe", "pipe"],
            timeout: timeoutMs,
            signal,
            // Prevent detached children from lingering
            detached: false,
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });

        child.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        const finish = (result: SpawnResult) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };

        const fail = (err: Error & { code?: string }) => {
            if (settled) return;
            settled = true;
            reject(err);
        };

        child.on("exit", (exitCode, sig) => {
            finish({ stdout, stderr, exitCode, signal: sig });
        });

        child.on("close", (exitCode, sig) => {
            finish({ stdout, stderr, exitCode, signal: sig });
        });

        child.on("error", (err: Error & { code?: string }) => {
            // ENOENT = command not found — surface cleanly
            fail(err);
        });

        // AbortSignal cleanup
        if (signal) {
            const onAbort = () => {
                if (!settled) {
                    child.kill("SIGKILL");
                }
            };
            signal.addEventListener("abort", onAbort, { once: true });
        }
    });
}

// ============================================================================
// Main class
// ============================================================================

/**
 * Scans the system for installed CLI coding agents using `spawn` + stdio
 * detection.  Provides both batch (`scan`) and streaming (`scanStream`)
 * APIs so callers can show results in real time.
 *
 * @example
 * ```ts
 * const byoa = new BringYourOwnAgent();
 *
 * // Batch scan
 * const results = await byoa.scan();
 * const installed = results.filter(r => r.installed);
 * console.table(installed.map(r => ({ name: r.agent.name, version: r.version })));
 *
 * // Streaming scan (for live UI updates)
 * for await (const result of byoa.scanStream()) {
 *   emit("agent-detected", result);
 * }
 * ```
 */
export class BringYourOwnAgent {
    private _agents: AgentDefinition[];

    constructor(agents?: AgentDefinition[]) {
        this._agents = agents ?? BUILTIN_AGENTS;
    }

    // -- Accessors -----------------------------------------------------------

    /** Return a copy of the current agent registry */
    get agents(): AgentDefinition[] {
        return [...this._agents];
    }

    /** Replace the agent registry */
    set agents(list: AgentDefinition[]) {
        this._agents = [...list];
    }

    // -- Detection -----------------------------------------------------------

    /**
     * Try to detect a single agent by running each of its `commands` in order.
     * The first command that spawns successfully and produces output is used.
     * Returns a structured result regardless of success / failure.
     */
    async detectAgent(
        agent: AgentDefinition,
        timeoutMs: number,
        signal?: AbortSignal,
    ): Promise<AgentDetectionResult> {
        for (const command of agent.commands) {
            try {
                const { stdout, stderr, exitCode } = await spawnForOutput(
                    command,
                    agent.detectionArgs,
                    timeoutMs,
                    signal,
                );

                const combined = (stdout + stderr).trim();

                // Accept: clean exit OR non-zero but produced output
                // (some CLIs write --version to stderr or exit non-zero on help)
                if (combined.length > 0 && exitCode !== null) {
                    const version = agent.versionRegex
                        ? (combined.match(agent.versionRegex)?.[1] ?? undefined)
                        : combined.split("\n")[0];

                    return {
                        agent,
                        installed: true,
                        version,
                        binaryPath: command,
                        rawOutput: combined.slice(0, 2000),
                    };
                }

                // Process ran but produced no output — try next command
            } catch (err) {
                // ENOENT = binary not found — try next command in the list
                const code = (err as NodeJS.ErrnoException).code;
                if (code === "ENOENT") continue;

                // Timeout or kill — not installed for this command
                if (
                    code === "ETIMEDOUT" ||
                    (err as DOMException).name === "AbortError"
                ) {
                    return {
                        agent,
                        installed: false,
                        error: `Command timed out: ${command}`,
                    };
                }

                // Other unexpected error — try next command
                continue;
            }
        }

        return {
            agent,
            installed: false,
            error: "No matching binary found in PATH",
        };
    }

    // -- Batch scan ----------------------------------------------------------

    /**
     * Scan all registered agents in parallel and return results once every
     * detection has settled.
     *
     * Uses `Promise.allSettled` internally so one hung agent cannot block
     * the whole scan — individual timeouts per agent still apply.
     */
    async scan(options?: ScanOptions): Promise<AgentDetectionResult[]> {
        const agents = options?.agents ?? this._agents;
        const timeout = options?.timeout ?? 8000;
        const signal = options?.signal;

        const results = await Promise.all(
            agents.map((agent) => this.detectAgent(agent, timeout, signal)),
        );

        return results;
    }

    // -- Streaming scan ------------------------------------------------------

    /**
     * Scan agents **sequentially** and yield each result as it completes.
     * Perfect for a progress bar or live-updating UI where the user sees
     * agents appear one-by-one.
     *
     * @example
     * ```ts
     * for await (const result of byoa.scanStream()) {
     *   if (result.installed) {
     *     console.log(`[OK] ${result.agent.name} ${result.version}`);
     *   } else {
     *     console.log(`[MISS] ${result.agent.name}`);
     *   }
     * }
     * ```
     */
    async *scanStream(
        options?: ScanOptions,
    ): AsyncGenerator<AgentDetectionResult> {
        const agents = options?.agents ?? this._agents;
        const timeout = options?.timeout ?? 8000;
        const signal = options?.signal;

        for (const agent of agents) {
            if (signal?.aborted) break;
            yield await this.detectAgent(agent, timeout, signal);
        }
    }

    // -- Convenience methods -------------------------------------------------

    /**
     * Scan and return only agents that were successfully detected.
     */
    async getInstalled(options?: ScanOptions): Promise<AgentDetectionResult[]> {
        const results = await this.scan(options);
        return results.filter((r) => r.installed);
    }

    /**
     * Look up a single agent by name and detect it.
     * Returns `null` if the agent name isn't in the registry.
     */
    async detectByName(
        name: string,
        timeoutMs = 8000,
        signal?: AbortSignal,
    ): Promise<AgentDetectionResult | null> {
        const agent = this._agents.find(
            (a) => a.name.toLowerCase() === name.toLowerCase(),
        );
        if (!agent) return null;
        return this.detectAgent(agent, timeoutMs, signal);
    }
}
