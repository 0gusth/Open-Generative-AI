import { NextResponse } from "next/server";
import { mkdir, writeFile, access } from "fs/promises";
import path from "path";
import { CINEMA_CAMERAS, PHOTO_CAMERAS, CINE_LENSES, PHOTO_LENSES, FILM_STOCKS, APERTURES } from "../../../packages/studio/src/cinema/gear.js";
import { GENRES, ERAS, TEMPOS } from "../../../packages/studio/src/cinema/filmSetup.js";
import { PALETTES } from "../../../packages/studio/src/cinema/palettes.js";
import { LIGHTING } from "../../../packages/studio/src/cinema/lighting.js";
import { MOVEMENTS } from "../../../packages/studio/src/cinema/movement.js";
import { SHOT_SIZES, ANGLES } from "../../../packages/studio/src/cinema/shots.js";

// Maintenance route: generates any MISSING catalog thumbnails (FLUX Schnell,
// ~$0.0013/image) into public/cinema-thumbs. The Runware key arrives per
// request in x-provider-key — same lane as every generation, never stored.
// Skips files that already exist, so calling it is idempotent and cheap.

const MODEL = "runware:100@1";
const CONCURRENCY = 8;

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
  "shot": (p) => `cinematic film still of a woman in a red coat inside a vast train station hall, ${p}`,
  "angle": (p) => `cinematic film still of a man in a long coat on a rain-slick city plaza at night, ${p}`,
};

function allJobs() {
  const jobs = [];
  const add = (category, items, promptOf) => {
    for (const item of items) jobs.push({ category, id: item.id, prompt: BASES[category](promptOf ? promptOf(item) : item.prompt) });
  };
  add("cine-camera", CINEMA_CAMERAS);
  add("photo-camera", PHOTO_CAMERAS);
  add("cine-lens", CINE_LENSES);
  add("photo-lens", PHOTO_LENSES);
  add("stock", FILM_STOCKS);
  add("aperture", APERTURES);
  add("genre", GENRES, (g) => g);
  add("era", ERAS);
  add("tempo", TEMPOS, (t) => t);
  add("palette", PALETTES);
  add("lighting", LIGHTING);
  add("movement", MOVEMENTS);
  add("shot", SHOT_SIZES);
  add("angle", ANGLES);
  return jobs;
}

async function generateOne(key, outDir, job) {
  const file = path.join(outDir, `${job.category}-${job.id}.webp`);
  try { await access(file); return "skipped"; } catch { /* missing — generate */ }

  const uuid = crypto.randomUUID();
  const submit = await fetch("https://api.runware.ai/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify([{ taskType: "getResponse", taskUUID: uuid }]),
    });
    const pd = await poll.json();
    const entry = (pd.data || []).find((t) => t.taskUUID === uuid);
    if (entry?.imageURL) {
      const img = await fetch(entry.imageURL);
      await writeFile(file, Buffer.from(await img.arrayBuffer()));
      return "generated";
    }
    if (/error|failed/i.test(entry?.status || "")) throw new Error(`${job.id}: generation failed`);
  }
  throw new Error(`${job.id}: timed out`);
}

export async function POST(request) {
  const key = request.headers.get("x-provider-key");
  if (!key) return NextResponse.json({ error: "Missing Runware API key" }, { status: 401 });

  const outDir = path.join(process.cwd(), "public", "cinema-thumbs");
  await mkdir(outDir, { recursive: true });

  const queue = allJobs();
  let generated = 0, skipped = 0;
  const failures = [];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const job = queue.shift();
      try {
        (await generateOne(key, outDir, job)) === "generated" ? generated++ : skipped++;
      } catch (e) {
        failures.push(e.message);
      }
    }
  }));
  return NextResponse.json({ generated, skipped, failures });
}
