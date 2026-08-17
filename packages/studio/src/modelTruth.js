// Capability TRUTH per model family — sourced from the official model specs
// (absorbed comparison matrix + vendor docs), NOT from any aggregator's
// catalog. Muapi's wrapper metadata under-declares features (Seedance 2.0
// there: quality high/basic, duration 5/10/15 — the real model does
// 480p→4K and 4–15s continuous). The UI reads this first; the catalog is
// only the fallback for long-tail models; the per-provider adapters
// translate these values into whatever each API actually accepts.
//
// Only fields we KNOW are declared — anything absent falls back to catalog.

const ALL_ASPECTS = ["auto", "16:9", "9:16", "4:3", "3:4", "1:1", "21:9"];

const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

export const MODEL_TRUTH = [
  {
    match: /seedance-2\.5|seedance-2-5/i,
    aspects: ALL_ASPECTS,
    qualities: ["480p", "720p", "1080p", "4k"],
    durations: range(4, 16),
    bitrate: true,
    audio: true,
  },
  {
    match: /seedance-v2|seedance-2(?![.\d])/i, // Seedance 2.0 family
    aspects: ALL_ASPECTS,
    qualities: ["480p", "720p", "1080p", "4k"],
    durations: range(4, 15),
    bitrate: true,
    audio: true,
  },
  {
    match: /seedance-v1\.5/i,
    aspects: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    qualities: ["480p", "720p", "1080p"],
    durations: [4, 8, 12],
    audio: true,
  },
  {
    match: /kling-v3/i,
    aspects: ["16:9", "9:16", "1:1"],
    qualities: ["720p", "1080p", "4k"], // 3.0 renders up to 4K HDR
    durations: range(3, 15),
    audio: true,
  },
  {
    match: /kling-v2\.6/i,
    aspects: ["16:9", "9:16", "1:1"],
    qualities: ["720p", "1080p"],
    durations: [5, 10],
    audio: true,
  },
  {
    match: /veo3\.1|veo-?3-1/i,
    aspects: ["16:9", "9:16"],
    qualities: ["720p", "1080p", "4k"],
    durations: [4, 6, 8],
    audio: true,
  },
  {
    match: /veo3(?!\.)/i,
    aspects: ["16:9", "9:16"],
    qualities: ["720p", "1080p"],
    durations: [4, 6, 8],
    audio: true,
  },
  {
    match: /hailuo-2\.3/i,
    aspects: ["16:9", "9:16", "1:1"],
    qualities: ["768p", "1080p"],
    durations: [6, 10],
    audio: false,
  },
  {
    match: /wan2\.7/i,
    aspects: ["16:9", "9:16", "1:1"],
    qualities: ["480p", "720p", "1080p"],
    durations: range(2, 15),
    audio: true,
  },
  {
    match: /wan2\.5/i,
    aspects: ["16:9", "9:16", "1:1"],
    qualities: ["480p", "720p", "1080p"],
    durations: [5, 10],
    audio: true,
  },
  {
    match: /grok-imagine.*video|grok.*text-to-video/i,
    aspects: ["16:9", "9:16", "1:1"],
    durations: range(1, 15),
    audio: true,
  },
  {
    match: /gemini-omni/i,
    aspects: ["16:9", "9:16"],
    qualities: ["720p"],
    durations: range(4, 10),
    audio: true,
  },
];

export function truthFor(modelId) {
  if (!modelId) return null;
  return MODEL_TRUTH.find((t) => t.match.test(modelId)) || null;
}
