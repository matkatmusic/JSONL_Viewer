# Open Task List — develop branch

Compiled 2026-07-04 from the day's handoffs (`plans/handoff-develop-20260704-*.md`),
reconciled against repo state at HEAD `b79cf1b`. Closed handoffs: 14:08 (timeline
plan → shipped `b3b11fa`), 20:52 (build-cache plan → shipped `f6d2852`).

Audited 2026-07-04 against ALL 94 handoff documents in `plans/` (June 3 – July 4):
every "What Remains" item is done, tracked below, deferred-by-design, or obsolete
(frozen legacy island: `jfred/`, `web-shared/`, `api/`, `diff/`, `unified/`, `viewer/`).
The audit surfaced items 15–17 below. Excluded as not-actionable: bash-read/grep
timestampless unification (theoretical, `api/`), `docs/engine-b-overview.md` update
(optional, frozen island), consent-dialog read-only whitelist (speculative), replay-engine
npm extraction (speculative), item-6 spike files (closed NON-VIABLE diagnostic), roadmap
`cp` sub-item (documented deferral in `plans/roadmap-100-percent-reconstruction.md`).

## Done

- [x] **1. Commit staged jfred-claude-scenarios submodule migration** — committed as `f5d43b5`.
- [x] **3. Verify check_scenario_coverage.ts post-submodule** — 85/85 through the `scenarios/` submodule (verified 2026-07-04).

## Quick close-outs

- [ ] **2. Remove stale api-from-scenarios worktree** — `git worktree remove api-from-scenarios`
  (`~/Programming/RevEng-worktrees/api-from-scenarios`, branch merged). Also makes the first
  `SCENARIO_ROOTS` entry in `tests/fixtures.ts:18` permanently dead (harmless fallthrough today).

## Queued work items (handoff 18:01)

- [ ] **4. Scenario coverage for unhandled JSON fields in real JSONLs** — fields tolerated via the
  field-gate bypass in `buildProjectDocument` (`src/viewer_api.ts:105-108`) / surfaced as
  `UnmodeledFieldError`. Start by grepping real `~/.claude/projects` transcripts.
- [ ] **5. Clickable file-history revision snapshots** — `webapp/views/file-history.js`; deep-link
  to that revision's content/diff, not just toggle a pane.
- [ ] **6. Clickable JSONL lines in the loading console** — `webapp/app.js`
  `logProgress`/`ensureProgressTerminal`; may require replacing xterm.js (canvas — no per-line anchors).
- [ ] **7. jot repo: `terminal_windowSizeBlocks(s)` enum refactor** — `/Users/matkatmusicllc/Programming/jot`
  (separate repo); `grep -rn "windowSizeBlocks"`. Not a RevEng change.
- [ ] **8. Investigate `scripts/coverage_sidecar.ts:43`** — "same @vN blobs have different content":
  real sidecar collision (data-loss risk) or stale note? Failing test if real.
- [ ] **9. Design conversation: Timeline of Revisions v0.1 presentation** — density, session grouping,
  rail layout, mockup vs live data. Includes the unanswered question: strictly-chronological nodes
  with session headers vs hard per-session grouping.
- [ ] **10. Webapp UX smoothing pass** — open-ended; interview user for pain points first.

## Approval-gated follow-ups (handoff 22:26)

- [ ] **11. Disk-backed sandbox memo** — persist sha256→outcome across server restarts; the only
  remaining lever on the 7.3s cold s84 load (38 distinct python3 runs + parse).
- [ ] **12. Viewer request-path tab in `engine-pipeline-diagrams.html`** — records/document caches
  currently get one line on the cache_lru node.
- [ ] **13. Cache serialized `JSON.stringify(document)`** — only if reload latency ever shows it
  (ponytail note in `src/viewer_api.ts`).

## Found by the full-handoff audit (2026-07-04)

- [ ] **15. Fix s85 git-repo durability** — `readCommittedFileContent`
  (`src/reconstruction_git_evidence.ts:86`) resolves s85's repo via the RECORDED temp cwd and
  silently returns `undefined` when it's gone; temp cleanup will regress s85 steps 4–10. Fall back
  to the preserved repo at `scenarios/executed/s85-git-commit-csv-and-move-scripts/.git`.
  (handoff-api-from-scenarios-20260702-0800, "flagged not fixed".)
- [ ] **17. GitHub Pages demo tier** — canned ReconstructionDocument JSON + `webapp/` with a
  static-data shim replacing `/api/*`. Deliberately deferred "Phase 4, planned separately when
  reached" (handoffs 20260702-1434/1639, 20260703-1010/2144); needs its own plan when reached.

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
