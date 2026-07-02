# Handoff: S7 (conversation rewind / code restore) is IMPLEMENTED — branch-aware reconstruction, rewound branches preserved. 101 tests green, awaiting commit approval
Conversation name: api-from-scenarios — S7 (minimal-code-restore) implement plan
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/f58fac66-0c73-4855-977e-f82fd5c7fa82.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s7/s7-reconstruction-plan.md (EXECUTED — all 4 tasks done)

## Branch
`api-from-scenarios` based on `master`. HEAD = `ecbabfd added plan impl template for agent spawning`
(S6 committed at `f5da4e3 Implemented S6 handling`). S7 work is UNCOMMITTED in the working tree.
No `-plate` branch.

## Goal
Clean-room TypeScript engine that reconstructs the file-change history of a Claude Code session from
its JSONL transcript, one scenario at a time. **S7 (`s7-minimal-code-restore`)** is the FIRST of the
rewind / code-restore family (S7–S23). A "Rewind: 1, code" forks the conversation; the user's
directive is to treat the rewind like an **unmerged git branch** — the rewound code changes must be
PRESERVED and retrievable, not discarded. S1–S6 are implemented and committed.

## Current State
- **S7 is fully implemented and verified.** `npm test` = **101 pass / 0 fail** (was 88 at HEAD;
  +13: 4 branch-model + 1 engine surviving + 1 engine rewound + 7 CLI). `npx tsc --noEmit` clean.
  All `src/**` and `tests/*` files ≤250 lines (largest `reconstruction_branch.ts` = 241).
- **End-to-end on the real S7 transcript matches the plan exactly.** Default view = all branches:
  `## surviving tip #77494da3` (scenario7.py create 8 lines #01JWycFr; tests/test_scenario7.py
  create 72 lines #01HXdTmy) then `## rewound tip #55ee424f (rewind @ #2e47efbe)` (scenario7.py
  create 2 lines #012jN7F9 celsius-only; tests/test_scenario7.py create 5 lines #015eug6V). No
  `overwrite` anywhere. `--surviving`, `--list-branches`, `--branch 55ee424f` all verified.
- **What was built (TDD red→green→verify each task):**
  1. `src/reconstruction_branch.ts` (NEW) — conversation-branch model: `findConversationBranches`,
     `selectBranchRecords`/`selectLiveBranch`, `collectSurvivingUuids`, `shortUuid`,
     `findBranchById`. Paired test `tests/reconstruction_branch.test.ts` (synthetic rewind records).
  2. `src/reconstruction_branches.ts` (NEW) — the branch-agnostic reconstruction CORE
     (`reconstructFileOver`/`reconstructFilesOver` + copy-seed recursion), split out of the engine.
  3. `src/reconstruction_engine.ts` — public `reconstructFile`/`reconstructAll`/`findDeletedTarget`
     now pre-select the surviving branch; added `reconstructBranches` + `RewoundBranchHistory` /
     `BranchedReconstruction` types. `extractFileEvents` (in reconstruction_extract.ts) does NO
     filtering.
  4. `src/reconstruction_cli.ts` — default = all branches (with the no-rewound passthrough that
     keeps S1–S6 byte-identical); `--surviving`, `--list-branches`, `--branch <tip-short-id>`.
     Branch summary/headers added to `src/reconstruction_render_list.ts`.
  5. Docs updated: design-doc specs 32–34 + Code-layout + test inventory; implementation-notes S7
     entry prepended; roadmap S7 marked `[x]`.

## What Remains
1. **Review the S7 diff and approve the commit.** The user gates all commits. Suggested message:
   `Implemented handling S7`. Stage the S7 source + tests + plan + docs:
   `src/reconstruction_branch.ts`, `src/reconstruction_branches.ts`,
   `tests/reconstruction_branch.test.ts`, `tests/reconstruction_engine_s7.test.ts`,
   `src/reconstruction_engine.ts`, `src/reconstruction_cli.ts`, `src/reconstruction_render_list.ts`,
   `tests/fixtures.ts`, `tests/reconstruction_cli.test.ts`, `plans/s7/`,
   `plans/reconstruction-engine-design.md`, `plans/implementation-notes-api-from-scenarios.md`,
   `plans/roadmap.md`, and the two S7 handoff docs (`...-1119.md`, `...-1152.md`).
   **Do NOT stage `src/Plan_Impl_template.md`** — it is a stray modified file unrelated to S7
   (carried over from before S7; decide its fate separately).
2. **Decide the fate of the stray `src/Plan_Impl_template.md`** (modified, belongs to no slice).
3. Then proceed to **S8** (`s8-repeated-code-restore-rewinds`) via the established monitor → plan →
   implement → handoff pipeline. S7's branch model is BUILT to handle multiple independent rewinds
   (maximal-tip dedup), but a rewind NESTED inside an already-rewound branch (tree deeper than two
   levels) is untested — confirm/extend against the S8 transcript when planning.

## Key Files
- `plans/s7/s7-reconstruction-plan.md` — THE executed plan: git mental model, 7 locked decisions,
  4 tasks with literal RED tests, ground truth, CLI formats.
- `src/reconstruction_branch.ts` (241/250) — branch model + short-id helpers. Read first for S8.
- `src/reconstruction_branches.ts` (120/250) — branch-agnostic reconstruction core.
- `src/reconstruction_engine.ts` (228/250) — model types + surviving-default public API +
  `reconstructBranches`.
- `src/reconstruction_cli.ts` (192/250) — branch views / flags.
- `src/reconstruction_render_list.ts` (169/250) — `formatBranchHeader`, `renderBranchSummary`.
- `tests/reconstruction_engine_s7.test.ts`, `tests/reconstruction_branch.test.ts`,
  `tests/reconstruction_cli.test.ts` — the S7 specs.
- `plans/implementation-notes-api-from-scenarios.md` — the S7 entry records all decisions,
  deviations, tradeoffs, and the one open question.
- `plans/coding-requirements.md` + `~/.claude/guides/{coding-standards,tdd,planning,single-condition-branching}.md`
  — mandatory style. Enforced strictly.

## Context the Next Agent Won't Have
- **Design was REVERSED mid-plan: PRESERVE rewound branches, do not discard.** An earlier draft
  discarded them; the user changed it to retain them as retrievable unmerged branches. Do not
  resurrect the discard approach.
- **A rewind is a `parentUuid` fork named by the FINAL `last-prompt` `leafUuid`.** Do NOT detect
  rewinds by counting fork points (attachments are routine siblings of user records → false forks).
  A branch's records = its tip's ancestor chain + uuid-less meta records. "Keep if parent on-path"
  is WRONG (re-admits the sibling's first message under the shared checkpoint).
- **The engine split is what enables branch retrieval.** `extractFileEvents` and the core
  (`reconstructFileOver`/`reconstructFilesOver`) must stay filter-free; filtering lives only in the
  public API (`selectLiveBranch`) and `reconstructBranches` (`selectBranchRecords`). Hard-coding a
  surviving filter into extraction (a rejected first-draft idea) would make any non-surviving branch
  unreconstructable.
- **Two deviations forced by the 250-line cap + no-forwarding rule** (both in the S7 notes entry):
  (1) the reconstruction CORE moved to `reconstruction_branches.ts` because Task 2 alone pushed
  `reconstruction_engine.ts` to 261/250; (2) `BranchedReconstruction` gained a
  `survivingTip: Uuid | undefined` field (the plan's literal type omitted it, but the listing/header
  need the surviving tip). `reconstructBranches` itself stayed in the engine (test imports it from
  there; re-exporting would be a forwarding shim).
- **`reconstruction_branches.ts` has no paired test file** (a benign PostToolBatch warning). Its
  core functions are covered transitively by every engine/CLI test; the split was
  behavior-preserving (88 prior tests stayed green). The genuinely-new branch *model* logic lives in
  `reconstruction_branch.ts`, which DOES have its own paired test.
- **`--target` now filters reconstructed histories by exact final path** (one shared `renderChosen`
  for every branch view) instead of re-running `reconstructFile`. Equivalent for every existing case;
  differs only if a renamed file were addressed by its pre-rename name (no test/scenario does).
- **Verified S7 ground truth:** surviving v2 — scenario7.py #01JWycFr (8 lines, both fns), test
  #01HXdTmy (72 lines). Rewound v1 (tip `55ee424f-…`, rewind point `2e47efbe-…`) — scenario7.py
  #012jN7F9 (2 lines, celsius only), test #015eug6V (5 lines). The `#72` head is a Read/`ls` tangent
  with no file change → excluded. The branch filter is a verified no-op on S1/S2/S5/S6.
- **NO new `EventKind` / per-line shape / sidecar change** — a rewind is structural (a conversation
  fork). S7 added only container types (`RewoundBranchHistory`, `BranchedReconstruction`,
  `ConversationBranch`). Resist adding model surface in S8.
- **Harness quirk:** ignore stale in-batch `PostToolBatch`/`PostToolUse` hook failures — they run
  tests mid-edit on a half-written tree. A manually-run `npm test` is authoritative. `tsx` does NOT
  type-check; `npx tsc --noEmit` is the real type gate (`noUnusedLocals`/`noUnusedParameters` make a
  stray import a hard error).
- **Clean room is absolute:** never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/`
  beyond the `S7_JSONL` fixture path. Fixtures use absolute Desktop paths (the `scenarios/` symlink
  resolves to the same files).
- **Carried-forward open bug (not S7):** `parseRedirect` mis-parses `2>&1` / `>/dev/null` (S5
  regression). S7 never triggers it. Track as a separate hardening slice (`parseRedirect` should
  ignore `N>&M` fd-duplication and `/dev/null`).

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 101 pass / 0 fail
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
End-to-end (the real S7 transcript — proves the rewind is handled as two branches):
```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s7-minimal-code-restore/d0d14660-4477-40fa-824c-e7f0bb91cd66.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                  # DEFAULT: ## surviving (v2) + ## rewound (v1 @ #2e47efbe), no overwrite
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null      # surviving only: 2 single v2 creates, no headers
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null  # surviving #77494da3; rewound #55ee424f @ #2e47efbe
npx tsx src/reconstruction_cli.ts "$P" --branch 55ee424f 2>/dev/null # only the rewound v1 (#012jN7F9, #015eug6V)
# Sanity: a non-rewind transcript (S1–S6) is unchanged by the new default — plain list, no ## headers.
```
