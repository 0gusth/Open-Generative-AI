"use client";

import { useState } from "react";

// Minimal gate for public deployments — one code, one cookie, straight to
// the studio. Only reachable when APP_ACCESS_CODE is set on the server.
export default function UnlockPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (r.ok) {
        window.location.replace("/studio");
        return;
      }
      setError("Código incorreto — tenta de novo.");
    } catch {
      setError("Não consegui verificar. Tenta de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f10] flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xs rounded-2xl border border-white/[0.07] bg-[#171719] p-6 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-white/95 font-semibold text-lg tracking-tight">Studio</span>
          <span className="text-white/40 text-[13px]">Digite o código de acesso para entrar.</span>
        </div>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="código de acesso"
          autoFocus
          className="w-full bg-[#212123] border border-white/[0.08] rounded-lg px-3 py-2 text-[14px] text-white/90 placeholder-white/25 outline-none focus:border-[#EF0328]/50"
        />
        {error && <span className="text-[12px] text-red-400">{error}</span>}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="pressable w-full h-10 rounded-xl bg-[#EF0328] text-white text-[14px] font-semibold disabled:opacity-40"
        >
          {busy ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
