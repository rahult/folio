---
name: folio
description: Hand the current Markdown document to Folio for the user to review and annotate, then act on their verdict. Only when the user asks for it (/folio) — never on your own.
disable-model-invocation: true
argument-hint: "[path/to/document.md]"
---

# Review in Folio

The user wants to read a Markdown document in Folio, annotate it, and send
you a verdict without leaving the editor. Your job is the loop: open the
review, block on it, act on the result, repeat until approved.

## Which document

1. `$ARGUMENTS` if a path was given.
2. Otherwise the Markdown file you most recently wrote or edited in this
   conversation.
3. Otherwise the Markdown you are about to show the user — a plan, a
   proposal, a question with options — even when it is not in a file:
   pipe it (below) instead of writing a file for it.

Never pick a file the user has not mentioned or you have not written.

## Open the review and wait

```bash
folio review --wait --agent claude "<path>"
```

For content that lives only in the conversation, pipe it instead of a
path; Folio keeps it in a temporary file and reviews it the same way:

```bash
printf '%s\n' "$CONTENT" | folio review --wait --agent claude -
```

### Asking a question with options

Put the question in its own paragraph and the options as a numbered list
right under it. The reviewer picks with one key or one click, and the pick
comes back as a comment on the question whose body starts with `Chosen:`
followed by the option's text. Treat it as the answer; a comment without
`Chosen:` is a free-text answer or a remark.

Use your harness name for `--agent` (`claude`, `codex`, `kimi`, …). If
`folio` is not on PATH, run `/Applications/Folio.app/Contents/MacOS/folio`
with the same arguments.

The command opens the document in a floating Folio window and blocks until
the user clicks **Approve** or **Request changes**. Run it in the foreground
and let it block; do not background it or poll. It returns on its own after
nine minutes if the user has not answered.

Your shell tool has its own time limit. Give the command the longest one
you can (Claude Code: `timeout: 600000`), and if the limit is still shorter
than nine minutes, pass `--timeout` with a value safely below it, e.g.
`--timeout 100` under a two-minute limit. A command your harness kills is
the same as exit `3`: the review stays open and the verdict is kept.

Run one review per file at a time. If you run `--wait` again on a file
whose verdict is already in, it is returned at once without reopening the
window; if the window is still open, it is brought forward instead of
being opened twice.

## Act on the exit code

| Exit | Meaning | What you do |
| --- | --- | --- |
| `0` | Approved | Tell the user it was approved. Continue whatever the document was for. |
| `2` | Changes requested | The feedback is on stdout. Re-read the file, revise it, run the same command again. |
| `3` | Still open (timed out) | Say the review is waiting in Folio and end your turn. On your next turn, run `folio review --collect "<path>"` — the verdict is kept, nothing is lost. A command killed by your harness counts as `3`. |
| `4` | Could not open | Tell the user the path so they can open it by hand. Do not retry. |

**Re-read the file before every revision.** The user may answer by editing
the document directly instead of annotating; the feedback says so when it
happens, but the file on disk is always the source of truth.

Feedback is numbered instructions with the quoted passage each one refers
to, with its line numbers in the file when known (`L12–14`): *Comment on*,
*Delete*, or *Replace*. Apply each one to the passage it quotes; a comment
is a question or request, not text to paste in. A trailing **Keep as is**
section lists passages the user marked as good: leave those untouched when
you revise. A trailing **Instructions** section, when present, applies to
every change you make.

Folio also writes the feedback to `<path>.feedback.md` beside the document.
You do not need it in this loop. If it exists after the review, delete it
so it is not committed.

## Do not

- Open Folio because you think a document deserves review. The user asks.
- Keep looping after `3`. End the turn; collect next turn.
- Summarize the feedback back to the user instead of applying it.
- Edit or reformat the parts of the document the feedback did not touch.
