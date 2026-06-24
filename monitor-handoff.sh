#!/usr/bin/env bash
#
# Generic handoff-document monitor. Blocks until a SPECIFIC handoff lands, then exits 0.
#
# A handoff (written by /jot:handoff-prompt) is identified by (scenario, stage):
#   stage=plan : the Planning agent's outgoing handoff   ("# Handoff: IMPLEMENT Scenario X …")
#   stage=impl : the Implementing agent's completion doc  ("# Handoff: X … IMPLEMENTED …")
#
# Usage:
#   ./monitor-handoff.sh <scenario> <stage> [poll_seconds]
#     <scenario>     e.g. s27, m4   (case-insensitive; maps to plans/<scenario>/)
#     <stage>        plan | impl
#     [poll_seconds] poll interval, default 15
#
# Examples (per the Plan_/Impl_ templates):
#   ./monitor-handoff.sh s27 plan    # implementer of s27 waits for its planning handoff
#   ./monitor-handoff.sh s26 impl    # planner of s27 waits for the upstream IMPLEMENTED handoff
#
# Identification (see plans/monitor-handoff-spec.md):
#   - Title line is `grep -m1 '^# Handoff:'`, NEVER `head -1` (impl handoffs prepend MUST READ:).
#   - Subject scenario = the FIRST [sm][0-9]+ token in the title; must equal <scenario>.
#     (Rejects forward-references like "Next scenario: m4" later in another scenario's title.)
#   - Stage = whether the title contains the whole word IMPLEMENTED (impl) or not (plan).
#     Word-boundary matching keeps IMPLEMENT (planner) distinct from IMPLEMENTED (implementer).
#   - Title line only, never the body (S22 false-fire lesson).

set -u
export PATH="$PATH"                      # S23 lesson: watcher busy-loops without it
cd "$(dirname "$0")" || exit 1           # repo root = this script's own dir (portable)

usage() { echo "usage: $0 <scenario> <stage:plan|impl> [poll_seconds]" >&2; exit 2; }

[ $# -ge 2 ] && [ $# -le 3 ] || usage

SCEN=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')   # e.g. s27
STAGE=$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')  # plan | impl
POLL="${3:-15}"

case "$STAGE" in plan|impl) ;; *) usage ;; esac

# Does $1 (a handoff file) match (SCEN, STAGE)?  Returns 0 on match.
title_matches() {
  local f="$1" title first_tok
  title=$(grep -m1 '^# Handoff:' "$f" 2>/dev/null) || return 1
  [ -n "$title" ] || return 1

  # Rule 1: first scenario token in the title must equal SCEN.
  first_tok=$(printf '%s' "$title" | grep -oiE '[sm][0-9]+' | head -1 \
              | tr '[:upper:]' '[:lower:]')
  [ "$first_tok" = "$SCEN" ] || return 1

  # Rule 2: stage. Whole word IMPLEMENTED present <=> implementer/completion handoff.
  if printf '%s' "$title" | grep -iqwE 'implemented'; then
    [ "$STAGE" = impl ] && return 0 || return 1
  else
    [ "$STAGE" = plan ] && return 0 || return 1
  fi
}

while true; do
  # Newest first (timestamp lives in the filename), so we report the latest match.
  for f in $(ls -1 "plans/$SCEN"/handoff-*.md 2>/dev/null | sort -r); do
    [ -f "$f" ] || continue
    if title_matches "$f"; then
      echo "HANDOFF READY ($SCEN/$STAGE): $f"
      exit 0
    fi
  done
  sleep "$POLL"
done
