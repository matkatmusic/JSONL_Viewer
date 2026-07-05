# Handoff: Implement probe-projects.js path-field rework (#7) + probe re-architecture to 100% reconstruction (#9)

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; the entire RevEng tree is
untracked — `common/`, `tools/`, `tests/`, `plans/`, etc. are all `??` in `git status`). Do NOT
assume git history will tell you anything; it won't. The real state is in the files.

## Goal
`tools/probe-projects.js` is a verification harness that replays file edits from real Claude
JSONL session transcripts and compares the reconstruction against on-disk/snapshot/git content,
writing `tools/probe-results.json`. An audit proved the **replay engine is correct** — all
non-passing files fail due to the *probe's verification harness*, not the engine. Two build tasks
remain: **#7** restructures the probe's per-file path fields (name things what they are) and drops
a redundant field; **#9** re-architects the probe to source transcripts the way the production
pipeline does, targeting **100% reconstruction** for the jot-recovery transcript set.

**READ THESE FIRST (in order):**
1. The plan (lives OUTSIDE the repo): `/Users/matkatmusicllc/.claude/plans/two-new-cli-tools-snappy-ripple.md`
2. The divergence rationale (prerequisite for #9): `plans/probe-vs-pipeline-divergence.md`
3. The implementation notes / session log: `plans/implementation-notes-two-new-cli-tools-snappy-ripple.md`
4. The audit findings: `tools/probe-mismatches.json`

## Current State (done — tasks #1–#6, #8)
- **`tools/probe-projects.js`** already emits a `fullPath` field per record and exports
  `buildProbeResult` + `buildFileRecord` (Part A / task #1). **#7 will RENAME `fullPath` →
  `earliestSeenFullPath` and add `lastSeenFullPath`** — do not be surprised that `fullPath`
  exists today.
- **`tests/test-probe-projects.js`** exists with 5 passing tests asserting `fullPath` survives
  into the record. #7 must update these to the new field names.
- **`tools/probe-results.json`** was regenerated against the jot-recovery transcript set; every
  record carries `fullPath` (0 missing). `projects[0]` = `-Users-matkatmusicllc-Desktop-claude-code-src`,
  204 files, 193 PASS / 11 non-passing.
- **`tools/probe-mismatches.json`** — completed forensic audit of all 11 non-passing files:
  **0 are engine bugs**; 6 are probe-harness defects (b), 5 are genuinely un-verifiable (c).
- **`plans/probe-vs-pipeline-divergence.md`** — explains why the probe under-reports vs the real
  pipeline (task #8). Prerequisite reading for #9.
- **Tests:** full suite was **247 passing / 0 failing** at the end of task #5. No code has changed
  since (only plan/doc/task-spec edits), so it should still be green — re-run to confirm
  (see How to Verify). The runner excludes `tests/test-output-data.js` (a 489 KB browser data
  file, not a test) and `tests/test-helpers.js`.

## What Remains (execute in this order)

### Task #7 — Path fields rework (`tools/probe-projects.js`, `tests/test-probe-projects.js`, `common/collect-touches.js`)
1. **Rename + redefine** emitted `fullPath` → **`earliestSeenFullPath`**, now **GLOBAL across all
   transcripts** (not per-session): the absolute path of the *earliest-ever* reference to the
   file, matched across its rename/move/copy history, ordered by (record `timestamp`, then line).
   One value per file. The old `buildFilePathIndex:135` (first-seen *within one session*) is NOT
   sufficient.
2. **Add `lastSeenFullPath`** = where the file exists on disk NOW after following rename/move/copy
   history, or `""` if deleted. MUST follow `cp`/`mv`/`git-mv` (these are Bash `tool_use`s parsed
   by `extract-bash-file-ops.js extractBashFileOps`, NOT file-edit `toolUseResult`s).
3. **Add a once-per-run shared helper** to `common/collect-touches.js`:
   `buildFilePathHistoryIndex(projectsDir)` → `{ samePathGraph, touchesByPath }` (reuse internal
   `gatherAllOps`/`collectAllJsonls`; carry each touch's `timestamp`), plus pure helpers
   `findEarliestFilePath(knownFilePaths, index)` and `findCurrentOnDiskPath(knownFilePaths, index)`.
   Reuse existing `buildLineageGraph:147` + `resolveAliases:172`. Thread the index
   `runProbe` → `probeProject` → `verifyAllTargets`.
4. **Remove `filename`** from the emitted record (keep `r.filename` INTERNALLY — it's the basename
   key used by `formatFailureLines`, `compareWithSkipFiles`, and as `target` in verification).
5. **Update `tests/test-probe-projects.js`**: assert `earliestSeenFullPath`, `lastSeenFullPath`
   (resolves through a cp/mv/git-mv fixture to dst; `""` when dst absent), and that `filename` is
   absent. Use `runWithContext`'s `tempDir()` (see `tests/test-helpers.js`).
6. **Regenerate** `probe-results.json` (this task modifies the generator):
   `node tools/probe-projects.js --projects-dir ~/Programming/jot-recovery/claude-data/projects`
7. **Refresh** the derived `tools/probe-mismatches.json`: switch each entry's `file` key to
   `earliestSeenFullPath`, add `lastSeenFullPath`, re-validate shape + coverage.

### Task #9 — Re-architect probe to 100% (`tools/probe-projects.js`, `common/extract-file-state.js`)
1. **Source transcripts via `find-jsonls-for-file.js`** (`findReferencingJsonls(knownFilePaths,
   projectsDir)`) instead of probing one session at a time. Per file: gather every touching
   transcript (cross-session, cross-project, rename-followed), assemble kept edits with
   `reconstruct.js collectEditsFromTranscripts(jsonls, basename)`, replay once, compare against
   `lastSeenFullPath` (current on-disk path).
2. **Make the file-history snapshot dir configurable.** `common/extract-file-state.js` HARDCODES
   `~/.claude/file-history` in TWO spots: `findLastSnapshotContent` (line 279) and
   `resolveHistoryDir` (line 137). Add a `baseHistoryDir` param (default
   `path.join(os.homedir(),'.claude','file-history')`) to both + `extractSnapshotEdits`, and thread
   a new optional probe CLI flag **`--snapshots <path>`**. Resolution when omitted: auto-derive
   `<projectsDir>/../file-history` if it exists, else fall back to `~/.claude/file-history`;
   explicit flag wins.
3. Maps to the 4 defects: #4 (multi-session/cross-project) solved by `findReferencingJsonls`;
   #1 (stale path) solved by comparing to `lastSeenFullPath`; #3 (basename collision) solved by
   keying on full path history; #2 (snapshot-predates-final-edit) becomes rare once current
   on-disk file is found, else compare replay up to the snapshot's line.
4. **Phase it** (regenerate between phases to watch the pass rate climb): Phase 1 = `--snapshots`
   + compare to `lastSeenFullPath`; Phase 2 = transcript sourcing via `findReferencingJsonls`;
   Phase 3 = full-path target keying. Then regenerate + refresh `probe-mismatches.json` (→ empty).

### Cross-cutting
- Mirror the plan's **Task Ledger** to a repo-local `plans/task-ledger.md` and keep it updated
  (the native task list only shows one-line subjects — the user explicitly asked for full task
  context tracked in a file).

## Key Files
- `tools/probe-projects.js` — the verification harness to edit (both #7 and #9). Key functions:
  `verifyAllTargets`, `verifyTarget:271`, `buildFilePathIndex:135`, `collectProbeTargets:149`,
  `buildProbeResult`, `buildFileRecord`, `tryCumulativeVerify:365`, `trySnapshotVerify:186`,
  `probeProject:376`, `runProbe`. ~597 lines (already over a 300-line lint warning — pre-existing).
- `common/collect-touches.js` — lineage/touch machinery to reuse + extend: `findReferencingJsonls`,
  `collectTouches`, `buildLineageGraph:147`, `resolveAliases:172`, `enumerateJsonlFiles`,
  internal `gatherAllOps`/`collectAllJsonls`.
- `common/extract-file-state.js` — snapshot reading; **hardcoded file-history path at lines 137 &
  279** (fix in #9). `findLastSnapshotContent(jsonlText, targetFile)`.
- `common/extract-bash-file-ops.js` — `extractBashFileOps(parsed)` returns cp/mv/git-mv/rm/redirect
  ops (used for `lastSeenFullPath`).
- `tools/reconstruct.js` — the production pipeline to mirror: `collectEditsFromTranscripts`,
  `extractKeptEditsForFile`.
- `tools/find-jsonls-for-file.js` — CLI wrapper around `findReferencingJsonls` (the transcript
  source for #9).
- `tests/test-probe-projects.js` — update for #7. `tests/test-helpers.js` — `run`, `runWithContext`,
  `tempDir()`, JSONL line builders.
- `tools/probe-results.json` / `tools/probe-mismatches.json` — regenerate/refresh after #7 and #9.

## Plan File
`/Users/matkatmusicllc/.claude/plans/two-new-cli-tools-snappy-ripple.md` (OUTSIDE the repo — read
it from that absolute path; it contains the full Task Ledger, §#7, §#9, decisions, and verification).

## Context the Next Agent Won't Have
- **The probe's transcript source is `~/Programming/jot-recovery/claude-data/projects` (13
  projects), NOT `~/.claude/projects` (109).** The user corrected this mid-session. Running against
  `~/.claude/projects` reshuffles `projects[0]` and changes results. Always pass
  `--projects-dir ~/Programming/jot-recovery/claude-data/projects`.
- **The file-history snapshots for that set live ONE LEVEL UP**, at
  `~/Programming/jot-recovery/claude-data/file-history`, NOT under `~/.claude/file-history`. This
  is almost certainly why the 5 `js/*` NOT_FOUND files couldn't resolve a snapshot
  (`findLastSnapshotContent` returned null) — it was looking in the wrong hardcoded dir. The
  `--snapshots` flag in #9 fixes this and is the highest-leverage single change toward 100%.
- **`earliestSeenFullPath` must be GLOBAL across all sessions**, not per-session. The user
  explicitly overrode the per-session definition. The implementation-notes #6 section still
  describes the OLD per-session `fullPath` — that note is superseded by the plan; don't follow it.
- **Confirmed empirically:** today's `fullPath` = first-seen path *within one session*. Example:
  `jfred-load.js` records `…/RevEng/jfred-load.js` first (line 878) but was moved to
  `…/RevEng/jfred/jfred-load.js` (now on disk there); `jfred-unified-load.js` → now at
  `…/RevEng/unified/`; `jsonl-tree-viewer.html` → now at `…/RevEng/viewer/`. The `js/` scaffold
  files (globals/render/inspect/compare/events.js) were abandoned — `RevEng/js/` is empty and they
  exist nowhere (genuine deletions).
- **Naming convention the user insists on:** name variables for what they ARE; avoid borrowed
  jargon. Specifically rejected: `corpus` (→ "all transcripts"), `seed`/`seedPaths` (collides with
  RNG; → `knownFilePaths`), `lineage`/`alias set` (→ `allFilePathsForThisFile`). Keep the existing
  real function names (`buildLineageGraph`, `resolveAliases`, `findReferencingJsonls`) since
  renaming exported code is out of scope, but describe them by behavior.
- **`mv`/`git mv`/`cp` ARE always recorded** in the JSONL — every Bash command is a `tool_use`
  with a `toolUseResult`. They're *bash-op* records (parse with `extractBashFileOps`), not
  file-edit `toolUseResult`s. (The user corrected an earlier mis-statement that moves might be
  unrecorded — they're not.)
- **The 4 probe defects** (from `probe-mismatches.json`): (1) stale path / rename not followed
  (`verifyTarget:271` only `fs.existsSync` at first-seen path); (2) snapshot-predates-final-edit
  (`trySnapshotVerify:186` full-replay-vs-last-snapshot); (3) basename collision
  (`collectProbeTargets:149` keys by basename — e.g. 3 different `launch.json` merged); (4)
  cross-project/multi-session not assembled (`probeProject:376` loads one dir; `tryCumulativeVerify`
  gated on on-disk + single dir).
- **Decisions locked with the user:** `--snapshots` auto-derive-then-fallback;
  `probe-mismatches.json` keys `file` on `earliestSeenFullPath` (+ `lastSeenFullPath` extra);
  execute #7 before #9 (the shared `buildFilePathHistoryIndex` lands in #7, #9 reuses it).
- **Regeneration discipline (user rule):** regenerate an artifact ONLY when its generator changes.
  `probe-results.json` is generated by `probe-projects.js` → regenerate when you edit it.
  `probe-mismatches.json` is derived from `probe-results.json` (a manual audit, no generator
  script) → refresh it whenever `probe-results.json` is regenerated.
- **Other docs read this session:** the original task pointed at
  `plans/implementation-notes-i-need-a-cli-parsed-quasar.md` (the build notes for the two CLI tools
  that already exist: `find-jsonls-for-file.js`, `find-jsonls-at-commit.js`). No external handoff
  doc was given to this session beyond the user's prompts.

## How to Verify
1. **Tests green (baseline + after #7):**
   ```bash
   cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
   node tests/test-probe-projects.js          # focused
   for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|tests/test-output-data.js) ;; *) node "$t" 2>/dev/null | grep -E "passed, [0-9]+ failed";; esac; done   # full suite, expect 0 failed
   ```
2. **#7 fields present, `filename` gone:**
   ```bash
   node -e 'const r=require("./tools/probe-results.json");const f=r.projects.flatMap(p=>p.files);
   console.log("missing earliestSeenFullPath:",f.filter(x=>x.earliestSeenFullPath===undefined).length,
   "| missing lastSeenFullPath:",f.filter(x=>x.lastSeenFullPath===undefined).length,
   "| still has filename:",f.filter(x=>"filename" in x).length)'   # expect 0 | 0 | 0
   ```
   Spot-check: `jfred-unified-load.js` → `earliestSeenFullPath` `…/RevEng/jfred-unified-load.js`,
   `lastSeenFullPath` `…/RevEng/unified/jfred-unified-load.js`; a `js/*` file → `lastSeenFullPath === ""`.
3. **#9 pass rate (the goal):**
   ```bash
   node tools/probe-projects.js --projects-dir ~/Programming/jot-recovery/claude-data/projects --snapshots ~/Programming/jot-recovery/claude-data/file-history
   node -e 'const r=require("./tools/probe-results.json");console.log("all 100%:",r.projects.every(p=>p.numFailing===0));r.projects.filter(p=>p.numFailing>0).forEach(p=>console.log(p.project,p.numFailing))'
   ```
   Expect `all 100%: true`, or document each residual NOT_FOUND as a genuinely-deleted-no-snapshot
   file with evidence. Then `tools/probe-mismatches.json` should refresh to empty (or documented
   residuals only).
