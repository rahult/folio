//! Settings: Folio's defaults in one file the app and the `folio` command
//! both read — `<config dir>/com.rahult.folio/settings.json`. Every field
//! has a default so a file from any earlier version loads, and loading never
//! fails the caller: a missing or unreadable file is the defaults. Modes and
//! history (zoom, focus, panel state, recent files) are not here.

use serde::{Deserialize, Serialize};
use std::ops::RangeInclusive;
use std::path::{Path, PathBuf};

pub const APP_ID: &str = "com.rahult.folio";
const FILE_NAME: &str = "settings.json";

/// The gate timeout the page offers and the file may hold, inclusive at
/// both ends. One definition, so the app's validation and the command
/// line's clamp cannot drift apart.
pub const TIMEOUT_SECS: RangeInclusive<u64> = 60..=540;

/// Every theme the app knows; anything else normalises back to "paper".
pub const THEMES: [&str; 5] = ["paper", "manuscript", "newsprint", "night", "slate"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// None → `~/Documents/Folio`.
    pub home_dir: Option<PathBuf>,
    pub theme: String,
    pub live_reload: bool,
    /// None = the person has not been asked.
    pub telemetry: Option<bool>,
    pub check_updates: bool,
    pub review: ReviewSettings,
    pub lens: LensSettings,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct ReviewSettings {
    pub float: bool,
    pub agent: String,
    pub timeout_secs: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct LensSettings {
    pub base_url: String,
    pub model: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            home_dir: None,
            theme: "paper".to_string(),
            live_reload: true,
            telemetry: None,
            check_updates: true,
            review: ReviewSettings::default(),
            lens: LensSettings::default(),
        }
    }
}

impl Default for ReviewSettings {
    fn default() -> Self {
        Self { float: true, agent: "agent".to_string(), timeout_secs: crate::gate::DEFAULT_TIMEOUT_SECS }
    }
}

impl Default for LensSettings {
    fn default() -> Self {
        Self { base_url: String::new(), model: String::new() }
    }
}

impl Settings {
    /// The Home folder: the configured one, else `~/Documents/Folio`.
    pub fn home(&self) -> Option<PathBuf> {
        self.home_dir.clone().or_else(default_home)
    }

    /// A file edited by hand can hold values the page would refuse, and a
    /// corrupt timeout or theme must not reach the gate, the skill, or the
    /// window. Every reader gets the bent-back values; the page's own
    /// validation still refuses them on the way in, so an error only ever
    /// names something the user just typed.
    pub fn normalized(mut self) -> Settings {
        if !THEMES.contains(&self.theme.as_str()) {
            self.theme = "paper".to_string();
        }
        self.review.timeout_secs = self.review.timeout_secs.clamp(*TIMEOUT_SECS.start(), *TIMEOUT_SECS.end());
        self.review.agent = self.review.agent.trim().to_string();
        if self.review.agent.is_empty() {
            self.review.agent = "agent".to_string();
        }
        self.lens.base_url = self.lens.base_url.trim().to_string();
        self.lens.model = self.lens.model.trim().to_string();
        self
    }
}

/// `~/Documents/Folio`: the platform Documents folder, else `$HOME/Documents`.
/// Where Folio keeps the files a person may edit.
pub fn default_home() -> Option<PathBuf> {
    dirs::document_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Documents")))
        .map(|d| d.join("Folio"))
}

/// The same directory Tauri's `app_config_dir()` resolves for this app.
pub fn config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join(APP_ID))
}

pub fn path() -> Option<PathBuf> {
    config_dir().map(|d| d.join(FILE_NAME))
}

/// Every reader's entry point: the file, bent back into range. `load_from`
/// stays raw so "a corrupt file is the defaults" keeps its own meaning.
pub fn load() -> Settings {
    path().map(|p| load_from(&p)).unwrap_or_default().normalized()
}

pub fn save(settings: &Settings) -> Result<(), String> {
    let p = path().ok_or("no config directory")?;
    save_to(&p, settings)
}

/// Defaults when the file is missing or unreadable; unknown fields are
/// ignored and missing ones take their defaults.
pub fn load_from(path: &Path) -> Settings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// The scratch file `save_to` renames from. The process id keeps two
/// writers from sharing it.
fn tmp_path(path: &Path) -> PathBuf {
    path.with_extension(format!("json.{}.tmp", std::process::id()))
}

/// Atomic: write `settings.json.<pid>.tmp`, then rename over the target.
pub fn save_to(path: &Path, settings: &Settings) -> Result<(), String> {
    let dir = path.parent().ok_or("settings path has no parent")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = tmp_path(path);
    std::fs::write(&tmp, json).map_err(|e| format!("could not write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("could not replace {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("folio-settings-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join(FILE_NAME)
    }

    #[test]
    fn defaults_match_the_spec() {
        let s = Settings::default();
        assert_eq!(s.home_dir, None);
        assert_eq!(s.theme, "paper");
        assert!(s.live_reload);
        assert_eq!(s.telemetry, None);
        assert!(s.check_updates);
        assert!(s.review.float);
        assert_eq!(s.review.agent, "agent");
        assert_eq!(s.review.timeout_secs, 540);
        assert_eq!(s.lens.base_url, "");
        assert_eq!(s.lens.model, "");
    }

    #[test]
    fn round_trips_through_the_file() {
        let p = temp_file("roundtrip");
        let mut s = Settings::default();
        s.theme = "night".into();
        s.home_dir = Some(PathBuf::from("/tmp/folio-home"));
        s.review.agent = "claude".into();
        s.lens.model = "llama3.2:3b".into();
        save_to(&p, &s).unwrap();
        assert_eq!(load_from(&p), s);
        assert!(!tmp_path(&p).exists(), "temp file renamed away");
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
    }

    #[test]
    fn a_missing_or_corrupt_file_loads_as_defaults() {
        assert_eq!(load_from(Path::new("/nonexistent/settings.json")), Settings::default());
        let p = temp_file("corrupt");
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, "{ not json").unwrap();
        assert_eq!(load_from(&p), Settings::default());
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
    }

    #[test]
    fn an_older_file_with_missing_fields_takes_defaults_for_them() {
        let p = temp_file("older");
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, r#"{"theme":"slate","review":{"agent":"codex"},"unknownField":1}"#).unwrap();
        let s = load_from(&p);
        assert_eq!(s.theme, "slate");
        assert_eq!(s.review.agent, "codex");
        assert_eq!(s.review.timeout_secs, 540);
        assert!(s.live_reload);
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
    }

    #[test]
    fn json_uses_camel_case_field_names() {
        let json = serde_json::to_string(&Settings::default()).unwrap();
        assert!(json.contains("\"homeDir\":null"));
        assert!(json.contains("\"liveReload\":true"));
        assert!(json.contains("\"timeoutSecs\":540"));
        assert!(json.contains("\"baseUrl\":\"\""));
    }

    #[test]
    fn home_falls_back_to_documents_folio() {
        // A machine with neither a Documents folder nor a home directory has
        // no default; when there is one it is the Folio folder inside it.
        if let Some(home) = Settings::default().home() {
            assert!(home.ends_with("Folio"), "{} ends with Folio", home.display());
        }
        let mut custom = Settings::default();
        custom.home_dir = Some(PathBuf::from("/x/y"));
        assert_eq!(custom.home(), Some(PathBuf::from("/x/y")));
    }

    #[test]
    fn the_lens_folder_sits_inside_the_default_home() {
        assert_eq!(crate::lenses::default_dir(), default_home().map(|h| h.join("lenses")));
    }

    #[test]
    fn normalized_bends_a_hand_edited_file_back_into_range() {
        let mut s = Settings::default();
        s.theme = "neon".into();
        s.review.timeout_secs = 9999;
        s.review.agent = "  ".into();
        s.lens.base_url = "  http://localhost:11434/v1  ".into();
        s.lens.model = " llama3.2:3b ".into();
        let n = s.normalized();
        assert_eq!(n.theme, "paper");
        assert_eq!(n.review.timeout_secs, 540);
        assert_eq!(n.review.agent, "agent");
        assert_eq!(n.lens.base_url, "http://localhost:11434/v1");
        assert_eq!(n.lens.model, "llama3.2:3b");

        let mut low = Settings::default();
        low.review.timeout_secs = 1;
        assert_eq!(low.normalized().review.timeout_secs, 60);
        // A theme the app knows, and a timeout already in range, are left be.
        for theme in THEMES {
            let mut s = Settings::default();
            s.theme = theme.to_string();
            s.review.timeout_secs = 300;
            let n = s.normalized();
            assert_eq!(n.theme, theme);
            assert_eq!(n.review.timeout_secs, 300);
        }
    }

    #[test]
    fn config_dir_ends_with_the_app_id() {
        if let Some(dir) = config_dir() {
            assert!(dir.ends_with(APP_ID), "{} ends with {APP_ID}", dir.display());
        }
        if let Some(p) = path() {
            assert!(p.ends_with("com.rahult.folio/settings.json"), "{}", p.display());
        }
    }
}
