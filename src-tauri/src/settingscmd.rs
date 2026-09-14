//! Settings commands: the settings file, the Home folder and its move, the
//! four editable prompt files, and install status for the skill and the
//! command line tool. Everything here is a thin door onto folio-core.

use folio_core::settings::{self, Settings};
use folio_core::{prompts, skill};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const THEMES: [&str; 5] = ["paper", "manuscript", "newsprint", "night", "slate"];

fn validate(mut s: Settings) -> Result<Settings, String> {
    if !THEMES.contains(&s.theme.as_str()) {
        return Err(format!("unknown theme: {}", s.theme));
    }
    if !(60..=540).contains(&s.review.timeout_secs) {
        return Err("the gate timeout must be between 60 and 540 seconds".to_string());
    }
    s.review.agent = s.review.agent.trim().to_string();
    if s.review.agent.is_empty() {
        s.review.agent = "agent".to_string();
    }
    s.lens.base_url = s.lens.base_url.trim().to_string();
    s.lens.model = s.lens.model.trim().to_string();
    Ok(s)
}

#[tauri::command]
pub fn get_settings() -> Settings {
    settings::load()
}

#[tauri::command]
pub fn set_settings(settings: Settings) -> Result<Settings, String> {
    let s = validate(settings)?;
    settings::save(&s)?;
    Ok(s)
}

fn home() -> Result<PathBuf, String> {
    settings::load().home().ok_or_else(|| "no documents folder on this machine".to_string())
}

#[tauri::command]
pub fn home_dir() -> Result<String, String> {
    Ok(home()?.to_string_lossy().into_owned())
}

/// The entries the Home folder is known to hold; moved together.
const KNOWN: [&str; 5] = ["decisions.md", "lenses", "lens-rules.md", "feedback-instructions.md", "skill"];

/// A destination inside the current Home folder would have the move copy a
/// directory into itself, so it is refused before anything is touched.
/// Pure over paths so it is testable without settings.
pub fn check_destination(from: &Path, to: &Path) -> Result<(), String> {
    if to != from && to.starts_with(from) {
        return Err("choose a folder outside the current Home folder".to_string());
    }
    Ok(())
}

/// A failure part-way through the move: say what had already been moved, so
/// the message never implies the two folders are untouched.
fn partial(e: impl std::fmt::Display, moved: &[String]) -> String {
    if moved.is_empty() {
        format!("{e}; nothing was moved")
    } else {
        format!("{e}; already moved: {}", moved.join(", "))
    }
}

/// Move the known entries from `from` to `to`. Refuses a destination inside
/// `from`, and refuses when any of the entries already exists in `to`;
/// otherwise renames, or copies and deletes across volumes. A failure
/// part-way through names what had already moved. Pure over paths so it is
/// testable.
pub fn move_home(from: &Path, to: &Path) -> Result<Vec<String>, String> {
    check_destination(from, to)?;
    fs::create_dir_all(to).map_err(|e| format!("could not create {}: {e}", to.display()))?;
    let conflicts: Vec<&str> = KNOWN.iter().copied().filter(|n| to.join(n).exists() && from.join(n).exists()).collect();
    if !conflicts.is_empty() {
        return Err(format!(
            "{} already has {}; move or remove it first, nothing was changed",
            to.display(),
            conflicts.join(", ")
        ));
    }
    let mut moved: Vec<String> = Vec::new();
    for name in KNOWN {
        let src = from.join(name);
        if !src.exists() {
            continue;
        }
        let dst = to.join(name);
        if fs::rename(&src, &dst).is_err() {
            copy_recursive(&src, &dst).map_err(|e| partial(e, &moved))?;
            if src.is_dir() {
                fs::remove_dir_all(&src).map_err(|e| partial(e, &moved))?;
            } else {
                fs::remove_file(&src).map_err(|e| partial(e, &moved))?;
            }
        }
        moved.push(name.to_string());
    }
    Ok(moved)
}

fn copy_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ()).map_err(|e| format!("could not copy {}: {e}", src.display()))
    }
}

#[tauri::command]
pub fn change_home_dir(dir: String) -> Result<Settings, String> {
    let to = PathBuf::from(dir.trim());
    if !to.is_absolute() {
        return Err("choose a full path".to_string());
    }
    let current = settings::load();
    let from = current.home().ok_or("no current home folder")?;
    check_destination(&from, &to)?;
    fs::create_dir_all(&to).map_err(|e| format!("cannot use {}: {e}", to.display()))?;
    let probe = to.join(".folio-write-test");
    fs::write(&probe, b"").map_err(|e| format!("{} is not writable: {e}", to.display()))?;
    let _ = fs::remove_file(&probe);
    if from != to {
        move_home(&from, &to)?;
    }
    let mut next = current;
    next.home_dir = Some(to);
    settings::save(&next)?;
    Ok(next)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptStatus {
    pub lens_rules: bool,
    pub feedback_instructions: bool,
    pub skill: bool,
    pub lens_overrides: Vec<String>,
}

#[tauri::command]
pub fn prompt_status(builtin_ids: Vec<String>) -> Result<PromptStatus, String> {
    let h = home()?;
    Ok(PromptStatus {
        lens_rules: h.join(prompts::LENS_RULES_FILE).is_file(),
        feedback_instructions: h.join(prompts::FEEDBACK_INSTRUCTIONS_FILE).is_file(),
        skill: h.join(prompts::SKILL_OVERRIDE_FILE).is_file(),
        lens_overrides: builtin_ids.into_iter().filter(|id| prompts::override_path(&h, id).is_file()).collect(),
    })
}

fn prompt_path(home: &Path, kind: &str, id: Option<&str>) -> Result<PathBuf, String> {
    Ok(match kind {
        "lens-rules" => home.join(prompts::LENS_RULES_FILE),
        "feedback-instructions" => home.join(prompts::FEEDBACK_INSTRUCTIONS_FILE),
        "skill" => home.join(prompts::SKILL_OVERRIDE_FILE),
        "lens" => prompts::override_path(home, id.ok_or("a lens id is required")?),
        other => return Err(format!("unknown prompt kind: {other}")),
    })
}

/// Create the file from `initial` when it does not exist; return its path.
#[tauri::command]
pub fn ensure_prompt_file(kind: String, id: Option<String>, initial: String) -> Result<String, String> {
    let path = prompt_path(&home()?, &kind, id.as_deref())?;
    if !path.exists() {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
        }
        fs::write(&path, initial).map_err(|e| format!("could not write {}: {e}", path.display()))?;
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn delete_prompt_file(kind: String, id: Option<String>) -> Result<(), String> {
    let path = prompt_path(&home()?, &kind, id.as_deref())?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("could not remove {}: {e}", path.display())),
    }
}

fn user_root() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "no home directory".to_string())
}

/// The bundled skill text, for seeding an Override the user then edits.
#[tauri::command]
pub fn skill_text() -> String {
    skill::skill_text()
}

#[tauri::command]
pub fn skill_status() -> Result<Vec<skill::SkillStatus>, String> {
    let h = home()?;
    // The same rule `prompts::skill_text_for` applies: a blank Override is
    // no Override, so an empty SKILL.md never reads as Custom.
    let is_override = fs::read_to_string(h.join(prompts::SKILL_OVERRIDE_FILE))
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false);
    let text = prompts::skill_text_for(Some(&h));
    Ok(skill::status_in(&user_root()?, &text, is_override))
}

#[tauri::command]
pub fn install_skill(target: String) -> Result<String, String> {
    let t = match target.as_str() {
        "claude" => skill::Target::Claude,
        "agents" => skill::Target::Agents,
        other => return Err(format!("unknown skill target: {other}")),
    };
    let cmd = skill::SkillCommand { action: skill::SkillAction::Install, targets: vec![t], project: false };
    let text = prompts::skill_text_for(Some(&home()?));
    let written = skill::install_in_with_text(&cmd, &user_root()?, &text)?;
    Ok(written[0].to_string_lossy().into_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    pub link: Option<String>,
    pub target: Option<String>,
    pub ours: bool,
}

/// Where `folio` is linked from and to, judged against `sidecar` (this
/// app's bundled command). Pure over the candidate paths.
pub fn cli_status_in(candidates: &[PathBuf], sidecar: &Path) -> CliStatus {
    for link in candidates {
        let meta = match fs::symlink_metadata(link) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let target = if meta.file_type().is_symlink() { fs::read_link(link).unwrap_or_else(|_| link.clone()) } else { link.clone() };
        return CliStatus {
            link: Some(link.to_string_lossy().into_owned()),
            ours: target == sidecar,
            target: Some(target.to_string_lossy().into_owned()),
        };
    }
    CliStatus { link: None, target: None, ours: false }
}

#[tauri::command]
pub fn cli_status() -> Result<CliStatus, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let sidecar = exe.parent().ok_or("no app directory")?.join(if cfg!(windows) { "folio.exe" } else { "folio" });
    let mut candidates = vec![PathBuf::from("/usr/local/bin/folio")];
    if let Ok(root) = user_root() {
        candidates.push(root.join(".local").join("bin").join("folio"));
    }
    Ok(cli_status_in(&candidates, &sidecar))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("folio-settingscmd-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn move_home_moves_known_entries_and_leaves_others() {
        let root = scratch("move");
        let from = root.join("old");
        let to = root.join("new");
        fs::create_dir_all(from.join("lenses")).unwrap();
        fs::write(from.join("decisions.md"), "j").unwrap();
        fs::write(from.join("lenses").join("mine.md"), "l").unwrap();
        fs::write(from.join("unrelated.txt"), "x").unwrap();
        let moved = move_home(&from, &to).unwrap();
        assert_eq!(moved, vec!["decisions.md", "lenses"]);
        assert_eq!(fs::read_to_string(to.join("decisions.md")).unwrap(), "j");
        assert_eq!(fs::read_to_string(to.join("lenses").join("mine.md")).unwrap(), "l");
        assert!(!from.join("decisions.md").exists());
        assert!(from.join("unrelated.txt").exists());
    }

    #[test]
    fn move_home_refuses_when_the_target_already_has_a_known_entry() {
        let root = scratch("conflict");
        let from = root.join("old");
        let to = root.join("new");
        fs::create_dir_all(&from).unwrap();
        fs::create_dir_all(&to).unwrap();
        fs::write(from.join("decisions.md"), "old").unwrap();
        fs::write(to.join("decisions.md"), "new").unwrap();
        let err = move_home(&from, &to).unwrap_err();
        assert!(err.contains("decisions.md"));
        assert_eq!(fs::read_to_string(to.join("decisions.md")).unwrap(), "new");
        assert_eq!(fs::read_to_string(from.join("decisions.md")).unwrap(), "old");
    }

    #[test]
    fn validate_rejects_bad_theme_and_timeout_and_defaults_a_blank_agent() {
        let mut s = Settings::default();
        s.theme = "neon".into();
        assert!(validate(s.clone()).is_err());
        s.theme = "night".into();
        s.review.timeout_secs = 10;
        assert!(validate(s.clone()).is_err());
        // The gate timeout is inclusive at both ends.
        for secs in [60, 540] {
            s.review.timeout_secs = secs;
            assert!(validate(s.clone()).is_ok(), "{secs} seconds should be allowed");
        }
        for secs in [59, 541] {
            s.review.timeout_secs = secs;
            assert!(validate(s.clone()).is_err(), "{secs} seconds should be refused");
        }
        s.review.timeout_secs = 300;
        s.review.agent = "   ".into();
        assert_eq!(validate(s).unwrap().review.agent, "agent");
    }

    #[test]
    fn move_home_refuses_a_destination_inside_the_current_home() {
        let root = scratch("nested");
        let from = root.join("old");
        let to = from.join("lenses");
        fs::create_dir_all(&to).unwrap();
        fs::write(from.join("decisions.md"), "j").unwrap();
        let err = move_home(&from, &to).unwrap_err();
        assert!(err.contains("outside the current Home folder"), "{err}");
        assert_eq!(fs::read_to_string(from.join("decisions.md")).unwrap(), "j");
        assert!(!to.join("decisions.md").exists());
        assert!(check_destination(&from, &from).is_ok());
        assert!(check_destination(&from, &root.join("new")).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn move_home_names_what_it_already_moved_when_an_entry_fails() {
        let root = scratch("partial");
        let from = root.join("old");
        let to = root.join("new");
        fs::create_dir_all(from.join("lenses")).unwrap();
        fs::create_dir_all(&to).unwrap();
        fs::write(from.join("decisions.md"), "j").unwrap();
        fs::write(from.join("lenses").join("mine.md"), "l").unwrap();
        // A dangling symlink does not `exists()`, so the conflict check lets
        // the move start; neither the rename nor the copy can write over it.
        std::os::unix::fs::symlink(root.join("nowhere"), to.join("lenses")).unwrap();
        let err = move_home(&from, &to).unwrap_err();
        assert!(err.contains("already moved: decisions.md"), "{err}");
        assert_eq!(fs::read_to_string(to.join("decisions.md")).unwrap(), "j");
        assert_eq!(fs::read_to_string(from.join("lenses").join("mine.md")).unwrap(), "l");
    }

    #[cfg(unix)]
    #[test]
    fn cli_status_reads_the_first_link_and_knows_whether_it_is_ours() {
        let root = scratch("cli");
        let sidecar = root.join("Folio.app").join("folio");
        fs::create_dir_all(sidecar.parent().unwrap()).unwrap();
        fs::write(&sidecar, b"").unwrap();
        let a = root.join("a").join("folio");
        let b = root.join("b").join("folio");
        fs::create_dir_all(a.parent().unwrap()).unwrap();
        fs::create_dir_all(b.parent().unwrap()).unwrap();
        assert_eq!(cli_status_in(&[a.clone(), b.clone()], &sidecar).link, None);
        std::os::unix::fs::symlink(&sidecar, &b).unwrap();
        let s = cli_status_in(&[a.clone(), b.clone()], &sidecar);
        assert_eq!(s.link.as_deref(), Some(b.to_str().unwrap()));
        assert!(s.ours);
        fs::write(&a, "#!/bin/sh\n").unwrap();
        let s = cli_status_in(&[a.clone(), b], &sidecar);
        assert_eq!(s.link.as_deref(), Some(a.to_str().unwrap()));
        assert_eq!(s.target.as_deref(), Some(a.to_str().unwrap()));
        assert!(!s.ours);
    }
}
