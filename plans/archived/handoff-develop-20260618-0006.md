# Handoff: PLAN authored — self-contained scenario data (Part A) + dual-engine reconstruction verification script (Part B)
Conversation name: plan for checking if the sidecar reconstructs every scenario file
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `develop` (single-commit repo `1a9f098 Initial commit`; the entire
`api/`/`tests/`/`tools/`/`plans/` tree is UNTRACKED by design — only `.gitignore` is tracked, so
there is no git history or diff to inspect). Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd `…/Desktop/claude code src` is the
Claude Code TS source (PRODUCER of the JSONL), NOT a git repo.

## Goal
Answer the user's real question — **"is the sidecar fully functional, or is there more to build?"** —
by checking whether the RevEng reconstruction engines can rebuild **every file each hand-authored
scenario in `plans/scenarios/` touched**, matching the committed ground-truth. The deliverable is a
verification harness that runs each scenario's JSONL through **both** reconstruction engines and
documents, per edited file, whether each engine reconstructs it correctly. Engine disagreement on
delete/move scenarios is the headline signal for "more to build."

## Current State
**Planning COMPLETE; nothing implemented yet.** A full, TDD-structured, two-part plan is written and
was iterated through several user corrections (see "Context" below). No `api/`, `tools/`, or `tests/`
code was written this session — the session was plan-mode only. The plan is ready to execute.

Going-in baselines (verified earlier / from the 2353 handoff, NOT re-run this session):
- Full sweep `for f in tests/test-*.js; do node "$f"; done` → **707 passed / 0 failed**.
- `node tests/verify-unified-scenarios.js` (Engine-A A/B gate) → **29 MATCH / 0 MISMATCH / 4 SKIPPED**.
- Roadmap items 1–18 + 10a all `[x]`; §A/§B/§C/§D closed; only unchecked box is line 45 (`cp → dst
  content`, a DEFERRED capability sub-bullet).

## What Remains
Execute the plan at `~/.claude/plans/plan-for-checking-if-cached-gadget.md`, in order:

1. **Part A — fold copying into `run-all-scenarios.py`; retire `copy-scenario-outputs.py`.** Add (TDD,
   pytest `tmp_path`, in `tests/test_run_all_scenarios.py`): `extractTmpdirFromResultText`,
   `extractJsonlPathFromResultText`, `copyScenarioOutputsToExecutedDir` (fold
   `copy-scenario-outputs.py:copyTmpdirOutputs` lines 31-71), `copyScenarioJsonlToExecutedDir` (copies
   the `<uuid>.jsonl` into `plans/scenarios/executed/<stem>/`), `captureCompletedScenario`. Wire the
   last into the Phase-2 poll loop's `"completed": true` branch (lines ~93-106) so copying happens
   BEFORE tmpdir cleanup. Archive `copy-scenario-outputs.py` → `archive/` (preserve, don't delete).
2. **User regenerates data:** `python3 run-all-scenarios.py <tmux-pane>` (needs a live Claude tmux
   session). One command then yields fresh result files + ground-truth dirs + local JSONLs per subfolder.
3. **Part B — dual-engine verification script.** Build, strict red-green TDD (run with
   `node tests/test-scenario-reconstruction-check.js`), the 13 behaviors in the plan: loader
   (`getScenarioSubfolderPaths`, `findScenarioJsonlPath`, `collectPresentGroundTruthFiles`,
   `getRemovedOrMovedAwayPaths`, `classifyExpectedState`), target resolution
   (`resolveAbsoluteTargetPath` via `extractSessionMetadata().cwd`), Engine A adapter
   (`reconstructWithUnifiedEngine` + `checkUnifiedEngineResult`), Engine B adapter
   (`resolveAliasPathsForTarget`, `reconstructWithSidecarEngine`, `checkSidecarEngineResult` /
   `sidecarConcludesAbsent`), and reporting (`buildPerFileRecord`, `formatReport`,
   `countUnexpectedFailures`). Helpers in `api/scenario-reconstruction-check.js` (split engine adapters
   to `api/scenario-reconstruction-engines.js` if near the 250-cap); driver in
   `tools/verify-scenarios-reconstruct.js`.
4. **Run + interpret:** `node tools/verify-scenarios-reconstruct.js`. Any **present**-file FAIL on
   Engine B is a real sidecar gap = the concrete "more to plan/build/implement" answer.

## Key Files
- `~/.claude/plans/plan-for-checking-if-cached-gadget.md` — THE PLAN (Part A + Part B, full TDD order).
- `run-all-scenarios.py` (repo root) — Part-A target; fires `/run-scenario` via tmux, polls for
  `"completed": true`. Result files carry `tmpdir:` + `result:{…jsonl_path…}`.
- `copy-scenario-outputs.py` (repo root) — its `copyTmpdirOutputs` (lines 31-71) is folded into Part A,
  then archived.
- `tests/verify-unified-scenarios.js` — the WORKING Engine-A A/B gate (29/0/4). **Do NOT modify** —
  reuse its pattern as the Engine-A template; it passes `path.join(tmpdir, relPath)` (full path).
- `api/unified-reconstruct.js` — Engine A; `reconstructFromJSONLTexts([{text,path}], absoluteTargetPath)`
  → `{content, patches}`. Full-path matching + internal `resolveSymlinksToRealPath`; NO delete model.
- `api/track-line-states.js` + `tools/track-line-states.js:37-44,104-140` — Engine B driver template;
  `api/promote-per-line-status.verdictIsPerLinePerfect` is the per-line success test.
- `api/file-historical-lineage.js` (`gatherAllOps`), `api/transcript-parsers.js`
  (`extractSessionMetadata` → `{gitBranch,cwd,sessionId}`), `api/alias-windows.js`,
  `api/transcript-discovery.js` — reused by Part B helpers.
- `plans/scenarios/executed/<stem>/` — per-scenario dirs (ground-truth files + `tests/`); top-level
  `<stem>-run-*.txt` result files carry `tmpdir`/`jsonl_path`. ~30 scenarios (s1–s23, m1–m7).
- `plans/handoff-develop-20260617-2353.md` — the Engine-A full-path migration handoff (REQUIRED reading;
  it changed Engine A from basename to full-path).

## Plan File
`~/.claude/plans/plan-for-checking-if-cached-gadget.md` (authored this session; not yet executed).

## Context the Next Agent Won't Have
- **User decisions made during planning (do not re-litigate):**
  (1) Verify with **BOTH engines cross-checked** (unified-reconstruct byte-match AND per-line sidecar
  verdict), not one. (2) Scope is a **verification script run AFTER the user regenerates data** — the
  user runs `run-all-scenarios.py` manually. (3) `run-all-scenarios.py` MUST absorb
  `copy-scenario-outputs.py` **and** copy the JSONL into `executed/<stem>/` so each subfolder is
  self-contained (this is why Part A exists). (4) Plan files follow `~/.claude/guides/planning.md`:
  HOW/in-what-order, minimal ambiguity, TDD-structured.
- **Engine A was migrated basename→full-path (handoff 2353).** Both engines now take the **same
  absolute target path**; the plan's earlier "basename" framing was scrubbed. Engine A canonicalizes
  `/var`↔`/private/var` internally; Engine B has no such canonicalizer, so Part B derives the target
  from the JSONL's OWN `cwd` (`extractSessionMetadata`) for provenance parity — confirm `/var` vs
  `/private/var` in the RED test for behavior 6.
- **Delete/move scenarios are the expected divergence point:** Engine A has NO deletion semantics
  (keeps last content), Engine B models absence (`fileAbsent`/`bashRm`, items 1–2). So an absent-file
  Engine-A FAIL is a DOCUMENTED gap (excluded from `countUnexpectedFailures`), NOT a regression.
- **The 4 SKIPPED in verify-unified-scenarios.js** are the no-`.py`-output scenarios
  (delete / bash-redirect-`.txt` / no-post-edit) — exactly the absence/non-`.py` cases Part B must
  assert instead of skip.
- **Engine B's absent-file PASS must NOT use `verdictIsPerLinePerfect`** — an empty reference passes it
  vacuously. Use `sidecarConcludesAbsent` (final timeline entry is a beacon with a `fileAbsent` event).
- **Ground-truth vs scaffolding:** each `executed/<stem>/` mixes scenario output with harness files;
  denylist when collecting present ground-truth: `jsonl_path.txt`, `ready`, `done`, `.DS_Store`,
  `settings.json`, `hooks.json`, `block-compound.sh`, `conftest.py` (top-level + `tests/`), `*.jsonl`,
  `*-run-*.txt`.
- **Hooks:** a 250-line-per-file write cap (blocks the write — split into a named sibling, never grow
  an at-cap file) and an auto-run of the matching `test-<basename>.js` after edits. There is NO npm
  test script — run tests with `node tests/<file>.js`. Coding standards: 4-space indent, verb-first
  function names, one condition per `if` (no `&&`/`||`).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng` (Node directly — no npm test script):
1. `python3 -m pytest tests/test_run_all_scenarios.py` — Part-A copy helpers green.
2. `node tests/test-scenario-reconstruction-check.js` — Part-B behavioral tests green.
3. `node tests/verify-unified-scenarios.js` — must STILL be `29 MATCH / 0 MISMATCH / 4 SKIPPED`
   (proves Part B did not perturb the existing Engine-A gate).
4. `for f in tests/test-*.js; do node "$f"; done` — expect ≥707 passed / 0 failed (plus the new suite).
5. After the user regenerates data (`python3 run-all-scenarios.py <tmux-pane>`):
   `node tools/verify-scenarios-reconstruct.js` — per-file `unifiedPass / sidecarPass / agree` table +
   summary + disagreements. Clean-edit scenarios PASS both; delete/move show Engine A FAIL / Engine B
   PASS on the absent file (documented). A present-file Engine-B FAIL = real sidecar gap to plan next.
