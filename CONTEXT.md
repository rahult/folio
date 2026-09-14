# Folio

A calm Markdown editor that is becoming a place to think about a document:
read it, argue with it, decide, remember why. Everything is a file beside
the document, so a person and a coding agent can meet there.

## Language

### The document and what belongs to it

**Document**:
The Markdown file a person is reading or writing. Every other term hangs
off one.
_Avoid_: page, note, file (when the relationship matters)

**Companion**:
A file that belongs to a Document by relationship: Feedback, the Decision
file, the Analysis. A file can be a Document in its own right and a
Companion of another at the same time. Folio never creates Companions of
Companions.
_Avoid_: sidecar, metadata file

**Revision**:
One archived snapshot of a Document, with an origin and, when it answered
Feedback, the Feedback it answered. History is a Document's Revisions in
order.
_Avoid_: version, backup

### Review

**Review**:
A person judging a Document an Agent wrote and giving a Verdict. Made of
Review Mode inside Folio and the Gate outside it.
_Avoid_: agent review, annotation session

**Review Mode**:
The read-only keyboard state while reviewing, in the app's window or in
the terminal. Same keys, same Annotations, whichever draws it.

**Gate**:
The side of a Review that waits, outside Folio, for the Verdict.
_Avoid_: review gate, wait loop

**Annotation**:
One mark a reviewer puts on a passage: comment, delete, replace, or looks
good. Praise is an Annotation, not a separate thing.
_Avoid_: note, mark, suggestion

**Feedback**:
Everything a Review produced for a Document: its Annotations, its Verdict,
and what to keep as is. A Companion.
_Avoid_: review file, comments

**Verdict**:
The outcome of a Review, approved or changes requested. Belongs to the
Feedback, never to one Annotation. About the text.
_Avoid_: approval, decision

### Deciding

**Decision**:
What the reader will do in the world after reading, with reversibility,
confidence, reasons, and when to revisit. Distinct from a Verdict:
approving a plan is a Verdict; shipping behind a flag is a Decision. Kept
in the Decision file, a Companion, and copied into the Journal.
_Avoid_: verdict, outcome

**Journal**:
The reader's ledger of Decisions and their revisits across Documents.
_Avoid_: log, history

### Interrogating

**Lens**:
A mental model expressed as a prompt: a council of experts, second-order
effects, a two-way door. Built in, or a file the person wrote.
_Avoid_: prompt, template, model (in this sense)

**Reading**:
One Lens applied once to a Document or a passage of it, by some producer.
The producer, a Model's name or an Agent's name, is an attribute of the
Reading, not a kind of Reading.
_Avoid_: lens result, analysis (for a single one), output

**Analysis**:
All the Readings of a Document. A Companion.
_Avoid_: results file

### Who else is in the room

**Agent**:
A coding harness that writes Documents and acts on files, reading Feedback
and producing Readings, only when the person invokes it. Folio never
invokes one.
_Avoid_: assistant, AI, bot

**Model**:
A language-model endpoint the person brings, which only answers a prompt
Folio sends it. Runs Lenses. Never acts on files.
_Avoid_: agent, LLM, assistant

### What Folio is made of

**Command**:
The `folio` binary a person or an Agent runs from a terminal. Separate from
the app (ADR 0002), it runs the Gate, the skill, and later the terminal
Review Mode; anything that needs a window it delegates to the app.
_Avoid_: CLI tool, folio-cli, the app

**Core**:
`folio-core`, the library the Command and the app both link. It owns the
Companion file formats, so the two binaries can never disagree about what
is on disk.
_Avoid_: shared crate, common

A note on a word that is not ours: "sidecar" is Tauri's term for the
Command bundled beside the app inside the app's own package. It is a build
arrangement, never a Companion.

### Settings

**Settings**:
Folio's defaults, kept in one file the app and the Command both read:
theme, live reload, telemetry, review defaults, the lens endpoint, and
where the Home folder is.
_Avoid_: preferences, config, options

**Home folder**:
The folder holding every file the person may edit by hand: the Journal,
custom lenses, Overrides, the lens rules, the standing feedback
instructions, the skill text. Default `~/Documents/Folio`.
_Avoid_: data folder, library, workspace

**Override**:
A file in the Home folder that replaces a built-in text by name: a
built-in Lens, the lens response rules, or the bundled skill text.
Deleting it restores the built-in.
_Avoid_: customisation, patch, fork
