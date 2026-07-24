# Markdown Rendering Evaluation Suite

A standard set of documents for evaluating the Folio rendering engine
(Milkdown Crepe / ProseMirror) and the app's open/save behaviour. Open each
file in the app (⌘O) and compare the rendered output against the
"what to check" notes below.

The engine targets CommonMark + GFM (tables, task lists, strikethrough,
autolinks). Files are numbered roughly from core syntax to stress tests.

| File | Covers | What to check |
| ---- | ------ | ------------- |
| `00-empty.md` | Empty document | Placeholder shows ("Start writing — or press ⌘O to open a file"); no errors; word count reads "0 words". |
| `01-headings.md` | ATX 1–6, setext, closed ATX, inline formatting in headings, `#5` non-heading | Editorial scale applies per level; setext renders as headings; `#5` stays a paragraph; no stray `#` markers visible. |
| `02-emphasis.md` | Bold/italic/strikethrough, intraword rules, nested emphasis, inline code, escapes, entities | Intraword `_` stays literal; `un**frigging**believable` is partly bold; entities render as characters. |
| `03-lists.md` | Unordered/ordered, nesting, task lists, loose vs tight, block content in items, interruption rules | Task list checkboxes render and toggle; nested markers indent correctly; code/quote blocks sit inside list items. |
| `04-code.md` | Fenced blocks in 7 languages, language-less fence, tilde fence, nested fence, indented block, long line | Syntax highlighting per language; plain block has none; long line wraps without a horizontal scrollbar. |
| `05-tables.md` | Basic, alignment, inline formatting in cells, ragged rows, escaped pipes, wide and empty-header tables | Alignment honored; ragged rows padded; `\|` renders literally; wide table stays inside the measure. |
| `06-blockquotes.md` | Simple, lazy continuation, nesting, headings/lists/code/tables inside quotes, separated quotes | Accent bar per nesting level; separated quotes stay separate. |
| `07-links-images.md` | Inline/reference/autolinks, bare URLs, images (local, broken, remote), tricky destinations | Local `test-image.svg` resolves (or reveals a base-path gap); broken image degrades gracefully; link tooltip works. |
| `08-breaks-html.md` | Thematic breaks, soft/hard breaks, raw HTML blocks/inline, comments | Hard breaks create new lines; raw HTML behaviour is visible (rendered/escaped/stripped); comments invisible. |
| `09-unicode.md` | Emoji (incl. ZWJ sequences), CJK, RTL, combining marks, symbols, full-width punctuation, long unbroken string | No tofu boxes; RTL runs render; long string wraps without breaking layout. |
| `10-edge-cases.md` | Empty structures, cross-paragraph formatting, ambiguous markers, deep nesting, tabs, blank-line runs, no trailing newline | Nothing crashes; formatting does not leak across paragraphs; document stays editable. |
| `11-stress.md` | ~1,100 generated lines: 120 sections mixing every construct (deterministic, seed 42) | Scrolling stays smooth; word count is instant; save round-trip is fast; no flicker while typing at the top of a long doc. |

## Behavioural checks (app, not syntax)

These exercise the Rust commands and document model, not the renderer:

1. **Open → clean state**: opening any file must not set the dirty dot.
   (Regression guard for the serialization-baseline fix.)
2. **Save round-trip**: open `03-lists.md`, press ⌘S — the file is rewritten
   in the engine's canonical style (`*` bullets, blank lines between items).
   Reopen: still clean.
3. **CRLF normalization**: make a CRLF copy of any file (`unix2dos`),
   open it — no phantom dirty state, no `\r` artifacts.
4. **Dirty dot**: type one character — the accent dot appears next to the
   title; ⌘S clears it.
5. **Save As**: ⌘⇧S on an untitled document prompts for a path; the title
   and status-bar path update after saving.
6. **Word count**: status bar count updates as you edit and ignores pure
   markdown punctuation tokens.

## Notes

- `test-image.svg` is the local asset referenced by `07-links-images.md`.
- `11-stress.md` is generated; regenerate with the script in git history if
  the content needs to change.
