#!/bin/bash
# Overnight runner for the one-time LLM judging campaign (see README.md).
# Repeatedly prompts Claude Code to continue the campaign, but only overnight (22:30-08:00 by
# default) so daytime session capacity stays free for real work. When a session hits the
# 5hr-block limit it sleeps until the reset time the CLI advertises and resumes — but never
# resumes past 03:30, so the night's final block resets by 08:30 and every morning starts with
# a completely unused block. Progress lives in results.json, so stopping at any point is always
# safe. Exits for good once everything is judged.
#
# Run it detached and forget about it:
#   tmux new -d -s judging collector/src/data/crossref/judge/night.sh
set -u
cd "$(realpath -m "$0/../../../../../..")"

# The nightly window as a "start cutoff" pair (24h local time; a cutoff earlier than its start
# falls on the following day). Starting at 22:30 is safe even in the worst case: if that first
# prompt begins a fresh 5hr block, the block still resets by 03:30, leaving room for one final
# block that resets by 08:30 (see the resume gate in run_window). An evening block already in
# progress at 22:30 resets even earlier. The 08:00 cutoff kills any still-running session well
# before the morning.
WINDOWS=("19:00 10:30")

# The orchestrating session doesn't need heavy lifting (it spawns sonnet subagents and merges)
MODEL="sonnet"

LOG="collector/src/data/crossref/judge/state/night.log"
OUT="collector/src/data/crossref/judge/state/session.txt"
mkdir -p "$(dirname "$LOG")"

# Log with a timestamp
log(){
    echo "[$(date '+%F %T')] $1" | tee -a "$LOG"
}

# Extract the advertised limit reset time ("resets 2:10am") from the last session's output,
# echoing it as a future epoch timestamp (echoes nothing if the format is unrecognised)
parse_reset(){
    local when epoch
    when="$(grep -oiE 'resets (at )?[0-9]{1,2}(:[0-9]{2})?(am|pm)' "$OUT" | head -1 \
        | awk '{print $NF}')"
    if [ -z "$when" ]; then
        return
    fi
    epoch="$(date -d "$when" +%s 2>/dev/null)" || return
    # A reset time already in the past means it refers to tomorrow
    if [ "$epoch" -le "$(date +%s)" ]; then
        epoch=$(( epoch + 86400 ))
    fi
    echo "$epoch"
}

# Whether the campaign is complete, according to the status command ("judged X of Y (Z%)")
is_done(){
    local status done total
    status="$(node collector/dist/data/crossref/judge/run.js status 2>/dev/null | head -1)"
    done="$(echo "$status" | awk '{print $2}')"
    total="$(echo "$status" | awk '{print $4}')"
    [ -n "$done" ] && [ "$done" = "$total" ]
}

# Log the full campaign status (progress % plus category tallies) under a labelled header
log_status(){
    local status
    status="$(node collector/dist/data/crossref/judge/run.js status 2>/dev/null)"
    if [ -z "$status" ]; then
        log "$1: status unavailable (dist missing or build failed)"
        return
    fi
    log "$1: $(echo "$status" | head -1)"
    echo "$status" | tail -n +2 | tee -a "$LOG"
}

# Keep prompting Claude Code until the cutoff timestamp or completion, sleeping through any
# session limit whose reset falls by the resume gate (03:30). Only returns once the window is
# spent (cutoff reached, everything judged, or a limit resetting past the gate) — callers must
# not re-enter it.
run_window(){
    local cutoff=$1
    local fails=0
    # The last moment a fresh 5hr block may begin: it must reset by 08:30 (cutoff + 30min) so
    # the morning starts with untouched capacity. Blocks begin at the first prompt after a
    # limit reset, so never resume a reset that falls after this gate.
    local gate=$(( cutoff + 1800 - 18000 ))
    while [ "$(date +%s)" -lt "$cutoff" ]; do
        if is_done; then
            return
        fi
        local cutoff_hhmm remaining began duration code
        cutoff_hhmm="$(date -d "@$cutoff" '+%H:%M')"
        remaining=$(( cutoff - $(date +%s) ))
        began="$(date +%s)"
        log "prompting claude (cutoff $cutoff_hhmm, $(( remaining / 60 ))min left in window)"
        # MAX_THINKING_TOKENS=0 disables thinking for this process only (incl. its subagents),
        # saving block budget for actual judging without touching the global Claude config
        MAX_THINKING_TOKENS=0 timeout "$remaining" claude -p \
            "Continue the one-time crossref LLM judging campaign. Read \
collector/src/data/crossref/judge/README.md and follow it exactly: repeatedly run waves \
(generate one slice, run a single sonnet subagent prompted with state/prompt.txt verbatim, N \
replaced, then merge — strictly one subagent at a time, never in parallel) until the status \
command reports everything judged or the local time reaches $cutoff_hhmm. Rebuild the \
collector first if dist is missing. Always merge finished wave outputs before you stop. Do \
not work on anything other than the judging campaign." \
            --model "$MODEL" --dangerously-skip-permissions > "$OUT" 2>&1
        code=$?
        cat "$OUT" >> "$LOG"
        duration=$(( $(date +%s) - began ))
        log_status "batch done"

        # Session limit: sleep straight through to the advertised reset instead of burning
        # retries on a spent block — but only resume if the reset falls by the gate, since the
        # block that resuming begins must itself reset by 08:30
        if grep -qi 'hit your session limit' "$OUT"; then
            local reset
            reset="$(parse_reset)"
            if [ -n "$reset" ] && [ "$reset" -le "$gate" ]; then
                log "session limit hit; sleeping until reset at $(date -d "@$reset" '+%H:%M')"
                sleep $(( reset - $(date +%s) + 60 ))
            elif [ -n "$reset" ]; then
                log "limit resets $(date -d "@$reset" '+%H:%M'), past the resume gate — done"
                return
            elif [ "$(date +%s)" -lt "$gate" ]; then
                log "session limit hit (reset time unparseable); retrying in 30min"
                sleep 1800
            else
                log "session limit hit (reset time unparseable) past the resume gate — done"
                return
            fi
            fails=0
            continue
        fi

        # Other quick failures in a row (auth/network/crash) — back off, then give up the window
        if [ "$code" -ne 0 ] && [ "$duration" -lt 120 ]; then
            fails=$(( fails + 1 ))
            log "claude exited $code after ${duration}s (quick failure $fails/3)"
            if [ "$fails" -ge 3 ]; then
                log "repeated quick failures; closing this window"
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
log_status "starting"
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
        # run_window only returns once its window is spent — never re-enter it early (doing so
        # is what hammered a maxed-out account every 5min on the first night)
        now="$(date +%s)"
        if [ "$now" -lt "$active_cutoff" ] && ! is_done; then
            log "window spent; sleeping until its cutoff $(date -d "@$active_cutoff" '+%H:%M')"
            sleep $(( active_cutoff - now ))
        fi
        sleep 60
    else
        log "sleeping until $(date -d "@$next_start" '+%F %H:%M')"
        sleep $(( next_start - now ))
    fi
done
