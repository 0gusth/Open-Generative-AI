// Runware-native video catalog — the primary provider's own model list,
// fetched from modelSearch with real capability tags (native-audio, 4K,
// first-last-frame, io:image-to-video…) and creator logos. This replaces
// the Muapi wrapper as the source of which models exist; Muapi entries
// remain only for models Runware doesn't carry.

import { getProviderKey } from "./providers.js";

const CACHE_KEY = "runware_video_catalog_v1";
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

const normalizeName = (n) => (n || "").toLowerCase().replace(/[^a-z0-9.]+/g, "");

// Merge: Runware catalog first; wrapper models appended only when Runware
// doesn't carry an equivalent (matched by normalized display name).
export function mergeVideoCatalogs(runwareModels, wrapperModels) {
  if (!runwareModels.length) return wrapperModels;
  const have = new Set(runwareModels.map((m) => normalizeName(m.name)));
  const t2vOnly = runwareModels.filter((m) => m.rw.t2v);
  const extras = wrapperModels.filter((m) => !have.has(normalizeName(m.name)));
  return [...t2vOnly, ...extras];
}
