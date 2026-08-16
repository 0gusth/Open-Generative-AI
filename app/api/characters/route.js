import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Saved characters registry — cross-browser, like projects and the ledger.
// Each character: { id, name (the @tag, no spaces), identity (visible-marker
// block, age-blind), refUrl (hosted reference image), createdAt }.
const DATA_DIR = path.join(process.cwd(), '.data');
const FILE = path.join(DATA_DIR, 'characters.json');

async function readAll() {
    try {
        return JSON.parse(await fs.readFile(FILE, 'utf8'));
    } catch {
        return { characters: [] };
    }
}

async function writeAll(data) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}

const slugName = (name) => (name || '').trim().replace(/\s+/g, '').replace(/[^\p{L}\p{N}_-]/gu, '');

export async function GET() {
    return NextResponse.json(await readAll());
}

export async function POST(request) {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    const data = await readAll();

    if (body.action === 'create') {
        const name = slugName(body.name);
        if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
        if (data.characters.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
            return NextResponse.json({ error: 'A character with this name already exists' }, { status: 409 });
        }
        const character = {
            id: crypto.randomUUID(),
            name,
            identity: (body.identity || '').trim(),
            refUrl: body.refUrl || null,
            createdAt: new Date().toISOString(),
        };
        data.characters.push(character);
        await writeAll(data);
        return NextResponse.json({ ok: true, character });
    }

    if (body.action === 'update') {
        const character = data.characters.find((c) => c.id === body.id);
        if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        if (body.name !== undefined) {
            const name = slugName(body.name);
            if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
            character.name = name;
        }
        if (body.identity !== undefined) character.identity = (body.identity || '').trim();
        if (body.refUrl !== undefined) character.refUrl = body.refUrl;
        await writeAll(data);
        return NextResponse.json({ ok: true, character });
    }

    if (body.action === 'delete') {
        data.characters = data.characters.filter((c) => c.id !== body.id);
        await writeAll(data);
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
