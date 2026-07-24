//! `folio-license` — offline license-signing CLI for Folio Pro.
//!
//!   folio-license keygen
//!   folio-license create --email <email> [--key <privkey-hex>] [--issued <YYYY-MM-DD>]
//!   folio-license verify --license <str>

use std::process::ExitCode;

use folio_lib::license;

const USAGE: &str = "folio-license — Folio Pro license tool

USAGE:
    folio-license keygen
        Generate a fresh Ed25519 keypair (hex).

    folio-license create --email <email> [--key <privkey-hex>] [--issued <YYYY-MM-DD>]
        Sign a license. Defaults to the DEV key compiled into the crate and
        today's date; a warning is printed to stderr in that case.

    folio-license verify --license <str>
        Verify a license against the app's embedded public key.";

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.windows(2)
        .find(|w| w[0] == flag)
        .map(|w| w[1].clone())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("keygen") => {
            let (private, public) = license::generate_keypair();
            println!("private key (hex): {private}");
            println!("public key  (hex): {public}");
            println!();
            println!("Keep the private key secret and offline. Never commit it.");
            println!("To use it, replace PUBLIC_KEY_HEX in src-tauri/src/license.rs");
            println!("with the public key above.");
            ExitCode::SUCCESS
        }
        Some("create") => {
            let Some(email) = arg_value(&args, "--email") else {
                eprintln!("error: create requires --email <email>");
                return ExitCode::FAILURE;
            };
            let issued = arg_value(&args, "--issued").unwrap_or_else(license::today_utc);
            let signing_key = match arg_value(&args, "--key") {
                Some(hex) => match license::signing_key_from_hex(&hex) {
                    Ok(key) => key,
                    Err(e) => {
                        eprintln!("error: invalid --key: {e}");
                        return ExitCode::FAILURE;
                    }
                },
                None => {
                    eprintln!(
                        "warning: signing with the DEV key — do not issue customer licenses with it"
                    );
                    license::dev_signing_key()
                }
            };
            println!("{}", license::create_license(&email, &issued, &signing_key));
            ExitCode::SUCCESS
        }
        Some("verify") => {
            let Some(key) = arg_value(&args, "--license") else {
                eprintln!("error: verify requires --license <str>");
                return ExitCode::FAILURE;
            };
            let info = license::verify_license_info(&key);
            if info.valid {
                println!("valid: true");
                println!("email: {}", info.email.unwrap_or_default());
                ExitCode::SUCCESS
            } else {
                println!("valid: false");
                println!("error: {}", info.error.unwrap_or_default());
                ExitCode::FAILURE
            }
        }
        _ => {
            eprintln!("{USAGE}");
            ExitCode::FAILURE
        }
    }
}
