#!/bin/sh
# Move all top-level implementation notes and handoffs into plans/archived/.
# A file whose name already exists in plans/archived/ is left in place and reported.
for f in plans/implementation-notes-*.md plans/handoff-*.md; do
  [ -e "$f" ] || continue
  if [ -e "plans/archived/$(basename "$f")" ]; then
    echo "COLLISION (left in place): $f"
  else
    git mv "$f" plans/archived/ 2>/dev/null || mv "$f" plans/archived/
    echo "archived: $f"
  fi
done
