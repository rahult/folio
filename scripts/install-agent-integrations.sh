#!/bin/sh
# Install Folio's plan-review integration for coding agents (Claude Code,
# Codex CLI, Kimi Code). Idempotent — safe to re-run.
#
# What it does:
#   1. Puts a `folio` CLI shim on PATH (~/.local/bin/folio → the app bundle)
#   2. Appends a "Markdown plan review with Folio" instruction block to the
#      global instruction file of each agent (skipped if already present)
#   3. Installs a Claude Code PostToolUse hook that opens every .md write
#      in a floating Folio review window
set -eu

APP=/Applications/Folio.app/Contents/MacOS/folio
BIN_DIR="$HOME/.local/bin"
SHIM="$BIN_DIR/folio"
MARKER="folio:plan-review"

if [ ! -x "$APP" ]; then
  echo "Folio is not installed at /Applications/Folio.app — install it first." >&2
  exit 1
fi

# 1. CLI shim
mkdir -p "$BIN_DIR"
cat > "$SHIM" <<EOF
#!/bin/sh
# Folio CLI shim — routes to the installed app bundle.
exec $APP "\$@"
EOF
chmod +x "$SHIM"
echo "shim: $SHIM"

# 2. Instruction blocks
BLOCK='<!-- folio:plan-review -->
## Markdown plan review with Folio

When you write or substantially revise a plan, spec, or other Markdown document the user should review, hand it to Folio and wait for the verdict:

```bash
folio review --wait --agent claude <path>
```

This opens the document in a floating review window and blocks until the user approves it or requests changes. The review feedback is printed to stdout; the exit code says what to do next:

- `0` — approved. Proceed with the work.
- `2` — changes requested. The feedback is on stdout; revise the document and run the command again.
- `3` — the review is still open (the wait timed out after 9 minutes). Tell the user the plan is waiting for them in Folio, end your turn, and on your next turn run `folio review --collect <path>` to pick up the verdict — it is preserved, nothing is lost.
- `4` — no review could be opened. Fall back to telling the user the path.

The user annotates by selecting text (Edit -> Annotate Selection, Cmd+Opt+A) and sends the verdict from the review bar at the bottom of the window. Feedback is also written to `<path>.feedback.md` beside the document — read it if you ever need it outside the `--wait` flow, then delete it.

Before revising, re-read the document: the user may have answered by editing it directly rather than annotating.

Fallback if `folio` is not on PATH: `/Applications/Folio.app/Contents/MacOS/folio`.
<!-- /folio:plan-review -->'

for f in "$HOME/.claude/CLAUDE.md" "$HOME/.codex/AGENTS.md" "$HOME/.agents/AGENTS.md"; do
  mkdir -p "$(dirname "$f")"
  touch "$f"
  if grep -q "$MARKER" "$f"; then
    # Upgrade in place: replace everything between the markers so re-running
    # the installer is an upgrade rather than a no-op.
    BLOCK="$BLOCK" python3 - "$f" <<'PYEOF'
import os, re, sys

path = sys.argv[1]
with open(path) as fh:
    text = fh.read()
block = os.environ["BLOCK"]
pattern = re.compile(
    r"<!-- folio:plan-review -->.*?<!-- /folio:plan-review -->", re.DOTALL
)
with open(path, "w") as fh:
    fh.write(pattern.sub(lambda _: block, text))
PYEOF
    echo "instructions upgraded: $f"
  else
    printf '\n%s\n' "$BLOCK" >> "$f"
    echo "instructions appended: $f"
  fi
done

# 3. Claude Code PostToolUse hook
SETTINGS="$HOME/.claude/settings.json"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
cp "$SETTINGS" "$SETTINGS.folio-bak"
python3 - "$SETTINGS" <<'PYEOF'
import json, sys

path = sys.argv[1]
with open(path) as f:
    settings = json.load(f)

hook_command = (
    "f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null); "
    'case "$f" in *.md|*.markdown|*.mdown|*.mkd) '
    '( folio review "$f" >/dev/null 2>&1 || /Applications/Folio.app/Contents/MacOS/folio review "$f" >/dev/null 2>&1 ) & '
    "esac; exit 0"
)
entry = {"matcher": "Write|Edit|MultiEdit", "hooks": [{"type": "command", "command": hook_command}]}

post = settings.setdefault("hooks", {}).setdefault("PostToolUse", [])
if not any("folio review" in h.get("command", "") for e in post for h in e.get("hooks", [])):
    post.append(entry)
    with open(path, "w") as f:
        json.dump(settings, f, indent=2)
    print("claude hook: installed (previous settings backed up to settings.json.folio-bak)")
else:
    print("claude hook: already present")
PYEOF

echo "done. Agents will now open Markdown plans in Folio for review."
