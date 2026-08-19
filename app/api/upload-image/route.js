import { NextResponse } from 'next/server';
import { storeImage } from '../../../lib/mediaStore';

// Direct image upload that owes nothing to the legacy Muapi key: the file
// lands in the same store generated images use (Vercel Blob in the cloud,
// public/generated locally) and comes back as a plain URL.

export const maxDuration = 30;
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request) {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'Send a file field.' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
        return NextResponse.json({ error: 'Image too large (max 10MB).' }, { status: 413 });
    }
    const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/png';
    try {
        const url = await storeImage(buffer.toString('base64'), mimeType);
        return NextResponse.json({ ok: true, url });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
