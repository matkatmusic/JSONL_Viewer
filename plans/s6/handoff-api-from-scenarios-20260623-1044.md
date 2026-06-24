# Handoff: Implement the S6 (`git mv`) reconstruction plan for the api-from-scenarios engine
Conversation name: api-from-scenarios — S6 (`git mv`) plan authoring
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/482c67b1-d03a-4ebf-9175-6b18f22ee2e9.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s6/s6-reconstruction-plan.md (the plan to execute — 3 TDD tasks)

## Branch
`api-from-scenarios` based on `master`. HEAD = `003fec9 Implemented handling S5` (S1–S5 committed;
84 tests green at HEAD). Working tree is clean except two untracked, unrelated items
(`plans/handoff-api-from-scenarios-20260623-0916.md`, `src/Plan_Impl_template.md`) plus the new
`plans/s6/` (this plan). No `-plate` branch exists.

## Goal
The project is a clean-room TypeScript engine that reconstructs the file-change history of a
Claude Code session from its JSONL transcript, one scenario at a time. S1–S5 are implemented.
**Your job is to IMPLEMENT Scenario 6 (`s6-git-mv`)** by executing
`plans/s6/s6-reconstruction-plan.md` — make the engine recognize a **`git mv <src> <dst>`** Bash
command as a rename (with its relative paths resolved against the record `cwd`), so the renamed
file's create→rename→edit lineage reconstructs instead of crashing. **The plan is fully authored
and conformance-checked; do not re-plan — execute it.**

## Current State
- **This session authored ONLY the plan** (`plans/s6/s6-reconstruction-plan.md`) — no source/test
  files changed. `npm test` at HEAD = **84 pass / 0 fail**; `npx tsc --noEmit` clean (confirmed).
- **The S6 ground truth is fully pinned in the plan** from a freshly re-run, complete transcript
  (`4ad1d191-23e8-41de-adfa-d182b6a1cf55.jsonl`, now in the clean-room tree): exact tool_use ids,
  timestamps, `cwd`, the single rename `git mv s6_git.py s6_git_renamed.py`, and the `goodbye()`
  Edit's `structuredPatch`.
- **The current engine CRASHES on this transcript** — `TypeError: Cannot read properties of
  undefined (reading 'values')` in `insertHunkAdditions` (`reconstruction_replay_edit.ts:112`) —
  because the `goodbye()` Edit targets `s6_git_renamed.py`, which has no base revision since
  `git mv` is unrecognized. This is the RED for the plan's Task 2 integration test; recognizing
  the rename fixes it. (Verified: extraction currently yields exactly 3 events and no `git mv`.)
- **The plan was audited line-by-line against `~/.claude/guides/planning.md` + `tdd.md` +
  `coding-standards.md` + `single-condition-branching.md` and `plans/coding-requirements.md`.**

## What Remains
Execute the 3 tasks **in order**, each **RED → GREEN → Verify gate** (do not start a task until
the prior gate is green — `npm test` 0 fail, `npx tsc --noEmit` clean, `filesize_check.py` clean
per file). See the plan for the literal test snippets and code:

1. **Promote `resolveAgainstCwd` to a shared leaf module** — move it from
   `src/reconstruction_sidecar.ts` into a NEW `src/structures/path-resolve.ts` (imports only node
   `path`, no engine cycle); the sidecar imports it. Pure move, no behavior change. RED = an
   import test.
2. **Recognize `git mv` + resolve its relative paths (the feature).** Generalize `parseMvPaths`'s
   regex to `^(?:git\s+)?mv\s+(\S+)\s+(\S+)$`; thread the record's `cwd` (`Path | undefined`)
   through `toFileEvent`/`bashEventFrom` and resolve the rename's `from`/`to` to absolute via
   `resolveAgainstCwd` before building the `RenameEvent`. RED = an extraction unit test +
   `tests/reconstruction_engine_s6.test.ts` (add `S6_JSONL` to `tests/fixtures.ts`; it throws
   today). This single change links the lineage and removes the crash.
3. **CLI default-view lock-in + docs.** Add a `tests/reconstruction_cli.test.ts` default-view test
   on the real S6 transcript (no engine/render code expected — `getEntryLabel` already labels
   `rename`/`edit` from S2). Then update `plans/reconstruction-engine-design.md` (specs 29–31 +
   Code-layout), `plans/implementation-notes-api-from-scenarios.md` (dated S6 entry), and
   `plans/roadmap.md` (mark S6 done). Run the End-to-end check, then stop and report. Commit only
   after the user approves.

## Key Files
- `plans/s6/s6-reconstruction-plan.md` — **the plan to execute.** Read it first; it has every test
  snippet, the ground-truth table, expected reconstruction, and the verify gate.
- `plans/s5/s5-reconstruction-plan.md` — the prior slice's plan, for style/precedent.
- `src/reconstruction_extract.ts` — the parsers (`parseMvPaths`, `parseRmTarget`, `parseCpPaths`,
  `parseRedirect`) + `bashEventFrom`/`toFileEvent` dispatch. **S6's whole feature lands here**
  (regex + cwd threading + resolve).
- `src/reconstruction_sidecar.ts` — currently owns `resolveAgainstCwd` (Task 1 moves it out) and
  `findCwd`/`findSessionId` (the `(record as { cwd?: Path }).cwd` read pattern to copy).
- `src/reconstruction_lineage.ts` — rename-chain collapse (already merges source+dest into one
  history; matches paths by `.toString()`/`.equals()`, so the rename paths MUST be absolute).
- `src/reconstruction_replay_edit.ts` / `src/reconstruction_replay.ts` — `applyEdit` (line 112 is
  the crash site) and `renameRevision` — both already do what S6 needs once the rename exists.
- `src/reconstruction_render_list.ts` / `src/reconstruction_render.ts` — `getEntryLabel`/`diffBlock`
  already handle `rename` and `edit` (verified) — no S6 render changes expected.
- `tests/fixtures.ts` — add `S6_JSONL` here (absolute Desktop path, matching S1–S5).
- `tests/reconstruction_extract.test.ts` / `tests/reconstruction_sidecar.test.ts` — where the
  unit REDs go; add a new `tests/reconstruction_engine_s6.test.ts` for the integration RED.

## Context the Next Agent Won't Have
- **`git mv` ≠ `mv`, and its paths are RELATIVE.** `parseMvPaths` is anchored `^mv` (won't match
  `git mv`) AND `git mv s6_git.py s6_git_renamed.py` uses relative args, while every Write/Edit
  target is absolute. S2's `mv` used absolute paths — confirmed — so cwd-resolution is genuinely
  net-new in S6 and is load-bearing: without it the rename's relative paths won't match the
  absolute create/edit targets and the lineage won't link (and the edit still crashes).
- **The crash is a symptom, not a separate bug.** Do NOT add a defensive guard to `applyEdit` to
  swallow the missing base — that would mask genuinely-orphaned edits in future scenarios. The fix
  is recognizing the rename (locked decision 5 in the plan).
- **The S6 transcript was re-captured.** The first capture (`9cf5d06b…`) was INCOMPLETE — it ended
  at `/exit` right after the commit because the `git mv` + edit ran in a cloud bridge session
  (`cse_…`) that never synced into the local JSONL. The scenario was re-run; the complete
  single-session transcript is `4ad1d191-…`, now the clean-room fixture (the `scenarios/` dir is a
  symlink into `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios`, so it and
  the Desktop tree are the same files). If you ever see an s6 transcript with no `git mv`, you're
  looking at the stale capture.
- **No sidecar for S6.** Every revision's content is in the JSONL (Write `content`, rename carry,
  Edit `structuredPatch`). Call `reconstructAll(records)` with NO `BackupReader`.
- **Latent S5 regression, deliberately OUT of S6 scope:** `parseRedirect` mis-parses a trailing
  `2>&1` / `>/dev/null` as a redirect to a bogus target (e.g. `&1`). S6's transcript does not
  trigger it (every git/pytest command is non-compound and none ends in a redirect — extraction
  yields exactly 3 clean events), so the plan flags it as a future hardening slice rather than
  fixing it here. Don't let it scope-creep S6.
- **Pre-existing verb-less dispatchers stay named** (`toFileEvent`, `bashEventFrom`,
  `writeEventFrom`, `editEventFrom`) — renaming them is out of S6's surgical scope (they were left
  as-is through S2–S5), even though you'll add a `cwd` param to two of them.
- **Harness quirks:** `tsx` does NOT type-check — `npx tsc --noEmit` is the real type gate, and
  `noUnusedLocals`/`noUnusedParameters` make a stray import a hard error (prune precisely when
  moving the resolver in Task 1). `filesize_check.py` only reads `argv[1]` — loop over each file.
  Ignore stale in-batch `PostToolBatch`/`PostToolUse` hook test failures; a manual `npm test` is
  authoritative. `reconstruction_engine.ts` is at ~248/250 lines — S6 adds nothing to it (the cwd
  threading lives in `reconstruction_extract.ts`, currently 226 lines), but prefer split-over-condense
  if any file nears the cap.

## How to Verify
1. Confirm the baseline is green before starting: `cd
   /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios && npm test` → 84 pass,
   then `npx tsc --noEmit` → clean.
2. Reproduce the failure the plan fixes (optional but grounding):
   `npx tsx src/reconstruction_cli.ts "scenarios/executed/s6-git-mv/4ad1d191-23e8-41de-adfa-d182b6a1cf55.jsonl"`
   → today it throws in `insertHunkAdditions`. After Task 2 it lists `s6_git_renamed.py`
   (create→rename→edit) and `tests/test_s6_git.py` (create).
3. After every task run the **Verify gate** (the three checks above). After Task 3 run the plan's
   **End-to-end check** and confirm: `s6_git_renamed.py` shows create `#01FJ4hLH` → rename
   `#019BbcnY` → edit `#01CVhCVD` (`6 lines (+4)`), plus `tests/test_s6_git.py` create `#019htcN9`.
