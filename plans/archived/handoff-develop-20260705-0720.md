# Handoff: TASKS.md is the audited backlog (17 items, committed a94af76) — pick work from it, nothing else is pending
Conversation name: Task-list compilation + full-handoff audit (ponytail ultra session)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/9a9af9cb-d140-40b3-809c-30cc63c35923.jsonl
Plan file: none — the deliverable is `TASKS.md` at the repo root

## Branch
`develop` based on `main`. HEAD `a94af76` "added a Task list of things never built or yet to be built."
Repo root: `/Users/matkatmusicllc/Desktop/claude code src/RevEng` (path has spaces — always quote).

## Goal
Consolidate every open work item from the five 2026-07-04 handoffs into one tracked list, then
audit that list against ALL 94 handoff documents in `plans/` (June 3 – July 4) so nothing
promised in any session was silently dropped. Both are done; `TASKS.md` is now the single
authoritative backlog for the develop branch.

## Current State
- `TASKS.md` (repo root, committed in `a94af76`) holds 17 items: 2 done (submodule commit
  `f5d43b5`; coverage script verified 85/85 through the submodule), 15 open. Session task-tracker
  numbering matches the file's numbering.
- The audit ran as six parallel read-only agents, one per handoff date-range; every candidate was
  verified against the code before being added. It surfaced exactly 3 previously-untracked items,
  now in TASKS.md: #15 s85 git-repo durability (real latent bug), #16 Phase B `kept[]` decision,
  #17 GitHub Pages demo tier (deferred phase). Excluded non-actionable leftovers are listed with
  reasons in TASKS.md's header block.
- Working tree: 7 modified files from OTHER sessions (package.json, package-lock.json,
  src/reconstruction_reseed.ts, src/structures/vocabulary.ts, tests/vocabulary.test.ts,
  webapp/views/conversation.js, webapp/views/projects.js — memoization/progress work). Do not
  revert, fix, or stage them. Large untracked legacy dirs (api/, jfred/, diff/, docs/, archive/…)
  are the frozen legacy island — never build there.
- Not run this session: `npm test` / `npm run typecheck` (no source was changed; user runs tests
  himself). Coverage script confirmed 85/85 on 2026-07-04.

## What Remains
Pick from `TASKS.md` (read it first — each item carries its source handoff and file anchors).
Suggested order:
1. Task #15 — s85 git-repo durability: `readCommittedFileContent`
   (`src/reconstruction_git_evidence.ts:86`) resolves s85's repo via the RECORDED temp cwd and
   silently returns `undefined` when it is gone; temp cleanup regresses s85 steps 4–10. Add a
   fallback to the preserved repo at `scenarios/executed/s85-git-commit-csv-and-move-scripts/.git`.
   The only known latent bug; red-green TDD.
2. Task #2 — `git worktree remove api-from-scenarios` (still registered at
   `~/Programming/RevEng-worktrees/api-from-scenarios`, branch merged). One command.
3. Decision tasks #14 (ReconstructionCorpus still worth building?) and #16 (Phase B `kept[]` —
   finish or retire + fix the stale header in `src/reconstruction_parse_lines.ts`) — conversations
   with the user, not code, scope before touching anything.
4. Feature queue #4–#10 and approval-gated #11–#13, #17 — each needs user direction/approval first.

## Key Files
- `TASKS.md` (repo root) — THE backlog; every item with provenance and anchors.
- `plans/handoff-develop-20260704-*.md` (five files) — the source handoffs for items 1–14.
- `plans/handoff-api-from-scenarios-20260702-0800.md` — source of task #15 ("flagged not fixed").
- `plans/handoff-api-from-scenarios-20260626-1152.md` — source of task #16 (Phase B design).
- `src/reconstruction_git_evidence.ts:86` — `readCommittedFileContent`, task #15's target.
- `plans/roadmap-100-percent-reconstruction.md` — the closed engine roadmap (all `[x]` except a
  documented `cp` deferral); consult before reopening anything engine-related.

## Context the Next Agent Won't Have
- The audit's negative result is load-bearing: every "What Remains" across all 94 handoffs is
  done, in TASKS.md, deferred-by-design, or frozen-island obsolete. Do NOT re-audit; if an old
  handoff names work not in TASKS.md, it was deliberately excluded (reasons in the TASKS.md
  header) — check there before resurrecting it.
- Task #15 is real, verified in code this session: no preserved-repo fallback exists anywhere in
  `src/`, and the `catch` at `reconstruction_git_evidence.ts:99` makes the failure silent. 85/85
  currently passes ONLY because the recorded temp dir still exists on this machine.
- Task #16's evidence: no consumer of `partition.kept` in `reconstruction_cli.ts`,
  `reconstruction_engine.ts`, `reconstruction_steps.ts`, or `scripts/check_scenario_coverage.ts`;
  the parse_lines header (lines 1–7) still promises Phase B. 85/85 was reached via the old input
  path, so retiring may be the right call — user decides.
- Handoff-20260704-2226 measured numbers against the OLD `plans/scenarios/executed` layout; that
  dir is gone (submodule migration `f5d43b5`). Any smoke command from older handoffs must swap in
  `--projects-dir "scenarios/executed"`.
- The frozen legacy island is `jfred/`, `web-shared/`, `api/`, `diff/`, `unified/`, `viewer/` —
  untracked on purpose, awaiting retirement; items targeting it were classed obsolete in the audit.
- User workflow rules (repeatedly enforced): he runs the server himself on 7343 (`lsof -i :7343`,
  never kill it; smoke on 7345) and runs `npm test` himself — you run typecheck only; you stage
  ONLY files you touched (never `-A`), he commits; merges `--no-ff`; never delete files (RETIRED
  headers only); strict red-green TDD `test("test_<snake_case>")` + `// Scenario:` comments;
  4-space indent even where the repo uses 2; verb-named functions; one condition per `if`;
  compare exported constants, never string literals.
- Environment: prefix `NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS=` on node/npm commands (VS Code
  debugger env leaks); `npm run typecheck` (bare `npm typecheck` doesn't exist); node test output
  is polluted by the js-debug bootloader — grep `^ℹ` for summaries; curl/wget in Bash are
  redirected by a context-mode hook — do timed HTTP inside a single node fetch script.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npm run typecheck   # expect clean
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npx tsx scripts/check_scenario_coverage.ts  # expect 85/85
# full test suite is the user's to run (420/420 at last green)
```
