import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Productions — connected multi-scene projects, cross-browser like the
// ledger. Each production: { id, name, stylePrefix: {text, resolved, at},
// glossary: [{id, tag, kind, note, refUrl}], scenes: [{id, prompt,
// continuity, modelId, duration, aspect, accepted, lastTake}], createdAt,
// updatedAt }.
const DATA_DIR = path.join(process.cwd(), '.data');
const FILE = path.join(DATA_DIR, 'productions.json');

async function readAll() {
    try {
        return JSON.parse(await fs.readFile(FILE, 'utf8'));
    } catch {
        return { productions: [] };
    }
}

async function writeAll(data) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}

export async function GET() {
    return NextResponse.json(await readAll());
}

export async function POST(request) {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    const data = await readAll();

    if (body.action === 'create') {
        const name = (body.name || '').trim();
        if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
        const production = {
            id: crypto.randomUUID(),
            name,
            stylePrefix: null,
            glossary: [],
            scenes: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        data.productions.push(production);
        await writeAll(data);
        return NextResponse.json({ ok: true, production });
    }

    if (body.action === 'update') {
        const production = data.productions.find((p) => p.id === body.id);
        if (!production) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        for (const field of ['name', 'stylePrefix', 'glossary', 'scenes']) {
            if (body[field] !== undefined) production[field] = body[field];
        }
        production.updatedAt = new Date().toISOString();
        await writeAll(data);
        return NextResponse.json({ ok: true, production });
    }

    if (body.action === 'delete') {
        data.productions = data.productions.filter((p) => p.id !== body.id);
        await writeAll(data);
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
