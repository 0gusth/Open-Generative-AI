import { NextResponse } from 'next/server';

const RUNWARE_URL = 'https://api.runware.ai/v1';

// Proxies /api/providers/runware -> https://api.runware.ai/v1 (CORS bypass).
// The Runware key travels in x-provider-key and is forwarded as a Bearer token.
export async function POST(request) {
    const providerKey = request.headers.get('x-provider-key');
    if (!providerKey) {
        return NextResponse.json({ error: 'Missing Runware API key' }, { status: 401 });
    }

    let body;
    try {
        body = await request.text();
        // TEMP DEBUG: record every videoInference task so failures can be
        // diagnosed from the exact payload (remove after i2v is stable)
        try {
            if (body.includes('videoInference')) {
                const { appendFileSync } = require('fs');
                appendFileSync(process.cwd() + '/.data/debug-video-tasks.log',
                    new Date().toISOString() + ' ' + body + '\n---\n');
            }
        } catch { /* debug only */ }
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    try {
        const response = await fetch(RUNWARE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${providerKey}`,
            },
            body,
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
