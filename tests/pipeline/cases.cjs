// Generation-pipeline regression cases. Each one encodes a failure that
// actually happened and cost money or a broken render — they exist so the
// same defect cannot come back unnoticed.
const assert = require("assert");

global.CustomEvent = class { constructor(n, o) { this.name = n; this.detail = o?.detail; } };
const routes = [];
// A real (tiny) event target: cases assert on what the app ANNOUNCES, not
// only on what it returns. A no-op addEventListener silently passed every
// such assertion.
const listeners = new Map();
global.window = {
  localStorage: { getItem: () => "TEST-KEY", setItem() {}, removeItem() {} },
  dispatchEvent(e) {
    if (e.name === "generation-route") routes.push(e.detail.provider);
    for (const fn of listeners.get(e.name) || []) fn(e);
  },
  addEventListener(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
  },
  removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
};

// Size table exactly as google:4@3 returns it — a label→value OBJECT, which
// is the shape that used to defeat the healer.
const NANO2_SIZES = {
  "1:1 1K": "1024x1024", "1:1 2K": "2048x2048", "1:1 4K": "4096x4096",
  "16:9 512": "688x384", "16:9 1K": "1376x768", "16:9 2K": "2752x1536", "16:9 4K": "5504x3072",
  "9:16 1K": "768x1376", "9:16 2K": "1536x2752",
};

let script, sent, googleConfigured;
let byteplusOn = false;
global.fetch = async (url, opts) => {
  if (url === "/api/history") return { ok: true, json: async () => ({}) };
  if (url === "/api/providers/google-image" && !opts) {
    return { ok: true, json: async () => ({ configured: googleConfigured }) };
  }
  // Vertex probe: off in these cases, so the classic route is exercised.
  if (url === "/api/providers/vertex" && !opts) {
    return { ok: true, json: async () => ({ configured: false }) };
  }
  if (url === "/api/providers/byteplus" && !opts) {
    return { ok: true, json: async () => ({ configured: byteplusOn }) };
  }
  const body = opts?.body ? JSON.parse(opts.body) : null;
  const task = Array.isArray(body) ? body[0] : body;
  sent.push(task);
  const step = script.shift();
  if (!step) throw new Error("fetch script exhausted");
  return { ok: step.ok !== false, status: step.status || 200, json: async () => step.res };
};

const reset = () => { sent = []; routes.length = 0; googleConfigured = false; };
const { tryProviderGenerate, tryProviderVideo } = require("./lib/providers.js");

const okImage = (t) => ({ res: { data: [{ taskType: "imageInference", taskUUID: t?.taskUUID, imageURL: "https://ok/i.png" }] } });
const dimError = () => ({ ok: false, res: { errors: [{ code: "unsupportedDimensions", message: "Unsupported use of width/height parameters.", allowedValues: NANO2_SIZES }] } });

(async () => {
  // 1. The quality tier reaches the router under all three spellings the
  //    studios use. Reading only quality_tier rendered every Image Studio
  //    job at 1K regardless of the user's choice.
  for (const field of ["quality_tier", "resolution", "quality"]) {
    reset();
    script = [okImage()];
    await tryProviderGenerate("nano-banana-2", "t2i", { prompt: "x", aspect_ratio: "1:1", [field]: "4k" });
    assert.strictEqual(sent[0].width, 2944, `${field}: 4K must scale up`);
  }
  console.log("PASS  resolução: quality_tier / resolution / quality → todas escalam");

  // 2. Object-shaped allowedValues heals (14 real failures came from this).
  reset();
  script = [dimError(), okImage()];
  const healed = await tryProviderGenerate("nano-banana-2", "t2i", { prompt: "x", aspect_ratio: "16:9", quality_tier: "4k" });
  assert.ok(healed?.url, "must deliver after healing");
  assert.strictEqual(`${sent[1].width}x${sent[1].height}`, "5504x3072");
  console.log("PASS  dimensões: allowedValues em objeto é entendido e corrigido");

  // 3. Healing never downgrades below the requested tier.
  reset();
  script = [dimError(), okImage()];
  await tryProviderGenerate("nano-banana-2", "t2i", { prompt: "x", aspect_ratio: "1:1", quality_tier: "2k" });
  assert.strictEqual(`${sent[1].width}x${sent[1].height}`, "2048x2048", "2K must not fall to 1K");
  console.log("PASS  dimensões: pedido de 2K não vira 1K");

  // 4. Video: seed is dropped up front for families that reject it, and the
  //    i2v frame rides in inputs.frameImages.
  reset();
  script = [
    { res: { data: [{ taskType: "videoInference", taskUUID: "v1" }] } },
    { res: { data: [{ taskUUID: "v1", videoURL: "https://ok/v.mp4" }] } },
  ];
  await tryProviderVideo("klingai:kling-video@3-pro", {
    prompt: "x", image_url: "https://img/f.png", seed: 42, resolution: "1080p", duration: 5, __audio: true,
  });
  assert.strictEqual(sent[0].seed, undefined, "kling rejects seed");
  assert.deepStrictEqual(sent[0].inputs.frameImages, [{ image: "https://img/f.png", frame: "first" }]);
  assert.deepStrictEqual(sent[0].providerSettings.klingai, { sound: true });
  console.log("PASS  vídeo: seed removido, frame em inputs.frameImages, áudio no formato do Kling");

  // 5. ByteDance input moderation reroutes to Kling instead of failing.
  reset();
  script = [
    { res: { data: [{ taskType: "videoInference", taskUUID: "s1" }] } },
    { res: { errors: [{ code: "invalidProviderContent", taskUUID: "s1", responseContent: "the input image 'content[1]' may contain real person" }] } },
    { res: { data: [{ taskType: "videoInference", taskUUID: "k1" }] } },
    { res: { data: [{ taskUUID: "k1", videoURL: "https://ok/k.mp4" }] } },
  ];
  const rerouted = await tryProviderVideo("bytedance:seedance@2.5", {
    prompt: "x", image_url: "https://img/f.png", resolution: "720p", duration: 5,
  });
  assert.strictEqual(rerouted.reroutedTo, "klingai:kling-video@3-standard");
  console.log("PASS  vídeo: veto de moderação da ByteDance re-roteia para o Kling");

  // 6. With Google Cloud configured, Google models bill to the user's own
  //    project and the reseller is not touched; a credential failure must
  //    fall back instead of costing the user the generation.
  {
    const realFetch = global.fetch;
    let vertexOn = true, hit = [];
    global.fetch = async (url, opts) => {
      if (url === "/api/providers/vertex" && !opts) return { ok: true, json: async () => ({ configured: vertexOn }) };
      if (url === "/api/providers/vertex") {
        hit.push("vertex");
        return vertexOn
          ? { ok: true, status: 200, json: async () => ({ ok: true, url: "https://blob/v.png", cost: 0.134, estimated: true }) }
          : { ok: false, status: 403, json: async () => ({ error: "permission denied" }) };
      }
      if (url === "/api/providers/runware") hit.push("runware");
      return realFetch(url, opts);
    };
    delete require.cache[require.resolve("./lib/providers.js")];
    const mod = require("./lib/providers.js");

    reset(); hit = []; script = [okImage()];
    let out = await mod.tryProviderGenerate("google:4@3", "t2i", { prompt: "x", aspect_ratio: "1:1", quality_tier: "2k" });
    assert.strictEqual(out.provider, "vertex", "Google model must bill to the user's Cloud project");
    assert.ok(!hit.includes("runware"), "reseller must not be called");
    console.log("PASS  Google Cloud: modelo Google vai para a conta do usuário");

    vertexOn = false; hit = []; script = [okImage()];
    out = await mod.tryProviderGenerate("google:4@3", "t2i", { prompt: "x", aspect_ratio: "1:1" });
    assert.strictEqual(out.provider, "runware", "credential failure must fall back, not fail");
    console.log("PASS  Google Cloud: falha de credencial cai na Runware sem quebrar");

    // The regression that started this: the curated shortlist ships an id the
    // hardcoded gate never knew, so Lite renders billed to the reseller.
    vertexOn = true; hit = []; script = [okImage()];
    out = await mod.tryProviderGenerate("google:nano-banana@2-lite", "t2i", { prompt: "x" }, "Nano Banana 2 Lite");
    assert.strictEqual(out.provider, "vertex", "Nano Banana Lite must bill to the user's Cloud project");
    assert.ok(!hit.includes("runware"), "reseller must not be called for Lite");
    console.log("PASS  Google Cloud: Nano Banana Lite nao escapa para a Runware");

    // An unmapped Google model still renders — but it must announce that the
    // charge moved, instead of switching accounts behind the user's back.
    vertexOn = true;
    let missed = null;
    const onMiss = (e) => { missed = e.detail; };
    global.window.addEventListener("vertex-miss", onMiss);
    hit = []; script = [okImage()];
    out = await mod.tryProviderGenerate("google:1@1", "t2i", { prompt: "x" }, "Imagen 4");
    assert.ok(missed, "an unmapped Google model must warn that it billed elsewhere");
    assert.strictEqual(out.provider, "runware", "it must still render");
    console.log("PASS  Google Cloud: modelo Google fora do Vertex avisa que foi cobrado no revendedor");
    global.window.removeEventListener("vertex-miss", onMiss);
    global.fetch = realFetch;
  }

  // ── Seedream 5.0 direto na ByteDance ─────────────────────────────────────
  {
    const realFetch = global.fetch;
    let arkOk = true, hit = [];
    byteplusOn = true;
    global.fetch = async (url, opts) => {
      if (url === "/api/providers/byteplus" && !opts) return { ok: true, json: async () => ({ configured: true }) };
      if (url === "/api/providers/byteplus") {
        hit.push("byteplus");
        return arkOk
          ? { ok: true, status: 200, json: async () => ({ ok: true, url: "https://blob/s.jpg", cost: 0.035, estimated: true }) }
          : { ok: false, status: 502, json: async () => ({ error: "ark caiu" }) };
      }
      if (url === "/api/providers/vertex" && !opts) return { ok: true, json: async () => ({ configured: false }) };
      if (url === "/api/providers/runware") hit.push("runware");
      return realFetch(url, opts);
    };
    delete require.cache[require.resolve("./lib/providers.js")];
    const ark = require("./lib/providers.js");

    for (const [id, name] of [["bytedance:seedream@5.0-pro", "Seedream 5.0 Pro"], ["seedream-5.0", "Seedream 5.0 Lite"]]) {
      reset(); hit = []; script = [okImage()];
      const out = await ark.tryProviderGenerate(id, "t2i", { prompt: "x", aspect_ratio: "16:9", quality_tier: "2k" }, name);
      assert.strictEqual(out.provider, "byteplus", `${name} must bill to the user's ByteDance account`);
      assert.ok(!hit.includes("runware"), `${name} must not touch the reseller`);
    }
    console.log("PASS  Seedream 5.0 Pro e Lite geram pela conta ByteDance");

    // The reseller route for these two was deleted on purpose. A fallback
    // would move the charge back to Runware — the exact thing this prevents.
    arkOk = false; hit = []; script = [okImage()];
    let threw = null;
    try {
      await ark.tryProviderGenerate("bytedance:seedream@5.0-pro", "t2i", { prompt: "x" }, "Seedream 5.0 Pro");
    } catch (e) { threw = e; }
    assert.ok(threw, "a BytePlus failure must surface, not silently reroute");
    assert.ok(!hit.includes("runware"), "a BytePlus failure must NOT fall back to the reseller");
    console.log("PASS  falha na BytePlus nao volta a cobrar no Runware");

    // Models outside the 5.0 family keep their existing route untouched.
    reset(); hit = []; script = [okImage()];
    const four = await ark.tryProviderGenerate("bytedance:seedream@4.0", "t2i", { prompt: "x" }, "Seedream 4.0");
    assert.strictEqual(four.provider, "runware", "Seedream 4 must keep its reseller route");
    console.log("PASS  Seedream 4 segue pelo caminho antigo");
    byteplusOn = false;
    global.fetch = realFetch;
  }

  console.log("\nTODOS OS CASOS PASSARAM");
})().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
