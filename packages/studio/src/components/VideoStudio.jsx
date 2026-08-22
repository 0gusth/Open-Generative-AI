"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import toast, { Toaster } from "react-hot-toast";
import { generateVideo, generateI2V, processV2V, uploadFile } from "../muapi.js";
import { formatErrorMessage } from "../utils/formatError.js";
import { detectProperNames, isByteDanceModel } from "../utils/preflight.js";
import { scopedPersistKey, migrateLegacyPersistKey } from "../persistKey.js";
import DrawModal from "./DrawModal.jsx";
import MobileGenerationActions, {
  GenerationCopyButtons,
} from "./MobileGenerationActions.jsx";
import {
  t2vModels,
  i2vModels,
  v2vModels,
  getAspectRatiosForVideoModel,
  getDurationsForModel,
  getResolutionsForVideoModel,
  getAspectRatiosForI2VModel,
  getDurationsForI2VModel,
  getResolutionsForI2VModel,
  getEffectsForI2VModel,
  getDefaultEffectForI2VModel,
  getModesForModel,
  getMaxImagesForI2VModel,
} from "../models.js";
import {
  PROMPT_CONTROL_LABEL_CLASS,
  PROMPT_MEDIA_PREVIEW_CLASS,
  PromptAspectRatioIcon,
  PromptAction,
  PromptChevronIcon,
  PromptComposer,
  PromptControls,
  PromptFooter,
  PromptMenuItem,
  PromptMenuList,
  PromptPopover,
  PromptPopoverHeader,
  PromptDurationIcon,
  PromptQualityIcon,
  PromptMentionTextarea,
  PromptTextarea,
  promptControlClassName,
  promptMediaButtonClassName,
} from "./prompt/PromptComposer.jsx";
import { modelSpeedTier, SPEED_BADGES } from "../utils/modelSpeed.js";
import { fetchLedger, fetchPending, reconcilePending } from "../ledger.js";
import Lightbox from "./Lightbox.jsx";
import { scrubForByteDance, enhancePrompt } from "../providers.js";
import GenerationControls from "./prompt/GenerationControls.jsx";
import { fetchRunwareVideoCatalog, mergeVideoCatalogs, i2vVideoCatalog, isAirId } from "../runwareCatalog.js";
import { truthFor } from "../modelTruth.js";
import MODEL_CONSTRAINTS from "../modelConstraints.json";
import { hasAudioControl } from "../providerSettings.js";
import { seekPosterFrame } from "../utils/videoPoster.js";

// ── Runware-native capability readers ─────────────────────────────────────────
// Priority: probed constraints (free validation-error harvest) → truth layer
// (official specs) → catalog capability tags. Muapi metadata plays no part.

const AIR_ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

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

function airVideoCaps(id, entry) {
  const probed = MODEL_CONSTRAINTS[id] || null;
  const truth = truthFor(`${id} ${entry?.name || ""}`);
  const rw = entry?.rw || {};
  const probedTiers = probed?.sizes?.length ? tiersFromSizes(probed.sizes) : null;
  return {
    aspects: (truth?.aspects || AIR_ASPECTS).filter((a) => a !== "auto"),
    durations: probed?.durations || truth?.durations || [4, 5, 6, 7, 8, 9, 10],
    resolutions:
      probedTiers
      || truth?.qualities
      || (rw.fourK ? ["720p", "1080p", "4k"] : ["480p", "720p", "1080p"]),
    lastImage: !!rw.firstLast,
    i2v: !!rw.i2v,
  };
}

// Guards against re-processing the same dropped/pasted batch when effects
// re-fire (dependency identity churn + React StrictMode double-invoke).
const processedDropBatches = new WeakSet();
// ── tiny helpers ──────────────────────────────────────────────────────────────

function getQualitiesForModel(modelList, modelId) {
  const model = modelList.find((m) => m.id === modelId);
  return model?.inputs?.quality?.enum || [];
}

async function downloadFile(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

// ── SVG icons (kept inline to avoid extra deps) ───────────────────────────────

const CheckSvg = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#EF0328"
    strokeWidth="4"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const VideoIconSvg = ({ className }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={className}
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const VideoReadySvg = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="text-primary"
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    <polyline points="7 10 10 13 15 8" stroke="#EF0328" strokeWidth="2.5" />
  </svg>
);

// ── Dropdown components ───────────────────────────────────────────────────────

const PROVIDER_LOGOS = {
  openai: "https://cdn.muapi.ai/models/openai.png",
  google: "https://cdn.muapi.ai/models/gemini.png",
  kling: "https://cdn.muapi.ai/models/kling.png",
  alibaba: "https://cdn.muapi.ai/models/alibaba.png",
  bytedance: "https://cdn.muapi.ai/models/bytedance.png",
  blackforest: "https://cdn.muapi.ai/models/bfl.png",
  minimax: "https://cdn.muapi.ai/models/minimax.png",
  suno: "https://cdn.muapi.ai/models/suno.png",
  anthropic: "https://cdn.muapi.ai/models/claude.png",
  meshy: "https://cdn.muapi.ai/models/meshy-3.png",
  tripo3d: "https://cdn.muapi.ai/models/tripo3d.png",
  grok: "https://cdn.muapi.ai/models/xai.png",
  muapi: "https://cdn.muapi.ai/models/muapi.png",
  midjourney: "https://cdn.muapi.ai/models/midjourney.png",
  vidu: "https://cdn.muapi.ai/models/vidu.png",
  runway: "https://cdn.muapi.ai/models/runway.png",
  luma: "https://cdn.muapi.ai/models/luma.png",
  ideogram: "https://cdn.muapi.ai/models/ideogram.png",
  leonardoai: "https://cdn.muapi.ai/models/leonardoai.png",
  hunyuan: "https://cdn.muapi.ai/models/hunyuan.png",
  hidream: "https://cdn.muapi.ai/models/hidream.png",
  lightricks: "https://cdn.muapi.ai/models/lightricks.png",
  pixverse: "https://cdn.muapi.ai/models/pixverse.png",
  reve: "https://cdn.muapi.ai/models/reve.png",
  stability: "https://cdn.muapi.ai/models/stability.png"
};

const invertLogos = ['openai', 'blackforest', 'runway', 'ideogram', 'lightricks', 'grok'];

function ModelDropdown({ selectedModel, onSelect, onClose, t2v, i2v, v2v }) {
  const [search, setSearch] = useState("");
  const modelCategories = [
    {
      id: "all",
      label: "All",
      entries: [
        ...t2v.map((model) => ({ model, category: "t2v" })),
        ...i2v.filter((m) => !t2v.some((t) => t.id === m.id)).map((model) => ({ model, category: "i2v" })),
        ...v2v.map((model) => ({ model, category: "v2v" })),
      ],
    },
    {
      id: "t2v",
      label: "Text to Video",
      entries: t2v.map((model) => ({ model, category: "t2v" })),
    },
    {
      id: "i2v",
      label: "Image to Video",
      entries: i2v.map((model) => ({ model, category: "i2v" })),
    },
    {
      id: "v2v",
      label: "Video Tools",
      entries: v2v.map((model) => ({ model, category: "v2v" })),
    },
  ];
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState("all");
  const activeCategory = modelCategories.find((category) => category.id === selectedCategory) || modelCategories[0];
  const modelEntries = activeCategory.entries;

  const activeItemRef = useRef(null);

  useEffect(() => {
    // Automatically scroll the active model into view when opening
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const getProviderStyle = (provider) => {
    switch (provider) {
      case "grok":
        return { text: "xI", bg: "bg-orange-500/10 text-orange-400 border-orange-500/25" };
      case "openai":
        return { text: "O", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" };
      case "google":
        return { text: "G", bg: "bg-white/10 text-white/70 border-white/15" };
      case "blackforest":
        return { text: "BF", bg: "bg-amber-500/10 text-amber-400 border-amber-500/25" };
      case "bytedance":
        return { text: "BD", bg: "bg-white/10 text-white/70 border-white/15" };
      case "midjourney":
        return { text: "MJ", bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/25" };
      case "kling":
        return { text: "KL", bg: "bg-rose-500/10 text-rose-400 border-rose-500/25" };
      case "vidu":
        return { text: "VD", bg: "bg-white/10 text-white/70 border-white/15" };
      case "minimax":
        return { text: "MX", bg: "bg-pink-500/10 text-pink-400 border-pink-500/25" };
      case "ideogram":
        return { text: "ID", bg: "bg-yellow-500/10 text-yellow-400 border-yellow-500/25" };
      case "luma":
        return { text: "LM", bg: "bg-teal-500/10 text-teal-400 border-teal-500/25" };
      case "alibaba":
        return { text: "AL", bg: "bg-sky-500/10 text-sky-400 border-sky-500/25" };
      case "leonardoai":
        return { text: "LE", bg: "bg-white/10 text-white/70 border-white/15" };
      case "stability":
        return { text: "SD", bg: "bg-white/10 text-white/70 border-white/15" };
      default:
        const name = provider ? provider.toUpperCase() : "AI";
        return { text: name.substring(0, 2), bg: "bg-primary/10 text-primary border-primary/25" };
    }
  };

  // Dynamically compute list of providers from the input models lists
  const availableProviders = [];
  const seenProviders = new Set();
  
  modelEntries.forEach(({ model: m }) => {
    const pId = m.provider || 'muapi';
    const pName = m.provider_name || 'Muapi';
    if (!seenProviders.has(pId)) {
      seenProviders.add(pId);
      availableProviders.push({ id: pId, name: pName, logo: m.logoUrl || PROVIDER_LOGOS[pId] || null, invert: !m.logoUrl && invertLogos.includes(pId) });
    }
  });

  const lf = search.toLowerCase();

  const filterFn = ({ model: m }) => {
    // 1. Filter by provider tab
    if (selectedProvider !== "all") {
      const pId = m.provider || 'muapi';
      if (pId !== selectedProvider) return false;
    }
    // 2. Filter by search query
    return (
      m.name.toLowerCase().includes(lf) ||
      m.id.toLowerCase().includes(lf)
    );
  };

  const filteredMain = modelEntries.filter(filterFn).filter(({ category }) => category !== "v2v");
  const filteredV2V = modelEntries.filter(filterFn).filter(({ category }) => category === "v2v");

  const getIconColor = (m, isV2V) => {
    if (isV2V) return "bg-orange-500/10 text-orange-400 border-orange-500/10";
    if (m.id.includes("kling")) return "bg-white/10 text-white/70 border-white/15";
    if (m.id.includes("veo")) return "bg-white/10 text-white/70 border-white/15";
    if (m.id.includes("sora")) return "bg-rose-500/10 text-rose-400 border-rose-500/10";
    return "bg-primary/10 text-primary border-primary/10";
  };

  const renderItem = ({ model: m, category }) => {
    const isV2V = category === "v2v";
    return (
    <div
      key={`${category}:${m.id}`}
      ref={selectedModel === m.id ? activeItemRef : null}
      className={`flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-white/5 ${selectedModel === m.id ? "bg-white/5 border-white/5" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(m, category);
        onClose();
      }}
    >
      <div className="flex items-center gap-3.5">
        {(m.logoUrl || PROVIDER_LOGOS[m.provider]) ? (
          <div className="w-8 h-8 rounded-xl border border-white/5 overflow-hidden shrink-0 flex items-center justify-center bg-white/[0.02]">
            <img
              src={m.logoUrl || PROVIDER_LOGOS[m.provider]}
              alt={m.provider_name}
              className={`w-full h-full object-contain p-1 ${!m.logoUrl && invertLogos.includes(m.provider) ? "invert" : ""}`}
            />
          </div>
        ) : (
          <div
            className={`w-9 h-9 ${getIconColor(m, isV2V)} border rounded-xl flex items-center justify-center font-black text-xs shadow-inner uppercase`}
          >
            {m.name.charAt(0)}
          </div>
        )}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs font-bold text-white tracking-tight truncate flex items-center gap-1.5">
            {m.name}
            {(() => {
              const badge = SPEED_BADGES[modelSpeedTier(m)];
              return badge ? (
                <span
                  title={badge.title}
                  className="text-[8px] font-medium text-white/45 border border-white/[0.09] rounded-full px-1.5 py-px whitespace-nowrap shrink-0"
                >
                  {badge.label}
                </span>
              ) : null;
            })()}
          </span>
          {isV2V ? (
            <span className="text-[9px] text-orange-400/70">
              {m.imageField ? "Upload a video and image" : "Upload a video to use"}
            </span>
          ) : (
            selectedProvider === "all" && m.provider_name && (
              <span className="text-[9px] text-white/40">
                {m.provider_name}
              </span>
            )
          )}
        </div>
      </div>
      {selectedModel === m.id && <CheckSvg />}
    </div>
    );
  };

  return (
    <div className="flex gap-4 h-full max-h-[70vh] min-h-[350px]">
      {/* Left Sidebar: Provider tabs */}
      <div className="flex flex-col gap-2.5 items-center pr-2 border-r border-white/5 shrink-0 select-none overflow-y-auto custom-scrollbar w-14 pt-0.5">
        <button
          type="button"
          onClick={() => setSelectedProvider("all")}
          className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all flex-shrink-0 cursor-pointer ${
            selectedProvider === "all"
              ? "bg-white/10 text-yellow-400 border-yellow-500/30 shadow-md scale-105"
              : "bg-white/[0.02] text-white/50 border-white/[0.03] hover:bg-white/5 hover:text-white"
          }`}
          title="All Providers"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={selectedProvider === "all" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        
        {availableProviders.map(p => {
          const style = getProviderStyle(p.id);
          const isSelected = selectedProvider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProvider(p.id)}
              className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center font-black text-[10px] border transition-all flex-shrink-0 cursor-pointer overflow-hidden ${
                isSelected
                  ? `${style.bg} border-white/25 scale-105 shadow-md`
                  : "bg-white/[0.02] text-white/40 border-white/[0.02] hover:bg-white/5 hover:text-white/80"
              }`}
              title={p.name}
            >
              {PROVIDER_LOGOS[p.id] ? (
                <img
                  src={PROVIDER_LOGOS[p.id]}
                  alt={p.name}
                  className={`w-full h-full rounded-full object-contain ${invertLogos.includes(p.id) ? "invert" : ""}`}
                />
              ) : (
                style.text
              )}
            </button>
          );
        })}
      </div>

      {/* Right Pane: Search + Lists */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="px-1 pb-2 border-b border-white/5 shrink-0 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
            {modelCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(category.id);
                  setSelectedProvider("all");
                }}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-colors border ${
                  selectedCategory === category.id
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-white/[0.02] text-white/50 border-white/[0.04] hover:bg-white/5 hover:text-white"
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2 border border-white/5 focus-within:border-primary/50 transition-colors">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-muted"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0 outline-none"
            />
          </div>
        </div>
        
        <div className="text-xs font-bold text-secondary px-2 py-1 shrink-0 flex items-center justify-between">
          <span>{activeCategory.label} models</span>
          {selectedProvider !== "all" && (
            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-white/60">
              {availableProviders.find(p => p.id === selectedProvider)?.name || selectedProvider}
            </span>
          )}
        </div>
        
        <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2 flex-1">
          {filteredMain.length === 0 && filteredV2V.length === 0 ? (
            <div className="text-xs text-white/30 text-center py-6">
              No models found
            </div>
          ) : (
            <>
              {filteredMain.map((entry) => renderItem(entry))}
              {filteredV2V.length > 0 && (
                <>
                  <div className="text-xs font-bold text-orange-400/70 px-3 py-2 mt-1 border-t border-white/5">
                    Video Tools
                  </div>
                  {filteredV2V.map((entry) => renderItem(entry))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Control button ────────────────────────────────────────────────────────────

// ── Dropdown panel ─────────────────────────────────────────────────────────────
// Rendered inside a `relative` wrapper div; floats above the anchor button.

// ── Main component ────────────────────────────────────────────────────────────

export default function VideoStudio({
  apiKey,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
  historyItems,
  onDeleteHistoryItem,
  droppedFiles,
  onFilesHandled,
}) {
  const LEGACY_PERSIST_KEY = "hg_video_studio_persistent";
  const PERSIST_KEY = scopedPersistKey(LEGACY_PERSIST_KEY, apiKey);
  useEffect(() => {
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, PERSIST_KEY);
  }, [PERSIST_KEY]);

  // ── mode state ──
  const [imageMode, setImageMode] = useState(false); // i2v
  const [v2vMode, setV2vMode] = useState(false);

  // ── model / params ──
  const defaultModel = t2vModels[0];
  const [selectedModel, setSelectedModel] = useState(defaultModel.id);
  const [selectedModelName, setSelectedModelName] = useState(defaultModel.name);
  const [selectedAr, setSelectedAr] = useState(
    defaultModel.inputs?.aspect_ratio?.default || "16:9",
  );
  const [selectedDuration, setSelectedDuration] = useState(
    defaultModel.inputs?.duration?.default || 5,
  );
  const [selectedResolution, setSelectedResolution] = useState(
    defaultModel.inputs?.resolution?.default || "",
  );
  const [selectedQuality, setSelectedQuality] = useState(
    defaultModel.inputs?.quality?.default || "",
  );
  const [selectedMode, setSelectedMode] = useState("");
  const [selectedEffect, setSelectedEffect] = useState("");

  // ── upload progress ──
  const [imageProgress, setImageProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  // ── control visibility ──
  const [showAr, setShowAr] = useState(true);
  const [showDuration, setShowDuration] = useState(true);
  const [showResolution, setShowResolution] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [showMode, setShowMode] = useState(false);
  const [showEffect, setShowEffect] = useState(false);

  // ── uploads ──
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadedEndImageUrl, setUploadedEndImageUrl] = useState(null);
  const [endImageUploading, setEndImageUploading] = useState(false);
  const [endImageProgress, setEndImageProgress] = useState(0);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploadedVideoName, setUploadedVideoName] = useState(null);

  // ── generation / canvas ──
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [fullscreenUrl, setFullscreenUrl] = useState(null);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [canvasUrl, setCanvasUrl] = useState(null);
  const [canvasModel, setCanvasModel] = useState(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [lastGenerationId, setLastGenerationId] = useState(null);
  const [lastGenerationModel, setLastGenerationModel] = useState(null);

  // ── history ──
  const [localHistory, setLocalHistory] = useState([]);
  const [pendingRenders, setPendingRenders] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [projectsCount, setProjectsCount] = useState(0);
  const [galleryScope, setGalleryScope] = useState(() => {
    if (typeof window === "undefined") return "all";
    return window.localStorage.getItem("gallery_scope") || "all";
  });
  // Audio on/off for models that can generate sound (Veo, Kling 3, Seedance 2.x…)
  const [audioOn, setAudioOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("video_audio_on") !== "0";
  });
  const toggleAudio = () => {
    setAudioOn((v) => {
      const next = !v;
      try { window.localStorage.setItem("video_audio_on", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  // Elements: categorized reference images (character/location/prop)
  const [elementRoles, setElementRoles] = useState({});
  const ELEMENT_COLORS = {
    character: { ring: "border-[#30D158]/70", chip: "bg-[#30D158] !text-black", label: "char" },
    location: { ring: "border-[#64D2FF]/70", chip: "bg-[#64D2FF] !text-black", label: "loc" },
    prop: { ring: "border-[#FF9F0A]/70", chip: "bg-[#FF9F0A] !text-black", label: "prop" },
    generic: { ring: "border-[#EF0328]/70", chip: "bg-[#EF0328]", label: null },
  };

  // Enhance toggle — persistent until the user turns it off
  const [enhanceOn, setEnhanceOn] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("enhance_prompt_on") === "1";
  });
  const toggleEnhance = () => {
    setEnhanceOn((v) => {
      const next = !v;
      try { window.localStorage.setItem("enhance_prompt_on", next ? "1" : "0"); } catch {}
      return next;
    });
  };


  // Live render progress for the placeholder cards
  const [genProgress, setGenProgress] = useState(null);
  useEffect(() => {
    if (!generating) { setGenProgress(null); return; }
    const onProgress = (e) => setGenProgress(e.detail?.progress ?? null);
    window.addEventListener("generation-progress", onProgress);
    return () => window.removeEventListener("generation-progress", onProgress);
  }, [generating]);

  // Which provider took the job + elapsed time — a silent spinner reads as
  // frozen, especially on Muapi where closed models take minutes.
  const [renderRoute, setRenderRoute] = useState(null);
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
  const renderElapsedLabel = `${Math.floor(renderElapsed / 60)}:${String(renderElapsed % 60).padStart(2, "0")}`;


  // Server ledger sync (cross-browser history + live pending queue)
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      const [ledger, pending, projectsRes] = await Promise.all([
        fetchLedger(),
        fetchPending(),
        fetch("/api/projects").then((r) => r.json()).catch(() => null),
      ]);
      if (!alive) return;
      if (projectsRes) {
        setActiveProjectId(projectsRes.activeId || null);
        setProjectsCount((projectsRes.projects || []).length);
      }
      const videos = ledger.filter((e) => e.type === "video");
      setLocalHistory((prev) => {
        const known = new Set(prev.map((e) => e.url));
        const fresh = videos.filter((e) => !known.has(e.url));
        if (fresh.length === 0) return prev;
        const merged = [...fresh, ...prev];
        merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return merged.slice(0, 100);
      });
      setPendingRenders((prev) => {
        const next = pending.filter((p) => p.type === "video");
        // Identity-stable when unchanged: a fresh array every 15s re-rendered
        // this whole studio (grid, videos and all) even with nothing new.
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    };
    sync();
    const interval = setInterval(async () => {
      await reconcilePending();
      sync();
    }, 15000);
    return () => { alive = false; clearInterval(interval); };
  }, []);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);

  // ── dropdown ──
  const [openDropdown, setOpenDropdown] = useState(null); // 'model'|'ar'|'duration'|'resolution'|'quality'|'mode'|null

  // ── prompt ──
  const [prompt, setPrompt] = useState("");
  const [promptDisabled, setPromptDisabled] = useState(false);

  // ── refs ──
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const endImageFileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const resultVideoRef = useRef(null);
  const hasRestored = useRef(false);

  // ── derived data ──
  const historyUnfiltered = historyItems ?? localHistory;
  const history =
    galleryScope === "project" && activeProjectId
      ? historyUnfiltered.filter((e) => e.projectId === activeProjectId)
      : historyUnfiltered;
  useEffect(() => {
    const onScope = (e) => setGalleryScope(e.detail || "all");
    window.addEventListener("gallery-scope-changed", onScope);
    return () => window.removeEventListener("gallery-scope-changed", onScope);
  }, []);

  // See ImageStudio's handleDeleteEntry: when historyItems is server-backed
  // (White Label / backfilled sessions), localHistory isn't what's rendered,
  // so removal has to go through the parent to delete server-side and
  // update the same state `history` reads from.
  const handleDeleteEntry = useCallback(async (entry, idx) => {
    if (historyItems && onDeleteHistoryItem) {
      await onDeleteHistoryItem(entry);
    } else {
      setLocalHistory((prev) => prev.filter((_, i) => i !== idx));
    }
  }, [historyItems, onDeleteHistoryItem]);

  // Runware-native catalog — the single source of generation models. The
  // wrapper lists survive only while no catalog exists (no key yet); v2v
  // tools remain wrapper-based accessories.
  const [rwCatalog, setRwCatalog] = useState([]);
  useEffect(() => { fetchRunwareVideoCatalog().then(setRwCatalog); }, []);
  const catalogT2v = useMemo(() => mergeVideoCatalogs(rwCatalog, t2vModels), [rwCatalog]);
  const catalogI2v = useMemo(() => i2vVideoCatalog(rwCatalog, i2vModels), [rwCatalog]);
  const airEntry = useCallback(
    (id) => (isAirId(id) ? rwCatalog.find((m) => m.id === id) || null : null),
    [rwCatalog],
  );

  const getCurrentModels = useCallback(() => {
    if (v2vMode) return v2vModels;
    return imageMode ? catalogI2v : catalogT2v;
  }, [imageMode, v2vMode, catalogT2v, catalogI2v]);

  const getCurrentAspectRatios = useCallback(
    (id) =>
      isAirId(id)
        ? airVideoCaps(id, airEntry(id)).aspects
        : imageMode
          ? getAspectRatiosForI2VModel(id)
          : getAspectRatiosForVideoModel(id),
    [imageMode, airEntry],
  );

  const getCurrentDurations = useCallback(
    (id) =>
      isAirId(id)
        ? airVideoCaps(id, airEntry(id)).durations
        : imageMode
          ? getDurationsForI2VModel(id)
          : getDurationsForModel(id),
    [imageMode, airEntry],
  );

  const getCurrentResolutions = useCallback(
    (id) =>
      isAirId(id)
        ? airVideoCaps(id, airEntry(id)).resolutions
        : imageMode
          ? getResolutionsForI2VModel(id)
          : getResolutionsForVideoModel(id),
    [imageMode, airEntry],
  );

  // First+last frame and multi-image ceilings, source-of-truth aware
  const supportsLastImage = useCallback(
    (id) => (isAirId(id) ? !!airEntry(id)?.rw?.firstLast : !!i2vModels.find((m) => m.id === id)?.lastImageField),
    [airEntry],
  );
  const maxImagesFor = useCallback(
    (id) => (isAirId(id) ? 1 : getMaxImagesForI2VModel(id)),
    [],
  );

  // Real sound control? (documented provider mechanism or probed top-level
  // param). A switch the API ignores is worse than no switch — Kling shipped
  // mute videos that way.
  const audioControl = useMemo(
    () => (isAirId(selectedModel)
      ? hasAudioControl(selectedModel, MODEL_CONSTRAINTS[selectedModel]?.audioParam === true)
      : true),
    [selectedModel],
  );

  const getCurrentModel = useCallback(
    () => getCurrentModels().find((m) => m.id === selectedModel),
    [getCurrentModels, selectedModel],
  );

  const isMotionControlSelection = useCallback(
    (modelId, isV2v) => {
      if (!isV2v) return false;
      const m = v2vModels.find((x) => x.id === modelId);
      return !!m?.imageField;
    },
    [],
  );

  // ── update controls when model/mode changes ──────────────────────────────
  const applyControlsForModel = useCallback(
    (modelId, isImageMode, isV2vMode) => {
      if (isV2vMode) {
        setShowAr(false);
        setShowDuration(false);
        setShowResolution(false);
        setShowQuality(false);
        setShowMode(false);
        setShowEffect(false);
        return;
      }

      // Runware AIR: capabilities come from probe → truth → catalog tags.
      // No quality/mode/effect axes — dimensions and duration are the API.
      if (isAirId(modelId)) {
        const caps = airVideoCaps(modelId, airEntry(modelId));
        setSelectedAr(caps.aspects[0]);
        setShowAr(true);
        setSelectedDuration(caps.durations.includes(5) ? 5 : caps.durations[0]);
        setShowDuration(true);
        setSelectedResolution(caps.resolutions.includes("720p") ? "720p" : caps.resolutions[0]);
        setShowResolution(true);
        setSelectedQuality("");
        setShowQuality(false);
        setSelectedMode("");
        setShowMode(false);
        setSelectedEffect("");
        setShowEffect(false);
        return;
      }

      const modelList = isImageMode ? i2vModels : t2vModels;
      const model = modelList.find((m) => m.id === modelId);

      const ars = isImageMode
        ? getAspectRatiosForI2VModel(modelId)
        : getAspectRatiosForVideoModel(modelId);
      if (ars.length > 0) {
        setSelectedAr(ars[0]);
        setShowAr(true);
      } else {
        setShowAr(false);
      }

      const durations = isImageMode
        ? getDurationsForI2VModel(modelId)
        : getDurationsForModel(modelId);
      if (durations.length > 0) {
        setSelectedDuration(durations[0]);
        setShowDuration(true);
      } else {
        setShowDuration(false);
      }

      const resolutions = isImageMode
        ? getResolutionsForI2VModel(modelId)
        : getResolutionsForVideoModel(modelId);
      if (resolutions.length > 0) {
        setSelectedResolution(resolutions[0]);
        setShowResolution(true);
      } else {
        setShowResolution(false);
      }

      const qualities = getQualitiesForModel(modelList, modelId);
      if (qualities.length > 0) {
        setSelectedQuality(model?.inputs?.quality?.default || qualities[0]);
        setShowQuality(true);
      } else {
        setSelectedQuality("");
        setShowQuality(false);
      }

      const modes = getModesForModel(modelId);
      if (modes.length > 0) {
        setSelectedMode(model?.inputs?.mode?.default || modes[0]);
        setShowMode(true);
      } else {
        setSelectedMode("");
        setShowMode(false);
      }

      const effects = isImageMode ? getEffectsForI2VModel(modelId) : [];
      if (effects.length > 0) {
        setSelectedEffect(getDefaultEffectForI2VModel(modelId) || effects[0]);
        setShowEffect(true);
      } else {
        setSelectedEffect("");
        setShowEffect(false);
      }
    },
    [airEntry],
  );

  // ── Persistence: Load ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.imageMode !== undefined) setImageMode(data.imageMode);
        if (data.v2vMode !== undefined) setV2vMode(data.v2vMode);
        if (data.selectedModel) setSelectedModel(data.selectedModel);
        if (data.selectedModelName) setSelectedModelName(data.selectedModelName);
        if (data.selectedAr) setSelectedAr(data.selectedAr);
        if (data.selectedDuration) setSelectedDuration(data.selectedDuration);
        if (data.selectedResolution) setSelectedResolution(data.selectedResolution);
        if (data.selectedQuality) setSelectedQuality(data.selectedQuality);
        if (data.selectedMode) setSelectedMode(data.selectedMode);
        if (data.selectedEffect) setSelectedEffect(data.selectedEffect);
        if (data.uploadedImageUrl) setUploadedImageUrl(data.uploadedImageUrl);
        if (data.uploadedImageUrls) {
          setUploadedImageUrls(data.uploadedImageUrls);
        } else if (data.uploadedImageUrl) {
          setUploadedImageUrls([data.uploadedImageUrl]);
        }
        if (data.uploadedVideoUrl) setUploadedVideoUrl(data.uploadedVideoUrl);
        if (data.uploadedVideoName) setUploadedVideoName(data.uploadedVideoName);
        if (data.prompt) setPrompt(data.prompt);
        if (data.localHistory) setLocalHistory(data.localHistory);

        // Update control visibility based on restored model/mode
        applyControlsForModel(
          data.selectedModel || defaultModel.id,
          !!data.imageMode,
          !!data.v2vMode
        );
      }
    } catch (err) {
      console.warn("Failed to load VideoStudio persistence:", err);
    } finally {
      hasRestored.current = true;
    }
  }, [applyControlsForModel, defaultModel.id]);

  // ── Persistence: Save ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state = {
          imageMode,
          v2vMode,
          selectedModel,
          selectedModelName,
          selectedAr,
          selectedDuration,
          selectedResolution,
          selectedQuality,
          selectedMode,
          selectedEffect,
          uploadedImageUrl,
          uploadedImageUrls,
          uploadedVideoUrl,
          uploadedVideoName,
          prompt,
          localHistory,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to save VideoStudio persistence:", err);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [
    imageMode,
    v2vMode,
    selectedModel,
    selectedModelName,
    selectedAr,
    selectedDuration,
    selectedResolution,
    selectedQuality,
    selectedMode,
    selectedEffect,
    uploadedImageUrl,
    uploadedImageUrls,
    uploadedVideoUrl,
    uploadedVideoName,
    prompt,
    localHistory,
  ]);

  // ── Derived UI values ────────────────────────────────────────────────────

  const applyImageReferenceUrl = useCallback(
    (url) => {
      if (!url) return;

      setUploadedImageUrl(url);

      // Motion-control models use the image alongside the uploaded video.
      if (isMotionControlSelection(selectedModel, v2vMode)) {
        setUploadedImageUrls([url]);
        setPromptDisabled(false);
        return;
      }

      // Runware AIR: the same model usually handles i2v — keep it and flip
      // to image mode; otherwise fall to the first i2v-capable catalog model.
      if (isAirId(selectedModel)) {
        const entry = airEntry(selectedModel);
        const target = entry?.rw?.i2v ? entry : catalogI2v[0];
        if (!target) return;
        setUploadedVideoUrl(null);
        setUploadedVideoName(null);
        setV2vMode(false);
        setImageMode(true);
        setSelectedModel(target.id);
        setSelectedModelName(target.name);
        applyControlsForModel(target.id, true, false);
        setUploadedImageUrls([url]);
        setPromptDisabled(false);
        return;
      }

      const currentT2V = t2vModels.find((model) => model.id === selectedModel);

      // Models with native image inputs stay in their current mode.
      if (currentT2V?.inputs?.images_list) {
        const maxImages = currentT2V.inputs.images_list.maxItems || 8;
        setUploadedImageUrls((previousUrls) => {
          if (previousUrls.includes(url)) return previousUrls;
          return [...previousUrls, url].slice(0, maxImages);
        });
        setPromptDisabled(false);
        return;
      }

      setUploadedVideoUrl(null);
      setUploadedVideoName(null);
      setV2vMode(false);

      const sibling = currentT2V?.family
        ? i2vModels.find((model) => model.family === currentT2V.family)
        : null;
      const targetModel = imageMode
        ? i2vModels.find((model) => model.id === selectedModel)
        : sibling || i2vModels[0];

      if (!targetModel) return;

      if (!imageMode) {
        setImageMode(true);
        setSelectedModel(targetModel.id);
        setSelectedModelName(targetModel.name);
        applyControlsForModel(targetModel.id, true, false);
      }

      const maxImages = getMaxImagesForI2VModel(targetModel.id);
      if (maxImages > 2) {
        setUploadedImageUrls((previousUrls) => {
          if (previousUrls.includes(url)) return previousUrls;
          return [...previousUrls, url].slice(0, maxImages);
        });
      } else {
        setUploadedImageUrls([url]);
      }
      setPromptDisabled(false);
    },
    [
      applyControlsForModel,
      imageMode,
      isMotionControlSelection,
      selectedModel,
      v2vMode,
      airEntry,
      catalogI2v,
    ],
  );

  const handleDrawReference = useCallback(
    (entry) => {
      applyImageReferenceUrl(entry?.url);
    },
    [applyImageReferenceUrl],
  );

  const elementMentions = useMemo(() => uploadedImageUrls.map((u, i) => {
    const role = elementRoles[u];
    if (role === "character") return { token: "@char", thumb: u, color: "#30D158" };
    if (role === "location") return { token: "@location", thumb: u, color: "#64D2FF" };
    if (role === "prop") return { token: "@prop", thumb: u, color: "#FF9F0A" };
    return { token: `@img${i + 1}`, thumb: u, color: "#EF0328" };
  }), [uploadedImageUrls, elementRoles]);

  const pendingElementRole = useRef(null);
  const uploadImageReference = useCallback(
    async (file) => {
      if (file.size > 10 * 1024 * 1024) {
        alert("Image exceeds 10MB limit.");
        return;
      }

      setImageUploading(true);
      setImageProgress(0);
      try {
        const url = await uploadFile(apiKey, file, setImageProgress);
        if (pendingElementRole.current) {
          const role = pendingElementRole.current;
          setElementRoles((prev) => ({ ...prev, [url]: role }));
          pendingElementRole.current = null;
        }
        applyImageReferenceUrl(url);
      } catch (err) {
        console.error("[VideoStudio] Image upload failed:", err);
        alert(`Image upload failed: ${err.message}`);
      } finally {
        setImageUploading(false);
        setImageProgress(0);
      }
    },
    [apiKey, applyImageReferenceUrl],
  );

  const processDroppedVideo = useCallback(
    async (file) => {
      if (file.size > 50 * 1024 * 1024) {
        alert("Video exceeds 50MB limit.");
        return;
      }
      setVideoUploading(true);
      setVideoProgress(0);
      try {
        const url = await uploadFile(apiKey, file, setVideoProgress);
        setUploadedVideoUrl(url);
        setUploadedVideoName(file.name);
        if (imageMode) {
          setUploadedImageUrl(null);
          setImageMode(false);
        }
        setV2vMode(true);
        const firstV2V = v2vModels[0];
        setSelectedModel(firstV2V.id);
        setSelectedModelName(firstV2V.name);
        applyControlsForModel(firstV2V.id, false, true);
        setPrompt("");
        setPromptDisabled(true);
      } catch (err) {
        alert(`Video upload failed: ${err.message}`);
      } finally {
        setVideoUploading(false);
        setVideoProgress(0);
      }
    },
    [apiKey, applyControlsForModel, imageMode],
  );

  // ── Handle Dropped Files ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      if (processedDropBatches.has(droppedFiles)) return;
      processedDropBatches.add(droppedFiles);
      const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
      const videoFiles = droppedFiles.filter(f => f.type.startsWith('video/'));
      
      if (videoFiles.length > 0) {
        processDroppedVideo(videoFiles[0]);
      } else if (imageFiles.length > 0) {
        uploadImageReference(imageFiles[0]);
      }
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, processDroppedVideo, uploadImageReference]);

  // Initialise controls for default model on mount
  useEffect(() => {
    if (hasRestored.current) return;
    applyControlsForModel(defaultModel.id, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the Runware catalog arrives, retire any selection that no longer
  // exists in it (restored wrapper ids from older sessions) — they cannot
  // generate anywhere anymore.
  useEffect(() => {
    if (!rwCatalog.length || v2vMode) return;
    const list = imageMode ? catalogI2v : catalogT2v;
    if (list.some((m) => m.id === selectedModel)) return;
    const first = list[0];
    if (!first) return;
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, imageMode, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rwCatalog, v2vMode, imageMode, selectedModel, catalogT2v, catalogI2v]);

  // ── close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [openDropdown]);

  const handlePromptInput = (e) => {
    setPrompt(e.target.value);
  };

  // ── image upload ─────────────────────────────────────────────────────────
  const handleImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await uploadImageReference(file);
    } finally {
      if (imageFileInputRef.current) imageFileInputRef.current.value = "";
    }
  };

  const clearImageUpload = () => {
    setUploadedImageUrl(null);
    setUploadedImageUrls([]);
    setUploadedEndImageUrl(null);
    // Motion-control v2v or model with inputs.images_list: keep model, just drop the image
    if (isMotionControlSelection(selectedModel, v2vMode)) return;
    // AIR that also does t2v: stay on the same model, back to text mode
    if (isAirId(selectedModel) && airEntry(selectedModel)?.rw?.t2v) {
      setImageMode(false);
      applyControlsForModel(selectedModel, false, false);
      setPromptDisabled(false);
      return;
    }
    const currentT2V = t2vModels.find((m) => m.id === selectedModel);
    if (currentT2V?.inputs?.images_list) return;
    setImageMode(false);
    const first = catalogT2v[0] || t2vModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
  };

  const removeImageAtIndex = (idx) => {
    const nextUrls = uploadedImageUrls.filter((_, i) => i !== idx);
    setUploadedImageUrls(nextUrls);
    if (nextUrls.length === 0) {
      setUploadedImageUrl(null);
      // Reset to text-to-video if empty list
      if (isMotionControlSelection(selectedModel, v2vMode)) return;
      if (isAirId(selectedModel) && airEntry(selectedModel)?.rw?.t2v) {
        setImageMode(false);
        applyControlsForModel(selectedModel, false, false);
        setPromptDisabled(false);
        return;
      }
      setImageMode(false);
      const first = catalogT2v[0] || t2vModels[0];
      setSelectedModel(first.id);
      setSelectedModelName(first.name);
      applyControlsForModel(first.id, false, false);
      setPromptDisabled(false);
    } else {
      setUploadedImageUrl(nextUrls[0]);
    }
  };

  // ── end-frame upload (FLF i2v models) ──────────────────────────────────────
  const handleEndImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Image exceeds 10MB limit.");
      return;
    }
    setEndImageUploading(true);
    setEndImageProgress(0);
    try {
      const url = await uploadFile(apiKey, file, (pct) => {
        setEndImageProgress(pct);
      });
      setUploadedEndImageUrl(url);
    } catch (err) {
      alert(`End frame upload failed: ${err.message}`);
    } finally {
      setEndImageUploading(false);
      setEndImageProgress(0);
      if (endImageFileInputRef.current) endImageFileInputRef.current.value = "";
    }
  };

  const clearEndImage = () => setUploadedEndImageUrl(null);

  // ── video upload ─────────────────────────────────────────────────────────
  const handleVideoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert("Video exceeds 50MB limit.");
      return;
    }
    setVideoUploading(true);
    setVideoProgress(0);
    try {
      const url = await uploadFile(apiKey, file, (pct) => {
        setVideoProgress(pct);
      });
      setUploadedVideoUrl(url);
      setUploadedVideoName(file.name);

      if (isMotionControlSelection(selectedModel, v2vMode)) {
        // Already in motion-control mode — keep model and image, allow prompt
        setPromptDisabled(false);
      } else {
        // Model-native video reference (e.g. Seedance 2.0 Extend with inputs.video_files):
        // keep the current model & mode; just store the video URL as a reference
        const currentT2VOrExtend = t2vModels.find((m) => m.id === selectedModel);
        if (currentT2VOrExtend?.inputs?.video_files) {
          setPromptDisabled(false);
        } else {
          // Default v2v flow (e.g. watermark remover) — auto-pick the first v2v model
          if (imageMode) {
            setUploadedImageUrl(null);
            setImageMode(false);
          }
          setV2vMode(true);
          const firstV2V = v2vModels[0];
          setSelectedModel(firstV2V.id);
          setSelectedModelName(firstV2V.name);
          applyControlsForModel(firstV2V.id, false, true);
          setPrompt("");
          setPromptDisabled(true);
        }
      }
    } catch (err) {
      console.error("[VideoStudio] Video upload failed:", err);
      alert(`Video upload failed: ${err.message}`);
    } finally {
      setVideoUploading(false);
      setVideoProgress(0);
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
    }
  };

  const clearVideoUpload = () => {
    setUploadedVideoUrl(null);
    setUploadedVideoName(null);
    setV2vMode(false);
    const first = catalogT2v[0] || t2vModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
  };

  // ── model selection from dropdown ─────────────────────────────────────────
  const handleModelSelect = useCallback(
    (m, category = imageMode ? "i2v" : "t2v") => {
      const isV2V = category === "v2v";
      if (isV2V) {
        setV2vMode(true);
        setImageMode(false);
        const isMC = !!m.imageField;
        if (!isMC) {
          // Single-input v2v (watermark remover etc.) — drop any image
          setUploadedImageUrl(null);
        }
        setSelectedModel(m.id);
        setSelectedModelName(m.name);
        applyControlsForModel(m.id, false, true);
        if (isMC) {
          // Motion-control: prompt is editable, video+image are needed
          setPromptDisabled(false);
        } else {
          setPrompt("");
          setPromptDisabled(true);
        }
      } else {
        if (v2vMode) {
          setV2vMode(false);
          setUploadedVideoUrl(null);
          setUploadedVideoName(null);
          setPromptDisabled(false);
        }
        const nextImageMode = category === "i2v";
        if (!nextImageMode && imageMode) {
          setUploadedImageUrl(null);
          setUploadedImageUrls([]);
          setUploadedEndImageUrl(null);
        }
        setImageMode(nextImageMode);
        setSelectedModel(m.id);
        setSelectedModelName(m.name);
        applyControlsForModel(m.id, nextImageMode, false);
      }
    },
    [v2vMode, imageMode, applyControlsForModel],
  );

  // ── add to local history ──────────────────────────────────────────────────
  const addToLocalHistory = useCallback((entry) => {
    setLocalHistory((prev) => [entry, ...prev].slice(0, 30));
    setActiveHistoryIdx(0);
  }, []);

  // ── show result in canvas ─────────────────────────────────────────────────
  const showVideoInCanvas = useCallback((url, model) => {
    setCanvasUrl(url);
    setCanvasModel(model);
    setShowCanvas(true);
  }, []);

  // ── generate ──────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const currentModel = getCurrentModel();
    let trimmedPrompt = prompt.trim();

    // Validate BEFORE any async work — an early return after setGenerating
    // would strand the placeholder spinner forever.
    if (v2vMode) {
      if (!uploadedVideoUrl) {
        alert("Please upload a video first.");
        return;
      }
      if (currentModel?.imageField && !uploadedImageUrl) {
        alert("Please upload a reference image for motion control.");
        return;
      }
      if (currentModel?.promptRequired && !trimmedPrompt) {
        alert("Please describe the motion you want.");
        return;
      }
    } else if (imageMode) {
      const maxImgs = maxImagesFor(selectedModel);
      if (maxImgs > 2 ? uploadedImageUrls.length === 0 : !uploadedImageUrl) {
        alert("Please upload a start frame image first.");
        return;
      }
    } else {
      if (!trimmedPrompt) {
        alert("Please enter a prompt to generate a video.");
        return;
      }
    }

    // Money guard: an app error message pasted into the prompt box once
    // became a paid render of the words "Generation failed".
    if (/generation failed|unsupported use of '|invalid value for '/i.test(trimmedPrompt)) {
      toast.error("This looks like an app error message, not a prompt. Clear it and describe the video.");
      return;
    }

    // Pre-flight: proper names on ByteDance models get flagged as copyright by
    // their moderation — warn before burning the render (Enhance rewrites them).
    if (isByteDanceModel(currentModel?.id) && !enhanceOn && trimmedPrompt) {
      const names = detectProperNames(trimmedPrompt);
      if (names.length) {
        toast(
          `Nomes próprios (${names.slice(0, 4).join(", ")}) viram descrições visuais — a moderação da ByteDance bloqueia nomes por copyright.`,
          { duration: 7000, id: "preflight-names" },
        );
      }
    }

    onGenerationStart?.();
    setGenerating(true);
    setGenerateError(null);

    if (enhanceOn && trimmedPrompt) {
      // placeholder is already visible while the prompt is enriched
      trimmedPrompt = await enhancePrompt(trimmedPrompt, "video", currentModel?.id);
    }
    // Name scrub runs ALWAYS on ByteDance video, exactly as Cinema does.
    // It used to ride inside enhancePrompt only, so turning Enhance off sent
    // proper names straight into a moderation block — warning the user was
    // never a fix. No-ops for every other family.
    if (trimmedPrompt) {
      trimmedPrompt = await scrubForByteDance(trimmedPrompt, currentModel?.id, "video");
    }

    let hadError = false;

    try {
      let res;

      if (v2vMode) {
        // V2V: dedicated processV2V handles single-input tools (e.g. watermark
        // remover) and motion-control models (which take video + image + prompt)
        const v2vParams = {
          model: selectedModel,
          video_url: uploadedVideoUrl,
        };
        if (currentModel?.imageField && uploadedImageUrl) {
          v2vParams.image_url = uploadedImageUrl;
        }
        if (currentModel?.hasPrompt && trimmedPrompt) {
          v2vParams.prompt = trimmedPrompt;
        }
        res = await processV2V(apiKey, v2vParams);
        if (!res?.url) throw new Error("No video URL returned by API");

        const genId = res.id || Date.now().toString();
        setLastGenerationId(null);
        setLastGenerationModel(null);
        const entry = {
          id: genId,
          url: res.url,
          prompt: currentModel?.hasPrompt ? trimmedPrompt : "",
          model: selectedModel,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(res.url, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: res.url,
            model: selectedModel,
            prompt: currentModel?.hasPrompt ? trimmedPrompt : "",
            type: "video",
          });
      } else if (imageMode) {
        const maxImgs = getMaxImagesForI2VModel(selectedModel);
        const i2vParams = { model: selectedModel };
        if (maxImgs > 2) {
          i2vParams.images_list = uploadedImageUrls;
        } else {
          i2vParams.image_url = uploadedImageUrl;
        }
        // Normalize @img1 → @image1 (native multi-reference syntax on Seedance-class models)
        if (trimmedPrompt) {
          const roleIdx = (role) => uploadedImageUrls.findIndex((u) => elementRoles[u] === role);
          let vPrompt = trimmedPrompt
            .replace(/@char(?:acter)?\b/gi, () => { const i = roleIdx("character"); return i >= 0 ? `@image${i + 1}` : "@character"; })
            .replace(/@loc(?:ation)?\b/gi, () => { const i = roleIdx("location"); return i >= 0 ? `@image${i + 1}` : "@location"; })
            .replace(/@prop\b/gi, () => { const i = roleIdx("prop"); return i >= 0 ? `@image${i + 1}` : "@prop"; })
            .replace(/@im(?:g|age)\s?(\d{1,2})/gi, "@image$1");
          const elementNotes = uploadedImageUrls
            .map((u, i) => {
              const role = elementRoles[u];
              if (role === "character") return `Character element: @image${i + 1}.`;
              if (role === "location") return `Location element: @image${i + 1}.`;
              if (role === "prop") return `Prop element: @image${i + 1}.`;
              return null;
            })
            .filter(Boolean);
          if (elementNotes.length) vPrompt = `${vPrompt} ${elementNotes.join(" ")}`;
          i2vParams.prompt = vPrompt;
        }
        i2vParams.__audio = audioOn;
        i2vParams.aspect_ratio = selectedAr;
        const i2vModel = i2vModels.find((m) => m.id === selectedModel);
        if (uploadedEndImageUrl && i2vModel?.lastImageField) {
          i2vParams.last_image = uploadedEndImageUrl;
        }
        const durations = getDurationsForI2VModel(selectedModel);
        if (durations.length > 0) i2vParams.duration = selectedDuration;
        const resolutions = getResolutionsForI2VModel(selectedModel);
        if (resolutions.length > 0) i2vParams.resolution = selectedResolution;
        if (selectedQuality) i2vParams.quality = selectedQuality;
        if (selectedMode) i2vParams.mode = selectedMode;
        if (showEffect && selectedEffect) i2vParams.name = selectedEffect;

        res = await generateI2V(apiKey, i2vParams);
        if (!res?.url) throw new Error("No video URL returned by API");
        if (res.reroutedTo) {
          toast(
            `A moderação da ByteDance vetou o frame (rosto realista). Gerado automaticamente no ${res.reroutedTo.includes("3-pro") ? "Kling 3 Pro" : "Kling 3 Standard"} — sem cobrança dupla.`,
            { duration: 9000, icon: "🔀" },
          );
        }

        const genId = res.id || Date.now().toString();
        if (selectedModel === "seedance-v2.0-i2v") {
          setLastGenerationId(genId);
          setLastGenerationModel(selectedModel);
        } else {
          setLastGenerationId(null);
          setLastGenerationModel(null);
        }
        const entry = {
          id: genId,
          url: res.url,
          prompt: trimmedPrompt,
          model: res.reroutedTo || selectedModel,
          cost: typeof res.cost === "number" ? res.cost : null,
          aspect_ratio: selectedAr,
          duration: selectedDuration,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(res.url, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: res.url,
            model: selectedModel,
            prompt: trimmedPrompt,
            type: "video",
          });
      } else {
        // T2V (including extend mode)
        const params = { model: selectedModel };
        if (trimmedPrompt) params.prompt = trimmedPrompt;
        params.__audio = audioOn;

        if (isExtendMode) {
          params.request_id = lastGenerationId;
          // Optional reference media for Seedance 2.0 Extend:
          // images map to @image2…@image9 and videos map to @video1…@video3 in the prompt
          if (uploadedImageUrls.length > 0) {
            params.images_list = uploadedImageUrls;
          }
          if (uploadedVideoUrl) {
            params.videos_list = [uploadedVideoUrl];
          }
        } else {
          params.aspect_ratio = selectedAr;
        }

        const durations = getDurationsForModel(selectedModel);
        if (durations.length > 0) params.duration = selectedDuration;
        const resolutions = getResolutionsForVideoModel(selectedModel);
        if (resolutions.length > 0) params.resolution = selectedResolution;
        if (selectedQuality) params.quality = selectedQuality;
        if (selectedMode) params.mode = selectedMode;

        res = await generateVideo(apiKey, params);
        if (!res?.url) throw new Error("No video URL returned by API");

        const genId = res.id || Date.now().toString();
        if (
          selectedModel === "seedance-v2.0-t2v" ||
          selectedModel === "seedance-v2.0-i2v"
        ) {
          setLastGenerationId(genId);
          setLastGenerationModel(selectedModel);
        } else {
          setLastGenerationId(null);
          setLastGenerationModel(null);
        }
        const entry = {
          id: genId,
          url: res.url,
          prompt: trimmedPrompt,
          model: selectedModel,
          cost: typeof res.cost === "number" ? res.cost : null,
          aspect_ratio: selectedAr,
          duration: selectedDuration,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(res.url, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: res.url,
            model: selectedModel,
            prompt: trimmedPrompt,
            type: "video",
          });
      }
    } catch (e) {
      hadError = true;
      console.error("[VideoStudio]", e);
      const errMsg = formatErrorMessage(e, "Video generation failed");
      if (onGenerationError) onGenerationError(errMsg);
      else toast.error(errMsg);
    } finally {
      setGenerating(false);
      onGenerationEnd?.();
    }
  }, [
    apiKey,
    prompt,
    v2vMode,
    imageMode,
    selectedModel,
    selectedAr,
    selectedDuration,
    selectedResolution,
    selectedQuality,
    selectedMode,
    selectedEffect,
    showEffect,
    uploadedImageUrl,
    uploadedImageUrls,
    uploadedVideoUrl,
    lastGenerationId,
    getCurrentModel,
    addToLocalHistory,
    showVideoInCanvas,
    onGenerationComplete,
    onGenerationEnd,
    onGenerationError,
    onGenerationStart,
  ]);

  // ── reset to prompt bar ───────────────────────────────────────────────────
  const resetToPromptBar = useCallback(() => {
    setShowCanvas(false);
  }, []);

  const handleNewPrompt = useCallback(() => {
    resetToPromptBar();
    setPrompt("");
    setUploadedImageUrl(null);
    setUploadedImageUrls([]);
    setImageMode(false);
    setUploadedVideoUrl(null);
    setUploadedVideoName(null);
    setV2vMode(false);
    const first = catalogT2v[0] || t2vModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [resetToPromptBar, applyControlsForModel]);

  const handleExtend = useCallback(() => {
    if (!lastGenerationId) return;
    resetToPromptBar();
    setPrompt("");
    setUploadedImageUrl(null);
    setUploadedImageUrls([]);
    setImageMode(false);
    setSelectedModel("seedance-v2.0-extend");
    setSelectedModelName("Seedance 2.0 Extend");
    applyControlsForModel("seedance-v2.0-extend", false, false);
    setPromptDisabled(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [lastGenerationId, resetToPromptBar, applyControlsForModel]);

  // ── derived UI values ────────────────────────────────────────────────────
  const isSeedance2Canvas =
    canvasModel === "seedance-v2.0-t2v" || canvasModel === "seedance-v2.0-i2v";
  const currentModelObj = getCurrentModel();
  const isExtendMode = currentModelObj?.requiresRequestId;
  const canUploadImageReference =
    (!v2vMode || isMotionControlSelection(selectedModel, v2vMode)) &&
    (!isExtendMode || currentModelObj?.inputs?.images_list);

  const promptPlaceholder = v2vMode
    ? currentModelObj?.imageField
      ? currentModelObj?.promptRequired
        ? "Describe the motion"
        : "Describe the motion (optional)"
      : "Video ready — click Generate to remove watermark"
    : imageMode
      ? "Describe the motion or effect (optional)"
      : isExtendMode
        ? "Optional: describe how to continue the video..."
        : "Describe the video you want to create";

  const toggleDropdown = (type) => (e) => {
    e.stopPropagation();
    setOpenDropdown((prev) => (prev === type ? null : type));
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center bg-app-bg relative overflow-hidden"
    >
      {/* ── CENTRAL GALLERY AREA ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2">
        {pendingRenders.length > 0 && (
          <div className="w-full pt-4 space-y-2 animate-fade-in-up">
            {pendingRenders.map((p) => (
              <div key={p.id} className="flex items-center gap-3 bg-[#171719]/90 border border-white/[0.08] rounded-xl px-4 py-3">
                <div className="w-4 h-4 rounded-full border-2 border-white/15 border-t-white/70 animate-spin shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[13px] text-white/85 font-medium truncate">{p.prompt || "Rendering…"}</span>
                  <span className="text-[11px] text-white/40">{p.model || p.provider} · rendering for {Math.max(1, Math.round((Date.now() - (p.startedAt || Date.now())) / 60000))} min</span>
                </div>
                <span className="text-[10px] text-white/35 border border-white/[0.09] rounded-full px-2 py-0.5 shrink-0 capitalize">{p.provider}</span>
              </div>
            ))}
          </div>
        )}
        {history.length > 0 || generating ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full pt-4 animate-fade-in-up">
            {generating && Array.from({ length: 1 }).map((_, i) => (
              <div
                key={`placeholder-${i}`}
                className="relative rounded-2xl overflow-hidden border border-white/[0.07] bg-[#171719] animate-fade-in-up"
                style={{ aspectRatio: selectedAr === "9:16" ? "9/16" : "16/9" }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-white/[0.05] animate-pulse" style={{ filter: "blur(24px)" }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/70 animate-spin" />
                  <span className="text-[13px] font-medium text-white/60 tabular-nums">
                    {typeof genProgress === "number" ? `${Math.round(genProgress)}%` : "Generating…"}
                  </span>
                  {renderElapsed >= 2 && (
                    <span className="text-[11px] tabular-nums text-white/40">
                      {renderRoute ? `via ${renderRoute === "muapi" ? "Muapi" : renderRoute === "fal" ? "fal" : "Runware"} · ` : ""}{renderElapsedLabel}
                    </span>
                  )}
                  {renderRoute === "muapi" && renderElapsed >= 20 && (
                    <span className="text-[11px] text-white/35 text-center px-6">
                      Modelo fechado — no Muapi um render leva 2–5 min. Está vivo, pode navegar.
                    </span>
                  )}
                </div>
              </div>
            ))}
            {history.map((entry, idx) => {
              const isSeedance2 = entry.model === "seedance-v2.0-t2v" || entry.model === "seedance-v2.0-i2v";
              return (
                <div
                  key={entry.id || idx}
                  className="relative group rounded-2xl overflow-hidden border border-white/[0.08] bg-[#171719] shadow-[0_2px_12px_rgba(0,0,0,0.25)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.45)] hover:border-white/[0.16] hover:-translate-y-0.5 transition-[transform,box-shadow,border-color] duration-250 ease-apple flex flex-col cursor-pointer"
                  onClick={() => setLightboxIdx(idx)}
                >
                  <video
                    src={entry.url}
                    onLoadedMetadata={seekPosterFrame}
                    className="w-full aspect-video object-cover bg-black/40 hover:opacity-80 transition-opacity"
                    controls={false}
                    loop
                    muted
                    playsInline
                    onMouseOver={(e) => e.target.play()}
                    onMouseOut={(e) => {
                      e.target.pause();
                      e.target.currentTime = 0;
                    }}
                  />
                  
                  {/* Overlay actions */}
                  <div className="absolute top-2 right-2 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GenerationCopyButtons
                      prompt={entry.prompt}
                      onCopyError={onGenerationError}
                    />
                    <button
                      type="button"
                      title="Download"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFile(entry.url, `video-${entry.id || idx}.mp4`);
                      }}
                      className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </button>
                    {isSeedance2 && (
                      <button
                        type="button"
                        title="Extend this video using Seedance 2.0 Extend"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLastGenerationId(entry.id);
                          handleExtend();
                        }}
                        className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Are you sure you want to delete this generated item?")) {
                          handleDeleteEntry(entry, idx).catch((err) => {
                            onGenerationError?.(err.message || "Failed to delete item");
                          });
                        }
                      }}
                      className="p-2 bg-black/60 backdrop-blur-md rounded-full text-red-400 hover:bg-red-500 hover:text-white transition-all border border-white/10"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                  <MobileGenerationActions
                    prompt={entry.prompt}
                    onCopyError={onGenerationError}
                    actions={[
                      {
                        kind: "download",
                        label: "Download",
                        onSelect: () =>
                          downloadFile(entry.url, `video-${entry.id || idx}.mp4`),
                      },
                      isSeedance2 && {
                        kind: "extend",
                        label: "Extend",
                        onSelect: () => {
                          setLastGenerationId(entry.id);
                          handleExtend();
                        },
                      },
                      {
                        kind: "delete",
                        label: "Delete",
                        danger: true,
                        onSelect: () => {
                          if (confirm("Are you sure you want to delete this generated item?")) {
                            handleDeleteEntry(entry, idx).catch((err) => {
                              onGenerationError?.(err.message || "Failed to delete item");
                            });
                          }
                        },
                      },
                    ]}
                  />

                  {/* Prompt & Details */}
                  <div className="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex-1 flex flex-col justify-between gap-2">
                    <p className="text-white/70 text-xs line-clamp-3 leading-relaxed" title={entry.prompt}>
                      {entry.prompt || "No prompt provided"}
                    </p>
                    <div className="flex items-center justify-between mt-1 flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 whitespace-nowrap capitalize">
                          {entry.model?.replace("-", " ") || "Video Studio"}
                        </span>
                        <div className="flex gap-2">
                          {entry.resolution && (
                            <span className="text-[10px] text-white/40">{entry.resolution}</span>
                          )}
                          {entry.duration && (
                            <span className="text-[10px] text-white/40">{entry.duration}s</span>
                          )}
                          {typeof entry.cost === "number" && (
                            <span className={`text-[10px] font-semibold tabular-nums ${entry.cost === 0 ? "text-emerald-400/70" : "text-white/40"}`}
                              title={entry.cost === 0 ? "Sem custo" : "Custo real cobrado pelo provedor"}>
                              {entry.cost === 0 ? "grátis" : `${entry.costEstimated ? "~" : ""}$${entry.cost.toFixed(3)}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-700 min-h-[50vh]">
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-center px-4 flex flex-col items-center">
              <span className="text-white/50 font-medium text-sm sm:text-base tracking-normal mb-2">Start creating with</span>
              <span className="text-white/95 font-semibold text-3xl sm:text-5xl tracking-tight pb-1">
                {selectedModelName}
              </span>
            </h1>
            <p className="text-white/40 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4">
              Animate images into stunning AI videos with motion effects
            </p>
          </div>
        )}
      </div>

      {/* ── BOTTOM PROMPT BAR ── */}
      <PromptComposer>
          <div className="flex flex-col gap-3">
            {/* Inline list of uploaded media files */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Main image preview */}
              {uploadedImageUrl && (
                <div className={PROMPT_MEDIA_PREVIEW_CLASS}>
                  <img src={uploadedImageUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={clearImageUpload}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                  >
                    ×
                  </button>
                  {(uploadedEndImageUrl || i2vModels.find((m) => m.id === selectedModel)?.lastImageField) && imageMode && (
                    <span className="absolute bottom-0.5 left-0.5 px-1 h-3.5 bg-black/60 rounded-md text-[7px] font-black text-white/80 leading-none flex items-center justify-center pointer-events-none">
                      START
                    </span>
                  )}
                </div>
              )}

              {/* End frame image preview */}
              {uploadedEndImageUrl && (
                <div className={PROMPT_MEDIA_PREVIEW_CLASS}>
                  <img src={uploadedEndImageUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={clearEndImage}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                  >
                    ×
                  </button>
                  <span className="absolute bottom-0.5 left-0.5 px-1 h-3.5 bg-black/60 rounded-md text-[7px] font-black text-white/80 leading-none flex items-center justify-center pointer-events-none">
                    END
                  </span>
                </div>
              )}

              {/* Video preview */}
              {uploadedVideoUrl && (
                <div className={PROMPT_MEDIA_PREVIEW_CLASS}>
                  <video src={uploadedVideoUrl} className="w-full h-full object-cover" muted />
                  <button
                    type="button"
                    onClick={clearVideoUpload}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Multiple images layout if supported */}
              {imageMode && getMaxImagesForI2VModel(selectedModel) > 2 && (
                <>
                  {uploadedImageUrls.map((url, idx) => (
                    <div key={url} className={`${PROMPT_MEDIA_PREVIEW_CLASS} border-2 ${(ELEMENT_COLORS[elementRoles[url] || "generic"]).ring}`}>
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImageAtIndex(idx)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                      >
                        ×
                      </button>
                      <span className={`absolute bottom-0.5 right-0.5 px-1 h-3.5 rounded-full text-[8px] font-black leading-none flex items-center justify-center pointer-events-none ${elementRoles[url] ? (ELEMENT_COLORS[elementRoles[url]]).chip : "bg-black/60 text-white/80"}`}>
                        {elementRoles[url] ? (ELEMENT_COLORS[elementRoles[url]]).label : idx + 1}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* Upload trigger buttons */}
              {/* Image upload button — shown when the model accepts image input:
                  • T2V mode: uploading an image auto-switches to the sibling I2V model
                  • I2V mode: uploading the start-frame (multi-image logic applies)
                  • V2V motion-control: reference image is required alongside the video
                  • T2V with inputs.images_list: optional reference images (e.g. Seedance 2.0 Extend)
                  • Hidden in regular V2V mode (watermark remover etc. needs no image)
                  • Hidden for extend-type models without inputs.images_list */}
              {canUploadImageReference && (
                getMaxImagesForI2VModel(selectedModel) > 2 ? (
                  uploadedImageUrls.length < getMaxImagesForI2VModel(selectedModel) && (
                    <div className="relative">
                      <input
                        ref={imageFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageFileChange}
                      />
                      <button
                        type="button"
                        title="Upload reference image"
                        onClick={() => imageFileInputRef.current?.click()}
                        className={promptMediaButtonClassName()}
                      >
                        {imageUploading ? (
                          <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
                            <svg className="w-8 h-8 -rotate-90">
                              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-white/10" />
                              <circle
                                cx="16"
                                cy="16"
                                r="14"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="transparent"
                                strokeDasharray={88}
                                strokeDashoffset={88 - (88 * imageProgress) / 100}
                                className="text-white/80 transition-all duration-300"
                              />
                            </svg>
                            <span className="absolute text-[9px] font-black text-white/80 leading-none">{imageProgress}%</span>
                          </div>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/40 group-hover:text-white/80 transition-colors">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                ) : (
                  !uploadedImageUrl && (
                    <div className="relative">
                      <input
                        ref={imageFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageFileChange}
                      />
                      <button
                        type="button"
                        title="Upload reference image"
                        onClick={() => imageFileInputRef.current?.click()}
                        className={promptMediaButtonClassName()}
                      >
                        {imageUploading ? (
                          <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
                            <svg className="w-8 h-8 -rotate-90">
                              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-white/10" />
                              <circle
                                cx="16"
                                cy="16"
                                r="14"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="transparent"
                                strokeDasharray={88}
                                strokeDashoffset={88 - (88 * imageProgress) / 100}
                                className="text-white/80 transition-all duration-300"
                              />
                            </svg>
                            <span className="absolute text-[9px] font-black text-white/80 leading-none">{imageProgress}%</span>
                          </div>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/40 group-hover:text-white/80 transition-colors">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                )
              )}

              {/* Elements: categorized references (multi-image models) */}
              {imageMode && getMaxImagesForI2VModel(selectedModel) > 2 &&
                uploadedImageUrls.length < getMaxImagesForI2VModel(selectedModel) && (
                <div className="flex items-center gap-1.5">
                  {[
                    ["character", "Char", "#30D158"],
                    ["location", "Loc", "#64D2FF"],
                    ["prop", "Prop", "#FF9F0A"],
                  ].map(([role, label, color]) => (
                    <button
                      key={role}
                      type="button"
                      title={`Adicionar elemento: ${label}`}
                      onClick={() => {
                        pendingElementRole.current = role;
                        imageFileInputRef.current?.click();
                      }}
                      className="pressable h-[38px] px-2.5 rounded-lg border text-[11px] font-semibold"
                      style={{ color, borderColor: `${color}44`, background: `${color}14` }}
                    >
                      + {label}
                    </button>
                  ))}
                </div>
              )}

              {/* End frame image button */}
              {imageMode && i2vModels.find((m) => m.id === selectedModel)?.lastImageField && !uploadedEndImageUrl && (
                <div className="relative">
                  <input
                    ref={endImageFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleEndImageFileChange}
                  />
                  <button
                    type="button"
                    title="End frame — the video will finish on this image (optional)"
                    onClick={() => endImageFileInputRef.current?.click()}
                    className={promptMediaButtonClassName()}
                  >
                    <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white/80 text-[7px] font-medium text-center leading-3 pointer-events-none z-10">
                      END
                    </span>
                    {endImageUploading ? (
                      <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
                        <svg className="w-8 h-8 -rotate-90">
                          <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-white/10" />
                          <circle
                            cx="16"
                            cy="16"
                            r="14"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="transparent"
                            strokeDasharray={88}
                            strokeDashoffset={88 - (88 * endImageProgress) / 100}
                            className="text-white/80 transition-all duration-300"
                          />
                        </svg>
                        <span className="absolute text-[9px] font-black text-white/80 leading-none">{endImageProgress}%</span>
                      </div>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/40 group-hover:text-white/80 transition-colors">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    )}
                  </button>
                </div>
              )}

              {/* Video upload button — shown when a V2V model is active, OR when
                  the current model has inputs.video_files (e.g. Seedance 2.0 Extend). */}
              {!uploadedVideoUrl && (v2vMode || currentModelObj?.inputs?.video_files) && (
                <div className="relative">
                  <input
                    ref={videoFileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleVideoFileChange}
                  />
                  <button
                    type="button"
                    title="Upload video to remove watermark"
                    onClick={() => videoFileInputRef.current?.click()}
                    className={promptMediaButtonClassName()}
                  >
                    {videoUploading ? (
                      <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
                        <svg className="w-8 h-8 -rotate-90">
                          <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-white/10" />
                          <circle
                            cx="16"
                            cy="16"
                            r="14"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="transparent"
                            strokeDasharray={88}
                            strokeDashoffset={88 - (88 * videoProgress) / 100}
                            className="text-white/80 transition-all duration-300"
                          />
                        </svg>
                        <span className="absolute text-[9px] font-black text-white/80 leading-none">{videoProgress}%</span>
                      </div>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className="text-white/40 group-hover:text-white/80 transition-colors"
                      >
                        <polygon points="23 7 16 12 23 17 23 7" fill="currentColor" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" fill="currentColor" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Prompt textarea */}
            <div className="flex-1 flex flex-col gap-1">
              {imageMode && (() => {
                const capModel = i2vModels.find((m) => m.id === selectedModel);
                const capMax = getMaxImagesForI2VModel(selectedModel);
                if (!capModel) return null;
                return (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {capModel.lastImageField && (
                      <span className="text-[10px] text-white/35 border border-white/[0.07] rounded-full px-2 py-0.5 whitespace-nowrap">
                        First + last frame
                      </span>
                    )}
                    {capMax > 1 && (
                      <span className="text-[10px] text-white/35 border border-white/[0.07] rounded-full px-2 py-0.5 whitespace-nowrap">
                        {`Up to ${capMax} images`}
                      </span>
                    )}
                    {capMax > 2 && (
                      <span className="text-[10px] text-white/35 border border-white/[0.07] rounded-full px-2 py-0.5 whitespace-nowrap">
                        @img refs
                      </span>
                    )}
                  </div>
                );
              })()}

              <PromptMentionTextarea
                ref={textareaRef}
                value={prompt}
                onChange={handlePromptInput}
                placeholder={promptPlaceholder}
                disabled={promptDisabled}
                mentions={imageMode && getMaxImagesForI2VModel(selectedModel) > 2 ? elementMentions : []}
              />
            </div>
          </div>

          {/* Extend banner */}
          {isExtendMode && (
            <div className="flex items-center gap-2 px-3 py-1.5 mx-3 bg-primary/5 border border-primary/10 rounded-lg text-[10px] text-primary/80 font-medium tracking-tight">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span>Extending previous Seedance 2.0 generation</span>
            </div>
          )}

          {/* Bottom row: controls + generate */}
          <PromptFooter>
            <GenerationControls
              features={{
                enhance: true,
                model: true,
                aspect: true,
                quality: getCurrentResolutions(selectedModel).length > 0,
                qualityOptions: getCurrentResolutions(selectedModel),
                duration: getCurrentDurations(selectedModel).length > 0,
                durationOptions: getCurrentDurations(selectedModel),
                audio: !!audioControl,
              }}
              modelKind="video"
              models={imageMode ? catalogI2v : catalogT2v}
              value={{
                enhance: enhanceOn,
                modelId: selectedModel,
                aspect: selectedAr,
                quality: selectedResolution,
                duration: selectedDuration,
                audio: audioOn,
              }}
              onChange={(patch) => {
                if ("enhance" in patch) toggleEnhance();
                if (patch.modelId) {
                  const list = imageMode ? catalogI2v : catalogT2v;
                  const m = list.find((x) => x.id === patch.modelId);
                  if (m) handleModelSelect(m);
                }
                if (patch.aspect) setSelectedAr(patch.aspect);
                if (patch.quality) setSelectedResolution(patch.quality);
                if (patch.duration) setSelectedDuration(patch.duration);
                if ("audio" in patch) toggleAudio();
              }}
            >
              {/* Effect btn */}
              {showEffect && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("effect")}
                    className={promptControlClassName({
                      active: openDropdown === "effect",
                    })}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="opacity-40 text-white"
                    >
                      <path d="M5 3l14 9-14 9V3z" />
                    </svg>
                    <span className={`${PROMPT_CONTROL_LABEL_CLASS} max-w-[140px] truncate`}>
                      {selectedEffect || "Effect"}
                    </span>
                  </button>
                  {openDropdown === "effect" && (
                    <PromptPopover
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-[200px]"
                    >
                      <PromptPopoverHeader>
                        Effect Type
                      </PromptPopoverHeader>
                      <PromptMenuList>
                        {getEffectsForI2VModel(selectedModel).map((eff) => (
                          <PromptMenuItem
                            key={eff}
                            selected={selectedEffect === eff}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEffect(eff);
                              setOpenDropdown(null);
                            }}
                          >
                            {eff}
                          </PromptMenuItem>
                        ))}
                      </PromptMenuList>
                    </PromptPopover>
                  )}
                </div>
              )}

            </GenerationControls>

            {/* Generate button */}
            <PromptAction
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <span className="animate-spin inline-block text-black">
                    ◌
                  </span>{" "}
                  Generating...
                </>
              ) : (
                <>
                  <span>Generate</span>
                </>
              )}
            </PromptAction>
          </PromptFooter>
      </PromptComposer>

      {/* ── FULLSCREEN VIDEO MODAL ── */}
      {lightboxIdx !== null && (
        <Lightbox
          items={history.map((e) => ({ ...e, type: "video" }))}
          index={Math.min(lightboxIdx, history.length - 1)}
          onClose={() => setLightboxIdx(null)}
          onNavigate={setLightboxIdx}
        />
      )}

      {fullscreenUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
          onClick={() => setFullscreenUrl(null)}
        >
          <button
            type="button"
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenUrl(null);
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <video 
            src={fullscreenUrl} 
            controls 
            autoPlay 
            loop 
            className="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl object-contain animate-scale-up" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <DrawModal
        isOpen={isDrawModalOpen}
        onClose={() => setIsDrawModalOpen(false)}
        apiKey={apiKey}
        batchSize={1}
        onAddHistoryItem={handleDrawReference}
      />
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} toastOptions={{ duration: 5000, style: { background: '#18181b', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', fontSize: '13px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', maxWidth: '440px', wordBreak: 'break-word', whiteSpace: 'pre-wrap', padding: '12px 16px' } }} />
    </div>
  );
}
