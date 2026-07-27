# Design: Auto-update

Date: 2026-07-27
Status: implemented

## Problem

Folio had no update mechanism; users had to manually download new releases.

## Approach

Standard Tauri 2 updater (`tauri-plugin-updater`) backed by GitHub Releases:
`tauri-action` already publishes every release, and with an updater pubkey in
`tauri.conf.json` plus the signing key in CI it also emits signed updater
artifacts (`latest.json`, `.app.tar.gz`/`.zip` + `.sig`). The app checks the
`latest.json` endpoint on launch (silently) and from a menu item
(interactively), then downloads, verifies the minisign signature, installs,
and relaunches via `tauri-plugin-process`.

## Components

### Signing key

- minisign keypair generated with `npx tauri signer generate` (no password,
  for CI); private key lives in `~/.tauri/folio.key` locally and in the
  `TAURI_SIGNING_PRIVATE_KEY` GitHub secret. Public key is committed in
  `src-tauri/tauri.conf.json`. **Losing the private key breaks updates
  permanently** — the pubkey is baked into every shipped app.

### `src-tauri/tauri.conf.json`

`plugins.updater` with the pubkey and one endpoint:
`https://github.com/rahult/folio/releases/latest/download/latest.json`.

### Rust (`src-tauri/src/lib.rs`)

Registers `tauri_plugin_updater` and `tauri_plugin_process`. Adds
"Check for Updates…" (`app.check-updates`) to the Folio application menu.

### Frontend (`src/main.ts`, `src/menu.ts`)

`checkForUpdates(manual)`:
- `check()` errors (offline, no release): silent on startup, error dialog
  when manual.
- Up to date: silent on startup, "latest version" dialog when manual.
- Update available: `ask` dialog (version vs current) →
  `downloadAndInstall()` → `relaunch()`. Install failures get an error
  dialog; a declined update is simply ignored.
- Runs automatically (`manual = false`) once at startup.

`menu.ts` maps `app.check-updates` → `{ kind: "check-updates" }`.

### Capabilities (`src-tauri/capabilities/default.json`)

Adds `updater:default`, `process:default`, and the `dialog:allow-message` /
`dialog:allow-ask` permissions the update and default-app dialogs need.

### CI (`.github/workflows/release.yml`)

Passes `TAURI_SIGNING_PRIVATE_KEY` (+ password) to `tauri-action`, which then
uploads signed updater artifacts with each release.

## Error handling

All network/install failures surface as dialogs on manual checks and are
swallowed on the automatic startup check — an offline launch never nags.

## Testing

- `menu.test.ts` covers the new menu id; full npm + cargo suites pass.
- Local `tauri build` with `TAURI_SIGNING_PRIVATE_KEY_PATH` set must produce
  signed updater artifacts next to the bundles.
- End-to-end (update actually applied) requires two published releases and is
  verified on the next release cycle.

## Out of scope

- Delta updates, background downloads, update channels (beta/stable).
