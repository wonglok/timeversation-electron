import { execSync } from "node:child_process";
import type { ToolCallResult, ToolDefinition } from "./types";
import { BASH_TIMEOUT_MS } from "./types";

// ============================================================================
// Tool definition
// ============================================================================

export { BASH_TIMEOUT_MS };

export const bashToolDefinition: ToolDefinition = {
    type: "function",
    function: {
        name: "bash",
        description:
            "Execute a bash command in a terminal. Returns stdout on success; on failure returns exit code, stdout, and stderr. " +
            `Commands are killed after ${BASH_TIMEOUT_MS / 1000}s. Use for any shell operation: ` +
            "running scripts, installing packages, git operations, building, testing, etc.",
        parameters: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description:
                        "The bash command to execute. Runs in the workspace directory.",
                },
            },
            required: ["command"],
        },
    },
};

// ============================================================================
// Handler
// ============================================================================

/**
 * Execute a bash command.
 *
 * SECURITY NOTE: this intentionally accepts arbitrary commands from the LLM —
 * that is the purpose of a coding agent. Mitigations: 30s timeout, 1MB output
 * cap, workspace-scoped cwd. For stronger isolation, run the entire Electron
 * app inside a container/VM.
 */
export function handleBashTool(
    callId: string,
    args: Record<string, any>,
    cwd: string,
): ToolCallResult {
    try {
        const stdout = execSync(args.command, {
            cwd,
            timeout: BASH_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
            encoding: "utf-8",
            env: {
                ...process.env,
                HOME: process.env.HOME || "",
                PATH: process.env.PATH || "",
            },
        });
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                success: true,
                stdout: stdout.slice(0, 10000),
            }),
        };
    } catch (err: any) {
        return {
            tool_call_id: callId,
            role: "tool",
            content: JSON.stringify({
                error: true,
                exitCode: err.status ?? null,
                signal: err.signal ?? null,
                stdout: err.stdout
                    ? (typeof err.stdout === "string"
                          ? err.stdout
                          : err.stdout.toString("utf-8")
                      ).slice(0, 10000)
                    : "",
                stderr: err.stderr
                    ? (typeof err.stderr === "string"
                          ? err.stderr
                          : err.stderr.toString("utf-8")
                      ).slice(0, 10000)
                    : "",
                message: err.message ?? "Command failed",
                killed: err.killed ?? false,
            }),
        };
    }
}
