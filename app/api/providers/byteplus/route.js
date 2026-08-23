import { NextResponse } from 'next/server';
import { byteplusConfigured, verifyByteplus } from '../../../../lib/byteplus';
import { byteplusGenerateImage, isByteplusModel } from '../../../../lib/byteplusGenerate';

// Seedream 5.0 billed to the user's own ByteDance account.
//
// GET  → whether it is configured, and which Seedream 5 models the account
//        can actually reach.
// POST → generate; same {url, cost, provider} contract as every other route.

export const maxDuration = 300;

export async function GET() {
    if (!byteplusConfigured()) return NextResponse.json({ configured: false });
    const status = await verifyByteplus();
    return NextResponse.json({ configured: status.ok, ...status });
}

export async function POST(request) {
    if (!byteplusConfigured()) {
        return NextResponse.json({ error: 'BytePlus não configurado no servidor.' }, { status: 503 });
    }
    const body = await request.json().catch(() => null);
    if (!body?.modelId) return NextResponse.json({ error: 'modelId é obrigatório' }, { status: 400 });
    if (!isByteplusModel(body.modelId, body.displayName) && !body.arkModel) {
        return NextResponse.json({ error: `${body.modelId} não é um Seedream 5.0.` }, { status: 400 });
    }
    try {
        const result = await byteplusGenerateImage({
            modelId: body.modelId,
            displayName: body.displayName,
            arkModel: body.arkModel,
            prompt: body.prompt,
            aspectRatio: body.aspectRatio,
            tier: body.tier,
            referenceImages: body.referenceImages || [],
            seed: body.seed,
            origin: new URL(request.url).origin,
        });
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        const message = error?.message || 'Falha na geração via BytePlus';
        const status = /permission|denied|Unauthorized|Authentication/i.test(message) ? 403
            : /quota|429|exhausted|rate/i.test(message) ? 429
            : /InvalidParameter|not valid/i.test(message) ? 400
            : 502;
        return NextResponse.json({ error: message, definitive: !!error.definitive }, { status });
    }
}
