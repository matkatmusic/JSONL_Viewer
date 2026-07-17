# Implementation Notes — i-need-a-cli-parsed-quasar

Running log of design decisions, deviations, tradeoffs, and open questions while
implementing the plan at `~/.claude/plans/i-need-a-cli-parsed-quasar.md`.

---

## 2026-06-10 ~11:37 PDT — Kickoff

Read the spec and all reused modules (`replay-edits.js`, `extract-file-state.js`,
`extract-bash-file-ops.js`, `git-file-state.js`, `probe-projects.js`,
`tests/test-helpers.js`). Confirmed exact exported signatures.

### Design decisions (where the spec left detail to the implementer)

1. **`collectTouches` touch composition.** The spec lists touches as
   `extractReadEdits (read)` ∪ `create/update/edit/cat from extractEditsFromJSONL`
   ∪ `rm paths` ∪ `redirect path`. Concrete decisions:
   - Reads come from `extractReadEdits(lines, parsed)` **directly** (unfiltered) —
     the gotcha fix. `extractEditsFromJSONL`'s own filtered reads are a subset and
     would only duplicate; harmless for set-membership matching.
   - `extractEditsFromJSONL` output is heterogeneous: it mixes tool edits (have
     `filePath`), cat edits (type `update`, no `source`), filtered reads
     (`source:'read'`), snapshot edits (`source:'snapshot'`), AND raw bash-op
     objects (cp/mv/git-mv/rm/redirect — **no `filePath`**). I take touches only
     from items that have a `filePath` and `type ∈ {create, update, edit}`. The
     bash-op objects are skipped here and handled separately.
   - **Snapshot edits** (`source:'snapshot'`) are NOT counted as touches — the spec
     enumerates read/write/edit/cat/rm/redirect, not snapshot. A snapshot is a
     file-history backup, not an action the session took on the file.
   - `rm` and `redirect` touches come from `extractBashFileOps`, resolved to
     absolute via session cwd.

2. **Lineage `ops` vs touch-producing ops.** `extractBashFileOps` returns all of
   cp/mv/git-mv/rm/redirect. I split them: cp/mv/git-mv become lineage `ops`
   (graph edges); rm/redirect become touches. This keeps `buildLineageGraph` fed
   only the rename/copy edges the spec specifies.

3. **Path resolution.** A `resolveAgainstCwd(cwd, p)` helper expands a leading `~`
   to `os.homedir()`, then `path.resolve(cwd, p)`. Applied to all bash-op paths
   (src/dst/paths/path), which may be relative. Read/write/cat already carry
   absolute paths.

4. **`findReferencingJsonls` sort order.** Spec says "sorted by first matching
   touch (stable, deterministic)." I sort by the minimum `line` index of a matching
   touch within each JSONL, tie-broken by absolute file path string. No wall-clock
   timestamp needed; line order is already deterministic and reproducible.

### Deviations

None yet — composing from the granular extractors rather than post-filtering
`extractEditsFromJSONL` is within the spec's stated intent ("call `extractReadEdits`
directly and merge").

### Open questions

None blocking. (Snapshot-exclusion decision above is the only judgment call; flagged
for review but does not change tool I/O shapes.)

---

## 2026-06-10 ~11:50 PDT — Implementation complete

All 7 plan steps done, strict RED→GREEN. Final state:

- `tests/test-helpers.js` — added `makeBashCommandLine` + `runWithContext`; `run()`
  left untouched.
- `tests/test-collect-touches.js` (8 tests) → **8/8 PASS**.
- `common/collect-touches.js` (272 lines) → GREEN.
- `tests/test-find-jsonls-at-commit.js` (7 tests) → **7/7 PASS** (real-git
  integration test ran, not skipped).
- `tools/find-jsonls-at-commit.js` (Tool 2) → GREEN.
- `tools/find-jsonls-for-file.js` (Tool 1) → GREEN.

### Verification results (falsifiable, per verify-work.md)

1. Both new suites PASS (were RED — `MODULE_NOT_FOUND` — before implementation).
2. Full regression: every real suite green (test-replay 12, test-extract 10,
   test-git-file-state 20, test-unified-reconstruct 67, etc.).
3. Tool 1 smoke on `common/replay-edits.js` → 3 session JSONLs in `referencedIn`.
4. Rename-following: proven by unit test
   `test_findReferencingJsonls_returnsSessionThatTouchedPreRenameName` (pre-rename
   session returned when querying the post-rename name).
5. Tool 2 smoke: existing path → `onDisk:true`, `currentPath` set, `referencedIn`
   non-empty; nonexistent path → `onDisk:false`.

### Deviations / notes for the user

1. **`gitFollowHistory` stderr suppressed.** Added `stdio: ['ignore','pipe','ignore']`
   to the `execFileSync` call. `execFileSync` inherits stderr by default, so a
   non-repo argument printed git's `fatal:` line to the terminal. Suppressing it
   keeps the tool's stdout JSON clean. Behavior unchanged; only noise removed.

2. **`tests/test-output-data.js` is NOT a test.** It is a pre-existing untracked
   viewer data dump (`window.JSONL_RAW = {...}`, ~270k tokens) that happens to
   match the `tests/test-*.js` glob and errors under Node. Unrelated to this work
   and not a regression I introduced. The regression loop should arguably exclude
   it (or it should be renamed), but I left it untouched (surgical scope).

3. **Pre-existing deep-nesting hook warnings on `test-helpers.js`** (lines around
   the `makeBash*`/`makeRead*` JSON-literal builders) are false positives on
   data-literal indentation in code I did not write. Not refactored (surgical
   scope; don't touch working adjacent code).

4. **No dedicated unit suite for Tool 1** — per the plan, its logic is
   `findReferencingJsonls` (covered by collect-touches test #7) and its arg-parsing
   by the Tool 1 smoke test. A hook warned about the missing file; this is the
   intended design, not an omission.

5. **Stray file deleted:** `~/.claude/plans/i-need-a-cli-parsed-quasar-agent-acb451ea7beb13567.md`
   (created by a misbehaving Explore agent) removed as instructed.

### Open questions for the user

None block usage. Two optional follow-ups you may want to confirm:
- (a) Should the regression runner skip/rename `tests/test-output-data.js` so the
  `for f in tests/test-*.js` loop stays clean?
- (b) Snapshot edits (`source:'snapshot'`) are intentionally excluded from touches
  (a file-history backup is not a session action). Confirm that matches your intent.
