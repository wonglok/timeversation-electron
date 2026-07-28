// ============================================================================
// Thread store — per-conversation message history in JSON files
// ============================================================================

import path from "node:path";
import { mkdirSync } from "node:fs";
import { JSONFilePreset } from "lowdb/node";
import type { Low } from "lowdb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThreadMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
}

interface ThreadSchema {
    messages: ThreadMessage[];
}

// ---------------------------------------------------------------------------
// Cache (per thread file path) so multiple reads share the same instance
// ---------------------------------------------------------------------------

const threadCache = new Map<string, Low<ThreadSchema>>();

// conversationId is always a crypto.randomUUID() — safe against traversal,
// but we validate for defense-in-depth.
function validateId(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) {
        throw new Error("Invalid UUID");
    }
}

export async function getThreadDb(
    workspacePath: string | undefined,
    conversationId: string,
) {
    validateId(conversationId);
    const dbDir = path.join(
        workspacePath ?? process.cwd(),
        "conversations",
        conversationId,
    );
    mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, "thread.json");

    const cached = threadCache.get(dbFile);
    if (cached) return cached;

    const db = await JSONFilePreset<ThreadSchema>(dbFile, { messages: [] });
    threadCache.set(dbFile, db);
    return db;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp(): string {
    return new Date().toISOString();
}

/** Append a single message and write to disk. */
export async function appendThreadMessage(
    workspacePath: string | undefined,
    conversationId: string,
    role: ThreadMessage["role"],
    content: string,
) {
    if (!content.trim()) return;
    const db = await getThreadDb(workspacePath, conversationId);
    db.data.messages.push({
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: timestamp(),
    });
    await db.write();
}

/** Read all messages for a conversation. */
export async function getThreadMessages(
    workspacePath: string | undefined,
    conversationId: string,
): Promise<ThreadMessage[]> {
    const db = await getThreadDb(workspacePath, conversationId);
    return db.data.messages;
}

/** Delete the thread file for a conversation. */
export async function deleteThread(
    workspacePath: string | undefined,
    conversationId: string,
) {
    threadCache.delete(
        path.join(
            workspacePath ?? process.cwd(),
            "conversations",
            conversationId,
            "thread.json",
        ),
    );
    // The file on disk will be orphaned but tiny; the DB cache entry is cleared
    // so a future getThreadDb call starts fresh.
}
