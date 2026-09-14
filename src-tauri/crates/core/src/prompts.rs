//! The four texts a person may replace with a file in the Home folder:
//! the lens response rules, the standing feedback instructions, the skill
//! text, and any built-in lens. Resolution is file-then-built-in here so
//! the app and the `folio` command cannot disagree.

use std::path::{Path, PathBuf};

pub const BUILTIN_LENS_RULES: &str = include_str!("../../../../lenses/rules.md");
pub const LENS_RULES_FILE: &str = "lens-rules.md";
pub const FEEDBACK_INSTRUCTIONS_FILE: &str = "feedback-instructions.md";
pub const SKILL_OVERRIDE_FILE: &str = "skill/SKILL.md";

fn read_nonblank(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// The response rules: `<home>/lens-rules.md` when present and non-blank,
/// else the built-in text. Trimmed either way.
pub fn lens_rules(home: Option<&Path>) -> String {
    home.and_then(|h| read_nonblank(&h.join(LENS_RULES_FILE)))
        .unwrap_or_else(|| BUILTIN_LENS_RULES.trim().to_string())
}

/// Standing instructions for every Feedback, or None when the file is
/// absent or blank.
pub fn feedback_instructions(home: Option<&Path>) -> Option<String> {
    home.and_then(|h| read_nonblank(&h.join(FEEDBACK_INSTRUCTIONS_FILE)))
}

/// The skill text an install writes: the Override when present, else the
/// bundled text (LF line endings either way).
pub fn skill_text_for(home: Option<&Path>) -> String {
    home.and_then(|h| std::fs::read_to_string(h.join(SKILL_OVERRIDE_FILE)).ok())
        .filter(|t| !t.trim().is_empty())
        .map(|t| t.replace("\r\n", "\n"))
        .unwrap_or_else(crate::skill::skill_text)
}

pub fn override_path(home: &Path, id: &str) -> PathBuf {
    crate::lenses::dir_for(home).join(format!("{id}.md"))
}

/// The text of `<home>/lenses/<id>.md` when it exists and is non-blank.
pub fn lens_override(home: Option<&Path>, id: &str) -> Option<String> {
    home.and_then(|h| read_nonblank(&override_path(h, id)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("folio-prompts-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("lenses")).unwrap();
        std::fs::create_dir_all(dir.join("skill")).unwrap();
        dir
    }

    #[test]
    fn rules_fall_back_to_the_built_in_text() {
        let h = home("rules-default");
        assert_eq!(lens_rules(Some(&h)), BUILTIN_LENS_RULES.trim());
        assert_eq!(lens_rules(None), BUILTIN_LENS_RULES.trim());
        assert!(BUILTIN_LENS_RULES.contains("Keep it under 500 words"));
    }

    #[test]
    fn rules_file_replaces_the_built_in_text_unless_blank() {
        let h = home("rules-file");
        std::fs::write(h.join(LENS_RULES_FILE), "  Be brief.\n").unwrap();
        assert_eq!(lens_rules(Some(&h)), "Be brief.");
        std::fs::write(h.join(LENS_RULES_FILE), "  \n").unwrap();
        assert_eq!(lens_rules(Some(&h)), BUILTIN_LENS_RULES.trim());
    }

    #[test]
    fn instructions_are_none_when_absent_or_blank() {
        let h = home("instr");
        assert_eq!(feedback_instructions(Some(&h)), None);
        std::fs::write(h.join(FEEDBACK_INSTRUCTIONS_FILE), "\n\n").unwrap();
        assert_eq!(feedback_instructions(Some(&h)), None);
        std::fs::write(h.join(FEEDBACK_INSTRUCTIONS_FILE), "Keep changes minimal.\n").unwrap();
        assert_eq!(feedback_instructions(Some(&h)).as_deref(), Some("Keep changes minimal."));
    }

    #[test]
    fn skill_text_prefers_the_override_and_normalizes_line_endings() {
        let h = home("skill");
        assert_eq!(skill_text_for(Some(&h)), crate::skill::skill_text());
        std::fs::write(h.join(SKILL_OVERRIDE_FILE), "---\r\nname: folio\r\n---\r\nmine\r\n").unwrap();
        assert_eq!(skill_text_for(Some(&h)), "---\nname: folio\n---\nmine\n");
    }

    #[test]
    fn a_lens_override_is_read_from_the_lenses_folder() {
        let h = home("override");
        assert_eq!(lens_override(Some(&h), "council"), None);
        std::fs::write(override_path(&h, "council"), "---\nname: Council\n---\nMy council.\n").unwrap();
        assert_eq!(lens_override(Some(&h), "council").as_deref(), Some("---\nname: Council\n---\nMy council."));
        assert_eq!(override_path(&h, "council"), h.join("lenses").join("council.md"));
    }
}
