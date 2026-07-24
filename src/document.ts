import { fileNameFromPath } from "./markdown";

/**
 * Tracks the state of the document being edited:
 * which file it belongs to and whether it has unsaved changes.
 * Pure logic — no DOM or Tauri dependencies, so it is unit-testable.
 */
export class DocumentState {
  private path: string | null = null;
  private savedContent = "";
  private isDirty = false;

  /** Absolute path of the current file, or null for an untitled document. */
  get filePath(): string | null {
    return this.path;
  }

  /** Base name shown in the toolbar ("Untitled" when there is no file). */
  get fileName(): string {
    return this.path ? fileNameFromPath(this.path) : "Untitled";
  }

  get dirty(): boolean {
    return this.isDirty;
  }

  /** Title shown in the toolbar: "• name.md" while there are unsaved changes. */
  get displayTitle(): string {
    return `${this.isDirty ? "• " : ""}${this.fileName}`;
  }

  /** Reset state after loading a file (or starting a new document). */
  load(path: string | null, content: string): void {
    this.path = path;
    this.savedContent = content;
    this.isDirty = false;
  }

  /** Mark the given content as persisted to disk. */
  markSaved(content: string): void {
    this.savedContent = content;
    this.isDirty = false;
  }

  /** Update the associated path (used after "Save As"). */
  setPath(path: string): void {
    this.path = path;
  }

  /** Recompute the dirty flag by comparing the current editor content
   *  with the last saved content. */
  updateDirty(currentContent: string): boolean {
    this.isDirty = currentContent !== this.savedContent;
    return this.isDirty;
  }
}
