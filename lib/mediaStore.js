import { promises as fs } from 'fs';
import path from 'path';

// Where a freshly generated image LIVES so the rest of the app can keep
// treating generations as URLs (ledger, gallery, lightbox, download, local
// folder sync, and above all "Animar" — the video models must be able to
// fetch the still over plain HTTP; a data: URI is useless to them).
//
// Two backends, picked by what the deployment offers:
//   • Vercel Blob — permanent public URLs (the cloud app).
//   • public/generated/ on disk — the local Mac dev server.
// Google returns base64; everything downstream expects a URL, so this is the
// bridge between the two.

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
export const blobConfigured = () => !!BLOB_TOKEN;

const EXT_BY_MIME = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
};

function fileName(mimeType) {
    const ext = EXT_BY_MIME[mimeType] || 'png';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `gen-${stamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

// Store base64 image data, return a public URL.
export async function storeImage(base64, mimeType = 'image/png') {
    const buffer = Buffer.from(base64, 'base64');
    const name = fileName(mimeType);

    if (BLOB_TOKEN) {
        const { put } = await import('@vercel/blob');
        const blob = await put(`generated/${name}`, buffer, {
            access: 'public',
            contentType: mimeType,
            token: BLOB_TOKEN,
            addRandomSuffix: false,
        });
        return blob.url;
    }

    // Local dev: write into public/ so Next serves it at a stable path.
    const dir = path.join(process.cwd(), 'public', 'generated');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), buffer);
    return `/generated/${name}`;
}
