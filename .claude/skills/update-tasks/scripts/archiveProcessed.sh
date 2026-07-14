#!/bin/sh
# Move implementation notes and handoffs into plans/archived/.
# A file whose name already exists in plans/archived/ is left in place and reported.
# Usage: archiveProcessed.sh [file ...]   (default: all notes/handoffs at plans/ top level)
[ $# -eq 0 ] && set -- plans/implementation-notes-*.md plans/handoff-*.md
for f in "$@"; do
  [ -e "$f" ] || continue
  if [ -e "plans/archived/$(basename "$f")" ]; then
    echo "COLLISION (left in place): $f"
  else
    git mv "$f" plans/archived/ 2>/dev/null || mv "$f" plans/archived/
    echo "archived: $f"
  fi
done
