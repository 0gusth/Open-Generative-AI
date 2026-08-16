"use client";

// Cinema Studio — the flagship. Image AND video generation directed through
// the cinematography system: Film Setup (genre/era/tempo), Camera Setup
// (body/lens/aperture/medium), Look (palette/lighting) and Movement, all
// compiled by cinema/compiler.js with genre-fills-Auto semantics. Every
// catalog option shows its self-generated thumbnail.

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import { generateImage, generateVideo, generateI2V, uploadFile } from "../muapi.js";
import { cinemaFusePrompt } from "../providers.js";
import { compileCinematography } from "../cinema/compiler.js";
import { t2iModels, t2vModels, i2vModels, getMaxImagesForI2VModel } from "../models.js";
import { PROVIDER_LOGOS, INVERT_LOGOS } from "../providerLogos.js";
import { CINEMA_CAMERAS, PHOTO_CAMERAS, CINE_LENSES, PHOTO_LENSES, APERTURES, mediaForCamera } from "../cinema/gear.js";
import { GENRES, ERAS, TEMPOS } from "../cinema/filmSetup.js";
import { PALETTES } from "../cinema/palettes.js";
import { LIGHTING } from "../cinema/lighting.js";
import { MOVEMENTS } from "../cinema/movement.js";
import {
  PromptComposer,
  PromptTextarea,
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
import Lightbox from "./Lightbox.jsx";
import { formatErrorMessage } from "../utils/formatError.js";

const SETUP_KEY = "cinema_setup_v2";
const HISTORY_KEY = "cinema_history_v2";

// Full model catalogs — same choice as Image and Video Studios.
const MODELS = { image: t2iModels, video: t2vModels };
const DEFAULT_MODEL = { image: "nano-banana-2", video: "kling-v3.0-standard-text-to-video" };

// Heuristic i2v sibling for reference-driven video, verified fallback last.
function i2vSibling(t2vId) {
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
function modelResolutions(m) {
  const r = m?.inputs?.resolution;
  return Array.isArray(r?.enum) && r.enum.length ? r.enum : null;
}
function modelSupportsAudio(m) {
  return !!(m?.inputs?.generate_audio || m?.inputs?.audio);
}

// Group a model list by provider for the picker.
function groupByProvider(models) {
  const groups = new Map();
  for (const m of models) {
    const key = m.provider_name || "Other";
    if (!groups.has(key)) groups.set(key, { name: key, logo: PROVIDER_LOGOS[m.provider], invert: INVERT_LOGOS.includes(m.provider), items: [] });
    groups.get(key).items.push(m);
  }
  return [...groups.values()];
}

const DEFAULT_SETUP = {
  mode: "image",
  genre: "auto", era: "auto", tempo: "auto",
  camera: "auto", lens: "auto", aperture: "auto", medium: "auto",
  palette: "auto", lighting: "auto", movement: "auto",
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
  const [startFrame, setStartFrame] = useState(null);
  const [endFrame, setEndFrame] = useState(null);
  const startFrameInputRef = useRef(null);
  const endFrameInputRef = useRef(null);
  const [openPanel, setOpenPanel] = useState(null); // "film" | "camera" | "look" | "movement"
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
  });
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const panelRef = useRef(null);
  // References (up to 9 — Seedance-class ceiling)
  const [refs, setRefs] = useState([]);
  const [refUploading, setRefUploading] = useState([]);
  const refInputRef = useRef(null);
  // Director's enhance — fuses scene + treatment via LLM (sticky)
  const [enhanceOn, setEnhanceOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("cinema_enhance_on") !== "0";
  });
  const toggleEnhance = () => setEnhanceOn((v) => {
    const next = !v;
    try { window.localStorage.setItem("cinema_enhance_on", next ? "1" : "0"); } catch {}
    return next;
  });
  // Open list popovers: "model" | "aspect" | "duration" | "quality" | null
  const [openList, setOpenList] = useState(null);
  const [modelSearch, setModelSearch] = useState("");

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

  // model list follows mode
  useEffect(() => {
    if (!MODELS[mode].some((m) => m.id === modelId)) setModelId(DEFAULT_MODEL[mode]);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const modelObj = useMemo(() => MODELS[mode].find((m) => m.id === modelId) || null, [mode, modelId]);
  const caps = useMemo(() => {
    const sib = mode === "video" ? i2vModels.find((m) => m.id === i2vSibling(modelId)) : null;
    return {
      aspects: modelAspects(modelObj),
      durations: modelDurations(modelObj),
      resolutions: mode === "video" ? modelResolutions(modelObj) : null,
      audio: mode === "video" && modelSupportsAudio(modelObj),
      startFrame: mode === "video" && !!sib,
      endFrame: mode === "video" && !!sib?.lastImageField,
      multiRef: mode === "video" ? !!omniSibling(modelId) : true,
      omni: mode === "video" ? omniSibling(modelId) : null,
    };
  }, [modelObj, mode, modelId]);

  // keep selections valid when the model changes
  useEffect(() => {
    if (!caps.aspects.includes(aspect)) setAspect(caps.aspects[0]);
    if (mode === "video" && !caps.durations.includes(duration)) setDuration(caps.durations[0]);
    if (caps.resolutions && !caps.resolutions.includes(resolution)) setResolution(caps.resolutions.includes("720p") ? "720p" : caps.resolutions[0]);
    if (!caps.endFrame) setEndFrame(null);
    if (!caps.startFrame) setStartFrame(null);
  }, [caps]); // eslint-disable-line react-hooks/exhaustive-deps

  const compiled = useMemo(
    () => compileCinematography({ ...setup, prompt }),
    [setup, prompt],
  );

  // count of non-auto choices per panel (for button badges)
  const activeCount = (keys) => keys.filter((k) => setup[k] && setup[k] !== "auto").length;

  const handleGenerate = async () => {
    if (generating) return;
    if (!prompt.trim()) { toast.error("Describe your scene first."); return; }
    onGenerationStart?.();
    setGenerating(true);
    try {
      let finalPrompt = compiled.prompt;
      if (enhanceOn) {
        finalPrompt = await cinemaFusePrompt(compiled.prompt, mode);
      }
      let res;
      if (mode === "image") {
        const params = { model: modelId, prompt: finalPrompt, aspect_ratio: aspect };
        if (refs.length) params.images_list = refs;
        res = await generateImage(apiKey, params);
      } else if (startFrame || refs.length || endFrame) {
        const allImages = [startFrame, ...refs].filter(Boolean);
        const useOmni = refs.length > 0 && caps.omni;
        const params = {
          model: useOmni ? caps.omni.id : i2vSibling(modelId),
          image_url: allImages[0] || endFrame,
          prompt: finalPrompt,
          aspect_ratio: aspect,
          duration,
          __audio: audioOn,
          generate_audio: audioOn,
        };
        if (allImages.length > 1) params.images_list = allImages;
        if (caps.resolutions) params.resolution = resolution;
        if (endFrame) params.last_image = endFrame;
        res = await generateI2V(apiKey, params);
      } else {
        const params = { model: modelId, prompt: finalPrompt, aspect_ratio: aspect, duration, __audio: audioOn, generate_audio: audioOn };
        if (caps.resolutions) params.resolution = resolution;
        res = await generateVideo(apiKey, params);
      }
      if (!res?.url) throw new Error("No result returned");
      const entry = {
        id: res.id || Math.random().toString(36).slice(2),
        url: res.url,
        type: mode,
        prompt: finalPrompt,
        model: modelId,
        resolved: compiled.resolved,
        aspect_ratio: aspect,
        timestamp: new Date().toISOString(),
      };
      setHistory((prev) => [entry, ...prev]);
      onGenerationComplete?.({ url: res.url, model: modelId, prompt: finalPrompt, type: mode });
    } catch (e) {
      const msg = formatErrorMessage(e, "Cinema generation failed");
      if (onGenerationError) onGenerationError(msg); else toast.error(msg);
    } finally {
      setGenerating(false);
      onGenerationEnd?.();
    }
  };

  // Sequel: last frame becomes the START reference of the next clip.
  // Prequel: first frame becomes the END frame the new clip must land on.
  const [extracting, setExtracting] = useState(null); // entry id while working
  const startContinuation = async (entry, direction /* "sequel" | "prequel" */) => {
    if (extracting) return;
    setExtracting(entry.id);
    const toastId = toast.loading(direction === "sequel" ? "Extraindo último frame…" : "Extraindo primeiro frame…");
    try {
      const file = await extractVideoFrame(entry.url, direction === "sequel" ? "last" : "first");
      const url = await uploadFile(apiKey, file);
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
    return [r.camera, r.lens, r.medium, r.aperture, r.palette, r.lighting, mode === "video" ? r.movement : null, mode === "video" ? r.tempo : null]
      .filter(Boolean);
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
            {generating && (
              <div
                className="relative rounded-2xl overflow-hidden border border-white/[0.07] bg-[#171719] animate-fade-in-up"
                style={{ aspectRatio: aspect === "9:16" ? "9/16" : "16/9" }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-white/[0.05] animate-pulse" style={{ filter: "blur(24px)" }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/70 animate-spin" />
                  <span className="text-[13px] font-medium text-white/60">Directing…</span>
                </div>
              </div>
            )}
            {history.map((entry, idx) => (
              <div
                key={entry.id}
                onClick={() => setLightboxIdx(idx)}
                className="relative group rounded-2xl overflow-hidden border border-white/[0.08] bg-[#171719] shadow-[0_2px_12px_rgba(0,0,0,0.25)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.45)] hover:border-white/[0.16] hover:-translate-y-0.5 transition-[transform,box-shadow,border-color] duration-250 ease-apple cursor-pointer"
              >
                {entry.type === "video" ? (
                  <div className="relative">
                    <video src={entry.url} muted loop playsInline
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
                  <img src={entry.url} alt="" className="w-full aspect-video object-cover bg-black/40 group-hover:scale-[1.02] transition-transform duration-350 ease-apple" />
                )}
                <div className="p-3.5">
                  <p className="text-white/65 text-[12px] line-clamp-2 leading-relaxed" title={entry.prompt}>{entry.prompt}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {[entry.resolved?.camera, entry.resolved?.lens, entry.resolved?.palette].filter(Boolean).slice(0, 3).map((chip) => (
                      <span key={chip} className="text-[9px] font-medium text-white/50 px-1.5 py-0.5 bg-white/[0.06] rounded-full border border-white/[0.07] truncate max-w-[140px]">
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
        <Lightbox items={history} index={Math.min(lightboxIdx, history.length - 1)} onClose={() => setLightboxIdx(null)} onNavigate={setLightboxIdx} />
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
                  <PickerSection label="Camera" category="cine-camera" items={cameraItems} value={setup.camera} onSelect={set("camera")} />
                  <PickerSection label="Lens" category="cine-lens" items={lensItems} value={setup.lens} onSelect={set("lens")} />
                  <PickerSection label="Aperture" category="aperture" items={APERTURES} value={setup.aperture} onSelect={set("aperture")} />
                  <PickerSection label={mediumItems[0]?.kind === "digital" ? "Color Science" : "Film Stock"} category="stock" items={mediumItems} value={setup.medium} onSelect={set("medium")} />
                </>
              )}
              {openPanel === "look" && (
                <>
                  <PickerSection label="Color Palette" category="palette" items={PALETTES} value={setup.palette} onSelect={set("palette")} />
                  <PickerSection label="Lighting" category="lighting" items={LIGHTING} value={setup.lighting} onSelect={set("lighting")} />
                </>
              )}
              {openPanel === "movement" && (
                <PickerSection label="Camera Movement" category="movement" items={MOVEMENTS} value={setup.movement} onSelect={set("movement")} />
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
            {panelButton("film", "Film", ["genre", "era", "tempo"])}
            {panelButton("camera", "Camera", ["camera", "lens", "aperture", "medium"])}
            {panelButton("look", "Look", ["palette", "lighting"])}
            {mode === "video" && panelButton("movement", "Movement", ["movement"])}
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

          {/* Prompt */}
          <PromptTextarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your scene — the system directs the rest…"
          />

          {/* Resolved preview */}
          {resolvedChips.length > 0 && prompt.trim() && (
            <div className="flex items-center gap-1.5 flex-wrap -mt-1">
              <span className="text-[10px] text-white/30">→</span>
              {resolvedChips.slice(0, 6).map((chip) => (
                <span key={chip} className="text-[10px] text-white/45 px-1.5 py-0.5 bg-white/[0.04] rounded-full border border-white/[0.06]">
                  {chip}
                </span>
              ))}
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
                  <span className="text-xs font-semibold">{MODELS[mode].find((m) => m.id === modelId)?.name}</span>
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
                    {groupByProvider(
                      MODELS[mode].filter((m) => !modelSearch ||
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
              {/* Quality — list (video) */}
              {caps.resolutions && (
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
                        {caps.resolutions.map((r) => (
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
            <PromptAction onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <><span className="animate-spin inline-block">◌</span> Directing…</>
              ) : (
                <>Direct ✦</>
              )}
            </PromptAction>
          </PromptFooter>
        </div>
      </PromptComposer>
    </div>
  );
}
