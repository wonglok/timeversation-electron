// ============================================================================
// ChatBox — messages list + input bar for the chat room
// ============================================================================

import type { Bubble } from "../MessageBubble/types";
import {
    AcpBubble,
    LoadingBubble,
    EmptyChat,
    ResultFooter,
    groupBubbles,
} from "../MessageBubble/MessageBubble";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatBoxProps {
    bubbles: Bubble[];
    sending: boolean;
    input: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    onStop: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    agentName: string;
    emptyTitle: string;
    emptySubtitle?: string;
    scrollRef: React.RefObject<HTMLDivElement | null>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatBox({
    bubbles,
    sending,
    input,
    onInputChange,
    onSend,
    onStop,
    onKeyDown,
    agentName,
    emptyTitle,
    emptySubtitle,
    scrollRef,
}: ChatBoxProps) {
    return (
        <div className="flex-1 flex flex-col min-w-0">
            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto py-6 flex flex-col gap-4 max-w-[720px] mx-auto w-full px-4"
            >
                {bubbles.length === 0 && (
                    <EmptyChat
                        title={emptyTitle}
                        subtitle={emptySubtitle}
                    />
                )}

                {groupBubbles(bubbles).map((group) => (
                    <div key={group.id} className="flex flex-col gap-1.5">
                        {group.bubbles.map((b) => (
                            <AcpBubble key={b.id} bubble={b} />
                        ))}
                        {group.resultFooter && (
                            <ResultFooter
                                usage={group.resultFooter.usage}
                                cost={group.resultFooter.cost}
                                durationMs={group.resultFooter.durationMs}
                            />
                        )}
                    </div>
                ))}

                {sending && <LoadingBubble />}
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 py-4 px-6 border-t border-[var(--border-subtle)] shrink-0 max-w-[720px] mx-auto w-full">
                <textarea
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={`Message ${agentName}...`}
                    disabled={sending}
                    rows={1}
                    className="input-field flex-1 resize-none max-h-32"
                />
                {sending ? (
                    <button
                        className="btn-primary !px-4 !py-2 bg-red-500 hover:bg-red-600"
                        onClick={onStop}
                    >
                        Stop
                    </button>
                ) : (
                    <button
                        className="btn-primary !px-4 !py-2"
                        onClick={onSend}
                        disabled={!input.trim()}
                    >
                        Send
                    </button>
                )}
            </div>
        </div>
    );
}
