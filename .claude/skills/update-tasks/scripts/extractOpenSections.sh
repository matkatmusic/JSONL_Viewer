#!/bin/sh
# Print the open-work sections of implementation notes and handoffs:
#   implementation-notes-*.md -> every "### Open questions" section
#   handoff-*.md              -> the "## What Remains" section
# Each section prints under a "=== <file> ===" banner and ends at the next ##/### header or EOF.
# Usage: extractOpenSections.sh [file ...]   (default: all notes/handoffs at plans/ top level)
[ $# -eq 0 ] && set -- plans/implementation-notes-*.md plans/handoff-*.md
awk 'FNR==1{p=0} /^### Open questions|^## What Remains/{p=1; print "\n=== " FILENAME " ==="; next} /^##/{p=0} p' "$@"
