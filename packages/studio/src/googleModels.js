// Which Google model a catalog entry actually is — one resolver, both sides.
//
// The gate used to be a hand-written list of ids, and the catalog moves faster
// than the list: "google:nano-banana@2-lite" sat in the curated shortlist while
// the gate only knew "nano-banana-2-lite", so every Lite render quietly billed
// to the reseller instead of the user's own Cloud project. Matching the FAMILY
// — from the id or from the display name — closes that whole class of bug,
// including ids that do not exist yet.
//
// Deliberately conservative: a Google model we cannot identify with certainty
// returns null rather than a guess. Guessing wrong would render on the WRONG
// model, which is worse than paying the reseller — and the caller reports the
// miss out loud instead of swallowing it.

// Exact ids we have confirmed against both catalogs.
const KNOWN = {
    // Image — Nano Banana family
    'nano-banana': 'gemini-2.5-flash-image',
    'nano-banana-edit': 'gemini-2.5-flash-image',
    'nano-banana-effects': 'gemini-2.5-flash-image',
    'google:4@1': 'gemini-2.5-flash-image',
    'nano-banana-2': 'gemini-3.1-flash-image',
    'nano-banana-2-edit': 'gemini-3.1-flash-image',
    'google:4@3': 'gemini-3.1-flash-image',
    'nano-banana-2-lite': 'gemini-3.1-flash-lite-image',
    'google:nano-banana@2-lite': 'gemini-3.1-flash-lite-image',
    'nano-banana-pro': 'gemini-3-pro-image',
    'nano-banana-pro-edit': 'gemini-3-pro-image',
    // Video — Veo
    'google:3@2': 'veo-3.1-generate-preview',
    'google:3@3': 'veo-3.1-fast-generate-preview',
};

// Anything Google made, whether or not we can place it on Vertex. Used to
// report the miss: a Google model billing to the reseller is worth saying.
export function looksGoogle(modelId = '', displayName = '') {
    const hay = `${modelId} ${displayName}`.toLowerCase();
    return /^google:/.test(modelId)
        || /nano[\s_-]*banana|gemini|\bveo\b|imagen/.test(hay);
}

export function vertexModelFor(modelId = '', displayName = '') {
    if (KNOWN[modelId]) return KNOWN[modelId];
    const hay = `${modelId} ${displayName}`.toLowerCase();

    if (/nano[\s_-]*banana|gemini.*image/.test(hay)) {
        // Order matters — "Nano Banana 2 Lite" is Lite, not 2.
        if (/\blite\b/.test(hay)) return 'gemini-3.1-flash-lite-image';
        if (/\bpro\b/.test(hay)) return 'gemini-3-pro-image';
        if (/banana[\s_-]*2|\b3\.1\b/.test(hay)) return 'gemini-3.1-flash-image';
        if (/banana\b|\b2\.5\b/.test(hay)) return 'gemini-2.5-flash-image';
        return null; // a Banana we do not recognise — say so, do not guess
    }

    if (/\bveo\b/.test(hay)) {
        // Only the 3.x line is mapped; a Veo 2 job must not silently render on 3.
        if (!/\b3(\.\d)?\b/.test(hay)) return null;
        return /\bfast\b/.test(hay) ? 'veo-3.1-fast-generate-preview' : 'veo-3.1-generate-preview';
    }

    return null; // Imagen and friends have no Vertex path here yet
}

export const VERTEX_IMAGE_MODELS = new Set([
    'gemini-2.5-flash-image', 'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image', 'gemini-3-pro-image',
]);
