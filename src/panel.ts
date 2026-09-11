/**
 * The reading panel: the right-hand column with an Outline tab (takeaway,
 * reading stats, headings) and an Annotations tab. This module owns the
 * panel's DOM and open/tab state; main.ts supplies the data and handles
 * navigation and saving through the callbacks.
 */

import type { OutlineEntry } from "./outline";

export type PanelTab = "outline" | "annotations" | "history" | "analysis" | "decide";

const TAB_KEY = "folio-panel-tab";

const panel = document.querySelector<HTMLElement>("#panel")!;
const tabButtons: Record<PanelTab, HTMLButtonElement> = {
  outline: document.querySelector<HTMLButtonElement>("#panel-tab-outline")!,
  annotations: document.querySelector<HTMLButtonElement>("#panel-tab-annotations")!,
  history: document.querySelector<HTMLButtonElement>("#panel-tab-history")!,
  analysis: document.querySelector<HTMLButtonElement>("#panel-tab-analysis")!,
  decide: document.querySelector<HTMLButtonElement>("#panel-tab-decide")!,
};
const tabPanels: Record<PanelTab, HTMLElement> = {
  outline: document.querySelector<HTMLElement>("#panel-outline")!,
  annotations: document.querySelector<HTMLElement>("#panel-annotations")!,
  history: document.querySelector<HTMLElement>("#panel-history")!,
  analysis: document.querySelector<HTMLElement>("#panel-analysis")!,
  decide: document.querySelector<HTMLElement>("#panel-decide")!,
};
const analysisRoot = document.querySelector<HTMLElement>("#analysis-root")!;
const decideRoot = document.querySelector<HTMLElement>("#decide-root")!;
const historyList = document.querySelector<HTMLOListElement>("#history-list")!;
const closeBtn = document.querySelector<HTMLButtonElement>("#panel-close")!;
export const takeawayField = document.querySelector<HTMLTextAreaElement>("#takeaway")!;
const statsEl = document.querySelector<HTMLElement>("#reading-stats")!;
const outlineList = document.querySelector<HTMLOListElement>("#outline-list")!;

let open = false;
let tab: PanelTab = restoreTab();
let changeListeners: Array<() => void> = [];
let pickHandler: ((entry: OutlineEntry) => void) | null = null;
let entries: OutlineEntry[] = [];
/** Row highlighted by the keyboard while the list has focus. */
let cursor = -1;

function restoreTab(): PanelTab {
  try {
    const stored = localStorage.getItem(TAB_KEY);
    return stored === "annotations" || stored === "history" || stored === "analysis" || stored === "decide"
      ? stored
      : "outline";
  } catch {
    return "outline";
  }
}

function render(): void {
  panel.hidden = !open;
  for (const key of Object.keys(tabButtons) as PanelTab[]) {
    const active = key === tab;
    tabButtons[key].setAttribute("aria-selected", String(active));
    tabPanels[key].hidden = !active;
  }
  for (const cb of changeListeners) cb();
}

export function isPanelOpen(): boolean {
  return open;
}

export function activeTab(): PanelTab {
  return tab;
}

export function setTab(next: PanelTab): void {
  tab = next;
  try {
    localStorage.setItem(TAB_KEY, next);
  } catch {
    // storage unavailable — the tab just won't persist
  }
  render();
}

export function openPanel(next?: PanelTab): void {
  open = true;
  if (next) setTab(next);
  else render();
}

export function closePanel(): void {
  open = false;
  render();
}

/** Open on `next` (or the last tab); close when already open on it. */
export function togglePanel(next?: PanelTab): void {
  if (open && (next === undefined || next === tab)) closePanel();
  else openPanel(next);
}

/** Called after every open/close/tab change. */
export function onPanelChange(cb: () => void): void {
  changeListeners = [...changeListeners, cb];
}

export function onOutlinePick(cb: (entry: OutlineEntry) => void): void {
  pickHandler = cb;
}

/** Repaint the outline; `current` is the section index under the caret. */
export function renderOutline(next: OutlineEntry[], current: number): void {
  entries = next;
  cursor = current;
  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "outline-empty";
    empty.textContent = "No headings";
    outlineList.replaceChildren(empty);
    return;
  }
  outlineList.replaceChildren(
    ...entries.map((entry) => {
      const li = document.createElement("li");
      li.dataset.level = String(entry.level);
      li.style.setProperty("--level", String(entry.level));
      if (entry.index === current) li.setAttribute("aria-current", "true");
      const text = document.createElement("span");
      text.className = "outline-text";
      text.textContent = entry.text || "(untitled)";
      const min = document.createElement("span");
      min.className = "outline-min";
      min.textContent = entry.words > 0 ? `${Math.max(1, Math.ceil(entry.words / 230))} min` : "";
      li.append(text, min);
      li.addEventListener("click", () => pickHandler?.(entry));
      return li;
    }),
  );
  scrollCurrentIntoView();
}

/** Move the current-section marker without rebuilding the rows — a
 *  rebuild mid-click would detach the row before its click event fires. */
export function setCurrentOutline(current: number): void {
  cursor = current;
  Array.from(outlineList.children).forEach((li, i) => {
    if (i === current && entries.length > 0) li.setAttribute("aria-current", "true");
    else li.removeAttribute("aria-current");
  });
  scrollCurrentIntoView();
}

function scrollCurrentIntoView(): void {
  const row = outlineList.querySelector<HTMLElement>('[aria-current="true"]');
  row?.scrollIntoView({ block: "nearest" });
}

export function renderStats(words: number, minutes: number): void {
  const parts = [`${words.toLocaleString()} ${words === 1 ? "word" : "words"}`];
  if (minutes > 0) parts.push(`${minutes} min`);
  statsEl.textContent = parts.join(" · ");
}

export function setTakeaway(text: string): void {
  takeawayField.value = text;
}

export function setTakeawayEnabled(enabled: boolean, placeholder: string): void {
  takeawayField.disabled = !enabled;
  takeawayField.placeholder = placeholder;
}

export function markTakeawaySaveFailed(failed: boolean): void {
  takeawayField.classList.toggle("save-failed", failed);
  takeawayField.title = failed ? "Could not save the takeaway beside the document" : "";
}

// ——— wiring ———

for (const key of Object.keys(tabButtons) as PanelTab[]) {
  tabButtons[key].addEventListener("click", () => setTab(key));
}
closeBtn.addEventListener("click", closePanel);

/** Keyboard in the outline: arrows move the highlight, Enter navigates,
 *  Escape hands focus back to the document (main.ts listens for blur). */
outlineList.addEventListener("keydown", (e) => {
  if (entries.length === 0) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const delta = e.key === "ArrowDown" ? 1 : -1;
    cursor = Math.min(entries.length - 1, Math.max(0, cursor + delta));
    for (const li of outlineList.children) li.removeAttribute("aria-current");
    outlineList.children[cursor]?.setAttribute("aria-current", "true");
    scrollCurrentIntoView();
  } else if (e.key === "Enter" && cursor >= 0) {
    e.preventDefault();
    pickHandler?.(entries[cursor]);
  } else if (e.key === "Escape") {
    e.preventDefault();
    outlineList.blur();
  }
});

// ——— history tab ———

export interface HistoryEntry {
  seq: number;
  /** Unix seconds. */
  archivedAt: number;
  label: string;
  /** For a revision: each change request and whether its passage changed. */
  outcomes: { kind: string; quote: string; changed: boolean }[] | null;
}

/** Repaint the History tab; `onPick` shows a revision's diff. */
export function renderHistory(entries: HistoryEntry[], onPick: (seq: number) => void): void {
  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = "No revisions yet — versions are archived as the file is saved, rewritten, or reviewed.";
    historyList.replaceChildren(empty);
    return;
  }
  historyList.replaceChildren(
    ...entries.map((entry) => {
      const li = document.createElement("li");
      li.className = "history-entry";
      const head = document.createElement("button");
      head.type = "button";
      head.className = "history-head";
      head.title = "Show what changed between this version and now";
      const when = document.createElement("span");
      when.className = "history-when";
      when.textContent = new Date(entry.archivedAt * 1000).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const label = document.createElement("span");
      label.className = "history-label";
      label.textContent = entry.label;
      head.append(when, label);
      head.addEventListener("click", () => onPick(entry.seq));
      li.append(head);
      if (entry.outcomes) {
        const changed = entry.outcomes.filter((o) => o.changed).length;
        const summary = document.createElement("div");
        summary.className = "history-summary";
        summary.textContent = `${changed} of ${entry.outcomes.length} requested passages changed`;
        li.append(summary);
        const list = document.createElement("ul");
        list.className = "history-requests";
        for (const outcome of entry.outcomes) {
          const row = document.createElement("li");
          row.className = outcome.changed ? "changed" : "unchanged";
          const mark = document.createElement("span");
          mark.className = "history-mark";
          mark.textContent = outcome.changed ? "✓" : "–";
          const kind = document.createElement("span");
          kind.className = "history-kind";
          kind.textContent = outcome.kind;
          const quote = document.createElement("span");
          quote.className = "history-quote";
          quote.textContent = outcome.quote;
          row.append(mark, kind, quote);
          list.append(row);
        }
        li.append(list);
      }
      return li;
    }),
  );
}

// ——— decide tab ———
//
// The thinking the reader does before and after a verdict: recall in their
// own words, a premortem, three debiasing questions, then the decision
// record — with a confidence that locks once recorded — and revisits.
// Everything is optional and nothing is graded; the value is in the
// reader producing each sentence.

export interface DecideModel {
  enabled: boolean;
  headings: string[];
  recall: Map<string, string>;
  premortem: string;
  checked: Set<string>;
  checklistItems: readonly string[];
  decision: {
    choice: string;
    reversible: boolean | null;
    confidence: number | null;
    reasons: string;
    decided: string;
    revisit: string;
  } | null;
  revisits: { date: string; outcome: string; note: string }[];
  /** Other documents whose revisit date has passed. */
  due: { docName: string; docPath: string; revisit: string }[];
  journalPath: string;
}

export interface DecideHandlers {
  onRecall(heading: string, text: string): void;
  onPremortem(text: string): void;
  onChecklist(item: string, checked: boolean): void;
  onRecord(record: { choice: string; reversible: boolean | null; confidence: number; reasons: string; revisit: string }): void;
  onRevisit(entry: { outcome: string; note: string }): void;
  onOpen(docPath: string): void;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "decide-field";
  const span = document.createElement("span");
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}

function h(text: string): HTMLElement {
  const el = document.createElement("h3");
  el.className = "decide-h";
  el.textContent = text;
  return el;
}

function note(text: string): HTMLElement {
  const el = document.createElement("p");
  el.className = "decide-note";
  el.textContent = text;
  return el;
}

function debounced(fn: () => void, ms = 800): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function renderDecide(model: DecideModel, on: DecideHandlers): void {
  const root = decideRoot;
  root.replaceChildren();
  if (!model.enabled) {
    root.append(note("Save the document to keep a decision beside it."));
    return;
  }

  if (model.due.length > 0) {
    root.append(h("Due for revisit"));
    const list = document.createElement("ul");
    list.className = "decide-due";
    for (const item of model.due) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "decide-link";
      btn.textContent = `${item.docName} — was due ${item.revisit}`;
      btn.addEventListener("click", () => on.onOpen(item.docPath));
      li.append(btn);
      list.append(li);
    }
    root.append(list);
  }

  // Recall
  root.append(h("Recall"), note("One line per section, from memory, in your own words."));
  const headings = model.headings.slice(0, 24);
  if (headings.length === 0) root.append(note("No headings to recall."));
  for (const heading of headings) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "decide-input";
    input.value = model.recall.get(heading) ?? "";
    input.placeholder = "What did this section say?";
    const save = debounced(() => on.onRecall(heading, input.value));
    input.addEventListener("input", save);
    input.addEventListener("blur", () => on.onRecall(heading, input.value));
    root.append(field(heading, input));
  }

  // Premortem
  root.append(h("Premortem"));
  const pre = document.createElement("textarea");
  pre.className = "decide-textarea";
  pre.rows = 3;
  pre.placeholder = "It is six months on and this went badly. What happened?";
  pre.value = model.premortem;
  const savePre = debounced(() => on.onPremortem(pre.value));
  pre.addEventListener("input", savePre);
  pre.addEventListener("blur", () => on.onPremortem(pre.value));
  root.append(pre);

  // Checklist
  root.append(h("Before deciding"));
  const list = document.createElement("ul");
  list.className = "decide-checklist";
  for (const item of model.checklistItems) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = model.checked.has(item);
    box.addEventListener("change", () => on.onChecklist(item, box.checked));
    const text = document.createElement("span");
    text.textContent = item;
    label.append(box, text);
    li.append(label);
    list.append(li);
  }
  root.append(list);

  // Decision
  root.append(h("Decision"));
  const d = model.decision;
  if (d && d.confidence !== null) {
    const dl = document.createElement("dl");
    dl.className = "decide-record";
    const row = (k: string, v: string) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v || "—";
      dl.append(dt, dd);
    };
    row("Choice", d.choice);
    row("Reversible", d.reversible === null ? "" : d.reversible ? "yes" : "no");
    row("Confidence", `${d.confidence}% (recorded ${d.decided || "—"}, not editable)`);
    row("Reasons", d.reasons);
    row("Revisit", d.revisit);
    root.append(dl);

    root.append(h("Revisits"));
    if (model.revisits.length > 0) {
      const rl = document.createElement("ul");
      rl.className = "decide-revisits";
      for (const r of model.revisits) {
        const li = document.createElement("li");
        li.textContent = `${r.date} · ${r.outcome}${r.note ? ` · ${r.note}` : ""}`;
        rl.append(li);
      }
      root.append(rl);
    }
    const outcome = document.createElement("select");
    outcome.className = "decide-select";
    for (const o of ["as expected", "better", "worse"]) {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      outcome.append(opt);
    }
    const noteField = document.createElement("input");
    noteField.type = "text";
    noteField.className = "decide-input";
    noteField.placeholder = "What actually happened?";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "decide-button";
    add.textContent = "Add revisit";
    add.addEventListener("click", () => on.onRevisit({ outcome: outcome.value, note: noteField.value }));
    root.append(field("Outcome", outcome), field("Note", noteField), add);
  } else {
    const choice = document.createElement("input");
    choice.type = "text";
    choice.className = "decide-input";
    choice.placeholder = "What are you deciding?";
    choice.value = d?.choice ?? "";
    const reversible = document.createElement("select");
    reversible.className = "decide-select";
    for (const [v, label] of [["", "—"], ["yes", "yes, easy to undo"], ["no", "no, hard to undo"]]) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = label;
      reversible.append(opt);
    }
    reversible.value = d?.reversible === null || d?.reversible === undefined ? "" : d.reversible ? "yes" : "no";
    const confidence = document.createElement("input");
    confidence.type = "range";
    confidence.min = "50";
    confidence.max = "100";
    confidence.step = "5";
    confidence.value = "70";
    const confLabel = document.createElement("span");
    confLabel.className = "decide-conf";
    confLabel.textContent = "70%";
    confidence.addEventListener("input", () => {
      confLabel.textContent = `${confidence.value}%`;
    });
    const confWrap = document.createElement("div");
    confWrap.className = "decide-conf-row";
    confWrap.append(confidence, confLabel);
    const reasons = document.createElement("textarea");
    reasons.className = "decide-textarea";
    reasons.rows = 3;
    reasons.placeholder = "Why, in a sentence or two.";
    reasons.value = d?.reasons ?? "";
    const revisit = document.createElement("input");
    revisit.type = "date";
    revisit.className = "decide-input";
    revisit.value = d?.revisit || plusDays(30);
    const record = document.createElement("button");
    record.type = "button";
    record.className = "decide-button primary";
    record.textContent = "Record decision";
    record.addEventListener("click", () => {
      if (!choice.value.trim()) {
        choice.focus();
        return;
      }
      on.onRecord({
        choice: choice.value,
        reversible: reversible.value === "" ? null : reversible.value === "yes",
        confidence: Number(confidence.value),
        reasons: reasons.value,
        revisit: revisit.value,
      });
    });
    root.append(
      field("Choice", choice),
      field("Reversible", reversible),
      field("Confidence that this is right", confWrap),
      field("Reasons", reasons),
      field("Revisit on", revisit),
      note("Confidence is written once and never edited, so the revisit can compare it with what happened."),
      record,
    );
  }

  const foot = note(`Journal: ${model.journalPath}`);
  foot.className = "decide-note decide-foot";
  root.append(foot);
}

// ——— lenses (analysis) tab ———

export interface AnalysisModel {
  enabled: boolean;
  lenses: { id: string; name: string; description: string; builtin: boolean }[];
  selectedLens: string;
  /** The selected passage, or null for the whole document. */
  selection: string | null;
  running: boolean;
  status: string;
  results: { lens: string; model: string; date: string; scope: string; html: string }[];
  settings: { baseUrl: string; model: string; hasKey: boolean; open: boolean };
  lensesFolder: string;
}

export interface AnalysisHandlers {
  onSelectLens(id: string): void;
  onRun(): void;
  onToggleSettings(): void;
  onSaveSettings(settings: { baseUrl: string; model: string; key: string | null }): void;
  onOpenLensesFolder(): void;
  onAnnotate(result: { lens: string; scope: string }): void;
}

export function renderAnalysis(model: AnalysisModel, on: AnalysisHandlers): void {
  const root = analysisRoot;
  root.replaceChildren();
  if (!model.enabled) {
    root.append(note("Save the document to run a lens over it."));
    return;
  }

  // Run controls
  root.append(h("Read it through a lens"));
  const select = document.createElement("select");
  select.className = "decide-select";
  const groups: [string, typeof model.lenses][] = [
    ["Built in", model.lenses.filter((l) => l.builtin)],
    ["Yours", model.lenses.filter((l) => !l.builtin)],
  ];
  for (const [label, lenses] of groups) {
    if (lenses.length === 0) continue;
    const group = document.createElement("optgroup");
    group.label = label;
    for (const lens of lenses) {
      const opt = document.createElement("option");
      opt.value = lens.id;
      opt.textContent = lens.name;
      opt.selected = lens.id === model.selectedLens;
      group.append(opt);
    }
    select.append(group);
  }
  select.addEventListener("change", () => on.onSelectLens(select.value));
  root.append(select);
  const chosen = model.lenses.find((l) => l.id === model.selectedLens);
  if (chosen?.description) root.append(note(chosen.description));

  const scope = note(
    model.selection
      ? `On the selection: “${model.selection.replace(/\s+/g, " ").slice(0, 90)}${model.selection.length > 90 ? "…" : ""}”`
      : "On the whole document. Select a passage to focus a lens on it.",
  );
  root.append(scope);

  const run = document.createElement("button");
  run.type = "button";
  run.className = "decide-button primary";
  run.textContent = model.running ? "Running…" : "Run lens";
  run.disabled = model.running || !model.settings.baseUrl || !model.settings.model;
  run.addEventListener("click", () => on.onRun());
  root.append(run);
  if (model.status) root.append(note(model.status));

  // Results
  if (model.results.length > 0) root.append(h("Results"));
  for (const r of model.results) {
    const card = document.createElement("article");
    card.className = "lens-card";
    const head = document.createElement("div");
    head.className = "lens-head";
    const title = document.createElement("span");
    title.className = "lens-title";
    title.textContent = r.lens;
    const meta = document.createElement("span");
    meta.className = "lens-meta";
    meta.textContent = `${r.date} · ${r.model}${r.scope === "document" ? "" : " · on a passage"}`;
    head.append(title, meta);
    const body = document.createElement("div");
    body.className = "lens-body";
    body.innerHTML = r.html;
    const actions = document.createElement("div");
    actions.className = "lens-actions";
    const annotate = document.createElement("button");
    annotate.type = "button";
    annotate.className = "decide-button";
    annotate.textContent = "Turn into a comment";
    annotate.title = "Open a comment on the passage (or the document) quoting this lens";
    annotate.addEventListener("click", () => on.onAnnotate({ lens: r.lens, scope: r.scope }));
    actions.append(annotate);
    card.append(head, body, actions);
    root.append(card);
  }

  // Settings
  const settingsHead = document.createElement("button");
  settingsHead.type = "button";
  settingsHead.className = "lens-settings-toggle";
  settingsHead.textContent = model.settings.open
    ? "Model settings ▾"
    : `Model: ${model.settings.model || "not set"} · ${model.settings.baseUrl || "no endpoint"} ▸`;
  settingsHead.addEventListener("click", () => on.onToggleSettings());
  root.append(settingsHead);
  if (model.settings.open) {
    const base = document.createElement("input");
    base.type = "text";
    base.className = "decide-input";
    base.placeholder = "http://localhost:11434/v1";
    base.value = model.settings.baseUrl;
    const mdl = document.createElement("input");
    mdl.type = "text";
    mdl.className = "decide-input";
    mdl.placeholder = "llama3.2:3b";
    mdl.value = model.settings.model;
    const key = document.createElement("input");
    key.type = "password";
    key.className = "decide-input";
    key.placeholder = model.settings.hasKey ? "key stored in the keychain — leave blank to keep" : "API key (blank for local servers)";
    key.autocomplete = "off";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "decide-button primary";
    save.textContent = "Save";
    save.addEventListener("click", () =>
      on.onSaveSettings({ baseUrl: base.value.trim(), model: mdl.value.trim(), key: key.value === "" ? null : key.value }),
    );
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "decide-button";
    clear.textContent = "Forget key";
    clear.addEventListener("click", () => on.onSaveSettings({ baseUrl: base.value.trim(), model: mdl.value.trim(), key: "" }));
    const folder = document.createElement("button");
    folder.type = "button";
    folder.className = "decide-link";
    folder.textContent = `Your lenses: ${model.lensesFolder}`;
    folder.addEventListener("click", () => on.onOpenLensesFolder());
    root.append(
      field("OpenAI-compatible endpoint", base),
      field("Model", mdl),
      field("Key", key),
      note("The key is kept in the OS keychain and used only from Folio's own process; the page never sees it. Ollama and LM Studio need no key."),
      save,
      clear,
      folder,
    );
  }
}
