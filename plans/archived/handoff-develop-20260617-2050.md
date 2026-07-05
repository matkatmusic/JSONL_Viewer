# Handoff: Roadmap Item 18 (first-class user-edit tracking via `userModified`) — PLANNED, ready to implement
Conversation name: plan RevEng item 18 — userModified user-edit tracking

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`, UNCHANGED this session — this was a
PLANNING session, no code written. Working tree is UNTRACKED by design (`git status --short` → many
`??` entries + a pre-existing unrelated `M .gitignore`, 2 insertions). This project commits nothing
during normal work; the committed source mirror lives on **`develop-baseline`**, currently
**`a8947fc`** (item-15 re-baseline: "PASS_PER_LINE probe status"), UNCHANGED this session. Run ALL
git + tests from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd
`…/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the JSONL), NOT a git repo.
`RevEng/` (CONSUMER) is the git repo.

## Goal
Item 18 (§A — the LAST open roadmap item; items 1–17 + 10a are all `[x]`). Claude Code stamps
`toolUseResult.userModified: true` on an Edit/Write when an external actor (user in the IDE, a
formatter, a hook) changed the file around the edit — a DIRECT signal that belief diverged from disk,
and the upstream cause of item 11's `floatingOverKnownRegion` symptom. Today it is DROPPED at
extraction (0 consumers, verified). Item 18 adds a CONTENTLESS `userModified` event kind that emits
one diagnostic conflict record AND conservatively un-proves EOF.

## Current State
**Item 18 PLANNED, not started. No code written.** Going-in gate state (measured at item-17 done,
per `plans/handoff-develop-20260617-2010.md` — re-measure before starting):
- Full suite: **69 suites / 690 passed / 0 failed**.
- detect-rewinds: **15/15**.
- Sidecar e2e (`plate_summary.py`): **247/247 matchedObserved, 0 mismatched, conflicts=8**.
- Probe A/B vs `develop-baseline` (`a8947fc`): **`identical: true`**.
- Cap-pinned files: `api/edit-stream-extraction.js` and `api/file-events-extractors.js` are BOTH at
  exactly **250** (item 17 trimmed them to cap). Item 18 edits to them MUST be net-zero.

## What Remains
Implement the approved plan via strict red-green TDD, in this order (full detail + code snippets in
the plan file):
1. **T0** — `tests/test-helpers.js`: add an optional trailing `userModified` param (default `false`)
   to `makeEditLine`/`makeCreateLine`/`makeUpdateLine` (replaces the hardcoded `userModified:false`
   at :79/:63/:94).
2. **T1** — Capture: net-zero append `userModified: tr.userModified || false` onto `buildReplaceEdit`
   AND `buildCreateOrUpdateEdit` in `api/edit-stream-extraction.js` (append to each builder's existing
   return line — file is at 250). Tests in `tests/test-edit-stream-extraction.js`.
3. **T2** — Register: add `'userModified'` to `KIND_NAMES` (`api/file-event-kinds.js:23`). Run the
   FULL suite and fix the mechanical `userModified:null`-on-every-event golden ripple (same as items
   2–5).
4. **T3** — Emit: NEW `api/user-modified-events.js` (`buildUserModifiedEvent` +
   `userModifiedEventsFromEdits` + a local `timestampAt`), gated on `edit.userModified === true` (ALL
   edit kinds, NOT `type==='edit'`), `jsonlLine = edit.line + 1`. NEW
   `tests/test-user-modified-events.js`.
5. **T4** — Wire emission into `api/file-events-extractors.js` via a net-zero `.concat(...)` on the
   existing `originalFile` push (`:220`) using an inline lazy `require('./user-modified-events')`.
6. **T5** — Materialize: `materializeUserModified` + one dispatch line in `api/line-state-evidence.js`
   `materializeEvent` (`:169-178`). Contentless → returns `{kind, observedText, ref}`, NO `byLine`.
   Do NOT add tests to `tests/test-line-state-evidence.js` (at 241, would breach cap).
7. **T6** — Apply + drift + record: add+export `unproveEof(belief)` in `api/line-belief.js`; add
   `buildUserModifiedConflictInfo` + a dispatch branch (`lb.unproveEof(belief); return [info]`) BEFORE
   the `readFull/cat` fallthrough in `api/apply-one-event.js`; generalize the `appendConflictRecords`
   branch in `api/track-line-states.js` to a truthy-`kind` check (reuses `buildFloatingConflictRecord`).
   Tests mirror item 11's two tests in `tests/test-track-line-states-verdict.js` + a drift + ordering
   assertion.
8. **Gates** — full suite GREEN; detect-rewinds 15/15; `plate_summary.py` 247/247 conflicts=8
   (UNCHANGED — dormant); probe A/B `identical: true` (NO re-baseline); every touched `api/` file
   ≤250.
9. **Close-out** — write `plans/implementation-notes-item18-usermodified.md` (use `/jot:implement`),
   flip roadmap item 18 to `[x]` with a DONE summary, write a completion handoff via
   `/jot:handoff-prompt`.

## Key Files
- **Plan (authoritative): `~/.claude/plans/ticklish-finding-anchor.md`** — read this FIRST; it has the
  touch map, exact 4-space flat-assignment code snippets, net-zero edits, and the TDD sequence.
- `plans/roadmap-100-percent-reconstruction.md` — item 18 brief at lines 244–283; § Constraints at
  ~687 (250-cap, red-green, single-condition, archive rules).
- `api/edit-stream-extraction.js` (250, AT CAP) — `buildReplaceEdit:52` / `buildCreateOrUpdateEdit:47`.
- `api/file-events-extractors.js` (250, AT CAP) — `buildOriginalFileEvent:116-144` is the emission
  template; push site `:220`.
- `api/apply-one-event.js` (143) — `buildFloatingConflictInfo:33-42` is the diagnostic template;
  dispatch in `applyOneEvent` (fallthrough at `:135`).
- `api/track-line-states.js` (179) — `kindRank:18-24`, `compareEvents`, `buildFloatingConflictRecord:88-101`,
  `appendConflictRecords:127-135`.
- `api/line-belief.js` (238), `api/line-state-evidence.js` (227), `api/file-event-kinds.js` (50).

## Plan File
`~/.claude/plans/ticklish-finding-anchor.md` (approved this session). Per-item RevEng plans live in
`~/.claude/plans/` (same convention as items 13/14/16/17); `RevEng/plans/` holds handoffs/notes/roadmap.

## Context the Next Agent Won't Have
- **Two design forks were DECIDED WITH THE USER (do not re-litigate):** (1) tracker behavior =
  **option (b) record + conservative drift** — emit the diagnostic record AND `eofConfirmed = false`
  (NOT the roadmap's default option (a) record-only); (2) emission scope = **all edit kinds** — fire
  for Edit AND create/update/Write (NOT edit-type-only like `originalFile`). The plan's snippets
  already reflect both.
- **Ordering is load-bearing for option (b).** The authored-edit event, the `originalFile` event, and
  the new `userModified` event all share `jsonlLine = edit.line + 1`, so `compareEvents` orders them
  by `kindRank`: **originalFile(0) → edit(1) → userModified(2-fallthrough)**. The drift must land on
  POST-edit belief, so **do NOT add a `userModified` case to `kindRank`** — it must stay the rank-2
  fallthrough. A T6 test asserts post-edit application.
- **The contentless fallthrough is a trap.** `applyOneEvent`'s default branch (`:135`) treats any
  unbranched kind as a whole-file overlay and would crash on `userModified` (no `byLine`). The
  explicit dispatch branch MUST be added before it.
- **The materialize ref anchor differs by record kind:** Edit → `toolUseResult.newString`;
  create/update/Write → `toolUseResult.content`. `materializeUserModified` picks via a single
  `typeof newString === 'string'` check.
- **`userModified:true` is DORMANT** (0× across frozen fixture + live `~/.claude/projects` + plate) →
  build with SYNTHETIC tests only; e2e conflicts stay 8, probe stays byte-identical. **Semantics are
  UNCONFIRMED** (pre-edit vs post-edit change) — record the reopen trigger (when the first real
  `userModified:true` appears, check whether its `newString` matches the NEXT observation's
  `originalFile`/read) in the implementation-notes file before trusting the drift on real data.
- **New code = global 4-space flat-assignment islands** (e.g. `var x = {}; x.f = …;`), NOT multi-line
  object literals — a 4-space multi-line literal trips the 2-space-unit deep-nesting hook. Mirror item
  11's `buildFloatingConflictInfo` / `buildFloatingConflictRecord` (both are 4-space islands inside
  2-space files).
- The roadmap brief's "e2e conflicts=233" is STALE (pre-item-12). The current number is **8**.
- A stray non-plan file `~/.claude/plans/contentless-event-kinds-analysis.md` was written by a
  read-only research agent during planning — it is NOT part of this work and can be deleted.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. Use the exact command block in
`plans/handoff-develop-20260617-2010.md` § How to Verify (full suite one-liner; isolated suite;
detect-rewinds; probe A/B vs `develop-baseline` `a8947fc` on the FROZEN fixture
`~/Programming/jot-recovery/probe-fixture-20260615/projects`; `plate_summary.py` e2e against
`~/Programming/jot-recovery/claude-data`; `wc -l` cap check). Expected for item 18 (dormant,
tracker-only): full suite GREEN, detect-rewinds 15/15, plate 247/247 conflicts=8 UNCHANGED, probe
`identical: true` (NO re-baseline), every touched `api/` file ≤250. NEVER run the probe against live
claude-data (self-contaminates).
