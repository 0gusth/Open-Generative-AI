// Seedream 5.0 straight from ByteDance (BytePlus ModelArk), not a reseller.
//
// One resolver shared by the client router and the server route, same shape as
// googleModels.js — a hardcoded id list is what let Nano Banana Lite leak to
// the reseller, so this matches the FAMILY by id or by display name.
//
// The two ids are real, read off the account's own /models listing:
//   seedream-5-0-260128           → "Seedream 5.0 Lite"
//   dola-seedream-5-0-pro-260628  → "Seedream 5.0 Pro"

export const BYTEPLUS_LITE = 'seedream-5-0-260128';
export const BYTEPLUS_PRO = 'dola-seedream-5-0-pro-260628';

// Ids the app already uses for these models, across the AIR catalog and the
// legacy wrapper list.
const KNOWN = {
    'bytedance:seedream@5.0-pro': BYTEPLUS_PRO,
    'bytedance-seedream-5.0-pro': BYTEPLUS_PRO,
    'seedream-5.0-pro': BYTEPLUS_PRO,
    'bytedance-seedream-5.0-pro-edit': BYTEPLUS_PRO,
    'seedream-5.0-pro-edit': BYTEPLUS_PRO,
    'bytedance:seedream@5.0': BYTEPLUS_LITE,
    'bytedance:seedream@5.0-lite': BYTEPLUS_LITE,
    'seedream-5.0': BYTEPLUS_LITE,
    'seedream-5.0-lite': BYTEPLUS_LITE,
    'seedream-5.0-edit': BYTEPLUS_LITE,
};

export function byteplusModelFor(modelId = '', displayName = '') {
    if (KNOWN[modelId]) return KNOWN[modelId];
    const hay = `${modelId} ${displayName}`.toLowerCase();
    if (!/seedream/.test(hay)) return null;
    // Only 5.0 moves to the direct account; 3.x/4.x keep their existing route.
    if (!/5[.\-_ ]?0|@5\b|\b5\b/.test(hay)) return null;
    if (/\bpro\b/.test(hay)) return BYTEPLUS_PRO;
    return BYTEPLUS_LITE;
}

// Published rates (USD). Pro is charged by output area; Lite is flat.
// These are ESTIMATES the card marks with "~" — the BytePlus console is the
// bill that counts.
const PRO_PIXEL_BREAK = 2359296; // 2048x1152, the published threshold
export function byteplusCost(model, pixels) {
    if (model === BYTEPLUS_PRO) return pixels > PRO_PIXEL_BREAK ? 0.09 : 0.045;
    return 0.035;
}

// Pixel envelopes, each measured against the live API for THAT model. The
// first version of this file measured the ceiling on Lite and applied it to
// both, so a 4K request on Pro was sent at 4096x4096 and rejected outright.
// The two models are not alike in either direction:
//   Lite  2K floor, 4K ceiling, presets 2k/3k/4k
//   Pro   1K floor, ~2.1K ceiling, presets 1k/2k  — it does NOT do 4K
export const PIXEL_LIMITS = {
    [BYTEPLUS_LITE]: { min: 3686400, max: 16777216 },
    [BYTEPLUS_PRO]: { min: 921600, max: 4624220 },
};

// What the quality picker is allowed to offer for each model. Offering a tier
// the model cannot produce is how a paid click turns into an error.
export const TIERS_FOR = {
    [BYTEPLUS_LITE]: ['2k', '4k'],
    [BYTEPLUS_PRO]: ['1k', '2k'],
};

// The tiers a given catalog entry supports, or null when it is not a Seedream
// 5.0 at all and the caller should keep its own list.
export function byteplusTiers(modelId, displayName) {
    const model = byteplusModelFor(modelId, displayName);
    return model ? TIERS_FOR[model] : null;
}

const TIER_PIXELS = { '1k': 1048576, '2k': 4194304, '3k': 9437184, '4k': 16777216 };

// Turn the app's (aspect, tier) into concrete dimensions inside the model's
// envelope. Snapping is always UPWARD: quietly rendering smaller than asked is
// the bug that made a paid 2K request come back at 1K.
export function byteplusSize(model, aspect = '1:1', tier = '2k') {
    const limits = PIXEL_LIMITS[model] || PIXEL_LIMITS[BYTEPLUS_LITE];
    const asked = TIER_PIXELS[String(tier || '2k').toLowerCase()] || TIER_PIXELS['2k'];
    let target = Math.min(Math.max(asked, limits.min), limits.max);
    // Coming back smaller than the user paid for must never be silent — this
    // is reported all the way to the card.
    const cappedFrom = asked > limits.max ? String(tier).toLowerCase() : null;

    let [aw, ah] = String(aspect || '1:1').split(':').map(Number);
    if (!aw || !ah || aspect === 'auto') { aw = 1; ah = 1; }
    const ratio = aw / ah;

    const round8 = (v) => Math.max(8, Math.round(v / 8) * 8);
    let w = round8(Math.sqrt(target * ratio));
    let h = round8(w / ratio);

    // Rounding can push the area back under the floor or over the ceiling.
    for (let i = 0; i < 6 && w * h < limits.min; i++) { w = round8(w * 1.04); h = round8(w / ratio); }
    for (let i = 0; i < 6 && w * h > limits.max; i++) { w = round8(w * 0.97); h = round8(w / ratio); }
    return { size: `${w}x${h}`, pixels: w * h, cappedFrom };
}

// When the selected model cannot produce the tier that is currently chosen,
// move to the closest one it CAN — preferring the larger of two equally close
// options, because dropping the user to the floor is its own quiet downgrade.
const TIER_ORDER = ['1k', '2k', '3k', '4k'];
export function snapTier(current, allowed) {
    if (!allowed?.length) return current;
    const cur = String(current || '').toLowerCase();
    if (allowed.includes(cur)) return cur;
    const want = TIER_ORDER.indexOf(cur);
    if (want < 0) return allowed[allowed.length - 1];
    return allowed
        .slice()
        .sort((a, b) => {
            const da = Math.abs(TIER_ORDER.indexOf(a) - want);
            const db = Math.abs(TIER_ORDER.indexOf(b) - want);
            return da - db || TIER_ORDER.indexOf(b) - TIER_ORDER.indexOf(a);
        })[0];
}
