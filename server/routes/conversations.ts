// ============================================================================
// Conversations API — JSON-file-backed CRUD for conversation history
// ============================================================================

import { Router } from "express";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { JSONFilePreset } from "lowdb/node";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Conversation {
    id: string;
    title: string;
    agentSlug: string;
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
// Router factory
// ---------------------------------------------------------------------------

export async function createConversationsRouter({
    workspacePath,
}: {
    workspacePath?: string;
}) {
    const dbDir = path.join(workspacePath ?? process.cwd(), "conversations");
    mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, "db.json");

    const db = await JSONFilePreset<DbSchema>(dbFile, {
        conversations: [],
    });

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
        const conv = db.data.conversations.find(
            (c) => c.id === req.params.id,
        );
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
        const conv = db.data.conversations.find(
            (c) => c.id === req.params.id,
        );
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
    // DELETE /api/conversations/:id — delete a conversation
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

        res.json({ ok: true });
    });

    return router;
}
