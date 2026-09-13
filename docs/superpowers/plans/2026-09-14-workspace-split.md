# Workspace Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src-tauri` into a shared `folio-core` library, a small static `folio` command-line binary that fronts the app, and the Tauri app (`folio-app`), with no change in behaviour for a person using Folio 0.13.

**Architecture:** One Cargo workspace rooted at `src-tauri/Cargo.toml` (the app stays the root package so Tauri tooling is untouched). `folio-core` owns everything that runs without a window: the review gate, CLI argument parsing, the Feedback and Analysis file formats, Revision archiving, custom lens listing, and the embedded skill. The `folio` binary is built first and bundled into the app as a Tauri sidecar named `folio`, so `Folio.app/Contents/MacOS/folio` (the path the skill already falls back to) becomes the CLI. The app's TypeScript stops writing Feedback and Analysis; it calls two new commands that go through the core.

**Tech Stack:** Rust 2021 (cargo workspace, serde), Tauri v2 (`bundle.externalBin` sidecar), Vite/Vitest for the frontend, GitHub Actions (`tauri-apps/tauri-action`, `gh release upload`).

**Spec:** `docs/superpowers/specs/2026-09-13-terminal-review-design.md` (stage 1) with `docs/adr/0001-rust-owns-companion-formats.md` and `docs/adr/0002-separate-cli-binary.md`. Vocabulary: `CONTEXT.md`.

## Global Constraints

- Behaviour-preserving: after this plan a release must do exactly what 0.13.0 does for `folio <path>`, `folio review <path>`, `folio review --wait --agent X <path>`, `folio review --collect <path>`, `folio review -`, `folio skill install|show|where`, Approve / Request changes in the app, the Feedback file text, the Analysis file text, and the History archive.
- The CLI binary is named `folio`; the app binary is named `folio-app`. The sidecar inside the bundle is `folio`.
- `folio-core` has no Tauri, reqwest, keyring, or rusqlite dependency. Only `serde` and `serde_json`.
- Feedback text produced by the core must be byte-identical to what `buildFeedback` + `feedbackWithEditNote` produced in 0.13.0 (fixtures generated in Task 6 prove it).
- Analysis text produced by the core must be byte-identical to what `appendLensResult` produced in 0.13.0.
- The release workflow's version bump uses `sed -i 's/^version = ".*"/version = "X"/' src-tauri/Cargo.toml`; the workspace manifest must contain exactly one line matching `^version = "`.
- Every commit ends with the two attribution lines used in this repo:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM`.
- Test commands: `cargo test --workspace --manifest-path src-tauri/Cargo.toml` (baseline before this plan: 44 tests in the app crate) and `npm test` (baseline: 228 tests, 32 files). Frontend typecheck: `npm run build`.
- Work on branch `review-gate`; releases go from `main`.

---

## File structure after the plan

```
src-tauri/
  Cargo.toml                      workspace root + [package] folio-app (unchanged Tauri layout)
  src/main.rs                     unchanged (calls folio_lib::run)
  src/lib.rs                      app only: windows, menu, commands, SQLite annotations; uses folio_core
  src/lenses.rs                   app only: keychain + HTTP run_lens; custom listing delegates to core
  binaries/                       gitignored; sidecar copies written by scripts/build-cli.mjs
  crates/core/Cargo.toml          folio-core
  crates/core/src/lib.rs          pub mod cliargs, gate, skill, archive, lenses, feedback, analysis
  crates/core/src/cliargs.rs      CliOptions, GateOptions, parse, stdin_to_temp   (moved from lib.rs)
  crates/core/src/gate.rs         the review handshake                            (moved reviewgate.rs)
  crates/core/src/skill.rs        folio skill …                                   (moved skillcli.rs)
  crates/core/src/archive.rs      Revisions                                       (moved from lib.rs)
  crates/core/src/lenses.rs       custom lens folder listing                      (moved from lenses.rs)
  crates/core/src/feedback.rs     Feedback file text                              (ported from src/annotations.ts)
  crates/core/src/analysis.rs     Analysis file append                            (ported from src/lenses.ts)
  crates/core/tests/fixtures/feedback/*.md   0.13.0 outputs captured from TypeScript
  crates/cli/Cargo.toml           folio-cli, [[bin]] name = "folio"
  crates/cli/src/main.rs          dispatch: skill | --help | --version | gate | launch app
  crates/cli/src/app.rs           locate and launch folio-app
scripts/build-cli.mjs             builds the CLI and copies it to src-tauri/binaries/folio-<triple>
scripts/install.sh                curl | sh installer for the CLI tarball
```

Responsibilities that stay in TypeScript: parsing Feedback (`src/ledger.ts`) and Analysis (`parseAnalysis` in `src/lenses.ts`) for display, annotation state, the review bar.

---

### Task 1: Cargo workspace with an empty core and CLI

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/crates/core/Cargo.toml`, `src-tauri/crates/core/src/lib.rs`
- Create: `src-tauri/crates/cli/Cargo.toml`, `src-tauri/crates/cli/src/main.rs`

**Interfaces:**
- Produces: crate names `folio-core` (lib `folio_core`), `folio-cli` (bin `folio`), `folio-app` (lib `folio_lib`, bin `folio-app`). Workspace-inherited `version`.

- [ ] **Step 1: Rewrite the root manifest as a workspace**

Replace the top of `src-tauri/Cargo.toml` (everything before `[lib]`) with:

```toml
[workspace]
members = ["crates/core", "crates/cli"]

[workspace.package]
version = "0.13.0"
authors = ["rahult"]
edition = "2021"

# The app is the workspace root so `tauri build`, `tauri dev`, and
# tauri-action keep working unchanged. The command-line binary and the
# shared core are members (ADR 0002).
[package]
name = "folio-app"
version.workspace = true
description = "Folio — a calm, Typora-style Markdown editor"
authors.workspace = true
edition.workspace = true
```

Keep `[lib]` (name `folio_lib`), `[build-dependencies]`, `[dependencies]`, and the macOS target block exactly as they are, and add one line at the top of `[dependencies]`:

```toml
folio-core = { path = "crates/core" }
```

- [ ] **Step 2: Create the core crate**

`src-tauri/crates/core/Cargo.toml`:

```toml
[package]
name = "folio-core"
version.workspace = true
authors.workspace = true
edition.workspace = true
description = "Folio's file formats and review gate, shared by the app and the command line"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

`src-tauri/crates/core/src/lib.rs`:

```rust
//! Everything Folio does that needs no window: the review gate, the
//! command-line arguments, the companion file formats (Feedback, Analysis,
//! Revisions), the lens folder, and the embedded agent skill. Used by the
//! app and by the `folio` command (ADR 0001, ADR 0002).
```

- [ ] **Step 3: Create the CLI crate**

`src-tauri/crates/cli/Cargo.toml`:

```toml
[package]
name = "folio-cli"
version.workspace = true
authors.workspace = true
edition.workspace = true
description = "The folio command: opens documents in Folio and runs reviews from a terminal"

[[bin]]
name = "folio"
path = "src/main.rs"

[dependencies]
folio-core = { path = "../core" }
```

`src-tauri/crates/cli/src/main.rs`:

```rust
fn main() {
    println!("folio {}", env!("CARGO_PKG_VERSION"));
}
```

- [ ] **Step 4: Build and test the workspace**

Run: `cargo test --workspace --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"`
Expected: three `test result: ok.` lines; the app crate still reports `44 passed`.

Run: `cargo run -q -p folio-cli --manifest-path src-tauri/Cargo.toml`
Expected: `folio 0.13.0`

Run: `grep -c '^version = "' src-tauri/Cargo.toml`
Expected: `1`

- [ ] **Step 5: Confirm the app still starts**

Run: `cd src-tauri && cargo build -q 2>&1 | tail -3 && ls target/debug/folio-app`
Expected: no errors; `target/debug/folio-app` exists.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/crates
git commit -m "Turn src-tauri into a workspace with an empty core and CLI crate

The app is now the folio-app package at the workspace root; folio-core and
folio-cli are members. Nothing moves yet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 2: Move the review gate and CLI argument parsing into the core

**Files:**
- Create: `src-tauri/crates/core/src/gate.rs` (from `src-tauri/src/reviewgate.rs`)
- Create: `src-tauri/crates/core/src/cliargs.rs` (from `src-tauri/src/lib.rs:64-195`)
- Modify: `src-tauri/crates/core/src/lib.rs`
- Modify: `src-tauri/src/lib.rs`
- Delete: `src-tauri/src/reviewgate.rs`

**Interfaces:**
- Produces: `folio_core::gate::{ReviewState, ReviewRequest, DEFAULT_TIMEOUT_SECS, STALE_SECS, review_dir, request_path_in, mark_changes_requested_in, take_changes_requested_in, write_request_in, read_request_in, resolve_in, clear_in, sweep_stale_in, exit_code, wait_for_verdict_in, run_cli, run_cli_in}` where
  `pub fn run_cli(paths: &[String], wait: bool, agent: &str, timeout_secs: u64, open_window: &dyn Fn(&str)) -> i32` and
  `pub fn run_cli_in(dir: &Path, paths: &[String], wait: bool, agent: &str, timeout_secs: u64, open_window: &dyn Fn(&str)) -> i32`.
- Produces: `folio_core::cliargs::{MARKDOWN_EXTS, GateOptions, CliOptions, parse, stdin_to_temp, write_temp_markdown}` with all struct fields `pub`, `pub fn parse(args: impl IntoIterator<Item = String>) -> CliOptions`.

- [ ] **Step 1: Move the gate**

`git mv src-tauri/src/reviewgate.rs src-tauri/crates/core/src/gate.rs`. In the moved file:

1. Delete `fn spawn_review_window` (it used `current_exe`, which means something different in each binary).
2. Replace `pub fn run_cli(paths: &[String], wait: bool, agent: &str, timeout_secs: u64) -> i32 {` and its body's first lines so the function reads:

```rust
/// `folio review --wait|--collect <path>`. Prints the feedback Markdown to
/// stdout on a decision and returns the process exit code. `open_window`
/// is how the caller shows the review (the app spawns itself; the CLI
/// starts the app) — the gate never knows which binary it is in.
pub fn run_cli(
    paths: &[String],
    wait: bool,
    agent: &str,
    timeout_secs: u64,
    open_window: &dyn Fn(&str),
) -> i32 {
    run_cli_in(&review_dir(), paths, wait, agent, timeout_secs, open_window)
}

pub fn run_cli_in(
    dir: &Path,
    paths: &[String],
    wait: bool,
    agent: &str,
    timeout_secs: u64,
    open_window: &dyn Fn(&str),
) -> i32 {
    let Some(path) = paths.first() else {
        eprintln!("folio: no markdown file to review");
        return 4;
    };
    sweep_stale_in(dir, STALE_SECS);
```

and in the rest of the body replace every `&dir` with `dir` and the line `spawn_review_window(path);` with `open_window(path);`.

3. Add to the file's tests module:

```rust
    #[test]
    fn run_cli_wait_opens_the_window_and_returns_the_verdict_code() {
        let dir = temp_dir("run-cli-wait");
        let path = "/tmp/plan.md".to_string();
        let opened = std::cell::RefCell::new(Vec::new());
        // Pre-decide the request so the wait returns at once.
        write_request_in(&dir, &ReviewRequest::waiting(&path, "claude", 1)).unwrap();
        resolve_in(&dir, &path, ReviewState::Approved, "# ok\n", false).unwrap();
        let code = run_cli_in(&dir, &[path.clone()], true, "claude", 1, &|p| {
            opened.borrow_mut().push(p.to_string())
        });
        assert_eq!(code, 0);
        assert_eq!(opened.borrow().as_slice(), &[path]);
        assert!(read_request_in(&dir, "/tmp/plan.md").is_none(), "cleared after collection");
    }
```

(`temp_dir(tag)` already exists in that tests module. If `resolve_in`'s signature differs from `(dir, path, state, feedback, document_edited)`, read it at the top of the file and match it.)

- [ ] **Step 2: Move the CLI options**

Create `src-tauri/crates/core/src/cliargs.rs` with this header, then cut lines 64–195 of `src-tauri/src/lib.rs` (from `/// Gate flags from a` through the closing brace of `parse_cli_args`) into it:

```rust
//! What a `folio …` invocation asked for: which Markdown files, whether
//! the floating review window was requested, and the gate flags. Shared by
//! the app (which also uses `CliOptions` as a window's startup request) and
//! the `folio` command.

use std::fs;

/// File extensions Folio opens; mirrors `fileAssociations` in tauri.conf.json.
pub const MARKDOWN_EXTS: [&str; 4] = ["md", "markdown", "mdown", "mkd"];
```

Then edit the moved code: make `GateOptions`, `CliOptions`, and every field of both `pub`; rename `fn parse_cli_args` to `pub fn parse`; make `write_temp_markdown` and `stdin_to_temp` `pub`; replace `reviewgate::DEFAULT_TIMEOUT_SECS` with `crate::gate::DEFAULT_TIMEOUT_SECS`. Delete the `MARKDOWN_EXTS` const from `lib.rs` (line 17) and add at its place `use folio_core::cliargs::{self, CliOptions, MARKDOWN_EXTS};`.

- [ ] **Step 3: Move the argument tests**

In `src-tauri/src/lib.rs`'s `mod tests`, every test whose name starts with `parse_cli_args_` moves to a `#[cfg(test)] mod tests { use super::*; … }` at the bottom of `cliargs.rs`; inside them replace `parse_cli_args(` with `parse(`. Find them with:

`grep -n "fn parse_cli_args_" src-tauri/src/lib.rs`

Also move any test that only exercises `write_temp_markdown` or `stdin_to_temp` (`grep -n "write_temp_markdown\|stdin_to_temp" src-tauri/src/lib.rs` inside the tests module).

- [ ] **Step 4: Wire the core into lib.rs**

In `src-tauri/crates/core/src/lib.rs` add:

```rust
pub mod cliargs;
pub mod gate;
```

In `src-tauri/src/lib.rs`:
- Replace `pub mod reviewgate;` with `use folio_core::gate as reviewgate;` (keeps every `reviewgate::` call site valid).
- Replace `let cli = parse_cli_args(std::env::args());` with `let cli = cliargs::parse(std::env::args());`.
- Add, next to `open_window`:

```rust
/// Open a review window for `path` in the running app — or start the app
/// if nothing is running. Spawned detached and *without* the gate flags,
/// so the child is an ordinary `folio-app review <path>` invocation that
/// the spool handoff routes to the primary instance.
fn spawn_review_window(path: &str) {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let _ = std::process::Command::new(exe)
        .args(["review", path])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}
```

- Change the gate branch in `run()` to:

```rust
    if cli.gate.wait || cli.gate.collect {
        std::process::exit(reviewgate::run_cli(
            &cli.paths,
            cli.gate.wait,
            &cli.gate.agent,
            cli.gate.timeout_secs,
            &spawn_review_window,
        ));
    }
```

- `write_spool_in`, `drain_spool_in`, `open_window`, and `take_startup_request` use `CliOptions` fields directly; they compile unchanged because the fields are now `pub`.

- [ ] **Step 5: Run the tests**

Run: `cargo test --workspace --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"`
Expected: all `ok`; the sum of passed tests across the three crates is 45 (44 baseline plus the new `run_cli_wait…` test). Record the per-crate counts in the commit message.

- [ ] **Step 6: Commit**

```bash
git add -A src-tauri/src src-tauri/crates
git commit -m "Move the review gate and CLI argument parsing into folio-core

run_cli takes the window-opening action as a callback so the gate no
longer cares which binary it runs in.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 3: Move the skill installer into the core

**Files:**
- Create: `src-tauri/crates/core/src/skill.rs` (from `src-tauri/src/skillcli.rs`)
- Modify: `src-tauri/crates/core/src/lib.rs`, `src-tauri/src/lib.rs`
- Delete: `src-tauri/src/skillcli.rs`

**Interfaces:**
- Produces: `folio_core::skill::{SKILL_NAME, skill_text, Target, SkillCommand, SkillAction, parse, install_paths, install_in, run}` — the same names `skillcli` had.

- [ ] **Step 1: Move the file**

`git mv src-tauri/src/skillcli.rs src-tauri/crates/core/src/skill.rs`. Change the embed path, which is now four directories deeper:

```rust
const SKILL_MD_RAW: &str = include_str!("../../../../skills/folio/SKILL.md");
```

Add `pub mod skill;` to `src-tauri/crates/core/src/lib.rs`. In `src-tauri/src/lib.rs` replace `mod skillcli;` with `use folio_core::skill as skillcli;`.

- [ ] **Step 2: Test**

Run: `cargo test --workspace --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"`
Expected: all `ok`, same total (45).

Run: `cargo run -q -p folio-app --manifest-path src-tauri/Cargo.toml -- skill show | head -3`
Expected: the SKILL.md frontmatter (`---`, `name: folio`, …).

- [ ] **Step 3: Commit**

```bash
git add -A src-tauri/src src-tauri/crates
git commit -m "Move the skill installer into folio-core

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 4: Move Revision archiving into the core

**Files:**
- Create: `src-tauri/crates/core/src/archive.rs` (from `src-tauri/src/lib.rs:484-660`, the block headed `// Every on-disk version of a watched/reviewed file is archived`)
- Modify: `src-tauri/crates/core/src/lib.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `folio_core::archive::{MAX_REVISIONS, RevisionContent, RevisionMeta, RevisionText, path_hash, revision_seqs, read_revision_file, archive_in_dir, archive_with_feedback, list_in_dir, now_secs}` with all struct fields `pub` and all functions `pub`. `RevisionContent` derives `Serialize, Deserialize, Clone`; `RevisionMeta` and `RevisionText` derive `Serialize`.

- [ ] **Step 1: Move the block**

Cut from `src-tauri/src/lib.rs` everything from the comment `// Every on-disk version of a watched/reviewed file is archived` through the end of `fn now_secs()` (stop before `// ——— quick open ———`), except `fn history_dir` which stays in the app because it needs the `AppHandle`. Paste it into `src-tauri/crates/core/src/archive.rs` under this header:

```rust
//! Revisions: every on-disk version of a watched or reviewed Document,
//! archived so any earlier one can be diffed against the current text.
//! Storage: `<config>/history/<fnv1a(path)>/<seq>.json` holding
//! {"markdown","rendered","archived_at","origin","feedback"}. Rendered text
//! is kept alongside so history diffs map exactly onto the app's
//! decoration layer. Callers pass the directory, so the app resolves it
//! from Tauri and the CLI from the platform config dir.

use std::fs;
```

Make every struct, field, const, and function `pub` (keep `unknown_origin` private). Move the archive tests from `lib.rs`'s tests module to a tests module at the bottom of `archive.rs`: find them with `grep -n "archive_in_dir\|archive_with_feedback\|list_in_dir\|path_hash\|read_revision_file" src-tauri/src/lib.rs` and take every test that calls one of those.

- [ ] **Step 2: Wire the app**

In `src-tauri/crates/core/src/lib.rs` add `pub mod archive;`. In `src-tauri/src/lib.rs` add `use folio_core::archive::{self, RevisionContent, RevisionMeta, RevisionText};` and prefix the calls: `archive::archive_with_feedback(`, `archive::revision_seqs(`, `archive::read_revision_file(`, `archive::list_in_dir(`, `archive::now_secs()`, `archive::path_hash(`.

- [ ] **Step 3: Test**

Run: `cargo test --workspace --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"`
Expected: all `ok`, total 45.

- [ ] **Step 4: Commit**

```bash
git add -A src-tauri/src src-tauri/crates
git commit -m "Move Revision archiving into folio-core

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 5: Move custom lens listing into the core

**Files:**
- Create: `src-tauri/crates/core/src/lenses.rs`
- Modify: `src-tauri/crates/core/src/lib.rs`, `src-tauri/src/lenses.rs`

**Interfaces:**
- Produces: `folio_core::lenses::{LensFile { pub name: String, pub text: String }, default_dir() -> Option<PathBuf>, list_custom_in(dir: &Path) -> Vec<LensFile>}`.

- [ ] **Step 1: Write the failing test**

`src-tauri/crates/core/src/lenses.rs`:

```rust
//! The person's own lenses: every `.md` file under
//! `~/Documents/Folio/lenses`. Reading and running a lens against a Model
//! stays in the app; this is only the folder.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Debug, PartialEq)]
pub struct LensFile {
    pub name: String,
    pub text: String,
}

pub fn default_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    Some(PathBuf::from(home).join("Documents").join("Folio").join("lenses"))
}

/// Custom lenses in `dir`, sorted by file stem. Missing folder: none.
pub fn list_custom_in(dir: &Path) -> Vec<LensFile> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_markdown_files_sorted_by_stem_and_skips_others() {
        let dir = std::env::temp_dir().join(format!("folio-lenses-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("zebra.md"), "Z").unwrap();
        std::fs::write(dir.join("apple.md"), "A").unwrap();
        std::fs::write(dir.join("notes.txt"), "no").unwrap();
        let out = list_custom_in(&dir);
        assert_eq!(
            out,
            vec![
                LensFile { name: "apple".into(), text: "A".into() },
                LensFile { name: "zebra".into(), text: "Z".into() },
            ]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_folder_lists_nothing() {
        assert!(list_custom_in(Path::new("/nonexistent/folio-lenses")).is_empty());
    }
}
```

Add `pub mod lenses;` to `src-tauri/crates/core/src/lib.rs`.

- [ ] **Step 2: Run it to see it fail**

Run: `cargo test -p folio-core --manifest-path src-tauri/Cargo.toml lenses`
Expected: FAIL with `not yet implemented` (the `todo!`).

- [ ] **Step 3: Implement**

Replace the `todo!()` body with the body of `list_custom_lenses` from `src-tauri/src/lenses.rs`, reading `dir` instead of `lenses_dir()`:

```rust
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut out: Vec<LensFile> = entries
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            if path.extension().and_then(|x| x.to_str()) != Some("md") {
                return None;
            }
            let text = std::fs::read_to_string(&path).ok()?;
            Some(LensFile { name: path.file_stem()?.to_string_lossy().to_string(), text })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
```

- [ ] **Step 4: Point the app at it**

In `src-tauri/src/lenses.rs` delete `struct LensFile`, `fn lenses_dir`, and the body of `list_custom_lenses`; replace with:

```rust
/// The user's own lenses: every `.md` under ~/Documents/Folio/lenses.
#[tauri::command]
pub fn list_custom_lenses() -> Vec<folio_core::lenses::LensFile> {
    match folio_core::lenses::default_dir() {
        Some(dir) => folio_core::lenses::list_custom_in(&dir),
        None => Vec::new(),
    }
}

/// Where custom lenses live, creating the folder so the user can find it.
#[tauri::command]
pub fn lenses_folder() -> Result<String, String> {
    let dir = folio_core::lenses::default_dir().ok_or("no home directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}
```

Remove the now-unused `use std::path::PathBuf;` if the compiler warns.

- [ ] **Step 5: Test and commit**

Run: `cargo test --workspace --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"`
Expected: all `ok`, total 47.

```bash
git add -A src-tauri/src src-tauri/crates
git commit -m "Move custom lens listing into folio-core

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 6: Feedback text in the core, proven against 0.13.0 output

**Files:**
- Create: `tests/_gen-feedback-fixtures.test.ts` (temporary, deleted in this task)
- Create: `src-tauri/crates/core/tests/fixtures/feedback/{approved,comment,mixed,edited}.md`
- Create: `src-tauri/crates/core/src/feedback.rs`
- Modify: `src-tauri/crates/core/src/lib.rs`

**Interfaces:**
- Produces: `folio_core::feedback::{Annotation, is_change_request, LineRange, locate_quote, build}` where
  `pub struct Annotation { pub id: String, pub kind: String, pub quote: String, pub body: String, pub created_at: String }` (serde `rename_all = "camelCase"`, so it deserializes the frontend's `{id, kind, quote, body, createdAt}`), and
  `pub fn build(file_name: &str, annotations: &[Annotation], source: Option<&str>, document_edited: bool) -> String`.

- [ ] **Step 1: Capture what TypeScript writes today**

Create `tests/_gen-feedback-fixtures.test.ts`:

```ts
import { it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildFeedback, makeAnnotation } from "../src/annotations";
import { feedbackWithEditNote } from "../src/reviewgate";

// One-off: writes the 0.13.0 feedback text for four cases so the Rust port
// can be checked byte for byte. Deleted once the fixtures are committed.
const dir = "src-tauri/crates/core/tests/fixtures/feedback";
const text = `# Rollout plan

- Ship to all users at once.
- Roll back by flag.

## Risks

The **migration** runs in three passes, and the
second pass switches reads.
`;

it("writes the fixtures", () => {
  mkdirSync(dir, { recursive: true });
  const cases: Record<string, string> = {
    approved: buildFeedback("plan.md", []),
    comment: buildFeedback(
      "plan.md",
      [makeAnnotation("comment", "Ship to all users at once.", "Why all at once?")],
      text,
    ),
    mixed: buildFeedback(
      "plan.md",
      [
        makeAnnotation("approve", "Roll back by flag.", ""),
        makeAnnotation("delete", "Ship to all users at once.", ""),
        makeAnnotation(
          "replace",
          "migration runs in three passes, and the second pass switches reads",
          "migration runs in two passes",
        ),
        makeAnnotation("comment", "not in the file", "Where is this?"),
      ],
      text,
    ),
    edited: feedbackWithEditNote(
      buildFeedback("plan.md", [makeAnnotation("comment", "Risks", "Expand.")], text),
      true,
    ),
  };
  for (const [name, md] of Object.entries(cases)) writeFileSync(`${dir}/${name}.md`, md);
});
```

Run: `npx vitest run tests/_gen-feedback-fixtures.test.ts`
Expected: 1 passed; four files under `src-tauri/crates/core/tests/fixtures/feedback/`.

Run: `cat src-tauri/crates/core/tests/fixtures/feedback/mixed.md`
Expected: starts with `# Review feedback: plan.md`, has `Verdict: **changes requested** (3 annotations)`, `## 1. Delete L3 "Ship to all users at once."`, `## 2. Replace L8–9 "migration runs …`, `## 3. Comment on "not in the file"` (no line ref), and ends with `## Keep as is` then `- L4 "Roll back by flag."`.

Then `rm tests/_gen-feedback-fixtures.test.ts`.

- [ ] **Step 2: Write the Rust module with its tests**

`src-tauri/crates/core/src/feedback.rs`:

```rust
//! Feedback: the Markdown an Agent acts on after a Review. A verdict, one
//! numbered instruction per change request with the quoted passage and
//! its line range in the file when it can be found, then the passages
//! marked as good under "Keep as is". The same text is written to
//! `<doc>.feedback.md` and printed by the gate; this is its only writer
//! (ADR 0001). Ported from the app's TypeScript and held to its output by
//! the fixtures in `tests/fixtures/feedback/`.

use serde::{Deserialize, Serialize};

/// One review annotation; field names match the frontend model exactly.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    /// "comment" | "delete" | "replace" | "approve"
    pub kind: String,
    pub quote: String,
    pub body: String,
    pub created_at: String,
}

/// Kinds that ask the agent to change something; `approve` says keep it.
pub fn is_change_request(kind: &str) -> bool {
    kind != "approve"
}

/// 1-based inclusive lines.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LineRange {
    pub start: usize,
    pub end: usize,
}

/// Block-level syntax the rendered text never contains: list bullets and
/// numbers, heading hashes, quote bars, task checkboxes.
fn is_marker(word: &str) -> bool {
    if matches!(word, "-" | "*" | "+" | ">" | "[x]" | "[X]") {
        return true;
    }
    let hashes = word.bytes().take_while(|b| *b == b'#').count();
    if hashes == word.len() && (1..=6).contains(&hashes) {
        return true;
    }
    match word.chars().last() {
        Some('.') | Some(')') => {
            let digits = &word[..word.len() - 1];
            !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
        }
        _ => false,
    }
}

/// A word stripped of surrounding punctuation (`**bold**,` → `bold`).
fn word_core(word: &str) -> &str {
    word.trim_matches(|c: char| !c.is_alphanumeric())
}

/// Where a quote sits in the on-disk text. Matched on the word sequence,
/// so wrapping, inline marks, and whitespace differences don't matter.
pub fn locate_quote(source: &str, quote: &str) -> Option<LineRange> {
    let needle: Vec<&str> = quote
        .split_whitespace()
        .map(word_core)
        .filter(|w| !w.is_empty())
        .collect();
    if needle.is_empty() {
        return None;
    }
    let mut words: Vec<(&str, usize)> = Vec::new();
    for (i, line) in source.split('\n').enumerate() {
        for raw in line.split_whitespace() {
            if is_marker(raw) {
                continue;
            }
            let core = word_core(raw);
            if !core.is_empty() {
                words.push((core, i + 1));
            }
        }
    }
    if words.len() < needle.len() {
        return None;
    }
    (0..=words.len() - needle.len())
        .find(|&i| needle.iter().enumerate().all(|(j, w)| words[i + j].0 == *w))
        .map(|i| LineRange { start: words[i].1, end: words[i + needle.len() - 1].1 })
}

fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// "L12 " or "L12–14 ", or "" when the source is unknown or the quote is
/// not in it.
fn line_ref(source: Option<&str>, quote: &str) -> String {
    let Some(source) = source else { return String::new() };
    match locate_quote(source, quote) {
        Some(r) if r.start == r.end => format!("L{} ", r.start),
        Some(r) => format!("L{}–{} ", r.start, r.end),
        None => String::new(),
    }
}

/// The Feedback text for `file_name`. With no change requests the verdict
/// is approval. `document_edited` appends the note telling the agent the
/// reviewer changed the file directly.
pub fn build(
    file_name: &str,
    annotations: &[Annotation],
    source: Option<&str>,
    document_edited: bool,
) -> String {
    let changes: Vec<&Annotation> = annotations.iter().filter(|a| is_change_request(&a.kind)).collect();
    let keeps: Vec<&Annotation> = annotations.iter().filter(|a| !is_change_request(&a.kind)).collect();
    let mut lines: Vec<String> = vec![format!("# Review feedback: {file_name}"), String::new()];
    if changes.is_empty() {
        lines.push("Verdict: **approved** — no changes requested.".to_string());
    } else {
        let n = changes.len();
        let plural = if n == 1 { "" } else { "s" };
        lines.push(format!("Verdict: **changes requested** ({n} annotation{plural})"));
    }
    lines.push(String::new());
    for (i, a) in changes.iter().enumerate() {
        let n = i + 1;
        let quote = one_line(&a.quote);
        let at = line_ref(source, &a.quote);
        match a.kind.as_str() {
            "comment" => lines.extend([
                format!("## {n}. Comment on {at}\"{quote}\""),
                String::new(),
                format!("> {quote}"),
                String::new(),
                a.body.clone(),
                String::new(),
            ]),
            "delete" => lines.extend([
                format!("## {n}. Delete {at}\"{quote}\""),
                String::new(),
                format!("> {quote}"),
                String::new(),
                "Remove this section.".to_string(),
                String::new(),
            ]),
            _ => lines.extend([
                format!("## {n}. Replace {at}\"{quote}\""),
                String::new(),
                format!("> {quote}"),
                String::new(),
                "Suggested replacement:".to_string(),
                String::new(),
                a.body.clone(),
                String::new(),
            ]),
        }
    }
    if !keeps.is_empty() {
        lines.push("## Keep as is".to_string());
        lines.push(String::new());
        for a in &keeps {
            lines.push(format!("- {}\"{}\"", line_ref(source, &a.quote), one_line(&a.quote)));
        }
        lines.push(String::new());
    }
    let text = lines.join("\n");
    if !document_edited {
        return text;
    }
    format!(
        "{}\n\n---\n\nThe reviewer edited the document directly during this review — re-read the file before acting on this feedback.\n",
        text.trim_end()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEXT: &str = "# Rollout plan\n\n- Ship to all users at once.\n- Roll back by flag.\n\n## Risks\n\nThe **migration** runs in three passes, and the\nsecond pass switches reads.\n";

    fn ann(kind: &str, quote: &str, body: &str) -> Annotation {
        Annotation {
            id: format!("id-{kind}-{}", quote.len()),
            kind: kind.into(),
            quote: quote.into(),
            body: body.into(),
            created_at: "2026-09-14T00:00:00.000Z".into(),
        }
    }

    #[test]
    fn matches_the_typescript_output_for_an_approval() {
        assert_eq!(build("plan.md", &[], None, false), include_str!("../tests/fixtures/feedback/approved.md"));
    }

    #[test]
    fn matches_the_typescript_output_for_a_comment_with_a_line() {
        let out = build("plan.md", &[ann("comment", "Ship to all users at once.", "Why all at once?")], Some(TEXT), false);
        assert_eq!(out, include_str!("../tests/fixtures/feedback/comment.md"));
    }

    #[test]
    fn matches_the_typescript_output_for_mixed_kinds() {
        let out = build(
            "plan.md",
            &[
                ann("approve", "Roll back by flag.", ""),
                ann("delete", "Ship to all users at once.", ""),
                ann("replace", "migration runs in three passes, and the second pass switches reads", "migration runs in two passes"),
                ann("comment", "not in the file", "Where is this?"),
            ],
            Some(TEXT),
            false,
        );
        assert_eq!(out, include_str!("../tests/fixtures/feedback/mixed.md"));
    }

    #[test]
    fn matches_the_typescript_output_with_the_edit_note() {
        let out = build("plan.md", &[ann("comment", "Risks", "Expand.")], Some(TEXT), true);
        assert_eq!(out, include_str!("../tests/fixtures/feedback/edited.md"));
    }

    #[test]
    fn locate_finds_a_single_line_quote() {
        assert_eq!(locate_quote(TEXT, "Roll back by flag."), Some(LineRange { start: 4, end: 4 }));
    }

    #[test]
    fn locate_spans_lines_and_sees_through_marks_and_markers() {
        assert_eq!(locate_quote(TEXT, "migration runs in three passes, and the second"), Some(LineRange { start: 8, end: 9 }));
        assert_eq!(locate_quote(TEXT, "Risks"), Some(LineRange { start: 6, end: 6 }));
        assert_eq!(locate_quote("1. first\n2) second", "second"), Some(LineRange { start: 2, end: 2 }));
    }

    #[test]
    fn locate_returns_none_when_absent_or_empty() {
        assert_eq!(locate_quote(TEXT, "not here at all"), None);
        assert_eq!(locate_quote(TEXT, "  **  "), None);
        assert_eq!(locate_quote("", "x"), None);
    }

    #[test]
    fn annotations_deserialize_from_the_frontend_shape() {
        let a: Annotation = serde_json::from_str(r#"{"id":"a","kind":"comment","quote":"q","body":"b","createdAt":"t"}"#).unwrap();
        assert_eq!(a.created_at, "t");
    }
}
```

Add `pub mod feedback;` to `src-tauri/crates/core/src/lib.rs`.

- [ ] **Step 3: Run the tests**

Run: `cargo test -p folio-core --manifest-path src-tauri/Cargo.toml feedback`
Expected: 8 passed. If a fixture comparison fails, diff the two strings; the TypeScript `oneLine` helper in `src/annotations.ts` is the likeliest divergence (it must collapse whitespace runs to one space and trim). Fix the Rust side, never the fixture.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/crates/core
git commit -m "Port the Feedback writer to folio-core, held to 0.13.0 output by fixtures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 7: The app writes Feedback through the core

**Files:**
- Modify: `src-tauri/src/lib.rs` (annotation struct, new command, handler list)
- Modify: `src/main.ts` (`exportReviewFeedback`, `sendVerdict`), `src/annotations.ts`, `src/reviewgate.ts`
- Modify: `tests/annotations.test.ts`, `tests/reviewgate.test.ts`

**Interfaces:**
- Consumes: `folio_core::feedback::{Annotation, build}`.
- Produces: Tauri command `build_feedback(fileName: string, annotations: Annotation[], source: string | null, documentEdited: boolean): Promise<string>`.

- [ ] **Step 1: Add the command**

In `src-tauri/src/lib.rs`, delete the local `struct Annotation` (the one above `fn init_annotation_db`) and add `use folio_core::feedback::Annotation;` at the top; the SQLite code compiles unchanged because the fields and serde names are identical. Add next to `resolve_review`:

```rust
/// The Feedback text for the current annotations — the same bytes the
/// app writes to `<doc>.feedback.md` and hands to the gate.
#[tauri::command]
fn build_feedback(
    file_name: String,
    annotations: Vec<Annotation>,
    source: Option<String>,
    document_edited: bool,
) -> String {
    folio_core::feedback::build(&file_name, &annotations, source.as_deref(), document_edited)
}
```

and `build_feedback,` to the `generate_handler![…]` list.

- [ ] **Step 2: Call it from the frontend**

In `src/main.ts`:

`exportReviewFeedback` becomes:

```ts
async function exportReviewFeedback(): Promise<void> {
  trackEvent("export_feedback");
  const feedback = await invoke<string>("build_feedback", {
    fileName: doc.fileName,
    annotations,
    source: diskContent ?? null,
    documentEdited: false,
  });
  await copyText(feedback);
  if (doc.filePath) {
    await invoke("write_text_file", {
      path: `${doc.filePath}.feedback.md`,
      contents: feedback,
    });
  }
  feedbackBtn.classList.add("copied");
  setTimeout(() => feedbackBtn.classList.remove("copied"), 900);
}
```

In the verdict sender (around line 1896), replace

```ts
  const feedback = feedbackWithEditNote(
    buildFeedback(doc.fileName, annotations, diskContent ?? undefined),
    documentEditedDuringReview,
  );
```

with

```ts
  const feedback = await invoke<string>("build_feedback", {
    fileName: doc.fileName,
    annotations,
    source: diskContent ?? null,
    documentEdited: documentEditedDuringReview,
  });
```

Move that call inside the existing `try` if it is not already, so a failure surfaces through the same sticky error path. Remove `buildFeedback` from the `./annotations` import list and `feedbackWithEditNote` from the `./reviewgate` import.

- [ ] **Step 3: Delete the TypeScript writer**

In `src/annotations.ts` delete `buildFeedback`, `lineRef`, `oneLine`, `locateQuote`, `wordCore`, `MARKDOWN_MARKER`, and the `LineRange` interface (verify nothing else imports them: `grep -rn "locateQuote\|buildFeedback\|LineRange" src/ tests/`; the only hits must be the tests you delete next). In `src/reviewgate.ts` delete `feedbackWithEditNote`.

In `tests/annotations.test.ts` delete the `describe("buildFeedback"…)`, `describe("locateQuote"…)`, and `describe("buildFeedback with approve marks and line numbers"…)` blocks, keeping the `it("accepts approve when loading persisted annotations"…)` test by moving it into the `describe("annotation persistence"…)` block. In `tests/reviewgate.test.ts` delete the two `feedbackWithEditNote` tests and its import.

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: `tsc` passes with no unused-import errors.

Run: `npm test 2>&1 | grep -E "Tests|Test Files"`
Expected: all pass; the count is 228 minus the deleted tests (record it).

Run: `cargo test --workspace --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"`
Expected: all `ok`.

- [ ] **Step 5: Try it in the app**

Run: `pkill -x folio-app; pkill -x folio; npm run tauri dev` in the background, open `evaluation/03-lists.md`, add a comment annotation and a looks-good, then File → Export Review Feedback. Check `evaluation/03-lists.md.feedback.md` contains the `L<n>` line refs and the Keep-as-is section. Delete the file afterwards; stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add -A src src-tauri/src tests
git commit -m "Write Feedback through folio-core instead of TypeScript

The app calls build_feedback; buildFeedback, locateQuote, and
feedbackWithEditNote leave the frontend along with their tests, which now
live in the core.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 8: Analysis append in the core, called by the app

**Files:**
- Create: `src-tauri/crates/core/src/analysis.rs`
- Modify: `src-tauri/crates/core/src/lib.rs`, `src-tauri/src/lib.rs`
- Modify: `src/main.ts` (`runSelectedLens`), `src/lenses.ts`, `tests/lenses.test.ts`

**Interfaces:**
- Produces: `folio_core::analysis::{Reading { pub lens, pub producer, pub date, pub scope, pub body: String }, head(doc_name, doc_path) -> String, append(file_text: Option<&str>, doc_name: &str, doc_path: &str, reading: &Reading) -> String}`; `Reading` is serde camelCase.
- Produces: Tauri command `append_reading(path: string, docName: string, reading: Reading): Promise<string>` returning the whole new file text after writing `<path>.analysis.md`.

- [ ] **Step 1: Write the module and tests**

`src-tauri/crates/core/src/analysis.rs`:

```rust
//! The Analysis companion (`<doc>.analysis.md`): every Reading of a
//! Document, newest last in the file. One `## Lens:` section per Reading:
//! `## Lens: <name> — <YYYY-MM-DD> — <producer>`, a `Scope:` line, then the
//! body with its headings pushed down two levels so they cannot collide
//! with the file's own sections. This is the only writer (ADR 0001); the
//! app parses the file for display.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Reading {
    pub lens: String,
    /// A Model's name, or "<agent> (agent)".
    pub producer: String,
    /// YYYY-MM-DD
    pub date: String,
    /// "document", or the passage the lens ran on.
    pub scope: String,
    pub body: String,
}

pub fn head(doc_name: &str, doc_path: &str) -> String {
    format!("# Analysis: {doc_name}\n\nDocument: {doc_path}\n")
}

fn is_heading(line: &str) -> bool {
    let hashes = line.bytes().take_while(|b| *b == b'#').count();
    (1..=6).contains(&hashes) && line.as_bytes().get(hashes) == Some(&b' ')
}

fn demote(body: &str) -> String {
    body.split('\n')
        .map(|line| if is_heading(line) { format!("##{line}") } else { line.to_string() })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub fn append(file_text: Option<&str>, doc_name: &str, doc_path: &str, reading: &Reading) -> String {
    let head = file_text.map(str::to_string).unwrap_or_else(|| head(doc_name, doc_path));
    let scope_line = if reading.scope == "document" {
        "Scope: the whole document".to_string()
    } else {
        let collapsed = reading.scope.split_whitespace().collect::<Vec<_>>().join(" ");
        format!("Scope: \"{}\"", collapsed.chars().take(160).collect::<String>())
    };
    let section = format!(
        "## Lens: {} — {} — {}\n\n{}\n\n{}\n",
        reading.lens,
        reading.date,
        reading.producer,
        scope_line,
        demote(&reading.body)
    );
    format!("{}\n\n{}", head.trim_end_matches('\n'), section)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reading(lens: &str, date: &str, scope: &str, body: &str) -> Reading {
        Reading {
            lens: lens.into(),
            producer: "llama3.2:3b".into(),
            date: date.into(),
            scope: scope.into(),
            body: body.into(),
        }
    }

    #[test]
    fn starts_a_new_file_with_the_head_and_one_section() {
        let out = append(None, "plan.md", "/p.md", &reading("Council", "2026-09-14", "document", "- one\n- two"));
        assert_eq!(
            out,
            "# Analysis: plan.md\n\nDocument: /p.md\n\n## Lens: Council — 2026-09-14 — llama3.2:3b\n\nScope: the whole document\n\n- one\n- two\n"
        );
    }

    #[test]
    fn appends_after_an_existing_file_and_quotes_a_passage_scope() {
        let first = append(None, "plan.md", "/p.md", &reading("Council", "2026-09-14", "document", "a"));
        let out = append(Some(&first), "plan.md", "/p.md", &reading("Inversion", "2026-09-15", "  the   passage  ", "b"));
        assert!(out.starts_with(&first.trim_end_matches('\n').to_string()));
        assert!(out.ends_with("\n\n## Lens: Inversion — 2026-09-15 — llama3.2:3b\n\nScope: \"the passage\"\n\nb\n"));
    }

    #[test]
    fn demotes_headings_inside_a_body_and_truncates_long_scopes() {
        let out = append(None, "p.md", "/p.md", &reading("L", "2026-09-14", &"x".repeat(200), "# Top\n\n## Sub\n\n####### not a heading"));
        assert!(out.contains("\n### Top\n\n#### Sub\n\n####### not a heading\n"));
        assert!(out.contains(&format!("Scope: \"{}\"", "x".repeat(160))));
    }
}
```

Add `pub mod analysis;` to `src-tauri/crates/core/src/lib.rs`.

Run: `cargo test -p folio-core --manifest-path src-tauri/Cargo.toml analysis`
Expected: 3 passed. (The first expected string is exactly what `appendLensResult` produced in 0.13.0 for the same inputs: head, blank line, section.)

- [ ] **Step 2: The app command**

In `src-tauri/src/lib.rs` add:

```rust
/// Append a Reading to `<path>.analysis.md`, creating the file with its
/// head when absent. Returns the whole file so the panel can re-render
/// without another read.
#[tauri::command]
fn append_reading(
    path: String,
    doc_name: String,
    reading: folio_core::analysis::Reading,
) -> Result<String, String> {
    let file = format!("{path}.analysis.md");
    let existing = fs::read_to_string(&file).ok();
    let next = folio_core::analysis::append(existing.as_deref(), &doc_name, &path, &reading);
    fs::write(&file, &next).map_err(|e| format!("failed to write {file}: {e}"))?;
    Ok(next)
}
```

and `append_reading,` to `generate_handler![…]`.

- [ ] **Step 3: The frontend**

In `src/main.ts` `runSelectedLens`, replace

```ts
    const next = appendLensResult(analysisFileText, doc.fileName, path, {
      lens: lens.name,
      model: result.model,
      date: new Date().toISOString().slice(0, 10),
      scope: selection ?? "document",
      body: result.text.trim() || "(the model returned nothing)",
    });
    await invoke("write_text_file", { path: analysisFilePath(path), contents: next });
    analysisFileText = next;
```

with

```ts
    analysisFileText = await invoke<string>("append_reading", {
      path,
      docName: doc.fileName,
      reading: {
        lens: lens.name,
        producer: result.model,
        date: new Date().toISOString().slice(0, 10),
        scope: selection ?? "document",
        body: result.text.trim() || "(the model returned nothing)",
      },
    });
```

Remove `appendLensResult` from the import. In `src/lenses.ts` delete `appendLensResult` and the `LensResultEntry.body`-building helpers it alone used (`demote`); keep `LensResultEntry`, `ENTRY_HEADING`, and `parseAnalysis`.

In `tests/lenses.test.ts` replace the two tests that call `appendLensResult` with one parse test on a literal:

```ts
  it("parses lens sections newest first with their scope", () => {
    const text = [
      "# Analysis: plan.md",
      "",
      "Document: /p.md",
      "",
      "## Lens: Council — 2026-09-14 — llama3.2:3b",
      "",
      "Scope: the whole document",
      "",
      "- one",
      "",
      "## Lens: Inversion — 2026-09-15 — llama3.2:3b",
      "",
      'Scope: "the passage"',
      "",
      "### Top",
      "",
      "b",
      "",
    ].join("\n");
    const entries = parseAnalysis(text);
    expect(entries.map((e) => e.lens)).toEqual(["Inversion", "Council"]);
    expect(entries[0].scope).toBe("the passage");
    expect(entries[0].body).toBe("### Top\n\nb");
    expect(entries[1].scope).toBe("document");
    expect(entries[1].model).toBe("llama3.2:3b");
  });
```

and drop `appendLensResult` from the import.

- [ ] **Step 4: Verify and commit**

Run: `npm run build && npm test 2>&1 | grep -E "Tests|Test Files"` — all pass.
Run: `cargo test --workspace --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"` — all `ok`.

```bash
git add -A src src-tauri/src src-tauri/crates tests
git commit -m "Append Readings through folio-core instead of TypeScript

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 9: The `folio` command

**Files:**
- Create: `src-tauri/crates/cli/src/app.rs`
- Modify: `src-tauri/crates/cli/src/main.rs`

**Interfaces:**
- Consumes: `folio_core::{cliargs, gate, skill}`.
- Produces: `app::{APP_BINARY, candidates, locate, launch, window_args, review_window_args}`.

- [ ] **Step 1: Write `app.rs` with its tests**

```rust
//! Finding and starting the Folio app. The command is a separate binary
//! (ADR 0002); anything that needs a window is handed to `folio-app`,
//! spawned detached with the same arguments the app has always accepted.

use folio_core::cliargs::CliOptions;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const APP_BINARY: &str = if cfg!(windows) { "folio-app.exe" } else { "folio-app" };

/// Where the app might be, most specific first: an explicit override, the
/// directory this command runs from (the sidecar case, in the bundle and in
/// `tauri dev`), then the platform's usual install locations.
pub fn candidates(exe_dir: Option<&Path>, home: Option<&Path>, env_override: Option<&str>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(p) = env_override {
        out.push(PathBuf::from(p));
    }
    if let Some(dir) = exe_dir {
        out.push(dir.join(APP_BINARY));
    }
    if cfg!(target_os = "macos") {
        out.push(Path::new("/Applications/Folio.app/Contents/MacOS").join(APP_BINARY));
        if let Some(h) = home {
            out.push(h.join("Applications/Folio.app/Contents/MacOS").join(APP_BINARY));
        }
    }
    if cfg!(target_os = "linux") {
        out.push(Path::new("/usr/bin").join(APP_BINARY));
        out.push(Path::new("/usr/local/bin").join(APP_BINARY));
        if let Some(h) = home {
            out.push(h.join(".local/bin").join(APP_BINARY));
        }
    }
    if cfg!(windows) {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            out.push(PathBuf::from(local).join("Folio").join(APP_BINARY));
        }
        if let Some(pf) = std::env::var_os("ProgramFiles") {
            out.push(PathBuf::from(pf).join("Folio").join(APP_BINARY));
        }
    }
    out
}

pub fn locate() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    let over = std::env::var("FOLIO_APP").ok();
    candidates(exe_dir.as_deref(), home.as_deref(), over.as_deref())
        .into_iter()
        .find(|p| p.is_file())
}

/// The app's arguments for an ordinary open: `--float` when asked, then
/// the resolved paths (stdin has already become a temp file here, so the
/// app never has to read it).
pub fn window_args(cli: &CliOptions) -> Vec<String> {
    let mut args = Vec::new();
    if cli.float {
        args.push("--float".to_string());
    }
    args.extend(cli.paths.iter().cloned());
    args
}

/// The app's arguments for the window a `--wait` review opens.
pub fn review_window_args(path: &str) -> Vec<String> {
    vec!["review".to_string(), path.to_string()]
}

/// Start the app detached. The command returns at once; the app decides
/// whether it is the primary instance or hands the request over.
pub fn launch(args: &[String]) -> Result<(), String> {
    let app = locate().ok_or_else(|| {
        format!("Folio is not installed where I can find it — set FOLIO_APP to the app binary ({APP_BINARY} inside the Folio install)")
    })?;
    Command::new(app)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not start Folio: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn override_then_sibling_come_first() {
        let c = candidates(Some(Path::new("/opt/folio")), Some(Path::new("/home/me")), Some("/x/folio-app"));
        assert_eq!(c[0], PathBuf::from("/x/folio-app"));
        assert_eq!(c[1], Path::new("/opt/folio").join(APP_BINARY));
        assert!(c.len() >= 2);
    }

    #[test]
    fn without_hints_only_platform_locations_remain() {
        let c = candidates(None, None, None);
        assert!(c.iter().all(|p| p.ends_with(APP_BINARY)));
    }

    #[test]
    fn window_args_carry_float_and_paths() {
        let cli = CliOptions { paths: vec!["a.md".into(), "b.md".into()], float: true, ..Default::default() };
        assert_eq!(window_args(&cli), vec!["--float", "a.md", "b.md"]);
        let plain = CliOptions { paths: vec!["a.md".into()], ..Default::default() };
        assert_eq!(window_args(&plain), vec!["a.md"]);
        assert_eq!(review_window_args("p.md"), vec!["review", "p.md"]);
    }
}
```

(`CliOptions` derives `Default`, so `..Default::default()` works.)

- [ ] **Step 2: Write `main.rs`**

```rust
//! `folio`: the command line for Folio. Opens documents in the app, runs
//! the review gate for coding agents, and installs the agent skill. Runs
//! anywhere — it has no window of its own (ADR 0002).

mod app;

use folio_core::{cliargs, gate, skill};

const HELP: &str = "folio — Folio from the command line

  folio [--float] <file.md>…               open in Folio (`-` reads Markdown from stdin)
  folio review <file.md>                   open in a floating review window
  folio review --wait --agent <name> <file.md>
                                           open the review and block for the verdict:
                                           exit 0 approved, 2 changes requested,
                                           3 still open, 4 could not open
  folio review --collect <file.md>         print a verdict left by an earlier --wait
  folio skill install|show|where           the /folio agent skill (see `folio skill`)
  folio --version

Set FOLIO_APP to the app binary if Folio is installed somewhere unusual.
";

fn main() {
    let argv: Vec<String> = std::env::args().collect();
    if let Some(cmd) = skill::parse(&argv) {
        std::process::exit(skill::run(&cmd));
    }
    match argv.get(1).map(String::as_str) {
        Some("--help" | "-h" | "help") => {
            print!("{HELP}");
            return;
        }
        Some("--version" | "-V") => {
            println!("folio {}", env!("CARGO_PKG_VERSION"));
            return;
        }
        _ => {}
    }
    let cli = cliargs::parse(argv);
    if cli.gate.wait || cli.gate.collect {
        std::process::exit(gate::run_cli(
            &cli.paths,
            cli.gate.wait,
            &cli.gate.agent,
            cli.gate.timeout_secs,
            &|path| {
                if let Err(e) = app::launch(&app::review_window_args(path)) {
                    eprintln!("folio: {e}");
                }
            },
        ));
    }
    if let Err(e) = app::launch(&app::window_args(&cli)) {
        eprintln!("folio: {e}");
        std::process::exit(4);
    }
}
```

- [ ] **Step 3: Test and try**

Run: `cargo test -p folio-cli --manifest-path src-tauri/Cargo.toml`
Expected: 3 passed.

Run: `cargo build -q --manifest-path src-tauri/Cargo.toml -p folio-cli -p folio-app && pkill -x folio-app; FOLIO_APP=src-tauri/target/debug/folio-app src-tauri/target/debug/folio review evaluation/03-lists.md; echo exit=$?`
Expected: `exit=0` immediately, and a floating Folio window opens on the file (the dev build has no frontend server, so if the window is blank that is expected in this step; the point is that the app process starts with the right arguments — confirm with `ps -o args= -p $(pgrep -x folio-app)` showing `review evaluation/03-lists.md`).

Run: `src-tauri/target/debug/folio --help | head -2` and `src-tauri/target/debug/folio skill where`
Expected: the help text; the two skill paths.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/crates/cli
git commit -m "Add the folio command: gate and skill in-process, windows via folio-app

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 10: Bundle the command as a sidecar and ship tarballs

**Files:**
- Create: `scripts/build-cli.mjs`, `scripts/install.sh`
- Modify: `package.json`, `src-tauri/tauri.conf.json`, `.gitignore`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`

**Interfaces:**
- Produces: `npm run build:cli` → `src-tauri/binaries/folio-<host triple>[.exe]`; bundle contains `folio` beside `folio-app`; release assets `folio-<triple>.tar.gz` (`.zip` on Windows).

- [ ] **Step 1: The build script**

`scripts/build-cli.mjs`:

```js
// Builds the folio command in release mode and copies it to where Tauri's
// bundler looks for a sidecar: src-tauri/binaries/folio-<host triple>.
// Run by `npm run build:cli`, and by tauri.conf.json before dev and build.
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";

const triple = execSync("rustc -vV").toString().match(/^host: (.+)$/m)[1].trim();
execSync("cargo build --release -p folio-cli --manifest-path src-tauri/Cargo.toml", {
  stdio: "inherit",
});
const ext = process.platform === "win32" ? ".exe" : "";
mkdirSync("src-tauri/binaries", { recursive: true });
const target = `src-tauri/binaries/folio-${triple}${ext}`;
copyFileSync(`src-tauri/target/release/folio${ext}`, target);
console.log(`sidecar: ${target}`);
```

`package.json` scripts: add `"build:cli": "node scripts/build-cli.mjs"`.

`.gitignore`: add a line `src-tauri/binaries/`.

- [ ] **Step 2: Tauri config**

In `src-tauri/tauri.conf.json`:

```json
  "build": {
    "beforeDevCommand": "npm run build:cli && npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build && npm run build:cli",
    "frontendDist": "../dist"
  },
```

and inside `"bundle"` add `"externalBin": ["binaries/folio"],` before `"fileAssociations"`.

- [ ] **Step 3: Build the bundle locally and inspect it**

Run: `npm run build:cli && ls -la src-tauri/binaries/`
Expected: `folio-aarch64-apple-darwin`, a few MB.

Run: `npm run tauri build -- --bundles app 2>&1 | tail -5`
Expected: a `Folio.app` under `src-tauri/target/release/bundle/macos/`.

Run: `ls src-tauri/target/release/bundle/macos/Folio.app/Contents/MacOS/`
Expected: `folio` and `folio-app`. If the app executable is named differently (for example `Folio`), set `"mainBinaryName": "folio-app"` at the top level of `tauri.conf.json`, rebuild, and update `APP_BINARY` in `app.rs` only if the name still differs.

Run: `pkill -x folio-app; src-tauri/target/release/bundle/macos/Folio.app/Contents/MacOS/folio review --wait --agent test evaluation/03-lists.md; echo exit=$?`
Expected: the built app opens the file floating; click Approve in the review bar; the command prints the feedback and `exit=0`.

- [ ] **Step 4: CI**

In `.github/workflows/ci.yml`, before `Run Rust tests`, add:

```yaml
      - name: Build the command-line sidecar
        run: npm run build:cli
```

and change the Rust test step to `run: cargo test --workspace --manifest-path src-tauri/Cargo.toml`.

- [ ] **Step 5: Release workflow**

In `.github/workflows/release.yml`, in the `release` job:

Replace the `Run tests` step with:

```yaml
      - name: Build the command-line sidecar
        run: npm run build:cli

      - name: Run tests
        run: |
          npm test
          cargo test --workspace --manifest-path src-tauri/Cargo.toml
```

After the `tauri-apps/tauri-action@v0` step add:

```yaml
      # The command-line binary on its own, for machines without the app
      # (a headless server, or a container). One tarball per target; the
      # macOS and Linux runners also cross-build their other architecture,
      # which needs no extra toolchain for a crate with no C dependencies.
      - name: Package the command-line binary
        shell: bash
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAG: ${{ needs.bump.outputs.tag }}
        run: |
          set -euo pipefail
          host=$(rustc -vV | sed -n 's/^host: //p')
          pack() {
            triple="$1"; bin="$2"
            mkdir -p "pack/$triple"
            if [[ "$triple" == *windows* ]]; then
              cp "$bin" "pack/$triple/folio.exe"
              (cd "pack/$triple" && 7z a "../../folio-$triple.zip" folio.exe > /dev/null)
              gh release upload "$TAG" "folio-$triple.zip" --clobber
            else
              cp "$bin" "pack/$triple/folio"
              tar czf "folio-$triple.tar.gz" -C "pack/$triple" folio
              gh release upload "$TAG" "folio-$triple.tar.gz" --clobber
            fi
          }
          ext=""; [[ "$host" == *windows* ]] && ext=".exe"
          pack "$host" "src-tauri/binaries/folio-$host$ext"
          case "$host" in
            aarch64-apple-darwin)
              rustup target add x86_64-apple-darwin
              cargo build --release -p folio-cli --target x86_64-apple-darwin --manifest-path src-tauri/Cargo.toml
              pack x86_64-apple-darwin src-tauri/target/x86_64-apple-darwin/release/folio ;;
            x86_64-unknown-linux-gnu)
              sudo apt-get install -y gcc-aarch64-linux-gnu
              rustup target add aarch64-unknown-linux-gnu
              CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
                cargo build --release -p folio-cli --target aarch64-unknown-linux-gnu --manifest-path src-tauri/Cargo.toml
              pack aarch64-unknown-linux-gnu src-tauri/target/aarch64-unknown-linux-gnu/release/folio ;;
          esac
```

- [ ] **Step 6: The install script**

`scripts/install.sh`:

```sh
#!/bin/sh
# Installs the folio command into ~/.local/bin (or $FOLIO_BIN_DIR) from the
# latest GitHub release. For machines without the Folio app: a server you
# review on over SSH, a container an agent runs in.
set -eu

os=$(uname -s)
arch=$(uname -m)
case "$os-$arch" in
  Darwin-arm64)  triple=aarch64-apple-darwin ;;
  Darwin-x86_64) triple=x86_64-apple-darwin ;;
  Linux-x86_64)  triple=x86_64-unknown-linux-gnu ;;
  Linux-aarch64) triple=aarch64-unknown-linux-gnu ;;
  *) echo "folio: no build for $os $arch" >&2; exit 1 ;;
esac

dir="${FOLIO_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$dir"
url="https://github.com/rahult/folio/releases/latest/download/folio-$triple.tar.gz"
curl -fsSL "$url" | tar xz -C "$dir"
chmod +x "$dir/folio"
echo "installed $dir/folio"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "add $dir to your PATH to use it" ;;
esac
```

Run: `chmod +x scripts/install.sh && sh -n scripts/install.sh`
Expected: no output (syntax ok).

- [ ] **Step 7: Full local check and commit**

Run: `npm run build && npm test 2>&1 | grep -E "Tests" && cargo test --workspace --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"`
Expected: everything passes.

```bash
git add scripts package.json src-tauri/tauri.conf.json .gitignore .github/workflows
git commit -m "Bundle the folio command as a sidecar and ship it as release tarballs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 11: Folio → Install Command Line Tool

**Files:**
- Modify: `src-tauri/src/lib.rs` (menu item, command, handler list)
- Modify: `src/menu.ts`, `src/main.ts`
- Modify: `tests/menu.test.ts`

**Interfaces:**
- Produces: menu id `app.install-cli`; action `{ kind: "install-cli" }`; Tauri command `install_cli_tool(): Promise<string>` resolving to a sentence for the dialog.

- [ ] **Step 1: The failing frontend test**

In `tests/menu.test.ts`, find how the existing tests map a menu id to an action (search for `"app.check-updates"`) and add beside it:

```ts
  it("maps the command line tool item", () => {
    expect(actionForMenuId("app.install-cli")).toEqual({ kind: "install-cli" });
  });
```

using whatever the file's mapping function is called. Run `npx vitest run tests/menu.test.ts` — expected: the new test fails.

- [ ] **Step 2: Wire the action**

`src/menu.ts`: add `| { kind: "install-cli" }` to the action union and `case "app.install-cli": return { kind: "install-cli" };` next to the `app.check-updates` case.

`src/main.ts`: in the action switch add `case "install-cli": return installCliTool();` and the function:

```ts
/** Folio → Install Command Line Tool: link the bundled `folio` command
 *  into a directory on PATH and say where it went. */
async function installCliTool(): Promise<void> {
  try {
    const where = await invoke<string>("install_cli_tool");
    await message(where, { title: "Command Line Tool" });
  } catch (err) {
    await message(String(err), { title: "Command Line Tool", kind: "error" });
  }
}
```

(`message` is already imported from `@tauri-apps/plugin-dialog` in `main.ts`.)

- [ ] **Step 3: The command and menu item**

`src-tauri/src/lib.rs`, in `build_menu`, after the `app.check-updates` item:

```rust
        .item(&menu_item(
            app,
            "app.install-cli",
            "Install Command Line Tool…",
            None,
        )?)
```

and the command:

```rust
/// Folio → Install Command Line Tool: symlink the bundled `folio` command
/// into /usr/local/bin, or ~/.local/bin when that is not writable. On
/// Windows there is no conventional link target, so it names the folder.
#[tauri::command]
fn install_cli_tool() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("no app directory")?;
    let cli = dir.join(if cfg!(windows) { "folio.exe" } else { "folio" });
    if !cli.is_file() {
        return Err(format!("This build has no command line tool ({}).", cli.display()));
    }
    #[cfg(windows)]
    {
        return Ok(format!("Add this folder to your PATH to use `folio` from a terminal:\n{}", dir.display()));
    }
    #[cfg(unix)]
    {
        let home = std::env::var_os("HOME").map(std::path::PathBuf::from).ok_or("no home directory")?;
        for target in [std::path::PathBuf::from("/usr/local/bin"), home.join(".local").join("bin")] {
            if fs::create_dir_all(&target).is_err() {
                continue;
            }
            let link = target.join("folio");
            if let Ok(meta) = fs::symlink_metadata(&link) {
                if meta.file_type().is_symlink() || meta.is_file() {
                    if fs::remove_file(&link).is_err() {
                        continue;
                    }
                }
            }
            if std::os::unix::fs::symlink(&cli, &link).is_ok() {
                return Ok(format!(
                    "Installed {}.\nIf `folio` is not found in a new terminal, add {} to your PATH.",
                    link.display(),
                    target.display()
                ));
            }
        }
        Err("Could not write to /usr/local/bin or ~/.local/bin.".to_string())
    }
}
```

Add `install_cli_tool,` to `generate_handler![…]`.

- [ ] **Step 4: Verify**

Run: `npm run build && npx vitest run tests/menu.test.ts` — passes.
Run: `cargo build -q --manifest-path src-tauri/Cargo.toml` — compiles.

Run the bundle from Task 10 (`open src-tauri/target/release/bundle/macos/Folio.app`), choose Folio → Install Command Line Tool…, read the dialog, then in a terminal: `ls -l /usr/local/bin/folio ~/.local/bin/folio 2>/dev/null; folio --version`
Expected: a symlink into `Folio.app/Contents/MacOS/folio`, and `folio 0.13.0`. If a hand-made shim script existed at that path, it has been replaced; say so in the final report.

- [ ] **Step 5: Commit**

```bash
git add src src-tauri/src tests/menu.test.ts
git commit -m "Add Folio → Install Command Line Tool

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

---

### Task 12: Docs, skill text, roadmap, and the end-to-end check

**Files:**
- Modify: `README.md` (the "skill expects `folio` on PATH" section near line 182), `site/index.html` (the install snippet near line 314), `skills/folio/SKILL.md` (line 30, only if the fallback path changed in Task 10), `docs/ROADMAP.md`

- [ ] **Step 1: README**

Replace the shim instructions (the `mkdir -p ~/.local/bin && printf …` line and its lead-in) with:

````markdown
The skill expects `folio` on PATH. In the app choose **Folio → Install
Command Line Tool…**, which links the bundled command into
`/usr/local/bin` or `~/.local/bin`. On a machine without the app (a server
you review on over SSH, a container an agent runs in), install just the
command:

```sh
curl -fsSL https://raw.githubusercontent.com/rahult/folio/main/scripts/install.sh | sh
```

or download `folio-<target>.tar.gz` from the latest release. `cargo install
--path src-tauri/crates/cli` works from a checkout.
````

Add to the agent install snippet in the README (near line 168) the Pi line:

```sh
npx skills add rahult/folio -a pi     # Pi: invoked as /skill:folio
```

- [ ] **Step 2: Site and skill**

In `site/index.html` near line 314, after the `folio skill install` line inside the same `<pre><code>` block, add `npx skills add rahult/folio -a pi   # Pi, as /skill:folio`.

In `skills/folio/SKILL.md` line 30 the fallback path `/Applications/Folio.app/Contents/MacOS/folio` is now the command itself; leave it unless Task 10 Step 3 showed a different bundle layout.

- [ ] **Step 3: Roadmap**

In `docs/ROADMAP.md` move item 1 ("Workspace split") from **Next** into **Shipped** as:

```markdown
- Command line: `folio` is its own small binary (ADR 0002) bundled beside
  the app and shipped as tarballs with an install script; Folio → Install
  Command Line Tool. Feedback, Analysis, Revisions, the gate, and the skill
  live in `folio-core` (ADR 0001).
```

and renumber the remaining Next items from 1.

- [ ] **Step 4: End-to-end with the real skill loop**

With the Task 10 bundle installed as the command (Task 11), from a terminal:

```sh
pkill -x folio-app; pkill -x Folio; true
cp evaluation/03-lists.md /tmp/e2e.md
folio review --wait --agent claude /tmp/e2e.md; echo exit=$?
```

In the window: add a comment, add a looks-good, click Request changes.
Expected: the terminal prints the Feedback (a `## 1. Comment on L…` entry and a `## Keep as is` list) and `exit=2`; `/tmp/e2e.md.feedback.md` has the same text; then:

```sh
printf '\n\nRevised.\n' >> /tmp/e2e.md
folio review --wait --agent claude /tmp/e2e.md; echo exit=$?
```

Click Approve. Expected: `exit=0`, and in the Reading Panel → History the newest Revision shows origin "revision" with the earlier feedback attached (the `.changes` marker survived the split).

Also: `echo '# piped' | folio review -` opens a floating window on the piped text; `folio skill show | head -1` prints `---`.

- [ ] **Step 5: Final test run and commit**

Run: `npm run build && npm test 2>&1 | grep -E "Tests" && cargo test --workspace --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"`

```bash
git add README.md site/index.html skills/folio/SKILL.md docs/ROADMAP.md
git commit -m "Document the folio command, the install script, and the Pi skill install

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HCR6Kn5dNXYyTsMjvi2LEM"
```

Then merge `review-gate` into `main` and push both; the release itself is the user's call.

---

## Self-review

**Spec coverage (stage 1 of the terminal-review spec):**
- `folio-core` with gate, Feedback, Analysis, archive, lens loading, skill → Tasks 2–8. Lens *prompt* files are stage 2 and are not here by design.
- `folio` CLI launching the app via sibling, platform locations, `FOLIO_APP` → Task 9.
- `folio-app` depends on the core; TS writers removed; tests moved → Tasks 7–8.
- App bundles the CLI; Install Command Line Tool; `/usr/local/bin` or `~/.local/bin` → Tasks 10–11.
- Release tarballs for macOS arm64/x86_64, Linux x86_64/aarch64, Windows; install script; `cargo install` → Task 10 and Task 12 docs.
- Behaviour-preserving release → the end-to-end check in Task 12 and the fixture tests in Tasks 6 and 8.

**Placeholders:** none; every code step carries its code. The "move" steps name exact source ranges and grep commands rather than repeating 170 lines of unchanged code.

**Type consistency:** `gate::run_cli(paths, wait, agent, timeout_secs, &dyn Fn(&str))` in Task 2 is what Task 9 calls; `cliargs::parse` and `CliOptions { paths, float, gate }` in Task 2 are what Task 9's `window_args` uses; `feedback::Annotation` in Task 6 is the type Task 7's command takes and the SQLite code stores; `analysis::Reading { lens, producer, date, scope, body }` in Task 8 matches the `reading` object the frontend sends; `APP_BINARY` = `folio-app` matches the package name from Task 1 and the `install_cli_tool` sibling lookup in Task 11 expects `folio` beside it, which Task 10's `externalBin` produces.
