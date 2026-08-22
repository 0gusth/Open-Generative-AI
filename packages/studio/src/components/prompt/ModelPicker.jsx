"use client";

// The model catalog — one picker for Image, Video and Cinema.
//
// The raw list is hundreds of entries ordered by the provider's internals.
// This gives it structure the way a person actually looks for a model:
// search by name, your own starred set first, then grouped by who makes it.
//
// Stars live on the server (like productions and styles), so a model
// favourited on the desktop is already starred on the phone. Toggling is
// optimistic — the star flips immediately and the write follows.

import { useState, useMemo, useEffect, useRef } from "react";
import { CURATED_MODELS } from "../../curatedModels.js";
import { PROVIDER_LOGOS, INVERT_LOGOS } from "../../providerLogos.js";

const PROVIDER_LABELS = {
  google: "Google", bytedance: "ByteDance", klingai: "Kling", kling: "Kling",
  minimax: "MiniMax", openai: "OpenAI", blackforest: "Black Forest Labs",
  runware: "Runware", alibaba: "Alibaba", ideogram: "Ideogram", xai: "xAI",
  reve: "Reve", vidu: "Vidu", pixverse: "PixVerse", luma: "Luma",
  stability: "Stability", lightricks: "Lightricks", runway: "Runway",
};
const labelFor = (p) => PROVIDER_LABELS[p] || (p ? p[0].toUpperCase() + p.slice(1) : "Outros");

function Star({ on, onClick, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[13px] leading-none transition-colors duration-100 ${
        on ? "text-[#FFD60A]" : "text-white/20 hover:text-white/60"
      }`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

function Row({ model, selected, starred, onPick, onStar }) {
  const logo = model.logoUrl || PROVIDER_LOGOS[model.provider];
  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors duration-100 ${
        selected ? "bg-white/[0.09]" : "hover:bg-white/[0.05]"
      }`}
      onClick={onPick}
    >
      {logo ? (
        <img src={logo} alt="" className={`w-4 h-4 object-contain shrink-0 ${!model.logoUrl && INVERT_LOGOS?.includes(model.provider) ? "invert" : ""}`} />
      ) : (
        <span className="w-4 h-4 shrink-0" />
      )}
      <span className={`flex-1 min-w-0 truncate text-[13px] ${selected ? "text-white" : "text-white/75"}`}>
        {model.name}
      </span>
      <Star on={starred} onClick={onStar} title={starred ? "Remover dos favoritos" : "Favoritar"} />
    </div>
  );
}

export default function ModelPicker({ models = [], value, kind = "image", onSelect }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("fav");
  const [stars, setStars] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((d) => setStars(d[kind] || []))
      .catch(() => {});
  }, [kind]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const toggleStar = (id) => {
    const on = stars.includes(id);
    setStars((prev) => (on ? prev.filter((x) => x !== id) : [...prev, id])); // optimistic
    fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, starred: !on }),
    }).catch(() => {});
  };

  // A model counts as favourite when the user starred it OR it is on the
  // curated shortlist — so the tab is never empty on a fresh install.
  const curatedIds = CURATED_MODELS[kind] || [];
  const isFav = (id) => stars.includes(id) || curatedIds.includes(id);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) =>
      `${m.name} ${m.provider_name || ""} ${m.provider || ""}`.toLowerCase().includes(q),
    );
  }, [models, search]);

  const favs = useMemo(() => {
    const list = filtered.filter((m) => isFav(m.id));
    // starred first, then curated order, then alphabetical
    return list.sort((a, b) => {
      const sa = stars.includes(a.id), sb = stars.includes(b.id);
      if (sa !== sb) return sa ? -1 : 1;
      const ca = curatedIds.indexOf(a.id), cb = curatedIds.indexOf(b.id);
      if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
      return a.name.localeCompare(b.name);
    });
  }, [filtered, stars, curatedIds]);

  const groups = useMemo(() => {
    const by = new Map();
    for (const m of filtered) {
      const key = m.provider || "outros";
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(m);
    }
    return [...by.entries()]
      .map(([id, list]) => ({ id, label: labelFor(id), list: list.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => b.list.length - a.list.length || a.label.localeCompare(b.label));
  }, [filtered]);

  // Searching looks across everything — a filter that only searched the open
  // tab would hide the very model the user is typing the name of.
  const searching = search.trim().length > 0;
  const showFavs = !searching && tab === "fav";

  return (
    <div className="flex flex-col gap-2 w-[300px]" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar modelo ou fornecedor…"
        className="w-full bg-[#212123] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-white/85 placeholder-white/25 outline-none focus:border-[#EF0328]/50"
      />

      {!searching && (
        <div className="flex items-center gap-1">
          {[["fav", "★ Favoritos"], ["all", "Todos"]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`h-6 px-2 rounded-full text-[11px] font-semibold transition-colors duration-100 ${
                tab === id ? "bg-white/[0.12] text-white" : "text-white/45 hover:text-white/75"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-white/25">{models.length} modelos</span>
        </div>
      )}

      <div className="max-h-[46vh] overflow-y-auto custom-scrollbar flex flex-col gap-0.5 pr-0.5">
        {showFavs ? (
          favs.length ? (
            favs.map((m) => (
              <Row key={m.id} model={m} selected={m.id === value} starred={stars.includes(m.id)}
                onPick={() => onSelect(m)} onStar={() => toggleStar(m.id)} />
            ))
          ) : (
            <span className="text-[11px] text-white/35 px-2 py-3">
              Nenhum favorito ainda — clique na estrela de um modelo em "Todos".
            </span>
          )
        ) : (
          groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-0.5">
              <div className="px-2 pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-white/30 flex items-center gap-1.5">
                {PROVIDER_LOGOS[g.id] && (
                  <img src={PROVIDER_LOGOS[g.id]} alt="" className={`w-3 h-3 object-contain ${INVERT_LOGOS?.includes(g.id) ? "invert" : ""}`} />
                )}
                {g.label}
                <span className="text-white/20">({g.list.length})</span>
              </div>
              {g.list.map((m) => (
                <Row key={m.id} model={m} selected={m.id === value} starred={stars.includes(m.id)}
                  onPick={() => onSelect(m)} onStar={() => toggleStar(m.id)} />
              ))}
            </div>
          ))
        )}
        {searching && filtered.length === 0 && (
          <span className="text-[11px] text-white/35 px-2 py-3">Nenhum modelo com “{search}”.</span>
        )}
      </div>
    </div>
  );
}
