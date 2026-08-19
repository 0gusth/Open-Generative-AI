import { NextResponse } from 'next/server';
import { generateGoogleImage, googleImageConfigured, TIER_MODELS } from '../../../../lib/googleImage';
import { storeImage } from '../../../../lib/mediaStore';

// Google-direct image generation. Keys live in server env vars (never in the
// browser, unlike the Runware/fal keys), so this route is the whole surface.
//
// GET  → { configured } so the client can route without guessing.
// POST → { images: [{url, cost, paid}] }: generates, hosts the result, and
//        answers with URLs — the shape the rest of the app already speaks.

export const maxDuration = 60;

const FREE_COST = 0;
const PAID_COST_PER_IMAGE = 0.039; // Gemini 2.5 Flash Image, 1K (Aug 2026)
const MAX_VARIATIONS = 4;

// Reference images arrive as URLs (already hosted). Google wants raw bytes,
// so fetch and inline them. Same-origin paths resolve against this request.
async function inlineReference(url, origin) {
    const absolute = url.startsWith('/') ? new URL(url, origin).toString() : url;
    const response = await fetch(absolute);
    if (!response.ok) throw new Error(`Could not read reference image (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/png';
    return { data: buffer.toString('base64'), mimeType };
}

export async function GET() {
    return NextResponse.json({ configured: googleImageConfigured(), tiers: Object.keys(TIER_MODELS) });
}

export async function POST(request) {
    if (!googleImageConfigured()) {
        return NextResponse.json({ error: 'Google AI key not configured on this server.' }, { status: 503 });
    }
    const body = await request.json().catch(() => null);
    if (!body?.prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

    const tier = TIER_MODELS[body.tier] ? body.tier : 'flash';
    const count = Math.min(Math.max(parseInt(body.count, 10) || 1, 1), MAX_VARIATIONS);
    const origin = new URL(request.url).origin;

    let referenceImages = [];
    try {
        referenceImages = await Promise.all(
            (body.referenceImages || []).slice(0, 6).map((url) => inlineReference(url, origin)),
        );
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Variations run in parallel; each one walks the key chain on its own, so
    // a quota hit mid-batch only affects the images still in flight.
    const settled = await Promise.allSettled(
        Array.from({ length: count }, () =>
            generateGoogleImage({
                prompt: body.prompt,
                tier,
                aspectRatio: body.aspectRatio,
                referenceImages,
            }).then(async (result) => ({
                url: await storeImage(result.base64, result.mimeType),
                cost: result.paid ? PAID_COST_PER_IMAGE : FREE_COST,
                paid: result.paid,
            })),
        ),
    );

    const images = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (images.length === 0) {
        const reason = settled[0]?.reason;
        return NextResponse.json(
            { error: reason?.message || 'Google generation failed', quotaExhausted: !!reason?.quotaExhausted },
            { status: reason?.quotaExhausted ? 429 : 502 },
        );
    }
    return NextResponse.json({ images, requested: count });
}
