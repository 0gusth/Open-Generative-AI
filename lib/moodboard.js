import { GoogleGenAI } from '@google/genai';

// Moodboard reader — turns a pile of reference images into the SAME setup
// vocabulary Cinema Studio already compiles from.
//
// Why map onto the catalogs instead of free text: those ~200 entries are
// curated so every phrase names something visible, and the compiler knows
// how to assemble them. Free-form description would drift on every run and
// dilute the treatment. What genuinely does not fit a catalog slot comes
// back as a short "signature" line instead.

const KEY = process.env.GEMINI_API_KEY
    || process.env.GEMINI_FREE_KEY_1
    || process.env.GEMINI_PAID_PRIMARY_KEY
    || '';

// Vision + reasoning, on the free tier (image GENERATION is what costs).
// Two models: the flagship first, the lite one when it is overloaded — a
// transient 503 must not cost the user their moodboard read.
const VISION_MODELS = ['gemini-3.6-flash', 'gemini-3.1-flash-lite'];

export const moodboardConfigured = () => !!KEY;

const MAX_IMAGES = 12;

// Build the option list the model must choose from, one dimension per line.
function catalogPrompt(catalogs) {
    return Object.entries(catalogs)
        .map(([dimension, items]) => {
            const options = items.map((i) => `${i.id} (${i.name})`).join('; ');
            return `${dimension}: ${options}`;
        })
        .join('\n\n');
}

export async function readMoodboard({ images, catalogs, note }) {
    if (!KEY) throw new Error('Google AI key not configured on this server.');
    if (!images?.length) throw new Error('Send at least one image.');

    const ai = new GoogleGenAI({ apiKey: KEY });
    const parts = images.slice(0, MAX_IMAGES).map((img) => ({
        inlineData: { mimeType: img.mimeType || 'image/png', data: img.data },
    }));

    parts.push({
        text: [
            'You are a director of photography reverse-engineering a moodboard.',
            `Read the ${Math.min(images.length, MAX_IMAGES)} reference images AS ONE BODY OF WORK — describe what they share, not what any single frame shows. Where they disagree, follow the majority.`,
            note ? `The director adds: "${note}"` : '',
            '',
            'Pick the single best option per dimension from these catalogs. Use the id exactly as written. If a dimension genuinely has no fit, use "auto".',
            '',
            catalogPrompt(catalogs),
            '',
            'Then write "signature": ONE sentence (max 25 words) naming only what the catalogs could NOT capture — a recurring texture, a specific surface, a compositional habit. Observable things only: no adjectives like "cinematic", "beautiful", "moody". If the catalogs already say it all, return an empty string.',
            'Also write "name": a short evocative name for this look (2-4 words, in the language of the director\'s note when there is one, otherwise English).',
            'And "reading": one sentence explaining what you saw that drove the choices — the director needs to judge whether you read it right.',
            '',
            'Output ONLY a JSON object with keys: name, genre, era, camera, lens, aperture, medium, palette, lighting, signature, reading. No commentary, no markdown fence.',
        ].filter(Boolean).join('\n'),
    });

    let response = null;
    let lastError = null;
    for (const model of VISION_MODELS) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                response = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }] });
                break;
            } catch (error) {
                lastError = error;
                const busy = /503|overload|high demand|unavailable/i.test(error?.message || '');
                if (!busy) throw error;
                await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            }
        }
        if (response) break;
    }
    if (!response) throw lastError || new Error('Vision model unavailable.');

    const text = response?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('The reader did not return a usable result — try again.');

    let parsed;
    try {
        parsed = JSON.parse(match[0]);
    } catch {
        throw new Error('The reader returned malformed output — try again.');
    }

    // Never trust an id that is not in the catalog: a hallucinated id would
    // silently become "auto" deep in the compiler with no explanation here.
    const clean = { name: String(parsed.name || 'Untitled look').slice(0, 60) };
    for (const [dimension, items] of Object.entries(catalogs)) {
        const value = String(parsed[dimension] || 'auto');
        clean[dimension] = items.some((i) => i.id === value) ? value : 'auto';
    }
    clean.signature = String(parsed.signature || '').slice(0, 240);
    clean.reading = String(parsed.reading || '').slice(0, 300);
    return clean;
}
