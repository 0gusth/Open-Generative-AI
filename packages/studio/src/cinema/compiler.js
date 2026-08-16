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

const pickDeterministic = (list, seedString) => {
  // Stable "auto" pick: same setup → same choice (no Date/random — respects
  // reproducibility); varies with the prompt so different scenes differ.
  if (!list.length) return null;
  let h = 0;
  for (let i = 0; i < seedString.length; i++) h = (h * 31 + seedString.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
};

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

  // ── Assembly: subject → framing → light → movement/pace → gear → grade ──
  const blocks = [];
  if (subject) blocks.push(subject);

  if (shotSize || angle) {
    blocks.push([shotSize?.prompt, angle?.prompt].filter(Boolean).join(", "));
    if (genre) blocks.push(`${genre.name.toLowerCase()} visual language`);
  } else if (genre) {
    blocks.push(`${genre.name.toLowerCase()} visual language: ${genre.blocks.framing}`);
  }

  blocks.push(lighting ? lighting.prompt : genre ? genre.blocks.light : null);

  if (mode === "video") {
    blocks.push(movement ? movement.prompt : genre ? genre.blocks.motion : null);
    if (effect) blocks.push(`VFX event: ${effect.prompt}`);
    blocks.push(tempo ? tempo.prompt : genre ? genre.blocks.pace : null);
  }

  if (camera) blocks.push(camera.prompt);
  if (lens) blocks.push(lens.prompt);
  if (aperture) blocks.push(aperture.prompt);
  if (medium) blocks.push(medium.prompt);
  if (era) blocks.push(era.prompt);

  blocks.push(palette ? palette.prompt : genre ? genre.blocks.palette : null);

  const prompt = blocks.filter(Boolean).join(". ");

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
