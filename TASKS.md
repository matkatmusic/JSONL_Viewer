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

Reviewed 2026-07-08: all 59 remaining unarchived implementation-notes plus the item-close
writeups swept for open questions/unimplemented features. Two live UI-polish flags folded
into item 10 (g, h); everything else already tracked, shipped, or frozen-island stale.
All reviewed notes moved to `plans/archived/`.

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

- [x] **4. Scenario coverage for unhandled JSON fields in real JSONLs** — fields tolerated via the
  field-gate bypass in `buildProjectDocument` (`src/viewer_api.ts:105-108`) / surfaced as
  `UnmodeledFieldError`. Start by grepping real `~/.claude/projects` transcripts.
  **Closed 2026-07-08:** shipped in `fab8f8f` — `scripts/audit_unmodeled_fields.ts` sweeps real
  transcripts; field-gate coverage in `tests/audit-unmodeled-fields.test.ts` +
  `tests/loadTranscript.test.ts`. (Handoff 1903's "tick after committing" note — the commit landed.)
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
  inspector; (c) inspector drawer width cramped for conversation reading;
  (d) unattributed steps' only signal is a muted rail dot + spine break — enough, or add a
  tooltip/tag like "git baseline" / "user edit"? (`eventKind` already reaches the view-model,
  `webapp/views/timeline.js:47`; handoff-20260707-1805); (e) `@@ -a,b +c,d @@` hunk rows render
  visibly between diff hunks — hide if they read as noise? (implementation-notes-proud-gosling);
  (f) inline/side-by-side diff toggle is session-only — persist in localStorage, or per-surface
  defaults (drawer inline, full view split)? (implementation-notes-proud-gosling);
  (g) inspector snapshot-drawer 50/50 split unverified visually — `.inspector-content`
  (`webapp/styles.css:124`) may need `display: flex; flex-direction: column` for the
  `max-height: 50%` panes to split correctly; eyeball s43 line 126
  (implementation-notes-items14-23-26-33-close);
  (h) `[View in File History]` button (`webapp/inspector.js:310`) renders unstyled inside the
  JSON `<pre>` — needs dedicated CSS if it reads as plain text
  (implementation-notes-items14-23-26-33-close).

## Approval-gated follow-ups (handoff 22:26)

- [ ] **11. Disk-backed sandbox memo** — persist sha256→outcome across server restarts; the only
  remaining lever on the 7.3s cold s84 load (38 distinct python3 runs + parse).
- [ ] **12. Viewer request-path tab in `engine-pipeline-diagrams.html`** — records/document caches
  currently get one line on the cache_lru node.
- [x] **13. Cache serialized `JSON.stringify(document)`** — only if reload latency ever shows it
  (ponytail note in `src/viewer_api.ts`).
  **Closed 2026-07-08 as YAGNI:** measured on s84 (the biggest scenario): `JSON.stringify`
  of the document is 0.5ms / 69KB. The reload path's real cost is python spawns + parse
  (item 11); a serialized-string cache saves half a millisecond. Nothing built.

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
- [x] **19. 'Jump to File History Snapshot' button** — a per-revision button in the timeline
  (reminiscent of filter buttons from previous HTML viewer versions) that navigates to the
  file-history view anchored at that revision's snapshot.
  **Closed 2026-07-08:** each chip row with a changeId resolvable to a surviving revision gets
  a `⤷` action chip ("Jump to File History Snapshot") routing to
  `#/project/<name>/file/<path>/rev/<n>` via the new `computeSnapshotJumpRoute`
  (`webapp/views/timeline.js`); unresolvable changeIds get no button. 3 tests in
  `tests/timeline-viewmodels.test.ts`.
- [x] **20. FileViewer: Diff vs Base — design polish** — `webapp/views/diff-vs-base.js` exists
  (62 lines) but is self-described as "Debugging surface — plain, no polish (plan 3.7)".
  Needs a designed UI: revision selector, side-by-side vs unified toggle, proper styling.
  **Closed 2026-07-08:** everything shipped in `b65d15c` — side-by-side default with inline
  toggle, line-number gutters, 3 context lines — plus the revision selector with `/vsbase/<n>`
  URL sync (already present). Stale "Debugging surface" header comment updated to match.
- [x] **21. "Snippet: Show as formatted text"** — raw-lines view (`webapp/views/raw-lines.js`)
  shows JSONL lines as raw JSON text. Add a mode/button that renders a selected line's content
  as formatted, readable text (e.g. "line 123 of 234 lines" context label + pretty-printed or
  human-readable content instead of raw JSON).
  **Closed 2026-07-08:** the JSON inspector's nav bar gains a "Show as formatted text" toggle
  (`extractReadableText`, `webapp/inspector.js`): message text, tool_result output, and
  tool_use string inputs render with real newlines; unknown blocks become placeholders;
  records with no message content show no toggle. The nav's existing `line n / total` label
  is the context readout. Session-sticky mode; 7 tests in
  `tests/inspector-viewmodels.test.ts`.
- [x] **22. Clear console when loading new session** — the xterm progress console retains output
  from the previous project/session load. Clear it on new navigation.
  **Closed 2026-07-08:** `renderRoute` clears the console via `progressTerminal.clear()` when
  navigation starts loading a different project (`checkNavigationStartsNewProjectLoad`,
  `webapp/app.js`); same-project sub-route hops and the projects list keep the output; the
  projects-folder switch resets tracking. Covered by 4 tests in
  `tests/route-predicates.test.ts`.
- [x] **23. `fb2558d7813b8799@v2`-style blob changeIds stay unlinked**  — blobs whose prefix
  matches no changeId in the document get no xterm link. Needs a server-side blob→path map
  if linking is wanted (from `implementation-notes-implement-clickable-jsonl-lines.md`).
  **Closed 2026-07-08:** re-scoped with the user to the Details view (the JSON inspector) —
  the dead tokens were `backupFileName` values whose file's revisions carry record-UUID
  changeIds, not blob names (s43's `tests/test_inventory.py` is the live demo, line 126).
  Now every `backupFileName` in a snapshot record resolves against disk via `GET /api/blob`
  (`readBlobSnapshot` in `src/viewer_api.ts`, owner-session dir only): on-disk blobs render
  as "view snapshot" links opening a bottom drawer (JSON above, verbatim blob content below)
  plus a `[View in File History]` button anchored by `backupTime`; missing blobs get a dimmed
  "(missing from disk)" suffix. No blob→path map was needed — the snapshot record itself maps
  path → blob. Tests in `tests/viewer-api.test.ts` + `tests/inspector-viewmodels.test.ts`.

## Decision needed

- [ ] **16. Phase B `kept[]` single-gate — finish or retire?** — `src/reconstruction_parse_lines.ts`
  header still promises "Phase B makes `kept[]` the engine's sole input"; no consumer exists and
  85/85 was reached via the old path (handoff-api-from-scenarios-20260626-1152). Either finish the
  refactor or retire the plan and fix the stale header.
- [x] **14. ReconstructionCorpus (Fix 2) — still worth building?** — from handoff 22:32. The corpus
  facade targeted duplication that `f6d2852` has since mostly eliminated (186→38 spawns, 0.03s warm),
  and the recorded scope decision rejected document-shape changes. Decide with user whether the
  architectural consolidation is still justified or the remaining lever is just item 11.
  Check `git show f6d2852 b79cf1b` + `src/cache_lru.ts` before any design work.
  **Closed 2026-07-08 (built, user-decided):** per-build cache state consolidated into
  `src/reconstruction_corpus.ts` — `CorpusState` holds records-pure branch selections plus
  reader/exec-gate-validated derived caches (histories, lineage seeds, executions), replacing
  the five identity-keyed WeakMaps in `reconstruction_branch.ts` / `reconstruction_branches.ts`
  / `reconstruction_script_stage.ts` (old declarations commented with an item-14 marker).
  Public functions, compute pipelines, cycle guards, the content-addressed sandbox memo, and
  the viewer LRUs are unchanged; no facade/forwarding layer (handoff-2232's `historiesFor(...)`
  facade shape deliberately not built). Bonus fix: `executeRunOnce`'s memo now invalidates on
  reader-identity/exec-gate changes like its siblings (previously unchecked). +4 tests in
  `tests/reconstruction_memo.test.ts`; 6 existing memo invariants untouched.

## Minor open items from implementation-notes / handoffs (2026-07-07)

- [ ] **24. s39 attribution: git rows land on synthetic turn** — s39 session 1's reply text
  precedes its tool calls, so file chips + git rows land on a synthetic empty-text Step 5
  instead of the reply (Step 4). The attribution rule is user-approved; changing it needs an
  explicit user decision. (handoff-develop-20260707-1619)
- [x] **25. s84 Step 17: pickable agent turn with zero visible chips** — its snapshot's changeIds
  resolve to no revision and `changedPaths` is empty. Engine data question, unaddressed.
  (handoff-develop-20260707-1619)
  **Closed 2026-07-08 (investigated):** the zero-chip pickable turn (now Step 23; step
  numbering shifted since the handoff) is the `apply_renames.py` script run rewriting
  `core_inventory.py` at 20:53:49.772Z. The step timeline and the file histories are separate
  replays, and each stamps the synthetic script-execution event with its own `randomUUID()`
  (`reconstruction_script_stage.ts:303`), so the step's changeId can never join a revision —
  documented best-effort (`reconstruction_json.ts:175-177`, `:216-218`). Verdict: known,
  documented engine data gap; the turn is real and correctly pickable. A real fix
  (deterministic synthetic changeIds shared by both replays) is a design decision — raise as
  a new item if wanted.
- [x] **26. `git branch` scenario fixture missing** — `GitOperationKind.branch` rendering and
  detail parsing are covered by parser design only, not by a scenario fixture. Add expectation
  to `tests/git-operations.test.ts` if/when a git-branch scenario is recorded.
  (handoff-develop-20260707-1619)
  **Closed 2026-07-08:** the regenerated s41 capture (run 20260708-105945) records
  `git checkout -b feature` in its baseline session; pinned in
  `tests/git-operations.test.ts::test_s41_two_session_git_operations_include_branch_creation`
  via the new `S41_JSONL_PATHS` fixture (sequence captured live before writing the test:
  init, add, commit "baseline", checkout "feature", add, commit "wip"). Note: branch creation
  was captured as the `checkout` subcommand, so `GitOperationKind.checkout` is what gains
  fixture coverage; `GitOperationKind.branch` shares the identical detail parser
  (`findFirstNonFlagArgument`, `src/reconstruction_git_evidence.ts:141-146`) and the literal
  `git branch` subcommand remains parser-design-only.
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

## New items (2026-07-08, from post-1619 handoffs / implementation notes)

Mined from handoffs 20260707-1632/1805/1903, 20260708-0119, and the Jul 7-8 implementation
notes. Already-landed flags excluded: file-history.js jump fix (`b65d15c`), s85 regression
(`fab8f8f`), s40 session attribution (`39918fe`).

- [x] **29. Rename the "Jump to conversation" button** — it now jumps to the timeline anchored
  at the step + transcript inspector, not the conversation view. "Jump to timeline" /
  "Jump to step"? One-string change once the user picks a label. (handoffs 1632/1805)
  **Closed 2026-07-08:** renamed to "Jump to timeline step" (user-picked label),
  `webapp/views/file-history.js`.
- [x] **30. Simplify `openRevision` in `webapp/inspector.js` (~226)** — its
  `!checkRouteIsTimeline(...)` branch is dead on all project routes, and it swaps drawer
  content WITHOUT updating the URL — inconsistent with the URLs-reflect-drawers architecture.
  Replacing it with `location.hash = routeToFileHistory(...) (+ /rev/N)` deletes the branch
  and makes revision links shareable, at the cost of a full timeline re-render per click.
  (handoff 1632)
  **Closed 2026-07-08:** `openRevision` is now a hash navigation via the new
  `computeRevisionLinkRoute` (`webapp/inspector.js`); the dead `!checkRouteIsTimeline` branch
  and the direct drawer render are gone, revision links are shareable URLs. 2 tests in
  `tests/inspector-viewmodels.test.ts`.
- [x] **31. Remove the dead "(unattributed)" CSS hide rule** — `6b5a71a` hid the lane header
  via CSS (`webapp/styles.css` ~254); the s40 attribution fix (`39918fe`) made it defunct.
  Remove the rule (rule removal, not file deletion) once confirmed no scenario still emits an
  unattributed lane header. (implementation-notes-s40-timeline-session-attribution)
  **Closed 2026-07-08 (won't-do — rule is load-bearing, premise wrong):** swept all 85 covered
  scenarios building each document + timeline view-model: 29 scenarios (s23, s29, s32, s34,
  s35, s37, s38, s41–s44, s50, s51, s54–s60, s62, s72–s75, s82–s85) each still emit exactly
  one unattributed agent-turn — the script-execution turns whose synthetic changeIds are
  per-replay `randomUUID()` (item 34). Removing the rule would re-show the "(unattrib" header
  in all 29. Re-check after item 34 lands.
- [x] **32. `/api/document` runs its per-line progress walk twice per request** — once for the
  script-consent scan, once for the document build, both labeled "reusing cached"; the console
  reads as "loaded twice". Cosmetic. (handoff 0119, s40 notes)
  **Closed 2026-07-08:** the per-record walk now happens exactly once per request —
  `buildDocumentWithConsent`/`buildProjectDocument` no longer replay records
  (`src/viewer_api.ts`); the route's own `loadProjectRecords` call is the single walk.
  Contract tests rewritten in `tests/viewer-progress.test.ts`.

## Decision needed (2026-07-08)

- [x] **33. Filter command-message prompts from the timeline?** — s39 renders 13 steps vs the
  sketch's 7 partly because `/ponytail`-style command prompts and their ack replies each get a
  numbered step (4 extra turns across 2 sessions). Filter them out, or keep as steps?
  (implementation-notes-turn-based-timeline-steps)
  **Closed 2026-07-08 (decided — keep):** command-message prompts and their ack replies stay
  as numbered steps, rendered dimmed via `checkMessageTextIsSystem`
  (`webapp/views/timeline.js:441`). Filtering them out would renumber steps and hide real
  turns. No code change.
- [ ] **34. Deterministic synthetic changeIds** — the real fix for item 25's zero-chip turns:
  derive script-execution changeIds from target + run timestamp so the step timeline and
  file-history replays agree, instead of per-replay `randomUUID()`
  (`reconstruction_script_stage.ts:303`). Touches changeId-uniqueness assumptions; needs a
  user go-ahead. (implementation-notes-items13-19-21-25-close)
- [ ] **35. Content-keyed memoization of `executeRunOnce`** — if the branches-pass/steps-pass
  double reconstruction on real transcripts is still too costly after `f311059`'s
  lineage-window fix. Explicitly YAGNI until a new logs capture shows it matters.
  (implementation-notes-repeated-reconstruction-work)
