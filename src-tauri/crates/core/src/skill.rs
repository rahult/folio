//! `folio skill …`: install the `/folio` agent skill without npm.
//!
//! The text installed is the Home folder's `skill/SKILL.md` when that file
//! is present and non-blank, else the copy compiled into the binary from
//! `skills/folio/SKILL.md`, so an installed Folio carries either the skill
//! that matches it or the one you edited. Targets are the
//! directories the harnesses read: `~/.claude/skills/<name>/` for Claude
//! Code and `~/.agents/skills/<name>/` for Codex, Copilot CLI, Gemini CLI,
//! and others that share that folder. `--project` installs into the current
//! directory's `.claude/skills` and `.agents/skills` instead.

use serde::Serialize;
use std::path::{Path, PathBuf};

pub const SKILL_NAME: &str = "folio";
const SKILL_MD_RAW: &str = include_str!("../../../../skills/folio/SKILL.md");

/// The bundled skill with LF line endings whatever the checkout used
/// (Windows git may have written the source file with CRLF).
pub fn skill_text() -> String {
    SKILL_MD_RAW.replace("\r\n", "\n")
}

#[derive(Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Target {
    Claude,
    Agents,
}

impl Target {
    fn dir_under(self, root: &Path) -> PathBuf {
        match self {
            Target::Claude => root.join(".claude").join("skills"),
            Target::Agents => root.join(".agents").join("skills"),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Target::Claude => "Claude Code",
            Target::Agents => "Codex, Copilot CLI, Gemini CLI, and others (~/.agents)",
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct SkillCommand {
    pub action: SkillAction,
    pub targets: Vec<Target>,
    pub project: bool,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum SkillAction {
    Install,
    Show,
    Where,
    Help,
}

/// Parse `folio skill [install|show|where] [--agent claude|codex|agents|all] [--project]`.
/// Returns None when argv is not a skill command at all.
pub fn parse(args: &[String]) -> Option<SkillCommand> {
    if args.get(1).map(String::as_str) != Some("skill") {
        return None;
    }
    let mut action = SkillAction::Help;
    let mut targets = Vec::new();
    let mut project = false;
    let mut pending_agent = false;
    for arg in &args[2..] {
        if pending_agent {
            pending_agent = false;
            match arg.as_str() {
                "claude" | "claude-code" => targets.push(Target::Claude),
                "codex" | "agents" | "copilot" | "gemini" => targets.push(Target::Agents),
                "all" => {
                    targets.push(Target::Claude);
                    targets.push(Target::Agents);
                }
                _ => {}
            }
            continue;
        }
        match arg.as_str() {
            "install" => action = SkillAction::Install,
            "show" | "print" => action = SkillAction::Show,
            "where" | "path" => action = SkillAction::Where,
            "--agent" | "-a" => pending_agent = true,
            "--project" | "-p" => project = true,
            "help" | "--help" | "-h" => action = SkillAction::Help,
            _ => {}
        }
    }
    if targets.is_empty() {
        targets = vec![Target::Claude, Target::Agents];
    }
    targets.dedup();
    Some(SkillCommand { action, targets, project })
}

/// Where the skill would go for each target under `root`.
pub fn install_paths(cmd: &SkillCommand, root: &Path) -> Vec<(Target, PathBuf)> {
    cmd.targets
        .iter()
        .map(|t| (*t, t.dir_under(root).join(SKILL_NAME).join("SKILL.md")))
        .collect()
}

/// Write `text` to every target. Returns the paths written.
pub fn install_in_with_text(cmd: &SkillCommand, root: &Path, text: &str) -> Result<Vec<PathBuf>, String> {
    let mut written = Vec::new();
    for (_, path) in install_paths(cmd, root) {
        let dir = path.parent().ok_or_else(|| "bad skill path".to_string())?;
        std::fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
        std::fs::write(&path, text).map_err(|e| format!("could not write {}: {e}", path.display()))?;
        written.push(path);
    }
    Ok(written)
}

/// Write the bundled skill to every target. Returns the paths written.
pub fn install_in(cmd: &SkillCommand, root: &Path) -> Result<Vec<PathBuf>, String> {
    install_in_with_text(cmd, root, &skill_text())
}

#[derive(Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum SkillState {
    /// No file at the target path.
    Missing,
    /// The installed text is what an install would write now.
    Current,
    /// The installed text differs from the bundled text.
    Outdated,
    /// An Override exists and the installed text differs from it.
    Custom,
}

#[derive(Serialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillStatus {
    pub target: Target,
    pub label: String,
    pub path: PathBuf,
    pub state: SkillState,
}

/// Each target's install state under `root`, judged against `text` (what
/// an install would write now; `is_override` says it came from the Home
/// folder rather than the bundle).
pub fn status_in(root: &Path, text: &str, is_override: bool) -> Vec<SkillStatus> {
    [Target::Claude, Target::Agents]
        .into_iter()
        .map(|target| {
            let path = target.dir_under(root).join(SKILL_NAME).join("SKILL.md");
            let state = match std::fs::read_to_string(&path) {
                Err(_) => SkillState::Missing,
                Ok(installed) if installed.replace("\r\n", "\n") == text => SkillState::Current,
                Ok(_) if is_override => SkillState::Custom,
                Ok(_) => SkillState::Outdated,
            };
            SkillStatus { target, label: target.label().to_string(), path, state }
        })
        .collect()
}

pub const HELP: &str = "folio skill — install the /folio agent skill

  folio skill install [--agent claude|codex|all] [--project]
      Write the skill to ~/.claude/skills/folio and ~/.agents/skills/folio
      (or ./.claude/skills and ./.agents/skills with --project).
  folio skill show      Print the skill to stdout.
  folio skill where     Print where it would be installed.

Or, with npm: npx skills add rahult/folio
";

/// Run the command; returns the process exit code.
pub fn run(cmd: &SkillCommand) -> i32 {
    let root = if cmd.project {
        std::env::current_dir().ok()
    } else {
        std::env::var_os("HOME").map(PathBuf::from)
    };
    let Some(root) = root else {
        eprintln!("folio: could not determine the install directory");
        return 1;
    };
    match cmd.action {
        SkillAction::Help => {
            print!("{HELP}");
            0
        }
        SkillAction::Show => {
            print!("{}", crate::prompts::skill_text_for(crate::settings::load().home().as_deref()));
            0
        }
        SkillAction::Where => {
            for (target, path) in install_paths(cmd, &root) {
                println!("{} — {}", path.display(), target.label());
            }
            0
        }
        SkillAction::Install => match install_in_with_text(
            cmd,
            &root,
            &crate::prompts::skill_text_for(crate::settings::load().home().as_deref()),
        ) {
            Ok(paths) => {
                for (path, (target, _)) in paths.iter().zip(install_paths(cmd, &root)) {
                    println!("installed {} ({})", path.display(), target.label());
                }
                println!("Type /folio in your agent to open the document it just wrote in Folio.");
                0
            }
            Err(e) => {
                eprintln!("folio: {e}");
                1
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(s: &str) -> Vec<String> {
        s.split_whitespace().map(String::from).collect()
    }

    #[test]
    fn only_skill_argv_is_a_skill_command() {
        assert!(parse(&argv("folio review plan.md")).is_none());
        assert!(parse(&argv("folio")).is_none());
        let cmd = parse(&argv("folio skill")).unwrap();
        assert_eq!(cmd.action, SkillAction::Help);
        assert_eq!(cmd.targets, vec![Target::Claude, Target::Agents]);
    }

    #[test]
    fn install_targets_and_flags_parse() {
        let cmd = parse(&argv("folio skill install --agent claude --project")).unwrap();
        assert_eq!(cmd.action, SkillAction::Install);
        assert_eq!(cmd.targets, vec![Target::Claude]);
        assert!(cmd.project);
        let cmd = parse(&argv("folio skill install -a codex")).unwrap();
        assert_eq!(cmd.targets, vec![Target::Agents]);
        let cmd = parse(&argv("folio skill show")).unwrap();
        assert_eq!(cmd.action, SkillAction::Show);
    }

    #[test]
    fn install_writes_the_bundled_skill_to_each_target() {
        let root = std::env::temp_dir().join(format!("folio-skill-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let cmd = parse(&argv("folio skill install --agent all")).unwrap();
        let written = install_in(&cmd, &root).unwrap();
        assert_eq!(written.len(), 2);
        assert_eq!(written[0], root.join(".claude/skills/folio/SKILL.md"));
        assert_eq!(written[1], root.join(".agents/skills/folio/SKILL.md"));
        let text = std::fs::read_to_string(&written[0]).unwrap();
        assert!(text.starts_with("---\nname: folio"));
        assert!(text.contains("disable-model-invocation: true"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn status_reports_missing_current_outdated_and_custom() {
        let root = std::env::temp_dir().join(format!("folio-skill-status-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let text = "---\nname: folio\n---\nbody\n";
        // Nothing installed yet.
        let s = status_in(&root, text, false);
        assert_eq!(s.len(), 2);
        assert!(s.iter().all(|x| x.state == SkillState::Missing));
        assert_eq!(s[0].target, Target::Claude);
        assert!(s[0].path.ends_with(".claude/skills/folio/SKILL.md"));
        // Install the given text → current.
        let cmd = SkillCommand { action: SkillAction::Install, targets: vec![Target::Claude, Target::Agents], project: false };
        install_in_with_text(&cmd, &root, text).unwrap();
        assert!(status_in(&root, text, false).iter().all(|x| x.state == SkillState::Current));
        // A different bundled text → outdated; the same difference with an override → custom.
        assert!(status_in(&root, "newer", false).iter().all(|x| x.state == SkillState::Outdated));
        assert!(status_in(&root, "newer", true).iter().all(|x| x.state == SkillState::Custom));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn install_in_writes_the_bundled_text_and_install_in_with_text_writes_its_argument() {
        let root = std::env::temp_dir().join(format!("folio-skill-text-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let cmd = SkillCommand { action: SkillAction::Install, targets: vec![Target::Claude], project: false };
        let written = install_in_with_text(&cmd, &root, "custom\n").unwrap();
        assert_eq!(std::fs::read_to_string(&written[0]).unwrap(), "custom\n");
        install_in(&cmd, &root).unwrap();
        assert_eq!(std::fs::read_to_string(&written[0]).unwrap(), skill_text());
        let _ = std::fs::remove_dir_all(&root);
    }
}
