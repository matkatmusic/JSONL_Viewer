# Open Task List — develop branch

Compiled 2026-07-04 from the day's handoffs (`plans/archived/handoff-develop-20260704-*.md`),
reconciled against repo state at HEAD `b79cf1b`. Closed handoffs: 14:08 (timeline
plan → shipped `b3b11fa`), 20:52 (build-cache plan → shipped `f6d2852`).

Audited 2026-07-04 against ALL 94 handoff documents in `plans/archived` (June 3 – July 4):
every "What Remains" item is done, tracked below, deferred-by-design, or obsolete
(frozen legacy island: `jfred/`, `web-shared/`, `api/`, `diff/`, `unified/`, `viewer/`).
The audit surfaced items 15–17 below. Excluded as not-actionable: bash-read/grep
timestampless unification (theoretical, `api/`), `docs/engine-b-overview.md` update
(optional, frozen island), consent-dialog read-only whitelist (speculative), replay-engine
npm extraction (speculative), item-6 spike files (closed NON-VIABLE diagnostic), roadmap
`cp` sub-item (documented deferral in `plans/archived/roadmap-100-percent-reconstruction.md`).

Updated 2026-07-07: items 5, 6, 9 shipped; Phase B gitOperations fully shipped end-to-end
(engine + viewer + tests — commits `4a8c675`, `de15df8`; `GitOperationKind` enum,
`findGitOperations` extraction, timeline git rows with `{ }` inspector buttons, commit
hard-stops; 467 tests / 466 pass / 1 pre-existing s85 failure is healthy baseline).
Scenario coverage 84/85 (s85 FAIL 3/10 — item 15 still open). New items 18–27 added.
Handoffs and pre-today implementation-notes archived.

## Done

- [x] **1. Commit staged jfred-claude-scenarios submodule migration** — committed as `f5d43b5`.
- [x] **3. Verify check_scenario_coverage.ts post-submodule** — 85/85 through the `scenarios/` submodule (verified 2026-07-04).
  Now 84/85: s85 regressed to FAIL 3/10 (see item 15).
- [x] **5. Clickable file-history revision snapshots** — shipped across `380033b`, `2b538d2`,
  `685a754`. Per-file `{ }` and `+/-` buttons, side-drawer file previews,
  `computeAnchoredRevisionIndex` with `/rev/<n>` and `/vsbase/<n>` route params.
- [x] **6. Clickable JSONL lines in the loading console** — shipped `827fa3f`, `92f9764`.
  xterm source-link tokens navigate to timeline via `routeToTimeline`; clickable per-line
  parse output replayed on cache hits.
- [x] **9. Design conversation: Timeline of Revisions v0.1 presentation** — shipped `3d3b51d`
  as turn-based SMS-style conversation timeline with numbered prompt/reply/session-end steps.

## Quick close-outs

- [x] **2. Remove stale api-from-scenarios worktree** — `git worktree remove api-from-scenarios`
  (`~/Programming/RevEng-worktrees/api-from-scenarios`, branch merged). Also makes the first
  `SCENARIO_ROOTS` entry in `tests/fixtures.ts:18` permanently dead (harmless fallthrough today).
  Verified gone 2026-07-05: `git worktree list` shows only the main checkout; the
  `~/Programming/RevEng-worktrees/` folder is empty.

## Queued work items (handoff 18:01)

- [ ] **4. Scenario coverage for unhandled JSON fields in real JSONLs** — fields tolerated via the
  field-gate bypass in `buildProjectDocument` (`src/viewer_api.ts:105-108`) / surfaced as
  `UnmodeledFieldError`. Start by grepping real `~/.claude/projects` transcripts.
- [ ] **7. jot repo: `terminal_windowSizeBlocks(s)` enum refactor** — `/Users/matkatmusicllc/Programming/jot`
  (separate repo); `grep -rn "windowSizeBlocks"`. Not a RevEng change.
- [x] **8. Investigate `scripts/coverage_sidecar.ts:43`** — "same @vN blobs have different content":
  real sidecar collision (data-loss risk) or stale note? Failing test if real.
  **Closed 2026-07-08:** the collision is real and already solved. `coverage_sidecar.ts` is fully
  commented out (RETIRED 2026-07-02, no importers); the live fix is owner-keyed blob reads —
  `BackupReader` carries the owning `sessionId` (`src/reconstruction_sidecar.ts:16`, read sites
  155/180/206) and `buildSidecarReader` reads the owner's dir first
  (`src/reconstruction_sidecar_reader.ts:64-71`). Landed 2026-06-26 fixing multi-session
  s56/s59/s64; scenario coverage 85/85 exercises it.
- [ ] **10. Webapp UX smoothing pass** — open-ended; interview user for pain points first.
  Sub-items surfaced from handoffs: (a) inspector `«` rail button is a CSS pseudo-element,
  not keyboard-focusable; (b) text-selection drag over empty timeline background closes the
  inspector; (c) inspector drawer width cramped for conversation reading.

## Approval-gated follow-ups (handoff 22:26)

- [ ] **11. Disk-backed sandbox memo** — persist sha256→outcome across server restarts; the only
  remaining lever on the 7.3s cold s84 load (38 distinct python3 runs + parse).
- [ ] **12. Viewer request-path tab in `engine-pipeline-diagrams.html`** — records/document caches
  currently get one line on the cache_lru node.
- [ ] **13. Cache serialized `JSON.stringify(document)`** — only if reload latency ever shows it
  (ponytail note in `src/viewer_api.ts`).

## Found by the full-handoff audit (2026-07-04)

- [x] **15. Fix s85 git-repo durability** — `readCommittedFileContent`
  (`src/reconstruction_git_evidence.ts:86`) resolves s85's repo via the RECORDED temp cwd and
  silently returns `undefined` when it's gone; temp cleanup will regress s85 steps 4–10. Fall back
  to the preserved repo at `scenarios/executed/s85-git-commit-csv-and-move-scripts/.git`.
  (handoff-api-from-scenarios-20260702-0800, "flagged not fixed".)
  **Status 2026-07-07:** s85 FAIL 3/10 in scenario coverage. git-operations.test.ts passes 3/3
  (extraction works), but the reconstructed file content is wrong because `readCommittedFileContent`
  can't reach the temp repo.
  **Done 2026-07-07:** the predicted regression landed (macOS purged the temp repo's `.git`
  internals — dir survived, `HEAD`/refs gone — surfacing as the s85 "regression" first blamed on
  the Jul-5 engine commits; bisect showed no code change was at fault). `readCommittedFileContent`
  now takes an optional preserved-repo dir, and `placeGitCommitEvidence` derives it from the
  transcript's own directory (`getRecordSource`) when a `.git` sits next to the transcript —
  scenario captures preserve a clone there; live `~/.claude/projects` transcripts don't, so the
  viewer path is untouched. Scenario coverage back to 85/85.
- [ ] **17. GitHub Pages demo tier** — canned ReconstructionDocument JSON + `webapp/` with a
  static-data shim replacing `/api/*`. Deliberately deferred "Phase 4, planned separately when
  reached" (handoffs 20260702-1434/1639, 20260703-1010/2144); needs its own plan when reached.

## New items (2026-07-07)

- [ ] **18. WebApp: convert to TypeScript and add build step** — all 10 webapp files are plain `.js`
  served directly by the node server with no transpilation. Add a build step (esbuild/tsc) so
  webapp source is TypeScript, output is bundled JS.
- [ ] **19. 'Jump to File History Snapshot' button** — a per-revision button in the timeline
  (reminiscent of filter buttons from previous HTML viewer versions) that navigates to the
  file-history view anchored at that revision's snapshot.
- [x] **20. FileViewer: Diff vs Base — design polish** — `webapp/views/diff-vs-base.js` exists
  (62 lines) but is self-described as "Debugging surface — plain, no polish (plan 3.7)".
  Needs a designed UI: revision selector, side-by-side vs unified toggle, proper styling.
  **Closed 2026-07-08:** everything shipped in `b65d15c` — side-by-side default with inline
  toggle, line-number gutters, 3 context lines — plus the revision selector with `/vsbase/<n>`
  URL sync (already present). Stale "Debugging surface" header comment updated to match.
- [ ] **21. "Snippet: Show as formatted text"** — raw-lines view (`webapp/views/raw-lines.js`)
  shows JSONL lines as raw JSON text. Add a mode/button that renders a selected line's content
  as formatted, readable text (e.g. "line 123 of 234 lines" context label + pretty-printed or
  human-readable content instead of raw JSON).
- [x] **22. Clear console when loading new session** — the xterm progress console retains output
  from the previous project/session load. Clear it on new navigation.
  **Closed 2026-07-08:** `renderRoute` clears the console via `progressTerminal.clear()` when
  navigation starts loading a different project (`checkNavigationStartsNewProjectLoad`,
  `webapp/app.js`); same-project sub-route hops and the projects list keep the output; the
  projects-folder switch resets tracking. Covered by 4 tests in
  `tests/route-predicates.test.ts`.
- [ ] **23. `fb2558d7813b8799@v2`-style blob changeIds stay unlinked**  — blobs whose prefix
  matches no changeId in the document get no xterm link. Needs a server-side blob→path map
  if linking is wanted (from `implementation-notes-implement-clickable-jsonl-lines.md`).

## Decision needed

- [ ] **16. Phase B `kept[]` single-gate — finish or retire?** — `src/reconstruction_parse_lines.ts`
  header still promises "Phase B makes `kept[]` the engine's sole input"; no consumer exists and
  85/85 was reached via the old path (handoff-api-from-scenarios-20260626-1152). Either finish the
  refactor or retire the plan and fix the stale header.
- [ ] **14. ReconstructionCorpus (Fix 2) — still worth building?** — from handoff 22:32. The corpus
  facade targeted duplication that `f6d2852` has since mostly eliminated (186→38 spawns, 0.03s warm),
  and the recorded scope decision rejected document-shape changes. Decide with user whether the
  architectural consolidation is still justified or the remaining lever is just item 11.
  Check `git show f6d2852 b79cf1b` + `src/cache_lru.ts` before any design work.

## Minor open items from implementation-notes / handoffs (2026-07-07)

- [ ] **24. s39 attribution: git rows land on synthetic turn** — s39 session 1's reply text
  precedes its tool calls, so file chips + git rows land on a synthetic empty-text Step 5
  instead of the reply (Step 4). The attribution rule is user-approved; changing it needs an
  explicit user decision. (handoff-develop-20260707-1619)
- [ ] **25. s84 Step 17: pickable agent turn with zero visible chips** — its snapshot's changeIds
  resolve to no revision and `changedPaths` is empty. Engine data question, unaddressed.
  (handoff-develop-20260707-1619)
- [ ] **26. `git branch` scenario fixture missing** — `GitOperationKind.branch` rendering and
  detail parsing are covered by parser design only, not by a scenario fixture. Add expectation
  to `tests/git-operations.test.ts` if/when a git-branch scenario is recorded.
  (handoff-develop-20260707-1619)
- [x] **27. Trailing-newline artifact** — 2 files show `recon=''` one line beyond reference EOF
  in item-15 pass-per-line coverage. Worth a follow-up to confirm it's a trailing-`\n` split
  artifact vs a real reconstruction bug (`implementation-notes-item15-pass-per-line.md:167`).
  **Closed 2026-07-08:** duplicate of completed roadmap item 14. Both evidence records are
  Read tool_result dumps ending in a final numbered empty line (`…\n85\t` / `…\n498\t`) — the
  "terminal Read phantom" fixed by `dropTrailingReadPhantom` (`api/numbered-entries.js`);
  item-14 gates recorded both files going mismatched 1→0
  (`plans/implementation-notes-item14-trailing-extent.md:64-65`). The
  `tools/line-state-reports/*.json` reports are stale pre-fix outputs (2026-06-11), and the
  follow-up note actually lives at `implementation-notes-per-line-state-sidecar-plan.md:166`,
  predating the fix. The live engine is unaffected (its `splitLines` drops the trailing empty
  element). No code change.
- [x] **28. 362 golden-value test failures** — retired in favor of the scenario coverage tool
  (85/85 scenarios fully reproduced as of 2026-07-08; zero references to golden-value tests
  remain in the test suite).
