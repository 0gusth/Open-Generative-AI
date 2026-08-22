#!/usr/bin/env bash
# Pipeline regression suite. Transpiles the studio lib to CJS in a temp dir,
# stubs the browser globals, and drives the real router with a scripted fetch.
# No network, no provider key, no cost.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

cd "$ROOT/packages/studio"
npx babel src --out-dir "$OUT/lib" --extensions .js \
  --ignore "src/components/**","src/index.js" --copy-files --quiet 2>/dev/null

mkdir -p "$OUT/node_modules/react-hot-toast"
cat > "$OUT/node_modules/react-hot-toast/index.js" <<'STUB'
const t = (m) => m; t.error = t; t.success = t; t.loading = t;
module.exports = t; module.exports.default = t; module.exports.Toaster = () => null;
STUB

cp "$ROOT/tests/pipeline/cases.cjs" "$OUT/cases.cjs"
cd "$OUT" && node cases.cjs
