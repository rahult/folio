import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, message, ask, open, save } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { DocumentState } from "./document";
import { MarkdownEditor } from "./editor";
import { buildHtmlDocument, exportTarget, htmlExportTarget } from "./export";
import { buildDocx, type DocxImage } from "./docx";
import exportCss from "./export.css?raw";
import "./export.css";
import { collectExportFonts, exportHooksFor } from "./exporthooks";
import { renderExportHtml } from "./exportrender";
import { localImagePath, resolveImageSrc } from "./images";
import { anchorFromMarkdown, offsetFromAnchor } from "./caretmap";
import { attribute, type Origin, type RevisionText } from "./provenance";
import { clearProvenance, setProvenance } from "./provview";
import { parseFeedback, requestOutcomes, revisionLabel } from "./ledger";
import { rankFiles } from "./quickopen";
import { headingForAnchor, parseWikilink, resolveWikilink } from "./wikilink";
import { buildOutline, readingMinutes, sectionAtOffset, type OutlineEntry } from "./outline";
import { decisionFilePath, readTakeaway, writeTakeaway } from "./decisionfile";
import {
  activeTab,
  isPanelOpen,
  markTakeawaySaveFailed,
  onOutlinePick,
  onPanelChange,
  openPanel,
  renderHistory,
  renderOutline,
  renderStats,
  setCurrentOutline,
  setTakeaway,
  setTakeawayEnabled,
  takeawayField,
  togglePanel,
} from "./panel";
import { classifyLink } from "./links";
import { countWords, normalizeMarkdown } from "./markdown";
import { actionForMenuId, type MenuAction } from "./menu";
import { shouldScroll, typewriterScrollTop } from "./modes";
import { NavigationHistory } from "./navhistory";
import { addRecent, loadRecent, saveRecent } from "./recent";
import { loadSession, saveSession } from "./session";
import { TabList, type Tab, type TabSnapshot } from "./tabs";
import { renderedText, showReloadDiff, docSegments } from "./diffview";
import { findQuoteRange } from "./quotematch";
import {
  buildFeedback,
  loadAnnotations,
  makeAnnotation,
  type Annotation,
  type AnnotationKind,
} from "./annotations";
import { renderAnnotations } from "./annotview";
import { barModel, feedbackWithEditNote, type ReviewRequest, type Verdict } from "./reviewgate";
import { hintText, reviewKeyAction, verdictFor, type ReviewAction } from "./reviewmode";
import {
  closeEntry,
  isEntryOpen,
  moveCurrent,
  openEntry,
  setCurrentByPos,
  setReviewMode,
  targetQuote,
} from "./reviewview";
import { isDarkTheme, storedTheme, THEME_STORAGE_KEY, type Theme } from "./theme";
import { nextZoom, type ZoomDirection } from "./zoom";
import { TextSelection, type Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  initTelemetry,
  setTelemetryConsent,
  telemetryConsent,
  telemetryEnabled,
  trackEvent,
} from "./telemetry";

const doc = new DocumentState();

/** Folio runs one process with many windows; this is the Tauri label of the
 *  window this script instance drives. "main" is the window the app starts
 *  with — every other one was opened by File → New Window, a Finder
 *  double-click, or a second `folio` invocation handed over by the running
 *  process. Only the starting window owns the restored session: otherwise
 *  every new window would reopen the same document, and a throwaway review
 *  window would overwrite where the user actually left off. */
const isPrimaryWindow = getCurrentWindow().label === "main";

/** What Rust wants this window to do the moment it comes up. */
interface StartupRequest {
  paths: string[];
  float: boolean;
}

const titleEl = document.querySelector<HTMLSpanElement>("#doc-title")!;
const pathEl = document.querySelector<HTMLSpanElement>("#doc-path")!;
const wordCountEl = document.querySelector<HTMLSpanElement>("#word-count")!;
const navBackBtn = document.querySelector<HTMLButtonElement>("#nav-back-btn")!;
const navForwardBtn = document.querySelector<HTMLButtonElement>("#nav-forward-btn")!;
const floatBtn = document.querySelector<HTMLButtonElement>("#float-btn")!;
const copyAgentBtn = document.querySelector<HTMLButtonElement>("#copy-agent-btn")!;
const feedbackBtn = document.querySelector<HTMLButtonElement>("#feedback-btn")!;
const reviewBar = document.querySelector<HTMLElement>("#review-bar")!;
const reviewBarLabel = document.querySelector<HTMLElement>("#review-bar-label")!;
const reviewBarHint = document.querySelector<HTMLElement>("#review-bar-hint")!;
const reviewChangesBtn = document.querySelector<HTMLButtonElement>("#review-changes-btn")!;
const reviewApproveBtn = document.querySelector<HTMLButtonElement>("#review-approve-btn")!;
const annotationsBtn = document.querySelector<HTMLButtonElement>("#annotations-btn")!;
const annotList = document.querySelector<HTMLDivElement>("#annot-list")!;
const telemetryOverlay = document.querySelector<HTMLDivElement>("#telemetry-overlay")!;
const telemetryAcceptBtn = document.querySelector<HTMLButtonElement>("#telemetry-accept-btn")!;
const telemetryDeclineBtn = document.querySelector<HTMLButtonElement>("#telemetry-decline-btn")!;
const editorRoot = document.querySelector<HTMLElement>("#editor")!;
const tabStrip = document.querySelector<HTMLElement>("#tabs")!;
const sourceEditor = document.querySelector<HTMLTextAreaElement>("#source-editor")!;
const liveBadge = document.querySelector<HTMLSpanElement>("#live-badge")!;

function displayPath(path: string | null): string {
  if (!path) return "";
  // Abbreviate the user's home directory for readability.
  const match = path.match(/^\/Users\/[^/]+/);
  return match ? `~${path.slice(match[0].length)}` : path;
}

const editor = new MarkdownEditor(editorRoot, (markdown) => {
  doc.updateDirty(markdown);
  // `resolve_review` rewrites the handshake to a decided state rather than
  // deleting it, so `reviewRequest` stays non-null after a verdict — only
  // "waiting" means an agent is actually blocked on this edit.
  if (doc.dirty && reviewRequest?.state === "waiting") documentEditedDuringReview = true;
  renderStatus(markdown);
  scheduleOutlineRefresh();
  scheduleAuthorshipRefresh();
  renderTitle();
  if (!sourceMode) void updateWikiComplete();
}, {
  // Consulted when each image node renders, so it must read the live path.
  resolveImageSrc: (src) => resolveImageSrc(src, doc.filePath, convertFileSrc),
});
// The selection bubble's annotate icon runs the same flow as
// Edit → Annotate Selection… (function declaration, hoisted).
editor.onAnnotateRequest(() => openInlineEntry("comment"));

function renderTitle(): void {
  titleEl.textContent = doc.fileName;
  document.body.classList.toggle("is-dirty", doc.dirty);
  document.title = doc.displayTitle;
  pathEl.textContent = displayPath(doc.filePath);
  const active = tabStrip.querySelector<HTMLElement>('.tab[aria-current="true"]');
  active?.classList.toggle("dirty", doc.dirty);
}

/** The markdown the user is currently editing, from whichever view is live. */
function currentMarkdown(): string {
  return sourceMode ? sourceEditor.value : editor.getMarkdown();
}

/** Put content into whichever view is live and reset the dirty baseline. */
async function loadContent(
  content: string,
  path: string | null,
  baseline?: string,
): Promise<void> {
  // A new document starts in edit mode; a waiting request re-enters review
  // mode once the request state is refreshed for it.
  exitReviewMode(false);
  jumpIndex = -1;
  if (sourceMode) {
    sourceEditor.value = content;
    doc.load(path, baseline ?? content);
    doc.updateDirty(content);
  } else {
    // Image nodes resolve relative srcs against the document's folder as
    // they render, so the path must be in place before the editor builds.
    doc.setPath(path);
    await editor.setContent(content);
    // The dirty baseline is the editor's serialized markdown, not the raw
    // file text: Milkdown normalizes formatting (list markers, spacing), so
    // a file would otherwise count as modified the moment it is opened. A
    // tab coming back with unsaved edits brings its own baseline.
    doc.load(path, baseline ?? editor.getMarkdown());
    if (baseline !== undefined) doc.updateDirty(editor.getMarkdown());
  }
  renderStatus(content);
  refreshOutline();
  void loadTakeaway();
  renderTitle();
}

/** Read a file from disk and load it into the editor. Every load is a
 *  navigation visit unless the caller is itself history navigation. */
async function loadFromPath(path: string, options?: { visit?: boolean }): Promise<void> {
  const raw = await invoke<string>("read_text_file", { path });
  const content = normalizeMarkdown(raw);
  // The document lands in its tab: an existing one for the path, the clean
  // untitled tab when that is what is showing, or a new tab beside the
  // active one. Whatever was showing keeps its edits in its own tab.
  if (tabs.active.path !== path) {
    tabs.remember(snapshotEditor());
    tabs.open(path);
  }
  diskContent = content;
  await loadContent(content, path);
  renderTabs();
  recordRecent(path);
  saveSessionNow();
  void loadAnnotationsForOpenFile();
  void archiveCurrentRevision("unknown").then(refreshAuthorship);
  if (options?.visit !== false) {
    nav.visit(path);
    renderNavButtons();
  }
  syncWatch();
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
  tabs.setPath(tabs.active.id, path);
  renderTabs();
  recordRecent(path);
  saveSessionNow();
  void archiveCurrentRevision("folio").then(refreshAuthorship);
  renderTitle();
  syncWatch();
}

async function newFile(): Promise<void> {
  // A fresh tab; the current document keeps its edits where they are.
  if (tabs.active.path !== null || doc.dirty) {
    tabs.remember(snapshotEditor());
    tabs.addUntitled();
  }
  diskContent = null;
  await loadContent("", null);
  renderTabs();
  annotations = [];
  documentEditedDuringReview = false;
  reviewBarError = null;
  void refreshReviewRequest();
  void invoke("set_revision_menu", { entries: [] });
  saveSessionNow();
  syncWatch();
}

// ——— source code mode ———

let sourceMode = false;

/** Review mode is a rendered-page affair; it pauses for source mode and
 *  resumes when the page comes back. */
let resumeReviewAfterSource = false;

async function enterSourceMode(): Promise<void> {
  resumeReviewAfterSource = reviewMode;
  exitReviewMode(false);
  // Carry the caret across: the anchor is read before the editor is hidden.
  const anchor = editor.caretAnchor();
  const markdown = editor.getMarkdown();
  sourceEditor.value = markdown;
  sourceMode = true;
  document.body.classList.add("source-mode");
  editorRoot.hidden = true;
  sourceEditor.hidden = false;
  sourceEditor.focus();
  if (anchor) placeSourceCaret(offsetFromAnchor(markdown, anchor));
}

/** Put the textarea caret at `offset` and scroll it ~40% down the view —
 *  setSelectionRange alone does not scroll in WebKit. */
function placeSourceCaret(offset: number): void {
  sourceEditor.setSelectionRange(offset, offset);
  const line = sourceEditor.value.slice(0, offset).split("\n").length - 1;
  const lineHeight = parseFloat(getComputedStyle(sourceEditor).lineHeight) || 24;
  const paddingTop = parseFloat(getComputedStyle(sourceEditor).paddingTop) || 0;
  sourceEditor.scrollTop = Math.max(0, paddingTop + line * lineHeight - sourceEditor.clientHeight * 0.4);
}

async function exitSourceMode(): Promise<void> {
  const markdown = sourceEditor.value;
  const anchor = anchorFromMarkdown(markdown, sourceEditor.selectionStart);
  sourceMode = false;
  document.body.classList.remove("source-mode");
  sourceEditor.hidden = true;
  editorRoot.hidden = false;
  await editor.setContent(markdown);
  // Round-tripping through Milkdown normalizes the text; the dirty flag
  // must reflect the editor's serialized form, not the raw textarea text.
  doc.updateDirty(editor.getMarkdown());
  renderTitle();
  editor.setCaretAnchor(anchor);
  if (resumeReviewAfterSource) enterReviewMode();
  resumeReviewAfterSource = false;
}

function toggleSourceMode(): Promise<void> {
  return sourceMode ? exitSourceMode() : enterSourceMode();
}

// Typing in the source view is a document edit like any other.
sourceEditor.addEventListener("input", () => {
  doc.updateDirty(sourceEditor.value);
  // See the matching guard in the WYSIWYG change handler above: only
  // "waiting" means an agent is actually blocked on this edit.
  if (doc.dirty && reviewRequest?.state === "waiting") documentEditedDuringReview = true;
  renderStatus(sourceEditor.value);
  scheduleOutlineRefresh();
  renderTitle();
});

// ——— zoom ———

let zoom = 1;

function applyZoom(direction: ZoomDirection): void {
  zoom = nextZoom(zoom, direction);
  document.documentElement.style.setProperty("--zoom", String(zoom));
}

// ——— export ———

const printRoot = document.querySelector<HTMLElement>("#print-root")!;

/** The document rendered for export — from the Markdown, never the editor
 *  DOM, so the result does not depend on scroll position or which code
 *  blocks happen to be mounted. */
function renderForExport(): Promise<string> {
  return renderExportHtml(currentMarkdown(), exportHooksFor(doc.filePath));
}

async function exportHtmlFile(): Promise<void> {
  trackEvent("export_html");
  const [body, fonts] = await Promise.all([renderForExport(), collectExportFonts()]);
  const html = buildHtmlDocument(doc.fileName, body, `${fonts}\n${exportCss}`);
  const selected = await save({
    defaultPath: htmlExportTarget(doc.filePath),
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (selected === null) return;
  await invoke("write_text_file", { path: selected, contents: html });
}

/** Local images for the Word export: read through the asset protocol,
 *  measured with an <img>, and handed over as bytes. SVG and anything
 *  Word cannot embed become links instead. */
async function docxImage(src: string): Promise<DocxImage | null> {
  const path = localImagePath(src, doc.filePath);
  if (path === null) return null;
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const type = ext === "png" ? "png" : ext === "jpg" || ext === "jpeg" ? "jpg" : ext === "gif" ? "gif" : ext === "bmp" ? "bmp" : null;
  if (!type) return null;
  try {
    const url = convertFileSrc(path);
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = new Uint8Array(await response.arrayBuffer());
    const size = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = url;
    });
    return { data, type, ...size };
  } catch {
    return null;
  }
}

async function exportDocx(): Promise<void> {
  trackEvent("export_docx");
  const selected = await save({
    defaultPath: exportTarget(doc.filePath, "docx"),
    filters: [{ name: "Word", extensions: ["docx"] }],
  });
  if (selected === null) return;
  const bytes = await buildDocx(currentMarkdown(), doc.fileName, { image: docxImage });
  await invoke("write_binary_file", { path: selected, contents: Array.from(bytes) });
}

async function exportPdf(): Promise<void> {
  trackEvent("export_pdf");
  // The print root is the only thing print CSS shows; it holds the same
  // rendering the HTML export gets. Native print panel: macOS → Save as PDF.
  printRoot.innerHTML = await renderForExport();
  await invoke("print_document");
}

// ——— focus mode + typewriter mode ———

let focusMode = false;
let typewriterMode = false;
let reviewMode = false;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Push the real view-mode state to the native menu so checkmarks never
 *  drift. */
function syncMenuState(): void {
  void invoke("sync_menu_state", {
    focus: focusMode,
    typewriter: typewriterMode,
    review: reviewMode,
    panel: isPanelOpen(),
    authorship: authorshipOn,
    theme: appliedTheme,
    floating: floatMode,
    watch: watchEnabled,
    telemetry: telemetryOn,
  });
}

// ——— opt-in telemetry (GA4; nothing loads before consent) ———

let telemetryOn = telemetryEnabled();

function toggleTelemetry(): void {
  telemetryOn = !telemetryOn;
  setTelemetryConsent(telemetryOn);
  syncMenuState();
  if (telemetryOn) {
    initTelemetry();
    trackEvent("telemetry_opt_in");
  }
}

telemetryAcceptBtn.addEventListener("click", () => {
  telemetryOn = true;
  setTelemetryConsent(true);
  telemetryOverlay.hidden = true;
  initTelemetry();
  trackEvent("telemetry_opt_in");
  syncMenuState();
});

telemetryDeclineBtn.addEventListener("click", () => {
  telemetryOn = false;
  setTelemetryConsent(false);
  telemetryOverlay.hidden = true;
  syncMenuState();
});

/** First launch: ask once. Subsequent launches respect the stored choice. */
function initTelemetryFlow(): void {
  if (telemetryConsent() === null) {
    telemetryOverlay.hidden = false;
    return;
  }
  initTelemetry();
  trackEvent("app_launch");
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
  typewriterMode = !typewriterMode;
  document.body.classList.toggle("typewriter-mode", typewriterMode);
  if (typewriterMode) scrollCaretToTypewriterLine();
  syncMenuState();
}

// Focus dims, typewriter scrolls — both ride the same selection hook and
// compose freely. Both are no-ops in source mode.
editor.onSelectionUpdate(() => {
  scheduleSessionSave();
  if (sourceMode) return;
  if (focusMode) markFocusBlock();
  if (typewriterMode) scrollCaretToTypewriterLine();
  trackCurrentSection();
  if (!wikiComplete.hidden && !wikiPrefix()) closeWikiComplete();
});

// ——— reading panel: outline, stats, takeaway ———

let outline: OutlineEntry[] = [];
let currentSection = -1;
let outlineTimer: ReturnType<typeof setTimeout> | null = null;

/** Status bar: word count plus reading time (omitted under a minute). */
function renderStatus(markdown: string): void {
  const words = countWords(markdown);
  const minutes = readingMinutes(words);
  wordCountEl.textContent =
    `${words.toLocaleString()} words` + (minutes > 0 ? ` · ${minutes} min` : "");
  renderStats(words, minutes);
}

function refreshOutline(): void {
  if (outlineTimer !== null) {
    clearTimeout(outlineTimer);
    outlineTimer = null;
  }
  outline = buildOutline(currentMarkdown());
  currentSection = sectionAtOffset(outline, caretOffset());
  renderOutline(outline, currentSection);
}

/** Typing rebuilds the outline at most every 300 ms. */
function scheduleOutlineRefresh(): void {
  if (outlineTimer !== null) clearTimeout(outlineTimer);
  outlineTimer = setTimeout(refreshOutline, 300);
}

/** The caret's Markdown offset, from whichever view is live. */
function caretOffset(): number {
  if (sourceMode) return sourceEditor.selectionStart;
  const anchor = editor.caretAnchor();
  return anchor ? offsetFromAnchor(currentMarkdown(), anchor) : 0;
}

function trackCurrentSection(): void {
  const next = sectionAtOffset(outline, caretOffset());
  if (next === currentSection) return;
  currentSection = next;
  setCurrentOutline(currentSection);
}

/** Go to a heading: caret at its start, scrolled into view; in Review
 *  Mode it also becomes the current block. */
function goToHeading(entry: OutlineEntry): void {
  if (sourceMode) {
    sourceEditor.focus();
    placeSourceCaret(entry.offset);
    return;
  }
  editor.withView((view) => {
    let seen = -1;
    let target: number | null = null;
    view.state.doc.descendants((node, pos) => {
      if (target !== null) return false;
      if (node.type.name === "heading" && ++seen === entry.index) target = pos;
      return target === null;
    });
    if (target === null) return;
    const pos = Math.min(target + 1, view.state.doc.content.size);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))).scrollIntoView(),
    );
    if (reviewMode) setCurrentByPos(view, pos);
    else view.focus();
  });
}

onOutlinePick(goToHeading);
onPanelChange(syncMenuState);
sourceEditor.addEventListener("selectionchange", trackCurrentSection);
document.addEventListener("selectionchange", () => {
  if (sourceMode && document.activeElement === sourceEditor) trackCurrentSection();
});

/** The takeaway lives in `<doc>.decision.md`; the file's other sections
 *  (added by later stages) travel through untouched. */
let decisionFileText: string | null = null;
let takeawayTimer: ReturnType<typeof setTimeout> | null = null;

async function loadTakeaway(): Promise<void> {
  const path = doc.filePath;
  markTakeawaySaveFailed(false);
  if (!path) {
    decisionFileText = null;
    setTakeaway("");
    setTakeawayEnabled(false, "Save the document to keep a takeaway");
    return;
  }
  setTakeawayEnabled(true, "What I took from it, in my own words");
  try {
    decisionFileText = await invoke<string>("read_text_file", { path: decisionFilePath(path) });
  } catch {
    decisionFileText = null; // no companion file yet
  }
  // The document may have changed while the read was in flight.
  if (doc.filePath !== path) return;
  setTakeaway(decisionFileText ? readTakeaway(decisionFileText) : "");
}

async function saveTakeaway(): Promise<void> {
  if (takeawayTimer !== null) {
    clearTimeout(takeawayTimer);
    takeawayTimer = null;
  }
  const path = doc.filePath;
  if (!path) return;
  const next = writeTakeaway(decisionFileText, doc.fileName, path, takeawayField.value);
  if (next === decisionFileText) return;
  try {
    await invoke("write_text_file", { path: decisionFilePath(path), contents: next });
    if (doc.filePath === path) {
      decisionFileText = next;
      markTakeawaySaveFailed(false);
    }
  } catch {
    if (doc.filePath === path) markTakeawaySaveFailed(true);
  }
}

takeawayField.addEventListener("input", () => {
  if (takeawayTimer !== null) clearTimeout(takeawayTimer);
  takeawayTimer = setTimeout(() => void saveTakeaway(), 800);
});
takeawayField.addEventListener("blur", () => void saveTakeaway());

editorRoot.addEventListener("scroll", scheduleSessionSave);

// ——— float mode + live file watching ———
//
// Floating review mode (View → Float on Top, or `folio --float file.md`):
// the window pins above everything and the open file is polled for on-disk
// changes, so a coding agent's rewrites appear live. File → Auto-Reload
// External Changes enables the same watching in normal windows (on by
// default). The user's own unsaved edits are never clobbered — watching
// pauses while the document is dirty.

let floatMode = false;

const WATCH_STORAGE_KEY = "folio-watch";
/** Auto-reload in normal windows; persisted, on unless explicitly disabled. */
let watchEnabled = localStorage.getItem(WATCH_STORAGE_KEY) !== "off";

function toggleWatch(): void {
  watchEnabled = !watchEnabled;
  localStorage.setItem(WATCH_STORAGE_KEY, watchEnabled ? "on" : "off");
  syncMenuState();
  syncWatch();
}

function setFloatMode(on: boolean): void {
  floatMode = on;
  document.body.classList.toggle("float-mode", on);
  floatBtn.classList.toggle("active", on);
  floatBtn.setAttribute("aria-pressed", String(on));
  liveBadge.hidden = !on;
  void invoke("set_window_floating", { floating: on });
  trackEvent("float_mode", { on });
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

/** Watch while floating, or in any window when auto-reload is enabled. */
function syncWatch(): void {
  const shouldWatch = (floatMode || watchEnabled) && doc.filePath !== null;
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
  // Capture the rendered text before the swap so the reload can highlight
  // what the rewrite changed (skipped in source mode, where the rendered
  // document is stale).
  let previousText = "";
  if (!sourceMode) {
    editor.withView((view) => {
      previousText = renderedText(view);
    });
  }
  diskContent = incoming;
  // A rewrite mid-review must not bounce the reviewer out of review mode.
  const stayInReview = reviewMode;
  await loadContent(incoming, path);
  void archiveCurrentRevision("external").then(refreshAuthorship);
  if (!sourceMode) {
    // The reload recreated the editor — re-render annotation marks too.
    renderAnnotationsNow();
    editor.withView((view) => {
      showReloadDiff(view, previousText);
    });
    if (stayInReview) enterReviewMode();
  }
  liveBadge.setAttribute("data-flash", "");
  if (flashTimer !== null) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => liveBadge.removeAttribute("data-flash"), 700);
}

// ——— recent files ———

let recentFiles = loadRecent();

/** Record an opened/saved file and mirror the list into the native menu. */
function recordRecent(path: string): void {
  recentFiles = addRecent(recentFiles, path);
  saveRecent(recentFiles);
  void invoke("set_recent_files", { paths: recentFiles });
}

// ——— session restore ———

let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Persist path/caret/scroll so relaunch lands where the user left off.
 *  Secondary windows stay out of it — the session is the starting window's. */
function saveSessionNow(): void {
  if (!isPrimaryWindow) return;
  const path = doc.filePath;
  const openPaths = tabs.all.map((t) => t.path).filter((p): p is string => p !== null);
  if (path === null) {
    saveSession({ path: null, pos: 0, scroll: 0, tabs: openPaths });
    return;
  }
  let pos = 0;
  editor.withView((view) => {
    pos = view.state.selection.from;
  });
  saveSession({ path, pos, scroll: editorRoot.scrollTop, tabs: openPaths });
}

function scheduleSessionSave(): void {
  if (sessionSaveTimer !== null) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(saveSessionNow, 800);
}

/** Reopen the last file with its caret and scroll position (no-op without
 *  a persisted file, or when it has disappeared since). */
async function restoreSession(): Promise<void> {
  const session = loadSession();
  if (!session?.path) return;
  // Reopen every tab, the active one last so it ends up showing; a tab
  // whose file has gone is skipped.
  for (const path of session.tabs) {
    if (path === session.path) continue;
    try {
      await loadFromPath(path, { visit: false });
    } catch {
      // gone since last time
    }
  }
  try {
    await loadFromPath(session.path);
  } catch {
    saveSession({ path: null, pos: 0, scroll: 0, tabs: [] });
    return;
  }
  requestAnimationFrame(() => {
    editorRoot.scrollTop = session.scroll;
    editor.withView((view) => {
      try {
        const pos = Math.min(session.pos, view.state.doc.content.size);
        view.dispatch(
          view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))),
        );
      } catch {
        // Stale position in a changed document — leave the caret alone.
      }
    });
  });
}

// ——— link navigation ———
//
// ⌘-click a link to follow it: Markdown links between documents open inside
// Folio with browser-style back/forward (⌘[ / ⌘]); web URLs and
// non-Markdown files go to the OS default application.

const nav = new NavigationHistory();

function renderNavButtons(): void {
  navBackBtn.disabled = !nav.canGoBack;
  navForwardBtn.disabled = !nav.canGoForward;
}

/** Follow a link target: internal for Markdown, OS default app otherwise. */
async function followLink(href: string): Promise<void> {
  const target = classifyLink(href, doc.filePath);
  switch (target.kind) {
    case "markdown":
      try {
        await loadFromPath(target.path);
        if (target.anchor) jumpToAnchor(target.anchor);
      } catch {
        await message(`Couldn't open ${target.path}`, { title: "Open Link", kind: "error" });
      }
      return;
    case "external-url":
      await openUrl(target.url);
      return;
    case "external-path":
      await openPath(target.path);
      return;
    case "anchor":
    case "invalid":
      return;
  }
}

async function navigateBack(): Promise<void> {
  const path = nav.peekBack();
  if (!path) return;
  nav.goBack();
  await loadFromPath(path, { visit: false });
  renderNavButtons();
}

async function navigateForward(): Promise<void> {
  const path = nav.peekForward();
  if (!path) return;
  nav.goForward();
  await loadFromPath(path, { visit: false });
  renderNavButtons();
}

/** Scroll to the heading an `#anchor` names, once the outline is built. */
function jumpToAnchor(anchor: string): void {
  refreshOutline();
  const index = headingForAnchor(outline, anchor);
  if (index === -1) return;
  const entry = outline[index];
  if (entry) goToHeading(entry);
}

/** `[[target#heading]]` → the project file it names, opened in a tab. */
async function followWikilink(raw: string): Promise<void> {
  const { target, anchor } = parseWikilink(raw);
  if (!target) {
    if (anchor) jumpToAnchor(anchor);
    return;
  }
  const base = doc.filePath ?? recentFiles[0];
  if (!base) return;
  const project = await invoke<ProjectFiles>("list_project_markdown", { path: base });
  const rel = resolveWikilink(target, project.files);
  if (!rel) {
    await message(`No Markdown file in this project matches [[${target}]]`, {
      title: "Open Link",
      kind: "error",
    });
    return;
  }
  const root = project.root.endsWith("/") ? project.root : `${project.root}/`;
  await loadFromPath(root + rel);
  if (anchor) jumpToAnchor(anchor);
}

// ⌘-click follows links; capture phase so ProseMirror's own handlers
// (link tooltip, caret placement) don't swallow it first.
editorRoot.addEventListener(
  "click",
  (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const el = e.target as HTMLElement;
    const wiki = el.closest<HTMLElement>("[data-wikilink]");
    if (wiki) {
      e.preventDefault();
      e.stopPropagation();
      void followWikilink(wiki.dataset.wikilink ?? "");
      return;
    }
    const anchor = el.closest("a[href]");
    if (!anchor) return;
    e.preventDefault();
    e.stopPropagation();
    void followLink(anchor.getAttribute("href") ?? "");
  },
  true,
);

// ——— [[ completion ———
//
// Typing `[[` in the page opens a list of the project's Markdown files
// filtered by what follows; Enter inserts the file's name and closes the
// brackets. Escape or moving away dismisses it.

const wikiComplete = document.querySelector<HTMLOListElement>("#wiki-complete")!;
let wikiCandidates: string[] = [];
let wikiIndex = 0;
/** Position of the `[[` that opened the list, so the typed prefix can be
 *  replaced on accept. */
let wikiOpenAt: number | null = null;
let wikiProject: ProjectFiles | null = null;

function closeWikiComplete(): void {
  wikiComplete.hidden = true;
  wikiOpenAt = null;
}

function wikiPrefix(): { from: number; query: string } | null {
  let result: { from: number; query: string } | null = null;
  editor.withView((view) => {
    const { $from, empty } = view.state.selection;
    if (!empty || $from.parent.type.name === "code_block") return;
    const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
    const m = /\[\[([^\[\]\n]*)$/.exec(before);
    if (!m) return;
    result = { from: $from.pos - m[0].length, query: m[1] };
  });
  return result;
}

async function updateWikiComplete(): Promise<void> {
  const prefix = wikiPrefix();
  if (!prefix) {
    closeWikiComplete();
    return;
  }
  const base = doc.filePath ?? recentFiles[0];
  if (!base) return;
  if (!wikiProject || wikiOpenAt !== prefix.from) {
    wikiProject = await invoke<ProjectFiles>("list_project_markdown", { path: base });
    wikiOpenAt = prefix.from;
    wikiIndex = 0;
  }
  const current = wikiProject;
  wikiCandidates = rankFiles(prefix.query, current.files, [], 8);
  if (wikiCandidates.length === 0) {
    wikiComplete.hidden = true;
    return;
  }
  wikiIndex = Math.min(wikiIndex, wikiCandidates.length - 1);
  wikiComplete.replaceChildren(
    ...wikiCandidates.map((rel, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      if (i === wikiIndex) li.setAttribute("aria-selected", "true");
      const slash = rel.lastIndexOf("/");
      const name = document.createElement("span");
      name.textContent = rel.slice(slash + 1).replace(/\.(md|markdown|mdown|mkd)$/i, "");
      const dir = document.createElement("span");
      dir.className = "qo-dir";
      dir.textContent = slash === -1 ? "" : rel.slice(0, slash);
      li.append(name, dir);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        acceptWikiComplete(i);
      });
      return li;
    }),
  );
  editor.withView((view) => {
    const coords = view.coordsAtPos(view.state.selection.from);
    wikiComplete.style.left = `${Math.min(coords.left, window.innerWidth - 300)}px`;
    wikiComplete.style.top = `${coords.bottom + 6}px`;
  });
  wikiComplete.hidden = false;
}

function acceptWikiComplete(index: number): void {
  const rel = wikiCandidates[index];
  const from = wikiOpenAt;
  if (!rel || from === null) return;
  const name = rel.slice(rel.lastIndexOf("/") + 1).replace(/\.(md|markdown|mdown|mkd)$/i, "");
  editor.withView((view) => {
    const to = view.state.selection.from;
    view.dispatch(view.state.tr.insertText(`[[${name}]]`, from, to));
    view.focus();
  });
  closeWikiComplete();
}

editorRoot.addEventListener(
  "keydown",
  (e) => {
    if (wikiComplete.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const n = wikiCandidates.length;
      wikiIndex = (wikiIndex + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      Array.from(wikiComplete.children).forEach((li, i) => {
        if (i === wikiIndex) li.setAttribute("aria-selected", "true");
        else li.removeAttribute("aria-selected");
      });
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      acceptWikiComplete(wikiIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeWikiComplete();
    }
  },
  true,
);

navBackBtn.addEventListener("click", () => void navigateBack());
navForwardBtn.addEventListener("click", () => void navigateForward());

// ——— review annotations + structured feedback ———

let annotations: Annotation[] = [];

/** Load the annotation list for the open file from the SQLite store and
 *  render its marks. One-time migration: annotations saved by pre-SQLite
 *  builds in localStorage are moved into the database. */
async function loadAnnotationsForOpenFile(): Promise<void> {
  const path = doc.filePath;
  if (!path) {
    annotations = [];
    renderAnnotationsNow();
    return;
  }
  annotations = await invoke<Annotation[]>("list_annotations", { path });
  const legacy = loadAnnotations(path);
  if (legacy.length > 0) {
    for (const legacy_ of legacy) {
      await invoke("add_annotation", { path, annotation: legacy_ });
    }
    annotations = [...annotations, ...legacy];
    localStorage.removeItem(`folio-annotations:${path}`);
  }
  // Auto-open only when the incoming file actually has annotations.
  if (annotations.length > 0) openPanel("annotations");
  renderAnnotationsNow();
  documentEditedDuringReview = false;
  reviewBarError = null;
  void refreshReviewRequest();
}

function renderAnnotationsNow(): void {
  if (sourceMode) return;
  editor.withView((view) => renderAnnotations(view, annotations));
  renderSidebar();
}

// ——— annotations sidebar ———

const ANNOT_KIND_LABEL: Record<AnnotationKind, string> = {
  comment: "Comment",
  delete: "Delete",
  replace: "Replace",
  approve: "Looks good",
};

/** The Annotations tab of the reading panel. The toolbar button reflects
 *  whether that tab is showing. */
function renderSidebar(): void {
  const showing = isPanelOpen() && activeTab() === "annotations";
  annotationsBtn.classList.toggle("active", showing);
  annotationsBtn.setAttribute("aria-pressed", String(showing));
  if (annotations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "annot-empty";
    empty.textContent =
      "No annotations yet — select text and click the annotate icon in the selection popup, or use Edit → Annotate Selection…";
    annotList.replaceChildren(empty);
    renderReviewBar();
    return;
  }
  annotList.replaceChildren(...annotations.map(renderSidebarItem));
  renderReviewBar();
}

function renderSidebarItem(annotation: Annotation): HTMLElement {
  const item = document.createElement("div");
  item.className = "annot-item";
  item.addEventListener("click", () => jumpToAnnotation(annotation));

  const kind = document.createElement("div");
  kind.className = `annot-item-kind ${annotation.kind}`;
  kind.textContent = ANNOT_KIND_LABEL[annotation.kind];

  const quote = document.createElement("div");
  quote.className = "annot-item-quote";
  quote.textContent = annotation.quote.replace(/\s+/g, " ").trim();
  item.append(kind, quote);

  if (annotation.body) {
    const body = document.createElement("div");
    body.className = "annot-item-body";
    body.textContent = annotation.body;
    item.append(body);
  }

  const del = document.createElement("button");
  del.className = "annot-item-delete";
  del.type = "button";
  del.title = "Remove annotation";
  del.textContent = "×";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    void deleteAnnotation(annotation);
  });
  item.append(del);
  return item;
}

/** Scroll the document to an annotation and select its range. */
function jumpToAnnotation(annotation: Annotation): void {
  if (sourceMode) return;
  editor.withView((view) => {
    const { segments } = docSegments(view);
    const range = findQuoteRange(segments, annotation.quote, view.state.doc.content.size);
    if (!range) return;
    view.focus();
    // Select the whole annotated range so the jump visibly highlights it;
    // fall back to a caret if the range can't hold a text selection.
    let selection: Selection;
    try {
      selection = TextSelection.create(view.state.doc, range.from, range.to);
    } catch {
      selection = TextSelection.near(view.state.doc.resolve(range.from));
    }
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  });
}

async function deleteAnnotation(annotation: Annotation): Promise<void> {
  annotations = annotations.filter((a) => a.id !== annotation.id);
  await invoke("delete_annotation", { id: annotation.id });
  renderAnnotationsNow();
}

annotationsBtn.addEventListener("click", () => togglePanel("annotations"));
onPanelChange(renderSidebar);

/** The selection, or with no selection the innermost block under the
 *  caret (depth 0 would quote the whole document — never useful). */
function selectionOrBlockQuote(view: EditorView): string {
  const { $from, from, to } = view.state.selection;
  if (from !== to) return view.state.doc.textBetween(from, to, "\n", " ");
  if ($from.depth > 0) return view.state.doc.textBetween($from.start(), $from.end(), "\n", " ");
  return "";
}

/** Edit → Annotate Selection…, the bubble's annotate icon, and review
 *  mode's c / r: open the inline entry under the target passage. In
 *  review mode the target is the current block (or a selection inside it);
 *  while editing it is the selection or the block under the caret. */
function openInlineEntry(kind: "comment" | "replace"): void {
  if (sourceMode || !doc.filePath) return;
  editor.withView((view) => {
    const quote = reviewMode ? targetQuote(view) : selectionOrBlockQuote(view);
    if (!quote.trim()) return;
    if (!reviewMode) setCurrentByPos(view, view.state.selection.from);
    openEntry(view, {
      kind,
      onSubmit: (body) => {
        closeEntry(view);
        addAnnotation(kind, quote, body);
        if (!reviewMode) view.focus();
      },
      onCancel: () => {
        closeEntry(view);
        if (!reviewMode) view.focus();
      },
    });
  });
}

function addAnnotation(kind: AnnotationKind, quote: string, body: string): void {
  if (!doc.filePath) return;
  const annotation = makeAnnotation(kind, quote, body);
  trackEvent("annotate");
  annotations = [...annotations, annotation];
  void invoke("add_annotation", { path: doc.filePath, annotation });
  openPanel("annotations"); // a fresh annotation re-shows the panel
  renderAnnotationsNow();
}

function clearReviewAnnotations(): void {
  if (!doc.filePath) return;
  annotations = [];
  void invoke("clear_annotations", { path: doc.filePath });
  renderAnnotationsNow();
}

/** Copy text to the clipboard (WKWebView-safe with legacy fallback). */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/** File → Export Review Feedback: structured, agent-consumable Markdown to
 *  the clipboard and a `<file>.feedback.md` beside the reviewed file. */
async function exportReviewFeedback(): Promise<void> {
  trackEvent("export_feedback");
  const feedback = buildFeedback(doc.fileName, annotations, diskContent ?? undefined);
  await copyText(feedback);
  if (doc.filePath) {
    await invoke("write_text_file", {
      path: `${doc.filePath}.feedback.md`,
      contents: feedback,
    });
  }
  feedbackBtn.classList.add("copied");
  setTimeout(() => feedbackBtn.classList.remove("copied"), 900);
}

// ——— review gate ———
//
// `folio review --wait <path>` leaves a handshake in the temp dir and blocks
// on it. Poll for one while a file is open so the bar appears the moment an
// agent starts waiting, and resolve it when the user picks a verdict.

let reviewRequest: ReviewRequest | null = null;
/** Set when the user answers by editing rather than annotating, so the
 *  feedback can tell the agent to re-read the file. */
let documentEditedDuringReview = false;
/** True while a verdict is being sent — guards against a double-click firing
 *  `submitVerdict` twice concurrently (the write + resolve round trip is not
 *  idempotent-safe to race). */
let verdictInFlight = false;
/** True while the "sent ✓" confirmation is showing. `resolve_review`
 *  rewrites the handshake rather than deleting it, so the very next poll
 *  tick would otherwise re-fetch a decided (still non-null) request and have
 *  `renderReviewBar()` cut the confirmation short. */
let reviewBarConfirming = false;
/** Non-null when the last verdict failed to send. Sticky — cleared only by
 *  a retry or a document change, never by a poll tick — because a blocked
 *  `folio review --wait` process is hanging and silently reverting to the
 *  ordinary "waiting" label would tell the user nothing went wrong. */
let reviewBarError: string | null = null;

const REVIEW_POLL_MS = 1500;

/** `fromPoll` distinguishes the background interval from the two
 *  user-initiated call sites (opening a file, starting a new document): only
 *  the interval's refresh should ever be suppressed by an in-progress "sent"
 *  confirmation — a document switch must always take effect immediately. */
async function refreshReviewRequest(fromPoll = false): Promise<void> {
  if (fromPoll && reviewBarConfirming) return;
  const path = doc.filePath;
  if (!path) {
    reviewRequest = null;
    renderReviewBar();
    return;
  }
  const result = await invoke<ReviewRequest | null>("review_request_state", { path });
  // Re-check after the await: a click may have started the "sent ✓"
  // confirmation while this poll's request was still in flight.
  if (fromPoll && reviewBarConfirming) return;
  reviewRequest = result;
  renderReviewBar();
  maybeAutoEnterReviewMode();
}

function renderReviewBar(): void {
  if (reviewBarError !== null) {
    // Sticky failure state: keep the bar up with both buttons live for a
    // retry, and don't let barModel's view of reviewRequest override it.
    reviewBar.hidden = false;
    reviewBar.classList.remove("sent");
    reviewBarLabel.textContent = reviewBarError;
    return;
  }
  const model = barModel(reviewRequest, annotations.length);
  // In review mode the bar stays up for the key legend even with nothing
  // waiting; the verdict buttons only show while an agent is blocked.
  reviewBar.hidden = !(model.visible || reviewMode);
  reviewBar.classList.toggle("legend-only", reviewMode && !model.visible);
  reviewBarHint.textContent =
    reviewMode && hintVisible ? hintText(reviewRequest?.state === "waiting") : "";
  reviewBarHint.hidden = reviewBarHint.textContent === "";
  if (!model.visible) {
    reviewBar.classList.remove("sent");
    reviewBarLabel.textContent = "";
    return;
  }
  // Drop any confirmation left over from a verdict on a previous document:
  // `.sent` hides the buttons, so without this an incoming document's live
  // review bar would show its label with nothing to click until the other
  // document's 1600ms timer happened to fire.
  reviewBar.classList.remove("sent");
  reviewBarLabel.textContent = `⏳ ${model.label}`;
  reviewApproveBtn.classList.toggle("primary", model.primary === "approved");
  reviewChangesBtn.classList.toggle("primary", model.primary === "changes");
}

/** Called once when a verdict's round trip settles, whichever way it went.
 *
 *  Clears the in-flight flag unconditionally so an abandoned or failed send
 *  can never wedge the buttons, and reports whether the document the verdict
 *  was for is still the open one. Everything the caller does afterwards —
 *  the sticky error, the "sent ✓" confirmation, nulling `reviewRequest` —
 *  is bookkeeping about *the open document*, and this is a multi-document,
 *  multi-agent workflow: another file may be open by now with its own live
 *  `folio review --wait` blocked on it. Writing A's outcome over B's state
 *  would tear down a real, actionable review bar and tell the user a verdict
 *  was sent that B's agent never received. The verdict itself already
 *  reached the agent either way — only the local UI must not leak across
 *  documents. */
function settleVerdict(path: string): boolean {
  verdictInFlight = false;
  return doc.filePath === path;
}

/** The verdict is away and the agent unblocked; flash a confirmation where
 *  the buttons were and drop the now-answered request. */
function showVerdictConfirmation(verdict: Verdict): void {
  reviewRequest = null;
  documentEditedDuringReview = false;
  reviewBarConfirming = true;
  reviewBar.hidden = false;
  reviewBar.classList.add("sent");
  reviewBarLabel.textContent = verdict === "approved" ? "sent ✓ approved" : "sent ✓ changes requested";
  setTimeout(() => {
    reviewBarConfirming = false;
    reviewBar.classList.remove("sent");
    renderReviewBar();
  }, 1600);
}

/** Send the verdict back to the blocked agent: the same structured feedback
 *  `Export Review Feedback` writes, plus the handshake resolution that
 *  unblocks `folio review --wait`. */
async function submitVerdict(verdict: Verdict): Promise<void> {
  const path = doc.filePath;
  if (!path) {
    // No document open. Nothing to submit — and if a stale error from a
    // document the user has since left was still showing, clear it here too
    // so the bar can never end up stuck with a message and no live button
    // to answer it. (Belt-and-suspenders: the catch below is
    // document-scoped and shouldn't set one in this state, but this keeps
    // the invariant true even if that ever changes.)
    if (reviewBarError !== null) {
      reviewBarError = null;
      renderReviewBar();
    }
    return;
  }
  if (verdictInFlight) return;
  // A verdict can only answer a review that is actually pending. Without
  // this, the ~1600ms "sent ✓" confirmation window is a gap: `verdictInFlight`
  // is already false there and `reviewRequest` is already null, so nothing
  // stops a second call from firing another write_text_file + resolve_review
  // against an already-decided handshake. The review bar's buttons are
  // hidden by CSS during that window, but the menu item (and its shortcut)
  // are not, so the check has to live here rather than at a single call
  // site. This mirrors the same condition `barModel` uses to decide the
  // bar — and therefore its buttons — are visible, so it never blocks the
  // buttons' own clicks.
  if (reviewRequest === null || reviewRequest.state !== "waiting") return;
  verdictInFlight = true;
  // A click is either the first attempt or a retry after a failure — either
  // way, any previous sticky error no longer describes the current attempt.
  reviewBarError = null;
  trackEvent("review_verdict", { verdict });
  const feedback = feedbackWithEditNote(
    buildFeedback(doc.fileName, annotations, diskContent ?? undefined),
    documentEditedDuringReview,
  );
  try {
    await invoke("write_text_file", { path: `${path}.feedback.md`, contents: feedback });
    await invoke("resolve_review", {
      path,
      verdict,
      feedback,
      documentEdited: documentEditedDuringReview,
    });
  } catch {
    if (!settleVerdict(path)) return;
    // The agent is blocked on `folio review --wait` with no other way to
    // learn something went wrong. Stick the error in the bar — cleared only
    // by a retry or a document change — instead of a plain label the next
    // poll tick would quietly overwrite with the ordinary "waiting" text.
    reviewBarError = "could not send — check the file is writable";
    renderReviewBar();
    return;
  }
  if (!settleVerdict(path)) return;
  showVerdictConfirmation(verdict);
}

reviewApproveBtn.addEventListener("click", () => void submitVerdict("approved"));
reviewChangesBtn.addEventListener("click", () => void submitVerdict("changes"));
setInterval(() => void refreshReviewRequest(true), REVIEW_POLL_MS);


// Clicking an annotation mark in the document opens the sidebar and
// highlights the annotation under the caret.
editorRoot.addEventListener("click", (e) => {
  const mark = (e.target as HTMLElement).closest(
    ".annot-comment, .annot-delete, .annot-replace",
  );
  if (!mark || annotations.length === 0) return;
  openPanel("annotations");
  editor.withView((view) => {
    const pos = view.posAtCoords({ left: e.clientX, top: e.clientY });
    if (!pos) return;
    const { segments } = docSegments(view);
    const docSize = view.state.doc.content.size;
    const hit = annotations.find((a) => {
      const range = findQuoteRange(segments, a.quote, docSize);
      return range !== null && pos.pos >= range.from && pos.pos <= range.to;
    });
    if (hit) jumpToAnnotation(hit);
  });
});

// ——— revision history ———

interface RevisionMeta {
  seq: number;
  archived_at: number;
  preview: string;
}

/** Archive the current version of the open file and refresh the History
 *  menu. Called on open, on watched reload, and on save. */
async function archiveCurrentRevision(origin: Origin): Promise<void> {
  const path = doc.filePath;
  if (!path) return;
  let rendered = "";
  editor.withView((view) => {
    rendered = renderedText(view);
  });
  await invoke("archive_revision", { path, markdown: currentMarkdown(), rendered, origin });
  await refreshRevisionMenu();
}

// ——— authorship ———
//
// Who wrote which words, from the revision archive's origins: agent
// rewrites are tinted, the reviewer's own words are not. Off by default.

const AUTHORSHIP_KEY = "folio-authorship";
let authorshipOn = localStorage.getItem(AUTHORSHIP_KEY) === "on";
let authorshipTimer: ReturnType<typeof setTimeout> | null = null;
const authorshipLegend = document.querySelector<HTMLElement>("#authorship-legend")!;

function toggleAuthorship(): void {
  authorshipOn = !authorshipOn;
  localStorage.setItem(AUTHORSHIP_KEY, authorshipOn ? "on" : "off");
  document.body.classList.toggle("authorship", authorshipOn);
  authorshipLegend.hidden = !authorshipOn;
  if (authorshipOn) void refreshAuthorship();
  else editor.withView(clearProvenance);
  syncMenuState();
}

async function refreshAuthorship(): Promise<void> {
  if (!authorshipOn || sourceMode) return;
  const path = doc.filePath;
  if (!path) {
    editor.withView(clearProvenance);
    return;
  }
  let revisions: RevisionText[];
  try {
    revisions = await invoke<RevisionText[]>("list_revision_contents", { path });
  } catch {
    return;
  }
  if (doc.filePath !== path) return;
  editor.withView((view) => {
    setProvenance(view, attribute(revisions, renderedText(view)));
  });
}

/** Typing changes attribution (new words are the reviewer's); recompute
 *  once it settles. */
function scheduleAuthorshipRefresh(): void {
  if (!authorshipOn) return;
  if (authorshipTimer !== null) clearTimeout(authorshipTimer);
  authorshipTimer = setTimeout(() => void refreshAuthorship(), 600);
}

async function refreshRevisionMenu(): Promise<void> {
  const path = doc.filePath;
  if (!path) {
    void invoke("set_revision_menu", { entries: [] });
    return;
  }
  const list = await invoke<RevisionMeta[]>("list_revisions", { path });
  void refreshHistoryTab();
  const entries = list.map((r, i) => {
    const time = new Date(r.archived_at * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const current = i === 0 ? " (current)" : "";
    return [r.seq, `v${r.seq} — ${time}${current} · ${r.preview}`] as [number, string];
  });
  void invoke("set_revision_menu", { entries });
}

/** History menu: diff the selected revision against the current document. */
/** The History tab: every archived version, newest first, with the
 *  change requests a revision answered and whether each passage changed. */
async function refreshHistoryTab(): Promise<void> {
  const path = doc.filePath;
  if (!path) {
    renderHistory([], () => {});
    return;
  }
  let chain: RevisionText[];
  try {
    chain = await invoke<RevisionText[]>("list_revision_contents", { path });
  } catch {
    return;
  }
  if (doc.filePath !== path) return;
  const entries = chain
    .map((r) => ({
      seq: r.seq ?? 0,
      archivedAt: r.archived_at ?? 0,
      label: revisionLabel(r.origin),
      outcomes: r.feedback ? requestOutcomes(parseFeedback(r.feedback), r.rendered) : null,
    }))
    .reverse();
  renderHistory(entries, (seq) => void openRevision(seq));
}

async function openRevision(seq: number): Promise<void> {
  const path = doc.filePath;
  if (!path || sourceMode) return;
  const revision = await invoke<{ rendered: string }>("read_revision", { path, seq });
  editor.withView((view) => showReloadDiff(view, revision.rendered));
}

// ——— themes ———

let appliedTheme: Theme = storedTheme(localStorage.getItem(THEME_STORAGE_KEY));

function applyTheme(theme: Theme, persist = true): void {
  appliedTheme = theme;
  document.documentElement.dataset.theme = theme;
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme);
  // The window has no native title bar; its buttons and overlay follow the
  // app's own light/dark choice rather than the system's.
  void getCurrentWindow().setTheme(isDarkTheme(theme) ? "dark" : "light");
}

function requestTheme(theme: Theme): void {
  applyTheme(theme);
  syncMenuState();
}

// ——— review mode ———

/** Requests the user left with `e`; auto-enter must not fight them. */
const dismissedReviewRequests = new Set<string>();
let hintVisible = true;
/** Cursor for n / p through the annotation list. */
let jumpIndex = -1;

function enterReviewMode(): void {
  if (sourceMode || reviewMode) return;
  reviewMode = true;
  document.body.classList.add("review-mode");
  editor.withView((view) => setReviewMode(view, true));
  trackEvent("review_mode");
  renderReviewBar();
  syncMenuState();
}

/** `dismiss` remembers the waiting request so it does not re-open review
 *  mode; false when leaving for another reason (a document switch, source
 *  mode) where the request should still get its chance later. */
function exitReviewMode(dismiss = true): void {
  if (!reviewMode) return;
  reviewMode = false;
  document.body.classList.remove("review-mode");
  editor.withView((view) => {
    closeEntry(view);
    setReviewMode(view, false);
    view.focus();
  });
  if (dismiss && reviewRequest?.state === "waiting") {
    dismissedReviewRequests.add(reviewRequest.requestedAt);
  }
  renderReviewBar();
  syncMenuState();
}

function toggleReviewMode(): void {
  if (reviewMode) exitReviewMode();
  else enterReviewMode();
}

/** A waiting request opens review mode by itself, unless the user already
 *  left it for this request. */
function maybeAutoEnterReviewMode(): void {
  if (reviewRequest?.state !== "waiting" || reviewMode || sourceMode) return;
  if (dismissedReviewRequests.has(reviewRequest.requestedAt)) return;
  enterReviewMode();
}

function nextAnnotation(delta: 1 | -1): Annotation | null {
  if (annotations.length === 0) return null;
  jumpIndex = (jumpIndex + delta + annotations.length) % annotations.length;
  return annotations[jumpIndex];
}

function runReviewAction(action: ReviewAction): void {
  switch (action.kind) {
    case "move":
      editor.withView((view) => moveCurrent(view, action.delta));
      return;
    case "annotate":
      openInlineEntry(action.annotation);
      return;
    case "mark":
      editor.withView((view) => {
        const quote = targetQuote(view);
        if (quote.trim()) addAnnotation(action.annotation, quote, "");
      });
      return;
    case "remove":
      editor.withView((view) => {
        const quote = targetQuote(view);
        // Prefer an exact match; a block-level mark is otherwise matched by
        // the annotation whose quote sits inside the block.
        const hit =
          annotations.find((a) => a.quote === quote) ??
          annotations.find((a) => quote.includes(a.quote));
        if (hit) void deleteAnnotation(hit);
      });
      return;
    case "jump": {
      const target = nextAnnotation(action.delta);
      if (target) {
        jumpToAnnotation(target);
        editor.withView((view) => setCurrentByPos(view, view.state.selection.from));
      }
      return;
    }
    case "send":
      if (reviewRequest?.state === "waiting") void submitVerdict(verdictFor(annotations));
      return;
    case "edit":
      exitReviewMode();
      return;
    case "hint":
      hintVisible = !hintVisible;
      renderReviewBar();
      return;
    case "outline":
      togglePanel("outline");
      return;
  }
}

window.addEventListener("keydown", (e) => {
  if (!reviewMode || sourceMode) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
  let entryOpen = false;
  editor.withView((view) => {
    entryOpen = isEntryOpen(view);
  });
  const action = reviewKeyAction(e, { entryOpen });
  if (!action) return;
  e.preventDefault();
  runReviewAction(action);
});

// ——— native menu dispatch ———

async function runMenuAction(action: MenuAction): Promise<void> {
  switch (action.kind) {
    case "new-file":
      return newFile();
    case "open-file":
      return openFile();
    case "quick-open":
      return openQuickOpen();
    case "save-file":
      return saveFile();
    case "save-file-as":
      return saveFile(true);
    case "export-html":
      return exportHtmlFile();
    case "export-pdf":
      return exportPdf();
    case "export-docx":
      return exportDocx();
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
    case "toggle-watch":
      toggleWatch();
      return;
    case "toggle-telemetry":
      toggleTelemetry();
      return;
    case "open-recent": {
      const path = recentFiles[action.index];
      if (path) await loadFromPath(path);
      return;
    }
    case "open-revision":
      return openRevision(action.seq);
    case "nav-back":
      return navigateBack();
    case "nav-forward":
      return navigateForward();
    case "annotate":
      openInlineEntry("comment");
      return;
    case "toggle-review-mode":
      toggleReviewMode();
      return;
    case "toggle-panel":
      togglePanel();
      return;
    case "toggle-authorship":
      toggleAuthorship();
      return;
    case "close-tab":
      return closeActiveTab();
    case "next-tab":
      return switchTab(1);
    case "prev-tab":
      return switchTab(-1);
    case "export-feedback":
      return exportReviewFeedback();
    case "approve-review":
      return submitVerdict("approved");
    case "clear-annotations":
      clearReviewAnnotations();
      return;
    case "set-theme":
      requestTheme(action.theme);
      return;
    case "zoom":
      applyZoom(action.direction);
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
// one opens in its own tab.
void listen<string>("file-open", (event) => {
  void loadFromPath(event.payload);
});

// ——— toolbar + fallback shortcuts (dev in browser has no native menu) ———

// ——— tabs ———
//
// One editor, many documents: the active tab lives in the editor; every
// other tab keeps a snapshot (content, dirty baseline, caret, scroll) and
// is restored by reloading it. A clean inactive tab is re-read from disk
// on return so it can never show stale text.

const tabs = new TabList();

function snapshotEditor(): TabSnapshot {
  return {
    content: currentMarkdown(),
    baseline: doc.baseline,
    dirty: doc.dirty,
    scroll: sourceMode ? sourceEditor.scrollTop : editorRoot.scrollTop,
    anchor: sourceMode ? anchorFromMarkdown(sourceEditor.value, sourceEditor.selectionStart) : editor.caretAnchor(),
  };
}

/** Bring a tab into the editor. */
async function showTab(tab: Tab): Promise<void> {
  const snap = tab.snapshot;
  tab.snapshot = null;
  if (tab.path !== null && !(snap?.dirty ?? false)) {
    // Clean: the disk is the truth.
    try {
      await loadFromPath(tab.path, { visit: false });
    } catch {
      await loadContent(snap?.content ?? "", tab.path);
    }
  } else {
    diskContent = tab.path === null ? null : diskContent;
    await loadContent(snap?.content ?? "", tab.path, snap?.baseline);
    annotations = [];
    void loadAnnotationsForOpenFile();
    void refreshReviewRequest();
    syncWatch();
  }
  if (snap) {
    if (sourceMode) {
      sourceEditor.scrollTop = snap.scroll;
      if (snap.anchor) placeSourceCaret(offsetFromAnchor(sourceEditor.value, snap.anchor));
    } else {
      if (snap.anchor) editor.setCaretAnchor(snap.anchor);
      editorRoot.scrollTop = snap.scroll;
    }
  }
  renderTabs();
  saveSessionNow();
}

async function activateTab(id: number): Promise<void> {
  if (id === tabs.active.id) return;
  tabs.remember(snapshotEditor());
  if (!tabs.activate(id)) return;
  await showTab(tabs.active);
}

async function switchTab(delta: 1 | -1): Promise<void> {
  if (tabs.all.length < 2) return;
  tabs.remember(snapshotEditor());
  tabs.step(delta);
  await showTab(tabs.active);
}

/** ⌘W: close the tab, asking first when it has unsaved edits; with one
 *  tab left, close the window instead. */
async function closeActiveTab(): Promise<void> {
  if (tabs.all.length === 1) {
    if (doc.dirty) {
      const discard = await confirm("You have unsaved changes. Close the window anyway?", {
        title: "Close Window",
        kind: "warning",
        okLabel: "Discard",
        cancelLabel: "Cancel",
      });
      if (!discard) return;
    }
    await getCurrentWindow().close();
    return;
  }
  await closeTab(tabs.active.id);
}

async function closeTab(id: number): Promise<void> {
  const tab = tabs.all.find((t) => t.id === id);
  if (!tab) return;
  const dirty = tab.id === tabs.active.id ? doc.dirty : (tab.snapshot?.dirty ?? false);
  if (dirty) {
    const discard = await confirm(`Discard unsaved changes to ${tab.title}?`, {
      title: "Close Tab",
      kind: "warning",
      okLabel: "Discard",
      cancelLabel: "Cancel",
    });
    if (!discard) return;
  }
  const wasActive = tab.id === tabs.active.id;
  if (!tabs.close(id)) return;
  if (wasActive) await showTab(tabs.active);
  else {
    renderTabs();
    saveSessionNow();
  }
}

function renderTabs(): void {
  const list = tabs.all;
  tabStrip.hidden = list.length < 2;
  tabStrip.replaceChildren(
    ...list.map((tab) => {
      const el = document.createElement("div");
      el.className = "tab";
      el.setAttribute("role", "tab");
      const active = tab.id === tabs.active.id;
      if (active) el.setAttribute("aria-current", "true");
      const dirty = active ? doc.dirty : (tab.snapshot?.dirty ?? false);
      el.classList.toggle("dirty", dirty);
      el.title = tab.path ?? "Untitled";
      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = tab.title;
      const close = document.createElement("button");
      close.className = "tab-close";
      close.type = "button";
      close.title = "Close tab";
      close.setAttribute("aria-label", `Close ${tab.title}`);
      close.innerHTML =
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        void closeTab(tab.id);
      });
      el.addEventListener("click", () => void activateTab(tab.id));
      el.addEventListener("auxclick", (e) => {
        if (e.button === 1) void closeTab(tab.id);
      });
      el.append(title, close);
      return el;
    }),
  );
}

window.addEventListener("keydown", (e) => {
  // ⌘⇧] / ⌘⇧[ and ⌃Tab / ⌃⇧Tab cycle tabs (the menu carries ⌘W).
  if (e.metaKey && e.shiftKey && (e.key === "]" || e.key === "}")) {
    e.preventDefault();
    void switchTab(1);
  } else if (e.metaKey && e.shiftKey && (e.key === "[" || e.key === "{")) {
    e.preventDefault();
    void switchTab(-1);
  } else if (e.ctrlKey && e.key === "Tab") {
    e.preventDefault();
    void switchTab(e.shiftKey ? -1 : 1);
  }
});

// ——— quick open (⌘P) ———
//
// A fuzzy finder over the Markdown files of the current project (the
// nearest git root, or the document's folder), with recents first. No
// sidebar, no tree: type, arrow, Enter.

const quickOpen = document.querySelector<HTMLElement>("#quick-open")!;
const quickOpenInput = document.querySelector<HTMLInputElement>("#quick-open-input")!;
const quickOpenList = document.querySelector<HTMLOListElement>("#quick-open-list")!;
const quickOpenHint = document.querySelector<HTMLElement>("#quick-open-hint")!;

interface ProjectFiles {
  root: string;
  files: string[];
}

let quickOpenProject: ProjectFiles | null = null;
let quickOpenResults: string[] = [];
let quickOpenIndex = 0;

async function openQuickOpen(): Promise<void> {
  const path = doc.filePath ?? recentFiles[0];
  if (!path) {
    await openFile();
    return;
  }
  quickOpenProject = await invoke<ProjectFiles>("list_project_markdown", { path });
  quickOpenInput.value = "";
  quickOpen.hidden = false;
  renderQuickOpen();
  quickOpenInput.focus();
}

function closeQuickOpen(): void {
  quickOpen.hidden = true;
  editor.withView((view) => view.focus());
}

function renderQuickOpen(): void {
  const project = quickOpenProject;
  if (!project) return;
  const root = project.root.endsWith("/") ? project.root : `${project.root}/`;
  const recents = recentFiles
    .filter((p) => p.startsWith(root))
    .map((p) => p.slice(root.length));
  quickOpenResults = rankFiles(quickOpenInput.value, project.files, recents, 12);
  quickOpenIndex = 0;
  quickOpenHint.textContent = `${displayPath(project.root)} · ${project.files.length} files`;
  if (quickOpenResults.length === 0) {
    const empty = document.createElement("li");
    empty.className = "qo-empty";
    empty.textContent = "No matching Markdown files";
    quickOpenList.replaceChildren(empty);
    return;
  }
  quickOpenList.replaceChildren(
    ...quickOpenResults.map((rel, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      if (i === quickOpenIndex) li.setAttribute("aria-selected", "true");
      const slash = rel.lastIndexOf("/");
      const name = document.createElement("span");
      name.textContent = slash === -1 ? rel : rel.slice(slash + 1);
      const dir = document.createElement("span");
      dir.className = "qo-dir";
      dir.textContent = slash === -1 ? "" : rel.slice(0, slash);
      li.append(name, dir);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        void chooseQuickOpen(i);
      });
      return li;
    }),
  );
}

function moveQuickOpen(delta: number): void {
  if (quickOpenResults.length === 0) return;
  quickOpenIndex = (quickOpenIndex + delta + quickOpenResults.length) % quickOpenResults.length;
  Array.from(quickOpenList.children).forEach((li, i) => {
    if (i === quickOpenIndex) li.setAttribute("aria-selected", "true");
    else li.removeAttribute("aria-selected");
  });
  quickOpenList.children[quickOpenIndex]?.scrollIntoView({ block: "nearest" });
}

async function chooseQuickOpen(index: number): Promise<void> {
  const rel = quickOpenResults[index];
  const project = quickOpenProject;
  if (!rel || !project) return;
  const root = project.root.endsWith("/") ? project.root : `${project.root}/`;
  closeQuickOpen();
  await loadFromPath(root + rel);
}

quickOpenInput.addEventListener("input", renderQuickOpen);
quickOpenInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveQuickOpen(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moveQuickOpen(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    void chooseQuickOpen(quickOpenIndex);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeQuickOpen();
  }
});
quickOpen.addEventListener("mousedown", (e) => {
  if (e.target === quickOpen) closeQuickOpen();
});

// ——— typing hush ———
//
// The chrome steps back while you type: the title strip and status bar fade
// on the first keystroke into the page and return on the next mouse move.
// Only printable typing counts — shortcuts and navigation leave it alone.
let hushed = false;

function setHushed(on: boolean): void {
  if (hushed === on) return;
  hushed = on;
  document.body.classList.toggle("hushed", on);
}

window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.length !== 1 && e.key !== "Enter" && e.key !== "Backspace") return;
  const target = e.target as HTMLElement | null;
  if (!target || !target.closest("#editor, #source-editor")) return;
  setHushed(true);
});
window.addEventListener("mousemove", () => setHushed(false));
window.addEventListener("blur", () => setHushed(false));
floatBtn.addEventListener("click", () => toggleFloatMode());
copyAgentBtn.addEventListener("click", () => void copyForAgent());
feedbackBtn.addEventListener("click", () => void exportReviewFeedback());

/** Copy the whole document as clean Markdown, ready to paste back into a
 *  coding agent with review feedback. */
async function copyForAgent(): Promise<void> {
  await copyText(currentMarkdown());
  copyAgentBtn.classList.add("copied");
  setTimeout(() => copyAgentBtn.classList.remove("copied"), 900);
}

window.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const key = e.key.toLowerCase();
  if (key === "o") {
    e.preventDefault();
    void openFile();
  } else if (key === "s") {
    e.preventDefault();
    void saveFile(e.shiftKey);
  } else if (key === "p" && !e.shiftKey) {
    e.preventDefault();
    void openQuickOpen();
  } else if (key === "[") {
    e.preventDefault();
    void navigateBack();
  } else if (key === "]") {
    e.preventDefault();
    void navigateForward();
  }
});

/** Take ownership of the shared native menu: one menu bar serves every
 *  window, so its Open Recent / Revision History contents and its checkmarks
 *  have to be re-pushed whenever focus lands here, or they would still
 *  describe whichever window was focused before. */
async function claimNativeMenu(): Promise<void> {
  // Another window may have opened files since this one started.
  recentFiles = loadRecent();
  await invoke("set_recent_files", { paths: recentFiles });
  await refreshRevisionMenu();
  // Both pushes above rebuild the native menu; re-assert the real
  // view/watch state last so no rebuild race can drop a checkmark.
  syncMenuState();
}

void editor.create("").then(async () => {
  renderTitle();
  // Mirror the persisted recent-files list into the native File menu.
  void invoke("set_recent_files", { paths: recentFiles });
  // Rust queued this window's job before the webview existed: a Finder
  // double-click, a CLI argument, or a `folio` invocation handed over by
  // the already-running process. A fresh document is never dirty, so no
  // confirm is needed here. With nothing queued the starting window picks
  // up where the last session left off; a new window stays blank.
  const startup = await invoke<StartupRequest>("take_startup_request");
  if (startup.paths.length > 0) {
    await loadFromPath(startup.paths[0]);
  } else if (isPrimaryWindow) {
    await restoreSession();
  }
  // `folio --float [file.md]` — enter floating review mode on launch.
  if (startup.float) setFloatMode(true);
  syncMenuState();
});

void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  if (focused) void claimNativeMenu();
});
// Align the native menu checkmarks with the actual (possibly persisted)
// view-mode state.
document.body.classList.toggle("authorship", authorshipOn);
authorshipLegend.hidden = !authorshipOn;
syncMenuState();
// Ask for telemetry consent on first launch; otherwise honor the choice.
initTelemetryFlow();
// Silent update check on launch; failures (offline, no release) are ignored.
void checkForUpdates(false);

