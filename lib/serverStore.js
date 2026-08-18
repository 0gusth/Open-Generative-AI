import { promises as fs } from 'fs';
import path from 'path';

// Server-side state adapter. Two backends, one contract:
//   • Filesystem (.data/) — local dev, Docker with a volume. The default.
//   • Upstash Redis over REST — serverless deploys (Vercel), where the
//     filesystem does not persist. Enabled by the standard Upstash env vars
//     (UPSTASH_REDIS_REST_URL/TOKEN, or the KV_* aliases the Vercel
//     marketplace injects).
// Each document is one JSON value under one key — same shape the .data/
// files always had, so both backends stay interchangeable.

const DATA_DIR = path.join(process.cwd(), '.data');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export const usingRedis = !!(REDIS_URL && REDIS_TOKEN);

async function redis(command) {
    const response = await fetch(REDIS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
        cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `Redis error ${response.status}`);
    return data.result;
}

// Read one JSON document ("generations", "productions", …). Returns
// `fallback` when the document does not exist yet or cannot be parsed.
export async function readDoc(name, fallback) {
    if (usingRedis) {
        try {
            const value = await redis(['GET', `ogai:${name}`]);
            return value ? JSON.parse(value) : fallback;
        } catch {
            return fallback;
        }
    }
    try {
        return JSON.parse(await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf8'));
    } catch {
        return fallback;
    }
}

export async function writeDoc(name, value) {
    if (usingRedis) {
        await redis(['SET', `ogai:${name}`, JSON.stringify(value)]);
        return;
    }
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, `${name}.json`), JSON.stringify(value, null, 2));
}

// Append one line to a diagnostic log ("provider-failures", "video-submits").
// Redis keeps the newest 500 lines; the filesystem appends forever like the
// original .log files. Best-effort by design — diagnostics must never take
// a request down.
export async function appendLog(name, line) {
    try {
        if (usingRedis) {
            await redis(['LPUSH', `ogai:log:${name}`, line]);
            await redis(['LTRIM', `ogai:log:${name}`, 0, 499]);
            return;
        }
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.appendFile(path.join(DATA_DIR, `${name}.log`), line + '\n');
    } catch { /* diagnostics only */ }
}
