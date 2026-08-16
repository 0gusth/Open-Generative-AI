// Multi-provider router — Muapi is the LAST resort, not the default.
//
// Policy (user-defined):
//   1. Image and video generations route to Runware or fal whenever the model
//      exists there and a key is configured. Muapi only serves models that are
//      genuinely unavailable elsewhere (and anything that errors mid-route).
//   2. Among providers: similar price (±15%) → fastest wins (fal); otherwise
//      cheapest wins (usually Runware).
//   3. Coverage is static table + DYNAMIC lookup: models not hand-mapped are
//      resolved against Runware's modelSearch API by display name and cached,
//      so the whole Runware catalog is reachable without mapping 400 ids.

const PRICE_SIMILARITY = 0.15;
const SPEED_RANK = { fal: 1, runware: 2 };
const RUNWARE_CACHE_KEY = "runware_air_cache_v1";

// Hand-verified routes (Aug 2026 docs). Cost = USD per image ~1MP.
export const PROVIDER_ROUTES = {
    "nano-banana": {
        t2i: {
            runware: { model: "google:4@1", cost: 0.039 },
            fal: { endpoint: "fal-ai/nano-banana", cost: 0.039 },
        },
        i2i: {
            runware: { model: "google:4@1", cost: 0.039 },
            fal: { endpoint: "fal-ai/nano-banana/edit", cost: 0.039 },
        },
    },
    "nano-banana-2": {
        t2i: { runware: { model: "google:4@3", cost: 0.069 } },
        i2i: { runware: { model: "google:4@3", cost: 0.069 } },
    },
    "flux-schnell": {
        t2i: {
            runware: { model: "runware:100@1", cost: 0.0013 },
            fal: { endpoint: "fal-ai/flux/schnell", cost: 0.003 },
        },
    },
    "flux-dev": {
        t2i: {
            runware: { model: "runware:101@1", cost: 0.0096 },
            fal: { endpoint: "fal-ai/flux/dev", cost: 0.025 },
        },
    },
};

export const PROVIDER_KEY_STORAGE = {
    runware: "provider_key_runware",
    fal: "provider_key_fal",
};

export function getProviderKey(provider) {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(PROVIDER_KEY_STORAGE[provider]) || null;
    } catch {
        return null;
    }
}

export function setProviderKey(provider, key) {
    if (typeof window === "undefined") return;
    const storage = PROVIDER_KEY_STORAGE[provider];
    if (!storage) return;
    if (key) window.localStorage.setItem(storage, key);
    else window.localStorage.removeItem(storage);
}

function makeUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

async function runwareCall(tasks) {
    const key = getProviderKey("runware");
    const response = await fetch("/api/providers/runware", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-provider-key": key },
        body: JSON.stringify(tasks),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.errors?.[0]?.message || data?.error || `Runware error ${response.status}`);
    }
    if (data?.errors?.length) throw new Error(data.errors[0].message || "Runware task error");
    return data.data || [];
}

// ── Dynamic model resolution against Runware's catalog ──────────────────────

function readAirCache() {
    try {
        return JSON.parse(window.localStorage.getItem(RUNWARE_CACHE_KEY) || "{}");
    } catch {
        return {};
    }
}

function writeAirCache(cache) {
    try {
        window.localStorage.setItem(RUNWARE_CACHE_KEY, JSON.stringify(cache));
    } catch { /* storage full — cache is best-effort */ }
}

// Normalize a display name for fuzzy comparison: lowercase alnum tokens,
// dropping mode suffixes this app appends ("I2V", "Image To Video"…).
const NAME_NOISE = /\b(i2v|t2v|t2i|i2i|image to video|text to video|text to image|image to image)\b/g;
function normalizeName(name) {
    return (name || "")
        .toLowerCase()
        .replace(NAME_NOISE, " ")
        .replace(/[^a-z0-9.]+/g, " ")
        .trim();
}

function nameTokens(name) {
    return new Set(normalizeName(name).split(/\s+/).filter(Boolean));
}

function tokenOverlap(a, b) {
    const ta = nameTokens(a);
    const tb = nameTokens(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    let hit = 0;
    for (const t of ta) if (tb.has(t)) hit++;
    return hit / Math.max(ta.size, tb.size);
}

// Resolve a model display name to a Runware AIR id ("klingai:5@3") via
// modelSearch. Cached (including misses, as null) to avoid repeat lookups.
async function resolveRunwareAir(displayName) {
    if (!displayName) return null;
    const cacheId = normalizeName(displayName);
    const cache = readAirCache();
    if (cacheId in cache) return cache[cacheId];

    let air = null;
    try {
        const results = await runwareCall([
            {
                taskType: "modelSearch",
                taskUUID: makeUUID(),
                search: normalizeName(displayName),
                limit: 20,
            },
        ]);
        const models = results.find((t) => t.taskType === "modelSearch")?.results || [];
        let best = null;
        let bestScore = 0;
        for (const m of models) {
            const score = tokenOverlap(displayName, m.name);
            if (score > bestScore) {
                best = m;
                bestScore = score;
            }
        }
        // Require a strong match — a wrong model is worse than the fallback.
        if (best && bestScore >= 0.6) air = best.air;
    } catch (error) {
        console.warn("[providers] Runware modelSearch failed:", error.message);
        return null; // do not cache transient failures
    }
    cache[cacheId] = air;
    writeAirCache(cache);
    return air;
}

// ── Candidate selection ─────────────────────────────────────────────────────

function staticCandidates(modelId, mode) {
    const route = PROVIDER_ROUTES[modelId]?.[mode];
    if (!route) return [];
    return Object.entries(route)
        .filter(([provider]) => !!getProviderKey(provider))
        .map(([provider, config]) => ({ provider, config }));
}

function chooseByPolicy(candidates) {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    candidates.sort((a, b) => a.config.cost - b.config.cost);
    const [cheapest, next] = candidates;
    const similar =
        (next.config.cost - cheapest.config.cost) / cheapest.config.cost <= PRICE_SIMILARITY;
    if (similar) {
        candidates.sort((a, b) => SPEED_RANK[a.provider] - SPEED_RANK[b.provider]);
        return candidates[0];
    }
    return cheapest;
}

export function pickProvider(modelId, mode) {
    return chooseByPolicy(staticCandidates(modelId, mode));
}

// ── Image generation ────────────────────────────────────────────────────────

const AR_DIMENSIONS = {
    "1:1": [1024, 1024],
    "16:9": [1344, 768],
    "9:16": [768, 1344],
    "4:3": [1152, 896],
    "3:4": [896, 1152],
    "21:9": [1536, 640],
    "4:5": [896, 1120],
    "auto": [1024, 1024],
};

async function generateImageRunware(air, params) {
    const [width, height] = AR_DIMENSIONS[params.aspect_ratio] || AR_DIMENSIONS["1:1"];
    const task = {
        taskType: "imageInference",
        taskUUID: makeUUID(),
        model: air,
        positivePrompt: params.prompt || "",
        width,
        height,
        numberResults: 1,
        outputType: "URL",
        outputFormat: "PNG",
        deliveryMethod: "async",
    };
    const refs = params.images_list?.length
        ? params.images_list
        : params.image_url
            ? [params.image_url]
            : null;
    if (refs) task.referenceImages = refs;

    const submitted = await runwareCall([task]);
    const accepted = submitted.find((t) => t.taskType === "imageInference");
    // Fast models may return the URL straight from the submit call
    if (accepted?.imageURL) {
        return { url: accepted.imageURL, id: accepted.taskUUID, provider: "runware" };
    }
    const result = await pollRunwareTask(accepted?.taskUUID || task.taskUUID, "image");
    return { url: result.imageURL, id: result.taskUUID, provider: "runware" };
}

async function generateImageFal(endpoint, params) {
    const key = getProviderKey("fal");
    const input = { prompt: params.prompt || "", num_images: 1 };
    if (params.aspect_ratio && params.aspect_ratio !== "auto") input.aspect_ratio = params.aspect_ratio;
    const refs = params.images_list?.length
        ? params.images_list
        : params.image_url
            ? [params.image_url]
            : null;
    if (refs) input.image_urls = refs;

    const response = await fetch(`/api/providers/fal/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-provider-key": key },
        body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.detail?.[0]?.msg || data?.detail || data?.error || `fal error ${response.status}`);
    }
    const url = data?.images?.[0]?.url || data?.image?.url;
    if (!url) throw new Error("fal returned no image URL");
    return { url, id: data.request_id || makeUUID(), provider: "fal" };
}

// Route an image generation. displayName enables dynamic Runware lookup when
// the model has no hand-mapped route. Returns {url, id, provider} or null.
export async function tryProviderGenerate(modelId, mode, params, displayName) {
    const choice = pickProvider(modelId, mode);
    try {
        if (choice?.provider === "runware") return await generateImageRunware(choice.config.model, params);
        if (choice?.provider === "fal") return await generateImageFal(choice.config.endpoint, params);
    } catch (error) {
        console.warn(`[providers] ${choice.provider} route failed for ${modelId}:`, error.message);
        // static route failed — still try dynamic below before Muapi
    }
    if (getProviderKey("runware")) {
        const air = await resolveRunwareAir(displayName || modelId);
        if (air) {
            try {
                return await generateImageRunware(air, params);
            } catch (error) {
                console.warn(`[providers] Runware dynamic route failed for ${modelId}:`, error.message);
            }
        }
    }
    return null; // Muapi is the last resort
}

// ── Video generation (Runware videoInference, async + getResponse poll) ─────

// Poll an async Runware task until its media URL appears. Images poll fast
// (1s early, 2s later); videos relax to 3s. Budget scales to the media kind.
async function pollRunwareTask(taskUUID, kind) {
    const urlField = kind === "video" ? "videoURL" : "imageURL";
    const budgetMs = kind === "video" ? 600000 : 300000;
    const startedAt = Date.now();
    let attempt = 0;
    while (Date.now() - startedAt < budgetMs) {
        attempt++;
        const delay = kind === "video" ? 3000 : attempt <= 20 ? 1000 : 2000;
        await new Promise((r) => setTimeout(r, delay));
        let results;
        try {
            results = await runwareCall([
                { taskType: "getResponse", taskUUID: makeUUID(), responseTaskUUID: taskUUID },
            ]);
        } catch (error) {
            continue; // transient poll failure — keep waiting
        }
        const entry = results.find((t) => t.taskUUID === taskUUID || t[urlField]);
        if (!entry) continue;
        const status = (entry.status || "").toLowerCase();
        if (entry[urlField]) return entry;
        if (status === "error" || status === "failed") {
            throw new Error(entry.error || `Runware ${kind} generation failed`);
        }
    }
    throw new Error(`Runware ${kind} generation timed out`);
}

async function generateVideoRunware(air, params) {
    const task = {
        taskType: "videoInference",
        taskUUID: makeUUID(),
        model: air,
        positivePrompt: params.prompt || "",
        deliveryMethod: "async",
        outputType: "URL",
        numberResults: 1,
    };
    if (params.duration) task.duration = parseInt(params.duration, 10) || undefined;
    // Image-to-video: first (and optionally last) frame
    const frames = [];
    if (params.image_url) frames.push({ inputImage: params.image_url, frame: "first" });
    if (params.last_image) frames.push({ inputImage: params.last_image, frame: "last" });
    if (frames.length) task.frameImages = frames;
    if (!params.image_url && params.images_list?.length) {
        task.referenceImages = params.images_list;
    }

    const submitted = await runwareCall([task]);
    const accepted = submitted.find((t) => t.taskType === "videoInference");
    const taskUUID = accepted?.taskUUID || task.taskUUID;
    const result = await pollRunwareTask(taskUUID, "video");
    return { url: result.videoURL, id: taskUUID, provider: "runware" };
}

// Route a video generation (t2v or i2v) through Runware's catalog.
// Returns {url, id, provider} or null → caller falls back to Muapi.
export async function tryProviderVideo(modelId, params, displayName) {
    if (!getProviderKey("runware")) return null;
    const air = await resolveRunwareAir(displayName || modelId);
    if (!air) return null;
    try {
        return await generateVideoRunware(air, params);
    } catch (error) {
        console.warn(`[providers] Runware video route failed for ${modelId}:`, error.message);
        return null;
    }
}

// ── Balances ────────────────────────────────────────────────────────────────

async function getRunwareBalance() {
    if (!getProviderKey("runware")) return null;
    try {
        const results = await runwareCall([
            { taskType: "accountManagement", taskUUID: makeUUID(), operation: "getDetails" },
        ]);
        const entry = results.find((t) => t.taskType === "accountManagement") || results[0];
        const balance =
            entry?.balance ?? entry?.account?.balance ?? entry?.details?.balance ?? null;
        return typeof balance === "number" ? balance : parseFloat(balance) || null;
    } catch (error) {
        console.warn("[providers] Runware balance fetch failed:", error.message);
        return null;
    }
}

async function getFalBalance() {
    const key = getProviderKey("fal");
    if (!key) return null;
    try {
        const response = await fetch("/api/providers/fal-billing", {
            headers: { "x-provider-key": key },
        });
        if (!response.ok) return null;
        const data = await response.json();
        const balance = data?.credits?.current_balance;
        return typeof balance === "number" ? balance : parseFloat(balance) || null;
    } catch (error) {
        console.warn("[providers] fal balance fetch failed:", error.message);
        return null;
    }
}

// Fetch every configured provider balance in parallel.
// Returns {runware: number|null, fal: number|null} — null = not configured
// or the provider did not report a balance.
export async function getProviderBalances() {
    const [runware, fal] = await Promise.all([getRunwareBalance(), getFalBalance()]);
    return { runware, fal };
}
