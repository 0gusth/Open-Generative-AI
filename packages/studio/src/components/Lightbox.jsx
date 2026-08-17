"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { formatErrorMessage } from "../utils/formatError.js";

// Robust media download: direct fetch first, same-origin proxy fallback
// (provider CDNs without CORS), then a blob-powered save.
export async function downloadMedia(url, filename) {
  let res;
  try {
    res = await fetch(url);
    if (!res.ok) throw new Error();
  } catch {
    res = await fetch(`/api/proxy-media?url=${encodeURIComponent(url)}`);
  }
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can abort the save in Firefox/Safari — defer it.
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Gallery lightbox: fullscreen viewer over the whole creation set.
// ← → navigate, Esc closes, backdrop click closes. Works for images and videos.
export default function Lightbox({ items, index, onClose, onNavigate, onAdjust }) {
  const item = items[index];
  const [copied, setCopied] = useState(false);
  // Inline retouch: describe the change, the image is edited in place by an
  // image-to-image model. Only offered for stills.
  const [adjusting, setAdjusting] = useState(false);
  const [adjustText, setAdjustText] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const go = useCallback(
    (delta) => {
      if (!items.length) return;
      onNavigate((index + delta + items.length) % items.length);
    },
    [items.length, index, onNavigate],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!item) return null;

  const arrowClass =
    "pressable absolute top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-[#1d1d1f]/80 backdrop-blur-xl border border-white/[0.1] flex items-center justify-center text-white/70 hover:text-white hover:bg-[#2a2a2c]/90";

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-xl flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="pressable absolute top-5 right-5 z-10 w-9 h-9 rounded-full bg-[#1d1d1f]/80 backdrop-blur-xl border border-white/[0.1] flex items-center justify-center text-white/70 hover:text-white"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>

      {/* Arrows */}
      {items.length > 1 && (
        <>
          <button aria-label="Previous" className={`${arrowClass} left-5`} onClick={(e) => { e.stopPropagation(); go(-1); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button aria-label="Next" className={`${arrowClass} right-5`} onClick={(e) => { e.stopPropagation(); go(1); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </>
      )}

      {/* Media */}
      <div className="max-w-[92vw] max-h-[86vh] flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        {item.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(item.url) ? (
          <video
            key={item.url}
            src={item.url}
            controls
            autoPlay
            loop
            className="max-w-full max-h-[78vh] rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
          />
        ) : (
          <img
            key={item.url}
            src={item.url}
            alt=""
            className="max-w-full max-h-[78vh] rounded-xl object-contain shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
          />
        )}
        <div className="max-w-2xl w-full px-4 flex flex-col items-center gap-2">
            {item.prompt && (
              <p className="text-[13px] text-white/70 leading-relaxed text-center max-h-[16vh] overflow-y-auto custom-scrollbar select-text">
                {item.prompt}
              </p>
            )}
            <div className="flex items-center gap-2">
              {item.prompt && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(item.prompt);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    } catch { /* clipboard unavailable */ }
                  }}
                  className="pressable h-8 px-3 rounded-full bg-[#1d1d1f]/80 backdrop-blur-xl border border-white/[0.12] text-[11px] font-medium text-white/80 hover:text-white flex items-center gap-1.5"
                >
                  {copied ? "✓ Copiado" : "Copiar prompt"}
                </button>
              )}
              {onAdjust && item.type !== "video" && (
                <button
                  type="button"
                  onClick={() => setAdjusting((v) => !v)}
                  className="pressable h-8 px-3 rounded-full bg-[#1d1d1f]/80 backdrop-blur-xl border border-white/[0.12] text-[11px] font-medium text-white/80 hover:text-white flex items-center gap-1.5"
                >
                  ✎ Ajustar
                </button>
              )}
              <button
                type="button"
                disabled={downloading}
                onClick={async () => {
                  setDownloading(true);
                  try {
                    const isVideo = item.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(item.url);
                    await downloadMedia(item.url, `${(item.model || "generation").replace(/[^a-z0-9-]/gi, "-")}-${index + 1}.${isVideo ? "mp4" : "png"}`);
                  } catch (e) {
                    toast.error(formatErrorMessage(e, "Download failed"));
                  }
                  setDownloading(false);
                }}
                className="pressable h-8 px-3 rounded-full bg-[#1d1d1f]/80 backdrop-blur-xl border border-white/[0.12] text-[11px] font-medium text-white/80 hover:text-white flex items-center gap-1.5 disabled:opacity-50"
              >
                {downloading ? "Baixando…" : "⬇ Baixar"}
              </button>
            </div>
            {adjusting && onAdjust && item.type !== "video" && (
              <form
                className="mt-3 flex items-center gap-2 w-full max-w-xl mx-auto"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!adjustText.trim() || sending) return;
                  setSending(true);
                  try {
                    await onAdjust(item, adjustText.trim());
                    setAdjustText("");
                    setAdjusting(false);
                  } finally {
                    setSending(false);
                  }
                }}
              >
                <input
                  autoFocus
                  value={adjustText}
                  onChange={(e) => setAdjustText(e.target.value)}
                  placeholder="O que ajustar? ex.: tira o reflexo do vidro, deixa a luz mais quente…"
                  className="flex-1 h-9 px-3 rounded-full bg-[#1d1d1f]/85 backdrop-blur-xl border border-white/[0.12] text-[12px] text-white placeholder:text-white/30 outline-none focus:border-[#EF0328]/60"
                />
                <button type="submit" disabled={sending || !adjustText.trim()}
                  className="pressable h-9 px-4 rounded-full bg-[#EF0328] text-white text-[12px] font-semibold disabled:opacity-40">
                  {sending ? "Ajustando…" : "Ajustar"}
                </button>
              </form>
            )}
            {(item.model || items.length > 1) && (
              <p className="text-[11px] text-white/35 tabular-nums">
                {item.model}{items.length > 1 ? ` · ${index + 1} / ${items.length}` : ""}
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
