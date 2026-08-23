import { NextResponse } from 'next/server';
import { mockGenerate } from '../../../../lib/mockGenerate';

// Sandbox generation. Refuses to exist outside the sandbox: if this route
// ever answered in production it would hand back a placeholder for a real
// request, which is worse than any error.
export async function POST(request) {
    if (process.env.NEXT_PUBLIC_SANDBOX !== '1') {
        return NextResponse.json({ error: 'Sandbox desligado.' }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const result = await mockGenerate({
        prompt: body.prompt,
        model: body.model,
        aspectRatio: body.aspectRatio,
        kind: body.kind,
    });
    return NextResponse.json({ ok: true, ...result });
}
