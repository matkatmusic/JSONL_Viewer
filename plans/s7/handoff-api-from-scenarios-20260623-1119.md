# Handoff: S7 (conversation rewind / code restore) is PLANNED — preserve rewound branches as retrievable unmerged-branch histories. Plan written, nothing coded yet
Conversation name: api-from-scenarios — S7 (minimal-code-restore) planning
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/84eb707c-5224-418d-a056-22d6fadde5f9.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s7/s7-reconstruction-plan.md (NOT yet executed)

## Branch
`api-from-scenarios` based on `master`. HEAD = `ecbabfd added plan impl template for agent spawning`
(S6 committed at `f5da4e3 Implemented S6 handling`). Working tree clean except a modified
`src/Plan_Impl_template.md` (stray, unrelated) and untracked `plans/s7/s7-reconstruction-plan.md`.
No `-plate` branch.

## Goal
Clean-room TypeScript engine that reconstructs the file-change history of a Claude Code session from
its JSONL transcript, one scenario at a time. **S7 (`s7-minimal-code-restore`)** is the FIRST of the
rewind / code-restore family (S7–S23). A "Rewind: 1, code" forks the conversation: the pre-rewind
work is abandoned, new work continues from the checkpoint. **The user's directive: treat a rewind
like an unmerged git branch — the rewound code changes must be PRESERVED and retrievable, not
discarded.** Mental model: `surviving: A─B─D─E` with `B └─C` the rewound branch; `B` is the rewind
checkpoint, `C` the abandoned commits, `D→E` the kept work. S1–S6 are implemented and committed.

## Current State
- **S7 is PLANNED, not implemented.** The plan (`plans/s7/s7-reconstruction-plan.md`, **4 TDD
  tasks**) is written, conformance-audited against the planning/TDD/coding guides, and mirrors the
  S5/S6 plan shape (locked decisions, ground truth, per-task RED→GREEN→Verify).
- **IMPORTANT — the design was reversed mid-session.** The first draft *discarded* rewound branches;
  the user then asked to *preserve* them as retrievable unmerged branches, and to add CLI support for
  listing branches and printing a specific branch's histories. The plan now reflects the
  preserve-and-retrieve design. Do not resurrect the discard approach.
- **Baseline green**: at HEAD, `npm test` = 88 pass / 0 fail, `tsc --noEmit` clean, all files ≤250
  lines. Re-confirm before coding.
- **The bug + the branch model were fully verified** against the real S7 transcript (throwaway
  scripts, not committed): the current engine wrongly renders `create → overwrite` per file; the
  correct model is two branches forking at the rewind point. The engine API `reconstructAll` must
  show one v2 `create` per file (surviving); the CLI now **defaults to showing all branches**, so its
  default S7 output surfaces both the v2 surviving creates and the v1 rewound creates.

## What Remains
Execute `plans/s7/s7-reconstruction-plan.md` in order (fully specified):
1. **Task 1** — `src/reconstruction_branch.ts`: `findConversationBranches`, `selectBranchRecords`,
   `selectLiveBranch` (+ `shortUuid`, added in Task 4). Branch heads come from `last-prompt`
   `leafUuid`s; surviving = final head; rewound = abandoned heads deduped to maximal tips, each with
   a rewind point. RED: `tests/reconstruction_branch.test.ts` (synthetic records).
2. **Task 2** — Refactor `src/reconstruction_engine.ts` into a branch-agnostic core
   (`reconstructFileOver`/`reconstructFilesOver`, no filtering) + surviving-default public API
   (`reconstructAll`/`reconstructFile`/`findDeletedTarget` pre-select the surviving branch via
   `selectLiveBranch`). `extractFileEvents` does NO filtering. Add `S7_JSONL` to `tests/fixtures.ts`
   + `tests/reconstruction_engine_s7.test.ts` (RED — surviving = single v2 creates). Behavior-
   preserving for S1–S6.
3. **Task 3** — Add `reconstructBranches` + types `RewoundBranchHistory`/`BranchedReconstruction`;
   each rewound branch is reconstructed over its records and scoped to files changed after its rewind
   point (the `#72` no-change tangent is excluded). RED: extend the S7 engine test.
4. **Task 4** — CLI: DEFAULT = all branches (surviving + rewound under headers; byte-identical to
   today's plain list when there are no rewound branches — the S1–S6 passthrough). Flags:
   `--surviving` (surviving only), `--list-branches` (summary per branch), `--branch <tip-short-id>`
   (one branch, composes with `--target`/`--diff`/`--verbose`; unknown id throws with available ids).
   Add `shortUuid` + `findBranchById` (branch.ts) and
   `renderBranchSummary` (render_list.ts). RED: CLI tests. Then docs (design-doc specs 32–34,
   implementation-notes S7 entry, roadmap S7 `[x]`). Verify gate, End-to-end, stop and report.
5. **After implementation**: present the diff + suggested commit message (`Implemented handling S7`)
   — the user gates commits. Decide the fate of the stray `src/Plan_Impl_template.md`.
6. Then **S8** (`s8-repeated-code-restore-rewinds`): the branch model is built to handle multiple
   rewinds (maximal-tip dedup), but nested rewinds (a rewind off an already-rewound branch) are
   untested — confirm against S8's transcript when planning.

## Key Files
- `plans/s7/s7-reconstruction-plan.md` — THE plan; git mental model, 7 locked decisions, 4 tasks
  with literal RED tests, ground truth, CLI formats. Read first.
- `src/reconstruction_engine.ts` (248/250 lines) — Task 2 splits public API from the core; Task 3
  adds `reconstructBranches`. WATCH the 250-line cap; if exceeded, move branch-aware reconstruction
  to a sibling `src/reconstruction_branches.ts` (split, never condense).
- `src/reconstruction_extract.ts` — `extractFileEvents` stays filter-free (it is the seam the core
  reconstructs over; branch selection happens in the public API / `reconstructBranches`).
- `src/structures/session-meta.ts` — `getLastPromptEntry` hydrates `leafUuid` → `Uuid`; the branch
  module reads heads through it.
- `src/structures/envelope.ts` — `TranscriptRecord` has `uuid?: Uuid` / `parentUuid?: Uuid | null`;
  compare by `.toString()`.
- `src/reconstruction_cli.ts` / `src/reconstruction_render_list.ts` — Task 4's flags + branch
  summary/headers (render_list is 128/250 — room).
- `tests/reconstruction_engine_s6.test.ts` + `tests/fixtures.ts` — mirror for the S7 fixture/tests.
- `plans/coding-requirements.md` + `~/.claude/guides/{coding-standards,tdd,planning,single-condition-branching}.md`
  — mandatory style (domain types, verb-named functions, enum-member compares, single-condition
  branching). Enforced strictly.

## Context the Next Agent Won't Have
- **PRESERVE, don't discard (user directive).** Rewound branches are unmerged git branches; their
  file changes stay retrievable. **CLI default = all branches** (user directive "default to show all
  branches"); `--surviving` opts back to the kept-files-only view. The engine API `reconstructAll`
  stays surviving-only — the all-branches view is the CLI's default rendering of `reconstructBranches`.
- **Branch heads = `last-prompt` `leafUuid` sequence, NOT childless leaves.** In S7 the heads (file
  order) are rec#9→#14→#48→#72→#100→#123; surviving = #123. Abandoned heads not on #123's chain =
  #14,#48,#72; deduped to maximal tips = **#48** (the v1 work) and **#72** (a Read/`ls` tangent with
  NO file change → excluded). Enumerating childless leaves double-counts (the v1 work has two
  terminal leaves #41 & #48); the last-prompt head names it once. Do NOT detect rewinds by
  "parent with >1 child" — attachments are routine siblings → false forks.
- **Keep rule for a branch's records:** uuid-less meta records (`last-prompt`/`mode`/
  `file-history-snapshot`/etc.) are ALWAYS kept (sidecar/session lookup needs them); records with a
  `uuid` are kept only on the tip's ancestor chain. `selectBranchRecords(records, tip)` generalizes
  `selectLiveBranch`. "Keep if parent on-path" is WRONG (re-admits the sibling branch's first msg).
- **The engine split is what enables branch retrieval:** `extractFileEvents` must NOT hard-code the
  surviving filter (the first-draft idea) — that would make reconstructing a non-surviving branch
  impossible. Filter in the public API; reconstruct any branch via the filter-free core.
- **Rewound branch scoping:** report a rewound branch only if its diverging records (past the rewind
  point) carry ≥1 file event, and scope its histories to files changed there ("changes after the
  rewind"). On S7 this is a no-op (both v1 files are born post-fork), but it matters for S8+.
- **Verified S7 ground truth:** surviving v2 writes `scenario7.py` #01JWycFr (8 lines, both fns),
  test #01HXdTmy (72 lines). Rewound v1 (tip `55ee424f-b714-49fe-895f-c748401bb202`, rewind point
  `2e47efbe-fc3a-4ac7-80d2-178e27c61cda`): `scenario7.py` #012jN7F9 (2 lines, celsius only), test
  #015eug6V (5 lines). The filter is a verified **no-op on S1/S2/S5/S6**.
- **NO new `EventKind` / per-line shape.** A rewind is structural (a conversation fork), not a file
  event. Rewound branches reuse `FileRevision`; S7 adds only container types.
- **Harness quirk:** ignore stale in-batch `PostToolBatch`/`PostToolUse` hook failures — a manual
  `npm test` is authoritative. `tsx` does NOT type-check; `npx tsc --noEmit` is the real gate, and
  `noUnusedLocals`/`noUnusedParameters` make a stray import a hard error.
- **Clean room is absolute:** never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/`
  beyond the `S7_JSONL` fixture path. Fixtures use absolute Desktop paths (the `scenarios/` symlink
  resolves to the same files) — keep the convention.
- **Carried-forward open bug (not S7):** `parseRedirect` mis-parses `2>&1` / `>/dev/null` (S5
  regression). S7 never triggers it. Track as a separate hardening slice.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # baseline 88 pass / 0 fail; after S7, 88 + new specs, 0 fail
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
End-to-end (the real S7 transcript):
```
P=".../scenarios/executed/s7-minimal-code-restore/d0d14660-4477-40fa-824c-e7f0bb91cd66.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                  # DEFAULT = all branches: ## surviving (v2) + ## rewound (v1 @ #2e47efbe)
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null      # surviving only: 2 single v2 creates, no headers
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null  # surviving #77494da3; rewound #55ee424f @ #2e47efbe
npx tsx src/reconstruction_cli.ts "$P" --branch 55ee424f 2>/dev/null # only the rewound v1 (#012jN7F9, #015eug6V)
# Sanity: a non-rewind transcript (S1-S6) is unchanged by the new default — plain list, no ## headers.
```
