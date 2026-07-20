## 2026-07-19:00:15:00 — Task 119: partial reconstruction (engine + webapp)
Chat title: partial-reconstruction-task119
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/bfabfade-93b5-4a9f-8418-b081acab6151.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/partial-reconstruction-task119.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/partial-reconstruction-ui-mockups.html
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md

### Design decisions

- 2026-07-19 Failure collector is a module-level always-on sink (`jfred/src/reconstruction_health.ts`) mirroring `reconstruction_provenance.ts`, instead of threading a collector through 13 stage signatures — entries are pushed only on failure so there is no hot-path cost, and the stage chain's signatures stay untouched.
- 2026-07-19 Parser skips ride a changed `loadTranscript` return shape (`{ records, skippedLines }`) rather than the health sink, because the viewer caches parsed records per transcript-set stamp — skips discovered at parse time must live in that cache or the banner would vanish on warm rebuilds.
- 2026-07-19 Unrecoverable revisions are placeholder `FileRevision`s that carry the previous revision's lines forward (like a rename), so later events still replay against believed state; per-revision granularity comes from the placeholder existing in the revisions array with an `unrecoverable: { reason }` tag.
- 2026-07-19 Banner counts revisions (per task's per-revision granularity), not "steps" as the mockup's sample text showed.

### Deviations

- 2026-07-19 `UnsupportedEventKindError` no longer crashes replay — it becomes a placeholder revision. The fog-of-war signal moves from "crash" to "visible unrecoverable revision + coverage-ledger FAIL". Existing tests asserting the throw are rewritten accordingly.
- 2026-07-19 No "show gaps" interactive panel on the banner (mockup A hinted one); failure reasons go in the banner's native title tooltip. Gap rows / strips / popovers already show every gap in place.
- 2026-07-19 Coverage strip renders only on files with at least one unrecoverable revision (mockup C showed it on every file) — real files can have 100+ revisions; a strip on every row is noise.

### Tradeoffs

- 2026-07-19 Warm-cache limitation accepted: per-file revision memos are cached per records-array, so a warm rebuild re-reports per-revision flags (cached in the revision objects) but not stage-failure notes; the viewer also caches the built document per stamp, so the first real build's failures are what users see.
- 2026-07-19 CLI strict parsing kept strict (skips are viewer/tolerant-mode only) — the crash-on-unknown-type guard is how new CC wire formats get noticed during scenario development (s87 precedent).

### Implementation deviations & notes (post-build)

- 2026-07-19 The plan's grep scope for `loadTranscript` callers missed `scripts/check_scenario_coverage.ts`; it was updated too (same tsconfig include — typecheck would have failed).
- 2026-07-19 250-line-cap splits made during implementation (jot hook feedback is invisible to subagents, so the orchestrator did these): `src/parse/recordKeys.ts` (allow-set + `UnmodeledFieldError` + `findUnmodeledTopLevelKeys` out of `loadTranscript.ts`), `tests/loadTranscript-tolerant.test.ts` (the 4 new tolerant tests), `tests/recordKeys.test.ts` (the field-gate tests + observed-field samples), `tests/reconstruction_json_health.test.ts` (the 2 new document tests). `webapp/views/reconstruction-render.ts` is the Phase 6 agent's own split for the new DOM helpers.
- 2026-07-19 `src/reconstruction_branches.ts` (268) and `src/reconstruction_json.ts` (256) exceed the 250 cap ONLY because the replaced stage/phase lines are retained as `// task 119:` comments per the comment-out-don't-delete rule; live code is under the cap. Delete the comments after the user confirms the new code, and both drop below 250.
- 2026-07-19 `.cov-popover` renders in flow (margins) instead of the plan's `position: absolute` — the sidebar has no positioned ancestor and `.file-item` clips absolute children; the mockup itself is in-flow.
- 2026-07-19 Missing rev-cards keep their range-toggle pushed into `rangeToggles` (unrendered) so toggle indexes stay card-aligned; the range toggle and diff-swap click remain active on missing cards, but the 5-button action row is replaced by the reason line.

### Open questions

- Should the CLI (`--json`) also expose a tolerant mode flag? Strict parsing was deliberately kept (fog-of-war guard for scenario development); say the word if you want a `--tolerant` CLI switch.
- Missing rev-cards still respond to a click by showing the (carried-forward) diff — harmless but arguably it should show the reason instead. Confirm or I'll leave as-is.
