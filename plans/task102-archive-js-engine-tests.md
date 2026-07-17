# Task 102 — Move historical JS-engine tests and fixtures into js-engine/archived/

Pure file-move + task closure. No code changes, no tests to write or run
(the moved files are untracked legacy artifacts with zero live references —
verified 2026-07-14 via grep over src/, tests/, scripts/, webapp/, package.json).

All paths are relative to the repo root
(`/Users/matkatmusicllc/Desktop/claude code src/RevEng`).

## Scope decisions (already made — do not revisit)

- `api/` **stays put**: it is JFReD's live engine, referenced by `jfred/jfred.html` (task 58).
- `tests/archive/envelope.test.ts` **stays**: it is early Engine-B TypeScript
  (imports `src/structures/vocabulary.ts`), not JS-engine code.

## Step 1 — Move the files

All four sources are untracked, so plain `mv` (not `git mv`) is correct.

```sh
mkdir -p js-engine/archived/tests js-engine/archived/fixtures
mv tests/archive/test-file-event-observations-readedits.js js-engine/archived/tests/
mv tests/archive/test-probe-helpers.js js-engine/archived/tests/
mv tests/archive/test-probe-projects.js js-engine/archived/tests/
mv tests/fixtures/scenario-check js-engine/archived/fixtures/scenario-check
```

Verify: `tests/archive/` now contains only `envelope.test.ts`;
`tests/fixtures/scenario-check` no longer exists;
`js-engine/archived/fixtures/scenario-check` contains 27 files (count before move: 27).

## Step 2 — Close task 102

1. In `tasks.json` (a top-level JSON array): remove the object with
   `"taskNumber": 102`.
2. In `completedTasks.json` (a top-level JSON array): append that same object,
   extended with:
   - `"completionDate": "2026-07-14"`
   - `"commitHashes": []` — empty because the work is staged only, not committed.
   - `"closureNote"`: one or two sentences stating that the 3 legacy JS test
     files and the scenario-check fixtures moved to `js-engine/archived/`
     (tests/ and fixtures/ subfolders), that `api/` stayed put because it is
     JFReD's live engine, and that `envelope.test.ts` stayed in `tests/archive/`
     because it is Engine-B TypeScript, not JS-engine code. Note it supersedes
     task 99's commit-or-ignore question (the files get committed at their new home).
3. Match the existing field order used by other entries in `completedTasks.json`
   (`taskNumber`, `title`, `description`, then completion fields; task 102 has
   no `handoffFilePaths` — omit that field).
4. Validate both files parse: `node -e "require('./tasks.json'); require('./completedTasks.json')"`.

## Step 3 — Stage, do NOT commit

```sh
git add js-engine tasks.json completedTasks.json
```

`tests/archive/` and `tests/fixtures/scenario-check` were never tracked, so
there is nothing to stage on the old paths. Do not commit; do not run any
test suite. Confirm with `git status --short` that `js-engine/` files show
as `A ` and both JSON files as `M `.
