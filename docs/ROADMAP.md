# Folio — Roadmap to a $10 Editor

_Research compiled July 2026. Sources: competitor pricing pages and reviews —
[Typora vs Obsidian vs VS Code (2026)](https://www.markdown-to-word.online/markdown-editors-comparison/),
[Typora review](https://www.scalarly.com/startup-stack/typora-the-seamless-markdown-editor-for-writers-and-developers/),
[iA Writer review](https://elephas.app/blog/iawriter-review),
[Best markdown editors 2024](https://downloadchaos.com/blog/best-markdown-editors-2024),
[AI spec review tools 2026](https://www.augmentcode.com/tools/best-ai-spec-review-tools-for-development-teams)._

## The market, in one paragraph

| Editor | Price | What people actually pay for |
| --- | --- | --- |
| Typora | $14.99 one-time (3 devices) | The WYSIWYG writing feel + broad export (PDF, HTML, **Word**, LaTeX) |
| iA Writer | $29.99 **per platform** | Focus aesthetics, style check, docx export |
| Ulysses | ~$39.99/yr subscription | Best-in-class Word export, library, goals, sync |
| Bear | $2.99/mo subscription | Polish + sync |
| Obsidian | Free (Catalyst $25) | Linking, plugins — free core kills "me-too" editors |
| MarkText / Zettlr / VS Code | Free | "Good enough" WYSIWYG / academic features / devs |

Two conclusions:

1. **Nobody pays for editing.** Every free alternative edits fine. Money
   changes hands for *what leaves the editor* (export fidelity — Word/docx
   above all), *how it feels to write for hours* (focus, themes, typewriter),
   and *how much of your life it organizes* (library, goals, sync).
2. **There is an unowned wedge:** reviewing AI-agent output. Agents (Kimi,
   Claude Code, Codex) emit markdown — plans, specs, docs — and developers
   currently review it in terminals or web UIs. No markdown editor is built
   for *reviewing and approving* that stream. Folio's float mode (shipped
   v0.4.0) is already the seed of this.

## Pricing position

**$10 one-time, per user (3 devices), free trial of Pro via the existing
license flow.** Sits visibly below Typora ($14.99) and a third of iA Writer
($29.99/platform), while offering something neither has. One-time is a
deliberate contrast to Ulysses/Bear subscriptions — "calm software" pricing
matches the brand.

## Jobs to be done

- **JTBD-1 (the writer):** "When I draft in markdown, I want to think about
  the sentence, not the syntax — and hand off a Word/PDF/HTML file that
  looks right without fixing it afterward."
- **JTBD-2 (the engineer × agent — the wedge):** "When my coding agent
  rewrites a plan/spec/doc, I want to *see what it did* at a glance, keep it
  in view while I work, and approve or correct it fast — so I stay the
  reviewer, not the proofreader-by-diff-in-a-terminal."
- **JTBD-3 (the note-taker):** "When I come back to a document days later,
  I want to resume instantly and find my place."

## Prioritized roadmap

Impact = how much it moves the $10 decision. Effort in rough dev-days.

### P0 — Close the export gap (table stakes for charging anything)

| # | Feature | JTBD | Impact | Effort | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | **Word/docx export** (Pro) | 1 | ★★★★★ | 3–5 | The single most-cited paid feature across Typora/iA/Ulysses reviews. Bundle Pandoc (GPL — check licensing) or write docx via a Rust crate (`docx-rs`). HTML/PDF already shipped; docx completes the story. |
| 2 | **Session restore** — reopen last file, caret, scroll | 3 | ★★★★ | 1 | Cheap, felt every launch. |
| 3 | **Auto-reload everywhere** (generalize float-mode watching) | 2, 3 | ★★★★ | 1 | The watcher already exists; add a File-menu toggle so git checkouts/agent edits reload in normal windows too. |
| 4 | **Recent files menu** | 3 | ★★★ | 1 | Native submenu, 10 entries. |

### P1 — Own the agent-review wedge (differentiation)

| # | Feature | JTBD | Impact | Effort | Notes |
| --- | --- | --- | --- | --- | --- |
| 5 | **Rewrite diff view** — highlight what changed on reload | 2 | ★★★★★ | 4–6 | The killer review feature: added/removed spans marked quietly in the rendered page. Milkdown has a diff plugin (`@milkdown/plugin-diff` — check fit) or compute a lightweight word-diff on markdown before rendering. Nobody else has this. |
| 6 | **`folio review` CLI + pipe support** — `agent … | folio --float -` | 2 | ★★★★ | 2–3 | stdin → temp watched file; also `folio review <path>` alias for docs/UX. |
| 7 | **Copy-for-agent button** — selection → clean markdown for pasting back into the agent | 2 | ★★★ | 1 | Closes the review → feedback loop in one click. |
| 8 | **Approve/annotate workflow lite** — checkboxes/comments that write back to the file | 2 | ★★★ | 3–4 | Task-list toggling already round-trips; a "Reviewed ✓" stamp appends a marker line. Only if diff view lands well. |

### P2 — Deepen the writing feel (retention, word-of-mouth)

| # | Feature | JTBD | Impact | Effort | Notes |
| --- | --- | --- | --- | --- | --- |
| 9 | **Writing goals & stats** — word target, reading time, session count | 1 | ★★★ | 2 | Ulysses/MDOffice-style goals; quiet status-bar target ring. |
| 10 | **Quick open (⌘P)** — fuzzy file switcher over recent + a folder | 3 | ★★★ | 2–3 | Library benefits without betraying the no-sidebar design. |
| 11 | **Export themes** — 2–3 styled PDF/HTML templates | 1 | ★★★ | 2 | Multiplies the value of the export pipeline already built. |
| 12 | **Custom user themes** (CSS drop-in) | 1 | ★★ | 1–2 | Cheap once theme tokens are documented. |

### P3 — Later / only if traction

- **Multi-window** (two docs side by side) — window plumbing exists post float-mode.
- **ePub / RTF export** — rides the docx pipeline.
- **Presentation mode** (markdown → slides).
- **Explicit non-goals:** cloud sync (server costs, scope creep — iCloud/Dropbox
  folders already work), plugin ecosystem (maintenance sink), collaboration
  (different product), AI writing features (off-brand; the agents write
  elsewhere — Folio is where you *review* them).

## Suggested Pro/free split at $10

- **Free (already generous, drives installs):** full WYSIWYG editor, source
  mode, native menus, float-mode live review (the demo of the wedge), zoom,
  table editing, Paper theme.
- **Pro ($10):** the export bundle (HTML + PDF + **docx**, export themes),
  focus/typewriter, Night + Newsprint + custom themes, **rewrite diff view**,
  `folio review` CLI/pipe, writing goals.

The free tier's float mode is the top-of-funnel: engineers discover Folio as
"the agent review pane," and the diff view + export bundle is what converts.

## Release sequence

1. **v0.5** — P0: docx export, session restore, auto-reload everywhere, recent files
2. **v0.6** — P1: rewrite diff view, `folio review` CLI + pipe, copy-for-agent
3. **v0.7** — P2: goals & stats, quick open, export themes
4. Re-evaluate with sales data before P3.

**Status (July 2026):** v0.5 shipped P0 items 2–4 (session restore,
auto-reload everywhere, recent files) and all of P1 (rewrite diff view,
`folio review` + stdin pipe, copy-for-agent). P1 follow-up shipped the
[plannotator](https://plannotator.ai/)-style review loop: inline
annotations (comment / delete / replace) with structured feedback export,
and revision history with diffs. Next up: docx export (P0-1),
the largest remaining item before the $10 launch.
