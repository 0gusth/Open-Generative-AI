// Seedream 5.0 billed to the user's own ByteDance account (BytePlus ModelArk),
// instead of through the Runware reseller.
//
// Everything below was read off the live API with the account's key, not from
// memory: the endpoint, the accepted parameters, and the pixel envelopes.
// Where the API disagrees with this file, the API is right.

export const ARK_API_KEY = process.env.BYTEPLUS_API_KEY || '';
// The international endpoint. The China one (ark.cn-beijing.volces.com) is a
// separate account namespace and rejects this key outright.
export const ARK_BASE = process.env.BYTEPLUS_BASE_URL
    || 'https://ark.ap-southeast.bytepluses.com/api/v3';

export const byteplusConfigured = () => !!ARK_API_KEY;

export async function arkFetch(path, body, { timeoutMs = 180000 } = {}) {
    if (!byteplusConfigured()) throw new Error('BytePlus não configurado no servidor.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${ARK_BASE}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ARK_API_KEY}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
            const err = new Error(data?.error?.message || `BytePlus respondeu ${res.status}`);
            // Ark reports the real cause (bad size, moderation, quota) — a
            // parameter complaint will never succeed on retry.
            err.definitive = /InvalidParameter|Authentication|Unauthorized/i.test(
                data?.error?.code || data?.error?.type || '',
            );
            err.code = data?.error?.code;
            throw err;
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

// Proves the key works and says which models the account can actually reach,
// so a wrong key is caught before it costs a generation.
export async function verifyByteplus() {
    if (!byteplusConfigured()) return { ok: false, reason: 'Falta BYTEPLUS_API_KEY.' };
    try {
        const res = await fetch(`${ARK_BASE}/models?page_size=200`, {
            headers: { Authorization: `Bearer ${ARK_API_KEY}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
            return { ok: false, reason: data?.error?.message || `HTTP ${res.status}` };
        }
        const seedream = (data.data || [])
            .filter((m) => /seedream-5/.test(m.id))
            .map((m) => m.id);
        return { ok: true, endpoint: ARK_BASE, seedream5: seedream };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}
