//! Feedback: the Markdown an Agent acts on after a Review. A verdict, one
//! numbered instruction per change request with the quoted passage and
//! its line range in the file when it can be found, then the passages
//! marked as good under "Keep as is". The same text is written to
//! `<doc>.feedback.md` and printed by the gate; this is its only writer
//! (ADR 0001). Ported from the app's TypeScript and held to its output by
//! the fixtures in `tests/fixtures/feedback/`.

use serde::{Deserialize, Serialize};

/// One review annotation; field names match the frontend model exactly.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    /// "comment" | "delete" | "replace" | "approve"
    pub kind: String,
    pub quote: String,
    pub body: String,
    pub created_at: String,
}

/// Kinds that ask the agent to change something; `approve` says keep it.
pub fn is_change_request(kind: &str) -> bool {
    kind != "approve"
}

/// 1-based inclusive lines.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LineRange {
    pub start: usize,
    pub end: usize,
}

/// Block-level syntax the rendered text never contains: list bullets and
/// numbers, heading hashes, quote bars, task checkboxes.
fn is_marker(word: &str) -> bool {
    if matches!(word, "-" | "*" | "+" | ">" | "[x]" | "[X]") {
        return true;
    }
    let hashes = word.bytes().take_while(|b| *b == b'#').count();
    if hashes == word.len() && (1..=6).contains(&hashes) {
        return true;
    }
    match word.chars().last() {
        Some('.') | Some(')') => {
            let digits = &word[..word.len() - 1];
            !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
        }
        _ => false,
    }
}

/// A word stripped of surrounding punctuation (`**bold**,` → `bold`).
fn word_core(word: &str) -> &str {
    word.trim_matches(|c: char| !c.is_alphanumeric())
}

/// Where a quote sits in the on-disk text. Matched on the word sequence,
/// so wrapping, inline marks, and whitespace differences don't matter.
pub fn locate_quote(source: &str, quote: &str) -> Option<LineRange> {
    let needle: Vec<&str> = quote
        .split_whitespace()
        .map(word_core)
        .filter(|w| !w.is_empty())
        .collect();
    if needle.is_empty() {
        return None;
    }
    let mut words: Vec<(&str, usize)> = Vec::new();
    for (i, line) in source.split('\n').enumerate() {
        for raw in line.split_whitespace() {
            if is_marker(raw) {
                continue;
            }
            let core = word_core(raw);
            if !core.is_empty() {
                words.push((core, i + 1));
            }
        }
    }
    if words.len() < needle.len() {
        return None;
    }
    (0..=words.len() - needle.len())
        .find(|&i| needle.iter().enumerate().all(|(j, w)| words[i + j].0 == *w))
        .map(|i| LineRange {
            start: words[i].1,
            end: words[i + needle.len() - 1].1,
        })
}

/// The longest quote a heading or "Keep as is" bullet carries; longer ones
/// are cut short with an ellipsis, as the TypeScript `oneLine` does.
const QUOTE_MAX: usize = 72;

/// Whitespace runs collapsed to one space, trimmed, and cut to `QUOTE_MAX`.
fn one_line(text: &str) -> String {
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= QUOTE_MAX {
        return collapsed;
    }
    let mut out: String = collapsed.chars().take(QUOTE_MAX - 1).collect();
    out.push('…');
    out
}

/// "L12 " or "L12–14 ", or "" when the source is unknown or the quote is
/// not in it.
fn line_ref(source: Option<&str>, quote: &str) -> String {
    let Some(source) = source else {
        return String::new();
    };
    match locate_quote(source, quote) {
        Some(r) if r.start == r.end => format!("L{} ", r.start),
        Some(r) => format!("L{}–{} ", r.start, r.end),
        None => String::new(),
    }
}

/// The Feedback text for `file_name`. With no change requests the verdict
/// is approval. `document_edited` appends the note telling the agent the
/// reviewer changed the file directly.
pub fn build(
    file_name: &str,
    annotations: &[Annotation],
    source: Option<&str>,
    document_edited: bool,
) -> String {
    let changes: Vec<&Annotation> = annotations
        .iter()
        .filter(|a| is_change_request(&a.kind))
        .collect();
    let keeps: Vec<&Annotation> = annotations
        .iter()
        .filter(|a| !is_change_request(&a.kind))
        .collect();
    let mut lines: Vec<String> = vec![format!("# Review feedback: {file_name}"), String::new()];
    if changes.is_empty() {
        lines.push("Verdict: **approved** — no changes requested.".to_string());
    } else {
        let n = changes.len();
        let plural = if n == 1 { "" } else { "s" };
        lines.push(format!(
            "Verdict: **changes requested** ({n} annotation{plural})"
        ));
    }
    lines.push(String::new());
    for (i, a) in changes.iter().enumerate() {
        let n = i + 1;
        let quote = one_line(&a.quote);
        let at = line_ref(source, &a.quote);
        match a.kind.as_str() {
            "comment" => lines.extend([
                format!("## {n}. Comment on {at}\"{quote}\""),
                String::new(),
                format!("> {quote}"),
                String::new(),
                a.body.clone(),
                String::new(),
            ]),
            "delete" => lines.extend([
                format!("## {n}. Delete {at}\"{quote}\""),
                String::new(),
                format!("> {quote}"),
                String::new(),
                "Remove this section.".to_string(),
                String::new(),
            ]),
            _ => lines.extend([
                format!("## {n}. Replace {at}\"{quote}\""),
                String::new(),
                format!("> {quote}"),
                String::new(),
                "Suggested replacement:".to_string(),
                String::new(),
                a.body.clone(),
                String::new(),
            ]),
        }
    }
    if !keeps.is_empty() {
        lines.push("## Keep as is".to_string());
        lines.push(String::new());
        for a in &keeps {
            lines.push(format!(
                "- {}\"{}\"",
                line_ref(source, &a.quote),
                one_line(&a.quote)
            ));
        }
        lines.push(String::new());
    }
    let text = lines.join("\n");
    if !document_edited {
        return text;
    }
    format!(
        "{}\n\n---\n\nThe reviewer edited the document directly during this review — re-read the file before acting on this feedback.\n",
        text.trim_end()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEXT: &str = "# Rollout plan\n\n- Ship to all users at once.\n- Roll back by flag.\n\n## Risks\n\nThe **migration** runs in three passes, and the\nsecond pass switches reads.\n";

    fn ann(kind: &str, quote: &str, body: &str) -> Annotation {
        Annotation {
            id: format!("id-{kind}-{}", quote.len()),
            kind: kind.into(),
            quote: quote.into(),
            body: body.into(),
            created_at: "2026-09-14T00:00:00.000Z".into(),
        }
    }

    #[test]
    fn matches_the_typescript_output_for_an_approval() {
        assert_eq!(
            build("plan.md", &[], None, false),
            include_str!("../tests/fixtures/feedback/approved.md")
        );
    }

    #[test]
    fn matches_the_typescript_output_for_a_comment_with_a_line() {
        let out = build(
            "plan.md",
            &[ann(
                "comment",
                "Ship to all users at once.",
                "Why all at once?",
            )],
            Some(TEXT),
            false,
        );
        assert_eq!(out, include_str!("../tests/fixtures/feedback/comment.md"));
    }

    #[test]
    fn matches_the_typescript_output_for_mixed_kinds() {
        let out = build(
            "plan.md",
            &[
                ann("approve", "Roll back by flag.", ""),
                ann("delete", "Ship to all users at once.", ""),
                ann(
                    "replace",
                    "migration runs in three passes, and the second pass switches reads",
                    "migration runs in two passes",
                ),
                ann("comment", "not in the file", "Where is this?"),
            ],
            Some(TEXT),
            false,
        );
        assert_eq!(out, include_str!("../tests/fixtures/feedback/mixed.md"));
    }

    #[test]
    fn matches_the_typescript_output_with_the_edit_note() {
        let out = build(
            "plan.md",
            &[ann("comment", "Risks", "Expand.")],
            Some(TEXT),
            true,
        );
        assert_eq!(out, include_str!("../tests/fixtures/feedback/edited.md"));
    }

    #[test]
    fn locate_finds_a_single_line_quote() {
        assert_eq!(
            locate_quote(TEXT, "Roll back by flag."),
            Some(LineRange { start: 4, end: 4 })
        );
    }

    #[test]
    fn locate_spans_lines_and_sees_through_marks_and_markers() {
        assert_eq!(
            locate_quote(TEXT, "migration runs in three passes, and the second"),
            Some(LineRange { start: 8, end: 9 })
        );
        assert_eq!(
            locate_quote(TEXT, "Risks"),
            Some(LineRange { start: 6, end: 6 })
        );
        assert_eq!(
            locate_quote("1. first\n2) second", "second"),
            Some(LineRange { start: 2, end: 2 })
        );
    }

    #[test]
    fn locate_returns_none_when_absent_or_empty() {
        assert_eq!(locate_quote(TEXT, "not here at all"), None);
        assert_eq!(locate_quote(TEXT, "  **  "), None);
        assert_eq!(locate_quote("", "x"), None);
    }

    #[test]
    fn annotations_deserialize_from_the_frontend_shape() {
        let a: Annotation = serde_json::from_str(
            r#"{"id":"a","kind":"comment","quote":"q","body":"b","createdAt":"t"}"#,
        )
        .unwrap();
        assert_eq!(a.created_at, "t");
    }

    /// A quote past the 72-character cut, truncated by `one_line` exactly as
    /// the TypeScript `oneLine` truncates it — trailing space before the
    /// ellipsis included. 123 characters, and a contiguous word run of TEXT,
    /// so the heading also carries a multi-line range.
    const LONG_QUOTE: &str = "Ship to all users at once. Roll back by flag. Risks The migration runs in three passes, and the second pass switches reads.";

    #[test]
    fn matches_the_typescript_output_for_a_truncated_quote() {
        let out = build(
            "plan.md",
            &[ann("comment", LONG_QUOTE, "Too long.")],
            Some(TEXT),
            false,
        );
        assert_eq!(
            out,
            include_str!("../tests/fixtures/feedback/long-quote.md")
        );
    }

    /// The edges the long-quote fixture does not pin down: whitespace runs,
    /// and a quote sitting exactly on the cut, which must not be truncated.
    #[test]
    fn one_line_collapses_whitespace_and_leaves_the_boundary_alone() {
        assert_eq!(one_line("  a\n\tb   c  "), "a b c");
        assert_eq!(one_line(&"x".repeat(QUOTE_MAX)), "x".repeat(QUOTE_MAX));
        let cut = one_line(&"x".repeat(QUOTE_MAX + 1));
        assert_eq!(cut.chars().count(), QUOTE_MAX);
        assert!(cut.ends_with('…'));
    }
}
