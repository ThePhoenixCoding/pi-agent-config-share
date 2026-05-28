#!/bin/zsh -l
worktree_path="$1"
old_tty="$2"

if [[ -n "$old_tty" ]]; then
	{
		sleep 0.2
		osascript - "$old_tty" <<'APPLESCRIPT'
on run argv
	set targetTty to item 1 of argv
	tell application "iTerm2"
		repeat with w in windows
			repeat with t in tabs of w
				repeat with s in sessions of t
					if tty of s is equal to targetTty then
						close s
					end if
				end repeat
			end repeat
		end repeat
	end tell
end run
APPLESCRIPT
	} >/dev/null 2>&1 &!
fi

if [[ -z "$worktree_path" ]]; then
	printf '\n[worktree launcher] missing path argument; closing this launcher session.\n' >&2
	exit 2
fi

if ! cd "$worktree_path"; then
	printf '\n[worktree launcher] cd to %s failed; closing this launcher session.\n' "$worktree_path" >&2
	exit 1
fi

pi
exit_code=$?
printf '\n[pi exited (code %d)] closing this launcher session.\n' "$exit_code"
exit "$exit_code"
