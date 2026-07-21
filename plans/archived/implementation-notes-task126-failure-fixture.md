## 2026-07-20:12:25:00 — Task 126: failure-path fixture (demo-corrupt) + launch.json entry
Chat title: task126-failure-fixture
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/f5da9f3c-d0df-474d-a461-b37c2d8fe885.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task126-failure-path-fixture-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/demo-corrupt/projects/s87-demo-composite/ee3482f5-9efa-4827-ae72-85bc9975a9a4.jsonl
/Users/matkatmusicllc/Desktop/claude code src/RevEng/.vscode/launch.json
/Users/matkatmusicllc/Desktop/claude code src/RevEng/.vscode/tasks.json
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/src/reconstruction_replay.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/src/viewer_api.ts

### Design decisions

- Corruption = `toolUseResult.structuredPatch[0].lines = null` on line 76 of session
  `ee3482f5-9efa-4827-ae72-85bc9975a9a4.jsonl` (Edit `toolu_01HBGW8JsVGEN8cSzpaWsYNj` on
  `inventory.py`, 2026-07-17T23:44:09Z). The task's suggested `old_string` mangling would have
  done NOTHING: the engine replays Edits from structuredPatch hunks, and `applyEdit` never
  throws on content mismatch. A null hunk-lines array is the one data-reachable corruption that
  survives hydration/extraction (both pass it through unvalidated) and throws inside the
  per-event replay try/catch → `unrecoverableRevision`.
- Target file `inventory.py`: the bundle's most-edited file (20 Edits across 7 sessions), so the
  viewer shows a real rev-card ladder around the placeholder.
- `demo-corrupt/` carries NO `repo.git.tar` copy — the prep task extracts `demo/repo.git.tar`
  directly (no duplicated 218 KB binary in git).
- Launch config adds `--resetDocumentCache`: the document cache is keyed by session and the
  corrupt bundle shares session UUIDs with the clean demo — a warm cache would serve the clean
  document and hide the failure UI (also sidesteps the known warm-cache-drops-stage-notes trap).

### Deviations

- `preLaunchTask` is a new `prep:demo-corrupt` task (tar extract, `dependsOn: build:webapp`)
  instead of the task-126 text's `build:webapp`. The tar contains a literal `.git/`; extracting
  it before staging triggers the gitlink trap that drops the JSONLs from the index. Extracting at
  F5-time mirrors `npm run demo` exactly and keeps the staged fixture tar-free. The staging was
  done BEFORE any launch, so no `.git` existed under `demo-corrupt` at add time (verified:
  `git ls-files demo-corrupt` lists 68 regular files, JSONLs included).
- Launch args also pass `--file-history-dir demo-corrupt/file-history` (not just
  `--projects-dir`): `npm run demo` passes both; without the sidecar dir the reader-dependent s87
  mechanisms degrade the whole session, not just the corrupted edit.

### Tradeoffs

- Verified headlessly with a throwaway probe (deleted after use) calling the viewer's own
  `buildProjectDocument` composition rather than launching the server + CDP. Probe result:
  `inventory.py` = 4 revisions `edit, user-edit, edit(UNRECOVERABLE: TypeError: hunk.lines is
  not iterable), user-edit`, plus 2 `seedStaleEditBases` file-stage health failures (the same
  broken hunk trips the reseed stage first; its per-stage wrapper catches, then replay's
  per-event wrapper produces the placeholder). No test suite was run (per instructions).

### Follow-up (2026-07-20 ~13:05, after the user exercised the fixture live)

The user observed both t124:Q2 symptoms in the running viewer and asked for fixes:

- Clicking the placeholder rev-card showed "(no content change in this revision)" — correct
  mechanically (the placeholder's lines ARE the prior revision carried forward, so the computed
  diff is empty) but misleading. FIX: `showCardDiff` in
  `webapp/views/details-revision-view.ts` now short-circuits on `card.unrecoverableReason` and
  shows "NOT RECONSTRUCTED — <reason>" plus a carried-forward note instead of computing a diff.
- No selection rectangle on the clicked placeholder card. Cause: `.rev-card.missing`
  (styles.css:1089) is declared AFTER `.rev-card.selected` (:651) at equal specificity, so the
  red dashed border always won. FIX: new `.rev-card.missing.selected` rule after the missing
  block (accent border + background, dashed style kept).
- The diff-pane fix pushed details-revision-view.ts over the 250-line cap (257) → split the
  card DOM builders (head row, action row, missing card, jump-to-step) into new
  `webapp/views/details-revision-cards.ts` (68 lines); main file now 205. Both typechecks
  clean (`tsc -p tsconfig.webapp.json` + `tsc --noEmit`). No tests run (per instructions);
  the pre-existing "no test file found" hook warning for this view predates the change — the
  view's tested half lives in details-model.ts.

### Open questions

- None blocking. Step 4 of task 126 (load the session in a browser, pass consent, click the
  placeholder rev-card and observe the carried-forward-diff-instead-of-reason behavior — t124:Q2)
  is inherently interactive and left to the user: run "Debug viewer server (failure fixture)",
  open session `ee3482f5-…`, open `inventory.py`, click the UNRECOVERABLE card at 23:44:09.
  Task 126 stays OPEN until that observation is done.
