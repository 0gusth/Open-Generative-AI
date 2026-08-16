import { NextResponse } from 'next/server';

// Streams a generated-media URL through the app server so the browser can
// read the bytes (clipboard/copy needs same-origin or CORS, and some provider
// CDNs send no CORS headers). Host allowlist prevents SSRF.
const ALLOWED_HOSTS = [
    'runware.ai', // any subdomain: im. (images), vm. (videos)…
    'im.runware.ai',
    'cdn.muapi.ai',
    'd3adwkbyhxyrtq.cloudfront.net',
    'fal.media',
    'v2.fal.media',
    'v3.fal.media',
];

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get('url');
    let parsed;
    try {
        parsed = new URL(target);
    } catch {
        return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }
    if (!/^https?:$/.test(parsed.protocol) ||
        !ALLOWED_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
        return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }
    try {
        const upstream = await fetch(parsed.toString());
        if (!upstream.ok) {
            return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: upstream.status });
        }
        return new NextResponse(upstream.body, {
            status: 200,
            headers: {
                'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
                'Cache-Control': 'private, max-age=3600',
            },
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 502 });
    }
}
