# Implementation Notes — Phase 2: Retire the JS pipeline

## 2026-07-02:14:38:47 — Phase 2 kickoff (baseline top-up → legacy deletion → gates)
Chat title: (unnamed session, continuation of harmonic-raccoon)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/d17a4921-8952-4e4b-b588-5d31e615a1aa.jsonl

### References

/Users/matkatmusicllc/.claude/plans/the-api-from-scenario-branch-has-harmonic-raccoon.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260702-1434.md
/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/85d4dcc1-e358-42af-b7ba-b1116dc4aa53.jsonl (harmonic-raccoon, where the plan was drafted)

### Design decisions

- Executed steps 1→3 sequentially inline, no subagents: the steps are strictly order-dependent (recoverability commit must precede deletion, gates must follow deletion) and involve git worktree + rm operations where parallelism adds risk, not speed.
- Pre-flight confirmed handoff facts before mutating anything: develop-baseline tracks 47 api/ files vs 67 on disk; /tmp/baseline-topup did not exist; both existing worktrees (develop checkout, api-from-scenarios) left untouched.

### Deviations

- **2026-07-02:15:10 — Fixed a pre-existing viewer bug (3 one-line edits), despite "no logic is written in this phase".** The Gate 3 smoke test failed in all three legacy viewers with `TypeError: scanReadEvents is not a function` (thrown from api/edit-stream-extraction.js). Root cause: none of the three viewer HTML files loaded `api/read-event-scanner.js`, which defines that function — the file exists on disk and was kept per the plan, it just was never in any `<script>` list. Verified pre-existing: the baseline copy of jfred.html has the identical gap, and nothing Step 2 deleted appears in any viewer's script list (viewers load only api/ + web-shared/, both kept). Fix: added `<script src="../api/read-event-scanner.js"></script>` immediately before edit-stream-extraction.js in jfred/jfred.html, diff/jfred-diff.html, unified/jfred-unified.html (its only runtime dependency, scanToolUseResults from file-event-observations.js, already loads earlier). Fix committed to develop-baseline as a5098fa. Without this the "frozen-but-functional" gate cannot pass; with it, all three viewers load s19 with zero console errors.
- plans/*.js did not exist (rsync/rm globs found no matches) — the plan anticipated this ("those that exist"); nothing copied or deleted for that pattern.

### Tradeoffs

- Smoke test used each viewer's existing `?file=<url>` query-param load path instead of driving the file-input dialog: the browse tool's `upload` command failed with an internal error (`SAFE_DIRECTORIES is not defined`), and the URL path exercises the same loader (web-shared/jfred-load-helpers.js → onLoad). Note: `npx serve`'s clean-URL redirect (jfred.html → jfred) silently drops the query string — the ?file= param only works on the extensionless URL.
- npm test was run twice (~3.5 min each): the first run's `tail -5` truncated the pass/fail counts (and VS Code's js-debug bootloader in NODE_OPTIONS pollutes all node output with debugger noise). Second run grepped the `ℹ` summary lines directly.

## 2026-07-02:16:06:58 — Phase 3+5 scope decisions (greenfield viewer feature keep/drop)
Chat title: (unnamed session, continuation of harmonic-raccoon)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/d17a4921-8952-4e4b-b588-5d31e615a1aa.jsonl

### Design decisions (user-confirmed)

- **Phases 3 and 5 are merged**: the greenfield viewer IS the localhost app's UI. One deliverable — a localhost server that scans `.claude/projects/`, runs buildReconstructionDocument per JSONL on demand, and serves the viewer. Phase 4 (GitHub Pages demo) later consumes canned pre-built JSON.
- **User's UX spec** (verbatim intent): open → pick/auto-open `.claude/projects/`; left tree of all projects (Git-GUI style); selecting a project builds a unified record set across all its JSONLs; project view = JSONL-files tree pane + files-touched tree pane (like Fork); selecting a JSONL → conversation view (chat-like: user prompts + agent responses, tool/system context minimal) with branch view and edit events; selecting a file → full revision timeline with timestamps, each revision exportable and linkable to the exact JSONL line where it happened; selecting a JSONL line → JSON inspector. Closest existing design: diff/jfred-diff.html.
- **Dropped**: divergence-hunting UI (⚠ jump, PREVIOUS expectedState/COMPUTED/NEXT panes), old-vs-new engine toggle, fixed Base State pane.
- **Diff vs Base is kept as a debugging view behind a button** (user request, 16:08, refined 16:12): same navigation pattern as the raw-lines view — a button takes the user to it; it shows the cumulative diff from the file's base state to the selected revision. Neither debug view is a permanent pane.
- **Kept both export forms**: whole-file version export from the revision timeline AND per-edit .patch export/copy (as in the diff viewer today).
- **Raw lines view**: not a permanent pane — a button navigates to a raw all-lines view with the filter modes (Show All / File Only / Edits Only).
- **Script-execution consent gate** (user requirement, refines the handoff's non-negotiable default-OFF gate): when a transcript contains script execution (the stages behind src/reconstruction_script_execution.ts / reconstruction_git_evidence.ts), reconstruction runs the pure stages first and collects the scripts WITHOUT executing them; the UI warns the user and shows each script's actual content; only scripts the user explicitly confirms are executed, then reconstruction re-runs with those enabled. Default remains OFF; approval is per-session, never persisted for foreign transcripts.

### Plan drafted

- 2026-07-02 ~16:30: merged Phase 3+5 plan written to /Users/matkatmusicllc/.claude/plans/reveng-phase35-localhost-viewer.md. TDD directive from user folded in: scenarios are the client-test fixtures — views split into pure view-model functions tested under npm test against scenario ground truth (.step_states for file states, JSONL turns for conversation); only thin DOM renderers rely on browse-tool smoke gates.

### Open work flagged

- ~~Cross-JSONL aggregation needs new engine work~~ — WRONG (corrected by user, 16:15): the engine already consumes multi-JSONL record sets. Scenarios s53–s62 (concurrent agents) are multi-JSONL, and scripts/check_scenario_coverage.ts:142 feeds the engine a flat concatenation: `scenario.jsonlPaths.flatMap((path) => loadTranscript(path))`. The project view's unified record set is the same pattern applied to all JSONLs in a project directory — server-side glue, not engine work.

### Open questions

- **The handoff's "frozen-but-functional" premise was false at handoff time** — all three viewers were already broken on any transcript (scanReadEvents undefined is hit during load, not on an edge case). The June Engine-B refactor that created read-event-scanner.js ("replaces the two legacy scanners") evidently never updated the viewer HTML. If the viewers were recently believed working, something may have regressed earlier than that refactor — worth knowing which state you last saw them working in.
- Plan Step 4 says to rewrite session-task #3 with the greenfield-viewer description, but that task list lived in the harmonic-raccoon session and is not accessible here. The replacement text from the plan is preserved verbatim in the plan file (Step 4); awaiting your approval of Phase 2 before doing bookkeeping.
