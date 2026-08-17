import { addPending, removePending } from "./ledger.js";
import { fusionInstruction, CRAFT_CORE, looksScripted } from "./cinema/craft.js";
import { dialectFor } from "./cinema/modelDialects.js";
import { detectProperNames, isByteDanceModel } from "./utils/preflight.js";
import MODEL_CONSTRAINTS from "./modelConstraints.json";
import { applyAudioSetting } from "./providerSettings.js";

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
    if (!response.ok || data?.errors?.length) {
        const err = new Error(data?.errors?.[0]?.message || data?.error || `Runware error ${response.status}`);
        err.runwareErrors = data?.errors || [];
        throw err;
    }
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

// Image quality tiers scale the aspect-ratio base (1K) up. Runware snaps to
// each architecture's allowed sizes through the healing loop, so asking for
// 2K/4K on a model that caps lower degrades instead of failing.
const IMAGE_TIER_SCALE = { "1k": 1, "2k": 1.5, "4k": 2.5 };
const roundTo64 = (n) => Math.max(256, Math.round(n / 64) * 64);

async function generateImageRunware(air, params) {
    announceRoute("runware", air);
    let [width, height] = AR_DIMENSIONS[params.aspect_ratio] || AR_DIMENSIONS["1:1"];
    const scale = IMAGE_TIER_SCALE[String(params.quality_tier || "1k").toLowerCase()];
    if (scale && scale !== 1) {
        width = roundTo64(width * scale);
        height = roundTo64(height * scale);
    }
    const task = {
        taskType: "imageInference",
        taskUUID: makeUUID(),
        model: air,
        positivePrompt: params.prompt || "",
        width,
        height,
        numberResults: Math.min(4, Math.max(1, parseInt(params.numberResults, 10) || 1)),
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

    const submitted = await submitRunwareTask(task);
    const accepted = submitted.find((t) => t.taskType === "imageInference");
    // Fast models may return the URL straight from the submit call. With
    // numberResults > 1 every variation comes back — surface them all.
    if (accepted?.imageURL) {
        const urls = submitted.filter((t) => t.imageURL).map((t) => t.imageURL);
        return { url: accepted.imageURL, urls, id: accepted.taskUUID, provider: "runware" };
    }
    const pendingId = accepted?.taskUUID || task.taskUUID;
    addPending({ id: pendingId, provider: "runware", type: "image", model: params.__modelId || "", prompt: params.prompt || "" });
    try {
        const result = await pollRunwareTask(pendingId, "image");
        removePending(pendingId);
        return { url: result.imageURL, id: result.taskUUID, provider: "runware" };
    } catch (error) {
        // Task was accepted — regenerating elsewhere would double-charge.
        // It stays in the pending queue; the reconciler will deliver it.
        error.noFallback = true;
        throw error;
    }
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

const stillRenderingError = () => new Error(
    "The provider accepted this generation but it is still rendering (heavy model or busy queue). " +
    "It will appear in your Runware library — do not regenerate, you would be charged twice.",
);

// Route an image generation. displayName enables dynamic Runware lookup when
// the model has no hand-mapped route. Returns {url, id, provider} or null.
// AIR ids (creator:model@version — Runware's own catalog) route directly and
// NEVER fall back: their errors surface with the provider's real cause.
export async function tryProviderGenerate(modelId, mode, params, displayName) {
    if (/:.+@/.test(modelId || "")) {
        if (!getProviderKey("runware")) {
            throw new Error("Runware API key required — add it in Settings to generate with this model.");
        }
        try {
            return await generateImageRunware(modelId, params);
        } catch (error) {
            if (error.noFallback && !error.definitive) throw stillRenderingError();
            throw error;
        }
    }
    const choice = pickProvider(modelId, mode);
    try {
        if (choice?.provider === "runware") return await generateImageRunware(choice.config.model, params);
        if (choice?.provider === "fal") return await generateImageFal(choice.config.endpoint, params);
    } catch (error) {
        if (error.noFallback) throw stillRenderingError();
        console.warn(`[providers] ${choice.provider} route failed for ${modelId}:`, error.message);
        // static route failed — still try dynamic Runware resolution below
    }
    if (getProviderKey("runware")) {
        const air = await resolveRunwareAir(displayName || modelId);
        if (air) {
            try {
                return await generateImageRunware(air, params);
            } catch (error) {
                if (error.noFallback) throw stillRenderingError();
                console.warn(`[providers] Runware dynamic route failed for ${modelId}:`, error.message);
            }
        }
    }
    return null; // caller surfaces a clear error — there is no Muapi fallback
}

// ── Video generation (Runware videoInference, async + getResponse poll) ─────

// Poll an async Runware task until its media URL appears. Images poll fast
// (1s early, 2s later); videos relax to 3s. Budget scales to the media kind.
// Tell the UI which provider is actually rendering (placeholder cards show
// it with an elapsed timer — a silent spinner reads as frozen after 30s).
export function announceRoute(provider, modelId) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("generation-route", { detail: { provider, modelId } }));
}

async function pollRunwareTask(taskUUID, kind) {
    const urlField = kind === "video" ? "videoURL" : "imageURL";
    const budgetMs = 600000; // heavy models + queue peaks need the full window
    const startedAt = Date.now();
    let attempt = 0;
    while (Date.now() - startedAt < budgetMs) {
        attempt++;
        const delay = kind === "video" ? 3000 : attempt <= 20 ? 1000 : 2000;
        await new Promise((r) => setTimeout(r, delay));
        let results;
        try {
            // getResponse looks up the ORIGINAL task by its own taskUUID field
            results = await runwareCall([
                { taskType: "getResponse", taskUUID },
            ]);
        } catch (error) {
            // A getResponse error addressed to OUR task is the provider's final
            // verdict (content moderation, invalid input) — the render will
            // never finish, so stop now with the real cause instead of looping
            // to a useless timeout. Anything else is transient: keep waiting.
            const fatal = (error.runwareErrors || []).find((e) => e.taskUUID === taskUUID);
            if (fatal) {
                const err = new Error(fatal.message || `Runware ${kind} generation failed`);
                err.definitive = true;
                err.noFallback = true; // task was accepted — never re-generate elsewhere
                err.runwareErrors = [fatal];
                throw err;
            }
            continue; // transient poll failure — keep waiting
        }
        const entry = results.find((t) => t.taskUUID === taskUUID || t[urlField]);
        if (!entry) continue;
        // Surface render progress to any listening UI (placeholder cards)
        if (typeof window !== "undefined" && typeof entry.progress === "number") {
            window.dispatchEvent(new CustomEvent("generation-progress", {
                detail: { taskUUID, progress: entry.progress },
            }));
        }
        const status = (entry.status || "").toLowerCase();
        if (entry[urlField]) return entry;
        if (status === "error" || status === "failed") {
            throw new Error(entry.error || `Runware ${kind} generation failed`);
        }
    }
    throw new Error(`Runware ${kind} generation timed out`);
}

// Video dimensions by aspect ratio, per resolution tier (multiples of 16).
const VIDEO_DIMENSIONS = {
    "480p": { "16:9": [848, 480], "9:16": [480, 848], "1:1": [640, 640], "4:3": [640, 480], "3:4": [480, 640], "21:9": [1120, 480] },
    "768p": { "16:9": [1360, 768], "9:16": [768, 1360], "1:1": [1024, 1024], "4:3": [1024, 768], "3:4": [768, 1024], "21:9": [1792, 768] },
    "720p": { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [960, 960], "4:3": [960, 720], "3:4": [720, 960], "21:9": [1680, 720] },
    "1080p": { "16:9": [1920, 1088], "9:16": [1088, 1920], "1:1": [1440, 1440], "4:3": [1440, 1088], "3:4": [1088, 1440], "21:9": [2560, 1088] },
    "4k": { "16:9": [3840, 2160], "9:16": [2160, 3840], "1:1": [2880, 2880], "4:3": [2880, 2160], "3:4": [2160, 2880], "21:9": [5040, 2160] },
};

function videoDimensions(params) {
    const res = params.resolution || "";
    const tierKey = /4k|2160/i.test(res) ? "4k"
        : /1080/.test(res) ? "1080p"
        : /768/.test(res) ? "768p"
        : /480/.test(res) ? "480p"
        : "720p";
    const tier = VIDEO_DIMENSIONS[tierKey];
    // "auto" aspect → let the subject decide framing; 16:9 is the render base
    return tier[params.aspect_ratio] || tier["16:9"];
}

// Pick from a model's allowedValues ("864x496", ...) the size closest to the
// requested aspect ratio (ties broken toward the requested area).
function closestAllowedSize(allowed, width, height) {
    const targetRatio = width / height;
    const targetArea = width * height;
    let best = null;
    for (const s of allowed) {
        const [w, h] = String(s).split("x").map(Number);
        if (!w || !h) continue;
        const score = Math.abs(w / h - targetRatio) * 1e6 + Math.abs(w * h - targetArea) / 1e3;
        if (!best || score < best.score) best = { w, h, score };
    }
    return best ? [best.w, best.h] : [width, height];
}

// Same-ratio fallback ladder for architectures that reject our dimensions
// WITHOUT telling us their allowedValues. Ordered by tier proximity; the
// final resort drops width/height entirely (model renders at its default).
const DIMENSION_LADDER = {
    "16:9": [[1920, 1080], [1920, 1088], [1280, 720], [1366, 768], [1344, 768], [864, 480], [960, 540]],
    "9:16": [[1080, 1920], [1088, 1920], [720, 1280], [768, 1366], [768, 1344], [480, 864], [540, 960]],
    "1:1": [[1080, 1080], [1024, 1024], [960, 960], [720, 720]],
    "4:3": [[1440, 1080], [1024, 768], [960, 720]],
    "3:4": [[1080, 1440], [768, 1024], [720, 960]],
    "21:9": [[2560, 1080], [1680, 720], [1344, 576]],
};

const isDimensionError = (error) =>
    (error.runwareErrors || []).some((e) => e.code === "unsupportedModelResolution")
    || /width\/height|width.*height.*combination|unsupported.*resolution/i.test(error.message || "");

// Parameter name(s) an error is complaining about — Runware ships them as a
// string, an array, or only inside the message text. Never trust one shape.
function offendingParams(e, task) {
    const names = new Set();
    for (const p of Array.isArray(e.parameter) ? e.parameter : [e.parameter]) {
        if (typeof p === "string" && p in task) names.add(p);
    }
    const m = (e.message || "").match(/'(\w+)' parameter/);
    if (m && m[1] in task) names.add(m[1]);
    return [...names];
}

// Protected fields the healer must never strip — without them there is no task.
const CORE_TASK_FIELDS = new Set(["taskType", "taskUUID", "model", "positivePrompt", "deliveryMethod", "outputType", "numberResults"]);

// Healing loop: submit, read the API's complaint, adapt, resubmit — until it
// is accepted or the complaint is one we cannot fix (then surface it whole).
// Each iteration removes one class of problem, so it converges fast.
async function submitRunwareTask(task) {
    let current = { ...task };
    let laddered = false;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            return await runwareCall([current]);
        } catch (error) {
            const errs = error.runwareErrors || [];
            let healed = false;

            // 1. Exact sizes offered (allowedValues shaped like WxH, any code)
            const dimError = errs.find(
                (e) => Array.isArray(e.allowedValues) && e.allowedValues.length && e.allowedValues.every((v) => /^\d+\s*[x*:]\s*\d+/.test(String(v))),
            );
            if (!healed && dimError && current.width && current.height) {
                const [w, h] = closestAllowedSize(dimError.allowedValues.map((v) => String(v).replace(/\s*\(.*\)$/, "").replace(/[*:]/, "x")), current.width, current.height);
                if (w !== current.width || h !== current.height) {
                    current = { ...current, taskUUID: makeUUID(), width: w, height: h };
                    healed = true;
                }
            }

            // 2. Duration enum offered (numeric allowedValues on a duration error)
            const durError = errs.find(
                (e) => /duration/i.test(String(e.parameter || "") + e.code) && Array.isArray(e.allowedValues) && e.allowedValues.some((v) => typeof v === "number"),
            );
            if (!healed && durError && current.duration) {
                const opts = durError.allowedValues.filter((v) => typeof v === "number");
                const snapped = opts.reduce((a, b) => (Math.abs(b - current.duration) < Math.abs(a - current.duration) ? b : a));
                if (snapped !== current.duration) {
                    current = { ...current, taskUUID: makeUUID(), duration: snapped };
                    healed = true;
                }
            }

            // 3. Unsupported/invalid parameter → strip it (never core fields)
            if (!healed) {
                for (const e of errs) {
                    const params = offendingParams(e, current).filter((p) => !CORE_TASK_FIELDS.has(p));
                    if (params.length) {
                        current = { ...current, taskUUID: makeUUID() };
                        for (const p of params) delete current[p];
                        healed = true;
                        break;
                    }
                }
            }

            // 4. Dimension rejection with no usable list → same-ratio ladder,
            //    then dimensionless (model default). One shot.
            if (!healed && !laddered && isDimensionError(error) && current.width && current.height) {
                laddered = true;
                const ratio = current.width / current.height;
                const ladder = Object.values(DIMENSION_LADDER)
                    .find((sizes) => Math.abs(sizes[0][0] / sizes[0][1] - ratio) < 0.05) || [];
                for (const [w, h] of ladder) {
                    if (w === current.width && h === current.height) continue;
                    try {
                        return await runwareCall([{ ...current, taskUUID: makeUUID(), width: w, height: h }]);
                    } catch (e) {
                        if (!isDimensionError(e)) throw e;
                    }
                }
                current = { ...current, taskUUID: makeUUID() };
                delete current.width;
                delete current.height;
                healed = true;
            }

            if (!healed) throw error; // not a self-healable complaint
        }
    }
    return await runwareCall([current]); // final attempt surfaces its own error
}

async function generateVideoRunware(air, params) {
    announceRoute("runware", air);
    let [width, height] = videoDimensions(params);
    // Probed constraints (free harvest from validation errors): snap to this
    // architecture's exact sizes/durations BEFORE submitting — right on the
    // first try, no error roundtrip. Self-heal remains the backstop.
    const known = MODEL_CONSTRAINTS[air];
    if (known?.sizes?.length) {
        [width, height] = closestAllowedSize(known.sizes, width, height);
    }
    if (known?.durations?.length && params.duration) {
        const target = Number(params.duration);
        if (!known.durations.includes(target)) {
            params = { ...params, duration: known.durations.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a)) };
        }
    }
    const task = {
        taskType: "videoInference",
        taskUUID: makeUUID(),
        model: air,
        positivePrompt: params.prompt || "",
        width,
        height,
        deliveryMethod: "async",
        outputType: "URL",
        numberResults: 1,
    };
    // Sound on/off in the shape THIS provider actually accepts: Kling reads
    // providerSettings.klingai.sound, Seedance reads settings.audio, Veo reads
    // providerSettings.google.generateAudio, and a probed minority takes the
    // top-level generateAudio. Wrong shape = silently mute video (Kling) or a
    // rejected submit — so unknown families get nothing.
    if (typeof params.__audio === "boolean") {
        applyAudioSetting(task, air, params.__audio, known?.audioParam === true);
    }
    if (params.duration) task.duration = parseInt(params.duration, 10) || undefined;
    // Image-to-video: first (and optionally last) frame
    const frames = [];
    if (params.image_url) frames.push({ inputImage: params.image_url, frame: "first" });
    if (params.last_image) frames.push({ inputImage: params.last_image, frame: "last" });
    if (frames.length) task.frameImages = frames;
    if (!params.image_url && params.images_list?.length) {
        task.referenceImages = params.images_list;
    }

    const submitted = await submitRunwareTask(task);
    const accepted = submitted.find((t) => t.taskType === "videoInference");
    const taskUUID = accepted?.taskUUID || task.taskUUID;
    addPending({ id: taskUUID, provider: "runware", type: "video", model: params.__modelId || "", prompt: params.prompt || "" });
    try {
        const result = await pollRunwareTask(taskUUID, "video");
        removePending(taskUUID);
        return { url: result.videoURL, id: taskUUID, provider: "runware" };
    } catch (error) {
        error.timedOutAfterAccept = true;
        throw error;
    }
}

// Route a video generation (t2v or i2v) through Runware's catalog.
// Returns {url, id, provider} or null → caller falls back to Muapi.
// AIR ids (creator:model@version, straight from Runware's own catalog) route
// directly and NEVER fall back — their errors surface with the real cause.
export async function tryProviderVideo(modelId, params, displayName) {
    if (!getProviderKey("runware")) return null;
    const direct = /:.+@/.test(modelId || "");
    const air = direct ? modelId : await resolveRunwareAir(displayName || modelId);
    if (!air) return null;
    try {
        return await generateVideoRunware(air, params);
    } catch (error) {
        if (error.timedOutAfterAccept && !error.definitive) {
            throw new Error(
                "The provider accepted this video but it is still rendering. " +
                "It will appear in your Runware library — do not regenerate, you would be charged twice.",
            );
        }
        if (direct || error.noFallback) throw error; // accepted/definitive: never re-generate on the wrapper
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

let falBalanceCache = { at: 0, value: null };

async function getFalBalance() {
    const key = getProviderKey("fal");
    if (!key) return null;
    // fal rate-limits the billing endpoint — cache for 60s
    if (Date.now() - falBalanceCache.at < 60000) return falBalanceCache.value;
    try {
        const response = await fetch("/api/providers/fal-billing", {
            headers: { "x-provider-key": key },
        });
        if (!response.ok) return null;
        const data = await response.json();
        const balance = data?.credits?.current_balance;
        const value = typeof balance === "number" ? balance : parseFloat(balance) || null;
        falBalanceCache = { at: Date.now(), value };
        return value;
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

// ── Prompt enhancement (Runware textInference, DeepSeek V4 Flash) ───────────

const ENHANCE_MODEL = "deepseek:v4@flash";

// Rewrite a short prompt into a rich generation prompt. Fails soft: any
// error returns the original prompt so generation never blocks on enhance.
// Deterministic guarantee for ByteDance-bound prompts: their moderation flags
// proper names (and brand marques) as copyright. Asking the LLM once is
// probabilistic — this enforces it. Chain: detect → targeted LLM scrub →
// re-check → mechanical replacement as last resort. Returns a prompt with
// zero detectable proper names, or the original for non-ByteDance models.
export async function scrubForByteDance(prompt, modelId) {
    if (!isByteDanceModel(modelId) || !prompt) return prompt;
    let names = detectProperNames(prompt);
    if (!names.length) return prompt;
    // Targeted rewrite: one job only, high compliance.
    try {
        const results = await runwareCall([
            {
                taskType: "textInference",
                taskUUID: makeUUID(),
                model: ENHANCE_MODEL,
                messages: [{
                    role: "user",
                    content:
                        `Rewrite the prompt below changing ONE thing only: remove every proper name (people, brands, trademarks) OUTSIDE quotation marks. A person's name becomes a short visible description of that person ("the man at the wheel"). A camera/lens/film brand becomes the IMAGE character that equipment produces — grain, halation, contrast, flare, color response ("anamorphic glass with gentle horizontal flares", "tungsten-balanced stock with soft halation in the highlights") — never a description of the physical object. TEXT INSIDE QUOTATION MARKS IS DIALOGUE — copy it through verbatim, never reword it. Keep every other word, rhythm and detail identical. Output ONLY the rewritten prompt.\n\nNames found: ${names.join(", ")}\n\nPROMPT:\n${prompt}`,
                }],
            },
        ]);
        const text = results.find((t) => t.taskType === "textInference")?.text?.trim();
        if (text) prompt = text;
    } catch { /* fall through to mechanical scrub */ }
    // Verify — and mechanically neutralize anything that survived, WITHOUT
    // ever touching quoted dialogue.
    names = detectProperNames(prompt);
    if (names.length) {
        const parts = prompt.split(/(["“][^"“”]*["”])/);
        prompt = parts.map((part, i) => {
            if (i % 2 === 1) return part; // quoted span — untouchable
            let out = part;
            for (const name of names) {
                out = out
                    .replace(new RegExp(`\\b${name}['’]s\\b`, "g"), "their")
                    .replace(new RegExp(`\\b${name}\\b`, "g"), "the character");
            }
            return out;
        }).join("");
    }
    return prompt;
}

export async function enhancePrompt(prompt, kind = "image", modelId = "") {
    if (!prompt || !getProviderKey("runware")) return prompt;
    const motion = kind === "video"
        ? " Describe motion explicitly: camera movement, subject action, pacing."
        : "";
    const dialect = dialectFor(modelId, kind);
    try {
        const results = await runwareCall([
            {
                taskType: "textInference",
                taskUUID: makeUUID(),
                model: ENHANCE_MODEL,
                messages: [
                    {
                        role: "user",
                        content:
                            "You are a prompt engineer for AI " + kind + " generation. Rewrite the prompt below into a vivid, specific generation prompt in English: subject details, lighting, composition, lens/camera language, mood, materials." + motion +
                            " Preserve any reference tokens like @img1, @image2 or 'image 1' EXACTLY as written.\n\n" + CRAFT_CORE + (dialect ? "\n\n" + dialect : "") + "\n\nOutput ONLY the rewritten prompt — no quotes, no commentary. At most 110 words.\n\nPROMPT TO REWRITE:\n" + prompt,
                    },
                ],
            },
        ]);
        const text = results.find((t) => t.taskType === "textInference")?.text?.trim();
        return await scrubForByteDance(text || prompt, modelId);
    } catch (error) {
        console.warn("[providers] enhance failed, using original prompt:", error.message);
        return prompt;
    }
}

// Director's fusion: merge the user's scene with the compiled cinematography
// treatment into ONE seamless generation prompt. Equipment names, lighting,
// palette and movement directives must survive verbatim. Fails soft.
export async function cinemaFusePrompt(compiledPrompt, mode = "image", hasStartFrame = false, opts = {}) {
    if (!compiledPrompt || !getProviderKey("runware")) return compiledPrompt;
    const instruction = fusionInstruction(mode, hasStartFrame, {
        continuation: !!opts.continuation,
        dialect: dialectFor(opts.modelId, mode, mode === "video" && hasStartFrame),
        hasCharacterRefs: !!opts.hasCharacterRefs,
        characters: opts.characters || [],
        audio: !!opts.audio,
        scripted: looksScripted(compiledPrompt),
    });
    try {
        const results = await runwareCall([
            {
                taskType: "textInference",
                taskUUID: makeUUID(),
                model: "deepseek:v4@flash",
                messages: [
                    {
                        role: "user",
                        content: instruction + "\n\nMATERIAL TO FUSE:\n" + compiledPrompt,
                    },
                ],
            },
        ]);
        const text = results.find((t) => t.taskType === "textInference")?.text?.trim();
        return await scrubForByteDance(text || compiledPrompt, opts.modelId);
    } catch (error) {
        console.warn("[providers] cinema fusion failed, using compiled prompt:", error.message);
        return compiledPrompt;
    }
}
