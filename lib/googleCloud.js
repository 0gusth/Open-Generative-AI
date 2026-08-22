import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Google Cloud (Vertex AI) access — every Google service in this app can be
// billed to the user's own GCP project instead of a reseller.
//
// Auth, in order of preference:
//   1. GOOGLE_SERVICE_ACCOUNT_JSON — the whole key file pasted into an env
//      var. This is the only shape that works on serverless: there is no
//      shell to run `gcloud auth`, and no persistent disk to keep a key on.
//      We materialise it into /tmp once per cold start and point ADC at it.
//   2. GOOGLE_APPLICATION_CREDENTIALS — a real file path (local dev, Docker).
//   3. Ambient ADC — gcloud on the developer's machine, or a GCP runtime.
//
// Nothing here throws on a missing setup: googleCloudReady() answers false
// and the caller keeps its existing route.

const RAW_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
export const GCP_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || '';
export const GCP_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

let credentialsPromise = null;

// Write the inline key to /tmp and expose it through ADC. Cached: the file
// survives for the life of the warm instance, and concurrent calls share one
// write instead of racing on the same path.
async function materialiseKey() {
    if (!RAW_KEY) return process.env.GOOGLE_APPLICATION_CREDENTIALS || null;
    if (credentialsPromise) return credentialsPromise;
    credentialsPromise = (async () => {
        let parsed;
        try {
            parsed = JSON.parse(RAW_KEY);
        } catch {
            throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
        }
        const file = path.join(os.tmpdir(), 'gcp-key.json');
        await fs.writeFile(file, JSON.stringify(parsed), { mode: 0o600 });
        process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
        return file;
    })();
    return credentialsPromise;
}

export function googleCloudConfigured() {
    return !!(GCP_PROJECT && (RAW_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS));
}

// A GoogleGenAI client bound to the user's project. Callers use the same SDK
// surface as the AI Studio path, so model code stays identical.
export async function vertexClient() {
    if (!googleCloudConfigured()) throw new Error('Google Cloud não configurado no servidor.');
    await materialiseKey();
    const { GoogleGenAI } = await import('@google/genai');
    return new GoogleGenAI({
        vertexai: true,
        project: GCP_PROJECT,
        location: GCP_LOCATION,
    });
}

// Identity check used by the settings screen: proves the credential works and
// says WHICH project and service account will be billed, so a wrong key is
// caught before it silently spends on the wrong account.
export async function verifyGoogleCloud() {
    if (!googleCloudConfigured()) {
        return { ok: false, reason: 'Faltam GOOGLE_CLOUD_PROJECT e a credencial.' };
    }
    try {
        await materialiseKey();
        const { GoogleAuth } = await import('google-auth-library');
        const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token?.token) throw new Error('Não consegui obter token de acesso.');
        return {
            ok: true,
            project: GCP_PROJECT,
            location: GCP_LOCATION,
            account: client.email || (RAW_KEY ? JSON.parse(RAW_KEY).client_email : null) || 'ADC ambiente',
        };
    } catch (error) {
        return { ok: false, reason: error.message };
    }
}
