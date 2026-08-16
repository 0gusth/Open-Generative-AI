import { NextResponse } from 'next/server';

// Proxies /api/providers/fal-billing -> https://api.fal.ai/v1/account/billing
// (CORS bypass). The credits field sits behind an `expand` parameter whose
// accepted spelling has varied; once a variant works it is memoized so each
// balance check costs a single upstream request (fal rate-limits this
// endpoint aggressively).
const EXPAND_VARIANTS = [
    '?expand[]=credits',
    '?expand%5B%5D=credits',
    '?expand=credits',
    '',
];
let workingVariant = null;

export async function GET(request) {
    const providerKey = request.headers.get('x-provider-key');
    if (!providerKey) {
        return NextResponse.json({ error: 'Missing fal API key' }, { status: 401 });
    }
    const variants = workingVariant !== null ? [workingVariant] : EXPAND_VARIANTS;
    let last = { data: { error: 'No response' }, status: 500 };
    for (const variant of variants) {
        try {
            const response = await fetch(`https://api.fal.ai/v1/account/billing${variant}`, {
                headers: { Authorization: `Key ${providerKey}` },
            });
            const data = await response.json();
            last = { data, status: response.status };
            if (!response.ok) break; // auth/permission/rate errors won't change per variant
            if (data?.credits) {
                workingVariant = variant;
                break;
            }
        } catch (error) {
            last = { data: { error: error.message }, status: 500 };
        }
    }
    return NextResponse.json(last.data, { status: last.status });
}
