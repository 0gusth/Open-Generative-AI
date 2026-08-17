import { addPending, removePending } from "./ledger.js";
import { fusionInstruction, CRAFT_CORE, CRAFT_CORE_SCENE, CRAFT_VIDEO_EXTRA_SCENE, CRAFT_SCREENPLAY, looksScripted } from "./cinema/craft.js";
import { dialectFor } from "./cinema/modelDialects.js";
import { detectProperNames, cueNames, isByteDanceModel, needsNameScrub } from "./utils/preflight.js";
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
    // The "Edit" wrappers are separate catalog ids in this app, but on
    // Runware editing IS the base model with referenceImages — route them
    // to the same AIRs. (Without this the router had no static route and
    // the dynamic name search found nothing: Image Studio's edit mode died
    // with "not available on Runware or fal".)
    "nano-banana-edit": {
        i2i: {
            runware: { model: "google:4@1", cost: 0.039 },
            fal: { endpoint: "fal-ai/nano-banana/edit", cost: 0.039 },
        },
    },
    "nano-banana-2-edit": {
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

// Table lives in providerKeys.js so ledger.js can share it without a cycle;
// re-exported here to keep the public surface unchanged.
import { PROVIDER_KEY_STORAGE } from "./providerKeys.js";
export { PROVIDER_KEY_STORAGE };

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
// Flagship image models (Seedream 5, Nano Banana 2/Pro, Ideogram 4) are tuned
// for 2K+. Rendering them at the 1MP base makes current models look years old
// — soft detail, mushy micro-texture. 2K is the floor for finished work.
const IMAGE_TIER_SCALE = { "1k": 1, "2k": 1.5, "4k": 2.9 };
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
        includeCost: true, // real billed cost comes back per task
        positivePrompt: params.prompt || "",
        width,
        height,
        numberResults: Math.min(4, Math.max(1, parseInt(params.numberResults, 10) || 1)),
        ...(params.seed ? { seed: Number(params.seed) } : {}),
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
        return { url: accepted.imageURL, urls, id: accepted.taskUUID, provider: "runware", cost: accepted.cost };
    }
    const pendingId = accepted?.taskUUID || task.taskUUID;
    addPending({ id: pendingId, provider: "runware", type: "image", model: params.__modelId || "", prompt: params.prompt || "" });
    try {
        const result = await pollRunwareTask(pendingId, "image");
        removePending(pendingId);
        return { url: result.imageURL, id: result.taskUUID, provider: "runware", cost: result.cost };
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
                err.moderated = fatal.code === "invalidProviderContent";
                err.moderationDetail = fatal.responseContent || fatal.message || "";
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
const CORE_TASK_FIELDS = new Set(["taskType", "taskUUID", "model", "positivePrompt", "deliveryMethod", "outputType", "numberResults", "frameImages", "referenceImages", "inputs"]);

// Healing loop: submit, read the API's complaint, adapt, resubmit — until it
// is accepted or the complaint is one we cannot fix (then surface it whole).
// Each iteration removes one class of problem, so it converges fast.
async function submitRunwareTask(task, restoreDims = null) {
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

            // 2b. Invalid VALUE with an enum offered (e.g. resolution must be
            //     "1080p") → snap to the closest allowed value instead of
            //     stripping the user's choice. Only for invalid-value codes:
            //     unsupportedParameter ships allowedValues too, but that list
            //     is parameter NAMES, never values to assign.
            if (!healed) {
                for (const e of errs) {
                    if (!/invalid/i.test(String(e.code || "")) && !/invalid value/i.test(e.message || "")) continue;
                    const [param] = offendingParams(e, current);
                    const allowed = Array.isArray(e.allowedValues)
                        ? e.allowedValues.filter((v) => typeof v === "string" || typeof v === "number")
                        : [];
                    if (!param || !allowed.length || CORE_TASK_FIELDS.has(param)) continue;
                    if (allowed.some((v) => /^\d+\s*[x*:]\s*\d+/.test(String(v)))) continue; // WxH — step 1's job
                    if (allowed.includes(current[param])) continue; // complaint is not about this value
                    const curNum = parseFloat(current[param]);
                    const snapped = Number.isFinite(curNum)
                        ? allowed.reduce((a, b) => (Math.abs(parseFloat(b) - curNum) < Math.abs(parseFloat(a) - curNum) ? b : a))
                        : allowed[0];
                    current = { ...current, taskUUID: makeUUID(), [param]: snapped };
                    healed = true;
                    break;
                }
            }

            // 3a. A required parameter is missing → put it back. Video
            //     dimensions are the case that matters: some architectures
            //     demand width/height even with a start frame.
            if (!healed) {
                const missing = errs.find((e) => /required/i.test((e.message || "") + e.code));
                const wantsDims = missing && /width|height/i.test(missing.message || "");
                if (wantsDims && !current.width && restoreDims) {
                    current = { ...current, taskUUID: makeUUID(), width: restoreDims[0], height: restoreDims[1] };
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
        includeCost: true, // real billed cost comes back per task
        positivePrompt: params.prompt || "",
        width,
        height,
        deliveryMethod: "async",
        outputType: "URL",
        numberResults: 1,
        ...(params.seed ? { seed: Number(params.seed) } : {}),
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
    // ByteDance and Kling video never accept 'seed' (probes and the failure
    // ledger agree) — drop it up front instead of paying an error roundtrip.
    if (/^(bytedance|klingai):/i.test(air)) delete task.seed;

    // Image-to-video: first (and optionally last) frame.
    //
    // ONE format for every family — the docs for both ByteDance AND Kling
    // define it as inputs.frameImages [{ image, frame }], with dimensions
    // inherited from the image ("cannot be set manually"). The top-level
    // frameImages/inputImage shape was legacy: validators accepted it but
    // pipelines ignored it (ByteDance) or rejected it (Kling). Architectures
    // that DO want width/height with a frame get them back through the
    // healing loop's restoreDims path.
    const frames = [];
    if (params.image_url) frames.push({ image: params.image_url, frame: "first" });
    if (params.last_image) frames.push({ image: params.last_image, frame: "last" });
    if (frames.length) {
        task.inputs = { ...(task.inputs || {}), frameImages: frames };
        delete task.width;
        delete task.height;
        delete task.seed; // frame runs: seed is refused across families
        // Honor the user's tier. Models that only take one value (Kling 3 Pro
        // is 1080p-only) get snapped by the healing loop's enum step.
        const tier = String(params.resolution || "").toLowerCase();
        task.resolution = /4k|2160|1080/.test(tier) ? "1080p" : /480/.test(tier) ? "480p" : "720p";
    }
    if (!params.image_url && params.images_list?.length) {
        task.referenceImages = params.images_list;
    }

    // Architectures disagree about dimensions in image-to-video: Seedance
    // rejects width/height once frameImages is present, others REQUIRE them.
    // So we keep sending them and let the healing loop settle it in whichever
    // direction this model asks — removing them unconditionally just traded
    // one error for the opposite one.
    // ByteDance's OUTPUT moderation is probabilistic: the same clean input
    // can pass one run and get flagged the next ("may be related to
    // copyright"). One automatic re-roll absorbs most of that noise before
    // the user ever sees a scary verdict. Rejected renders are not kept
    // charges, so the retry costs a wait, not money.
    for (let take = 0; take < 2; take++) {
        const attempt = take === 0 ? task : { ...task, taskUUID: makeUUID() };
        const submitted = await submitRunwareTask(attempt, [width, height]);
        const accepted = submitted.find((t) => t.taskType === "videoInference");
        const taskUUID = accepted?.taskUUID || attempt.taskUUID;
        addPending({ id: taskUUID, provider: "runware", type: "video", model: params.__modelId || "", prompt: params.prompt || "" });
        try {
            const result = await pollRunwareTask(taskUUID, "video");
            removePending(taskUUID);
            return { url: result.videoURL, id: taskUUID, provider: "runware", cost: result.cost };
        } catch (error) {
            const modErr = (error.runwareErrors || []).find((e) => e.code === "invalidProviderContent");
            const detail = modErr ? (modErr.responseContent || modErr.message || "") : "";
            // INPUT verdicts ("input image may contain real person") are
            // deterministic: the same frame fails every take. Re-rolling only
            // burns minutes — skip straight to the router, which can move the
            // job to a family that accepts the frame. OUTPUT verdicts stay
            // probabilistic and keep the one re-roll.
            const inputFlagged = /input (image|video)|contain(s)? (a )?real person/i.test(detail);
            if (modErr && !inputFlagged && take === 0) {
                removePending(taskUUID);
                announceRoute("runware", air); // card keeps breathing during the re-roll
                continue;
            }
            if (modErr) {
                removePending(taskUUID); // rejected by moderation — nothing will ever deliver
                error.moderated = true;
                error.moderationDetail = detail;
            }
            error.timedOutAfterAccept = true;
            throw error;
        }
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
        // ByteDance's moderation consistently blocks i2v frames with
        // photorealistic faces ("input image may contain real person") —
        // platform policy, deterministic per frame. Kling accepts the same
        // frames, so move the job there instead of failing the user.
        // Moderation-rejected submits are never charged, so this reroute
        // cannot double-bill — it is a different provider's honest attempt.
        if (error.moderated && /^bytedance:/i.test(air) && params.image_url) {
            const fallbackAir = /1080|4k|2160/i.test(String(params.resolution || ""))
                ? "klingai:kling-video@3-pro"       // 1080p-class Kling
                : "klingai:kling-video@3-standard"; // 720p-class Kling
            announceRoute("runware", fallbackAir);
            try {
                const res = await generateVideoRunware(fallbackAir, params);
                return { ...res, reroutedFrom: air, reroutedTo: fallbackAir, moderationDetail: error.moderationDetail };
            } catch (fallbackError) {
                console.warn(`[providers] moderation reroute to ${fallbackAir} failed:`, fallbackError.message);
                throw error; // surface the ORIGINAL verdict, not the fallback's
            }
        }
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
let falBalanceInflight = null;

async function getFalBalance() {
    const key = getProviderKey("fal");
    if (!key) return null;
    // fal rate-limits the billing endpoint — cache for 60s
    if (Date.now() - falBalanceCache.at < 60000) return falBalanceCache.value;
    // Single-flight: every studio asks for the balance on mount, and all of
    // those calls land BEFORE the first response can fill the cache. Share
    // one request instead of letting the burst trip fal's rate limit.
    if (falBalanceInflight) return falBalanceInflight;
    falBalanceInflight = fetchFalBalance(key).finally(() => { falBalanceInflight = null; });
    return falBalanceInflight;
}

async function fetchFalBalance(key) {
    try {
        const response = await fetch("/api/providers/fal-billing", {
            headers: { "x-provider-key": key },
        });
        if (!response.ok) {
            // Cache the failure too — fal answers 429 exactly when we retry
            // eagerly, so an uncached miss turns into a request storm.
            falBalanceCache = { at: Date.now(), value: falBalanceCache.value };
            return falBalanceCache.value;
        }
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
export async function scrubForByteDance(prompt, modelId, mode = "video") {
    if (!needsNameScrub(modelId, mode) || !prompt) return prompt;
    let names = detectProperNames(prompt);
    // Scripted material always goes through the LLM pass: screenplay cues and
    // sentence-opening names slip past the detector, and skipping here was
    // exactly how named prompts kept reaching ByteDance's moderation.
    if (!names.length && !looksScripted(prompt)) return prompt;
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
    // Mechanical backstop — ONLY for names we are CERTAIN are people (from
    // screenplay cue lines), case-insensitively (cues are ALL-CAPS), never
    // inside quoted dialogue. Generic mid-sentence capitals stay with the
    // LLM's judgement: nuking them mechanically turned location titles into
    // "the character the character the character".
    const people = cueNames(prompt);
    if (people.length) {
        const marker = (i) => ["the first colleague", "the second colleague", "the third colleague", "the fourth colleague", "the fifth colleague"][i] || "another colleague";
        const parts = prompt.split(/(["“][^"“”]*["”])/);
        prompt = parts.map((part, pi) => {
            if (pi % 2 === 1) return part; // quoted span — untouchable
            let out = part;
            people.forEach((name, i) => {
                out = out
                    .replace(new RegExp(`\\b${name}['’]s\\b`, "gi"), `${marker(i)}'s`)
                    .replace(new RegExp(`\\b${name}\\b\\s*(\\([^)]*\\))?\\s*:`, "gi"), `${marker(i)} says:`)
                    .replace(new RegExp(`\\b${name}\\b`, "gi"), marker(i));
            });
            return out;
        }).join("");
    }
    return prompt;
}

// Auto-découpage: turn a prose scene into timed cuts for multi-shot mode.
// Returns [{action, size, move, secs}] with catalog ids, durations summing
// EXACTLY to targetSecs (last cut absorbs drift). Null on any failure —
// the caller keeps the cards untouched.
export async function decoupageScene(scene, { duration = 15, catalogs } = {}) {
    if (!scene?.trim() || !getProviderKey("runware")) return null;
    const instruction = [
        `You are a film editor doing découpage: split the scene below into timed cuts for ONE ${duration}-second clip.`,
        "THIS IS SEGMENTATION, NOT REWRITING. The author's scene is the film:",
        "- Use ONLY events, actions, characters and places that exist in the scene, in the scene's own order. NEVER invent new story events, locations, props or business.",
        "- Every line of dialogue is sacred: carry it VERBATIM (in quotes) inside the action of the cut where it is spoken. Never drop, merge or paraphrase dialogue.",
        `- If the scene holds more material than ${duration}s can breathe, keep the strongest CONSECUTIVE stretch from the start and stop — do not compress the whole scene into invented summary action.`,
        "Cutting doctrine on top of that:",
        "- 1-2 story beats per 5 seconds; a typical cut runs 3-6s. Never more cuts than the clip can breathe.",
        "- The money moment gets the LONGEST hold of the list (the hero hold).",
        "- Double contrast between adjacent cuts: change frame size AND camera character together.",
        "- Each cut's action is ONE line of observable behavior from the scene, present tense, no camera words inside the action (frame size and movement are separate fields).",
        `- Durations are integers in seconds and MUST sum to exactly ${duration}.`,
        `Frame size ids: ${catalogs?.sizes || ""}`,
        `Movement ids: ${catalogs?.moves || ""}`,
        'Output ONLY a JSON array, no commentary: [{"action": "...", "size": "<size id>", "move": "<movement id>", "secs": <int>}, ...]',
        "\nSCENE:\n" + scene,
    ].join("\n");
    try {
        const results = await runwareCall([
            {
                taskType: "textInference",
                taskUUID: makeUUID(),
                model: ENHANCE_MODEL,
                messages: [{ role: "user", content: instruction }],
            },
        ]);
        const text = results.find((t) => t.taskType === "textInference")?.text || "";
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) return null;
        const raw = JSON.parse(match[0]);
        if (!Array.isArray(raw) || !raw.length) return null;
        const cuts = raw
            .filter((c) => c && typeof c.action === "string" && c.action.trim())
            .map((c) => ({
                action: c.action.trim(),
                size: typeof c.size === "string" ? c.size : "auto",
                move: typeof c.move === "string" ? c.move : "auto",
                secs: Math.max(1, Math.round(Number(c.secs) || 3)),
            }));
        if (!cuts.length) return null;
        // Arithmetic law: the sum must close exactly — drift lands on the
        // longest cut (the hero hold can flex, a 1s insert cannot).
        const total = cuts.reduce((s, c) => s + c.secs, 0);
        if (total !== duration) {
            const longest = cuts.reduce((a, b) => (b.secs > a.secs ? b : a));
            longest.secs = Math.max(1, longest.secs + (duration - total));
        }
        return cuts;
    } catch (error) {
        console.warn("[providers] découpage failed:", error.message);
        return null;
    }
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
// Scene enhancer — the RIGHT shape for Cinema Studio's ✦.
//
// It improves ONLY the user's scene description (what they imagined), and
// runs BEFORE the compiler. The treatment blocks (gear, light, grade,
// movement — committee-curated, every phrase mapping to a visible feature)
// are then appended verbatim and never touched by an LLM. The old fusion did
// the opposite: it rewrote the finished prompt, diluting the curated language
// and adding sampling variance to every run.
export async function enhanceScene(scene, mode = "image", opts = {}) {
    if (!scene?.trim() || !getProviderKey("runware")) return scene;
    const scripted = looksScripted(scene);
    const i2v = mode === "video" && opts.hasStartFrame;
    const instruction = [
        `You are a film director sharpening a scene description before it goes to an AI ${mode} model.`,
        "Rewrite ONLY the scene: who is present, what they do, where they are, and the physical state of things.",
        "NEVER add camera bodies, lenses, film stocks, colour grades, lighting schemes, focus/bokeh/depth-of-field notes or camera-movement directives — a separate system appends all of that, and duplicating it makes the model obey two contradictory instructions. You MAY name practical sources that exist in the world (a lamp, a window, a screen) but never describe how they render.",
        "Character names: replace each one with a SHORT visible-marker phrase and then use that SAME phrase for every later mention — never mix the name and the description in one text, or the model reads them as two different people.",
        "Keep the author's intent and framing choices. Do not invent new story events.",
        "Write the result in ENGLISH even when the author wrote in another language — generation models are trained on English prompts. Dialogue inside quotation marks keeps its original language.",
        CRAFT_CORE,
        mode === "video" ? CRAFT_VIDEO_EXTRA_SCENE : "",
        i2v ? "A start frame is provided: describe ONLY what moves, changes or animates — never re-describe what the still already shows." : "",
        scripted ? CRAFT_SCREENPLAY : "",
        opts.dialect || "",
        scripted
            ? "Output ONLY the rewritten scene, no commentary. Keep every line of dialogue verbatim."
            : "Output ONLY the rewritten scene, no commentary. Keep it tight — this is the scene, not the full prompt.",
    ].filter(Boolean).join("\n\n");
    try {
        const results = await runwareCall([
            {
                taskType: "textInference",
                taskUUID: makeUUID(),
                model: ENHANCE_MODEL,
                messages: [{ role: "user", content: instruction + "\n\nSCENE:\n" + scene }],
            },
        ]);
        const text = results.find((t) => t.taskType === "textInference")?.text?.trim();
        return await scrubForByteDance(text || scene, opts.modelId, mode);
    } catch (error) {
        console.warn("[providers] scene enhance failed, using original scene:", error.message);
        return scene;
    }
}

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
