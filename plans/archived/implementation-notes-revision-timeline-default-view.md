# Implementation notes — Revision Timeline as the Default Session View

## 2026-07-04:16:20:00 — Kickoff, baseline, node-ordering decision
Chat title: Revision timeline default view — implementation
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/b6550a1c-2865-416f-a3d4-96507832f96a.jsonl

### References

/Users/matkatmusicllc/.claude/plans/reveng-revision-timeline-default-view.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260704-1408.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/revision-timeline-mockup.html
/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/memory/jfred-revision-timeline-requirements.md
/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/1bcfca8c-f402-4ea9-ace8-31c0b6c1952d.jsonl (planning conversation)

### Design decisions

- 2026-07-04 16:18 — Node ordering for interleaved multi-agent sessions: user confirmed
  **strictly chronological** with a session-header row at every consecutive sessionId change
  (the open question from the handoff). Plan Phase 3.1 executes as written.
- 2026-07-04 17:05 — Patch path relativization (spec gap): step-snapshot file keys are ABSOLUTE
  paths, but a git-apply-able patch needs repo-relative ones. `computePatchRoot(document)`
  (exported from `src/viewer_api.ts`) strips the longest common directory prefix across every file
  any step tracked — in practice the session cwd. Deterministic per document; ponytail comment
  notes the multi-root ceiling.
- 2026-07-04 17:05 — Patch hunks are whole-file replacements (all old lines −, all new lines +).
  Valid unified diff, `git apply` accepts it, byte-exact round-trip proven by the acceptance test
  (including `\ No newline at end of file` handling). No LCS emitter until patch size matters.
  `renderDiff`'s custom `@@ … @ stamp @@` headers were confirmed not apply-compatible, so the plan's
  contingency (separate minimal emitter `renderGitFileDiff` in `reconstruction_render.ts`) applied.

### Deviations

- 2026-07-04 17:20 — `/api/range-patch` additionally honors `declined=1` (not in the plan's param
  list): without it, a user who declined script consent sees a degraded timeline but would get a
  consent-required body instead of a patch on export. Mirrors `/api/document`'s exact contract.

- 2026-07-04 16:40 — Phase 1.2 test relaxed vs. plan. The plan's test asserted EVERY step's
  `sessionId` is a Uuid, but s84 reality has 1 of 8 steps whose only changeId is a re-stamped /
  off-branch synthetic id (matches no tool_use block; its `changedPaths` hint is `[]`). The plan's
  own implementation note says such steps stay `undefined` — the test now asserts session
  attribution only for steps whose changedPaths resolve, plus ≥2 distinct sessions. Timeline UI
  treats `undefined`-session nodes as unattributed (no session header of their own).
- 2026-07-04 17:10 — Phase 2.1 rename test reshaped: s85's moves are modeled by the engine as
  destination CREATIONS with sources persisting (no `rename` revisions exist in s85's document,
  consented or not; step snapshots show one.py AND core_one.py coexisting at the end, and 85/85
  coverage certifies that as disk truth). The plan's "removals for the sources" assertion is
  impossible against document state — the test asserts destination creation hunks and that
  untouched originals get no diff block. CONSEQUENCE for Phase 3: the plan's
  `test_timeline_file_changes_carry_event_kinds` (rename chip with `renamedFrom`, asserted on s85)
  must use a real rename scenario instead (s2-move-file / s47-mv-rename family).
- 2026-07-04 16:25 — Phase 0: `resolveScenarioDir(roots, dirName)` takes the roots as a parameter
  instead of the plan's single-arg form — `SCENARIO_ROOTS` (data) stays in `tests/fixtures.ts`, the
  generic function lives in `tests/utilities.ts`, and no fixtures↔utilities import cycle is created.



### Tradeoffs

- Whole-file-replacement hunks over an LCS diff emitter: bigger patches, dramatically less code,
  and byte-exact correctness proven by the `git apply` round-trip test. Upgrade path noted in a
  ponytail comment in `reconstruction_render.ts` if patch size ever matters.
- Webapp wire-string literals (`"user"`, `"edit"`, node kinds) over importing the TS vocabulary:
  the browser cannot load `src/structures/vocabulary.ts` (only `webapp/` is served), and this
  matches every existing webapp view. The TS tests bridge the gap by asserting against the real
  enum members (whose values ARE the wire strings).
- File preview renders inline under the node row (per-row expandable pane) rather than the
  mockup's fixed right aside: the webapp's right pane is the transcript inspector
  (`#inspector`), and stacking both would need new layout machinery. The inspector keeps its
  existing role (step JSON); file state / range diff live under the row.
- Smoke gates ran on port 7345, not the plan's 7343: 7343 is held by the user's running viewer
  from another session (node pid 75824) and killing it was not acceptable.

### Verification (all gates green, 2026-07-04 ~18:00)

- `npm test`: 400/400 (baseline was 381; 19 new tests across 3 new test files).
- `npm run typecheck`: clean.
- `npx tsx scripts/check_scenario_coverage.ts`: 85/85.
- Browse smoke (scratch projects dir with s84+s85 copies, declined-consent path):
  - A: drawer JSONL click lands on `#/…/timeline/session/<jsonl>`, node rows render.
  - B: commit rows have no checkbox; a straddling pick is reverted and the
    "picks must be contiguous — commits are hard stops" flash shows.
  - C: contiguous pick shows "2 steps picked · 1 file"; `/api/range-patch` → HTTP 200,
    non-empty `diff --git` body.
  - D: s84 timeline shows 3 session headers and distinct rail lane colors
    (accent, green, muted-unattributed).
  - E: step click opens the transcript inspector on the correct JSONL line (35/191).
  - F: zero console errors across all gates; no UnmodeledFieldError.
- Note: with consent DECLINED the s85 document degrades to 7 steps (script-derived revisions
  absent) vs 10 consented — expected engine behavior, the timeline just renders what the
  document holds.

### Open questions

- None blocking. Two low-stakes calls made without asking (flagged here for review):
  the `declined=1` passthrough on `/api/range-patch`, and the inline-under-row file preview
  in place of the mockup's fixed aside (see Tradeoffs).
