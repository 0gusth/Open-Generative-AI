import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Server-side generation ledger + pending render queue, stored on disk so
// every browser pointed at this server sees the same history.
const DATA_DIR = path.join(process.cwd(), '.data');
const LEDGER_FILE = path.join(DATA_DIR, 'generations.json');
const PENDING_FILE = path.join(DATA_DIR, 'pending.json');
const LEDGER_CAP = 500;

async function readJson(file, fallback) {
    try {
        return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
        return fallback;
    }
}

async function writeJson(file, value) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(value, null, 2));
}

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
            ledger.unshift({
                id: entry.id || Math.random().toString(36).slice(2),
                url: entry.url,
                prompt: entry.prompt || '',
                model: entry.model || '',
                provider: entry.provider || 'muapi',
                type: entry.type || 'image',
                aspect_ratio: entry.aspect_ratio || null,
                timestamp: entry.timestamp || new Date().toISOString(),
            });
        }
        await writeJson(LEDGER_FILE, ledger.slice(0, LEDGER_CAP));
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
