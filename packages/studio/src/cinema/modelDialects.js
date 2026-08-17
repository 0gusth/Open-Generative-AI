// Per-model prompt dialects — absorbed from field-tested production practice
// (Higgsfield-school corpus). Each AI family reads prompts differently; the
// fusion/enhance pass appends the dialect of the SELECTED model so the final
// prompt speaks that model's language. This is DATA, not a skill.
//
// Every rule here is production-tested knowledge, not speculation. Families
// without hard-won findings get no dialect (generic craft already covers them).

const DIALECTS = [
    {
        match: /seedance/i,
        video: `
MODEL DIALECT — Seedance:
- The content filter reads the WHOLE prompt as a scene and judges intent. Write like a filmmaker describing a shot, never like a note to a friend. A prompt must describe a SCENE, not a subject.
- Cover all six slots: camera movement, subject, action, setting, style, lighting. A prompt missing three of them is where flags come from.
- Sweet spot 50-80 words. First sentence carries the most weight — lead with the load-bearing element (subject OR camera move, whichever the shot lives on).
- NEVER write "fast" — it is the highest-degradation keyword. Describe the physics instead: "feet striking hard, each stride at full extension".
- Unidirectional motion only: chain 2-3 connected actions in the SAME direction so motion fills the whole clip. A short action that finishes early gets reversed by the model.
- Name the camera endpoint — what the frame shows when the move finishes ("slow dolly-in, ending on her hands wrapped around the cup").
- Detail scale follows shot size: close-ups get micro-detail (a jaw flex), wides get broad arcs (crossing the courtyard). Never cross them.
- One primary camera move + at most one texture modifier ("slow dolly in, slightly handheld"). Two stacked moves jitter.
- Homograph check: if a verb has a second physical reading (tearing, shoot, bolt, drop, strike, snap), replace it with phrasing only ONE thing can look like.
- Measurable language: speeds in km/h, atmosphere in % or meters ("fog density 40%"), white balance in Kelvin, left/right always from the camera.
- HARD OUTPUT REQUIREMENT — ByteDance's moderation flags proper names as copyright: the final prompt must contain ZERO character names. Rename every person to a visible-marker phrase ("the man in the driver's seat", "the woman by the window") with no exception.
- Equipment names (camera bodies, lenses, film stocks) STAY — they are the shot's identity and are verified safe with this filter. Keep each one verbatim AND keep the optical character described beside it (grain, halation, contrast, flare, color response), because the description is what actually renders.`.trim(),
        i2v: `
- The source frame carries the state; your text carries ONLY the delta. When frame and text would conflict, the frame wins — so never restate it.
- In-flight motion and timing cannot live in a still: restate camera-movement phase and open motion vectors in words.`.trim(),
    },
    {
        match: /kling/i,
        video: `
MODEL DIALECT — Kling:
- Kling's strength is human character and performance. Spend words on the actor: muscle-level emotion, breath, eye life — it renders micro-performance better than any peer.
- Direct, concise scene language beats ornament. One clear action arc per clip.
- Multi-shot direction works: sequential cuts described in order render as real coverage.`.trim(),
        i2v: "",
    },
    {
        match: /veo/i,
        video: `
MODEL DIALECT — Veo:
- Veo excels when the environment or phenomenon is the hero — give weather, nature, light behavior real description.
- Flowing natural-language scene prose works better here than clipped tag lists.
- Native audio: put dialogue in double quotes and name ambient sound / SFX explicitly ("rain drumming on the tin roof").`.trim(),
        i2v: "",
    },
    {
        match: /\bwan\b|wan-|wan2|alibaba/i,
        video: `
MODEL DIALECT — Wan:
- Wan's edge is artistic, stylized, painterly worlds with strong physics — commit to the style language, name the medium and texture.
- Physics reads well: give objects weight and material behavior.`.trim(),
        i2v: "",
    },
    {
        match: /hailuo|minimax/i,
        video: `
MODEL DIALECT — Hailuo:
- Hailuo's edge is fluid complex motion, physics and VFX — dance, sports, impacts, simulations. Write the motion arc as the spine of the prompt.
- Facial micro-expression renders well: decompose emotion into visible muscle movement.`.trim(),
        i2v: "",
    },
    {
        match: /sora/i,
        video: `
MODEL DIALECT — Sora:
- Sora's edge is epic scale, crowds and physical spectacle. Give the scene scale anchors (human-height comparisons) and let physics carry the drama.`.trim(),
        i2v: "",
    },
    {
        match: /seedream/i,
        image: `
MODEL DIALECT — Seedream:
- Seedream holds reference consistency and renders dense text/typography well — if the image contains text or a logo, spell it out verbatim in quotes.
- Complex multi-element layouts work: describe spatial placement explicitly (left/right always from the camera).`.trim(),
    },
    {
        match: /nano-banana|gemini|imagen/i,
        image: `
MODEL DIALECT — Nano Banana / Gemini:
- Declarative full-scene sentences work best. State the single most important element first.
- Strong at text rendering: spell any in-image text verbatim in quotes.`.trim(),
    },
    {
        match: /gpt-image|dall/i,
        image: `
MODEL DIALECT — GPT Image:
- Handles long structured prompts and complex instructions well — organized sections do not hurt it.
- Best-in-class text/logo rendering: spell in-image text verbatim in quotes.`.trim(),
    },
    {
        match: /flux/i,
        image: `
MODEL DIALECT — FLUX:
- Declarative complete sentences over keyword lists. Composition language (framing, lens behavior, light direction) is followed closely.`.trim(),
    },
];

// Return the dialect text for a model id, or "" when no family matches.
// mode: "image" | "video"; i2v appends the image-to-video addendum when the
// family has one.
export function dialectFor(modelId, mode = "image", isI2v = false) {
    if (!modelId) return "";
    const entry = DIALECTS.find((d) => d.match.test(modelId));
    if (!entry) return "";
    const base = mode === "video" ? entry.video : entry.image;
    if (!base) return "";
    const extra = isI2v && entry.i2v ? "\n" + entry.i2v : "";
    return base + extra;
}
