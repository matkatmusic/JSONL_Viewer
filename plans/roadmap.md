[x] S1 -> [x] fix types (no primitives) -> [x] commit
[x] S2 -> [x] Read/Edit tools + StructuredPatchHunk + 3 attachment kinds + isMeta gate
[~] Per-line reconstruction engine -> [x] S1 slice (Write create -> rm delete, --verbose/--diff); [ ] Edit/observation/verdict
[x] S3 -> [x] cp copy lineage (CopyEvent + seed-from-source-at-copy-time + first-class copy entry; 3 independent histories)
[x] S4 -> [x] overwrite (2nd Write to a present file = replay-time presence distinction; first-class overwrite revision kind; render-list split; queue-operation record type added)
[x] S5 -> [x] bash redirect (`>>` append = carried-prefix + genesis-suffix revision; `>` overwrite = S4 reuse; content recovered from the file-history sidecar via injected BackupReader, snapshot paths resolved against cwd; replay-edit split; DOES_NOT_EXIST_YET sentinel; render-list verb renames)
[x] S6 -> [x] git mv rename (generalized parseMvPaths to accept `git mv`; cwd-relative rename paths resolved absolute via shared resolveAgainstCwd in new structures/path-resolve.ts leaf module; reuses S2 rename lineage + edit splice; no new event kind, no sidecar)
[x] S7 -> [x] conversation rewind / code restore (branch-aware reconstruction; rewind = a parentUuid fork named by the final last-prompt leafUuid; surviving branch is the engine default, rewound branches PRESERVED & retrievable like unmerged git branches; new reconstruction_branch.ts model + reconstruction_branches.ts core split off engine; reconstructBranches + CLI default-all-branches with --surviving/--list-branches/--branch; no new event/revision/per-line kind)
[x] S8 -> [x] repeated code-restore rewinds + final conversation-only rewind (surviving working tree resolved from file-history-snapshot tracked-set changes, not the final conversation head; new reconstruction_tree.ts walkers + reconstruction_worktree.ts owner detection; findSurvivingHead working-tree-aware; no-op for S1–S7; no new event/revision/per-line/container kind)
[ ] S9 ->
[ ] S10 ->
[ ] S11 ->
[ ] S12 ->
[ ] S13 ->
[ ] S14 ->
[ ] S15 ->
[ ] S16 ->
[ ] S17 ->
[ ] S18 ->
[ ] S19 ->
[ ] S20 ->
[ ] S21 ->
[ ] S22 ->
[ ] S23 ->
[ ] M1 ->
[ ] M2 ->
[ ] M3 ->
[ ] M4 ->
[ ] M5 ->
[ ] M6 ->
[ ] M7 ->
