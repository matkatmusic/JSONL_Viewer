---
name: verify
description: Full verification sweep before reporting work complete
allowed-tools: Bash Read
---
1. Run `bun run typecheck` — stop and fix on any error.
2. Run the FULL test suite, not just touched files.
3. If any renderer/viewer file changed, kill stale viewers on port 7343, start the viewer, and run the headless CDP smoke script against real data.
4. Print a one-line PASS/FAIL summary plus only failing output.