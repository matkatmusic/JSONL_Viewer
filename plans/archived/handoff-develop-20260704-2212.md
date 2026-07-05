# Handoff: jfred-claude-scenarios submodule migration complete, staged not committed
Conversation name: jiggly-petal
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/bcca5ea3-c7fe-4c53-b96a-ba14139b2091.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/i-have-created-users-matkatmusicllc-prog-jiggly-petal.md

## Branch
`develop` based on `main`

## Goal
Extract the 85 scenario `.txt` files + `scenario-generator/` from `RevEng/plans/scenarios/` into the standalone repo `jfred-claude-scenarios` (github.com/matkatmusic/jfred-claude-scenarios), then reference it as a git submodule at `RevEng/scenarios/`. All path references updated so tests and scripts resolve through the submodule.

## Current State
- Submodule added at `scenarios/` tracking `develop` branch of jfred-claude-scenarios
- 4 files updated with new paths: `run-all-scenarios.py`, `tests/fixtures.ts`, `tests/viewer-viewmodels.test.ts`, `.vscode/launch.json`
- `scenarios/executed/` copied into submodule checkout (gitignored in the submodule repo)
- Old `plans/scenarios/` directory deleted
- **420 tests passing** (`npm test`)
- Changes are **staged but NOT committed**. The staged files are: `.gitmodules`, `scenarios` (submodule pointer), `run-all-scenarios.py`, `tests/fixtures.ts`, `tests/viewer-viewmodels.test.ts`, `.vscode/launch.json`
- Additional unstaged changes exist from prior work (8 files, 104 insertions): `package.json`, `package-lock.json`, `src/reconstruction_reseed.ts`, `src/structures/vocabulary.ts`, `tests/vocabulary.test.ts`, `webapp/views/conversation.js`, `webapp/views/projects.js`, `engine-pipeline-diagrams.html`

## What Remains
1. Commit the staged submodule migration (user to decide commit message and whether to include other unstaged work)
2. Optionally remove the stale worktree at `~/Programming/RevEng-worktrees/api-from-scenarios/` — `git worktree remove api-from-scenarios` (branch is merged)
3. Verify `scripts/check_scenario_coverage.ts` still runs (uses `../scenarios/executed/` which should resolve, but wasn't explicitly tested this session)

## Key Files
- `RevEng/.gitmodules` — submodule declarations (tmux_lib + scenarios)
- `RevEng/scenarios/` — submodule checkout (jfred-claude-scenarios, develop branch)
- `RevEng/run-all-scenarios.py:23` — `SCENARIOS_DIR` now points to `Path(__file__).parent / "scenarios"`
- `RevEng/tests/fixtures.ts:18` — `SCENARIO_ROOTS` array, second entry updated to `RevEng/scenarios/executed`
- `RevEng/tests/viewer-viewmodels.test.ts:21` — `S19_STEP_STATES_DIR` updated to `scenarios/executed/...`
- `RevEng/.vscode/launch.json:22` — viewer server `--projects-dir` arg updated

## Context the Next Agent Won't Have
- The jfred-claude-scenarios repo has both `master` and `develop` branches. The scenarios were pushed to `develop` (not master). The submodule tracks `develop`.
- `executed/` contains large JSONL transcripts and `.step_states/` ground-truth snapshots from scenario runs. It's gitignored in the submodule repo but must exist locally for tests to pass. It was physically copied (not symlinked) from the old `plans/scenarios/executed/`.
- The old root-level `scenarios` symlink (→ `plans/scenarios`) was removed before adding the submodule. Scripts in `scripts/` use `new URL("../scenarios/executed/", import.meta.url)` which resolves correctly because the submodule sits at the same root-level `scenarios/` path.
- `tests/fixtures.ts` has a SCENARIO_ROOTS array with two absolute paths; the first (`RevEng-worktrees/api-from-scenarios/scenarios/executed`) is stale (worktree merged) but harmless — `resolveScenarioDir` falls through to the second entry.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
npm test                    # 420 tests, 0 failures
python3 run-all-scenarios.py --help   # verifies import + path resolution
npx tsx scripts/check_scenario_coverage.ts  # verifies script path resolution
```
