# Task 312 — Layer 2: snapshots on the wire, ruler and shared axis

2026-07-29 · conversation: layer-2-milestone worktree, task 312
Plan: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/.claude/worktrees/layer-2-milestone/plans/task-312-layer2-snapshots-on-the-wire.md`

## Design decisions

- **`snapshots` is OMITTED when empty, not `[]`.** The task's VERIFY line demands "a snapshot-free
  pair's wire shape is unchanged from today", and the codebase already states the rule for `created?`
  (`webapp/layer1-filter.ts`): an `undefined` KEY differs from an absent one under deep equality.
  This deviates from the task's literal `snapshots: Layer1WireSnapshot[]` spelling.
- **Snapshot instants are APPENDED to each ladder, never interleaved by instant.** `layOutNodeLadders`
  reads a ladder as a multiset for both `countRowsPerInstant` and `countNodesPerInstant`; order only
  decides `assignRowSlots`. So every pre-existing tick and node offset is bit-identical, and a snapshot
  tied with a commit or an mtime takes the row BELOW it — the commit/disk node is the event, the
  snapshot is the copy of it. This is why all 65 existing Layer 1 tests passed unchanged.
- **`onDisk` no longer reads `nodeOffsetsPx.at(-1)`** — with snapshots appended the last entry is a
  snapshot, so the index is now explicit (`firstCommit + commits.length`), server and client alike.
- **Disk orphans moved from `placeInstantOnAxis` to ladder offsets.** A one-node ladder's slot-0 offset
  IS the tick offset, so nothing changes for a snapshot-free orphan while its snapshots can stack.
  Git orphans were left alone: a repo-only path has no disk file, so no file-history snapshot.
- **`listTranscriptFiles` was MOVED** from `viewer_api_layer1_sessions.ts` to
  `viewer_api_layer1_sources.ts` rather than exported in place, so the view route can reuse it without
  a route↔route import.

## Deviations

- **`?snapshots=` is round-tripped by the CLIENT but not read by the server.** Snapshot PLACEMENTS come
  from the transcripts (`buildBackupTimeline` over records), not from the file-history store; only
  task 313's blob READ needs the root. The S1 "explicit root wins over discovery" rule is therefore
  task 313's to enforce — nothing in 312 discovers a root at all.
- `webapp/layer1-settings.ts`'s restore guard changed from `url.has("filehistory")` to
  `url.has("snapshots")` so it matches the name `readSourceParams` now writes. Nothing wrote
  `filehistory` to a URL before, so no shared link breaks.
- `buildLayer1View` gained a 6th optional positional param rather than an options object, to avoid
  churning `tests/layer1_view_progress.test.ts` and both route call sites for no behaviour.

## Tradeoffs

- Progress is reported PER SESSION FILE by calling `collectSnapshotPlacements([one])` in a loop and
  merging, because that function takes a `Path[]` and offers no callback. Rewriting it was off-limits;
  the merge is five lines and the stage parses every transcript in the project, so the standing
  "anything slow shows progress" rule required a counted unit.
- With an empty session list the new stage loops zero times and emits NO progress event, which is what
  keeps the existing "every countless stage in execution order" test green.

## Open questions

1. Every Layer 1 page load now sends its JSONL roots, so the ~10 s build gains the transcript parse
   even at Layer 1. That is the task's explicit instruction ("the payload ALWAYS carries snapshots
   regardless of the selected layer"), but it is real added cost — confirm it is acceptable before
   task 314 lands the switcher.
2. `snapshots` omitted-when-empty vs. always-`[]` (decision 1 above) — confirm, since task 315's
   renderer will have to `?? []`.
