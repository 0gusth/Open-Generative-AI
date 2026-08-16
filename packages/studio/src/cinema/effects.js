// Cinema Studio VFX catalog — named visual events written as observable
// physics, never as platform preset names. One effect per shot: stacked VFX
// degrade into mush, so the axis is single-select like movement.

export const EFFECTS = [
  // ── Transformation ──
  { id: "disintegration", name: "Disintegration", family: "transformation",
    genres: ["fantasy", "thriller", "music-video"],
    prompt: "the subject breaks apart into fine drifting particles, edges dissolving first, fragments lifting away on an unseen current while the core holds shape until the final moment" },
  { id: "turning-metal", name: "Turning Metal", family: "transformation",
    genres: ["automotive", "product", "fashion-film"],
    prompt: "a liquid-chrome sheen sweeps across the subject's surface, skin and fabric hardening into polished mirror metal that catches every light source in sharp specular streaks" },
  { id: "freezing", name: "Freezing Over", family: "transformation",
    genres: ["fantasy", "luxury", "product"],
    prompt: "crystalline frost spreads across the subject in branching fractal veins, surfaces clouding to ice, fine mist rolling off as the freeze completes" },
  { id: "gas-dissolve", name: "Smoke Dissolve", family: "transformation",
    genres: ["thriller", "fantasy", "music-video"],
    prompt: "the subject's silhouette loosens into curling smoke, form unraveling from the extremities inward, the vapor holding the pose one breath before drifting apart" },
  { id: "tattoo-alive", name: "Ink Comes Alive", family: "transformation",
    genres: ["fashion-film", "music-video", "brand-film"],
    prompt: "inked linework on skin begins to flow and crawl, patterns rearranging in living curves, pigment swimming beneath the surface" },
  { id: "luminous-gaze", name: "Luminous Gaze", family: "transformation",
    genres: ["fantasy", "music-video", "epic"],
    prompt: "light kindles inside the subject's eyes, irises brightening to a hard glow that throws faint catchlight onto the cheekbones" },

  // ── Elemental ──
  { id: "fire-element", name: "Fire Wreath", family: "elemental",
    genres: ["action", "epic", "music-video"],
    prompt: "flame licks upward around the subject without harming them, heat-shimmer bending the air, embers spiraling off on the updraft" },
  { id: "water-element", name: "Water Ribbon", family: "elemental",
    genres: ["beauty", "product", "fantasy"],
    prompt: "a ribbon of clear water coils around the subject in slow orbit, surface tension holding it in glassy ropes, refracted light rippling across their form" },
  { id: "earth-wave", name: "Earth Wave", family: "elemental",
    genres: ["epic", "action", "automotive"],
    prompt: "the ground ripples outward in a slow stone wave, dust and gravel lifting off the crest, the surface settling behind it like a wake" },
  { id: "air-current", name: "Visible Wind", family: "elemental",
    genres: ["fashion-film", "sport", "brand-film"],
    prompt: "air currents turn faintly visible as streaming threads that wrap the subject, hair and fabric pulled along their exact paths" },
  { id: "explosion", name: "Concussive Blast", family: "elemental",
    genres: ["action", "epic"],
    prompt: "a single concussive blast blooms behind the subject: fireball rolling into black smoke, shockwave kicking dust rings across the ground, debris arcing on real ballistic paths" },
  { id: "nature-bloom", name: "Nature Bloom", family: "elemental",
    genres: ["beauty", "psa", "brand-film"],
    prompt: "flowers and greenery unfurl in accelerated growth around the subject, stems climbing and buds snapping open in waves that follow the camera's attention" },
  { id: "aurora", name: "Aurora Sky", family: "elemental",
    genres: ["travel", "luxury", "fantasy"],
    prompt: "curtains of aurora light ripple across the sky in slow silk folds, their color washing faintly over the scene's upward-facing surfaces" },

  // ── Energy & speed ──
  { id: "glow-trace", name: "Glow Trace", family: "energy",
    genres: ["music-video", "sport", "automotive"],
    prompt: "the moving subject leaves a luminous trail hanging in the air behind them, the light ribbon decaying slowly and mapping the exact path of the motion" },
  { id: "super-sprint", name: "Superhuman Sprint", family: "energy",
    genres: ["action", "sport"],
    prompt: "the subject accelerates beyond human speed: world streaking into motion-blur lines around a sharply held figure, shockwave dust snapping off each footfall" },
  { id: "levitation-fx", name: "Levitation", family: "energy",
    genres: ["fantasy", "music-video", "brand-film"],
    prompt: "the subject lifts gently off the ground, clothing and hair settling into slow zero-gravity drift, small objects rising with them in loose orbit" },
  { id: "glitch", name: "Signal Glitch", family: "energy",
    genres: ["music-video", "thriller", "brand-film"],
    prompt: "digital corruption tears across the frame in horizontal slices: the subject displacing in RGB-split stutters, blocks of the image freezing and snapping back" },
  { id: "shadow-play", name: "Living Shadow", family: "energy",
    genres: ["thriller", "horror", "music-video"],
    prompt: "the subject's cast shadow moves a half-beat out of sync with them, stretching longer than the light allows, its edges breathing like slow smoke" },

  // ── Surreal ──
  { id: "multiverse", name: "Multiverse Split", family: "surreal",
    genres: ["music-video", "brand-film", "thriller"],
    prompt: "the frame fractures into parallel versions of the same subject, each pane living a slightly different take of the moment before they fold back into one" },
  { id: "portal", name: "Portal", family: "surreal",
    genres: ["fantasy", "brand-film", "music-video"],
    prompt: "a ring of bent light tears open mid-air, its rim refracting the scene behind it, a different world visible through the opening with its own light spilling out" },
  { id: "point-cloud", name: "Particle Body", family: "surreal",
    genres: ["brand-film", "music-video", "product"],
    prompt: "the subject renders as millions of suspended luminous points holding their exact form, the cloud breathing slightly, points streaming when they move" },
  { id: "crystallize", name: "Crystallize", family: "surreal",
    genres: ["luxury", "beauty", "product"],
    prompt: "faceted crystal growth spreads across the subject, every surface refracting light into prismatic shards, the final form a jewel-cut version of the original" },
  { id: "inner-light", name: "Inner Light", family: "surreal",
    genres: ["psa", "beauty", "brand-film"],
    prompt: "a warm glow kindles beneath the subject's skin, brightest at the chest and veins, pulsing gently with their breath and lighting nearby surfaces from within" },

  // ── Atmosphere ──
  { id: "sakura", name: "Petal Drift", family: "atmosphere",
    genres: ["romance", "beauty", "travel"],
    prompt: "blossom petals fill the air in slow drift, riding visible air currents, catching light as they tumble and settling on surfaces" },
  { id: "color-rain", name: "Color Rain", family: "atmosphere",
    genres: ["music-video", "brand-film"],
    prompt: "rain falls in saturated pigment threads, each drop bursting into a small bloom of color on impact, the runoff marbling across the ground" },
  { id: "money-rain", name: "Money Rain", family: "atmosphere",
    genres: ["music-video", "comedy"],
    prompt: "banknotes tumble from above in dense flutter, each bill spinning on its own axis and planing on the air, drifts piling around the subject" },
  { id: "fireworks", name: "Fireworks", family: "atmosphere",
    genres: ["travel", "brand-film", "romance"],
    prompt: "fireworks bloom overhead in layered bursts, their light washing the scene in pulses, sparks raining in slow gravity-bent trails" },

  // ── Scale ──
  { id: "earth-zoomout", name: "Earth Zoom-Out", family: "scale",
    genres: ["epic", "travel", "brand-film"],
    prompt: "the camera pulls back vertically without cutting: subject, street, city, coastline, cloud layer, the curve of the planet — one continuous accelerating ascent" },
];

export const effectById = (id) => EFFECTS.find((e) => e.id === id) || null;

export function effectsForGenre(genreId) {
  if (!genreId || genreId === "auto") return EFFECTS;
  const hits = EFFECTS.filter((e) => (e.genres || []).includes(genreId));
  return hits.length ? hits : EFFECTS;
}
