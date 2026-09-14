use std::collections::HashMap;
use std::fs;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

use tauri::menu::{
    AboutMetadata, CheckMenuItem, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem,
    MenuItemBuilder, MenuItemKind, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime, WebviewWindow, Wry};

use folio_core::archive::{self, RevisionContent, RevisionMeta, RevisionText};
use folio_core::feedback::Annotation;
use folio_core::gate as reviewgate;
use folio_core::skill as skillcli;
mod lenses;
mod settingscmd;

use folio_core::cliargs::{self, CliOptions};

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
        .accept_first_mouse(true)
        .build()
}

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
    // The window keeps whatever size and place it had: a review floats on
    // top of the person's other windows, it does not move or shrink.
    Ok(())
}

/// How long AeroSpace gets to answer before we give up on it. This runs
/// inside a Tauri command, so an unbounded wait would hang the app: a
/// wedged `aerospace` CLI (its server can stop answering while the app
/// itself keeps running) used to leave Folio frozen with no window and a
/// stuck child process behind it.
#[cfg(target_os = "macos")]
const AEROSPACE_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(400);

/// Run an `aerospace` subcommand and return its stdout, or None if it fails
/// or does not answer within `timeout` — in which case the child is killed
/// rather than left running.
#[cfg(target_os = "macos")]
fn aerospace_output(args: &[&str], timeout: std::time::Duration) -> Option<String> {
    use std::io::Read;
    use std::process::{Command, Stdio};

    let mut child = Command::new("aerospace")
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let deadline = std::time::Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let mut out = String::new();
                child.stdout.take()?.read_to_string(&mut out).ok()?;
                return Some(out);
            }
            Ok(None) if std::time::Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(10)),
            Err(_) => return None,
        }
    }
}

/// The AeroSpace window id of the focused window, but only when that window
/// belongs to us — the layout change must never hit another app's window.
/// Folio can have several windows in one process, so the pid alone no longer
/// identifies which one to retile; the focused one is the one being toggled.
#[cfg(target_os = "macos")]
fn aerospace_focused_own_window() -> Option<String> {
    let out = aerospace_output(
        &["list-windows", "--focused", "--format", "%{window-id} %{app-pid}"],
        AEROSPACE_TIMEOUT,
    )?;
    let (id, pid) = out.trim().split_once(char::is_whitespace)?;
    (pid.trim() == std::process::id().to_string()).then(|| id.to_owned())
}

/// Best effort: if AeroSpace (macOS tiling WM) is managing this window, ask
/// it to float/retile the window. Silent no-op when the CLI is absent,
/// unresponsive, or not managing us.
#[cfg(target_os = "macos")]
fn aerospace_layout(floating: bool) {
    let Some(id) = aerospace_focused_own_window() else {
        return;
    };
    let _ = aerospace_output(
        &[
            "layout",
            "--window-id",
            &id,
            if floating { "floating" } else { "tiling" },
        ],
        AEROSPACE_TIMEOUT,
    );
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
// The archive itself lives in folio_core::archive, which takes a plain
// directory; only resolving that directory needs the AppHandle.

fn history_dir(app: &AppHandle<Wry>, path: &str) -> Result<std::path::PathBuf, String> {
    Ok(config_dir(app)?.join("history").join(archive::path_hash(path)))
}

// ——— quick open ———
//
// The Markdown files under a document's project: the nearest ancestor with
// a .git directory, or the document's own folder. Hidden directories,
// node_modules, and build output are skipped; the walk is capped so a
// home directory never becomes a project.

const QUICK_OPEN_CAP: usize = 5000;

fn project_root_for(path: &std::path::Path) -> std::path::PathBuf {
    let start = path.parent().unwrap_or(path).to_path_buf();
    let mut dir = start.clone();
    for _ in 0..6 {
        if dir.join(".git").exists() {
            return dir;
        }
        match dir.parent() {
            Some(parent) => dir = parent.to_path_buf(),
            None => break,
        }
    }
    start
}

fn is_markdown_file(path: &std::path::Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_ascii_lowercase();
    // Folio's own companions beside a document are not documents.
    if name.ends_with(".feedback.md") || name.ends_with(".decision.md") || name.ends_with(".analysis.md") {
        return false;
    }
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("md") | Some("markdown") | Some("mdown") | Some("mkd")
    )
}

fn walk_markdown(dir: &std::path::Path, root: &std::path::Path, out: &mut Vec<String>) {
    if out.len() >= QUICK_OPEN_CAP {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            walk_markdown(&path, root, out);
        } else if is_markdown_file(&path) {
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
        if out.len() >= QUICK_OPEN_CAP {
            return;
        }
    }
}

#[derive(serde::Serialize)]
struct ProjectFiles {
    root: String,
    files: Vec<String>,
}

/// Markdown files under the project of `path`, relative to its root.
#[tauri::command]
fn list_project_markdown(path: String) -> ProjectFiles {
    let root = project_root_for(std::path::Path::new(&path));
    let mut files = Vec::new();
    walk_markdown(&root, &root, &mut files);
    ProjectFiles { root: root.to_string_lossy().to_string(), files }
}

/// Archive a revision of a reviewed file (no-op duplicate-safe).
#[tauri::command]
fn archive_revision(
    app: AppHandle<Wry>,
    path: String,
    markdown: String,
    rendered: String,
    origin: String,
) -> Result<u64, String> {
    // The first rewrite after "changes requested" is the agent's revision,
    // whichever window happens to archive it; it keeps the feedback it
    // answers so the history can show what was addressed.
    let pending = if origin == "external" {
        reviewgate::take_changes_requested_in(&reviewgate::review_dir(), &path)
    } else {
        None
    };
    let (origin, feedback) = match pending {
        Some(feedback) => ("revision".to_string(), Some(feedback)),
        None => (origin, None),
    };
    archive::archive_with_feedback(
        &history_dir(&app, &path)?,
        &markdown,
        &rendered,
        archive::now_secs(),
        &origin,
        feedback,
    )
}

/// Every archived revision's rendered text and origin, oldest first — the
/// input to the authorship chain.
#[tauri::command]
fn list_revision_contents(app: AppHandle<Wry>, path: String) -> Result<Vec<RevisionText>, String> {
    let dir = history_dir(&app, &path)?;
    Ok(archive::revision_seqs(&dir)
        .into_iter()
        .filter_map(|seq| {
            let content = archive::read_revision_file(&dir, seq).ok()?;
            Some(RevisionText {
                seq,
                archived_at: content.archived_at,
                rendered: content.rendered,
                origin: content.origin,
                feedback: content.feedback,
            })
        })
        .collect())
}

/// List archived revisions, newest first.
#[tauri::command]
fn list_revisions(app: AppHandle<Wry>, path: String) -> Result<Vec<RevisionMeta>, String> {
    Ok(archive::list_in_dir(&history_dir(&app, &path)?))
}

/// Read one archived revision (markdown + rendered text for diffing).
#[tauri::command]
fn read_revision(app: AppHandle<Wry>, path: String, seq: u64) -> Result<RevisionContent, String> {
    archive::read_revision_file(&history_dir(&app, &path)?, seq)
}

// ——— annotation store (embedded SQLite) ———
//
// Review annotations persist in <config>/folio.db so they survive webview
// data clears and are queryable outside the app. Core logic takes a
// &Connection so it is unit-testable in memory.

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
/// Write text, creating parent directories (the decision journal lives in
/// a folder that may not exist yet).
#[tauri::command]
fn write_text_file_mkdir(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }
    fs::write(&path, contents).map_err(|e| format!("failed to write {path}: {e}"))
}

/// Write bytes (a .docx package) to disk.
#[tauri::command]
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| format!("failed to write {path}: {e}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| format!("failed to write {path}: {e}"))
}

fn config_dir(app: &AppHandle<Wry>) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve app config dir: {e}"))
}

/// Rebuild the app menu and replace it. (Menu-item label updates via
/// `menu.get(...)` proved unreliable for submenu titles on macOS, so we
/// rebuild and re-set the whole menu.) Checkmarks are carried over — a
/// rebuild must not reset view/watch state.
fn rebuild_menu(app: &AppHandle<Wry>) {
    const CHECK_IDS: [&str; 13] = [
        "view.focus-mode",
        "view.typewriter-mode",
        "view.review-mode",
        "view.panel",
        "view.authorship",
        "view.float-on-top",
        "file.watch",
        "view.telemetry",
        "view.theme-paper",
        "view.theme-manuscript",
        "view.theme-newsprint",
        "view.theme-night",
        "view.theme-slate",
    ];
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
    if let Ok(menu) = build_menu(app) {
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
    review: bool,
    panel: bool,
    authorship: bool,
    theme: String,
    floating: bool,
    watch: bool,
    telemetry: bool,
) {
    let Some(menu) = app.menu() else { return };
    let checks = [
        ("view.focus-mode", focus),
        ("view.typewriter-mode", typewriter),
        ("view.review-mode", review),
        ("view.panel", panel),
        ("view.authorship", authorship),
        ("view.float-on-top", floating),
        ("file.watch", watch),
        ("view.telemetry", telemetry),
        ("view.theme-paper", theme == "paper"),
        ("view.theme-manuscript", theme == "manuscript"),
        ("view.theme-newsprint", theme == "newsprint"),
        ("view.theme-night", theme == "night"),
        ("view.theme-slate", theme == "slate"),
    ];
    let Ok(items) = menu.items() else { return };
    for (id, checked) in checks {
        if let Some(item) = find_check_item(items.clone(), id) {
            let _ = item.set_checked(checked);
        }
    }
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
fn build_menu(app: &AppHandle<Wry>) -> tauri::Result<Menu<Wry>> {

    let app_menu = SubmenuBuilder::new(app, "Folio")
        .item(&menu_item(app, "app.settings", "Settings…", Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&menu_item(
            app,
            "app.check-updates",
            "Check for Updates…",
            None,
        )?)
        .item(&menu_item(
            app,
            "app.install-cli",
            "Install Command Line Tool…",
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
        .item(&menu_item(app, "file.quick-open", "Quick Open…", Some("CmdOrCtrl+P"))?)
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
            "file.approve-review",
            "Approve Review",
            Some("Shift+CmdOrCtrl+R"),
        )?)
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
            &SubmenuBuilder::with_id(app, "file.export", "Export")
                .item(&menu_item(
                    app,
                    "file.export-html",
                    "HTML…",
                    Some("CmdOrCtrl+E"),
                )?)
                .item(&menu_item(app, "file.export-pdf", "PDF…", None)?)
                .item(&menu_item(app, "file.export-docx", "Word…", None)?)
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
    // ⌘W is ours: it closes the active tab, or the window with one tab left.
    let file_menu = file_builder
        .separator()
        .item(&menu_item(app, "file.close", "Close Tab", Some("CmdOrCtrl+W"))?)
        .build()?;

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
        .item(&check_item(
            app,
            "view.review-mode",
            "Review Mode",
            Some("CmdOrCtrl+Shift+R"),
            false,
        )?)
        .item(&check_item(
            app,
            "view.panel",
            "Reading Panel",
            Some("CmdOrCtrl+Shift+O"),
            false,
        )?)
        .item(&check_item(
            app,
            "view.authorship",
            "Authorship",
            Some("CmdOrCtrl+Shift+A"),
            false,
        )?)
        .separator()
        .item(&menu_item(app, "view.next-tab", "Next Tab", Some("Ctrl+Tab"))?)
        .item(&menu_item(app, "view.prev-tab", "Previous Tab", Some("Ctrl+Shift+Tab"))?)
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
                .item(&check_item(app, "view.theme-manuscript", "Manuscript", None, false)?)
                .item(&check_item(app, "view.theme-newsprint", "Newsprint", None, false)?)
                .separator()
                .item(&check_item(app, "view.theme-night", "Night", None, false)?)
                .item(&check_item(app, "view.theme-slate", "Slate", None, false)?)
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
    .map_err(|e| e.to_string())?;
    if state == reviewgate::ReviewState::Changes {
        reviewgate::mark_changes_requested_in(&reviewgate::review_dir(), &path, &feedback);
    }
    Ok(())
}

/// The Feedback text for the current annotations — the same bytes the
/// app writes to `<doc>.feedback.md` and hands to the gate.
#[tauri::command]
fn build_feedback(
    file_name: String,
    annotations: Vec<Annotation>,
    source: Option<String>,
    document_edited: bool,
) -> String {
    let home = folio_core::settings::load().home();
    let instructions = folio_core::prompts::feedback_instructions(home.as_deref());
    folio_core::feedback::build(
        &file_name,
        &annotations,
        source.as_deref(),
        document_edited,
        instructions.as_deref(),
    )
}

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

/// Where the `folio` command ended up, and what the new link displaced
/// there — `None` when nothing was in the way, or when the link already
/// pointed at this build.
#[cfg(unix)]
#[derive(Debug, PartialEq, Eq)]
struct Installed {
    link: std::path::PathBuf,
    replaced: Option<String>,
}

/// Link `cli` as `folio` in the first of `targets` that will take it.
///
/// Idempotent: a symlink already pointing at `cli` is left untouched and
/// reported as having replaced nothing. Anything else in the way — a
/// symlink somewhere else, or a regular file such as a hand-written shim —
/// is removed and described, so the caller can say what it displaced. A
/// directory is never removed; that target is skipped instead. Any failure
/// at one target moves on to the next, and only an empty run is an error.
#[cfg(unix)]
fn install_link(
    cli: &std::path::Path,
    targets: &[std::path::PathBuf],
) -> Result<Installed, String> {
    for target in targets {
        if fs::create_dir_all(target).is_err() {
            continue;
        }
        let link = target.join("folio");
        let mut replaced = None;
        match fs::symlink_metadata(&link) {
            Ok(meta) if meta.file_type().is_symlink() => {
                let old = fs::read_link(&link).unwrap_or_default();
                if old.as_path() == cli {
                    return Ok(Installed { link, replaced: None });
                }
                if fs::remove_file(&link).is_err() {
                    continue;
                }
                replaced = Some(format!("symlink → {}", old.display()));
            }
            Ok(meta) if meta.is_file() => {
                if fs::remove_file(&link).is_err() {
                    continue;
                }
                replaced = Some("file".to_string());
            }
            // A directory (or anything else) is not ours to delete.
            Ok(_) => continue,
            // Nothing there: the common case.
            Err(_) => {}
        }
        if std::os::unix::fs::symlink(cli, &link).is_ok() {
            return Ok(Installed { link, replaced });
        }
    }
    let names: Vec<String> = targets.iter().map(|t| t.display().to_string()).collect();
    Err(format!("Could not write to {}.", names.join(" or ")))
}

/// Folio → Install Command Line Tool: symlink the bundled `folio` command
/// into /usr/local/bin, or ~/.local/bin when that is not writable. On
/// Windows there is no conventional link target, so it names the folder.
#[tauri::command]
fn install_cli_tool() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("no app directory")?;
    let cli = dir.join(if cfg!(windows) { "folio.exe" } else { "folio" });
    if !cli.is_file() {
        return Err(format!(
            "This build has no command line tool ({}).",
            cli.display()
        ));
    }
    #[cfg(windows)]
    {
        Ok(format!(
            "Add this folder to your PATH to use `folio` from a terminal:\n{}",
            dir.display()
        ))
    }
    #[cfg(unix)]
    {
        // ~/.local/bin only when there is a home to hang it off; a missing
        // HOME narrows the search rather than failing the whole command.
        let mut targets = vec![std::path::PathBuf::from("/usr/local/bin")];
        if let Some(home) = std::env::var_os("HOME") {
            targets.push(std::path::PathBuf::from(home).join(".local").join("bin"));
        }
        // A failed link still has to leave the person somewhere to go, the
        // way the Windows arm does: name the folder the command sits in.
        let installed = install_link(&cli, &targets).map_err(|e| {
            format!(
                "{e} Add {} to your PATH and run `folio` from there.",
                cli.parent().unwrap_or(dir).display()
            )
        })?;
        let mut msg = format!("Installed {}.", installed.link.display());
        if let Some(replaced) = &installed.replaced {
            msg.push_str(&format!(" Replaced the existing {replaced}."));
        }
        if let Some(bin) = installed.link.parent() {
            msg.push_str(&format!(
                "\nIf `folio` is not found in a new terminal, add {} to your PATH.",
                bin.display()
            ));
        }
        Ok(msg)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Resolved before the builder runs: a second invocation gets this far
    // before tauri-plugin-single-instance sends it away, which is what lets
    // it resolve piped stdin into a real path the primary can open.
    // `folio skill …` installs or prints the bundled agent skill and exits;
    // it never becomes the app.
    let argv: Vec<String> = std::env::args().collect();
    if let Some(cmd) = skillcli::parse(&argv) {
        std::process::exit(skillcli::run(&cmd));
    }

    let cli = cliargs::parse(std::env::args());

    // `--wait` / `--collect` never become the app: they branch out here,
    // before the Tauri builder, so the review CLI is a plain blocking poller
    // and never contends with the single-instance plugin.
    if cli.gate.wait || cli.gate.collect {
        std::process::exit(reviewgate::run_cli(
            &cli.paths,
            cli.gate.wait,
            &cli.gate.agent,
            cli.gate.timeout_secs,
            &spawn_review_window,
        ));
    }

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
        .menu(build_menu)
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
            write_binary_file,
            write_text_file_mkdir,
            lenses::set_llm_key,
            lenses::has_llm_key,
            lenses::run_lens,
            lenses::list_custom_lenses,
            lenses::lenses_folder,
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
            list_revision_contents,
            list_project_markdown,
            list_revisions,
            read_revision,
            register_default_markdown_handler,
            review_request_state,
            resolve_review,
            build_feedback,
            append_reading,
            install_cli_tool,
            settingscmd::get_settings,
            settingscmd::set_settings,
            settingscmd::home_dir,
            settingscmd::change_home_dir,
            settingscmd::prompt_status,
            settingscmd::lens_rules,
            settingscmd::ensure_prompt_file,
            settingscmd::delete_prompt_file,
            settingscmd::skill_status,
            settingscmd::skill_text,
            settingscmd::install_skill,
            settingscmd::cli_status
        ])
        .setup(move |app| {
            // Reaching setup proves we are the primary instance, so our own
            // spool entry will never be needed for a handoff.
            if let Some(path) = &own_spool {
                let _ = fs::remove_file(path);
            }
            // Handshakes left by invocations that died must not resurrect a
            // review bar days later.
            reviewgate::sweep_stale_in(&reviewgate::review_dir(), reviewgate::STALE_SECS);
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
                ..Default::default()
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
            ..Default::default()
        };
        let other = CliOptions {
            paths: vec!["/theirs.md".to_string()],
            float: true,
            ..Default::default()
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
                ..Default::default()
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
    fn quick_open_lists_markdown_under_the_project_root() {
        let root = history_test_dir("quick-open");
        fs::create_dir_all(root.join("docs")).unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join("README.md"), "# r").unwrap();
        fs::write(root.join("docs/plan.markdown"), "# p").unwrap();
        fs::write(root.join("docs/notes.txt"), "x").unwrap();
        fs::write(root.join("node_modules/pkg/README.md"), "# no").unwrap();
        fs::write(root.join("docs/plan.markdown.feedback.md"), "# fb").unwrap();
        let found = project_root_for(&root.join("docs/plan.markdown"));
        assert_eq!(found, root);
        let mut files = Vec::new();
        walk_markdown(&root, &root, &mut files);
        assert_eq!(files, vec!["README.md", "docs/plan.markdown"]);
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

    #[test]
    fn gate_flags_are_absent_from_a_plain_invocation() {
        let md = temp_file("args-plain", "md");
        let cli = cliargs::parse(
            ["folio".to_string(), md.to_string_lossy().into_owned()].into_iter(),
        );
        assert!(!cli.gate.wait);
        assert!(!cli.gate.collect);
    }

    #[test]
    fn gate_options_do_not_travel_through_the_spool() {
        let md = temp_file("args-spool", "md");
        let mut cli = cliargs::parse(
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

    // ——— install_link ———
    //
    // Every case runs against a scratch directory: these tests must never
    // reach /usr/local/bin or ~/.local/bin.

    /// A fresh scratch root holding a stand-in for the bundled `folio`.
    #[cfg(unix)]
    fn cli_fixture(name: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        let root = std::env::temp_dir()
            .join(format!("folio-test-cli-{name}-{}", std::process::id()));
        fs::remove_dir_all(&root).ok();
        fs::create_dir_all(root.join("app")).unwrap();
        let cli = root.join("app").join("folio");
        fs::write(&cli, "#!/bin/sh\n").unwrap();
        (root, cli)
    }

    #[cfg(unix)]
    #[test]
    fn install_link_creates_the_symlink() {
        let (root, cli) = cli_fixture("fresh");
        let bin = root.join("bin");

        let installed = install_link(&cli, &[bin.clone()]).unwrap();

        assert_eq!(installed.link, bin.join("folio"));
        assert_eq!(installed.replaced, None);
        assert_eq!(fs::read_link(&installed.link).unwrap(), cli);
        fs::remove_dir_all(&root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn install_link_is_a_no_op_the_second_time() {
        let (root, cli) = cli_fixture("idempotent");
        let bin = root.join("bin");
        let first = install_link(&cli, &[bin.clone()]).unwrap();

        let again = install_link(&cli, &[bin.clone()]).unwrap();

        assert_eq!(again.link, first.link);
        assert_eq!(again.replaced, None, "an existing link of ours replaces nothing");
        assert_eq!(fs::read_link(&again.link).unwrap(), cli);
        fs::remove_dir_all(&root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn install_link_replaces_a_regular_file_and_says_so() {
        let (root, cli) = cli_fixture("shim");
        let bin = root.join("bin");
        fs::create_dir_all(&bin).unwrap();
        // The hand-written shim the README used to tell people to make.
        fs::write(bin.join("folio"), "#!/bin/sh\nexec /Applications/Folio.app…\n").unwrap();

        let installed = install_link(&cli, &[bin.clone()]).unwrap();

        assert_eq!(installed.replaced, Some("file".to_string()));
        assert_eq!(fs::read_link(&installed.link).unwrap(), cli);
        fs::remove_dir_all(&root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn install_link_replaces_a_symlink_elsewhere_and_names_its_target() {
        let (root, cli) = cli_fixture("relink");
        let bin = root.join("bin");
        fs::create_dir_all(&bin).unwrap();
        let old = root.join("app").join("older-folio");
        fs::write(&old, "#!/bin/sh\n").unwrap();
        std::os::unix::fs::symlink(&old, bin.join("folio")).unwrap();

        let installed = install_link(&cli, &[bin.clone()]).unwrap();

        assert_eq!(
            installed.replaced,
            Some(format!("symlink → {}", old.display()))
        );
        assert_eq!(fs::read_link(&installed.link).unwrap(), cli);
        fs::remove_dir_all(&root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn install_link_skips_a_directory_and_uses_the_next_target() {
        let (root, cli) = cli_fixture("dir-in-the-way");
        let blocked = root.join("bin1");
        let fallback = root.join("bin2");
        fs::create_dir_all(blocked.join("folio")).unwrap();

        let installed = install_link(&cli, &[blocked.clone(), fallback.clone()]).unwrap();

        assert_eq!(installed.link, fallback.join("folio"));
        assert_eq!(installed.replaced, None);
        assert!(blocked.join("folio").is_dir(), "the directory is left alone");
        fs::remove_dir_all(&root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn install_link_reports_when_no_target_can_be_written() {
        let (root, cli) = cli_fixture("unwritable");
        // A regular file where a parent directory would have to go, so
        // create_dir_all cannot succeed for either candidate.
        fs::write(root.join("wall"), "not a directory").unwrap();
        let one = root.join("wall").join("bin");
        let two = root.join("wall").join("other");

        let err = install_link(&cli, &[one.clone(), two.clone()]).unwrap_err();

        assert!(err.contains(&one.display().to_string()), "{err}");
        assert!(err.contains(&two.display().to_string()), "{err}");
        fs::remove_dir_all(&root).ok();
    }
}
