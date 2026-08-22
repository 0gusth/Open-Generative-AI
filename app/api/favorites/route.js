import { NextResponse } from 'next/server';
import { readDoc, writeDoc } from '../../../lib/serverStore';

// Starred models, server-side so a favourite set on the Mac is already
// starred on the phone. Shape: { image: [id…], video: [id…] }.

const EMPTY = { image: [], video: [] };
const kinds = ['image', 'video'];

export async function GET() {
    const data = await readDoc('favorites', EMPTY);
    return NextResponse.json({ ...EMPTY, ...data });
}

export async function POST(request) {
    const body = await request.json().catch(() => null);
    if (!body?.id || !kinds.includes(body.kind)) {
        return NextResponse.json({ error: 'kind and id are required' }, { status: 400 });
    }
    const data = { ...EMPTY, ...(await readDoc('favorites', EMPTY)) };
    const list = new Set(data[body.kind] || []);
    if (body.starred === false) list.delete(body.id);
    else list.add(body.id);
    data[body.kind] = [...list];
    await writeDoc('favorites', data);
    return NextResponse.json({ ok: true, ...data });
}
