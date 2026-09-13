//! Finding and starting the Folio app. The command is a separate binary
//! (ADR 0002); anything that needs a window is handed to `folio-app`,
//! spawned detached with the same arguments the app has always accepted.

use folio_core::cliargs::CliOptions;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const APP_BINARY: &str = if cfg!(windows) { "folio-app.exe" } else { "folio-app" };

/// What to say when no candidate exists. The gate prints this itself before
/// it writes a waiting request, so the wording lives here rather than only
/// inside `launch`.
pub const NOT_FOUND: &str = if cfg!(windows) {
    "Folio is not installed where I can find it — set FOLIO_APP to the app binary (folio-app.exe inside the Folio install)"
} else {
    "Folio is not installed where I can find it — set FOLIO_APP to the app binary (folio-app inside the Folio install)"
};

/// Where the app might be, most specific first: an explicit override, the
/// directory this command runs from (the sidecar case, in the bundle and in
/// `tauri dev`), then the platform's usual install locations.
pub fn candidates(exe_dir: Option<&Path>, home: Option<&Path>, env_override: Option<&str>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(p) = env_override {
        out.push(PathBuf::from(p));
    }
    if let Some(dir) = exe_dir {
        out.push(dir.join(APP_BINARY));
    }
    if cfg!(target_os = "macos") {
        out.push(Path::new("/Applications/Folio.app/Contents/MacOS").join(APP_BINARY));
        if let Some(h) = home {
            out.push(h.join("Applications/Folio.app/Contents/MacOS").join(APP_BINARY));
        }
    }
    if cfg!(target_os = "linux") {
        out.push(Path::new("/usr/bin").join(APP_BINARY));
        out.push(Path::new("/usr/local/bin").join(APP_BINARY));
        if let Some(h) = home {
            out.push(h.join(".local/bin").join(APP_BINARY));
        }
    }
    if cfg!(windows) {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            out.push(PathBuf::from(local).join("Folio").join(APP_BINARY));
        }
        if let Some(pf) = std::env::var_os("ProgramFiles") {
            out.push(PathBuf::from(pf).join("Folio").join(APP_BINARY));
        }
    }
    out
}

/// The first candidate that exists. Split out from `locate` so the order
/// can be tested against a stand-in for the filesystem.
fn resolve(paths: Vec<PathBuf>, exists: &dyn Fn(&Path) -> bool) -> Option<PathBuf> {
    paths.into_iter().find(|p| exists(p))
}

pub fn locate() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    let over = std::env::var("FOLIO_APP").ok();
    resolve(
        candidates(exe_dir.as_deref(), home.as_deref(), over.as_deref()),
        &|p| p.is_file(),
    )
}

/// The app's arguments for an ordinary open: `--float` when asked, then
/// the resolved paths (stdin has already become a temp file here, so the
/// app never has to read it).
pub fn window_args(cli: &CliOptions) -> Vec<String> {
    let mut args = Vec::new();
    if cli.float {
        args.push("--float".to_string());
    }
    args.extend(cli.paths.iter().cloned());
    args
}

/// The app's arguments for the window a `--wait` review opens.
pub fn review_window_args(path: &str) -> Vec<String> {
    vec!["review".to_string(), path.to_string()]
}

/// Start the app detached. The command returns at once; the app decides
/// whether it is the primary instance or hands the request over.
pub fn launch(args: &[String]) -> Result<(), String> {
    let app = locate().ok_or(NOT_FOUND)?;
    Command::new(app)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not start Folio: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn override_then_sibling_come_first() {
        let c = candidates(Some(Path::new("/opt/folio")), Some(Path::new("/home/me")), Some("/x/folio-app"));
        assert_eq!(c[0], PathBuf::from("/x/folio-app"));
        assert_eq!(c[1], Path::new("/opt/folio").join(APP_BINARY));
        assert!(c.len() >= 2);
    }

    #[test]
    fn without_hints_only_platform_locations_remain() {
        let c = candidates(None, None, None);
        assert!(!c.is_empty());
        assert!(c.iter().all(|p| p.ends_with(APP_BINARY)));
        // The hints are the only source of these two prefixes, so dropping
        // them must drop every path derived from them.
        assert!(!c.iter().any(|p| p.starts_with("/opt") || p.starts_with("/home/me")));
    }

    #[test]
    fn resolution_takes_the_first_path_that_exists() {
        // A stand-in for the filesystem: nothing on this machine is touched,
        // so the test says the same thing wherever Folio happens to be.
        let c = candidates(Some(Path::new("/opt/folio")), Some(Path::new("/home/me")), Some("/x/folio-app"));
        assert_eq!(resolve(c.clone(), &|_| true), Some(PathBuf::from("/x/folio-app")));
        let sibling = Path::new("/opt/folio").join(APP_BINARY);
        assert_eq!(resolve(c.clone(), &|p| p == sibling), Some(sibling.clone()));
        assert_eq!(resolve(c, &|_| false), None);
        assert_eq!(resolve(candidates(None, None, None), &|_| false), None);
    }

    #[test]
    fn window_args_carry_float_and_paths() {
        let cli = CliOptions { paths: vec!["a.md".into(), "b.md".into()], float: true, ..Default::default() };
        assert_eq!(window_args(&cli), vec!["--float", "a.md", "b.md"]);
        let plain = CliOptions { paths: vec!["a.md".into()], ..Default::default() };
        assert_eq!(window_args(&plain), vec!["a.md"]);
        assert_eq!(review_window_args("p.md"), vec!["review", "p.md"]);
    }
}
