#!/usr/bin/env bash
# End-to-end checks on this Mac: build the sidecar and the app bundle from
# the checkout, then drive the real app through tests/e2e/*.e2e.ts.
# On demand only — hosted CI has no Accessibility permission.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
  echo "e2e: macOS only (System Events and screencapture)" >&2
  exit 2
fi
if pgrep -x folio-app >/dev/null; then
  echo "e2e: a folio-app process is running — quit Folio first so the checks never touch your own instance" >&2
  exit 2
fi
if [[ "${FOLIO_E2E_SKIP_BUILD:-}" != "1" ]]; then
  npm run build:cli
  # `tauri build` runs beforeBuildCommand (frontend + sidecar) itself; only
  # the .app is needed, not a dmg.
  npx tauri build --bundles app
fi
app="src-tauri/target/release/bundle/macos/Folio.app/Contents/MacOS/folio-app"
if [[ ! -x "$app" ]]; then
  echo "e2e: no bundle at $app — run without FOLIO_E2E_SKIP_BUILD" >&2
  exit 2
fi
exec npx vitest run --config vitest.e2e.config.ts "$@"
