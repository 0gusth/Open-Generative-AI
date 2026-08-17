// Cinema Studio cinematography compiler — pure function turning the user's
// setup into the final generation prompt.
//
// Rules (the constitution of this module):
//   1. GENRE fills any dimension left on Auto with its per-dimension block;
//      an explicit user choice ALWAYS overrides the genre default.
//   2. ERA constrains Auto gear picks to era-coherent equipment and adds its
//      photographic fingerprint.
//   3. Film bodies pair with emulsions, digital bodies with color science —
//      never crossed.
//   4. TEMPO and MOVEMENT only apply in video mode; stills drop them.
//   5. Output is ordered for model parsing: subject first, then treatment
//      blocks from most to least influential.

import {
  CINEMA_CAMERAS, PHOTO_CAMERAS, CINE_LENSES, PHOTO_LENSES, FILM_STOCKS,
  APERTURES, apertureById, mediaForCamera, gearForEra, gearForGenre, isFilmBody,
} from "./gear.js";
import { GENRES, ERAS, TEMPOS, genreById, eraById, tempoById } from "./filmSetup.js";
import { PALETTES, paletteById, palettesForGenre } from "./palettes.js";
import { LIGHTING, lightingById, lightingForGenre } from "./lighting.js";
import { MOVEMENTS, movementById, movementsForGenre } from "./movement.js";
import { shotSizeById, angleById } from "./shots.js";
import { effectById } from "./effects.js";

// A still has no duration: genre framing lines written for cinema carry
// temporal clauses ("held long on faces", "prolonged takes, cutting only
// when a moment completes") that are pure noise to an image model — and
// they drag every frame toward the same close-up. Strip them for stills.
const TEMPORAL_CLAUSE = /\b(held long(?: on [a-z ]+)?|prolonged takes?|cutting only when[^,.]*|lingering|sustained takes?|long takes?|holds? on [a-z ]+ for [^,.]*)\b[,.]?\s*/gi;
function stillFraming(framing) {
  return (framing || "")
    .replace(TEMPORAL_CLAUSE, ", ")
    .replace(/\s*,\s*(,\s*)+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/(^[,\s]+|[,\s]+$)/g, "");
}

const pickDeterministic = (list, seedString) => {
  // Stable "auto" pick: same setup → same choice (no Date/random — respects
  // reproducibility); varies with the prompt so different scenes differ.
  if (!list.length) return null;
  let h = 0;
  for (let i = 0; i < seedString.length; i++) h = (h * 31 + seedString.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
};

// Per-family assembly order — the deterministic half of the model dialects.
// Each deviation is corpus-backed, not taste:
//  • Seedance reads left-to-right with falling attention and wants the CAMERA
//    block in 3rd position ("moved to the end, FOV gets ignored; moved to the
//    front, it conflicts with identity"), plus all six slots present.
//  • Veo leans on environment and light as the hero — light rides early.
//  • Image models want dense declarative attributes with the optical stack
//    close to the subject, and carry no motion sections at all.
const ASSEMBLY_PROFILES = {
  seedance: ["subject", "genreTag", "framing", "motion", "vfx", "gear", "light", "pace", "grade"],
  veo: ["subject", "genreTag", "framing", "light", "motion", "vfx", "gear", "pace", "grade"],
  imageDense: ["subject", "genreTag", "framing", "gear", "light", "grade"],
  default: ["subject", "genreTag", "framing", "light", "motion", "vfx", "pace", "gear", "grade"],
};

export function assemblyProfile(modelId = "", mode = "image") {
  const id = String(modelId || "");
  if (mode === "image") return ASSEMBLY_PROFILES.imageDense;
  if (/seedance|bytedance/i.test(id)) return ASSEMBLY_PROFILES.seedance;
  if (/veo|google:3@|google:veo/i.test(id)) return ASSEMBLY_PROFILES.veo;
  return ASSEMBLY_PROFILES.default;
}

// setup = {
//   mode: "image" | "video",
//   prompt: string,
//   genre, era, tempo, camera, lens, aperture, medium, palette, lighting,
//   movement: ids or "auto"
// }
export function compileCinematography(setup) {
  const mode = setup.mode === "video" ? "video" : "image";
  const subject = (setup.prompt || "").trim();
  const genre = setup.genre && setup.genre !== "auto" ? genreById(setup.genre) : null;
  const era = setup.era && setup.era !== "auto" ? eraById(setup.era) : null;
  const seed = `${subject}|${setup.genre}|${setup.era}`;

  // ── Gear resolution (era + genre coherent Auto) ──
  const cameraPool = mode === "video" ? CINEMA_CAMERAS : [...CINEMA_CAMERAS, ...PHOTO_CAMERAS];
  const lensPool = mode === "video" ? CINE_LENSES : [...CINE_LENSES, ...PHOTO_LENSES];

  const findGear = (pool, id) => pool.find((g) => g.id === id) || null;
  let camera = setup.camera && setup.camera !== "auto" ? findGear(cameraPool, setup.camera) : null;
  let lens = setup.lens && setup.lens !== "auto" ? findGear(lensPool, setup.lens) : null;

  // Auto pick preference: era∩genre → genre → era → full pool. Genre outranks
  // era for gear character (an epic wants epic-capable equipment even when the
  // decade has none tagged).
  const coherentPick = (pool, seedSuffix) => {
    const eraPool = gearForEra(pool, era?.id);
    const genrePool = gearForGenre(pool, genre?.id);
    const both = eraPool.filter((g) => genrePool.includes(g));
    const candidates = both.length ? both
      : genre && genrePool.length !== pool.length ? genrePool
      : eraPool;
    return pickDeterministic(candidates, seed + seedSuffix);
  };
  if (!camera && (genre || era)) camera = coherentPick(cameraPool, "cam");
  if (!lens && (genre || era)) lens = coherentPick(lensPool, "lens");

  // Medium: constrained by the chosen body (film ↔ emulsion, digital ↔ science)
  let medium = null;
  if (setup.medium && setup.medium !== "auto") {
    medium = FILM_STOCKS.find((s) => s.id === setup.medium) || null;
    // guard: never cross film/digital against the body
    if (medium && camera) {
      const allowed = mediaForCamera(camera, mode);
      if (!allowed.some((s) => s.id === medium.id)) medium = null;
    }
  }
  if (!medium && camera && (genre || era || setup.medium === "auto")) {
    const pool = mediaForCamera(camera, mode);
    const eraPool = gearForEra(pool, era?.id);
    const genrePool = gearForGenre(pool, genre?.id);
    const both = eraPool.filter((s) => genrePool.includes(s));
    medium = pickDeterministic(both.length ? both : genrePool.length !== pool.length ? genrePool : eraPool, seed + "med");
  }

  const aperture = setup.aperture && setup.aperture !== "auto" ? apertureById(setup.aperture) : null;

  // Shot grammar: explicit size/angle replace the genre's framing block
  // (rule 1 — a chosen frame outranks the genre default; mixing both would
  // ship contradictory framing to the model).
  const shotSize = setup.shotSize && setup.shotSize !== "auto" ? shotSizeById(setup.shotSize) : null;
  const angle = setup.angle && setup.angle !== "auto" ? angleById(setup.angle) : null;

  // ── Treatment dimensions: explicit > genre block > silence ──
  const palette = setup.palette && setup.palette !== "auto" ? paletteById(setup.palette) : null;
  const lighting = setup.lighting && setup.lighting !== "auto" ? lightingById(setup.lighting) : null;
  const movement = mode === "video" && setup.movement && setup.movement !== "auto"
    ? movementById(setup.movement) : null;
  const effect = mode === "video" && setup.effect && setup.effect !== "auto"
    ? effectById(setup.effect) : null;
  const tempo = mode === "video" && setup.tempo && setup.tempo !== "auto"
    ? tempoById(setup.tempo) : null;

  // ── Assembly, arranged for the target model (deterministic, no LLM) ──
  // Named sections, then ordered by the family's profile. Rule 5's default
  // order stands; profiles only reorder what the model demonstrably reads
  // differently (see assemblyProfile).
  const section = {
    subject: subject || null,
    framing: shotSize || angle
      ? [shotSize?.prompt, angle?.prompt].filter(Boolean).join(", ")
      : genre
        ? `${genre.name.toLowerCase()} visual language: ${mode === "image" ? stillFraming(genre.blocks.framing) : genre.blocks.framing}`
        : null,
    genreTag: (shotSize || angle) && genre ? `${genre.name.toLowerCase()} visual language` : null,
    light: lighting ? lighting.prompt : genre ? genre.blocks.light : null,
    motion: mode === "video" ? (movement ? movement.prompt : genre ? genre.blocks.motion : null) : null,
    vfx: mode === "video" && effect ? `VFX event: ${effect.prompt}` : null,
    pace: mode === "video" ? (tempo ? tempo.prompt : genre ? genre.blocks.pace : null) : null,
    gear: [camera?.prompt, lens?.prompt, aperture?.prompt, medium?.prompt, era?.prompt].filter(Boolean).join(". ") || null,
    grade: palette ? palette.prompt : genre ? genre.blocks.palette : null,
  };

  const order = assemblyProfile(setup.modelId, mode);
  const prompt = order.map((k) => section[k]).filter(Boolean).join(". ");

  return {
    prompt,
    resolved: {
      mode,
      genre: genre?.id || "auto",
      era: era?.id || "auto",
      camera: camera?.name || null,
      lens: lens?.name || null,
      aperture: aperture?.name || null,
      medium: medium?.name || null,
      shotSize: shotSize?.name || null,
      angle: angle?.name || null,
      palette: palette?.name || (genre ? `${genre.name} default` : null),
      lighting: lighting?.name || (genre ? `${genre.name} default` : null),
      movement: movement?.name || (mode === "video" && genre ? `${genre.name} default` : null),
      effect: effect?.name || null,
      tempo: tempo?.name || (mode === "video" && genre ? `${genre.name} default` : null),
    },
  };
}
