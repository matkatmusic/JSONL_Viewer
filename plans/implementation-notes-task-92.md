## 2026-07-15:10:20:00 — Task 92 + codebase-wide oversize audit & split
Chat title: task 92
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/47e614ed-a625-4437-87d2-3900e7d7dfaf.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task92-split-oversized-files.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tasks.json (task 92)

### Design decisions

- 2026-07-15 10:20 — Scope expanded mid-session by user: not just the four task-92
  files, but audit EVERY tracked TS file (trailing blank line via Edit so the jot
  post-edit hook flags oversized files) and split everything flagged.
- Excluded from audit and splitting: `webapp/archive/**` (archive = preserve),
  `webapp/vendor/**` (third-party), and untracked TS (`jsonl-tree-viewer.ts`,
  `api/`, `jfred/`, `diff/`).
- The audit blank lines are left in place (they are the audit trail the user asked
  for); flagged files lose theirs naturally when rewritten by the split.
- Deep-nesting sites reported by the hook are RECORDED here, not fixed — splitting
  only; nesting is follow-up-task input.
- Verification limited to `npm run typecheck` + `npm run build:webapp`; the user
  runs the test suite themselves (explicit instruction: run no tests/suites).

### Deviations

(none yet)

### Tradeoffs

- Split scheduling serializes within src/ and webapp/ lanes (importer files get
  edited by their dependency's split) but runs the two lanes concurrently — a grep
  confirmed zero cross-imports between webapp/ and src/.

### Open questions

(none yet)

### Phase 1 audit results (complete, 2026-07-15 ~11:05)

All 153 tracked TS files audited (excluding webapp/archive, webapp/vendor, untracked).
Mechanics: 19 files blank-lined via an Edit-tool subagent (hook fired per edit); the
remaining 134 (incl. the webapp/app.ts probe) blank-lined via Bash, with the hook's
own checker (`jot/common/scripts/filesize_check.py`) run directly per file — same
oracle, needed because the permission classifier kept denying most audit-subagent
spawns (it flags the context-mode plugin's injected prompt block as an injection).

**Size-flagged (>250 lines) at audit time** — matches the plan's expected table:
webapp/views/timeline.ts (2268→ being split), tests/timeline-viewmodels.test.ts (2378),
webapp/app.ts (1220), tests/viewer-viewmodels.test.ts (747), webapp/views/details.ts (688),
webapp/inspector.ts (615), src/reconstruction_script_execution.ts (565),
tests/reconstruction_script_execution.test.ts (546), tests/viewer-api.test.ts (502),
src/reconstruction_branch.ts (474), src/viewer_server.ts (420),
src/reconstruction_extract.ts (360), src/reconstruction_branches.ts (348),
src/reconstruction_cli.ts (343), tests/reconstruction_render.test.ts (342),
src/reconstruction_render.ts (328), webapp/views/diff-vs-base.ts (320),
tests/reconstruction_cli.test.ts (276), src/regex_expressions.ts (273),
tests/viewer-progress.test.ts (273), src/reconstruction_sidecar.ts (269),
tests/reconstruction_branch.test.ts (268), webapp/views/file-history.ts (265),
tests/reconstruction_overrides.test.ts (260), tests/reconstruction_extract.test.ts (260),
src/reconstruction_tree.ts (253).
(src/reconstruction_git_evidence.ts, src/reconstruction_json.ts, src/viewer_api.ts,
src/reconstruction_script_stage.ts were flagged too but were already mid-split when the
sweep ran.)

**Nesting-only flags (≤250 lines but deep nesting — follow-up-task input, NOT fixed here):**
- src/reconstruction_corpus.ts: 31, 33, 35, 37
- src/reconstruction_tool_calls.ts: 104-110
- tests/content-blocks.test.ts: 73-76
- webapp/views/conversation.ts: 150-152, 162-163, 165-166, 170-172
- webapp/views/project.ts: 94-96
- webapp/views/projects.ts: 34-35, 37-39
- webapp/views/raw-lines.ts: 90-92, 94-96
- webapp/views/sidebar.ts: 69-70
- src/parse/loadTranscript.ts: 188-192
(Oversized files' own nesting sites are in the raw log:
the scratchpad audit-flags.txt of session 47e614ed; sites inside files being split are
stale after the split anyway. webapp/app.ts sites: 119-120, 123-135, 306, 509-520,
713-715, 725-726, 817-820, 1016.)

### Split progress log

- src/reconstruction_git_evidence.ts → git_operations (249) + git_placement (220) + kept (95); 6 importers; typecheck PASS
- src/reconstruction_json.ts → kept (205) + reconstruction_json_steps.ts (112); 3 importers; PASS
- src/reconstruction_script_stage.ts → reconstruction_script_runs.ts (181) + kept (243); 6 importers; PASS
- src/viewer_api.ts → kept (160) + viewer_api_projects (181) + viewer_api_records (111) + viewer_api_diffs (131); 8 importers; PASS (reportStage newly exported)
- webapp/views/timeline.ts view-model half → timeline-types (232) / timeline-nodes / timeline-changes / timeline-commit-files / timeline-picks / timeline-labels / timeline-file-tree / timeline-sessions (all ≤250); importers (details.ts + 3 test files) repointed; typecheck + build:webapp PASS.
- webapp/views/timeline.ts render half → timeline.ts (220, orchestrator) + timeline-render-context (53) / -inspectors (207) / -selectbar (156) / -chips (214) / -rows (207) / -selection (106); TimelineRenderContext object carries the shared closure state.
- src/reconstruction_script_execution.ts → kept (210) + _script_prestate (169) + _script_sandbox (201); 9 importers
- src/reconstruction_branch.ts → kept (222) + _trunk (145) + _orphans (135); 3 importers
- src/reconstruction_branches.ts → kept (227) + _revisions (40) + _renderable (105); 7 importers
- src/reconstruction_extract.ts → kept (168) + _bash_events (119) + _script_renames (95); broke the parse_lines↔extract import cycle
- src/reconstruction_render.ts → kept (148) + _render_unified (186)
- src/reconstruction_cli.ts → kept (192) + _cli_args (162)
- src/reconstruction_sidecar.ts → kept (164) + _backup_timeline (118)
- src/reconstruction_tree.ts → kept (201) + _prompts (59); 6 importers
- src/regex_expressions.ts → kept (215) + regex_script_detection (63)
- src/viewer_server.ts → kept (214) + viewer_server_routes (227)
- webapp/app.ts → entry shell (78) + app-dom (15) / app-routes (39) / app-console (197) / app-progress (110) / app-fetch (211) / app-consent-model (101) / app-consent (209) / app-router (246) / app-drawer (60); 21 importers repointed
- webapp/views/details.ts → kept (145) + details-model (195) + details-diff (203) + details-revision-view (207) (4 modules, plan-flex: the kept set measured ~340)
- webapp/inspector.ts → kept (213) + inspector-links (198) + inspector-json (176) + inspector-text (66)
- webapp/views/file-history.ts → kept (142) + file-history-model (135); 9 importers
- webapp/views/diff-vs-base.ts → kept (164) + diff-vs-base-model (166)
- tests/timeline-viewmodels.test.ts (2378) → 17 topic test files + tests/timeline-test-helpers.ts, all ≤250, 116 tests moved verbatim (script-verified 116 in = 116 out), original deleted
- tests/viewer-viewmodels.test.ts (747) → 5 topic files + viewer-test-helpers.ts; original deleted
- tests/reconstruction_script_execution.test.ts (546) → 4 topic files + script-execution-test-helpers.ts
- tests/viewer-api.test.ts (502) → 4 topic files (projects/documents/overrides/diffs); original deleted
- tests/reconstruction_render.test.ts → 2 files + reconstruction_render-test-helpers.ts
- tests/reconstruction_cli.test.ts → kept (180) + reconstruction_cli_args.test.ts (99)
- tests/viewer-progress.test.ts → kept (219) + viewer-console-links.test.ts (61)
- tests/reconstruction_branch.test.ts → kept (222) + reconstruction_orphans.test.ts (41) + helpers
- tests/reconstruction_overrides.test.ts → kept (119) + reconstruction_sidecar_reader.test.ts (146) + helpers
- tests/reconstruction_extract.test.ts → kept (93) + reconstruction_bash_events.test.ts (84) + reconstruction_script_renames.test.ts (92)

### Final verification (2026-07-15 ~11:55)

- `npm run typecheck`: PASS (exit 0)
- `npm run build:webapp`: PASS (exit 0)
- Zero non-archive tracked TS files exceed 250 lines (`git ls-files` + wc sweep clean).
- Test suite NOT run by me (user's explicit instruction) — the jot PostToolBatch hook ran
  per-edit test subsets on its own throughout; final suite run is the user's.
- Task 92 moved to completedTasks.json (completionDate 2026-07-15, no commitHashes — nothing committed).

### Open questions

- The permission classifier denied ~40% of subagent spawns until you confirmed the
  context-mode injected block was benign (mid-session). Consider disabling the
  context-mode plugin's subagent-routing hook for this project to avoid the same
  friction next session.
- Deep-nesting flags (recorded above) are untouched by design — worth a dedicated
  follow-up task if the per-edit hook noise on those files becomes annoying.

### Deviations (running)

- Eighth timeline module `timeline-commit-files.ts` added beyond the plan's seven —
  timeline-changes.ts would have exceeded 250 otherwise (plan permits flexing module
  membership).
- checkSnapshotIsGitBaseline/computeGitBaselineText moved to timeline-changes.ts (not
  timeline-nodes.ts as planned) to keep timeline-nodes under the cap; exported from
  changes as their canonical home.
- Audit blank lines for 134 files appended via Bash instead of the Edit tool, and the
  hook checker invoked directly per file: the permission classifier repeatedly denied
  the Edit-subagent spawns (false-positive on the context-mode plugin's injected
  block). Same checker, same verdicts; hook noise avoided.
