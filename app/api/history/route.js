import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { readDoc, writeDoc } from '../../../lib/serverStore';

async function activeProject() {
    try {
        const registry = await readDoc('projects', { projects: [], activeId: null });
        return registry.projects.find((p) => p.id === registry.activeId) || null;
    } catch {
        return null;
    }
}

// Download a generated media URL into the project folder (best-effort — the
// ledger entry is the source of truth even if the file copy fails).
async function saveToProject(project, entry) {
    // Folder copies only exist where there IS a folder (local/Docker).
    // Serverless projects are logical groupings — the ledger still tags
    // entries with projectId.
    if (!project?.path) return null;
    try {
        const res = await fetch(entry.url);
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get('content-type') || '';
        const ext = entry.type === 'video' ? 'mp4'
            : contentType.includes('png') ? 'png'
            : contentType.includes('webp') ? 'webp'
            : 'jpg';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const slug = (entry.prompt || entry.model || 'generation')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-|-$/g, '');
        const filename = `${stamp}-${slug || 'generation'}.${ext}`;
        await fs.writeFile(path.join(project.path, filename), buf);
        return filename;
    } catch {
        return null;
    }
}

// Server-side generation ledger + pending render queue, stored on disk so
// every browser pointed at this server sees the same history.
const LEDGER_FILE = 'generations';
const PENDING_FILE = 'pending';
const LEDGER_CAP = 500;

const readJson = (doc, fallback) => readDoc(doc, fallback);
const writeJson = (doc, value) => writeDoc(doc, value);

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('pending') === '1') {
        return NextResponse.json(await readJson(PENDING_FILE, []));
    }
    return NextResponse.json(await readJson(LEDGER_FILE, []));
}

export async function POST(request) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    if (body.action === 'add-pending') {
        const pending = await readJson(PENDING_FILE, []);
        if (!pending.some((p) => p.id === body.entry?.id)) {
            pending.unshift({ ...body.entry, startedAt: body.entry?.startedAt || Date.now() });
        }
        await writeJson(PENDING_FILE, pending.slice(0, 50));
        return NextResponse.json({ ok: true });
    }

    if (body.action === 'remove-pending') {
        const pending = await readJson(PENDING_FILE, []);
        await writeJson(PENDING_FILE, pending.filter((p) => p.id !== body.id));
        return NextResponse.json({ ok: true });
    }

    if (body.action === 'record') {
        const ledger = await readJson(LEDGER_FILE, []);
        const entry = body.entry || {};
        if (entry.url && !ledger.some((e) => e.url === entry.url)) {
            const project = await activeProject();
            const localFile = project ? await saveToProject(project, entry) : null;
            ledger.unshift({
                id: entry.id || Math.random().toString(36).slice(2),
                url: entry.url,
                prompt: entry.prompt || '',
                model: entry.model || '',
                provider: entry.provider || 'muapi',
                type: entry.type || 'image',
                aspect_ratio: entry.aspect_ratio || null,
                cost: typeof entry.cost === 'number' ? entry.cost : null,
                costEstimated: !!entry.costEstimated,
                resolved: entry.resolved || null,
                seed: typeof entry.seed === 'number' ? entry.seed : null,
                studio: entry.studio || null,
                projectId: project?.id || null,
                localFile,
                timestamp: entry.timestamp || new Date().toISOString(),
            });
        }
        await writeJson(LEDGER_FILE, ledger.slice(0, LEDGER_CAP));
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
