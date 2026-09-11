//! `folio skill …`: install the bundled `/folio` agent skill without npm.
//!
//! The skill text is compiled into the binary from `skills/folio/SKILL.md`,
//! so an installed Folio carries the skill that matches it. Targets are the
//! directories the harnesses read: `~/.claude/skills/<name>/` for Claude
//! Code and `~/.agents/skills/<name>/` for Codex, Copilot CLI, Gemini CLI,
//! and others that share that folder. `--project` installs into the current
//! directory's `.claude/skills` and `.agents/skills` instead.

use std::path::{Path, PathBuf};

pub const SKILL_NAME: &str = "folio";
pub const SKILL_MD: &str = include_str!("../../skills/folio/SKILL.md");

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
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

    fn label(self) -> &'static str {
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

/// Write the bundled skill to every target. Returns the paths written.
pub fn install_in(cmd: &SkillCommand, root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut written = Vec::new();
    for (_, path) in install_paths(cmd, root) {
        let dir = path.parent().ok_or_else(|| "bad skill path".to_string())?;
        std::fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
        std::fs::write(&path, SKILL_MD).map_err(|e| format!("could not write {}: {e}", path.display()))?;
        written.push(path);
    }
    Ok(written)
}

pub const HELP: &str = "folio skill — install the /folio agent skill

  folio skill install [--agent claude|codex|all] [--project]
      Write the bundled skill to ~/.claude/skills/folio and ~/.agents/skills/folio
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
            print!("{SKILL_MD}");
            0
        }
        SkillAction::Where => {
            for (target, path) in install_paths(cmd, &root) {
                println!("{} — {}", path.display(), target.label());
            }
            0
        }
        SkillAction::Install => match install_in(cmd, &root) {
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
}
