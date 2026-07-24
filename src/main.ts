import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { DocumentState } from "./document";
import { MarkdownEditor } from "./editor";
import { normalizeMarkdown } from "./markdown";
import { actionForMenuId, type MenuAction } from "./menu";
import { nextZoom, type ZoomDirection } from "./zoom";

const doc = new DocumentState();

const titleEl = document.querySelector<HTMLSpanElement>("#doc-title")!;
const pathEl = document.querySelector<HTMLSpanElement>("#doc-path")!;
const wordCountEl = document.querySelector<HTMLSpanElement>("#word-count")!;
const openBtn = document.querySelector<HTMLButtonElement>("#open-btn")!;
const saveBtn = document.querySelector<HTMLButtonElement>("#save-btn")!;
const editorRoot = document.querySelector<HTMLElement>("#editor")!;
const sourceEditor = document.querySelector<HTMLTextAreaElement>("#source-editor")!;

function displayPath(path: string | null): string {
  if (!path) return "";
  // Abbreviate the user's home directory for readability.
  const match = path.match(/^\/Users\/[^/]+/);
  return match ? `~${path.slice(match[0].length)}` : path;
}

function countWords(markdown: string): number {
  return markdown
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

const editor = new MarkdownEditor(editorRoot, (markdown) => {
  doc.updateDirty(markdown);
  wordCountEl.textContent = `${countWords(markdown)} words`;
  renderTitle();
});

function renderTitle(): void {
  titleEl.textContent = doc.fileName;
  document.body.classList.toggle("is-dirty", doc.dirty);
  document.title = doc.displayTitle;
  pathEl.textContent = displayPath(doc.filePath);
}

/** The markdown the user is currently editing, from whichever view is live. */
function currentMarkdown(): string {
  return sourceMode ? sourceEditor.value : editor.getMarkdown();
}

/** Put content into whichever view is live and reset the dirty baseline. */
async function loadContent(content: string, path: string | null): Promise<void> {
  if (sourceMode) {
    sourceEditor.value = content;
    doc.load(path, content);
  } else {
    await editor.setContent(content);
    // The dirty baseline is the editor's serialized markdown, not the raw
    // file text: Milkdown normalizes formatting (list markers, spacing), so
    // a file would otherwise count as modified the moment it is opened.
    doc.load(path, editor.getMarkdown());
  }
  wordCountEl.textContent = `${countWords(content)} words`;
  renderTitle();
}

async function openFile(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }],
  });
  if (typeof selected !== "string") return;

  const raw = await invoke<string>("read_text_file", { path: selected });
  await loadContent(normalizeMarkdown(raw), selected);
}

async function saveFile(saveAs = false): Promise<void> {
  let path = doc.filePath;
  if (saveAs || path === null) {
    const selected = await save({
      defaultPath: doc.filePath ?? "untitled.md",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (selected === null) return;
    path = selected;
  }

  const content = currentMarkdown();
  await invoke("write_text_file", { path, contents: content });
  doc.setPath(path);
  doc.markSaved(content);
  renderTitle();
}

async function newFile(): Promise<void> {
  if (doc.dirty) {
    const discard = await confirm(
      "You have unsaved changes. Discard them and start a new document?",
      { title: "New Document", kind: "warning", okLabel: "Discard", cancelLabel: "Cancel" },
    );
    if (!discard) return;
  }
  await loadContent("", null);
}

// ——— source code mode ———

let sourceMode = false;

async function enterSourceMode(): Promise<void> {
  sourceEditor.value = editor.getMarkdown();
  sourceMode = true;
  document.body.classList.add("source-mode");
  editorRoot.hidden = true;
  sourceEditor.hidden = false;
  sourceEditor.focus();
}

async function exitSourceMode(): Promise<void> {
  const markdown = sourceEditor.value;
  sourceMode = false;
  document.body.classList.remove("source-mode");
  sourceEditor.hidden = true;
  editorRoot.hidden = false;
  await editor.setContent(markdown);
  // Round-tripping through Milkdown normalizes the text; the dirty flag
  // must reflect the editor's serialized form, not the raw textarea text.
  doc.updateDirty(editor.getMarkdown());
  renderTitle();
}

function toggleSourceMode(): Promise<void> {
  return sourceMode ? exitSourceMode() : enterSourceMode();
}

// Typing in the source view is a document edit like any other.
sourceEditor.addEventListener("input", () => {
  doc.updateDirty(sourceEditor.value);
  wordCountEl.textContent = `${countWords(sourceEditor.value)} words`;
  renderTitle();
});

// ——— zoom ———

let zoom = 1;

function applyZoom(direction: ZoomDirection): void {
  zoom = nextZoom(zoom, direction);
  document.documentElement.style.setProperty("--zoom", String(zoom));
}

// ——— native menu dispatch ———

async function runMenuAction(action: MenuAction): Promise<void> {
  switch (action.kind) {
    case "new-file":
      return newFile();
    case "open-file":
      return openFile();
    case "save-file":
      return saveFile();
    case "save-file-as":
      return saveFile(true);
    case "toggle-source-mode":
      return toggleSourceMode();
    case "zoom":
      applyZoom(action.direction);
      return;
    case "editor-command":
      // Formatting commands operate on the WYSIWYG document only.
      if (!sourceMode) editor.runCommand(action.command);
      return;
  }
}

void listen<string>("menu", (event) => {
  const action = actionForMenuId(event.payload);
  if (action) void runMenuAction(action);
});

// ——— toolbar + fallback shortcuts (dev in browser has no native menu) ———

openBtn.addEventListener("click", () => void openFile());
saveBtn.addEventListener("click", () => void saveFile());

window.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const key = e.key.toLowerCase();
  if (key === "o") {
    e.preventDefault();
    void openFile();
  } else if (key === "s") {
    e.preventDefault();
    void saveFile(e.shiftKey);
  }
});

void editor.create("").then(renderTitle);
