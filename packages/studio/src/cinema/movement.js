// Cinema Studio camera movement catalog — written in operator language:
// rig + trajectory + speed + relationship to the subject. Every phrase maps
// to observable camera behavior; family names anchor the real machines and
// schools that created each move.

export const MOVEMENTS = [
  // ── Steadicam narrative (the Brown/McConkey school) ──
  { id: "steadicam-oner", name: "Steadicam Journey", family: "steadicam",
    genres: ["drama", "brand-film", "music-video"],
    prompt: "flowing steadicam journey through connected spaces: gliding walking-pace movement following the subject through doorways and rooms in one unbroken choreographed path, human breath in the frame, arrival timed with the subject's" },
  { id: "steadicam-follow", name: "Breathing Follow", family: "steadicam",
    genres: ["drama", "sport", "documentary"],
    prompt: "steadicam follow shot behind the subject at shoulder height, matching their pace with organic micro-sway, the world revealing itself over their shoulder as they advance" },
  { id: "steadicam-lead", name: "Face Lead", family: "steadicam",
    genres: ["drama", "thriller", "fashion-film"],
    prompt: "steadicam leading shot: camera gliding backwards ahead of the walking subject, locked on their face while the environment streams past behind them" },

  // ── Handheld chaos (the Bradley school) ──
  { id: "chaos-handheld", name: "Combat Handheld", family: "handheld",
    genres: ["action", "thriller", "documentary"],
    prompt: "aggressive handheld chase camera: urgent unstable framing sprinting with the action, crash reframes and whip corrections, controlled chaos that stays readable, adrenaline in the operator's grip" },
  { id: "nervous-doc", name: "Nervous Observer", family: "handheld",
    genres: ["documentary", "psa", "horror"],
    prompt: "restless observational handheld: subtle constant drift and correction as if a person is holding the frame, honest imperfect reframing following real behavior" },

  // ── Vehicular (the Kokush school) ──
  { id: "russian-arm", name: "Russian Arm Pursuit", family: "vehicular",
    genres: ["automotive", "action"],
    prompt: "russian arm car-to-car tracking at speed: stabilized crane-mounted camera swooping alongside and across the moving vehicle, sweeping from wheel-level rush to high three-quarter reveal in one continuous motion" },
  { id: "wheel-rush", name: "Wheel-Level Rush", family: "vehicular",
    genres: ["automotive", "sport"],
    prompt: "low wheel-level tracking inches from the ground at speed: asphalt streaking beneath, bodywork and spinning wheel dominating the frame, visceral velocity" },
  { id: "hood-mount", name: "Hood Mount", family: "vehicular",
    genres: ["automotive", "action", "music-video"],
    prompt: "rigid hood-mounted camera locked to the car body: horizon swaying with the suspension, reflections traveling across the windshield, mechanical intimacy with the machine" },

  // ── FPV (the Schaer dialect) ──
  { id: "fpv-dive", name: "FPV Dive", family: "fpv",
    genres: ["action", "sport", "music-video"],
    prompt: "FPV drone dive: falling bird-of-prey plunge from high altitude toward the subject, accelerating with gravity, pulling level at the last moment into a proximity flyby" },
  { id: "fpv-thread", name: "FPV Needle-Thread", family: "fpv",
    genres: ["action", "automotive", "sport"],
    prompt: "FPV drone threading impossible gaps: flying through windows, railings and structures in continuous flight, banking hard around obstacles, spatial impossibility made fluid" },
  { id: "fpv-orbit", name: "FPV Aggressive Orbit", family: "fpv",
    genres: ["sport", "music-video", "automotive"],
    prompt: "aggressive FPV orbit around the subject: fast banking circular flight with the horizon tilting, centripetal energy, the world smearing past behind the fixed subject" },

  // ── Motion control tabletop (the Giralt school — the Cannes Product Hero move) ──
  { id: "moco-orbit", name: "Robot Orbit", family: "motion-control",
    genres: ["product-hero", "tech-launch", "food", "luxury"],
    prompt: "high-speed robotic motion-control orbit around the product: millimeter-precise circular path with perfect focus tracking, repeatable mechanical smoothness no human hand can produce" },
  { id: "moco-reveal", name: "Macro Probe Reveal", family: "motion-control",
    genres: ["product-hero", "food", "luxury"],
    prompt: "probe lens motion-control move traveling through and past the product at macro distance: gliding millimeters from surfaces, textures becoming landscapes, impossible proximity in continuous motion" },
  { id: "moco-highspeed", name: "High-Speed Sync", family: "motion-control",
    genres: ["food", "product-hero", "sport"],
    prompt: "high-speed camera on robotic arm synchronized with an explosive product moment: liquid pours, breaks and splashes frozen in phantom slow motion while the camera itself sweeps through the action" },

  // ── Crane / aerial classic ──
  { id: "crane-reveal", name: "Crane Reveal", family: "crane",
    genres: ["epic", "western", "brand-film"],
    prompt: "sweeping crane reveal: rising from an intimate detail to unveil the full scale of the scene and landscape beyond, the world expanding with altitude in one majestic move" },
  { id: "descend-arrival", name: "Descending Arrival", family: "crane",
    genres: ["epic", "drama", "automotive"],
    prompt: "slow descending crane arrival from high and wide down into the heart of the scene, settling at eye level as the story begins, heaven-to-earth opening grammar" },

  // ── Dolly dramaturgy ──
  { id: "slow-push", name: "Slow Push-In", family: "dolly",
    genres: ["drama", "thriller", "horror", "luxury"],
    prompt: "imperceptibly slow dolly push-in toward the subject: creeping proximity building significance and tension, the frame tightening like held breath" },
  { id: "vertigo-zoom", name: "Contra-Zoom", family: "dolly",
    genres: ["thriller", "horror", "music-video"],
    prompt: "dolly zoom contra-move: camera tracking backward while the lens zooms in, background perspective stretching and warping around a fixed subject, reality destabilizing" },
  { id: "lateral-track", name: "Lateral Tracking", family: "dolly",
    genres: ["drama", "fashion-film", "comedy"],
    prompt: "clean lateral dolly tracking parallel to the subject: architectural sideways glide past layered foreground and background planes, the world as a moving frieze" },

  // ── Long-take choreography (the Cuarón chair) ──
  { id: "choreographed-oner", name: "World-Choreography Oner", family: "long-take",
    genres: ["action", "drama", "epic"],
    prompt: "single continuous long take with the world choreographed around the moving camera: action erupting and resolving in every direction as the camera weaves through uninterrupted, no cuts, total spatial continuity" },

  // ── Stillness as a move ──
  { id: "locked-off", name: "Locked-Off Tableau", family: "static",
    genres: ["comedy", "documentary", "luxury"],
    prompt: "perfectly locked-off static camera: rigid architectural framing, all movement happening within the fixed frame, compositional patience, the cut as the only motion" },
];

export function movementById(id) {
  return MOVEMENTS.find((m) => m.id === id) || null;
}

export function movementsForGenre(genreId) {
  if (!genreId || genreId === "auto") return MOVEMENTS;
  const hits = MOVEMENTS.filter((m) => (m.genres || []).includes(genreId));
  return hits.length ? hits : MOVEMENTS;
}
