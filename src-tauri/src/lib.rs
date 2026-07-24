use std::fs;

use tauri::menu::{
    AboutMetadata, CheckMenuItem, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem,
    MenuItemBuilder, MenuItemKind, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Runtime, Wry};

pub mod license;

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
fn refresh_menu_license(app: &AppHandle<Wry>) {
    let licensed = is_licensed(app);
    if let Ok(menu) = build_menu(app, licensed) {
        let _ = app.set_menu(menu);
    }
}

/// Open the native print panel (macOS: includes Save as PDF).
#[tauri::command]
fn print_document(app: AppHandle<Wry>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.print().map_err(|e| e.to_string())
}

/// The frontend owns view-mode state (gating decides what actually
/// changed); it pushes the truth back so checkmarks never drift.
#[tauri::command]
fn sync_menu_state(app: AppHandle<Wry>, focus: bool, typewriter: bool, theme: String) {
    let Some(menu) = app.menu() else { return };
    let checks = [
        ("view.focus-mode", focus),
        ("view.typewriter-mode", typewriter),
        ("view.theme-paper", theme == "paper"),
        ("view.theme-night", theme == "night"),
        ("view.theme-newsprint", theme == "newsprint"),
    ];
    for (id, checked) in checks {
        if let Some(MenuItemKind::Check(item)) = menu.get(id) {
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
    refresh_menu_license(&app);
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
    refresh_menu_license(&app);
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

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&menu_item(app, "file.new", "New", Some("CmdOrCtrl+N"))?)
        .item(&menu_item(app, "file.open", "Open…", Some("CmdOrCtrl+O"))?)
        .separator()
        .item(&menu_item(app, "file.save", "Save", Some("CmdOrCtrl+S"))?)
        .item(&menu_item(
            app,
            "file.save-as",
            "Save As…",
            Some("Shift+CmdOrCtrl+S"),
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
        )
        .separator()
        .close_window()
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .menu(|app| build_menu(app, false))
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            // Only our dotted custom ids need frontend handling; predefined
            // items (undo, copy, fullscreen, …) already acted natively.
            let is_custom = ["app.", "file.", "paragraph.", "format.", "view."]
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
            sync_menu_state
        ])
        .setup(|app| {
            // Now the path resolver is managed; rebuild the menu with the
            // persisted license state so Pro labels are correct.
            refresh_menu_license(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

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
}
