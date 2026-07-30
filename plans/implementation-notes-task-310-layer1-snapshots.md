# 2026-07-29 — Task 310: Layer 2 snapshot discovery (`jfred/src/layer1_snapshots.ts`)

Conversation: layer-2-milestone worktree, task 310 implementation.
JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng--claude-worktrees-layer-2-milestone/70eaf353-d722-4cb4-baa5-dff625d1fcc9.jsonl

## References
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/.claude/worktrees/layer-2-milestone/plans/plan-task-310-layer1-snapshots.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/.claude/worktrees/layer-2-milestone/plans/layer2-mockup/fixture.js
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/.claude/worktrees/layer-2-milestone/jfred/src/layer1_snapshots.ts
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/.claude/worktrees/layer-2-milestone/jfred/tests/layer1_snapshots.test.ts
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/.claude/worktrees/layer-2-milestone/jfred/src/reconstruction_backup_timeline.ts

## Design decisions

- **Deduping added.** `file-history-snapshot` records are cumulative. Measured on a real
  transcript (`b3a6d7e6-…jsonl`, 149 snapshot records): 1,845 backup entries collapse to 230
  distinct `(path, backupFileName, backupTime)` triples, one entry repeating 101 times.
  `buildBackupTimeline` does not dedupe — harmless for beacons, but it would have drawn 101
  identical snapshot nodes. Dedupe key is `owner|backupFileName|backupTime`, first occurrence
  wins so the retained `line` is where the snapshot was actually taken (task 311 needs that).
- **`version` is carried, not regex-parsed.** The task text says parse the `@vN` suffix off
  `backupFileName`. The record already carries a `version` field, and across 5,366 real non-null
  entries the field and the suffix agree 5,366/5,366. Carrying the recorded field is the same
  answer with no parser to get wrong. `version` is a `number`; the mockup's `"@v2"` string is a
  display format the renderer adds.
- **`BackupPoint` widened** (`jfred/src/reconstruction_backup_timeline.ts`) with `version: number`
  and `line?: number`, filled from `backup.version` and `getRecordSource(record)?.lineNumber`.
  It is constructed at exactly one site (`computeBackupTimeline`), so nothing else changed.
  `line` is optional because fabricated in-memory records carry no transcript source; inventing a
  line number for them would be a lie. Placements from the Layer 1 route always have one.
- **The null-blob skip is keyed on `backupFileName === null`, never on `version === 1`.** 72 real
  entries have a null blob with `version !== 1`, so the version-based rule would be wrong.
- **Tolerant parsing** (`loadTranscript(path, undefined, true)`), matching the viewer's loader —
  the Layer 1 View route must open real sessions carrying unmodeled fields instead of throwing.

## Deviations

- **No `fileHistoryRoot` parameter.** The task describes the function as taking the session file
  paths *and the file-history root(s)*. Placements open no blob, so a root has nothing to do here;
  the parameter would be dead weight. Task 313 gets everything it needs from the placement —
  `sessionFile` yields the projects dir, and the existing chain
  `getPathOverrides().fileHistoryRoot` → `deriveSiblingFileHistoryRoot` →
  `getDefaultFileHistoryRoot` (all already exported from `reconstruction_sidecar_reader.ts`)
  resolves the root from there, explicit-override-wins, which is the S1 rule already implemented.
  If task 312 wants the root threaded explicitly, add it there with a real consumer.

## Tradeoffs

- Considered walking the snapshot records directly in this module instead of going through
  `buildBackupTimeline`, which would have given `line` without touching `BackupPoint`. Rejected:
  it would duplicate cwd resolution and per-file bucketing, and the task asks for reuse. Widening
  the single-site `BackupPoint` is the smaller diff.

## Verification

`npx tsc --noEmit` clean apart from the pre-existing `happy-dom` missing-module error in
`tests/webapp-dom-test-helpers.ts`. The three new tests pass, as do the four directly affected
existing files (`layered_snapshot_beacons`, `reconstruction_sidecar`, `_sidecar_reader`,
`_sidecar_clamp` — 22 pass, 1 pre-existing skip). Full suite left to the user.

## Open questions

1. `version` is a `number` here while the mockup fixture carries `"@v2"` strings. Confirm the
   renderer formats `@v${version}` rather than the wire carrying the prefix.
2. Confirm the "no root parameter" deviation above before task 312 wires the route.
