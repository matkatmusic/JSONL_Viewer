## 2026-07-08:08:55:00 — TASKS items 22 (clear console on new project load) + 27 (trailing-newline artifact) close-out
Chat title: investigate 4 easiest TASKS.md items → close 8/20/22/27
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/68626fd8-f014-417f-8bdb-c538aa92e5fe.jsonl

### References
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item22-clear-console-item27-close.md (the plan implemented)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-item14-trailing-extent.md (item-14 gates proving item 27 already fixed)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-per-line-state-sidecar-plan.md (line 166: the follow-up note item 27 actually derives from)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (items 8, 20, 22, 27 all closed this session)

### Design decisions
- Item 22 clears on PROJECT CHANGE, not on every hashchange: sub-route hops (timeline → file →
  jsonl) log into the same load's story, and TASKS' title says "when loading new session". The
  decision predicate is the exported pure `checkNavigationStartsNewProjectLoad` so it is
  node-testable without a DOM; the 8-line renderRoute wiring is browser-only.
- First project load (undefined → A) DOES clear: the landing page's `/api/projects` GET lines
  are not part of the project's load story.
- The projects-folder switch resets `lastLoadedProject`, so re-entering a same-named project
  from a different folder clears (the adjacent `documentCache.clear()` lines already declare
  everything stale).
- `progressTerminal.clear()` over `reset()`: clear wipes the buffer only; reset also resets
  modes/decorations, which nothing needs.

### Deviations
- None from the plan. Plan Step 2.5's optional manual browser check was skipped (wiring is
  8 lines; the suite plus DOM-free import cover the testable surface — same call the plan makes).
- Items 8 and 20 (the other two of the four investigated) were closed BEFORE this plan was
  drafted, directly in TASKS.md: #8 was already solved by owner-keyed blob reads
  (`src/reconstruction_sidecar_reader.ts:64-71`, landed 2026-06-26), #20's remaining work was
  one stale header comment in `webapp/views/diff-vs-base.js` (revision selector + toggle +
  gutters all already shipped).

### Tradeoffs
- Item 27 got NO code change: planning-time archaeology (dereferencing both evidence records)
  showed both are Read tool_result dumps ending `…\n85\t` / `…\n498\t` — the terminal Read
  phantom that completed roadmap item 14 already fixed, with both files recorded going
  mismatched 1→0 in its gates. Regenerating the stale `tools/line-state-reports/*.json` was
  considered and rejected: the per-line tracker is part of the frozen `api/` legacy island.

### Open questions
- None.
