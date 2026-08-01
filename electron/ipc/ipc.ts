// ============================================================================
// IPC handlers — registered before the BrowserWindow is created
// ============================================================================

import { app, shell, ipcMain } from "electron";
import path from "node:path";

export function registerIpcHandlers(): void {
    // ---- open-session-folder: reveal the per-conversation session dir ----
    ipcMain.handle(
        "open-session-folder",
        (_event, conversationId: string) => {
            const sessionPath = path.join(
                app.getPath("appData"),
                "timeversation",
                "sessions",
                conversationId,
            );
            void shell.openPath(sessionPath);
        },
    );
}
