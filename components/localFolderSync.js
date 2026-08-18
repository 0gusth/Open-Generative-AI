// Local folder for the ONLINE app — without the server ever touching the
// user's disk. The BROWSER owns a directory handle per project (File System
// Access API, Chrome/Edge), persisted in IndexedDB, and downloads every
// generation of that project into the folder. Because the source of truth is
// the server ledger, the folder also catches up on generations made from
// OTHER devices the next time the app opens here.

const DB_NAME = 'ogai-folder-sync';
const STORE = 'handles';

export const folderSyncSupported = () =>
    typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function idb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function saveFolderHandle(projectId, handle) {
    const db = await idb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(handle, projectId);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function getFolderHandle(projectId) {
    try {
        const db = await idb();
        return await new Promise((resolve) => {
            const q = db.transaction(STORE, 'readonly').objectStore(STORE).get(projectId);
            q.onsuccess = () => resolve(q.result || null);
            q.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

export async function removeFolderHandle(projectId) {
    try {
        const db = await idb();
        await new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(projectId);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    } catch { /* best-effort */ }
}

// 'granted' | 'prompt' | 'none'
export async function folderStatus(projectId) {
    const handle = await getFolderHandle(projectId);
    if (!handle) return 'none';
    try {
        return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'granted' : 'prompt';
    } catch {
        return 'prompt';
    }
}

// Mirrors the naming the Mac server uses for project folders.
function fileNameFor(entry) {
    const stamp = (entry.timestamp || '').replace(/[:.]/g, '-').slice(0, 19) || `gen-${entry.id || ''}`;
    const slug = (entry.prompt || entry.model || 'generation')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-|-$/g, '');
    const ext = entry.type === 'video'
        ? 'mp4'
        : (String(entry.url).split('?')[0].match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || 'png').toLowerCase();
    return `${stamp}-${slug || 'generation'}.${ext}`;
}

// Download every generation of the project into its folder. Idempotent —
// files that already exist are skipped, so this can run on every delivery
// and on every app open. `interactive` allows the permission re-prompt
// (needs a user gesture); silent runs bail out instead.
export async function syncProjectFolder(projectId, { interactive = false, onProgress } = {}) {
    const handle = await getFolderHandle(projectId);
    if (!handle) return null;
    try {
        let perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
            if (!interactive) return { needsPermission: true };
            perm = await handle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') return { denied: true };
        }
    } catch {
        return { denied: true };
    }

    const all = await fetch('/api/history').then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const entries = (Array.isArray(all) ? all : []).filter((e) => e.projectId === projectId && e.url);
    let saved = 0, skipped = 0, failed = 0;
    for (const entry of entries) {
        const name = fileNameFor(entry);
        try {
            await handle.getFileHandle(name);
            skipped++;
            continue; // already on disk
        } catch { /* not there yet — download it */ }
        try {
            // proxy-media: same-origin, follows the unlock cookie, and dodges
            // the CDN's missing CORS headers.
            const resp = await fetch(`/api/proxy-media?url=${encodeURIComponent(entry.url)}`);
            if (!resp.ok) throw new Error(`proxy ${resp.status}`);
            const blob = await resp.blob();
            const fileHandle = await handle.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            saved++;
            onProgress?.({ saved, total: entries.length });
        } catch {
            failed++;
        }
    }
    return { saved, skipped, failed, total: entries.length, folder: handle.name };
}
