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

When you write or substantially revise a plan, spec, or other Markdown document the user should review:
1. Save it to a file and open it in Folio'"'"'s floating review window: `folio review <path>` (fallback: `/Applications/Folio.app/Contents/MacOS/folio review <path>`). The window live-reloads with change highlights on every rewrite — keep using it for subsequent revisions of that file.
2. Tell the user the plan is open in Folio. They can annotate it (Edit -> Annotate Selection, Cmd+Opt+A) and send structured feedback back (File -> Export Review Feedback, Cmd+Opt+R).
3. Before your next revision of that file, re-read it (the user may have edited it directly in Folio) and read `<path>.feedback.md` if it exists — apply that feedback, then delete the feedback file.
<!-- /folio:plan-review -->'

for f in "$HOME/.claude/CLAUDE.md" "$HOME/.codex/AGENTS.md" "$HOME/.agents/AGENTS.md"; do
  mkdir -p "$(dirname "$f")"
  touch "$f"
  if grep -q "$MARKER" "$f"; then
    echo "instructions already present: $f"
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
