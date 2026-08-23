"use client";

// THE generation control block — one implementation, three studios.
//
// Image, Video and Cinema used to build their own row of controls, so the
// same idea drifted into three different behaviours: the quality picker was
// wired to a different field in each, aspect ratios came from three sources,
// only one of them sent a seed. Everything below lives here now; a studio
// declares which controls it wants and gets identical behaviour for free.
//
// Contract:
//   features  which controls appear (absent = hidden)
//   value     current settings, one flat object
//   onChange  (patch) => void — always a partial update
//   models    the list to choose from (already curated/merged by the caller)
//
// Adding a control here adds it everywhere it is enabled. That is the point.

import { useState, useRef, useEffect } from "react";
import {
  PromptControls,
  PromptPopover,
  PromptMenuList,
  PromptMenuItem,
  PromptChevronIcon,
  PromptAspectRatioIcon,
  PromptDurationIcon,
  PromptQualityIcon,
  promptControlClassName,
  PROMPT_CONTROL_LABEL_CLASS,
} from "./PromptComposer.jsx";
import ModelPicker from "./ModelPicker.jsx";

// Ratios the provider router maps to real dimensions. Single source: a studio
// never invents its own list, so a ratio that works in one works in all.
// "auto" first: it lets the subject decide the framing, and the router has
// always accepted it. Dropping it from this list was a regression.
export const ASPECT_OPTIONS = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:5"];
export const TIER_OPTIONS = ["1k", "2k", "4k"];
export const VIDEO_QUALITY_OPTIONS = ["480p", "720p", "1080p"];

function Dropdown({ open, onClose, children, width = "w-56" }) {
  if (!open) return null;
  return (
    <PromptPopover className={width} onClick={(e) => e.stopPropagation()}>
      <PromptMenuList>{children}</PromptMenuList>
    </PromptPopover>
  );
}

export default function GenerationControls({
  features = {},
  value = {},
  onChange,
  models = [],
  modelKind = "image",
  children,          // studio-specific extras (Cast, Draw…) render at the end
}) {
  const [open, setOpen] = useState(null); // which popover is open
  const rowRef = useRef(null);
  const set = (patch) => { onChange?.(patch); setOpen(null); };

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (rowRef.current && !rowRef.current.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open]);

  const toggle = (id) => setOpen((cur) => (cur === id ? null : id));
  const selectedModel = models.find((m) => m.id === value.modelId);

  return (
    <PromptControls ref={rowRef}>
      {/* Enhance — same toggle, same meaning, everywhere */}
      {features.enhance && (
        <button
          type="button"
          onClick={() => onChange?.({ enhance: !value.enhance })}
          title={value.enhance ? "Enhance ativado" : "Enhance de prompt"}
          aria-pressed={!!value.enhance}
          className={`pressable h-[38px] w-[38px] flex items-center justify-center rounded-lg border text-[14px] ${
            value.enhance
              ? "text-[#FF2447] bg-[#EF0328]/20 border-[#EF0328]/60"
              : "text-white/75 bg-white/[0.09] border-white/[0.34] hover:bg-white/[0.16] hover:text-white"
          }`}
        >✦</button>
      )}

      {/* Mood / style */}
      {features.mood && (
        <button
          type="button"
          onClick={() => onChange?.({ openMood: true })}
          title={value.styleName ? `Estilo ativo: ${value.styleName}` : "Mood — as referências definem o estilo"}
          className={promptControlClassName({ compact: true, active: !!value.styleName })}
        >
          <span className="text-xs font-semibold">{value.styleName || "Mood"}</span>
          {value.styleName && (
            <span
              role="button"
              title="Remover estilo"
              onClick={(e) => { e.stopPropagation(); onChange?.({ clearStyle: true }); }}
              className="ml-0.5 text-white/50 hover:text-white text-[13px] leading-none"
            >×</span>
          )}
        </button>
      )}

      {/* Model */}
      {features.model && (
        <div className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); toggle("model"); }}
            className={promptControlClassName({ compact: true, active: open === "model" })}>
            <span className="text-xs font-semibold truncate max-w-[150px]">
              {selectedModel?.name || "Modelo"}
            </span>
            <PromptChevronIcon />
          </button>
          {open === "model" && (
            <PromptPopover className="w-auto p-2" onClick={(e) => e.stopPropagation()}>
              <ModelPicker
                models={models}
                value={value.modelId}
                kind={modelKind}
                onSelect={(m) => set({ modelId: m.id })}
              />
            </PromptPopover>
          )}
        </div>
      )}

      {/* Aspect ratio */}
      {features.aspect && (
        <div className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); toggle("aspect"); }}
            className={promptControlClassName({ compact: true, active: open === "aspect" })}>
            <PromptAspectRatioIcon />
            <span className={PROMPT_CONTROL_LABEL_CLASS}>{value.aspect || "1:1"}</span>
          </button>
          <Dropdown open={open === "aspect"} width="w-40">
            {(features.aspectOptions || ASPECT_OPTIONS).map((a) => (
              <PromptMenuItem key={a} selected={a === value.aspect} onClick={() => set({ aspect: a })}>{a}</PromptMenuItem>
            ))}
          </Dropdown>
        </div>
      )}

      {/* Quality: image tiers or video resolutions, same control */}
      {features.quality && (
        <div className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); toggle("quality"); }}
            className={promptControlClassName({ compact: true, active: open === "quality" })}>
            <PromptQualityIcon />
            <span className={PROMPT_CONTROL_LABEL_CLASS}>{String(value.quality || "").toUpperCase()}</span>
          </button>
          <Dropdown open={open === "quality"} width="w-40">
            {(features.qualityOptions || TIER_OPTIONS).map((q) => (
              <PromptMenuItem key={q} selected={q === value.quality} onClick={() => set({ quality: q })}>
                {q.toUpperCase()}
              </PromptMenuItem>
            ))}
          </Dropdown>
        </div>
      )}

      {/* Duration (video) */}
      {features.duration && (
        <div className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); toggle("duration"); }}
            className={promptControlClassName({ compact: true, active: open === "duration" })}>
            <PromptDurationIcon />
            <span className={PROMPT_CONTROL_LABEL_CLASS}>{value.duration}s</span>
          </button>
          <Dropdown open={open === "duration"} width="w-32">
            {(features.durationOptions || [5, 10]).map((d) => (
              <PromptMenuItem key={d} selected={d === value.duration} onClick={() => set({ duration: d })}>{d}s</PromptMenuItem>
            ))}
          </Dropdown>
        </div>
      )}

      {/* Audio (video) */}
      {features.audio && (
        <button
          type="button"
          onClick={() => onChange?.({ audio: !value.audio })}
          title={value.audio ? "Som ligado" : "Som desligado"}
          className={promptControlClassName({ compact: true, active: !!value.audio })}
        >
          <span className="text-xs font-semibold">{value.audio ? "🔊" : "🔇"}</span>
        </button>
      )}

      {/* Variations */}
      {features.variations && (() => {
        // The steppers were 20x20 glyphs with no fill and no border at all —
        // a "−" floating on the panel reads as punctuation, not a control.
        // They now match every other control's box and hit area, and they go
        // dim at the limits instead of silently swallowing the press.
        const n = value.variations || 1;
        const max = features.maxVariations || 4;
        const step = (to) => onChange?.({ variations: to });
        const btn = "pressable w-7 h-7 flex items-center justify-center rounded-md text-[15px] leading-none " +
          "text-white/80 hover:text-white hover:bg-white/[0.14] disabled:opacity-30 disabled:hover:bg-transparent " +
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EF0328]/40";
        return (
          <div className="flex items-center gap-0.5 h-[38px] px-1 rounded-lg border border-white/[0.34] bg-white/[0.09]">
            <button type="button" aria-label="Menos uma variação" disabled={n <= 1}
              onClick={() => step(Math.max(1, n - 1))} className={btn}>−</button>
            <span className="text-[11px] font-semibold text-white/90 tabular-nums w-7 text-center">{n}/{max}</span>
            <button type="button" aria-label="Mais uma variação" disabled={n >= max}
              onClick={() => step(Math.min(max, n + 1))} className={btn}>+</button>
          </div>
        );
      })()}

      {/* Seed */}
      {features.seed && (
        <div className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); toggle("seed"); }}
            className={promptControlClassName({ compact: true, active: open === "seed" || value.seed != null })}>
            <span className="text-xs font-semibold">{value.seed != null ? `Seed ${value.seed}` : "Seed"}</span>
          </button>
          <Dropdown open={open === "seed"} width="w-52">
            <div className="p-2 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-[11px] text-white/40 leading-relaxed">
                Trave a seed para iterar variações da mesma imagem.
              </span>
              <input
                type="number"
                value={value.seed ?? ""}
                placeholder="aleatória"
                onChange={(e) => onChange?.({ seed: e.target.value === "" ? null : Number(e.target.value) })}
                className="w-full bg-[#212123] border border-white/[0.08] rounded-lg px-2 py-1 text-[12px] text-white/85 outline-none"
              />
              {value.seed != null && (
                <button type="button" onClick={() => set({ seed: null })}
                  className="pressable h-7 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[11px] text-white/60 hover:text-white">
                  Voltar a aleatória
                </button>
              )}
            </div>
          </Dropdown>
        </div>
      )}

      {children}
    </PromptControls>
  );
}
