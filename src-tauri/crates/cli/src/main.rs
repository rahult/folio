//! `folio`: the command line for Folio. Opens documents in the app, runs
//! the review gate for coding agents, and installs the agent skill. Runs
//! anywhere — it has no window of its own (ADR 0002).

mod app;

use folio_core::{cliargs, gate, skill};

const HELP: &str = "folio — Folio from the command line

  folio [--float] <file.md>…               open in Folio (`-` reads Markdown from stdin)
  folio review <file.md>                   open in a floating review window
  folio review --wait --agent <name> <file.md>
                                           open the review and block for the verdict:
                                           exit 0 approved, 2 changes requested,
                                           3 still open, 4 could not open
  folio review --collect <file.md>         print a verdict left by an earlier --wait
  folio skill install|show|where           the /folio agent skill (see `folio skill`)
  folio --version

Set FOLIO_APP to the app binary if Folio is installed somewhere unusual.
";

/// The exit code to stop at before the gate runs, or `None` to let the gate
/// answer for itself.
///
/// Only `--wait` needs the app: once `gate::run_cli` has written a waiting
/// request it polls for the whole timeout and returns 3 ("still open"), which
/// would tell the agent a review is waiting when no window was ever opened.
/// `--collect` only reads a verdict already on disk — the box that ran the
/// review may be headless now, or someone else's script may be collecting —
/// so it goes through and keeps the gate's own 0/2/3.
fn missing_app_code(wait: bool, app_found: bool) -> Option<i32> {
    (wait && !app_found).then_some(4)
}

fn main() {
    let argv: Vec<String> = std::env::args().collect();
    if let Some(cmd) = skill::parse(&argv) {
        std::process::exit(skill::run(&cmd));
    }
    match argv.get(1).map(String::as_str) {
        Some("--help" | "-h" | "help") => {
            print!("{HELP}");
            return;
        }
        Some("--version" | "-V") => {
            println!("folio {}", env!("CARGO_PKG_VERSION"));
            return;
        }
        _ => {}
    }
    let cli = cliargs::parse(argv);
    if cli.gate.wait || cli.gate.collect {
        if let Some(code) = missing_app_code(cli.gate.wait, app::locate().is_some()) {
            eprintln!("folio: {}", app::NOT_FOUND);
            std::process::exit(code);
        }
        std::process::exit(gate::run_cli(
            &cli.paths,
            cli.gate.wait,
            &cli.gate.agent,
            cli.gate.timeout_secs,
            &|path| {
                if let Err(e) = app::launch(&app::review_window_args(path)) {
                    eprintln!("folio: {e}");
                }
            },
        ));
    }
    if let Err(e) = app::launch(&app::window_args(&cli)) {
        eprintln!("folio: {e}");
        std::process::exit(4);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_wait_stops_when_the_app_is_missing() {
        assert_eq!(missing_app_code(true, false), Some(4));
        assert_eq!(missing_app_code(true, true), None);
        // --collect reads a verdict off disk; it needs no window, so it falls
        // through to the gate and its own 0/2/3 either way.
        assert_eq!(missing_app_code(false, false), None);
        assert_eq!(missing_app_code(false, true), None);
    }
}
