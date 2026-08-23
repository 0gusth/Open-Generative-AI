import zlib from 'zlib';
import { storeMedia } from './mediaStore';

// The sandbox stand-in for a paid generation.
//
// It exercises the ENTIRE pipeline — router, ledger, gallery, project folder
// sync, "Animar" — and skips exactly one thing: the call that costs money.
// That is the point. A mock that shortcuts the app teaches you nothing; this
// one only shortcuts the invoice.
//
// The picture is deliberately unmistakable: flat bands in a colour derived
// from the prompt, so two different prompts never look alike and no one ever
// confuses one of these for real output.

const crc32 = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return (buf) => {
        let c = -1;
        for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ -1) >>> 0;
    };
})();

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

// Minimal truecolour PNG. No dependency, and fast enough that the sandbox
// feels instant.
function encodePng(width, height, pixelAt) {
    const raw = Buffer.alloc(height * (width * 3 + 1));
    let p = 0;
    for (let y = 0; y < height; y++) {
        raw[p++] = 0; // filter: none
        for (let x = 0; x < width; x++) {
            const [r, g, b] = pixelAt(x, y);
            raw[p++] = r; raw[p++] = g; raw[p++] = b;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 2;  // colour type: truecolour
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
};

// Real dimensions would mean a 50MB buffer at 4K for a picture nobody keeps.
// The ASPECT is what matters for testing layout, so that is preserved exactly
// and only the scale is capped.
const LONG_SIDE = 640;
function boxFor(aspect = '1:1') {
    let [aw, ah] = String(aspect || '1:1').split(':').map(Number);
    if (!aw || !ah || aspect === 'auto') { aw = 1; ah = 1; }
    const ratio = aw / ah;
    return ratio >= 1
        ? { w: LONG_SIDE, h: Math.max(16, Math.round(LONG_SIDE / ratio)) }
        : { w: Math.max(16, Math.round(LONG_SIDE * ratio)), h: LONG_SIDE };
}

export async function mockGenerate({ prompt = '', model = '', aspectRatio = '1:1', kind = 'image' }) {
    const { w, h } = boxFor(aspectRatio);
    const seed = hash(`${prompt}|${model}`);
    const base = [
        60 + (seed % 120),
        50 + ((seed >> 8) % 130),
        70 + ((seed >> 16) % 140),
    ];
    const png = encodePng(w, h, (x, y) => {
        const band = Math.floor((x + y) / 28) % 2;
        const edge = x < 3 || y < 3 || x > w - 4 || y > h - 4;
        if (edge) return [235, 235, 240];
        const k = band ? 1 : 0.72;
        return base.map((c) => Math.round(Math.min(255, c * k)));
    });
    return {
        url: await storeMedia(png.toString('base64'), 'image/png'),
        cost: 0,
        estimated: false,
        provider: 'sandbox',
        mock: true,
        kind,
        size: `${w}x${h}`,
    };
}
