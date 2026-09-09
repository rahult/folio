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
3. Otherwise ask which file.

Never pick a file the user has not mentioned or you have not written.

## Open the review and wait

```bash
folio review --wait --agent claude "<path>"
```

Use your harness name for `--agent` (`claude`, `codex`, `kimi`, …). If
`folio` is not on PATH, run `/Applications/Folio.app/Contents/MacOS/folio`
with the same arguments.

The command opens the document in a floating Folio window and blocks until
the user clicks **Approve** or **Request changes**. Run it in the foreground
and let it block; do not background it, poll, or time it out yourself. It
returns on its own after nine minutes if the user has not answered.

## Act on the exit code

| Exit | Meaning | What you do |
| --- | --- | --- |
| `0` | Approved | Tell the user it was approved. Continue whatever the document was for. |
| `2` | Changes requested | The feedback is on stdout. Re-read the file, revise it, run the same command again. |
| `3` | Still open (timed out) | Say the review is waiting in Folio and end your turn. On your next turn, run `folio review --collect "<path>"` — the verdict is kept, nothing is lost. |
| `4` | Could not open | Tell the user the path so they can open it by hand. Do not retry. |

**Re-read the file before every revision.** The user may answer by editing
the document directly instead of annotating; the feedback says so when it
happens, but the file on disk is always the source of truth.

Feedback is numbered instructions with the quoted passage each one refers
to: *Comment on*, *Delete*, or *Replace*. Apply each one to the passage it
quotes; a comment is a question or request, not text to paste in.

Folio also writes the feedback to `<path>.feedback.md` beside the document.
You do not need it in this loop. If it exists after the review, delete it
so it is not committed.

## Do not

- Open Folio because you think a document deserves review. The user asks.
- Keep looping after `3`. End the turn; collect next turn.
- Summarize the feedback back to the user instead of applying it.
- Edit or reformat the parts of the document the feedback did not touch.
