## 2026-07-20:13:45:00 — Task 56: pre-baseline reconstruction question UI
Chat title: tackle-tasks 56 (pre-baseline question UI + demo fixture)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/fcfc3625-078e-4375-9e09-289c0f3ad35f.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task56-pre-baseline-question-ui.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item46-custom-data-source-paths.md

### Design decisions

- (from planning) The question protocol mirrors the script-consent gate exactly:
  NDJSON terminal `kind: "baseline-question"` → dialog → sessionStorage `baseline:<project>`
  choice → `preBaseline=1|0` query param. Baseline question is asked BEFORE the consent
  gate (scope-of-work decision precedes run-scripts decision; needs no record scan).
- (from planning) "Engine may skip" is implemented as the replay trim inside
  `seedBaseCommitBeacon` (drop events at-or-before the beacon's insertion point when the
  choice is "No"); script-execution stages still run — the task grants "may".
- (mid-session user requirement) A clone-ready `demo-baseline/` bundle demos the feature;
  the original scenario repos are gone from the temp dirs, so the fixture repo is
  recreated with a back-dated commit (`GIT_COMMITTER_DATE`).

### Deviations

- 2026-07-20: `reconstructPreBaseline` became a TRAILING DEFAULTED parameter of
  `buildDocumentWithConsent`/`buildReconstructionWithConsent` (default `true`) instead of
  the plan's positional insert before `onProgress` — ~25 existing test call sites pass the
  sink as the 4th positional argument and would all have needed edits; the default also
  guarantees every pre-existing caller keeps today's behavior.
- 2026-07-20: the timeline filter drops ALL node kinds (turns, tool calls, commits) before
  the baseline node's instant, not only turns — "first shown step is the baseline commit"
  reads as the whole timeline, and filtering the sorted node list before step numbering is
  one function instead of per-kind logic.
- 2026-07-20: `reconstruction_json.ts` was already over the 250-line cap before this task
  (task-119 precedent); the `preBaselineSkipped?` field adds 3 net lines. Every other
  touched file is at or under the cap (`details-diff.ts` sits exactly at 250).

### Tradeoffs

- Module-level flag (exec-gate precedent) instead of threading a parameter through the
  reconstruction stages: builds are synchronous and serialized; the flag is set/reset in
  the same try/finally as the exec gate.
- Demo fixture recreates the baseline repo with back-dated commits
  (`GIT_COMMITTER_DATE=2026-07-17T23:44:05Z`, hash
  `3802acbd0a0e4aca111ab27cf503471de8cd5633`, session ee3482f5, `inventory.py` rev 2 of 5)
  because every original scenario temp repo is gone; the recreation recipe is in
  `jfred/demo-baseline/README.md`.

### Open questions

- Choosing "No" still runs the script-execution stages over pre-baseline records — the
  task text grants "may skip", so only the per-target replay is trimmed. Extend the skip
  into the script stage if that ever matters.
- There is no UI to revisit a stored pre-baseline answer short of a new tab / server
  relaunch (exactly the consent dialog's existing limitation). Say the word if you want a
  "re-ask" control on the timeline header.

### Follow-up (user request, 2026-07-20 ~2:15 PM)

- Git-derived-baseline timeline entries used to fall into the item-47 no-hunk fallback —
  the details pane read "@@ overwritten @@ (no content change in this revision)". Now they
  render the task-126 unrecoverable-placeholder pattern: a `.recon-banner` ("Git-derived
  baseline — content seeded from base commit <hash>"), a provenance note, and the
  revision's full committed content, syntax-highlighted (derived client-side from the
  revision's own wire `lines` — no fetch). New `webapp/views/details-baseline.ts`
  (`showGitBaselineInDetails`), branched at both callers (`details.ts` chip path,
  `details-revision-view.ts` rev-card path). Pure helpers `checkChangeIdIsGitBaseline` +
  `extractGitBaseCommitHash` live in `details-model.ts` — NOT timeline-changes.ts (over
  the 250 cap) and NOT file-history-model.ts (import cycle via GIT_BASE_CHANGE_ID_PREFIX);
  2 new RED-first tests in `tests/timeline-changes-baseline.test.ts` (own file to keep
  timeline-changes.test.ts under the cap).

### Verification

- RED phases confirmed by the project's on-edit test hook (missing-export failures for
  `setPreBaselineReconstructionAllowed`, `decideBaselineQuestion`, and the timeline-filter
  assertion) before each GREEN implementation.
- `npx tsc --noEmit` and `npm run build:webapp` both pass. `npm test` NOT run, per your
  instruction — 7 new tests across 3 files await your run.
