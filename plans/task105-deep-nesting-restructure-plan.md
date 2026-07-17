# Task 105 (expanded): eliminate every deep-nesting flag in jfred TypeScript

## Goal

`python3 ~/Programming/jot/common/scripts/filesize_check.py <file>` reports **no
"Deep nesting" flag** (and ideally exits 0) for all 41 currently-flagged
TypeScript files in `/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred`,
with zero behavior change, verified by a clean `tsc --noEmit` (baseline: 0 errors
on `tsconfig.json`, which covers `src`, `webapp`, `tests`, `scripts`).

## Non-negotiable constraints (give these verbatim to every subagent)

1. **Extraction only, never flattening.** The fix for deep nesting is moving the
   deepest nested block (a loop body, an if-arm, a callback body) into a new
   module-scope helper function. NEVER merge nested `if`s into `a && b` compound
   conditions and NEVER rewrite control flow into early-return form —
   `~/.claude/guides/single-condition-branching.md` mandates nested
   single-condition `if`s; extraction resets indent depth without violating it.
2. **Zero behavior change.** Same statements, same order, same conditions. The
   helper takes the block's free variables as parameters and returns what the
   block fed back to its surroundings (or `void`). No renames of existing
   symbols, no reordering, no "improvements" to adjacent code.
3. **Helper naming:** must contain a verb describing what the body does
   (`renderSessionStartMarker`, `appendChangeChips`, `collectFlaggedLines`), per
   `~/.claude/guides/coding-standards.md` and rule 5 of
   `plans/coding-requirements.md`. No abbreviations.
4. **Placement:** module scope, directly above the function it was extracted
   from. Not exported.
5. **Style:** 4-space indent, match the file's existing formatting exactly; do
   not touch lines outside the extraction.
6. **No new tests, no test runs, no tsc runs by subagents.** This is a pure
   behavior-preserving restructure; the existing suite is the regression oracle
   and the USER runs it afterwards. (TDD's red-green applies to new behavior;
   there is none here. The plan-level compile gate in Phase 3 is run once by the
   orchestrator, not per-file.)
7. **Per-file oracle (mandatory, run it yourself):**
   `python3 ~/Programming/jot/common/scripts/filesize_check.py "<absolute file path>"`
   — subagents MUST run this directly; PostToolUse hook feedback is NOT visible
   to subagents (it surfaces only in the parent session). Success = output
   contains no "Deep nesting" line. If the checker instead reports a
   file-size/line-cap flag caused by the added helper signatures: do NOT split
   the file or trim code — report the flag verbatim in your final message.
8. Work ONLY on your single assigned file.

## Phase 1 — capture the work list (orchestrator, already done, re-verify)

From repo root `/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred`:

```sh
find webapp src tests scripts -name "*.ts" | grep -v -E "dist/|vendor/|node_modules|archive/" | sort \
  | while read -r f; do python3 ~/Programming/jot/common/scripts/filesize_check.py "$f" >/dev/null 2>&1 || echo "$f"; done
```

Expected 41 files (flagged lines as of planning; line numbers are hints, not
gospel — subagents re-run the oracle to locate current flags):

| file | flagged lines |
|---|---|
| src/parse/loadTranscript.ts | 188-192 |
| src/reconstruction_branches.ts | 207, 218 |
| src/reconstruction_corpus.ts | 32, 34, 36, 38 |
| src/reconstruction_git_evidence.ts | 63-64 |
| src/reconstruction_json_steps.ts | 43, 107-108 |
| src/reconstruction_orphans.ts | 37 |
| src/reconstruction_render_unified.ts | 73-74, 116 |
| src/reconstruction_script_execution.ts | 112, 115, 119, 123 |
| src/reconstruction_script_renames.ts | 55, 58-61, 64-65, 73, 77, 80-90 |
| src/reconstruction_script_sandbox.ts | 107 |
| src/reconstruction_script_stage.ts | 93-97 |
| src/reconstruction_tool_calls.ts | 104-110 |
| src/viewer_api_diffs.ts | 58 |
| src/viewer_server.ts | 109-110, 113, 116, 162 |
| tests/content-blocks.test.ts | 73-76 |
| tests/viewer-api-projects.test.ts | 181, 185, 187, 191, 194-196 |
| webapp/app-consent.ts | 92-94, 104-105, 196-199 |
| webapp/app-console.ts | 70-71, 74-86 |
| webapp/app-fetch.ts | 177-188 |
| webapp/app-progress.ts | 78 |
| webapp/app-router.ts | 101 |
| webapp/inspector-json.ts | 95, 121-137, 142-145, 149-154, 160-166 |
| webapp/inspector.ts | 125-133, 156-166, 174, 177, 183-188, 197-198, 203-206 |
| webapp/views/conversation.ts | 146-148, 158-162, 166-168 |
| webapp/views/details-diff.ts | 128-132, 136-137 |
| webapp/views/details-revision-view.ts | 177-180, 183-199 |
| webapp/views/details.ts | 107 |
| webapp/views/diff-vs-base-model.ts | 68-70, 140, 143 |
| webapp/views/diff-vs-base.ts | 90-91, 94-95 |
| webapp/views/project.ts | 92-94 |
| webapp/views/projects.ts | 36-37, 39-41 |
| webapp/views/raw-lines.ts | 92-94, 96-98 |
| webapp/views/sidebar.ts | 72-73 |
| webapp/views/timeline-changes.ts | 53-62, 156, 179 |
| webapp/views/timeline-commit-files.ts | 59 |
| webapp/views/timeline-nodes.ts | 80-89 |
| webapp/views/timeline-render-chips.ts | 158-170, 178-182, 192-203 |
| webapp/views/timeline-render-inspectors.ts | 76-77, 199, 203 |
| webapp/views/timeline-render-rows.ts | 121-122, 141, 146-148, 176-183, 197-198 |
| webapp/views/timeline-render-selectbar.ts | 132, 149-150 |
| webapp/views/timeline.ts | 149-154, 160-171, 195 |

## Phase 2 — fan out (one subagent per file, all 41)

Launch one subagent per file (batches of ~8 parallel Agent calls per message;
the harness queues the rest). Each subagent prompt = the constraint block from
above + its single absolute file path + its flagged-lines hint + this work loop:

1. Run the oracle to get the current flagged line ranges.
2. Read the whole file.
3. For each flagged range, find the enclosing function and extract the
   deepest-nested coherent block into a helper per constraints 1-5. Prefer ONE
   helper per flagged region; extract a second level only if the oracle still
   flags after the first extraction.
4. Re-run the oracle. Repeat step 3 until no "Deep nesting" line remains.
5. Final report: helpers created (name -> source function), oracle output, any
   size-cap flag.

## Phase 3 — orchestrator gate (serial, after all 41 report)

1. Re-run the Phase 1 sweep: expect zero files listed with a "Deep nesting"
   flag. Any survivor gets ONE follow-up subagent with the survivor's oracle
   output; then re-sweep.
2. Compile gate: `npx tsc --noEmit -p tsconfig.json` from the jfred root —
   must report 0 errors (baseline was 0). Any error = fix-forward with a
   targeted subagent on the offending file (the error will be a missed free
   variable or return value in an extraction — mechanical to fix).
3. Do NOT run `npm test` or any other suite (user's explicit instruction).
4. Collect any reported size-cap flags into the final summary (decision on
   splitting those files belongs to the user, not this task).

## Phase 4 — bookkeeping

1. Stage in jfred: `git add` exactly the 41 files (plus none others).
2. Close task 105 in RevEng: move its object from `tasks.json` to
   `completedTasks.json` with `completionDate` 2026-07-17 and a `closureNote`
   recording the expanded 41-file scope (user decision), extraction-only method,
   oracle-clean sweep, and clean tsc; stage both JSON files in RevEng.
3. Subagent on Sonnet (`model: "sonnet"`): generate the ≤40-word single-sentence
   commit summary; show it to the user. Do not commit anything.

## Success criteria

- Sweep of all jfred TS files shows zero "Deep nesting" flags.
- `npx tsc --noEmit -p tsconfig.json` = 0 errors.
- Diff contains only function extractions (new module-scope helpers + call
  sites); no exported-symbol changes, no logic rewrites.
- jfred changes staged; task 105 closed and staged in RevEng; nothing committed.
