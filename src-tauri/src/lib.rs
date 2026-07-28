use std::fs;
use std::sync::Mutex;

use tauri::menu::{
    AboutMetadata, CheckMenuItem, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem,
    MenuItemBuilder, MenuItemKind, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime, Wry};

pub mod license;

/// File extensions Folio opens; mirrors `fileAssociations` in tauri.conf.json.
const MARKDOWN_EXTS: [&str; 4] = ["md", "markdown", "mdown", "mkd"];

/// Paths handed to us by the OS before the webview is ready to receive
/// "file-open" events (cold start via Finder double-click or CLI argument).
/// The frontend drains this queue on startup.
#[derive(Default)]
struct PendingOpens(Mutex<Vec<String>>);

/// `--float` was passed on the command line: the frontend asks once on
/// startup and switches the window into floating review mode.
#[derive(Default)]
struct FloatRequested(Mutex<bool>);

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
/// floating review window was requested.
#[derive(Default)]
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

/// Drain the queue of paths the OS asked us to open before the webview was
/// listening. Called once by the frontend on startup.
#[tauri::command]
fn take_pending_open_paths(state: tauri::State<PendingOpens>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

/// Whether `--float` was passed on the command line. Called once by the
/// frontend on startup; the flag is cleared by reading it.
#[tauri::command]
fn take_float_mode(state: tauri::State<FloatRequested>) -> bool {
    std::mem::take(&mut *state.0.lock().unwrap())
}

/// Toggle the floating review chrome: always-on-top while floating; when
/// entering, park the window at the monitor's top-right at a compact review
/// size (the size is left alone when leaving — the user can resize freely
/// either way).
#[tauri::command]
fn set_window_floating(app: AppHandle<Wry>, floating: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
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

/// Best effort: if AeroSpace (macOS tiling WM) is managing this window, ask
/// it to float/retile the window. Silent no-op when the CLI is absent.
#[cfg(target_os = "macos")]
fn aerospace_layout(floating: bool) {
    let pid = std::process::id().to_string();
    let Ok(out) = std::process::Command::new("aerospace")
        .args([
            "list-windows",
            "--pid",
            &pid,
            "--monitor",
            "all",
            "--format",
            "%{window-id}",
        ])
        .output()
    else {
        return;
    };
    if !out.status.success() {
        return;
    }
    let id = String::from_utf8_lossy(&out.stdout).trim().to_owned();
    if id.is_empty() {
        return;
    }
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
    const CHECK_IDS: [&str; 7] = [
        "view.focus-mode",
        "view.typewriter-mode",
        "view.float-on-top",
        "file.watch",
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

/// Open the native print panel (macOS: includes Save as PDF).
#[tauri::command]
fn print_document(app: AppHandle<Wry>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
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
) {
    let Some(menu) = app.menu() else { return };
    let checks = [
        ("view.focus-mode", focus),
        ("view.typewriter-mode", typewriter),
        ("view.float-on-top", floating),
        ("file.watch", watch),
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
    // Managed before build: on a macOS cold start the Opened event can fire
    // before setup runs, and a state registered only in setup would be too
    // late to catch it. Seeded with CLI args (Windows/Linux file-open).
    let cli = parse_cli_args(std::env::args());
    let pending = PendingOpens::default();
    *pending.0.lock().unwrap() = cli.paths;
    let float_requested = FloatRequested::default();
    *float_requested.0.lock().unwrap() = cli.float;

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(pending)
        .manage(float_requested)
        .manage(RecentFiles::default())
        .manage(RevisionMenu::default())
        .menu(|app| build_menu(app, false))
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            // Only our dotted custom ids need frontend handling; predefined
            // items (undo, copy, fullscreen, …) already acted natively.
            let is_custom = ["app.", "file.", "edit.", "paragraph.", "format.", "view."]
                .iter()
                .any(|prefix| id.starts_with(prefix));
            if is_custom {
                let _ = app.emit("menu", id);
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
            take_pending_open_paths,
            take_float_mode,
            set_window_floating,
            set_recent_files,
            set_revision_menu,
            archive_revision,
            list_revisions,
            read_revision,
            register_default_markdown_handler
        ])
        .setup(|app| {
            // Now the path resolver is managed; rebuild the menu with the
            // persisted license state so Pro labels are correct.
            rebuild_menu(app.handle());
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
    // that launched the app. Queue every path (the webview may not exist
    // yet) and also emit for an already-running frontend.
    if let RunEvent::Opened { urls } = event {
        for url in urls {
            let Ok(path) = url.to_file_path() else { continue };
            let path = path.to_string_lossy().into_owned();
            if let Some(state) = app.try_state::<PendingOpens>() {
                state.0.lock().unwrap().push(path.clone());
            }
            let _ = app.emit("file-open", path);
        }
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
}
