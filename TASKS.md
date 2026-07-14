# Open Task List — develop branch

All tasks migrated 2026-07-14: open tasks live in `tasks.json`, completed tasks in
`completedTasks.json`. The narrative below is retained as audit history.

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
