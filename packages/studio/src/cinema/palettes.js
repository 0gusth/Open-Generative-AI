// Cinema Studio color palettes — curated in the working language of the great
// grading suites. PROMPT ENGINEERING RULE: every phrase maps to a concrete
// visual feature (hue per tonal band, saturation level, contrast behavior,
// skin and black treatment). Names are industry-recognizable anchors; the
// prompt string is a grade spec, not poetry.

export const PALETTES = [
  // ── The blockbuster school ──
  { id: "teal-orange", name: "Teal & Orange", family: "blockbuster",
    genres: ["action", "automotive", "sport"],
    prompt: "teal and orange color grade: teal-pushed shadows and midtone blues, warm amber-orange skin tones and highlights, high contrast, crushed cyan-tinted blacks, polished blockbuster finish" },
  { id: "steel-cyan", name: "Steel & Cyan", family: "blockbuster",
    genres: ["thriller", "scifi", "tech-launch"],
    prompt: "cold steel color grade: desaturated blue-grey midtones, cyan-leaning highlights, neutral protected skin, deep clean blacks, clinical modern contrast" },

  // ── The photochemical school ──
  { id: "kodak-print", name: "Kodak Print Emulation", family: "photochemical",
    genres: ["drama", "brand-film"], eras: ["1970s", "1990s"],
    prompt: "photochemical film print emulation: Kodak 2383 print stock contrast curve, dense saturated blacks, warm faithful skin tones, subtle red halation on bright highlights, organic filmic color response" },
  { id: "bleach-bypass", name: "Bleach Bypass", family: "photochemical",
    genres: ["action", "psa", "documentary"],
    prompt: "bleach bypass grade: retained-silver look, strongly desaturated color with elevated contrast, chalky highlights, gritty near-monochrome shadows, harsh textured realism" },
  { id: "one-light", name: "Restrained One-Light", family: "photochemical",
    genres: ["epic", "drama"], eras: ["2010s", "2020s"],
    prompt: "restrained naturalistic film grade: minimal correction philosophy, honest color relationships as photographed, gentle print contrast, no stylized tint, natural light integrity preserved" },

  // ── The narrative-desaturation school ──
  { id: "painterly-desat", name: "Painterly Desaturation", family: "narrative",
    genres: ["epic", "drama", "horror"],
    prompt: "painterly desaturated grade: globally reduced saturation with selectively preserved key colors, soft tonal transitions like oil painting, cool shadow wash, muted greens and parchment highlights" },
  { id: "sickly-sodium", name: "Sickly Sodium", family: "narrative",
    genres: ["thriller", "noir", "psa"],
    prompt: "sickly urban grade: sodium-vapor yellow-green cast in midtones, unhealthy warm fluorescent tint, slightly lifted murky blacks, oppressive institutional color temperature" },
  { id: "moonlight-duotone", name: "Moonlight Duotone", family: "narrative",
    genres: ["drama", "romance", "music-video"],
    prompt: "moonlit duotone grade: deep blue night shadows against warm amber skin highlights, two-color tension in every frame, luminous dark skin rendering, velvet blacks" },

  // ── The vivid digital school ──
  { id: "vivid-digital", name: "Vivid Digital", family: "vivid",
    genres: ["music-video", "sport", "fashion-film"],
    prompt: "vivid saturated digital grade: bold primary color energy, punchy contrast with bright open highlights, electric saturated accents, contemporary digital vibrance without pastel softening" },
  { id: "neon-noir", name: "Neon Noir", family: "vivid",
    genres: ["noir", "scifi", "music-video"], eras: ["1980s", "2020s"],
    prompt: "neon noir grade: magenta and cyan practical neon sources against deep black night, saturated color pools in darkness, wet reflective surfaces doubling the neon, high contrast night exterior" },
  { id: "cross-process", name: "Cross-Process", family: "vivid",
    genres: ["fashion-film", "music-video"], eras: ["1990s", "2000s"],
    prompt: "cross-processed film look: green-yellow shifted shadows, cyan-leaning highlights, unnatural but confident color crossover, elevated contrast with slightly blown whites, editorial edge" },

  // ── Commercial / beauty ──
  { id: "high-key-beauty", name: "High-Key Beauty", family: "commercial",
    genres: ["product-hero", "fashion-film", "food"],
    prompt: "high-key beauty grade: bright clean whites, softly lifted shadows, flawless neutral-warm skin tones, gentle pastel accents, low contrast luminous polish, no color cast" },
  { id: "champagne-luxury", name: "Champagne & Onyx", family: "commercial",
    genres: ["luxury", "automotive"],
    prompt: "luxury champagne grade: warm metallic gold highlights, deep onyx blacks, restrained low saturation elegance, champagne-tinted midtones, jewel-like specular color" },
  { id: "creamy-lifestyle", name: "Creamy Lifestyle", family: "commercial",
    genres: ["brand-film", "food", "romance"],
    prompt: "creamy lifestyle grade: warm ivory highlights, soft golden midtones, gently lifted milky shadows, cozy low-contrast warmth, inviting editorial domestic light" },
  { id: "terracotta-editorial", name: "Terracotta Editorial", family: "commercial",
    genres: ["fashion-film", "luxury"],
    prompt: "terracotta editorial grade: warm earth palette of clay, rust and sand tones, deep warm browns in shadow, golden skin rendering, desert-magazine sophistication" },

  // ── Naturalism ──
  { id: "golden-hour", name: "Golden Hour", family: "natural",
    genres: ["brand-film", "epic", "romance"],
    prompt: "golden hour grade: low warm sunlight, long soft shadows with gentle blue fill, honeyed highlights, amber-kissed skin, naturally elevated warmth without orange push" },
  { id: "blue-hour", name: "Blue Hour", family: "natural",
    genres: ["drama", "thriller", "automotive"],
    prompt: "blue hour grade: pre-dawn ambient blue wash, cool soft shadows, isolated warm practical lights glowing against the blue, melancholic dim naturalism" },
  { id: "overcast-nordic", name: "Nordic Overcast", family: "natural",
    genres: ["drama", "psa", "documentary"],
    prompt: "nordic overcast grade: soft shadowless daylight, muted cool neutrals, low saturation with delicate skin preservation, quiet grey-green ambience, scandinavian restraint" },
  { id: "sunbleached", name: "Sun-Bleached", family: "natural",
    genres: ["western", "documentary", "sport"], eras: ["1970s"],
    prompt: "sun-bleached grade: overexposed dusty highlights, faded warm color as if left in the sun, sand and leather tones, softened blacks, dry heat rendered as color" },

  // ── Monochrome ──
  { id: "silver-noir", name: "Silver Noir", family: "monochrome",
    genres: ["noir", "drama"], eras: ["1940s", "1950s"],
    prompt: "silver-rich black and white: deep true blacks, luminous highlight rolloff, full greyscale tonal range, crisp shadow edges, classic silver-gelatin density" },
  { id: "fashion-mono", name: "Fashion Monochrome", family: "monochrome",
    genres: ["fashion-film", "luxury", "music-video"],
    prompt: "high-contrast fashion black and white: blown clean whites against absolute blacks, compressed midtones, graphic skin rendering, bold editorial monochrome" },

  // ── Archival color ──
  { id: "kodachrome-doc", name: "Kodachrome Archive", family: "archival",
    genres: ["documentary", "brand-film"], eras: ["1950s", "1960s", "1970s"],
    prompt: "Kodachrome archive color: dense saturated reds, deep warm color density, slightly dark rich exposure, vintage documentary color fidelity, no fading" },
  { id: "technicolor-3strip", name: "Three-Strip Technicolor", family: "archival",
    genres: ["romance", "comedy"], eras: ["1940s", "1950s"],
    prompt: "three-strip Technicolor: impossibly saturated primary colors, painted-poster reds and emerald greens, glamour-lit skin with rosy warmth, jewel-box color intensity" },
  { id: "faded-70s", name: "Faded Chrome", family: "archival",
    genres: ["drama", "music-video"], eras: ["1960s", "1970s"],
    prompt: "faded chrome film look: gently faded color with yellowed highlights, softened contrast, warm nostalgic drift, slightly magenta-shifted shadows of aged reversal film" },
];

export function paletteById(id) {
  return PALETTES.find((p) => p.id === id) || null;
}

export function palettesForGenre(genreId) {
  if (!genreId || genreId === "auto") return PALETTES;
  const hits = PALETTES.filter((p) => (p.genres || []).includes(genreId));
  return hits.length ? hits : PALETTES;
}
