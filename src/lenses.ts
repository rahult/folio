/**
 * Lenses: mental models a document (or a passage of it) is read through
 * by a model the user brings. Each lens is a prompt; built-in ones live
 * here, custom ones are Markdown files with a small frontmatter. Results
 * are appended to `<doc>.analysis.md` as `## Lens:` sections. Pure and
 * DOM-free; the request goes through Rust.
 */

export interface Lens {
  id: string;
  name: string;
  description: string;
  prompt: string;
  builtin: boolean;
}

const OUTPUT_RULES = `Write in plain Markdown with short headings and bullet points. Be concrete: quote or
name the specific parts of the document you are reacting to. Say so plainly when the document
does not give you enough to judge. Never invent facts about the author's situation. Do not
restate the document. Keep it under 500 words.`;

export const BUILTIN_LENSES: Lens[] = [
  {
    id: "council",
    name: "Council of experts",
    description: "Five specialists read it, each with a verdict and their strongest objection.",
    builtin: true,
    prompt: `You are a council of five reviewers reading the same document: a sceptical senior engineer,
the customer or end user it affects, a finance lead who owns the budget, a security and risk
officer, and the person who will maintain this in three years. For each reviewer give a
one-line verdict and their single strongest objection, in their own voice. Then a final section
"Where they disagree" naming the two or three points of real disagreement and what evidence
would settle each. Do not let the council agree for the sake of it.`,
  },
  {
    id: "second-order",
    name: "Second-order effects",
    description: "And then what? Consequences of the consequences, by horizon and by who bears them.",
    builtin: true,
    prompt: `Read the document for what it proposes and trace consequences beyond the first order. For
each significant proposal: the first-order effect it intends, then the second-order effects
(what happens because that happened) and third-order where they matter. For each effect say
who bears it, over what time horizon, and whether the document acknowledges it. End with the
two effects most likely to surprise the author.`,
  },
  {
    id: "two-way-door",
    name: "Two-way door",
    description: "Which decisions here are reversible, which are not, and does the process match?",
    builtin: true,
    prompt: `Classify every decision the document makes or implies as a two-way door (reversible at low
cost) or a one-way door (hard or costly to undo). For each one-way door: what makes it hard to
reverse, and is there a cheap change that would turn it into a two-way door. Then judge whether
the document is spending deliberation where it belongs: too much ceremony on reversible calls,
or too little on irreversible ones. Be specific about which decisions.`,
  },
  {
    id: "working-backwards",
    name: "Working backwards",
    description: "Draft the press release and FAQ this proposal would need, and what's missing to write it.",
    builtin: true,
    prompt: `Work backwards from the customer. Draft a short internal press release (headline, one
paragraph, a customer quote) and an FAQ of the five hardest questions for what the document
proposes, as if it had shipped. Where the document does not give you enough to write a line
honestly, write "[missing: …]" in its place instead of inventing it. End with the list of
things that were missing.`,
  },
  {
    id: "premortem",
    name: "Premortem",
    description: "It is six months on and this failed. The most likely reasons, and the early signs.",
    builtin: true,
    prompt: `Assume it is six months after this document was acted on and it has clearly failed. Working
backwards from that failure, list the five most likely causes in order of likelihood, each
with the earliest observable warning sign and the cheapest thing that could be done now to
guard against it. Prefer causes that are already visible in the document over generic ones.`,
  },
  {
    id: "inversion",
    name: "Inversion",
    description: "What would guarantee failure, and how much of that is already present?",
    builtin: true,
    prompt: `Invert the goal: instead of asking how this succeeds, list what would guarantee it fails.
Then go through the document and mark which of those failure conditions are already present,
partly present, or absent, quoting the relevant passages. End with the single condition that
most needs removing.`,
  },
  {
    id: "steelman",
    name: "Steelman and strawman",
    description: "The strongest case for the recommendation, and the strongest case against, side by side.",
    builtin: true,
    prompt: `Identify the document's central recommendation. Write the strongest honest case for it that
a thoughtful supporter would make, then the strongest honest case against it that a thoughtful
opponent would make, of similar length, each in its own section. Do not weaken either side.
Finish with what a reader would need to know to choose between them.`,
  },
  {
    id: "assumptions",
    name: "Load-bearing assumptions",
    description: "The assumptions everything rests on, and the cheapest test for each.",
    builtin: true,
    prompt: `List the assumptions the document depends on but does not prove, ranked by how much would
collapse if each turned out false. For each: where in the document it is relied on, how
confident the author seems, and the cheapest experiment, question, or data pull that would test
it. Distinguish assumptions the document states from ones it makes silently.`,
  },
];

/** A custom lens from `~/Documents/Folio/lenses/<file>.md`: optional
 *  frontmatter with `name` and `description`, body is the prompt. */
export function parseLensFile(fileStem: string, text: string): Lens {
  let name = fileStem;
  let description = "";
  let body = text;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    body = text.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const m = /^(\w+):\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      if (m[1] === "name") name = m[2].trim() || name;
      if (m[1] === "description") description = m[2].trim();
    }
  }
  return { id: `custom:${fileStem}`, name, description, prompt: body.trim(), builtin: false };
}

export interface LensMessages {
  system: string;
  user: string;
}

/** The two messages for a lens over a document, or over a selected passage
 *  with the document as context. */
export function buildLensMessages(
  lens: Lens,
  docName: string,
  docText: string,
  selection: string | null,
): LensMessages {
  const system = `${lens.prompt.trim()}\n\n${OUTPUT_RULES}`;
  const focus = selection?.trim();
  const user = focus
    ? `The passage under review, from "${docName}":\n\n${focus}\n\n---\n\nThe whole document, for context only:\n\n${docText}`
    : `The document, "${docName}":\n\n${docText}`;
  return { system, user };
}

// ——— the analysis file ———

export interface LensResultEntry {
  lens: string;
  model: string;
  /** YYYY-MM-DD */
  date: string;
  /** "document", or the passage the lens ran on. */
  scope: string;
  body: string;
}

const ENTRY_HEADING = /^## Lens: (.+?) — (\d{4}-\d{2}-\d{2}) — (.+)$/;

/** Headings inside a result are pushed down so they cannot collide with
 *  the file's own `##` entry headings. */
function demote(body: string): string {
  return body
    .split("\n")
    .map((line) => (/^#{1,6} /.test(line) ? `##${line}` : line))
    .join("\n")
    .trim();
}

export function appendLensResult(
  fileText: string | null,
  docName: string,
  docPath: string,
  entry: LensResultEntry,
): string {
  const head = fileText ?? `# Analysis: ${docName}\n\nDocument: ${docPath}\n`;
  const scopeLine = entry.scope === "document" ? "Scope: the whole document" : `Scope: "${entry.scope.replace(/\s+/g, " ").trim().slice(0, 160)}"`;
  const section = [
    `## Lens: ${entry.lens} — ${entry.date} — ${entry.model}`,
    "",
    scopeLine,
    "",
    demote(entry.body),
    "",
  ].join("\n");
  return `${head.replace(/\n+$/, "")}\n\n${section}`;
}

export function parseAnalysis(fileText: string): LensResultEntry[] {
  const out: LensResultEntry[] = [];
  const lines = fileText.split("\n");
  let current: LensResultEntry | null = null;
  let body: string[] = [];
  const flush = () => {
    if (!current) return;
    let text = body.join("\n").trim();
    const scope = /^Scope: (?:the whole document|"([\s\S]*?)")\n?/.exec(text);
    if (scope) {
      current.scope = scope[1] ?? "document";
      text = text.slice(scope[0].length).trim();
    }
    current.body = text;
    out.push(current);
  };
  for (const line of lines) {
    const m = ENTRY_HEADING.exec(line.trimEnd());
    if (m) {
      flush();
      current = { lens: m[1], date: m[2], model: m[3], scope: "document", body: "" };
      body = [];
    } else if (current) {
      body.push(line);
    }
  }
  flush();
  return out.reverse();
}
