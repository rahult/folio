# Review Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coding agent block on `folio review --wait <path>` while the user reviews in Folio, then receive the verdict and feedback on stdout — closing the review loop without leaving the app.

**Architecture:** A JSON handshake file in `/tmp/folio-review/<path-hash>.json` is the entire contract. The `--wait` CLI branches out of `run()` *before* `tauri::Builder`, so it is a plain blocking poller and never contends with the single-instance plugin. The window shows a review bar only while a request is `waiting`; clicking a verdict resolves the handshake and unblocks the CLI.

**Tech Stack:** Rust (Tauri 2, serde_json), TypeScript (Vite), Vitest, `cargo test`.

## Global Constraints

- Handshake directory: `std::env::temp_dir().join("folio-review")`. Never beside the user's file.
- Handshake filename: `<path_hash>.json`, using the existing `path_hash` in `src-tauri/src/lib.rs` (16-hex-digit FNV-1a).
- Handshake writes are atomic: write `<name>.json.tmp`, then `fs::rename`.
- Default wait timeout: **540** seconds (under Claude Code's 600s shell cap).
- Poll interval: **200** ms in the CLI; **1500** ms in the window.
- Stale handshake age: **86400** seconds (24h), swept at app startup.
- Exit codes: `0` approved · `2` changes requested · `3` still waiting/timed out · `4` no request or no usable path.
- `<plan>.md.feedback.md` continues to be written beside the reviewed file, exactly as today.
- All new pure logic is unit-tested. Rust tests live in the `#[cfg(test)] mod tests` block already at the bottom of the file under test; TS tests go in `tests/<module>.test.ts`.
- Run `npm test` (Vitest) and `cd src-tauri && cargo test` before each commit.

---

### Task 1: Handshake model and storage

**Files:**
- Create: `src-tauri/src/reviewgate.rs`
- Modify: `src-tauri/src/lib.rs` (declare the module; widen `path_hash` visibility)
- Test: `src-tauri/src/reviewgate.rs` (inline `#[cfg(test)] mod tests`)

**Interfaces:**
- Consumes: `crate::path_hash(&str) -> String` from `lib.rs`
- Produces:
  - `pub enum ReviewState { Waiting, Approved, Changes }`
  - `pub struct ReviewRequest { path, agent, pid, requested_at, state, decided_at, feedback, document_edited }`
  - `pub fn review_dir() -> PathBuf`
  - `pub fn request_path_in(dir: &Path, path: &str) -> PathBuf`
  - `pub fn write_request_in(dir: &Path, req: &ReviewRequest) -> std::io::Result<()>`
  - `pub fn read_request_in(dir: &Path, path: &str) -> Option<ReviewRequest>`
  - `pub fn resolve_in(dir: &Path, path: &str, state: ReviewState, feedback: &str, document_edited: bool) -> std::io::Result<()>`
  - `pub fn clear_in(dir: &Path, path: &str)`
  - `pub fn sweep_stale_in(dir: &Path, max_age_secs: u64)`
  - `pub fn exit_code(state: ReviewState) -> i32`
  - `pub const DEFAULT_TIMEOUT_SECS: u64 = 540;`
  - `pub const STALE_SECS: u64 = 86_400;`

- [ ] **Step 1: Create the module file with the model and a failing test**

Create `src-tauri/src/reviewgate.rs`:

```rust
//! The review gate: the handshake that lets a coding agent block on a human
//! review. `folio review --wait <path>` writes a request here and polls it;
//! the review window resolves it when the user picks a verdict.
//!
//! State lives in the temp dir rather than beside the reviewed file — it is
//! machine-local and disposable, and a second untracked file per review
//! would clutter the user's repo. Writes are atomic (write `.tmp`, rename)
//! so a poller never reads a half-written verdict.

use std::fs;
use std::path::{Path, PathBuf};

/// Seconds `--wait` blocks before giving up. Deliberately under Claude
/// Code's 600s cap on shell calls, so the agent gets a real exit code
/// instead of being killed mid-wait.
pub const DEFAULT_TIMEOUT_SECS: u64 = 540;

/// Handshakes older than this are swept at app startup.
pub const STALE_SECS: u64 = 86_400;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReviewState {
    Waiting,
    Approved,
    Changes,
}

/// One pending or decided review. Field names are camelCase on the wire so
/// the frontend model can mirror this struct exactly.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRequest {
    pub path: String,
    pub agent: String,
    pub pid: u32,
    pub requested_at: String,
    pub state: ReviewState,
    pub decided_at: Option<String>,
    pub feedback: Option<String>,
    pub document_edited: bool,
}

impl ReviewRequest {
    /// A fresh `waiting` request for `path`.
    pub fn waiting(path: &str, agent: &str, pid: u32) -> Self {
        Self {
            path: path.to_string(),
            agent: agent.to_string(),
            pid,
            requested_at: now_stamp(),
            state: ReviewState::Waiting,
            decided_at: None,
            feedback: None,
            document_edited: false,
        }
    }
}

/// Seconds since the Unix epoch as a string. Avoids pulling in a date crate
/// for what is only ever displayed as "requested at" debug context.
fn now_stamp() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

pub fn review_dir() -> PathBuf {
    std::env::temp_dir().join("folio-review")
}

pub fn request_path_in(dir: &Path, path: &str) -> PathBuf {
    dir.join(format!("{}.json", crate::path_hash(path)))
}

/// Write the request atomically so a concurrent poller never sees a
/// half-written file.
pub fn write_request_in(dir: &Path, req: &ReviewRequest) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let final_path = request_path_in(dir, &req.path);
    let tmp_path = final_path.with_extension("json.tmp");
    let json = serde_json::to_string(req).map_err(std::io::Error::other)?;
    fs::write(&tmp_path, json)?;
    fs::rename(&tmp_path, &final_path)
}

/// Read the request for `path`. A missing or corrupt file reads as "no
/// request" — the bar stays hidden and `--collect` reports nothing pending.
pub fn read_request_in(dir: &Path, path: &str) -> Option<ReviewRequest> {
    let raw = fs::read_to_string(request_path_in(dir, path)).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Record a verdict against an existing request. No-op when nothing is
/// waiting, so a stray Approve click cannot invent a handshake.
pub fn resolve_in(
    dir: &Path,
    path: &str,
    state: ReviewState,
    feedback: &str,
    document_edited: bool,
) -> std::io::Result<()> {
    let Some(mut req) = read_request_in(dir, path) else {
        return Ok(());
    };
    req.state = state;
    req.decided_at = Some(now_stamp());
    req.feedback = Some(feedback.to_string());
    req.document_edited = document_edited;
    write_request_in(dir, &req)
}

pub fn clear_in(dir: &Path, path: &str) {
    let _ = fs::remove_file(request_path_in(dir, path));
}

/// Drop handshakes left behind by invocations that died. Mirrors the
/// freshness rule `spool_is_fresh` applies to the CLI spool.
pub fn sweep_stale_in(dir: &Path, max_age_secs: u64) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .and_then(|t| t.elapsed().map_err(std::io::Error::other))
            .map(|age| age.as_secs() >= max_age_secs)
            .unwrap_or(true);
        if stale {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Process exit code for a decided review. `Waiting` never reaches here —
/// the CLI maps a timeout to 3 itself.
pub fn exit_code(state: ReviewState) -> i32 {
    match state {
        ReviewState::Approved => 0,
        ReviewState::Changes => 2,
        ReviewState::Waiting => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("folio-gate-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn round_trips_a_request() {
        let dir = temp_dir("roundtrip");
        let req = ReviewRequest::waiting("/docs/plan.md", "claude", 42);
        write_request_in(&dir, &req).unwrap();
        let read = read_request_in(&dir, "/docs/plan.md").unwrap();
        assert_eq!(read.agent, "claude");
        assert_eq!(read.pid, 42);
        assert_eq!(read.state, ReviewState::Waiting);
        assert!(read.feedback.is_none());
    }
}
```

- [ ] **Step 2: Declare the module and widen `path_hash`**

In `src-tauri/src/lib.rs`, beside the existing `pub mod license;` (around line 13):

```rust
pub mod license;
pub mod reviewgate;
```

Then change the signature of `path_hash` (around line 463) from `fn path_hash` to:

```rust
pub(crate) fn path_hash(path: &str) -> String {
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd src-tauri && cargo test reviewgate`
Expected: `round_trips_a_request` PASSES. (This step verifies the module compiles and is wired in; the remaining behaviors get their own red-green cycles below.)

- [ ] **Step 4: Add the remaining failing tests**

Append inside `mod tests` in `src-tauri/src/reviewgate.rs`:

```rust
    #[test]
    fn missing_and_corrupt_requests_read_as_none() {
        let dir = temp_dir("corrupt");
        assert!(read_request_in(&dir, "/docs/absent.md").is_none());
        fs::write(request_path_in(&dir, "/docs/bad.md"), "{ not json").unwrap();
        assert!(read_request_in(&dir, "/docs/bad.md").is_none());
    }

    #[test]
    fn resolving_records_verdict_feedback_and_edit_flag() {
        let dir = temp_dir("resolve");
        write_request_in(&dir, &ReviewRequest::waiting("/docs/plan.md", "codex", 7)).unwrap();
        resolve_in(&dir, "/docs/plan.md", ReviewState::Changes, "# Feedback", true).unwrap();
        let read = read_request_in(&dir, "/docs/plan.md").unwrap();
        assert_eq!(read.state, ReviewState::Changes);
        assert_eq!(read.feedback.as_deref(), Some("# Feedback"));
        assert!(read.document_edited);
        assert!(read.decided_at.is_some());
    }

    #[test]
    fn resolving_without_a_request_is_a_no_op() {
        let dir = temp_dir("noop");
        resolve_in(&dir, "/docs/plan.md", ReviewState::Approved, "ok", false).unwrap();
        assert!(read_request_in(&dir, "/docs/plan.md").is_none());
    }

    #[test]
    fn distinct_paths_get_distinct_requests() {
        let dir = temp_dir("distinct");
        write_request_in(&dir, &ReviewRequest::waiting("/docs/a.md", "claude", 1)).unwrap();
        write_request_in(&dir, &ReviewRequest::waiting("/docs/b.md", "claude", 2)).unwrap();
        assert_eq!(read_request_in(&dir, "/docs/a.md").unwrap().pid, 1);
        assert_eq!(read_request_in(&dir, "/docs/b.md").unwrap().pid, 2);
    }

    #[test]
    fn sweeping_removes_everything_older_than_the_bound() {
        let dir = temp_dir("sweep");
        write_request_in(&dir, &ReviewRequest::waiting("/docs/plan.md", "claude", 1)).unwrap();
        // A zero-second bound makes every entry stale.
        sweep_stale_in(&dir, 0);
        assert!(read_request_in(&dir, "/docs/plan.md").is_none());
    }

    #[test]
    fn sweeping_keeps_fresh_entries() {
        let dir = temp_dir("sweep-fresh");
        write_request_in(&dir, &ReviewRequest::waiting("/docs/plan.md", "claude", 1)).unwrap();
        sweep_stale_in(&dir, STALE_SECS);
        assert!(read_request_in(&dir, "/docs/plan.md").is_some());
    }

    #[test]
    fn exit_codes_match_the_cli_contract() {
        assert_eq!(exit_code(ReviewState::Approved), 0);
        assert_eq!(exit_code(ReviewState::Changes), 2);
        assert_eq!(exit_code(ReviewState::Waiting), 3);
    }

    #[test]
    fn clearing_removes_the_request() {
        let dir = temp_dir("clear");
        write_request_in(&dir, &ReviewRequest::waiting("/docs/plan.md", "claude", 1)).unwrap();
        clear_in(&dir, "/docs/plan.md");
        assert!(read_request_in(&dir, "/docs/plan.md").is_none());
    }

    #[test]
    fn no_tmp_file_is_left_behind_after_a_write() {
        let dir = temp_dir("atomic");
        let req = ReviewRequest::waiting("/docs/plan.md", "claude", 1);
        write_request_in(&dir, &req).unwrap();
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("tmp"))
            .collect();
        assert!(leftovers.is_empty());
    }
```

- [ ] **Step 5: Run the tests**

Run: `cd src-tauri && cargo test reviewgate`
Expected: all 9 tests PASS. (The implementation in Step 1 already satisfies them; if any fail, fix `reviewgate.rs` — not the test.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/reviewgate.rs src-tauri/src/lib.rs
git commit -m "Add the review-gate handshake model and atomic storage"
```

---

### Task 2: CLI flag parsing

**Files:**
- Modify: `src-tauri/src/lib.rs` (`CliOptions`, `parse_cli_args`)
- Test: `src-tauri/src/lib.rs` (existing `#[cfg(test)] mod tests`)

**Interfaces:**
- Consumes: `reviewgate::DEFAULT_TIMEOUT_SECS`
- Produces: `CliOptions.gate: GateOptions` where
  `pub struct GateOptions { pub wait: bool, pub collect: bool, pub timeout_secs: u64, pub agent: String }`

**Why `#[serde(skip)]`:** `CliOptions` is serialized into the CLI spool and handed to windows as their startup request. The gate flags are meaningful only to the invoking process, so skipping them keeps the window payload byte-identical to today's.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `mod tests` block at the bottom of `src-tauri/src/lib.rs`:

```rust
    #[test]
    fn parse_cli_args_lifts_out_the_wait_flag() {
        let md = temp_file("args-wait", "md");
        let cli = parse_cli_args(
            [
                "folio".to_string(),
                "review".to_string(),
                "--wait".to_string(),
                md.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );
        assert!(cli.gate.wait);
        assert!(!cli.gate.collect);
        assert!(cli.float);
        assert_eq!(cli.paths.len(), 1);
        assert_eq!(cli.gate.timeout_secs, reviewgate::DEFAULT_TIMEOUT_SECS);
        assert_eq!(cli.gate.agent, "agent");
    }

    #[test]
    fn parse_cli_args_lifts_out_the_collect_flag() {
        let md = temp_file("args-collect", "md");
        let cli = parse_cli_args(
            [
                "folio".to_string(),
                "review".to_string(),
                "--collect".to_string(),
                md.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );
        assert!(cli.gate.collect);
        assert!(!cli.gate.wait);
    }

    #[test]
    fn parse_cli_args_reads_timeout_and_agent_values() {
        let md = temp_file("args-opts", "md");
        let cli = parse_cli_args(
            [
                "folio".to_string(),
                "review".to_string(),
                "--wait".to_string(),
                "--timeout".to_string(),
                "60".to_string(),
                "--agent".to_string(),
                "claude".to_string(),
                md.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );
        assert_eq!(cli.gate.timeout_secs, 60);
        assert_eq!(cli.gate.agent, "claude");
        // The values must not be mistaken for document paths.
        assert_eq!(cli.paths.len(), 1);
    }

    #[test]
    fn parse_cli_args_ignores_a_malformed_timeout() {
        let md = temp_file("args-badtimeout", "md");
        let cli = parse_cli_args(
            [
                "folio".to_string(),
                "review".to_string(),
                "--wait".to_string(),
                "--timeout".to_string(),
                "soon".to_string(),
                md.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );
        assert_eq!(cli.gate.timeout_secs, reviewgate::DEFAULT_TIMEOUT_SECS);
    }

    #[test]
    fn gate_flags_are_absent_from_a_plain_invocation() {
        let md = temp_file("args-plain", "md");
        let cli = parse_cli_args(
            ["folio".to_string(), md.to_string_lossy().into_owned()].into_iter(),
        );
        assert!(!cli.gate.wait);
        assert!(!cli.gate.collect);
    }

    #[test]
    fn gate_options_do_not_travel_through_the_spool() {
        let md = temp_file("args-spool", "md");
        let mut cli = parse_cli_args(
            ["folio".to_string(), md.to_string_lossy().into_owned()].into_iter(),
        );
        cli.gate.wait = true;
        cli.gate.agent = "claude".to_string();
        let json = serde_json::to_string(&cli).unwrap();
        assert!(!json.contains("claude"));
        let back: CliOptions = serde_json::from_str(&json).unwrap();
        assert!(!back.gate.wait);
        assert_eq!(back.paths, cli.paths);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test parse_cli_args`
Expected: FAIL — `no field 'gate' on type 'CliOptions'`.

- [ ] **Step 3: Add `GateOptions` and extend the parser**

In `src-tauri/src/lib.rs`, replace the `CliOptions` definition (around lines 68-76) with:

```rust
/// Gate flags from a `folio review --wait/--collect` invocation. Meaningful
/// only to the invoking process, so they are skipped by serde: the spool
/// entry and the per-window startup request stay exactly as they were.
#[derive(Clone)]
struct GateOptions {
    wait: bool,
    collect: bool,
    timeout_secs: u64,
    agent: String,
}

impl Default for GateOptions {
    fn default() -> Self {
        Self {
            wait: false,
            collect: false,
            timeout_secs: reviewgate::DEFAULT_TIMEOUT_SECS,
            agent: "agent".to_string(),
        }
    }
}

/// CLI invocation split into markdown files to open and whether the
/// floating review window was requested. Doubles as the per-window startup
/// request handed to a freshly created window.
#[derive(Default, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliOptions {
    paths: Vec<String>,
    float: bool,
    #[serde(skip)]
    gate: GateOptions,
}
```

Then replace `parse_cli_args` (around lines 108-135) with:

```rust
fn parse_cli_args(args: impl IntoIterator<Item = String>) -> CliOptions {
    let mut float = false;
    let mut paths = Vec::new();
    let mut gate = GateOptions::default();
    // `--timeout 60` / `--agent claude` consume the next argument; this
    // remembers which one is owed so the value is never read as a path.
    let mut pending: Option<&'static str> = None;
    for arg in args.into_iter().skip(1) {
        if let Some(flag) = pending.take() {
            match flag {
                "timeout" => {
                    if let Ok(secs) = arg.parse::<u64>() {
                        gate.timeout_secs = secs;
                    }
                }
                _ => gate.agent = arg,
            }
            continue;
        }
        match arg.as_str() {
            "--float" | "-f" => float = true,
            "review" => float = true,
            "--wait" => gate.wait = true,
            "--collect" => gate.collect = true,
            "--timeout" => pending = Some("timeout"),
            "--agent" => pending = Some("agent"),
            "-" => {
                if let Some(path) = stdin_to_temp() {
                    paths.push(path.to_string_lossy().into_owned());
                }
            }
            _ => {
                let path = std::path::Path::new(&arg);
                let is_markdown = path.is_file()
                    && path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .map(|ext| MARKDOWN_EXTS.contains(&ext.to_ascii_lowercase().as_str()))
                        .unwrap_or(false);
                if is_markdown {
                    paths.push(arg);
                }
            }
        }
    }
    CliOptions { paths, float, gate }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: all tests PASS, including the pre-existing `parse_cli_args_*` tests (they must be unaffected).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "Parse --wait, --collect, --timeout and --agent from the CLI"
```

---

### Task 3: The blocking CLI

**Files:**
- Modify: `src-tauri/src/reviewgate.rs` (add the wait loop and CLI entry point)
- Modify: `src-tauri/src/lib.rs` (headless branch in `run()`)
- Test: `src-tauri/src/reviewgate.rs` (inline tests)

**Interfaces:**
- Consumes: everything from Task 1; `CliOptions`/`GateOptions` from Task 2
- Produces:
  - `pub fn wait_for_verdict_in(dir: &Path, path: &str, timeout_secs: u64, poll_ms: u64) -> Option<ReviewRequest>`
  - `pub fn run_cli(paths: &[String], wait: bool, agent: &str, timeout_secs: u64) -> i32`

- [ ] **Step 1: Write the failing tests**

Append inside `mod tests` in `src-tauri/src/reviewgate.rs`:

```rust
    #[test]
    fn waiting_returns_immediately_when_already_decided() {
        let dir = temp_dir("wait-decided");
        write_request_in(&dir, &ReviewRequest::waiting("/docs/plan.md", "claude", 1)).unwrap();
        resolve_in(&dir, "/docs/plan.md", ReviewState::Approved, "ok", false).unwrap();
        let got = wait_for_verdict_in(&dir, "/docs/plan.md", 30, 0).unwrap();
        assert_eq!(got.state, ReviewState::Approved);
    }

    #[test]
    fn waiting_gives_up_at_the_timeout_and_leaves_the_request() {
        let dir = temp_dir("wait-timeout");
        write_request_in(&dir, &ReviewRequest::waiting("/docs/plan.md", "claude", 1)).unwrap();
        assert!(wait_for_verdict_in(&dir, "/docs/plan.md", 0, 0).is_none());
        // The verdict can still be recorded and collected later.
        assert_eq!(
            read_request_in(&dir, "/docs/plan.md").unwrap().state,
            ReviewState::Waiting
        );
    }

    #[test]
    fn waiting_gives_up_when_there_is_no_request_at_all() {
        let dir = temp_dir("wait-none");
        assert!(wait_for_verdict_in(&dir, "/docs/absent.md", 0, 0).is_none());
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test reviewgate`
Expected: FAIL — `cannot find function 'wait_for_verdict_in'`.

- [ ] **Step 3: Implement the wait loop and CLI entry**

Append to `src-tauri/src/reviewgate.rs` (above `#[cfg(test)]`):

```rust
/// Block until the request for `path` is decided, or the timeout expires.
/// Returns the decided request, or None on timeout — the request file is
/// deliberately left in place so the verdict can still be collected later.
///
/// `poll_ms` of 0 makes this a single check, which keeps the tests instant.
pub fn wait_for_verdict_in(
    dir: &Path,
    path: &str,
    timeout_secs: u64,
    poll_ms: u64,
) -> Option<ReviewRequest> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    loop {
        if let Some(req) = read_request_in(dir, path) {
            if req.state != ReviewState::Waiting {
                return Some(req);
            }
        }
        if std::time::Instant::now() >= deadline {
            return None;
        }
        std::thread::sleep(std::time::Duration::from_millis(poll_ms));
    }
}

/// Open a review window for `path` in the running app — or start the app if
/// nothing is running. Spawned detached and *without* the gate flags, so the
/// child is an ordinary `folio review <path>` invocation that the existing
/// spool handoff routes to the primary instance.
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

/// `folio review --wait|--collect <path>`. Prints the feedback Markdown to
/// stdout on a decision and returns the process exit code.
pub fn run_cli(paths: &[String], wait: bool, agent: &str, timeout_secs: u64) -> i32 {
    let Some(path) = paths.first() else {
        eprintln!("folio: no markdown file to review");
        return 4;
    };
    let dir = review_dir();
    sweep_stale_in(&dir, STALE_SECS);

    if wait {
        let req = ReviewRequest::waiting(path, agent, std::process::id());
        if write_request_in(&dir, &req).is_err() {
            eprintln!("folio: could not open a review request");
            return 4;
        }
        spawn_review_window(path);
        match wait_for_verdict_in(&dir, path, timeout_secs, 200) {
            Some(decided) => {
                print!("{}", decided.feedback.as_deref().unwrap_or_default());
                clear_in(&dir, path);
                exit_code(decided.state)
            }
            None => {
                eprintln!("folio: review still open in Folio — collect it later with `folio review --collect {path}`");
                3
            }
        }
    } else {
        match read_request_in(&dir, path) {
            None => {
                eprintln!("folio: no review was requested for {path}");
                4
            }
            Some(req) if req.state == ReviewState::Waiting => {
                eprintln!("folio: review still open in Folio");
                3
            }
            Some(decided) => {
                print!("{}", decided.feedback.as_deref().unwrap_or_default());
                clear_in(&dir, path);
                exit_code(decided.state)
            }
        }
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test reviewgate`
Expected: all reviewgate tests PASS.

- [ ] **Step 5: Add the headless branch to `run()`**

In `src-tauri/src/lib.rs`, inside `pub fn run()`, immediately after the `let cli = parse_cli_args(std::env::args());` line (around line 1291) and **before** `let own_pid = std::process::id();`:

```rust
    // `--wait` / `--collect` never become the app: they branch out here,
    // before the Tauri builder, so the review CLI is a plain blocking poller
    // and never contends with the single-instance plugin.
    if cli.gate.wait || cli.gate.collect {
        std::process::exit(reviewgate::run_cli(
            &cli.paths,
            cli.gate.wait,
            &cli.gate.agent,
            cli.gate.timeout_secs,
        ));
    }
```

- [ ] **Step 6: Verify the whole crate still builds and tests pass**

Run: `cd src-tauri && cargo test`
Expected: PASS, no warnings about unused items.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/reviewgate.rs src-tauri/src/lib.rs
git commit -m "Add the blocking review CLI: --wait, --collect and exit codes"
```

---

### Task 4: Tauri commands and startup sweep

**Files:**
- Modify: `src-tauri/src/lib.rs` (two commands, handler registration, `setup` sweep)

**Interfaces:**
- Consumes: `reviewgate::{read_request_in, resolve_in, review_dir, sweep_stale_in, ReviewRequest, ReviewState, STALE_SECS}`
- Produces (callable from the frontend via `invoke`):
  - `review_request_state(path: String) -> Option<ReviewRequest>`
  - `resolve_review(path: String, verdict: String, feedback: String, documentEdited: bool) -> Result<(), String>`

- [ ] **Step 1: Add the commands**

In `src-tauri/src/lib.rs`, immediately before `#[cfg_attr(mobile, tauri::mobile_entry_point)] pub fn run()`:

```rust
// ——— review gate ———

/// The pending or decided review request for a path, if any. Polled by the
/// window so the review bar can appear the moment an agent starts waiting.
#[tauri::command]
fn review_request_state(path: String) -> Option<reviewgate::ReviewRequest> {
    reviewgate::read_request_in(&reviewgate::review_dir(), &path)
}

/// Record the user's verdict, unblocking a waiting `folio review --wait`.
#[tauri::command]
fn resolve_review(
    path: String,
    verdict: String,
    feedback: String,
    document_edited: bool,
) -> Result<(), String> {
    let state = match verdict.as_str() {
        "approved" => reviewgate::ReviewState::Approved,
        "changes" => reviewgate::ReviewState::Changes,
        other => return Err(format!("unknown verdict: {other}")),
    };
    reviewgate::resolve_in(
        &reviewgate::review_dir(),
        &path,
        state,
        &feedback,
        document_edited,
    )
    .map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register the commands**

In the `invoke_handler![…]` list (around line 1346), add the two names after `register_default_markdown_handler`:

```rust
            register_default_markdown_handler,
            review_request_state,
            resolve_review
```

- [ ] **Step 3: Sweep stale handshakes at startup**

In the `.setup(move |app| { … })` closure (around line 1367), after the existing spool cleanup:

```rust
            // Handshakes left by invocations that died must not resurrect a
            // review bar days later.
            reviewgate::sweep_stale_in(&reviewgate::review_dir(), reviewgate::STALE_SECS);
```

- [ ] **Step 4: Verify it builds**

Run: `cd src-tauri && cargo test`
Expected: PASS, clean build.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "Expose review-gate state to the window and sweep stale handshakes"
```

---

### Task 5: Frontend review-gate model

**Files:**
- Create: `src/reviewgate.ts`
- Test: `tests/reviewgate.test.ts`

**Interfaces:**
- Consumes: nothing (pure module)
- Produces:
  - `export type ReviewState = "waiting" | "approved" | "changes"`
  - `export type Verdict = "approved" | "changes"`
  - `export interface ReviewRequest { path, agent, pid, requestedAt, state, decidedAt, feedback, documentEdited }`
  - `export interface BarModel { visible: boolean; label: string; primary: Verdict }`
  - `export function barModel(request: ReviewRequest | null, annotationCount: number): BarModel`
  - `export function feedbackWithEditNote(feedback: string, documentEdited: boolean): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/reviewgate.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  barModel,
  feedbackWithEditNote,
  type ReviewRequest,
  type ReviewState,
} from "../src/reviewgate";

function request(state: ReviewState, agent = "claude"): ReviewRequest {
  return {
    path: "/docs/plan.md",
    agent,
    pid: 1,
    requestedAt: "1000",
    state,
    decidedAt: null,
    feedback: null,
    documentEdited: false,
  };
}

describe("review bar model", () => {
  it("stays hidden with no request", () => {
    expect(barModel(null, 0).visible).toBe(false);
  });

  it("stays hidden once a verdict has been recorded", () => {
    expect(barModel(request("approved"), 0).visible).toBe(false);
    expect(barModel(request("changes"), 3).visible).toBe(false);
  });

  it("shows while an agent is waiting", () => {
    expect(barModel(request("waiting"), 0).visible).toBe(true);
  });

  it("names the waiting agent", () => {
    expect(barModel(request("waiting", "codex"), 0).label).toContain("codex");
  });

  it("makes approve primary on a clean document", () => {
    const model = barModel(request("waiting"), 0);
    expect(model.primary).toBe("approved");
    expect(model.label).toContain("no annotations");
  });

  it("makes request-changes primary once the document is marked up", () => {
    const model = barModel(request("waiting"), 3);
    expect(model.primary).toBe("changes");
    expect(model.label).toContain("3 annotations");
  });

  it("singularizes a lone annotation", () => {
    expect(barModel(request("waiting"), 1).label).toContain("1 annotation");
    expect(barModel(request("waiting"), 1).label).not.toContain("annotations");
  });
});

describe("edit note", () => {
  it("is absent when the document was untouched", () => {
    expect(feedbackWithEditNote("# Feedback\n", false)).toBe("# Feedback\n");
  });

  it("tells the agent to re-read a document edited during review", () => {
    const out = feedbackWithEditNote("# Feedback\n", true);
    expect(out).toContain("# Feedback");
    expect(out).toMatch(/re-read/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- reviewgate`
Expected: FAIL — cannot resolve `../src/reviewgate`.

- [ ] **Step 3: Write the module**

Create `src/reviewgate.ts`:

```typescript
/**
 * The window's half of the review gate: given the handshake state written
 * by `folio review --wait` (see src-tauri/src/reviewgate.rs), decide whether
 * the review bar shows, what it says, and which verdict button leads.
 * Pure and DOM-free so the model is unit-testable.
 */

export type ReviewState = "waiting" | "approved" | "changes";

/** The two decisions a reviewer can send back. */
export type Verdict = "approved" | "changes";

/** Mirrors `ReviewRequest` in src-tauri/src/reviewgate.rs exactly. */
export interface ReviewRequest {
  path: string;
  agent: string;
  pid: number;
  requestedAt: string;
  state: ReviewState;
  decidedAt: string | null;
  feedback: string | null;
  documentEdited: boolean;
}

export interface BarModel {
  visible: boolean;
  label: string;
  /** Which button gets visual weight — follows the annotation count. */
  primary: Verdict;
}

const HIDDEN: BarModel = { visible: false, label: "", primary: "approved" };

/**
 * The bar exists only while an agent is actually blocked: a decided request
 * (or none at all) leaves the window free of review chrome.
 */
export function barModel(request: ReviewRequest | null, annotationCount: number): BarModel {
  if (request === null || request.state !== "waiting") return HIDDEN;
  const count =
    annotationCount === 0
      ? "no annotations"
      : `${annotationCount} annotation${annotationCount === 1 ? "" : "s"}`;
  return {
    visible: true,
    label: `${request.agent} waiting · ${count}`,
    primary: annotationCount > 0 ? "changes" : "approved",
  };
}

/**
 * A reviewer may answer by editing the document rather than annotating it.
 * The agent has no way to notice that on its own, so say it plainly.
 */
export function feedbackWithEditNote(feedback: string, documentEdited: boolean): string {
  if (!documentEdited) return feedback;
  return `${feedback.trimEnd()}\n\n---\n\nThe reviewer edited the document directly during this review — re-read the file before acting on this feedback.\n`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- reviewgate`
Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reviewgate.ts tests/reviewgate.test.ts
git commit -m "Add the frontend review-bar model"
```

---

### Task 6: The review bar

**Files:**
- Modify: `index.html` (bar markup)
- Modify: `src/styles.css` (bar styles)
- Modify: `src/main.ts` (polling, rendering, verdict submission)

**Interfaces:**
- Consumes: `barModel`, `feedbackWithEditNote`, `ReviewRequest`, `Verdict` from `src/reviewgate.ts`; `buildFeedback` from `src/annotations.ts`; Tauri commands `review_request_state` and `resolve_review` from Task 4
- Produces: `submitVerdict(verdict: Verdict): Promise<void>` in `src/main.ts`, used by Task 7's menu action

- [ ] **Step 1: Add the markup**

In `index.html`, insert directly **before** `<footer id="statusbar">` (line 154):

```html
    <footer id="review-bar" hidden>
      <span id="review-bar-label"></span>
      <div id="review-bar-actions">
        <button id="review-changes-btn" type="button">Request changes</button>
        <button id="review-approve-btn" type="button">✓ Approve</button>
      </div>
    </footer>
```

- [ ] **Step 2: Add the styles**

In `src/styles.css`, append at the end of the `/* ——— status bar ——— */` section (after the `@media (prefers-reduced-motion: reduce)` block ending around line 545):

```css
/* ——— review bar ——— */

/* Shown only while an agent is blocked on `folio review --wait`. A window
   being written in never grows this chrome. */
#review-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--hairline);
  background: var(--accent-wash);
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--ink-soft);
  flex: 0 0 auto;
  user-select: none;
}

#review-bar[hidden] {
  display: none;
}

#review-bar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#review-bar-actions {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
}

#review-bar-actions button {
  font-family: var(--font-ui);
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid var(--hairline);
  border-radius: 5px;
  background: var(--paper-raised);
  color: var(--ink-soft);
  cursor: pointer;
}

#review-bar-actions button:hover {
  color: var(--ink);
  border-color: var(--ink-faint);
}

/* The primary action follows the annotation count — request changes on a
   marked-up document, approve on a clean one. */
#review-bar-actions button.primary {
  background: var(--accent);
  border-color: var(--accent-strong);
  color: var(--paper);
  font-weight: 500;
}

#review-bar-actions button.primary:hover {
  background: var(--accent-strong);
  color: var(--paper);
}

#review-bar.sent #review-bar-actions {
  display: none;
}
```

- [ ] **Step 3: Wire the imports and element handles**

In `src/main.ts`, add to the imports (beside the existing `./annotations` import):

```typescript
import { barModel, feedbackWithEditNote, type ReviewRequest, type Verdict } from "./reviewgate";
```

Then beside the other element handles (near line 69, after `feedbackBtn`):

```typescript
const reviewBar = document.querySelector<HTMLElement>("#review-bar")!;
const reviewBarLabel = document.querySelector<HTMLElement>("#review-bar-label")!;
const reviewChangesBtn = document.querySelector<HTMLButtonElement>("#review-changes-btn")!;
const reviewApproveBtn = document.querySelector<HTMLButtonElement>("#review-approve-btn")!;
```

- [ ] **Step 4: Add the gate logic**

In `src/main.ts`, append immediately after `exportReviewFeedback()` (which ends at line 937):

```typescript
// ——— review gate ———
//
// `folio review --wait <path>` leaves a handshake in the temp dir and blocks
// on it. Poll for one while a file is open so the bar appears the moment an
// agent starts waiting, and resolve it when the user picks a verdict.

let reviewRequest: ReviewRequest | null = null;
/** Set when the user answers by editing rather than annotating, so the
 *  feedback can tell the agent to re-read the file. */
let documentEditedDuringReview = false;

const REVIEW_POLL_MS = 1500;

async function refreshReviewRequest(): Promise<void> {
  const path = doc.filePath;
  if (!path) {
    reviewRequest = null;
    renderReviewBar();
    return;
  }
  reviewRequest = await invoke<ReviewRequest | null>("review_request_state", { path });
  renderReviewBar();
}

function renderReviewBar(): void {
  const model = barModel(reviewRequest, annotations.length);
  reviewBar.hidden = !model.visible;
  if (!model.visible) {
    reviewBar.classList.remove("sent");
    return;
  }
  reviewBarLabel.textContent = `⏳ ${model.label}`;
  reviewApproveBtn.classList.toggle("primary", model.primary === "approved");
  reviewChangesBtn.classList.toggle("primary", model.primary === "changes");
}

/** Send the verdict back to the blocked agent: the same structured feedback
 *  `Export Review Feedback` writes, plus the handshake resolution that
 *  unblocks `folio review --wait`. */
async function submitVerdict(verdict: Verdict): Promise<void> {
  const path = doc.filePath;
  if (!path) return;
  trackEvent("review_verdict", { verdict });
  const feedback = feedbackWithEditNote(
    buildFeedback(doc.fileName, annotations),
    documentEditedDuringReview,
  );
  await invoke("write_text_file", { path: `${path}.feedback.md`, contents: feedback });
  await invoke("resolve_review", {
    path,
    verdict,
    feedback,
    documentEdited: documentEditedDuringReview,
  });
  reviewRequest = null;
  documentEditedDuringReview = false;
  reviewBar.hidden = false;
  reviewBar.classList.add("sent");
  reviewBarLabel.textContent = verdict === "approved" ? "sent ✓ approved" : "sent ✓ changes requested";
  setTimeout(() => {
    reviewBar.classList.remove("sent");
    renderReviewBar();
  }, 1600);
}

reviewApproveBtn.addEventListener("click", () => void submitVerdict("approved"));
reviewChangesBtn.addEventListener("click", () => void submitVerdict("changes"));
setInterval(() => void refreshReviewRequest(), REVIEW_POLL_MS);
```

- [ ] **Step 5: Refresh the bar where annotations and files change**

Three call sites in `src/main.ts`:

1. At the end of `loadAnnotationsForOpenFile()` — replace the final `renderAnnotationsNow();` (line 732) with:

```typescript
  renderAnnotationsNow();
  documentEditedDuringReview = false;
  void refreshReviewRequest();
```

2. At the end of `renderSidebar()` — the annotation count drives the bar's label and primary button, so add as the last line of the function body (after the `annotList.replaceChildren(...)` call on line 767):

```typescript
  renderReviewBar();
```

Note the early `return` in the empty-list branch (line 765) — add `renderReviewBar();` before that `return` too, so clearing every annotation still flips the primary button back to Approve.

3. Wherever the document is marked dirty, record that the reviewer edited it. Find the assignment that sets the dirty flag on editor changes and add beside it:

```typescript
  if (reviewRequest !== null) documentEditedDuringReview = true;
```

- [ ] **Step 6: Typecheck and test**

Run: `npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all tests PASS.

- [ ] **Step 7: Verify the loop end to end by hand**

```bash
npm run tauri build
# in one terminal:
/Applications/Folio.app/Contents/MacOS/folio review --wait --agent claude docs/ROADMAP.md; echo "exit=$status"
```

Expected: a floating window opens with the bar reading `⏳ claude waiting · no annotations`. Click **✓ Approve** — the terminal prints the approval feedback and reports `exit=0`. Repeat with an annotation added first and confirm `exit=2` plus the annotation in the printed feedback.

- [ ] **Step 8: Commit**

```bash
git add index.html src/styles.css src/main.ts
git commit -m "Add the review bar: approve or request changes without leaving Folio"
```

---

### Task 7: Menu and keyboard parity

**Files:**
- Modify: `src-tauri/src/lib.rs` (File menu item)
- Modify: `src/menu.ts` (id → action mapping)
- Modify: `src/main.ts` (action dispatch)
- Test: `tests/menu.test.ts`

**Interfaces:**
- Consumes: `submitVerdict(verdict: Verdict)` from Task 6
- Produces: `MenuAction` variant `{ kind: "approve-review" }` for menu id `file.approve-review`

- [ ] **Step 1: Write the failing test**

Append to `tests/menu.test.ts` inside the existing top-level `describe`:

```typescript
  it("maps the approve-review item", () => {
    expect(actionForMenuId("file.approve-review")).toEqual({ kind: "approve-review" });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- menu`
Expected: FAIL — received `null`.

- [ ] **Step 3: Add the action to the mapping**

In `src/menu.ts`, add to the `MenuAction` union (after the `export-feedback` variant on line 26):

```typescript
  | { kind: "approve-review" }
```

And in the `switch` (after the `file.feedback` case on line 100):

```typescript
    case "file.approve-review":
      return { kind: "approve-review" };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- menu`
Expected: PASS.

- [ ] **Step 5: Add the native menu item**

In `src-tauri/src/lib.rs`, in the File submenu builder, insert **before** the existing `file.feedback` item (around line 1041):

```rust
        .item(&menu_item(
            app,
            "file.approve-review",
            "Approve Review",
            Some("Shift+CmdOrCtrl+R"),
        )?)
```

- [ ] **Step 6: Dispatch the action**

In `src/main.ts`, in `runMenuAction`, beside the existing `export-feedback` case (line 1187):

```typescript
    case "approve-review":
      return submitVerdict("approved");
```

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run build && cd src-tauri && cargo test`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/lib.rs src/menu.ts src/main.ts tests/menu.test.ts
git commit -m "Add File → Approve Review with a keyboard shortcut"
```

---

### Task 8: Teach the agents the gate

**Files:**
- Modify: `scripts/install-agent-integrations.sh`

**Interfaces:**
- Consumes: the CLI contract from Task 3 (flags and exit codes)
- Produces: an upgraded instruction block in each agent's global instruction file

**Why replace rather than append:** the installer currently skips any file whose `folio:plan-review` marker is already present, which would strand every existing user on the v1 instructions. It must rewrite the content between the markers instead.

- [ ] **Step 1: Replace the instruction block and its install logic**

In `scripts/install-agent-integrations.sh`, replace the `BLOCK='…'` assignment and the `for f in …` loop with:

```sh
BLOCK='<!-- folio:plan-review -->
## Markdown plan review with Folio

When you write or substantially revise a plan, spec, or other Markdown document the user should review, hand it to Folio and wait for the verdict:

```bash
folio review --wait --agent claude <path>
```

This opens the document in a floating review window and blocks until the user approves it or requests changes. The review feedback is printed to stdout; the exit code says what to do next:

- `0` — approved. Proceed with the work.
- `2` — changes requested. The feedback is on stdout; revise the document and run the command again.
- `3` — the review is still open (the wait timed out after 9 minutes). Tell the user the plan is waiting for them in Folio, end your turn, and on your next turn run `folio review --collect <path>` to pick up the verdict — it is preserved, nothing is lost.
- `4` — no review could be opened. Fall back to telling the user the path.

The user annotates by selecting text (Edit -> Annotate Selection, Cmd+Opt+A) and sends the verdict from the review bar at the bottom of the window. Feedback is also written to `<path>.feedback.md` beside the document — read it if you ever need it outside the `--wait` flow, then delete it.

Before revising, re-read the document: the user may have answered by editing it directly rather than annotating.

Fallback if `folio` is not on PATH: `/Applications/Folio.app/Contents/MacOS/folio`.
<!-- /folio:plan-review -->'

for f in "$HOME/.claude/CLAUDE.md" "$HOME/.codex/AGENTS.md" "$HOME/.agents/AGENTS.md"; do
  mkdir -p "$(dirname "$f")"
  touch "$f"
  if grep -q "$MARKER" "$f"; then
    # Upgrade in place: replace everything between the markers so re-running
    # the installer is an upgrade rather than a no-op.
    BLOCK="$BLOCK" python3 - "$f" <<'PYEOF'
import os, re, sys

path = sys.argv[1]
with open(path) as fh:
    text = fh.read()
block = os.environ["BLOCK"]
pattern = re.compile(
    r"<!-- folio:plan-review -->.*?<!-- /folio:plan-review -->", re.DOTALL
)
with open(path, "w") as fh:
    fh.write(pattern.sub(lambda _: block, text))
PYEOF
    echo "instructions upgraded: $f"
  else
    printf '\n%s\n' "$BLOCK" >> "$f"
    echo "instructions appended: $f"
  fi
done
```

Note the `lambda _: block` in `pattern.sub` — passing the replacement as a function avoids Python interpreting backslashes or `\1` sequences inside the block as backreferences.

- [ ] **Step 2: Verify the script is syntactically valid**

Run: `sh -n scripts/install-agent-integrations.sh`
Expected: no output (valid).

- [ ] **Step 3: Verify the upgrade path against a scratch file**

```bash
mkdir -p /tmp/folio-install-test
printf 'keep me\n\n<!-- folio:plan-review -->\nOLD v1 CONTENT\n<!-- /folio:plan-review -->\n\nkeep me too\n' > /tmp/folio-install-test/CLAUDE.md
HOME=/tmp/folio-install-test sh scripts/install-agent-integrations.sh || true
cat /tmp/folio-install-test/CLAUDE.md
```

Expected: `keep me` and `keep me too` survive, `OLD v1 CONTENT` is gone, and the block now contains `--wait`. (The script exits early if `/Applications/Folio.app` is missing — if so, comment out the `exit 1` guard for this check and restore it afterward.)

- [ ] **Step 4: Commit**

```bash
git add scripts/install-agent-integrations.sh
git commit -m "Teach the agent integrations the blocking review gate"
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `.gitignore`
- Modify: `docs/superpowers/specs/2026-07-29-review-gate-design.md` (status line)

- [ ] **Step 1: Document the gate in the README**

In `README.md`, replace the paragraph in the "Annotate the plan, send it back" section that ends `…so file-driven agents pick it up with no copy-pasting.` with that same text followed by:

```markdown
Better still, the agent can **wait for you**. `folio review --wait <path>`
blocks while you read: the window shows a review bar with **Request
changes** and **✓ Approve**, and the moment you pick one the feedback is
printed to the agent's stdout and it carries on — same turn, no switching
back to the terminal.

```bash
folio review --wait --agent claude docs/plan.md
# exit 0 = approved · 2 = changes requested (feedback on stdout)
# exit 3 = still open — collect it later, nothing is lost:
folio review --collect docs/plan.md
```

The wait times out after nine minutes so agents with a shell-call cap get a
real exit code rather than being killed mid-review; your verdict is recorded
whenever you get to it and `--collect` picks it up on the agent's next turn.
Answering by editing the document instead of annotating works too — the
feedback tells the agent to re-read the file.
```

- [ ] **Step 2: Record the shipped item on the roadmap**

In `docs/ROADMAP.md`, replace the final `**Status (July 2026):**` paragraph's last sentence (`Next up: docx export (P0-1), the largest remaining item before the $10 launch.`) with:

```markdown
The review loop now closes inside the app: `folio review --wait` blocks the
agent on a human verdict and returns the feedback on stdout (P1-8, "approve/
annotate workflow", delivered beyond its original sketch). Next up: docx
export (P0-1), the largest remaining item before the $10 launch.
```

- [ ] **Step 3: Keep exported feedback out of git**

Append to `.gitignore`:

```gitignore

# Review feedback exported beside a reviewed document
*.feedback.md
```

Then untrack the stray file already in the working tree:

```bash
git rm --cached evaluation/03-lists.md.feedback.md 2>/dev/null || true
```

- [ ] **Step 4: Mark the spec implemented**

In `docs/superpowers/specs/2026-07-29-review-gate-design.md`, change `Status: designed` to `Status: implemented`.

- [ ] **Step 5: Run the full suite one final time**

Run: `npm test && npm run build && cd src-tauri && cargo test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/ROADMAP.md .gitignore docs/superpowers/specs/2026-07-29-review-gate-design.md
git commit -m "Document the review gate"
```

---

## Self-review notes

**Spec coverage:** handshake format → Task 1 · CLI surface and exit codes → Tasks 2-3 · headless branch → Task 3 · Tauri commands and stale sweep → Task 4 · bar state machine → Task 5 · review bar and `documentEdited` → Task 6 · menu/keyboard parity → Task 7 · installer v2 with marker replacement → Task 8 · docs → Task 9. Every error-handling row in the spec table maps to a test or an implementation branch: app not running (`spawn_review_window`), window closed undecided (timeout test leaves the request), timeout (`waiting_gives_up_at_the_timeout_and_leaves_the_request`), two agents on one file (`distinct_paths_get_distinct_requests` establishes the keying; the later write overwrites), staleness (`sweeping_*`), piped stdin (`run_cli` uses the already-resolved temp path; `--collect` on a path with no request returns 4), corrupt handshake (`missing_and_corrupt_requests_read_as_none`).

**Type consistency:** `ReviewState` is `Waiting|Approved|Changes` in Rust and `"waiting"|"approved"|"changes"` in TS via `#[serde(rename_all = "lowercase")]`. `ReviewRequest` fields are camelCase on both sides via `#[serde(rename_all = "camelCase")]`. `resolve_review`'s `verdict` parameter takes only `"approved"`/`"changes"` — the `Verdict` type in `src/reviewgate.ts` — and rejects anything else.
