"use client";

import { useCallback, useEffect } from "react";

// Gallery lightbox: fullscreen viewer over the whole creation set.
// ← → navigate, Esc closes, backdrop click closes. Works for images and videos.
export default function Lightbox({ items, index, onClose, onNavigate }) {
  const item = items[index];

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
        {(item.prompt || item.model) && (
          <div className="max-w-2xl text-center px-4">
            {item.prompt && (
              <p className="text-[13px] text-white/70 leading-relaxed line-clamp-2">{item.prompt}</p>
            )}
            <p className="text-[11px] text-white/35 mt-1 tabular-nums">
              {item.model}{items.length > 1 ? ` · ${index + 1} / ${items.length}` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
