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
        // Submit ledger: every video submit (frame + prompt), success or not,
        // so a failing render can always be matched to its exact input.
        try {
            if (/videoInference/.test(body)) {
                const { appendFileSync } = require('fs');
                const tasks = JSON.parse(body);
                const t = tasks.find((x) => x.taskType === 'videoInference');
                if (t) appendFileSync(process.cwd() + '/.data/video-submits.log',
                    JSON.stringify({ at: new Date().toISOString(), model: t.model, frame: t.inputs?.frameImages?.[0]?.image || t.frameImages?.[0]?.inputImage || null, prompt: (t.positivePrompt || '').slice(0, 200) }) + '\n');
            }
        } catch { /* logging never breaks the proxy */ }
        // Permanent failure ledger: whenever the upstream rejects a
        // generation, keep the EXACT payload + verdict. Debugging "it still
        // blocks" from theory cost days; from this file it takes seconds.
        try {
            if (data?.errors?.length && /videoInference|imageInference|getResponse/.test(body)) {
                const { appendFileSync } = require('fs');
                appendFileSync(process.cwd() + '/.data/provider-failures.log',
                    JSON.stringify({ at: new Date().toISOString(), errors: data.errors, request: JSON.parse(body) }) + '\n');
            }
        } catch { /* never break the proxy for logging */ }
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
