//! The Analysis companion (`<doc>.analysis.md`): every Reading of a
//! Document, newest last in the file. One `## Lens:` section per Reading:
//! `## Lens: <name> — <YYYY-MM-DD> — <producer>`, a `Scope:` line, then the
//! body with its headings pushed down two levels so they cannot collide
//! with the file's own sections. This is the only writer (ADR 0001); the
//! app parses the file for display.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Reading {
    pub lens: String,
    /// A Model's name, or "<agent> (agent)".
    pub producer: String,
    /// YYYY-MM-DD
    pub date: String,
    /// "document", or the passage the lens ran on.
    pub scope: String,
    pub body: String,
}

pub fn head(doc_name: &str, doc_path: &str) -> String {
    format!("# Analysis: {doc_name}\n\nDocument: {doc_path}\n")
}

fn is_heading(line: &str) -> bool {
    let hashes = line.bytes().take_while(|b| *b == b'#').count();
    (1..=6).contains(&hashes) && line.as_bytes().get(hashes) == Some(&b' ')
}

fn demote(body: &str) -> String {
    body.split('\n')
        .map(|line| if is_heading(line) { format!("##{line}") } else { line.to_string() })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub fn append(file_text: Option<&str>, doc_name: &str, doc_path: &str, reading: &Reading) -> String {
    let head = file_text.map(str::to_string).unwrap_or_else(|| head(doc_name, doc_path));
    let scope_line = if reading.scope == "document" {
        "Scope: the whole document".to_string()
    } else {
        let collapsed = reading.scope.split_whitespace().collect::<Vec<_>>().join(" ");
        format!("Scope: \"{}\"", collapsed.chars().take(160).collect::<String>())
    };
    let section = format!(
        "## Lens: {} — {} — {}\n\n{}\n\n{}\n",
        reading.lens,
        reading.date,
        reading.producer,
        scope_line,
        demote(&reading.body)
    );
    format!("{}\n\n{}", head.trim_end_matches('\n'), section)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reading(lens: &str, date: &str, scope: &str, body: &str) -> Reading {
        Reading {
            lens: lens.into(),
            producer: "llama3.2:3b".into(),
            date: date.into(),
            scope: scope.into(),
            body: body.into(),
        }
    }

    #[test]
    fn starts_a_new_file_with_the_head_and_one_section() {
        let out = append(None, "plan.md", "/p.md", &reading("Council", "2026-09-14", "document", "- one\n- two"));
        assert_eq!(
            out,
            "# Analysis: plan.md\n\nDocument: /p.md\n\n## Lens: Council — 2026-09-14 — llama3.2:3b\n\nScope: the whole document\n\n- one\n- two\n"
        );
    }

    #[test]
    fn appends_after_an_existing_file_and_quotes_a_passage_scope() {
        let first = append(None, "plan.md", "/p.md", &reading("Council", "2026-09-14", "document", "a"));
        let out = append(Some(&first), "plan.md", "/p.md", &reading("Inversion", "2026-09-15", "  the   passage  ", "b"));
        assert!(out.starts_with(&first.trim_end_matches('\n').to_string()));
        assert!(out.ends_with("\n\n## Lens: Inversion — 2026-09-15 — llama3.2:3b\n\nScope: \"the passage\"\n\nb\n"));
    }

    #[test]
    fn demotes_headings_inside_a_body_and_truncates_long_scopes() {
        let out = append(None, "p.md", "/p.md", &reading("L", "2026-09-14", &"x".repeat(200), "# Top\n\n## Sub\n\n####### not a heading"));
        assert!(out.contains("\n### Top\n\n#### Sub\n\n####### not a heading\n"));
        assert!(out.contains(&format!("Scope: \"{}\"", "x".repeat(160))));
    }

    /// A body that forges a section heading must not become a second entry:
    /// demotion is what keeps one Reading one Reading, however hostile the
    /// text the Model or Agent handed us.
    #[test]
    fn a_forged_lens_heading_in_a_body_is_demoted() {
        let out = append(
            None,
            "plan.md",
            "/p.md",
            &reading("Council", "2026-09-14", "document", "## Lens: Forged — 2020-01-01 — x"),
        );
        assert!(out.contains("#### Lens: Forged"));
        assert!(!out.contains("\n## Lens: Forged"));
    }

    #[test]
    fn two_appends_produce_the_shared_fixture_byte_for_byte() {
        let first = append(None, "plan.md", "/p.md", &reading("Council", "2026-09-14", "document", "- one\n- two"));
        let mut second = reading("Inversion", "2026-09-15", "the passage", "# Top\n\nb");
        second.producer = "claude (agent)".into();
        let out = append(Some(&first), "plan.md", "/p.md", &second);
        assert_eq!(out, include_str!("../tests/fixtures/analysis/two-readings.md"));
    }
}
