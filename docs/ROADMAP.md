# Folio roadmap

_A living list. Move items between sections as they ship; add new ones at
the bottom of the section they belong to with a line on why. Research
behind most entries: `docs/research/`. Designs: `docs/superpowers/specs/`._

Folio is a calm Markdown editor that is becoming a place to think about a
document: read it, argue with it, decide, remember why. It is free, local,
file-based, and works with coding agents through files. It does not sync,
does not host plugins, and does not write prose for you.

## Shipped

Release history is in GitHub Releases; this is the feature-level view.

- Editor: WYSIWYG page, source mode with caret preserved, tabs, five
  themes, overlay title strip with quiet chrome, focus and typewriter
  modes, zoom, relative images, native menus, session restore, auto-update.
- Export: HTML with embedded fonts, images, and Mermaid; PDF from the same
  rendering; Word (.docx) with real styles.
- Navigation: Quick Open (⌘P) over the project, wikilinks with completion,
  heading targets, back/forward, Open Recent.
- Agent review: float-on-top live reload with rewrite diffs, annotations
  (comment/delete/replace/looks good), Review Mode single keys, the
  `folio review --wait` gate with exit codes, the user-invoked `/folio`
  skill, structured feedback with line numbers and a Keep-as-is section.
- Reading: reading panel with outline, per-section reading time, current
  section, takeaway saved to `<doc>.decision.md`.
- Provenance: Authorship tints (agent / revised / yours) from archived
  revisions; History tab linking each revision to the feedback it answered
  and whether each requested passage changed.
- Decide: Decide tab with section recall, premortem (nudged once before an
  approval), debiasing checklist, decision record with write-once
  confidence, revisits, due-revisit list, and the journal at
  `~/Documents/Folio/decisions.md`.

## Next (in order)

1. **Interrogate stage.** The `<doc>.analysis.md` contract (summary,
   claims, assumptions, gaps, risks, options, recommendation), an Analysis
   tab rendering it as cards, `/folio analyse` producing it through the
   agent, one key turning any claim or question into a comment annotation.
   Optional direct model key for people without an agent, off by default.
2. **Calibration view.** Confidence against outcome across a folder's
   decision files, shown only once there are enough entries to mean
   something. Depends on the Decide tab (shipped).
3. **Missing-warrant annotation kind** in Review Mode (Toulmin): the reviewer
   marks a claim whose grounds are absent; goes into feedback as a request.
4. **Feynman-mode takeaway**: write the takeaway with the page hidden.
5. **Prose-density signal** per section in the outline (grade level, not
   called readability), with long-sentence highlighting on demand.

## Later

- Review queue: `folio review a.md b.md c.md` shows the set in the panel
  ordered by reading time with verdict state.
- CriticMarkup import/export as the annotation interchange format.
- Per-section read progress persisted with the decision file.
- Redundancy scan for agent-written prose (near-duplicate paragraphs).
- Publish the `.feedback.md` format as a spec with a JSON sidecar.
- Argdown-style argument map companion file, human-edited; an agent may
  draft, never finalize.
- User CSS themes on documented tokens; named export styles with a custom
  CSS slot.
- Math (Crepe's LaTeX feature) in the page and the exports.
- Section folding in the page.
- Writing goals (word target in the status bar).
- Callouts (`> [!note]`) rendered as styled blocks.
- Revision history for every saved file, not only watched ones (largely
  true already; make the archive origin visible in the File menu).
- Fix upstream: Crepe's image block rewrites alt text as the aspect ratio
  on save.

## Not planned

Cloud sync, a plugin system, built-in AI writing, real-time collaboration,
a database instead of files, blog publishing integrations. Each is argued
in `docs/research/2026-09-11-markdown-editor-landscape.md`.

## Traps to keep out

Speed reading, gamified streaks, mandatory checklists, auto-generated
summaries in place of the reader's own sentence, grading the reader's
recall, editable confidence after the fact. The mechanism in every
technique above is the person producing the thought; a feature that
produces it for them removes the benefit.
