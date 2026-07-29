use std::collections::HashMap;
use std::fs;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

use tauri::menu::{
    AboutMetadata, CheckMenuItem, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem,
    MenuItemBuilder, MenuItemKind, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime, WebviewWindow, Wry};

pub mod license;

/// File extensions Folio opens; mirrors `fileAssociations` in tauri.conf.json.
const MARKDOWN_EXTS: [&str; 4] = ["md", "markdown", "mdown", "mkd"];

/// What a window should do the moment its webview comes up: which files to
/// open and whether to start in floating review mode. Keyed by window label
/// so two windows opening at once never drain each other's request.
#[derive(Default)]
struct WindowRequests(Mutex<HashMap<String, CliOptions>>);

/// Suffix source for generated window labels (the first window is the
/// declarative "main" from tauri.conf.json).
#[derive(Default)]
struct WindowCounter(AtomicU32);

/// Set once the first window has drained its request. Before that, an OS
/// file-open event is seeding the starting window; after, it opens a new one.
#[derive(Default)]
struct Started(AtomicBool);

/// Recently opened files, newest first (max 10), pushed by the frontend and
/// mirrored into the File → Open Recent submenu.
#[derive(Default)]
struct RecentFiles(Mutex<Vec<String>>);

/// Revision History submenu entries — (seq, label) pairs pushed by the
/// frontend whenever the revision archive changes for the open document.
#[derive(Default)]
struct RevisionMenu(Mutex<Vec<(u64, String)>>);

/// Recently opened files as stored in state (empty when not yet pushed).
fn recent_files<R: Runtime, M: Manager<R>>(manager: &M) -> Vec<String> {
    manager
        .try_state::<RecentFiles>()
        .map(|s| s.0.lock().unwrap().clone())
        .unwrap_or_default()
}

/// Revision menu entries as stored in state.
fn revision_entries<R: Runtime, M: Manager<R>>(manager: &M) -> Vec<(u64, String)> {
    manager
        .try_state::<RevisionMenu>()
        .map(|s| s.0.lock().unwrap().clone())
        .unwrap_or_default()
}

/// Base name of a path for menu labels.
fn file_name(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_string()
}

/// CLI invocation split into markdown files to open and whether the
/// floating review window was requested. Doubles as the per-window startup
/// request handed to a freshly created window.
#[derive(Default, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliOptions {
    paths: Vec<String>,
    float: bool,
}

/// Write piped markdown to a temp file so it can be opened (and watched)
/// like any other document. Returns None for empty input.
fn write_temp_markdown(contents: &str, dir: &std::path::Path) -> Option<std::path::PathBuf> {
    if contents.trim().is_empty() {
        return None;
    }
    let path = dir.join(format!("folio-review-{}.md", std::process::id()));
    fs::write(&path, contents).ok()?;
    Some(path)
}

/// Read piped stdin into a temp markdown file (`folio --float -`). Skipped
/// when stdin is a terminal — otherwise an interactive launch would block
/// waiting for input.
fn stdin_to_temp() -> Option<std::path::PathBuf> {
    use std::io::{IsTerminal, Read};
    let mut stdin = std::io::stdin();
    if stdin.is_terminal() {
        return None;
    }
    let mut contents = String::new();
    stdin.read_to_string(&mut contents).ok()?;
    write_temp_markdown(&contents, &std::env::temp_dir())
}

/// Filter CLI arguments down to existing markdown files, lifting out the
/// `--float` / `-f` flag, the `review` subcommand (implies float), and `-`
/// (read markdown from stdin). Windows and Linux pass the opened file as
/// argv[1]; macOS may inject `-psn_…`, which the extension filter drops
/// naturally.
fn parse_cli_args(args: impl IntoIterator<Item = String>) -> CliOptions {
    let mut float = false;
    let mut paths = Vec::new();
    for arg in args.into_iter().skip(1) {
        match arg.as_str() {
            "--float" | "-f" => float = true,
            "review" => float = true,
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
    CliOptions { paths, float }
}

// ——— multiple windows ———
//
// Folio runs as a single process with as many windows as the user wants.
// Launching the binary again (`folio review plan.md` from a second terminal)
// no longer starts a second app: tauri-plugin-single-instance hands the
// invocation to the running process, which opens a new window for it.
//
// The handoff goes through a spool directory rather than the plugin's argv,
// because argv can't carry piped stdin — `folio review -` has already been
// resolved to a temp file inside the child process by the time the plugin
// fires. Every invocation writes its *resolved* request to <temp>/
// folio-cli-spool/<pid>.json; the primary drains everyone else's entries and
// deletes its own once `setup` proves it is the primary.

const SPOOL_STALE_SECS: u64 = 60;

fn spool_dir() -> std::path::PathBuf {
    std::env::temp_dir().join("folio-cli-spool")
}

/// Leave this invocation's resolved request where a running instance can
/// find it. Returns the path so the primary can remove its own entry.
fn write_spool(pid: u32, cli: &CliOptions) -> Option<std::path::PathBuf> {
    write_spool_in(&spool_dir(), pid, cli)
}

fn write_spool_in(dir: &std::path::Path, pid: u32, cli: &CliOptions) -> Option<std::path::PathBuf> {
    fs::create_dir_all(dir).ok()?;
    let path = dir.join(format!("{pid}.json"));
    fs::write(&path, serde_json::to_string(cli).ok()?).ok()?;
    Some(path)
}

/// Whether a spool entry is recent enough to still be worth acting on. An
/// invocation that died before the handoff must not pop a window minutes
/// later, so old entries are dropped rather than replayed. `max_age_secs`
/// is an exclusive bound, so 0 means "nothing counts as fresh".
fn spool_is_fresh(entry: &fs::DirEntry, max_age_secs: u64) -> bool {
    entry
        .metadata()
        .and_then(|m| m.modified())
        .and_then(|t| t.elapsed().map_err(std::io::Error::other))
        .map(|age| age.as_secs() < max_age_secs)
        .unwrap_or(false)
}

/// Take every spool entry except our own — the primary serves its own
/// request in-process — removing each file as it is read.
fn drain_spool(own_pid: u32) -> Vec<CliOptions> {
    drain_spool_in(&spool_dir(), own_pid, SPOOL_STALE_SECS)
}

fn drain_spool_in(dir: &std::path::Path, own_pid: u32, max_age_secs: u64) -> Vec<CliOptions> {
    let own = std::ffi::OsString::from(format!("{own_pid}.json"));
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut requests = Vec::new();
    for entry in entries.filter_map(|e| e.ok()) {
        if entry.file_name() == own {
            continue;
        }
        let fresh = spool_is_fresh(&entry, max_age_secs);
        let parsed = fs::read_to_string(entry.path())
            .ok()
            .and_then(|raw| serde_json::from_str::<CliOptions>(&raw).ok());
        // Read once, then gone: a stale or corrupt entry must not be
        // replayed by the next handoff either.
        let _ = fs::remove_file(entry.path());
        if let (true, Some(request)) = (fresh, parsed) {
            requests.push(request);
        }
    }
    requests
}

/// Open a new app window for `request`. The request is registered under the
/// new window's label *before* the webview is built so the frontend's
/// startup drain can never lose the race.
fn open_window(app: &AppHandle<Wry>, request: CliOptions) -> tauri::Result<WebviewWindow<Wry>> {
    let n = app
        .state::<WindowCounter>()
        .0
        .fetch_add(1, Ordering::Relaxed)
        + 1;
    let label = format!("folio-{n}");
    app.state::<WindowRequests>()
        .0
        .lock()
        .unwrap()
        .insert(label.clone(), request);
    // Cascade so a stack of review windows stays individually reachable.
    let offset = f64::from((n % 8) * 24);
    tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::default())
        .title("Folio")
        .inner_size(800.0, 600.0)
        .position(80.0 + offset, 80.0 + offset)
        .build()
}

/// The window a global action (menu command, OS file-open) applies to: the
/// focused one, falling back to the first window so a command issued while
/// no window holds focus still lands somewhere sensible.
fn target_window_label(app: &AppHandle<Wry>) -> Option<String> {
    let windows = app.webview_windows();
    if let Some(focused) = windows
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .map(|w| w.label().to_string())
    {
        return Some(focused);
    }
    if windows.contains_key("main") {
        return Some("main".to_string());
    }
    windows.keys().next().cloned()
}

/// What this window should do on startup: files to open plus whether to
/// enter floating review mode. Draining is one-shot per window.
#[tauri::command]
fn take_startup_request(
    window: tauri::Window<Wry>,
    requests: tauri::State<WindowRequests>,
    started: tauri::State<Started>,
) -> CliOptions {
    started.0.store(true, Ordering::Relaxed);
    requests
        .0
        .lock()
        .unwrap()
        .remove(window.label())
        .unwrap_or_default()
}

/// Toggle the floating review chrome: always-on-top while floating; when
/// entering, park the window at the monitor's top-right at a compact review
/// size (the size is left alone when leaving — the user can resize freely
/// either way). Acts on the calling window, so each window floats
/// independently.
#[tauri::command]
fn set_window_floating(window: WebviewWindow<Wry>, floating: bool) -> Result<(), String> {
    window
        .set_always_on_top(floating)
        .map_err(|e| e.to_string())?;
    // A running tiling WM owns window frames and snaps programmatic resizes
    // back — ask it to float/retile us first so the size below sticks.
    aerospace_layout(floating);
    if floating {
        // A zoomed window ignores programmatic resizes on macOS — leave the
        // zoomed state first (best effort: macOS window *tiling* owns the
        // frame outright and even this is ignored; the user can un-tile by
        // dragging the window once).
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        }
        // Position before sizing: position-then-size survives window states
        // where a bare set_size is ignored.
        if let Ok(Some(monitor)) = window.current_monitor() {
            let scale = monitor.scale_factor();
            let margin = (20.0 * scale) as i32;
            let width = (420.0 * scale) as i32;
            let x = monitor.size().width as i32 - width - margin;
            let y = (44.0 * scale) as i32;
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        }
        window
            .set_size(tauri::LogicalSize::new(420.0, 640.0))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The AeroSpace window id of the focused window, but only when that window
/// belongs to us — the layout change must never hit another app's window.
/// Folio can have several windows in one process, so the pid alone no longer
/// identifies which one to retile; the focused one is the one being toggled.
#[cfg(target_os = "macos")]
fn aerospace_focused_own_window() -> Option<String> {
    let out = std::process::Command::new("aerospace")
        .args([
            "list-windows",
            "--focused",
            "--format",
            "%{window-id} %{app-pid}",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&out.stdout);
    let (id, pid) = line.trim().split_once(char::is_whitespace)?;
    (pid.trim() == std::process::id().to_string()).then(|| id.to_owned())
}

/// Best effort: if AeroSpace (macOS tiling WM) is managing this window, ask
/// it to float/retile the window. Silent no-op when the CLI is absent.
#[cfg(target_os = "macos")]
fn aerospace_layout(floating: bool) {
    let Some(id) = aerospace_focused_own_window() else {
        return;
    };
    let _ = std::process::Command::new("aerospace")
        .args([
            "layout",
            "--window-id",
            &id,
            if floating { "floating" } else { "tiling" },
        ])
        .output();
}

#[cfg(not(target_os = "macos"))]
fn aerospace_layout(_floating: bool) {}

/// Ask LaunchServices to route markdown files to Folio (macOS only — Windows
/// and Linux users set default apps through the OS; the bundle's declared
/// file associations make Folio appear as a candidate there).
#[tauri::command]
fn register_default_markdown_handler(app: AppHandle<Wry>) -> Result<(), String> {
    set_default_markdown_handler(&app.config().identifier)
}

#[cfg(target_os = "macos")]
fn set_default_markdown_handler(bundle_id: &str) -> Result<(), String> {
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    extern "C" {
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
            handler_bundle_id: CFStringRef,
        ) -> i32;
    }
    const LS_ROLES_ALL: u32 = u32::MAX;

    let uti = CFString::new("net.daringfireball.markdown");
    let bundle = CFString::new(bundle_id);
    let status = unsafe {
        LSSetDefaultRoleHandlerForContentType(
            uti.as_concrete_TypeRef(),
            LS_ROLES_ALL,
            bundle.as_concrete_TypeRef(),
        )
    };
    if status == 0 {
        Ok(())
    } else {
        Err(format!("LaunchServices returned status {status}"))
    }
}

#[cfg(not(target_os = "macos"))]
fn set_default_markdown_handler(_bundle_id: &str) -> Result<(), String> {
    Err("setting the default app is only supported on macOS; use your OS settings".to_string())
}

// ——— revision history ———
//
// Every on-disk version of a watched/reviewed file is archived so the user
// can diff any earlier revision against the current document. Storage:
// <config>/history/<fnv1a(path)>/<seq>.json with {"markdown","rendered",
// "archived_at"} — rendered text is kept alongside so history diffs map
// exactly onto the decoration layer. Core logic takes a plain directory so
// it is unit-testable without an AppHandle.

const MAX_REVISIONS: usize = 20;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct RevisionContent {
    markdown: String,
    rendered: String,
    archived_at: u64,
}

#[derive(serde::Serialize)]
struct RevisionMeta {
    seq: u64,
    archived_at: u64,
    preview: String,
}

/// FNV-1a hex of the reviewed file's path — stable directory name.
fn path_hash(path: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in path.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn revision_seqs(dir: &std::path::Path) -> Vec<u64> {
    let mut seqs: Vec<u64> = fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    e.file_name()
                        .to_str()?
                        .strip_suffix(".json")?
                        .parse::<u64>()
                        .ok()
                })
                .collect()
        })
        .unwrap_or_default();
    seqs.sort_unstable();
    seqs
}

fn read_revision_file(dir: &std::path::Path, seq: u64) -> Result<RevisionContent, String> {
    let raw = fs::read_to_string(dir.join(format!("{seq}.json")))
        .map_err(|e| format!("failed to read revision {seq}: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("corrupt revision {seq}: {e}"))
}

/// Archive a new revision unless it matches the latest one; prune to the
/// newest MAX_REVISIONS. Returns the revision's seq.
fn archive_in_dir(
    dir: &std::path::Path,
    markdown: &str,
    rendered: &str,
    now: u64,
) -> Result<u64, String> {
    fs::create_dir_all(dir).map_err(|e| format!("failed to create history dir: {e}"))?;
    let seqs = revision_seqs(dir);
    if let Some(&latest) = seqs.last() {
        if let Ok(content) = read_revision_file(dir, latest) {
            if content.markdown == markdown {
                return Ok(latest);
            }
        }
    }
    let seq = seqs.last().map(|s| s + 1).unwrap_or(1);
    let content = RevisionContent {
        markdown: markdown.to_string(),
        rendered: rendered.to_string(),
        archived_at: now,
    };
    let json = serde_json::to_string(&content).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{seq}.json")), json)
        .map_err(|e| format!("failed to write revision: {e}"))?;
    // Prune oldest beyond the cap.
    let seqs = revision_seqs(dir);
    for old in seqs.iter().take(seqs.len().saturating_sub(MAX_REVISIONS)) {
        let _ = fs::remove_file(dir.join(format!("{old}.json")));
    }
    Ok(seq)
}

fn list_in_dir(dir: &std::path::Path) -> Vec<RevisionMeta> {
    let mut metas: Vec<RevisionMeta> = revision_seqs(dir)
        .into_iter()
        .rev()
        .filter_map(|seq| {
            let content = read_revision_file(dir, seq).ok()?;
            let preview: String = content
                .rendered
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(60)
                .collect();
            Some(RevisionMeta {
                seq,
                archived_at: content.archived_at,
                preview,
            })
        })
        .collect();
    metas.sort_by(|a, b| b.seq.cmp(&a.seq));
    metas
}

fn history_dir(app: &AppHandle<Wry>, path: &str) -> Result<std::path::PathBuf, String> {
    Ok(config_dir(app)?.join("history").join(path_hash(path)))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Archive a revision of a reviewed file (no-op duplicate-safe).
#[tauri::command]
fn archive_revision(
    app: AppHandle<Wry>,
    path: String,
    markdown: String,
    rendered: String,
) -> Result<u64, String> {
    archive_in_dir(&history_dir(&app, &path)?, &markdown, &rendered, now_secs())
}

/// List archived revisions, newest first.
#[tauri::command]
fn list_revisions(app: AppHandle<Wry>, path: String) -> Result<Vec<RevisionMeta>, String> {
    Ok(list_in_dir(&history_dir(&app, &path)?))
}

/// Read one archived revision (markdown + rendered text for diffing).
#[tauri::command]
fn read_revision(app: AppHandle<Wry>, path: String, seq: u64) -> Result<RevisionContent, String> {
    read_revision_file(&history_dir(&app, &path)?, seq)
}

// ——— annotation store (embedded SQLite) ———
//
// Review annotations persist in <config>/folio.db so they survive webview
// data clears and are queryable outside the app. Core logic takes a
// &Connection so it is unit-testable in memory.

/// One review annotation; field names match the frontend model exactly.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Annotation {
    id: String,
    kind: String,
    quote: String,
    body: String,
    created_at: String,
}

fn init_annotation_db(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS annotations (
            id         TEXT PRIMARY KEY,
            path       TEXT NOT NULL,
            kind       TEXT NOT NULL,
            quote      TEXT NOT NULL,
            body       TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_annotations_path ON annotations(path);",
    )
}

fn list_annotations_in(
    conn: &rusqlite::Connection,
    path: &str,
) -> rusqlite::Result<Vec<Annotation>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, quote, body, created_at FROM annotations
         WHERE path = ?1 ORDER BY created_at, rowid",
    )?;
    let rows = stmt.query_map([path], |row| {
        Ok(Annotation {
            id: row.get(0)?,
            kind: row.get(1)?,
            quote: row.get(2)?,
            body: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

fn add_annotation_in(
    conn: &rusqlite::Connection,
    path: &str,
    annotation: &Annotation,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO annotations (id, path, kind, quote, body, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            annotation.id,
            path,
            annotation.kind,
            annotation.quote,
            annotation.body,
            annotation.created_at
        ],
    )?;
    Ok(())
}

fn clear_annotations_in(conn: &rusqlite::Connection, path: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM annotations WHERE path = ?1", [path])?;
    Ok(())
}

fn delete_annotation_in(conn: &rusqlite::Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM annotations WHERE id = ?1", [id])?;
    Ok(())
}

/// Lazily opened annotation database.
struct AnnotationDb(Mutex<Option<rusqlite::Connection>>);

impl AnnotationDb {
    fn with<T>(
        &self,
        app: &AppHandle<Wry>,
        f: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self.0.lock().unwrap();
        if guard.is_none() {
            let path = config_dir(app)?.join("folio.db");
            let conn = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
            init_annotation_db(&conn).map_err(|e| e.to_string())?;
            *guard = Some(conn);
        }
        f(guard.as_ref().unwrap())
    }
}

/// All annotations for a file, oldest first.
#[tauri::command]
fn list_annotations(
    app: AppHandle<Wry>,
    state: tauri::State<'_, AnnotationDb>,
    path: String,
) -> Result<Vec<Annotation>, String> {
    state.with(&app, |conn| list_annotations_in(conn, &path).map_err(|e| e.to_string()))
}

/// Insert (or replace) one annotation for a file.
#[tauri::command]
fn add_annotation(
    app: AppHandle<Wry>,
    state: tauri::State<'_, AnnotationDb>,
    path: String,
    annotation: Annotation,
) -> Result<(), String> {
    state.with(&app, |conn| {
        add_annotation_in(conn, &path, &annotation).map_err(|e| e.to_string())
    })
}

/// Delete all annotations for a file.
#[tauri::command]
fn clear_annotations(
    app: AppHandle<Wry>,
    state: tauri::State<'_, AnnotationDb>,
    path: String,
) -> Result<(), String> {
    state.with(&app, |conn| clear_annotations_in(conn, &path).map_err(|e| e.to_string()))
}

/// Delete a single annotation by id.
#[tauri::command]
fn delete_annotation(
    app: AppHandle<Wry>,
    state: tauri::State<'_, AnnotationDb>,
    id: String,
) -> Result<(), String> {
    state.with(&app, |conn| delete_annotation_in(conn, &id).map_err(|e| e.to_string()))
}

/// Read a UTF-8 text file from disk.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("failed to read {path}: {e}"))
}

/// Write a UTF-8 text file to disk, creating or overwriting it.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| format!("failed to write {path}: {e}"))
}

// ——— licensing ———

fn config_dir(app: &AppHandle<Wry>) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve app config dir: {e}"))
}

/// Whether a valid license is currently persisted (used for menu labels).
fn is_licensed(app: &AppHandle<Wry>) -> bool {
    config_dir(app)
        .map(|dir| license::load_license_state(&dir).licensed)
        .unwrap_or(false)
}

/// The Export submenu is Pro-gated; its label carries the "(Pro)" marker
/// until a license is unlocked.
fn export_label(licensed: bool) -> &'static str {
    if licensed { "Export" } else { "Export (Pro)" }
}

/// Rebuild the app menu with the current license state and replace it.
/// (Menu-item label updates via `menu.get(...)` proved unreliable for
/// submenu titles on macOS, so we rebuild and re-set the whole menu.)
/// Checkmarks are carried over — a rebuild must not reset view/watch state.
fn rebuild_menu(app: &AppHandle<Wry>) {
    const CHECK_IDS: [&str; 8] = [
        "view.focus-mode",
        "view.typewriter-mode",
        "view.float-on-top",
        "file.watch",
        "view.telemetry",
        "view.theme-paper",
        "view.theme-night",
        "view.theme-newsprint",
    ];
    let licensed = is_licensed(app);
    let mut checked: Vec<(String, bool)> = Vec::new();
    if let Some(menu) = app.menu() {
        if let Ok(items) = menu.items() {
            for id in CHECK_IDS {
                if let Some(item) = find_check_item(items.clone(), id) {
                    checked.push((id.to_string(), item.is_checked().unwrap_or(false)));
                }
            }
        }
    }
    if let Ok(menu) = build_menu(app, licensed) {
        if let Ok(items) = menu.items() {
            for (id, is_checked) in checked {
                if let Some(item) = find_check_item(items.clone(), &id) {
                    let _ = item.set_checked(is_checked);
                }
            }
        }
        let _ = app.set_menu(menu);
    }
}

/// Replace the Open Recent submenu contents (frontend owns the list).
#[tauri::command]
fn set_recent_files(app: AppHandle<Wry>, paths: Vec<String>) {
    if let Some(state) = app.try_state::<RecentFiles>() {
        *state.0.lock().unwrap() = paths;
    }
    rebuild_menu(&app);
}

/// Replace the Revision History submenu contents (frontend owns the list).
#[tauri::command]
fn set_revision_menu(app: AppHandle<Wry>, entries: Vec<(u64, String)>) {
    if let Some(state) = app.try_state::<RevisionMenu>() {
        *state.0.lock().unwrap() = entries;
    }
    rebuild_menu(&app);
}

/// Open the native print panel (macOS: includes Save as PDF) for the
/// calling window's document.
#[tauri::command]
fn print_document(window: WebviewWindow<Wry>) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

/// Find a check item by id anywhere in the menu tree (`Menu::get` is
/// shallow and never descends into submenus).
fn find_check_item(items: Vec<MenuItemKind<Wry>>, id: &str) -> Option<CheckMenuItem<Wry>> {
    for item in items {
        match item {
            MenuItemKind::Check(item) if item.id() == id => return Some(item),
            MenuItemKind::Submenu(submenu) => {
                if let Ok(items) = submenu.items() {
                    if let Some(found) = find_check_item(items, id) {
                        return Some(found);
                    }
                }
            }
            _ => {}
        }
    }
    None
}

/// The frontend owns view-mode state (gating decides what actually
/// changed); it pushes the truth back so checkmarks never drift.
#[tauri::command]
fn sync_menu_state(
    app: AppHandle<Wry>,
    focus: bool,
    typewriter: bool,
    theme: String,
    floating: bool,
    watch: bool,
    telemetry: bool,
) {
    let Some(menu) = app.menu() else { return };
    let checks = [
        ("view.focus-mode", focus),
        ("view.typewriter-mode", typewriter),
        ("view.float-on-top", floating),
        ("file.watch", watch),
        ("view.telemetry", telemetry),
        ("view.theme-paper", theme == "paper"),
        ("view.theme-night", theme == "night"),
        ("view.theme-newsprint", theme == "newsprint"),
    ];
    let Ok(items) = menu.items() else { return };
    for (id, checked) in checks {
        if let Some(item) = find_check_item(items.clone(), id) {
            let _ = item.set_checked(checked);
        }
    }
}

/// Validate a license key; on success persist it to the app config dir.
#[tauri::command]
fn verify_and_store_license(
    app: AppHandle<Wry>,
    key: String,
) -> Result<license::LicenseInfo, String> {
    let payload = license::verify_license(&key).map_err(|e| e.to_string())?;
    let dir = config_dir(&app)?;
    license::store_license(&dir, &payload.email, key.trim())?;
    rebuild_menu(&app);
    Ok(license::LicenseInfo {
        valid: true,
        email: Some(payload.email),
        error: None,
    })
}

/// Current license state, re-verified from the persisted file.
#[tauri::command]
fn get_license_state(app: AppHandle<Wry>) -> license::LicenseState {
    match config_dir(&app) {
        Ok(dir) => license::load_license_state(&dir),
        Err(_) => license::LicenseState {
            licensed: false,
            email: None,
        },
    }
}

/// Remove the persisted license.
#[tauri::command]
fn clear_license(app: AppHandle<Wry>) -> Result<(), String> {
    let dir = config_dir(&app)?;
    license::clear_stored_license(&dir)?;
    rebuild_menu(&app);
    Ok(())
}

/// Build a custom menu item whose id is forwarded to the frontend.
fn menu_item<R: Runtime, M: Manager<R>>(
    manager: &M,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    let mut builder = MenuItemBuilder::with_id(id, label);
    if let Some(accel) = accelerator {
        builder = builder.accelerator(accel);
    }
    builder.build(manager)
}

/// Build a custom checkable menu item whose id is forwarded to the frontend.
fn check_item<R: Runtime, M: Manager<R>>(
    manager: &M,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
    checked: bool,
) -> tauri::Result<CheckMenuItem<R>> {
    let mut builder = CheckMenuItemBuilder::with_id(id, label).checked(checked);
    if let Some(accel) = accelerator {
        builder = builder.accelerator(accel);
    }
    builder.build(manager)
}

/// The native application menu (Typora-flavored). Custom items carry
/// dotted ids ("paragraph.heading-1", …) that `on_menu_event` forwards
/// to the webview as `menu` events; predefined items act natively.
/// `licensed` is passed in (not read from disk) because the path resolver
/// is only managed once the app is set up — resolving the config dir
/// during initial menu construction panics.
fn build_menu(app: &AppHandle<Wry>, licensed: bool) -> tauri::Result<Menu<Wry>> {

    let app_menu = SubmenuBuilder::new(app, "Folio")
        .item(&menu_item(app, "app.enter-license", "Enter License…", None)?)
        .item(&menu_item(
            app,
            "app.check-updates",
            "Check for Updates…",
            None,
        )?)
        .separator()
        .about(Some(AboutMetadata::default()))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let mut file_builder = SubmenuBuilder::new(app, "File")
        .item(&menu_item(app, "file.new", "New", Some("CmdOrCtrl+N"))?)
        .item(&menu_item(
            app,
            "file.new-window",
            "New Window",
            Some("Shift+CmdOrCtrl+N"),
        )?)
        .item(&menu_item(app, "file.open", "Open…", Some("CmdOrCtrl+O"))?);
    let recent = recent_files(app);
    if !recent.is_empty() {
        let mut recent_builder = SubmenuBuilder::new(app, "Open Recent");
        for (i, path) in recent.iter().enumerate() {
            recent_builder = recent_builder.item(&menu_item(
                app,
                &format!("file.recent.{i}"),
                &file_name(path),
                None,
            )?);
        }
        file_builder = file_builder.item(&recent_builder.build()?);
    }
    let revisions = revision_entries(app);
    if !revisions.is_empty() {
        let mut revision_builder = SubmenuBuilder::new(app, "Revision History");
        for (seq, label) in &revisions {
            revision_builder = revision_builder.item(&menu_item(
                app,
                &format!("file.revision.{seq}"),
                label,
                None,
            )?);
        }
        file_builder = file_builder.item(&revision_builder.build()?);
    }
    let mut file_builder = file_builder
        .separator()
        .item(&menu_item(
            app,
            "file.back",
            "Back",
            Some("CmdOrCtrl+["),
        )?)
        .item(&menu_item(
            app,
            "file.forward",
            "Forward",
            Some("CmdOrCtrl+]"),
        )?)
        .separator()
        .item(&menu_item(app, "file.save", "Save", Some("CmdOrCtrl+S"))?)
        .item(&menu_item(
            app,
            "file.save-as",
            "Save As…",
            Some("Shift+CmdOrCtrl+S"),
        )?)
        .separator()
        .item(&check_item(
            app,
            "file.watch",
            "Auto-Reload External Changes",
            None,
            false,
        )?)
        .separator()
        .item(&menu_item(
            app,
            "file.feedback",
            "Export Review Feedback",
            Some("Alt+CmdOrCtrl+R"),
        )?)
        .item(&menu_item(
            app,
            "file.clear-annotations",
            "Clear Review Annotations",
            None,
        )?)
        .separator()
        .item(
            &SubmenuBuilder::with_id(app, "file.export", export_label(licensed))
                .item(&menu_item(
                    app,
                    "file.export-html",
                    "HTML…",
                    Some("CmdOrCtrl+E"),
                )?)
                .item(&menu_item(app, "file.export-pdf", "PDF…", None)?)
                .build()?,
        );
    if cfg!(target_os = "macos") {
        file_builder = file_builder.separator().item(&menu_item(
            app,
            "file.make-default",
            "Set as Default Markdown App…",
            None,
        )?);
    }
    let file_menu = file_builder.separator().close_window().build()?;

    // Predefined edit items dispatch through the native responder chain,
    // which is what makes undo/cut/copy/paste work inside WKWebView.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&menu_item(
            app,
            "edit.annotate",
            "Annotate Selection…",
            Some("Alt+CmdOrCtrl+A"),
        )?)
        .build()?;

    let mut paragraph_builder = SubmenuBuilder::new(app, "Paragraph");
    for level in 1..=6 {
        paragraph_builder = paragraph_builder.item(&menu_item(
            app,
            &format!("paragraph.heading-{level}"),
            &format!("Heading {level}"),
            Some(&format!("CmdOrCtrl+{level}")),
        )?);
    }
    let paragraph_menu: Submenu<Wry> = paragraph_builder
        .item(&menu_item(
            app,
            "paragraph.paragraph",
            "Paragraph",
            Some("CmdOrCtrl+0"),
        )?)
        .separator()
        .item(&menu_item(
            app,
            "paragraph.heading-up",
            "Increase Heading Level",
            Some("CmdOrCtrl+="),
        )?)
        .item(&menu_item(
            app,
            "paragraph.heading-down",
            "Decrease Heading Level",
            Some("CmdOrCtrl+-"),
        )?)
        .separator()
        .item(&menu_item(
            app,
            "paragraph.table",
            "Table",
            Some("Alt+CmdOrCtrl+T"),
        )?)
        .item(&menu_item(
            app,
            "paragraph.code-fence",
            "Code Fences",
            Some("Alt+CmdOrCtrl+C"),
        )?)
        .item(&menu_item(
            app,
            "paragraph.quote",
            "Quote",
            Some("Alt+CmdOrCtrl+Q"),
        )?)
        .item(&menu_item(
            app,
            "paragraph.ordered-list",
            "Ordered List",
            Some("Alt+CmdOrCtrl+O"),
        )?)
        .item(&menu_item(
            app,
            "paragraph.unordered-list",
            "Unordered List",
            Some("Alt+CmdOrCtrl+U"),
        )?)
        .item(&menu_item(
            app,
            "paragraph.task-list",
            "Task List",
            Some("Alt+CmdOrCtrl+X"),
        )?)
        .separator()
        .item(&menu_item(
            app,
            "paragraph.hr",
            "Horizontal Line",
            Some("Alt+CmdOrCtrl+-"),
        )?)
        .build()?;

    let format_menu = SubmenuBuilder::new(app, "Format")
        .item(&menu_item(app, "format.strong", "Strong", Some("CmdOrCtrl+B"))?)
        .item(&menu_item(
            app,
            "format.emphasis",
            "Emphasis",
            Some("CmdOrCtrl+I"),
        )?)
        .item(&menu_item(app, "format.code", "Code", Some("Ctrl+Shift+`"))?)
        .item(&menu_item(
            app,
            "format.strike",
            "Strike",
            Some("Ctrl+Alt+`"),
        )?)
        .item(&menu_item(
            app,
            "format.link",
            "Hyperlink",
            Some("CmdOrCtrl+K"),
        )?)
        .separator()
        .item(&menu_item(
            app,
            "format.clear",
            "Clear Format",
            Some("CmdOrCtrl+\\"),
        )?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&menu_item(
            app,
            "view.source-mode",
            "Source Code Mode",
            Some("CmdOrCtrl+/"),
        )?)
        .separator()
        .item(&check_item(
            app,
            "view.focus-mode",
            "Focus Mode",
            Some("Alt+CmdOrCtrl+F"),
            false,
        )?)
        .item(&check_item(
            app,
            "view.typewriter-mode",
            "Typewriter Mode",
            Some("Alt+CmdOrCtrl+Y"),
            false,
        )?)
        .separator()
        .item(&check_item(
            app,
            "view.float-on-top",
            "Float on Top",
            Some("Alt+CmdOrCtrl+W"),
            false,
        )?)
        .separator()
        .item(&check_item(
            app,
            "view.telemetry",
            "Usage Statistics",
            None,
            false,
        )?)
        .item(
            &SubmenuBuilder::new(app, "Themes")
                .item(&check_item(app, "view.theme-paper", "Paper", None, true)?)
                .item(&check_item(app, "view.theme-night", "Night", None, false)?)
                .item(&check_item(
                    app,
                    "view.theme-newsprint",
                    "Newsprint",
                    None,
                    false,
                )?)
                .build()?,
        )
        .separator()
        .item(&menu_item(app, "view.zoom-in", "Zoom In", Some("Shift+CmdOrCtrl+="))?)
        .item(&menu_item(
            app,
            "view.zoom-out",
            "Zoom Out",
            Some("Shift+CmdOrCtrl+-"),
        )?)
        .item(&menu_item(
            app,
            "view.zoom-reset",
            "Actual Size",
            Some("Shift+CmdOrCtrl+0"),
        )?)
        .separator()
        .fullscreen()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &paragraph_menu,
            &format_menu,
            &view_menu,
            &window_menu,
        ])
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Resolved before the builder runs: a second invocation gets this far
    // before tauri-plugin-single-instance sends it away, which is what lets
    // it resolve piped stdin into a real path the primary can open.
    let cli = parse_cli_args(std::env::args());
    let own_pid = std::process::id();
    let own_spool = write_spool(own_pid, &cli);

    // Managed before build: on a macOS cold start the Opened event can fire
    // before setup runs, and a state registered only in setup would be too
    // late to catch it.
    let requests = WindowRequests::default();
    requests
        .0
        .lock()
        .unwrap()
        .insert("main".to_string(), cli);

    tauri::Builder::default()
        // Must be registered first so a second launch is turned away before
        // it can build a window of its own.
        .plugin(tauri_plugin_single_instance::init(move |app, _argv, _cwd| {
            // argv is deliberately ignored — the spool carries the *resolved*
            // request, including markdown piped into the other invocation.
            for request in drain_spool(own_pid) {
                let _ = open_window(app, request);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(requests)
        .manage(WindowCounter::default())
        .manage(Started::default())
        .manage(RecentFiles::default())
        .manage(RevisionMenu::default())
        .manage(AnnotationDb(Mutex::new(None)))
        .menu(|app| build_menu(app, false))
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            if id == "file.new-window" {
                let _ = open_window(app, CliOptions::default());
                return;
            }
            // Only our dotted custom ids need frontend handling; predefined
            // items (undo, copy, fullscreen, …) already acted natively.
            let is_custom = ["app.", "file.", "edit.", "paragraph.", "format.", "view."]
                .iter()
                .any(|prefix| id.starts_with(prefix));
            if !is_custom {
                return;
            }
            // The menu bar is shared by every window, so a broadcast would
            // run the command in all of them — send it to the focused one.
            if let Some(label) = target_window_label(app) {
                let _ = app.emit_to(label.as_str(), "menu", id);
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            verify_and_store_license,
            get_license_state,
            clear_license,
            print_document,
            sync_menu_state,
            take_startup_request,
            set_window_floating,
            set_recent_files,
            list_annotations,
            add_annotation,
            clear_annotations,
            delete_annotation,
            set_revision_menu,
            archive_revision,
            list_revisions,
            read_revision,
            register_default_markdown_handler
        ])
        .setup(move |app| {
            // Now the path resolver is managed; rebuild the menu with the
            // persisted license state so Pro labels are correct.
            rebuild_menu(app.handle());
            // Reaching setup proves we are the primary instance, so our own
            // spool entry will never be needed for a handoff.
            if let Some(path) = &own_spool {
                let _ = fs::remove_file(path);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(handle_run_event);
}

/// Handle lifecycle events from the event loop. `RunEvent::Opened` only
/// exists on macOS/iOS, so the whole handler is cfg-gated.
#[cfg(target_os = "macos")]
fn handle_run_event(app: &AppHandle<Wry>, event: RunEvent) {
    // macOS sends files opened via Finder here — including the cold start
    // that launched the app.
    let RunEvent::Opened { urls } = event else {
        return;
    };
    let paths: Vec<String> = urls
        .iter()
        .filter_map(|url| url.to_file_path().ok())
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    if paths.is_empty() {
        return;
    }
    // Cold start: the starting window has not drained its request yet, so
    // seed it rather than opening a second window on top of a blank one.
    if !app.state::<Started>().0.load(Ordering::Relaxed) {
        if let Some(request) = app.state::<WindowRequests>().0.lock().unwrap().get_mut("main") {
            request.paths.extend(paths);
            return;
        }
    }
    // Already running: each file gets its own window, the way a document
    // app is expected to behave.
    for path in paths {
        let _ = open_window(
            app,
            CliOptions {
                paths: vec![path],
                float: false,
            },
        );
    }
}

#[cfg(not(target_os = "macos"))]
fn handle_run_event(_app: &AppHandle<Wry>, _event: RunEvent) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("folio-test-{name}-{}", std::process::id()))
    }

    #[test]
    fn write_then_read_roundtrip() {
        let path = temp_path("roundtrip.md");
        let path_str = path.to_string_lossy().into_owned();
        let content = "# Hello\n\nSome **markdown**.\n".to_string();

        write_text_file(path_str.clone(), content.clone()).unwrap();
        let read_back = read_text_file(path_str.clone()).unwrap();
        assert_eq!(read_back, content);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn read_missing_file_returns_err() {
        let path = temp_path("does-not-exist.md");
        let result = read_text_file(path.to_string_lossy().into_owned());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("failed to read"));
    }

    #[test]
    fn write_overwrites_existing_file() {
        let path = temp_path("overwrite.md");
        let path_str = path.to_string_lossy().into_owned();

        write_text_file(path_str.clone(), "first".to_string()).unwrap();
        write_text_file(path_str.clone(), "second".to_string()).unwrap();
        assert_eq!(read_text_file(path_str.clone()).unwrap(), "second");

        std::fs::remove_file(&path).ok();
    }

    /// Like `temp_path`, but the extension stays last (the helper above
    /// appends the pid after the whole name, hiding the extension).
    /// `stem` keeps parallel tests off each other's files (APFS is
    /// case-insensitive, so differing only in extension case collides).
    fn temp_file(stem: &str, ext: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("folio-test-{stem}-{}.{ext}", std::process::id()))
    }

    #[test]
    fn parse_cli_args_keeps_existing_markdown_files() {
        let md = temp_file("args", "md");
        let txt = temp_file("args", "txt");
        fs::write(&md, "# hi").unwrap();
        fs::write(&txt, "not markdown").unwrap();

        let cli = parse_cli_args(
            [
                "folio".to_string(),
                md.to_string_lossy().into_owned(),
                txt.to_string_lossy().into_owned(),
                "-psn_0_12345".to_string(),
                temp_file("args", "missing.md").to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );

        assert_eq!(cli.paths, vec![md.to_string_lossy().into_owned()]);
        assert!(!cli.float);

        fs::remove_file(&md).ok();
        fs::remove_file(&txt).ok();
    }

    #[test]
    fn parse_cli_args_matches_extensions_case_insensitively() {
        let upper = temp_file("args-upper", "MD");
        fs::write(&upper, "# hi").unwrap();

        let cli =
            parse_cli_args(["folio".to_string(), upper.to_string_lossy().into_owned()].into_iter());

        assert_eq!(cli.paths, vec![upper.to_string_lossy().into_owned()]);

        fs::remove_file(&upper).ok();
    }

    #[test]
    fn parse_cli_args_lifts_out_the_float_flag() {
        let md = temp_file("args-float", "md");
        fs::write(&md, "# hi").unwrap();

        for flag in ["--float", "-f"] {
            let cli = parse_cli_args(
                [
                    "folio".to_string(),
                    flag.to_string(),
                    md.to_string_lossy().into_owned(),
                ]
                .into_iter(),
            );
            assert!(cli.float, "{flag} should request float mode");
            assert_eq!(cli.paths, vec![md.to_string_lossy().into_owned()]);
        }

        fs::remove_file(&md).ok();
    }

    #[test]
    fn parse_cli_args_review_subcommand_implies_float() {
        let md = temp_file("args-review", "md");
        fs::write(&md, "# hi").unwrap();

        let cli = parse_cli_args(
            [
                "folio".to_string(),
                "review".to_string(),
                md.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );

        assert!(cli.float);
        assert_eq!(cli.paths, vec![md.to_string_lossy().into_owned()]);

        fs::remove_file(&md).ok();
    }

    #[test]
    fn write_temp_markdown_writes_nonempty_content_only() {
        let dir = std::env::temp_dir().join(format!("folio-test-tmp-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();

        let path = write_temp_markdown("# piped\n", &dir).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "# piped\n");
        assert_eq!(path.extension().and_then(|e| e.to_str()), Some("md"));

        assert!(write_temp_markdown("   \n ", &dir).is_none());
        assert!(write_temp_markdown("", &dir).is_none());

        fs::remove_dir_all(&dir).ok();
    }

    fn spool_test_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("folio-test-spool-{name}-{}", std::process::id()));
        fs::remove_dir_all(&dir).ok();
        dir
    }

    #[test]
    fn spool_hands_other_invocations_requests_to_the_primary() {
        let dir = spool_test_dir("handoff");
        let own = CliOptions {
            paths: vec!["/mine.md".to_string()],
            float: false,
        };
        let other = CliOptions {
            paths: vec!["/theirs.md".to_string()],
            float: true,
        };
        write_spool_in(&dir, 100, &own).unwrap();
        write_spool_in(&dir, 200, &other).unwrap();

        // The primary already holds its own request in memory, so draining
        // must hand back only the other invocation's.
        let drained = drain_spool_in(&dir, 100, 60);
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].paths, vec!["/theirs.md".to_string()]);
        assert!(drained[0].float);

        // Draining consumes: a second handoff must not reopen the window.
        assert!(drain_spool_in(&dir, 100, 60).is_empty());
        // …and our own entry is left for `setup` to remove.
        assert!(dir.join("100.json").exists());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn spool_drops_corrupt_entries_but_still_consumes_them() {
        let dir = spool_test_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("400.json"), "not json").unwrap();

        assert!(drain_spool_in(&dir, 999, 60).is_empty());
        assert!(!dir.join("400.json").exists(), "a corrupt entry is not left to be retried");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn spool_drops_stale_entries_left_by_a_dead_invocation() {
        let dir = spool_test_dir("stale");
        write_spool_in(
            &dir,
            300,
            &CliOptions {
                paths: vec!["/abandoned.md".to_string()],
                float: false,
            },
        )
        .unwrap();

        // An exclusive max age of 0 makes even a just-written entry stale,
        // standing in for one whose invocation died long ago: it must be
        // discarded, not opened in a window.
        assert!(drain_spool_in(&dir, 999, 0).is_empty());
        assert!(!dir.join("300.json").exists());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn draining_a_missing_spool_dir_is_not_an_error() {
        let dir = spool_test_dir("absent");
        assert!(drain_spool_in(&dir, 1, 60).is_empty());
    }

    fn history_test_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("folio-test-history-{name}-{}", std::process::id()))
    }

    #[test]
    fn archive_stores_and_lists_revisions_newest_first() {
        let dir = history_test_dir("basic");
        archive_in_dir(&dir, "# v1\n", "v1 rendered", 1000).unwrap();
        archive_in_dir(&dir, "# v2\n", "v2 rendered", 2000).unwrap();

        let list = list_in_dir(&dir);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].seq, 2);
        assert_eq!(list[0].archived_at, 2000);
        assert!(list[0].preview.contains("v2 rendered"));
        assert_eq!(list[1].seq, 1);

        let content = read_revision_file(&dir, 1).unwrap();
        assert_eq!(content.markdown, "# v1\n");
        assert_eq!(content.rendered, "v1 rendered");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn archive_skips_duplicates_of_the_latest_revision() {
        let dir = history_test_dir("dedupe");
        let first = archive_in_dir(&dir, "# same\n", "same", 1000).unwrap();
        let second = archive_in_dir(&dir, "# same\n", "same", 2000).unwrap();

        assert_eq!(first, second);
        assert_eq!(list_in_dir(&dir).len(), 1);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn archive_prunes_to_the_newest_twenty() {
        let dir = history_test_dir("prune");
        for i in 0..25 {
            archive_in_dir(&dir, &format!("# v{i}\n"), "rendered", 1000 + i).unwrap();
        }

        let seqs = revision_seqs(&dir);
        assert_eq!(seqs.len(), MAX_REVISIONS);
        assert_eq!(seqs[0], 6, "oldest five revisions are pruned");
        assert_eq!(list_in_dir(&dir)[0].seq, 25);

        fs::remove_dir_all(&dir).ok();
    }

    fn test_annotation(id: &str, kind: &str) -> Annotation {
        Annotation {
            id: id.to_string(),
            kind: kind.to_string(),
            quote: "quoted text".to_string(),
            body: "note body".to_string(),
            created_at: "2026-07-28T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn annotation_db_stores_lists_and_clears_per_path() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_annotation_db(&conn).unwrap();

        add_annotation_in(&conn, "/a.md", &test_annotation("a1", "comment")).unwrap();
        add_annotation_in(&conn, "/a.md", &test_annotation("a2", "delete")).unwrap();
        add_annotation_in(&conn, "/b.md", &test_annotation("b1", "replace")).unwrap();

        let a = list_annotations_in(&conn, "/a.md").unwrap();
        assert_eq!(a.len(), 2);
        assert_eq!(a[0].id, "a1");
        assert_eq!(a[1].kind, "delete");
        assert_eq!(list_annotations_in(&conn, "/b.md").unwrap().len(), 1);
        assert_eq!(list_annotations_in(&conn, "/c.md").unwrap().len(), 0);

        clear_annotations_in(&conn, "/a.md").unwrap();
        assert_eq!(list_annotations_in(&conn, "/a.md").unwrap().len(), 0);
        // clearing one path leaves the other untouched
        assert_eq!(list_annotations_in(&conn, "/b.md").unwrap().len(), 1);

        // deleting a single annotation by id
        delete_annotation_in(&conn, "b1").unwrap();
        assert_eq!(list_annotations_in(&conn, "/b.md").unwrap().len(), 0);
    }

    #[test]
    fn annotation_db_replace_on_same_id_keeps_single_row() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_annotation_db(&conn).unwrap();

        add_annotation_in(&conn, "/a.md", &test_annotation("a1", "comment")).unwrap();
        let mut updated = test_annotation("a1", "comment");
        updated.body = "edited note".to_string();
        add_annotation_in(&conn, "/a.md", &updated).unwrap();

        let list = list_annotations_in(&conn, "/a.md").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].body, "edited note");
    }
}
