# Handoff: IMPLEMENT Scenario s30 (`s30-script-rename-count-mismatch`) PLANNED — CHARACTERIZATION/REGRESSION LOCK, NO engine src change. CSV count-guarded script CONDITIONALLY refuses one rename; applied rename shows through, refused rename never fabricated. Sole crux = `completeElidedBeacons` (S28) on `tests/test_pricing.py`; `pricing.py` reader-INDEPENDENT (complete beacon + replayed `receipt` Edit). 412→424 green (6 engine + 6 CLI). Next: s31.
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S30 planning (/plan-scenario 30)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/4cf33d0f-2ab3-43c5-9bb0-0578a0817ca2.jsonl
Plan file: plans/s30/s30-reconstruction-plan.md  (AUTHORITATIVE — every value re-verified LIVE against the real sidecar reader before being baked into the plan)

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae`. The tree is NOT clean: S28 + S29 work is
implemented but UNCOMMITTED (modified `src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`,
`_user_edit.ts`; untracked `tests/reconstruction_{engine,cli}_s28.test.ts`,
`tests/reconstruction_{engine,cli}_s29.test.ts`, `plans/s28/`, `plans/s29/`, `plans/s30/`; S28/S29 doc
edits already present in `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`,
`plans/reconstruction-engine-design.md`; plus an unrelated `src/Plan_template.md` edit). **S30 adds NO
`src/` change on top of that.**

## Goal
Lock S30's byte-perfect reconstruction and prove which existing engine code makes it work, so a future
change that breaks the partial-apply / elided-beacon composition is caught. S30 is the COUNT-MISMATCH
scenario: a `python3 safe_rename.py` Bash run reads `count_renames.csv` (two rows) and renames a function
across `pricing.py` + `tests/test_pricing.py` **only when** the row's claimed whole-word count matches the
actual count. `round_price`→`round_to_cents` (count 8 == actual 8) **APPLIES**;
`base_price`→`unit_price` (count 10 != actual 11, off by one) prints `MISMATCH` and is **REFUSED** —
`base_price` stays everywhere, `unit_price` is never produced. A later Edit adds `receipt()` calling
`round_to_cents`. The engine reconstructs from the post-script BEACONS, so the refusal is captured for
free; no new engine code is needed or wanted.

## Current State — PLANNED (everything below verified LIVE this session)
- Baseline at S30 start: `npm test` → **412 / 0**, `npx tsc --noEmit` clean (S28+S29 present).
- **Engine reconstructs all 4 files byte-perfect with the real reader** (proven via a planning probe):
  - `pricing.py` → 5863B, ladder `[write, edit, edit, user-edit#9a1c303d, edit#…RonDvN]`;
    **reader-INDEPENDENT** (identical without reader and with a poison reader). Complete 155-line beacon +
    the `receipt` Edit replays on top. `round_to_cents`+`base_price`+`receipt` present; no whole-word
    `round_price`; no `unit_price`.
  - `tests/test_pricing.py` → 1035B, ladder `[write, user-edit#388074da, overwrite#b1770edab554937c@v3]`;
    **reader-DEPENDENT** — ELIDED 39-line beacon (lines 1–40 with `...` eliding lines 19–20) completed by
    `completeElidedBeacons` (S28). Chosen backup `@v3` (40L, post-rename) over the **same-40-line** `@v2`
    (pre-rename) — content-not-recency selection. `base_price` kept (×5 in both versions); no `unit_price`.
  - `count_renames.csv` (3L) + `safe_rename.py` (68L) → write-only, reader-independent.
- **Mutation probes (live, restored byte-identical from `/tmp/s30-branches.bak`):**
  - Probe A — neutralize `completeElidedBeacons` (branches.ts:54): **ONLY** `tests/test_pricing.py`
    diverged (1035 → 977, `...` survives). **The sole crux.**
  - Probe B — neutralize `completeTruncatedBeacon` (:56): nothing diverged (no truncated beacon).
  - Probe C — neutralize `seedStaleEditBases` (:55): nothing diverged (`receipt` Edit replays off the
    complete beacon; the stale-base path is inert for S30).
- **NO poison leak anywhere** — a clean reader/poison matrix (unlike S29's `pkg/b.py`).
- Plan written: `plans/s30/s30-reconstruction-plan.md` (verdict + ground truth + 6 engine + 6 CLI tests +
  3 doc edits + mutation proof + DoD). Memory ground-truth node `s30-ground-truth.md` created.

## What Remains (execute in this order — full detail in the plan)
1. **Confirm baseline** — `npm test` must be **412/0**; `npx tsc --noEmit` clean. If not 412, STOP (S28/S29
   not present → every literal is invalid). Snapshot `git diff src/ > /tmp/s30-src-before.diff` FIRST.
2. **Fixture** (plan §4) — add `S30_JSONL` to `tests/fixtures.ts` right after `S29_JSONL` (Desktop
   canonical path).
3. **Engine lock** (plan §5) — `tests/reconstruction_engine_s30.test.ts`, 6 tests (T1 linear/4-surviving;
   T2 refused-rename-never-fabricates-`unit_price`; **T3 elided crux** — `overwrite` changeId
   `b1770edab554937c@v3`, 40L, no `...`; T4 no-reader-977-`...`-survives guard; T5 `pricing.py`
   reader-independent bytelock real==without==poison; T6 `extractFileEvents` 4w/3e/2ue/0ow). Use
   `EventKind` members, never bare strings.
4. **CLI lock** (plan §6) — `tests/reconstruction_cli_s30.test.ts`, 6 tests (C1 conversationDAG prompt
   `#b2ad40c6` + 2 user-edit lines; C2 fileDAG 5 nodes on pricing / 2 on test; C3 `--list-branches` tip
   `#e61d0ae0`; C4 verbose test_pricing elided-completed; C5 verbose pricing `def receipt(` + no
   `unit_price`; C6 CSV records `base_price,unit_price,10` off-by-one + no `unit_price` in either code
   block). Copy exact renderer spacing from a live run (plan §8), do not hand-count.
5. **Docs** (plan §7) — 3 edits: `plans/roadmap.md` (412→424), `plans/implementation-notes-…md`,
   `plans/reconstruction-engine-design.md`.
6. **Verify** (plan §8) — `npm test` → **424/0**; `npx tsc --noEmit` clean;
   `diff /tmp/s30-src-before.diff <(git diff src/)` identical (zero S30 src change).
7. **Prove the crux is load-bearing** (plan §9) — `cp src/reconstruction_branches.ts /tmp/s30-branches.bak`;
   edit line 54 → `const unelided = based;` → run the engine test → **T3 RED**; restore; confirm
   `diff /tmp/s30-branches.bak src/reconstruction_branches.ts` identical and `npm test` 424.
8. **Commit (USER-APPROVAL-ONLY)** (plan §10) — stage **exactly** `tests/fixtures.ts`, the two new s30 test
   files, the 3 docs, and `plans/s30/`. **NEVER `git add -A`.** Do NOT stage `src/*`, `src/Plan_template.md`,
   `src/Impl_template.md`, `monitor-handoff.sh`, or any S28/S29 files. **COORDINATION HAZARD:** the 3 doc
   files also carry S28/S29 uncommitted doc edits — confirm with the user how to split the S28/S29/S30
   commits before committing. Message `Implemented S30 handling` + standard trailers.
9. **create handoff** — when implementation is done, write a COMPLETION handoff with `/jot:handoff-prompt`.
   Put `MUST READ: plans/script-handling.txt` near the top after the header. Title MUST contain
   `Scenario s30 … IMPLEMENTED` (first scenario token `s30` + the whole word `IMPLEMENTED`) so the s31
   planner's `./monitor-handoff.sh s30 impl` fires. Next scenario: **s31** (`s31-script-rename-many-rows`).

## Key Files
- `plans/s30/s30-reconstruction-plan.md` — AUTHORITATIVE plan (§2 = all exact literals/ladders; §5/§6 =
  the two test files; §9 = the mutation proof).
- `plans/script-handling.txt` — the MUST-READ HAS-BEACON vs NO-BEACON premise.
- `tests/reconstruction_engine_s29.test.ts` + `tests/reconstruction_cli_s29.test.ts` — the structural
  models to copy (helpers, readers, `fileVerboseBlock`, ground-truth reader pattern).
- `tests/fixtures.ts` — add `S30_JSONL` after `S29_JSONL`.
- `scenarios/s30-script-rename-count-mismatch.txt` + `scenarios/executed/s30-script-rename-count-mismatch/`
  — scenario + executed transcript and the 4 rendered files (`pricing.py`, `tests/test_pricing.py`,
  `count_renames.csv`, `safe_rename.py`). **Unlike S29, every file IS rendered — no ground-truth gap.**
- `~/.claude/file-history/29634d79-a1f4-4a26-9a2d-0c79798e42e7/` — backups; `b1770edab554937c@v2`/`@v3`
  are the rejected/chosen test_pricing.py versions; `efc8e68602b4d5cb@v2..@v5` are pricing.py (narrative).

## Context the Next Agent Won't Have
- **NO engine change. This is a char-lock.** Byte-perfect reconstruction already holds on the
  post-S28/S29 engine. If a lock fails, the bug is in a test literal/reader, NOT `src/`.
- **The count-mismatch is captured for free.** The engine never re-derives the rename — it adopts the
  observed post-script beacons, which already show `round_to_cents` applied and `base_price` retained. So
  the headline lock (T2/C6) is "the engine NEVER fabricates `unit_price` and KEEPS `base_price`," not "the
  engine simulates the refusal." `unit_price` literally never exists in any beacon, edit, or backup.
- **Whole-word vs substring matters in assertions.** The script renamed whole-word `round_price` → 0
  whole-word `round_price` remains in the finals, BUT test function names like
  `test_round_price_rounds_to_two_places` still contain the substring `round_price` (bounded by `_`, not a
  word boundary). Assert absence with `/\bround_price\b/`, never a bare `includes("round_price")`.
- **`pricing.py` reader-independence is load-bearing to assert (T5).** A complete beacon followed by a
  downstream Edit (`receipt`) needs NO backup — Probe C proved `seedStaleEditBases` is inert here. This is
  the structural contrast with S29's `pkg/b.py` (which DID leak poison via `seedStaleEditBases`). S30 has a
  fully clean poison matrix.
- **Version selection is content-not-recency, same-line-count.** `tests/test_pricing.py` picks
  `b1770edab554937c@v3` over the **same-40-line** `@v2`; both are 40 lines and differ only by the applied
  rename. Lock the `@v3` `changeId` explicitly (T3) — a recency-only selector would also pass a naive
  length check, so the changeId assertion is what makes the test load-bearing.
- **`overwrites = 0` in the event stream.** The synthetic `overwrite` revision on `tests/test_pricing.py`
  is a reconstructed revision only; it never appears as an extracted event or a DAG node (T6/C2).
- LESSON (S22/S26): the handoff TITLE drives the next monitor; the next-scenario token (`s31`) is kept
  ONLY in this title's "Next: s31", never elsewhere, to avoid false-fires. The s30 impl monitor matches on
  first-token `s30` + NOT-`IMPLEMENTED`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 412 now (baseline); 424 after the 12 new tests land
npx tsc --noEmit    # No errors found
# After implementing:
node --import tsx --test tests/reconstruction_engine_s30.test.ts   # 6 green
node --import tsx --test tests/reconstruction_cli_s30.test.ts      # 6 green
diff /tmp/s30-src-before.diff <(git diff src/)                     # identical → zero S30 src change
```
