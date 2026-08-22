import { NextResponse } from 'next/server';
import { verifyGoogleCloud, googleCloudConfigured } from '../../../../lib/googleCloud';
import { vertexGenerateImage, vertexGenerateVideo, isGoogleModel } from '../../../../lib/vertexGenerate';

// Google services billed to the user's own Cloud project.
//
// GET  → whether it is configured, and WHICH project/service account will be
//        charged (a wrong key must be caught before it spends on the wrong
//        account, not after).
// POST → generate; same {url, cost, provider} contract as every other route.

export const maxDuration = 300; // Veo runs for minutes

export async function GET() {
    if (!googleCloudConfigured()) {
        return NextResponse.json({ configured: false });
    }
    const status = await verifyGoogleCloud();
    return NextResponse.json({ configured: status.ok, ...status });
}

export async function POST(request) {
    if (!googleCloudConfigured()) {
        return NextResponse.json({ error: 'Google Cloud não configurado no servidor.' }, { status: 503 });
    }
    const body = await request.json().catch(() => null);
    if (!body?.modelId) return NextResponse.json({ error: 'modelId é obrigatório' }, { status: 400 });
    if (!isGoogleModel(body.modelId)) {
        return NextResponse.json({ error: `${body.modelId} não é um modelo Google.` }, { status: 400 });
    }
    const origin = new URL(request.url).origin;

    try {
        const result = body.kind === 'video'
            ? await vertexGenerateVideo({
                modelId: body.modelId,
                prompt: body.prompt,
                aspectRatio: body.aspectRatio,
                duration: body.duration,
                image: body.image,
                origin,
            })
            : await vertexGenerateImage({
                modelId: body.modelId,
                prompt: body.prompt,
                aspectRatio: body.aspectRatio,
                tier: body.tier,
                referenceImages: body.referenceImages || [],
                origin,
            });
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        // Quota and permission problems are the two that need a human: say
        // which one it is instead of a generic failure.
        const message = error?.message || 'Falha na geração via Google Cloud';
        const status = /permission|denied|403/i.test(message) ? 403
            : /quota|429|resource.?exhausted/i.test(message) ? 429
            : 502;
        return NextResponse.json({ error: message, definitive: !!error.definitive }, { status });
    }
}
