# Handoff: S15 (`s15-user-edit-then-conv-rewind`) reconstruction PLAN is complete and read-only-verified — implement it. The plan opens the user-edit family: it teaches extraction to turn an `edited_text_file` attachment (a user's out-of-band disk edit) into a new `user-edit` file event; the already-shipped S13 structural fork discovery + S14 surviving-head guard then surface the fork with no further engine change. NOTHING of S15 is implemented; no prototype was built (the plan's uuids/outputs were derived read-only from the live engine logic).
Conversation name: api-from-scenarios — S14 handoff monitor → plan S15 (user-edit-then-conv-rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/4f3b33a7-35bd-4533-ae33-1c0ae8d44e3d.jsonl
Plan file (AUTHORITATIVE): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s15/s15-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `3c2a79c Implemented S14` (S12/S13 in `a9af46d`, S14 in `3c2a79c`). `npm test` on HEAD = **180 pass / 0 fail**, `tsc` clean. The only uncommitted item in the tree is the new, untracked `plans/s15/` directory (the S15 plan) + this handoff.

## Goal
`api-from-scenarios` is a clean-room TypeScript engine that reconstructs a Claude Code session's file-change history from its JSONL transcript, one scenario at a time. **S15** is the first of the **user-edit family** (S15–S23): the first scenario where a file change originates **outside any agent tool call** — a user edits `scenario15.py` directly on disk, then a conversation-only rewind abandons that branch in favor of a Read-only branch (disk keeps the edit). The engine must attribute the user's edit to a rewound branch and render the fork, output the same shape as S13/S14.

## Current State
**Plan complete; NOTHING of S15 implemented; no prototype built (and none left behind).** During planning I (a) ran S15 through `reconstruction_cli` to confirm the gap, (b) inspected the transcript to pin the exact topology, and (c) briefly started a throwaway prototype to capture outputs but **reverted it fully at the user's instruction** — the tree is verified clean at `3c2a79c` (180 green, no residue). The plan's uuids, letters, and expected outputs were instead derived **read-only** by replaying the engine's own `findPromptForkPoints` / `findDeepestPromptOrReply` / `assignTurnLetters` over the live transcript.

Verified facts the plan rests on:
- **The gap is a single missing capability.** `reconstruction_extract.ts::collectEventsFromRecord` only maps `tool_use` blocks to events. The user edit arrives as an `attachment` record `d675bbfe` with `attachment.type === "edited_text_file"` and a `snippet` holding the **full** post-edit content in `cat -n` form (`<n>\t<line>`). It is never extracted ⇒ the abandoned branch has zero diverging file changes ⇒ no rewound branch, no fileDAG turn.
- **Topology (first-8 uuids):** trunk Writes `B` `018tu7eT` (scenario15.py) + `C` `018f4SXM` (test); fork/rewind point `a94b7090` parents abandoned prompt `75934004` ("What time is it?", child = the user edit `d675bbfe`, tip `56da61e5`) and surviving Read prompt `5463dc91` → final head `4eb82c06`.
- **This is the S13 (structural) case, NOT the S14 (dedup) case** — `75934004` is not a last-prompt head, so no `subtreeHoldsClaimedTip` collision. S14's surviving-head guard already keeps `4eb82c06` (surviving branch records trunk Writes). Both shipped fixes do the heavy lifting; this slice only makes the user edit visible.

## What Remains
Execute the plan's TDD task list in order (`plans/s15/s15-reconstruction-plan.md` is the authoritative, line-precise spec):
1. **Task 0** — add `S15_JSONL` to `tests/fixtures.ts` (Desktop absolute path, after `S14_JSONL`).
2. **Task 1 (RED→GREEN)** — extend the vocabulary membership tests; add `AttachmentPayloadType.edited_text_file` + `EventKind.userEdit` (Edit 1).
3. **Task 2 (RED→GREEN)** — new `tests/reconstruction_user_edit.test.ts`; add `UserEditEvent` type (Edit 2), the new leaf module `src/reconstruction_user_edit.ts` (Edit 3: `userEditEventFrom` + `stripLineNumberPrefixes`), and the extraction dispatch (Edit 4).
4. **Task 3 (RED→GREEN)** — new `tests/reconstruction_engine_s15.test.ts` (4 tests: branch enumeration, one rewound branch on scenario15.py, rewound content = `# user edit`+`hello`, surviving content = `hello` only). Add the replay handler `userEditRevision` + dispatch (Edit 5).
5. **Task 4** — confirm the no-test Stop-hook warning for the new module is cleared by Task 2's test.
6. **Task 5 (RED→GREEN)** — new `tests/reconstruction_cli_s15.test.ts` (5 lock tests) asserting the plan's *Expected outputs* **verbatim** — run the *Verify* commands and paste the REAL bytes (alignment widths are the only hand-derived risk). Add the `getEntryLabel` `user-edit` case (Edit 6).
7. **Task 6** — `npm test` = 180 + N green; `npx tsc --noEmit` clean; filesize sweep clean; spot-check S13/S14 default + `--list-branches` and S1 default are byte-for-byte unchanged.
8. **Task 7** — flip `plans/roadmap.md` `[ ] S15` → `[x] S15 -> …`; prepend an S15 entry to `plans/implementation-notes-api-from-scenarios.md`.
9. **Task 8 — create handoff.** Write a handoff doc with the `/jot:handoff-prompt` skill (state, test count, nothing committed unless the user asks). Then surface the diff for review/commit (precedent: one commit `Implemented S15 handling`). Do NOT start S16.

## Key Files
- `plans/s15/s15-reconstruction-plan.md` — THE plan: verified topology, the single root cause, all six exact edits (with code), authoritative expected outputs, the TDD breakdown, regression proof.
- `src/reconstruction_extract.ts` (233/250) — Edit 4: dispatch `userEditEventFrom` in `collectEventsFromRecord`. Near the cap → the new logic lives in a NEW leaf module (Edit 3), not here.
- `src/reconstruction_user_edit.ts` — NEW (Edit 3): `userEditEventFrom` + `stripLineNumberPrefixes`. Imports only envelope/session-meta/vocabulary/domain + `UserEditEvent` type → no cycle.
- `src/reconstruction_engine.ts` (228/250) — Edit 2: `UserEditEvent` type + `FileEvent` union member.
- `src/reconstruction_replay.ts` (138) — Edit 5: `userEditRevision` (full-content, all-genesis, like overwrite) + dispatch.
- `src/structures/vocabulary.ts` (112) — Edit 1: the two enum members.
- `src/structures/session-meta.ts` — `getAttachmentEntry` (the typed accessor Edit 3 uses to read `attachment.type/filename/snippet`).
- `src/reconstruction_render_list.ts` (145) — Edit 6: `getEntryLabel` `user-edit` case (defensive; the DAGs already render the enum value directly).
- `tests/reconstruction_engine_s13.test.ts` / `tests/reconstruction_cli_s14.test.ts` — mirror these for the S15 test files.

## Context the Next Agent Won't Have
- **The `edited_text_file` snippet is the FULL file for S15 (3 lines).** Recover content by stripping `^\d+\t` per line. A larger file's snippet COULD be a windowed slice — the plan deliberately does NOT add windowing (untested speculation); treat snippet as full content (correct for S15) and revisit only when a later user-edit scenario actually shows windowing.
- **Model the user edit as a NEW `EventKind.userEdit`, not as `overwrite`/`write`.** The project values honest provenance (copy/append/overwrite were each added as distinct kinds), and the two DAGs render the raw enum value, so `user-edit` shows in the fileDAG/conversationDAG for free. Replay it like an overwrite (all-genesis full-content revision) — the snippet carries whole content, not a patch.
- **`--surviving` is ALREADY correct and must STAY hello-only** (the user edit is on the abandoned branch; `selectLiveBranch` excludes it). The bug is purely the MISSING rewound branch + MISSING fileDAG turn. Don't "fix" the surviving content.
- **The Stop hook reruns the FULL suite after every source/test edit and a lint hook caps files at 250 lines / blocks >3× indent nesting; a hook also WARNS on a new `src/*.ts` lacking a test.** Expect inline RED during strict RED→GREEN; the log can lag one edit — confirm true state with `npx tsx --test <file>`. Adding the two enum members will RED the vocabulary membership tests until you update their `deepStrictEqual` expectations (Task 1) — that is expected, not a surprise.
- **Regression is structurally safe:** `user-edit` events come ONLY from `edited_text_file` attachments, which exist ONLY in S15 across the implemented corpus (grep `s1*`…`s14*`/`m*` to confirm). So S1–S14 extraction output is byte-identical and every prior view is unchanged.
- **S14 was committed since its handoff** (`3c2a79c`); the tree is clean now, unlike the S12–S14 handoffs that described uncommitted work. Don't expect uncommitted S14 files.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect: 180 prior + N new, 0 fail
npx tsc --noEmit         # expect: no errors
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
P="scenarios/executed/s15-user-edit-then-conv-rewind/7365140d-8666-4dbf-81bc-9d92e9d6cac9.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                 # fork: rewound #56da61e5 (user-edit) above surviving #4eb82c06 (no file changes); fileDAG B write + D user-edit
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null # surviving #4eb82c06 + rewound #56da61e5 (rewind @ #a94b7090)
npx tsx src/reconstruction_cli.ts "$P" --branch 56da61e5 --verbose 2>/dev/null  # `# user edit` + `def hello():`
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null        # `def hello():`, NO `# user edit`
# Regression spot-check (must be unchanged): S13 default + --list-branches; S14 default + --list-branches; S1 default.
```
