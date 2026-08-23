"use client";

// Production — the connected-project tab. Three doctrine layers:
//   1. Style Prefix — one look, assembled in Cinema Studio, propagated to
//      every scene (editable once, overridable per scene by just writing).
//   2. @ Glossary — cast/locations/props declared once; any scene mentioning
//      @tag gets the reference image attached and the tag resolved to its
//      visible-marker note.
//   3. Numbered scenes — each with its own prompt, model, duration and
//      aspect; Direct renders through the SAME pipeline as everything else
//      (dialects, scrub, provider routing, moderation reroute, ledger).
// Continuity: scene N carries a continuity line inherited from scene N-1
// (wardrobe, physical state, re-entry side) — editable text, one click to
// inherit.

import { useState, useEffect, useMemo, useRef } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  FolderKanban, Plus, Check, Trash2, Upload, ChevronDown, ChevronRight,
  Play, Loader2, Users, MapPin, Package, ArrowDownToLine,
} from "lucide-react";
import { generateVideo, uploadFile } from "../muapi.js";
import { scrubForByteDance } from "../providers.js";
import { formatErrorMessage } from "../utils/formatError.js";
import { seekPosterFrame } from "../utils/videoPoster.js";

// Curated scene models (Runware-native AIRs — same favorites Cinema uses).
const SCENE_MODELS = [
  { id: "bytedance:seedance@2.5", name: "Seedance 2.5" },
  { id: "bytedance:seedance@2.0", name: "Seedance 2.0" },
  { id: "klingai:kling-video@3-standard", name: "Kling 3 Standard" },
  { id: "klingai:kling-video@3-pro", name: "Kling 3 Pro" },
  { id: "klingai:kling-video@o3-standard", name: "Kling 3 Omni" },
  { id: "google:3@3", name: "Veo 3.1 Fast" },
  { id: "minimax:h3@0", name: "MiniMax H3" },
];
const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "21:9"];
const KIND_ICON = { cast: Users, location: MapPin, prop: Package };

const newScene = () => ({
  id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  prompt: "",
  continuity: "",
  modelId: SCENE_MODELS[0].id,
  duration: 5,
  aspect: "16:9",
  accepted: false,
  lastTake: null,
});

const panelClass = "rounded-2xl border border-white/[0.07] bg-[#171719] p-4";
const inputClass = "w-full bg-[#212123] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-[#EF0328]/50";

export default function ProductionStudio({ apiKey, onGenerationStart, onGenerationEnd, onGenerationComplete, onGenerationError }) {
  const [productions, setProductions] = useState([]);
  const [activeId, setActiveId] = useState(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("active_production_id") || null;
  });
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [prefixOpen, setPrefixOpen] = useState(true);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [renderingId, setRenderingId] = useState(null); // scene id in flight
  const [pendingPrefix, setPendingPrefix] = useState(null);
  const glossaryFileRef = useRef(null);
  const glossaryUploadTarget = useRef(null);

  const production = productions.find((p) => p.id === activeId) || null;

  // ── Server sync ──────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    fetch("/api/productions")
      .then((r) => r.json())
      .then((d) => { if (alive) { setProductions(d.productions || []); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    try {
      const raw = window.localStorage.getItem("cinema_style_prefix_pending");
      if (raw) setPendingPrefix(JSON.parse(raw));
    } catch { /* stale stash — ignore */ }
    return () => { alive = false; };
  }, []);

  // Functional update (two fast clicks must not read the same stale copy),
  // then a debounced whole-object save — one server write per burst of
  // edits instead of one per keystroke.
  const dirtyRef = useRef(false);
  const mutate = (fn) => {
    dirtyRef.current = true;
    setProductions((prev) => prev.map((p) => (p.id === activeId ? fn(structuredClone(p)) : p)));
  };
  useEffect(() => {
    if (!dirtyRef.current || !production) return undefined;
    const timer = setTimeout(() => {
      dirtyRef.current = false;
      fetch("/api/productions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: production.id, name: production.name, stylePrefix: production.stylePrefix, glossary: production.glossary, scenes: production.scenes }),
      }).catch(() => toast.error("Não consegui salvar no servidor — mudanças podem se perder."));
    }, 600);
    return () => clearTimeout(timer);
  }, [productions]);

  const createProduction = async () => {
    const name = newName.trim();
    if (!name) { toast.error("Dá um nome à produção."); return; }
    try {
      const r = await fetch("/api/productions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "create failed");
      setProductions((prev) => [...prev, d.production]);
      setActiveId(d.production.id);
      try { window.localStorage.setItem("active_production_id", d.production.id); } catch {}
      setNewName("");
    } catch (e) {
      toast.error(formatErrorMessage(e, "Não consegui criar a produção"));
    }
  };

  const selectProduction = (id) => {
    setActiveId(id);
    try { window.localStorage.setItem("active_production_id", id); } catch {}
  };

  // ── Style prefix ─────────────────────────────────────────────────────────
  const applyPendingPrefix = () => {
    if (!pendingPrefix) return;
    mutate((p) => ({ ...p, stylePrefix: pendingPrefix }));
    try { window.localStorage.removeItem("cinema_style_prefix_pending"); } catch {}
    setPendingPrefix(null);
    toast.success("Look do Cinema aplicado como prefixo da produção.");
  };

  // ── Glossary ─────────────────────────────────────────────────────────────
  const addGlossaryEntry = (kind) => mutate((p) => ({
    ...p,
    glossary: [...(p.glossary || []), { id: crypto.randomUUID(), tag: "", kind, note: "", refUrl: null }],
  }));

  const importCast = async () => {
    try {
      const r = await fetch("/api/characters");
      const d = await r.json();
      const cast = d.characters || [];
      if (!cast.length) { toast("Nenhum personagem salvo no Cast do Cinema ainda."); return; }
      const have = new Set((production?.glossary || []).map((g) => g.tag.toLowerCase()));
      const added = cast
        .filter((c) => !have.has(c.name.toLowerCase()))
        .map((c) => ({ id: crypto.randomUUID(), tag: c.name, kind: "cast", note: c.identity || "", refUrl: c.refUrl || null }));
      if (!added.length) { toast("Cast já importado."); return; }
      mutate((p) => ({ ...p, glossary: [...(p.glossary || []), ...added] }));
      toast.success(`${added.length} personagem(ns) importado(s) do Cast.`);
    } catch (e) {
      toast.error(formatErrorMessage(e, "Não consegui ler o Cast"));
    }
  };

  const onGlossaryFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const entryId = glossaryUploadTarget.current;
    if (!file || !entryId) return;
    const toastId = toast.loading("Subindo referência…");
    try {
      const url = await uploadFile(apiKey, file);
      mutate((p) => ({ ...p, glossary: p.glossary.map((g) => (g.id === entryId ? { ...g, refUrl: url } : g)) }));
      toast.success("Referência anexada.", { id: toastId });
    } catch (err) {
      toast.error(formatErrorMessage(err, "Upload falhou"), { id: toastId });
    }
  };

  // ── Scenes ───────────────────────────────────────────────────────────────
  const scenes = production?.scenes || [];
  const updateScene = (id, patch) => mutate((p) => ({
    ...p,
    scenes: p.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  }));

  const inheritContinuity = (idx) => {
    const prev = scenes[idx - 1];
    if (!prev) return;
    const firstLine = (prev.prompt || "").split(/[.\n]/)[0].trim();
    updateScene(scenes[idx].id, {
      continuity: `${firstLine ? firstLine + " — " : ""}same wardrobe, hair and physical state as the previous scene; continuity of light and weather; re-enter from the side they exited`,
    });
  };

  // Resolve @tags against the glossary: tag → visible-marker note in the
  // text (the reference owns identity, the text owns action), refs attached.
  const resolveScene = (scene) => {
    let text = scene.prompt || "";
    const refs = [];
    for (const g of production?.glossary || []) {
      if (!g.tag) continue;
      const re = new RegExp(`@${g.tag}(?![\\p{L}\\p{N}_-])`, "giu");
      if (!re.test(text)) continue;
      if (g.note) text = text.replace(new RegExp(`@${g.tag}(?![\\p{L}\\p{N}_-])`, "giu"), g.note);
      else text = text.replace(new RegExp(`@${g.tag}(?![\\p{L}\\p{N}_-])`, "giu"), g.tag);
      if (g.refUrl) refs.push(g.refUrl);
    }
    return { text, refs: refs.slice(0, 9) };
  };

  const directScene = async (scene, idx) => {
    if (!scene.prompt?.trim()) { toast.error(`Cena ${idx + 1} está sem prompt.`); return; }
    if (renderingId) { toast("Já tem uma cena renderizando — as cenas rodam uma por vez para manter a continuidade."); return; }
    setRenderingId(scene.id);
    onGenerationStart?.();
    try {
      const { text, refs } = resolveScene(scene);
      const continuity = scene.continuity?.trim()
        ? `Continuity from the previous scene: ${scene.continuity.trim()}`
        : "";
      // Assembly mirrors the compiler's order: subject → continuity → look.
      let finalPrompt = [text.trim(), continuity, production.stylePrefix?.text || ""]
        .filter(Boolean).join(". ");
      finalPrompt = await scrubForByteDance(finalPrompt, scene.modelId, "video");
      const params = {
        model: scene.modelId,
        prompt: finalPrompt,
        duration: scene.duration,
        aspect_ratio: scene.aspect,
        resolution: "720p",
        __audio: true,
      };
      if (refs.length) params.images_list = refs;
      const res = await generateVideo(apiKey, params);
      if (!res?.url) throw new Error("No video URL returned by API");
      if (res.reroutedTo) {
        toast(`Moderação vetou o frame — cena gerada no ${res.reroutedTo.includes("3-pro") ? "Kling 3 Pro" : "Kling 3 Standard"}.`, { icon: "🔀", duration: 8000 });
      }
      updateScene(scene.id, { lastTake: { url: res.url, model: res.reroutedTo || scene.modelId, cost: typeof res.cost === "number" ? res.cost : null, at: new Date().toISOString() } });
      onGenerationComplete?.({ url: res.url, model: res.reroutedTo || scene.modelId, prompt: finalPrompt, type: "video" });
      toast.success(`Cena ${idx + 1} entregue.`);
    } catch (e) {
      const msg = formatErrorMessage(e, `Cena ${idx + 1} falhou`);
      if (onGenerationError) onGenerationError(msg); else toast.error(msg);
    } finally {
      setRenderingId(null);
      onGenerationEnd?.();
    }
  };

  // Sequence budget: the corpus law is ~4-6s per cut; the audit reads the
  // scene durations as the cut rhythm of the finished film.
  const budget = useMemo(() => {
    if (!scenes.length) return null;
    const total = scenes.reduce((s, sc) => s + (Number(sc.duration) || 0), 0);
    const done = scenes.filter((s) => s.accepted).length;
    const long = scenes.filter((s) => Number(s.duration) > 8).length;
    return {
      total,
      done,
      hint: `${scenes.length} cenas · ${total}s no total · ritmo ${(total / scenes.length).toFixed(1)}s/cena` +
        (long ? ` · ${long} cena(s) acima de 8s — confirme que o hold é intencional` : ""),
    };
  }, [scenes]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (!loaded) {
    return <div className="h-full w-full flex items-center justify-center text-white/40 text-sm">Carregando produções…</div>;
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[#0f0f10]">
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} toastOptions={{ style: { background: "#212123", color: "#fff", border: "1px solid rgba(255,255,255,0.08)" } }} />
      <input ref={glossaryFileRef} type="file" accept="image/*" className="hidden" onChange={onGlossaryFile} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">

        {/* Header: production switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <FolderKanban size={20} strokeWidth={1.75} className="text-white/70" />
          <span className="text-white/95 font-semibold text-2xl tracking-tight">Production</span>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {productions.map((p) => (
              <button key={p.id} type="button" onClick={() => selectProduction(p.id)}
                className={`pressable h-7 px-2.5 rounded-full border text-[11px] font-semibold ${
                  p.id === activeId ? "text-white bg-[#EF0328] border-[#EF0328]" : "text-white/50 bg-white/[0.04] border-white/[0.06] hover:text-white/80"
                }`}>
                {p.name}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProduction()}
                placeholder="nova produção…"
                className="h-7 w-36 bg-[#212123] border border-white/[0.08] rounded-full px-2.5 text-[11px] text-white/80 placeholder-white/25 outline-none focus:border-[#EF0328]/50" />
              <button type="button" onClick={createProduction}
                className="pressable h-7 w-7 flex items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/60 hover:text-white">
                <Plus size={13} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {!production ? (
          <div className={`${panelClass} text-[13px] leading-relaxed`}>
            <p className="text-white/75 font-semibold mb-2">Como funciona uma produção</p>
            <ol className="text-white/50 flex flex-col gap-1.5 list-decimal list-inside">
              <li><span className="text-white/70">Look único</span> — monte o visual no Cinema Studio (Film / Camera / Look) e clique <span className="text-white/70">"→ prefixo da produção"</span>. Todas as cenas herdam o mesmo tratamento.</li>
              <li><span className="text-white/70">Glossário @</span> — declare elenco (importa do Cast), locações e props uma vez. Escreva <span className="text-white/70">@nome</span> em qualquer cena e a referência entra sozinha.</li>
              <li><span className="text-white/70">Cenas numeradas</span> — uma cena por clipe, cada uma com seu modelo e duração. <span className="text-white/70">"← herdar"</span> puxa figurino e estado físico da cena anterior; Direct renderiza pelo pipeline normal.</li>
            </ol>
            <p className="text-white/40 mt-2.5">Dê um nome ali em cima e crie a primeira — os takes aceitos vão marcando o progresso do filme.</p>
          </div>
        ) : (
          <>
            {/* 1 · Style Prefix */}
            <div className={panelClass}>
              <button type="button" onClick={() => setPrefixOpen((v) => !v)} className="w-full flex items-center gap-2 text-left">
                {prefixOpen ? <ChevronDown size={14} className="text-white/40" /> : <ChevronRight size={14} className="text-white/40" />}
                <span className="text-white/85 text-[13px] font-semibold">Style prefix</span>
                <span className="text-white/35 text-[11px]">um look, todas as cenas — monte no Cinema Studio e traga para cá</span>
                {production.stylePrefix?.text && <Check size={13} className="text-white/50 ml-auto" />}
              </button>
              {prefixOpen && (
                <div className="mt-3 flex flex-col gap-2">
                  {pendingPrefix && (
                    <button type="button" onClick={applyPendingPrefix}
                      className="pressable self-start h-7 px-2.5 rounded-full text-[11px] font-semibold text-[#FF2447] bg-[#EF0328]/15 border border-[#EF0328]/30">
                      <ArrowDownToLine size={11} className="inline mr-1 -mt-0.5" />
                      Aplicar look do Cinema ({new Date(pendingPrefix.at).toLocaleTimeString().slice(0, 5)})
                    </button>
                  )}
                  <textarea value={production.stylePrefix?.text || ""}
                    onChange={(e) => mutate((p) => ({ ...p, stylePrefix: { ...(p.stylePrefix || {}), text: e.target.value, at: new Date().toISOString() } }))}
                    placeholder="Blocos de tratamento (gear, luz, grade, movimento) — ou clique em '→ prefixo da produção' no Cinema Studio…"
                    rows={3}
                    className={`${inputClass} resize-y leading-relaxed`} />
                  {production.stylePrefix?.resolved && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[production.stylePrefix.resolved.camera, production.stylePrefix.resolved.lens, production.stylePrefix.resolved.palette, production.stylePrefix.resolved.lighting]
                        .filter(Boolean).slice(0, 4).map((chip, i) => (
                          <span key={i} className="text-[10px] text-white/45 px-1.5 py-0.5 bg-white/[0.04] rounded-full border border-white/[0.06]">{chip}</span>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2 · @ Glossary */}
            <div className={panelClass}>
              <button type="button" onClick={() => setGlossaryOpen((v) => !v)} className="w-full flex items-center gap-2 text-left">
                {glossaryOpen ? <ChevronDown size={14} className="text-white/40" /> : <ChevronRight size={14} className="text-white/40" />}
                <span className="text-white/85 text-[13px] font-semibold">Glossário @</span>
                <span className="text-white/35 text-[11px]">elenco, locações e props — declare uma vez, use @tag em qualquer cena</span>
                {(production.glossary || []).length > 0 && (
                  <span className="text-white/50 text-[11px] ml-auto">{production.glossary.length}</span>
                )}
              </button>
              {glossaryOpen && (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button type="button" onClick={importCast} className="pressable h-7 px-2.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold text-white/60 hover:text-white/90">
                      <Users size={11} className="inline mr-1 -mt-0.5" />Importar do Cast
                    </button>
                    <button type="button" onClick={() => addGlossaryEntry("location")} className="pressable h-7 px-2.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold text-white/60 hover:text-white/90">
                      <MapPin size={11} className="inline mr-1 -mt-0.5" />+ Locação
                    </button>
                    <button type="button" onClick={() => addGlossaryEntry("prop")} className="pressable h-7 px-2.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold text-white/60 hover:text-white/90">
                      <Package size={11} className="inline mr-1 -mt-0.5" />+ Prop
                    </button>
                  </div>
                  {(production.glossary || []).map((g) => {
                    const Icon = KIND_ICON[g.kind] || Package;
                    return (
                      <div key={g.id} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                        {g.refUrl
                          ? <img src={g.refUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-white/[0.08]" />
                          : <span className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-white/35"><Icon size={13} /></span>}
                        <span className="text-[11px] text-white/40">@</span>
                        <input value={g.tag}
                          onChange={(e) => mutate((p) => ({ ...p, glossary: p.glossary.map((x) => (x.id === g.id ? { ...x, tag: e.target.value.replace(/\s+/g, "") } : x)) }))}
                          placeholder="tag" className="w-24 bg-transparent text-[12px] font-semibold text-white/85 outline-none placeholder-white/25" />
                        <input value={g.note}
                          onChange={(e) => mutate((p) => ({ ...p, glossary: p.glossary.map((x) => (x.id === g.id ? { ...x, note: e.target.value } : x)) }))}
                          placeholder="marcador visível (o que a câmera vê)" className="flex-1 bg-transparent text-[12px] text-white/65 outline-none placeholder-white/25" />
                        <button type="button" title="Anexar referência"
                          onClick={() => { glossaryUploadTarget.current = g.id; glossaryFileRef.current?.click(); }}
                          className="pressable w-6 h-6 rounded-md text-white/35 hover:text-white/80 hover:bg-white/[0.06] flex items-center justify-center">
                          <Upload size={12} />
                        </button>
                        <button type="button" title="Remover"
                          onClick={() => mutate((p) => ({ ...p, glossary: p.glossary.filter((x) => x.id !== g.id) }))}
                          className="pressable w-6 h-6 rounded-md text-white/35 hover:text-red-400 hover:bg-white/[0.06] flex items-center justify-center">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3 · Scenes */}
            {budget
              ? <div className="text-[11px] text-white/40 px-1">{budget.hint} · {budget.done}/{scenes.length} aceitas</div>
              : <div className="text-[12px] text-white/40 px-1">Cada cena é um clipe do filme final — escreva a primeira em prosa (com @tags se quiser) e clique Direct. A ordem dos cards é a ordem da montagem.</div>}
            {scenes.map((scene, idx) => (
              <div key={scene.id} className={`${panelClass} ${scene.accepted ? "border-white/[0.12]" : ""}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-bold tracking-wide text-white/55">CENA {idx + 1}</span>
                  {scene.lastTake && (
                    <span className="text-[10px] text-white/35">último take: {SCENE_MODELS.find((m) => m.id === scene.lastTake.model)?.name || scene.lastTake.model}{typeof scene.lastTake.cost === "number" ? ` · $${scene.lastTake.cost.toFixed(3)}` : ""}</span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <button type="button" title={scene.accepted ? "Cena aceita" : "Marcar como aceita"}
                      onClick={() => updateScene(scene.id, { accepted: !scene.accepted })}
                      className={`pressable h-6 px-2 rounded-full border text-[10px] font-semibold ${
                        scene.accepted ? "text-white bg-[#EF0328] border-[#EF0328]" : "text-white/45 bg-white/[0.04] border-white/[0.06] hover:text-white/75"
                      }`}>
                      <Check size={11} className="inline -mt-0.5" /> aceita
                    </button>
                    <button type="button" title="Remover cena"
                      onClick={() => mutate((p) => ({ ...p, scenes: p.scenes.filter((s) => s.id !== scene.id) }))}
                      className="pressable w-6 h-6 rounded-md text-white/35 hover:text-red-400 hover:bg-white/[0.06] flex items-center justify-center">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 flex flex-col gap-2">
                    <textarea value={scene.prompt}
                      onChange={(e) => updateScene(scene.id, { prompt: e.target.value })}
                      placeholder="A cena em prosa — use @tags do glossário; o prefixo de estilo entra sozinho…"
                      rows={2} className={`${inputClass} resize-y leading-relaxed`} />
                    <div className="flex items-center gap-1.5">
                      <input value={scene.continuity}
                        onChange={(e) => updateScene(scene.id, { continuity: e.target.value })}
                        placeholder="continuidade herdada (figurino, estado físico, lado de reentrada)…"
                        className={`${inputClass} text-[11px] text-white/55`} />
                      {idx > 0 && (
                        <button type="button" onClick={() => inheritContinuity(idx)}
                          title="Herdar estado da cena anterior"
                          className="pressable h-7 px-2 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] text-[10px] font-semibold text-white/55 hover:text-white/85">
                          ← herdar
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <select value={scene.modelId} onChange={(e) => updateScene(scene.id, { modelId: e.target.value })}
                        className="h-7 rounded-lg bg-[#212123] border border-white/[0.08] text-[11px] text-white/75 px-1.5">
                        {SCENE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <select value={scene.aspect} onChange={(e) => updateScene(scene.id, { aspect: e.target.value })}
                        className="h-7 rounded-lg bg-[#212123] border border-white/[0.08] text-[11px] text-white/75 px-1.5">
                        {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <input type="number" min={3} max={15} value={scene.duration}
                        onChange={(e) => updateScene(scene.id, { duration: Math.max(3, Math.min(15, parseInt(e.target.value, 10) || 5)) })}
                        className="w-14 h-7 rounded-lg bg-[#212123] border border-white/[0.08] text-[11px] text-white/75 text-center" />
                      <span className="text-[10px] text-white/35 -ml-0.5">s</span>
                      <button type="button" onClick={() => directScene(scene, idx)} disabled={renderingId !== null}
                        className="pressable ml-auto h-7 px-3 rounded-full bg-[#EF0328] text-white text-[11px] font-semibold disabled:opacity-40 flex items-center gap-1">
                        {renderingId === scene.id
                          ? <><Loader2 size={11} className="animate-spin" /> Rendering…</>
                          : <><Play size={11} /> Direct</>}
                      </button>
                    </div>
                  </div>
                  {scene.lastTake?.url && (
                    <div className="w-40 shrink-0">
                      <video src={scene.lastTake.url} muted loop playsInline
                        onLoadedMetadata={seekPosterFrame}
                        onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                        onMouseLeave={(e) => e.currentTarget.pause()}
                        className="w-full aspect-video object-cover rounded-xl border border-white/[0.08] bg-black/40" />
                    </div>
                  )}
                </div>
              </div>
            ))}
            <button type="button"
              onClick={() => mutate((p) => ({ ...p, scenes: [...p.scenes, newScene()] }))}
              className="pressable self-start h-8 px-3 rounded-full border border-white/[0.08] bg-white/[0.04] text-[12px] font-semibold text-white/60 hover:text-white/90">
              <Plus size={12} className="inline mr-1 -mt-0.5" />Nova cena
            </button>
          </>
        )}
      </div>
    </div>
  );
}
