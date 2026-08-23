// The curated shortlist — ONE source shared by Cinema and Image Studio.
//
// It exists because the raw catalogs are hostile: the legacy wrapper list
// carries 400+ entries that no longer resolve, and the provider's own list is
// ordered by its internals, not by what produces good work. These are the
// models worth reaching for first, with the reason they earn the slot.
//
// Native AIR ids come first; the wrapper ids at the end are only reachable
// when the native catalog has not loaded. Whatever is not in the active
// catalog is simply skipped, so a stale entry can never break the picker.

export const CURATED_MODELS = {
  image: [
    "bytedance:seedream@5.0-pro",   // dense prompts + reference consistency
    "seedream-5.0",                 // Seedream 5.0 Lite — both bill direct
    "google:4@3",                   // Nano Banana 2 — fast pro quality
    "google:nano-banana@2-lite",    // cheap drafting
    "ideogram:4@0",                 // typography and text inside the image
    "xai:grok-imagine@image-2.0",   // multi-image composition
    "alibaba:qwen-image@3.0-pro",   // long, structured prompts
    "reve:2@1",                     // stylised photography
    "nano-banana-2",                // legacy-catalog fallbacks below
    "flux-2-pro",
    "gpt-image-2",
  ],
  video: [
    "bytedance:seedance@2.5",              // deep dialect, multiref, audio
    "bytedance:seedance@2.0",
    "klingai:kling-video@3-pro",           // character/performance king
    "klingai:kling-video@o3-standard",     // reference-driven
    "google:3@3",                          // Veo 3.1 Fast — environment hero
    "minimax:h3@0",
  ],
};

// Order a catalog so the curated picks lead, in the order above, and
// everything else follows untouched.
export function curatedFirst(models, kind = "image") {
  const rank = new Map((CURATED_MODELS[kind] || []).map((id, i) => [id, i]));
  const picked = [];
  const rest = [];
  for (const m of models) (rank.has(m.id) ? picked : rest).push(m);
  picked.sort((a, b) => rank.get(a.id) - rank.get(b.id));
  return { curated: picked, rest };
}
