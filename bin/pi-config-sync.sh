#!/bin/zsh
set -euo pipefail

AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
cd "$AGENT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Pi config sync skipped: $AGENT_DIR is not a git repository" >&2
  exit 0
fi

# Stage only what the whitelist allows.
git add -A

# Hard guard against accidentally tracked bulky or secret-bearing paths.
for forbidden in \
  '(^|/)secrets/' \
  '(^|/)auth\.json$' \
  '(^|/)mcp-oauth/' \
  '(^|/)sessions/' \
  '(^|/)npm/' \
  '(^|/)git/' \
  '(^|/)node_modules/' \
  '(^|/)mcp-cache\.json$' \
  '(^|/)run-history\.jsonl$'; do
  if git diff --cached --name-only | grep -E "$forbidden" >/dev/null; then
    echo "Pi config sync aborted: forbidden path staged ($forbidden)" >&2
    git reset -q
    exit 1
  fi
done

# MCP config must reference secrets through environment variables, not inline values.
python3 - <<'PY'
import json
import re
import sys
from pathlib import Path

path = Path('mcp.json')
if not path.exists():
    raise SystemExit(0)

data = json.loads(path.read_text())
secret_key = re.compile(r'(api[_-]?key|secret|token|password|passwd|bearer|authorization|credential|private[_-]?key|client[_-]?secret)', re.I)
placeholder = re.compile(r'^(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\$env:[A-Za-z_][A-Za-z0-9_]*|<[^>]+>|REDACTED|changeme|your[-_ ]|xxx+)$', re.I)
violations = []

def walk(value, path_parts):
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = path_parts + [str(key)]
            if secret_key.search(str(key)) and isinstance(child, str) and not placeholder.match(child.strip()):
                violations.append('.'.join(child_path))
            walk(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk(child, path_parts + [str(index)])

walk(data, [])
if violations:
    print('Pi config sync aborted: inline secret-looking values in mcp.json:', file=sys.stderr)
    for violation in violations:
        print(f'  - {violation}', file=sys.stderr)
    sys.exit(1)
PY

if git diff --cached --quiet; then
  exit 0
fi

git commit -m "Sync Pi config: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

if git remote get-url origin >/dev/null 2>&1; then
  git push --quiet origin HEAD
else
  echo "Pi config sync committed locally; no origin remote configured" >&2
fi
