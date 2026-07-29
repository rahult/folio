# Design: Review Gate — close the agent review loop inside Folio

Date: 2026-07-29
Status: designed

## Problem

Folio already covers four of the five steps in the agent review loop: the
PostToolUse hook opens every `.md` an agent writes in a floating window, the
window live-reloads with change highlights, annotations persist in SQLite,
and `buildFeedback()` serializes them into agent-actionable Markdown at
`<plan>.md.feedback.md`.

The fifth step is missing. When the review is done, nothing happens. The
feedback file lands on disk and waits. To act on it the user must leave
Folio, switch to the terminal, and re-prompt the agent — which is also the
moment the agent's context is coldest and the user's attention is furthest
from the document they just read.

Folio is one step short of being the whole loop.

## Approach

Make the review a **blocking gate the agent waits on**. The agent runs
`folio review --wait <path>` as an ordinary shell call; the call blocks while
the user reviews in Folio; clicking **Approve** or **Request changes** ends
the block and prints the feedback to the agent's stdout. The agent revises or
proceeds in the same turn. The terminal is never touched.

Three properties make this fit Folio rather than fight it:

- **The CLI never becomes the app.** `--wait` branches out of `run()` before
  `tauri::Builder`, so it lives as a plain blocking poller and sidesteps the
  single-instance plugin entirely instead of contending with it.
- **The file stays the seam.** No sockets, no daemon, no API keys. The
  handshake is one JSON file; the human-readable `.feedback.md` is still
  written beside the plan exactly as today.
- **It degrades to today's behavior.** Timeout, a closed window, or an agent
  that does not know about `--wait` all fall back to the existing async
  file-driven flow with nothing lost.

## Components

### The handshake file

`/tmp/folio-review/<hash>.json`, where `<hash>` is the 16-hex-digit FNV-1a
of the canonical path — reusing `path_hash` in `lib.rs`, which already names
revision-archive directories the same way.

```json
{
  "path": "/abs/docs/plan.md",
  "agent": "claude",
  "pid": 4821,
  "requestedAt": "2026-07-29T16:41:02Z",
  "state": "waiting",
  "decidedAt": null,
  "feedback": null,
  "documentEdited": false
}
```

`state` moves `waiting` → `approved` | `changes`. That is the entire
contract between the CLI and the window.

Temp-dir placement is deliberate: handshake state is machine-local and
disposable, and putting it beside the plan would add a second untracked file
to the user's repo for every review. It self-cleans on reboot, and stale
entries (>24h) are swept at app startup.

Writes are atomic — write to `<hash>.json.tmp`, then rename — so a poller
never reads a half-written verdict.

### `src-tauri/src/reviewgate.rs` (new)

Owns the handshake: path hashing, atomic read/write, verdict polling, stale
sweeping, and exit-code mapping. Pure enough to unit-test against a
caller-supplied directory, following the pattern `drain_spool_in` and
`write_spool_in` already establish in `lib.rs`.

### `src-tauri/src/lib.rs`

- `parse_cli_args` learns `--wait`, `--collect`, `--timeout <secs>`, and
  `--agent <name>`, extending the existing flag-lifting logic that already
  handles `--float` / `-f` / `review` / `-`.
- A headless branch at the top of `run()`: when `wait` or `collect` is set,
  run the review-gate CLI and `std::process::exit` — the Tauri builder is
  never reached.
- Two commands for the window: `review_request_state(path)` and
  `resolve_review(path, verdict, feedback, documentEdited)`.

### CLI surface

| Command | Behavior | Exit codes |
| --- | --- | --- |
| `folio review --wait <path>` | Writes the handshake, opens or forwards the floating window, polls at 200 ms until a verdict or timeout. Prints feedback Markdown to stdout. | `0` approved · `2` changes requested · `3` still open |
| `folio review --collect <path>` | Reads once. No window, no blocking. The resumable half of `--wait`. | `0` · `2` · `3` still waiting · `4` no request |
| `folio review <path>` | Unchanged — fire-and-forget. | `0` |

The default timeout is **540 seconds**, chosen to sit under Claude Code's
600-second hard cap on shell calls so the agent gets a real exit code
instead of being killed mid-wait. On timeout the handshake is left in
`waiting`: the user's verdict is still recorded whenever they get to it, and
the agent collects it next turn with `--collect`. No review work is ever
lost to a timeout.

`--wait` spawns the app detached if it is not already running; if it is, the
existing spool mechanism carries the request to the primary instance.

### `src/reviewgate.ts` (new, pure)

The bar's state machine and feedback assembly, DOM-free and unit-testable in
the manner of `annotations.ts`: given a request state and an annotation
count, decide whether the bar shows, which button is primary, and what the
outgoing feedback body is.

### Review bar

A slim bar pinned to the bottom of the window, rendered **only** while a
`waiting` request exists for the open file. Absent entirely otherwise — a
window being written in never grows review chrome.

```
├──────────────────────────────────────┤
│ ⏳ claude waiting · 3 annotations     │
│              [Request changes] [✓ Approve]
└──────────────────────────────────────┘
```

The primary button follows the annotation count: **Request changes** when
the document is marked up, **Approve** when it is clean. Both actions remain
available in either state — a user may have resolved their annotations by
editing the document directly.

Either click reuses the existing `buildFeedback()`, writes
`<plan>.md.feedback.md` beside the file as today, resolves the handshake,
and collapses the bar to a quiet `sent ✓`.

If the document was edited during the review, `documentEdited: true` appends
a line to the feedback telling the agent the user revised the document and
it must re-read the file before acting.

Menu and keyboard parity: **File → Approve Review** (⇧⌘R); the existing
**Export Review Feedback** (⌥⌘R) sends the changes verdict.

### `scripts/install-agent-integrations.sh`

A v2 instruction block teaching agents the gate and its exit codes:

```bash
folio review --wait docs/plan.md
# 0 = approved      → proceed
# 2 = changes       → stdout holds the feedback; revise and re-submit
# 3 = still open    → tell the user, then `folio review --collect` next turn
```

The installer currently *skips* a file whose marker is already present, which
would strand everyone on v1. It learns to **replace** the content between
`<!-- folio:plan-review -->` and `<!-- /folio:plan-review -->`, making
re-running the installer an upgrade rather than a no-op.

The PostToolUse hook stays as-is for `.md` writes that are not explicit
review requests.

## Data flow

```
agent writes plan.md
        │
        ├─ folio review --wait plan.md
        │       ├─ write /tmp/folio-review/<hash>.json  state=waiting
        │       ├─ spawn/forward → floating window opens
        │       └─ poll every 200ms ────────────────┐
        │                                           │
   user reviews, annotates, maybe edits             │
        │                                           │
        └─ clicks [Approve] / [Request changes]     │
                ├─ buildFeedback()                  │
                ├─ write plan.md.feedback.md        │
                └─ resolve_review() ────────────────┘
                        state=approved|changes
                                │
                    CLI prints feedback → stdout
                    exits 0 | 2
                                │
                    agent proceeds or revises, same turn
```

## Error handling

| Case | Behavior |
| --- | --- |
| App not running | `--wait` spawns it detached, then polls |
| Window closed undecided | Handshake stays `waiting`; reopening the file restores the bar and the verdict still lands |
| Timeout | Exit 3, handshake preserved, `--collect` retrieves the verdict later |
| Two agents waiting on one file | Same hash key; the later request overwrites, and one verdict serves both |
| Stale handshakes (>24h) | Swept at app startup, mirroring `spool_is_fresh` |
| `folio review --wait -` (piped stdin) | Wait works against the resolved temp file; `--collect` is not meaningful for it and exits 4 |
| Corrupt/unreadable handshake | Treated as no request — the bar stays hidden and `--collect` exits 4 |

## Testing

**Rust** — `parse_cli_args` lifting each new flag (and their combinations
with `review` / `-f` / `-`); handshake write → read round-trip; atomic
rename under a concurrent reader; verdict-to-exit-code mapping; stale
sweeping against a caller-supplied directory.

**Vitest** — `tests/reviewgate.test.ts`: bar visibility for each request
state, primary-button selection by annotation count, feedback assembly
including the `documentEdited` note, and the no-request case.

## Out of scope (deliberate)

- Per-agent push commands (`claude --resume …`) — cannot reliably reach a
  session already mid-turn, and needs per-agent configuration.
- A multi-file review queue or dashboard.
- Verdict history and audit trail.
- New Pro gating. The gate is part of the free wedge, consistent with the
  roadmap's position that float-mode review is top-of-funnel.
