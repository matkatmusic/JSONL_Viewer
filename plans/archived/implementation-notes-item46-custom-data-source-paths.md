## 2026-07-09:10:00:00 — Item 46: customized data-source paths (engine + viewer + webapp)
Chat title: item46-custom-data-source-paths
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/b5b3a7fa-23a9-4d3b-9b48-6bfcc8739713.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item46-custom-data-source-paths.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (items 46, 56)

### Design decisions

- 2026-07-09: Overrides live as process-wide module state in `src/reconstruction_overrides.ts`,
  following the `reconstruction_exec_gate.ts` precedent (builds synchronous, server serializes
  requests). Default `{}` makes every new code path a no-op — an unconfigured engine behaves
  byte-identically to before.
- 2026-07-09: FHS root resolution chain is override → derived sibling (`file-history/` next to
  the projects folder, computed from the transcript's own on-disk source via `getRecordSource`)
  → `~/.claude/file-history`. The derivation is a strict generalization of the default: for a
  live `~/.claude/projects` transcript it lands on `~/.claude/file-history` exactly.
- 2026-07-09: `baseCommit` hydrates to `Uuid` (coding-req §1: identifiers → Uuid, including
  non-RFC-4122 ones like `toolu_…`; a git hash is an identifier).
- 2026-07-09: The base-commit beacon stage does NOT gate on `isImpureExecutionAllowed()`.
  That gate guards shell-outs derived from TRANSCRIPT-recorded commands; here the repo and
  commit are the user's own explicit configuration, which IS the consent.
- 2026-07-09: The per-project config file `reveng-paths.json` sits INSIDE the projects folder
  (scanProjects only lists directories and .jsonl files, so it never shows up as a project).
  Missing file → `{}`; malformed JSON → loud throw (a typo must not silently drop overrides).

### Deviations

- 2026-07-09 (USER-APPROVED IN-CONVERSATION): item 46's text says the on-disk location
  "would override the extracted CWD" when parsing. Implemented instead as consumption-point
  fallbacks (extra candidate repo dirs in the git-evidence channel). A parse-time cwd rewrite
  breaks `readCommittedFileContent`'s relpath math (`relative(recordedCwd, recordedFilePath)`
  escapes to `..` when cwd is rewritten but file paths stay recorded) and would put
  rename/copy resolution (`resolveAgainstCwd`) in a mixed path space that breaks lineage
  joins. Same user-visible outcome — the engine finds the relocated repo.

### Tradeoffs

- 2026-07-09: Module-level override state vs threading an options object through
  `reconstructBranches` — chose module state for a minimal diff on the exec-gate precedent;
  the exec-gate's own ponytail comment already names the upgrade path if builds ever stop
  being synchronous.
- 2026-07-09: Base-commit beacons only reach transcript-TOUCHED files (target enumeration
  comes from extracted events). A file existing only in the base commit gets no history.
  Matches the engine's charter; noted in the module header.
- 2026-07-09: `seedBaseCommitBeacon` spawns `git show` per target per build with no memo —
  same YAGNI posture as item 54 (`runGitUnifiedDiff`); the sandbox-memo precedent is the
  upgrade path if audit-scale latency shows up.

### Implementation record (2026-07-09, post-fan-out)

- Phase 1 (overrides module) implemented by the coordinator; Phases 2–5 ran as four PARALLEL
  subagents on disjoint files; Phases 6–7 (viewer + webapp) by the coordinator. Full-repo
  `npx tsc --noEmit` clean; `npm run build:webapp` clean; CLI smoke-run on s19 `--json` clean.
- Webapp detail beyond the plan's letter: the File-history field posts `""` when UNEDITED
  (tracked against the last server-reported value), so a folder switch re-derives instead of
  re-pinning the old derived path as an explicit override. Without this, the prepopulated
  value would mask derivation forever after the first switch.
- Phase-4/5 agents' notes: the git temp-repo test recipe actually lives in
  `tests/reconstruction_git_evidence.test.ts` (the plan cited render_git_diff.test.ts);
  `readCommitTimestamp` gained a NaN guard beyond the plan text (garbage `%cI` → undefined,
  consistent with the silent-degradation contract); `findFallbackRepoDirs` is exported (the
  plan's snippet showed it private but its own test note requires the export).
- Process slip, no harm: the Phase-3 and Phase-4 agents each once smoke-IMPORTED a node:test
  file, which executes its registered tests. Unintended (constraint was "don't run tests"),
  output discarded; the suite still needs its real run by the user.
- Tests added (21, written red-green, NOT run): 6 Phase-1 + 5 Phase-2 in
  `tests/reconstruction_overrides.test.ts`; 4 in `tests/reconstruction_cli.test.ts`; 2 in
  `tests/reconstruction_git_evidence.test.ts`; 6 in `tests/reconstruction_base_commit.test.ts`;
  4 in `tests/viewer-api.test.ts` (the count line says 21 core — the viewer 4 included makes
  25 total assertions-bearing test functions; TASKS.md's "21" counts the engine-side files).

### Addendum 2026-07-09 ~10:45 — three timeline test failures (item-55 leftovers, repaired)

- The user's suite run surfaced 3 failures in `tests/timeline-viewmodels.test.ts`. NOT item-46
  breakage: `git diff HEAD` on that file and `webapp/views/timeline.ts` was empty before the fix —
  they pinned the PRE-item-55 design (git rows inside agent-turn bubbles via the retired
  `attachGitOperationsToAgentTurns`; node counts without the un-bubbled tool-call rows) and were
  missed by commit `7671307`'s "2 adjusted" pass.
- Repairs (old bodies commented out with item-55 markers, per the archive convention):
  (1) `test_turn_timeline_has_one_node_per_message_plus_session_ends` now also excludes
  `TOOL_CALL_NODE_KIND` from the turn-node count; (2) the turns-own-git-operations test became
  `test_git_operations_render_as_standalone_tool_call_rows_not_turn_rows` (turns own nothing; every
  s85 git operation has a tool-call row at its instant+session); (3) the attribution-rule test
  became `test_commit_nodes_derive_from_git_operations_without_tool_calls` (same minimal document;
  pins the commit hard-stop node with its message and the empty turn rows).
- Verified: the single file runs 55/55 pass, `tsc --noEmit` clean. Only this one test file was
  run — the full suite remains the user's.

### Open questions

- The `gitBase:` beacon changeIds resolve to no session in `indexChangeIdsToSessionIds`, so a
  step whose ONLY changeId is a base-commit beacon lands in the unattributed lane (same class
  as the item-41 blob-ref/git-evidence survivors; the styles.css hide rule already covers it).
  Attributing them (e.g. "baseline" pseudo-lane) is a display decision — raise if wanted.
- Item 56 (skip pre-baseline reconstruction + question UI) is filed and deliberately NOT
  built; the beacon currently supersedes-but-still-shows earlier steps, per your spec.
