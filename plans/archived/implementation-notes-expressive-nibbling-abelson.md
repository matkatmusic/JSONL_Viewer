## 2026-06-27:10:34:00 — Close two recoverable engine gaps (s28, s40/s41)
Chat title: expressive-nibbling-abelson
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/a758186f-1a25-4103-a626-e3664f7308bd.jsonl

### References

/Users/matkatmusicllc/.claude/plans/expressive-nibbling-abelson.md (the plan being implemented)
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260626-2045.md (prior handoff)
/Users/matkatmusicllc/Programming/jot/skills/implement/templates/Implementation-notes.md (notes template)

### Design decisions

- **Scenario tests use discovery, not hand-construction.** All three new tests
  (`test_checkScenario_reports_every_step_passes_for_{s28,s40,s41}`) obtain their `CoveredScenario`
  through `listCoveredScenarios().find(id)` via a local `discoverScenario` helper, rather than the
  s19 control's hand-built `{ jsonlPaths: [new Path(S19_JSONL)], ... }`. The plan mandated discovery
  for s40/s41 (git-baseline, baseline session must not be hand-excluded); I used it uniformly for s28
  too — simpler, reproduces the sweep exactly, and the existing `S28_JSONL` fixture constant is left
  unused rather than added to (it already existed; plan's "add if absent" was moot).

- **`reconstruction_sidecar.ts` 250-line split.** Adding `backupAfterWriteFor` pushed the sidecar to
  275 lines. Per the project's "split, never condense" rule I moved the three pure-IO reader-factory
  functions (`createSidecarReader`, `getDefaultFileHistoryRoot`, `findSessionId`) into a new sibling
  `src/reconstruction_sidecar_reader.ts` (the cleanest cut — pure disk/path IO, no dependency on the
  timeline internals; removing it also dropped the now-unused `node:fs`/`node:os` imports). Sidecar is
  now 249 lines. All 7 importers (cli + coverage_sidecar + 5 test files) repointed directly at the new
  module — no forwarding re-export (per the project's no-forwarding-layers rule). The `BackupReader`
  TYPE stays in `reconstruction_sidecar.ts`; the reader module imports it one-way. No new test for the
  moved trivial wrappers (covered by the many tests that import them).

### Deviations

- **s28 reversal needed a guard the plan flagged as a contingency, and it fired.** With
  `reversedEditBaseSeed` wired as the primary stale-base seed, **s25 regressed** (9/9 → 8/9 on
  `geo_report.py`): reversal fired where the existing m6-style after-fallback was already correct.
  Applied the plan's Step-1.4 contingency guard verbatim in spirit: reverse ONLY when an at-or-before
  backup also exists AND its content differs from the reversed base (the rename-between-backups
  signature unique to s28 — at/before is the stale pre-rename version). s25's `geo_report.py` has no
  at-or-before backup (after-only), so the guard skips it. Result: s28 8/8 GREEN, s25 restored to 9/9,
  full stale-edit watch-list (s19/s20/s23/s45/s50/s51/s24/s26/s27/s29-s33/s37) all OK.

### Tradeoffs

- The reversal guard calls `backupSeedWriteFor` a second time (once inside the guard, again in the
  fallback path when reversal is skipped). Cheap (timeline rebuild is in-memory) and keeps the guard
  self-contained; not worth threading the at-or-before result through.

### Open questions

- None blocking for Phase 1. Phase 2 (s40/s41) is the higher-risk shared-stage change and is sequenced
  next per the plan; will trace before editing.

### Phase 2 trace findings (Step 2.1 — recorded before any edit)

**s40 (RECOVERABLE).** orders.py lineage: 2 writes → Edit `toolu_01CRtnU7…` (04:05:08.176, hunk
old@6: inserts `def subtotal`) → user-edit echo (04:05:13). Two distinct backups:
- @v1 04:05:08.222 = **12-line reviewed-only** (no subtotal, no checked).
- @v2 04:05:14.350 = 18-line reviewed+checked+subtotal.
Stage firing: `completeElidedBeacons` (adopts @v2). Ground-truth steps:
- step-4 = @v1 (12-line reviewed-only).
- step-5 = 18-line **reviewed-only WITH subtotal** = the subtotal Edit replayed on the @v1 reviewed base.
- step-6 = @v2 (18-line reviewed+checked) — currently produced.
The subtotal Edit's hunk (context lines 6-8 `return sum`,blank,blank → `def names`) splices CLEANLY on
@v1. So s40 is fully recoverable by emitting @v1 reviewed-only as a revision timed BEFORE the subtotal
Edit (04:05:08.176; @v1's backup stamp .222 is 46ms after, so it needs re-timing — plan Step 2.3).

**s41 (NOT RECOVERABLE — plan premise is wrong).** orders.py lineage: 2 writes → Edit `toolu_01JnqXrT…`
(04:13:38.955, hunk old@9: inserts `def subtotal`; its CONTEXT lines already include both
` # reviewed by ops` AND ` # checked`). Two distinct backups:
- @v1 04:13:39.002 = **13-line reviewed+checked** (no subtotal).
- @v2 04:13:44.029 = 18-line reviewed+checked+subtotal.
Stage firing: `seedStaleEditBases`. Ground-truth step-4 AND step-5 both want a **12-line reviewed-ONLY**
state (no checked). That state is in NO backup (both carry checked), NO echoed user-edit (s41 has none),
and NO Edit originalFile (the only Edit's context already carries checked). It was coalesced out of every
input — a transcript-information gap (the plan's own §Context out-of-scope category), MISCLASSIFIED as a
recoverable engine gap. Recovering it would require fabricating reviewed-only by stripping `# checked`
off @v1 with no evidence of append order — which the plan forbids ("Never fabricate").

**Consequence:** the plan's shared "@v1=reviewed-only / @v2=reviewed+checked" model holds for s40 only.
s41 step-4/5 cannot be made green without fabrication. Paused here to confirm direction with the user
(see Open questions) before the higher-risk shared-stage (completeElidedBeacons) change.

### Phase 2 implementation — DEVIATED from the plan's locus (lower risk)

User decision (asked & answered): **implement s40 only, defer s41** as expected-unreproducible.

The plan's Phase 2 wanted to emit the distinct intermediate backup inside the shared
`completeElidedBeacons` stage (Step 2.2) plus re-timing (Step 2.3) — a high-blast-radius change to a
stage ~15 scenarios depend on. The `originalFile` evidence showed a cleaner root cause: **s40 is an
s34-twin** — an Edit (`def subtotal`) whose hunk context matches the reconstructed base (so
`editBaseIsStale` is FALSE) but whose real pre-edit disk carried a TRAILING append (`# reviewed by ops`)
outside the hunk window. The existing `outOfWindowEditSeed` (s34) already handles exactly this; it only
looked at the at/before file-history backup, and s40's reviewed append was snapshotted 46ms AFTER the
Edit, so no at/before backup held it.

**Two failed approaches before the right one (recorded so nobody retries them):**
1. *Strictly-after backup as the second candidate* — over-fired catastrophically (s28 8→7, s25 9→5,
   s34/s56/s62/s64 worse): for many edits the first later backup coincidentally extends the base. The
   after-backup is an unreliable proxy for pre-edit content. Reverted.
2. The fix that worked: seed from the **Edit's own `originalFile`** — the exact pre-edit content, no
   timing guess, cannot false-match a later state. Added `originalFile?: string` to `EditEvent`
   (`reconstruction_engine.ts`), threaded it through extraction (`reconstruction_extract.ts`: the
   per-tool_use map now carries `{hunks, originalFile}`), and made `outOfWindowEditSeed` try the at/before
   backup THEN `originalFileSeedFor(event)`, each forward-validated identically (must EXTEND the base by a
   trailing append AND the hunk must still splice). `seedBeforeEdit` re-times the seed to just before the
   Edit, so the reviewed append becomes its own revision (step-4) AND the subtotal Edit replays on it
   (step-5). NO change to `completeElidedBeacons` at all.

**Extraction-threading regression caught & fixed:** wrapping the hunks in a truthy `{hunks, originalFile}`
object meant an Edit result lacking `structuredPatch` (previously dropped, hunks-falsy) became a hunkless
edit → `firstHunkMatchesBase` crashed s23. Restored the drop by guarding the map `set` on
`result.structuredPatch` being present.

### Deviations (additional)

- **Locus:** s40 fixed in `reconstruction_reseed.ts::outOfWindowEditSeed` (s34 family), NOT the plan's
  `completeElidedBeacons` shared stage. No `reconstruction_beacons.ts` change at all (plan listed it).
- **New EditEvent field + extraction threading** (`reconstruction_engine.ts`, `reconstruction_extract.ts`)
  — not in the plan's "Files touched", required to surface `originalFile` to the seed logic.
- **s41 deferred** as expected-unreproducible (the plan classified it recoverable; evidence shows its
  reviewed-only intermediate is coalesced out of every input). Joins s34/s35/s38/s42/s43/s44 as a known
  out-of-scope FAIL.

### Verification (final)

- `OK s28 8/8`, `OK s40 9/9`. Full sweep: **65/72**; the 7 FAILs are exactly the known out-of-scope set
  (s34, s35, s38, s41, s42, s43, s44). **Bonus:** s42 14→15 and s43 14→16... (s42 15/16, s43 15/16) —
  each improved +1 step from the originalFile seed; nothing previously-passing broke.
- Scenario regressions: NONE. Unit-test regressions: NONE (diffed current vs clean-HEAD fail-sets;
  `comm -13` empty — no test that passes at HEAD fails with these changes).
- `npx tsc --noEmit` clean. Every edited file ≤250 lines (sidecar 249 after the reader split; extract 250).
- Pre-existing unit failures (~29: `test_evaluateLine_*`, `test_create_revision_*`, `reconstruct_all`,
  etc.) fail at clean-HEAD too — accumulated suite drift from prior WIP, unrelated to this task. The
  plan's "pass 228 / fail 6" baseline was stale.

### Status

- Phase 0 (red tests): DONE.
- Phase 1 (s28 edit-reversal): DONE — s28 8/8 GREEN.
- Phase 2 (s40 out-of-window originalFile seed): DONE — s40 9/9 GREEN; s41 deferred (user-approved).
- Nothing committed (per plan — user makes all commits).

### Open questions

- **s41 recording:** I left s41 as a plain coverage FAIL (like the other known out-of-scope ones). If you
  want it formally marked "expected-unreproducible" somewhere (e.g. the coverage ledger or a skip-list),
  tell me where and I'll add it.
- The ~29 pre-existing unit-test failures are out of this task's scope but real. Want a separate pass to
  triage them, or leave them?
