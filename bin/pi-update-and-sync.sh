#!/bin/zsh
set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PI_BIN="${PI_BIN:-$(command -v pi 2>/dev/null || true)}"
PATCH_BIN="$HOME/.pi/agent/bin/pi-context-bar-patch.mjs"
if [[ -z "$PI_BIN" ]]; then
  exit 0
fi

run_context_bar_patch() {
  if [[ -x "$PATCH_BIN" ]]; then
    "$PATCH_BIN" || true
  fi
}

# Idempotenz: max. ein erfolgreicher pi-update-Lauf pro Kalendertag.
MARKER="$HOME/.pi/agent/.last-auto-update"
today=$(date +%F)
if [[ -f "$MARKER" && "$(cat "$MARKER" 2>/dev/null)" == "$today" ]]; then
  run_context_bar_patch
  exit 0
fi

# Give Wi‑Fi/network a moment after login.
sleep 30

# Wait up to ~5 minutes for internet connectivity.
for i in {1..10}; do
  if /usr/bin/curl -fsS --max-time 10 https://pi.dev/api/latest-version >/dev/null 2>&1; then
    "$PI_BIN" update
    update_status=$?
    run_context_bar_patch
    echo "$today" > "$MARKER"
    "$HOME/.pi/agent/bin/pi-config-sync.sh" || true
    exit "$update_status"
  fi
  sleep 30
done

run_context_bar_patch
"$HOME/.pi/agent/bin/pi-config-sync.sh" || true
exit 0
