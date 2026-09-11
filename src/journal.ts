/**
 * The decision journal: one Markdown file across documents
 * (`~/Documents/Folio/decisions.md` by default) with a line per recorded
 * decision, so revisits can be found without scanning folders and the
 * record outlives any one project. Pure and DOM-free.
 */

import type { Revisit } from "./decisionfile";

export interface JournalEntry {
  date: string;
  docPath: string;
  docName: string;
  choice: string;
  confidence: number | null;
  reversible: boolean | null;
  revisit: string;
}

export const JOURNAL_HEADER = "# Decisions\n\nOne line per decision recorded in Folio. Revisit entries live in each document's .decision.md.\n";

export function journalEntryLine(entry: JournalEntry): string {
  const parts = [
    entry.date,
    `[${entry.docName}](${entry.docPath})`,
    entry.choice.replace(/\s+/g, " ").trim() || "(no choice recorded)",
    entry.confidence === null ? "—" : `${entry.confidence}%`,
    entry.reversible === null ? "—" : entry.reversible ? "reversible" : "irreversible",
    `revisit ${entry.revisit || "—"}`,
  ];
  return `- ${parts.join(" · ")}`;
}

const LINE = /^- (\d{4}-\d{2}-\d{2}) · \[([^\]]*)\]\(([^)]*)\) · (.*?) · (\d+%|—) · (reversible|irreversible|—) · revisit (\S+)$/;

export function parseJournal(text: string): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const raw of text.split("\n")) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    out.push({
      date: m[1],
      docName: m[2],
      docPath: m[3],
      choice: m[4],
      confidence: m[5] === "—" ? null : Number.parseInt(m[5], 10),
      reversible: m[6] === "—" ? null : m[6] === "reversible",
      revisit: m[7] === "—" ? "" : m[7],
    });
  }
  return out;
}

/** Entries whose revisit date is on or before `today` and whose document
 *  has no revisit recorded on or after that date. `revisitsFor` reads the
 *  document's decision file. */
export function dueRevisits(
  entries: JournalEntry[],
  today: string,
  revisitsFor: (docPath: string) => Revisit[],
): JournalEntry[] {
  return entries.filter((entry) => {
    if (!entry.revisit || entry.revisit > today) return false;
    return !revisitsFor(entry.docPath).some((r) => r.date >= entry.revisit);
  });
}
