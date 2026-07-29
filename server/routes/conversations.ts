// ============================================================================
// Conversations API — JSON-file-backed CRUD for conversation history
// ============================================================================

import { Router } from "express";
import { app, shell } from "electron";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { JSONFilePreset } from "lowdb/node";
import type { Low } from "lowdb";
import { getThreadMessages, deleteThread } from "../store/threadStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Conversation {
    id: string;
    title: string;
    agentSlug: string;
    sessionId?: string;
    createdAt: string;
    updatedAt: string;
}

interface DbSchema {
    conversations: Conversation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
    return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Shared lowdb instance (cached per file path so router + agent handlers
// share the same in-memory data and don't lose writes).
// ---------------------------------------------------------------------------

const dbCache = new Map<string, Low<DbSchema>>();

export async function getConversationsDb(workspacePath?: string) {
    const dbDir = path.join(workspacePath ?? process.cwd(), "conversations");
    mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, "db.json");

    const cached = dbCache.get(dbFile);
    if (cached) return cached;

    const db = await JSONFilePreset<DbSchema>(dbFile, { conversations: [] });
    dbCache.set(dbFile, db);
    return db;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export async function createConversationsRouter({
    workspacePath,
}: {
    workspacePath?: string;
}) {
    const db = await getConversationsDb(workspacePath);

    const router = Router();

    // -----------------------------------------------------------------------
    // GET /api/conversations — list all conversations
    // -----------------------------------------------------------------------
    router.get("/", (_req, res) => {
        const sorted = [...db.data.conversations].sort(
            (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
        );
        res.json(sorted);
    });

    // -----------------------------------------------------------------------
    // POST /api/conversations — create a new conversation
    // -----------------------------------------------------------------------
    router.post("/", async (req, res) => {
        const { agentSlug, title } = req.body as {
            agentSlug?: string;
            title?: string;
        };

        if (!agentSlug) {
            res.status(400).json({ error: "agentSlug is required" });
            return;
        }

        const conv: Conversation = {
            id: crypto.randomUUID(),
            title: title ?? "New conversation",
            agentSlug,
            createdAt: now(),
            updatedAt: now(),
        };

        db.data.conversations.push(conv);
        await db.write();

        res.status(201).json(conv);
    });

    // -----------------------------------------------------------------------
    // GET /api/conversations/:id — get a single conversation
    // -----------------------------------------------------------------------
    router.get("/:id", (req, res) => {
        const conv = db.data.conversations.find((c) => c.id === req.params.id);
        if (!conv) {
            res.status(404).json({ error: "Conversation not found" });
            return;
        }
        res.json(conv);
    });

    // -----------------------------------------------------------------------
    // PATCH /api/conversations/:id — update conversation (rename title)
    // -----------------------------------------------------------------------
    router.patch("/:id", async (req, res) => {
        const conv = db.data.conversations.find((c) => c.id === req.params.id);
        if (!conv) {
            res.status(404).json({ error: "Conversation not found" });
            return;
        }

        const { title } = req.body as { title?: string };
        if (title !== undefined) {
            conv.title = title;
            conv.updatedAt = now();
        }

        await db.write();
        res.json(conv);
    });

    // -----------------------------------------------------------------------
    // POST /api/conversations/:id/open-folder — open the session dir in Finder
    // -----------------------------------------------------------------------
    router.post("/:id/open-folder", async (_req, res) => {
        const conv = db.data.conversations.find((c) => c.id === _req.params.id);
        if (!conv || !conv.sessionId) {
            res.status(404).json({ error: "Session not found" });
            return;
        }

        const sessionPath = path.join(
            app.getPath("appData"),
            "timeversation",
            "sessions",
            conv.sessionId,
        );
        try {
            mkdirSync(sessionPath, { recursive: true });
        } catch (_) {
            // Directory already exists
        }
        await shell.openPath(sessionPath);
        res.json({ ok: true, path: sessionPath });
    });

    // -----------------------------------------------------------------------
    // DELETE /api/conversations/:id — delete a conversation and its thread
    // -----------------------------------------------------------------------
    router.delete("/:id", async (req, res) => {
        const idx = db.data.conversations.findIndex(
            (c) => c.id === req.params.id,
        );
        if (idx === -1) {
            res.status(404).json({ error: "Conversation not found" });
            return;
        }

        db.data.conversations.splice(idx, 1);
        await db.write();

        // Clean up the thread file
        await deleteThread(workspacePath, req.params.id);

        res.json({ ok: true });
    });

    // -----------------------------------------------------------------------
    // GET /api/conversations/:id/thread — load all messages for a conversation
    // -----------------------------------------------------------------------
    router.get("/:id/thread", async (req, res) => {
        const messages = await getThreadMessages(workspacePath, req.params.id);
        res.json(messages);
    });

    return router;
}
