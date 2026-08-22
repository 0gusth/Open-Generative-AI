// Generation-pipeline regression cases. Each one encodes a failure that
// actually happened and cost money or a broken render — they exist so the
// same defect cannot come back unnoticed.
const assert = require("assert");

global.CustomEvent = class { constructor(n, o) { this.name = n; this.detail = o?.detail; } };
const routes = [];
global.window = {
  localStorage: { getItem: () => "TEST-KEY", setItem() {}, removeItem() {} },
  dispatchEvent(e) { if (e.name === "generation-route") routes.push(e.detail.provider); },
  addEventListener() {},
};

// Size table exactly as google:4@3 returns it — a label→value OBJECT, which
// is the shape that used to defeat the healer.
const NANO2_SIZES = {
  "1:1 1K": "1024x1024", "1:1 2K": "2048x2048", "1:1 4K": "4096x4096",
  "16:9 512": "688x384", "16:9 1K": "1376x768", "16:9 2K": "2752x1536", "16:9 4K": "5504x3072",
  "9:16 1K": "768x1376", "9:16 2K": "1536x2752",
};

let script, sent, googleConfigured;
global.fetch = async (url, opts) => {
  if (url === "/api/history") return { ok: true, json: async () => ({}) };
  if (url === "/api/providers/google-image" && !opts) {
    return { ok: true, json: async () => ({ configured: googleConfigured }) };
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

  console.log("\nTODOS OS CASOS PASSARAM");
})().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
