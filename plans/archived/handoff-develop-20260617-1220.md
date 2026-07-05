# Handoff: Roadmap Item 10 (+10a) — time-aware alias windows — PLANNED, ready to implement
Conversation name: plan RevEng item 10 — time-aware alias windows (clever-swinging-toucan)
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is
**UNTRACKED by design** (`git status --short` → `?? api/ tests/ tools/ plans/ …` + a pre-existing
`M .gitignore`, +6 lines, unrelated). **This project commits nothing during normal work**; the
committed source mirror lives on **`develop-baseline`** (tip `880b69d`, the item-5.6 re-baseline).
No code was written this session — only the plan + this handoff.
Run ALL git + tests from `RevEng/`; the cwd `/Users/matkatmusicllc/Desktop/claude code src` is the
Claude Code TS source (PRODUCER of the JSONL), NOT a git repo. RevEng/ (CONSUMER) is the subdir.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts (`plans/roadmap-100-percent-reconstruction.md`, 17 items; **1–9 closed**). Item
10 fixes the cp-bleed: `cp src dst` copies src→dst at instant T, then they diverge, but the alias
set is static for all time, so `src` edits AFTER T pollute `dst`'s belief and mis-number it
(item-2 spike: `RED_GREEN_TDD.md` mismatched:1 / 11 conflicts; `SKILL.md` mismatched:3 / 35). Item
10 bounds alias membership in time (a src event counts toward dst only through T — the UPPER
bound). Sub-item **10a** (folded in, user-chosen) reseeds CLI discovery from the full alias
closure so src-only transcripts are scanned. Execute the plan via strict red-green TDD.

## Current State
**Item 10 is PLANNED, not implemented. Nothing is in progress; no tests written.** Baseline GREEN
(confirm before starting): full suite **59 suites / 607 passed / 0 failed**; detect-rewinds
**15/0**; probe A/B vs `develop-baseline` (`880b69d`) **identical: true**; sidecar
`plate_summary.py` **247/247 matchedObserved, 0 mismatched, conflicts=233**.

Design is settled and adversarially validated this session. Architecture: the change is
**sidecar-only** — a NEW module `api/alias-windows.js` + event annotation + a CLI post-filter. The
probe never touches any of it, so probe A/B MUST stay byte-identical.

## What Remains
Execute the plan phases IN ORDER (full exact tests + code bodies are in the plan file):
1. **Phase 0 — Baseline gate** (no code): confirm the GREEN numbers above.
2. **Phase 1 — Stamp lineage ops with the copy instant.** In `api/file-historical-lineage.js`
   `collectTouches`, add ONE line `stampTouchTimestamps(ops, parsed);` after the existing touches
   stamp (245→246L). RED test `test_collectTouches_stampsCopyInstantTimestampOnCpOp` first.
3. **Phase 2 — NEW `api/alias-windows.js`**: `resolveAliasWindows(seedPaths, stampedOps)` →
   `Map<absPath, latestValidMs>` (windowed BFS); `aliasPathValidAt(windows, path, unixMs)`;
   `filterEventsByAliasWindows(events, windows)`. 8 RED unit tests in NEW
   `tests/test-alias-windows.js`.
4. **Phase 3 — Annotate events with `aliasPath`** at every emitter's existing membership site
   (the matched path is already computed there), then verify the capstone before/after test.
   Emitters: `file-events-extractors.js` (authored, originalFile, cat, read), plus
   `structured-patch-events.js`, `bash-op-events.js`, `bash-read-events.js`, `grep-tool-events.js`,
   `snapshot-events.js` (snapshot must annotate the FULL alias path that suffix-matched, not the
   repo-relative key). RED tests: `test_extractFileEvents_annotatesAuthoredEventWithAliasPath` +
   the capstone `test_windowFilter_keepsPreCopySrcWriteDropsPostCopySrcEdit` (polluted mismatched=1
   → clean mismatched=0).
5. **Phase 4 — CLI wiring (10 + 10a)** in `tools/track-line-states.js`: build windows from
   `[target]` over the (now stamped) `gatherAllOps(cache)`; reseed `discoverJsonls` from
   `Array.from(windows.keys())` instead of `[target]` (10a); apply
   `filterEventsByAliasWindows(events, windows)` before `trackLineStates`.
6. **Phase 5 — Verify, document, flip.** Run the full gate suite; write
   `plans/implementation-notes-item10-alias-windows.md`; flip roadmap items 10 and 10a to `[x]`
   ONLY after the sidecar check passes (get user sign-off first if any GATE number moves).

## Key Files
- `/Users/matkatmusicllc/.claude/plans/clever-swinging-toucan.md` — **THE PLAN** (exact tests,
  exact code bodies, decisions, limitations, verification). Read it first.
- `RevEng/plans/roadmap-100-percent-reconstruction.md` — authoritative item list; item 10 at line
  274, 10a at line 296, §B order header ~248–253, Constraints ~473.
- `RevEng/plans/prep-item10-time-aware-alias-windows.md` — this session's orientation notes
  (injection points, the probe-dependency map).
- `RevEng/api/file-historical-lineage.js` (245L, AT CAP) — `collectTouches` (Phase 1 +1 line);
  `stampTouchTimestamps` (:114, reused for ops); `editBelongsToFile`/`resolveAliases`/
  `buildLineageGraph`/`gatherAllOps` are **byte-frozen** (probe depends on them).
- `RevEng/api/file-events-extractors.js` (239L, cap risk) — annotate 4 in-file emitters; if it
  breaches 250, relocate `readEventsForFile`+`catEventsForFile` to NEW `api/read-cat-events.js`.
- `RevEng/api/{structured-patch,bash-op,bash-read,grep-tool,snapshot}-events.js` — +1 annotation each.
- `RevEng/tools/track-line-states.js` (117L) — Phase 4 wiring (`resolveAliasPaths` :31,
  `discoverJsonls` :39, the extract loop :98–100).
- `RevEng/tests/{test-helpers.js, track-line-states-fixtures.js}` — harness (`run`/
  `runWithContext`/`summary`) + fixtures (`TS1/2/3`, `MS1/2/3`, `withTimestamp`,
  `makeEditLineWithPatch`, `makeBashCommandLine`, `makeCreateLine`, `makeSystemLine`).
- `RevEng/tests/test-file-historical-lineage.js` — model for the Phase-1 op test (cp/alias tests).

## Plan File
`/Users/matkatmusicllc/.claude/plans/clever-swinging-toucan.md` — fully written, not yet executed.

## Context the Next Agent Won't Have
- **Probe-safety is the load-bearing invariant.** The probe (`tools/probe-projects-v2.js`) calls
  `buildLineageGraph`/`gatherAllOps`/`resolveAliases` (`:63,:102`) AND `editBelongsToFile` (via
  `probe-v2-assembly.js:79`), but NEVER `extractFileEvents` or `trackLineStates`. So those four
  functions MUST stay byte-identical; windowing is layered alongside, never inside them. Probe A/B
  MUST stay `identical: true` — any divergence is a bug, not a re-baseline (item-9 handoff rule).
- **Why annotate-then-filter (not per-emitter gates).** An adversarial design review flagged that
  threading a `windows` arg into the 9 emitter calls would breach the 250-cap on
  `file-events-extractors.js` (239). Instead, each event gets an additive `aliasPath` field at its
  emitter (the path is already computed at the membership check), and ONE pure
  `filterEventsByAliasWindows` runs in the CLI. This keeps every emitter + `editBelongsToFile`
  byte-identical and the filter to a single test surface. `aliasPath` is inert to the engine /
  sort / materialize / verdict.
- **Windows are UPPER-bound only** (`Map<path, latestValidMs>`; `Infinity` = never cut). cp →
  directed `dst→src` edge, cut at the copy instant. mv/git-mv → undirected, no cut (same identity).
  On rediscovery take the **tightest (min)** bound (cycles like backup/restore converge).
- **Three correctness traps the review caught — all handled in the plan:**
  1. **Null copy-instant.** `copyInstantMs` returns `Infinity` (no cut) when the cp op's timestamp
     is missing/unparseable. Cutting to `NaN` would make `unixMs <= NaN` always false and SILENTLY
     drop ALL of the destination's events — worse than today's bug. Tested.
  2. **Seed protection.** A seed is NEVER relaxed below `Infinity`. A `cp seed downstream` edge
     would otherwise cut the very file being tracked. Tested
     (`test_resolveAliasWindows_seedStaysFullEvenWhenCopiedToAnother`).
  3. **Snapshot annotation.** Snapshots match by repo-relative suffix (`anyAliasPathEndsWith`), so
     annotate with the FULL alias path that matched — else its `aliasPath` is not a key in the
     windows map and the event is wrongly dropped.
- **Documented limitations (by design — NOT regressions; reopen triggers in the plan):** (1)
  lower-bound / pre-existing-dst — pre-copy attribution is unchanged from today's static behavior;
  item 10 adds only the upper cut. (2) mv-overwrite-of-existing-path (unparseable as distinct from
  rename). (3) multi-lineage UNION windows (~absent in real topologies). Do NOT try to "fix" these
  inside item 10 — they are separate, larger items.
- **10a re-baseline caveat.** 10a changes CLI discovery, NOT the probe (probe already seeds from
  the full closure). So probe A/B should stay identical. The roadmap's "re-baseline only if a
  target's transcriptsUsed shifts" applies to the PROBE, which is untouched here.
- **The payoff is on LIVE data, not the frozen fixture.** `plate_summary.py` has no cp alias →
  stays 247/247 (proves no-regression). The actual win shows on the cp-created files
  `RED_GREEN_TDD.md` (expect mismatched 1→0, conflicts 11→fewer) and `SKILL.md` (3→fewer, 35→fewer)
  run via the CLI sidecar over `~/Programming/jot-recovery/claude-data`. NEVER run the PROBE
  against live claude-data (self-contaminates); the sidecar CLI is fine.
- **Style:** RevEng is 2-space indent + `var` + CommonJS + ONE condition per `if` (nest; no
  `&&`/`||`; ternaries only for value selection) — NOT the global 4-space default. 250-line cap is
  hook-enforced per file incl. tests; new tests go in NEW sibling files. A Stop hook auto-runs
  `tests/test-<basename>.js` after edits and BLOCKS on failure (expected during RED).
- **User process:** strict `~/.claude/guides/planning.md` (no ambiguity) + `tdd.md` (granular
  one-behavior tests, `test_<behavior>` names, plain-English step comments, RED before GREEN).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng` (see `handoff-develop-20260617-1138.md`
§How to Verify for the full command block):
1. New module: `node tests/test-alias-windows.js` — all pass (capstone `polluted=1`/`clean=0` is
   the core would-fail check).
2. Full suite: expect **607 + N passed / 0 failed** (suite count +1/+2 from new test files).
3. `node tests/detect-rewinds.test.js` → **15 / 0**.
4. **Probe A/B byte-identical** vs `develop-baseline` (`880b69d`) on the frozen fixture
   `~/Programming/jot-recovery/probe-fixture-20260615/projects` → MUST print `identical: true`.
5. Sidecar e2e `plate_summary.py` → **247/247, 0 mismatched, conflicts=233 UNCHANGED**.
6. Payoff (diagnostic, live data): CLI sidecar over `RED_GREEN_TDD.md` / `SKILL.md` → mismatches &
   conflicts DROP vs the item-2 spike numbers. Record before/after.
