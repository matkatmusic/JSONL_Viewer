> **MUST READ FIRST:** [`plans/script-handling.txt`](../script-handling.txt) — the premise for
> reconstructing files rewritten by a script (the HAS-BEACON vs NO-BEACON / forward-validation rule).
> S24 is the clean-room **HAS-BEACON** case of that doc; any `s25+` script scenario depends on it.

# Handoff: Scenario S24 (`s24-script-rename-functions`) is IMPLEMENTED and verified — a characterization/regression LOCK, **NO `src/` change**, suite 337 → 347
Conversation name: api-from-scenarios — S24 impl monitor → implement S24 (script-rename-functions)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/5a3a589d-9f7d-4cdd-b8ae-15b5a955f226.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s24/s24-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `3d3ac15 m2-m7 implemented` (S1–S23 + m1–m7 committed;
clean 337-test baseline). Nothing from S24 is committed yet.

## Goal
Lock the engine's **already-correct** reconstruction of S24 — a function module (`order_utils.py`)
rewritten by an external `python3 rename_funcs.py` run through the Bash tool (NOT via Edit/Write). The
engine recovers the rename from the harness-injected `edited_text_file` **beacon** via existing S15
machinery, so S24 needs **zero `src/` change**. Add a fixture + 10 lock tests + 3 doc edits (337 → 347).

## Current State
- **DONE — all acceptance criteria met except the gated commit.**
- `npm test` = **347 pass / 0 fail**; `npx tsc --noEmit` = clean.
- `git diff src/` shows ONLY `src/Plan_Impl_template.md`, the **pre-existing unrelated** modification
  (it was already `M` at session start) — **S24 added NO `src/` change**. The lock contract holds.
- Ground truth held EXACTLY as the plan stated: `order_utils.py` = 6 revisions
  `[write, edit, edit, userEdit, edit, edit]`; rev3 = the beacon `user-edit` (changeId
  `859347d2-3413-439f-ba38-3ab7ee61474c`, 187 lines, fully renamed); final = 234 lines / 6478 chars,
  byte-identical to the rendered ground truth; reader-INDEPENDENT; linear (tip `#fba814f7`, 0 rewound).
- **Files created:** `tests/reconstruction_engine_s24.test.ts` (5 tests, reader-free),
  `tests/reconstruction_cli_s24.test.ts` (5 tests).
- **Files modified:** `tests/fixtures.ts` (+`S24_JSONL`), `plans/roadmap.md` (+S24 line after M7),
  `plans/implementation-notes-api-from-scenarios.md` (prepended S24 entry),
  `plans/reconstruction-engine-design.md` (appended S24 note after the m7 note).
- **All three engine crux locks proven RED→GREEN→restored** (changeId, poison-reader, 234-line final
  literal) and **both CLI liveness probes** (`#859347d2`, `def calculate_total(`). Details in impl-notes.

## What Remains
1. **Commit (ONLY on explicit user approval — project rule: one commit per scenario, gated).** Stage
   EXACTLY these 6 files (never `git add -A`; do NOT stage `src/Plan_Impl_template.md`):
   ```
   tests/fixtures.ts
   tests/reconstruction_engine_s24.test.ts
   tests/reconstruction_cli_s24.test.ts
   plans/roadmap.md
   plans/implementation-notes-api-from-scenarios.md
   plans/reconstruction-engine-design.md
   ```
   Message: `Implemented S24 handling` (+ standard Co-Authored-By / Claude-Session trailers). Decide
   separately whether to also commit the new `plans/s24/` (plan + handoffs) and `plans/script-handling.txt`.
2. **Next scenario IS defined: `scenarios/s25-script-rename-multi-file.txt`** (a MULTI-FILE script
   rename — the multi-file extension of S24). The series is **NOT** complete (the S24 plan's
   "S24 is the last scenario" note is now outdated). Plan + implement s25 next; **read
   `plans/script-handling.txt` first** — s25 may be a NO-BEACON case that needs forward-validation.

## Key Files
- `plans/script-handling.txt` — **MUST READ** — the HAS-BEACON/NO-BEACON forward-validation premise.
- `plans/s24/s24-reconstruction-plan.md` — the plan that was executed (exact assertions, byte strings).
- `tests/reconstruction_engine_s24.test.ts` — 5 reader-free engine locks (rev3 beacon user-edit,
  poison-reader independence, 234-line final byte-lock).
- `tests/reconstruction_cli_s24.test.ts` — 5 CLI locks (conv/file DAG, list-branches, verbose rename).
- `tests/fixtures.ts` — `S24_JSONL` (Desktop path).
- `scenarios/executed/s24-script-rename-functions/order_utils.py` — the 234-line ground truth.
- `plans/implementation-notes-api-from-scenarios.md` — top entry has the full S24 write-up.

## Context the Next Agent Won't Have
- **S24 is HAS-BEACON, NOT a script-replay scenario.** The two opaque `python3 rename_funcs.py` Bash
  runs are NOT parsed (the m3 contrast — m3's `>>` redirects WERE parsed). The rename is carried by the
  `edited_text_file` attachment (`859347d2…`) that lands with ZERO intervening edits, so the immediate
  post-script state is DIRECTLY OBSERVED — the engine adopts the beacon as rev3's user-edit. Do NOT
  port the sibling RevEng forward-validation/transform feature for S24; it is over-engineering for an
  observed file. (s25 may differ — check whether each file has a beacon.)
- **Plan §6 CLI Test 4/5 had a bug** I corrected (test-design only, no `src/` change): they asserted
  the terse `def` headers are ABSENT from the whole `--surviving --verbose` dump, but verbose renders
  EVERY revision, so terse headers legitimately appear in rev0/1/2. I scoped the "terse absent /
  renamed present" check to the FINAL revision-5 block (sliced from the unique `revision 5  @` header
  to the next `\n### ` file section). Reuse this `finalRevisionBlock` helper for s25 verbose tests.
- **Whole-word trap:** `apply_disc` is a substring of `apply_discount`. Match `def <name>(` headers
  (`TERSE_DEFS`/`RENAMED_DEFS`), never bare substrings, or you get a phantom match in renamed content.
- **Reader-independence is locked with a POISON reader** (a `BackupReader` returning garbage, proven
  ignored) — not by comparing two real runs. Keep this guard for any HAS-BEACON s25 file.
- **changeId of a beacon user-edit is the message UUID** (`entry.uuid`, `859347d2…`), NOT a `toolu_`
  id — per `userEditEventFrom`. The rev3 timestamp is the Bash result time (20:12:44.611Z).
- **Commit gating:** never `git add -A`; the tree carries the unrelated `src/Plan_Impl_template.md`
  edit — leave it out of the S24 stage.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
node --import tsx --test tests/reconstruction_engine_s24.test.ts   # 5 green
node --import tsx --test tests/reconstruction_cli_s24.test.ts      # 5 green
npm test            # expect 347 pass / 0 fail
npx tsc --noEmit    # expect: No errors found
git diff --stat src/   # expect ONLY src/Plan_Impl_template.md (pre-existing) — S24 adds NO src change
```
