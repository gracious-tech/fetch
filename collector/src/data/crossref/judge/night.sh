#!/bin/bash
# Overnight runner for the one-time LLM judging campaign (see README.md).
# Repeatedly prompts Claude Code to continue the campaign, but only inside two nightly windows
# (defaults: 22:30-03:15 and 03:30-08:00) so daytime session capacity stays free for real work.
# Each window keeps re-prompting until judging completes, the cutoff arrives, or the session
# limit is hit (detected as repeated quick failures). Progress lives in results.json, so
# stopping at any point is always safe. Exits for good once everything is judged.
#
# Run it detached and forget about it:
#   tmux new -d -s judging collector/src/data/crossref/judge/night.sh
set -u
cd "$(realpath -m "$0/../../../../../..")"

# Windows as "start cutoff" pairs (24h local time; a cutoff earlier than its start means it
# falls on the following day). The second window's 5hr limit block ends by ~08:30, so a fresh
# block is available when daytime work starts.
WINDOWS=("22:30 03:15" "03:30 08:00")

# The orchestrating session doesn't need heavy lifting (it spawns sonnet subagents and merges)
MODEL="sonnet"

LOG="collector/src/data/crossref/judge/state/night.log"
mkdir -p "$(dirname "$LOG")"

# Log with a timestamp
log(){
    echo "[$(date '+%F %T')] $1" | tee -a "$LOG"
}

# Whether the campaign is complete, according to the status command ("judged X of Y (Z%)")
is_done(){
    local status done total
    status="$(node collector/dist/data/crossref/judge/run.js status 2>/dev/null | head -1)"
    done="$(echo "$status" | awk '{print $2}')"
    total="$(echo "$status" | awk '{print $4}')"
    [ -n "$done" ] && [ "$done" = "$total" ]
}

# Keep prompting Claude Code until the cutoff timestamp, completion, or the limit is hit
run_window(){
    local cutoff=$1
    local fails=0
    while [ "$(date +%s)" -lt "$cutoff" ]; do
        if is_done; then
            return
        fi
        local cutoff_hhmm remaining began duration
        cutoff_hhmm="$(date -d "@$cutoff" '+%H:%M')"
        remaining=$(( cutoff - $(date +%s) ))
        began="$(date +%s)"
        log "prompting claude (cutoff $cutoff_hhmm, $(( remaining / 60 ))min left in window)"
        timeout "$remaining" claude -p \
            "Continue the one-time crossref LLM judging campaign. Read \
collector/src/data/crossref/judge/README.md and follow it exactly: repeatedly run waves \
(generate slices, spawn 5 parallel sonnet subagents to judge them, then merge) until the \
status command reports everything judged or the local time reaches $cutoff_hhmm. Rebuild the \
collector first if dist is missing. Always merge finished wave outputs before you stop. Do not \
work on anything other than the judging campaign." \
            --model "$MODEL" --dangerously-skip-permissions >> "$LOG" 2>&1
        local code=$?
        duration=$(( $(date +%s) - began ))
        # Quick failures in a row almost certainly mean the session limit is hit — end the window
        if [ "$code" -ne 0 ] && [ "$duration" -lt 120 ]; then
            fails=$(( fails + 1 ))
            log "claude exited $code after ${duration}s (quick failure $fails/3)"
            if [ "$fails" -ge 3 ]; then
                log "assuming session limit reached; closing this window"
                return
            fi
            sleep 300
        else
            fails=0
            log "claude session ended (exit $code after $(( duration / 60 ))min)"
        fi
    done
}

log "night runner started (windows: ${WINDOWS[*]})"
while true; do
    if is_done; then
        log "campaign complete — all pairs judged. Exiting."
        exit 0
    fi

    # Find the current window (if inside one) or the soonest upcoming start
    now="$(date +%s)"
    active_cutoff=""
    next_start=""
    for window in "${WINDOWS[@]}"; do
        start_t="${window% *}"
        cutoff_t="${window#* }"
        for day in "yesterday" "today" "tomorrow"; do
            start="$(date -d "$day $start_t" +%s)"
            cutoff="$(date -d "$day $cutoff_t" +%s)"
            if [ "$cutoff" -le "$start" ]; then
                cutoff=$(( cutoff + 86400 ))
            fi
            if [ "$now" -ge "$start" ] && [ "$now" -lt "$cutoff" ]; then
                active_cutoff="$cutoff"
            elif [ "$start" -gt "$now" ] && { [ -z "$next_start" ] || [ "$start" -lt "$next_start" ]; }; then
                next_start="$start"
            fi
        done
    done

    if [ -n "$active_cutoff" ]; then
        run_window "$active_cutoff"
        sleep 60
    else
        log "sleeping until $(date -d "@$next_start" '+%F %H:%M')"
        sleep $(( next_start - now ))
    fi
done
