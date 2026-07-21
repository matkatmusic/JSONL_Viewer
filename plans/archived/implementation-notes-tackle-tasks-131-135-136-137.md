## 2026-07-21:01:45:00 — Tasks 131/135/136/137: timeline line-stepper, baseline { } suppression, file-history toggle, repo/commit picker
Chat title: tackle-tasks 131 135 136 137
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/2933fb88-c156-4e12-83be-0959bf345422.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-131-135-136-137-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tasks.json (tasks 131, 135, 136, 137 — still OPEN pending user test run)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md

### Design decisions

- **131 (user-decided pre-plan):** existing `#files-prev`/`#files-next` untouched; new `#line-prev`/`#line-next` buttons step one **visible timeline row** at a time (`findAdjacentRowIndex` in `timeline-sessions.ts`). With the task-134 "all lines" toggle on, that is one JSONL line per click. The new buttons do not expand rows (line rows are thin one-liners).
- **135:** row-level guard extracted as the pure predicate `checkRowCarriesJsonRecordButton` (commit → false, `uuid === undefined` → false) so any future synthetic node is covered, not just the baseline turn. Chip-level `{ }` renders only when `causingLocation` resolved; `showCausingRecordForChip`'s undefined-fallback branch was left in place (defensive, now unreachable from the only caller).
- **136:** the fields start hidden unconditionally (the server cannot report whether the effective dir was derived or explicit); showing them is the explicit-override gesture. While hidden the apply POST always carries `fileHistoryDir: ""` (`computeFileHistoryDirToPost`).
- **137 session overrides:** `setSessionProjectPaths` uses **replace** semantics (the client posts the full field set each time; `{}` clears) rather than merge — simpler mental model and gives tests a clean reset. The merged view (`getMergedProjectPaths`) spreads the session entry over the stored reveng-paths.json entry.
- **137 fileHistory persistence (user-decided pre-plan):** `WireProjectPaths` gained `fileHistory?`; it hydrates to the engine's `fileHistoryRoot` override and beats the global derived dir in `applyProjectOverrides`. The client includes it in apply/store bodies only while the task-136 fields are visible and non-empty.
- **137 repo path form:** the input accepts absolute (native picker) or jfred-root-relative (task-56 convention) paths; the server resolves with `resolve()` against its cwd (the jfred root) and **stores the string as given** — no normalization rewriting.
- **137 soft warning threshold:** warn when `matchedCount * 2 < totalCount` (fewer than half the recorded paths exist in the picked commit's tree); zero recorded paths warns nothing.
- **137 "no silent writes":** two separate buttons — "Apply to session" (persist:false) and "Store for this project…" (persist:true) — instead of a confirm dialog (native dialogs are banned in this webapp for headless-automation reasons).
- **Commit-hash trust boundary:** `/api/repo-commit-match`'s `commit` param must match `/^[0-9a-fA-F]{4,40}$/` before it reaches a shell command; repo params are existence-checked directories.

### Deviations

- **Implemented serially, no parallel subagents:** all four tasks overlap in `timeline-sessions.ts`, `index.html`, and `app-header.ts`; parallel agents would have collided on the same files.
- **Tests were executed** (targeted files only, plus typecheck and `build:webapp`): the repo's PostToolUse hooks run the test files automatically on every edit anyway, so the red→green cycle was observable regardless. The full `npm test` suite was NOT run — that is left to the user per the tackle-tasks instruction.
- **Test-file split:** the task-85 `findAdjacentFileTouchedIndex` tests moved from `tests/timeline-sessions.test.ts` into the new `tests/timeline-row-navigation.test.ts` (the additions pushed the old file past the 250-line cap); the new 131/135 tests live there too.
- **`resolveJsonlPaths` exported** from `viewer_server_routes.ts` (was private) so the repo-match route reuses the canonical project-record loading path instead of re-implementing scanning.
- **`pickFolderInto` moved** from an `initializeHeader` closure to a module-level export in `app-header.ts` (it captured no closure state) so `app-paths-project.ts` imports it directly — one canonical home, no wrapper.

### Tradeoffs

- `computeCommitPathMatch` has no direct integration test (building realistic tool_use records is heavy); its pure core `countPathsInTree` and the git-log parser are tested, and `listRepoCommits` runs against a real throwaway repo.
- `listRepoCommits` caps at the 500 newest commits (`ponytail:` comment in place; paginate if ever needed).
- The chip-level task-135 guard is a one-line conditional with no dedicated test (trivial guard; the row-level predicate carries the test coverage).
- `/api/project-paths` GET/POST handlers are exercised indirectly (session-merge + write-back functions are unit-tested; the HTTP glue mirrors the existing `handleConfigUpdate` pattern).

### Open questions

- Should the Paths popover's per-project section also prefill the task-136 file-history field from a stored per-project `fileHistory` entry when the popover opens? Today the global field only shows the server-effective dir; a stored per-project override is applied by the engine but not surfaced in the field.
- The commit pick list shows the 500 newest commits with no search box — fine for typical repos; say the word if filtering is wanted.
