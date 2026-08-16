// Generates catalog thumbnails for the Cinema Studio using the catalogs' own
// prompt lines (FLUX Schnell via Runware — ~$0.0013/image). Same base scene
// per category, variable treatment, so differences between items pop.
//
// Usage: RUNWARE_KEY=xxx node scripts/generate-cinema-thumbs.mjs [--only category]
// Output: public/cinema-thumbs/<category>-<id>.webp  (skips existing files)

import { mkdir, writeFile, access } from "fs/promises";
import path from "path";
import { CINEMA_CAMERAS, PHOTO_CAMERAS, CINE_LENSES, PHOTO_LENSES, FILM_STOCKS, APERTURES } from "../packages/studio/src/cinema/gear.js";
import { GENRES, ERAS, TEMPOS } from "../packages/studio/src/cinema/filmSetup.js";
import { PALETTES } from "../packages/studio/src/cinema/palettes.js";
import { LIGHTING } from "../packages/studio/src/cinema/lighting.js";
import { MOVEMENTS } from "../packages/studio/src/cinema/movement.js";

const KEY = process.env.RUNWARE_KEY;
if (!KEY) { console.error("RUNWARE_KEY env var required"); process.exit(1); }

const OUT_DIR = path.join(process.cwd(), "public", "cinema-thumbs");
const MODEL = "runware:100@1"; // FLUX Schnell
const CONCURRENCY = 8;

// Constant base scenes per category — treatment varies, subject stays.
const BASES = {
  "cine-camera": (p) => `cinematic film still of a woman standing on a city street at dusk, medium shot, ${p}`,
  "photo-camera": (p) => `portrait photograph of a man by a window, natural pose, ${p}`,
  "cine-lens": (p) => `cinematic film still of a woman on a city street at dusk with practical lights in the background, medium close-up, ${p}`,
  "photo-lens": (p) => `portrait photograph of a woman against a garden background, ${p}`,
  "stock": (p) => `photograph of a young couple at a street cafe in afternoon light, candid moment, ${p}`,
  "aperture": (p) => `portrait of a man at a market street with people and lights behind him, ${p}`,
  "genre": (g) => `cinematic film still: a lone figure in a city environment, ${g.blocks.framing}, ${g.blocks.light}, ${g.blocks.palette}`,
  "era": (p) => `street scene with a parked car and a couple walking, ${p}`,
  "tempo": (t) => `film editing storyboard contact sheet, six sequential frames of one action scene arranged in a grid, illustrating ${t.character}: ${t.prompt}`,
  "palette": (p) => `cinematic film still of a woman in a diner by the window at dusk, cars outside, ${p}`,
  "lighting": (p) => `cinematic portrait of a man seated in a dark studio space, ${p}`,
  "movement": (p) => `cinematic film still frozen mid-camera-move with visible motion energy and blur trails, ${p}`,
};

const JOBS = [];
const add = (category, items, promptOf) => {
  for (const item of items) JOBS.push({ category, id: item.id, prompt: BASES[category](promptOf ? promptOf(item) : item.prompt) });
};
add("cine-camera", CINEMA_CAMERAS);
add("photo-camera", PHOTO_CAMERAS);
add("cine-lens", CINE_LENSES);
add("photo-lens", PHOTO_LENSES);
add("stock", FILM_STOCKS);
add("aperture", APERTURES);
add("genre", GENRES, (g) => g); // base builds from blocks
add("era", ERAS);
add("tempo", TEMPOS, (t) => t);
add("palette", PALETTES);
add("lighting", LIGHTING);
add("movement", MOVEMENTS);

const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const jobs = only ? JOBS.filter((j) => j.category === only) : JOBS;

async function generate(job) {
  const file = path.join(OUT_DIR, `${job.category}-${job.id}.webp`);
  try { await access(file); return { job, skipped: true }; } catch { /* generate */ }

  const uuid = crypto.randomUUID();
  const submit = await fetch("https://api.runware.ai/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify([{
      taskType: "imageInference", taskUUID: uuid, model: MODEL,
      positivePrompt: job.prompt, width: 512, height: 512,
      numberResults: 1, outputType: "URL", outputFormat: "WEBP", deliveryMethod: "async",
    }]),
  });
  const sd = await submit.json();
  if (sd.errors?.length) throw new Error(`${job.id}: ${sd.errors[0].message}`);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify([{ taskType: "getResponse", taskUUID: uuid }]),
    });
    const pd = await poll.json();
    const entry = (pd.data || []).find((t) => t.taskUUID === uuid);
    if (entry?.imageURL) {
      const img = await fetch(entry.imageURL);
      await writeFile(file, Buffer.from(await img.arrayBuffer()));
      return { job, ok: true };
    }
    if (/error|failed/i.test(entry?.status || "")) throw new Error(`${job.id}: generation failed`);
  }
  throw new Error(`${job.id}: timed out`);
}

await mkdir(OUT_DIR, { recursive: true });
console.log(`Generating ${jobs.length} thumbnails (concurrency ${CONCURRENCY})…`);
let done = 0, skipped = 0, failed = 0;
const queue = [...jobs];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const job = queue.shift();
    try {
      const r = await generate(job);
      r.skipped ? skipped++ : done++;
      process.stdout.write(`\r  ${done} generated · ${skipped} skipped · ${failed} failed   `);
    } catch (e) {
      failed++;
      console.error(`\n  ✗ ${e.message}`);
    }
  }
}));
console.log(`\nDone: ${done} generated, ${skipped} skipped, ${failed} failed → public/cinema-thumbs/`);
