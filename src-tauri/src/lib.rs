use std::fs;

use tauri::menu::{
    AboutMetadata, Menu, MenuBuilder, MenuItem, MenuItemBuilder, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Runtime, Wry};

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

/// The native application menu (Typora-flavored). Custom items carry
/// dotted ids ("paragraph.heading-1", …) that `on_menu_event` forwards
/// to the webview as `menu` events; predefined items act natively.
fn build_menu(app: &AppHandle<Wry>) -> tauri::Result<Menu<Wry>> {
    let app_menu = SubmenuBuilder::new(app, "mdrer")
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
        .menu(build_menu)
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            // Only our dotted custom ids need frontend handling; predefined
            // items (undo, copy, fullscreen, …) already acted natively.
            let is_custom = ["file.", "paragraph.", "format.", "view."]
                .iter()
                .any(|prefix| id.starts_with(prefix));
            if is_custom {
                let _ = app.emit("menu", id);
            }
        })
        .invoke_handler(tauri::generate_handler![read_text_file, write_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("mdrer-test-{name}-{}", std::process::id()))
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
