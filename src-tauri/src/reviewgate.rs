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

/// Marker left by a "changes requested" verdict so the next on-disk
/// rewrite of the document is archived as the agent's revision. Lives
/// beside the handshake so every window (and the CLI-spawned review
/// window) sees the same answer.
fn changes_marker_in(dir: &Path, path: &str) -> PathBuf {
    dir.join(format!("{}.changes", crate::path_hash(path)))
}

pub fn mark_changes_requested_in(dir: &Path, path: &str, feedback: &str) {
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(changes_marker_in(dir, path), feedback.as_bytes());
}

/// The feedback of a pending changes-requested verdict for `path`,
/// consumed so only the first rewrite counts as the revision.
pub fn take_changes_requested_in(dir: &Path, path: &str) -> Option<String> {
    let marker = changes_marker_in(dir, path);
    let feedback = std::fs::read_to_string(&marker).ok()?;
    let _ = std::fs::remove_file(marker);
    Some(feedback)
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
    fn changes_marker_is_consumed_once() {
        let dir = temp_dir("changes-marker");
        assert!(take_changes_requested_in(&dir, "/p.md").is_none());
        mark_changes_requested_in(&dir, "/p.md", "# feedback");
        assert_eq!(take_changes_requested_in(&dir, "/p.md").as_deref(), Some("# feedback"));
        assert!(take_changes_requested_in(&dir, "/p.md").is_none());
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
}
