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
  `findBranchById`. Imports only `envelope`/`session-meta`/`domain` (engine types are type-only),
  so the graph stays acyclic.
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
  in S5 (replay was 247/250 lines).
- `src/reconstruction_sidecar.ts` — `fillRedirectContent` recovers a `>`/`>>`'s
  resulting content from the file-history backups beside the transcript (the snapshot
  taken next after the redirect names the blob), through an injected `BackupReader`;
  `createSidecarReader`/`getDefaultFileHistoryRoot`/`findSessionId` build the real
  on-disk reader (`~/.claude/file-history/<sessionId>/`). Snapshot paths are resolved
  against the transcript `cwd` (they are cwd-relative) via the shared `resolveAgainstCwd`.
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
  `overwrite` and `append`.
- `src/reconstruction_cli.ts` — arg parsing + `runCli` + entry point; builds the real
  sidecar `BackupReader` from the transcript's session and threads it into reconstruction.
  Reconstructs all branches once, then renders per the chosen branch view (default = all branches
  with the no-rewound passthrough; `--surviving` / `--list-branches` / `--branch <id>`). Run:
  `tsx src/reconstruction_cli.ts <transcript.jsonl> [--target <p>] [--verbose|--diff]
  [--surviving|--list-branches|--branch <id>]`.

## TDD specs

Tests (`node:test` + `node:assert`) split to match the modules, one paired test
file each: extraction in `tests/reconstruction_extract.test.ts`, replay in
`tests/reconstruction_replay.test.ts`, lineage in
`tests/reconstruction_lineage.test.ts`, the public reconstruct API in
`tests/reconstruction_engine.test.ts`, `tests/reconstruction_engine_s4.test.ts`,
`tests/reconstruction_engine_s5.test.ts`, `tests/reconstruction_engine_s6.test.ts`, and
`tests/reconstruction_engine_s7.test.ts`
(driven off the real
`S1_JSONL`/`S2_JSONL`/`S3_JSONL`/`S4_JSONL`/`S5_JSONL`/`S6_JSONL`/`S7_JSONL`; the S4–S7 engine
specs are in their own files to stay under the 250-line cap), the conversation-branch model in
`tests/reconstruction_branch.test.ts` (synthetic rewind records), the sidecar resolver in
`tests/reconstruction_sidecar.test.ts` (synthetic snapshots + an in-memory reader),
verbose/diff rendering in `tests/reconstruction_render.test.ts` and the default list
view in `tests/reconstruction_render_list.test.ts` (pure, literal revisions), CLI
in `tests/reconstruction_cli.test.ts`. Red→green, each spec one test.

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

### Deferred to later scenarios

- **Fine-grained sub-diff** linking a `-`→`+` pair as one modified line (Rule 2's
  deferred half) — awaits a scenario that needs it.
- **Reads/observations** appending to a line's `values[]` (multi-entry history) —
  the S3 `Read` of `s3_copy.py` is intentionally ignored for now.
- **The verdict/coverage layer.**
