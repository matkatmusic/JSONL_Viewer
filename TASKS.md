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

Second sweep 2026-07-08 (afternoon): `implementation-notes-items10-11-12.md` reviewed — items
10/11/12 all closed above; its three open questions became item 36. Notes archived.

Third sweep 2026-07-08 (evening): `implementation-notes-items34-18.md` reviewed — items 34/18
closed above; its two follow-ups became items 41–42. Notes archived.

Fourth sweep 2026-07-08 (late evening): `implementation-notes-item43-inspector-selection-sync.md`
reviewed — item 43 closed above; its one open question became item 45. Notes + the item-43 plan
file archived.

Fifth sweep 2026-07-09: nothing to sweep — no implementation-notes/handoffs created since the
fourth sweep (commits `23b5159`/`3211798` touched only TASKS.md). Only unarchived handoffs
anywhere are the June 22–25 per-scenario `api-from-scenarios` files inside `plans/s*//m*/`
(frozen legacy island, colocated with scenario artifacts) — deliberately left in place.

Sixth sweep 2026-07-09: `implementation-notes-items47-52-webapp-viewer-fixes.md` + its plan
file reviewed — items 47–52 all closed above; two tradeoff flags became items 53–54. The
notes' "suite intentionally not run" remainder lands in the standing post-session suite run
(item-44 precedent, not tracked separately). Both files archived.

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
- [ ] **7. jot repo: `terminal_windowSizeBlocks(s)` enum refactor** — DEFERRED UNTIL ALL other tasks are done.`/Users/matkatmusicllc/Programming/jot`
  (separate repo); `grep -rn "windowSizeBlocks"`. Not a RevEng change.
- [x] **8. Investigate `scripts/coverage_sidecar.ts:43`** — "same @vN blobs have different content":
  real sidecar collision (data-loss risk) or stale note? Failing test if real.
  **Closed 2026-07-08:** the collision is real and already solved. `coverage_sidecar.ts` is fully
  commented out (RETIRED 2026-07-02, no importers); the live fix is owner-keyed blob reads —
  `BackupReader` carries the owning `sessionId` (`src/reconstruction_sidecar.ts:16`, read sites
  155/180/206) and `buildSidecarReader` reads the owner's dir first
  (`src/reconstruction_sidecar_reader.ts:64-71`). Landed 2026-06-26 fixing multi-session
  s56/s59/s64; scenario coverage 85/85 exercises it.
- [x] **10. Webapp UX smoothing pass** — open-ended; interview user for pain points first.
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
  **Closed 2026-07-08 (all sub-items, user-decided "do all of them"):** (a) premise was wrong —
  no pseudo-element existed; the real gap was collapse = `display:none` with NO reopen
  affordance (`handleInspectorRailClick` was unreachable dead code, now commented out). The
  collapse button now toggles a 24px `.collapsed` rail, same focusable button flips »/«.
  (b) `checkSelectionBlocksBackgroundClose` guards the timeline background-close against
  selection drags. (c) timeline details split 60/40 → 50/50. (d) unattributed steps get a
  `timeline-tag` + tooltip naming their event kind(s) via `computeUnattributedStepTag`
  ("user edit", "script run", …). (e) `@@` hunk rows render as thin dashed separators
  (CSS-only; view-model untouched). (f) diff toggle persists via localStorage
  (`resolveInitialDiffDisplayMode`). (g) snapshot-drawer split fixed: `.inspector-content`
  becomes a flex column when the drawer is open. (h) button styled via `.snapshot-history-btn`.
  7 new view-model tests (written, not run — user runs the suite).

## Approval-gated follow-ups (handoff 22:26)

- [x] **11. Disk-backed sandbox memo** — persist sha256→outcome across server restarts; the only
  remaining lever on the 7.3s cold s84 load (38 distinct python3 runs + parse).
  **Closed 2026-07-08 (user-approved):** opt-in via `configureSandboxMemoPersistence(path)`
  (`src/reconstruction_script_execution.ts`) — only `viewer_server.ts` configures it at startup
  (`.cache/sandbox-memo.json`, already gitignored); engine CLI and tests stay memory-only so
  spawn-count tests remain deterministic. Whole-file JSON rewrite after each new spawn mirrors
  the LRU-256 cap; memoized failures round-trip as `post: null`. 3 tests in
  `tests/reconstruction_script_execution.test.ts` (written, not run — user runs the suite).
- [x] **12. Viewer request-path tab in `engine-pipeline-diagrams.html`** — records/document caches
  currently get one line on the cache_lru node.
  **Closed 2026-07-08 (user-approved):** tab `5 · Viewer request path` added — 20 nodes /
  4 subgraphs covering every `/api/*` route in `handleRequest`, the consent gate, the
  `buildProjectDocument` chain, and the three caches (`parsedRecordsCache` LRU 8,
  `builtDocumentCache` LRU 8, sandbox memo LRU 256 + its new item-11 disk backing). Rendered
  headlessly to verify zero mermaid errors.
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

- [x] **18. WebApp: convert to TypeScript and add build step** — all 10 webapp files are plain `.js`
  served directly by the node server with no transpilation. Add a build step (esbuild/tsc) so
  webapp source is TypeScript, output is bundled JS.
  **Closed 2026-07-08 (tsc transpile, no bundler — user-approved approach):** all 10 webapp files
  `git mv`'d to `.ts` and fully typed under strict + noUncheckedIndexedAccess (zero `as any`;
  local `Wire*` types for serialized JSON shapes; `declare global` for the script-tag xterm
  globals). New `tsconfig.webapp.json` emits to `webapp/dist/` with
  `rewriteRelativeImportExtensions` (source imports `.ts` like `src/`, emitted JS imports `.js`);
  `npm run build:webapp`, and `npm run app` builds first. The server serves `.js` from
  `webapp/dist/` and everything else (index.html, styles.css, vendor/) from `webapp/` via
  `resolveStaticFilePath` (`src/viewer_api.ts`, +2 tests in `tests/viewer-static.test.ts`).
  `fetchDocument`/`peekCachedDocument`/`fetchJson` are generic so each view names the wire
  fields it reads. Zero behavior changes (timeline.ts verified byte-identical after
  transpilation); zero new dependencies; vendor/ untouched. Tests written/adapted, not run —
  user runs the suite.
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

- [x] **16. Phase B `kept[]` single-gate — finish or retire?** — `src/reconstruction_parse_lines.ts`
  header still promises "Phase B makes `kept[]` the engine's sole input"; no consumer exists and
  85/85 was reached via the old path (handoff-api-from-scenarios-20260626-1152). Either finish the
  refactor or retire the plan and fix the stale header.
  **Closed 2026-07-08 (retired, user-decided):** the finish path was empirically disproven — gating
  at load caused 5 branch-test regressions (the engine walks the last-prompt/parentUuid DAG), and
  the shipped resolution gates extraction per-record via `recordVerdict` while full records flow to
  `reconstructBranches`; 85/85 coverage was reached without kept[] as sole input. Stale header
  rewritten to describe what actually shipped. No behavior change.
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

- [x] **24. s39 attribution: git rows land on synthetic turn** — s39 session 1's reply text
  precedes its tool calls, so file chips + git rows land on a synthetic empty-text Step 5
  instead of the reply (Step 4). The attribution rule is user-approved; changing it needs an
  explicit user decision. (handoff-develop-20260707-1619)
  **Re-verified reproducible 2026-07-08; repro for the user:** open
  `#/project/s39-git-baseline-seed/timeline` — Step 4 shows only the reply text "Setting up
  the repo, files, and branch." with NO chips/git rows; Step 5 is an empty-text agent turn
  carrying the 2 file chips (`orders.py`, `tests/test_orders.py`) and 2 git rows. In session
  `b9783f4b-…-98dccaf26fd6.jsonl` the reply record is raw line 32; its tool calls (git init /
  Write / git add+commit) follow at lines 33-66 — same turn, but the engine splits at the
  text record. Decision still pending: keep the honest split, or merge a trailing tool-only
  agent turn's rows into the preceding reply step.
  **Closed 2026-07-09 (user-decided via item 55):** neither merge nor split-as-was — tool
  calls became standalone UN-BUBBLED rows sorted chronologically between the bubbles
  (git init / ls / rtk ls / mkdir render between Step 4's reply and Step 5's files bubble),
  and the files bubble KEEPS its own step number. Verified headlessly on s39.
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
- [x] **34. Deterministic synthetic changeIds** — the real fix for item 25's zero-chip turns:
  derive script-execution changeIds from target + run timestamp so the step timeline and
  file-history replays agree, instead of per-replay `randomUUID()`
  (`reconstruction_script_stage.ts:303`). Touches changeId-uniqueness assumptions; needs a
  user go-ahead. (implementation-notes-items13-19-21-25-close)
  **Closed 2026-07-08 (user-approved):** synthetic script-execution changeIds are now
  `scriptRun:<tool_use id | epoch-ms>:<target path>` via `computeScriptExecutionChangeId`
  (`src/reconstruction_script_execution.ts`; `ScriptRun` gained `toolUseId`), following the
  `originalFile:` prefix precedent. `resolveSyntheticChangeIdToSourceId` unwraps the new prefix
  via `resolveScriptRunChangeIdToSourceId`, so those steps also gain session attribution.
  `reconstruction_git_evidence.ts`'s randomUUID splice deliberately untouched (commit markers
  are the viewer's commit signal). 8 tests written (not run — user runs the suite); after the
  scenario sweep, re-check item 31's "(unattributed)" CSS rule.
- [ ] **35. Content-keyed memoization of `executeRunOnce`** — if the branches-pass/steps-pass
  double reconstruction on real transcripts is still too costly after `f311059`'s
  lineage-window fix. Explicitly YAGNI until a new logs capture shows it matters.
  (implementation-notes-repeated-reconstruction-work)
- [x] **36. Item-10 polish follow-ups** — from `implementation-notes-items10-11-12.md` open
  questions, all check-on-next-look: (a) 10f: importing `diff-vs-base.js` in the test runner
  may print a one-line Node `ExperimentalWarning` about localStorage — if noisy, swap the
  `typeof` guard for try/catch; (b) 10c: timeline/details 50/50 split was chosen without a
  target ("cramped" was the only spec) — nudge the 0.5 multiplier in
  `styles.css .layout.timeline-route .inspector-pane` if too wide; (c) 10e: `@@` hunk gaps
  render as thin dashed separators with header text hidden — if visible-but-muted text is
  preferred, restore the `.diff-line-hunk` rule and change only its color.
  **(a) FIXED 2026-07-08:** the warning was real (fires on module import via
  `readStoredDiffMode` at `diff-vs-base.ts:199`), but the proposed try/catch does NOT silence
  it — on Node 26 even `typeof localStorage` triggers the warning because touching the global
  getter at all is what warns. The guard is now `typeof window === "undefined"` (verified:
  import prints nothing). **(c) DONE 2026-07-08 (user-decided via screenshots — muted `@@`
  text in both views):** `.diff-line-hunk` shows its text in `var(--muted)` (dashed-separator
  rule commented out, `styles.css`), and the inline grid's hunk rows now span all 3 columns
  via a `diff-full` cell (`renderInlineDiffLines` + `.diff-inline .diff-full`), matching the
  split view. Verified headlessly on s39: both views render full-width muted headers.
  **(b) Closed 2026-07-09 (user-approved — spacing is fine):** the 55/45 split looks good
  as-is. No CSS change.
- [x] **37. Jump To Timeline button doesn't scroll timeline so selected timeline entry is centered in view**.  tested in `http://127.0.0.1:7343/#/project/s84-multiagent-scripts-git-baseline/timeline/session/ba044097-b975-4ae4-a7f8-d9093e7fbf88.jsonl/at/49`.  **Reproduce**: find a file revision in the timeline, click the 'jump to snapshot' button to see the revison, then in the Details view (showing the revision), click the 'Jump to Timeline' button.  **Expected**: The conversation bubble with the attached file being shown in the Details view should become centered by automatically scrolling the timeline. **Actual**: the timeline does not scroll when the Details view drawer expands causing the timeline view's width to change, causing all timeline bubbles to reformat without repositioning.  **Cause**: changing the width of the timeline causes all message bubbles to resize/reposition without keeping the selected message centered in the view.
  **Closed 2026-07-08:** the anchored-row `scrollIntoView({ block: "center" })` ran BEFORE
  `openTranscriptInspector` expanded the Details drawer, so the drawer's width change reflowed
  every bubble after centering. The scroll now runs after the (synchronous) drawer open
  (`webapp/views/timeline.ts`, anchor-line block), centering against the post-drawer layout.
- [x] **38. selected FileHistorySnapshot's orange selection rectangle is missing the left side (occluded)**
  **Closed 2026-07-08:** `outline` paints outside the border box, and the left 2px fell outside
  the scroll container's content box (`.inspector-content` has no left padding). Added
  `outline-offset: -2px` to `.anchored` (`webapp/styles.css`) so the ring draws inside the
  element's own box — un-clippable everywhere `.anchored` is used.
- [x] **39. Diff Vs Base view is wider than the pane's width, causing scrollbars to appear.**  Diff Vs Base content view in Details page should be the same width as the Details view, so no scroll bars appear. 
  **Closed 2026-07-08:** `.diff-text` used `white-space: pre`, forbidding wraps so long diff
  lines set the pane's scroll width. Now `pre-wrap` + `overflow-wrap: anywhere` (matching
  `.diff-split > div`); the now-redundant `.file-preview-drawer .diff-text` override retired
  (commented out). The new inline grid (item 40) wraps its text column the same way.
- [x] **40. Diff vs Base view: Line numbers aren't displayed in In-line view**
  **Closed 2026-07-08:** inline view now renders a 3-column grid (old № | new № | raw line) via
  the new `computeInlineRows` (`webapp/views/diff-vs-base.ts`), the same hunk-header-seeded
  counters as the split view: deletions number the old side, additions the new side, context
  both; preamble/headers unnumbered. 4 tests in `tests/viewer-viewmodels.test.ts` (written,
  not run — user runs the suite).
- [x] **41. Re-check the "(unattributed)" CSS hide rule now that item 34 landed** — with
  deterministic `scriptRun:` changeIds the 29 scenarios from item 31's sweep should now
  attribute their script turns; after the suite + scenario sweep passes, re-run the lane-header
  check and remove the rule (`webapp/styles.css` ~254) if no scenario still emits an
  unattributed lane header. (implementation-notes-items34-18)
  **Closed 2026-07-08 (re-checked — rule must STAY):** re-ran the lane-header sweep across all
  85 covered scenarios (build document + `buildTurnTimelineViewModel`, count
  `sessionId === undefined` nodes): **28 scenarios still emit exactly one unattributed
  agent-turn** — item 31's list minus s84 (which item 34 DID fix) plus the new s86. The
  survivors are NOT `scriptRun:` ids: their steps' changeIds are sidecar **blob refs**
  (e.g. s83's `87585af140a28180@v1`) and git-evidence randomUUID splices that item 34
  deliberately left untouched, and neither resolves to a session in
  `indexChangeIdsToSessionIds`. The rule (`webapp/styles.css:296`) stays load-bearing;
  attributing blob-ref/git-evidence steps (e.g. blob → owning-session lookup) would be a new
  engine item if wanted.
- [x] **42. `npm run app` rebuilds the webapp on every start (~1s tsc)** — add an `app:fast`
  script that skips the build only if the delay grates. YAGNI until it does.
  (implementation-notes-items34-18)
  **Note 2026-07-09:** was implemented in `RevEng/.vscode/` instead of one level higher —
  needs to be re-done at the correct level.
  **Closed 2026-07-09:** re-done at the correct level, versioned in this repo — the
  workspace-root `claude code src/.vscode` is now a SYMLINK to `RevEng/.vscode-parent/`,
  whose launch.json carries `preLaunchTask: build:webapp` (plus the pre-existing chrome
  tree-viewer config) and whose tasks.json points the npm task at the `RevEng` folder
  (`"path": "RevEng"`). A straight symlink to `RevEng/.vscode/` can't work —
  `${workspaceFolder}` resolves differently at each root — so the parent-tuned variant
  lives in the repo and the parent links to it. `RevEng/.vscode/` stays for opening RevEng
  directly. The original `app:fast` npm-script idea stays unbuilt — the launch-config
  build step superseded it.
- [x] **43. Timeline selection doesn't change when Details View's item is a node in the timeline**.  **Reproduce**: using `http://127.0.0.1:7343/#/project/s84-multiagent-scripts-git-baseline/timeline`, select Step 3 (line 29/138). in the Details View (json displayed), advance to line 32/138 by pressing the `next >` button.  **Expected**: the Step 4 message bubble should selected. **Actual**: Step 3's message bubble remains selected. 
  **Closed 2026-07-08:** `openTranscriptInspector`'s existing-but-never-wired `onJumpToLine`
  hook is now passed by all 7 timeline inspector-open sites via a closure wrapper
  (`openTranscriptInspectorSynced`, `webapp/views/timeline.ts`): on every shown line,
  `syncSelectedRowToShownLine` maps the line to its owning node
  (`findTimelineNodeIndexForRawLine` — already test-covered, including the no-owner case),
  swaps `.selected`, and redraws the rail; a line owned by no node keeps the current
  selection. The `/at/<line>` anchor route now also selects (not just outlines) the anchored
  step. Verified live in a headless browser on s84: Next from line 49 holds Step 23 through
  line 68 and moves the selection to Step 27 at line 69. tsc clean; suite not run (user runs
  it). Plan: `plans/archived/item43-inspector-next-syncs-timeline-selection.md`.
- [x] **44. Verify items 37–40 (nothing was run)** — the 4 new `computeInlineRows` tests in
  `tests/viewer-viewmodels.test.ts` were written but never run (run the suite), and the three
  CSS/DOM fixes (37 scroll-after-drawer, 38 outline-offset, 39 pre-wrap) have had no visual
  check — verify at the repro URL in item 37. Known quirk, matches split view: a diff's blank
  trailing line (final `\n` split) gets numbered as context inside a hunk.
  (implementation-notes-items37-40-webapp-ui-fixes)
  **Update 2026-07-08 (visual half DONE — only the suite run remains, user runs it):** all
  four fixes verified in a headless browser against s84 on a fresh build: (37) the `/at/49`
  anchored row lands centered in the pane AFTER the drawer opens (~70px from window center =
  header offset, not top/bottom); (38) `.anchored` computes `outline-offset: -2px` on both the
  timeline row and the file-history snapshot — ring un-clipped; (39) `.diff-text`/`.diff-split`
  report `scrollWidth <= clientWidth`, no body horizontal scroll on the Diff-vs-Base view;
  (40) inline view renders a `display:grid` 3-column layout, additions numbered on the new
  side only (screenshot taken). Note: the stale 7343 server process predates these fixes —
  restart it to see them; disk + `webapp/dist/` are current.
  **Closed 2026-07-08:** the visual half was verified and committed in `8118bf4`; the only
  remainder is running the 4 `computeInlineRows` tests, which lands in the user's standing
  post-session suite run — nothing left that this task tracks separately.
- [x] **45. Scroll newly selected bubble into view on inspector line-step?** — item 43 syncs
  the timeline selection when stepping Prev/Next in the Details view but deliberately does not
  scroll the bubble into view. If wanted: one line, `row.scrollIntoView({ block: "nearest" })`
  inside `syncSelectedRowToShownLine` (`webapp/views/timeline.ts`). User decides.
  (implementation-notes-item43-inspector-selection-sync)
  **Closed 2026-07-08 (user-approved "yes, scroll it"):** the one line landed exactly as
  scoped — `row.scrollIntoView({ block: "nearest" })` after the selection swap in
  `syncSelectedRowToShownLine`; "nearest" scrolls only when the bubble is outside the pane.
  Webapp rebuilt (`webapp/dist/` current); restart any long-running 7343 server to see it.
- [x] **46. Add engine capabilities for handling customized paths for the following data sources**: JSONL project path, File History Snapshot Path, git repo Path & git commit hash to use as the base commit, on-disk location of project where conversations took place.  when parsing JSONL files that have a CWD, the on-disk location path would override the extracted CWD.  File History Snapshot (FHS) path: when this argument is set, when a FHS path is detected in a JSONL file, the lookup process to get the correct FHS path would be: `<Custom_FHS_Path>/<JSONL_Session_UUID>/<FHS_hash@vN>`.
  **Closed 2026-07-09 (implemented; suite NOT run — user runs it):** new
  `src/reconstruction_overrides.ts` (process-wide override state on the exec-gate precedent,
  `{}` = today's exact behavior) + `src/reconstruction_base_commit.ts`. (1) FHS root chain:
  explicit override → `file-history/` sibling derived from the transcript's own on-disk
  location (`resolveFileHistoryRoot`, `reconstruction_sidecar_reader.ts`) → `~/.claude`
  default; lookup stays `<root>/<sessionUuid>/<blob@vN>`; viewer serves/derives via
  `getEffectiveFileHistoryDir` and the header gains a prepopulated File-history field (an
  unedited field posts `""` so the server re-derives on folder switch). (2) per-project
  `reveng-paths.json` in the projects folder (project name → `{cwd, repo, baseCommit}`),
  read by the viewer per request (`applyProjectOverrides`, cache-stamped via
  `serializePathOverrides`) and by the CLI (`applyCliPathOverrides`; flags
  `--file-history-loc|--fhsLoc`, `--cwd`, `--repo`, `--base-commit` win per-field).
  (3) cwd/repo overrides join the git-evidence fallback chain (`findFallbackRepoDirs`) —
  DELIBERATE deviation from the parse-time-override wording (user-approved in-conversation):
  rewriting record.cwd breaks relpath math and lineage joins. (4) base commit = tier-1
  beacon: `seedBaseCommitBeacon` splices a `WriteEvent` of the committed bytes at the
  commit's timestamp (deterministic `gitBase:` changeIds; mid-session commits supersede
  earlier steps; user-specified semantics). 21 new tests across 5 files (written, not run);
  engine-efficiency follow-up is item 56. Plan: `plans/item46-custom-data-source-paths.md`.
- [x] **47** `http://127.0.0.1:7343/#/project/s84-multiagent-scripts-git-baseline/timeline` Step 17: clicking the [+\-] buttons doesn't show a file diff. clicking '{ }' goes to line 59, but the message bubble contents displayed in the step is on line 61
  **Closed 2026-07-09:** two causes, both fixed. (a) Step 17 is the `core_inventory.py`
  RENAME revision — its `/api/diff` block is the bare `@@ renamed … @@` kind header with no
  body, so the +/- pane looked empty; `computeRevisionDiffFallbackText`
  (`webapp/views/timeline.ts`) now renders "renamed <old> → <new> (content unchanged)" for
  body-less blocks (3 new tests in `tests/timeline-viewmodels.test.ts`). (b) the chip's `{ }`
  targeted the tool_result line that caused the revision (line 59) while the bubble's text
  record is line 61 — user-decided retarget: `{ }` now opens the step's own message line via
  `openTurnInspector`; `showRevisionJson`/`findRevisionResultLine` commented out (item-47
  marker). Tests written, not run — user runs the suite.
- [x] **48**: `http://127.0.0.1:7343/#/project/s43-git-baseline-uncommitted-module/file/%2Fprivate%2Fvar%2Ffolders%2Ffy%2Fwg2tzrv957sg2vqjcvdkdzvm0000gn%2FT%2Frun-scenario.g6zoy9u6%2Finventory.py` the file inspector displays scroll bars instead of making everything fit in the assigned width (resulting in no scroll bars displayed)
  **Closed 2026-07-09:** `.revision-content` (`webapp/styles.css`) used `white-space: pre`,
  so long lines set the horizontal scroll width — now `pre-wrap` + `overflow-wrap: anywhere`,
  the exact item-39 pattern (old declaration commented out). The per-revision
  `max-height: 300px` vertical cap is deliberate and untouched. CSS-only.
- [x] **49. Add Syntax Highlighting for known languages in Details view**: `http://127.0.0.1:7343/#/project/s43-git-baseline-uncommitted-module/timeline` click on Step 6: `[inventory.py]` so the Details view appear.  Render known languages with proper syntax highlighting.
  **Closed 2026-07-09 (user-decided: vendor highlight.js):** highlight.js 11.11.1 single-file
  build + github/github-dark themes vendored into `webapp/vendor/` (xterm pattern, no npm
  dependency; themes media-gated to the light/dark palettes in `index.html`). New
  `webapp/highlight.ts`: `computeLanguageForPath` (extension map) + `renderCodeInto` (falls
  back to plain text when the language or the `hljs` global is absent — node:test safe).
  Applied to the three file-content surfaces: timeline file preview
  (`views/timeline.ts`), file-history revision content (`views/file-history.ts`), inspector
  snapshot drawer (`inspector.ts`); `.hljs { background: transparent }` keeps
  `var(--code-bg)` the background authority. 5 tests in new `tests/highlight.test.ts`
  (written, not run — user runs the suite).
- [x] **50**. Opening of Details drawer doesn't keep selected message centered in timeline view. 
  **Closed 2026-07-09:** the USER_TURN/AGENT_TURN (and session-end) click handlers opened the
  drawer and stopped — the drawer's width change reflowed every bubble uncompensated. Each
  handler now awaits the inspector open and then runs
  `row.scrollIntoView({ block: "center" })` against the post-drawer layout
  (`webapp/views/timeline.ts`), the same ordering item 37 established for the `/at/<line>`
  anchor route. DOM-only, no view-model change.
- [x] **51**. Consider using 'git diff' as tool that produces diff content for Diff view in Details view, so that headers like `@@ -863,7 +896,7 @@ export async function renderTimelineView(…)` are shown, instead of the current header display: `@@ -77,6 +77,19 @@`
  **Closed 2026-07-09 (user-decided: shell out to real git):** new `src/render_git_diff.ts`
  (`runGitUnifiedDiff`) writes before/after temp files and runs
  `git diff --no-index --no-color --unified=3` (exit 1 = success; preamble stripped; sides
  newline-terminated so no `\ No newline` markers); `renderDiffWithContext`
  (`src/reconstruction_render.ts`) now takes its hunk bodies from git while keeping the
  engine's `@@ <kind> @ <ts> @@` block headers, so `splitDiffBlocks` still splits per
  revision (verified end-to-end on s84: `@@ -7,6 +7,11 @@ def add_item(items, name, qty):`).
  Webapp's `NUMERIC_HUNK_HEADER` relaxed for git's count-1 short form (`@@ -5 +5,2 @@`).
  CLI `renderDiff` untouched; one git spawn per revision per /api/diff request (memo is the
  named upgrade path). 4 tests in new `tests/render_git_diff.test.ts` + 2 short-form
  view-model tests in `tests/viewer-viewmodels.test.ts`; 2 assertions in
  `tests/reconstruction_render.test.ts` reconciled against real git output (written, not
  run — user runs the suite).
- [x] **52** differentiate (visually) tool calls/results, from agent replies.  For context: `http://127.0.0.1:7343/#/project/s39-git-baseline-seed/timeline` step 4 (agent reply) vs Step 5 (tool results with file chips)
  **Closed 2026-07-09 (user-decided: distinct bubble/border color + tag):** new
  `computeToolActivityTag` (`webapp/views/timeline.ts`) — a blank-text agent turn with file
  chips is tagged "tool result", with only git rows "tool call"; replies and user turns get
  nothing. Tagged rows gain a `.tool-activity` class: violet border + tint
  (`--lane-violet`, unused by any bubble category) plus the `.timeline-tag.tool-activity-tag`
  label next to the step number (`webapp/styles.css`). 3 tests in
  `tests/timeline-viewmodels.test.ts` (written, not run — user runs the suite).

## New items (2026-07-09, sixth sweep of implementation-notes-items47-52)

- [x] **53. Chip `{ }` now duplicates the row-click target — remove or keep?** — item 47b
  retargeted the chip's `{ }` to open the step's own message line, the same action as
  clicking the bubble. Kept as an explicit affordance; removal is a user call.
  (implementation-notes-items47-52-webapp-viewer-fixes, Tradeoffs)
  **Closed 2026-07-09 (user-decided via item 55):** neither removed nor kept-as-duplicate —
  the chip's `{ }` REVERTED to opening that file's OWN causing line (the Write/Edit
  tool_use record, e.g. s39 `orders.py` → L:51), undoing item 47b; each chip row now also
  shows its snapshot timestamp and the causing line's `L:n (of N)` label. Chips whose
  synthetic changeId resolves to no line keep the turn-message fallback so the button
  never dead-ends.
- [x] **54. Memoize `runGitUnifiedDiff`** — item 51 spawns `git diff --no-index` once per
  revision per `/api/diff` request, no memo. Content-hash memo is the named upgrade path
  (ponytail comment in `src/render_git_diff.ts`); YAGNI until diff-route latency shows up.
  (implementation-notes-items47-52-webapp-viewer-fixes, Tradeoffs)
  **Closed 2026-07-09 (user-decided: keep deferred, close as YAGNI):** no diff-route latency
  complaint exists and each spawn is ~10ms; the upgrade path stays documented in the code
  (`src/render_git_diff.ts:24`, ponytail comment: memoize on (before, after) content).
  Nothing built; reopen only if `/api/diff` latency actually shows up.

## New items (2026-07-09, user-specified timeline redesign)

- [x] **55. Timeline tool-call rows redesign** — user-specified (s39 screenshot + chat): every
  tool call renders as an un-bubbled row `* <summary, 50 chars> * [{ }] <TS> L:n (of N)`
  between the conversation bubbles; the files bubble keeps its step number; chips regain
  per-chip `{ }` targets + labels (closes items 24 and 53); plus the inspector Prev/Next
  selection-sync bug (stepping onto snapshot lines 49/50 selected Step 3).
  Plan: `plans/timeline-tool-call-rows.md`.
  **Closed 2026-07-09 (implemented; suite NOT run — user runs it):**
  (a) engine: new `src/reconstruction_tool_calls.ts` — `findToolCalls` extracts every
  non-Write/Edit tool_use (name, one-line summary, record uuid, toolUseId, timestamp)
  PLUS one extra row per PreToolUse hook whose `updatedInput.command` differs from the
  tool_use's own command (s39's `rtk ls` and `rtk git add`; the ls tool_use and the rtk
  hook SHARE toolUseId `toolu_015S4…` — the "hook-only execution" theory was wrong);
  document/wire gains `toolCalls[]` (`reconstruction_json.ts`).
  (b) view-model: `TOOL_CALL_NODE_KIND` nodes sort chronologically among turns
  (`deriveToolCallNodes`; rank turn < tool-call < commit < session-end); never numbered,
  never pickable; `appendSessionEndNodes` now also scans tool-call instants so a trailing
  `git add` row precedes its session end. Git rows retired from turn bubbles
  (`attachGitOperationsToAgentTurns` + `renderGitOperationRow` commented out with item-55
  markers; `deriveCommitNodes` untouched); `computeToolActivityTag`'s "tool call" branch
  retired ("tool result" stays).
  (c) selection-sync bug fix: `findTimelineNodeIndexForRawLine` is now tiered — agent turns
  (changeIds + own `"uuid":"…"` line), tool-call rows (own record line, then toolUseId
  reference — hook attachments/tool_results select their row), user turns (own
  `"uuid":"…"` line ONLY; the bare-substring match that fired on snapshot `messageId`s and
  caused the Step-3 jump is gone). Lines owned by no node keep the current selection.
  (d) chips: `FileChange.when` + causing-line `L:n (of N)` labels; `{ }` opens the causing
  record (item-53 closure above).
  Tests: `tests/reconstruction_tool_calls.test.ts` (5) + 9 new / 2 adjusted in
  `tests/timeline-viewmodels.test.ts` (written, not run). Verified live headlessly on s39:
  rows/labels/step numbers/rail exactly match the user's mock; L:32/33/39/44 rows, chips
  L:51/L:55; raw-line 48 → mkdir row, 49/50 → selection unchanged.

## New items (2026-07-09, item-46 follow-up)

- [ ] **56. Pre-baseline reconstruction question UI (engine efficiency)** — when a project has
  a supplied base commit (item 46), the WebApp asks BEFORE rendering the timeline: "Do you
  want to reconstruct file states that precede the supplied baseline git commit?" If the user
  chooses No, the timeline's first shown step is the baseline commit (the engine may skip the
  work the beacon supersedes); otherwise reconstruct as we currently do. User-specified
  2026-07-09; deferred out of item 46's scope.