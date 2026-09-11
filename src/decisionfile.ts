/**
 * The decision companion file, `<doc>.decision.md`: plain Markdown beside
 * the document that records what the reader made of it. The Read stage
 * owns one section, "What I took from it"; later stages (options, choice,
 * outcome) add their own to the same file, so edits here must leave every
 * other section untouched. Pure and DOM-free.
 */

export const TAKEAWAY_HEADING = "## What I took from it";

export function decisionFilePath(docPath: string): string {
  return `${docPath}.decision.md`;
}

/** Lines [start, end) of a `## Heading` section's body, or null. `start`
 *  is the line after the heading; `end` is the next `#`/`##` line or EOF. */
function sectionBody(lines: string[], heading: string): { start: number; end: number } | null {
  const headingAt = lines.findIndex((line) => line.trimEnd() === heading);
  if (headingAt === -1) return null;
  let end = lines.length;
  for (let i = headingAt + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start: headingAt + 1, end };
}

/** A section's body, trimmed; "" when absent. */
export function readSection(fileText: string, heading: string): string {
  const lines = fileText.split("\n");
  const body = sectionBody(lines, heading);
  if (!body) return "";
  return lines.slice(body.start, body.end).join("\n").trim();
}

function skeleton(docName: string, docPath: string): string {
  return `# Decision: ${docName}\n\nDocument: ${docPath}\n`;
}

/** The order sections keep in the file, so a newly added one lands in
 *  its place rather than at the end. */
const SECTION_ORDER = [
  "## What I took from it",
  "## Recall",
  "## Premortem",
  "## Checklist",
  "## Decision",
  "## Revisits",
];

/**
 * The file with `heading`'s body set to `body`: replaced in place when the
 * section exists, otherwise inserted in canonical order. Every other line
 * is preserved byte-for-byte. `fileText` null creates the skeleton.
 */
export function writeSection(
  fileText: string | null,
  heading: string,
  body: string,
  docName = "document",
  docPath = "",
): string {
  const text = fileText ?? skeleton(docName, docPath);
  const lines = text.split("\n");
  const trimmed = body.trim();
  const section = trimmed ? [heading, "", trimmed, ""] : [heading, ""];
  const existing = sectionBody(lines, heading);
  if (existing) {
    lines.splice(existing.start, existing.end - existing.start, ...section.slice(1));
  } else {
    // Insert before the first section that comes later in canonical order.
    const rank = SECTION_ORDER.indexOf(heading);
    let at = lines.length;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      if (!/^## /.test(line)) continue;
      const other = SECTION_ORDER.indexOf(line);
      if (rank !== -1 && other !== -1 ? other > rank : other === -1) {
        at = i;
        break;
      }
    }
    const before = at > 0 && lines[at - 1] !== "" ? [""] : [];
    lines.splice(at, 0, ...before, ...section);
  }
  return normalizeEnd(lines.join("\n"));
}

/** The takeaway text, trimmed of surrounding blank lines; "" when absent. */
export function readTakeaway(fileText: string): string {
  return readSection(fileText, TAKEAWAY_HEADING);
}

/** The file text with the takeaway section set to `takeaway`. */
export function writeTakeaway(
  fileText: string | null,
  docName: string,
  docPath: string,
  takeaway: string,
): string {
  return writeSection(fileText, TAKEAWAY_HEADING, takeaway, docName, docPath);
}

/** Exactly one trailing newline, no run of blank lines at the end. */
function normalizeEnd(text: string): string {
  return `${text.replace(/\n+$/, "")}\n`;
}

// ——— recall: one line per heading, in the reader's words ———

export function parseRecall(fileText: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readSection(fileText, "## Recall").split("\n")) {
    const m = /^- \*\*(.+?)\*\*: (.+)$/.exec(line.trim());
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

export function writeRecall(
  fileText: string | null,
  docName: string,
  docPath: string,
  recall: Map<string, string>,
): string {
  const body = [...recall]
    .filter(([, text]) => text.trim())
    .map(([heading, text]) => `- **${heading.replace(/\*\*/g, "")}**: ${text.trim().replace(/\s+/g, " ")}`)
    .join("\n");
  return writeSection(fileText, "## Recall", body, docName, docPath);
}

// ——— checklist: the debiasing questions, each skippable ———

export const CHECKLIST_ITEMS = [
  "Considered the opposite: what would have to be true for the other option to be right?",
  "Checked the base rate: how do plans like this usually go?",
  "Asked who benefits: whose incentives shaped this document?",
] as const;

export function parseChecklist(fileText: string): Set<string> {
  const out = new Set<string>();
  for (const line of readSection(fileText, "## Checklist").split("\n")) {
    const m = /^- \[x\] (.+)$/i.exec(line.trim());
    if (m) out.add(m[1]);
  }
  return out;
}

export function writeChecklist(
  fileText: string | null,
  docName: string,
  docPath: string,
  checked: Set<string>,
): string {
  const body = CHECKLIST_ITEMS.map((item) => `- [${checked.has(item) ? "x" : " "}] ${item}`).join("\n");
  return writeSection(fileText, "## Checklist", body, docName, docPath);
}

// ——— the decision record ———

export interface DecisionRecord {
  choice: string;
  reversible: boolean | null;
  /** Percent, 50–100. Written once; the UI never lets it be edited. */
  confidence: number | null;
  reasons: string;
  /** YYYY-MM-DD */
  decided: string;
  /** YYYY-MM-DD */
  revisit: string;
}

export function parseDecision(fileText: string): DecisionRecord | null {
  const body = readSection(fileText, "## Decision");
  if (!body) return null;
  const fields = new Map<string, string>();
  for (const line of body.split("\n")) {
    const m = /^- ([A-Za-z]+): (.*)$/.exec(line.trim());
    if (m) fields.set(m[1].toLowerCase(), m[2].trim());
  }
  const rev = fields.get("reversible");
  const conf = fields.get("confidence");
  return {
    choice: fields.get("choice") ?? "",
    reversible: rev === undefined ? null : /^yes/i.test(rev),
    confidence: conf === undefined ? null : Number.parseInt(conf, 10),
    reasons: fields.get("reasons") ?? "",
    decided: fields.get("decided") ?? "",
    revisit: fields.get("revisit") ?? "",
  };
}

export function writeDecision(
  fileText: string | null,
  docName: string,
  docPath: string,
  record: DecisionRecord,
): string {
  const lines = [
    `- Choice: ${record.choice.trim().replace(/\s+/g, " ")}`,
    `- Reversible: ${record.reversible === null ? "" : record.reversible ? "yes" : "no"}`,
    `- Confidence: ${record.confidence === null ? "" : `${record.confidence}%`}`,
    `- Reasons: ${record.reasons.trim().replace(/\s+/g, " ")}`,
    `- Decided: ${record.decided}`,
    `- Revisit: ${record.revisit}`,
  ];
  return writeSection(fileText, "## Decision", lines.join("\n"), docName, docPath);
}

// ——— revisits: what actually happened ———

export type Outcome = "better" | "as expected" | "worse";

export interface Revisit {
  date: string;
  outcome: Outcome;
  note: string;
}

export function parseRevisits(fileText: string): Revisit[] {
  const out: Revisit[] = [];
  for (const line of readSection(fileText, "## Revisits").split("\n")) {
    const m = /^- (\d{4}-\d{2}-\d{2}) \((better|as expected|worse)\):?\s*(.*)$/.exec(line.trim());
    if (m) out.push({ date: m[1], outcome: m[2] as Outcome, note: m[3].trim() });
  }
  return out;
}

export function appendRevisit(fileText: string, revisit: Revisit): string {
  const existing = readSection(fileText, "## Revisits");
  const line = `- ${revisit.date} (${revisit.outcome}): ${revisit.note.trim().replace(/\s+/g, " ")}`.trimEnd();
  const body = existing ? `${existing}\n${line}` : line;
  return writeSection(fileText, "## Revisits", body);
}
