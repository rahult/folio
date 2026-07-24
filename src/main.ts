import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { DocumentState } from "./document";
import { MarkdownEditor } from "./editor";
import { normalizeMarkdown } from "./markdown";

const doc = new DocumentState();

const titleEl = document.querySelector<HTMLSpanElement>("#doc-title")!;
const pathEl = document.querySelector<HTMLSpanElement>("#doc-path")!;
const wordCountEl = document.querySelector<HTMLSpanElement>("#word-count")!;
const openBtn = document.querySelector<HTMLButtonElement>("#open-btn")!;
const saveBtn = document.querySelector<HTMLButtonElement>("#save-btn")!;
const editorRoot = document.querySelector<HTMLElement>("#editor")!;

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

async function openFile(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }],
  });
  if (typeof selected !== "string") return;

  const raw = await invoke<string>("read_text_file", { path: selected });
  const content = normalizeMarkdown(raw);
  await editor.setContent(content);
  // The dirty baseline is the editor's serialized markdown, not the raw file
  // text: Milkdown normalizes formatting (list markers, spacing), so a file
  // would otherwise count as modified the moment it is opened.
  doc.load(selected, editor.getMarkdown());
  renderTitle();
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

  const content = editor.getMarkdown();
  await invoke("write_text_file", { path, contents: content });
  doc.setPath(path);
  doc.markSaved(content);
  renderTitle();
}

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
