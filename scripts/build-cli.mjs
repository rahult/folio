// Builds the folio command in release mode and copies it to where Tauri's
// bundler looks for a sidecar: src-tauri/binaries/folio-<host triple>.
// Run by `npm run build:cli`, and by tauri.conf.json before dev and build.
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";

const triple = execSync("rustc -vV").toString().match(/^host: (.+)$/m)[1].trim();
execSync("cargo build --release -p folio-cli --manifest-path src-tauri/Cargo.toml", {
  stdio: "inherit",
});
const ext = process.platform === "win32" ? ".exe" : "";
mkdirSync("src-tauri/binaries", { recursive: true });
const target = `src-tauri/binaries/folio-${triple}${ext}`;
copyFileSync(`src-tauri/target/release/folio${ext}`, target);
console.log(`sidecar: ${target}`);
