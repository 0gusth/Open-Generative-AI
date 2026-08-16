// Cinema Studio lighting catalog — schemes specified in gaffer language:
// source type, direction, quality (hard/soft), contrast ratio, color
// temperature and motivation. Every phrase maps to a visible lighting
// behavior; names anchor the recognized signatures of the great DPs' schools
// without depending on them.

export const LIGHTING = [
  // ── Motivated single source (the Deakins school) ──
  { id: "single-source", name: "Motivated Single Source", family: "narrative",
    genres: ["drama", "noir", "thriller", "brand-film"],
    prompt: "single motivated key source shaping the scene, direction justified by a visible practical or window, deep controlled shadow side with negative fill, no artificial fill light, honest contrast" },

  // ── Natural light only (the Lubezki school) ──
  { id: "natural-only", name: "Natural Light Chase", family: "natural",
    genres: ["epic", "documentary", "psa", "drama"],
    prompt: "available natural light only, low golden sun as sole source, open sky ambience as soft fill, no artificial lighting, wide luminous naturalism with true outdoor color temperature shifts" },

  // ── Colossal soft source (the van Hoytema school) ──
  { id: "colossal-soft", name: "Colossal Soft Source", family: "narrative",
    genres: ["epic", "scifi", "drama", "tech-launch"],
    prompt: "enormous diffused light source through full-wall diffusion, soft enveloping wrap with gentle gradual falloff, monumental quiet illumination, softness at architectural scale" },

  // ── The hot halo toplight (the Richardson signature) ──
  { id: "halo-toplight", name: "Blooming Halo Toplight", family: "signature",
    genres: ["drama", "western", "noir"],
    prompt: "hot overhead toplight pooling on the subject, blooming overexposed halo on hair and table surfaces, surroundings falling off into rich darkness, theatrical isolated glow" },

  // ── Beauty and commercial craft ──
  { id: "book-light", name: "Book Light", family: "beauty",
    genres: ["product-hero", "luxury", "fashion-film", "romance"],
    prompt: "book light setup: key bounced then re-diffused for directionless silk-soft wrap, flawless gradient skin rendering, whisper-soft shadow edge, beauty-grade illumination" },
  { id: "backlight-haze", name: "Golden Backlight & Haze", family: "commercial",
    genres: ["brand-film", "sport", "automotive"],
    prompt: "strong golden backlight through atmospheric haze, luminous rim separating subject from background, volumetric light rays, gentle lens bloom, premium commercial glow" },
  { id: "hard-flash", name: "Hard Fashion Flash", family: "fashion",
    genres: ["fashion-film", "music-video"],
    prompt: "direct on-axis hard flash, sharp crisp shadow edge cast on the background, flattened bold exposure, unapologetic paparazzi-editorial directness" },
  { id: "negative-fill", name: "Sculpted Negative Fill", family: "beauty",
    genres: ["luxury", "drama", "fashion-film"],
    prompt: "soft key with aggressive negative fill carving the shadow side, high contrast ratio on faces, sculpted cheekbone modeling, dark side falling to rich black" },

  // ── From the spec ──
  { id: "silhouette", name: "Silhouette", family: "graphic",
    genres: ["music-video", "sport", "thriller"],
    prompt: "full silhouette lighting: subject lit entirely from behind against a bright background, no front fill, clean dark outline, shape over detail" },
  { id: "contre-jour", name: "Contre-Jour", family: "graphic",
    genres: ["romance", "epic", "brand-film"],
    prompt: "contre-jour shooting into the light source: heavy atmospheric flare and halation wrapping the subject edges, lifted glowing shadows, luminous veiled contrast" },
  { id: "window-day", name: "Window Light", family: "natural",
    genres: ["drama", "romance", "documentary"],
    prompt: "single window as the only source: directional soft daylight raking across the scene, room falling to natural ambient shadow, visible light shaft with floating dust" },
  { id: "soft-cross", name: "Soft Cross", family: "beauty",
    genres: ["comedy", "brand-film", "food"],
    prompt: "two soft crossed sources at opposing angles, shadows reduced on both sides of the face, gentle even modeling with mild dimension, friendly open illumination" },
  { id: "toplight-hard", name: "Interrogation Toplight", family: "graphic",
    genres: ["noir", "thriller", "horror"],
    prompt: "hard straight-down toplight: deep eye-socket shadows, harsh nose shadow, isolated pool of light in surrounding blackness, interrogation-room austerity" },

  // ── Practical-driven night ──
  { id: "practical-night", name: "Practical Night", family: "night",
    genres: ["noir", "drama", "thriller"],
    prompt: "night interior lit only by in-frame practicals: tungsten table lamps and signage creating warm isolated pools, deep ambient darkness between sources, motivated realistic night exposure" },
  { id: "neon-practical", name: "Neon Practicals", family: "night",
    genres: ["music-video", "noir", "scifi"], eras: ["1980s", "2020s"],
    prompt: "scene lit by neon practical sources: saturated magenta and cyan light pools from visible signage, colored edge light on skin, wet surfaces reflecting the neon, deep black night base" },
  { id: "gel-split", name: "Two-Color Split", family: "fashion",
    genres: ["music-video", "fashion-film"],
    prompt: "two-color split lighting with hard gelled sources from opposing sides, one warm one cold color dividing the face, saturated theatrical color contrast, no neutral light anywhere" },

  // ── Flame ──
  { id: "firelight", name: "Firelight", family: "flame",
    genres: ["western", "epic", "drama"],
    prompt: "firelight as sole source: warm flickering orange key from flame height below eye level, dancing soft shadows, deep cool darkness beyond the fire's reach" },
  { id: "candlelight", name: "Candlelight", family: "flame",
    genres: ["drama", "romance"], eras: ["1970s"],
    prompt: "candlelight-only illumination: intimate warm pools with rapid falloff, softly trembling exposure, faces emerging from darkness, painterly period glow" },

  // ── Textured / institutional ──
  { id: "dappled", name: "Dappled Foliage", family: "natural",
    genres: ["romance", "drama", "brand-film"],
    prompt: "dappled sunlight through foliage: broken organic light pattern moving across subject and ground, warm highlights against cool open shade, living textured illumination" },
  { id: "fluorescent", name: "Institutional Fluorescent", family: "institutional",
    genres: ["psa", "thriller", "documentary"],
    prompt: "overhead institutional fluorescent tubes: flat even green-tinged illumination, shadowless clinical exposure, slightly sickly color temperature, unflattering honest realism" },
];

export function lightingById(id) {
  return LIGHTING.find((l) => l.id === id) || null;
}

export function lightingForGenre(genreId) {
  if (!genreId || genreId === "auto") return LIGHTING;
  const hits = LIGHTING.filter((l) => (l.genres || []).includes(genreId));
  return hits.length ? hits : LIGHTING;
}
