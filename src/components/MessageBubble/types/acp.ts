// ============================================================================
// ACP (Agent Communication Protocol) — raw NDJSON event types from
// the Claude Code `stream-json` output.
// ============================================================================

// ---- System events ----

export interface AcpHookStarted {
    type: "system";
    subtype: "hook_started";
    hook_id: string;
    hook_name: string;
    hook_event: string;
    uuid: string;
    session_id: string;
}

export interface AcpHookProgress {
    type: "system";
    subtype: "hook_progress";
    hook_id: string;
    hook_name: string;
    hook_event: string;
    stdout: string;
    stderr: string;
    output: string;
    uuid: string;
    session_id: string;
}

export interface AcpHookResponse {
    type: "system";
    subtype: "hook_response";
    hook_id: string;
    hook_name: string;
    hook_event: string;
    output: string;
    stdout: string;
    stderr: string;
    exit_code: number;
    outcome: "success" | string;
    uuid: string;
    session_id: string;
}

export interface AcpMcpServer {
    name: string;
    status: "connected" | "pending" | "failed";
}

export interface AcpPlugin {
    name: string;
    path: string;
    source: string;
}

export interface AcpInit {
    type: "system";
    subtype: "init";
    cwd: string;
    session_id: string;
    tools: string[];
    mcp_servers: AcpMcpServer[];
    model: string;
    permissionMode: string;
    slash_commands: string[];
    apiKeySource: string;
    claude_code_version: string;
    output_style: string;
    agents: string[];
    skills: string[];
    plugins: AcpPlugin[];
    capabilities: string[];
    analytics_disabled: boolean;
    product_feedback_disabled: boolean;
    uuid: string;
    memory_paths: { auto: string };
    fast_mode_state: string;
}

export interface AcpThinkingTokens {
    type: "system";
    subtype: "thinking_tokens";
    estimated_tokens: number;
    estimated_tokens_delta: number;
    uuid: string;
    session_id: string;
}

/** Discriminated union of all system event subtypes. */
export type AcpSystemEvent =
    | AcpHookStarted
    | AcpHookProgress
    | AcpHookResponse
    | AcpInit
    | AcpThinkingTokens;

// ---- Assistant events ----

/** Usage stats reported per message. */
export interface AcpUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    service_tier?: string;
    cache_creation?: {
        ephemeral_1h_input_tokens: number;
        ephemeral_5m_input_tokens: number;
    };
}

/** Thinking block inside assistant content. */
export interface AcpContentThinking {
    type: "thinking";
    thinking: string;
    signature?: string;
}

/** Text block inside assistant content. */
export interface AcpContentText {
    type: "text";
    text: string;
}

/** Tool-use block inside assistant content. */
export interface AcpContentToolUse {
    type: "tool_use";
    id?: string;
    name: string;
    input: Record<string, unknown>;
}

export type AcpContentBlock =
    | AcpContentThinking
    | AcpContentText
    | AcpContentToolUse;

/** The message payload carried by an assistant event. */
export interface AcpMessage {
    id: string;
    type: "message";
    role: "assistant";
    model: string;
    content: AcpContentBlock[];
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: AcpUsage;
    context_management: unknown | null;
}

export interface AcpAssistantEvent {
    type: "assistant";
    message: AcpMessage;
    parent_tool_use_id: string | null;
    session_id: string;
    uuid: string;
    timestamp: string;
}

// ---- Result events ----

export interface AcpModelUsageEntry {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
    costUSD: number;
    contextWindow: number;
    maxOutputTokens: number;
}

export interface AcpResultSuccess {
    type: "result";
    subtype: "success";
    is_error: false;
    api_error_status: null;
    duration_ms: number;
    duration_api_ms: number;
    ttft_ms: number;
    ttft_stream_ms: number;
    time_to_request_ms: number;
    num_turns: number;
    result: string;
    stop_reason: string;
    session_id: string;
    total_cost_usd: number;
    usage: AcpUsage & {
        server_tool_use?: { web_search_requests: number; web_fetch_requests: number };
    };
    modelUsage: Record<string, AcpModelUsageEntry>;
    permission_denials: unknown[];
    terminal_reason: string;
    fast_mode_state: string;
    uuid: string;
}

// ---- Top-level discriminated union ----

/** Every possible NDJSON line the Claude Code ACP stream can emit. */
export type AcpEvent =
    | AcpSystemEvent
    | AcpAssistantEvent
    | AcpResultSuccess;
