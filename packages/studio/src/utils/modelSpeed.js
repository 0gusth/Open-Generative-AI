/**
 * Heuristic speed tier for a model, keyed off id/name conventions.
 * Reflects the model's inherent latency — gateway queue time comes on top.
 *
 * Tiers:
 *   fast     ⚡ seconds-class (flash/schnell/lite/turbo distillates)
 *   thinking 🧠 reasoning image models (GPT Image, Nano Banana 2 / Gemini Pro)
 *   slow     🐢 heavy diffusion / long video renders
 *   null     mid-pack — no badge, avoids noise
 */
const FAST_HINTS = [
  "schnell", "lightning", "turbo", "flash", "lite", "fast",
  "nano-banana", "seedream", "sdxl", "realtime", "lcm",
];
const THINKING_HINTS = [
  "gpt", "4o", "nano-banana-2", "nano-banana-pro", "gemini-3", "o1",
];
const SLOW_HINTS = [
  "-4k", "4k-", "upscal", "grand", "master", "pro-max", "ultra",
];

export function modelSpeedTier(model) {
  if (!model) return null;
  const key = `${model.id || ""} ${model.name || ""} ${model.family || ""}`.toLowerCase();
  // "thinking" wins over "fast" so nano-banana-2 doesn't inherit nano-banana's tier
  if (THINKING_HINTS.some((h) => key.includes(h))) return "thinking";
  if (FAST_HINTS.some((h) => key.includes(h))) return "fast";
  if (SLOW_HINTS.some((h) => key.includes(h))) return "slow";
  return null;
}

export const SPEED_BADGES = {
  fast: { label: "⚡ fast", title: "Seconds-class model — good for iterating" },
  thinking: { label: "🧠 slow", title: "Reasoning model — high fidelity, ~40s-2min" },
  slow: { label: "🐢 slow", title: "Heavy model — expect a long render" },
};
