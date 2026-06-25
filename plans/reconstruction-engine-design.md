# Per-line reconstruction engine — agreed design

Clean-room TypeScript rebuild of "Engine B" (see
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/docs/engine-b-overview.md`).
Reconstructs a target file's on-disk history from recorded transcript evidence and
(later) emits a per-line verdict against a reference. Built scenario by scenario.

## The per-line model

A reconstructed file is an ordered list of **revisions**. Each revision is a
whole-file snapshot at a timestamp:

```
FileRevision = { kind, changeId, timestamp, lines: LineEntry[], rename?, copy? }
LineEntry    = { oldLineNum, values: { line, timestamp }[] }
```

- `kind` is the `EventKind` that produced this revision (`write`, `delete`,
  `edit`, `rename`, `copy`), so render and callers can label an entry without
  re-deriving it. `rename` (`{ from, to }`) is set only on a rename revision;
  `copy` (`{ from, to }`) is set only on a copy (genesis) revision.
- `changeId` is a `Uuid` identifying the **source operation** that produced this
  revision. When one operation produces more than one revision (a `-`/`+` edit —
  see Rule 2), every revision it emits shares the same `changeId`, so a paired
  removal/addition can never be delinked. Distinct operations (a `Write`, an `rm`)
  get distinct `changeId`s.

- A line's **position in this revision is its array index** (so `newLineNum` and a
  per-revision `numLines` are derived — we don't store them).
- `oldLineNum` is a **back-pointer**: the index this line occupied in the
  *previous* revision, or `-1` if it was just born (inserted, or genesis).
- `values` is the line's content history at this position: usually one authored
  entry, with extra entries appended when an observation (a read) re-witnesses the
  same line.

### Tracking a line across renumbering

Chain `oldLineNum` ⇄ index across consecutive revisions:

- **Forward** (where does `(rev r, index i)` go?): in `r+1`, find the entry whose
  `oldLineNum === i`. Found → it's now at that entry's index. None → the line was
  removed at `r+1`'s timestamp.
- **Backward** (where did a final line come from?): its predecessor is at index
  `oldLineNum` in `r-1`; stop when `oldLineNum === -1` (born).

## The two rules

1. **New revision ⇔ a line was inserted or removed** (positions shift). Pure
   same-position text replacement appends to that index's `values[]` instead.
2. **Coarse in-hunk identity, with linked revisions.** A `structuredPatch` marks
   lines `-`/`+`/` `. Context lines keep identity; a `-`/`+` pair is read literally
   as remove + insert (we do *not* claim one line "became" the other). By Rule 1
   the removal and the addition are each their own revision — and **both carry the
   same `changeId`** so the pair stays linked to the single source edit. (A
   fine-grained sub-diff that *does* link `-`→`+` as one modified line is deferred
   until a scenario needs it.)

Consequence: because a patch encodes every change as `-`/`+`, **every
content-changing Edit/Write mints a new revision**; multi-entry `values[]` is
driven by **observations (reads)**, not edits.

### Open question — where does `changeId` come from?

Answer: **derive it from the originating tool_use id** (already a `Uuid`
in our parse layer) — deterministic, reproducible runs, and doubles as provenance
("which recorded edit caused this"); 

## Scope so far

- **S1 (`s1-delete-file`)** — reconstructs **every file touched**:
  `s1_delete.py` (`Write` create → `Bash rm` delete, two revisions) and
  `tests/test_s1_delete.py` (create only). `reconstructFile`/`reconstructAll` are
  generic over the target; only the *evidence kinds* (write/delete) are fog-of-war
  limited. `--verbose` prints line state per revision; `--diff` prints the changes.
- **S2 (`s2-move-file`)** — adds `Edit` (hunk-driven splice + `oldLineNum`
  mapping) and `mv` lineage. Reconstructs two histories: the moved file (keyed by
  its **final** path `s2_moved.py`, spanning create → rename → edit) and the test
  file (create → edit-removal → edit-addition). Two locked decisions drive the
  shape:
  - **Merge by lineage.** A renamed file is **one** history keyed by its
    surviving/final path; the pre-rename path (`s2_original.py`) is never a
    separate history. `resolveFinalPath` follows the `mv` chain.
  - **Rename is a first-class entry.** The `mv` is its own numbered revision (kind
    `rename`, `from → to`, the mv's `changeId`) that carries the prior line
    snapshot forward unchanged (identity `oldLineNum`) and mints no line change.
- **S3 (`s3-copy-file`)** — adds `cp` lineage. The scenario is Write `s3_source.py`
  → Write `tests/test_s3_source.py` → `cp s3_source.py s3_copy.py` → Read (ignored)
  → Edit `s3_copy.py` (`hello`→`greet`). Reconstructs **three** independent
  histories. Three locked decisions drive the shape:
  - **A copy yields two histories, not one.** The source lives on as its own
    history; the destination is new. A copy is the **opposite of a rename** —
    deliberately kept out of the rename chain — so `reconstructAll(S3)` returns
    `s3_source.py`, `tests/test_s3_source.py`, and `s3_copy.py` (never a merge).
  - **Copy is a first-class genesis entry.** The destination's revision 0 has kind
    `copy`, every line born (`oldLineNum -1`) at the `cp` time, recording its
    `from`/`to` provenance (mirrors the first-class rename entry).
  - **Genesis content is the reconstructed source as of the copy time.** The copy
    is seeded by reconstructing the *source's* lineage up to the `cp` timestamp —
    **not** from the destination Edit's `originalFile` field (unreliable across
    transcripts, and it would couple a file's genesis to a later edit). This is the
    clean-room, evidence-based path and generalizes to a source edited after copy.
- **S4 (`s4-overwrite-file`)** — adds **overwrite** (a second `Write` to a file
  that already exists, replacing all its content). The scenario is Write
  `s4_overwrite.py` → Write `tests/test_s4_overwrite.py` → rewrite each with a fresh
  Write (`version1`→`version2`). Reconstructs **two** independent histories, each
  create → overwrite. Three locked decisions drive the shape:
  - **An overwrite is a fresh full-content revision** — every line genesis
    (`oldLineNum -1`), content from the Write's `content`, NOT an Edit-style splice;
    the diff is a wholesale remove-all / add-all headed `overwritten`.
  - **Overwrite is detected at replay time by file presence, not at extraction.** A
    write whose file is present (latest revision exists and is not a delete) is an
    overwrite; the first write is a create. Extraction keeps emitting plain `write`
    events; the overwrite Write's `structuredPatch`/`originalFile` are not read.
  - **Overwrite is its own revision `kind` (`EventKind.overwrite`), not a new event
    type.** `WriteEvent` covers both; a write-after-delete stays a create (file
    absent). Also: S4's transcript introduced the `queue-operation` record type (a
    queued user prompt), now modeled as a discriminant-only `RecordType`.
- Later scenarios add reads/observations and the verdict/coverage layer.

## Code layout

The engine is split by concern, one paired test each (files kept well under the
250-line cap with full comments, not crammed):

- `src/reconstruction_engine.ts` — the per-line model types + the event types + the public
  `reconstructFile` / `reconstructAll` / `findDeletedTarget` API (each pre-selects the surviving
  conversation branch via `selectLiveBranch`, then delegates to the branch-agnostic core), and the
  branch-aware `reconstructBranches` (+ `RewoundBranchHistory` / `BranchedReconstruction` types).
  `reconstructFile`/`reconstructAll` take an optional `BackupReader` (transcript + sidecar): with
  one, `fillRedirectContent` recovers bash-redirect content before replay; S1–S4 pass none, so it
  is a no-op for them.
- `src/reconstruction_branch.ts` — the conversation-branch model: `findConversationBranches`,
  `selectBranchRecords` / `selectLiveBranch` (a branch's records = its tip's `parentUuid` ancestor
  chain + uuid-less meta), `collectSurvivingUuids`, and the canonical tip short-id `shortUuid` +
  `findBranchById`. Imports the generic walkers from `reconstruction_tree.ts` and
  `findWorkingTreeOwner` from `reconstruction_worktree.ts` (engine types are type-only), so the
  graph stays acyclic.
- `src/reconstruction_tree.ts` — the generic conversation-tree walkers over the `parentUuid` forest
  and the `last-prompt` heads (`indexRecordsByUuid`, `collectHeadUuids`, `collectAncestorUuids`, and
  `findHeadAtOrAbove` = the first head at-or-above a record). Their canonical home, moved out of
  `reconstruction_branch.ts` in S8 (cap-driven split). A leaf — imports only
  `envelope`/`session-meta`/`domain`.
- `src/reconstruction_worktree.ts` — `findWorkingTreeOwner`: which working-tree state survived.
  Scans the `file-history-snapshot` records and returns the `messageId` of the LAST snapshot whose
  CONTENT signature changed vs. the previous. Content identity is the carried-forward `backupFileName`
  per path (refined from `{path → version}` in S9), NOT the `version` counter — a conversation-only
  rewind appends a trailing snapshot with an unchanged set, and a `code`-restore-with-no-post-edit
  appends "refresh" snapshots that bump `version` while leaving content unchanged; both keep the same
  signature, so both are ignored. A leaf — imports only `file-history`/`envelope`/`domain`; does not
  walk the tree, so no cycle. Added in S8, refined in S9.
- `src/reconstruction_branches.ts` — the branch-agnostic reconstruction CORE
  (`reconstructFileOver` / `reconstructFilesOver`) that reconstructs over EXACTLY the records given
  (no branch selection), plus the cycle-guarded copy-seed recursion (`seedOneCopy` seeds each copy
  from its source as of the copy time). Split out of `reconstruction_engine.ts` in S7 to keep both
  files under the 250-line cap (split, never condense); the public surviving-branch API in
  `reconstruction_engine.ts` calls this core.
- `src/reconstruction_extract.ts` — extraction (records → ordered `FileEvent`s):
  Write→create, Bash `rm`→delete / `mv`+`git mv`→rename / `cp`→copy / `>>`→append / `>`→overwrite
  (`parseRedirect`, empty content — the sidecar fills it), Edit→splice (+ hunk indexing). A
  rename's cwd-relative paths (s6's `git mv`) are resolved absolute against the record `cwd`
  via `resolveAgainstCwd` so they match the absolute Write/Edit targets.
- `src/reconstruction_replay.ts` — replay (events → revisions): the left-fold and the
  write/delete/rename/copy/overwrite/append appenders.
- `src/reconstruction_replay_edit.ts` — the per-line primitives (`splitLines`,
  `genesisLine`, `carryAt`, `lastLinesOf`, `fileIsPresent`), the `appendRevision`
  builder, and the whole Edit splice (`applyEdit` + privates). Imports nothing from
  `reconstruction_replay.ts`, so the dependency runs one way (replay → here). Split out
  in S5 (replay was 247/250 lines). S12 made `insertHunkAdditions`' context branch total
  (`resolveContextLine`): a context line with no working line to carry becomes a genesis
  line instead of indexing past an empty base (the conversation-only-rewind-then-edit guard).
- `src/reconstruction_sidecar.ts` — `fillRedirectContent` recovers a `>`/`>>`'s
  resulting content from the file-history backups beside the transcript (the snapshot
  taken next after the redirect names the blob), through an injected `BackupReader`;
  `createSidecarReader`/`getDefaultFileHistoryRoot`/`findSessionId` build the real
  on-disk reader (`~/.claude/file-history/<sessionId>/`). Snapshot paths are resolved
  against the transcript `cwd` (they are cwd-relative) via the shared `resolveAgainstCwd`.
  S12 added `seedEditBaseFromBackup` (+ `findBackupAtOrBefore`): when a per-file lineage's
  first event is an Edit (its creating Write off-branch), prepend a synthetic Write seeded
  from the at-or-before backup so the Edit splices onto real lines (spec 39). S19 generalised
  this to MID-stream edits via `seedStaleEditBases`/`staleEditSeedFor`/`backupSeedWriteFor`
  (in `reconstruction_branches.ts`, reusing the same backup lookup): when an edit's first hunk
  references base content the events before it did not reconstruct — each context/removed line must
  equal the base line at its position; a mismatch, or a position past the base, means off-branch edits
  advanced the disk and persisted across a rewind — the same backup seed is spliced before that
  edit; an edit whose base is intact (every line aligned) passes through unchanged. (S19 first needed
  only the length-overflow half of this check; S23 generalised it to the per-line context-match below.)
  S20 (code-rewind twin of S19) records the contrast and needs NO new rule: a CODE rewind
  reverts the file on disk, and Claude Code re-writing the checkpoint surfaces as a synthetic
  `edited_text_file` (a `user-edit`) on the SURVIVING branch. The S15 content-aware guard
  records it, which advances the surviving base to the full restored disk state, so the
  post-rewind edit's hunk is ALIGNED and `editBaseIsStale` is false — the S19 reseed stays
  INERT. (Contrast: a conversation-only rewind leaves the user-edit off the surviving branch,
  so the surviving base is too short and the S19 backup reseed must fire.) S20 is the first
  scenario carrying a `user-edit` on BOTH branches (the real human edit on the rewound branch,
  the code-rewind restore echo on the surviving branch).
  S21 (`s21-multiple-user-edits`) locks the multi-user-edit linear case: three out-of-band
  `edited_text_file` user edits interleaved with two Claude edits on one no-rewind branch.
  `userEditChangesContent` records each (all three change content); because no rewind advances the
  disk off-branch, every edit base is aligned and `editBaseIsStale` is false, so `seedStaleEditBases`
  stays inert. Confirms a Claude edit may anchor on content a prior user edit produced, and that a
  prepending user edit re-numbers later lines without loss. No code change; characterization only.
  S22 (`s22-user-edits-conv-rewind`) locks the two-user-edit conversation-rewind case: a user edit
  lands on each side of a conv-only rewind (push on the abandoned branch, peek on the surviving one),
  each followed by a Claude edit. Because the rewind is conversation-only, the off-branch push+pop
  stay on disk, so the surviving user-edit's `edited_text_file` snapshot ABSORBS them — the surviving
  scenario22.py is three revisions where the userEdit jumps 3→6 lines. `seedStaleEditBases` stays
  inert (a user-edit is never a reseed candidate, and the lone surviving Claude edit anchors on the
  content the user edit already produced), the complement of S19 where the reseed is active because a
  Claude edit follows the rewind. The same user-edit kind adds one line on the abandoned branch but
  three on the surviving branch, driven by per-branch disk state. No code change; characterization only.
  S23 (`s23-user-edits-code-rewind`) is the code-rewind twin of S22, but the user's second edit
  (`size`) left NO event (it surfaces only in the file-history backup `…@v5`), so the surviving
  `is_empty` edit was computed against a disk the on-branch events do not reconstruct — a base of the
  SAME length as S19's but a WRONG line. `editBaseIsStale` was generalised from `oldStart-1 >
  baseLength` (length-only) to a per-line context-match against the reconstructed base (via a new
  `reconstructedBaseText` accessor); the same `seedStaleEditBases` reseed then splices the at-or-before
  `…@v5` backup before the surviving `is_empty` edit. The length-overflow case (S19) is now a special
  case of the mismatch walk, so every aligned pre-S23 edit is byte-for-byte unaffected. REAL code
  change (the first since S19); first scenario where a captured base diverges by content, not length.
  m1 (`m1-cp-fork`) is the first *file-level* fork: a `cp` (event E) creates `m1_fork.py` from
  `m1_base.py`, then BOTH files are edited independently (G adds `disable_all` to the base; F adds
  `enable_verbose` to the fork). No new machinery — it is locked, not fixed. It exercises two existing
  guarantees together for the first time: (a) copy-time snapshot — `seedOneCopy` seeds the fork from
  `lastRevisionAtOrBefore(sourceRevisions, cpTimestamp)`, so the fork is born as base@D
  (init+enable_debug) and the later `disable_all` never leaks in; (b) per-path independence — the copy
  event is keyed to its destination (`contentPathOf`/`turnTarget`) and excluded from the rename chain,
  so source and copy stay two histories. Generalises the S3 copy lineage from "copy then edit the
  COPY" to "copy then edit BOTH". Linear (no rewind): one surviving branch.
  m2 (`m2-mv-rename`) is the rename twin of m1's cp-fork: a `mv` (event E) renames `m2_old_name.py`
  to `m2_new_name.py`, and the file is edited on BOTH sides of the rename (D adds `validate` before;
  F adds `finalize` after). No new machinery — it is locked, not fixed. It generalises the S2 move
  lineage ("edit only after the move") to "edit on both sides", exercising two existing guarantees
  together for the first time on a rename: (a) one-history merge — `buildRenameChain`/`resolveFinalPath`/
  `eventBelongsToLineage` fold the old-path write+edit and the new-path edit into a single
  `m2_new_name.py` lineage (write→edit→rename→edit); (b) content carry — `renameRevision` carries the
  pre-rename `process+validate` forward via `lastLinesOf`/`carryAt`, so F's `finalize` splices onto it.
  `distinctFinalPaths` collapses the rename source, so `m2_old_name.py` is never a separate surviving
  file. Linear (no rewind): one surviving branch.
  m3 (`m3-bash-redirect`) interleaves a real Edit between two bash `>>` appends on one file
  (m3_mixed.txt): write `line one`, `>>` append `line two`, Edit `line one`->`LINE ONE`, `>>` append
  `line three`. No new machinery — it is locked, not fixed. It composes three existing guarantees
  together for the first time: (a) redirect recovery — `parseRedirect` emits content-less append
  events and `fillRedirectContent`/`findBackupAfter` recover `line two`/`line three` from the
  file-history backups @v3/@v5 (specs 24-28, as in s5); (b) the paired edit — `applyEdit` emits the
  standard removal revision (`line one` dropped, leaving the appended `line two`) then addition
  revision (`LINE ONE`/`line two`), here for the first time spliced onto a base produced by a
  backup-recovered append; (c) reseed dormancy — because the Edit's recorded base (line one/line two)
  matches the reconstructed append revision exactly, `editBaseIsStale` is false and
  `seedStaleEditBases` injects no synthetic Write, so the history is five revisions (one write), not
  six. m3 thus regression-locks that the S23 per-line `editBaseIsStale` walk does not false-positive
  on an append-advanced base (the dormant complement of S19/S23, where it fires). Linear (no rewind):
  one surviving branch.
  m4 (`m4-delete-recreate`) deletes a file then re-creates it at the same path. Two files:
  `m4_lifecycle.py` is written (v1), edited (appends `v1_helper`), DELETED via bash `rm`, then
  written again (v2); `tests/test_m4_lifecycle.py` is written then edited to v2. No new machinery
  — it is locked, not fixed. It composes existing guarantees: (a) delete extraction —
  `parseRmTarget`/`bashEventFrom` emit a content-less `DeleteEvent` and `deleteRevision` yields an
  empty 0-line revision at the rm time (the s1 delete path, here NON-terminal for the first time);
  (b) born-fresh recreate — `writeRevision` builds an unconditional all-genesis full-content
  revision and `fileIsPresent` ("locked decision 3") treats the trailing delete as absent, so the
  post-delete Write is labelled a create (kind write, not overwrite) carrying none of the
  pre-delete `v1`/`v1_helper` lineage — the FIRST fixture to drive the `fileIsPresent`
  delete-branch (the inverse of `test_second_write_to_a_present_file_is_an_overwrite`); (c) the
  paired edit — `applyEdit` emits the sibling test's removal+addition pair, while the pre-delete
  edit on the source (appending `v1_helper`) is a `+`-only hunk and so a single addition revision.
  Reader-free (no bash redirect). Linear (no rewind): one surviving branch, two files.
  m5 (`m5-full-interleave`) is the FULL INTERLEAVE — user + agent edits straddling a CODE REWIND on
  one file `m5_interleave.py` (plus a sibling `tests/test_m5_interleave.py`, write only). No new
  machinery — it is locked, not fixed. It composes existing guarantees: (a) user-edit kept on the
  surviving lineage across the rewind — `selectBranchRecords` puts F's `user_add_1` snapshot in the
  surviving tip's ancestor chain (the S18/S20/S22 behavior), and the same append surfaces on BOTH
  branches with distinct changeIds (D `#5f68c3e1` rewound, F `#84166ae7` surviving); (b) rewound
  branch scoped by `divergingIds` in `buildRewoundBranchHistory`, holding `agent_add_1` (E) only —
  the FIRST m-series scenario with a rewind, so the conversationDAG is branched; (c) the S19 reseed
  FIRING — the surviving `agent_add_2` Edit (G) records a base that includes the backup-only
  `user_add_2` line, so the on-branch base reconstructs too SHORT (3 lines), `editBaseIsStale`
  returns true (the "base too short" case), and `seedStaleEditBases`/`backupSeedWriteFor` recover
  `17bbea89afb745a4@v5` as a synthetic `overwrite` revision before G (surviving source = 4 revisions
  [write, user-edit, overwrite, edit]); meanwhile the rewound `agent_add_1`'s base is aligned so the
  reseed stays INERT there, making the rewound branch reader-independent. m5 is the FIRING complement
  of m3's dormant reseed and the first to recover a USER edit's disk state from a backup; reader
  changes only the intermediate ladder, never the byte-identical endpoint.
  m6 (`m6-cp-user-edit-rewind`) is a cp-FORK (m1) of `m6_source.py` → `m6_derived.py`, a USER
  out-of-band edit inserting `# derived version` into the copy, then a CODE REWIND that discards
  Claude's `transform()` (rewound branch) in favour of `validate()` (surviving branch) — the FIRST
  m-series scenario combining a fork, a user edit on the forked copy, and a rewind, and the FIRST
  with a WRONG reconstructed OUTPUT on a rewound branch (so the FIRST real engine fix since
  S19/S23). The bug: the original out-of-band user edit (`8897e505`) is on the abandoned lineage
  and `extractFileEvents` emits NO file event for it, so the rewound `m6_derived` lineage is just
  `[copy, edit]` and the `transform()` Edit's hunk (`oldStart=5`, context `[blank, describe,
  return]`) would splice onto the bare 6-line copy — the third context line resolves PAST the base
  and `insertHunkAdditions`/`resolveContextLine` materialise it as a genesis line, DUPLICATING
  `return self.name`. `editBaseIsStale` correctly DETECTS this, but the recovery was inert: the only
  pre-edit backup (`b90d0fcb711472b4@v1`) is timestamped 22 ms AFTER the edit's tool-use time (the
  user edit and the edit consuming it share one turn), so `findBackupAtOrBefore` (≤ when) missed it.
  THE FIX adds `findBackupPointAfter` (the BackupPoint variant of `findBackupAfter`) and an
  `includeAfter` flag on `backupSeedWriteFor` that falls back to the nearest strictly-later backup
  ONLY when no at-or-before backup exists; `staleEditSeedFor` passes `includeAfter=true`, while
  `seedEditBaseFromBackup` (spec-39 first-event-edit) keeps the `false` default so its at-or-before
  semantics — and every prior reseed (m5/S19/S23, which all have an at-or-before backup) — stay
  byte-identical. The rewound branch then reconstructs as `[copy, overwrite, edit]` (the overwrite =
  the backup-recovered 7-line `# derived version` base) ending at the 10-line `transform()` with NO
  duplicate. Unlike m5, m6's rewound ENDPOINT is reader-DEPENDENT: without a `BackupReader` the
  duplicate persists (engine/CLI tests lock both directions).
  m7 (`m7-conv-rewind-no-user-edits`) is a conversation-only rewind with NO user edits. One source
  file `m7_conv.py`: written (step1), edited (+step2), edited (+step3), then a `Rewind:3` (conv-only
  — disk NOT restored) forks the conversation back to just after the step1 Write, and a final Edit
  inserts `step2_alt` before step3. Two branches of `m7_conv.py`: rewound = step1→+step2→+step3
  (reader-independent; bases in the JSONL), surviving = step1 → [off-branch disk step1+step2+step3]
  → +step2_alt. No new machinery — it is LOCKED, not fixed. It composes existing guarantees: (a)
  branch enumeration — `findConversationBranches` + `findStructuralRewoundBranches` discover the
  rewound branch structurally from the parentUuid fork (no last-prompt head, as in S14/S17); (b) the
  surviving stale-edit-base reseed — because the off-branch edits D/E are scoped out, the surviving
  branch's reconstructed base for the step2_alt Edit is the 2-line step1, but the Edit's
  structuredPatch expects the 10-line on-disk file, so `editBaseIsStale` detects the mismatch and
  `backupSeedWriteFor` recovers the 10-line disk from file-history backup `29a113119f194d6f@v4`,
  inserted as an `overwrite` revision before the Edit replays (the S19/m5 reseed, here firing because
  OFF-BRANCH CLAUDE EDITS — not a user edit — advanced the disk; FIRST such case). The reseed
  precedes the edit so m6's `includeAfter` after-fallback is not used. The born-path alone would drop
  step2 (the surviving Edit's hunk context covers only step3), which is why m7 is reader-dependent
  where S17 was not. Reader-ASYMMETRIC: the surviving branch needs a `BackupReader` (without it step2
  collapses and the file is 2 corrupted revisions), the rewound branch does not — first scenario
  split that way.
  S24 (`s24-script-rename-functions`) is the FIRST script-driven trigger of the `edited_text_file`
  disk-echo path (the S15 user-edit family). One source file `order_utils.py` is written with terse
  function names, edited twice, then rewritten by an EXTERNAL `python3 rename_funcs.py` run through
  the Bash tool (a whole-word `def` rename) — NOT by Edit/Write — and edited twice more on the renamed
  base. The two `python3` Bash runs are OPAQUE: unlike m3's `>>` redirects they are NOT parsed as file
  ops and emit ZERO file events. What carries the rename is a BEACON: the harness auto-snapshots the
  changed file immediately after the script run as an `edited_text_file` attachment (uuid
  `859347d2…`), which `userEditEventFrom` turns into a `user-edit` event (changeId = the message uuid,
  content = `stripLineNumberPrefixes(snippet)`); `userEditChangesContent` records it as the rev3
  revision because the renamed content differs from the prior terse belief, and `userEditRevision`
  emits it. The later Edits replay on the renamed base (their recorded `originalFile` already shows the
  renamed disk), so `editBaseIsStale`/`seedStaleEditBases` stay INERT (six revisions, not seven).
  Reader-INDEPENDENT — the renamed content is in the in-JSONL attachment snippet, never a file-history
  backup (locked with a poison reader that returns garbage and is provably ignored). This is the
  clean-room HAS-BEACON case of the sibling RevEng "Script-Execution-as-Authored-Event" rule (APPROVED
  `…/RevEng/plans/{spec,plan,tasks}-script-execution-replay.md`): a beacon exists with ZERO intervening
  edits between the script run and the snapshot, so the immediate post-script state is DIRECTLY
  OBSERVED — the engine adopts the beacon as the post-script revision and needs NO script-execution
  replay or forward-validation (that machinery is only for NO-BEACON files). No engine change — it is
  LOCKED, not fixed. Linear: one surviving branch (tip #fba814f7), no rewound branch.
  S25 (`s25-script-rename-multi-file`) is the MULTI-FILE extension of S24, and the FIRST scenario
  where a HAS-BEACON file STILL needs the backup reader. ONE `python3 rename_geo.py` Bash run rewrites
  THREE tracked files at once (`geo_core.py`, `geo_report.py`, `tests/test_geo_core.py`), so the single
  opaque run produces THREE `edited_text_file` beacons (one per file, uuids `dd04eabc…`/`755a78dd…`/
  `fcaacf80…`) that `userEditEventFrom` turns into three `user-edit` revisions — S24 ×3. The new lesson
  is MIXED reader-dependence. `geo_core.py` (8 revs) and `tests/test_geo_core.py` (2 revs) are
  reader-INDEPENDENT: their beacons are complete snapshots, so later Edits splice cleanly and a poison
  reader is provably ignored. `geo_report.py` (7 revs) is reader-DEPENDENT: its beacon is an INCOMPLETE
  77-line snapshot, but the post-script `totals` Edit was computed against the true 95-line disk state.
  So the m6 backup-seed fires — `seedEditBaseFromBackup`/`backupSeedWriteFor`/`findBackupPointAfter`
  reseed a synthetic `overwrite` revision keyed `a5675d5dd5201ac8@v4` (the 95-line base) before
  `applyEdit` replays the `totals` Edit. Without a backup the reseed can't fire (6 revs, truncated
  final — provably wrong); the `@v4` backup is load-bearing. This REFINES the HAS-BEACON rule:
  "beacon alone suffices" governs the post-script revision itself; the base-alignment of a LATER Edit
  is the m6 concern, solved by a backup-seed (NOT a script transform). No script-execution-replay is
  needed or added. No engine change — LOCKED, not fixed. Linear: one surviving branch (tip #e3b43fcc),
  four files, no rewound branch.
  S26 (`s26-script-rename-csv-map`) is the CSV-MAP / data-driven variant of S25 and the STRUCTURAL
  INVERSION of its mixed-reader crux. ONE `python3 apply_renames.py` Bash run rewrites TWO tracked
  sources (`billing.py`, `tests/test_billing.py`), but the rename mapping is READ from a tracked
  `renames.csv` (header + 4 pairs) rather than hardcoded — so `renames.csv` and `apply_renames.py` are
  ordinary Claude `Write`s and the rename itself surfaces via TWO `edited_text_file` beacons (uuids
  `298a585d…` billing / `507c3e6b…` test_billing) that `userEditEventFrom` turns into `user-edit`
  revisions. The load-bearing finding: `billing.py` ALSO carries a post-script Edit (`print_invoice`),
  exactly like S25's `geo_report.py` — but its beacon is a COMPLETE 149-line snapshot, so the Edit's
  recorded base matches it and the splice is clean (149 → 177 lines) with NO backup-seed. So
  `seedEditBaseFromBackup`/`backupSeedWriteFor` stay INERT and NO `overwrite` revision is injected
  anywhere; ALL FOUR files are reader-INDEPENDENT (provably ignored under a poison reader). This proves
  a post-script Edit ALONE does NOT force reader-dependence — only an INCOMPLETE beacon does (S25's
  `geo_report`). The first scenario where a HAS-BEACON file with a post-script Edit is STILL
  reader-independent — the exact complement of S25, confirming the m6 backup-seed correctly STAYS
  DORMANT when the beacon is complete. `billing.py` = 4 revs [write, edit, userEdit, edit] (pure
  insertions, no removal/addition split) → 177 ln / 5813 ch; `test_billing.py` = 2 revs
  [write, userEdit] → 60 ln / 1394 ch; `renames.csv` = 1 [write] → 5 ln / 106 ch; `apply_renames.py`
  = 1 [write] → 43 ln / 1125 ch. No engine change — LOCKED, not fixed. Linear: one surviving branch
  (tip #ae7838c8), four files, no rewound branch.
  S27 (`s27-script-rename-edited-before-run`) is the FIRST script-rename scenario to require an engine
  change, and the first use of a file's FINAL backup (highest version) rather than a timestamp-relative
  one. ONE `python3 rename_inv.py` Bash run rewrites `inventory.py` + `tests/test_inventory.py`; the
  rename script is WRITTEN then EDITED TWICE before it runs, and `inventory.py` gets a `restock` Edit
  after. The new failure mode: `tests/test_inventory.py`'s post-script `edited_text_file` beacon is
  TRUNCATED (a 50-line prefix of the true 73-line file) AND it is the file's LAST event — there is NO
  downstream Edit to reseed against (the S25 `geo_report` rescue path never engages), so the engine
  adopts the truncated snippet verbatim and the file is short by 23 lines / 621 bytes. The fix is a new
  reader-only event-list transform `completeTruncatedBeacon` (in the new `reconstruction_reseed.ts`,
  alongside the stale-edit cluster moved out of `reconstruction_branches.ts` to respect the 250-line
  cap): when a file's LAST event is a `user-edit` beacon whose snippet is a byte-PREFIX of the file's
  LATEST file-history backup (`latestBackupWriteFor`, reconstruction_sidecar.ts → `df7b79499e8a9377@v3`)
  AND the backup has strictly MORE lines, append a synthetic Write so `writeRevision` records a terminal
  `overwrite` of the COMPLETE 73-line file. The truncation test is a LINE-COUNT comparison (not raw byte
  length), so a backup differing from a COMPLETE beacon only by a trailing newline is NOT treated as
  truncated — every prior complete terminal beacon (S25 `test_geo_core`, S15–S23 / m-series) passes
  through unchanged; and the `last.kind === userEdit` trigger excludes `inventory.py`/`rename_inv.py`
  (end on Edit) and S25's `geo_report` (ends on `totals` Edit). Distinct from S25's DOWNSTREAM-Edit
  reseed: S27 completes a TERMINAL truncated beacon directly. MIXED reader-dependence: `inventory.py`
  (6 revs [write,edit,edit,edit,userEdit,edit] → 8442 ch) and `rename_inv.py` (5 revs → 1449 ch) are
  reader-INDEPENDENT; `tests/test_inventory.py` (3 revs [write,userEdit,overwrite] → 2215 ch) is
  reader-DEPENDENT (without a backup it is the truncated 1594-ch 2-rev wrong result; a poison reader is
  rejected by the `startsWith` guard). Linear: one surviving branch (tip #7e94e313), three files, no
  rewound branch. REAL fix (first since S19/S23/m6).
  S28 (`s28-script-rename-scope`) is the SECOND script-rename `src/` change, handling the ELIDED
  (WINDOWED) beacon and the first selection of a NON-latest backup version. ONE `python3
  scoped_rename.py` Bash run rewrites sources from a `scoped_renames.csv` with an `isExported` column
  (`Y` = rename across all files, `N` = rename only the named file). The new failure mode: two of the
  three post-script `edited_text_file` beacons are ELIDED — the harness showed only a WINDOW of the file
  (bare `...` separators and/or starting past line 1), and `stripLineNumberPrefixes` discards the line
  numbers that reveal the gaps, so the engine adopts the windowed snippet verbatim. `tests/test_catalog.py`'s
  beacon is TERMINAL MID-ELIDED (lines 1–9, `...`, 17–33, `...`, 39–102) — NOT a byte-prefix, so S27's
  `completeTruncatedBeacon` cannot fire. The fix is a new reader-only event-list transform
  `completeElidedBeacons` (in `reconstruction_reseed.ts`): for EACH `user-edit` beacon whose RAW `cat -n`
  snippet is elided (a new `beaconSnippetFor`/`BeaconSnippet` parser in `reconstruction_user_edit.ts`
  re-reads the numbered snippet `stripLineNumberPrefixes` threw away, detecting elision as first
  line# > 1, a line-number gap, or a literal `...`), find the file-history backup version whose numbered
  content reproduces EVERY visible beacon line (forward-validation via `backupMatchesBeacon`) and splice
  a synthetic Write of it immediately AFTER the beacon. A new `backupWritesFor` (reconstruction_sidecar.ts)
  enumerates ALL backup versions — `latestBackupWriteFor` now reuses it — because VERSION SELECTION IS BY
  CONTENT, not recency: `catalog_view.py`'s correct base is `a8b61336832f339e@v3` (post-script,
  pre-`preview`), NOT the latest `@v4` (whose lines 11–41 shifted under the `preview` insertion and fail
  validation). Wired BEFORE `seedStaleEditBases` and `completeTruncatedBeacon`, and disjoint from S27 (a
  contiguous-from-1 prefix is NOT elided, so S27's terminal tail-truncation stays its job). MIXED
  reader-dependence: `catalog.py` (5 revs → 6749 ch, COMPLETE beacon), `scoped_rename.py`/`scoped_renames.csv`
  (1 write each → 1898 / 83 ch) reader-INDEPENDENT; `tests/test_catalog.py` (3 revs
  [write,userEdit,overwrite] → 2665 ch) and `catalog_view.py` (6 revs [write,userEdit,overwrite,edit,edit,edit]
  → 2067 ch) reader-DEPENDENT. NOTE (verified, deviation from the plan): only `tests/test_catalog.py`
  genuinely depends on the new code — `catalog_view.py`'s non-terminal beacon was ALREADY completed to
  2067 by the pre-existing `seedStaleEditBases` (the window renumbers its `preview` Edit anchors so
  `editBaseIsStale` is true); `completeElidedBeacons` is its explicit primary handler with that path as an
  inert fallback. Linear: one surviving branch (tip #2114511a), six surviving (incl. the stray
  `/tmp/cat.txt`), no rewound. REAL fix.

  S29 (`s29-script-rename-repo-walk`) adds NO code — it is the COMPOSITION / regression lock for
  `completeTruncatedBeacon` (S27) + `completeElidedBeacons` (S28) + the no-beacon vendor CONTROL, all
  exercised under a single recursive-walk script run. ONE `python3 walk_rename.py` Bash run `os.walk`s the
  tree, SKIPS any directory named `vendor`, and whole-word renames `helper→compute_value` in every other
  `.py` file (the file list is DISCOVERED by walking, not hardcoded). The run emits SIX `edited_text_file`
  beacons in every shape the engine already handles, all at once: ONE COMPLETE (`pkg/__init__.py`, adopted
  verbatim), FOUR TRUNCATED (`tests/test_pkg.py`, `main.py`, `pkg/b.py`, `walk_rename.py` →
  `completeTruncatedBeacon`), ONE ELIDED (`pkg/a.py` → `completeElidedBeacons`). The two `pkg/vendor/*`
  files get NO beacon (the walk skipped them), so the engine keeps their original `write` — they must still
  read `helper`, never `compute_value`, reader-INDEPENDENT and poison-stable (the headline control). Version
  selection stays BY CONTENT, not recency: `pkg/a.py`→`38dbed748662c3cb@v4` over the same-128-line `@v3`,
  `pkg/b.py`→`e5663c2564dcb2d1@v3` over the same-101-line `@v2` (then the `pipeline` Edit replays on top).
  `walk_rename.py` is SELF-MODIFYING (the walk rewrites its own string literals). MIXED reader-dependence:
  `pkg/__init__.py` + the two vendor controls are reader-INDEPENDENT; the four truncated/elided files +
  `pkg/b.py` are reader-DEPENDENT. `pkg/b.py` leaks poison under a degenerate reader via the pre-existing
  `seedStaleEditBases` path (prior-scenario behaviour, excluded from poison asserts). GROUND-TRUTH GAP: the
  `pkg/` subtree was not rendered to disk, so the `pkg/*` cruxes are locked via inline file-history backup
  blobs (engine test) and the real reader (CLI test). Linear: one surviving branch (tip #e6bfddf3), eight
  files, no rewound. Characterization LOCK — no `src/` change.

  S30 (`s30-script-rename-count-mismatch`) adds NO code — it is the regression lock for
  `completeElidedBeacons` (S28) under a CONDITIONAL / partial-apply script run, plus the reader-independence
  of a COMPLETE beacon followed by a downstream Edit. ONE `python3 safe_rename.py` Bash run reads
  `count_renames.csv` (`old,new,count`) and applies each rename to BOTH `pricing.py` and
  `tests/test_pricing.py` ONLY when the whole-word occurrence count of `old` matches the row's `count`,
  else prints `MISMATCH` and leaves that name unchanged everywhere. `round_price→round_to_cents` (8==8)
  APPLIES; `base_price→unit_price` (11!=10, off by one) is REFUSED. The engine adopts the post-script
  beacons and never re-derives the rename, so the refusal costs nothing: the beacons already show the
  applied rename and the retained `base_price`, and nothing in the pipeline can fabricate `unit_price` (it
  exists only as a string in the CSV — in no beacon, edit, or backup). `pricing.py` has a COMPLETE 155-line
  beacon then the downstream `receipt` Edit, so it is reader-INDEPENDENT (real==without==poison; the
  `seedStaleEditBases` reseed is INERT — the Edit replays off the complete beacon); `tests/test_pricing.py`
  has an ELIDED 39-line beacon (lines 1–40, `...` eliding 19–20) completed by `completeElidedBeacons` to the
  content-validated `b1770edab554937c@v3` (post-rename) over the same-40-line `@v2` (pre-rename) —
  reader-DEPENDENT. `count_renames.csv` and `safe_rename.py` get no beacon and reconstruct from their
  `write` events alone. NO poison leak anywhere (a clean matrix, unlike S29's `pkg/b.py`). Mutation: only
  neutralizing `completeElidedBeacons` diverges (test_pricing.py 1035→977); `completeTruncatedBeacon` and
  `seedStaleEditBases` are both inert. Linear: one surviving branch (tip #e61d0ae0), four files, no rewound.
  Characterization LOCK — no `src/` change.
  S31 (`s31-script-rename-many-rows`) adds NO code — it is the MANY-ROW regression lock, the sibling of
  S25/S26/S29 that pins SCALE: twelve whole-word renames applied in a single run with no per-row
  degradation, via the ordinary HAS-BEACON path (no rescue stage). ONE `python3 bulk_rename.py` Bash run
  reads a TWELVE-row `many_renames.csv` (header `old,new`) and applies every `\bold\b`→`new` rename across
  `textutil.py` and `tests/test_textutil.py`. Both files are HAS-BEACON with COMPLETE beacons (textutil
  205 L full file `98ce2cbf`, test 71 L full file `590f882d`), so the engine adopts the fully-renamed state
  for free and NO rescue stage fires — `completeTruncatedBeacon` (S27), `completeElidedBeacons` (S28), and
  `seedStaleEditBases` (S19) are all inert; every file is reader-INDEPENDENT with a clean poison matrix.
  The edit-ordering crux: `normalize` was added BEFORE the run (its body referenced the OLD `trim`/`low`),
  so the script renamed its body (final docstring references `trim_whitespace`/`lowercase`); `headline` was
  added AFTER the run and replays on top of the renamed beacon (rev 3), referencing the NEW
  `capitalize`/`slugify`. Whole-word vs substring: 11 of 12 old names have ZERO whole-word matches in final
  `textutil.py`, but `\bslug\b` appears TWICE as English prose in `headline`'s post-rename docstring (not a
  missed rename) — absence assertions use `\bname\b`, never bare `includes()`. `extractFileEvents`:
  writes=4, edits=2 (`normalize`+`headline`, both on textutil.py — 2, not 3), userEdits=2, overwrites=0.
  Linear: one surviving branch (tip #1349c502), four files, no rewound. Characterization LOCK — no `src/`
  change.
  S32 (`s32-script-rename-mcp-exec`) is the FIRST script-rename whose rename script runs through the
  **context-mode MCP sandbox** (`mcp__plugin_context-mode_context-mode__ctx_execute`, shell
  `python3 rename_config.py`) instead of the Bash tool — and the FIRST scenario to touch the PARSER
  (`src/parse/loadTranscript.ts`) rather than the reconstruction/replay layer. The MCP-invoking assistant
  records carry two novel top-level keys (`attributionMcpServer` = `plugin:context-mode:context-mode`,
  `attributionMcpTool` = `ctx_execute`) on all 19 MCP turns; at HEAD the field-gate
  `assertOnlyKnownTopLevelKeys` throws `UnmodeledFieldError` at parse time, gating EVERY file. The fix is
  ONE line — add the two keys to the assistant entry of `ALLOWED_TOP_LEVEL_KEYS` (assistant-only attribution
  fields; NOT added to `ENVELOPE_KEYS` — only MCP-calling assistant records carry them). No downstream code
  reads them; `assertOnlyKnownTopLevelKeys` is purely permissive. After the fix the whole scenario
  reconstructs byte-perfectly with no further change: the rename `get_val`→`get_value`, `set_val`→`set_value`,
  `del_val`→`delete_value` across `config_utils.py` and `tests/test_config_utils.py` (`has_val`/`merge_val`
  kept) surfaces via TWO COMPLETE `edited_text_file` beacons the harness injects right after the MCP run
  (uuids `d9cbc214` config / `c7922fde` test) — the same HAS-BEACON mechanism as s24/s31, so both renamed
  files are reader-INDEPENDENT (every rescue stage INERT: `completeTruncatedBeacon` S27,
  `completeElidedBeacons` S28, `seedStaleEditBases` S19). `plans/script-handling.txt` already names the MCP
  sandbox as a HAS-BEACON-governed invisible-mutation source. Edit-ordering crux: `get_or_default` (added
  BEFORE the run) had its body renamed by the script (final references `get_value`); `apply_overrides` (added
  AFTER the run) replays on the renamed beacon and references `get_value`/`set_value`. `extractFileEvents`:
  writes=3, edits=6 (all on config_utils.py), userEdits=2 (`c7922fde`,`d9cbc214`), overwrites=0. Per-file:
  `config_utils.py` 11 revisions → 260 L, `tests/test_config_utils.py` 2 revisions → 87 L, `rename_config.py`
  1 revision → 62 L. Linear: one surviving branch (tip #1be0133f), three files, no rewound. The ONE-LINE
  parser fix is the first `src/` change in the s25–s32 series; mutation proof: reverting it sends 7 s32
  tests RED with `UnmodeledFieldError` — the parser-gate test + all 6 CLI tests (which load through the
  GATED `loadTranscript` via `runCli`) — and re-applying restores green. The 8 engine tests build via the
  UNGATED `loadRecords` (`parseRecord`, no field gate — the s31 pattern), so they lock reconstruction OUTPUT
  but stay green across the revert; the fix's necessity rests on the gated CLI + parser-gate tests.
  S33 (`s33-script-rename-csv-user-edit`) adds NO code — it is the CSV-USER-EDIT regression lock, the
  sibling of S25/S29/S31/S32 whose NOVEL twist is that the rename MAPPING file itself is USER-EDITED
  before the script consumes it. ONE `python3 apply_renames.py` Bash run reads `renames.csv` and applies
  each `\bold\b`→`new` whole-word rename across `billing.py` and `tests/test_billing.py`. The novel
  element: `renames.csv` is WRITTEN with a header + 3 rows (`calc_tot,calculate_total` /
  `fmt_money,format_currency` / `apply_disc,apply_discount`) then USER-EDITED to APPEND a 4th row
  `chk_stock,check_stock` BEFORE the run — so `renames.csv` reconstructs to a 2-revision ladder (rev 0 =
  4 lines without the 4th row, rev 1 = 5 lines with it). That CSV user-edit is LOAD-BEARING: the
  post-script `reorder` Edit on `billing.py` calls `check_stock`, a name that exists ONLY because the
  manual 4th row flowed through the script — so `billing.py`'s final correctness depends transitively on
  the manual CSV edit. Both renamed files are HAS-BEACON with COMPLETE beacons (billing `4480f645`, test
  `c7415420`), so the engine adopts the fully-renamed state for free and NO rescue stage fires
  (`completeTruncatedBeacon` S27, `completeElidedBeacons` S28, `seedStaleEditBases` S19 all inert); every
  file is reader-INDEPENDENT with a clean poison matrix. THREE user-edits, mixed provenance:
  `4480f645`/`c7415420` are the two script-run beacons, `b8591d24` is the GENUINE manual `renames.csv`
  edit (not a beacon) — the engine treats all three uniformly, which is why no engine change is needed.
  Edit-ordering crux: `validate` was added BEFORE the run and references no terse name, so the rename
  left it untouched (neither old nor new terse names appear in it); `reorder` was added AFTER the run and
  replays on the renamed beacon, calling `check_stock`/`calculate_total`. No kept-name hazard here (unlike
  S31/S32 — the test method names embed no terse substring), but absence assertions still use `\bname\b`
  because the new names appear ~16× in `billing.py` docstrings (prose hazard). `extractFileEvents`:
  writes=4, edits=2 (`validate`+`reorder`, both on billing.py), userEdits=3
  (`4480f645,b8591d24,c7415420`), overwrites=0. Per-file: `billing.py` 4 revisions → 187 L
  (146→164→164→187), `tests/test_billing.py` 2 revisions → 51 L, `renames.csv` 2 revisions → 5 L (4→5),
  `apply_renames.py` 1 revision → 51 L. Linear: one surviving branch (tip #c3d6846d), four files, no
  rewound. Characterization LOCK — no `src/` change.
  S34 (`s34-script-rename-driver-back-and-forth`) is a REAL engine fix — the first since m6/S28 — plus a
  mandatory module split. ONE `python3 apply_renames.py` Bash run reads `renames.csv` and applies four
  `\bold\b`→`new` whole-word renames (`add_entry→record_entry`/`rm_entry→remove_entry`/
  `tot_debits→total_debits`/`tot_credits→total_credits`) across `ledger.py` and `tests/test_ledger.py`.
  The "back and forth" is the interleaving around the driver: `renames.csv` is written with 2 rows, the
  driver `apply_renames.py` is written, and a 3rd CSV row (`tot_credits,total_credits`) is appended manually
  — the driver write sits BETWEEN two manual CSV edits. THE SOLE ENGINE GAP: `ledger.py` gets a manual
  trailing append (`# names normalized via rename script`) AFTER the script-rename beacon but BEFORE a later
  Claude `report` Edit. That append left NO `edited_text_file` beacon and NO tool_use, and it lands OUTSIDE
  the `report` edit's hunk window — whose context (`if __name__ == "__main__":`) still matches the 173-line
  beacon base perfectly. So the existing hunk-context staleness test (`editBaseIsStale`) returns FALSE, no
  reseed fires, and the trailing line is silently dropped → `ledger.py` reconstructs to 186, ground truth
  187. THE FIX (REAL, reader-only): a SECOND staleness trigger in `staleEditSeedFor` — `outOfWindowEditSeed`
  detects an Edit whose hunk context matches the reconstructed base but whose real pre-edit disk carried an
  uncaptured change OUTSIDE the window, by content: a file-history backup (`d5ade1bd80e08f91@v4`, 174 L,
  taken after the beacon and at/before the edit) that is STRICTLY NEWER than the file's last captured event,
  whose content DIFFERS from the reconstructed base, AND onto which the edit's first hunk still splices
  cleanly (forward-validation — a poison/wrong backup is rejected, never fabricated). `editBaseIsStale` is
  refactored to share `firstHunkMatchesBase` with this new path; the two triggers are DISJOINT (the s19/s23/m6
  path fires only when the hunk context is stale; the s34 path only when it is clean). Gated so it runs only
  inside `seedStaleEditBases` (reader present) → reader-free reconstruction is byte-for-byte untouched, and
  the full pre-s34 suite stays green. MODULE SPLIT (mandatory, `split, never condense`): the fix pushes
  `reconstruction_reseed.ts` past the 250-line cap, so the beacon-completion family (`completeTruncatedBeacon`
  S27 / `completeElidedBeacons` S28 + their private helpers) MOVED to a new `src/reconstruction_beacons.ts`;
  `reconstruction_branches.ts` imports each directly (no re-export shim — no-forwarding-layers). Both modules
  end at 145 lines. `renames.csv` reconstructs via the EXISTING S27 `completeTruncatedBeacon` (its step-7
  append left a 4-line beacon that is a prefix of the 5-line `@v3` backup) — the s34 fix does NOT touch it.
  S34 is reader-DEPENDENT (no-reader: `ledger.py`=186, `renames.csv`=4 — the RED proof; real reader after
  fix: 187/5). The post-script `report` (calls renamed `record_entry`/`total_debits`) and pre-script `audit`
  (body renamed in place to `total_debits`/`total_credits`) both reach the renamed names. `extractFileEvents`:
  writes=4, edits=2 (`audit`+`report`, both on ledger.py), userEdits=4 (`0ee68aad,2a0d75ba,720ee20c,ba8ee917`
  — the step-7 and step-9 appends left no beacon, so they are NOT in the multiset; recovered from backups at
  replay), overwrites=0. Per-file (real reader): `ledger.py` 6 revisions → 187 L (156→157→173→173→174→187, the
  174 = the synthetic out-of-window reseed), `tests/test_ledger.py` 2 → 57 L, `renames.csv` 3 → 5 L (3→4→5),
  `apply_renames.py` 1 → 54 L. The synthetic reseed Write's changeId is the backup blob name, kept out of the
  DAGs (spec 40), so it surfaces only as a `--verbose` revision — `ledger.py`'s fileDAG stays 5 nodes. Linear:
  one surviving branch (tip #97e510eb), four files, no rewound. 12 new tests (6 engine + 6 CLI); 463 → 475.
  S35 (`s35-script-rename-script-user-edit`) adds NO code — it is the COMPLEMENT of S33: the same
  "a file is user-edited before the script run" shape, but the script-phase beacons here are INCOMPLETE, so
  the EXISTING rescue stages FIRE (where S33's were all INERT). ONE `python3 rename_inv.py` Bash run applies
  three `\bold\b`→`new` whole-word renames (`qty_chk→check_quantity`/`add_item→insert_item`/
  `rm_item→remove_item`) across `inventory.py` and `tests/test_inventory.py`. THE NOVEL ELEMENT: the file
  user-edited before the run is the RENAME SCRIPT ITSELF — `rename_inv.py` is written with ONE rename tuple,
  then user-edited TWICE (steps 4 & 5 add the 2nd/3rd tuples), and those two edits COALESCE into a SINGLE
  ELIDED `edited_text_file` beacon (`#c67cfd9c`, a 17-line head+tail-cut fragment); S28 `completeElidedBeacons`
  recovers the full 45-line 3-tuple script from backup `41364cab6ad88cbb@v2`. MIXED beacon completeness in one
  run: `inventory.py`'s script beacon is COMPLETE (no rescue, reader-INDEPENDENT, 244 L) while
  `tests/test_inventory.py`'s is TRUNCATED (a 51-line prefix completed by S27 `completeTruncatedBeacon` from
  backup `5ea404c2628560f6@v3` → 79 L). S35 is reader-DEPENDENT (MIXED, like S25): with NO reader the two
  incomplete beacons fall back to their raw fragments (`test`=51/2-revs, `rename`=17/2-revs) while inventory is
  unaffected (244); a poison reader is rejected by the S27/S28 content guards (no `"POISONED"` leak). The
  post-script `restock` Edit replays on the renamed beacon and calls the NEW `check_quantity`/`insert_item`;
  pre-script `low_stock` references no rename-set name (left untouched). KEPT-NAME hazard (S31/S32): terse-but-
  unrenamed `find_item`/`tot_value` survive, and `test_inventory.py` method names `test_qty_chk_*` keep
  `qty_chk` as a SUBSTRING (`_`-bounded, so `\bqty_chk\b` does not match) — absence assertions use `\bname\b`
  ONLY. `extractFileEvents`: writes=3, edits=2 (`low_stock`+`restock`, both on inventory.py), userEdits=3
  (`c67cfd9c` script edit + `dbc2e4c1`/`f3e90535` run beacons), overwrites=0. Per-file (real reader):
  `inventory.py` 4 revisions → 244 L (172→192→192→244), `tests/test_inventory.py` 3 → 79 L (79→51→79),
  `rename_inv.py` 3 → 45 L (43→17→45). The synthetic completion changeIds are backup blob names, kept out of
  the DAGs (spec 40) → fileDAG: inventory 4 nodes, test 2, rename 2. Linear: one surviving branch (tip
  #72049b4a), three files, no rewound. 12 new tests (6 engine + 6 CLI); 475 → 487.

  S36 (`s36-script-rename-csv-user-edit-mcp`) adds NO code — it is the MCP-SANDBOX TWIN of S33: the same
  CSV-user-edit whole-word rename shape, but the rename driver runs through the context-mode MCP sandbox
  (`ctx_execute`) instead of the Bash tool. The ONE thing that makes s36 distinct from S33: loading the JSONL
  depends on S32's ALREADY-SHIPPED parser fix — the MCP-run assistant records carry
  `attributionMcpServer:"plugin:context-mode:context-mode"`/`attributionMcpTool:"ctx_execute"` (7 such
  records), keys S32 added to the assistant allow-set in `src/parse/loadTranscript.ts`; with that fix present
  the engine clears s36 end-to-end with no new code (were it reverted, `loadRecords` would throw
  `UnmodeledFieldError`). ONE `apply_renames.py` MCP run reads `renames.csv` and applies each `\bold\b`→`new`
  whole-word rename across `billing.py` and `tests/test_billing.py`. THE CSV ELEMENT (shared with S33):
  `renames.csv` is written with a header + 3 rows then USER-EDITED to append a 4th row `chk_stock,check_stock`
  BEFORE the run, so it reconstructs to a 2-revision ladder (rev0 = 4 lines WITHOUT the 4th row; rev1 = 5 lines
  WITH it). THE CSV USER-EDIT IS LOAD-BEARING: the post-script `reorder` Edit on `billing.py` calls
  `check_stock`, a name that exists ONLY because that manual 4th row flowed through the MCP run. Both run
  beacons are COMPLETE (`#de1f5023` billing / `#aecbb827` test), so the engine adopts the fully-renamed state
  FOR FREE — no rescue stage fires (`completeTruncatedBeacon` S27 / `completeElidedBeacons` S28 /
  `seedStaleEditBases` S19 all INERT), every file reader-INDEPENDENT (a poison reader changes nothing and
  leaks no `"POISONED"`). The engine treats all three user-edits UNIFORMLY (`96b40a66` manual CSV edit +
  `de1f5023`/`aecbb827` run beacons) — why no engine change is needed. WHOLE-WORD HAZARD — `apply_disc`: the
  renamed `apply_discount` contains `apply_disc` as a prefix substring 5× in final `billing.py`, so absence
  assertions use `\bold\b` (count 0), never bare `includes()`. NO kept-name hazard (unlike S31/S32). The
  post-script `reorder` replays on the renamed beacon (calls NEW `check_stock`/`calculate_total`); pre-script
  `validate` references no rename-set name (left untouched). `extractFileEvents`: writes=4, edits=2
  (`validate`+`reorder`, both on billing.py), userEdits=3 (`96b40a66,aecbb827,de1f5023`), overwrites=0.
  Per-file: `billing.py` 4 revisions → 219 L (156→184→184→219), `tests/test_billing.py` 2 → 50 L (50→50),
  `renames.csv` 2 → 5 L (4→5), `apply_renames.py` 1 → 51 L. Linear: one surviving branch (tip #a7ed17a3),
  four files, no rewound. 12 new tests (6 engine + 6 CLI); 487 → 499.

  S37 (`s37-script-rename-driver-back-and-forth-mcp`) adds NO code — it is the MCP-SANDBOX TWIN of S34 (as
  S36 is to S33): the same `ledger.py` driver-back-and-forth whole-word rename shape, but the driver runs
  through the context-mode MCP sandbox (`ctx_execute`) instead of the Bash tool. As with S36, loading the
  JSONL depends on S32's ALREADY-SHIPPED parser fix — the MCP-run assistant records carry
  `attributionMcpServer:"plugin:context-mode:context-mode"`/`attributionMcpTool:"ctx_execute"` (6 such
  records), keys S32 added to the assistant allow-set in `src/parse/loadTranscript.ts` (were it reverted,
  `loadRecords` would throw `UnmodeledFieldError`). Every rescue stage s37 leans on is already shipped (S27
  `completeTruncatedBeacon` / S28 `completeElidedBeacons` / S34 `outOfWindowEditSeed`), so the engine clears
  s37 end-to-end with no new code. ONE `apply_renames.py` MCP run reads `renames.csv` and applies four
  `\bold\b`→`new` renames (`add_entry→record_entry`/`rm_entry→remove_entry`/`tot_debits→total_debits`/
  `tot_credits→total_credits`) across `ledger.py` and `tests/test_ledger.py`. THE "BACK AND FORTH" (shared
  with S34): `renames.csv` is written with header + 2 rows → manual user-edit appends `tot_debits,total_debits`
  (step-5 beacon `#22de8fa9`, 4 lines) → `apply_renames.py` is written → manual user-edit appends
  `tot_credits,total_credits` (step-7, 5 lines, NO BEACON, recovered via the EXISTING S27
  `completeTruncatedBeacon`) — the driver write sits BETWEEN the two manual CSV edits, and the last two
  renames exist ONLY because of those interleaved rows. Both MCP-run beacons (`#9022d09a` ledger / `#a4d3d115`
  test) arrive INCOMPLETE and are completed by the existing rescue stages; the step-9 `ledger.py` trailing
  append `# names normalized via rename script` left NO beacon and is recovered by S34's
  `outOfWindowEditSeed`. MIXED reader-dependence (like S25/S35, NOT uniform like S34): `ledger.py` (151) and
  `apply_renames.py` (66) are reader-INDEPENDENT; `tests/test_ledger.py` (real 69 / no-reader 68) and
  `renames.csv` (real 5 / no-reader 4) are reader-DEPENDENT. POISON CAVEAT (s34's T6 shape is WRONG for s37):
  a poison reader is rejected for the three GUARDED files (`test_ledger.py` 68 / `renames.csv` 4 /
  `apply_renames.py` 66, no `"POISONED"`), but `ledger.py`'s rescue path ACCEPTS the poison backup (collapses
  to 19, leaks `"POISONED"`) — a LATENT robustness gap in a rescue stage, NOT a correctness gap (real-reader
  AND no-reader both give the correct 151), OUT OF SCOPE for this char-lock; the poison test asserts
  cleanliness ONLY on the three guarded files and documents the ledger.py exclusion. EDIT-ORDERING CRUX:
  `report` (added AFTER the run) calls the NEW `record_entry`/`total_debits`; `audit` (added BEFORE the run)
  had its body RENAMED in place; both reaching the renamed names proves the CSV edits flowed through the MCP
  run. WHOLE-WORD hazard: new names recur in docstrings — absence assertions target OLD whole-word names ONLY;
  NO rename-pair substring hazard (simpler than S36's `apply_disc`). `apply_renames.py` uses the PRECOMPILED
  two-line `pattern = r"\b" + re.escape(old) + r"\b"` / `text = re.sub(pattern, new, text)` form (NOT s34's
  inline form). `extractFileEvents`: writes=4, edits=2 (`audit`+`report`, both on ledger.py), userEdits=4
  (`22de8fa9,9022d09a,a4d3d115,d6a766e2` — the step-7/step-9 appends left NO beacon), overwrites=0. Per-file
  (real reader): `ledger.py` 7 revisions → 151 L (119→9→120→137→137→138→151), `tests/test_ledger.py` 3 → 69 L
  (69→68→69), `renames.csv` 3 → 5 L (3→4→5, the 5th via S27), `apply_renames.py` 1 → 66 L. fileDAG (synthetic
  completion/reseed changeIds are backup blob names, kept out of the DAGs, spec 40): `ledger.py` 5 nodes
  (B,D,E,J,K), `test_ledger.py` 2 (C,I), `renames.csv` 2 (F,G), `apply_renames.py` 1 (H). Linear: one
  surviving branch (tip #b86404ef), four files, no rewound. 12 new tests (6 engine + 6 CLI); 499 → 511.
- `src/structures/path-resolve.ts` — `resolveAgainstCwd(cwd, path)`, the one canonical
  resolver of a path to an absolute string against the transcript `cwd` (idempotent for
  already-absolute paths). A leaf module (imports only node `path`) shared by extraction
  (s6 `git mv` rename targets) and the sidecar (snapshot paths), so neither risks an engine
  import cycle. Moved here from the sidecar in S6.
- `src/structures/line-model.ts` — the genesis sentinel `DOES_NOT_EXIST_YET` (= -1),
  a leaf module so engine/replay/render import it as a value without a runtime cycle.
- `src/reconstruction_lineage.ts` — following a file across renames (rename chain,
  `resolveFinalPath`, lineage membership, distinct final paths). A copy's
  `contentPathOf` is its destination, but a copy never enters the rename chain, so
  source and destination stay distinct lineages.
- `src/reconstruction_render.ts` — `renderVerbose` / `renderDiff` (pure). The diff
  heads an overwrite `@@ overwritten @ … @@` (full remove-all / add-all) and an append
  `@@ appended @ … @@` (added-tail-only). Split in S4 (was 249/250 lines): the default
  list view moved out (now ~128 lines).
- `src/reconstruction_render_list.ts` — the default list view `renderHistoryList`
  and its helpers (`getEntryLabel`/`getEntryDetail`/`renderHistoryBlock`/…, verb-renamed
  in S5), split out in S4 so `reconstruction_render.ts` could grow. `getEntryLabel` maps
  `overwrite` and `append`. In S12 its private `shortenChangeId`/`getBaseName` moved to the
  shared `reconstruction_labels.ts`, and the retired `formatBranchHeader` (the old
  `## surviving`/`## rewound` default) was removed with `renderAllBranches`.
- `src/reconstruction_cli.ts` — arg parsing + `runCli` + entry point; builds the real
  sidecar `BackupReader` from the transcript's session and threads it into reconstruction.
  The **bare default prints both DAGs** (spec 40) via `renderGraphs`; the graph flags take precedence,
  then the branch selectors (`--list-branches` / `--branch <id>`), then the surviving content view
  (`--surviving`, and the back-compat `--verbose`/`--diff`-with-no-selector path). `resolveGraphFlags`
  turns both graph flags on only when no other intent is given. Run:
  `tsx src/reconstruction_cli.ts <transcript.jsonl> [--target <p>] [--verbose|--diff]
  [--graphConvo|--graphFile|--surviving|--list-branches|--branch <id>]`.
- `src/reconstruction_graph.ts` — the two-DAG model + pure builders (spec 40): `assignTurnLetters`
  (one shared letter per file-changing turn, timestamp order, `B`-first), `buildFileDag` (per-file
  cross-branch lineage), `buildConversationDag` (forked oldest-first wrappers, or a linear trunk when
  only one branch changed files; root = the rewind point when forked, else the parentUuid-null root).
  Imports the branch model + `collectAncestorUuids`; engine types are type-only.
- `src/reconstruction_graph_render.ts` — the oldest-at-top renderers `renderConversationDag` /
  `renderFileDag` / `renderGraphs` (topology only, columns aligned per render). Reuses `shortUuid`
  (branch) and `shortenChangeId`/`getBaseName` (labels).
- `src/reconstruction_labels.ts` — the shared display-label helpers `shortenChangeId` (drop `toolu_`,
  8 chars) and `getBaseName` (path tail), relocated here in S12 as the one canonical home (no
  re-export shim) so both the list renderer and the graph renderer import them directly.

## TDD specs

Tests (`node:test` + `node:assert`) split to match the modules, one paired test
file each: extraction in `tests/reconstruction_extract.test.ts`, replay in
`tests/reconstruction_replay.test.ts`, lineage in
`tests/reconstruction_lineage.test.ts`, the public reconstruct API in
`tests/reconstruction_engine.test.ts`, `tests/reconstruction_engine_s4.test.ts`,
`tests/reconstruction_engine_s5.test.ts`, `tests/reconstruction_engine_s6.test.ts`,
`tests/reconstruction_engine_s7.test.ts`,
`tests/reconstruction_engine_s8.test.ts`, and
`tests/reconstruction_engine_s9.test.ts`
(driven off the real
`S1_JSONL`/`S2_JSONL`/`S3_JSONL`/`S4_JSONL`/`S5_JSONL`/`S6_JSONL`/`S7_JSONL`/`S8_JSONL`/`S9_JSONL`; the
S4–S9 engine specs are in their own files to stay under the 250-line cap), the conversation-branch
model (plus S8's working-tree-survival walkers, refined in S9) in
`tests/reconstruction_branch.test.ts` (synthetic rewind + conversation-only-rewind +
code-restore-no-post-edit records), the
sidecar resolver in
`tests/reconstruction_sidecar.test.ts` (synthetic snapshots + an in-memory reader),
verbose/diff rendering in `tests/reconstruction_render.test.ts` and the default list
view in `tests/reconstruction_render_list.test.ts` (pure, literal revisions), CLI
in `tests/reconstruction_cli.test.ts`. The later rewind scenarios add their own engine + CLI files to
stay under the 250-line cap: `tests/reconstruction_engine_s10.test.ts` /
`tests/reconstruction_engine_s11.test.ts` / `tests/reconstruction_engine_s12.test.ts` and
`tests/reconstruction_cli_s10.test.ts` / `tests/reconstruction_cli_s11.test.ts` /
`tests/reconstruction_cli_s12.test.ts` (the last driven off the real `S12_JSONL` with an in-memory
backup reader for the engine specs and the real on-disk reader for the CLI specs). S12 also adds the
empty-base Edit guard in `tests/reconstruction_replay_edit.test.ts` (spec 39) and the two-DAG builders
+ renderers in `tests/reconstruction_graph.test.ts` / `tests/reconstruction_graph_render.test.ts`
(spec 40, synthetic records + literal dags). Red→green, each spec one test.

### S1 — implemented now

1. **Event extraction** — `extractFileEvents(records)` finds exactly two events for
   the deleted target: a `write` then a `delete`, in timestamp order.
2. **Every touched file** — `reconstructAll(records)` returns a history per file
   the transcript touches: `s1_delete.py` (create + delete) AND
   `tests/test_s1_delete.py` (create only, never deleted). Nothing is dropped.
3. **Single-file reconstruction** — `reconstructFile(records, target)` returns one
   file's revisions; `findDeletedTarget(records)` auto-detects the rm'd file. For
   `s1_delete.py` that's exactly two revisions.
4. **Create revision** — revision 0 has 2 lines, `def hello():` and
   `    print("hello")`; every `LineEntry.oldLineNum === -1` (genesis), each with one
   value; `revision.timestamp` equals the write event's timestamp.
5. **Delete revision** — revision 1 has `lines: []` (0 lines); `revision.timestamp`
   equals the rm event's timestamp.
6. **changeId present & distinct** — both revisions carry a `changeId: Uuid`; the
   create and delete revisions' `changeId`s differ (distinct operations).
7. **Trailing-newline split** — content ending in `\n` yields N lines, not N+1 (no
   phantom trailing blank line).
8. **`--verbose` render** — output lists revision 0's lines (numbered) and shows
   revision 1 as 0 lines / deleted.
9. **`--diff` render** — output shows revision 0's lines as additions (`+`) and
   revision 1 as removals (`-`) of those same lines.

### S2 — implemented now

10. **Paired remove/add share `changeId`** — the import-swap Edit (`015b59mN`)
    emits a removal revision (5 lines) then an addition revision (6 lines) with the
    *same* `changeId`. (Proved: `test_edit_splices_into_paired_removal_and_addition_revisions`,
    `test_reconstruct_all_returns_two_s2_lineages`.)
11. **`oldLineNum` chaining** — the splice records each survivor's previous index
    as its `oldLineNum` back-pointer and births inserted lines at `-1`, against
    S2's real Edit hunks. Render's `--diff` uses these back-pointers to show only
    the real `+`/`-` lines, not a remove-all/add-all.
12. **New revision ⇔ insert/remove** — every S2 Edit hunk with a `-` and/or `+`
    mints new revision(s); the pure-insertion Edit (`016L3mk1`) mints one. (Same-
    position replacement appending to `values[]` still awaits a read/observation
    scenario.)
13. **Rename lineage** — `mv` collapses source and destination into one history
    keyed by the final path; `reconstructAll(S2)` returns exactly two histories,
    none keyed by `s2_original.py`. (`test_moved_file_history_spans_create_rename_edit`,
    `test_distinct_final_paths_collapses_rename_source`.)
14. **First-class rename entry** — the `mv` is its own revision (kind `rename`,
    carrying the prior lines forward, `from`/`to` + the mv's `changeId`); render
    shows it as `renamed A → B` (verbose) / `@@ renamed A → B @@` (diff) with no
    line churn.

### S3 — implemented now

15. **Copy extraction** — `extractFileEvents(S3)` finds exactly one `copy` event
    from the `cp`, carrying `from`/`to` paths and the `cp` tool_use's `changeId`;
    `contentPathOf` of a copy is its destination. (Proved:
    `test_extract_finds_copy_from_cp`, `test_content_path_of_copy_is_its_destination`.)
16. **Copy as a first-class genesis entry** — replaying a copy with known
    `seedLines` appends one revision (kind `copy`, one genesis line per seed line at
    `-1`, stamped at the copy time, carrying `from`/`to`). (Proved:
    `test_replay_appends_copy_genesis_revision_from_seed_lines`.)
17. **Seed from source at copy time** — `reconstructFile(S3, s3_copy.py)` yields
    copy → edit-removal → edit-addition; revision 0 is seeded with the source's
    content reconstructed *as of the copy timestamp*, and the two edit revisions
    share one `changeId`. (Proved: `test_copied_file_history_spans_copy_then_paired_edit`.)
18. **Copy does not collapse the source** — a copy stays out of the rename chain,
    so both `from` and `to` survive as distinct final paths; `reconstructAll(S3)`
    returns three histories (`s3_source.py`, `tests/test_s3_source.py`,
    `s3_copy.py`). (Proved:
    `test_distinct_final_paths_keeps_copy_source_and_destination`,
    `test_reconstruct_all_returns_three_s3_histories`.)
19. **Copy render** — verbose labels the entry `copy` with its `from → to` arrow and
    numbered body; diff shows `@@ copied A → B @@` with genesis lines as additions;
    the list view marks the file `(copy of X)` and the entry `(copied from X)`.
    (Proved: `test_list_shows_copy_entry_with_provenance`,
    `test_diff_shows_copy_as_its_own_block_with_added_lines`,
    `test_verbose_labels_copy_entry_with_arrow_and_body`,
    `test_default_view_lists_s3_with_copy_entry`.)

### S4 — implemented now

20. **Overwrite replay** — replaying two write events to one path yields a create
    (kind `write`) then an overwrite (kind `overwrite`), the second carrying its own
    content as genesis lines (`oldLineNum -1`) and its own `changeId`; presence is
    decided by `fileIsPresent`. (Proved:
    `test_second_write_to_a_present_file_is_an_overwrite`.)
21. **Overwrite extraction is event-agnostic** — `extractFileEvents(S4)` finds four
    plain `write` events (two per file, create then overwrite); the interleaved
    `ls`/`pytest` Bash calls and the `queue-operation` record yield no events. No
    extraction code change. (Proved: `test_extract_finds_four_writes_two_per_file`.)
22. **Overwrite reconstruction** — `reconstructFile(S4, s4_overwrite.py)` yields
    create → overwrite, every overwrite line genesis; `reconstructAll(S4)` returns
    **two** independent histories, each create → overwrite, neither collapsing into
    the other. (Proved: `test_overwrite_file_history_is_create_then_overwrite`,
    `test_reconstruct_all_returns_two_independent_s4_histories`.)
23. **Overwrite render** — the list view labels the entry `overwrite` (not `create`
    or `delete`); the diff heads it `@@ overwritten @ … @@` with a full remove-all /
    add-all; verbose shows the overwrite's full new line state. (Proved:
    `test_list_labels_overwrite_entry`, `test_diff_shows_overwrite_as_full_replace`,
    `test_verbose_shows_overwrite_full_state`,
    `test_default_view_lists_s4_overwrite_entries`.)

### S5 — implemented now

24. **Append replay** — a write then an append event replay into a create then an
    `append`: the append carries the prior lines forward unchanged (identity
    back-pointers, `oldLineNum` = previous index) and adds the redirect's tail lines as
    genesis (`oldLineNum DOES_NOT_EXIST_YET`); an overwrite event against a present file
    is an `overwrite`, and an append/overwrite to an absent file is a create (kind
    `write`). (Proved: `test_append_event_carries_prior_lines_and_adds_a_genesis_tail`,
    `test_overwrite_event_against_present_file_is_an_overwrite`.)
25. **Sidecar resolution** — a bash `>`/`>>` leaves no content in the JSONL, so
    `fillRedirectContent` fills a redirect event's content from the backup blob named by
    the first `file-history-snapshot` taken strictly after the event whose backup is
    non-null, read through an injected `BackupReader`. Snapshots key their backups by the
    path **relative to cwd**, so the snapshot path is resolved against the transcript's
    `cwd` to match the event's absolute target. (Proved:
    `test_fill_resolves_redirect_content_from_the_next_snapshot_blob`,
    `test_fill_matches_a_cwd_relative_snapshot_path_to_an_absolute_target`.)
26. **Redirect extraction** — `bashEventFrom` maps `echo … >> path`→`AppendEvent` and
    `echo … > path`→`OverwriteEvent`, both with **empty** content (the sidecar fills it,
    decision 3 — the `echo` argument is never parsed); non-redirect Bash still yields
    nothing. (Proved: `test_extract_maps_redirects_to_append_and_overwrite_events`.)
27. **Redirect reconstruction** — `reconstructAll(S5, reader)` returns one history,
    create → append → overwrite, with the literal line shapes (append carries `line one`
    at `oldLineNum 0` and adds `line two` as genesis; overwrite is one genesis line
    `replaced content`). (Proved:
    `test_redirect_file_history_is_create_then_append_then_overwrite`.)
28. **Append render** — the list view labels it `append` (with a `2 lines  (+1)` delta);
    the diff heads it `@@ appended @ … @@` with added-tail-only (the carried prefix
    produces neither `+` nor `-`); verbose shows the full numbered state through the
    default body. The CLI builds the real on-disk reader from the transcript's session id.
    (Proved: `test_list_labels_append_entry`, `test_diff_shows_append_as_added_tail_only`,
    `test_default_view_lists_s5_redirect_entries`.)

### S6 — implemented now

29. **`git mv` recognition** — `parseMvPaths` matches both `mv <src> <dst>` and
    `git mv <src> <dst>` (one regex, optional `git ` prefix); `bashEventFrom` emits the
    same `RenameEvent` for either. No new event kind or parser. (Proved:
    `test_extract_maps_git_mv_to_a_rename_with_cwd_resolved_paths`,
    `test_extract_finds_rename_from_mv` still green for plain `mv`.)
30. **cwd path resolution** — a `git mv`'s args are cwd-relative while every Write/Edit
    target is absolute, so the rename's `from`/`to` are resolved against the record's
    `cwd` via `resolveAgainstCwd` (now in `structures/path-resolve.ts`, the one canonical
    resolver, idempotent for already-absolute paths so S2's absolute `mv` is unchanged).
    The resolver is shared by extraction and the sidecar. (Proved:
    `test_resolve_against_cwd_joins_relative_and_passes_absolute_through`.)
31. **`git mv` reconstruction** — `reconstructAll(S6)` returns the `s6_git_renamed.py`
    lineage create → rename → edit (the `goodbye()` Edit applies onto the renamed file,
    no crash) plus `tests/test_s6_git.py`'s own create; the list view labels the entries
    `create`/`rename`/`edit` (no render change — S2 already heads `rename` and `edit`).
    (Proved: `test_git_mv_links_rename_lineage_and_applies_later_edit`,
    `test_default_view_lists_s6_git_mv_lineage`.)

### S7 — implemented now

32. **conversation-branch model** — a rewind forks the `parentUuid` tree; each `last-prompt`
    record's `leafUuid` is a conversation head. `findConversationBranches` returns the
    surviving branch (the final head) and the rewound branches (abandoned heads, deduped to
    maximal tips, each tagged with the rewind point = the deepest record shared with the
    surviving path). `selectBranchRecords(records, tip)` keeps a branch's records (the tip's
    ancestor chain + every uuid-less meta record); `selectLiveBranch` is that for the surviving
    head. A no-op (kept records == all records) when there is no rewind, so S1–S6 are unchanged.
    (Proved: `test_find_conversation_branches_identifies_surviving_and_rewound`,
    `test_select_branch_records_keeps_tip_chain_and_meta`,
    `test_select_live_branch_keeps_surviving_chain`,
    `test_select_live_branch_returns_all_when_no_head`.)
33. **branch-agnostic reconstruction core** — `reconstructFileOver` / `reconstructFilesOver`
    (in `reconstruction_branches.ts`) reconstruct over EXACTLY the records given, with no branch
    filtering; the public `reconstructAll` / `reconstructFile` / `findDeletedTarget` pre-select
    the surviving branch via `selectLiveBranch` and call the core. `extractFileEvents` does no
    filtering. So default reconstruction follows the surviving branch only — `reconstructAll(S7)`
    is one v2 `create` per file, not a v1 create + v2 overwrite. (Proved:
    `test_default_reconstruction_follows_surviving_branch_only`.)
34. **rewound-branch retrieval** — `reconstructBranches` returns `{ survivingTip, surviving,
    rewound }`: the surviving histories plus one `RewoundBranchHistory` per rewound branch
    (rewind point + tip + the histories of files it changed AFTER the rewind; a tangent with no
    post-rewind file change, like S7's `#72` Read/`ls`, is excluded). A rewound branch's writes
    are preserved, never discarded — retrievable like `git log` on an unmerged branch. The CLI
    **defaults to rendering all branches** (surviving + rewound under `## surviving` / `## rewound`
    headers; byte-identical to the old plain list when there are no rewound branches, keeping
    S1–S6 unchanged), with `--surviving` (surviving only), `--list-branches` (one summary line per
    branch), and `--branch <tip-short-id>` (one branch, composing with `--target`/`--diff`/
    `--verbose`; an unknown id throws the usage message with the available ids). (Proved:
    `test_reconstruct_branches_retains_rewound_v1_branch`, `test_default_view_shows_all_branches`,
    `test_default_view_unchanged_when_no_rewound_branches`,
    `test_surviving_flag_shows_only_surviving_branch`,
    `test_list_branches_summarizes_surviving_and_rewound`,
    `test_branch_id_retrieves_one_specific_branch`,
    `test_branch_id_with_target_narrows_to_one_file`,
    `test_branch_id_unknown_throws_with_available_ids`.)

### S8 — implemented now

35. **working-tree-survival** — a `code` rewind restores the working tree (the abandoned branch's
    files leave disk); a conversation-only rewind does NOT (the files written on the abandoned
    conversation branch stay on disk). So the surviving files are not always reachable from the final
    `last-prompt` head. `findSurvivingHead` therefore picks the surviving branch from the
    `file-history-snapshot` records: `findWorkingTreeOwner` (in `reconstruction_worktree.ts`) returns
    the `messageId` of the LAST snapshot whose tracked set changed vs. the previous snapshot (the
    working-tree owner — the `{path → version}` change-detection described here is **refined by spec 36
    to a content signature**, which is the form actually in the code); the surviving head is the final
    head when the owner is
    on its ancestor chain (every non-rewind and `code`-rewind-ending transcript — S1–S7, a strict
    no-op), otherwise the `last-prompt` head at-or-above the owner (`findHeadAtOrAbove` in
    `reconstruction_tree.ts` — the S8 case, where the conversation-only ending diverges the working
    tree from the final head). Fallback to the final head when there is no snapshot / no tracked-set
    change. `reconstructAll(S8)` is v_c (the last code written); `reconstructBranches(S8)`
    additionally retains the v_a/v_b `code`-rewound branches; the file-less final `Hello` head is no
    branch. No new `EventKind`/per-line/container type — only which records are selected as surviving.
    (Proved: `test_find_conversation_branches_survives_working_tree_not_final_head`,
    `test_select_live_branch_follows_working_tree_after_conversation_rewind`,
    `test_default_reconstruction_is_the_last_written_code_after_conversation_rewind`,
    `test_reconstruct_branches_retains_two_code_rewound_branches`,
    `test_default_view_shows_surviving_vc_plus_two_rewound`, `test_surviving_flag_shows_only_vc`,
    `test_list_branches_lists_surviving_vc_and_two_rewound`,
    `test_branch_id_retrieves_one_rewound_version`.)

### S9 — implemented now

36. **code-restore-no-post-edit** — a `code` restore to OLDER code with no subsequent write makes the
    surviving working tree the *restored* code, even though the final conversation head is a later
    read-only branch that wrote nothing. This **refines spec 35**: after a `code` restore the harness
    emits trailing "refresh" `file-history-snapshot` records that bump each file's `version` counter
    while the on-disk content is unchanged (their `backupFileName` is `null`). Spec 35's `{path →
    version}` change key would mark the LAST refresh (on the read-only branch) as the working-tree
    owner — wrong. So `findWorkingTreeOwner` detects change by a **content signature** instead: per
    path, the carried-forward last-known non-null `backupFileName` (refresh snapshots reporting `null`
    carry the previous content id forward); the signature changes only when the tracked PATH SET
    changes OR a path's content id changes. A freshly written file is still detected because it changes
    the PATH SET (its first `backupFileName` may be `null`). With this, S9's owner is `f1b8dede` (the
    restored-code write turn), so `findSurvivingHead` switches the surviving head there (the read-only
    head forks at root, off that chain); `reconstructAll(S9)` reconstructs the restored files from the
    Write events already on that branch (the restored bytes ARE those Writes restored to disk — no
    synthetic backup-sourced revision; the final snapshot's `backupFileName` is `null` anyway).
    `reconstructBranches(S9)` has ZERO rewound branches — the read-only head touched no files, so it is
    a file-less tangent (dropped, like S7's read tangent / S8's `Hello`), and the CLI renders S9 as a
    plain single-branch list (no `## headers`), like S1–S6. Strict no-op for S1–S8: the carried rule
    leaves every prior scenario's owner unchanged (S8's owner stays `2267781c` = v_c; its trailing
    conversation-only snapshot repeats the same content id). No new `EventKind`/per-line/container
    type, no new module, no CLI change — only which records are selected as surviving.
    (Proved: `test_find_conversation_branches_survives_restored_code_not_final_refresh`,
    `test_select_live_branch_follows_restored_code_after_code_rewind`,
    `test_default_reconstruction_is_the_restored_code_after_code_rewind`,
    `test_code_restore_with_no_post_edit_has_no_rewound_branches`,
    `test_s9_default_view_is_a_plain_list_of_the_restored_files`,
    `test_s9_list_branches_shows_only_the_surviving_restored_branch`,
    `test_s9_surviving_flag_shows_the_restored_files`.)

### S10 — implemented now

37. **conversation-only-rewind-no-post-edit** — a single conversation-only rewind back to root whose
    post-rewind branch only reads keeps the written files on disk; they are the surviving working
    tree, recovered from the Write events on the write-turn branch; `reconstructBranches(S10)` has
    ZERO rewound branches (the read-only head is a file-less tangent, dropped like S7's read tangent /
    S8's `Hello` / S9's read head), so the CLI renders S10 as a plain single-branch list (no `##
    headers`), like S1–S6 and S9. This is the **isolated instance of spec 35** — the
    conversation-only case with no accompanying `code` rewind, which spec 35 (S8) exercised only
    *combined* with two `code` rewinds. It is also a **strict no-op for spec 36**: a conversation-only
    rewind never touches disk, so the post-rewind `file-history-snapshot` records repeat the SAME
    `version` (`v2`) AND the SAME non-null `backupFileName` — there is no version bump and no `null`-bfn
    refresh (the opposite of S9's `code`-restore churn `v3→v4→v5`/null). So S10's working-tree owner is
    stable under BOTH the old `{path → version}` rule and the spec-36 content signature: it settles at
    `bfd9d428` (the write turn) and never moves. `findSurvivingHead` switches the surviving head there
    (the read head forks at root, off that chain); `reconstructAll(S10)` recovers both files from the
    Write events on that branch. **No production-code change was needed** — spec 35 + spec 36 already
    cover S10; this slice adds only characterization/regression tests and this spec. (Proved:
    `test_find_conversation_branches_survives_working_tree_when_conv_only_refresh_repeats_real_backup`,
    `test_default_reconstruction_is_the_files_kept_by_a_conversation_only_rewind`,
    `test_conversation_only_rewind_with_no_post_edit_has_no_rewound_branches`,
    `test_s10_default_view_is_a_plain_list_of_the_kept_files`,
    `test_s10_list_branches_shows_only_the_surviving_branch`,
    `test_s10_surviving_flag_shows_the_kept_files`.)

### S11 — implemented now

38. **code-restore-then-rewrite** — a `code` restore to root followed by a post-rewind REWRITE of the
    same files makes the surviving working tree the *rewritten* code (here the `multiply` version),
    while the abandoned pre-restore turn (the `add` version) — which DID write files — is preserved as
    ONE rewound branch forked at the root checkpoint (`#742f44f2`). Because that abandoned turn wrote
    files (unlike S9/S10's file-less read tangents), the CLI default view shows `## surviving` +
    `## rewound` headers like S7/S8, NOT a plain list. This is the **complement of spec 36 (S9)**: S9
    proved a `code`-restore *refresh* (a bumped `version` with a `null` `backupFileName`) must NOT move
    the working-tree owner; S11 proves a real *rewrite* after the restore (a NEW non-null
    `backupFileName` at a NEW `version`) MUST move it — together the two pin both directions of the
    spec-36 content signature (refresh ⇒ no move; real rewrite ⇒ move). The load-bearing verified
    detail: the harness names each backup `<path-hash>@v<version>` where `<path-hash>` derives from the
    file PATH, not its content, so the `add` and `multiply` versions of `scenario11.py` carry the
    IDENTICAL path-hash `ef7eb2c33a0c873b`, differing ONLY in the version suffix (`@v2` for `add`, `@v4`
    for `multiply`). `resolveContentId` (`src/reconstruction_worktree.ts`) returns the FULL
    `backupFileName` string (suffix included), so `ef7eb2c33a0c873b@v4 ≠ ef7eb2c33a0c873b@v2` and the
    signature changes — the working-tree owner advances to the `multiply` head (`ccc4a78e`),
    `findSurvivingHead` switches the surviving head to the conversation tip `d03f0078`, and
    `reconstructAll(S11)` recovers both `multiply` files from the Write events on that branch. A refactor
    that compared only the hash component (mistaking it for a content hash) would regress S11 (owner
    would stay at the `add` head, surviving tree WRONGLY the `add` code) while S9/S10 still passed — the
    S11 regression tests guard exactly that. **No production-code change was needed** — spec 35 + spec 36
    already cover S11; this slice adds only characterization/regression tests and this spec. (Proved:
    `test_find_conversation_branches_advances_owner_to_post_restore_rewrite`,
    `test_default_reconstruction_is_the_post_restore_rewrite`,
    `test_reconstruct_branches_retains_the_code_rewound_add_branch`,
    `test_s11_default_view_shows_surviving_multiply_and_rewound_add`,
    `test_s11_surviving_flag_shows_only_the_multiply_rewrite`,
    `test_s11_list_branches_summarizes_surviving_and_rewound`,
    `test_s11_branch_id_retrieves_the_rewound_add_branch`.)

### S12 — implemented now

39. **conversation-only-rewind-then-edit (the empty-base Edit crash) — first production-code fix.**
    The session Writes `scenario12.py`(`add`) + `test_scenario12.py`, accepts, does a
    **conversation-only** rewind to the original prompt (which, per spec 37/S10, leaves the files on
    disk), then on a NEW surviving branch **Edits** both files to add `multiply` (Read-then-Edit; it
    never re-Writes). The surviving branch's first event for each file is therefore an Edit whose
    *creating Write lives on the abandoned (rewound) branch* — so the Edit replays against an empty base
    and the old `insertHunkAdditions` threw `Cannot read properties of undefined (reading 'values')` on
    the first context line. Two coupled changes fix it: (a) **seed the Edit base from the file-history
    backup** — `seedEditBaseFromBackup` (`src/reconstruction_sidecar.ts`), wired into
    `reconstructFileOver` after `fillRedirectContent`, detects a per-file lineage whose first event is an
    Edit and prepends a synthetic Write whose content is the backup snapshotted **at or before** the edit
    (`findBackupAtOrBefore`; the pre-edit on-disk content the conversation-only rewind preserved). For
    every S1–S11 file the first event already creates the file, so the seed is a strict no-op. (b) **make
    `insertHunkAdditions`' context branch total** (`src/reconstruction_replay_edit.ts`): a context line
    with no working line to carry is now materialised as a genesis line (extracted into
    `resolveContextLine`) instead of indexing past the empty base — a defensive guard, since for a
    non-empty base it is byte-identical to the old path. The synthetic seed Write's `changeId` is the
    backup filename (e.g. `43c1313ce6fd5f24@v2`), which surfaces only in the `--surviving` content views,
    never in the graphs (spec 40 attributes the file's base to the REAL Write turn). The surviving
    `scenario12.py` reconstructs as `add` (seeded) → `multiply` (edit), final text holding both
    functions. (Proved: `test_seed_prepends_a_write_base_from_the_at_or_before_backup`,
    `test_seed_passes_through_when_first_event_creates_the_file`,
    `test_seed_passes_through_when_no_backup_precedes_the_edit`,
    `test_apply_edit_on_empty_base_materialises_context_lines_as_genesis`,
    `test_s12_surviving_scenario_file_is_seeded_add_base_then_multiply_edit`,
    `test_s12_surviving_test_file_imports_multiply`,
    `test_s12_reconstruct_branches_keeps_one_rewound_add_branch`.)

40. **two-DAG CLI render + the new global default.** S12 is the first scenario where the *conversation*
    graph (which forks at the rewind) and the *file/disk* graph (which stays linear, because disk was
    never reverted) disagree, so the CLI now renders BOTH as explicit graphs and the **bare default
    prints both** for EVERY scenario (replacing the retired `## surviving`/`## rewound` text default).
    `src/reconstruction_graph.ts` builds the model (`assignTurnLetters` gives ONE letter per
    file-changing turn across all records in timestamp order, `B`-first with `A` reserved for the root —
    shared by both graphs; `buildConversationDag` forks into oldest-first branch wrappers, or a linear
    trunk when only one branch changed files; `buildFileDag` groups every turn by file for true
    cross-branch disk lineage). `src/reconstruction_graph_render.ts` renders oldest-at-top: the
    conversationDAG roots at the **rewind point** (annotated `(rewind point)`) and forks
    rewound-above-surviving (the branch whose first turn is oldest renders first); the fileDAG lists each
    file's version-ordered turns. Nodes are **topology only** (`<letter> <kind> <target> #<shortId>`) —
    file CONTENT stays in `--surviving`/`--branch` (+`--verbose`/`--diff`). New flags `--graphConvo` /
    `--graphFile` select one graph; `--surviving` / `--list-branches` / `--branch` / `--verbose` /
    `--diff` are unchanged and suppress the graph default. `BranchRole {surviving, rewound}` joins the
    vocabulary; `shortenChangeId` + `getBaseName` were relocated to a shared `reconstruction_labels.ts`
    (one canonical home, no shim). The 12 existing default-view CLI tests were rewritten to the new graph
    output (linear for S1–S6/S9/S10; forked for S7/S8/S11). (Proved:
    `tests/reconstruction_graph.test.ts`, `tests/reconstruction_graph_render.test.ts`,
    `test_s12_default_view_renders_both_dags_rewound_above_surviving`,
    `test_s12_graph_convo_flag_renders_only_the_conversation_dag`,
    `test_s12_graph_file_flag_renders_only_the_file_dag`,
    `test_s12_surviving_verbose_shows_add_base_plus_multiply_edit`, + the three `parseArgs` graph-flag
    tests and the 12 rewritten default-view locks.)

### Deferred to later scenarios

- **Fine-grained sub-diff** linking a `-`→`+` pair as one modified line (Rule 2's
  deferred half) — awaits a scenario that needs it.
- **Reads/observations** appending to a line's `values[]` (multi-entry history) —
  the S3 `Read` of `s3_copy.py` is intentionally ignored for now.
- **The verdict/coverage layer.**
