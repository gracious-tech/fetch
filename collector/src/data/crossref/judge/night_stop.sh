#!/bin/bash
# Gracefully stops a night.sh run (see night.sh). Ctrl+C doesn't work for this: `timeout` puts
# `claude` in its own process group (since night.sh doesn't pass --foreground), so terminal
# signals never reach it directly, and Claude Code's headless mode only reacts to SIGTERM, not
# the SIGINT that Ctrl+C sends. So instead this sends SIGTERM directly to both the in-progress
# claude session (letting it abort its turn and exit cleanly) and the night.sh loop itself
# (so it doesn't just start another session on its next iteration).
set -u

stopped=0

# The prompt text is unique to this campaign, so this won't catch unrelated claude sessions
claude_pids="$(pgrep -f 'crossref LLM judging campaign' || true)"
if [ -n "$claude_pids" ]; then
    echo "stopping claude session (pid $claude_pids)"
    kill -TERM $claude_pids
    stopped=1
fi

# Stop the outer loop too, otherwise it just starts another session once claude exits.
# Match on the script name alone (not a path fragment) so it catches the loop however it was
# launched — `.bin/night` runs it as `./night.sh`, tmux as `.../judge/night.sh`. The trailing
# ( |$) keeps `night_stop.sh` (this script) from matching itself.
night_pids="$(pgrep -f 'night\.sh( |$)' || true)"
if [ -n "$night_pids" ]; then
    echo "stopping night.sh loop (pid $night_pids)"
    kill -TERM $night_pids
    stopped=1
fi

if [ "$stopped" -eq 0 ]; then
    echo "night.sh is not running"
    exit 1
fi

echo "sent — claude may take a few seconds to wind down (check state/night.log)"
