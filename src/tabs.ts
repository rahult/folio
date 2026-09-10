/**
 * Documents open in one window, as tabs. The model is pure: which tabs
 * exist, which is active, and what each inactive tab remembers of its
 * editing state so switching back restores it. main.ts owns the editor
 * and turns activations into loads. Unit-tested.
 */

import type { CaretAnchor } from "./caretmap";
import { fileNameFromPath } from "./markdown";

/** What an inactive tab keeps of the editor: enough to come back to it
 *  with unsaved edits, caret, and scroll intact. */
export interface TabSnapshot {
  /** The document as it currently reads (unsaved edits included). */
  content: string;
  /** The last saved serialization — the dirty baseline. */
  baseline: string;
  dirty: boolean;
  scroll: number;
  anchor: CaretAnchor | null;
}

export interface Tab {
  readonly id: number;
  path: string | null;
  /** Tab label: file name or "Untitled". */
  title: string;
  /** Present while the tab is inactive; the active tab's state lives in
   *  the editor. */
  snapshot: TabSnapshot | null;
}

let nextId = 1;

function makeTab(path: string | null): Tab {
  return { id: nextId++, path, title: path ? fileNameFromPath(path) : "Untitled", snapshot: null };
}

export class TabList {
  private tabs: Tab[] = [makeTab(null)];
  private current = 0;

  get all(): readonly Tab[] {
    return this.tabs;
  }

  get active(): Tab {
    return this.tabs[this.current];
  }

  get activeIndex(): number {
    return this.current;
  }

  /** Store the active tab's editor state before leaving it. */
  remember(snapshot: TabSnapshot): void {
    this.active.snapshot = snapshot;
  }

  /**
   * The tab for `path`: an existing one (activated), or a new one placed
   * after the active tab. A clean untitled active tab is taken over
   * instead, so the first open never leaves an empty tab behind.
   */
  open(path: string): Tab {
    const existing = this.tabs.find((t) => t.path === path);
    if (existing) {
      this.activate(existing.id);
      return existing;
    }
    const active = this.active;
    if (active.path === null && !(active.snapshot?.dirty ?? false)) {
      active.path = path;
      active.title = fileNameFromPath(path);
      active.snapshot = null;
      return active;
    }
    const tab = makeTab(path);
    this.tabs.splice(this.current + 1, 0, tab);
    this.current += 1;
    return tab;
  }

  /** A fresh untitled tab after the active one, activated. */
  addUntitled(): Tab {
    const tab = makeTab(null);
    this.tabs.splice(this.current + 1, 0, tab);
    this.current += 1;
    return tab;
  }

  activate(id: number): boolean {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index === -1) return false;
    this.current = index;
    return true;
  }

  /** Move to the next (+1) or previous (-1) tab, wrapping. */
  step(delta: 1 | -1): void {
    const n = this.tabs.length;
    this.current = (this.current + delta + n) % n;
  }

  /** Remove a tab; the neighbour to the right (or left, at the end)
   *  becomes active. The last tab cannot be closed. */
  close(id: number): boolean {
    if (this.tabs.length === 1) return false;
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index === -1) return false;
    this.tabs.splice(index, 1);
    if (index < this.current) this.current -= 1;
    else if (index === this.current) this.current = Math.min(index, this.tabs.length - 1);
    return true;
  }

  /** After Save As: the tab now belongs to `path`. */
  setPath(id: number, path: string): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    tab.path = path;
    tab.title = fileNameFromPath(path);
  }
}
