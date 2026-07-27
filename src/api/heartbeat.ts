const API_BASE = "http://localhost:8390";

export async function getHeartbeat(): Promise<string | null> {
    const res = await fetch(`${API_BASE}/api/health`, {
        method: "POST",
    });
    const data = (await res.json()) as { status: string | null };
    // ....
    return data.status;
}
