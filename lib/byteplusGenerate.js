import { arkFetch, byteplusConfigured } from './byteplus';
import { storeMedia } from './mediaStore';
import {
    byteplusModelFor, byteplusCost, byteplusSize, PIXEL_LIMITS,
} from '../packages/studio/src/byteplusModels.js';

export { byteplusModelFor };
export const isByteplusModel = (id, name) => !!byteplusModelFor(id, name);
export const byteplusAvailable = () => byteplusConfigured();

// Ark hands back a URL on its own CDN that expires. Every other provider in
// this app returns something the gallery can still show tomorrow, so the bytes
// are pulled down and stored like any other generation.
async function rehost(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Não consegui baixar a imagem da BytePlus (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    return storeMedia(buf.toString('base64'), mime);
}

function absolutise(url, origin) {
    return url?.startsWith('/') ? new URL(url, origin).toString() : url;
}


// Ark models do not all take the same parameters — Pro rejects
// `sequential_image_generation` while Lite accepts it — and the error names
// exactly which one is at fault. Rather than hardcoding a per-model allowlist
// that will drift the moment ByteDance ships a new model, drop the offending
// parameter and retry. Same self-healing the Runware adapter already does.
async function arkSelfHealing(body, attempt = 0) {
    try {
        return await arkFetch('/images/generations', body);
    } catch (e) {
        const named = /parameter `([a-z_]+)`[^]*?(not supported|is not valid)/i.exec(e.message || '');
        const param = named?.[1];
        if (attempt >= 3 || !param || !(param in body) || param === 'prompt' || param === 'model') throw e;
        const { [param]: _dropped, ...rest } = body;
        return arkSelfHealing(rest, attempt + 1);
    }
}

export async function byteplusGenerateImage({
    modelId, displayName, arkModel, prompt, aspectRatio, tier = '2k',
    referenceImages = [], seed, origin,
}) {
    const model = arkModel || byteplusModelFor(modelId, displayName);
    if (!model) throw new Error(`${modelId} não é um Seedream 5.0.`);

    const { size, pixels } = byteplusSize(model, aspectRatio, tier);
    const body = {
        model,
        prompt: prompt || '',
        size,
        // Off by default upstream is NOT guaranteed — an unrequested watermark
        // burned into a paid render is not something to leave to a default.
        watermark: false,
        response_format: 'url',
    };
    // Reference images: Ark takes a URL or a list of them. It downloads them
    // itself, so they have to be publicly reachable — a relative path from
    // this app is made absolute first.
    const refs = (referenceImages || []).filter(Boolean).map((u) => absolutise(u, origin));
    if (refs.length === 1) body.image = refs[0];
    else if (refs.length > 1) body.image = refs.slice(0, 10);
    if (Number.isFinite(seed)) body.seed = seed;

    const data = await arkSelfHealing(body);
    const first = data?.data?.[0];
    if (!first?.url) throw new Error('BytePlus terminou sem devolver imagem.');

    const [w, h] = String(first.size || size).split('x').map(Number);
    return {
        url: await rehost(first.url),
        cost: byteplusCost(model, (w * h) || pixels),
        estimated: true,
        provider: 'byteplus',
        resolvedSize: first.size || size,
        // Ark reports what it actually billed in tokens; keep it on the entry
        // so the console figure can be reconciled against ours.
        tokens: data?.usage?.total_tokens ?? null,
    };
}

export { PIXEL_LIMITS };
