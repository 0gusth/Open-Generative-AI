import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Access lock for public deployments. POST { code } — the right code sets a
// long-lived httpOnly cookie carrying sha256(code), which the middleware
// checks on every request. Without APP_ACCESS_CODE the lock is disabled
// (local dev stays open).
export async function POST(request) {
    const accessCode = process.env.APP_ACCESS_CODE;
    if (!accessCode) return NextResponse.json({ ok: true });
    const body = await request.json().catch(() => ({}));
    const given = String(body.code || '');
    const givenHash = crypto.createHash('sha256').update(given).digest();
    const rightHash = crypto.createHash('sha256').update(accessCode).digest();
    if (!given || !crypto.timingSafeEqual(givenHash, rightHash)) {
        return NextResponse.json({ error: 'Código incorreto.' }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set('app_access', givenHash.toString('hex'), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
    });
    return response;
}
