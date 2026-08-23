import { vertexClient, googleCloudConfigured, GCP_LOCATION } from './googleCloud';
import { vertexModelFor, VERTEX_IMAGE_MODELS } from '../packages/studio/src/googleModels.js';
import { storeImage } from './mediaStore';

// Generation on the user's own Google Cloud project.
//
// Same job as the Runware route, different bill: images and Veo videos are
// charged to their GCP account. The returned shape matches what the rest of
// the app already speaks — { url, cost, provider } — so the ledger, gallery,
// "Animar" and the local-folder sync keep working untouched.

export const VERTEX_MODELS = {
    // Image (Nano Banana family)
    'nano-banana': 'gemini-2.5-flash-image',
    'nano-banana-edit': 'gemini-2.5-flash-image',
    'google:4@1': 'gemini-2.5-flash-image',
    'nano-banana-2': 'gemini-3.1-flash-image',
    'nano-banana-2-edit': 'gemini-3.1-flash-image',
    'google:4@3': 'gemini-3.1-flash-image',
    'nano-banana-2-lite': 'gemini-3.1-flash-lite-image',
    'nano-banana-pro': 'gemini-3-pro-image',
    'nano-banana-pro-edit': 'gemini-3-pro-image',
    // Video (Veo)
    'google:3@3': 'veo-3.1-fast-generate-preview',
    'google:3@2': 'veo-3.1-generate-preview',
};

export const isGoogleModel = (id, name) => !!resolveModel(id, name);

// One resolver for both sides. `vertexModel` is what the client already
// resolved; the id table stays as a fallback for older clients.
function resolveModel(modelId, displayName, vertexModel) {
    if (vertexModel) return vertexModel;
    return vertexModelFor(modelId, displayName) || VERTEX_MODELS[modelId] || null;
}
export const vertexAvailable = () => googleCloudConfigured();

// Published rates per MODEL and tier (USD). A single flat table was wrong:
// it charged the Pro price to every model, so a Nano Banana 2 render showed
// $0.134 when it costs $0.101. The authoritative number is always the GCP
// bill — this drives the estimate chip.
const IMAGE_COST = {
    'gemini-2.5-flash-image':      { '1k': 0.039, '2k': 0.039, '4k': 0.039 },
    'gemini-3.1-flash-image':      { '1k': 0.067, '2k': 0.101, '4k': 0.151 },
    'gemini-3.1-flash-lite-image': { '1k': 0.0336, '2k': 0.0336, '4k': 0.0336 },
    'gemini-3-pro-image':          { '1k': 0.134, '2k': 0.134, '4k': 0.24 },
};
const costFor = (model, tier) => {
    const row = IMAGE_COST[model] || IMAGE_COST['gemini-3.1-flash-image'];
    return row[String(tier || '1k').toLowerCase()] ?? row['1k'];
};
const VIDEO_COST_PER_SECOND = 0.15;

const ALLOWED_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);

async function inlineFrom(url, origin) {
    const absolute = url.startsWith('/') ? new URL(url, origin).toString() : url;
    const res = await fetch(absolute);
    if (!res.ok) throw new Error(`Could not read reference image (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    return {
        inlineData: {
            mimeType: res.headers.get('content-type')?.split(';')[0] || 'image/png',
            data: buf.toString('base64'),
        },
    };
}

export async function vertexGenerateImage({ modelId, displayName, vertexModel, prompt, aspectRatio, tier = '1k', referenceImages = [], origin }) {
    const model = resolveModel(modelId, displayName, vertexModel);
    if (!model || !VERTEX_IMAGE_MODELS.has(model)) {
        throw new Error(`${modelId} não tem equivalente de imagem no Vertex.`);
    }
    const ai = await vertexClient();

    const parts = [];
    for (const ref of referenceImages.slice(0, 6)) parts.push(await inlineFrom(ref, origin));
    parts.push({ text: prompt || '' });

    const config = {};
    if (aspectRatio && ALLOWED_RATIOS.has(aspectRatio)) {
        config.imageConfig = { aspectRatio, ...(tier ? { imageSize: tier.toUpperCase() } : {}) };
    }

    const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        ...(Object.keys(config).length ? { config } : {}),
    });

    const candidate = response?.candidates?.[0];
    const image = candidate?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!image?.data) {
        const said = candidate?.content?.parts?.find((p) => p.text)?.text;
        const err = new Error(said?.trim() || `Vertex não retornou imagem (${candidate?.finishReason || 'sem motivo'})`);
        err.definitive = true;
        throw err;
    }
    return {
        url: await storeImage(image.data, image.mimeType || 'image/png'),
        cost: costFor(model, tier),
        estimated: true,
        provider: 'vertex',
    };
}

// Veo runs as a long-running operation: submit, then poll until the video is
// ready. Budget is generous — a 8s clip routinely takes minutes.
export async function vertexGenerateVideo({ modelId, displayName, vertexModel, prompt, aspectRatio, duration = 5, image, origin, onPoll }) {
    const model = resolveModel(modelId, displayName, vertexModel);
    if (!model || VERTEX_IMAGE_MODELS.has(model)) {
        throw new Error(`${modelId} não tem equivalente de vídeo no Vertex.`);
    }
    const ai = await vertexClient();

    const request = {
        model,
        prompt: prompt || '',
        config: {
            ...(aspectRatio && ALLOWED_RATIOS.has(aspectRatio) ? { aspectRatio } : {}),
            durationSeconds: Number(duration) || 5,
            numberOfVideos: 1,
        },
    };
    if (image) {
        const inline = await inlineFrom(image, origin);
        request.image = { imageBytes: inline.inlineData.data, mimeType: inline.inlineData.mimeType };
    }

    let operation = await ai.models.generateVideos(request);
    const deadline = Date.now() + 10 * 60 * 1000;
    while (!operation.done && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
        onPoll?.(operation);
    }
    if (!operation.done) throw new Error('O Veo ainda está renderizando — verifique no console do Google Cloud.');

    const generated = operation.response?.generatedVideos?.[0];
    const bytes = generated?.video?.videoBytes;
    const uri = generated?.video?.uri;
    if (!bytes && !uri) {
        throw new Error(operation.error?.message || 'Veo terminou sem devolver vídeo.');
    }
    return {
        // A gs:// or signed URI is handed through as-is; inline bytes are hosted
        // like any other generation so the app keeps its URL contract.
        url: bytes ? await storeImage(bytes, 'video/mp4') : uri,
        cost: (Number(duration) || 5) * VIDEO_COST_PER_SECOND,
        estimated: true,
        provider: 'vertex',
    };
}
