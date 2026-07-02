# Handoff: S11 (`s11-write-code-restore-rewrite`) is IMPLEMENTED and verified — no production-code change; the engine already reconstructs S11 correctly, so the slice is characterization/regression tests + new spec 38 + docs. 129 tests green. Everything is UNCOMMITTED, awaiting commit approval.
Conversation name: api-from-scenarios — implement S11 (write-code-restore-rewrite) [autonomous monitor session]
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/89dc8e9e-295c-4cbd-8411-271183003dc6.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s11/s11-reconstruction-plan.md (EXECUTED — both tasks done)

## Branch
`api-from-scenarios` based on `master`. HEAD = `7805122 Implemented S10 handling` (S10 committed; 122 tests green at HEAD). **All S11 work is UNCOMMITTED in the working tree** (3 docs + 2 test files modified, 2 test files added, plus the `plans/s11/` plan). No `-plate` branch.

## Goal
Clean-room TypeScript engine that reconstructs the file-change history of a Claude Code session from its JSONL transcript, one scenario at a time. **S11 (`s11-write-code-restore-rewrite`)** is the fifth scenario in the rewind/code-restore family (S7–S23). The session writes `scenario11.py`+`tests/test_scenario11.py` (the `add` version), does a `code` rewind back to the root checkpoint, then REWRITES the same two filenames with different content (the `multiply` version) and exits. So the surviving on-disk working tree is the **multiply** rewrite, and the abandoned **add** turn — which DID write files — is preserved as ONE rewound branch (forked at the root checkpoint), exactly like S7's single rewound branch. S11 is the **complement of S9**: S9 proved a `code`-restore refresh (bumped `version`, `null` `backupFileName`) must NOT move the working-tree owner; S11 proves a real rewrite after the restore (a NEW non-null `backupFileName` at a NEW `version`) MUST move it. Together they pin both directions of spec 36's content signature. **The engine was already correct on this transcript** (like S10), so S11 adds only tests + docs that LOCK the behavior.

## Current State
**S11 is fully implemented and verified; nothing remains to code.** Verify gate + end-to-end, run just now, all green:
- `npm test` → **129 tests pass, 0 fail** (was 122 at S10; +7 = 1 synthetic branch + 2 engine + 4 CLI).
- `npx tsc --noEmit` → **no errors** (the new engine-test helpers are typed `FileHistory[]` to satisfy `noImplicitAny`/`noUnusedLocals`; `tsx` does NOT type-check, so `tsc --noEmit` is the real gate).
- Filesize check → **all files ≤250 lines** (`reconstruction_cli.test.ts` stayed at 246; the 4 S11 CLI tests went into a NEW `tests/reconstruction_cli_s11.test.ts` at 49 lines — the per-scenario split S10 established).
- End-to-end on the real S11 transcript (default view): `## surviving tip #d03f0078` (multiply: `scenario11.py` #01U5g9RL + `tests/test_scenario11.py` #01B97eyh) + `## rewound tip #a7ceb7ae (rewind @ #742f44f2)` (add: #01CMuVT4 + #01EW4ztd). `--list-branches` shows both lines; `--diff` shows surviving `def multiply` vs rewound `def add`.
- **No-op proof:** S10 still surviving `#bfd9d428` (no rewound); S9 still surviving `#f1b8dede`; S8 still surviving `#2988ac8f` + 2 rewound (#546718c1, #84d669da); S1 still a plain list (0 `##` headers).

The one remaining action is **commit, after the user approves** (suggested message: `Implemented S11 handling`).

## What Remains
1. **Get user approval, then commit** the S11 working tree as `Implemented S11 handling`. Stage: the 2 new test files (`tests/reconstruction_engine_s11.test.ts`, `tests/reconstruction_cli_s11.test.ts`), the 2 modified test files (`tests/fixtures.ts`, `tests/reconstruction_branch.test.ts`), the 3 modified docs (`plans/reconstruction-engine-design.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/roadmap.md`), and `plans/s11/`.
2. **S12 (`s12-…`) is the natural next slice.** Verify the S12 ground truth (changeIds, branch tips, snapshot version/backupFileName transitions) against the real transcript first, then write `plans/s12/s12-reconstruction-plan.md` the same way (locked decisions, literal tests, expected CLI output). The S12 scenario JSONL lives under `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/`.
3. **Carried-forward, not S11:** `parseRedirect` mis-parses `2>&1` / `>/dev/null` (S5 regression). Track as a separate `parseRedirect` hardening slice.

## Key Files
- `plans/s11/s11-reconstruction-plan.md` — THE plan (ground truth: verified snapshot table, conversation topology, Write-event changeIds, locked decisions, literal tests). Read first.
- `tests/reconstruction_engine_s11.test.ts` (NEW, 68) — 2 real-transcript tests: `test_default_reconstruction_is_the_post_restore_rewrite`, `test_reconstruct_branches_retains_the_code_rewound_add_branch`. Mirrors `tests/reconstruction_engine_s8.test.ts` (the closest model: surviving + rewound branches).
- `tests/reconstruction_cli_s11.test.ts` (NEW, 49) — 4 CLI regression tests (default / `--surviving` / `--list-branches` / `--branch a7ceb7ae`). Mirrors `tests/reconstruction_cli_s10.test.ts`'s split, assertions modelled on the S7 CLI tests.
- `tests/reconstruction_branch.test.ts` (226) — added `buildCodeRestoreThenRewriteRecords` + `test_find_conversation_branches_advances_owner_to_post_restore_rewrite` (the owner-ADVANCE complement of S9's `buildCodeRestoreNoPostEditRecords`).
- `tests/fixtures.ts` — added `S11_JSONL`.
- `plans/reconstruction-engine-design.md` — new **spec 38 (code-restore-then-rewrite)**, after spec 37 / before "Deferred".
- `plans/implementation-notes-api-from-scenarios.md` — S11 entry prepended at top.
- `plans/roadmap.md` — S11 marked `[x]`.
- `src/reconstruction_worktree.ts` (UNCHANGED) — `findWorkingTreeOwner` + `resolveContentId`; the source that already makes S11 correct. Read to understand WHY S11 is a no-op.
- `src/reconstruction_branch.ts` (UNCHANGED) — `findSurvivingHead` + `findConversationBranches`.

## Context the Next Agent Won't Have
- **The crux that makes S11 the complement of S9 (and a no-op): the `@v<version>` suffix is part of the content signature.** The harness names each backup `<path-hash>@v<version>` where `<path-hash>` derives from the file PATH, not its content. In this transcript the `add` and `multiply` versions of `scenario11.py` carry the IDENTICAL path-hash `ef7eb2c33a0c873b`, differing ONLY as `@v2`→`@v4`. `resolveContentId` returns the FULL `backupFileName` string (suffix included), so `…@v4 ≠ …@v2` → the signature changes → the working-tree owner advances to the multiply head. A refactor that compared only the hash component (mistaking it for a content hash) would regress S11 (owner stuck at the `add` head, surviving tree WRONGLY the `add` code) while S9/S10 still passed. The synthetic + real S11 tests guard exactly that failure mode.
- **Verified snapshot evolution (in the plan):** snapshot #4 = add head (`scenario11.py` v2 bfn `ef7eb2c33a0c873b@v2`), #5 = the `code`-restore refresh (v3, `null` bfn — the S9 pattern, ignored by carry-forward), #6 = multiply head / working-tree owner (`ccc4a78e`, v4 bfn `…@v4`), #7 = unchanged trailing snapshot. Owner = #6.
- **No RED phase — by design, not an oversight.** S11 has no failing behavior to fix; the engine is already correct (verified end-to-end and by direct `reconstructAll`/`reconstructBranches` drive before coding). The 7 new tests are characterization/regression locks expected GREEN on arrival; each was confirmed GREEN on the unchanged `src/`. This is the project's established no-op-slice pattern (S9 Task 2, S10). Do NOT fabricate a production-code change to manufacture a RED→GREEN cycle — it would risk regressing S1–S10.
- **The CLI test file split is forced, not preference.** `tests/reconstruction_cli.test.ts` is at 246/250; four more tests would breach the hard 250-line cap (a PostToolUse hook blocks the save AND the verify-gate filesize check fails). S10 hit the same wall and created `tests/reconstruction_cli_s10.test.ts`; S11 follows it. A future rewind-family CLI-test consolidation is deferred (noted in the implementation notes' Tradeoffs).
- **S11 is the first scenario where surviving and rewound branches write the SAME paths with DIFFERENT content.** Branch-aware reconstruction keeps them fully separate (each branch reconstructs its own create), so no cross-branch line bleed. A rewrite that *edits* (rather than fully overwrites) a restored file — a multi-revision surviving history — is NOT in scope; note for a future slice.
- **Harness quirks:** `NODE_OPTIONS` injects an inspector, so every `node`/`npx tsx`/`tsc` run prints `Debugger listening…`/`Waiting for the debugger to disconnect…` banners on stderr — ignore them, they are not errors. `npm test`'s summary lines are `ℹ tests/pass/fail …` (capture full output to a file and grep `^ℹ`; a naive grep for `# pass` matches nothing). Append `2>/dev/null` to CLI runs to strip the banners. Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` beyond the `S11_JSONL` fixture path.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test 2>&1 | grep -E '^ℹ '      # tests 129, pass 129, fail 0
npx tsc --noEmit                    # no errors (ignore the Debugger banners on stderr)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
End-to-end (proves S11 is correct; S10/S9/S8/S1 unchanged):
```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s11-write-code-restore-rewrite/a26b3dcb-cf00-4b17-a595-86dd57d4df83.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                  # ## surviving #d03f0078 (multiply) + ## rewound #a7ceb7ae (add) @ #742f44f2
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null  # surviving #d03f0078; rewound #a7ceb7ae rewind @ #742f44f2
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null      # only the two multiply files, no headers
npx tsx src/reconstruction_cli.ts "$P" --diff 2>/dev/null           # surviving = def multiply; rewound = def add
# Sanity (unchanged): S10 --list-branches surviving #bfd9d428 (no rewound); S9 surviving #f1b8dede; S8 default surviving #2988ac8f + 2 rewound (#546718c1, #84d669da); S1 default = plain list, 0 "## " headers.
```
