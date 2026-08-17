import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Free constraint probe: submits an intentionally invalid render (100x100)
// to every Runware t2v model — rejected submissions cost nothing, and the
// validation errors carry each architecture's exact allowed dimensions and
// duration enums. Result is written to packages/studio/src/
// modelConstraints.json so every generation is right on the FIRST submit.
// Re-run whenever the catalog grows: POST with x-provider-key.

const RUNWARE_URL = 'https://api.runware.ai/v1';
const OUT_FILE = path.join(process.cwd(), 'packages', 'studio', 'src', 'modelConstraints.json');

// "1920x1080" | "1280*720" | "1280:720" | "1920x1080 (1080p, 16:9)" → [w, h]
function parseSizes(allowed) {
    const list = Array.isArray(allowed) ? allowed : String(allowed || '').split(',');
    const sizes = [];
    for (const raw of list) {
        const m = String(raw).trim().match(/^(\d+)\s*[x*:]\s*(\d+)/);
        if (m) sizes.push(`${m[1]}x${m[2]}`);
    }
    return sizes.length ? sizes : null;
}

// Codes that mean "this model is not a usable text-to-video endpoint"
const UNUSABLE_CODES = new Set([
    'missingParameter', 'requiredFrameImages', 'missingFrameImagesForImageToVideoModel',
    'invalidModel', 'invalidViduModelConfiguration', 'unsupportedDimensionsKlingV26Standard',
]);

async function submitProbe(key, air, extra = {}) {
    const res = await fetch(RUNWARE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify([{
            taskType: 'videoInference', taskUUID: crypto.randomUUID(), model: air,
            positivePrompt: 'probe', width: 100, height: 100, duration: 5,
            numberResults: 1, outputType: 'URL', deliveryMethod: 'async',
            ...extra,
        }]),
    });
    return (await res.json()).errors?.[0];
}

function harvest(e, entry) {
    if (!e) return entry;
    if (UNUSABLE_CODES.has(e.code)) entry.unusableT2v = e.message?.slice(0, 120) || e.code;
    const sizes = parseSizes(e.allowedValues);
    if (sizes && /dimension|resolution|width|height/i.test(e.code + ' ' + (e.parameter || ''))) {
        entry.sizes = sizes;
    }
    if (/duration/i.test(e.code + ' ' + (e.parameter || '')) && Array.isArray(e.allowedValues)) {
        entry.durations = e.allowedValues.filter((v) => typeof v === 'number');
    }
    return entry;
}

async function probeOne(key, air) {
    // Pass 1: invalid dims + generateAudio. Parameter validation runs before
    // dimension validation, so an audio complaint here means the model does
    // not take the parameter; a dimension complaint means audio was accepted.
    const e1 = await submitProbe(key, air, { generateAudio: true });
    if (!e1) return { unexpectedAccept: true };
    const entry = {};
    if (/generateAudio/i.test((e1.message || '') + String(e1.parameter || ''))) {
        entry.audioParam = false;
        harvest(await submitProbe(key, air), entry); // pass 2: sizes/durations
    } else {
        entry.audioParam = true;
        harvest(e1, entry);
    }
    return Object.keys(entry).length ? entry : { code: e1.code };
}

export async function POST(request) {
    const key = request.headers.get('x-provider-key');
    if (!key) return NextResponse.json({ error: 'Missing Runware API key' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const airs = body.airs;
    if (!Array.isArray(airs) || !airs.length) return NextResponse.json({ error: 'Body must include airs: [...]' }, { status: 400 });

    const results = {};
    const queue = [...airs];
    await Promise.all(Array.from({ length: 8 }, async () => {
        while (queue.length) {
            const air = queue.shift();
            try { results[air] = await probeOne(key, air); }
            catch (e) { results[air] = { probeError: e.message }; }
        }
    }));

    // Merge over any existing file so partial re-probes never lose data
    let existing = {};
    try { existing = JSON.parse(await fs.readFile(OUT_FILE, 'utf8')); } catch { /* fresh */ }
    const merged = { ...existing, ...results, __probedAt: new Date().toISOString() };
    await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 1));

    const withSizes = Object.values(results).filter((r) => r.sizes).length;
    const unusable = Object.entries(results).filter(([, r]) => r.unusableT2v).map(([a]) => a);
    return NextResponse.json({ probed: airs.length, withSizes, withDurations: Object.values(results).filter((r) => r.durations).length, unusable });
}
