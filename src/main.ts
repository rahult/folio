import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { DocumentState } from "./document";
import { MarkdownEditor } from "./editor";
import { normalizeMarkdown } from "./markdown";

const doc = new DocumentState();

const titleEl = document.querySelector<HTMLSpanElement>("#doc-title")!;
const openBtn = document.querySelector<HTMLButtonElement>("#open-btn")!;
const saveBtn = document.querySelector<HTMLButtonElement>("#save-btn")!;
const editorRoot = document.querySelector<HTMLElement>("#editor")!;

const editor = new MarkdownEditor(editorRoot, (markdown) => {
  doc.updateDirty(markdown);
  renderTitle();
});

function renderTitle(): void {
  titleEl.textContent = doc.displayTitle;
  document.title = doc.displayTitle;
}

async function openFile(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }],
  });
  if (typeof selected !== "string") return;

  const raw = await invoke<string>("read_text_file", { path: selected });
  const content = normalizeMarkdown(raw);
  doc.load(selected, content);
  await editor.setContent(content);
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
