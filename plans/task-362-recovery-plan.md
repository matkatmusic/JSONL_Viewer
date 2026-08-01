# Plan: teach the engine to read workflow-subagent JSONLs

Written 2026-07-31. Originally covered both the engine gap (task **362**) and a
one-time recovery of work destroyed when worktrees `group-2` … `group-5` were
deleted. **The recovery is DONE** — see "What already happened". What remains is
the engine work, which is still open as tasks **362** and **375**.

## Why the work was lost

Each RevEng worktree got its **own** submodule object store at
`.git/worktrees/group-N/modules/jfred`. Workers committed jfred changes there.
`mergeTaskWorktrees.ts` merged the RevEng superproject — which carries only a
gitlink — then removed the worktrees, destroying the jfred objects.

Verified: `222fc0d` and `a549a0f` exist in none of the 3750 git dirs under
`/tmp`, nor in `.git/modules/jfred`, nor in any surviving
`.git/worktrees/*/modules/jfred`.

## What already happened (2026-07-31)

All lost work was recovered by replaying `Edit`/`Write` tool calls out of the
subagent transcripts and re-committed on jfred `Layer3-9`:

| task | new commit | recorded diffstat | match |
|---|---|---|---|
| 356 | `c8ac35f` | 8 files, +319 −12 | exact |
| 365 | `22e8099` | 4 files, +208 −15 | exact |
| 367 | `180f098` | 2 files, +29 −15 | exact |
| 368 | `3b86cc8` | 1 file, +2 −1 | exact |
| 370 | `09a61b6` | — | byte-identical to `ae4e4a5` |
| 371 | `9bb70ac` | — | byte-identical to `ddd0f75` |

Two defects the recovered work carried (never caught, because `tackle-tasks`
tells workers to run typecheck only) were fixed in follow-ups `629e1ec` and
`e05499f`. jfred is 1561 pass / 0 fail / 2 skipped.

The replay tool used is
`replay-lost-edits.mts`, written to the session scratchpad. **It is not in any
repo.** If the technique should survive, move it into `jfred/scripts/`.

## The engine gap — STILL OPEN

`src/reconstruction_extract.ts`:

- **line 67-70** — `Write` builds its event from `block.input` alone
  (`writeEventFrom`, line 25). No `toolUseResult` needed.
- **line 107-137** — `indexEditDetailByToolUseId` populates `detailById` ONLY
  from `record.toolUseResult.structuredPatch` (line 132-135).
- **line 40-58** — `editEventFrom` returns `undefined` when `detailById` has no
  entry (line 47-49), so `toFileEvents` (line 74-77) pushes nothing. **The Edit
  is dropped silently — no error, no event, no node.**

Workflow-subagent transcripts almost never carry `toolUseResult`:

| transcript | user records | with `toolUseResult` |
|---|---|---|
| `agent-a4efb54830564fef6` (356) | 67 | 2 |
| `agent-a426ab71299aa2bd1` (365) | 52 | 3 |
| `agent-a61294f0907dc56ec` (367/368) | 27 | 0 |

The `Edit` inputs themselves are fully present in the assistant records
(`file_path`, `old_string`, `new_string`, `replace_all`). Nothing is missing from
the data — only the engine's path to it.

Already fixed and committed as `8d0ec82`: `toolEndsTurn` added to the user
allow-list in `src/parse/recordKeys.ts`. Without it `loadTranscript` throws
`UnmodeledFieldError` and no workflow transcript parses at all.

## Phase 1 — engine: recover Edits without `structuredPatch`

Strict red-green. Write each test first and watch it fail.

1. **Test** `tests/reconstruction_extract.test.ts`:
   `test_an_edit_without_a_tool_use_result_still_produces_an_event`. Build a
   two-record transcript — an assistant record with an `Edit` tool_use carrying
   `old_string`/`new_string`, and a user record with a bare `tool_result` block
   and NO `toolUseResult`. Assert `extractFileEvents` returns one event targeting
   the edited path. Fails today: returns `[]`.

2. **Vocabulary.** Add `replace = "replace"` to `EventKind` in
   `src/structures/vocabulary.ts` (line 97-105) and a `ReplaceEvent` type beside
   `EditEvent` carrying `target`, `oldString`, `newString`, `replaceAll`,
   `changeId`, `timestamp`. A separate kind — not an `EditEvent` with optional
   fields — because the apply rule genuinely differs: string replacement against
   current content, not hunk application against line numbers. Line numbers
   cannot be synthesized at extract time; the base content is only known at
   replay time.

3. **Extract fallback.** In `editEventFrom` (`reconstruction_extract.ts:40`),
   when `detailById.get(...)` misses, return a `ReplaceEvent` built from
   `block.input.old_string` / `new_string` / `replace_all` instead of
   `undefined`. Keep the existing `structuredPatch` path first — when the richer
   detail exists it stays authoritative.

4. **Test** `tests/reconstruction_replay_edit.test.ts`:
   `test_a_replace_event_applies_old_string_to_new_string`, including a
   `replace_all: true` case and a case where `old_string` occurs twice with
   `replace_all` false (must refuse, matching the real Edit tool's ambiguity
   rule — do not silently pick the first).

5. **Apply.** Handle `EventKind.replace` in `src/reconstruction_replay_edit.ts`.
   Audit every other `EventKind.edit` reader and decide each explicitly:
   `reconstruction_reseed.ts`, `reconstruction_multi_source_gate.ts`,
   `reconstruction_engine.ts`, `reconstruction_sidecar.ts`,
   `reconstruction_replay.ts`, `layered_load.ts`, `reconstruction_render_list.ts`.
   A missed reader is a silent drop, which is the exact bug being fixed.

6. **Discovery (task 362's other half).** `listJsonlFiles` in
   `src/viewer_api_projects.ts` is a single-level `readdirSync` and never
   descends. Add `listWorkflowTranscripts(projectDir, sessionId)` returning
   `<projectDir>/<sessionId>/subagents/workflows/wf_*/agent-*.jsonl` as a
   SEPARATE source list. Task **375** covers the sibling case,
   `<sessionId>/subagents/agent-*.jsonl` for `/btw` forks.

## Traps the replay tool had to solve — the engine will hit all three

**A PostToolUse comment-reflow hook rewrites files between edits and records no
tool call.** It joins consecutive `//` lines into one, separated by TWO spaces.
Replaying recorded edits onto a clean git base therefore diverges: the next
`old_string` reflects post-hook content no recorded operation produced. The
replay tool seeds from the newest full `Read` result instead of from git, with a
narrow fallback that matches comment runs the hook would have joined.

**`Read` results render a phantom trailing empty numbered line** (a 91-line file
shows `91\t` after the last real line). Not dropping it adds a spurious `+1` to
every reconstructed file.

**Failed tool calls are still recorded as `tool_use` blocks.** Two Edits in the
recovered batch errored; replaying them corrupts the result. Check the paired
`tool_result` for `is_error: true`.

## Verification

The recorded diffstats are the oracle — every commit's
`N files changed, +X −Y` line is in the transcripts. After any reconstruction,
`git show --stat` must match exactly. A mismatch means the reconstruction is
wrong, not that the oracle is stale.

Note the jfred suite is environment-sensitive: a scratch checkout must be **named
`jfred`**, needs the `scenarios` submodule present, and needs a sibling `plans/`
directory. Without those, 9 tests fail for reasons unrelated to the code. Get a
green baseline on unmodified code before trusting any failure.

## Do not repeat the original mistake

Before any future worktree run touching a submodule, either work in the main
checkout, or fetch each worktree's submodule commits into the parent object store
BEFORE `mergeTaskWorktrees.ts` removes the worktree. A superproject merge carries
only the gitlink; it never moves the submodule's objects.
