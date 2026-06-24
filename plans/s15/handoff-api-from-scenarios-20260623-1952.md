# Handoff: S15 (`s15-user-edit-then-conv-rewind`) is IMPLEMENTED and fully verified — the first user out-of-band edit, handled with the plan's six edits PLUS a content-aware guard that CORRECTS a defect in the plan (`edited_text_file` is a disk-snapshot echo present in the locked S5/S13 transcripts too, not S15-only). 197 tests green, tsc clean, every file ≤ 250 lines. NOTHING is committed — awaiting user review/approval, then a single commit `Implemented S15 handling`.
Conversation name: api-from-scenarios — S15 handoff monitor → implement S15 (user-edit-then-conv-rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/4a8f2643-0dae-45b6-9c02-eef26c555235.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s15/s15-reconstruction-plan.md (executed; its regression-safety claim was WRONG — see Context below)

## Branch
`api-from-scenarios` based on `master`. HEAD = `3c2a79c Implemented S14` (S12/S13 in `a9af46d`, S14 in `3c2a79c`). All S15 work is uncommitted in the working tree. `npm test` on HEAD = 180 green; with S15 = **197 green**.

## Goal
S15 opens the **user-edit family** (S15–S23): the first scenario where a file change originates OUTSIDE any agent tool call — a user edits `scenario15.py` directly on disk, then a conversation-only rewind abandons that branch for a Read-only branch. The engine (a clean-room TS reconstructor of a Claude Code session's file-change history) must attribute the user's edit to a rewound branch and render the fork — same output shape as S13/S14. The guiding principle (user's directive this session): **reconstruct the change history 100%**; precise user-vs-agent attribution is secondary.

## Current State
**DONE. 197 pass / 0 fail, `npx tsc --noEmit` clean, filesize sweep clean (graph.ts 249, branches.ts 186, replay.ts 185 — all ≤ 250).** Implemented the plan's six edits and a content-aware guard the plan omitted:
- **Edits 1–6 (the plan):** `AttachmentPayloadType.edited_text_file` + `EventKind.userEdit` (vocabulary.ts); `UserEditEvent` type + `FileEvent` union member (reconstruction_engine.ts); new leaf module `reconstruction_user_edit.ts` (`userEditEventFrom` + `stripLineNumberPrefixes`); extraction dispatch (reconstruction_extract.ts); `userEditRevision` replay handler (reconstruction_replay.ts); `getEntryLabel` user-edit case (reconstruction_render_list.ts).
- **The guard (the correction):** an `edited_text_file` snapshot is recorded as a `user-edit` change ONLY when its content differs from the file's current content. `reconstruction_replay.userEditChangesContent` drops no-op echoes from content views; `reconstruction_branches.collectAcceptedUserEditIds` + `extractRenderableEvents` keep the two graphs in sync; `reconstruction_cli.ts` passes its sidecar reader into `renderGraphs` (built before the graph dispatch) so the fileDAG is content-correct for the bash-redirect lineage.
- **17 new tests:** 1 vocab EventKind membership, 3 `reconstruction_user_edit`, 4 `reconstruction_engine_s15`, 5 `reconstruction_cli_s15`, 4 `reconstruction_branches`.
- **Validated against the real S1–S15 datasets:** every default view exits 0; S1–S14 show ZERO user-edit turns (byte-unchanged); S15 shows the genuine edit as a rewound `user-edit` turn above a file-less surviving Read branch + its fileDAG turn. S5's previously-latent phantom fileDAG turn is gone now that the graph gets a reader.

## What Remains
1. **User review of the uncommitted diff** (13 modified + 5 new files). The plan-vs-implementation divergence (the content-aware guard) is documented in the implementation notes — confirm the approach is acceptable.
2. **Commit** (only when the user asks; project rule). Precedent is one commit per scenario → message `Implemented S15 handling`. Do NOT also commit unrelated working-tree state.
3. **Do NOT start S16.** S16 (`s16-multi-edit-code-restore-re-edit`) also carries `edited_text_file`; the content-aware guard already generalizes to it, but S16 is its own planned slice.

## Key Files
- `src/reconstruction_replay.ts` — `userEditRevision` (full-content, all-genesis, like overwrite) + `userEditChangesContent` (the no-op guard: drop a user-edit revision whose snapshot equals current content). The single source of truth for "is this a real change".
- `src/reconstruction_branches.ts` — `collectAcceptedUserEditIds(records, reader)` (reconstructs every branch, collects the changeIds of user-edit revisions that SURVIVED replay) + `isRenderableEvent` + `extractRenderableEvents` (filters graph events). Branch-aware.
- `src/reconstruction_graph.ts` — `buildConversationDag`/`buildFileDag` now take an optional `reader`, compute the accepted-set, and thread it through `assignTurnLetters`/`buildRewoundConvoBranch`/`buildSurvivingConvoBranch` so no-op echoes never become turns.
- `src/reconstruction_user_edit.ts` — NEW leaf: `userEditEventFrom` (edited_text_file attachment → UserEditEvent) + `stripLineNumberPrefixes` (`cat -n` snippet → real text).
- `src/reconstruction_extract.ts` / `reconstruction_engine.ts` / `structures/vocabulary.ts` / `reconstruction_render_list.ts` / `reconstruction_cli.ts` / `reconstruction_graph_render.ts` — the plan's other edits + reader plumbing into `renderGraphs`.
- `tests/reconstruction_branches.test.ts`, `tests/reconstruction_user_edit.test.ts`, `tests/reconstruction_engine_s15.test.ts`, `tests/reconstruction_cli_s15.test.ts` — the new suites (CLI tests lock the exact bytes).
- `plans/implementation-notes-api-from-scenarios.md` (top entry) — full design-decision/deviation/tradeoff record for S15.

## Context the Next Agent Won't Have
- **The S15 plan's central regression-safety claim is FALSE — do not trust it blind.** It says `edited_text_file` "appears for the first time in S15." A grep shows it in **S5 and S13** (both implemented/locked) and 9 future scenarios (s16, s18–s23, m3, m5, m6). The plan author validated only S15 with a prototype they reverted, so they never ran the full suite and never saw the regression. The plan's six edits, applied verbatim, take the suite from 180→189/193 (4 regressions). The content-aware guard is what makes it 197/197.
- **The discriminator is CONTENT, and it must be BRANCH-AWARE.** The attachment shape is byte-identical between a genuine edit and a disk echo (`userType:"external"`, `isSidechain:false`, same parent type) — no field distinguishes them. The IDE emits an `edited_text_file` snapshot whenever a file is written OR read. S13's echo (`def greet…`) sits on a "Read scenario13.py…" turn and matches the read branch's RESTORED content (not the cross-branch mix that includes the abandoned `farewell`), so a cross-branch reader-free replay would wrongly KEEP it — the comparison has to be against the snapshot's OWN branch content. That is why the guard lives in `replayEvents` (runs per branch over sidecar-filled events) and the graph derives its accepted-set from those per-branch reconstructions.
- **The user explicitly steered this.** Mid-session: "it is less important that an edit be classified as 100% attributed to the user and more important that the change history can be reconstructed 100%." That is why the rule is "record a change iff content changed," not "guess who edited it." The user also explicitly authorized building the corrected solution against the S1–S15 datasets rather than implementing the plan as written.
- **Repo hooks:** a Stop hook reruns the FULL suite after every source/test edit (expect inline RED during strict RED→GREEN; the log can lag one edit — confirm with `npx tsx --test <file>`); a lint hook caps files at 250 lines and blocks >3× indent nesting; a hook WARNS when a new `src/*.ts` has no test. `reconstruction_branches.ts` previously tripped the no-test warning — now cleared by `tests/reconstruction_branches.test.ts`.
- **`graph.ts` is at 249/250** — almost no headroom. If you add to it, extract to `branches.ts` (where the accepted-set helpers already live) rather than condensing (project rule: split, don't condense).
- **Fixtures use Desktop absolute paths**, but `scenarios/` in the worktree is a symlink to `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios`, so the repo-relative `scenarios/executed/...` paths in the Verify commands resolve too.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect: 197 pass / 0 fail
npx tsc --noEmit         # expect: No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
P="scenarios/executed/s15-user-edit-then-conv-rewind/7365140d-8666-4dbf-81bc-9d92e9d6cac9.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                 # fork: rewound #56da61e5 (user-edit) above surviving #4eb82c06 (no file changes); fileDAG B write + D user-edit
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null # surviving #4eb82c06 + rewound #56da61e5 (rewind @ #a94b7090)
npx tsx src/reconstruction_cli.ts "$P" --branch 56da61e5 --verbose 2>/dev/null  # `# user edit` + `def hello():`
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null        # `def hello():`, NO `# user edit`
# Regression: S5 default fileDAG has NO user-edit turn; S13/S14 default + --list-branches and S1 default are byte-for-byte unchanged.
```
