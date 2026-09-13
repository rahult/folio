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
        // Checked before the gate runs: once `run_cli` has written a waiting
        // request it polls for the whole timeout and returns 3 ("still open"),
        // so a missing app would tell the agent a review is waiting when no
        // window was ever opened. Exit 4 ("could not open") up front instead.
        if app::locate().is_none() {
            eprintln!("folio: {}", app::NOT_FOUND);
            std::process::exit(4);
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
