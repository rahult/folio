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

/// The lens folder inside a Home folder.
pub fn dir_for(home: &Path) -> PathBuf {
    home.join("lenses")
}

/// Custom lenses in `dir`, sorted by file stem. Missing folder: none.
pub fn list_custom_in(dir: &Path) -> Vec<LensFile> {
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
