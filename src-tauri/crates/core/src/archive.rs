//! Revisions: every on-disk version of a watched or reviewed Document,
//! archived so any earlier one can be diffed against the current text.
//! Storage: `<config>/history/<fnv1a(path)>/<seq>.json` holding
//! {"markdown","rendered","archived_at","origin","feedback"}. Rendered text
//! is kept alongside so history diffs map exactly onto the app's
//! decoration layer. Callers pass the directory, so the app resolves it
//! from Tauri and the CLI from the platform config dir.

use std::fs;

pub const MAX_REVISIONS: usize = 20;

fn unknown_origin() -> String {
    "unknown".to_string()
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct RevisionContent {
    pub markdown: String,
    pub rendered: String,
    pub archived_at: u64,
    /// Who produced this version: "external" (rewritten on disk while
    /// watched), "revision" (the first rewrite after a changes-requested
    /// verdict), "folio" (saved here), or "unknown" (archives from before
    /// origins were recorded, and the file as first opened).
    #[serde(default = "unknown_origin")]
    pub origin: String,
    /// For a "revision": the feedback it answers.
    #[serde(default)]
    pub feedback: Option<String>,
}

#[derive(serde::Serialize)]
pub struct RevisionMeta {
    pub seq: u64,
    pub archived_at: u64,
    pub preview: String,
    pub origin: String,
}

/// One link of the authorship chain: rendered text plus who wrote it, and
/// for a revision the feedback it answers.
#[derive(serde::Serialize)]
pub struct RevisionText {
    pub seq: u64,
    pub archived_at: u64,
    pub rendered: String,
    pub origin: String,
    pub feedback: Option<String>,
}

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

pub fn revision_seqs(dir: &std::path::Path) -> Vec<u64> {
    let mut seqs: Vec<u64> = fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    e.file_name()
                        .to_str()?
                        .strip_suffix(".json")?
                        .parse::<u64>()
                        .ok()
                })
                .collect()
        })
        .unwrap_or_default();
    seqs.sort_unstable();
    seqs
}

pub fn read_revision_file(dir: &std::path::Path, seq: u64) -> Result<RevisionContent, String> {
    let raw = fs::read_to_string(dir.join(format!("{seq}.json")))
        .map_err(|e| format!("failed to read revision {seq}: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("corrupt revision {seq}: {e}"))
}

/// Archive a new revision unless it matches the latest one; prune to the
/// newest MAX_REVISIONS. Returns the revision's seq.
pub fn archive_in_dir(
    dir: &std::path::Path,
    markdown: &str,
    rendered: &str,
    now: u64,
    origin: &str,
) -> Result<u64, String> {
    archive_with_feedback(dir, markdown, rendered, now, origin, None)
}

pub fn archive_with_feedback(
    dir: &std::path::Path,
    markdown: &str,
    rendered: &str,
    now: u64,
    origin: &str,
    feedback: Option<String>,
) -> Result<u64, String> {
    fs::create_dir_all(dir).map_err(|e| format!("failed to create history dir: {e}"))?;
    let seqs = revision_seqs(dir);
    if let Some(&latest) = seqs.last() {
        if let Ok(content) = read_revision_file(dir, latest) {
            if content.markdown == markdown {
                return Ok(latest);
            }
        }
    }
    let seq = seqs.last().map(|s| s + 1).unwrap_or(1);
    let content = RevisionContent {
        markdown: markdown.to_string(),
        rendered: rendered.to_string(),
        archived_at: now,
        origin: origin.to_string(),
        feedback,
    };
    let json = serde_json::to_string(&content).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{seq}.json")), json)
        .map_err(|e| format!("failed to write revision: {e}"))?;
    // Prune oldest beyond the cap.
    let seqs = revision_seqs(dir);
    for old in seqs.iter().take(seqs.len().saturating_sub(MAX_REVISIONS)) {
        let _ = fs::remove_file(dir.join(format!("{old}.json")));
    }
    Ok(seq)
}

pub fn list_in_dir(dir: &std::path::Path) -> Vec<RevisionMeta> {
    let mut metas: Vec<RevisionMeta> = revision_seqs(dir)
        .into_iter()
        .rev()
        .filter_map(|seq| {
            let content = read_revision_file(dir, seq).ok()?;
            let preview: String = content
                .rendered
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(60)
                .collect();
            Some(RevisionMeta {
                seq,
                archived_at: content.archived_at,
                preview,
                origin: content.origin,
            })
        })
        .collect();
    metas.sort_by(|a, b| b.seq.cmp(&a.seq));
    metas
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn history_test_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("folio-test-history-{name}-{}", std::process::id()))
    }

    #[test]
    fn archive_stores_and_lists_revisions_newest_first() {
        let dir = history_test_dir("basic");
        archive_in_dir(&dir, "# v1\n", "v1 rendered", 1000, "external").unwrap();
        archive_in_dir(&dir, "# v2\n", "v2 rendered", 2000, "external").unwrap();

        let list = list_in_dir(&dir);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].seq, 2);
        assert_eq!(list[0].archived_at, 2000);
        assert!(list[0].preview.contains("v2 rendered"));
        assert_eq!(list[1].seq, 1);

        let content = read_revision_file(&dir, 1).unwrap();
        assert_eq!(content.markdown, "# v1\n");
        assert_eq!(content.rendered, "v1 rendered");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn archive_skips_duplicates_of_the_latest_revision() {
        let dir = history_test_dir("dedupe");
        let first = archive_in_dir(&dir, "# same\n", "same", 1000, "external").unwrap();
        let second = archive_in_dir(&dir, "# same\n", "same", 2000, "external").unwrap();

        assert_eq!(first, second);
        assert_eq!(list_in_dir(&dir).len(), 1);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn revisions_record_their_origin_and_default_to_unknown() {
        let dir = history_test_dir("origin");
        archive_in_dir(&dir, "# a\n", "a", 1, "external").unwrap();
        archive_in_dir(&dir, "# b\n", "b", 2, "folio").unwrap();
        let list = list_in_dir(&dir);
        assert_eq!(list[0].origin, "folio");
        assert_eq!(list[1].origin, "external");
        // An archive written before origins existed reads as unknown.
        fs::write(
            dir.join("3.json"),
            r##"{"markdown":"# c","rendered":"c","archived_at":3}"##,
        )
        .unwrap();
        assert_eq!(read_revision_file(&dir, 3).unwrap().origin, "unknown");
    }

    #[test]
    fn archive_prunes_to_the_newest_twenty() {
        let dir = history_test_dir("prune");
        for i in 0..25 {
            archive_in_dir(&dir, &format!("# v{i}\n"), "rendered", 1000 + i, "external").unwrap();
        }

        let seqs = revision_seqs(&dir);
        assert_eq!(seqs.len(), MAX_REVISIONS);
        assert_eq!(seqs[0], 6, "oldest five revisions are pruned");
        assert_eq!(list_in_dir(&dir)[0].seq, 25);

        fs::remove_dir_all(&dir).ok();
    }
}
