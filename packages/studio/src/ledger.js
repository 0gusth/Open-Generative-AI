// Client for the server-side generation ledger + pending render queue
// (app/api/history). The server file is the source of truth shared by every
// browser pointed at this app; all calls are fire-safe (errors never break a
// generation).

import toast from "react-hot-toast";
import { formatErrorMessage } from "./utils/formatError.js";

async function post(body) {
    try {
        await fetch("/api/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch { /* best-effort */ }
}

export async function fetchLedger() {
    try {
        const r = await fetch("/api/history");
        return r.ok ? await r.json() : [];
    } catch {
        return [];
    }
}

export async function fetchPending() {
    try {
        const r = await fetch("/api/history?pending=1");
        return r.ok ? await r.json() : [];
    } catch {
        return [];
    }
}

export function recordGeneration(entry) {
    return post({ action: "record", entry });
}

export function addPending(entry) {
    return post({ action: "add-pending", entry });
}

export function removePending(id) {
    return post({ action: "remove-pending", id });
}

// Reconcile pending Runware renders: ask getResponse for each, and when one
// finished, move it from the queue into the ledger. Runs from any browser
// that has the Runware key configured. Returns how many completed.
export async function reconcilePending() {
    let key = null;
    try {
        key = window.localStorage.getItem("provider_key_runware");
    } catch { /* no storage */ }
    if (!key) return 0;

    const pending = await fetchPending();
    let completed = 0;
    for (const item of pending) {
        if (item.provider !== "runware" || !item.id) continue;
        try {
            const r = await fetch("/api/providers/runware", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-provider-key": key },
                body: JSON.stringify([{ taskType: "getResponse", taskUUID: item.id }]),
            });
            const data = await r.json();
            // Definitive verdicts (content moderation, invalid input) come back
            // through errors[] — the render will never finish. Remove it from
            // the queue and tell the user WHY, or it polls forever in silence.
            const fatal = (data.errors || []).find((e) => e.taskUUID === item.id);
            if (fatal) {
                await removePending(item.id);
                toast.error(
                    `Render "${(item.prompt || item.model || "").slice(0, 40)}…" falhou: ${formatErrorMessage(fatal.message, "provider rejected the render")}`,
                    { duration: 12000, id: `pending-fail-${item.id}` },
                );
                continue;
            }
            const entry = (data.data || []).find((t) => t.taskUUID === item.id);
            if (!entry) continue;
            const url = entry.videoURL || entry.imageURL;
            const status = (entry.status || "").toLowerCase();
            if (url) {
                await recordGeneration({ ...item, url });
                await removePending(item.id);
                completed++;
            } else if (status === "error" || status === "failed") {
                await removePending(item.id);
            } else if (Date.now() - (item.startedAt || 0) > 3600000) {
                await removePending(item.id); // stale after 1h
            }
        } catch { /* transient — try again next cycle */ }
    }
    return completed;
}
