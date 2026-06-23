[x] S1 -> [x] fix types (no primitives) -> [x] commit
[x] S2 -> [x] Read/Edit tools + StructuredPatchHunk + 3 attachment kinds + isMeta gate
[~] Per-line reconstruction engine -> [x] S1 slice (Write create -> rm delete, --verbose/--diff); [ ] Edit/observation/verdict
[x] S3 -> [x] cp copy lineage (CopyEvent + seed-from-source-at-copy-time + first-class copy entry; 3 independent histories)
[x] S4 -> [x] overwrite (2nd Write to a present file = replay-time presence distinction; first-class overwrite revision kind; render-list split; queue-operation record type added)
[x] S5 -> [x] bash redirect (`>>` append = carried-prefix + genesis-suffix revision; `>` overwrite = S4 reuse; content recovered from the file-history sidecar via injected BackupReader, snapshot paths resolved against cwd; replay-edit split; DOES_NOT_EXIST_YET sentinel; render-list verb renames)
[x] S6 -> [x] git mv rename (generalized parseMvPaths to accept `git mv`; cwd-relative rename paths resolved absolute via shared resolveAgainstCwd in new structures/path-resolve.ts leaf module; reuses S2 rename lineage + edit splice; no new event kind, no sidecar)
[x] S7 -> [x] conversation rewind / code restore (branch-aware reconstruction; rewind = a parentUuid fork named by the final last-prompt leafUuid; surviving branch is the engine default, rewound branches PRESERVED & retrievable like unmerged git branches; new reconstruction_branch.ts model + reconstruction_branches.ts core split off engine; reconstructBranches + CLI default-all-branches with --surviving/--list-branches/--branch; no new event/revision/per-line kind)
[x] S8 -> [x] repeated code-restore rewinds + final conversation-only rewind (surviving working tree resolved from file-history-snapshot tracked-set changes, not the final conversation head; new reconstruction_tree.ts walkers + reconstruction_worktree.ts owner detection; findSurvivingHead working-tree-aware; no-op for S1–S7; no new event/revision/per-line/container kind)
[x] S9 -> [x] code restore to older code with no post-edit (surviving working tree is the restored code; findWorkingTreeOwner detects change by content identity — carried-forward backupFileName — not the version counter, so post-restore refresh snapshots don't move the owner; reconstructAll(S9) is the restored write turn, reconstructBranches(S9) has zero rewound branches; refines S8 locked decision #3; single change in reconstruction_worktree.ts, no new module/event/revision/per-line kind, no CLI change)
[x] S10 -> [x] conversation-only rewind with no post-edit (the files written on the abandoned conversation branch stay on disk and ARE the surviving working tree; the read-only post-rewind head is a file-less tangent, so zero rewound branches and a plain single-branch list; no engine change — the isolated conversation-only-rewind case of spec 35, strict no-op for spec 36 since the post-rewind snapshots repeat the same version AND the same non-null backupFileName; locked by tests + spec 37; new tests/reconstruction_engine_s10.test.ts + tests/reconstruction_cli_s10.test.ts + 1 synthetic branch test, no new module/event/revision/per-line kind, no CLI change)
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
