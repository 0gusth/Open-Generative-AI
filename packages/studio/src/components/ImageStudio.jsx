"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import toast, { Toaster } from "react-hot-toast";
import { generateImage, generateI2I, uploadFile } from "../muapi.js";
import { formatErrorMessage } from "../utils/formatError.js";
import { scopedPersistKey, migrateLegacyPersistKey } from "../persistKey.js";
import DrawModal from "./DrawModal.jsx";
import MobileGenerationActions, {
  GenerationCopyButtons,
} from "./MobileGenerationActions.jsx";
import {
  t2iModels,
  i2iModels,
  getAspectRatiosForModel,
  getResolutionsForModel,
  getQualityFieldForModel,
  getAspectRatiosForI2IModel,
  getResolutionsForI2IModel,
  getQualityFieldForI2IModel,
  getMaxImagesForI2IModel,
  getEffectsForI2IModel,
  getDefaultEffectForI2IModel,
  getI2IModelById,
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
  PromptMentionTextarea,
  PromptQualityIcon,
  PromptTextarea,
  promptControlClassName,
  promptMediaButtonClassName,
} from "./prompt/PromptComposer.jsx";
import { modelSpeedTier, SPEED_BADGES } from "../utils/modelSpeed.js";
import { compileCinematography } from "../cinema/compiler.js";
import { GENRES, ERAS } from "../cinema/filmSetup.js";
import { CINEMA_CAMERAS, PHOTO_CAMERAS, CINE_LENSES, PHOTO_LENSES, FILM_STOCKS, APERTURES } from "../cinema/gear.js";
import { PALETTES } from "../cinema/palettes.js";
import { LIGHTING } from "../cinema/lighting.js";
import { fetchLedger, fetchPending, reconcilePending } from "../ledger.js";
import Lightbox, { downloadMedia } from "./Lightbox.jsx";
import { enhancePrompt } from "../providers.js";

// Guards against re-processing the same dropped/pasted batch when effects
// re-fire (dependency identity churn + React StrictMode double-invoke).
const processedDropBatches = new WeakSet();

// Labeled reference field: click to pick, or drag an image straight onto it.
function RefField({ label, color, onFiles, onClick }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
        if (files.length) onFiles(files);
      }}
      className="group/ref h-9 px-3 flex items-center gap-2 rounded-lg border cursor-pointer select-none transition-[background-color,border-color,transform,box-shadow] duration-150 active:scale-[0.97]"
      style={{
        borderColor: over ? color : "rgba(255,255,255,0.07)",
        background: over ? `${color}1f` : "rgba(255,255,255,0.04)",
        boxShadow: over ? `0 0 0 3px ${color}26` : "none",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className={`text-[12px] font-medium whitespace-nowrap transition-colors duration-150 ${over ? "text-white" : "text-white/60 group-hover/ref:text-white/85"}`}>{label}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={over ? "text-white" : "text-white/30"}><path d="M12 5v14M5 12h14" /></svg>
    </div>
  );
}
// ─── helpers ────────────────────────────────────────────────────────────────

// Shared with the lightbox: blob download with a proxy-media fallback for
// CDNs that refuse cross-origin fetches (window.open just opened a tab).
const downloadImage = (url, filename) => downloadMedia(url, filename);

// ─── UploadButton (inline picker) ───────────────────────────────────────────

function UploadButton({ apiKey, maxImages, onSelect, onClear, initialUrls = [], label = null, persistedHistory = null, onHistoryChange = null }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState([]); // [{url, thumbnail}]
  const [uploadHistory, setUploadHistory] = useState(persistedHistory || []); // [{id, name, url, thumbnail}]

  // Notify parent whenever uploadHistory changes (for localStorage persistence)
  const onHistoryChangeRef = useRef(onHistoryChange);
  onHistoryChangeRef.current = onHistoryChange;
  useEffect(() => {
    onHistoryChangeRef.current?.(uploadHistory);
  }, [uploadHistory]);

  // Sync if parent provides a new persistedHistory (e.g. on first mount from localStorage)
  useEffect(() => {
    if (persistedHistory && persistedHistory.length > 0) {
      setUploadHistory((prev) => {
        // Merge: add any entries from persistedHistory that aren't already present
        const existingUrls = new Set(prev.map(h => h.url));
        const missing = persistedHistory.filter(h => h.url && !existingUrls.has(h.url));
        return missing.length > 0 ? [...prev, ...missing] : prev;
      });
    }
  }, [persistedHistory]);
  
  const [lastUploadProgress, setLastUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setPanelOpen(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [panelOpen]);

  // Sync initialUrls from parent (e.g. restored from localStorage)
  useEffect(() => {
    if (initialUrls && initialUrls.length > 0) {
      // Avoid infinite loops by only updating if URLs actually changed
      const currentUrls = selectedEntries.map(e => e.url);
      const isSame = initialUrls.length === currentUrls.length && initialUrls.every(u => currentUrls.includes(u));
      if (isSame) return;

      const newEntries = initialUrls.map(url => ({ url }));
      setSelectedEntries(newEntries);
      
      // Also ensure they are in the history panel
      setUploadHistory(prev => {
        const existingUrls = prev.map(h => h.url);
        const missing = initialUrls
          .filter(u => !existingUrls.includes(u))
          .map(u => ({ id: `restored-${u}`, name: "Restored Image", url: u, progress: 100 }));
        return [...missing, ...prev];
      });
    }
  }, [initialUrls]); // eslint-disable-line react-hooks/exhaustive-deps

  // When maxImages changes, trim excess selections
  useEffect(() => {
    if (selectedEntries.length > maxImages) {
      const trimmed = selectedEntries.slice(0, maxImages);
      setSelectedEntries(trimmed);
      if (trimmed.length === 0) onClear?.();
    }
    if (fileInputRef.current) {
      fileInputRef.current.multiple = maxImages > 1;
    }
  }, [maxImages]); // eslint-disable-line react-hooks/exhaustive-deps

  const fireOnSelect = useCallback(
    (entries) => {
      if (!entries.length) return;
      const urls = entries.map((e) => e.url);
      onSelect({ url: urls[0], urls, thumbnail: entries[0].url });
    },
    [onSelect],
  );

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const tooLarge = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      alert(
        `The following images are too large (max 10MB): ${tooLarge.map((f) => f.name).join(", ")}`,
      );
      return;
    }

    setUploading(true);
    try {
      const toUpload =
        maxImages === 1
          ? files.slice(0, 1)
          : files.slice(0, Math.max(0, maxImages - selectedEntries.length));
      if (toUpload.length === 0) {
        toast.error(`Limit of ${maxImages} reference images reached — remove one first.`);
        return;
      }

      await Promise.all(
        toUpload.map(async (file) => {
          const id = Date.now().toString() + Math.random();

          // Add a placeholder to history immediately without local preview
          const placeholder = { id, name: file.name, url: null, progress: 0 };
          setUploadHistory((prev) => [placeholder, ...prev]);

          try {
            const uploadedUrl = await uploadFile(apiKey, file, (pct) => {
              setLastUploadProgress(pct);
              setUploadHistory((prev) =>
                prev.map((h) => (h.id === id ? { ...h, progress: pct } : h)),
              );
            });

            // Update history with real URL and Mark as 100%
            setUploadHistory((prev) =>
              prev.map((h) => {
                if (h.id === id) {
                  return { ...h, url: uploadedUrl, progress: 100 };
                }
                return h;
              }),
            );

            // Auto-select if there's room. Functional update: parallel
            // uploads all captured the same stale length, so the cap check
            // must happen against the CURRENT list, inside the updater.
            const newEntry = { url: uploadedUrl };
            setSelectedEntries((prev) =>
              prev.length < maxImages ? [...prev, newEntry] : prev,
            );
            if (maxImages === 1) {
              fireOnSelect([newEntry]);
              setPanelOpen(false);
            }
          } catch (err) {
            console.error("[UploadButton] Upload failed for", file.name, err);
            setUploadHistory((prev) => prev.filter((h) => h.id !== id));
            throw err;
          }
        }),
      );
    } catch (err) {
      alert(`Image upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setLastUploadProgress(0);
    }
  };

  const handleCellClick = (entry) => {
    const selIdx = selectedEntries.findIndex((e) => e.url === entry.url);
    const isSelected = selIdx !== -1;
    const atMax =
      maxImages > 1 && !isSelected && selectedEntries.length >= maxImages;
    if (atMax) return;

    if (maxImages === 1) {
      const newSelected = [{ url: entry.url, localUrl: entry.localUrl }];
      setSelectedEntries(newSelected);
      fireOnSelect(newSelected);
      setPanelOpen(false);
    } else {
      let next;
      if (isSelected) {
        next = selectedEntries.filter((_, i) => i !== selIdx);
        if (next.length === 0) onClear?.();
      } else {
        next = [
          ...selectedEntries,
          { url: entry.url, localUrl: entry.localUrl },
        ];
      }
      setSelectedEntries(next);
    }
  };

  const handleRemoveFromHistory = (e, entry) => {
    e.stopPropagation();
    if (entry.localUrl) URL.revokeObjectURL(entry.localUrl);
    setUploadHistory((prev) => prev.filter((h) => h.id !== entry.id));

    const next = selectedEntries.filter((s) => s.url !== entry.url);
    if (next.length !== selectedEntries.length) {
      setSelectedEntries(next);
      if (next.length === 0) onClear?.();
    }
  };

  const handleDone = (e) => {
    e.stopPropagation();
    fireOnSelect(selectedEntries);
    setPanelOpen(false);
  };

  const reset = () => {
    setSelectedEntries([]);
    setPanelOpen(false);
  };

  // expose reset via ref pattern — parent calls reset() directly
  // (handled by parent through uploadedImageUrls state reset)

  const isMulti = maxImages > 1;
  const count = selectedEntries.length;
  const hasSelection = count > 0;

  // Trigger icon content
  const triggerContent = uploading ? (
    <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
      <svg className="w-8 h-8 -rotate-90">
        <circle
          cx="16"
          cy="16"
          r="14"
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          className="text-white/10"
        />
        <circle
          cx="16"
          cy="16"
          r="14"
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          strokeDasharray={88}
          strokeDashoffset={88 - (88 * lastUploadProgress) / 100}
          className="text-white/80 transition-all duration-300"
        />
      </svg>
      <span className="absolute text-[9px] font-black text-white/80 leading-none">
        {lastUploadProgress}%
      </span>
    </div>
  ) : label === "Swap Face" ? (
    hasSelection ? (
      <img src={selectedEntries[0].url} alt="" className="w-full h-full object-cover" />
    ) : (
      <span className="text-[10px] font-bold text-white/50">Face</span>
    )
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );

  const defaultLabel = isMulti ? `Add up to ${maxImages} images` : "Reference image";
  const triggerTitle = hasSelection
    ? count > 1
      ? `${count} of ${maxImages} images selected — click to manage`
      : isMulti
        ? `1 image selected — click to add more (up to ${maxImages})`
        : label || "Reference image"
    : label || defaultLabel;

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={isMulti}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        title={triggerTitle}
        onClick={(e) => {
          e.stopPropagation();
          setPanelOpen((o) => !o);
        }}
        className={promptMediaButtonClassName({
          active: hasSelection,
        })}
      >
        {triggerContent}
      </button>

      {/* Panel */}
      {panelOpen && (
        <PromptPopover
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className="w-96 max-w-[calc(100vw-2rem)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-1 pb-3 mb-2 border-b border-white/5">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-secondary">
                Reference Images
              </span>
              {isMulti && (
                <span className="text-[9px] text-muted">
                  Select up to {maxImages} images
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isMulti && hasSelection && (
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-black rounded-xl text-xs font-black transition-all hover:scale-105"
                >
                  ✓ Done ({count})
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-full text-xs font-bold transition-all border border-primary/20"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {isMulti ? "Upload files" : "Upload new"}
              </button>
            </div>
          </div>

          {/* Grid or empty state */}
          {uploadHistory.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-2 opacity-40">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-secondary"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-xs text-secondary">No uploads yet</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
              {uploadHistory.map((entry) => {
                const selIdx = selectedEntries.findIndex(
                  (e) => e.url === entry.url,
                );
                const isSelected = selIdx !== -1;
                const atMax =
                  isMulti && !isSelected && selectedEntries.length >= maxImages;

                return (
                  <div
                    key={entry.id}
                    title={entry.name}
                    onClick={() => entry.url && handleCellClick(entry)}
                    className={`relative rounded-xl overflow-hidden border-2 cursor-pointer group/cell aspect-square transition-all ${
                      isSelected
                        ? "border-primary shadow-glow"
                        : "border-white/10 hover:border-white/30"
                    } ${atMax ? "opacity-40 cursor-not-allowed" : ""} ${!entry.url ? "cursor-wait" : ""}`}
                  >
                    {entry.url ? (
                      <img
                        src={entry.url}
                        alt={entry.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex flex-col items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-1" />
                        <span className="text-[10px] font-black text-primary">
                          {entry.progress}%
                        </span>
                      </div>
                    )}

                    {/* Hover overlay with delete */}
                    {entry.url && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-end justify-end p-1">
                        <button
                          type="button"
                          title="Remove from history"
                          onClick={(e) => handleRemoveFromHistory(e, entry)}
                          className="w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-md flex items-center justify-center transition-colors"
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Selection badge */}
                    {isSelected && (
                      <div className="absolute top-1 left-1 min-w-[20px] h-5 bg-primary rounded-full flex items-center justify-center px-1">
                        {isMulti ? (
                          <span className="text-[10px] font-black text-black">
                            {selIdx + 1}
                          </span>
                        ) : (
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="black"
                            strokeWidth="4"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom bar for multi-select */}
          {isMulti && hasSelection && (
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-secondary">
                {count} of {maxImages} selected
              </span>
              <button
                type="button"
                onClick={handleDone}
                className="px-4 py-1.5 bg-primary text-black rounded-xl text-xs font-black transition-all hover:scale-105"
              >
                Use Selected
              </button>
            </div>
          )}
        </PromptPopover>
      )}
    </div>
  );
}

// ─── ModelDropdown ────────────────────────────────────────────────────────────

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

function ModelDropdown({ selectedModel, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const modelCategories = [
    {
      id: "all",
      label: "All",
      entries: [
        ...t2iModels.map((model) => ({ model, category: "t2i" })),
        ...i2iModels.map((model) => ({ model, category: "i2i" })),
      ],
    },
    {
      id: "t2i",
      label: "Text to Image",
      entries: t2iModels.map((model) => ({ model, category: "t2i" })),
    },
    {
      id: "i2i",
      label: "Image to Image",
      entries: i2iModels.map((model) => ({ model, category: "i2i" })),
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

  // Dynamically compute list of providers from the input models list
  const availableProviders = [];
  const seenProviders = new Set();
  
  modelEntries.forEach(({ model: m }) => {
    const pId = m.provider || 'muapi';
    const pName = m.provider_name || 'Muapi';
    if (!seenProviders.has(pId)) {
      seenProviders.add(pId);
      availableProviders.push({ id: pId, name: pName });
    }
  });

  const filtered = modelEntries.filter(({ model: m }) => {
    // 1. Filter by provider tab
    if (selectedProvider !== "all") {
      const pId = m.provider || 'muapi';
      if (pId !== selectedProvider) return false;
    }
    // 2. Filter by search query
    const query = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query)
    );
  });

  const invertLogos = ['openai', 'blackforest', 'runway', 'ideogram', 'lightricks', 'grok'];

  return (
    <div className="flex gap-4 h-full max-h-[60vh] min-h-[350px] overflow-x-hidden">
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

      {/* Right Pane: Search input + Models list */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="border-b border-white/5 shrink-0 pb-2 space-y-2">
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
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0 focus:outline-none"
            />
          </div>
        </div>
        
        <div className="text-xs font-semibold text-secondary py-1 shrink-0 flex items-center justify-between">
          <span>{activeCategory.label} models</span>
          {selectedProvider !== "all" && (
            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-white/60">
              {availableProviders.find(p => p.id === selectedProvider)?.name || selectedProvider}
            </span>
          )}
        </div>
        
        <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2 flex-1">
          {filtered.length === 0 ? (
            <div className="text-xs text-white/30 text-center py-6">
              No models found
            </div>
          ) : (
            filtered.map(({ model: m, category }) => (
              <div
                key={`${category}:${m.id}`}
                ref={selectedModel === m.id ? activeItemRef : null}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(m, category);
                  onClose();
                }}
                className={`flex items-center justify-between p-3 hover:bg-white/5 rounded-lg cursor-pointer transition-all border border-transparent hover:border-white/5 ${
                  selectedModel === m.id ? "bg-white/5 border-white/5" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {PROVIDER_LOGOS[m.provider] ? (
                    <div className="w-8 h-8 rounded-full border border-white/5 overflow-hidden shrink-0 flex items-center justify-center bg-white/[0.02]">
                      <img
                        src={PROVIDER_LOGOS[m.provider]}
                        alt={m.provider_name}
                        className={`w-full h-full object-contain p-1 ${invertLogos.includes(m.provider) ? "invert" : ""}`}
                      />
                    </div>
                  ) : (
                    <div
                      className={`w-8 h-8 ${
                        m.family === "kontext"
                          ? "bg-white/10 text-white/70 border-white/15"
                          : m.family === "effects"
                            ? "bg-white/10 text-white/70 border-white/15"
                            : "bg-primary/10 text-primary border-primary/10"
                      } border rounded-full flex items-center justify-center font-bold text-xs shadow-inner uppercase`}
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
                    {selectedProvider === "all" && m.provider_name && (
                      <span className="text-[9px] text-white/40">
                        {m.provider_name}
                      </span>
                    )}
                  </div>
                </div>
                {selectedModel === m.id && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#EF0328"
                    strokeWidth="4"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SimpleDropdown ───────────────────────────────────────────────────────────

function SimpleDropdown({ title, options, selected, onSelect, onClose }) {
  return (
    <>
      <PromptPopoverHeader>{title}</PromptPopoverHeader>
      <PromptMenuList>
        {options.map((opt) => (
          <PromptMenuItem
            key={opt}
            selected={selected === opt}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(opt);
              onClose();
            }}
          >
            {opt}
          </PromptMenuItem>
        ))}
      </PromptMenuList>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImageStudio({
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
  const LEGACY_PERSIST_KEY = "hg_image_studio_persistent";
  const PERSIST_KEY = scopedPersistKey(LEGACY_PERSIST_KEY, apiKey);
  useEffect(() => {
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, PERSIST_KEY);
  }, [PERSIST_KEY]);

  // ── Model / mode state ──────────────────────────────────────────────────
  const [imageMode, setImageMode] = useState(false); // false=t2i, true=i2i
  const [selectedModelId, setSelectedModelId] = useState(t2iModels[0].id);
  const [selectedModelName, setSelectedModelName] = useState(t2iModels[0].name);
  const [selectedAr, setSelectedAr] = useState(
    t2iModels[0].inputs?.aspect_ratio?.default || "1:1",
  );
  const [selectedQuality, setSelectedQuality] = useState(() => {
    const resolutions = getResolutionsForModel(t2iModels[0].id);
    return resolutions[0] || null;
  });
  const [selectedEffect, setSelectedEffect] = useState("");
  const [maxImages, setMaxImages] = useState(1);

  // ── Prompt / upload state ───────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [swapImageUrl, setSwapImageUrl] = useState(null);
  const [uploadHistory, setUploadHistory] = useState([]); // persisted reference images history

  // ── UI state ────────────────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(null); // 'model' | 'ar' | 'quality' | null
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);

  // ── Canvas / history state ──────────────────────────────────────────────
  const [batchSize, setBatchSize] = useState(1);
  const [localHistory, setLocalHistory] = useState([]); // [{id,url,prompt,model,aspect_ratio,timestamp}]
  const [pendingRenders, setPendingRenders] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [projectsCount, setProjectsCount] = useState(0);
  const [galleryScope, setGalleryScope] = useState(() => {
    if (typeof window === "undefined") return "all";
    return window.localStorage.getItem("gallery_scope") || "all";
  });

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

  const [uploadingPreviews, setUploadingPreviews] = useState([]); // local blob: URLs shown instantly while uploads run
  // Reference roles: which slot each attachment was added through.
  // generic = red (default) · style = yellow · character = green
  const [refRoles, setRefRoles] = useState({});
  const REF_ROLE_COLORS = {
    generic: { ring: "border-[#EF0328]/70", chip: "bg-[#EF0328]" },
    style: { ring: "border-[#FFD60A]/70", chip: "bg-[#FFD60A] !text-black" },
    character: { ring: "border-[#30D158]/70", chip: "bg-[#30D158] !text-black" },
  };
  const promptMentions = useMemo(() => uploadedImageUrls.map((u, i) => {
    const role = refRoles[u];
    if (role === "style") return { token: "@style", thumb: u, color: "#FFD60A" };
    if (role === "character") return { token: "@character", thumb: u, color: "#30D158" };
    return { token: `@img${i + 1}`, thumb: u, color: "#EF0328" };
  }), [uploadedImageUrls, refRoles]);

  const tagRole = useCallback((urls, role) => {
    if (role === "generic") return;
    setRefRoles((prev) => {
      const next = { ...prev };
      urls.forEach((u) => { next[u] = role; });
      return next;
    });
  }, []);

  const styleInputRef = useRef(null);
  const characterInputRef = useRef(null);
  const genericInputRef = useRef(null);

  // Server ledger is the cross-browser source of truth: merge it into the
  // local grid and keep a live view of the pending render queue.
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
      const images = ledger.filter((e) => e.type !== "video");
      setLocalHistory((prev) => {
        const known = new Set(prev.map((e) => e.url));
        const fresh = images.filter((e) => !known.has(e.url));
        if (fresh.length === 0) return prev;
        const merged = [...fresh, ...prev];
        merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return merged.slice(0, 100);
      });
      setPendingRenders((prev) => {
        const next = pending.filter((p) => p.type !== "video");
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

  // Use prop history if provided, otherwise local
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

  // When historyItems is server-backed (White Label / backfilled sessions),
  // localHistory isn't what's rendered — removal has to go through the
  // parent so it deletes server-side (UsageLog + S3) and updates the same
  // state `history` reads from. Falls back to the old local-only removal
  // when there's no server-backed list (e.g. standalone/embedded studio).
  const handleDeleteEntry = useCallback(async (entry) => {
    if (historyItems && onDeleteHistoryItem) {
      await onDeleteHistoryItem(entry);
    } else {
      // Remove by identity, never by index: the rendered list is filtered
      // (project scope), so an index into it deletes the wrong item here.
      setLocalHistory((prev) => prev.filter((h) => h !== entry && (h.id == null || h.id !== entry.id)));
    }
  }, [historyItems, onDeleteHistoryItem]);

  // ── Refs ────────────────────────────────────────────────────────────────
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const uploadPickerResetRef = useRef(null); // not used directly — managed via key

  // ── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [dropdownOpen]);

  // ── Persistence: Load ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.imageMode !== undefined) setImageMode(data.imageMode);
        if (data.selectedModelId) setSelectedModelId(data.selectedModelId);
        if (data.selectedModelName) setSelectedModelName(data.selectedModelName);
        if (data.selectedAr) setSelectedAr(data.selectedAr);
        if (data.selectedQuality) setSelectedQuality(data.selectedQuality);
        if (data.selectedEffect) setSelectedEffect(data.selectedEffect);
        if (data.maxImages) setMaxImages(data.maxImages);
        if (data.prompt) setPrompt(data.prompt);
        if (data.uploadedImageUrls) setUploadedImageUrls(data.uploadedImageUrls);
        if (data.uploadHistory) setUploadHistory(data.uploadHistory);
        if (data.batchSize) setBatchSize(data.batchSize);
        if (data.localHistory) setLocalHistory(data.localHistory);
      }
    } catch (err) {
      console.warn("Failed to load ImageStudio persistence:", err);
    }
  }, []);

  // ── Adjust height on load ────────────────────────────────────────────────
  // ── Persistence: Save ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state = {
          imageMode,
          selectedModelId,
          selectedModelName,
          selectedAr,
          selectedQuality,
          selectedEffect,
          maxImages,
          prompt,
          uploadedImageUrls,
          uploadHistory,
          batchSize,
          localHistory,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to save ImageStudio persistence:", err);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [
    imageMode,
    selectedModelId,
    selectedModelName,
    selectedAr,
    selectedQuality,
    selectedEffect,
    maxImages,
    prompt,
    uploadedImageUrls,
    uploadHistory,
    batchSize,
    localHistory,
  ]);

  // ── Mood: a saved style (or a fresh moodboard read) becomes treatment
  // text appended to the prompt. Image Studio has no gear controls of its
  // own, so the style has to arrive already compiled into words.
  const [styleOpen, setStyleOpen] = useState(false);
  const [savedStyles, setSavedStyles] = useState([]);
  const [activeStyle, setActiveStyle] = useState(null); // { name, text }
  const [moodImages, setMoodImages] = useState([]);
  const [moodBusy, setMoodBusy] = useState(false);
  const moodInputRef = useRef(null);

  useEffect(() => {
    fetch("/api/moodboard").then((r) => r.json())
      .then((d) => setSavedStyles(d.styles || []))
      .catch(() => {});
  }, []);

  // setup → the same treatment blocks Cinema compiles, minus any subject.
  const styleToText = useCallback((setup, signature) => {
    const compiled = compileCinematography({
      ...setup, signature, prompt: "", seedText: "", mode: "image",
    });
    return compiled.prompt;
  }, []);

  const applySavedStyle = useCallback((style) => {
    const text = styleToText(style.setup || {}, style.signature);
    if (!text) { toast.error("Este estilo está vazio."); return; }
    setActiveStyle({ name: style.name, text });
    setMoodImages(style.refs || []);
    setStyleOpen(false);
    toast.success(`Estilo "${style.name}" ativo — entra em toda geração.`);
  }, [styleToText]);

  const uploadMoodImages = useCallback(async (files) => {
    const usable = [...files].filter((f) => f.type.startsWith("image/")).slice(0, 12 - moodImages.length);
    if (!usable.length) return;
    setMoodBusy(true);
    try {
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
  }, [moodImages.length]);

  const readMoodboard = useCallback(async () => {
    if (!moodImages.length) { toast.error("Adicione ao menos uma referência."); return; }
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
          catalogs: {
            genre: slim(GENRES), era: slim(ERAS),
            camera: slim([...CINEMA_CAMERAS, ...PHOTO_CAMERAS]),
            lens: slim([...CINE_LENSES, ...PHOTO_LENSES]),
            aperture: slim(APERTURES), medium: slim(FILM_STOCKS),
            palette: slim(PALETTES), lighting: slim(LIGHTING),
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "falha na leitura");
      const st = d.style;
      const setup = {
        genre: st.genre, era: st.era, camera: st.camera, lens: st.lens,
        aperture: st.aperture, medium: st.medium, palette: st.palette, lighting: st.lighting,
      };
      setActiveStyle({ name: st.name, text: styleToText(setup, st.signature) });
      // Save it so the look is reusable here and in Cinema.
      const saved = await fetch("/api/moodboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", name: st.name, setup, signature: st.signature, reading: st.reading, refs: moodImages }),
      }).then((x) => x.json()).catch(() => null);
      if (saved?.style) setSavedStyles((prev) => [saved.style, ...prev.filter((x) => x.id !== saved.style.id)]);
      toast.success(`Estilo "${st.name}" lido e salvo.`, { id: toastId });
    } catch (e) {
      toast.error(formatErrorMessage(e, "Não consegui ler o moodboard"), { id: toastId });
    } finally {
      setMoodBusy(false);
    }
  }, [moodImages, styleToText]);

  // Fresh view of the attached list for merges that happen AFTER an await —
  // two quick pastes must not clobber each other's result.
  const uploadedImageUrlsRef = useRef(uploadedImageUrls);
  useEffect(() => { uploadedImageUrlsRef.current = uploadedImageUrls; }, [uploadedImageUrls]);

  const processDroppedImages = async (files) => {
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const tooLarge = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      alert(
        `The following images are too large (max 10MB): ${tooLarge.map((f) => f.name).join(", ")}`
      );
      return;
    }

    // Pasting/dropping ADDS to what is already attached (it used to replace
    // the whole list, so the second paste silently erased the first image).
    const room = maxImages === 1 ? 1 : Math.max(0, maxImages - uploadedImageUrls.length);
    if (room === 0) {
      toast.error(`Limite de ${maxImages} referências atingido — remova uma antes de colar outra.`);
      return;
    }
    if (files.length > room) {
      toast(`Só ${room} espaço(s) livre(s) — anexando as ${room} primeiras.`, { icon: "⚠️" });
    }
    setGenerating(true); // Show as generating/busy
    const toUpload = files.slice(0, room);
    // Instant local previews while the real upload happens in the background
    const localPreviews = toUpload.map((f) => URL.createObjectURL(f));
    setUploadingPreviews(localPreviews);
    try {
      const urls = await Promise.all(
        toUpload.map(async (file) => {
          try {
            return await uploadFile(apiKey, file);
          } catch (err) {
            console.error(
              "[ImageStudio] Drop upload failed for",
              file.name,
              err
            );
            throw err;
          }
        })
      );

      // handleUploadSelect's contract is "this is the FULL selection" —
      // merge here so paste appends instead of replacing.
      const attached = uploadedImageUrlsRef.current;
      const merged = maxImages === 1
        ? urls.slice(0, 1)
        : [...attached, ...urls.filter((u) => !attached.includes(u))].slice(0, maxImages);
      handleUploadSelect({ urls: merged });
    } catch (err) {
      alert(`Image upload failed: ${err.message}`);
    } finally {
      localPreviews.forEach((u) => URL.revokeObjectURL(u));
      setUploadingPreviews([]);
      setGenerating(false);
    }
  };

  // ── Handle Dropped Files ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      if (processedDropBatches.has(droppedFiles)) return;
      processedDropBatches.add(droppedFiles);
      const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        processDroppedImages(imageFiles);
      }
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, processDroppedImages]);

  // ── Derived: current model lists & helpers ───────────────────────────────
  const currentModels = imageMode ? i2iModels : t2iModels;
  const currentAspectRatios = imageMode
    ? getAspectRatiosForI2IModel(selectedModelId)
    : getAspectRatiosForModel(selectedModelId);
  const currentResolutions = imageMode
    ? getResolutionsForI2IModel(selectedModelId)
    : getResolutionsForModel(selectedModelId);
  const currentQualityField = imageMode
    ? getQualityFieldForI2IModel(selectedModelId)
    : getQualityFieldForModel(selectedModelId);
  const showQualityBtn = currentResolutions.length > 0;
  const currentEffects = imageMode ? getEffectsForI2IModel(selectedModelId) : [];
  const showEffectBtn = currentEffects.length > 0;

  // ── Textarea auto-resize ─────────────────────────────────────────────────
  // ── Upload picker callbacks ──────────────────────────────────────────────
  const handleUploadSelect = useCallback(
    ({ url, urls }) => {
      const newUrls = urls || [url];
      setUploadedImageUrls(newUrls);

      if (!imageMode) {
        // Find the i2i sibling of the currently selected t2i model.
        // Many models follow conventions, but some have completely irregular names —
        // those are handled via a hardcoded exceptions map.
        const curId = selectedModelId;
        const i2iIds = new Set(i2iModels.map((m) => m.id));

        // Hardcoded exceptions for models with irregular t2i → i2i naming
        const EXCEPTIONS = {
          'reve-text-to-image':          'reve-image-edit',
          'wan2.1-text-to-image':        'wan2.5-image-edit',   // no wan2.1 i2i — closest
          'wan2.5-text-to-image':        'wan2.5-image-edit',
          'wan2.6-text-to-image':        'wan2.6-image-edit',
          'kling-o1-text-to-image':      'kling-o1-edit-image',
          'vidu-q2-text-to-image':       'vidu-q2-reference-to-image',
          'bytedance-seedream-v3':       'bytedance-seededit-v3',
          'bytedance-seedream-v4':       'bytedance-seedream-edit-v4',
          'ideogram-v3-t2i':             'ideogram-v3-reframe',
        };

        const findI2I = (id) => i2iModels.find((m) => m.id === id) ?? null;

        const target =
          // 0. Hardcoded exceptions for irregular names
          findI2I(EXCEPTIONS[curId]) ||
          // 1. Model exists directly in i2i list (e.g. qwen-text-to-image-2512, flux-pulid, flux-redux)
          findI2I(curId) ||
          // 2. {id}-edit suffix (e.g. nano-banana → nano-banana-edit, gpt-image-1.5 → gpt-image-1.5-edit)
          findI2I(`${curId}-edit`) ||
          // 3. -t2i → -i2i (e.g. flux-kontext-dev-t2i → flux-kontext-dev-i2i)
          (curId.includes('-t2i') && findI2I(curId.replace('-t2i', '-i2i'))) ||
          // 4. text-to-image → image-to-image (e.g. gpt4o-text-to-image, midjourney-v7, grok-imagine)
          (curId.includes('text-to-image') && findI2I(curId.replace('text-to-image', 'image-to-image'))) ||
          // 5. Prefix match fallback (e.g. minimax-image-01 → minimax-image-01-subject-reference)
          i2iModels.find((m) => m.id.startsWith(curId)) ||
          // 6. No sibling exists — use first i2i model
          i2iModels[0];

        const ars = getAspectRatiosForI2IModel(target.id);
        const resolutions = getResolutionsForI2IModel(target.id);
        const effects = getEffectsForI2IModel(target.id);
        setImageMode(true);
        setSelectedModelId(target.id);
        setSelectedModelName(target.name);
        setSelectedAr(ars[0] || "1:1");
        setSelectedQuality(resolutions[0] || null);
        setSelectedEffect(effects.length > 0 ? (getDefaultEffectForI2IModel(target.id) || effects[0]) : "");
        setMaxImages(getMaxImagesForI2IModel(target.id));
      }
    },
    [imageMode, selectedModelId],
  );

  // Upload files into a specific reference role with instant local previews
  const uploadWithRole = useCallback(async (files, role) => {
    const usable = files.filter((f) => f.size <= 10 * 1024 * 1024);
    if (usable.length === 0) return;
    const slots = Math.max(0, maxImages - uploadedImageUrls.length);
    const batch = usable.slice(0, role === "generic" ? slots : 1);
    if (batch.length === 0) return;
    const locals = batch.map((f) => URL.createObjectURL(f));
    setUploadingPreviews((prev) => [...prev, ...locals]);
    try {
      const urls = await Promise.all(batch.map((f) => uploadFile(apiKey, f)));
      tagRole(urls, role);
      handleUploadSelect({ urls: [...uploadedImageUrls, ...urls] });
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      locals.forEach((u) => URL.revokeObjectURL(u));
      setUploadingPreviews((prev) => prev.filter((u) => !locals.includes(u)));
    }
  }, [apiKey, maxImages, uploadedImageUrls, tagRole, handleUploadSelect]);



  const handleUploadClear = useCallback(() => {
    setUploadedImageUrls([]);
    setImageMode(false);

    // Find the t2i parent of the currently selected i2i model (reverse of upload logic)
    const curId = selectedModelId;
    const findT2I = (id) => id ? (t2iModels.find((m) => m.id === id) ?? null) : null;

    // Reverse exceptions map (i2i → t2i for irregular names)
    const REVERSE_EXCEPTIONS = {
      'reve-image-edit':               'reve-text-to-image',
      'wan2.5-image-edit':             'wan2.5-text-to-image',
      'wan2.6-image-edit':             'wan2.6-text-to-image',
      'kling-o1-edit-image':           'kling-o1-text-to-image',
      'vidu-q2-reference-to-image':    'vidu-q2-text-to-image',
      'bytedance-seededit-v3':         'bytedance-seedream-v3',
      'bytedance-seedream-edit-v4':    'bytedance-seedream-v4',
      'ideogram-v3-reframe':           'ideogram-v3-t2i',
    };

    const target =
      // 0. Hardcoded reverse exceptions
      findT2I(REVERSE_EXCEPTIONS[curId]) ||
      // 1. Model exists directly in t2i list (e.g. qwen-text-to-image-2512, flux-pulid, flux-redux)
      findT2I(curId) ||
      // 2. Strip -edit suffix (e.g. nano-banana-edit → nano-banana, gpt-image-1.5-edit → gpt-image-1.5)
      (curId.endsWith('-edit') && findT2I(curId.slice(0, -5))) ||
      // 3. -i2i → -t2i (e.g. flux-kontext-dev-i2i → flux-kontext-dev-t2i)
      (curId.includes('-i2i') && findT2I(curId.replace('-i2i', '-t2i'))) ||
      // 4. image-to-image → text-to-image (e.g. gpt4o-image-to-image → gpt4o-text-to-image)
      (curId.includes('image-to-image') && findT2I(curId.replace('image-to-image', 'text-to-image'))) ||
      // 5. No parent found — use first t2i model
      t2iModels[0];

    const ars = getAspectRatiosForModel(target.id);
    const resolutions = getResolutionsForModel(target.id);
    setSelectedModelId(target.id);
    setSelectedModelName(target.name);
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);
    setSelectedEffect("");
    setMaxImages(1);
  }, [selectedModelId]);

  // ── Model selection ──────────────────────────────────────────────────────
  const handleModelSelect = (m, category = imageMode ? "i2i" : "t2i") => {
    const nextImageMode = category === "i2i";
    const ars = nextImageMode
      ? getAspectRatiosForI2IModel(m.id)
      : getAspectRatiosForModel(m.id);
    const resolutions = nextImageMode
      ? getResolutionsForI2IModel(m.id)
      : getResolutionsForModel(m.id);
    if (!nextImageMode && imageMode) {
      setUploadedImageUrls([]);
      setSwapImageUrl(null);
    }
    setImageMode(nextImageMode);
    setSelectedModelId(m.id);
    setSelectedModelName(m.name);
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);
    setSwapImageUrl(null);
    if (nextImageMode) {
      setMaxImages(getMaxImagesForI2IModel(m.id));
      const effects = getEffectsForI2IModel(m.id);
      setSelectedEffect(effects.length > 0 ? (getDefaultEffectForI2IModel(m.id) || effects[0]) : "");
    } else {
      setMaxImages(1);
      setSelectedEffect("");
    }
  };

  // ── History helpers ──────────────────────────────────────────────────────
  const addToHistory = useCallback(
    (entry) => {
      if (!historyItems) {
        setLocalHistory((prev) => [entry, ...prev.slice(0, 49)]);
      }
    },
    [historyItems],
  );

  // ── Generation ───────────────────────────────────────────────────────────
  // Resolve @img1/@style/@character prompt references against the attached
  // images (role tokens map to the attachment carrying that role). Models
  // without native @image support get plain-English "image N" phrasing.
  const resolveImageRefs = (text, imageCount) => {
    if (!text) return { resolved: text, missing: null };
    let missing = null;
    const styleIdx = uploadedImageUrls.findIndex((u) => refRoles[u] === "style");
    const charIdx = uploadedImageUrls.findIndex((u) => refRoles[u] === "character");
    let resolved = text.replace(/@style\b/gi, (m) => {
      if (styleIdx < 0) { missing = missing || m; return m; }
      return `image ${styleIdx + 1}`;
    });
    resolved = resolved.replace(/@char(?:acter)?\b/gi, (m) => {
      if (charIdx < 0) { missing = missing || m; return m; }
      return `image ${charIdx + 1}`;
    });
    resolved = resolved.replace(/@im(?:g|age)\s?(\d{1,2})/gi, (match, n) => {
      const idx = parseInt(n, 10);
      if (idx < 1 || idx > imageCount) {
        missing = missing || match;
        return match;
      }
      return `image ${idx}`;
    });
    return { resolved, missing };
  };

  const handleGenerate = async () => {
    if (generating) return;

    if (imageMode) {
      if (uploadedImageUrls.length === 0) {
        alert("Please upload a reference image first.");
        return;
      }
      const modelInfo = getI2IModelById(selectedModelId);
      if (modelInfo?.swapField && !swapImageUrl) {
        alert("Please upload a swap face image.");
        return;
      }
      const refCheck = resolveImageRefs(prompt.trim(), uploadedImageUrls.length);
      if (refCheck?.missing) {
        alert(`Your prompt references ${refCheck.missing}, but only ${uploadedImageUrls.length} image${uploadedImageUrls.length === 1 ? " is" : "s are"} attached.`);
        return;
      }
    } else {
      if (!prompt.trim()) {
        alert("Please enter a prompt to generate an image.");
        return;
      }
    }

    onGenerationStart?.();
    let finalPrompt = prompt.trim();
    let sentPrompt = finalPrompt;
    setGenerating(true);
    setGenerateError(null);

    try {
      if (enhanceOn && finalPrompt) {
        // Inside the try: a rejection here used to strand the button in
        // "Generating…" forever — no finally had run yet.
        finalPrompt = await enhancePrompt(finalPrompt, "image", selectedModelId);
      }
      // Mood style: curated treatment appended AFTER enhance, so the LLM
      // never paraphrases the phrases that carry the look.
      if (activeStyle?.text) {
        finalPrompt = `${finalPrompt}. ${activeStyle.text}`;
      }
      const results = await Promise.all(
        Array.from({ length: batchSize }).map(async () => {
          if (imageMode) {
            const genParams = {
              model: selectedModelId,
              images_list: uploadedImageUrls,
              image_url: uploadedImageUrls[0],
              aspect_ratio: selectedAr,
            };
            if (swapImageUrl) genParams.swap_url = swapImageUrl;
            if (prompt.trim()) genParams.prompt = resolveImageRefs(finalPrompt, uploadedImageUrls.length).resolved;
            if (currentQualityField && selectedQuality) {
              genParams[currentQualityField] = selectedQuality;
            }
            if (showEffectBtn && selectedEffect) genParams.name = selectedEffect;
            return await generateI2I(apiKey, genParams);
          } else {
            const genParams = {
              model: selectedModelId,
              prompt: finalPrompt,
              aspect_ratio: selectedAr,
            };
            if (currentQualityField && selectedQuality) {
              genParams[currentQualityField] = selectedQuality;
            }
            return await generateImage(apiKey, genParams);
          }
        })
      );

      results.forEach((res) => {
        if (res && res.url) {
          const entry = {
            id: res.id || Math.random().toString(36).substring(7),
            url: res.url,
            prompt: sentPrompt || finalPrompt,
            model: selectedModelId,
            cost: typeof res.cost === "number" ? res.cost : null,
            aspect_ratio: selectedAr,
            timestamp: new Date().toISOString(),
          };
          addToHistory(entry);
          onGenerationComplete?.({
            url: res.url,
            model: selectedModelId,
            prompt: sentPrompt || finalPrompt,
            type: "image",
          });
        }
      });
    } catch (e) {
      console.error("[ImageStudio] Generation failed:", e);
      const errMsg = formatErrorMessage(e, "Image generation failed");
      if (onGenerationError) onGenerationError(errMsg);
      else toast.error(errMsg);
    } finally {
      setGenerating(false);
      onGenerationEnd?.();
    }
  };

  const placeholderText =
    uploadedImageUrls.length > 1
      ? `${uploadedImageUrls.length} images selected — reference them with @img1, @img2…`
      : imageMode
        ? "Describe how to transform this image (optional)"
        : "Describe the image you want to create";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-app-bg relative p-4 md:p-6 overflow-hidden">
      
      {/* ── CENTRAL GALLERY AREA ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2">
        {/* Pending render queue — heavy jobs land here until delivery */}
        {pendingRenders.length > 0 && (
          <div className="w-full pt-4 space-y-2 animate-fade-in-up">
            {pendingRenders.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 bg-[#171719]/90 border border-white/[0.08] rounded-xl px-4 py-3"
              >
                <div className="w-4 h-4 rounded-full border-2 border-white/15 border-t-white/70 animate-spin shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[13px] text-white/85 font-medium truncate">
                    {p.prompt || "Rendering…"}
                  </span>
                  <span className="text-[11px] text-white/40">
                    {p.model || p.provider} · rendering for {Math.max(1, Math.round((Date.now() - (p.startedAt || Date.now())) / 60000))} min
                  </span>
                </div>
                <span className="text-[10px] text-white/35 border border-white/[0.09] rounded-full px-2 py-0.5 shrink-0 capitalize">
                  {p.provider}
                </span>
              </div>
            ))}
          </div>
        )}
        {history.length > 0 || generating ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full pt-4 animate-fade-in-up">
            {generating && Array.from({ length: batchSize || 1 }).map((_, i) => (
              <div
                key={`placeholder-${i}`}
                className="relative rounded-2xl overflow-hidden border border-white/[0.07] bg-[#171719] animate-fade-in-up"
                style={{ aspectRatio: selectedAr === "9:16" || selectedAr === "3:4" || selectedAr === "4:5" ? "3/4" : "4/3" }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-white/[0.05] animate-pulse" style={{ filter: "blur(24px)" }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/70 animate-spin" />
                  <span className="text-[13px] font-medium text-white/60 tabular-nums">
                    {typeof genProgress === "number" ? `${Math.round(genProgress)}%` : "Generating…"}
                  </span>
                </div>
              </div>
            ))}
            {history.map((entry, idx) => (
              <div
                key={entry.id || idx}
                className="relative group rounded-2xl overflow-hidden border border-white/[0.08] bg-[#171719] shadow-[0_2px_12px_rgba(0,0,0,0.25)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.45)] hover:border-white/[0.16] hover:-translate-y-0.5 transition-[transform,box-shadow,border-color] duration-250 ease-apple flex flex-col cursor-pointer"
                onClick={() => setLightboxIdx(idx)}
              >
                <img
                  src={entry.url}
                  alt={entry.prompt?.substring(0, 30) || "Generated image"}
                  className="w-full aspect-square object-cover bg-black/40 group-hover:scale-[1.02] transition-transform duration-350 ease-apple"
                />
                
                {/* Overlay actions */}
                <div className="absolute top-2 right-2 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GenerationCopyButtons
                    prompt={entry.prompt}
                    imageUrl={entry.url}
                    onCopyError={onGenerationError}
                  />
                  <button
                    type="button"
                    title="Download"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadImage(entry.url, `muapi-${entry.id || idx}.jpg`);
                    }}
                    className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
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
                  imageUrl={entry.url}
                  onCopyError={onGenerationError}
                  actions={[
                    {
                      kind: "download",
                      label: "Download",
                      onSelect: () =>
                        downloadImage(entry.url, `muapi-${entry.id || idx}.jpg`),
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
                <div className="p-3.5 bg-[#171719] flex-1 flex flex-col justify-between gap-2">
                  <p className="text-white/65 text-[12px] line-clamp-2 leading-relaxed" title={entry.prompt}>
                    {entry.prompt || "No prompt provided"}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-white/60 px-2 py-0.5 bg-white/[0.06] rounded-full border border-white/[0.07] capitalize truncate">
                      {entry.model?.replace(/-/g, " ") || "Image Studio"}
                    </span>
                    {entry.aspect_ratio && <span className="text-[10px] text-white/30 tabular-nums">{entry.aspect_ratio}</span>}
                    {entry.provider && entry.provider !== "muapi" && (
                      <span className="text-[9px] text-white/25 capitalize ml-auto">{entry.provider}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : historyUnfiltered.length > 0 ? (
          /* Nothing to show ONLY because the project filter hides it — an
             unexplained blank gallery reads as "my history was lost". */
          <div className="flex flex-col items-center justify-center h-full animate-fade-in-up min-h-[50vh] gap-3 px-4">
            <span className="text-white/85 font-semibold text-lg tracking-tight text-center">
              Este projeto ainda não tem gerações
            </span>
            <p className="text-white/40 text-[13px] text-center max-w-md leading-relaxed">
              Seu histórico está inteiro ({historyUnfiltered.length} {historyUnfiltered.length === 1 ? "item" : "itens"}) — só não aparece aqui porque a galeria está filtrada pelo projeto ativo.
            </p>
            <button
              type="button"
              onClick={() => {
                try { localStorage.setItem("gallery_scope", "all"); } catch {}
                window.dispatchEvent(new CustomEvent("gallery-scope-changed", { detail: "all" }));
              }}
              className="pressable h-9 px-4 rounded-full bg-[#EF0328] text-white text-[13px] font-semibold"
            >
              Ver tudo
            </button>
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
              Describe a scene, character, mood, or style — and watch it come to life
            </p>
          </div>
        )}
      </div>

      {/* ── BOTTOM PROMPT BAR ── */}
      <PromptComposer>
          {/* Top row: upload picker + textarea */}
          <div className="flex flex-col gap-3">
            {/* Inline list of uploaded files */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {uploadedImageUrls && uploadedImageUrls.length > 0 && uploadedImageUrls.map((url, idx) => (
                <div key={url} className={`${PROMPT_MEDIA_PREVIEW_CLASS} border-2 ${(REF_ROLE_COLORS[refRoles[url] || "generic"]).ring}`}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {(uploadedImageUrls.length > 1 || refRoles[url]) && (
                    <span className={`absolute bottom-0 inset-x-0 backdrop-blur-sm text-white text-[8px] font-semibold text-center leading-3 pointer-events-none ${(REF_ROLE_COLORS[refRoles[url] || "generic"]).chip}`}>
                      {refRoles[url] === "style" ? "style" : refRoles[url] === "character" ? "char" : `@img${idx + 1}`}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = uploadedImageUrls.filter((_, i) => i !== idx);
                      setUploadedImageUrls(next);
                      setRefRoles((prev) => { const n = { ...prev }; delete n[url]; return n; });
                      if (next.length === 0) handleUploadClear();
                    }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                  >
                    ×
                  </button>
                </div>
              ))}
              
              {/* Uploading previews — instant local thumbs with a spinner */}
              {uploadingPreviews.map((u) => (
                <div key={u} className={PROMPT_MEDIA_PREVIEW_CLASS}>
                  <img src={u} alt="" className="w-full h-full object-cover opacity-60" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
                  </div>
                </div>
              ))}

              {/* Reference fields — click or drag an image straight onto them */}
              {uploadedImageUrls.length < maxImages && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input ref={genericInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; uploadWithRole(f, "generic"); }} />
                  <input ref={styleInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; uploadWithRole(f, "style"); }} />
                  <input ref={characterInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; uploadWithRole(f, "character"); }} />
                  <RefField label="Ref" color="#EF0328" onClick={() => genericInputRef.current?.click()} onFiles={(f) => uploadWithRole(f, "generic")} />
                  <RefField label="Style" color="#FFD60A" onClick={() => styleInputRef.current?.click()} onFiles={(f) => uploadWithRole(f, "style")} />
                  <RefField label="Character" color="#30D158" onClick={() => characterInputRef.current?.click()} onFiles={(f) => uploadWithRole(f, "character")} />
                </div>
              )}

              {/* Swap Image Upload Trigger */}
              {imageMode && getI2IModelById(selectedModelId)?.swapField && (
                <UploadButton
                  apiKey={apiKey}
                  maxImages={1}
                  onSelect={({ urls }) => setSwapImageUrl(urls[0] || null)}
                  onClear={() => setSwapImageUrl(null)}
                  initialUrls={swapImageUrl ? [swapImageUrl] : []}
                  label="Swap Face"
                />
              )}

              {/* Model capability chips */}
              {imageMode && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[10px] text-white/35 border border-white/[0.07] rounded-full px-2 py-0.5 whitespace-nowrap">
                    {maxImages > 1 ? `Up to ${maxImages} images` : "1 image"}
                  </span>
                  {maxImages > 1 && (
                    <span className="text-[10px] text-white/35 border border-white/[0.07] rounded-full px-2 py-0.5 whitespace-nowrap">
                      @img refs
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Input prompt text area — role-aware @ mentions when images are attached */}
            <PromptMentionTextarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={placeholderText}
              mentions={imageMode ? promptMentions : []}
            />
          </div>

          {/* Bottom row: controls + generate */}
          <PromptFooter>
            {/* Left controls */}
            <PromptControls ref={dropdownRef}>
              {/* Mood — moodboard/style, applied to every generation */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setStyleOpen((v) => !v); }}
                  title={activeStyle ? `Estilo ativo: ${activeStyle.name}` : "Mood — deixe suas referências definirem o estilo"}
                  className={promptControlClassName({ compact: true, active: !!activeStyle || styleOpen })}
                >
                  <span className="text-xs font-semibold">{activeStyle ? activeStyle.name : "Mood"}</span>
                  {activeStyle && (
                    <span
                      role="button"
                      title="Remover estilo"
                      onClick={(e) => { e.stopPropagation(); setActiveStyle(null); setMoodImages([]); }}
                      className="ml-0.5 text-white/50 hover:text-white text-[13px] leading-none"
                    >×</span>
                  )}
                </button>
                {styleOpen && (
                  <div className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[320px] bg-[#1d1d1f]/[0.98] backdrop-blur-3xl rounded-2xl border border-white/[0.1] shadow-[0_16px_48px_rgba(0,0,0,0.65)] p-3.5 flex flex-col gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-white/85 text-[13px] font-semibold">Moodboard</span>
                      <span className="text-white/35 text-[11px]">as referências viram o estilo</span>
                    </div>
                    <input ref={moodInputRef} type="file" accept="image/*" multiple className="hidden"
                      onChange={(e) => { uploadMoodImages(e.target.files); e.target.value = ""; }} />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {moodImages.map((url) => (
                        <div key={url} className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/[0.1] group/ref">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <button type="button"
                            onClick={() => setMoodImages((prev) => prev.filter((u) => u !== url))}
                            className="absolute top-0 right-0 w-4 h-4 rounded-bl-md bg-black/70 text-white/80 text-[10px] leading-4 opacity-0 group-hover/ref:opacity-100">×</button>
                        </div>
                      ))}
                      {moodImages.length < 12 && (
                        <button type="button" onClick={() => moodInputRef.current?.click()} disabled={moodBusy}
                          className="w-12 h-12 rounded-lg border border-dashed border-white/[0.15] text-white/40 hover:text-white/70 hover:border-white/30 text-[10px] disabled:opacity-40">
                          + ref
                        </button>
                      )}
                    </div>
                    <button type="button" onClick={readMoodboard} disabled={moodBusy || !moodImages.length}
                      className="pressable h-8 rounded-full bg-[#EF0328] text-white text-[12px] font-semibold disabled:opacity-40">
                      {moodBusy ? "Lendo…" : "✦ Ler moodboard"}
                    </button>
                    {savedStyles.length > 0 && (
                      <div className="flex flex-col gap-1.5 pt-1 border-t border-white/[0.06]">
                        <span className="text-white/40 text-[11px]">Estilos salvos</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {savedStyles.map((st) => (
                            <button key={st.id} type="button" onClick={() => applySavedStyle(st)}
                              className="h-7 px-2.5 rounded-full border border-white/[0.1] bg-white/[0.04] text-[11px] font-semibold text-white/70 hover:text-white">
                              {st.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {activeStyle && (
                      <p className="text-white/35 text-[10px] leading-relaxed border-t border-white/[0.06] pt-2">
                        Ativo: <span className="text-white/60">{activeStyle.name}</span> — entra em toda geração até você remover.
                      </p>
                    )}
                  </div>
                )}
              </div>
              {/* Enhance — discreet icon toggle (sticky) */}
              <button
                type="button"
                onClick={toggleEnhance}
                title={enhanceOn ? "Enhance ativado" : "Enhance de prompt"}
                aria-pressed={enhanceOn}
                className={`pressable h-[38px] w-[38px] flex items-center justify-center rounded-lg border text-[15px] ${
                  enhanceOn
                    ? "text-[#FF2447] bg-[#EF0328]/15 border-[#EF0328]/30"
                    : "text-white/40 bg-white/[0.04] border-white/[0.06] hover:text-white/70"
                }`}
              >
                ✦
              </button>
              {/* Model button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen((o) => (o === "model" ? null : "model"));
                  }}
                  className={promptControlClassName({
                    active: dropdownOpen === "model",
                  })}
                >
                  <div className="w-4 h-4 rounded overflow-hidden shrink-0 flex items-center justify-center bg-white/5">
                    {(() => {
                      const selectedModelObj = currentModels.find(m => m.id === selectedModelId);
                      const selectedModelProvider = selectedModelObj?.provider || 'muapi';
                      return PROVIDER_LOGOS[selectedModelProvider] ? (
                        <img 
                          src={PROVIDER_LOGOS[selectedModelProvider]} 
                          alt="" 
                          className={`w-full h-full object-contain ${invertLogos.includes(selectedModelProvider) ? "invert" : ""}`} 
                        />
                      ) : (
                        <span className="text-[9px] font-bold text-black uppercase">G</span>
                      );
                    })()}
                  </div>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {selectedModelName}
                  </span>
                  <PromptChevronIcon />
                </button>

                {dropdownOpen === "model" && (
                  <PromptPopover
                    onClick={(e) => e.stopPropagation()}
                    className="w-[calc(100vw-2rem)] md:w-[480px] max-w-md md:max-w-none max-h-[70vh]"
                  >
                    <PromptPopoverHeader>Model</PromptPopoverHeader>
                    <ModelDropdown
                      selectedModel={selectedModelId}
                      onSelect={handleModelSelect}
                      onClose={() => setDropdownOpen(null)}
                    />
                  </PromptPopover>
                )}
              </div>

              {/* Aspect ratio button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen((o) => (o === "ar" ? null : "ar"));
                  }}
                  className={promptControlClassName({
                    active: dropdownOpen === "ar",
                  })}
                >
                  <PromptAspectRatioIcon />
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {selectedAr}
                  </span>
                </button>

                {dropdownOpen === "ar" && (
                  <PromptPopover
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SimpleDropdown
                      title="Aspect Ratio"
                      options={currentAspectRatios}
                      selected={selectedAr}
                      onSelect={(val) => setSelectedAr(val)}
                      onClose={() => setDropdownOpen(null)}
                    />
                  </PromptPopover>
                )}
              </div>

              {/* Quality/resolution button (represented as Diamond icon) */}
              {showQualityBtn && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownOpen((o) => (o === "quality" ? null : "quality"));
                    }}
                    className={promptControlClassName({
                      active: dropdownOpen === "quality",
                    })}
                  >
                    <PromptQualityIcon />
                    <span className={PROMPT_CONTROL_LABEL_CLASS}>
                      {selectedQuality || currentResolutions[0]}
                    </span>
                  </button>

                  {dropdownOpen === "quality" && (
                    <PromptPopover
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SimpleDropdown
                        title="Resolution"
                        options={currentResolutions}
                        selected={selectedQuality}
                        onSelect={(val) => setSelectedQuality(val)}
                        onClose={() => setDropdownOpen(null)}
                      />
                    </PromptPopover>
                  )}
                </div>
              )}

              {/* Effect type button */}
              {showEffectBtn && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownOpen((o) => (o === "effect" ? null : "effect"));
                    }}
                    className={promptControlClassName({
                      active: dropdownOpen === "effect",
                    })}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40 text-white">
                      <path d="M5 3l14 9-14 9V3z" />
                    </svg>
                    <span className={`${PROMPT_CONTROL_LABEL_CLASS} max-w-[140px] truncate`}>
                      {selectedEffect || "Effect"}
                    </span>
                  </button>

                  {dropdownOpen === "effect" && (
                    <PromptPopover
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-[200px]"
                    >
                      <SimpleDropdown
                        title="Effect Type"
                        options={currentEffects}
                        selected={selectedEffect}
                        onSelect={(val) => setSelectedEffect(val)}
                        onClose={() => setDropdownOpen(null)}
                      />
                    </PromptPopover>
                  )}
                </div>
              )}

              {/* Batch size stepper */}
              <div className={promptControlClassName({ compact: true, className: "select-none" })}>
                <button
                  type="button"
                  onClick={() => setBatchSize(prev => Math.max(1, prev - 1))}
                  className="text-white/40 hover:text-white/80 font-extrabold text-xs transition-colors px-1"
                >
                  -
                </button>
                <span className="text-xs font-semibold text-white/70 min-w-[24px] text-center">
                  {batchSize}/4
                </span>
                <button
                  type="button"
                  onClick={() => setBatchSize(prev => Math.min(4, prev + 1))}
                  className="text-white/40 hover:text-white/80 font-extrabold text-xs transition-colors px-1"
                >
                  +
                </button>
              </div>

              {/* Draw button */}
              <button
                type="button"
                className={promptControlClassName()}
                onClick={() => setIsDrawModalOpen(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-40 text-white group-hover:text-white/80 transition-colors">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span className={PROMPT_CONTROL_LABEL_CLASS}>
                  Draw
                </span>
              </button>
            </PromptControls>

            {/* Generate button */}
            <PromptAction
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <span className="animate-spin inline-block text-black">◌</span>
                  Generating...
                </>
              ) : (
                <>
                  <span>Generate ✦</span>
                </>
              )}
            </PromptAction>
          </PromptFooter>
      </PromptComposer>

      {/* ── FULLSCREEN IMAGE MODAL ── */}
      {lightboxIdx !== null && (
        <Lightbox
          items={history}
          index={Math.min(lightboxIdx, history.length - 1)}
          onClose={() => setLightboxIdx(null)}
          onNavigate={setLightboxIdx}
        />
      )}

      {/* ── DRAW CANVAS MODAL ── */}
      <DrawModal
        isOpen={isDrawModalOpen}
        onClose={() => setIsDrawModalOpen(false)}
        apiKey={apiKey}
        batchSize={1}
        onAddHistoryItem={addToHistory}
      />
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} toastOptions={{ duration: 5000, style: { background: '#18181b', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', fontSize: '13px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', maxWidth: '440px', wordBreak: 'break-word', whiteSpace: 'pre-wrap', padding: '12px 16px' } }} />
    </div>
  );
}
