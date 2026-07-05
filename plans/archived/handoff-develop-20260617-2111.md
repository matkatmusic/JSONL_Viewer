# Handoff: Roadmap Item 18 (`userModified` user-edit tracking) — DONE; §A fully closed
Conversation name: implement RevEng item 18 — userModified user-edit tracking
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`, UNCHANGED this session — this project
commits nothing during normal work; the working tree is UNTRACKED by design (`git status --short` →
many `??` entries + a pre-existing unrelated `M .gitignore`). The committed source mirror lives on
**`develop-baseline`**, currently **`a8947fc`** (item-15 re-baseline), **UNCHANGED this session —
item 18 is probe-byte-identical so NO re-baseline was needed.** Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd `…/Desktop/claude code src` is the
Claude Code TS source (PRODUCER of the JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the git repo.

## Goal
Item 18 was the LAST open §A item. Claude Code stamps `toolUseResult.userModified:true` on an
Edit/Write when an external actor (user/formatter/hook) changed the file around the edit — a DIRECT
signal belief diverged from disk. It was DROPPED at extraction. Item 18 adds a CONTENTLESS
`userModified` event kind that emits one diagnostic conflict record AND conservatively un-proves EOF.

## Current State
**Item 18 COMPLETE. All gates GREEN (measured this session):**
- Full suite: **71 suites / 705 passed / 0 failed** (was 69/690 going in: +2 suites, +15 tests).
- detect-rewinds: **15 passed / 0 failed**.
- Sidecar e2e (`plate_summary.py`): **247/247 matchedObserved, 0 mismatched, conflicts=8** —
  UNCHANGED (dormancy proof; `userModified:true` is absent from plate data).
- Probe A/B vs `develop-baseline` (`a8947fc`) on the frozen fixture: **`identical: true`** → NO
  re-baseline.
- All touched `api/` files ≤250.

Roadmap item 18 is flipped to `[x]` with a DONE summary. **§A is now fully closed (items 1–18 +
10a all `[x]`).** Implementation notes: `plans/implementation-notes-item18-usermodified.md`.

What shipped (sidecar-only; DORMANT — `userModified:true` is 0× on all known data, built
defensively, item-8/11 class):
- **Capture** — `api/edit-stream-extraction.js` (250): net-zero `userModified: tr.userModified ||
  false` on `buildReplaceEdit` + `buildCreateOrUpdateEdit`.
- **Register** — `api/file-event-kinds.js` (53): `'userModified'` in `KIND_NAMES` (zero golden ripple).
- **Emit** — NEW `api/user-modified-events.js` (52); wired net-zero via `.concat(...)` on the
  originalFile push in `api/file-events-extractors.js` (250). Gated on the FLAG, ALL edit kinds.
- **Materialize** — `api/line-state-evidence.js` (243): `materializeUserModified` (contentless;
  ref → `newString` for edits, `content` for create/update) + 1 dispatch line.
- **Apply + drift** — `api/line-belief.js` (246) `unproveEof`; `api/apply-one-event.js` (166)
  `buildUserModifiedConflictInfo` + dispatch branch BEFORE the whole-file fallthrough.
- **Record** — `api/track-line-states.js` (185): `appendConflictRecords` generalized to truthy-`kind`.

## What Remains
Item 18 needs nothing further. For the next agent picking up the roadmap:
1. **Confirm scope.** §A is fully closed; §B is fully closed (items 9–13 all `[x]`). Open work, if
   any, is in **§C — Residual investigation + promotion** (items 14–17 are `[x]`; re-read
   `plans/roadmap-100-percent-reconstruction.md` § C from line ~507 to find anything still `[ ]`).
2. **If a real `userModified:true` ever appears** (it is dormant today), execute the REOPEN TRIGGER
   below BEFORE trusting the conservative EOF drift on real data.
3. Otherwise the roadmap may be complete — verify by scanning for remaining `- [ ]` checkboxes:
   `grep -n '^- \[ \]' plans/roadmap-100-percent-reconstruction.md`.

## Key Files
- `plans/roadmap-100-percent-reconstruction.md` — the roadmap; item 18 DONE summary at ~line 283;
  § Constraints (~687: 250-cap, red-green, single-condition, archive rules).
- `plans/implementation-notes-item18-usermodified.md` — full item-18 record (decisions, deviations,
  gate results, reopen trigger).
- `api/user-modified-events.js` — the new emitter (template for any future flag-gated event kind).
- `api/apply-one-event.js` — `buildUserModifiedConflictInfo` + dispatch; `kindRank` ordering lives in
  `api/track-line-states.js`.
- `tests/test-user-modified-events.js` (emitter unit) + `tests/test-track-line-states-usermodified.js`
  (tracker integration) — the two new suites.

## Plan File
`~/.claude/plans/ticklish-finding-anchor.md` (approved, fully executed this session).

## Context the Next Agent Won't Have
- **Two design forks were decided WITH THE USER (do not re-litigate):** (1) tracker behavior =
  **option (b) record + conservative drift** (emit the diagnostic AND `eofConfirmed=false`); (2)
  emission scope = **all edit kinds**, gated on the FLAG, not `type==='edit'`.
- **Ordering is load-bearing.** The authored-edit, `originalFile`, and `userModified` events share
  `jsonlLine = edit.line + 1`; `compareEvents` orders by `kindRank` (originalFile 0 → edit 1 →
  userModified 2-fallthrough). `userModified` MUST stay the rank-2 fallthrough (**NO `kindRank`
  case**) so the EOF drift lands on POST-edit belief. A test asserts this ordering.
- **The contentless fallthrough is a trap** (the planned RED). `applyOneEvent`'s default branch
  treats any unbranched kind as a whole-file overlay and CRASHES on `userModified` (no `byLine`) —
  the explicit dispatch branch must precede it. The two tracker RED tests failed via this exact crash.
- **Indent / deep-nesting hook is real and per-file.** A whole NEW file written all-4-space is
  detected as unit-4 and is safe. Adding 4-space code (esp. fixture arrays at 8 spaces) INTO an
  existing 2-space-dominant file trips the "2-space-unit deep-nesting (>3x)" hook, AND can tip the
  file's detected unit so PRE-EXISTING 4-space blocks get flagged too. Resolution used: source
  additions = 4-space FLAT ISLANDS (no nested blocks); tests added into 2-space files = match 2-space;
  the T6 tracker tests went into a NEW 4-space sibling file (also kept the verdict file ≤250).
- **Semantics are UNCONFIRMED** — does `userModified:true` mean a PRE-edit change (already recovered
  by `originalFile`) or a POST-edit change? Built defensively. **REOPEN TRIGGER:** when the first
  real `userModified:true` record appears, check whether its `newString` matches the NEXT
  observation's `originalFile`/read to settle pre- vs post-edit timing before trusting the drift.
- The roadmap brief's "e2e conflicts=233" is STALE (pre-item-12). Current number is **8**.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. Use the exact command block in
`plans/handoff-develop-20260617-2010.md` § How to Verify (full-suite one-liner; detect-rewinds;
probe A/B vs `develop-baseline` `a8947fc` on the FROZEN fixture
`~/Programming/jot-recovery/probe-fixture-20260615/projects`; `plate_summary.py` e2e against
`~/Programming/jot-recovery/claude-data`; `wc -l` cap check). Expected for item 18 (dormant,
tracker-only): full suite **71/705/0**, detect-rewinds 15/15, plate **247/247 conflicts=8**
UNCHANGED, probe **`identical: true`** (NO re-baseline), every touched `api/` file ≤250. NEVER run
the probe against live claude-data (self-contaminates).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
