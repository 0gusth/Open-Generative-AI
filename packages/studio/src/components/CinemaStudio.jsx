"use client";

// Cinema Studio — the flagship. Image AND video generation directed through
// the cinematography system: Film Setup (genre/era/tempo), Camera Setup
// (body/lens/aperture/medium), Look (palette/lighting) and Movement, all
// compiled by cinema/compiler.js with genre-fills-Auto semantics. Every
// catalog option shows its self-generated thumbnail.

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import { generateImage, generateVideo } from "../muapi.js";
import { compileCinematography } from "../cinema/compiler.js";
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
  promptControlClassName,
} from "./prompt/PromptComposer.jsx";
import Lightbox from "./Lightbox.jsx";
import { formatErrorMessage } from "../utils/formatError.js";

const SETUP_KEY = "cinema_setup_v2";
const HISTORY_KEY = "cinema_history_v2";

const MODELS = {
  image: [
    { id: "nano-banana-2", name: "Nano Banana 2" },
    { id: "seedream-5.0", name: "Seedream 5.0" },
    { id: "flux-dev", name: "Flux Dev" },
  ],
  video: [
    { id: "kling-v3.0-standard-text-to-video", name: "Kling 3.0" },
    { id: "seedance-v2.0-t2v", name: "Seedance 2.0" },
    { id: "kling-v2.5-turbo-pro-t2v", name: "Kling 2.5 Turbo" },
  ],
};

const ASPECTS = ["16:9", "9:16", "1:1", "21:9"];
const DURATIONS = [5, 10];

const DEFAULT_SETUP = {
  mode: "image",
  genre: "auto", era: "auto", tempo: "auto",
  camera: "auto", lens: "auto", aperture: "auto", medium: "auto",
  palette: "auto", lighting: "auto", movement: "auto",
};

const thumb = (category, id) => `/cinema-thumbs/${category}-${id}.webp`;

// ── Option card ─────────────────────────────────────────────────────────────

function OptionCard({ label, image, selected, onClick, auto }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/opt shrink-0 w-[96px] flex flex-col gap-1.5 rounded-xl p-1 text-left transition-[transform,box-shadow] duration-150 active:scale-[0.97] ${
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
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
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

export default function CinemaStudio({ apiKey, onGenerationStart, onGenerationEnd, onGenerationComplete, onGenerationError }) {
  const [setup, setSetup] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SETUP;
    try { return { ...DEFAULT_SETUP, ...JSON.parse(localStorage.getItem(SETUP_KEY) || "{}") }; }
    catch { return DEFAULT_SETUP; }
  });
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(MODELS.image[0].id);
  const [aspect, setAspect] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const [openPanel, setOpenPanel] = useState(null); // "film" | "camera" | "look" | "movement"
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
  });
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const panelRef = useRef(null);

  const mode = setup.mode;

  useEffect(() => {
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch {}
  }, [setup]);
  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 60))); } catch {}
  }, [history]);

  // model list follows mode
  useEffect(() => {
    if (!MODELS[mode].some((m) => m.id === modelId)) setModelId(MODELS[mode][0].id);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // close panel on outside click / Esc
  useEffect(() => {
    if (!openPanel) return;
    const onDown = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpenPanel(null); };
    const onKey = (e) => { if (e.key === "Escape") setOpenPanel(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [openPanel]);

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
      let res;
      if (mode === "image") {
        res = await generateImage(apiKey, { model: modelId, prompt: compiled.prompt, aspect_ratio: aspect });
      } else {
        res = await generateVideo(apiKey, { model: modelId, prompt: compiled.prompt, aspect_ratio: aspect, duration, __audio: true });
      }
      if (!res?.url) throw new Error("No result returned");
      const entry = {
        id: res.id || Math.random().toString(36).slice(2),
        url: res.url,
        type: mode,
        prompt: compiled.prompt,
        model: modelId,
        resolved: compiled.resolved,
        aspect_ratio: aspect,
        timestamp: new Date().toISOString(),
      };
      setHistory((prev) => [entry, ...prev]);
      onGenerationComplete?.({ url: res.url, model: modelId, prompt: compiled.prompt, type: mode });
    } catch (e) {
      const msg = formatErrorMessage(e, "Cinema generation failed");
      if (onGenerationError) onGenerationError(msg); else toast.error(msg);
    } finally {
      setGenerating(false);
      onGenerationEnd?.();
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
                  <video src={entry.url} muted loop playsInline
                    onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                    className="w-full aspect-video object-cover bg-black/40" />
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
              <button
                type="button"
                onClick={() => {
                  const list = MODELS[mode];
                  const i = list.findIndex((m) => m.id === modelId);
                  setModelId(list[(i + 1) % list.length].id);
                }}
                className={promptControlClassName({ compact: true })}
                title="Generation model"
              >
                <span className="text-xs font-semibold">{MODELS[mode].find((m) => m.id === modelId)?.name}</span>
              </button>
              <button
                type="button"
                onClick={() => setAspect(ASPECTS[(ASPECTS.indexOf(aspect) + 1) % ASPECTS.length])}
                className={promptControlClassName({ compact: true })}
                title="Aspect ratio"
              >
                <span className="text-xs font-semibold tabular-nums">{aspect}</span>
              </button>
              {mode === "video" && (
                <button
                  type="button"
                  onClick={() => setDuration(DURATIONS[(DURATIONS.indexOf(duration) + 1) % DURATIONS.length])}
                  className={promptControlClassName({ compact: true })}
                  title="Duration"
                >
                  <span className="text-xs font-semibold tabular-nums">{duration}s</span>
                </button>
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
