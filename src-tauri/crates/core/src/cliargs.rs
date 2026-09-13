//! What a `folio …` invocation asked for: which Markdown files, whether
//! the floating review window was requested, and the gate flags. Shared by
//! the app (which also uses `CliOptions` as a window's startup request) and
//! the `folio` command.

use std::fs;

/// File extensions Folio opens; mirrors `fileAssociations` in tauri.conf.json.
pub const MARKDOWN_EXTS: [&str; 4] = ["md", "markdown", "mdown", "mkd"];

/// Gate flags from a `folio review --wait/--collect` invocation. Meaningful
/// only to the invoking process, so they are skipped by serde: the spool
/// entry and the per-window startup request stay exactly as they were.
#[derive(Clone)]
pub struct GateOptions {
    pub wait: bool,
    pub collect: bool,
    pub timeout_secs: u64,
    pub agent: String,
}

impl Default for GateOptions {
    fn default() -> Self {
        Self {
            wait: false,
            collect: false,
            timeout_secs: crate::gate::DEFAULT_TIMEOUT_SECS,
            agent: "agent".to_string(),
        }
    }
}

/// CLI invocation split into markdown files to open and whether the
/// floating review window was requested. Doubles as the per-window startup
/// request handed to a freshly created window.
#[derive(Default, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliOptions {
    pub paths: Vec<String>,
    pub float: bool,
    #[serde(skip)]
    pub gate: GateOptions,
}

/// Write piped markdown to a temp file so it can be opened (and watched)
/// like any other document. Returns None for empty input.
pub fn write_temp_markdown(contents: &str, dir: &std::path::Path) -> Option<std::path::PathBuf> {
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
pub fn stdin_to_temp() -> Option<std::path::PathBuf> {
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
pub fn parse(args: impl IntoIterator<Item = String>) -> CliOptions {
    let mut float = false;
    let mut paths = Vec::new();
    let mut gate = GateOptions::default();
    // `--timeout 60` / `--agent claude` consume the next argument; this
    // remembers which one is owed so the value is never read as a path.
    let mut pending: Option<&'static str> = None;
    for arg in args.into_iter().skip(1) {
        if let Some(flag) = pending.take() {
            match flag {
                "timeout" => {
                    if let Ok(secs) = arg.parse::<u64>() {
                        gate.timeout_secs = secs;
                    }
                }
                _ => gate.agent = arg,
            }
            continue;
        }
        match arg.as_str() {
            "--float" | "-f" => float = true,
            "review" => float = true,
            "--wait" => gate.wait = true,
            "--collect" => gate.collect = true,
            "--timeout" => pending = Some("timeout"),
            "--agent" => pending = Some("agent"),
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
    CliOptions { paths, float, gate }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The extension stays last so a test's temp file is a real markdown
    /// file. `stem` keeps parallel tests off each other's files (APFS is
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

        let cli = parse(
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

        let cli = parse(["folio".to_string(), upper.to_string_lossy().into_owned()].into_iter());

        assert_eq!(cli.paths, vec![upper.to_string_lossy().into_owned()]);

        fs::remove_file(&upper).ok();
    }

    #[test]
    fn parse_cli_args_lifts_out_the_float_flag() {
        let md = temp_file("args-float", "md");
        fs::write(&md, "# hi").unwrap();

        for flag in ["--float", "-f"] {
            let cli = parse(
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

        let cli = parse(
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

    #[test]
    fn parse_cli_args_lifts_out_the_wait_flag() {
        let md = temp_file("args-wait", "md");
        fs::write(&md, "# hi").unwrap();
        let cli = parse(
            [
                "folio".to_string(),
                "review".to_string(),
                "--wait".to_string(),
                md.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );
        assert!(cli.gate.wait);
        assert!(!cli.gate.collect);
        assert!(cli.float);
        assert_eq!(cli.paths.len(), 1);
        assert_eq!(cli.gate.timeout_secs, crate::gate::DEFAULT_TIMEOUT_SECS);
        assert_eq!(cli.gate.agent, "agent");

        fs::remove_file(&md).ok();
    }

    #[test]
    fn parse_cli_args_lifts_out_the_collect_flag() {
        let md = temp_file("args-collect", "md");
        let cli = parse(
            [
                "folio".to_string(),
                "review".to_string(),
                "--collect".to_string(),
                md.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );
        assert!(cli.gate.collect);
        assert!(!cli.gate.wait);
    }

    #[test]
    fn parse_cli_args_reads_timeout_and_agent_values() {
        let md = temp_file("args-opts", "md");
        fs::write(&md, "# hi").unwrap();
        let cli = parse(
            [
                "folio".to_string(),
                "review".to_string(),
                "--wait".to_string(),
                "--timeout".to_string(),
                "60".to_string(),
                "--agent".to_string(),
                "claude".to_string(),
                md.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );
        assert_eq!(cli.gate.timeout_secs, 60);
        assert_eq!(cli.gate.agent, "claude");
        // The values must not be mistaken for document paths.
        assert_eq!(cli.paths.len(), 1);

        fs::remove_file(&md).ok();
    }

    #[test]
    fn parse_cli_args_ignores_a_malformed_timeout() {
        let md = temp_file("args-badtimeout", "md");
        let cli = parse(
            [
                "folio".to_string(),
                "review".to_string(),
                "--wait".to_string(),
                "--timeout".to_string(),
                "soon".to_string(),
                md.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );
        assert_eq!(cli.gate.timeout_secs, crate::gate::DEFAULT_TIMEOUT_SECS);
    }
}
