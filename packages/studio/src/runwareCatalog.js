// Runware-native video catalog — the primary provider's own model list,
// fetched from modelSearch with real capability tags (native-audio, 4K,
// first-last-frame, io:image-to-video…) and creator logos. This replaces
// the Muapi wrapper as the source of which models exist; Muapi entries
// remain only for models Runware doesn't carry.

import { getProviderKey } from "./providers.js";
import MODEL_CONSTRAINTS from "./modelConstraints.json";

const CACHE_KEY = "runware_video_catalog_v1";
const IMAGE_CACHE_KEY = "runware_image_catalog_v1";
const CACHE_TTL = 24 * 3600 * 1000;

export const isAirId = (id) => typeof id === "string" && id.includes(":") && id.includes("@");

function mapEntry(m) {
  const tags = m.tags || [];
  const caps = m.capabilities || [];
  return {
    id: m.air,
    name: m.name,
    provider: m.creator?.id || "runware",
    provider_name: m.creator?.name || "Runware",
    logoUrl: m.creator?.logo || null,
    comment: m.comment || "",
    tags,
    rw: {
      t2v: caps.includes("io:text-to-video"),
      i2v: caps.includes("io:image-to-video"),
      audio: tags.includes("native-audio") || tags.includes("synchronized-audio"),
      fourK: tags.includes("4K"),
      firstLast: tags.includes("first-last-frame"),
      defaultDuration: m.defaultDuration || null,
    },
  };
}

export async function fetchRunwareVideoCatalog() {
  if (typeof window === "undefined" || !getProviderKey("runware")) return [];
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
    if (cached && Date.now() - cached.at < CACHE_TTL && cached.models?.length) return cached.models;
  } catch { /* refetch */ }

  const key = getProviderKey("runware");
  const models = [];
  try {
    for (let offset = 0; offset < 300; offset += 50) {
      const res = await fetch("/api/providers/runware", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-provider-key": key },
        body: JSON.stringify([{ taskType: "modelSearch", taskUUID: crypto.randomUUID(), category: "video", limit: 50, offset }]),
      }).then((r) => r.json());
      const page = res.data?.[0]?.results || [];
      models.push(...page.filter((m) => m.air).map(mapEntry));
      if (page.length < 50) break;
    }
  } catch (e) {
    console.warn("[runwareCatalog] fetch failed:", e.message);
    return models;
  }
  // Only generation models (t2v or i2v) belong in the picker
  const usable = models.filter((m) => m.rw.t2v || m.rw.i2v);
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), models: usable }));
  } catch { /* best-effort */ }
  return usable;
}

// Generation is Runware-only: when the native catalog is loaded, it IS the
// model list — wrapper entries are never appended (they would route nowhere).
// The wrapper list survives only as a browse fallback while no Runware key /
// catalog exists; generating from it surfaces the "configure your key" error.
// ── Image catalog ───────────────────────────────────────────────────────────
// The "checkpoint" category holds 23k+ entries (mostly community LoRA bases).
// Only `source: "curated"` entries are the closed flagship models we want, and
// Runware returns them first — so we page while curated results keep coming
// and stop as soon as a page has none.
const TRAINING_NOISE = /lora[- ]training|training$|object[- ]remover|upscal|background[- ]remov|inpaint/i;

function mapImageEntry(m) {
  const caps = m.capabilities || [];
  return {
    id: m.air,
    name: m.name,
    provider: m.creator?.id || "runware",
    provider_name: m.creator?.name || "Runware",
    logoUrl: m.creator?.logo || null,
    comment: m.comment || "",
    rwImage: {
      t2i: caps.includes("io:text-to-image") || caps.length === 0,
      i2i: caps.includes("io:image-to-image"),
    },
  };
}

export async function fetchRunwareImageCatalog() {
  if (typeof window === "undefined" || !getProviderKey("runware")) return [];
  try {
    const cached = JSON.parse(window.localStorage.getItem(IMAGE_CACHE_KEY) || "null");
    if (cached && Date.now() - cached.at < CACHE_TTL && cached.models?.length) return cached.models;
  } catch { /* refetch */ }

  const key = getProviderKey("runware");
  const models = [];
  try {
    // Two pages: Runware returns the flagship closed models first; deeper
    // pages are style checkpoints ("Exactly Bold Chromatics"…) that would
    // bury the picker in noise.
    for (let offset = 0; offset < 100; offset += 50) {
      const res = await fetch("/api/providers/runware", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-provider-key": key },
        body: JSON.stringify([{ taskType: "modelSearch", taskUUID: crypto.randomUUID(), category: "checkpoint", limit: 50, offset }]),
      }).then((r) => r.json());
      const page = res.data?.[0]?.results || [];
      const curated = page.filter((m) => m.air && m.source === "curated" && !TRAINING_NOISE.test(m.name || ""));
      models.push(...curated.map(mapImageEntry));
      if (!curated.length || page.length < 50) break;
    }
  } catch (e) {
    console.warn("[runwareCatalog] image fetch failed:", e.message);
    return models;
  }
  const usable = models.filter((m) => m.rwImage.t2i);
  try {
    window.localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify({ at: Date.now(), models: usable }));
  } catch { /* best-effort */ }
  return usable;
}

// Same contract as the video merge: the native list wins; the wrapper list
// survives only as a browse fallback when no Runware catalog is available.
export function mergeImageCatalogs(runwareModels, wrapperModels) {
  return runwareModels.length ? runwareModels : wrapperModels;
}

export function mergeVideoCatalogs(runwareModels, wrapperModels) {
  if (!runwareModels.length) return wrapperModels;
  // Probe-verified: drop models whose t2v tag lied (avatar/lipsync endpoints,
  // frame-required models, broken configs) — they can't run from a prompt.
  return runwareModels.filter((m) => m.rw.t2v && !MODEL_CONSTRAINTS[m.id]?.unusableT2v);
}

// Image-to-video slice of the native catalog (same fallback contract).
export function i2vVideoCatalog(runwareModels, wrapperModels) {
  if (!runwareModels.length) return wrapperModels;
  return runwareModels.filter((m) => m.rw.i2v);
}
