// Cinema Studio multi-shot — découpage inside one clip.
//
// Doctrine (mined corpus): cuts are declared as a timed SHOT envelope the
// model can follow ("SHOT 1 (0-3s)… HARD CUT TO: …"); the arithmetic must
// close exactly (a wrong sum is dead air or an impossible cut — invisible
// until the render); adjacent cuts obey double contrast (frame size AND
// camera character both change); ~1-2 story beats per 5 seconds; the money
// moment earns the longest hold.

import { shotSizeById, SHOT_SIZES } from "./shots.js";
import { movementById, MOVEMENTS } from "./movement.js";

export const CUT_TRANSITIONS = ["HARD CUT TO:", "SMASH CUT TO:"];

export function makeCut(partial = {}) {
  return {
    id: `cut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action: "",
    size: "auto",     // SHOT_SIZES id | "auto"
    move: "auto",     // MOVEMENTS id | "auto"
    secs: 5,
    ...partial,
  };
}

export const cutsTotal = (cuts) => cuts.reduce((sum, c) => sum + (Number(c.secs) || 0), 0);

// The generation envelope. Per-cut framing + camera character live INSIDE
// each shot line; the compiler suppresses its global framing/motion/pace
// blocks when this rides as the subject (setup.multiShot).
export function buildShotEnvelope(cuts) {
  const lines = [];
  let t = 0;
  cuts.forEach((cut, i) => {
    const t0 = t;
    t += Number(cut.secs) || 0;
    const size = cut.size !== "auto" ? shotSizeById(cut.size) : null;
    const move = cut.move !== "auto" ? movementById(cut.move) : null;
    const specs = [size?.prompt, move?.prompt].filter(Boolean).join(". ");
    lines.push(`SHOT ${i + 1} (${t0}-${t}s): ${cut.action.trim()}${specs ? `. ${specs}` : ""}`);
    if (i < cuts.length - 1) lines.push("HARD CUT TO:");
  });
  return lines.join("\n");
}

// ── Audits (rendered live, never blocking except the arithmetic) ──────────

// Monotony: 3+ consecutive cuts repeating size AND movement — the #1 tell
// of a generated shotlist.
export function monotonyAudit(cuts) {
  for (let i = 0; i + 2 < cuts.length; i++) {
    const [a, b, c] = [cuts[i], cuts[i + 1], cuts[i + 2]];
    if (a.size === b.size && b.size === c.size && a.move === b.move && b.move === c.move) {
      return `Cuts ${i + 1}-${i + 3} repeat the same frame size and movement — vary one of them.`;
    }
  }
  return null;
}

// Double contrast: adjacent cuts should change frame size AND camera
// character (movement family). Soft hint, not a block.
export function contrastAudit(cuts) {
  const flat = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (a.size === "auto" || b.size === "auto") continue;
    const famA = a.move !== "auto" ? movementById(a.move)?.family : null;
    const famB = b.move !== "auto" ? movementById(b.move)?.family : null;
    if (a.size === b.size && famA && famA === famB) flat.push(`${i + 1}→${i + 2}`);
  }
  return flat.length
    ? `Cuts ${flat.join(", ")} keep both frame size and camera family — double contrast wants at least one to change.`
    : null;
}

// Compact catalogs for the auto-découpage LLM (ids the UI understands).
export function decoupageCatalogs() {
  return {
    sizes: SHOT_SIZES.map((s) => `${s.id} = ${s.name}`).join("; "),
    moves: MOVEMENTS.map((m) => `${m.id} = ${m.name} (${m.family})`).join("; "),
  };
}
