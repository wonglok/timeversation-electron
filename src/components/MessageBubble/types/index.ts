// ============================================================================
// MessageBubble types — barrel export
// ============================================================================

export type {
    // ACP raw events
    AcpEvent,
    AcpSystemEvent,
    AcpAssistantEvent,
    AcpResultSuccess,
    // ACP system subtypes
    AcpHookStarted,
    AcpHookProgress,
    AcpHookResponse,
    AcpInit,
    AcpThinkingTokens,
    AcpMcpServer,
    AcpPlugin,
    // ACP assistant
    AcpMessage,
    AcpContentBlock,
    AcpContentThinking,
    AcpContentText,
    AcpContentToolUse,
    // ACP result
    AcpModelUsageEntry,
    // Shared
    AcpUsage,
    // OpenCode ACP session/update
    OpenCodeSessionNotification,
    OpenCodeSessionUpdate,
    OpenCodeSessionUpdateKind,
    OpenCodeMessageChunk,
    OpenCodeThoughtChunk,
    OpenCodeToolCall,
    OpenCodeToolCallUpdate,
    OpenCodeUsageUpdate,
    OpenCodeAvailableCommandsUpdate,
    OpenCodeTextContent,
    OpenCodePlan,
    OpenCodeModeUpdate,
    OpenCodeUserMessageChunk,
} from "./acp";

export type {
    // UI model
    SimpleMessage,
    BubbleKind,
    Bubble,
    BubbleGroup,
} from "./message";
