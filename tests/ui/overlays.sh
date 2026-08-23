#!/usr/bin/env bash
# Source-level guards for defects that make controls unreachable.
# These are greps on purpose: they run in a second and catch the mistake at
# the moment it is written, not after it has eaten a week of clicks.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
fail=0

# 1. The composer lives at bottom-center. A toast there keeps pointer-events
#    auto so it can be dismissed, so it swallows every click on the generate
#    controls for its whole duration — buttons that look fine and do nothing.
hits=$(grep -rln 'position="bottom-center"' --include="*.jsx" --include="*.js" \
        components app packages/studio/src 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "FALHOU  Toaster em bottom-center cobre o compositor:"
  echo "$hits" | sed 's/^/          /'
  fail=1
else
  echo "PASS  nenhum Toaster pousa sobre a barra de geracao"
fi

# 2. The generate button must never be disabled while a render is in flight —
#    asking for a second image cannot wait on the first.
hits=$(grep -rn 'PromptAction' -A3 --include="*.jsx" \
        packages/studio/src/components 2>/dev/null | grep 'disabled={generating}' || true)
if [ -n "$hits" ]; then
  echo "FALHOU  botao de gerar travado durante o render:"
  echo "$hits" | sed 's/^/          /'
  fail=1
else
  echo "PASS  botao de gerar aceita uma segunda geracao"
fi

# 3. A control whose border is under white/[0.2] on graphite has no visible
#    shape — the label reads, the button does not exist.
hits=$(grep -A3 'CONTROL_IDLE_CLASS =' packages/studio/src/components/prompt/PromptComposer.jsx \
        | grep -oE 'border-white/\[0\.(0[0-9]|1[0-9])\]' || true)
if [ -n "$hits" ]; then
  echo "FALHOU  contorno dos controles abaixo do limite visivel: $hits"
  fail=1
else
  echo "PASS  contorno dos controles acima do limite visivel"
fi

# 4. The sandbox returns placeholders. If it were ever enabled in the cloud,
#    a real request would come back fake — worse than any error. It must be
#    switched on by the dev script alone, never committed anywhere.
hits=$(grep -rn 'NEXT_PUBLIC_SANDBOX' --include="*.json" --include="*.mjs" --include="*.env*"         package.json next.config.mjs vercel.json 2>/dev/null | grep -v '"dev"' || true)
if [ -n "$hits" ]; then
  echo "FALHOU  sandbox ligado fora do script de dev:"
  echo "$hits" | sed 's/^/          /'
  fail=1
else
  echo "PASS  sandbox so existe no comando de desenvolvimento"
fi

# 5. The sandbox must sit above every paid provider in the router, or a test
#    generation would reach a real API and be charged.
if grep -A6 'export async function tryProviderGenerate' packages/studio/src/providers.js | grep -q 'trySandbox'    && grep -A6 'export async function tryProviderVideo' packages/studio/src/providers.js | grep -q 'trySandbox'; then
  echo "PASS  sandbox intercepta antes de qualquer provedor pago"
else
  echo "FALHOU  sandbox nao esta no topo do roteador — um teste chegaria a uma API paga"
  fail=1
fi

if [ $fail -eq 0 ]; then echo ""; echo "TODOS OS GUARDAS PASSARAM"; fi
exit $fail
