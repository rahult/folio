# End-to-end checks on macOS

_Design settled 2026-09-14. Companion to the unit suites (Vitest, cargo):
these drive the real app the way a person does, so a release can be
checked on this Mac before it ships._

## Goal

`npm run e2e` builds the app from the current checkout, launches it in an
isolated environment, and runs the scenarios that were checked by hand
today: the review loop, a relative path handed to a running app, window
geometry, the Reading Panel's layout, the Settings page, prompt files, the
skill install, and a lens against a local model. One pass/fail line per
scenario, artifacts on failure, nothing left behind on the machine.

## Where it runs

Only on a macOS session with Accessibility permission for the terminal
running it (System Events and screen capture). Hosted CI runners have no
such permission, so this is on demand, never in GitHub Actions. The runner
refuses to start when a `folio-app` process is already running, so it never
touches the person's own instance.

## Layout

```
scripts/e2e.sh                 build sidecar + app bundle, then run vitest with the e2e config
vitest.e2e.config.ts           include tests/e2e/**/*.e2e.ts, fileParallelism false, testTimeout 120000, hookTimeout 180000
tests/e2e/mac.ts               the helper (below)
tests/e2e/fixtures/sample.md   a short document with three headings and a list
tests/e2e/review.e2e.ts        approve, changes, relative path
tests/e2e/layout.e2e.ts        geometry, panel tabs
tests/e2e/settings.e2e.ts      settings page, second window, Edit in Folio, skill install
tests/e2e/lens.e2e.ts          lens against a local model (skipped without one)
```

`npm test` stays `vitest run`, whose default include pattern does not match
`*.e2e.ts`, so unit runs never start the app.

## Isolation

Each file's `beforeAll` creates a fresh `HOME` under the session scratch
directory (`FOLIO_E2E_HOME`, default `$TMPDIR/folio-e2e/<file>-<pid>`),
seeds `Documents/Folio/` and copies the fixture to `docs/sample.md`, and
launches `Folio.app/Contents/MacOS/folio-app` from the freshly built bundle
with `HOME` set to that folder. Because Folio resolves its config directory,
Home folder, and skill targets from `HOME`, `settings.json`, the history
archive, `decisions.md`, `lenses/`, and `~/.claude/skills/folio` all land
inside the temp folder. The `folio` command is the bundle's sidecar, run
with the same `HOME` and an explicit `cwd`. `afterAll` quits the app (menu
Quit, then `kill` after 5 s), deletes the temp `HOME`, and deletes any
`.feedback.md` beside the fixture copy.

## The helper (`tests/e2e/mac.ts`)

```
bundle(): { app: string; cli: string }           paths inside src-tauri/target/release/bundle/macos/Folio.app
launchApp(home: string): Promise<void>            spawn folio-app with HOME=home; wait until System Events lists a window (10 s)
quitApp(): Promise<void>                          menu Folio → Quit Folio; kill after 5 s; wait until no process
folio(args: string[], opts: { home: string; cwd: string; timeoutMs?: number }): Promise<{ code: number; stdout: string; stderr: string }>
osa(script: string): Promise<string>              run AppleScript, return stdout
menu(...path: string[]): Promise<void>            click a menu item by its menu path, e.g. menu("View", "Reading Panel"), menu("View", "Themes", "Night")
keys(text: string): Promise<void>                 System Events keystroke into the focused control
keyCode(code: number): Promise<void>              a single key by code (36 Return, 53 Escape)
clickButton(name: string, win = 1): Promise<void> click the first accessibility button/checkbox/radio with that name in window `win`
axTexts(win = 1, maxLen = 120): Promise<string[]> static-text values ≤ maxLen in window `win` (walks entire contents; use only on short views)
axButtons(win = 1): Promise<string[]>             names of buttons, checkboxes, radio buttons
frames(role: string, win = 1): Promise<{ name: string; x: number; y: number; w: number; h: number }[]>   positions of elements of a role
windowRect(win = 1): Promise<{ x; y; w; h }>
windowCount(): Promise<number>
screenshotWindow(name: string, win = 1): Promise<string>   window-rectangle capture into the scratch dir; returns the path
readHome(home: string, rel: string): string | null
settingsOf(home: string): Settings | null         parse <home>/Library/Application Support/com.rahult.folio/settings.json
themeMark(): Promise<string | null>               the checked item of View → Themes
aerospaceRunning(): boolean                       `pgrep -x AeroSpace`
waitFor(fn, { timeoutMs, everyMs }): Promise<void>
```

Every `osa` call has a 30 s timeout; `axTexts` refuses to walk the editor
when the document is longer than 200 lines (it walks only the panel, the
toolbar, and the review bar by targeting those groups) so a long document
cannot stall a test.

## Scenarios

**review.e2e.ts**
1. *Approve.* `folio(["review","--wait","--agent","e2e","docs/sample.md"], {cwd: home})` in the background; wait for the review bar text `e2e waiting`; `clickButton("✓ Approve")`; expect exit 0, stdout beginning `# Review feedback: sample.md`, and `docs/sample.md.feedback.md` equal to stdout.
2. *Changes.* Same start; `keys("c")`, `keys("Why this?")`, `keyCode(36)`, then `clickButton("Request changes")`; expect exit 2, stdout containing `## 1. Comment on L` and `Why this?`, and no `## Keep as is`.
3. *Relative path with the app running.* With the app already showing `Untitled`, run `folio(["review","docs/sample.md"], {cwd: home})` (no `--wait`); expect exit 0 and, within 5 s, a window whose toolbar title text is `sample.md`; the window count grows by one.

**layout.e2e.ts**
4. *Geometry kept.* Skipped when `aerospaceRunning()`. Record `windowRect()`, run scenario 3's command, expect the original window's rect unchanged and the new window's size not equal to 420×640.
5. *Panel tabs fit.* Open the fixture, `menu("View","Reading Panel")`; expect `frames("AXButton")` to include Outline, Annotations, History, Lenses, Decide, each with `x + w` ≤ the panel group's `x + w` and `x` ≥ its `x`.

**settings.e2e.ts**
6. *Settings opens and saves.* `menu("Folio","Settings…")`; expect `axButtons()` to include General, Review, Lenses, Prompts, Agents & command line, About, Done; `clickButton("Night")`; expect `settingsOf(home).theme === "night"` within 3 s and `themeMark() === "Night"`.
7. *Second window follows.* `menu("File","New Window")`; in window 1 open Settings and `clickButton("Slate")`; expect `themeMark()` for window 2 (after raising it) to be `Slate` within 3 s.
8. *Edit in Folio.* Settings → Prompts; click the Edit in Folio button of the row named `Council of experts` (found by frames: the button whose y matches the row's static text); expect `readHome(home,"Documents/Folio/lenses/council.md")` to start with `---\nname: Council of experts` and the toolbar title to read `council.md`.
9. *Skill install.* Settings → Agents & command line; click the Install button on the Claude Code row; expect `readHome(home,".claude/skills/folio/SKILL.md")` equal to `skills/folio/SKILL.md` (LF) and the row's status text `current`.

**lens.e2e.ts**
10. *Lens with a local model.* Skipped unless `GET http://localhost:11434/v1/models` answers within 2 s. Settings → Lenses: set endpoint `http://localhost:11434/v1` and model to the first model name from that response; open the fixture, `menu("View","Reading Panel")`, click the Lenses tab, choose Premortem, click Run; expect `docs/sample.md.analysis.md` to contain one `## Lens: Premortem` section within 90 s.

## Reporting and failures

Vitest reports one line per scenario. On failure the test's `onTestFailed`
hook saves `screenshotWindow(<scenario>)` and writes `axTexts()` to
`<scratch>/<scenario>.ax.txt`, and the assertion message includes both
paths. Scenarios never share state: each file launches its own app and the
runner exits non-zero if any file fails.

## Out of scope

- Running in GitHub Actions or on Linux/Windows.
- Pixel comparison; the checks read the accessibility tree and files.
- The migration from legacy localStorage (WebKit storage is not reachable
  from the harness).
- Driving Orca; System Events and `screencapture` are the only tools.
