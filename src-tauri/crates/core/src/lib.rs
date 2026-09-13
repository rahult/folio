//! Everything Folio does that needs no window: the review gate, the
//! command-line arguments, the companion file formats (Feedback, Analysis,
//! Revisions), the lens folder, and the embedded agent skill. Used by the
//! app and by the `folio` command (ADR 0001, ADR 0002).

pub mod cliargs;
pub mod gate;

/// FNV-1a hex of a file's path — a stable, filesystem-safe directory or
/// file name for the per-document state (review handshakes, revision
/// archives) both binaries keep.
pub fn path_hash(path: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in path.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}
