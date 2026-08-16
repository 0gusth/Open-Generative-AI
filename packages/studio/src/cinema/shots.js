// Cinema Studio shot grammar — frame sizes and camera angles, the DP's
// first two decisions before any movement exists. Written as observable
// framing language: every phrase describes exactly what the frame contains
// and where the camera sits relative to the subject.

export const SHOT_SIZES = [
  { id: "extreme-long", name: "Extreme Long Shot", abbr: "ELS",
    genres: ["epic", "travel", "automotive", "brand-film"],
    prompt: "extreme long shot: vast environment dominates, the subject a small readable figure inside the landscape's scale" },
  { id: "wide", name: "Wide Shot", abbr: "WS",
    genres: ["drama", "action", "documentary", "brand-film"],
    prompt: "wide shot: full body visible with the surrounding environment giving context, subject grounded in the space" },
  { id: "cowboy", name: "Cowboy Shot", abbr: "MLS",
    genres: ["western", "action", "fashion-film"],
    prompt: "medium long shot framed from mid-thigh up: stance and hands readable, action-ready posture in frame" },
  { id: "medium", name: "Medium Shot", abbr: "MS",
    genres: ["drama", "documentary", "comedy", "product"],
    prompt: "medium shot from the waist up: gesture and body language carry the scene, background present but secondary" },
  { id: "medium-close", name: "Medium Close-Up", abbr: "MCU",
    genres: ["drama", "psa", "beauty"],
    prompt: "medium close-up from the chest up: reaction and expression legible, a conversation distance from the subject" },
  { id: "close-up", name: "Close-Up", abbr: "CU",
    genres: ["drama", "beauty", "thriller", "psa"],
    prompt: "close-up: the face fills the frame, micro-expression readable — eyes, jaw and breath doing the storytelling" },
  { id: "extreme-close", name: "Extreme Close-Up", abbr: "ECU",
    genres: ["thriller", "beauty", "product", "horror"],
    prompt: "extreme close-up on a single feature: one eye, a mouth, fingertips — texture and tension at macro intimacy" },
  { id: "insert", name: "Insert Shot", abbr: "INS",
    genres: ["thriller", "product", "food"],
    prompt: "insert shot of an object detail: the prop fills the frame, its material and mechanism sharply legible, story told through the thing itself" },
];

export const ANGLES = [
  { id: "eye-level", name: "Eye Level",
    genres: ["drama", "documentary", "comedy"],
    prompt: "camera at eye level, neutral human height — grounded, conversational perspective" },
  { id: "low-angle", name: "Low Angle",
    genres: ["epic", "action", "automotive", "fashion-film"],
    prompt: "low angle looking up at the subject: stature and dominance amplified against the sky or ceiling" },
  { id: "high-angle", name: "High Angle",
    genres: ["drama", "thriller", "psa"],
    prompt: "high angle looking down at the subject: the frame presses down, the subject smaller inside their surroundings" },
  { id: "birds-eye", name: "Bird's-Eye",
    genres: ["music-video", "travel", "food"],
    prompt: "bird's-eye view directly overhead, looking straight down: geometry and choreography of the space revealed as pattern" },
  { id: "worms-eye", name: "Worm's-Eye",
    genres: ["epic", "fantasy", "brand-film"],
    prompt: "worm's-eye view from the ground looking straight up: towering vertical scale, converging lines overhead" },
  { id: "ground-level", name: "Ground Level",
    genres: ["action", "sport", "automotive"],
    prompt: "camera resting at ground level: the terrain in macro foreground, footsteps and wheels landing at lens height" },
  { id: "dutch", name: "Dutch Angle",
    genres: ["thriller", "horror", "music-video"],
    prompt: "dutch angle with the horizon tilted off level: the frame itself unsettled, verticals leaning with psychological pressure" },
  { id: "over-shoulder", name: "Over-the-Shoulder",
    genres: ["drama", "thriller", "documentary"],
    prompt: "over-the-shoulder framing: the near subject's shoulder and head soft in foreground, the facing subject held in focus" },
  { id: "pov", name: "POV",
    genres: ["horror", "action", "sport"],
    prompt: "first-person point of view: the camera is the character's eyes, hands entering frame from below, the world reacting to the viewer" },
  { id: "two-shot", name: "Two-Shot",
    genres: ["drama", "comedy", "brand-film"],
    prompt: "two-shot holding both subjects in one frame: the distance between their bodies carrying the relationship" },
];

export const shotSizeById = (id) => SHOT_SIZES.find((s) => s.id === id) || null;
export const angleById = (id) => ANGLES.find((a) => a.id === id) || null;
