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
  // ═══ ADVERTISING — premium commercial craft ═══
  {
    id: "brand-film",
    name: "Brand Film",
    category: "advertising",
    character: "emotive cinematic storytelling in service of a brand",
    blocks: {
      framing: "cinematic anamorphic-friendly compositions, human moments framed with feature-film care, brand world built in production design",
      light: "motivated naturalistic light elevated with soft cinematic shaping, golden emotional warmth",
      motion: "confident dolly and gimbal moves with feature-film discipline",
      pace: "emotional build with a crafted crescendo toward the brand resolve",
      palette: "premium filmic grade, warm skin against controlled complementary tones",
    },
  },
  {
    id: "product-hero",
    name: "Product Hero",
    category: "advertising",
    character: "tabletop worship — the product as sculpture",
    blocks: {
      framing: "macro tabletop compositions, product isolated as sculptural hero, extreme detail of materials and textures",
      light: "precision studio light sweeps revealing form, controlled specular highlights traveling across surfaces",
      motion: "motion-control robotic precision moves, slow reveals and orbits timed to the millimeter",
      pace: "hypnotic deliberate rhythm, each cut a new facet of the object",
      palette: "immaculate studio grade, deep seamless backgrounds, jewel-like product color",
    },
  },
  {
    id: "tech-launch",
    name: "Tech Launch",
    category: "advertising",
    character: "engineered minimalism, the Apple keynote dialect",
    blocks: {
      framing: "floating product in infinite seamless space, perfect symmetry, exploded-view choreography",
      light: "clean gradient light fields, precise edge highlights, shadowless white or void black environments",
      motion: "frictionless glides and micro-orbits, parts assembling in balletic precision",
      pace: "serene confident rhythm with satisfying mechanical punctuation",
      palette: "pristine neutrals, aluminum and glass tonality, single accent color discipline",
    },
  },
  {
    id: "sport",
    name: "Sport / Athletic",
    category: "advertising",
    character: "grit, sweat and heroism — the Nike dialect",
    blocks: {
      framing: "low heroic angles, bodies against sky, anatomical detail of effort — sweat, chalk, breath",
      light: "dramatic hard side-light carving muscle, stadium flares, dawn training austerity",
      motion: "explosive speed-ramps between real-time and slow motion, camera charging with the athlete",
      pace: "percussive build from discipline to explosion",
      palette: "gritty desaturated grade with visceral contrast, sodium and steel tones",
    },
  },
  {
    id: "luxury",
    name: "Luxury",
    category: "advertising",
    character: "restraint as wealth — perfume, watches, haute couture",
    blocks: {
      framing: "minimal compositions with monumental negative space, fragments of detail — a wrist, a silhouette, a facet",
      light: "sculpted chiaroscuro with liquid gold highlights, light as material",
      motion: "impossibly slow drifts, time suspended",
      pace: "unhurried aristocratic rhythm, silence between cuts",
      palette: "deep blacks with champagne and onyx accents, muted opulence",
    },
  },
  {
    id: "automotive",
    name: "Automotive",
    category: "advertising",
    character: "sheet metal as landscape, the car commercial canon",
    blocks: {
      framing: "reflections traveling across body lines, low wide stance shots, car against monumental roads and architecture",
      light: "long specular light bars sweeping paint, dusk cross-light on curves",
      motion: "russian-arm tracking at speed, wheel-level rushes, aerial pursuit",
      pace: "confident escalation from detail worship to full-speed release",
      palette: "cinematic contrast with metallic fidelity, asphalt neutrals and horizon warmth",
    },
  },
  {
    id: "food",
    name: "Food / Appetite",
    category: "advertising",
    character: "appetite appeal engineering",
    blocks: {
      framing: "extreme macro of textures — crumb, steam, glaze — layered depth of ingredients in motion",
      light: "backlit steam and translucency, glistening specular control, warm kitchen sun",
      motion: "high-speed phantom pours and breaks, slow tabletop drifts through ingredients",
      pace: "sensory rhythm alternating explosive food action and lingering desire",
      palette: "saturated appetite grade — warm reds, caramel golds, fresh greens",
    },
  },
  {
    id: "fashion-film",
    name: "Fashion Film",
    category: "advertising",
    character: "editorial attitude in motion",
    blocks: {
      framing: "editorial poses breaking into movement, bold crops, garment texture and drape as subject",
      light: "hard fashion flash or single dramatic source, unapologetic shadows",
      motion: "strutting tracking shots, sudden reframes with attitude",
      pace: "runway pulse — confident, syncopated, abrupt",
      palette: "editorial extremes — either stark monochrome or hyper-color commitment",
    },
  },
  {
    id: "music-video",
    name: "Music Video",
    category: "advertising",
    character: "image serving rhythm, style over continuity",
    blocks: {
      framing: "iconic frontal performance framing, surreal staging, location as mood not geography",
      light: "expressive colored sources, strobes and silhouettes, rules broken on purpose",
      motion: "camera as dancer — moves choreographed to the track",
      pace: "cut to the musical grid with intentional violations for impact",
      palette: "committed stylized grade — neon, bleach, or monochrome as identity",
    },
  },
  {
    id: "psa",
    name: "Social Impact / PSA",
    category: "advertising",
    character: "truth-telling with craft — the Cannes documentary dialect",
    blocks: {
      framing: "dignified documentary framing of real faces, honest environments, no exploitation",
      light: "available light respected, gentle shaping only where truth allows",
      motion: "patient observational camera, stillness as respect",
      pace: "restrained rhythm building to a single devastating fact or turn",
      palette: "sober naturalistic grade, dignity over drama",
    },
  },

  {
    id: "action",
    category: "cinema",
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
    category: "cinema",
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
    category: "cinema",
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
    category: "cinema",
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
    category: "cinema",
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
    category: "cinema",
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
    category: "cinema",
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
    category: "cinema",
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
    category: "cinema",
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
    category: "cinema",
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
    category: "cinema",
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
  // Curated as if by a committee of the great editors — each tempo is a
  // cutting PHILOSOPHY, not a speed setting.

  // ── The foundational four ──
  {
    id: "chaotic",
    name: "Chaotic",
    character: "disorientation as intent",
    prompt: "chaotic montage: cuts faster than expected from angles that never resolve into a stable viewpoint, spatial logic deliberately fractured — tension through disorientation",
  },
  {
    id: "dynamic",
    name: "Dynamic",
    character: "commercial momentum",
    prompt: "dynamic montage: continuous propulsive momentum with clear spatial logic, energy without chaos — the working rhythm of premium commercial production",
  },
  {
    id: "calm",
    name: "Calm",
    character: "time for performance",
    prompt: "calm montage: longer takes cutting only when a moment resolves, giving performance and environment time to settle into the frame",
  },
  {
    id: "oner",
    name: "Single Take",
    character: "no cuts at all",
    prompt: "single continuous take from start to finish: no editing points, one unbroken camera journey through the scene, maximum immersion",
  },

  // ── The committee's cuts ──
  {
    id: "kinetic-needle",
    name: "Kinetic Needle-Drop",
    character: "music-driven propulsion, freeze-frame punctuation",
    prompt: "kinetic music-driven montage: cutting locked to the soundtrack's pulse, whip cuts landing on beats, occasional freeze-frame punctuation on a defining gesture — exhilaration with total narrative control",
  },
  {
    id: "emotional-jump",
    name: "Emotional Jump Cut",
    character: "feeling over geography",
    prompt: "emotionally-driven jump cutting: edits motivated by feeling rather than spatial continuity, elliptical leaps forward in time, sound from the next moment arriving before its image — nervous alive energy",
  },
  {
    id: "cut-on-thought",
    name: "Cut on Thought",
    character: "the edit lands where the audience blinks",
    prompt: "invisible cutting that follows attention and emotion: each edit landing exactly where the viewer's mind already traveled, prioritizing emotional truth over mechanical continuity — editing felt, never seen",
  },
  {
    id: "percussive",
    name: "Percussive",
    character: "cutting as drumming",
    prompt: "percussive montage: staccato micro-cuts synchronized to rhythmic accents, rapid inserts of hands and detail between wider phrases, accelerating cut-rate building to a downbeat arrival — editing as an instrument",
  },
  {
    id: "cross-cut",
    name: "Cross-Cut Tension",
    character: "parallel lines converging",
    prompt: "parallel cross-cutting between simultaneous threads, alternation frequency escalating as the lines converge toward a single point of impact — suspense engineered through structure",
  },
  {
    id: "slow-burn",
    name: "Slow Burn",
    character: "restraint until release",
    prompt: "slow-burn montage: long simmering takes withholding release, tension accumulating through patience, then a single decisive cut or music entrance detonating everything held back",
  },
  {
    id: "classical",
    name: "Classical Invisible",
    character: "old-studio elegance",
    prompt: "classical continuity editing: seamless matches on action, stately scene grammar, graceful dissolves marking time — the invisible elegance of the studio-system masters",
  },
  {
    id: "match-poetry",
    name: "Match-Cut Poetry",
    character: "meaning carried across the cut",
    prompt: "match-cut driven montage: graphic and motion matches carrying meaning across transitions, shapes and gestures rhyming between scenes — cuts that think",
  },
  {
    id: "beat-synced",
    name: "Beat-Synced",
    character: "the music-video grid",
    prompt: "beat-synchronized cutting locked precisely to the soundtrack grid, every edit on a musical accent, choreography and camera phrased in bars — the music video and commercial standard",
  },
  {
    id: "elliptical",
    name: "Elliptical",
    character: "story through omission",
    prompt: "elliptical montage compressing time through confident omission: only the essential beats of a process or journey, the audience's mind bridging the gaps — whole arcs told in moments",
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
