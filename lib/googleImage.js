import { GoogleGenAI } from '@google/genai';

// Google AI Studio image engine — server side, keys never reach the browser.
//
// Why this exists: the Flash-class Nano Banana models are the same weights
// Runware resells. Calling Google directly makes them free inside the daily
// free-tier quota (and cheaper than the reseller beyond it). Pro-class stays
// on Runware, where it is currently CHEAPER than Google's own pricing.
//
// The key pool takes N keys and rotates them; with a single key it simply
// always returns that one. A 429 (daily/minute quota) falls through to the
// next key, and finally to the paid key when one is configured.

const FREE_KEYS = [
    process.env.GEMINI_FREE_KEY_1,
    process.env.GEMINI_FREE_KEY_2,
    process.env.GEMINI_FREE_KEY_3,
    process.env.GEMINI_FREE_KEY_4,
    process.env.GEMINI_API_KEY, // single-key setups use this one
].filter(Boolean);

const PAID_KEY = process.env.GEMINI_PAID_PRIMARY_KEY || '';

export const googleImageConfigured = () => FREE_KEYS.length > 0 || !!PAID_KEY;

let rotation = 0;
function keyChain() {
    // Free keys first (rotating so bursts spread out), paid key last: it is
    // the fallback that keeps generation alive once the free quota is spent.
    if (FREE_KEYS.length === 0) return PAID_KEY ? [{ key: PAID_KEY, paid: true }] : [];
    const chain = FREE_KEYS.map((_, i) => ({
        key: FREE_KEYS[(rotation + i) % FREE_KEYS.length],
        paid: false,
    }));
    rotation = (rotation + 1) % FREE_KEYS.length;
    if (PAID_KEY) chain.push({ key: PAID_KEY, paid: true });
    return chain;
}

// Logical tier → Google model id (verified Aug 2026). Only Flash-class is
// here on purpose: Nano Banana Pro (gemini-3-pro-image) has NO free tier and
// costs $0.134/image against $0.069 on Runware, so Pro keeps its old route.
export const TIER_MODELS = {
    flash: 'gemini-2.5-flash-image',        // Nano Banana
    flash2: 'gemini-3.1-flash-image',       // Nano Banana 2
    lite: 'gemini-3.1-flash-lite-image',    // Nano Banana 2 Lite
};

const isQuotaError = (error) => {
    const status = error?.status ?? error?.code;
    if (status === 429 || status === 503) return true;
    const text = `${error?.message || ''}`;
    return /429|rate.?limit|quota|resource.?exhausted|overloaded/i.test(text);
};

// Aspect ratios the image models accept. Anything else is snapped by caller.
const ALLOWED_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);

// One attempt against one key. Returns { base64, mimeType, paid }.
async function generateOnce({ prompt, modelId, apiKey, aspectRatio, referenceImages, paid }) {
    const ai = new GoogleGenAI({ apiKey });

    // Reference images ride as inline parts BEFORE the instruction — this is
    // the shape the image models read for edits and multi-image blends.
    const parts = [];
    for (const ref of referenceImages || []) {
        if (ref?.data) parts.push({ inlineData: { mimeType: ref.mimeType || 'image/png', data: ref.data } });
    }
    parts.push({ text: prompt });

    const config = {};
    if (aspectRatio && ALLOWED_RATIOS.has(aspectRatio)) config.imageConfig = { aspectRatio };

    const response = await ai.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts }],
        ...(Object.keys(config).length ? { config } : {}),
    });

    const candidate = response?.candidates?.[0];
    const image = candidate?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!image?.data) {
        // A refusal comes back as text with no image — surface the model's own
        // words instead of a generic failure.
        const said = candidate?.content?.parts?.find((p) => p.text)?.text;
        const reason = candidate?.finishReason;
        const err = new Error(said?.trim() || `Google returned no image${reason ? ` (${reason})` : ''}`);
        err.definitive = true; // retrying on another key would fail identically
        throw err;
    }
    return { base64: image.data, mimeType: image.mimeType || 'image/png', paid };
}

// Generate one image, walking the key chain on quota errors.
export async function generateGoogleImage({ prompt, tier = 'flash', aspectRatio, referenceImages }) {
    const modelId = TIER_MODELS[tier] || TIER_MODELS.flash;
    const chain = keyChain();
    if (chain.length === 0) throw new Error('No Google AI key configured on the server.');

    let lastError = null;
    for (const { key, paid } of chain) {
        try {
            return await generateOnce({ prompt, modelId, apiKey: key, aspectRatio, referenceImages, paid });
        } catch (error) {
            lastError = error;
            if (error.definitive) throw error;      // refusal/bad input — no key fixes it
            if (!isQuotaError(error)) throw error;  // real error — surface it
            // quota hit: try the next key
        }
    }
    const err = new Error(
        'Cota diária do Google esgotada em todas as chaves. Tente de novo amanhã ou configure uma chave paga.',
    );
    err.quotaExhausted = true;
    err.cause = lastError;
    throw err;
}
