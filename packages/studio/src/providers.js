// Multi-provider router: sends generations to fal.ai or Runware when the
// selected model is available there and a key is configured, falling back to
// Muapi otherwise. Routing policy (user-defined):
//   1. Only providers that host the model AND have a key are candidates.
//   2. If candidate prices are similar (within PRICE_SIMILARITY), pick the
//      fastest (fal's inference engine benchmarks 2-5x faster in 2026).
//   3. Otherwise pick the cheapest (usually Runware on open models).
//   4. Any error falls through to the Muapi path — routing never breaks a
//      generation that would have worked before.

const PRICE_SIMILARITY = 0.15; // ±15% counts as "same price"

// Speed rank: lower = faster (2026 benchmarks: fal ~2-5x on same models).
const SPEED_RANK = { fal: 1, runware: 2 };

// Routes keyed by this app's model ids. Costs are USD per image at ~1MP,
// from each provider's public pricing (verified Aug 2026). Extend freely —
// unknown models simply keep using Muapi.
export const PROVIDER_ROUTES = {
    "nano-banana": {
        t2i: {
            runware: { model: "google:4@1", cost: 0.039 },
            fal: { endpoint: "fal-ai/nano-banana", cost: 0.039 },
        },
        i2i: {
            fal: { endpoint: "fal-ai/nano-banana/edit", cost: 0.039 },
        },
    },
    "nano-banana-2": {
        t2i: {
            runware: { model: "google:4@3", cost: 0.069 },
            fal: { endpoint: "fal-ai/nano-banana-2", cost: 0.069 },
        },
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

// Pick a provider for (modelId, mode) or return null to use Muapi.
export function pickProvider(modelId, mode) {
    const route = PROVIDER_ROUTES[modelId]?.[mode];
    if (!route) return null;
    const candidates = Object.entries(route)
        .filter(([provider]) => !!getProviderKey(provider))
        .map(([provider, config]) => ({ provider, config }));
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

function makeUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

async function generateViaRunware(config, params) {
    const key = getProviderKey("runware");
    const [width, height] = AR_DIMENSIONS[params.aspect_ratio] || AR_DIMENSIONS["1:1"];
    const task = {
        taskType: "imageInference",
        taskUUID: makeUUID(),
        model: config.model,
        positivePrompt: params.prompt || "",
        width,
        height,
        numberResults: 1,
        outputType: "URL",
        outputFormat: "PNG",
        deliveryMethod: "sync",
    };
    if (params.images_list?.length) task.referenceImages = params.images_list;

    const response = await fetch("/api/providers/runware", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-provider-key": key },
        body: JSON.stringify([task]),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.errors?.[0]?.message || data?.error || `Runware error ${response.status}`);
    }
    const result = (data.data || []).find((t) => t.taskType === "imageInference");
    const url = result?.imageURL;
    if (!url) throw new Error("Runware returned no image URL");
    return { url, id: result.taskUUID, provider: "runware" };
}

async function generateViaFal(config, params) {
    const key = getProviderKey("fal");
    const input = {
        prompt: params.prompt || "",
        num_images: 1,
    };
    if (params.aspect_ratio && params.aspect_ratio !== "auto") {
        input.aspect_ratio = params.aspect_ratio;
    }
    if (params.images_list?.length) input.image_urls = params.images_list;

    const response = await fetch(`/api/providers/fal/${config.endpoint}`, {
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

// Try routing a generation through fal/Runware. Returns {url, id, provider}
// or null when no route applies (caller then uses the Muapi path).
export async function tryProviderGenerate(modelId, mode, params) {
    const choice = pickProvider(modelId, mode);
    if (!choice) return null;
    try {
        if (choice.provider === "runware") return await generateViaRunware(choice.config, params);
        if (choice.provider === "fal") return await generateViaFal(choice.config, params);
        return null;
    } catch (error) {
        console.warn(`[providers] ${choice.provider} route failed for ${modelId}, falling back to Muapi:`, error.message);
        return null;
    }
}
