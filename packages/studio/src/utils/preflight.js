// Pre-flight prompt checks — catch known moderation triggers BEFORE the
// render is submitted and credits burn. ByteDance's filter reads the whole
// prompt as a scene; proper names read as (possibly protected) characters
// and are the most common copyright-flag trigger.

const COMMON_CAPITALIZED = new Set([
  // sentence furniture and words often capitalized mid-prompt
  "The", "A", "An", "And", "But", "Then", "They", "She", "He", "It", "His", "Her",
  "Their", "We", "You", "In", "On", "At", "As", "Of", "For", "With", "From",
  "Inside", "Outside", "Camera", "Cut", "Shot", "Scene", "Style", "Audio",
  "Close", "Wide", "Medium", "Slow", "Fast", "Static", "POV", "VFX",
]);

// Words that read as proper names: capitalized tokens that appear somewhere
// mid-sentence (not only as sentence openers) and are not common English
// capitalized words. Returns unique names in order of appearance.
export function detectProperNames(text) {
  if (!text) return [];
  const names = [];
  const seen = new Set();
  // positions that start a sentence (or the string) — capitalization there is
  // grammatical, not evidence of a name
  const sentenceStarts = new Set([0]);
  for (const m of text.matchAll(/[.!?…\n]\s*/g)) {
    sentenceStarts.add(m.index + m[0].length);
  }
  for (const m of text.matchAll(/\b[A-Z][a-zà-ÿ]{2,}(?:['’]s)?\b/g)) {
    const possessive = /['’]s$/.test(m[0]);
    const word = m[0].replace(/['’]s$/, "");
    if (COMMON_CAPITALIZED.has(word) || seen.has(word)) continue;
    // A sentence-opening capital is grammatical — unless it's possessive
    // ("Dave's gaze"), which common words almost never are.
    if (sentenceStarts.has(m.index) && !possessive) continue;
    seen.add(word);
    names.push(word);
  }
  return names;
}

// True when the model routes to ByteDance's backend (strict moderation).
export const isByteDanceModel = (modelId) => /seedance|seedream/i.test(modelId || "");
