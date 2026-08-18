import { NextResponse } from 'next/server';
import { appendLog } from '../../../../lib/serverStore';

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

    // Stale-bundle guard: the legacy shapes (top-level frameImages, or a
    // frame entry with no image) only come from an app tab loaded before the
    // i2v rework. Those submits burned money all morning — reject them here
    // with an actionable message instead of letting the provider guess.
    try {
        const tasks = JSON.parse(body);
        if (Array.isArray(tasks)) {
            const video = tasks.find((t) => t?.taskType === 'videoInference');
            const stale = video && (video.frameImages
                || (video.inputs?.frameImages || []).some((f) => !f?.image));
            if (stale) {
                return NextResponse.json({ errors: [{
                    code: 'staleClient',
                    message: 'This browser tab is running an outdated version of the app. Reload the page (Cmd+R) and generate again.',
                }] }, { status: 409 });
            }
        }
    } catch { /* non-JSON bodies fall through to the provider */ }

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
                const tasks = JSON.parse(body);
                const t = tasks.find((x) => x.taskType === 'videoInference');
                if (t) await appendLog('video-submits',
                    JSON.stringify({ at: new Date().toISOString(), model: t.model, frame: t.inputs?.frameImages?.[0]?.image || t.frameImages?.[0]?.inputImage || null, prompt: (t.positivePrompt || '').slice(0, 200) }));
            }
        } catch { /* logging never breaks the proxy */ }
        // Permanent failure ledger: whenever the upstream rejects a
        // generation, keep the EXACT payload + verdict. Debugging "it still
        // blocks" from theory cost days; from this file it takes seconds.
        try {
            if (data?.errors?.length && /videoInference|imageInference|getResponse/.test(body)) {
                await appendLog('provider-failures',
                    JSON.stringify({ at: new Date().toISOString(), errors: data.errors, request: JSON.parse(body) }));
            }
        } catch { /* never break the proxy for logging */ }
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
