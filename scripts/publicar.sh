#!/usr/bin/env bash
# Promote what is on this machine to gusaistudio.vercel.app.
#
# The gate is the point: nothing reaches the app you use every day without
# passing the guards first. A failing check stops the deploy, it does not warn
# and continue.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YEL=$'\033[33m'; OFF=$'\033[0m'
step () { echo; echo "${BOLD}$1${OFF}"; }
die  () { echo; echo "${RED}✗ $1${OFF}"; echo "${DIM}  Nada foi publicado. A produção continua como estava.${OFF}"; exit 1; }

step "1/5  Mudanças ainda não salvas"
if [ -n "$(git status --porcelain)" ]; then
  git status --short | sed 's/^/     /'
  echo
  read -r -p "     Salvar essas mudanças e continuar? [s/N] " ok
  [[ "$ok" =~ ^[sSyY]$ ]] || die "Publicação cancelada por você."
  read -r -p "     Descreva o que mudou: " msg
  [ -n "$msg" ] || die "Preciso de uma descrição para registrar a mudança."
  git add -A
  git commit -q -m "$msg"
  echo "     ${GREEN}salvo${OFF}"
else
  echo "     ${DIM}nada pendente${OFF}"
fi

step "2/5  Guardas de interface"
bash tests/ui/overlays.sh | sed 's/^/     /' || die "Um guarda de interface falhou."

step "3/5  Testes do pipeline de geração"
bash tests/pipeline/run.sh 2>&1 | tail -n 20 | sed 's/^/     /' || die "Um teste do pipeline falhou."

step "4/5  Build de verificação"
echo "     ${DIM}compilando em .next-check (não mexe no servidor local)…${OFF}"
NEXT_DIST_DIR=.next-check npx next build > /tmp/publicar-build.log 2>&1 \
  || { tail -n 25 /tmp/publicar-build.log | sed 's/^/     /'; die "O build falhou."; }
rm -rf .next-check
echo "     ${GREEN}compilou${OFF}"

step "5/5  Publicando"
git push -q origin HEAD HEAD:main
npx vercel --prod --yes > /tmp/publicar-deploy.log 2>&1 \
  || { tail -n 20 /tmp/publicar-deploy.log | sed 's/^/     /'; die "O deploy falhou."; }

echo
echo "${GREEN}${BOLD}✓ No ar em https://gusaistudio.vercel.app${OFF}"
echo "${DIM}  Commit: $(git log -1 --pretty=%s)${OFF}"
