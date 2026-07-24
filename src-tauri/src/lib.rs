use std::fs;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
