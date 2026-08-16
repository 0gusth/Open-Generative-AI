// Distilled AI-cinema craft knowledge — production disciplines absorbed from
// field-tested prompt engineering practice (Higgsfield-school patterns,
// rewritten and adapted to this app's compiler + fusion architecture).
// This is DATA consumed by the fusion enhance and the compiler, not a skill.

// Words that describe what output should BE instead of what the prompt should
// DO. The fusion pass replaces them with named physical mechanisms.
export const SLOP_WORDS = [
  "epic", "beautiful", "stunning", "amazing", "breathtaking", "masterpiece",
  "cinematic masterpiece", "ultra realistic", "hyper realistic", "dramatic",
  "awesome", "incredible", "perfect", "gorgeous", "mind-blowing",
];

// Core craft rules embedded into the fusion LLM instruction. Kept terse —
// each line is a discipline, not an essay.
export const CRAFT_CORE = `
CRAFT RULES (production-tested):
- Anti-slop: never use ${SLOP_WORDS.slice(0, 8).join(", ")} or similar quality adjectives. Replace with named physical mechanisms (light source + direction, lens behavior, material response).
- One action: 1 primary action per shot, at most 1-2 subtle secondary actions. Complex sequences read as chaos.
- Active verbs carry the scene: "she darts through the alley, coat flapping" beats any adjective stack.
- Emotions decompose into muscle, breath, eyes and skin: never "sad" — instead "jaw tight, slow exhale, eyes fixed past the camera".
- Characters by visible markers only: clothing, build, posture, hair, action. Never proper names, never age words (boy/girl/child/young/teen).
- Positive constraints only: never "no blur / don't shake" — say "sharp focus throughout, locked-off stable frame".
- Image quality stays sharp; imperfection belongs to the SUBJECT (a chipped mug, uneven practical light), never to the rendering. No bare "film grain" or "soft focus" trailing the prompt — texture only as a named look tied to a stock or plate.
- Depth of field is explicit: either "sharp focus throughout, deep depth of field" or "subject in sharp focus, background falling into soft bokeh".
- Scene starts in medias res — mid-action, not with an arrival.
- Homograph check: if a verb has a plausible second physical reading (tearing, shoot, bolt, draw, drop, strike, snap, charge), replace it with phrasing only ONE thing can look like ("wind whipping violently at her coat", never "wind tearing at her coat").
- Describe a SCENE, not a subject: setting, light and visual purpose must be legible even in a short prompt.
`.trim();

export const CRAFT_VIDEO_EXTRA = `
VIDEO-SPECIFIC:
- One primary camera move per shot + at most one texture modifier ("slow dolly in, slightly handheld"); never two opposing or stacked moves.
- Name camera moves as commands, not vibes: "camera: slow dolly in" beats "the camera moves closer".
- Name the camera ENDPOINT — what the frame shows when the move finishes ("slow dolly-in, ending on her hands wrapped around the cup"). A move without a destination drifts or reverses.
- Unidirectional motion: chain 2-3 connected actions in the SAME direction so motion fills the whole clip. A short action that finishes early gets reversed by the model. A deliberate there-and-back is two shots, never one prompt.
- Detail scale follows shot size: close-ups earn micro-detail (fingers tightening, a jaw flex); wides earn broad arcs (crossing the courtyard). Never write micro-detail into a wide.
- The camera is the emotional double of the character: tension = unstable handheld breathing; calm = smooth breathing; sadness = slow, low, drifting down; shock = static then a very slow push; a breakdown = slow pull-back that gives the character space.
- Fast action morphs — describe measured, readable motion; explosive beats live in the cut, not in one clip.
- In multi-shot direction, every cut changes BOTH shot size AND camera character.
- Beat density: the model resolves 1-2 distinct action beats per 5 seconds. Packing 4+ beats into a 5s window produces blur, jitter and morphing — cut beats or state them as one flowing intent.
- Intent over timestamps: describe the intent and consequence of action ("she raises her arm until the energy erupts, sparks scattering"), never frame-by-frame choreography with clock times.
- Atmospheric micro-motion sells life: dust floating, steam rising, fabric breathing.
`.trim();

// Audio layers — applied when the model generates native audio.
export const CRAFT_AUDIO = `
AUDIO (this model generates sound):
- Dialogue in double quotes with speaker and tone: She says quietly: "We leave at dawn." Keep lines breath-sized — one short sentence per beat.
- SFX tied to the visible action, described not spelled: "the glass shatters — sharp crack, then settling tinkle", never "BANG".
- Ambient bed in 2-3 elements max, with the space's acoustics: "tight car interior, rain on the roof, wipers".
- Music as texture, never artist or song names: "low strings rising, sparse piano" beats "suspenseful music".
- If dialogue must lip-sync: medium close-up or tighter, ONE speaking face, calm camera, and no head-motion words (nodding, turning) — they fight the mouth.
- Silence is a tool: "dead quiet, then a single footstep" hits harder than a full mix.
`.trim();

export const CRAFT_I2V_EXTRA = `
IMAGE-TO-VIDEO (a start frame is provided):
- Describe ONLY what moves, changes or animates. NEVER re-describe what the still image already shows — re-description freezes the output.
- The frame carries the state; the text carries only the delta. In-flight motion and camera phase are the exception — a still cannot hold them, so state them in words.
- Give the frame life: one primary subject motion + camera move + one atmospheric motion.
`.trim();

// Performance direction — distilled acting craft applied whenever people are
// in the scene. Truthful behavior over depicted emotion.
export const CRAFT_ACTING = `
PERFORMANCE (when characters are present):
- Characters pursue an OBJECTIVE, never display an emotion: "she pushes the contract across the table, holding his gaze" beats "she looks determined". The emotion arises from the pursuit.
- States, not transitions: describe the character already IN the action (mid-throw, mid-stride, mid-argument) — models nail states and fail processes.
- Eye life is mandatory: gaze targets something specific, blinks are real (a lazy blink, a quick double-blink, a hard reset-blink), catchlights read wet and alive. Eyes reach the target a beat before the head turns. Dead frozen eyes are the #1 AI tell.
- The body before psychology: center of gravity (high chest = confidence, low slouch = fatigue/fear), tempo (the most dangerous people move least), breath (high and rapid = panic, low and slow = control).
- Give hands a BUSINESS: characters fix, pour, count, wipe — and talk over the top of it. Stopping the business at a key beat is the strongest accent.
- The strong are still and quiet; the weak fidget and shout. The most frightening line is the quietest. Threat arrives without wind-up — no menacing pauses or slow turns.
- Group reactions travel in a wave, never in sync: one person reacts first, the next 0.4s later, the third not at all.
- Emotion recipes in visible muscle (pick 2-4 tells, never stack all): anger = masseter pulsing at the jaw, nostrils flaring, no blink at the climax; anxiety = one visible swallow, tongue wetting a dry lip, shallow nasal inhale; sadness = eyes wet with catchlight but NEVER spilling, faint lip tremble, head sinking; shock = body frozen 0.3-0.5s, pupils dilating, one delayed sharp inhale; control = even breathing, slow deliberate blinks, slight chin lift; suppressed emotion = muscles visibly fighting it, one effortful swallow, a single jaw tremor instantly re-clenched.
- No tears unless asked — wet-with-catchlight is the sadness default. No cartoon grimaces. Nobody just stands there talking: there is always a micro-movement.
`.trim();

// Identity/motion separation — hard rule when character references are
// attached: the reference owns the face, the text owns the action. Mixing
// them re-describes identity during motion and causes face drift.
export const CRAFT_IDENTITY_SEPARATION = `
CHARACTER REFERENCES ATTACHED:
- The reference image OWNS the character's identity. Do NOT re-describe face, hair, build or clothing in the prompt — re-description makes the face drift mid-clip.
- The text owns ACTION only: what the character does, where they move, how the camera behaves.
- If the scene must change something the reference shows (a different outfit, an injury), state the change explicitly as a delta; otherwise stay silent about appearance.
`.trim();

// Continuation discipline (sequel/prequel from an extracted frame). Distilled
// from the five-rule continuation formula: extend, never loop.
export const CRAFT_CONTINUATION = `
CONTINUATION (this clip picks up where a previous one ended):
- Describe what happens NEXT — never what just happened. Reference the prior beat in one short phrase at most ("following her glance back"), then move on.
- NO action repeat: if the prior clip ended on her drawing the weapon, this prompt describes what she does with it next. Repeating the action makes the beat replay.
- Start on the very next frame: no time skip, no fade, no implied cut.
- Carry the emotional state forward: the tension/exhaustion/alertness of the last frame must still read on the body in the opening.
`.trim();

// Target prompt lengths by intent (words) — focus beats exhaustiveness.
export const LENGTH_TARGETS = {
  image: "60-110 words",
  video: "50-100 words",
  i2v: "30-70 words",
};

// Build the fusion system instruction for a given generation context.
// opts: { modelId — dialect of the selected model gets appended;
//         continuation — sequel/prequel discipline (extend, never loop);
//         hasCharacterRefs — identity/motion separation (refs own the face);
//         characters — resolved saved characters [{name, identity}] in scene }
export function fusionInstruction(mode /* "image" | "video" */, hasStartFrame, opts = {}) {
  const i2v = mode === "video" && hasStartFrame;
  const characterLines = (opts.characters || [])
    .map((c) => `Character @${c.name}: ${c.identity}`)
    .join("\n");
  const parts = [
    `You are a film director's assistant fusing a scene description with cinematography directives into one seamless ${mode} generation prompt.`,
    i2v
      ? "A start frame image is provided — the prompt animates it."
      : "Write as flowing, vivid prose: subject and action first, then the visual treatment integrated naturally.",
    "PRESERVE EXACTLY every equipment name (cameras, lenses, film stocks), lighting scheme, color grade and camera movement directive — do not drop, weaken or paraphrase them. Do not invent new equipment.",
    "If the scene text and the treatment disagree on camera movement, the treatment's directive wins. If the scene text stacks multiple camera moves, keep only ONE primary move (plus at most a texture modifier) — resolve to the treatment's move when present.",
    CRAFT_CORE,
    CRAFT_ACTING,
    mode === "video" ? CRAFT_VIDEO_EXTRA : "",
    mode === "video" && opts.audio ? CRAFT_AUDIO : "",
    i2v ? CRAFT_I2V_EXTRA : "",
    opts.hasCharacterRefs ? CRAFT_IDENTITY_SEPARATION : "",
    characterLines
      ? "SAVED CHARACTERS IN THIS SCENE (their reference images are attached — keep their @tags OUT of the final prompt, refer to each by their visible markers below, and never re-describe beyond these markers):\n" + characterLines
      : "",
    opts.continuation ? CRAFT_CONTINUATION : "",
    opts.dialect || "",
    `Output ONLY the final prompt, no commentary. Target ${LENGTH_TARGETS[i2v ? "i2v" : mode]}.`,
  ];
  return parts.filter(Boolean).join("\n\n");
}
