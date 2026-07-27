import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { confirm, message, ask, open, save } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { DocumentState } from "./document";
import { MarkdownEditor } from "./editor";
import { buildHtmlDocument, htmlExportTarget } from "./export";
import { canUse, looksLikeLicenseKey, type Feature } from "./license";
import { normalizeMarkdown } from "./markdown";
import { actionForMenuId, type MenuAction } from "./menu";
import { shouldScroll, typewriterScrollTop } from "./modes";
import { canApplyTheme, storedTheme, THEME_STORAGE_KEY, type Theme } from "./theme";
import { nextZoom, type ZoomDirection } from "./zoom";

const doc = new DocumentState();

const titleEl = document.querySelector<HTMLSpanElement>("#doc-title")!;
const pathEl = document.querySelector<HTMLSpanElement>("#doc-path")!;
const wordCountEl = document.querySelector<HTMLSpanElement>("#word-count")!;
const openBtn = document.querySelector<HTMLButtonElement>("#open-btn")!;
const saveBtn = document.querySelector<HTMLButtonElement>("#save-btn")!;
const floatBtn = document.querySelector<HTMLButtonElement>("#float-btn")!;
const editorRoot = document.querySelector<HTMLElement>("#editor")!;
const sourceEditor = document.querySelector<HTMLTextAreaElement>("#source-editor")!;
const liveBadge = document.querySelector<HTMLSpanElement>("#live-badge")!;

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

/** Read a file from disk and load it into the editor. */
async function loadFromPath(path: string): Promise<void> {
  const raw = await invoke<string>("read_text_file", { path });
  const content = normalizeMarkdown(raw);
  diskContent = content;
  await loadContent(content, path);
  syncWatch();
}

/** Run `next` after confirming when the current document has unsaved
 *  changes; a fresh/untouched document proceeds without prompting. */
async function guardDirty(next: () => Promise<void>): Promise<void> {
  if (doc.dirty) {
    const discard = await confirm(
      "You have unsaved changes. Discard them and open the other file?",
      { title: "Open File", kind: "warning", okLabel: "Discard", cancelLabel: "Cancel" },
    );
    if (!discard) return;
  }
  await next();
}

async function openFile(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }],
  });
  if (typeof selected !== "string") return;

  await loadFromPath(selected);
}

// ——— auto-update ———

/** Check GitHub Releases for a newer version. The automatic startup check
 *  (manual = false) stays silent when offline or already up to date. */
async function checkForUpdates(manual: boolean): Promise<void> {
  let update;
  try {
    update = await check();
  } catch (e) {
    if (manual) {
      await message(typeof e === "string" ? e : "Could not check for updates.", {
        title: "Check for Updates",
        kind: "error",
      });
    }
    return;
  }
  if (update === null) {
    if (manual) {
      await message("You're on the latest version of Folio.", {
        title: "Check for Updates",
        kind: "info",
      });
    }
    return;
  }
  const install = await ask(
    `Folio ${update.version} is available (you have ${update.currentVersion}). Install and relaunch?`,
    { title: "Update Available", kind: "info", okLabel: "Install", cancelLabel: "Later" },
  );
  if (!install) return;
  try {
    await update.downloadAndInstall();
  } catch (e) {
    await message(typeof e === "string" ? e : "The update failed to install.", {
      title: "Update Failed",
      kind: "error",
    });
    return;
  }
  await relaunch();
}

/** Register Folio as the default app for markdown files (macOS menu item). */
async function makeDefaultApp(): Promise<void> {
  try {
    await invoke("register_default_markdown_handler");
    await message("Markdown files will now open in Folio.", {
      title: "Default Markdown App",
      kind: "info",
    });
  } catch (e) {
    await message(typeof e === "string" ? e : "Could not set Folio as the default app.", {
      title: "Default Markdown App",
      kind: "error",
    });
  }
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
  diskContent = normalizeMarkdown(content);
  renderTitle();
  syncWatch();
}

async function newFile(): Promise<void> {
  if (doc.dirty) {
    const discard = await confirm(
      "You have unsaved changes. Discard them and start a new document?",
      { title: "New Document", kind: "warning", okLabel: "Discard", cancelLabel: "Cancel" },
    );
    if (!discard) return;
  }
  diskContent = null;
  await loadContent("", null);
  syncWatch();
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

// ——— export ———

/** Serialize every readable stylesheet (the app bundle CSS in production,
 *  Vite's injected <style> tags in dev) for inlining into the export. */
function collectCssText(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      chunks.push(Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"));
    } catch {
      // Cross-origin stylesheets are unreadable; skip them.
    }
  }
  return chunks.join("\n\n");
}

async function exportHtmlFile(): Promise<void> {
  if (!requirePro("export")) return;
  // The rendered DOM is the export source, so leave source mode first.
  if (sourceMode) await exitSourceMode();
  const html = buildHtmlDocument(doc.fileName, editor.exportHtml(), collectCssText());
  const selected = await save({
    defaultPath: htmlExportTarget(doc.filePath),
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (selected === null) return;
  await invoke("write_text_file", { path: selected, contents: html });
}

async function exportPdf(): Promise<void> {
  if (!requirePro("export")) return;
  if (sourceMode) await exitSourceMode();
  // Native print panel (macOS: Save as PDF). Print CSS hides the chrome.
  await invoke("print_document");
}

// ——— focus mode + typewriter mode ———

let focusMode = false;
let typewriterMode = false;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Push the real view-mode state to the native menu so checkmarks never
 *  drift — including after a gated (unlicensed) click. */
function syncMenuState(): void {
  void invoke("sync_menu_state", {
    focus: focusMode,
    typewriter: typewriterMode,
    theme: appliedTheme,
    floating: floatMode,
  });
}

/** Mark the top-level block containing the caret for Focus Mode. */
function markFocusBlock(): void {
  editor.withView((view) => {
    for (const el of view.dom.querySelectorAll("[data-focus-current]")) {
      el.removeAttribute("data-focus-current");
    }
    const { node } = view.domAtPos(view.state.selection.from);
    const el = node instanceof HTMLElement ? node : node.parentElement;
    const top = el?.closest(".ProseMirror > *");
    if (top) top.setAttribute("data-focus-current", "");
  });
}

function toggleFocusMode(): void {
  if (!focusMode && !requirePro("focus-mode")) {
    syncMenuState();
    return;
  }
  focusMode = !focusMode;
  document.body.classList.toggle("focus-mode", focusMode);
  if (focusMode) markFocusBlock();
  syncMenuState();
}

/** Scroll #editor so the caret sits on the typewriter line. */
function scrollCaretToTypewriterLine(): void {
  editor.withView((view) => {
    const coords = view.coordsAtPos(view.state.selection.from);
    const scrollerRect = editorRoot.getBoundingClientRect();
    const caretTop = coords.top - scrollerRect.top + editorRoot.scrollTop;
    const target = typewriterScrollTop(caretTop, scrollerRect.height);
    if (!shouldScroll(editorRoot.scrollTop, target)) return;
    editorRoot.scrollTo({
      top: target,
      behavior: reduceMotion.matches ? "auto" : "smooth",
    });
  });
}

function toggleTypewriterMode(): void {
  if (!typewriterMode && !requirePro("typewriter-mode")) {
    syncMenuState();
    return;
  }
  typewriterMode = !typewriterMode;
  document.body.classList.toggle("typewriter-mode", typewriterMode);
  if (typewriterMode) scrollCaretToTypewriterLine();
  syncMenuState();
}

// Focus dims, typewriter scrolls — both ride the same selection hook and
// compose freely. Both are no-ops in source mode.
editor.onSelectionUpdate(() => {
  if (sourceMode) return;
  if (focusMode) markFocusBlock();
  if (typewriterMode) scrollCaretToTypewriterLine();
});

// ——— float mode + live file watching ———
//
// Floating review mode (View → Float on Top, or `folio --float file.md`):
// the window pins above everything and the open file is polled for on-disk
// changes, so a coding agent's rewrites appear live. The user's own unsaved
// edits are never clobbered — watching pauses while the document is dirty.

let floatMode = false;

function setFloatMode(on: boolean): void {
  floatMode = on;
  document.body.classList.toggle("float-mode", on);
  floatBtn.classList.toggle("active", on);
  floatBtn.setAttribute("aria-pressed", String(on));
  liveBadge.hidden = !on;
  void invoke("set_window_floating", { floating: on });
  syncMenuState();
  syncWatch();
}

function toggleFloatMode(): void {
  setFloatMode(!floatMode);
}

/** The file content last seen on disk (load, save, or reload baseline). */
let diskContent: string | null = null;
let watchTimer: ReturnType<typeof setInterval> | null = null;
let flashTimer: ReturnType<typeof setTimeout> | null = null;

/** Watch only while floating with a file open. */
function syncWatch(): void {
  const shouldWatch = floatMode && doc.filePath !== null;
  if (shouldWatch && watchTimer === null) {
    watchTimer = setInterval(() => void pollDisk(), 1500);
  } else if (!shouldWatch && watchTimer !== null) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
}

async function pollDisk(): Promise<void> {
  const path = doc.filePath;
  // Never clobber the user's own unsaved edits; watching resumes on save.
  if (path === null || doc.dirty) return;
  let raw: string;
  try {
    raw = await invoke<string>("read_text_file", { path });
  } catch {
    return; // file missing mid-rewrite or deleted — try again next tick
  }
  const incoming = normalizeMarkdown(raw);
  if (incoming === diskContent) return;
  diskContent = incoming;
  await loadContent(incoming, path);
  liveBadge.setAttribute("data-flash", "");
  if (flashTimer !== null) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => liveBadge.removeAttribute("data-flash"), 700);
}

// ——— themes ———

let appliedTheme: Theme = storedTheme(localStorage.getItem(THEME_STORAGE_KEY));

function applyTheme(theme: Theme, persist = true): void {
  appliedTheme = theme;
  document.documentElement.dataset.theme = theme;
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function requestTheme(theme: Theme): void {
  // Paper is always free; alternates are gated.
  if (!canApplyTheme(theme, licenseState.licensed)) {
    requirePro("themes");
    syncMenuState();
    return;
  }
  applyTheme(theme);
  syncMenuState();
}

// ——— licensing ———

interface LicenseState {
  licensed: boolean;
  email: string | null;
}

interface LicenseInfo {
  valid: boolean;
  email?: string;
  error?: string;
}

let licenseState: LicenseState = { licensed: false, email: null };

const licenseOverlay = document.querySelector<HTMLDivElement>("#license-overlay")!;
const licenseEnterView = document.querySelector<HTMLDivElement>("#license-enter-view")!;
const licenseActiveView = document.querySelector<HTMLDivElement>("#license-active-view")!;
const licenseKeyInput = document.querySelector<HTMLTextAreaElement>("#license-key-input")!;
const licenseError = document.querySelector<HTMLParagraphElement>("#license-error")!;
const licenseEmail = document.querySelector<HTMLElement>("#license-email")!;
const licenseUnlockBtn = document.querySelector<HTMLButtonElement>("#license-unlock-btn")!;
const licenseCancelBtn = document.querySelector<HTMLButtonElement>("#license-cancel-btn")!;
const licenseRemoveBtn = document.querySelector<HTMLButtonElement>("#license-remove-btn")!;
const licenseDoneBtn = document.querySelector<HTMLButtonElement>("#license-done-btn")!;

/**
 * Gate a Pro feature. Returns true when the feature may run; otherwise
 * opens the unlock dialog and returns false. One-liner for follow-up
 * Pro features: `if (!requirePro("export")) return;`
 */
export function requirePro(feature: Feature): boolean {
  if (canUse(feature, licenseState.licensed)) return true;
  openLicenseDialog();
  return false;
}

/** Re-read license state from Rust and refresh everything that shows it. */
async function updateLicenseUi(): Promise<void> {
  licenseState = await invoke<LicenseState>("get_license_state");
  licenseEmail.textContent = licenseState.email ?? "";
  // Swap dialog views if the dialog is open or about to open.
  licenseEnterView.hidden = licenseState.licensed;
  licenseActiveView.hidden = !licenseState.licensed;
}

function openLicenseDialog(): void {
  licenseEnterView.hidden = licenseState.licensed;
  licenseActiveView.hidden = !licenseState.licensed;
  licenseError.hidden = true;
  licenseKeyInput.value = "";
  licenseOverlay.hidden = false;
  (licenseState.licensed ? licenseDoneBtn : licenseKeyInput).focus();
}

function closeLicenseDialog(): void {
  licenseOverlay.hidden = true;
}

async function submitLicenseKey(): Promise<void> {
  const key = licenseKeyInput.value.trim();
  if (!looksLikeLicenseKey(key)) {
    licenseError.textContent = "That doesn't look like a Folio license key.";
    licenseError.hidden = false;
    return;
  }
  try {
    const info = await invoke<LicenseInfo>("verify_and_store_license", { key });
    licenseState = { licensed: info.valid, email: info.email ?? null };
    licenseEmail.textContent = licenseState.email ?? "";
    licenseEnterView.hidden = true;
    licenseActiveView.hidden = false;
    licenseDoneBtn.focus();
  } catch (e) {
    licenseError.textContent = typeof e === "string" ? e : "Invalid license key.";
    licenseError.hidden = false;
  }
}

async function removeLicense(): Promise<void> {
  await invoke("clear_license");
  await updateLicenseUi();
  licenseKeyInput.value = "";
  licenseKeyInput.focus();
}

licenseUnlockBtn.addEventListener("click", () => void submitLicenseKey());
licenseCancelBtn.addEventListener("click", closeLicenseDialog);
licenseDoneBtn.addEventListener("click", closeLicenseDialog);
licenseRemoveBtn.addEventListener("click", () => void removeLicense());
licenseKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submitLicenseKey();
});
licenseOverlay.addEventListener("click", (e) => {
  if (e.target === licenseOverlay) closeLicenseDialog();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !licenseOverlay.hidden) closeLicenseDialog();
});

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
    case "export-html":
      return exportHtmlFile();
    case "export-pdf":
      return exportPdf();
    case "toggle-source-mode":
      return toggleSourceMode();
    case "toggle-focus-mode":
      toggleFocusMode();
      return;
    case "toggle-typewriter-mode":
      toggleTypewriterMode();
      return;
    case "toggle-float":
      toggleFloatMode();
      return;
    case "set-theme":
      requestTheme(action.theme);
      return;
    case "zoom":
      applyZoom(action.direction);
      return;
    case "enter-license":
      openLicenseDialog();
      return;
    case "make-default-app":
      return makeDefaultApp();
    case "check-updates":
      return checkForUpdates(true);
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

// Files opened via Finder while the app is running arrive as events; each
// one replaces the current document (after a dirty check).
void listen<string>("file-open", (event) => {
  void guardDirty(() => loadFromPath(event.payload));
});

// ——— toolbar + fallback shortcuts (dev in browser has no native menu) ———

openBtn.addEventListener("click", () => void openFile());
saveBtn.addEventListener("click", () => void saveFile());
floatBtn.addEventListener("click", () => toggleFloatMode());

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

void editor.create("").then(async () => {
  renderTitle();
  // Cold-start opens (Finder double-click, CLI argument) were queued by
  // Rust before the webview existed; drain and load the first one. A fresh
  // document is never dirty, so no confirm is needed here.
  const pending = await invoke<string[]>("take_pending_open_paths");
  if (pending.length > 0) await loadFromPath(pending[0]);
  // `folio --float [file.md]` — enter floating review mode on launch.
  if (await invoke<boolean>("take_float_mode")) setFloatMode(true);
});
// Establish license state, then align the native menu checkmarks with
// the actual (possibly persisted) view-mode state.
void updateLicenseUi().then(syncMenuState);
// Silent update check on launch; failures (offline, no release) are ignored.
void checkForUpdates(false);
