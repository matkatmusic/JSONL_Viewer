# Task 98: Desktop rewind file vs Layer 5 code

Desktop = `~/Desktop/detecting-rewind-events.md`. Code paths are relative to `jfred/src`.
DOES = the code does this. DIFFERENT = the code does it another way. NOT = the code does not do this.

## How the code works, in short
1. `layer1_branch_sessions.ts` groups session files and loads records (34-63).
2. It calls `findConversationBranches` (69). It keeps branches that are not surviving, have a rewind point, and have a tip record (70-79).
3. `layer1_branches_lanes.ts`: a lane is the tip chain minus the rewind-point chain (38-41). Its file events come from `extractFileEvents` (50).
4. `layer1_branches_wire.ts` matches lane changes to each file's disk timeline (36-51) and calls `computeLaneKind` (51).
5. `layer1_branches_wire_classify.ts` picks "conversation" or "code" (74-91).

## Desktop rule by rule
1. Core: no rewind record; infer from the tree (Desktop 5). DOES, plus one real record. It infers from `parentUuid` chains and `last-prompt` heads (`reconstruction_branch.ts:28-44`). It also reads `forkContextRef` for forked subagents (`reconstruction_fork_graft.ts:48`).
2. Duplicate `parentUuid` = branch point = rewind target (Desktop 11-24). DIFFERENT. The main detector is the `last-prompt` `leafUuid` list (`reconstruction_tree.ts:21-30`). Heads off the surviving trunk are abandoned (`reconstruction_trunk.ts:99-107`). A duplicate-parent scan exists, but it counts only genuine user prompts (`reconstruction_prompts.ts:64-95`, 2 or more at 91; `reconstruction_fork.ts:38-41`).
3. Orphan = not reachable from the active leaf (Desktop 24). DOES, with a different leaf rule. Surviving head = last `last-prompt` leaf (`reconstruction_surviving_head.ts:28`). Trunk = its ancestors (`reconstruction_trunk.ts:50-51`). At structural forks the code sorts prompt children by time and treats the latest as the survivor (`reconstruction_fork.ts:42`, `88-89`).
4. Edits off the leaf-to-root path were rewound; read `oldString`/`newString`, `originalFile`/`content` (Desktop 26-28). DIFFERENT. Lane = tip chain minus rewind-point chain (`layer1_branches_lanes.ts:38-41`). Edit events use `structuredPatch` hunks plus `originalFile` (`reconstruction_extract_edit_details.ts:70-72`, event at 33-40). `oldString`/`newString` are never read. Write uses the Write input (`reconstruction_extract.ts:23-25`, `42-49`). Bash events are also extracted (`reconstruction_extract.ts:50-52`).
5. Three restore options; infer which was used (Desktop 30-32). DOES. Output is `code` or `conversation` per file lane (`layer1_branches_wire_classify.ts:86`, `89-90`; enum `webapp/layer1-wire-branches.ts:5-8`).
6. Approach A: replay the orphan branch for its end state (Desktop 42). DIFFERENT. There is no per-branch replay. One unfiltered disk timeline is built (`reconstruction_steps.ts:1`, `122-124`; `layer1_branches_lanes.ts:73`). The lane's last revision is the end state (`layer1_branches_wire_classify.ts:75`).
7. Approach A: compute the rewind-target state (Desktop 43). NOT. `computeLaneKind` takes only the lane end state (`layer1_branches_wire_classify.ts:74-75`).
8. Approach A: compare the first post-rewind `originalFile` to the target or orphan-end state (Desktop 44-46). DIFFERENT, half only. The code finds the first non-lane revision after the lane's last one (`layer1_branches_wire_classify.ts:76-83`). It tests only "equals lane end" (49-51; `reconstruction_multi_source_gate.ts:60-62`). Match = conversation (89). No match = code (90). It never tests a match with the target state. A Write with no `originalFile` = code (55). An overwrite = code (57-58).
9. Approach A con: hand edits break it (Desktop 49). DIFFERENT, not handled. A next revision that is not edit/write/overwrite goes to a line-containment test (`layer1_branches_wire_classify.ts:60-71`). There is no user-edit rule.
10. Approach A con: needs a later edit (Desktop 49). DIFFERENT. The code has a "no later edit" branch that compares final timeline text with lane end text (`layer1_branches_wire_classify.ts:84-87`). See Case 1.
11. Approach B: compare `trackedFileBackups` at the branch point and the first new-branch message (Desktop 53-57). NOT for lane kind. `layer1_branches_*` never compares snapshots between two messages. Snapshots feed only the edit-base seed (`reconstruction_sidecar.ts:36-61`; reader at `layer1_branches_lanes.ts:73`) and the surviving-head owner check (next item).
12. Snapshots show which branch owns the disk files. DOES, in another form (Desktop does not frame it this way). `findWorkingTreeOwner` takes the last snapshot whose content signature changed (`reconstruction_worktree.ts:28-39`, `42-59`). If that owner is off the final-head chain, the surviving head moves (`reconstruction_surviving_head.ts:33-47`). It uses `backupFileName` only, not blob bytes (`reconstruction_worktree.ts:21-24`).
13. Approach B con: needs file history on disk (Desktop 60). DIFFERENT. No session id throws (`layer1_branches_lanes.ts:69-72`). A missing blob throws on read (`reconstruction_sidecar_backup_path.ts:15`).
14. Approach C steps 1-2: detect branch points, find the orphan. DIFFERENT (items 2 and 3).
15. Approach C step 3: collect orphan-branch edits. DOES (`layer1_branches_lanes.ts:38-53`; a branch with no file events makes no lane, 53).
16. Approach C step 4: per file, compare first post-rewind `originalFile`. DIFFERENT. One kind per lane per path (`layer1_branches_wire.ts:36-51`, row at 57), so mixed results are possible. The target-state compare is missing (item 7).
17. Approach C step 5: no later edit uses snapshots, else "unknown". DIFFERENT. No snapshots and no "unknown". It uses the final timeline text (`layer1_branches_wire_classify.ts:84-87`).
18. Approach D: diff backup files directly. NOT. No L5 branch file reads blobs to classify a lane. The only blob reader is the timeline seed reader (`layer1_branches_lanes.ts:73`).
19. Recommendation 1, `Map<UUID, Entry>`. DOES (`reconstruction_tree.ts:8-18`).
20. Recommendation 2, parent-to-children list. DOES (`reconstruction_descendants.ts:9-30`). Used for subtree walks, not for generic branch points.
21. Recommendation 3, walk from the leaf to the root. DOES (`reconstruction_tree.ts:33-57`).
22. Recommendation 4, more than one child = branch point. DIFFERENT. Only genuine-prompt children count (`reconstruction_fork.ts:96-108`). Head-based tips add more (`reconstruction_trunk.ts:99-115`).
23. Recommendation 5, collect edits per orphan branch. DOES (`layer1_branches_lanes.ts:38-53`).
24. Recommendation 6, cross-reference `originalFile`. DIFFERENT (items 8 and 25).
25. Key invariant: `originalFile` is always in the JSONL (Desktop 100). DIFFERENT. The code assumes it can be missing. Type is `string | null` (`reconstruction_extract_edit_details.ts:16`) and optional (`reconstruction_events.ts:60`). The match test falls back to hunk pre-sides (`reconstruction_multi_source_gate.ts:61-71`). A Write with null or empty `originalFile` = code (`layer1_branches_wire_classify.ts:55`).

## Rewind cases the code handles that Desktop does not name
1. `last-prompt` heads as the main signal; only maximal tips count (`reconstruction_tree.ts:21-30`; `reconstruction_trunk.ts:95-116`; `reconstruction_trunk_heads.ts:44-61`).
2. Parallel tool-call siblings share a parent but are not rewinds. They join the trunk (`reconstruction_trunk_absorb.ts:1`, `84-91`). So Desktop's "every duplicate parent is a rewind" gives false positives.
3. Tool results and meta records are not prompts and never make a fork (`reconstruction_prompts.ts:8-25`).
4. Resumed or predecessor sessions: an earlier tree's final head is trunk, not a rewind (`reconstruction_trunk.ts:13-47`). Repeated lanes across resumed files are dropped; the first lane per tool_use id wins (`layer1_branches_wire.ts:67`, `83-104`).
5. Working-tree-owner redirect of the surviving head, skipped when the final head has its own file changes (`reconstruction_surviving_head.ts:14-20`, `29-47`).
6. Forked subagent chains grafted and shown as branches (`reconstruction_fork_graft.ts:44-70`, `73-98`). Subagent files grouped under the parent session (`layer1_branch_sessions.ts:12`, `34-50`).
7. Dedup of head-based and structural branches (`reconstruction_fork.ts:61-71`, `116-128`; `reconstruction_branch.ts:45-55`).
8. A branch whose tip has no record is the unnamed main line, not a rewind (`layer1_branch_sessions.ts:65`, `76-80`).
9. Rewind-point time for a record with no stamp: use the previous stamped record; throw if none (`layer1_branches_lanes.ts:18-32`).
10. The rewind point stays on the trunk, not in the lane (`layer1_branches_lanes.ts:34`).
11. Conversation-only has two forms: rejoin at the next revision (`layer1_branches_wire_classify.ts:89`) or kept to the end (86).
12. Hunk pre-side containment when `originalFile` is missing (`reconstruction_multi_source_gate.ts:63-71`).
13. Non-edit next revisions use a line-set containment test (`layer1_branches_wire_classify.ts:60-71`). Overwrite = code (57-58).
14. The disk timeline is not branch-filtered, so orphan writes stay on disk after a conversation-only rewind (`reconstruction_steps.ts:1`, `122-124`).

## Rewinds a Desktop method finds and the code misses

### Case 1 (shown): a code restore on a file with no later edit is labeled "conversation"
Desktop method: Approach B or D, and Approach C step 5 (Desktop 53-57, 70, 75-85).
Evidence:
- With no non-lane revision after the lane, `computeLaneKind` compares the last timeline revision with the lane end text (`layer1_branches_wire_classify.ts:84-85`).
- If the lane revision is itself the file's last revision, both texts match. The result is always `conversation` with `keptToEnd` (86).
- A code restore writes no tool event, so the tool-event timeline (`reconstruction_steps.ts:109-119`) shows no change for that file.
- The test `test_computeLaneKind_gives_conversation_kept_to_end_when_lane_is_disk_final` (`jfred/tests/layer1_branches_wire_classify.test.ts:22-25`) confirms this: lane is last, result is `conversation` with `keptToEnd`.
- A snapshot compare at the branch point versus the tip would show the restore. The code never makes it (item 11).
Not done: I did not find a real session that shows this. The proof is code reading plus the test.

### Case 2 (candidate, not shown with data): an orphan sibling lost at a structural fork
Desktop method: Approach C steps 1-2 (Desktop 24, 91-95).
- At a fork with 2 or more prompt children, the code drops the latest child as "surviving" (`reconstruction_fork.ts:42`).
- It skips any earlier child whose subtree holds a claimed tip (`reconstruction_fork.ts:61-63`, `116-128`). The surviving head is claimed (`reconstruction_branch.ts:45-48`).
- If the real surviving head sits under the earlier child (for example after the owner redirect, `reconstruction_surviving_head.ts:39-47`), the earlier child is skipped and the later child is dropped as "surviving". The later child is a real orphan.
- It is still found when it has its own `last-prompt` head (`reconstruction_trunk.ts:99-107`). It is lost only when it has none.
No session shows this. Treat it as a code-reading risk, not a confirmed miss.

## Note
The code's "no match means code" can label a hand edit as a code rewind (items 8 and 9). That is a wrong label, not a missed rewind. I made no other change suggestions.

---
Summary (5 lines):
1. Report saved at plans/rewind-report-vs-l5.md.
2. Same as Desktop: tree walk, ancestor chain, edit collection, code vs conversation kinds. Different: heads-first detection, hunks not oldString, half-compare.
3. NOT in code: rewind-target-state replay (Approach A step 2), snapshot compare (B), backup diff (D).
4. Code handles 14 cases Desktop does not name, e.g. parallel tool-call siblings, resumed sessions, subagent forks, working-tree-owner redirect.
5. Case 1 miss (shown): code restore with no later edit reads "conversation" (`layer1_branches_wire_classify.ts:84-86`, test lines 22-25). Case 2 (unproven): orphan sibling lost at a structural fork (`reconstruction_fork.ts:42`).
