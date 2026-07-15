# Handoff: RevEng `develop` state dump — item 84 shipped, task tracking migrated to JSON, engine memoization uncommitted in the tree
Conversation name: review TASKS.md #84 → tackle-tasks 84
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/6b82f2c5-dd59-403f-bf4e-87afc59bfa14.jsonl
Plan file: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item84-unify-bottom-pane.md
Implementation notes: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-item84-unify-bottom-pane.md

## Branch
`develop` based on `master`. HEAD = `e60c7f0`.

This is a **broad state dump**, not a single-task handoff. No work is in flight. Read the "What
Remains" list and pick — do not assume a task is already underway.

## Goal

RevEng (`api-from-scenarios`) is clean-room TypeScript that reconstructs the file-change history of
a Claude Code session from its JSONL transcript, plus a web viewer (`webapp/`) that renders that
reconstruction as a timeline. The engine is validated scenario-by-scenario against ground truth
(84/85 scenarios reproduce; s85 is the known failure). Current work is mostly viewer polish and
engine performance, not new reconstruction capability.

## Current State

### Shipped this session — item 84 (commit `4db263a`), fully committed, nothing in flight

"Unify the bottom pane for ALL file-related content." There is now ONE view for a file — the
Revision View (`renderDetailsFileMode`, `webapp/views/details.ts`) — and every route into it picks
(which file, which revision selection, which right-column mode). Every timeline chip-row button is
a deep-link into it; button X ≡ `click the treeview entry → click that revision's card → click the
card's X`:

| Route | Right column |
|---|---|
| Files treeview click | revision #1, diff (unchanged from before item 84) |
| Chip name | that revision's file content |
| `+/-` | that revision's diff (the card's own default render) |
| `{ }` | that revision's causing JSONL record, rev cards still shown |
| `⤷` | same as chip name; the button's PRESENCE is a "has a snapshot" indicator |

It was a net deletion. Retired (commented out, not deleted — house rule): `showFilePreview`,
`showRevisionDiff`, `toggleDrawerButton`, `fetchStepFiles`, plus the `renderDiffText` /
`splitDiffBlocks` / `renderCodeInto` imports in `timeline.ts`. Added: `RevisionViewMode` enum
(diff/content/record), a `RevisionFocus` type, a `focus?` param on `renderDetailsFileMode`, three
pure tested helpers, two `DetailsContext` callbacks (`openRecordForChangeId`, `fetchRangePatch`), a
6th `{ }` rev-card action, and `☐`/`☑` range toggles (a contiguous card run renders the step-range
diff that used to live in `showFilePreview`).

Two user-reported bugs were fixed in the same commit: `⤷` used to `location.hash` to the File
History route and force a full page reload; and "Files touched" rendered ellipsis-truncated
absolute paths instead of item 77's file-tree component.

Verification status: `npm run typecheck` and `npm run build:webapp` clean.
`tests/details-revision-view.test.ts` + `tests/details-viewmodels.test.ts` = 17/17 pass.
**The full suite was NOT run, and no browser has driven the new behavior.**

### Task tracking moved out of TASKS.md (commits `182c67a`, `d47314c`, `e2b0186`, `e60c7f0`)

`TASKS.md` is now **audit history only**. Live tracking:
- `tasks.json` — 25 open tasks
- `completedTasks.json` — 71 completed (item 84 is in here)

New skills exist for it: `/create-task`, `/pick-a-task`, `/tackle-tasks`, `/update-tasks`,
`/view-task`. `/view-task` exists because the JSON descriptions are escaped blobs — use it rather
than reading the raw JSON. Anything a previous session wrote into `TASKS.md` prose is stale.

### Uncommitted in the working tree — READ THIS BEFORE EDITING `src/`

**None of the uncommitted work is item 84's. Do not clobber it, and do not assume it is yours.**

1. **Engine memoization, ~46 lines across 4 files** (`src/reconstruction_corpus.ts`,
   `reconstruction_extract.ts`, `reconstruction_git_evidence.ts`, `reconstruction_sidecar.ts`).
   Extends `CorpusState` with a "pure group" of caches keyed on records identity — caches that
   depend on the records ALONE and therefore never invalidate: `fileEvents`, `gitCommitEvents`,
   `scriptRuns`, `backupTimelinesByCwd`. `extractFileEvents`, `findGitCommitEvents` and the sidecar
   backup-timeline builder now read through `getCorpusState(records)`. Motive: the per-file repair
   chain re-enters these for every reconstructed file. `backupTimelinesByCwd` IS wired
   (`reconstruction_sidecar.ts:42`); `scriptRuns` is declared but I did not confirm a reader.
   Provenance: predates this session, author unknown to me. Related memory notes mention a
   "pre-existing `extractFileEvents` memoization" and an uncommitted item-68 read-only script gate.
2. **`package.json`** — the `app` script gained `--projects-dir scenarios/executed`.
3. **`scenarios`** submodule bumped `8639234` → `075ef56`.
4. **`plans/` archive move** — 23 notes/plans deleted from `plans/` and re-added untracked under
   `plans/archived/` (a move, mid-flight). Plus long-standing untracked dirs that are the frozen
   legacy island: `api/`, `diff/`, `jfred/`, `archive/`, `docs/`, `logs*.txt`.

## What Remains

Ordered by what I'd do first. All of 1-4 are already tracked in `tasks.json`.

1. **Run the full suite: `npm test`.** It has not been run since item 84 landed. Baseline
   expectation from the project narrative: ~467 tests with **1 pre-existing s85 failure that is the
   healthy baseline** — do not "fix" it, it is tracked separately. Anything else failing is new.
2. **Browser-verify item 84** (task: *"Deferred browser verifications: items 78, 80, 84 and the
   unified-reconstruction fix"*). Client behavior is the user's standing visual-verify convention;
   nothing has driven this in a real browser. On `s84-multiagent-scripts-git-baseline`, confirm:
   chip name → rev cards + content; `+/-` → rev cards + diff; `{ }` → the record with rev cards
   STILL shown; `⤷` → no page reload; `#details-left` never stale after any of them; "Files
   touched" shows a tree of ONLY that node's files; a contiguous `☑` run renders a range diff and a
   gapped one is refused.
3. **Decide the fate of the uncommitted engine memoization** (above). It is either someone's
   in-flight work or an abandoned experiment. It typechecks and is not obviously broken, but it has
   no committed home and no test naming it. Ask the user before committing OR reverting.
4. **Pick from `tasks.json`** — 25 open. The three item-84 follow-ups I raised are in there:
   - *"renderFileHistoryView is a near-duplicate of the Revision View — consolidate?"* — the
     meatiest. `file-history.ts:161` renders per-revision rows with the SAME five actions as the rev
     cards. It is the last surface item 84's rule does not cover.
   - *"`⤷` snapshot-jump button renders for any matched changeId, not only snapshot-backed
     revisions"* — the indicator may not mean what it claims. See below.
   - *"Split oversized files: webapp/views/timeline.ts, webapp/views/details.ts, ..."*

## Key Files

- `webapp/views/details.ts` (685 lines) — **THE Revision View.** `renderDetailsFileMode` is the one
  renderer for a file. Also message/commit modes and `appendFileList` (the "Files touched" tree).
- `webapp/views/timeline.ts` (2082 lines) — the timeline. `renderFileButtonRow` (~1650) is the chip
  row; `detailsContext` (~1820) is where the details pane's callbacks are wired. The retired item-84
  renderers sit commented out around 1540-1640.
- `webapp/views/sidebar.ts` — the file-tree component. `renderFileTreeNode` is exported and takes a
  `selectionRoot`, because two trees now exist on screen (`#drawer` and `#details-left`).
- `webapp/inspector.ts` — `openInspectorPane` (:353). **Only ever touches the right column.** That
  single fact is why `{ }` keeps the rev cards for free.
- `webapp/views/file-history.ts` — `renderFileHistoryView` (:161), the third near-duplicate.
- `tests/details-revision-view.test.ts` — item 84's 11 pure view-model tests.
- `tasks.json` / `completedTasks.json` — live task tracking. Read via `/view-task`.
- `plans/coding-requirements.md` — mandatory style: domain types over primitives, enum-member
  comparisons, verb-named functions, no re-export shims.

## Context the Next Agent Won't Have

**The project's own task text lied three times about its own code.** Item 84's description (written
in this session, from a subagent trace) asserted things the code contradicted. Each was caught only
by reading the source. Do not trust a task description over the code:
- It claimed `⤷` resolved a DIFFERENT revision than `+/-`. False — `computeSnapshotJumpRoute`
  (`timeline.ts:284`) resolves `findRevisionForChangeId(files, change.changeId, undefined)`, the
  chip's own changeId, exactly what `+/-` resolves.
- It claimed deleting `showRevisionDiff` would retire `showRevisionDiffInDetails` as a duplicate.
  False — the latter has a live caller (`appendFileList`), and it SURVIVES as the single
  implementation. The timeline copy was the one to delete.
- It claimed a guard was needed because commit nodes could own revision cards. False —
  `CommitNode` and `ToolCallNode` declare BOTH `fileChanges?: undefined` AND `snapshots?: undefined`,
  so a snapshotless owner is unreachable. The guard in `computeOwningNodeIndexes` is still correct,
  but for a different reason: an owner with an EMPTY `snapshots: []` would make `computeRangeSummary`
  (`timeline.ts:416-421`) `Math.min()` an empty array into `Infinity` and issue a garbage
  `/api/range-patch` request.

**User preferences learned or reconfirmed here:**
- **Comment out, don't delete.** When replacing code, comment the old body out first; delete only
  after the new code is confirmed working in the browser. This is why item 84's retired renderers
  are still in `timeline.ts` as comments, and why their now-dead CSS (`.file-preview-drawer`,
  `.timeline-preview`, `.dfile`) was deliberately LEFT in `styles.css` — deleting it would break the
  rollback path. That CSS goes when the commented JS goes, not before.
- **No forwarding layers.** `clearSidebarFileSelection` was renamed to `clearFileSelectionIn(root)`
  rather than wrapped, because a function that only re-calls another is banned.
- **The user corrects course mid-item and expects it absorbed, not re-argued.** `⤷` reversed twice:
  first "don't change it", then "its navigation is a bug". The stable intent was: keep the BUTTON
  (its presence is the signal), fix the CLICK.

**A live inconsistency the user has not ruled on.** `⤷` was kept because its presence indicates a
revision that HAS a File History Snapshot. But `computeSnapshotJumpRoute` returns `undefined` only
when the changeId is absent, resolves to no history, or resolves to a blob name with no anchored
revision — so it renders for essentially ANY changeId matching a revision, snapshot-backed or not.
The indicator may not mean what it is kept for. Tracked in `tasks.json`; do not "fix" it silently.

**Hooks fire constantly and mostly do not matter.** `jot:post_tool_use` warns "File size … (limit:
250)" on every edit to `timeline.ts` / `details.ts`. Both were far over before item 84 (details.ts
was 464). A memory note records that **no file-length cap rule actually exists** — the hook is
advisory, and the line-cap is explicitly ignored while code is commented out. A `PostToolBatch` hook
also runs the test suite on every edit and reports failures unprompted — that is the fastest
feedback loop available; use it rather than running tests manually.

**The runner is `node --test` via `npm test`, NOT vitest** (a previous session lost time to this).
72 test files. Tests are strict red-green TDD with `test_<behavior>` names and plain-English step
comments — see `~/.claude/guides/tdd.md`. The user runs the full suite themselves and has asked
agents not to; the targeted-file run for a red-green gate is the accepted exception.

**The 250-line hook forced a file split during this session:** item 84's tests could not go in
`tests/details-viewmodels.test.ts` (it hit 253 lines) and live in the new
`tests/details-revision-view.test.ts`. Precedent for splitting at the cap exists
(`reconstruction_beacons.ts`).

## How to Verify

```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
npm run typecheck        # must print "No errors found"
npm run build:webapp     # must be silent apart from the tsc line
npm test                 # ~467 tests; ONE pre-existing s85 failure is the healthy baseline
npm run app              # serves the viewer; --projects-dir scenarios/executed (uncommitted change)
```

Then browser-verify against `s84-multiagent-scripts-git-baseline` per "What Remains" item 2 — the
viewer's behavior is not covered by any test, and the user visually verifies client changes.
