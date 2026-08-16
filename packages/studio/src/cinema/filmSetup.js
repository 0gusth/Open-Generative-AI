// Cinema Studio film setup — Genre, Era and Tempo catalogs.
//
// Genre is the master conditioner: each entry carries PER-DIMENSION prompt
// blocks (framing, light, motion, pace, palette bias). The compiler uses the
// genre's block as the intelligent default for any dimension the user left on
// Auto; an explicit user choice always overrides the genre default.
//
// Era entries carry the photographic fingerprint of a decade (grain, color
// response, lens character) plus affinity hooks into the gear bank.

export const GENRES = [
  {
    id: "action",
    name: "Action",
    character: "kinetic energy, camera bound to the moving subject",
    blocks: {
      framing: "camera locked to the moving subject, tight kinetic framing, minimal static composition",
      light: "hard directional light with strong specular accents, motivated practical sources",
      motion: "aggressive tracking and whip-pans following the action",
      pace: "fast propulsive cutting that never loses spatial orientation",
      palette: "high-contrast grade with punchy saturated accents",
    },
  },
  {
    id: "epic",
    name: "Epic",
    character: "the environment as a character, monumental scale",
    blocks: {
      framing: "vast wide compositions, small figures against monumental landscapes, environment treated as subject",
      light: "sweeping natural light across the full frame, golden-hour grandeur",
      motion: "slow majestic crane and aerial moves revealing scale",
      pace: "patient cutting that lets scale register",
      palette: "rich earthy grade with golden warmth and deep skies",
    },
  },
  {
    id: "drama",
    name: "Drama",
    character: "faces first, time to breathe",
    blocks: {
      framing: "close intimate framing held long on faces, shallow focus isolating emotion",
      light: "soft sculpted light directed at faces, gentle contrast falloff",
      motion: "restrained slow push-ins and quiet handheld intimacy",
      pace: "prolonged takes, cutting only when a moment completes",
      palette: "muted naturalistic grade with warm skin protection",
    },
  },
  {
    id: "comedy",
    name: "Comedy",
    character: "room to react, timing at frame level",
    blocks: {
      framing: "wider brighter framing giving performers visible space to react, symmetrical staging for gags",
      light: "even high-key light, minimal shadow drama",
      motion: "stable locked-off or gentle moves that never distract from timing",
      pace: "cutting timed to comedic beats, holding for reactions",
      palette: "bright clean grade with friendly saturation",
    },
  },
  {
    id: "horror",
    name: "Horror",
    character: "unease before anything happens",
    blocks: {
      framing: "oblique unsettling angles, negative space that suggests presence, obstructed foregrounds",
      light: "diffuse low light with pools of darkness, sources hidden or unmotivated",
      motion: "slow creeping moves and uneasy drift",
      pace: "long dreadful holds punctured by sudden cuts",
      palette: "desaturated cold grade with sickly green-blue undertones",
    },
  },
  {
    id: "noir",
    name: "Noir",
    character: "sculpted shadow, moral ambiguity in light",
    blocks: {
      framing: "figures carved by shadow, venetian-blind patterns, low angles and deep staircases",
      light: "hard sculpted key light with crisp shadows, extreme contrast, single-source drama",
      motion: "deliberate prowling moves through smoke and shadow",
      pace: "measured cutting with room for menace",
      palette: "high-contrast monochrome or deeply crushed color with neon accents",
    },
  },
  {
    id: "thriller",
    name: "Thriller",
    character: "coiled tension, information withheld",
    blocks: {
      framing: "tight controlled frames withholding information, over-shoulder surveillance perspectives",
      light: "controlled low-key light with motivated sources and clean shadow edges",
      motion: "precise slow push-ins that tighten the screws",
      pace: "escalating rhythm, cuts arriving slightly before comfort",
      palette: "cool steely grade with restrained saturation",
    },
  },
  {
    id: "romance",
    name: "Romance",
    character: "glow, closeness, softened world",
    blocks: {
      framing: "two-shots and gentle close-ups, faces sharing the frame, soft foreground blur",
      light: "warm diffused backlight, halation glow, golden-hour skin",
      motion: "slow orbiting moves around the couple, floating dolly drift",
      pace: "unhurried cutting that lingers on glances",
      palette: "warm pastel grade with soft luminous highlights",
    },
  },
  {
    id: "scifi",
    name: "Sci-Fi",
    character: "designed light, awe and alienation",
    blocks: {
      framing: "monumental symmetry against technology, silhouettes in vast engineered spaces",
      light: "designed artificial sources — panels, consoles, atmosphere-cut beams of volumetric light",
      motion: "gliding mechanical precision moves",
      pace: "measured cutting that lets design and scale register",
      palette: "cool cyan-and-amber grade with clinical whites or neon signatures",
    },
  },
  {
    id: "western",
    name: "Western",
    character: "horizon, dust and patience",
    blocks: {
      framing: "extreme wide horizons with lone figures, dramatic low angles against sky, dusty depth",
      light: "harsh sun with deep hat shadows, dusk silhouettes",
      motion: "static painterly holds, slow pans across landscape",
      pace: "long patient standoff rhythm with explosive punctuation",
      palette: "sun-bleached warm grade, leathery earth tones",
    },
  },
  {
    id: "documentary",
    name: "Documentary",
    character: "honesty over polish, found light",
    blocks: {
      framing: "observational handheld framing, imperfect but truthful compositions, real environments",
      light: "available light only, honest mixed color temperatures",
      motion: "responsive handheld following real events",
      pace: "cutting driven by content, unforced rhythm",
      palette: "neutral true-to-life grade with minimal stylization",
    },
  },
];

export const ERAS = [
  { id: "1940s", name: "1940s", character: "studio-system black and white", prompt: "1940s photography: silver-rich black and white, hard studio key light, nitrate-era glow, Academy ratio sensibility" },
  { id: "1950s", name: "1950s", character: "Technicolor optimism", prompt: "1950s photography: saturated three-strip Technicolor response, glamour diffusion, wide roadshow ambition" },
  { id: "1960s", name: "1960s", character: "new wave grain and freedom", prompt: "1960s photography: visible film grain, slightly faded color response, vintage lens softness at the edges, new-wave energy" },
  { id: "1970s", name: "1970s", character: "warm haze, zooms and paranoia", prompt: "1970s photography: warm golden haze, low-contrast vintage glass, gentle halation, slow-zoom era texture" },
  { id: "1980s", name: "1980s", character: "saturation, neon and diffusion", prompt: "1980s photography: bold saturated color, neon-friendly highlights, subtle promist diffusion, high-gloss production sheen" },
  { id: "1990s", name: "1990s", character: "flatter color, honest texture", prompt: "1990s photography: flatter color response, honest film texture, grunge-era naturalism, music-video experimentation" },
  { id: "2000s", name: "2000s", character: "early digital response", prompt: "2000s photography: early digital color response, slight highlight clipping, teal-orange blockbuster grade emerging" },
  { id: "2010s", name: "2010s", character: "digital cinema matured", prompt: "2010s photography: clean digital cinema, controlled dynamic range, streaming-era polish" },
  { id: "2020s", name: "2020s", character: "contemporary unmodified", prompt: "2020s photography: contemporary high-resolution digital, natural HDR tonality, unmodified modern look" },
];

export const TEMPOS = [
  {
    id: "chaotic",
    name: "Chaotic",
    character: "disorientation as intent",
    prompt: "chaotic montage: cuts faster than expected from angles that never settle into a stable viewpoint, generating tension and disorientation",
  },
  {
    id: "dynamic",
    name: "Dynamic",
    character: "commercial momentum",
    prompt: "dynamic montage: continuous propulsive momentum with clear spatial logic, the rhythm of commercial work and music videos — energy without chaos",
  },
  {
    id: "calm",
    name: "Calm",
    character: "time for performance",
    prompt: "calm montage: longer takes cutting only when a moment resolves, giving performance and environment time to settle",
  },
  {
    id: "oner",
    name: "Single Take",
    character: "no cuts at all",
    prompt: "single continuous take from start to finish: no editing points, one unbroken camera journey, maximum immersion",
  },
];

// ── Compiler helpers ────────────────────────────────────────────────────────

export function genreById(id) {
  return GENRES.find((g) => g.id === id) || null;
}

export function eraById(id) {
  return ERAS.find((e) => e.id === id) || null;
}

export function tempoById(id) {
  return TEMPOS.find((t) => t.id === id) || null;
}

// Map an era id ("1960s") to the decade tags used by the gear bank.
export function eraToGearTag(eraId) {
  return eraId && eraId !== "auto" ? eraId : null;
}
