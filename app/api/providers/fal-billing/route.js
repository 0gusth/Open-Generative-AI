import { NextResponse } from 'next/server';

// Proxies /api/providers/fal-billing -> https://api.fal.ai/v1/account/billing
// (CORS bypass). The fal key travels in x-provider-key.
export async function GET(request) {
    const providerKey = request.headers.get('x-provider-key');
    if (!providerKey) {
        return NextResponse.json({ error: 'Missing fal API key' }, { status: 401 });
    }
    try {
        const response = await fetch('https://api.fal.ai/v1/account/billing?expand[]=credits', {
            headers: { Authorization: `Key ${providerKey}` },
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
