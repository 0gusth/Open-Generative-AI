// Cinema Studio gear bank — the gold standard of working sets, commercial and
// craft. Every entry pairs the REAL market name (a dense anchor in model
// latent space) with its technical character, and the prompt line always
// carries both: the name pulls the association, the character guarantees the
// effect even where the anchor is weak.
//
// era: decades the gear reads as (used by Auto + Era coherence)
// genres: affinity hints for Auto mode
// famous: only associations verified with confidence — a wrong one is worse
// than none.

export const CINEMA_CAMERAS = [
  // ── Digital prestige ──
  { id: "alexa-65", brand: "ARRI", name: "ARRI Alexa 65", format: "65mm digital large format", era: ["2010s", "2020s"], genres: ["epic", "drama"], prompt: "shot on ARRI Alexa 65 — 65mm digital large format, gentle highlight rolloff, immersive shallow perspective, prestige cinema texture" },
  { id: "alexa-mini-lf", brand: "ARRI", name: "ARRI Alexa Mini LF", format: "large format digital", era: ["2020s"], genres: ["drama", "action", "commercial"], prompt: "shot on ARRI Alexa Mini LF — large format digital, natural color science, soft highlight rolloff, modern cinema standard" },
  { id: "alexa-35", brand: "ARRI", name: "ARRI Alexa 35", format: "Super 35 digital", era: ["2020s"], genres: ["commercial", "action", "drama"], prompt: "shot on ARRI Alexa 35 — Super 35 digital, 17 stops dynamic range, filmic texture modes, contemporary production standard" },
  { id: "venice-2", brand: "Sony", name: "Sony Venice 2", format: "full frame digital", era: ["2020s"], genres: ["action", "drama"], prompt: "shot on Sony Venice 2 — full frame digital cinema, dual-base ISO low light response, rich color depth" },
  { id: "red-vraptor", brand: "RED", name: "RED V-Raptor XL", format: "8K VV digital", era: ["2020s"], genres: ["action", "commercial"], prompt: "shot on RED V-Raptor XL — 8K large format sensor, crisp detail, high frame rate capability, contemporary commercial sheen" },

  // ── Film bodies ──
  { id: "panaflex-xl2", brand: "Panavision", name: "Panavision Panaflex Millennium XL2", format: "35mm film", era: ["1990s", "2000s", "2010s"], genres: ["drama", "noir", "epic"], prompt: "shot on Panavision Panaflex Millennium XL2, 35mm film — organic grain structure, warm halation on highlights, classic Hollywood tonal response" },
  { id: "panavision-65", brand: "Panavision", name: "Panavision System 65", format: "65mm film", era: ["1960s", "1990s", "2010s"], genres: ["epic", "western"], prompt: "shot on Panavision System 65, 65mm film — vast negative area, extraordinary detail and tonal depth, roadshow epic grandeur", famous: "The Hateful Eight" },
  { id: "imax-65", brand: "IMAX", name: "IMAX 15/65", format: "15-perf 65mm film", era: ["2000s", "2010s", "2020s"], genres: ["epic", "action"], prompt: "shot on IMAX 15-perf 65mm film — colossal negative, edge-to-edge clarity, overwhelming scale and presence" },
  { id: "arricam-lt", brand: "ARRI", name: "Arricam LT", format: "35mm film", era: ["2000s", "2010s"], genres: ["drama"], prompt: "shot on Arricam LT, 35mm film — refined grain, neutral color response, late-film-era production polish" },
  { id: "arriflex-416", brand: "ARRI", name: "Arriflex 416", format: "Super 16 film", era: ["1990s", "2000s"], genres: ["drama", "documentary"], prompt: "shot on Arriflex 416, Super 16mm film — pronounced organic grain, intimate documentary texture, indie film soul" },
  { id: "bolex-h16", brand: "Bolex", name: "Bolex H16", format: "16mm film", era: ["1950s", "1960s", "1970s"], genres: ["documentary", "experimental"], prompt: "shot on Bolex H16, 16mm film — hand-wound vintage texture, heavy grain, flickering archival warmth" },
  { id: "canon-814", brand: "Canon", name: "Canon 814 Auto Zoom", format: "Super 8 film", era: ["1960s", "1970s", "1980s"], genres: ["documentary", "romance"], prompt: "shot on Canon 814 Auto Zoom, Super 8 film — soft low-resolution nostalgia, heavy grain, home movie intimacy" },

  // ── "Wrong" textures that became aesthetics ──
  { id: "vx1000", brand: "Sony", name: "Sony VX1000", format: "MiniDV", era: ["1990s", "2000s"], genres: ["documentary", "action"], prompt: "shot on Sony VX1000 MiniDV — flat compressed video color, fisheye-adjacent skate era energy, raw camcorder authenticity" },
  { id: "genesis", brand: "Panavision", name: "Panavision Genesis", format: "early digital", era: ["2000s"], genres: ["action", "drama"], prompt: "shot on Panavision Genesis — early digital cinema response, slightly clinical color, 2000s digital pioneer texture" },
];

export const PHOTO_CAMERAS = [
  { id: "hasselblad-500cm", brand: "Hasselblad", name: "Hasselblad 500C/M", format: "6x6 medium format film", era: ["1960s", "1970s", "1980s"], genres: ["portrait", "editorial"], prompt: "shot on Hasselblad 500C/M, 6x6 medium format film — square frame, creamy tonal transitions, studio portrait heritage" },
  { id: "mamiya-rz67", brand: "Mamiya", name: "Mamiya RZ67", format: "6x7 medium format film", era: ["1980s", "1990s"], genres: ["portrait", "fashion"], prompt: "shot on Mamiya RZ67, 6x7 medium format film — monumental negative, razor subject separation, fashion editorial standard" },
  { id: "pentax-67", brand: "Pentax", name: "Pentax 67", format: "6x7 medium format film", era: ["1970s", "1980s", "1990s"], genres: ["portrait", "landscape"], prompt: "shot on Pentax 67 medium format film — deep tonal range, heavy dreamy bokeh, iconic environmental portrait look" },
  { id: "leica-m6", brand: "Leica", name: "Leica M6", format: "35mm film rangefinder", era: ["1980s", "1990s", "2000s"], genres: ["street", "documentary"], prompt: "shot on Leica M6, 35mm film rangefinder — decisive-moment candor, quiet contrast, street photography soul" },
  { id: "contax-t2", brand: "Contax", name: "Contax T2", format: "35mm compact film", era: ["1990s"], genres: ["street", "fashion"], prompt: "shot on Contax T2, 35mm compact — Zeiss pop and micro-contrast, casual flash-lit 90s cool" },
  { id: "polaroid-sx70", brand: "Polaroid", name: "Polaroid SX-70", format: "instant film", era: ["1970s", "1980s"], genres: ["portrait", "romance"], prompt: "shot on Polaroid SX-70 instant film — soft milky tones, slight vignette, one-of-one nostalgic object" },
  { id: "canon-ae1", brand: "Canon", name: "Canon AE-1", format: "35mm film SLR", era: ["1970s", "1980s"], genres: ["street", "documentary"], prompt: "shot on Canon AE-1, 35mm film SLR — honest consumer film look, gentle grain, family archive warmth" },
  { id: "nikon-f3", brand: "Nikon", name: "Nikon F3", format: "35mm film SLR", era: ["1980s", "1990s"], genres: ["documentary", "editorial"], prompt: "shot on Nikon F3, 35mm film SLR — photojournalism workhorse, robust neutral rendering, reportage authority" },
  { id: "gfx100", brand: "Fujifilm", name: "Fujifilm GFX100 II", format: "medium format digital", era: ["2020s"], genres: ["fashion", "editorial"], prompt: "shot on Fujifilm GFX100 II, 102MP medium format digital — impossibly clean detail, smooth tonal gradation, contemporary campaign polish" },
  { id: "phase-one", brand: "Phase One", name: "Phase One XF IQ4", format: "medium format digital", era: ["2010s", "2020s"], genres: ["fashion", "product"], prompt: "shot on Phase One XF IQ4, 150MP medium format digital — absolute resolution, commercial product precision, flagship studio standard" },
];

export const CINE_LENSES = [
  // ── Anamorphic ──
  { id: "pana-c-series", brand: "Panavision", name: "Panavision C-Series Anamorphic", type: "anamorphic", era: ["1970s", "1980s", "2010s"], genres: ["epic", "action", "drama"], prompt: "Panavision C-Series anamorphic lenses — the canonical horizontal blue streak flare, oval bokeh, gentle vintage softness at the edges" },
  { id: "pana-e-series", brand: "Panavision", name: "Panavision E-Series Anamorphic", type: "anamorphic", era: ["1980s", "1990s", "2010s"], genres: ["drama", "epic"], prompt: "Panavision E-Series anamorphic lenses — cleaner anamorphic rendering, controlled flare, elegant oval bokeh" },
  { id: "ultra-panatar", brand: "Panavision", name: "Ultra Panavision 70", type: "anamorphic 1.25x", era: ["1960s", "2010s"], genres: ["epic", "western"], prompt: "Ultra Panavision 70 anamorphic lenses — ultra-wide 2.76:1 frame, majestic horizontal stretch, roadshow-era grandeur", famous: "The Hateful Eight" },
  { id: "cooke-anamorphic", brand: "Cooke", name: "Cooke Anamorphic/i", type: "anamorphic", era: ["2010s", "2020s"], genres: ["drama", "commercial"], prompt: "Cooke Anamorphic/i lenses — warm organic anamorphic character, smooth oval bokeh, flattering skin rendering" },
  { id: "hawk-vlite", brand: "Vantage", name: "Hawk V-Lite Anamorphic", type: "anamorphic", era: ["2000s", "2010s"], genres: ["action", "drama"], prompt: "Hawk V-Lite anamorphic lenses — modern controlled anamorphic, subtle squeeze artifacts, contemporary European cinema texture" },
  { id: "kowa-prominar", brand: "Kowa", name: "Kowa Cine Prominar Anamorphic", type: "anamorphic", era: ["1960s", "1970s"], genres: ["drama", "romance"], prompt: "Kowa Cine Prominar anamorphic lenses — coveted vintage Japanese glass, golden flares, low contrast dreaminess, softly blooming highlights" },
  { id: "lomo-squarefront", brand: "LOMO", name: "LOMO Square Front Anamorphic", type: "anamorphic", era: ["1970s", "1980s"], genres: ["drama", "experimental"], prompt: "LOMO square-front Soviet anamorphic lenses — unruly flares, swirling focus falloff, raw poetic imperfection" },

  // ── Spherical modern ──
  { id: "cooke-s4", brand: "Cooke", name: "Cooke S4/i", type: "spherical", era: ["2000s", "2010s", "2020s"], genres: ["drama", "romance", "commercial"], prompt: "Cooke S4/i prime lenses — the famous Cooke look, gently rounded contrast, luminous flattering skin tones" },
  { id: "zeiss-master-prime", brand: "Zeiss", name: "Zeiss Master Prime", type: "spherical", era: ["2000s", "2010s", "2020s"], genres: ["action", "commercial"], prompt: "Zeiss Master Prime lenses — clinical sharpness wide open, zero distortion, pristine modern precision" },
  { id: "leica-summilux-c", brand: "Leica", name: "Leica Summilux-C", type: "spherical", era: ["2010s", "2020s"], genres: ["drama", "commercial"], prompt: "Leica Summilux-C prime lenses — delicate micro-contrast, silky focus rolloff, understated luxury rendering" },
  { id: "angenieux-optimo", brand: "Angénieux", name: "Angénieux Optimo 24-290", type: "zoom", era: ["2000s", "2010s", "2020s"], genres: ["action", "epic"], prompt: "Angénieux Optimo 24-290 cinema zoom — seamless focal range, gentle French warmth, blockbuster set standard" },

  // ── Vintage character ──
  { id: "canon-k35", brand: "Canon", name: "Canon K35", type: "spherical vintage", era: ["1970s", "1980s"], genres: ["drama", "horror", "noir"], prompt: "Canon K35 vintage primes — warm 1970s rendering, blooming highlights, softly glowing skin, coveted low-contrast magic" },
  { id: "zeiss-super-speed", brand: "Zeiss", name: "Zeiss Super Speed Mk III", type: "spherical vintage", era: ["1970s", "1980s", "1990s"], genres: ["noir", "drama", "horror"], prompt: "Zeiss Super Speed MkIII lenses — T1.3 low light capability, swirly wide-open bokeh, gritty night texture" },
  { id: "super-baltar", brand: "Bausch & Lomb", name: "Super Baltar", type: "spherical vintage", era: ["1950s", "1960s", "1970s"], genres: ["noir", "drama"], prompt: "Bausch & Lomb Super Baltar lenses — classic Hollywood rendering, gentle halation, round creamy bokeh, old-studio romance", famous: "The Godfather" },
  { id: "speed-panchro", brand: "Cooke", name: "Cooke Speed Panchro", type: "spherical vintage", era: ["1930s", "1940s", "1950s"], genres: ["noir", "romance"], prompt: "Cooke Speed Panchro vintage primes — golden age softness, luminous faces, black and white era heritage glass" },
  { id: "zeiss-f07", brand: "Zeiss", name: "Zeiss 50mm f/0.7", type: "spherical exotic", era: ["1970s"], genres: ["drama", "period"], prompt: "the legendary Zeiss 50mm f/0.7 NASA lens — candlelight-only exposure, impossibly shallow focus, painterly period glow", famous: "Barry Lyndon" },
];

export const PHOTO_LENSES = [
  { id: "helios-44", brand: "KMZ", name: "Helios 44-2 58mm f/2", type: "vintage", era: ["1960s", "1970s", "1980s"], genres: ["portrait", "experimental"], prompt: "Helios 44-2 58mm — the swirling bokeh legend, spiraling background blur, Soviet dream rendering" },
  { id: "petzval-85", brand: "Lomography", name: "Petzval 85mm", type: "vintage design", era: ["1880s", "2010s"], genres: ["portrait"], prompt: "Petzval 85mm portrait lens — 19th century optical design, intense swirl vignette, sharp center with painterly edges" },
  { id: "canon-dream", brand: "Canon", name: "Canon 50mm f/0.95 Dream Lens", type: "vintage exotic", era: ["1960s", "1970s"], genres: ["portrait", "romance"], prompt: "Canon 50mm f/0.95 Dream Lens — glowing wide-open softness, razor-thin focus, hazy romantic halo" },
  { id: "noctilux", brand: "Leica", name: "Leica Noctilux 50mm f/0.95", type: "modern exotic", era: ["2010s", "2020s"], genres: ["portrait", "street"], prompt: "Leica Noctilux 50mm f/0.95 — night-gathering aperture, three-dimensional subject pop, luxurious focus falloff" },
  { id: "zeiss-planar-80", brand: "Zeiss", name: "Zeiss Planar 80mm f/2.8", type: "medium format", era: ["1960s", "1970s", "1980s"], genres: ["portrait", "editorial"], prompt: "Zeiss Planar 80mm on medium format — perfect normal perspective, smooth honest rendering, studio heritage" },
  { id: "sekor-110", brand: "Mamiya", name: "Mamiya Sekor 110mm f/2.8", type: "medium format", era: ["1980s", "1990s"], genres: ["fashion", "portrait"], prompt: "Mamiya Sekor 110mm f/2.8 on RZ67 — the fashion portrait classic, melting backgrounds, sculptural subject presence" },
  { id: "takumar-105", brand: "Pentax", name: "Super-Takumar 105mm f/2.4", type: "medium format", era: ["1970s", "1980s"], genres: ["portrait", "landscape"], prompt: "Super-Takumar 105mm f/2.4 on Pentax 67 — legendary environmental portrait glass, deep dreamy separation, golden rendering" },
  { id: "nikkor-105", brand: "Nikon", name: "Nikkor 105mm f/2.5", type: "35mm classic", era: ["1970s", "1980s", "1990s"], genres: ["portrait", "documentary"], prompt: "Nikkor 105mm f/2.5 — the photojournalist's portrait lens, honest compression, quietly beautiful rendering" },
];

// Capture medium: film stocks for analog bodies, color science for digital.
export const FILM_STOCKS = [
  // ── Motion picture ──
  { id: "vision3-500t", brand: "Kodak", name: "Kodak Vision3 500T 5219", kind: "film", medium: "motion", era: ["2000s", "2010s", "2020s"], genres: ["drama", "noir", "action"], prompt: "on Kodak Vision3 500T 5219 stock — tungsten-balanced night warmth, fine modern grain, rich shadow detail" },
  { id: "vision3-250d", brand: "Kodak", name: "Kodak Vision3 250D 5207", kind: "film", medium: "motion", era: ["2000s", "2010s", "2020s"], genres: ["drama", "epic"], prompt: "on Kodak Vision3 250D stock — daylight-balanced natural color, gentle grain, honest cinematic daylight" },
  { id: "double-x", brand: "Kodak", name: "Eastman Double-X 5222", kind: "film", medium: "motion", era: ["1960s", "2010s"], genres: ["noir"], prompt: "on Eastman Double-X black and white stock — deep silver blacks, luminous highlights, timeless monochrome cinema" },
  { id: "ektachrome-100d", brand: "Kodak", name: "Ektachrome 100D", kind: "film", medium: "motion", era: ["1960s", "1970s", "2010s"], genres: ["documentary", "romance"], prompt: "on Ektachrome 100D reversal stock — saturated slide-film color, crisp contrast, sun-soaked vintage vibrance", famous: "Euphoria (season 2 segments)" },

  // ── Still photography ──
  { id: "portra-400", brand: "Kodak", name: "Kodak Portra 400", kind: "film", medium: "still", era: ["2000s", "2010s", "2020s"], genres: ["portrait", "editorial"], prompt: "on Kodak Portra 400 — the skin tone gold standard, pastel warmth, forgiving highlights, fine grain" },
  { id: "portra-800", brand: "Kodak", name: "Kodak Portra 800", kind: "film", medium: "still", era: ["2000s", "2010s", "2020s"], genres: ["portrait", "street"], prompt: "on Kodak Portra 800 — low-light warmth, slightly bolder grain, glowing evening tones" },
  { id: "ektar-100", brand: "Kodak", name: "Kodak Ektar 100", kind: "film", medium: "still", era: ["2010s", "2020s"], genres: ["landscape", "product"], prompt: "on Kodak Ektar 100 — ultra-vivid saturation, world's finest color negative grain, punchy commercial color" },
  { id: "tri-x", brand: "Kodak", name: "Kodak Tri-X 400", kind: "film", medium: "still", era: ["1950s", "1960s", "1970s", "1980s"], genres: ["street", "documentary"], prompt: "on Kodak Tri-X 400 — the reportage legend, gritty expressive grain, deep blacks, decisive-moment soul" },
  { id: "hp5", brand: "Ilford", name: "Ilford HP5 Plus", kind: "film", medium: "still", era: ["1970s", "1980s", "1990s"], genres: ["street", "portrait"], prompt: "on Ilford HP5 Plus — forgiving black and white latitude, classic British documentary tonality" },
  { id: "cinestill-800t", brand: "CineStill", name: "CineStill 800T", kind: "film", medium: "still", era: ["2010s", "2020s"], genres: ["street", "noir"], prompt: "on CineStill 800T — tungsten neon glow, signature red halation around lights, cinematic night street romance" },
  { id: "fuji-400h", brand: "Fujifilm", name: "Fuji Pro 400H", kind: "film", medium: "still", era: ["2000s", "2010s"], genres: ["portrait", "romance"], prompt: "on Fuji Pro 400H — airy minty pastels, soft ethereal highlights, wedding and light-filled editorial staple" },
  { id: "velvia-50", brand: "Fujifilm", name: "Fujichrome Velvia 50", kind: "film", medium: "still", era: ["1990s", "2000s"], genres: ["landscape"], prompt: "on Fujichrome Velvia 50 — legendary landscape saturation, dramatic skies, jewel-toned intensity" },
  { id: "polaroid-600", brand: "Polaroid", name: "Polaroid 600", kind: "film", medium: "still", era: ["1980s", "1990s"], genres: ["portrait", "romance"], prompt: "on Polaroid 600 instant film — milky soft color, imperfect edges, tangible nostalgic instant" },

  // ── Digital color science (for digital bodies) ──
  { id: "arri-reveal", brand: "ARRI", name: "ARRI Reveal Color Science", kind: "digital", medium: "both", era: ["2020s"], genres: ["drama", "commercial"], prompt: "graded with ARRI Reveal color science — natural filmic response, gentle highlight rolloff, faithful skin tones" },
  { id: "red-ipp2", brand: "RED", name: "RED IPP2", kind: "digital", medium: "both", era: ["2010s", "2020s"], genres: ["action", "commercial"], prompt: "graded with RED IPP2 color pipeline — punchy contemporary contrast, crisp commercial color" },
  { id: "venice-color", brand: "Sony", name: "Sony Venice Color Science", kind: "digital", medium: "both", era: ["2020s"], genres: ["drama"], prompt: "graded with Sony Venice color science — rich cinematic warmth, deep smooth shadows" },
];

export const APERTURES = [
  { id: "f095", name: "f/0.95 — Razor", prompt: "shot wide open at f/0.95: razor-thin focus plane isolating a single feature, backgrounds dissolved into pure glowing blur, dreamlike optical shallowness" },
  { id: "f14", name: "f/1.4 — Isolated", prompt: "shot at f/1.4: subject fully isolated in creamy bokeh, background melted into soft color fields, cinematic shallow depth of field" },
  { id: "f28", name: "f/2.8 — Separated", prompt: "shot at f/2.8: subject cleanly separated with softly blurred background retaining recognizable shapes, the commercial workhorse depth" },
  { id: "f4", name: "f/4 — Contextual", prompt: "shot at f/4: subject sharp with gently softened surroundings, environment legible as context without competing for attention" },
  { id: "f11", name: "f/11 — Deep Focus", prompt: "shot at f/11 deep focus: entire scene sharp from foreground to horizon, every plane of the composition carrying information, environment as co-protagonist" },
];

export function apertureById(id) {
  return APERTURES.find((a) => a.id === id) || null;
}

// ── Selection helpers ────────────────────────────────────────────────────────

const FILM_FORMAT = /film|instant/i;

export function isFilmBody(camera) {
  return !!camera && FILM_FORMAT.test(camera.format);
}

// Media appropriate for a given body: emulsions for film cameras,
// color science for digital ones.
export function mediaForCamera(camera, mode /* "image" | "video" */) {
  if (!camera) return FILM_STOCKS;
  if (isFilmBody(camera)) {
    const wanted = mode === "video" ? "motion" : "still";
    const exact = FILM_STOCKS.filter((s) => s.kind === "film" && (s.medium === wanted || s.medium === "both"));
    return exact.length ? exact : FILM_STOCKS.filter((s) => s.kind === "film");
  }
  return FILM_STOCKS.filter((s) => s.kind === "digital");
}

// Era-coherent picks for Auto mode: prefer gear that reads as the chosen era.
export function gearForEra(list, era) {
  if (!era || era === "auto") return list;
  const hits = list.filter((g) => g.era.includes(era));
  return hits.length ? hits : list;
}

export function gearForGenre(list, genre) {
  if (!genre || genre === "auto") return list;
  const hits = list.filter((g) => (g.genres || []).includes(genre));
  return hits.length ? hits : list;
}
