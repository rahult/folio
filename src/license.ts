/**
 * Pro feature gating. Pure and DOM-free so the rules are unit-testable;
 * the Tauri commands in src-tauri/src/license.rs own the actual crypto
 * and persistence.
 */

/** Every feature Folio can gate. Add new Pro features here. */
export type Feature = "export" | "focus-mode" | "typewriter-mode" | "themes";

/** The set of features that require a license. */
const PRO_FEATURES: ReadonlySet<Feature> = new Set([
  "export",
  "focus-mode",
  "typewriter-mode",
  "themes",
]);

export function isProFeature(feature: Feature): boolean {
  return PRO_FEATURES.has(feature);
}

/** Single gate check: licensed users may use everything. */
export function canUse(feature: Feature, licensed: boolean): boolean {
  return licensed || !isProFeature(feature);
}

/**
 * Cheap structural check before sending a key to Rust for real
 * verification: `FOLIO1-<base64url>-<base64url>` with a fixed 86-char
 * signature segment. Never a substitute for signature verification.
 */
export function looksLikeLicenseKey(key: string): boolean {
  const match = key
    .trim()
    .match(/^FOLIO1-([A-Za-z0-9_-]+)-([A-Za-z0-9_-]{86})$/);
  return match !== null;
}
