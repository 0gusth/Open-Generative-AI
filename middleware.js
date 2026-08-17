import { NextResponse } from 'next/server';

function addSecurityHeaders(response) {
    // Prevent MIME type sniffing (CWE-693)
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking (CWE-1021)
    response.headers.set('X-Frame-Options', 'DENY');
    // Enable XSS filter in legacy browsers
    response.headers.set('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy - restricts script sources to prevent XSS (CWE-79).
    // connect-src covers *.muapi.ai (not just api.muapi.ai) because generated
    // media, model thumbnails, and other assets are served from cdn.muapi.ai
    // and other muapi subdomains that the renderer fetches directly.
    response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://muapi.ai https://*.muapi.ai; font-src 'self' data:;"
    );
    return response;
}

// sha256 hex via WebCrypto — the middleware runs on the edge runtime.
async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request) {
    const url = request.nextUrl;

    // ── Access lock for public deployments ──────────────────────────────
    // With APP_ACCESS_CODE set, everything except the unlock flow needs the
    // unlock cookie: pages redirect to /unlock, API calls answer 401. The
    // history/productions/characters routes hold personal data and MUST NOT
    // be reachable on an open URL. Without the env var (local dev) the app
    // stays open exactly as before.
    const accessCode = process.env.APP_ACCESS_CODE;
    if (accessCode) {
        const open = url.pathname === '/unlock' || url.pathname === '/api/unlock';
        if (!open) {
            const cookie = request.cookies.get('app_access')?.value;
            if (cookie !== await sha256Hex(accessCode)) {
                if (url.pathname.startsWith('/api/')) {
                    return NextResponse.json({ error: 'Locked — open the app and enter the access code first.' }, { status: 401 });
                }
                return addSecurityHeaders(NextResponse.redirect(new URL('/unlock', request.url)));
            }
        }
    }

    // Only /api/v1/* is rewritten upstream; /api/workflow and /api/app have
    // their own catch-all route handlers and never reached the inner branch.
    if (url.pathname.startsWith('/api/v1')) {
        // Exclude paths that have their own dedicated route handlers with custom logic
        const isHandledByRoute = url.pathname.startsWith('/api/v1/creative-agent') ||
                                url.pathname.startsWith('/api/v1/get_upload_url') ||
                                url.pathname.startsWith('/api/v1/upload-binary');

        if (!isHandledByRoute) {
            const targetUrl = new URL(url.pathname + url.search, 'https://api.muapi.ai');
            const rewriteResponse = NextResponse.rewrite(targetUrl);
            return addSecurityHeaders(rewriteResponse);
        }
    }

    // Add security headers to all responses
    return addSecurityHeaders(NextResponse.next());
}

// Match all paths for security headers. Exclude Next.js internal paths.
export const config = {
    matcher: [
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|__nextjs_original-stack-frame).*)',
    ],
};
