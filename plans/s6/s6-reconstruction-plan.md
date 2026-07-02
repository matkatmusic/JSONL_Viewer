# Plan: S6 slice — `git mv` rename recognition (with cwd-relative path resolution)

Implement in the listed order. Each task is **RED first** (write the failing `test_<behavior>`
with plain-English step comments) then **GREEN** (minimum code in verb-named functions). After
every task run the three checks under **Verify gate** and do not start the next task until all
three are green.

All work is in the `api-from-scenarios` worktree, built directly on the committed S5 slice
(`003fec9`, 84 tests green, `tsc` clean). Source modules today: `src/reconstruction_engine.ts`
(model + public API + copy-seed recursion + optional `BackupReader`), `src/reconstruction_extract.ts`
(records → events), `src/reconstruction_replay.ts` / `src/reconstruction_replay_edit.ts`
(events → revisions; the Edit splice lives in the latter), `src/reconstruction_lineage.ts`
(rename/copy path resolution), `src/reconstruction_sidecar.ts` (S5 redirect content),
`src/reconstruction_render.ts` / `src/reconstruction_render_list.ts` (diff + list views),
`src/reconstruction_cli.ts`, `src/structures/vocabulary.ts` (`EventKind`),
`src/structures/line-model.ts` (`DOES_NOT_EXIST_YET`). Tests:
`tests/reconstruction_{engine,engine_s4,engine_s5,extract,replay,sidecar,lineage,render,render_list,cli}.test.ts`;
helpers `loadRecords` (`tests/utilities.ts`), `S1_JSONL`…`S5_JSONL` (`tests/fixtures.ts`). Style:
4-space indent, verb-named functions, `Path`/`Uuid` domain types (never bare strings for
paths/ids), compare enums by member (`x === EventKind.rename`), one canonical home per helper
(no forwarding/re-export shims), named types over inline anonymous returns, single-condition
branching.

## Background — why this slice exists, and what was verified

The `s6-git-mv` scenario was first captured in an **incomplete** transcript (`9cf5d06b…`) that
ended at `/exit` right after the initial commit — its `git mv` + edit ran in a cloud bridge
session and never synced into the local JSONL. The scenario was **re-run**; the complete,
single-session transcript `4ad1d191-23e8-41de-adfa-d182b6a1cf55.jsonl` is now in the clean-room
tree. Against that transcript the **current engine crashes**:

```
TypeError: Cannot read properties of undefined (reading 'values')
  at insertHunkAdditions (src/reconstruction_replay_edit.ts:112)
  at applyEdit … at appendRevisionsForEvent … at replayEvents
```

Diagnosed root cause (verified by running extraction over the transcript — it yields exactly
3 events and **no `git mv` event**): the `goodbye()` **Edit targets `s6_git_renamed.py`**, but
`git mv` is not recognized (`parseMvPaths` is anchored `^mv`, not `git mv`), so the renamed file
has no base revision and `applyEdit` splices a patch (`oldStart:1 oldLines:2`) against an empty
working set. Recognizing the rename links `s6_git.py → s6_git_renamed.py` into one lineage, gives
the Edit its base, and the crash disappears. A second, subtler fact: `git mv`'s args are
**relative** (`s6_git.py`) while every Write/Edit target is **absolute** (S2's `mv` used absolute
paths — confirmed), so the rename's paths must be resolved against the record `cwd` or the
lineage won't link even once the command is recognized.

## What S6 adds

S6 adds **one** capability: extraction recognizes a **`git mv`** Bash command as a rename, with
its relative paths resolved absolute against the record `cwd`. Everything downstream already
exists from S2 — the rename revision kind (`renameRevision`, carried lines with identity
back-pointers), the lineage collapse that merges source+destination into one history
(`reconstruction_lineage.ts`), the Edit splice (`applyEdit`), and the list/diff rendering of
`rename` and `edit`. **No new revision kind, no new per-line shape, and no sidecar** — every S6
revision's content is in the JSONL (create from Write `content`, rename carries lines, edit from
`structuredPatch`).

## Locked decisions (drive output shape; the implementer must confirm with the user — these mirror S2–S5's locked decisions and may be adjusted before coding if the user objects)

1. **`git mv` is a rename, identical to `mv` at the event level.** Generalize the existing
   `parseMvPaths` regex to accept an optional `git ` prefix (`^(?:git\s+)?mv\s+(\S+)\s+(\S+)$`)
   rather than adding a parallel `parseGitMvPaths`. One canonical mv parser, one `RenameInfo`
   construction. (Rejected: a sibling parser — it would duplicate the two-path regex and the
   `RenameInfo` shape for zero behavioral difference; DRY / one-home rule.)
2. **The rename's relative paths are resolved to absolute against the record's `cwd`** before the
   `RenameEvent` is built, so lineage links to the absolute Write/Edit targets. Resolution is
   applied to the rename specifically (the only relative-path command S6 exercises) and is
   **idempotent for already-absolute paths** (node `resolve()` leaves them unchanged), so S2's
   absolute `mv` stays correct. (Rejected: resolving at lineage-compare time — it would have to
   resolve at every path comparison; resolving once at the event source keeps every downstream
   comparison absolute, as it already is for Write/Edit.)
3. **The cwd resolver has one canonical home: a new leaf module `src/structures/path-resolve.ts`.**
   `resolveAgainstCwd` is moved there (out of `reconstruction_sidecar.ts`) so both extraction and
   the sidecar import the same helper. A leaf module (imports only node `path`) is required
   because `engine → extract` is a runtime import and `extract → sidecar → engine` would risk a
   cycle; a leaf depends on nothing in the engine graph. (Rejected: exporting it from the sidecar
   and importing the sidecar into extraction — adds an extract→sidecar edge and a forwarding hop.)
4. **No sidecar for S6.** The engine's optional `BackupReader` (added in S5) stays unused, as in
   S1–S4 — S6 has no bash redirect, and every revision's content is in the JSONL. (Confirmed: the
   transcript has no `>>`/`>` redirect event.)
5. **`applyEdit` stays strict — no defensive guard for a missing base.** The crash on the
   unrecognized rename is the *symptom*; recognizing the rename is the *fix*. A guard that
   swallowed the missing base would mask genuinely-orphaned edits in future scenarios.

## Per-line model impact

**None.** `FileRevision`, `LineEntry`, and `LineValue` are unchanged. The rename carries the
prior revision's lines forward unchanged (identity back-pointers, `renameRevision`), and the Edit
splices via `structuredPatch` (`applyEdit`) — both built in S2. S6 introduces no new genesis
sites and no new revision shape; it only makes one more Bash command produce the existing
`RenameEvent`.

## Ground truth (S6 transcript — assert against these literal values)

`tests/fixtures.ts` gets `S6_JSONL` pointing at
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s6-git-mv/4ad1d191-23e8-41de-adfa-d182b6a1cf55.jsonl`
(absolute Desktop path, matching the S1–S5 convention; the in-worktree `scenarios/` symlink
resolves to the same file).

`sessionId` = `4ad1d191-23e8-41de-adfa-d182b6a1cf55`; `cwd` =
`/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario._8e0mm8t`. Mutating events
in timestamp order (`changeId` = the tool_use id; `shortChangeId` drops `toolu_` and keeps 8):

| time (Z) | tool | changeId (toolu_…) | effect |
|----------|------|--------------------|--------|
| 17:22:28.004 | Write | `01FJ4hLHHB4qasAwKMqsoJkm` | create `s6_git.py` (2 lines) |
| 17:22:29.230 | Write | `019htcN9gshA5K4NW3B7vDR3` | create `tests/test_s6_git.py` (own history) |
| 17:23:40.748 | Bash `git mv` | `019BbcnY2hPPGBL6tntosqZ4` | **rename** `s6_git.py` → `s6_git_renamed.py` |
| 17:24:03.586 | Edit | `01CVhCVDgjHcAhYbDG7Z2jvD` | add `goodbye()` to `s6_git_renamed.py` |

The transcript's first Bash (`git init -q && … >/dev/null 2>&1 && … || …`) was **blocked** by the
harness's `block-compound.sh` PreToolUse hook and re-issued as separate commands; `git init`,
`git add`, `git commit`, `git status`, `git config`, `pytest` all correctly produce **no** file
event (verified: extraction yields exactly the 3 events above). There is no `rm`, `cp`, or
redirect event.

Literal contents:
- `s6_git.py` create → `["def hello():", "    print(\"hello\")"]` (2 lines).
- `git mv` rename → both lines carried unchanged to `s6_git_renamed.py`.
- Edit `structuredPatch` (single hunk, `oldStart:1 oldLines:2 newStart:1 newLines:6`):
  ` def hello():` / `     print("hello")` (context) then `+` / `+` / `+def goodbye():` /
  `+    print("goodbye")`. Post-edit `s6_git_renamed.py` =
  `["def hello():", "    print(\"hello\")", "", "", "def goodbye():", "    print(\"goodbye\")"]`.

## Expected reconstruction

`reconstructAll(loadRecords(S6_JSONL))` returns **two** histories:

**`s6_git_renamed.py`** (lineage `s6_git.py → s6_git_renamed.py`; keyed by the surviving path) — 3 entries:
- `0` kind `write`, 2 genesis lines (`def hello():`, `    print("hello")`; `oldLineNum ===
  DOES_NOT_EXIST_YET`), changeId `01FJ4hLH`. (Originally targeted `s6_git.py`.)
- `1` kind **`rename`**, 2 lines carried (`oldLineNum === 0` and `=== 1`, same value objects as
  entry 0), changeId `019BbcnY`.
- `2` kind `edit`, 6 lines: lines 0–1 carried (`oldLineNum === 0/1`), lines 2–5 genesis (two blank
  lines + `def goodbye():` + `    print("goodbye")`; `oldLineNum === DOES_NOT_EXIST_YET`), changeId
  `01CVhCVD`.

**`tests/test_s6_git.py`** — 1 entry: `0` kind `write` (create), its own genesis lines, changeId
`019htcN9`. Unchanged by the rename/edit.

Locked default list format (deltas appear where the line count changes: 2 → 2 → 6):
```
s6_git_renamed.py
  0  create   2 lines            17:22:28Z  #01FJ4hLH
  1  rename   2 lines            17:23:40Z  #019BbcnY
  2  edit     6 lines (+4)       17:24:03Z  #01CVhCVD

tests/test_s6_git.py
  0  create   <n> lines          17:22:29Z  #019htcN9
```
(Exact spacing/delta follow the existing renderer; the RED tests assert substrings, as S5's did.)

---

## Task 1 — Promote `resolveAgainstCwd` to a shared leaf module (refactor, no behavior change)

`resolveAgainstCwd` lives privately in `reconstruction_sidecar.ts`; Task 2 needs it in
`reconstruction_extract.ts` too. Move it to one canonical leaf home before reuse — split, never
condense; one home, no shim. Pure move — no behavior change.

**Behavior:** identical sidecar output; the resolver now lives in a leaf module imported by both
the sidecar and (in Task 2) extraction.

**RED:** add to `tests/reconstruction_sidecar.test.ts` an import-driven check that fails to
resolve until the new module exists:
```ts
import { resolveAgainstCwd } from "../src/structures/path-resolve.ts";

// resolveAgainstCwd joins a relative path onto cwd and leaves an absolute path unchanged.
test("test_resolve_against_cwd_joins_relative_and_passes_absolute_through", () => {
    // A relative path is joined onto the cwd.
    const cwd = new Path("/work/dir");
    assert.equal(resolveAgainstCwd(cwd, new Path("a.py")), "/work/dir/a.py");
    // An already-absolute path is returned unchanged (idempotent — why S2's absolute mv stays correct).
    assert.equal(resolveAgainstCwd(cwd, new Path("/abs/a.py")), "/abs/a.py");
});
```
The module does not exist yet → RED (does not resolve).

**GREEN:**
1. Create `src/structures/path-resolve.ts` with a header comment ("Resolve a path against a
   transcript `cwd` to one canonical absolute string. A leaf module — imports only node `path` —
   so both extraction (rename targets) and the sidecar (snapshot paths) share one resolver with
   no engine import cycle.") and **move** `resolveAgainstCwd` here, exported, signature unchanged
   (`(cwd: Path | undefined, path: Path): string`).
2. `src/reconstruction_sidecar.ts` now imports `{ resolveAgainstCwd }` from
   `./structures/path-resolve.ts`; delete its local copy. Prune the now-unused `resolve` import
   (`noUnusedLocals` makes a stray import a hard `tsc` error).

**Verify gate.**

---

## Task 2 — Recognize `git mv` and resolve its relative paths (the feature)

This single change makes extraction emit a `RenameEvent` for `git mv` with **absolute** `from`/`to`,
which links the lineage and removes the engine crash.

**Behavior:** a Bash `git mv <src> <dst>` becomes a `RenameEvent` whose `from`/`to` are resolved
absolute against the record's `cwd`; a plain `mv <abs> <abs>` (S2) still yields the same absolute
rename; reconstructing the real S6 transcript yields the two histories in **Expected
reconstruction** instead of throwing.

**RED:** two tests.

In `tests/reconstruction_extract.test.ts` (unit — synthetic `git mv` record with a `cwd`):
```ts
// `git mv a.py b.py` issued with cwd /work extracts to one rename whose from/to are resolved
// absolute against that cwd — so the rename can later link to the absolute Write/Edit targets.
test("test_extract_maps_git_mv_to_a_rename_with_cwd_resolved_paths", () => {
    // Build one assistant record: a Bash tool_use `git mv a.py b.py`, on a record whose cwd is
    // /work — the same hand-built record shape the existing extract tests use for Bash commands.
    const records = buildGitMvRecords(); // cwd = new Path("/work"), command = "git mv a.py b.py"
    // Extract the file events from that record.
    const events = extractFileEvents(records);
    // Exactly one event is produced (git noise aside), and it is a rename — git mv is recognized
    // like a plain mv.
    assert.equal(events.length, 1);
    const rename = events.find((event) => event.kind === EventKind.rename)!;
    // The relative args were resolved against cwd, so both endpoints are absolute under /work.
    assert.equal(rename.from.toString(), "/work/a.py");
    assert.equal(rename.to.toString(), "/work/b.py");
});
```

In a new `tests/reconstruction_engine_s6.test.ts` (integration; add `S6_JSONL` to
`tests/fixtures.ts` first — this test **throws today**, so it is the RED):
```ts
// The real s6 transcript reconstructs to the renamed file's create->rename->edit lineage plus
// the test file's own create — not a crash (the git mv links s6_git.py into s6_git_renamed.py).
test("test_git_mv_links_rename_lineage_and_applies_later_edit", () => {
    // Reconstruct every history from the real s6 transcript (no BackupReader — s6 has no redirect).
    const histories = reconstructAll(loadRecords(S6_JSONL));
    // The renamed file is one history with three revisions.
    const renamed = histories.find((h) => h.target.toString().endsWith("s6_git_renamed.py"))!;
    const revisions = renamed.revisions;
    assert.equal(revisions.length, 3);
    // Revision 0 is the create, two genesis lines.
    assert.equal(revisions[0]!.kind, EventKind.write);
    assert.equal(revisions[0]!.lines[0]!.values[0]!.line, "def hello():");
    // Revision 1 is the rename, both lines carried (oldLineNum 0 and 1).
    assert.equal(revisions[1]!.kind, EventKind.rename);
    assert.equal(revisions[1]!.lines[0]!.oldLineNum, 0);
    assert.equal(revisions[1]!.lines[1]!.oldLineNum, 1);
    // Revision 2 is the edit: goodbye() appended as genesis lines after the two carried lines.
    assert.equal(revisions[2]!.kind, EventKind.edit);
    assert.equal(revisions[2]!.lines.length, 6);
    assert.equal(revisions[2]!.lines[4]!.values[0]!.line, "def goodbye():");
    // The test file is its own untouched history.
    assert.ok(histories.some((h) => h.target.toString().endsWith("tests/test_s6_git.py")));
});
```

**GREEN:** in `src/reconstruction_extract.ts`:
1. Generalize the regex and update the comment:
   ```ts
   // Parse `mv <src> <dst>` or `git mv <src> <dst>` (two space-separated paths, no flags).
   function parseMvPaths(command: string): RenameInfo | undefined {
       const match = command.trim().match(/^(?:git\s+)?mv\s+(\S+)\s+(\S+)$/);
       if (!match) {
           return undefined;
       }
       return { from: new Path(match[1]!), to: new Path(match[2]!) };
   }
   ```
2. Thread the record's `cwd` to the rename event and resolve. Add a `cwd: Path | undefined`
   parameter to both `toFileEvent` and `bashEventFrom` — one extra positional parameter on each,
   threaded exactly the way `timestamp` already is. `collectEventsFromRecord` already holds the
   `record`; read its cwd as `(record as { cwd?: Path }).cwd` (the pattern `findCwd`/
   `findSessionId` use — `cwd` is hydrated to `Path` by `parseRecord`) and pass it into
   `toFileEvent`. The pre-existing verb-less dispatchers (`toFileEvent`, `bashEventFrom`,
   `writeEventFrom`, `editEventFrom`) keep their names: renaming them is out of S6's surgical
   scope and would touch the whole dispatch (they were left as-is through S2–S5). In the rename
   branch of `bashEventFrom`, resolve both paths to absolute before building the event:
   ```ts
   import { resolveAgainstCwd } from "./structures/path-resolve.ts";
   // …
   const moved = parseMvPaths(input.command);
   if (moved) {
       return {
           kind: EventKind.rename,
           changeId: block.id,
           from: new Path(resolveAgainstCwd(cwd, moved.from)),
           to: new Path(resolveAgainstCwd(cwd, moved.to)),
           timestamp,
       };
   }
   ```
   Resolution is idempotent for the absolute S2 `mv`, so its test stays green. Leave the
   `rm`/`cp`/redirect branches unchanged (S1/S3/S5 used absolute paths); the shared resolver makes
   extending to them trivial later if a scenario needs it.

**Verify gate.** (Confirm `reconstruction_extract.ts` stays ≤250 lines after the cwd threading;
if it would exceed, split the Bash parsers into a sibling module — split, never condense.)

---

## Task 3 — CLI default-view lock-in on the real transcript + docs

No render code is expected: `getEntryLabel` already returns `rename` and `edit`, and the diff
renderer heads both (built in S2). This task locks the real-transcript output and updates the
living docs.

**Behavior:** the no-flag CLI view of the real S6 transcript lists `s6_git_renamed.py` with
`create` → `rename` → `edit` and the right short change ids, plus `tests/test_s6_git.py` with a
`create`.

**RED:** add to `tests/reconstruction_cli.test.ts` (import `S6_JSONL`):
```ts
// The default view lists the renamed file's create -> rename -> edit and the test's create.
test("test_default_view_lists_s6_git_mv_lineage", () => {
    const out = runCli([S6_JSONL]);
    // The renamed file appears with both its rename and its later edit.
    assert.ok(out.includes("s6_git_renamed.py"));
    assert.ok(out.includes("rename"));
    assert.ok(out.includes("edit"));
    // The git mv and the goodbye edit carry their short change ids.
    assert.ok(out.includes("#019BbcnY")); // the git mv
    assert.ok(out.includes("#01CVhCVD")); // the goodbye edit
    // The test file is listed as its own create.
    assert.ok(out.includes("tests/test_s6_git.py"));
});
```
This passes once Task 2 lands (it crashed before). If any label is missing, add the branch
(unlikely — verified present) before moving on.

**GREEN (docs; no engine code expected):**
1. `plans/reconstruction-engine-design.md` — add the S6 specs (continuing after S5's 24–28):
   - **29. `git mv` recognition** — `parseMvPaths` matches `mv` and `git mv`; the rename's
     relative paths are resolved absolute against the record `cwd` so the lineage links.
   - **30. cwd path resolution** — `resolveAgainstCwd` (now in `structures/path-resolve.ts`) is
     the one canonical resolver, idempotent for absolute paths, shared by extraction and sidecar.
   - **31. `git mv` reconstruction** — `reconstructAll(S6)` returns the `s6_git_renamed.py`
     create→rename→edit lineage plus the test file's create.
   Add `structures/path-resolve.ts` to the Code-layout section.
2. `plans/implementation-notes-api-from-scenarios.md` — append a dated S6 entry (git mv as a
   rename; cwd-relative resolution as the net-new subtlety; the incomplete-transcript discovery
   and re-run; the crash-on-orphaned-edit that recognition fixes; decisions and any deviations).
3. `plans/roadmap.md` — mark the S6 row done.

**Verify gate**, then run the End-to-end check, then stop and report. Commit only after the user
approves.

---

## Verify gate (run after every task; all three must pass before the next)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # all prior (84) + new S6 specs, 0 fail
npx tsc --noEmit         # No errors found (tsx does NOT type-check; this is the real type gate)
# filesize_check.py only reads argv[1]; loop over every file individually:
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
`noUnusedLocals`/`noUnusedParameters` make a stray import a hard error — prune precisely when
moving the resolver in Task 1. Ignore any stale `PostToolBatch`/`PostToolUse` in-batch hook
failure for a file written in the same batch as its test — `npm test` run manually is
authoritative. Clean room is absolute: never import or copy from
`/Users/matkatmusicllc/Desktop/claude code src/` beyond the `S6_JSONL` fixture path.

## End-to-end check (after Task 3)

```
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s6-git-mv/4ad1d191-23e8-41de-adfa-d182b6a1cf55.jsonl" 2>/dev/null
# Expect two files: s6_git_renamed.py with create (#01FJ4hLH) -> rename (#019BbcnY) ->
# edit (#01CVhCVD, "6 lines (+4)"), and tests/test_s6_git.py with a create (#019htcN9).
# Add --diff to see the rename head and the edit adding goodbye(); --verbose for full states.
```

## Risks / out-of-scope (flag to the user; not part of S6's tasks)

- **Latent `2>&1` / `>/dev/null` redirect mis-parse (S5 regression).** `parseRedirect`'s
  `(?<!>)>\s*(\S+)\s*$` matches a trailing `2>&1` (capturing `&1`) or `>/dev/null`, minting a
  spurious overwrite/append to a non-file target (observed on the older `9cf5d06b` transcript,
  which mis-read `ls … 2>&1` and `git log … 2>&1` as writes to a file named `&1`). **S6's
  transcript does not trigger it** — verified: extraction yields exactly the 3 real events, no
  spurious ones (every git/pytest command was non-compound and none ended in a redirect). It is
  therefore **out of S6 scope**, but is a real bug worth a dedicated hardening slice: make
  `parseRedirect` ignore fd-duplication (`N>&M`) and non-file targets (`/dev/null`), e.g. exclude
  a `>` preceded by a digit/`&` and a target beginning with `&`. Recommend tracking it separately.
