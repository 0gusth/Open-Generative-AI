"use client";

// Cinema Studio — the flagship. Image AND video generation directed through
// the cinematography system: Film Setup (genre/era/tempo), Camera Setup
// (body/lens/aperture/medium), Look (palette/lighting) and Movement, all
// compiled by cinema/compiler.js with genre-fills-Auto semantics. Every
// catalog option shows its self-generated thumbnail.

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import { generateImage, generateI2I, generateVideo, generateI2V, uploadFile } from "../muapi.js";
import { enhanceScene, scrubForByteDance, decoupageScene } from "../providers.js";
import { fetchLedger, reconcilePending } from "../ledger.js";
import { dialectFor } from "../cinema/modelDialects.js";
import { compileCinematography } from "../cinema/compiler.js";
import { makeCut, cutsTotal, buildShotEnvelope, monotonyAudit, contrastAudit, decoupageCatalogs } from "../cinema/multiShot.js";
import { t2iModels, t2vModels, i2vModels, getMaxImagesForI2VModel } from "../models.js";
import { PROVIDER_LOGOS, INVERT_LOGOS } from "../providerLogos.js";
import { CINEMA_CAMERAS, PHOTO_CAMERAS, CINE_LENSES, PHOTO_LENSES, APERTURES, mediaForCamera } from "../cinema/gear.js";
import { GENRES, ERAS, TEMPOS } from "../cinema/filmSetup.js";
import { PALETTES } from "../cinema/palettes.js";
import { LIGHTING } from "../cinema/lighting.js";
import { MOVEMENTS } from "../cinema/movement.js";
import { SHOT_SIZES, ANGLES } from "../cinema/shots.js";
import { EFFECTS } from "../cinema/effects.js";
import { truthFor } from "../modelTruth.js";
import { fetchRunwareVideoCatalog, fetchRunwareImageCatalog, mergeVideoCatalogs, mergeImageCatalogs, isAirId } from "../runwareCatalog.js";
// Curated shortlist lives in one shared module — Image Studio reads the
// exact same list, so a model promoted here is promoted there too.
import { CURATED_MODELS as CINEMA_FAVORITES } from "../curatedModels.js";
import MODEL_CONSTRAINTS from "../modelConstraints.json";
import { hasAudioControl } from "../providerSettings.js";

// Quality tiers actually reachable by a probed architecture, from its exact
// allowed sizes (shortest side decides the tier).
function tiersFromSizes(sizes) {
  const tiers = new Set();
  for (const s of sizes) {
    const [w, h] = String(s).split("x").map(Number);
    const short = Math.min(w, h);
    if (short >= 2160) tiers.add("4k");
    else if (short >= 1080) tiers.add("1080p");
    else if (short >= 720) tiers.add("720p");
    else tiers.add("480p");
  }
  return ["480p", "720p", "1080p", "4k"].filter((t) => tiers.has(t));
}
import {
  PromptComposer,
  PromptTextarea,
  PromptMentionTextarea,
  PromptFooter,
  PromptControls,
  PromptAction,
  PromptPopover,
  PromptMenuList,
  PromptMenuItem,
  PromptChevronIcon,
  promptControlClassName,
  PROMPT_MEDIA_PREVIEW_CLASS,
} from "./prompt/PromptComposer.jsx";
import Lightbox, { downloadMedia } from "./Lightbox.jsx";
import { formatErrorMessage } from "../utils/formatError.js";
import { seekPosterFrame } from "../utils/videoPoster.js";
import { detectProperNames, needsNameScrub } from "../utils/preflight.js";

const SETUP_KEY = "cinema_setup_v2";
const HISTORY_KEY = "cinema_history_v2";

// Full model catalogs — same choice as Image and Video Studios.
const MODELS = { image: t2iModels, video: t2vModels };
const DEFAULT_MODEL = { image: "nano-banana-2", video: "kling-v3.0-standard-text-to-video" };

// Heuristic i2v sibling for reference-driven video, verified fallback last.
function i2vSibling(t2vId) {
  if (t2vId.includes(":") && t2vId.includes("@")) return t2vId; // Runware AIR handles both t2v and i2v
  const candidates = [
    t2vId.replace("-t2v", "-i2v"),
    t2vId.replace("text-to-video", "image-to-video"),
    t2vId.replace("-t2v", "-image-to-video"),
  ];
  for (const c of candidates) {
    if (c !== t2vId && i2vModels.some((m) => m.id === c)) return c;
  }
  return "kling-v3.0-standard-image-to-video";
}

// Best multi-reference (omni) i2v in the same family — may be a different
// version than the direct sibling (e.g. Seedance 2.5 t2v → Seedance 2 omni).
function omniSibling(t2vId) {
  const family = t2vId.split(/[-.]/)[0]; // "seedance", "kling", "veo"…
  let best = null;
  for (const m of i2vModels) {
    if (!m.id.startsWith(family)) continue;
    const max = getMaxImagesForI2VModel(m.id);
    if (max > 2 && (!best || max > best.max)) best = { id: m.id, max };
  }
  return best; // null when the family has no omni model
}

const FALLBACK_ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "4:5"];

// Capability readers — everything the selected model declares, nothing more.
function modelAspects(m) {
  return m?.inputs?.aspect_ratio?.enum?.length ? m.inputs.aspect_ratio.enum.filter((a) => a !== "auto") : FALLBACK_ASPECTS;
}
function modelDurations(m) {
  const d = m?.inputs?.duration;
  if (!d) return [5, 10];
  if (Array.isArray(d.enum) && d.enum.length) return d.enum.map(Number).filter(Boolean);
  if (typeof d.minValue === "number" && typeof d.maxValue === "number") {
    const list = [];
    for (let v = d.minValue; v <= d.maxValue; v += d.step || 1) list.push(v);
    return list.length > 10 ? list.filter((v, i) => i % 2 === 0 || v === d.maxValue) : list;
  }
  return [5, 10];
}
// Quality axis: the catalog names it `resolution` (98 models) OR `quality`
// (22 models, e.g. Seedance 2.0's high/basic) — read either and remember
// which field to send back.
function modelQualityAxis(m) {
  const r = m?.inputs?.resolution;
  if (Array.isArray(r?.enum) && r.enum.length) return { field: "resolution", options: r.enum, preferred: r.default };
  const q = m?.inputs?.quality;
  if (Array.isArray(q?.enum) && q.enum.length) return { field: "quality", options: q.enum, preferred: q.default };
  return null;
}
// Native-audio capability: the Muapi catalog is inconsistent (kling 3.0 i2v
// declares generate_audio, its t2v sibling doesn't), so a declared field OR
// the known native-audio families both count (Kling 3.0/2.6, Seedance 2.x/
// 1.5 Pro, Veo 3/3.1/4, Wan 2.5/2.7, Grok, Gemini Omni).
const NATIVE_AUDIO_FAMILIES = /kling-v3|kling-v2\.6|seedance-2|seedance-v2|seedance-v1\.5|veo-?3|veo-4|wan2\.5|wan2\.7|grok.*video|gemini.*omni/i;
function modelSupportsAudio(m) {
  if (m?.inputs?.generate_audio || m?.inputs?.audio || m?.inputs?.sound || m?.inputs?.generate_audio_switch) return true;
  return NATIVE_AUDIO_FAMILIES.test(m?.id || "");
}

// Curated favorites for Cinema Studio — the models that respond best to this
// studio's dense cinematographic prompts (dialects, refs, performance craft).

// Group a model list by provider for the picker.
function groupByProvider(models) {
  const groups = new Map();
  for (const m of models) {
    const key = m.provider_name || "Other";
    if (!groups.has(key)) {
      groups.set(key, {
        name: key,
        logo: m.logoUrl || PROVIDER_LOGOS[m.provider],
        invert: !m.logoUrl && INVERT_LOGOS.includes(m.provider),
        items: [],
      });
    }
    groups.get(key).items.push(m);
  }
  return [...groups.values()];
}

const DEFAULT_SETUP = {
  mode: "image",
  genre: "auto", era: "auto", tempo: "auto",
  camera: "auto", lens: "auto", aperture: "auto", medium: "auto",
  shotSize: "auto", angle: "auto",
  palette: "auto", lighting: "auto", movement: "auto", effect: "auto",
};

const thumb = (category, id) => `/cinema-thumbs/${category}-${id}.webp`;

// Extract the first or last frame of a generated video as a PNG File.
// Streams through /api/proxy-media so the canvas is never CORS-tainted.
async function extractVideoFrame(videoUrl, position /* "first" | "last" */) {
  const res = await fetch(`/api/proxy-media?url=${encodeURIComponent(videoUrl)}`);
  if (!res.ok) throw new Error("Could not fetch the video");
  const blobUrl = URL.createObjectURL(await res.blob());
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.src = blobUrl;
    await new Promise((ok, err) => {
      video.onloadedmetadata = ok;
      video.onerror = () => err(new Error("Could not decode the video"));
    });
    const target = position === "first" ? 0.05 : Math.max(0.05, video.duration - 0.1);
    await new Promise((ok, err) => {
      video.onseeked = ok;
      video.onerror = () => err(new Error("Seek failed"));
      video.currentTime = target;
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const blob = await new Promise((ok, err) =>
      canvas.toBlob((b) => (b ? ok(b) : err(new Error("Frame capture failed"))), "image/png"),
    );
    return new File([blob], `${position}-frame-${Date.now()}.png`, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

// ── Option card ─────────────────────────────────────────────────────────────

function OptionCard({ label, image, selected, onClick, auto }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/opt w-full flex flex-col gap-1.5 rounded-xl p-1 text-left transition-[transform,box-shadow] duration-150 active:scale-[0.97] ${
        selected ? "ring-2 ring-[#EF0328] bg-white/[0.04]" : "hover:bg-white/[0.05]"
      }`}
    >
      {auto ? (
        <div className="w-full h-[64px] rounded-lg border border-dashed border-white/20 bg-white/[0.03] flex items-center justify-center">
          <span className="text-[11px] font-medium text-white/50">Auto</span>
        </div>
      ) : (
        <img src={image} alt="" loading="lazy" className="w-full h-[64px] rounded-lg object-cover border border-white/[0.06]" />
      )}
      <span className={`text-[10px] leading-tight px-0.5 line-clamp-2 ${selected ? "text-white" : "text-white/60 group-hover/opt:text-white/85"}`}>
        {label}
      </span>
    </button>
  );
}

function PickerSection({ label, category, items, value, onSelect }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2 px-1">{label}</div>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2">
        <OptionCard auto label="Auto" selected={value === "auto"} onClick={() => onSelect("auto")} />
        {items.map((item) => (
          <OptionCard
            key={item.id}
            label={item.name}
            image={thumb(item.thumbCat || category, item.id)}
            selected={value === item.id}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

// Per-job elapsed clock: each concurrent render owns its own timer, so one
// card finishing never resets another's.
function JobClock({ startedAt, route }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const tick = () => setSecs(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (secs < 2) return null;
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const provider = route === "muapi" ? "Muapi" : route === "fal" ? "fal" : route === "google" ? "Google" : "Runware";
  return (
    <>
      <span className="text-[11px] tabular-nums text-white/40">via {provider} · {label}</span>
      {secs >= 25 && (
        <span className="text-[11px] text-white/30 leading-relaxed">
          Renders levam de 1 a 15 min conforme a qualidade. Está vivo — pode gerar outros.
        </span>
      )}
    </>
  );
}

// ── Cast panel — saved characters (@name) ───────────────────────────────────

function CastPanel({ cast, apiKey, onChanged }) {
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("");
  const [refUrl, setRefUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const pickImage = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try { setRefUrl(await uploadFile(apiKey, file)); }
    catch (e) { toast.error(`Upload falhou: ${e.message}`); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Dá um nome ao personagem."); return; }
    if (!refUrl) { toast.error("Personagem precisa de uma imagem de referência."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name, identity, refUrl }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setName(""); setIdentity(""); setRefUrl(null);
      onChanged();
      toast.success(`@${res.character.name} entrou no elenco.`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: c.id }),
    }).catch(() => {});
    onChanged();
  };

  return (
    <div className="mb-1">
      <div className="text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2 px-1">
        Cast — escreva @nome no prompt para escalar
      </div>
      {cast.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2 mb-3">
          {cast.map((c) => (
            <div key={c.id} className="group/cast relative flex flex-col gap-1.5 rounded-xl p-1" title={c.identity || c.name}>
              <img src={c.refUrl} alt="" className="w-full h-[64px] rounded-lg object-cover border-2 border-[#30D158]/50" />
              <button type="button" onClick={() => remove(c)}
                className="absolute top-0 right-0 w-4 h-4 bg-black/70 hover:bg-black rounded-full items-center justify-center text-white/85 text-[8px] border border-white/10 hidden group-hover/cast:flex">×</button>
              <span className="text-[10px] leading-tight px-0.5 text-[#30D158] font-medium truncate">@{c.name}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-start gap-2.5 flex-wrap rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; pickImage(f); }} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="pressable w-[64px] h-[64px] shrink-0 rounded-lg border border-dashed border-white/20 bg-white/[0.03] flex items-center justify-center overflow-hidden">
          {uploading ? (
            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
          ) : refUrl ? (
            <img src={refUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/40"><path d="M12 5v14M5 12h14" /></svg>
          )}
        </button>
        <div className="flex-1 min-w-[220px] flex flex-col gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\s+/g, ""))}
            placeholder="Nome (vira o @tag — sem espaços)"
            className="h-8 px-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-[#EF0328]/60"
          />
          <textarea
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            rows={2}
            placeholder="Marcadores visíveis: porte, cabelo, roupa, postura — nunca idade nem nome próprio"
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-[#EF0328]/60 resize-none"
          />
        </div>
        <button type="button" onClick={save} disabled={saving || uploading}
          className="pressable self-end h-8 px-3.5 rounded-lg bg-[#EF0328] text-white text-[12px] font-semibold disabled:opacity-40">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function CinemaStudio({ apiKey, droppedFiles, onFilesHandled, onGenerationStart, onGenerationEnd, onGenerationComplete, onGenerationError }) {
  const [setup, setSetup] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SETUP;
    try { return { ...DEFAULT_SETUP, ...JSON.parse(localStorage.getItem(SETUP_KEY) || "{}") }; }
    catch { return DEFAULT_SETUP; }
  });
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL.image);
  const [aspect, setAspect] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("720p");
  const [audioOn, setAudioOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("cinema_audio_on") !== "0";
  });
  const toggleAudio = () => setAudioOn((v) => {
    const next = !v;
    try { window.localStorage.setItem("cinema_audio_on", next ? "1" : "0"); } catch {}
    return next;
  });
  const [highBitrate, setHighBitrate] = useState(true); // cinema default: high
  // Multi-shot: découpage inside one clip. Cuts are the video-mode script;
  // "single" keeps the classic one-prompt flow untouched.
  const [shotMode, setShotMode] = useState("single"); // "single" | "multi"
  const [cuts, setCuts] = useState([]);
  const [decoupaging, setDecoupaging] = useState(false);
  const updateCut = (id, patch) => setCuts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCut = (id) => setCuts((prev) => prev.filter((c) => c.id !== id));
  // ── Moodboard → style ────────────────────────────────────────────────
  // Reference images in, Cinema's own setup vocabulary out. The catalogs go
  // to the reader so it can only answer with ids this app compiles; a look
  // it invented would silently degrade to "auto" with no explanation.
  const [moodImages, setMoodImages] = useState([]);   // hosted urls
  const [moodNote, setMoodNote] = useState("");
  const [moodReading, setMoodReading] = useState(null); // { name, signature, reading }
  const [moodBusy, setMoodBusy] = useState(false);
  const [savedStyles, setSavedStyles] = useState([]);
  const moodInputRef = useRef(null);

  useEffect(() => {
    fetch("/api/moodboard").then((r) => r.json())
      .then((d) => setSavedStyles(d.styles || []))
      .catch(() => {});
  }, []);

  const uploadMoodImages = async (files) => {
    const usable = [...files].filter((f) => f.type.startsWith("image/")).slice(0, 12 - moodImages.length);
    if (!usable.length) return;
    setMoodBusy(true);
    try {
      // Own upload route — the legacy Muapi key is not required (and is
      // often expired), so the moodboard never dies on someone else's auth.
      const urls = await Promise.all(usable.map(async (f) => {
        const form = new FormData();
        form.append("file", f);
        const r = await fetch("/api/upload-image", { method: "POST", body: form });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "upload falhou");
        return d.url;
      }));
      setMoodImages((prev) => [...prev, ...urls].slice(0, 12));
    } catch (e) {
      toast.error(formatErrorMessage(e, "Não consegui subir as referências"));
    } finally {
      setMoodBusy(false);
    }
  };

  const readMoodboard = async () => {
    if (moodImages.length === 0) { toast.error("Adicione ao menos uma imagem de referência."); return; }
    setMoodBusy(true);
    const toastId = toast.loading("Lendo o moodboard…");
    try {
      const slim = (items) => items.map((i) => ({ id: i.id, name: i.name }));
      const r = await fetch("/api/moodboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze",
          images: moodImages,
          note: moodNote.trim() || undefined,
          catalogs: {
            genre: slim(GENRES), era: slim(ERAS),
            camera: slim(cameraItems), lens: slim(lensItems),
            aperture: slim(APERTURES), medium: slim(mediumItems),
            palette: slim(PALETTES), lighting: slim(LIGHTING),
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "falha na leitura");
      const st = d.style;
      // Apply everything at once — the user sees the reading reflected in the
      // same controls they already know, and can override any of them.
      setSetup((prev) => ({
        ...prev,
        genre: st.genre, era: st.era, camera: st.camera, lens: st.lens,
        aperture: st.aperture, medium: st.medium, palette: st.palette, lighting: st.lighting,
        signature: st.signature || "",
      }));
      setMoodReading({ name: st.name, signature: st.signature, reading: st.reading });
      toast.success(`Estilo lido: ${st.name}`, { id: toastId });
    } catch (e) {
      toast.error(formatErrorMessage(e, "Não consegui ler o moodboard"), { id: toastId });
    } finally {
      setMoodBusy(false);
    }
  };

  const saveStyle = async () => {
    if (!moodReading) return;
    try {
      const r = await fetch("/api/moodboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          name: moodReading.name,
          setup: {
            genre: setup.genre, era: setup.era, camera: setup.camera, lens: setup.lens,
            aperture: setup.aperture, medium: setup.medium, palette: setup.palette, lighting: setup.lighting,
          },
          signature: moodReading.signature,
          reading: moodReading.reading,
          refs: moodImages,
          setupSignature: setup.signature || "",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "falha ao salvar");
      setSavedStyles((prev) => [d.style, ...prev.filter((x) => x.id !== d.style.id)]);
      toast.success("Estilo salvo — disponível em qualquer aparelho.");
    } catch (e) {
      toast.error(formatErrorMessage(e, "Não consegui salvar o estilo"));
    }
  };

  const applyStyle = (style) => {
    setSetup((prev) => ({ ...prev, ...style.setup, signature: style.signature || "" }));
    setMoodReading({ name: style.name, signature: style.signature, reading: style.reading });
    setMoodImages(style.refs || []);
    toast.success(`Estilo "${style.name}" aplicado.`);
  };

  const deleteStyle = async (style) => {
    if (!window.confirm(`Excluir o estilo "${style.name}"?`)) return;
    await fetch("/api/moodboard", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: style.id }),
    }).catch(() => {});
    setSavedStyles((prev) => prev.filter((s) => s.id !== style.id));
  };

  // Hand the assembled look to the Production tab: treatment blocks only
  // (no subject), compiled deterministically from the current setup.
  const saveStylePrefix = () => {
    const prefix = compileCinematography({ ...setup, prompt: "", seedText: prompt.trim(), modelId }).prompt;
    if (!prefix) { toast.error("Monte um look primeiro (Film / Camera / Look / Movement)."); return; }
    try {
      localStorage.setItem("cinema_style_prefix_pending", JSON.stringify({
        text: prefix,
        resolved: compiled.resolved,
        at: new Date().toISOString(),
      }));
      toast.success("Look salvo — aplique na aba Production como prefixo de estilo.");
    } catch { toast.error("Não consegui salvar o prefixo."); }
  };
  const autoDecoupage = async () => {
    if (!prompt.trim()) { toast.error("Escreva a cena em prosa primeiro — o ✦ propõe os cortes."); return; }
    setDecoupaging(true);
    try {
      const proposed = await decoupageScene(prompt.trim(), { duration, catalogs: decoupageCatalogs() });
      if (proposed?.length) {
        setCuts(proposed.map((c) => makeCut(c)));
        toast.success(`${proposed.length} cortes propostos — tudo editável.`);
      } else {
        toast.error("A decupagem não voltou cortes utilizáveis — tenta detalhar a cena.");
      }
    } finally {
      setDecoupaging(false);
    }
  };
  // Image mode controls — quality tier and how many variations per Direct.
  // Image-first workflow lives on cheap iteration: 4 takes, pick one, animate.
  const [imageTier, setImageTier] = useState("2k"); // 1K makes flagship models look dated
  // Seed: null = fresh randomness per run. Locking one lets you iterate
  // variations OF a frame instead of restarting from scratch every click.
  const [seed, setSeed] = useState(null);
  const [lastSeed, setLastSeed] = useState(null);
  const [variations, setVariations] = useState(1);
  const [startFrame, setStartFrame] = useState(null);
  const [endFrame, setEndFrame] = useState(null);
  const startFrameInputRef = useRef(null);
  const endFrameInputRef = useRef(null);
  const [openPanel, setOpenPanel] = useState(null); // "film" | "camera" | "look" | "movement"
  // In-flight generations. Several can run at once — each carries its own
  // placeholder card, elapsed clock and provider route.
  const [jobs, setJobs] = useState([]);
  const generating = jobs.length > 0;
  const makeJobId = () => `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [history, setHistory] = useState(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
  });
  // The gallery was localStorage-only: the same work looked lost on the site
  // and on the phone. Merge the shared server ledger in, keeping the local
  // copy of an entry when both exist (it carries the gear chips and seed).
  // Entries with no `studio` tag are pre-tagging history and count as ours.
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      const ledger = await fetchLedger();
      if (!alive) return;
      const mine = ledger.filter((e) => e.url && (!e.studio || e.studio === "cinema"));
      setHistory((prev) => {
        const known = new Set(prev.map((e) => e.url));
        const fresh = mine.filter((e) => !known.has(e.url));
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 200);
      });
    };
    sync();
    const timer = setInterval(async () => { await reconcilePending(); sync(); }, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const panelRef = useRef(null);
  // References (up to 9 — Seedance-class ceiling)
  const [refs, setRefs] = useState([]);
  const [refUploading, setRefUploading] = useState([]);
  const refInputRef = useRef(null);
  // Director's enhance — fuses scene + treatment via LLM (sticky)
  const [enhanceOn, setEnhanceOn] = useState(() => {
    if (typeof window === "undefined") return true;
    // OFF by default. The compiled prompt is the product: committee-curated
    // phrases where every word maps to a visible feature. Handing it to an
    // LLM to "improve" adds sampling variance (different result every run)
    // and paraphrases precise language into generic prose — measurably worse
    // in both modes, and worst on image models, which want dense declarative
    // attributes rather than flowing narration. Turn it on deliberately, for
    // messy scene text or dialogue scenes.
    return window.localStorage.getItem("cinema_enhance_on") === "1";
  });
  const toggleEnhance = () => setEnhanceOn((v) => {
    const next = !v;
    try { window.localStorage.setItem("cinema_enhance_on", next ? "1" : "0"); } catch {}
    return next;
  });
  // Open list popovers: "model" | "aspect" | "duration" | "quality" | null
  const [openList, setOpenList] = useState(null);
  const [modelSearch, setModelSearch] = useState("");
  // Model picker tab — favorites first (sticky choice)
  const [modelTab, setModelTab] = useState(() => {
    if (typeof window === "undefined") return "fav";
    return window.localStorage.getItem("cinema_model_tab") || "fav";
  });
  useEffect(() => {
    try { window.localStorage.setItem("cinema_model_tab", modelTab); } catch {}
  }, [modelTab]);

  // Render telemetry for the placeholder card: which provider took the job
  // and for how long it has been running — a silent spinner reads as frozen.
  const [renderRoute, setRenderRoute] = useState(null); // "runware" | "muapi" | "fal"
  const [renderElapsed, setRenderElapsed] = useState(0);
  useEffect(() => {
    const onRoute = (e) => setRenderRoute(e.detail?.provider || null);
    window.addEventListener("generation-route", onRoute);
    return () => window.removeEventListener("generation-route", onRoute);
  }, []);
  useEffect(() => {
    if (!generating) { setRenderRoute(null); setRenderElapsed(0); return; }
    const startedAt = Date.now();
    const timer = setInterval(() => setRenderElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [generating]);
  const elapsedLabel = `${Math.floor(renderElapsed / 60)}:${String(renderElapsed % 60).padStart(2, "0")}`;

  // ── Cast: saved characters (@name) — cross-browser via /api/characters ──
  const [cast, setCast] = useState([]);
  const loadCast = useCallback(async () => {
    try {
      const data = await fetch("/api/characters").then((r) => r.json());
      setCast(data.characters || []);
    } catch { /* offline — cast just stays empty */ }
  }, []);
  useEffect(() => { loadCast(); }, [loadCast]);

  // Characters actually mentioned in the prompt right now
  const mentionedCast = useMemo(() => {
    if (!prompt) return [];
    return cast.filter((c) => new RegExp(`@${c.name}(?![\\p{L}\\p{N}_-])`, "iu").test(prompt));
  }, [prompt, cast]);

  // Mention list for the textarea: saved characters (green) + attached refs
  const promptMentions = useMemo(() => [
    ...cast.map((c) => ({ token: `@${c.name}`, thumb: c.refUrl, color: "#30D158" })),
    ...refs.map((url, i) => ({ token: `@img${i + 1}`, thumb: url, color: "#EF0328" })),
  ], [cast, refs]);

  // Replace @name tokens with the character's visible markers — the raw-path
  // resolution used when Director's enhance is off (the model never sees tags).
  const inlineCast = useCallback((text) => {
    let out = text;
    for (const c of mentionedCast) {
      out = out.replace(
        new RegExp(`@${c.name}(?![\\p{L}\\p{N}_-])`, "giu"),
        c.identity ? `the character (${c.identity})` : "the character from the reference",
      );
    }
    return out;
  }, [mentionedCast]);

  const uploadRefs = useCallback(async (files) => {
    const usable = files.filter((f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024).slice(0, 9 - refs.length);
    if (!usable.length) return;
    const locals = usable.map((f) => URL.createObjectURL(f));
    setRefUploading((prev) => [...prev, ...locals]);
    try {
      const urls = await Promise.all(usable.map((f) => uploadFile(apiKey, f)));
      setRefs((prev) => [...prev, ...urls].slice(0, 9));
    } catch (e) {
      toast.error(`Reference upload failed: ${e.message}`);
    } finally {
      locals.forEach((u) => URL.revokeObjectURL(u));
      setRefUploading((prev) => prev.filter((u) => !locals.includes(u)));
    }
  }, [apiKey, refs.length]);

  // shell drag-and-drop / paste pipeline
  const processedDrops = useRef(new WeakSet());
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      if (processedDrops.current.has(droppedFiles)) return;
      processedDrops.current.add(droppedFiles);
      uploadRefs(droppedFiles.filter((f) => f.type.startsWith("image/")));
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, uploadRefs]);

  const mode = setup.mode;

  useEffect(() => {
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch {}
  }, [setup]);
  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 60))); } catch {}
  }, [history]);

  // Runware-native video catalog (primary source); wrapper models only where
  // Runware doesn't carry an equivalent.
  const [rwCatalog, setRwCatalog] = useState([]);
  const [rwImages, setRwImages] = useState([]);
  useEffect(() => { fetchRunwareVideoCatalog().then(setRwCatalog); }, []);
  useEffect(() => { fetchRunwareImageCatalog().then(setRwImages); }, []);
  const models = useMemo(() => ({
    image: mergeImageCatalogs(rwImages, t2iModels),
    video: mergeVideoCatalogs(rwCatalog, t2vModels),
  }), [rwCatalog, rwImages]);

  // Model list follows mode. DEFAULT_MODEL holds legacy wrapper ids that no
  // longer exist in the Runware-native catalog, so fall back through:
  // default → first favorite present → first model. Landing on an id that
  // isn't in the list leaves the picker blank and generation dead.
  useEffect(() => {
    const list = models[mode];
    if (!list.length || list.some((m) => m.id === modelId)) return;
    const favorite = CINEMA_FAVORITES[mode].find((id) => list.some((m) => m.id === id));
    const fallback = list.some((m) => m.id === DEFAULT_MODEL[mode])
      ? DEFAULT_MODEL[mode]
      : favorite || list[0].id;
    setModelId(fallback);
  }, [mode, models]); // eslint-disable-line react-hooks/exhaustive-deps

  // close panel on outside click / Esc
  useEffect(() => {
    if (!openPanel && !openList) return;
    const onDown = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) { setOpenPanel(null); setOpenList(null); } };
    const onKey = (e) => { if (e.key === "Escape") { setOpenPanel(null); setOpenList(null); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [openPanel, openList]);

  const set = (key) => (value) => setSetup((s) => ({ ...s, [key]: value }));

  // camera pool per mode, with thumb categories attached
  const cameraItems = useMemo(() => {
    const cine = CINEMA_CAMERAS.map((c) => ({ ...c, thumbCat: "cine-camera" }));
    if (mode === "video") return cine;
    return [...cine, ...PHOTO_CAMERAS.map((c) => ({ ...c, thumbCat: "photo-camera" }))];
  }, [mode]);

  const lensItems = useMemo(() => {
    const cine = CINE_LENSES.map((l) => ({ ...l, thumbCat: "cine-lens" }));
    if (mode === "video") return cine;
    return [...cine, ...PHOTO_LENSES.map((l) => ({ ...l, thumbCat: "photo-lens" }))];
  }, [mode]);

  const mediumItems = useMemo(() => {
    const cam = cameraItems.find((c) => c.id === setup.camera) || null;
    return mediaForCamera(cam, mode).map((s) => ({ ...s, thumbCat: "stock" }));
  }, [cameraItems, setup.camera, mode]);

  const modelObj = useMemo(() => models[mode].find((m) => m.id === modelId) || null, [models, mode, modelId]);
  const caps = useMemo(() => {
    const air = isAirId(modelId);
    const rw = modelObj?.rw || null;
    const sib = mode === "video" && !air ? i2vModels.find((m) => m.id === i2vSibling(modelId)) : null;
    // TRUTH first (official model spec) → Runware capability tags → wrapper
    // catalog. Aggregator metadata under-declares (Seedance 2.0 there:
    // high/basic + 5/10/15; the real model: 480p→4K, 4–15s, bitrate).
    const truth = mode === "video" ? truthFor(`${modelId} ${modelObj?.name || ""}`) : null;
    const catalogQuality = mode === "video" ? modelQualityAxis(modelObj) : null;
    // Probed facts outrank everything: exact sizes/durations harvested from
    // the API's own validation errors, per architecture.
    const probed = mode === "video" ? MODEL_CONSTRAINTS[modelId] : null;
    const probedTiers = probed?.sizes?.length ? tiersFromSizes(probed.sizes) : null;
    return {
      aspects: truth?.aspects || modelAspects(modelObj),
      durations: probed?.durations || truth?.durations || (rw ? [4, 5, 6, 7, 8, 9, 10] : modelDurations(modelObj)),
      qualityAxis: probedTiers
        ? { field: "resolution", options: probedTiers }
        : truth?.qualities
          ? { field: "resolution", options: truth.qualities }
          : rw
            ? { field: "resolution", options: rw.fourK ? ["720p", "1080p", "4k"] : ["480p", "720p", "1080p"] }
            : catalogQuality,
      // Bitrate: `high_bitrate` was a Muapi-only field — the Runware path
      // never read it, so the switch was decoration. Hidden until a real
      // mechanism is verified in Runware's docs (same rule as audio: no
      // verified control, no toggle).
      bitrate: false,
      // Sound switch only where a REAL control exists (documented provider
      // mechanism or probed top-level param) — never a toggle the API ignores.
      audio: mode === "video" && (air
        ? hasAudioControl(modelId, probed?.audioParam === true)
        : modelSupportsAudio(modelObj)),
      startFrame: mode === "video" && (air ? !!rw?.i2v : !!sib),
      endFrame: mode === "video" && (air ? !!rw?.firstLast : !!sib?.lastImageField),
      multiRef: mode === "video" ? (air ? !!rw?.i2v : !!omniSibling(modelId)) : true,
      omni: mode === "video" && !air ? omniSibling(modelId) : null,
    };
  }, [models, modelObj, mode, modelId]);

  // keep selections valid when the model changes
  useEffect(() => {
    if (!caps.aspects.includes(aspect)) setAspect(caps.aspects[0]);
    if (mode === "video" && !caps.durations.includes(duration)) setDuration(caps.durations[0]);
    if (caps.qualityAxis && !caps.qualityAxis.options.includes(resolution)) {
      const opts = caps.qualityAxis.options;
      setResolution(opts.includes("720p") ? "720p" : caps.qualityAxis.preferred && opts.includes(caps.qualityAxis.preferred) ? caps.qualityAxis.preferred : opts[0]);
    }
    // NEVER auto-clear the frames. Switching Image→Video re-renders once with
    // the image model still selected, and caps.startFrame is false in that
    // instant — clearing there silently threw away the frame the user had just
    // attached, so Direct fell through to text-to-video and produced a brand
    // new shot. The frames are user intent; if a model truly can't take them
    // the API says so out loud.
  }, [caps]); // eslint-disable-line react-hooks/exhaustive-deps

  const compiled = useMemo(
    () => compileCinematography({ ...setup, prompt, modelId }),
    [setup, prompt, modelId],
  );

  // count of non-auto choices per panel (for button badges)
  const activeCount = (keys) => keys.filter((k) => setup[k] && setup[k] !== "auto").length;

  const handleGenerate = async () => {
    // Concurrent by design: a video render runs for minutes and must never
    // hold the studio hostage. Each Direct opens its own job with its own
    // placeholder card; results land as they finish.
    const jobId = makeJobId();
    const multiShot = mode === "video" && shotMode === "multi";
    const filledCuts = multiShot ? cuts : [];
    const jobLabel = (multiShot ? filledCuts[0]?.action || "multi-shot" : prompt.trim()).slice(0, 60);
    if (!multiShot && !prompt.trim()) { toast.error("Describe your scene first."); return; }
    if (multiShot) {
      if (filledCuts.length < 2) { toast.error("Multi-shot pede pelo menos 2 cortes."); return; }
      const emptyIdx = filledCuts.findIndex((c) => !c.action.trim());
      if (emptyIdx !== -1) { toast.error(`CUT ${emptyIdx + 1} está sem ação — descreva o que acontece ou remova o corte.`); return; }
      const total = cutsTotal(filledCuts);
      if (total !== duration) {
        // The arithmetic law: a wrong sum is dead air or an impossible cut.
        toast.error(`Os cortes somam ${total}s mas o clipe tem ${duration}s — feche a aritmética antes do Direct.`);
        return;
      }
    }
    // Money guard: an app error message pasted (or carried) into the prompt
    // box once became a paid render of the words "Generation failed".
    if (/generation failed|unsupported use of '|invalid value for '/i.test(prompt)) {
      toast.error("This looks like an app error message, not a scene. Clear the prompt and describe the shot.");
      return;
    }
    onGenerationStart?.();
    setJobs((prev) => [...prev, { id: jobId, label: jobLabel, mode, aspect, startedAt: Date.now() }]);
    try {
      // Saved characters: attach their reference images and resolve @tags to
      // visible markers (the reference owns identity, the text owns action).
      const castRefs = mentionedCast
        .map((c) => c.refUrl)
        .filter((u) => u && u !== startFrame && !refs.includes(u));
      const effRefs = [...refs, ...castRefs].slice(0, 9);
      // Always send a seed we know: locked when the user pinned one, fresh
      // otherwise — so every result can be reproduced from its history entry.
      const usedSeed = seed ?? Math.floor(Math.random() * 2147483647);
      setLastSeed(usedSeed);
      // ✦ improves the SCENE only, BEFORE the treatment blocks are added —
      // the committee-curated blocks are appended afterwards and never pass
      // through an LLM. (The old order rewrote the finished prompt, diluting
      // the treatment and making every run different.)
      let scene = prompt.trim();
      if (multiShot) {
        // The envelope IS the script — timed shots with their own framing and
        // camera character. No LLM pass here: paraphrase would break the
        // timings and the double-contrast the cards encode.
        scene = buildShotEnvelope(filledCuts);
      } else if (enhanceOn) {
        const cont = continuationRef.current;
        scene = await enhanceScene(scene, mode, {
          modelId,
          hasStartFrame: !!(startFrame || effRefs.length),
          continuation: !!cont && (startFrame === cont.url || endFrame === cont.url),
          dialect: dialectFor(modelId, mode, mode === "video" && !!startFrame),
        });
      }
      // seedText = the author's own words: keeps Auto gear identical whether
      // ✦ is on or off, and across re-runs of the same scene.
      const compiledNow = compileCinematography({ ...setup, prompt: scene, seedText: multiShot ? (filledCuts[0]?.action || scene) : prompt.trim(), modelId, hasStartFrame: !!startFrame, multiShot });
      let material = inlineCast(compiledNow.prompt);
      // ByteDance video moderation flags person names as copyright. Warning
      // the user was not a fix — the render still died. Scrub automatically:
      // names become visible markers, dialogue in quotes and gear names stay
      // untouched (scrubForByteDance no-ops outside the ByteDance video path).
      material = await scrubForByteDance(material, modelId, mode);
      const finalPrompt = material;
      let res;
      if (mode === "image") {
        const params = {
          model: modelId,
          prompt: finalPrompt,
          aspect_ratio: aspect,
          quality_tier: imageTier,
          numberResults: variations,
          seed: usedSeed,
          __studio: "cinema",
          __resolved: compiledNow.resolved,
        };
        if (effRefs.length) params.images_list = effRefs;
        res = await generateImage(apiKey, params);
      } else if (startFrame || effRefs.length || endFrame) {
        const allImages = [startFrame, ...effRefs].filter(Boolean);
        const useOmni = effRefs.length > 0 && caps.omni;
        const params = {
          model: useOmni ? caps.omni.id : i2vSibling(modelId),
          image_url: allImages[0] || endFrame,
          prompt: finalPrompt,
          aspect_ratio: aspect,
          duration,
          __audio: audioOn,
          generate_audio: audioOn,
          __studio: "cinema",
          __resolved: compiledNow.resolved,
        };
        if (allImages.length > 1) params.images_list = allImages;
        if (caps.qualityAxis) params[caps.qualityAxis.field] = resolution;
        if (caps.bitrate) params.high_bitrate = highBitrate;
        params.seed = usedSeed;
        if (endFrame) params.last_image = endFrame;
        res = await generateI2V(apiKey, params);
      } else {
        const params = { model: modelId, prompt: finalPrompt, aspect_ratio: aspect, duration, __audio: audioOn, generate_audio: audioOn, seed: usedSeed, __studio: "cinema", __resolved: compiledNow.resolved };
        if (caps.qualityAxis) params[caps.qualityAxis.field] = resolution;
        if (caps.bitrate) params.high_bitrate = highBitrate;
        res = await generateVideo(apiKey, params);
      }
      if (!res?.url) throw new Error("No result returned");
      if (res.reroutedTo) {
        toast(
          `A moderação da ByteDance vetou o frame (rosto realista). Gerado automaticamente no ${res.reroutedTo.includes("3-pro") ? "Kling 3 Pro" : "Kling 3 Standard"} — sem cobrança dupla.`,
          { duration: 9000, icon: "🔀" },
        );
      }
      const entry = {
        id: res.id || Math.random().toString(36).slice(2),
        url: res.url,
        type: mode,
        prompt: finalPrompt,
        model: res.reroutedTo || modelId,
        cost: typeof res.cost === "number" ? res.cost : null,
        resolved: compiledNow.resolved,
        seed: usedSeed,
        aspect_ratio: aspect,
        timestamp: new Date().toISOString(),
      };
      // Variations: every image comes back — show them all, newest first.
      const extras = (res.urls || []).filter((u) => u && u !== res.url).map((u, i) => ({
        ...entry,
        id: `${entry.id}-v${i + 2}`,
        url: u,
      }));
      setHistory((prev) => [entry, ...extras, ...prev]);
      onGenerationComplete?.({ url: res.url, model: modelId, prompt: finalPrompt, type: mode });
    } catch (e) {
      const msg = formatErrorMessage(e, "Cinema generation failed");
      if (onGenerationError) onGenerationError(msg); else toast.error(msg);
    } finally {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      onGenerationEnd?.();
    }
  };

  // Lightbox retouch: describe a change, the still is edited in place by an
  // image-to-image model (Nano Banana 2 — strong instruction following on
  // edits). The original stays in history; the fix lands as a new entry.
  const adjustImage = async (entry, instruction) => {
    const jobId = makeJobId();
    setJobs((prev) => [...prev, { id: jobId, label: `ajuste: ${instruction.slice(0, 48)}`, mode: "image", aspect: entry.aspect_ratio || aspect, startedAt: Date.now() }]);
    try {
      const res = await generateI2I(apiKey, {
        model: "google:4@3", // Nano Banana 2
        prompt: instruction,
        image_url: entry.url,
        images_list: [entry.url],
        aspect_ratio: entry.aspect_ratio || aspect,
        quality_tier: imageTier,
      });
      if (!res?.url) throw new Error("Sem resultado");
      setHistory((prev) => [{
        id: res.id || `${entry.id}-adj-${Date.now()}`,
        url: res.url,
        type: "image",
        prompt: `${entry.prompt || ""}\n[ajuste] ${instruction}`,
        model: "google:4@3",
        resolved: entry.resolved,
        aspect_ratio: entry.aspect_ratio || aspect,
        timestamp: new Date().toISOString(),
      }, ...prev]);
      setLightboxIdx(0);
      toast.success("Ajuste pronto.");
    } catch (e) {
      toast.error(formatErrorMessage(e, "Não consegui ajustar"));
    } finally {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    }
  };

  // Image → video bridge: the production path is image-first (approve the
  // frame cheaply, then animate). Carries the still into the start-frame slot
  // with the SAME treatment, and leaves the prompt describing only motion —
  // the i2v craft rule (never re-describe what the frame already shows).
  const animateStill = (entry) => {
    setSetup((s) => ({ ...s, mode: "video" }));
    // Move to a video model that actually accepts a start frame, otherwise the
    // still would ride into a text-to-video model that ignores it.
    const videoList = models.video;
    const canAnimate = (m) => (isAirId(m.id) ? m.rw?.i2v : true);
    if (!videoList.some((m) => m.id === modelId && canAnimate(m))) {
      const favorite = CINEMA_FAVORITES.video
        .map((id) => videoList.find((m) => m.id === id))
        .find((m) => m && canAnimate(m));
      const fallback = favorite || videoList.find(canAnimate);
      if (fallback) setModelId(fallback.id);
    }
    setStartFrame(entry.url);
    setEndFrame(null);
    setRefs([]);
    continuationRef.current = null; // a still is not a continuation
    setPrompt("");
    toast.success("Frame carregado. Descreva só o que se move e clique Direct.", { duration: 6000 });
  };

  // Sequel: last frame becomes the START reference of the next clip.
  // Prequel: first frame becomes the END frame the new clip must land on.
  const [extracting, setExtracting] = useState(null); // entry id while working
  // Remembers which uploaded frame came from a sequel/prequel so the fusion
  // applies continuation discipline (extend, never loop) only while that
  // exact frame is still in its slot.
  const continuationRef = useRef(null); // { url, direction } | null
  const startContinuation = async (entry, direction /* "sequel" | "prequel" */) => {
    if (extracting) return;
    setExtracting(entry.id);
    const toastId = toast.loading(direction === "sequel" ? "Extraindo último frame…" : "Extraindo primeiro frame…");
    try {
      const file = await extractVideoFrame(entry.url, direction === "sequel" ? "last" : "first");
      const url = await uploadFile(apiKey, file);
      continuationRef.current = { url, direction };
      setSetup((s) => ({ ...s, mode: "video" }));
      if (direction === "sequel") {
        setStartFrame(url);
        setRefs([]);
        setEndFrame(null);
        setPrompt(entry.prompt ? `${entry.prompt.split(".")[0]} — the scene continues` : "");
        toast.success("Último frame carregado como início. Descreva a continuação e Direct.", { id: toastId });
      } else {
        setEndFrame(url);
        setRefs([]);
        setPrompt(entry.prompt ? `moments before: ${entry.prompt.split(".")[0]}` : "");
        toast.success("Primeiro frame definido como destino. Adicione uma referência inicial (opcional) e Direct.", { id: toastId });
      }
    } catch (e) {
      toast.error(`Não deu: ${e.message}`, { id: toastId });
    } finally {
      setExtracting(null);
    }
  };

  // resolved summary chips (what Auto decided)
  const resolvedChips = useMemo(() => {
    const r = compiled.resolved;
    return [...new Set(
      [r.shotSize, r.angle, r.camera, r.lens, r.medium, r.aperture, r.palette, r.lighting, mode === "video" ? r.movement : null, mode === "video" ? r.effect : null, mode === "video" ? r.tempo : null]
        .filter(Boolean),
    )];
  }, [compiled, mode]);

  const panelButton = (id, label, keys) => (
    <button
      type="button"
      onClick={() => setOpenPanel(openPanel === id ? null : id)}
      className={promptControlClassName({ compact: true, active: openPanel === id })}
    >
      <span className="text-xs font-semibold">{label}</span>
      {activeCount(keys) > 0 && (
        <span className="min-w-[16px] h-4 px-1 rounded-full bg-[#EF0328] text-white text-[9px] font-bold flex items-center justify-center">
          {activeCount(keys)}
        </span>
      )}
    </button>
  );

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-app-bg relative p-4 md:p-6 overflow-hidden">
      {/* ── GALLERY ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-48 lg:pb-40 px-2">
        {history.length > 0 || generating ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full pt-4 animate-fade-in-up">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="relative rounded-2xl overflow-hidden border border-white/[0.07] bg-[#171719] animate-fade-in-up"
                style={{ aspectRatio: job.aspect === "9:16" ? "9/16" : "16/9" }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-white/[0.05] animate-pulse" style={{ filter: "blur(24px)" }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/70 animate-spin" />
                  <span className="text-[13px] font-medium text-white/60">Directing…</span>
                  {job.label && (
                    <span className="text-[11px] text-white/40 line-clamp-2">{job.label}</span>
                  )}
                  <JobClock startedAt={job.startedAt} route={renderRoute} />
                </div>
              </div>
            ))}
            {history.map((entry, idx) => (
              <div
                key={entry.id}
                onClick={() => setLightboxIdx(idx)}
                className="relative group rounded-2xl overflow-hidden border border-white/[0.08] bg-[#171719] shadow-[0_2px_12px_rgba(0,0,0,0.25)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.45)] hover:border-white/[0.16] hover:-translate-y-0.5 transition-[transform,box-shadow,border-color] duration-250 ease-apple cursor-pointer"
              >
                {/* Hover download — no lightbox needed */}
                <button
                  type="button"
                  title="Baixar"
                  onClick={(e) => {
                    e.stopPropagation();
                    const isVideo = entry.type === "video";
                    downloadMedia(entry.url, `${(entry.model || "cinema").replace(/[^a-z0-9-]/gi, "-")}-${entry.id}.${isVideo ? "mp4" : "png"}`)
                      .catch(() => toast.error("Download falhou — tenta de novo."));
                  }}
                  className="pressable absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/70 backdrop-blur-md border border-white/[0.12] hidden md:flex items-center justify-center text-white/85 hover:text-white hover:bg-black/90 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                </button>
                {entry.type === "video" ? (
                  <div className="relative">
                    <video src={entry.url} muted loop playsInline
                      onLoadedMetadata={seekPosterFrame}
                      onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                      onMouseLeave={(e) => e.currentTarget.pause()}
                      className="w-full aspect-video object-cover bg-black/40" />
                    <div className="absolute bottom-2 right-2 hidden md:flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button type="button"
                        title="Prequel — gerar o que veio ANTES deste clipe"
                        disabled={extracting === entry.id}
                        onClick={(e) => { e.stopPropagation(); startContinuation(entry, "prequel"); }}
                        className="pressable h-7 px-2.5 rounded-full bg-black/70 backdrop-blur-md border border-white/[0.12] text-[10px] font-semibold text-white/85 hover:bg-black/90 disabled:opacity-50">
                        ⏮ Prequel
                      </button>
                      <button type="button"
                        title="Sequel — continuar este clipe"
                        disabled={extracting === entry.id}
                        onClick={(e) => { e.stopPropagation(); startContinuation(entry, "sequel"); }}
                        className="pressable h-7 px-2.5 rounded-full bg-black/70 backdrop-blur-md border border-white/[0.12] text-[10px] font-semibold text-white/85 hover:bg-black/90 disabled:opacity-50">
                        Sequel ⏭
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <img src={entry.url} alt="" className="w-full aspect-video object-cover bg-black/40 group-hover:scale-[1.02] transition-transform duration-350 ease-apple" />
                    <div className="absolute bottom-2 right-2 hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button type="button"
                        title="Animar — usa esta imagem como frame inicial do vídeo, mantendo o tratamento"
                        onClick={(e) => { e.stopPropagation(); animateStill(entry); }}
                        className="pressable h-7 px-2.5 rounded-full bg-black/70 backdrop-blur-md border border-white/[0.12] text-[10px] font-semibold text-white/85 hover:bg-black/90">
                        ▶ Animar
                      </button>
                    </div>
                  </div>
                )}
                <div className="p-3.5">
                  <p className="text-white/65 text-[12px] line-clamp-2 leading-relaxed" title={entry.prompt}>{entry.prompt}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {typeof entry.cost === "number" && (
                      <span className={`text-[10px] font-semibold ${entry.cost === 0 ? "text-emerald-400/70" : "text-white/40"}`}
                        title={entry.cost === 0 ? "Cota gratuita do Google — sem custo" : "Custo real cobrado pelo provedor"}>
                        {entry.cost === 0 ? "grátis" : `$${entry.cost.toFixed(3)}`}
                      </span>
                    )}
                    {[...new Set([entry.resolved?.camera, entry.resolved?.lens, entry.resolved?.palette].filter(Boolean))].slice(0, 3).map((chip, ci) => (
                      <span key={`${ci}-${chip}`} className="text-[9px] font-medium text-white/50 px-1.5 py-0.5 bg-white/[0.06] rounded-full border border-white/[0.07] truncate max-w-[140px]">
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[50vh] animate-fade-in-up">
            <span className="text-white/50 font-medium text-sm sm:text-base tracking-normal mb-2">Direct with</span>
            <span className="text-white/95 font-semibold text-3xl sm:text-5xl tracking-tight pb-1">Cinema Studio</span>
            <p className="text-white/40 text-xs sm:text-sm font-medium text-center max-w-lg leading-relaxed px-4 mt-3">
              Genre, era, camera, glass, light and montage — every choice a real one from the working sets of cinema and advertising.
            </p>
          </div>
        )}
      </div>

      {lightboxIdx !== null && (
        <Lightbox items={history} index={Math.min(lightboxIdx, history.length - 1)} onClose={() => setLightboxIdx(null)} onNavigate={setLightboxIdx} onAdjust={adjustImage} />
      )}

      {/* ── PROMPT BAR ── */}
      <PromptComposer>
        <div className="flex flex-col gap-3 relative" ref={panelRef}>
          {/* Setup panels (popover above the bar) */}
          {openPanel && (
            <div className="absolute bottom-[calc(100%+12px)] left-0 right-0 z-50 bg-[#1d1d1f]/[0.98] backdrop-blur-3xl rounded-2xl border border-white/[0.1] shadow-[0_16px_48px_rgba(0,0,0,0.65),inset_0_0.5px_0_rgba(255,255,255,0.08)] p-4 max-h-[46vh] overflow-y-auto custom-scrollbar">
              {openPanel === "film" && (
                <>
                  <PickerSection label="Genre" category="genre" items={GENRES} value={setup.genre} onSelect={set("genre")} />
                  <PickerSection label="Era" category="era" items={ERAS} value={setup.era} onSelect={set("era")} />
                  {mode === "video" && (
                    <PickerSection label="Tempo" category="tempo" items={TEMPOS} value={setup.tempo} onSelect={set("tempo")} />
                  )}
                </>
              )}
              {openPanel === "camera" && (
                <>
                  <PickerSection label="Shot Size" category="shot" items={SHOT_SIZES} value={setup.shotSize} onSelect={set("shotSize")} />
                  <PickerSection label="Angle" category="angle" items={ANGLES} value={setup.angle} onSelect={set("angle")} />
                  <PickerSection label="Camera" category="cine-camera" items={cameraItems} value={setup.camera} onSelect={set("camera")} />
                  <PickerSection label="Lens" category="cine-lens" items={lensItems} value={setup.lens} onSelect={set("lens")} />
                  <PickerSection label="Aperture" category="aperture" items={APERTURES} value={setup.aperture} onSelect={set("aperture")} />
                  <PickerSection label={mediumItems[0]?.kind === "digital" ? "Color Science" : "Film Stock"} category="stock" items={mediumItems} value={setup.medium} onSelect={set("medium")} />
                </>
              )}
              {openPanel === "mood" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-white/85 text-[13px] font-semibold">Moodboard</span>
                    <span className="text-white/35 text-[11px]">as referências definem câmera, luz, paleta e época</span>
                  </div>
                  <input ref={moodInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { uploadMoodImages(e.target.files); e.target.value = ""; }} />
                  <div className="flex items-center gap-2 flex-wrap">
                    {moodImages.map((url) => (
                      <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/[0.1] group/ref">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button type="button"
                          onClick={() => setMoodImages((prev) => prev.filter((u) => u !== url))}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white/80 text-[10px] leading-none opacity-0 group-hover/ref:opacity-100">×</button>
                      </div>
                    ))}
                    {moodImages.length < 12 && (
                      <button type="button" onClick={() => moodInputRef.current?.click()} disabled={moodBusy}
                        className="w-16 h-16 rounded-lg border border-dashed border-white/[0.15] text-white/40 hover:text-white/70 hover:border-white/30 text-[11px] disabled:opacity-40">
                        + ref
                      </button>
                    )}
                  </div>
                  <input value={moodNote} onChange={(e) => setMoodNote(e.target.value)}
                    placeholder="opcional: o que te interessa nessas referências (ex.: a luz, não o assunto)"
                    className="w-full bg-[#212123] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-white/85 placeholder-white/25 outline-none focus:border-[#EF0328]/50" />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={readMoodboard} disabled={moodBusy || moodImages.length === 0}
                      className="pressable h-8 px-3 rounded-full bg-[#EF0328] text-white text-[12px] font-semibold disabled:opacity-40">
                      {moodBusy ? "Lendo…" : "✦ Ler moodboard"}
                    </button>
                    {moodReading && (
                      <button type="button" onClick={saveStyle}
                        className="pressable h-8 px-3 rounded-full border border-white/[0.1] bg-white/[0.05] text-white/75 text-[12px] font-semibold hover:text-white">
                        Salvar estilo
                      </button>
                    )}
                  </div>
                  {moodReading && (
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 flex flex-col gap-1">
                      <span className="text-white/90 text-[13px] font-semibold">{moodReading.name}</span>
                      {moodReading.reading && (
                        <span className="text-white/45 text-[11px] leading-relaxed">O que eu vi: {moodReading.reading}</span>
                      )}
                      {moodReading.signature && (
                        <span className="text-white/60 text-[11px] leading-relaxed">Assinatura: {moodReading.signature}</span>
                      )}
                      <span className="text-white/30 text-[10px]">Os painéis Film / Camera / Look já foram preenchidos — ajuste o que quiser.</span>
                    </div>
                  )}
                  {savedStyles.length > 0 && (
                    <div className="flex flex-col gap-1.5 pt-1 border-t border-white/[0.06]">
                      <span className="text-white/40 text-[11px]">Estilos salvos</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {savedStyles.map((st) => (
                          <span key={st.id} className="group/st inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-white/[0.1] bg-white/[0.04]">
                            <button type="button" onClick={() => applyStyle(st)}
                              className="text-[11px] font-semibold text-white/70 hover:text-white">{st.name}</button>
                            <button type="button" onClick={() => deleteStyle(st)} title="Excluir estilo"
                              className="w-4 h-4 rounded-full text-white/25 hover:text-red-400 text-[11px] leading-none">×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {openPanel === "look" && (
                <>
                  <PickerSection label="Color Palette" category="palette" items={PALETTES} value={setup.palette} onSelect={set("palette")} />
                  <PickerSection label="Lighting" category="lighting" items={LIGHTING} value={setup.lighting} onSelect={set("lighting")} />
                </>
              )}
              {openPanel === "movement" && (
                <>
                  <PickerSection label="Camera Movement" category="movement" items={MOVEMENTS} value={setup.movement} onSelect={set("movement")} />
                  <PickerSection label="VFX Event" category="effect" items={EFFECTS} value={setup.effect} onSelect={set("effect")} />
                </>
              )}
              {openPanel === "cast" && (
                <CastPanel cast={cast} apiKey={apiKey} onChanged={loadCast} />
              )}
            </div>
          )}

          {/* References row */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <input ref={refInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; uploadRefs(f); }} />
            {refs.map((url, i) => (
              <div key={url} className={`${PROMPT_MEDIA_PREVIEW_CLASS} border-2 border-[#EF0328]/70`}>
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button type="button"
                  onClick={() => setRefs((prev) => prev.filter((_, x) => x !== i))}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 text-[8px] border border-white/5">×</button>
              </div>
            ))}
            {refUploading.map((u) => (
              <div key={u} className={PROMPT_MEDIA_PREVIEW_CLASS}>
                <img src={u} alt="" className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
                </div>
              </div>
            ))}
            {/* Start frame — where the video begins (video mode) */}
            {caps.startFrame && startFrame && (
              <div className={`${PROMPT_MEDIA_PREVIEW_CLASS} border-2 border-[#30D158]/70`}>
                <img src={startFrame} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setStartFrame(null)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 text-[8px] border border-white/5">×</button>
                <span className="absolute bottom-0 inset-x-0 bg-[#30D158] text-black text-[7px] font-bold text-center leading-3 pointer-events-none">START</span>
              </div>
            )}
            {caps.startFrame && !startFrame && (
              <>
                <input ref={startFrameInputRef} type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files[0]; e.target.value = "";
                    if (!f) return;
                    try { setStartFrame(await uploadFile(apiKey, f)); } catch (err) { toast.error(err.message); }
                  }} />
                <button type="button" onClick={() => startFrameInputRef.current?.click()}
                  className="group/ref h-9 px-3 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.04] hover:bg-white/[0.07] transition-colors duration-150 active:scale-[0.97]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
                  <span className="text-[12px] font-medium text-white/60 group-hover/ref:text-white/85">Start frame</span>
                </button>
              </>
            )}
            {caps.endFrame && endFrame && (
              <div className={`${PROMPT_MEDIA_PREVIEW_CLASS} border-2 border-[#64D2FF]/70`}>
                <img src={endFrame} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setEndFrame(null)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 text-[8px] border border-white/5">×</button>
                <span className="absolute bottom-0 inset-x-0 bg-[#64D2FF] text-black text-[7px] font-bold text-center leading-3 pointer-events-none">END</span>
              </div>
            )}
            {caps.endFrame && !endFrame && (
              <>
                <input ref={endFrameInputRef} type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files[0]; e.target.value = "";
                    if (!f) return;
                    try { setEndFrame(await uploadFile(apiKey, f)); } catch (err) { toast.error(err.message); }
                  }} />
                <button type="button" onClick={() => endFrameInputRef.current?.click()}
                  className="group/ref h-9 px-3 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.04] hover:bg-white/[0.07] transition-colors duration-150 active:scale-[0.97]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#64D2FF]" />
                  <span className="text-[12px] font-medium text-white/60 group-hover/ref:text-white/85">End frame</span>
                </button>
              </>
            )}
            {caps.multiRef && refs.length < 9 && (
              <button type="button" onClick={() => refInputRef.current?.click()}
                className="group/ref h-9 px-3 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.04] hover:bg-white/[0.07] cursor-pointer transition-colors duration-150 active:scale-[0.97]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EF0328]" />
                <span className="text-[12px] font-medium text-white/60 group-hover/ref:text-white/85">Reference</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/30"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            )}
          </div>

          {/* Top row: mode + panels */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-white/[0.05] border border-white/[0.07] rounded-lg p-0.5 gap-0.5">
              {[["image", "Image"], ["video", "Video"]].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => set("mode")(value)}
                  className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-colors duration-150 ${
                    mode === value ? "bg-[#636366]/90 text-white shadow-sm" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="w-px h-5 bg-white/[0.08]" />
            <button
              type="button"
              onClick={() => setOpenPanel(openPanel === "mood" ? null : "mood")}
              className={promptControlClassName({ compact: true, active: openPanel === "mood" })}
              title="Moodboard — as referências definem o estilo"
            >
              <span className="text-xs font-semibold">Mood</span>
              {moodImages.length > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-[#EF0328] text-white text-[9px] font-bold flex items-center justify-center">
                  {moodImages.length}
                </span>
              )}
            </button>
            {panelButton("film", "Film", ["genre", "era", "tempo"])}
            {panelButton("camera", "Camera", ["camera", "lens", "aperture", "medium", "shotSize", "angle"])}
            {panelButton("look", "Look", ["palette", "lighting"])}
            {mode === "video" && panelButton("movement", "Movement", ["movement", "effect"])}
            <button
              type="button"
              onClick={() => setOpenPanel(openPanel === "cast" ? null : "cast")}
              className={promptControlClassName({ compact: true, active: openPanel === "cast" })}
            >
              <span className="text-xs font-semibold">Cast</span>
              {mentionedCast.length > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-[#30D158] text-black text-[9px] font-bold flex items-center justify-center">
                  {mentionedCast.length}
                </span>
              )}
            </button>
            <div className="w-px h-5 bg-white/[0.08]" />
            <button
              type="button"
              onClick={toggleEnhance}
              title={enhanceOn ? "Director's enhance ativo — cena + tratamento fundidos por IA" : "Ativar director's enhance"}
              aria-pressed={enhanceOn}
              className={`pressable h-[34px] w-[34px] flex items-center justify-center rounded-lg border text-[14px] ${
                enhanceOn
                  ? "text-[#FF2447] bg-[#EF0328]/15 border-[#EF0328]/30"
                  : "text-white/40 bg-white/[0.04] border-white/[0.06] hover:text-white/70"
              }`}
            >✦</button>
          </div>

          {/* Single | Multi-shot — video-mode découpage selector */}
          {mode === "video" && (
            <div className="flex items-center gap-1.5 -mb-1">
              {["single", "multi"].map((m) => (
                <button key={m} type="button"
                  onClick={() => {
                    setShotMode(m);
                    if (m === "multi" && cuts.length === 0) {
                      setCuts([
                        makeCut({ secs: Math.max(1, Math.floor(duration / 2)) }),
                        makeCut({ secs: Math.max(1, Math.ceil(duration / 2)) }),
                      ]);
                    }
                  }}
                  className={`pressable h-7 px-2.5 rounded-full border text-[11px] font-semibold transition-colors duration-150 ${
                    shotMode === m
                      ? "text-white bg-[#EF0328] border-[#EF0328]"
                      : "text-white/45 bg-white/[0.04] border-white/[0.06] hover:text-white/70"
                  }`}>
                  {m === "single" ? "Single shot" : "Multi-shot"}
                </button>
              ))}
            </div>
          )}

          {/* Prompt — @Name mentions resolve to saved cast, @imgN to refs */}
          <PromptMentionTextarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            mentions={promptMentions}
            placeholder={mode === "video" && shotMode === "multi"
              ? "Escreva a cena em prosa — ✦ Decupar propõe os cortes (ou monte os cards à mão)…"
              : "Describe your scene — the system directs the rest…"}
          />

          {/* Multi-shot: cut cards + live arithmetic + audits */}
          {mode === "video" && shotMode === "multi" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <button type="button" onClick={autoDecoupage} disabled={decoupaging}
                  className="pressable h-7 px-2.5 rounded-full border text-[11px] font-semibold text-[#FF2447] bg-[#EF0328]/15 border-[#EF0328]/30 disabled:opacity-50">
                  {decoupaging ? "Decupando…" : "✦ Decupar"}
                </button>
                <span className="text-[10px] text-white/35">1-2 beats por 5s · hold mais longo no money moment · duplo contraste entre cortes</span>
              </div>
              {/* Capped stack: many cuts scroll INSIDE the composer instead of
                  growing it over the gallery. */}
              <div className="flex flex-col gap-1.5 max-h-[30vh] overflow-y-auto overscroll-contain pr-0.5">
              {cuts.map((cut, i) => (
                <div key={cut.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold tracking-wide text-white/50 w-12 shrink-0">CUT {i + 1}</span>
                    <select value={cut.size} onChange={(e) => updateCut(cut.id, { size: e.target.value })}
                      className="h-6 rounded-md bg-[#212123] border border-white/[0.08] text-[10px] text-white/70 px-1 max-w-[130px]">
                      <option value="auto">Tamanho: auto</option>
                      {SHOT_SIZES.map((sz) => <option key={sz.id} value={sz.id}>{sz.name}</option>)}
                    </select>
                    <select value={cut.move} onChange={(e) => updateCut(cut.id, { move: e.target.value })}
                      className="h-6 rounded-md bg-[#212123] border border-white/[0.08] text-[10px] text-white/70 px-1 max-w-[150px]">
                      <option value="auto">Movimento: auto</option>
                      {MOVEMENTS.map((mv) => <option key={mv.id} value={mv.id}>{mv.name}</option>)}
                    </select>
                    <div className="flex items-center gap-0.5 ml-auto">
                      <input type="number" min={1} max={duration} value={cut.secs}
                        onChange={(e) => updateCut(cut.id, { secs: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="w-11 h-6 rounded-md bg-[#212123] border border-white/[0.08] text-[11px] text-white/80 text-center" />
                      <span className="text-[10px] text-white/40">s</span>
                      <button type="button" onClick={() => removeCut(cut.id)} title="Remover corte"
                        className="pressable w-6 h-6 ml-1 rounded-md text-white/35 hover:text-white/80 hover:bg-white/[0.06] text-[12px]">×</button>
                    </div>
                  </div>
                  <input value={cut.action} onChange={(e) => updateCut(cut.id, { action: e.target.value })}
                    placeholder="ação em uma linha — o que acontece neste corte"
                    className="w-full bg-transparent text-[13px] text-white/85 placeholder-white/25 outline-none" />
                </div>
              ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => setCuts((prev) => [...prev, makeCut({ secs: Math.max(1, duration - cutsTotal(prev)) || 3 })])}
                  className="pressable h-7 px-2.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold text-white/60 hover:text-white/85">
                  + Cut
                </button>
                {(() => {
                  const total = cutsTotal(cuts);
                  const ok = total === duration;
                  return (
                    <span className={`text-[11px] font-semibold ${ok ? "text-white/55" : "text-amber-400"}`}>
                      {total}s / {duration}s {ok ? "✓" : "— a soma precisa fechar com o clipe"}
                    </span>
                  );
                })()}
              </div>
              {(() => {
                const filled = cuts.filter((c) => c.action.trim());
                const warns = [monotonyAudit(filled), contrastAudit(filled)].filter(Boolean);
                return warns.length ? (
                  <div className="flex flex-col gap-0.5">
                    {warns.map((w, i) => <span key={i} className="text-[10px] text-amber-400/90">{w}</span>)}
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Resolved preview */}
          {resolvedChips.length > 0 && prompt.trim() && (
            <div className="flex items-center gap-1.5 flex-wrap -mt-1">
              <span className="text-[10px] text-white/30">→</span>
              {resolvedChips.slice(0, 6).map((chip, i) => (
                <span key={`${i}-${chip}`} className="text-[10px] text-white/45 px-1.5 py-0.5 bg-white/[0.04] rounded-full border border-white/[0.06]">
                  {chip}
                </span>
              ))}
              <button type="button" onClick={saveStylePrefix}
                title="Usar este look como prefixo de estilo de uma produção"
                className="pressable text-[10px] text-white/50 hover:text-white/85 px-1.5 py-0.5 bg-white/[0.04] rounded-full border border-white/[0.06]">
                → prefixo da produção
              </button>
            </div>
          )}

          {/* Footer */}
          <PromptFooter>
            <PromptControls>
              {/* Model — list */}
              <div className="relative">
                <button type="button"
                  onClick={() => setOpenList(openList === "model" ? null : "model")}
                  className={promptControlClassName({ compact: true, active: openList === "model" })}
                  title="Generation model">
                  <span className="text-xs font-semibold">{models[mode].find((m) => m.id === modelId)?.name}</span>
                  <PromptChevronIcon />
                </button>
                {openList === "model" && (
                  <PromptPopover className="min-w-[300px] max-h-[52vh]">
                    <input
                      type="text"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="Search models…"
                      autoFocus
                      className="w-full mb-2 bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-[#EF0328]/40"
                    />
                    {!modelSearch && (
                      <div className="flex items-center bg-white/[0.05] border border-white/[0.07] rounded-lg p-0.5 gap-0.5 mb-2">
                        {[["fav", "Favoritos"], ["all", "Todos"]].map(([value, label]) => (
                          <button key={value} type="button" onClick={() => setModelTab(value)}
                            className={`flex-1 px-3 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 ${
                              modelTab === value ? "bg-[#636366]/90 text-white shadow-sm" : "text-white/50 hover:text-white/80"
                            }`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    {!modelSearch && modelTab === "fav" && (
                      <PromptMenuList>
                        {CINEMA_FAVORITES[mode]
                          .map((id) => models[mode].find((m) => m.id === id))
                          .filter(Boolean)
                          .map((m) => (
                            <PromptMenuItem key={m.id} selected={modelId === m.id}
                              onClick={() => { setModelId(m.id); setOpenList(null); setModelSearch(""); }}>
                              <span className="flex items-center gap-2">
                                {(m.logoUrl || PROVIDER_LOGOS[m.provider]) && (
                                  <img src={m.logoUrl || PROVIDER_LOGOS[m.provider]} alt="" className={`w-3.5 h-3.5 object-contain ${!m.logoUrl && INVERT_LOGOS.includes(m.provider) ? "invert" : ""}`} />
                                )}
                                {m.name}
                              </span>
                            </PromptMenuItem>
                          ))}
                      </PromptMenuList>
                    )}
                    {(modelSearch || modelTab === "all") && groupByProvider(
                      models[mode].filter((m) => !modelSearch ||
                        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                        (m.provider_name || "").toLowerCase().includes(modelSearch.toLowerCase())),
                    ).map((group) => (
                      <div key={group.name} className="mb-2 last:mb-0">
                        <div className="flex items-center gap-2 px-1 pb-1.5 pt-1 border-b border-white/[0.05] mb-1">
                          {group.logo && (
                            <img src={group.logo} alt="" className={`w-4 h-4 object-contain ${group.invert ? "invert" : ""}`} />
                          )}
                          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">{group.name}</span>
                        </div>
                        <PromptMenuList>
                          {group.items.map((m) => (
                            <PromptMenuItem key={m.id} selected={modelId === m.id}
                              onClick={() => { setModelId(m.id); setOpenList(null); setModelSearch(""); }}>
                              {m.name}
                            </PromptMenuItem>
                          ))}
                        </PromptMenuList>
                      </div>
                    ))}
                  </PromptPopover>
                )}
              </div>
              {/* Aspect — list */}
              <div className="relative">
                <button type="button"
                  onClick={() => setOpenList(openList === "aspect" ? null : "aspect")}
                  className={promptControlClassName({ compact: true, active: openList === "aspect" })}
                  title="Aspect ratio">
                  <span className="text-xs font-semibold tabular-nums">{aspect}</span>
                  <PromptChevronIcon />
                </button>
                {openList === "aspect" && (
                  <PromptPopover>
                    <PromptMenuList>
                      {caps.aspects.map((a) => (
                        <PromptMenuItem key={a} selected={aspect === a}
                          onClick={() => { setAspect(a); setOpenList(null); }}>
                          {a}
                        </PromptMenuItem>
                      ))}
                    </PromptMenuList>
                  </PromptPopover>
                )}
              </div>
              {/* Image mode: quality tier + variations per Direct */}
              {mode === "image" && (
                <>
                  <div className="relative">
                    <button type="button"
                      onClick={() => setOpenList(openList === "imgQuality" ? null : "imgQuality")}
                      className={promptControlClassName({ compact: true, active: openList === "imgQuality" })}
                      title="Resolução da imagem">
                      <span className="text-xs font-semibold uppercase tabular-nums">{imageTier}</span>
                      <PromptChevronIcon />
                    </button>
                    {openList === "imgQuality" && (
                      <PromptPopover>
                        <PromptMenuList>
                          {["1k", "2k", "4k"].map((t) => (
                            <PromptMenuItem key={t} selected={imageTier === t}
                              onClick={() => { setImageTier(t); setOpenList(null); }}>
                              {t.toUpperCase()}
                            </PromptMenuItem>
                          ))}
                        </PromptMenuList>
                      </PromptPopover>
                    )}
                  </div>
                  <div className="relative">
                    <button type="button"
                      onClick={() => setOpenList(openList === "variations" ? null : "variations")}
                      className={promptControlClassName({ compact: true, active: openList === "variations" })}
                      title="Quantas variações por geração">
                      <span className="text-xs font-semibold tabular-nums">{variations}×</span>
                      <PromptChevronIcon />
                    </button>
                    {openList === "variations" && (
                      <PromptPopover>
                        <PromptMenuList>
                          {[1, 2, 3, 4].map((n) => (
                            <PromptMenuItem key={n} selected={variations === n}
                              onClick={() => { setVariations(n); setOpenList(null); }}>
                              {n} {n === 1 ? "imagem" : "variações"}
                            </PromptMenuItem>
                          ))}
                        </PromptMenuList>
                      </PromptPopover>
                    )}
                  </div>
                </>
              )}

              {/* Seed — random by default; lock one to iterate variations of
                  the same frame instead of restarting each click */}
              <div className="relative">
                <button type="button"
                  onClick={() => setOpenList(openList === "seed" ? null : "seed")}
                  className={promptControlClassName({ compact: true, active: openList === "seed" || seed !== null })}
                  title={seed !== null ? `Seed fixa: ${seed}` : "Seed aleatória a cada geração"}>
                  <span className="text-xs font-semibold tabular-nums">{seed !== null ? String(seed).slice(0, 7) : "Seed"}</span>
                  <PromptChevronIcon />
                </button>
                {openList === "seed" && (
                  <PromptPopover className="min-w-[210px]">
                    <PromptMenuList>
                      <PromptMenuItem selected={seed === null}
                        onClick={() => { setSeed(null); setOpenList(null); }}>
                        Aleatória a cada geração
                      </PromptMenuItem>
                      {lastSeed !== null && (
                        <PromptMenuItem selected={seed === lastSeed}
                          onClick={() => { setSeed(lastSeed); setOpenList(null); }}>
                          Fixar a última ({lastSeed})
                        </PromptMenuItem>
                      )}
                    </PromptMenuList>
                    <input
                      type="number"
                      value={seed ?? ""}
                      onChange={(e) => setSeed(e.target.value === "" ? null : Math.abs(parseInt(e.target.value, 10) || 0))}
                      placeholder="Seed manual…"
                      className="w-full mt-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] tabular-nums text-white placeholder:text-white/25 outline-none focus:border-[#EF0328]/60"
                    />
                  </PromptPopover>
                )}
              </div>

              {/* Audio — discreet switch (only when the model generates sound) */}
              {caps.audio && (
                <button type="button" onClick={toggleAudio}
                  title={audioOn ? "Som ativado" : "Sem som"} aria-pressed={audioOn}
                  className="pressable h-[38px] px-2.5 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.07]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={audioOn ? "text-white/80" : "text-white/35"}>
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    {audioOn ? <path d="M15.5 8.5a5 5 0 010 7" /> : <path d="M22 9l-6 6M16 9l6 6" />}
                  </svg>
                  <span className={`relative w-7 h-[16px] rounded-full transition-colors duration-150 ${audioOn ? "bg-[#30D158]" : "bg-white/15"}`}>
                    <span className={`absolute top-[2px] w-3 h-3 rounded-full bg-white shadow transition-[left] duration-150 ease-apple ${audioOn ? "left-[14px]" : "left-[2px]"}`} />
                  </span>
                </button>
              )}
              {/* Bitrate — discreet switch (models with high/standard bitrate) */}
              {caps.bitrate && (
                <button type="button" onClick={() => setHighBitrate((v) => !v)}
                  title={highBitrate ? "Bitrate alto" : "Bitrate padrão"} aria-pressed={highBitrate}
                  className="pressable h-[34px] px-2 flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.04]">
                  <span className={`text-[10px] font-bold tracking-wide ${highBitrate ? "text-white/85" : "text-white/35"}`}>HB</span>
                  <span className={`relative w-7 h-[16px] rounded-full transition-colors duration-150 ${highBitrate ? "bg-[#30D158]" : "bg-white/15"}`}>
                    <span className={`absolute top-[2px] w-3 h-3 rounded-full bg-white shadow transition-[left] duration-150 ease-apple ${highBitrate ? "left-[14px]" : "left-[2px]"}`} />
                  </span>
                </button>
              )}
              {/* Quality — list (video); catalog field may be resolution or quality */}
              {caps.qualityAxis && (
                <div className="relative">
                  <button type="button"
                    onClick={() => setOpenList(openList === "quality" ? null : "quality")}
                    className={promptControlClassName({ compact: true, active: openList === "quality" })}
                    title="Video quality">
                    <span className="text-xs font-semibold tabular-nums">{resolution}</span>
                    <PromptChevronIcon />
                  </button>
                  {openList === "quality" && (
                    <PromptPopover>
                      <PromptMenuList>
                        {caps.qualityAxis.options.map((r) => (
                          <PromptMenuItem key={r} selected={resolution === r}
                            onClick={() => { setResolution(r); setOpenList(null); }}>
                            {r}
                          </PromptMenuItem>
                        ))}
                      </PromptMenuList>
                    </PromptPopover>
                  )}
                </div>
              )}
              {/* Duration — list (video) */}
              {mode === "video" && (
                <div className="relative">
                  <button type="button"
                    onClick={() => setOpenList(openList === "duration" ? null : "duration")}
                    className={promptControlClassName({ compact: true, active: openList === "duration" })}
                    title="Duration">
                    <span className="text-xs font-semibold tabular-nums">{duration}s</span>
                    <PromptChevronIcon />
                  </button>
                  {openList === "duration" && (
                    <PromptPopover>
                      <PromptMenuList>
                        {caps.durations.map((d) => (
                          <PromptMenuItem key={d} selected={duration === d}
                            onClick={() => { setDuration(d); setOpenList(null); }}>
                            {d}s
                          </PromptMenuItem>
                        ))}
                      </PromptMenuList>
                    </PromptPopover>
                  )}
                </div>
              )}
            </PromptControls>
            {/* Never disabled while rendering — jobs run in parallel. The
                badge shows how many are in flight. */}
            <PromptAction onClick={handleGenerate}>
              <>Direct ✦{jobs.length > 0 && (
                <span className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-black/25 text-[10px] font-bold inline-flex items-center justify-center tabular-nums">
                  {jobs.length}
                </span>
              )}</>
            </PromptAction>
          </PromptFooter>
        </div>
      </PromptComposer>
    </div>
  );
}
