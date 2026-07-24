/**
 * Maps native menu item ids (built in src-tauri/src/lib.rs and received
 * via the "menu" Tauri event) to frontend actions. Pure and DOM-free so
 * the mapping is unit-testable.
 */

import type { EditorCommand } from "./commands";
import type { ZoomDirection } from "./zoom";

export type MenuAction =
  | { kind: "new-file" }
  | { kind: "open-file" }
  | { kind: "save-file" }
  | { kind: "save-file-as" }
  | { kind: "toggle-source-mode" }
  | { kind: "zoom"; direction: ZoomDirection }
  | { kind: "editor-command"; command: EditorCommand };

const EDITOR_COMMAND_IDS: Record<string, EditorCommand> = {
  "paragraph.heading-1": "heading-1",
  "paragraph.heading-2": "heading-2",
  "paragraph.heading-3": "heading-3",
  "paragraph.heading-4": "heading-4",
  "paragraph.heading-5": "heading-5",
  "paragraph.heading-6": "heading-6",
  "paragraph.paragraph": "paragraph",
  "paragraph.heading-up": "heading-up",
  "paragraph.heading-down": "heading-down",
  "paragraph.table": "table",
  "paragraph.code-fence": "code-fence",
  "paragraph.quote": "quote",
  "paragraph.ordered-list": "ordered-list",
  "paragraph.unordered-list": "bullet-list",
  "paragraph.task-list": "task-list",
  "paragraph.hr": "hr",
  "format.strong": "strong",
  "format.emphasis": "emphasis",
  "format.code": "inline-code",
  "format.strike": "strike",
  "format.link": "link",
  "format.clear": "clear-format",
};

/** Resolve a native menu item id to an action, or null if it is not ours. */
export function actionForMenuId(id: string): MenuAction | null {
  const command = EDITOR_COMMAND_IDS[id];
  if (command) return { kind: "editor-command", command };

  switch (id) {
    case "file.new":
      return { kind: "new-file" };
    case "file.open":
      return { kind: "open-file" };
    case "file.save":
      return { kind: "save-file" };
    case "file.save-as":
      return { kind: "save-file-as" };
    case "view.source-mode":
      return { kind: "toggle-source-mode" };
    case "view.zoom-in":
      return { kind: "zoom", direction: "in" };
    case "view.zoom-out":
      return { kind: "zoom", direction: "out" };
    case "view.zoom-reset":
      return { kind: "zoom", direction: "reset" };
    default:
      return null;
  }
}
