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
  references lines past its reconstructed base — off-branch edits that advanced the disk and
  persisted across a conversation-only rewind — the same backup seed is spliced before that
  edit; an edit whose base is intact passes through unchanged.
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
