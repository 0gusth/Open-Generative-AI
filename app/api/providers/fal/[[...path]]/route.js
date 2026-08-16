import { NextResponse } from 'next/server';

const FAL_SYNC_BASE = 'https://fal.run';

// Proxies /api/providers/fal/<endpoint...> -> https://fal.run/<endpoint...>
// (fal's synchronous inference host; CORS bypass). The fal key travels in
// x-provider-key and is forwarded as `Authorization: Key ...`.
export async function POST(request, { params }) {
    const providerKey = request.headers.get('x-provider-key');
    if (!providerKey) {
        return NextResponse.json({ error: 'Missing fal API key' }, { status: 401 });
    }

    const slug = await params;
    const path = (slug.path || []).join('/');
    if (!path.startsWith('fal-ai/')) {
        return NextResponse.json({ error: 'Invalid fal endpoint' }, { status: 400 });
    }

    let body;
    try {
        body = await request.text();
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    try {
        const response = await fetch(`${FAL_SYNC_BASE}/${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Key ${providerKey}`,
            },
            body,
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
