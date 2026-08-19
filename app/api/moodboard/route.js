import { NextResponse } from 'next/server';
import { readMoodboard, moodboardConfigured } from '../../../lib/moodboard';
import { readDoc, writeDoc } from '../../../lib/serverStore';

// Moodboard → style. POST /analyze reads reference images and answers with
// Cinema's own setup vocabulary; the saved styles live server-side like
// characters and productions, so a look built on the Mac is available on
// the phone.

export const maxDuration = 60;

const MAX_IMAGES = 12;
const MAX_BYTES = 6 * 1024 * 1024; // per image, before base64

async function toInline(url, origin) {
    const absolute = url.startsWith('/') ? new URL(url, origin).toString() : url;
    const response = await fetch(absolute);
    if (!response.ok) throw new Error(`Could not read a reference image (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new Error('One of the images is too large (max 6MB).');
    return {
        data: buffer.toString('base64'),
        mimeType: response.headers.get('content-type')?.split(';')[0] || 'image/png',
    };
}

export async function GET() {
    const { styles } = await readDoc('styles', { styles: [] });
    return NextResponse.json({ styles, configured: moodboardConfigured() });
}

export async function POST(request) {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

    if (body.action === 'analyze') {
        if (!moodboardConfigured()) {
            return NextResponse.json({ error: 'Leitor de moodboard não configurado no servidor.' }, { status: 503 });
        }
        const urls = (body.images || []).slice(0, MAX_IMAGES);
        if (!urls.length) return NextResponse.json({ error: 'Envie ao menos uma imagem.' }, { status: 400 });
        const origin = new URL(request.url).origin;
        try {
            const images = await Promise.all(urls.map((u) => toInline(u, origin)));
            const style = await readMoodboard({ images, catalogs: body.catalogs || {}, note: body.note });
            return NextResponse.json({ ok: true, style });
        } catch (error) {
            return NextResponse.json({ error: error.message }, { status: 502 });
        }
    }

    const data = await readDoc('styles', { styles: [] });

    if (body.action === 'save') {
        const style = {
            id: body.id || crypto.randomUUID(),
            name: (body.name || 'Estilo sem nome').trim().slice(0, 60),
            setup: body.setup || {},
            signature: (body.signature || '').slice(0, 240),
            reading: (body.reading || '').slice(0, 300),
            refs: (body.refs || []).slice(0, MAX_IMAGES),
            createdAt: new Date().toISOString(),
        };
        const index = data.styles.findIndex((s) => s.id === style.id);
        if (index >= 0) data.styles[index] = { ...data.styles[index], ...style };
        else data.styles.unshift(style);
        await writeDoc('styles', data);
        return NextResponse.json({ ok: true, style });
    }

    if (body.action === 'delete') {
        data.styles = data.styles.filter((s) => s.id !== body.id);
        await writeDoc('styles', data);
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
