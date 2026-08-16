import { NextResponse } from 'next/server';

// Proxies /api/providers/fal-billing -> https://api.fal.ai/v1/account/billing
// (CORS bypass). The fal key travels in x-provider-key. The credits field is
// behind an `expand` parameter whose accepted spelling has varied — try the
// known variants and return the first response that actually carries credits.
const EXPAND_VARIANTS = [
    '?expand[]=credits',
    '?expand%5B%5D=credits',
    '?expand=credits',
    '',
];

export async function GET(request) {
    const providerKey = request.headers.get('x-provider-key');
    if (!providerKey) {
        return NextResponse.json({ error: 'Missing fal API key' }, { status: 401 });
    }
    let last = { data: { error: 'No response' }, status: 500 };
    for (const variant of EXPAND_VARIANTS) {
        try {
            const response = await fetch(`https://api.fal.ai/v1/account/billing${variant}`, {
                headers: { Authorization: `Key ${providerKey}` },
            });
            const data = await response.json();
            last = { data, status: response.status };
            if (!response.ok) break; // auth/permission errors won't change per variant
            if (data?.credits) break; // found the shape we need
        } catch (error) {
            last = { data: { error: error.message }, status: 500 };
        }
    }
    return NextResponse.json(last.data, { status: last.status });
}
