/**
 * The reading panel: the right-hand column with an Outline tab (takeaway,
 * reading stats, headings) and an Annotations tab. This module owns the
 * panel's DOM and open/tab state; main.ts supplies the data and handles
 * navigation and saving through the callbacks.
 */

import type { OutlineEntry } from "./outline";

export type PanelTab = "outline" | "annotations" | "history";

const TAB_KEY = "folio-panel-tab";

const panel = document.querySelector<HTMLElement>("#panel")!;
const tabButtons: Record<PanelTab, HTMLButtonElement> = {
  outline: document.querySelector<HTMLButtonElement>("#panel-tab-outline")!,
  annotations: document.querySelector<HTMLButtonElement>("#panel-tab-annotations")!,
  history: document.querySelector<HTMLButtonElement>("#panel-tab-history")!,
};
const tabPanels: Record<PanelTab, HTMLElement> = {
  outline: document.querySelector<HTMLElement>("#panel-outline")!,
  annotations: document.querySelector<HTMLElement>("#panel-annotations")!,
  history: document.querySelector<HTMLElement>("#panel-history")!,
};
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
    return stored === "annotations" || stored === "history" ? stored : "outline";
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
