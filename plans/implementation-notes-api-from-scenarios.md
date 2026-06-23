## 2026-06-22:19:37:00 — S4 reconstruction (overwrite: a second Write to a present file)
Chat title: api-from-scenarios — S4 overwrite-file (implement plan)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ (this session)

### References

/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s4-reconstruction-plan.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260622-1922.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md
S4 JSONL: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s4-overwrite-file/58f8c26c-48d5-4e8f-953c-265005a6ee73.jsonl

### Design decisions

- **Overwrite is detected at replay time by file presence, not at extraction.** A
  write event whose file is currently present (latest revision exists and is not a
  delete) becomes an `EventKind.overwrite` revision; the first write (no prior
  revision) stays a create. `writeRevision(event, replacesPresent)` sets the kind;
  `fileIsPresent(revisions)` decides. Extraction keeps emitting plain
  `EventKind.write` events. The overwrite Write's `structuredPatch`/`originalFile`
  are deliberately not read (clean-room; consistent with S3's `originalFile`
  rejection, memory note `originalfile-not-always-populated`).
- **An overwrite is a fresh full-content revision** — every line genesis
  (`oldLineNum -1`), content from the Write's `content`, NOT an Edit-style splice.
  The diff heads it `@@ overwritten @ … @@` and shows a wholesale remove-all /
  add-all (verified on the real transcript).
- **Overwrite is its own revision kind (`EventKind.overwrite`), not a new event
  type.** There is no `OverwriteEvent`; `WriteEvent` covers both. A write after a
  delete stays a create (the file is absent), so overwrite is specifically
  "replace present content".
- **No engine/extraction/lineage code changes were needed** (Tasks 2, 3, and the
  CLI half of 6 passed on Task 1's replay change alone) — they lock behavior with
  tests, the same shape as S3's Task 4.

### Deviations

- **New record type `queue-operation` had to be modeled (plan did not anticipate
  it).** The S4 transcript carries two `queue-operation` records (a queued user
  prompt: keys `type`/`sessionId`/`operation`/`timestamp`/`content`) absent from
  S1–S3. `loadRecords` threw `UnknownRecordTypeError` before extraction ran, so the
  "no code change" Task 2 actually required: add `queueOperation = "queue-operation"`
  to `RecordType` (`vocabulary.ts`), add its allow-set to `ALLOWED_TOP_LEVEL_KEYS`
  (`loadTranscript.ts`), and extend `test_record_type_enum_holds_the_s1_wire_strings`
  (`vocabulary.test.ts`) — same precedent as AttachmentPayloadType growing 6→9 for
  S2. Modeled as discriminant only (no per-field payload type); extraction stays
  overwrite-agnostic and emits no event for it.
- **Split the engine test file, not just the render module.** Adding the two S4
  engine tests pushed `tests/reconstruction_engine.test.ts` to 269 lines (over the
  250 cap the post-tool hook enforces on every file). Per the standing "split over
  condense" preference and the render-split precedent, the S4 engine tests live in a
  new `tests/reconstruction_engine_s4.test.ts`. NB: the plan's Verify-gate command
  (`filesize_check.py src/reconstruction_*.ts`) only checks src files AND the script
  only reads `argv[1]` (a single path), so passing it multiple files silently checks
  just the first — I checked every file individually instead.

### Tradeoffs

- **Task 4 render split executed as planned** (the pre-agreed S3 remedy):
  `renderHistoryList` + its helpers moved to `src/reconstruction_render_list.ts`
  (122 lines); `reconstruction_render.ts` dropped to 128 lines (verbose + diff
  only). The unused `Uuid` and `FileHistory` imports were pruned from
  `reconstruction_render.ts` (noUnusedLocals is a hard `tsc` error). The one
  list-view test moved to `tests/reconstruction_render_list.test.ts` with its own
  inline copy fixture; `copyRevisionFixture` stays in `reconstruction_render.test.ts`
  for the diff/verbose copy tests.
- **Overwrite diff reuses the existing `removedLines`/`addedLines` helpers.** Because
  every overwrite line is genesis (`oldLineNum -1`), `removedLines` drops every
  previous line and `addedLines` adds every new one — a full replace falls out of
  the existing machinery; only the `overwritten` header is new.

### Open questions

- None blocking. All six tasks landed RED→GREEN; final gate: `npm test` → 73 pass /
  0 fail, `npx tsc --noEmit` clean, every src+test file ≤ 250 lines. The locked
  default-view format matches the real S4 transcript. Commit pending user approval —
  S2, S3 and S4 are all still uncommitted; confirm whether to commit them together or
  separately, and what to do with stray untracked files (`src/Plan_Impl_template.md`,
  `plans/.gitignore`).

---

## 2026-06-22:18:51:00 — S3 reconstruction (copy `cp` lineage as a first-class genesis entry)
Chat title: api-from-scenarios — S3 copy-file (implement plan)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/39244c72-eeba-4e65-a030-b901aa08d33b.jsonl

### References

/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s3-reconstruction-plan.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260622-1847.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md
S3 JSONL: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s3-copy-file/ac6edd6f-cc4e-4423-87f9-468530849db5.jsonl

### Design decisions

- **A copy is its own event kind (`EventKind.copy`), not a rename.** The `cp` yields
  TWO independent histories (source survives, destination is new), so a copy is kept
  out of the rename chain and `reconstructAll(S3)` returns three histories.
- **A copy's genesis content is the reconstructed SOURCE state as of the copy time**,
  not the destination Edit's `originalFile` field — clean-room, evidence-based, and
  generalizes to a source edited after the copy.
- **Seed recursion lives in the engine** (it needs `reconstructFile` as a value) with a
  `resolving: Set<string>` cycle guard, preserving the type-only import direction from
  the mechanics modules.

### Deviations

- **Plan said "import `CopyInfo` (type-only)" into `reconstruction_render.ts`.** It
  is not imported there. `renderRenameArrow` was generalized to
  `renderPathArrow(transition: { from: Path; to: Path })` using an inline
  structural type, which made the `RenameInfo` import unused too. Both type names
  were dropped from render's imports rather than left dangling, because the project
  builds with `noUnusedLocals`/`noUnusedParameters` (an unused import is a hard
  `tsc` error, codes 6133/6196). `CopyInfo` is still imported type-only in
  `reconstruction_extract.ts`, where it is actually used. No behavior change.
- **Seed helpers kept in `reconstruction_engine.ts` (no `reconstruction_seed.ts`
  split).** The plan offered the split only if the engine crossed 250 lines; it
  sits at 213, so the recursion stays with `reconstructFile` as planned.

### Tradeoffs

- **`reconstruction_render.ts` is now 249/250 lines.** S3 added the copy branches
  in place rather than splitting the list view (filesize_check exit 0). The next
  line added to that file will force the planned split into
  `reconstruction_render_list.ts` (+ `tests/reconstruction_render_list.test.ts`).
  Chose not to pre-split now to keep the S3 diff minimal and avoid a churny move
  with no current need; flagged so the next editor isn't surprised.

### Open questions

- None blocking. All six tasks landed RED→GREEN; the locked default-view format
  matches the real S3 transcript byte-for-byte. Commit pending user approval (S2
  work is also still uncommitted — confirm whether to commit S2 and S3 together or
  separately).

---

## 2026-06-22:17:47:00 — S2 reconstruction (Edit splice + rename lineage + paired changeId)
Chat title: api-from-scenarios — S2 reconstruction (implement plan)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/bd46ed56-7c1c-46cf-8d5e-e299733cffb6/

### References

/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s2-reconstruction-plan.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260622-1715.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md
S2 JSONL: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s2-move-file/1e82511e-05a3-4712-9a95-206b24128694.jsonl
Planning convo JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/17715352-f1da-442f-a848-778d6e26e905.jsonl

### Design decisions

- **`kind` on every `FileRevision`** (`EventKind`): replay is now a left-fold
  (`replayEvents` → `appendRevisionsForEvent`) that may append more than one
  revision per event and can read the previous one, so each revision records the
  evidence kind that produced it. `UnsupportedEventKindError` guards unmodeled
  kinds (fog-of-war; mirrors `UnknownToolNameError`).
- **Hunk-driven Edit splice (Rule 2, coarse `-`/`+`).** Each Edit hunk with any
  `-` mints a removal revision; with any `+`, an addition revision — both carry
  the Edit's `changeId` (so the pair never delinks). Survivors keep their previous
  index as `oldLineNum`; inserted lines are born `-1`. `015b59mN` → 2 revisions
  (5 then 6 lines); the pure-insertion `016L3mk1` → 1. No `-`→`+` sub-diff.
- **`changeId` = the originating tool_use id** (the existing `Uuid` from the parse
  layer), as in S1 — deterministic + provenance; a paired remove/add shares it
  automatically.
- **`structuredPatch` read from the user record's top-level `toolUseResult`**
  (an `EditResult`), keyed back to the Edit via the `tool_result` block's
  `tool_use_id` (`indexEditHunksByToolUseId`). Write results carry `[]`.
- **Rename is a first-class carried-forward entry** (locked decision): the `mv`
  becomes its own revision (kind `rename`, `rename: { from, to }`, the mv's
  `changeId`) that carries the prior line snapshot forward with identity
  `oldLineNum` and mints no content change.
- **Merge by lineage** (locked decision): `reconstructFile` follows the rename
  chain (`buildRenameChain` → `resolveFinalPath`) to the file's final path and
  replays every event whose content path resolves there; `reconstructAll` keys
  histories by `distinctFinalPaths`, so a renamed file is ONE history keyed by
  `s2_moved.py` and `reconstructAll(S2)` returns exactly two.
- **`--diff` is now `oldLineNum`-driven** (real changes only): additions =
  entries born here (`-1`); removals = previous indices no current entry points
  back to. A rename renders as `@@ renamed A → B @@` / `revision N rename A → B`
  with no churn. The S1 genesis/delete diffs still come out as all-`+` / all-`-`.
- **Default CLI view = `renderHistoryList`**: per file, numbered entries with
  kind label, line count + `(+N)`/`(−N)` delta (or the rename arrow), short time
  (`HH:MM:SSZ`), and short changeId (`toolu_` stripped, 8 chars). Matches the
  plan's locked format; verified against the real S2 transcript.

### Deviations

- **Split into more modules than the plan named.** The plan said "if the engine
  nears the 250-line cap, split replay/lineage into `reconstruction_replay.ts`."
  Replay + lineage together still exceeded the cap (252 lines), and the engine's
  own extraction pushed it to 278, so I split into **three** new modules:
  `reconstruction_extract.ts` (records→events), `reconstruction_replay.ts`
  (events→revisions), `reconstruction_lineage.ts` (rename following). Each is well
  under 250 with full comments, and each has a paired test
  (`tests/reconstruction_{extract,replay,lineage}.test.ts`). This follows your
  stated preference to split over condense and the project's paired-test
  convention. No re-export/forwarding shims — callers import from the canonical
  module (e.g. tests import `extractFileEvents` from `reconstruction_extract.ts`,
  `splitLines` from `reconstruction_replay.ts`).
- **Extraction/`splitLines` tests relocated.** The S1 extraction spec and the
  trailing-newline spec moved out of `reconstruction_engine.test.ts` into the
  extract/replay test files to match where the code now lives; the engine test
  keeps the `reconstructFile`/`reconstructAll` specs.
- **CLI default-view test rewritten.** The old `(N revisions)` one-liner format is
  gone; `test_run_cli_default_lists_touched_files` now asserts the per-entry list.

### Tradeoffs

- **Edit-diff lines keep the `+ `/`- ` (space) prefix** of the S1 diff, so the new
  edit-diff test asserts `+ def goodbye():` (with the space), not the plan's
  illustrative `+def goodbye():`. Chosen for consistency with the existing S1
  render and to avoid editing the S1 diff test; the behavioral intent (show only
  real `+`/`-` lines) is met.
- **No runtime import cycle.** `reconstruction_engine.ts` holds the model types
  and imports the mechanics (extract/replay/lineage) as *values*; those modules
  import the types back *type-only* (erased), so there is no value cycle.
- **`mv` parser is the s2 form only** (`mv <src> <dst>`, two paths, no flags),
  mirroring S1's `rm <path>` parser. Flags/globs/multi-arg `mv` are deferred until
  a scenario emits them (fog of war).

### Open questions

None blocking. Per the plan, **the work is committed only after you approve** —
the working tree currently holds the S2 implementation uncommitted. Possible
follow-ups when their scenarios arrive: the `-`→`+` fine-grained sub-diff (Rule
2's deferred half), reads/observations appending to `values[]`, and `cp` lineage.

## 2026-06-22:15:05:00 — Per-line reconstruction engine (S1 slice)
Chat title: api-from-scenarios — strict typing + DRY refactor, then handoff
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/a905e9cc-9ea3-4a7e-a989-1b5e5a8896e5.jsonl

### References

/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/src/reconstruction_engine.ts
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/tests/reconstruction_engine.test.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/docs/engine-b-overview.md

### Design decisions

- **Built only the S1 slice of the design doc.** Specs for paired-changeId,
  oldLineNum chaining, and the revision-boundary rule are deferred — they need
  Edit/observation evidence that S1 doesn't emit.
- **Generic over files, not S1-named.** `reconstructFile(records, target)` is the
  per-file primitive and `reconstructAll(records)` reconstructs **every file the
  transcript touches** — so `tests/test_s1_delete.py` (created, never deleted) gets
  its own create-only history, not just the deleted `s1_delete.py`. Only the
  *evidence kinds* (write/delete) are fog-of-war limited, not the interface.
- **`EventKind` lives in `vocabulary.ts`** (coding-requirements §2: every enum has
  one canonical home), imported directly by engine and tests — no re-export shim.
- **CLI takes the transcript path as a required arg** (no hardcoded S1 default);
  `--target <path>` narrows to one file, else all touched files are rendered.
- **Split into three files by concern** (engine / render / cli), each with a
  paired test — per your preference to split rather than condense comments or
  single-line expressions to fit the 250-line cap. Runnable entry moved to
  `src/reconstruction_cli.ts`; `reconstruction_engine.ts` is now pure library.
- **`changeId` derived from the originating tool_use id** (per your call):
  deterministic runs + provenance. S1's create/delete come from different tool_use
  blocks → distinct changeIds, as the spec requires.
- **Extraction reads tool_use INPUT blocks**, not tool_result records: both the
  Write content (`input.content`) and the rm command (`input.command`) live in the
  tool_use input, so one pass over assistant records suffices — no tool_use↔result
  join needed for S1.
- **Reused the existing parse layer** (`loadTranscript`, `getContentBlocks`,
  `ToolName`/`BlockType`, `Path`/`Uuid`) as the extraction substrate.
- **Design doc moved out of the engine file.** The agreed model now lives in
  `plans/reconstruction-engine-design.md`; the source file stays under the project
  250-line cap with a one-line pointer.

### Deviations

- **Did not use subagents.** Scenario JSONLs are outside the worktree and the loop
  is a tight red→green TDD cycle needing `npm test`/`tsc`/`filesize_check` between
  steps — serial main-agent work was correct, as in the S2 slice.

### Tradeoffs

- **Events stamped at tool_use (issue) time** (the assistant block's timestamp) —
  the single source that already carries both the Write content and the rm
  command. Correct for S1; if a future scenario's evidence needs completion-time
  accuracy, that gets handled when that scenario arrives (fog of war).
- **`--diff` uses a trivial remove-all/add-all diff**, valid because S1's
  transitions are genesis (empty→N) and delete (N→empty), which never partially
  overlap. A real LCS line-diff arrives with S2's Edits, when it's needed.

### Open questions

None. S1 is fully modeled; later evidence kinds (edit, read, mv/cp, verdict) get
modeled when their scenarios introduce them — not before.

## 2026-06-22:14:40:00 — S2 (s2-move-file) parsing capabilities
Chat title: api-from-scenarios — strict typing + DRY refactor, then handoff
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/a905e9cc-9ea3-4a7e-a989-1b5e5a8896e5.jsonl

### References

/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-programming-re-compiled-blanket.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/coding-requirements.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260622-1345.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s1/01-extract-jsonl-structures-plan.md
S2 JSONL: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s2-move-file/1e82511e-05a3-4712-9a95-206b24128694.jsonl

### Design decisions

- **`StructuredPatchHunk` is now a real type** `{ oldStart, oldLines, newStart,
  newLines, lines: string[] }` (was `Record<string, never>`). s2's Edit results
  reveal it. `WriteResult.structuredPatch` stays `StructuredPatchHunk[]`; an empty
  `[]` still satisfies the new element type, so the s1 Write test is unchanged.
- **Hunk fields stay primitive.** Line ranges are `number`, diff `lines` are raw
  `+`/`-`/` ` text — free-form, no domain type (coding-requirements rule 1's
  "numbers/genuinely free-form text stay primitive").
- **`ReadResult` nests a `file` object** (`ReadFile`) matching the wire shape
  `{ type, file: { filePath, content, numLines, startLine, totalLines } }`. Only
  `file.filePath` is hydrated to `Path`; line counts stay numeric.
- **`EditResult` has no `type` field** (recon confirmed) — modeled exactly as
  emitted: `{ filePath, oldString, newString, originalFile, structuredPatch,
  userModified, replaceAll }`.
- **Gate vs. discriminant validation are separate.** `loadTranscript` validates
  record `type` + top-level keys only; it does NOT check tool names, attachment
  kinds, or block types (those are validated by their own accessors). So the s2
  acceptance test went green from the single `isMeta` gate fix; Read/Edit and the
  3 attachment kinds needed their own driving tests.
- **`ReadInput`/`EditInput` added** alongside the existing `BashInput`/`WriteInput`
  — declared but not constructed (input hydration still has no consumer), purely
  for vocabulary completeness.
- **Extracted `findToolResult(file, toolName)` test helper** (DRY, rule 3) and
  refactored the s1 Bash/Write tests onto it, removing three copies of the
  index-and-scan loop.

### Deviations

- **Did not use subagents for implementation** (the /implement skill suggests
  parallel subagents). The change set is small, tightly coupled, and gated by a
  strict red→green TDD loop that needs `npm test` + `tsc` run between each step —
  serial work in the main agent was correct here. Subagents WERE used during
  research (one verified symlink readability).

### Tradeoffs

- **`EditResult.originalFile: string`** (not `string | null`). Fog-of-war: s2
  emits a string for both Edits. Memory note `originalfile-not-always-populated`
  says it's absent on some Edits in other transcripts, so a later scenario may
  force `string | null` or optional. Modeled to s2's reality, flagged here.
- **Result `type` fields** (`WriteResult.type` "create", `ReadResult.type`
  "text") kept as plain `string`, consistent with the existing `WriteResult.type`.
  Promote to an enum only if a later scenario makes it a load-bearing discriminant.

### Open questions

1. **`EditResult.originalFile` cardinality** — keep `string`, or widen to
   `string | null` / optional now in anticipation of scenarios where it's absent?
   (Fog-of-war says keep `string` until a scenario forces the change.)
2. **Result `type` as an enum?** Should `"create"`/`"text"`/`"update"` become a
   `ToolResultType` discriminant enum, or stay free-form strings until needed?
3. **Handoff correction worth saving to memory:** subagents CAN now read the
   scenario JSONLs via the in-worktree `scenarios/` symlink (verified). The
   handoff's "subagents cannot read the Desktop path" is outdated. (Per your
   decision, fixtures still use absolute Desktop paths to match s1.)

## 2026-06-23:09:15:00 — S5 bash-redirect (`>>` append, `>` overwrite) via the file-history sidecar
Chat title: api-from-scenarios — S5 implementation
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/575b1aed-bd52-478e-a7ac-faf407c18225.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s5/s5-reconstruction-plan.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md (specs 24–28, Code-layout)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/coding-requirements.md

### Design decisions
- **Implemented the plan's 9 tasks in order, RED→GREEN, verify gate after each.** Final: 84 tests green (was 73), `tsc --noEmit` clean, every file ≤250 lines.
- **`>>` append = carried-prefix + genesis-suffix revision** (`EventKind.append`): prior lines carry forward with identity back-pointers (`carryAt`), the appended tail is genesis (`DOES_NOT_EXIST_YET`). `appendRevision` lives in the new `reconstruction_replay_edit.ts`. Append-to-absent creates the file (kind `write`).
- **`>` overwrite reuses the S4 overwrite path** — `OverwriteEvent` routes through `writeRevision(event, fileIsPresent(...))`; no new line logic.
- **Redirect content comes from the file-history sidecar, never the `echo` command** — `fillRedirectContent` reads the backup blob named by the first non-null `file-history-snapshot` taken strictly after the redirect, through an injected `BackupReader`. Tests use an in-memory map; the CLI builds the real on-disk reader (`~/.claude/file-history/<sessionId>/`).
- **Split `reconstruction_replay.ts` (247→127 lines)** into `reconstruction_replay_edit.ts` (primitives + Edit splice + `appendRevision`); one-directional import (replay → edit), no cycle.
- **`DOES_NOT_EXIST_YET` (= -1) sentinel** extracted to the leaf module `src/structures/line-model.ts`, replacing every genesis `-1` across src and tests.
- **Verb-renamed the 8 list-view helpers** (`baseName`→`getBaseName`, `entryLabel`→`getEntryLabel`, …) per coding-requirements rule 5.

### Deviations
- **DEVIATION (load-bearing): snapshot paths are cwd-relative, not absolute.** The plan's sidecar assumed `trackedFileBackups` keys matched the event's absolute target. They do not — Claude Code keys backups by the path **relative to the session cwd** (e.g. `s5_redirect.txt`), while events carry the absolute path. Without handling this, every redirect resolved to empty content (append showed 1 line, overwrite 0). Fix: `findCwd(records)` + `resolveAgainstCwd` resolve each snapshot path against the transcript `cwd` before matching; `resolve()` leaves an already-absolute path unchanged, so the rule stays correct if a future transcript stores absolute keys. Locked with `test_fill_matches_a_cwd_relative_snapshot_path_to_an_absolute_target` (Task 5) and end-to-end by the real-transcript Task 7/9 tests.
- **DEVIATION (test strengthening, Task 9):** the plan's CLI test only asserted the `append`/`overwrite` labels + a change id — these appear even with **no** reader wired (the event *kind* is set at extraction), so the test was green before the GREEN step and did not drive the reader. Strengthened it to assert the recovered line counts (`append … 2 lines`, `overwrite … 1 lines`), which require the real sidecar reader — a true RED that drives the wiring.
- **DEVIATION (test scoping, Task 8):** the plan's diff test asserted `!out.includes("+ line one")` over the whole multi-block diff, but the create revision legitimately emits `+ line one`. Scoped the negative assertions to the `@@ appended …@@` block (`appendedBlockOf`) — the actual intent ("the carried prefix is not re-emitted *in the append block*").

### Tradeoffs
- **cwd resolution via `path.resolve` over basename-matching:** basename matching would also pass S5 (one file) but collides when two files share a name in different dirs; resolving against cwd is correct and general. Cost: a `findCwd` scan of the records.
- **`reconstruction_engine.ts` is at 248/250 lines** after threading the optional `BackupReader` through `reconstructFile`/`reconstructLineage`/`seedCopyEvents`/`seedOneCopy`/`reconstructAll`. The next engine change will likely need a split (precedent: replay/render splits).

### Open questions
1. **The sidecar alignment rule assumes ≤1 mutation to a path between two non-null snapshots.** S5 satisfies it (one mutation per turn). A future scenario that mutates one file twice between snapshots would leave the intermediate state unrecoverable from the sidecar — flag it then.
2. **`reconstruction_engine.ts` at 248/250** — pre-emptively split (e.g. move the copy-seed recursion) before S6, or wait until a change forces it?
