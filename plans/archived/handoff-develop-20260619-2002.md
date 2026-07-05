# Handoff: fixed isMeta-compaction phantom-rewind bug (launch.json 0/0/0/11 → PASS); fixed require.main typo in 12 CLIs; regenerated engine-b-mismatches.md
Conversation name: Investigate launch.json 0/0/0/11 in engine-b report → isMeta rewind fix + require.main fix + report regen
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/0731d9ea-43f5-4393-84f5-7ab061fa8185.jsonl
Plan file: None — investigation + bugfix session (no plan file produced). Prior feature plan was `/Users/matkatmusicllc/.claude/plans/vectorized-launching-phoenix.md`.

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; ALL RevEng source is untracked/modified — nothing is committed). CWD for all work: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

## Goal
The engine-b mismatch report listed `/Users/matkatmusicllc/Desktop/claude code src/.claude/launch.json` as `0/0/0/11` (all 11 on-disk lines `neverObserved` — an empty reconstruction timeline). Find why a file whose create+edit are demonstrably in the corpus reconstructed to nothing, fix the root cause, and regenerate the report. A class-wide CLI bug (`require.runMain`) was found and fixed along the way.

## Current State
COMPLETE and verified.
- **Root cause:** the post-compaction continuation `"Continue from where you left off."` (JSONL line 3195, `isMeta:true`) was collected as a genuine user prompt by `isUserPrompt` (`api/transcript-parsers.js`). Its `parentUuid` points back across the compaction boundary, so `detectRewinds` invented a phantom `code-restoration` rewind (window parent 3034 → landing 3194; tell-tale empty `snapAfter.files:{}`). `doRewindReverts` is positional + file-agnostic, so that phantom window marked the `.claude/launch.json` create (record 3068) AND its edit (record 3151) `ignored` → empty timeline → all 11 lines `neverObserved`.
- **Fix:** added `if (obj.isMeta === true) { return false; }` guard in `isUserPrompt` (`api/transcript-parsers.js`). Verified the production path `analyzeJSONL` now marks records 3068 & 3151 `kept` (were `ignored`).
- **Test (RED→GREEN):** `test_isUserPrompt_falseForSystemInjectedMetaMessage` added to `tests/test-transcript-parsers.js` → suite `13 passed, 0 failed`.
- **No regression:** all 15 `detect-rewinds` scenarios still classify correctly (verified via API and via the now-working CLI); `test-rewind-classification.js` 14/14; full JS regression sweep green.
- **require.main fix:** `require.runMain === module` (never a valid Node API — left every CLI's `main` guard dead) corrected to `require.main === module` in all 12 tools: detect-rewinds, find-jsonls-for-file, turn-analyzer, replay-edits, diagnose-mismatch, find-jsonls-at-commit, reconstruct, probe-projects-v2, spike-item16-list2-notfound-yield, assemble-split-reads, spike-item6-context-mode-yield, unified-reconstruct. `tests/detect-rewinds.test.js` now passes **15/15** through the real CLI (was 0/15, silently emitting nothing).
- **Report regenerated:** ran `tools/probe-engine-b.js` (clean exit, 1281 identities) → `tools/format-engine-b-mismatches.js`. `plans/engine-b-mismatches.md` now **247 total (158 in-project, 89 not-in-project)**, down from 248/159/89. `.claude/launch.json` no longer appears (now PASS). Fresh `tools/probe-results-engine-b.json` written.

## What Remains
All OPTIONAL.
1. Regenerate the batch coverage report (the stale `/tmp/jot-reconstruction-coverage.md` 569-file PASS/FAIL/INDETERMINATE artifact, pre-fix). Command:
   `node --max-old-space-size=8192 tools/reconstruction-coverage-report.js --repo ~/Programming/jot --seed-commit 793e65241902f276caf5f5c28d539269e7d36d11 --projects-dir ~/Programming/jot-recovery/claude-data/projects --out /tmp/jot-reconstruction-coverage.md --format both`. The isMeta fix should move some post-compaction FAIL rows → PASS.
2. Optionally smoke-test the other 11 revived CLIs by invoking them directly (only `detect-rewinds.js` has a test that exercises its `main` path; the rest were only confirmed to load).
3. Commit the work if desired — nothing is committed. Create a branch off `develop` first; do NOT commit to `develop` per repo convention unless told.

## Key Files
- `api/transcript-parsers.js` — `isUserPrompt` now rejects `isMeta:true` records (THE fix, ~line 41).
- `tests/test-transcript-parsers.js` — `test_isUserPrompt_falseForSystemInjectedMetaMessage` pins it.
- `api/rewind-classification.js` — `detectRewinds` / `doRewindReverts` (line ~208) — the consumer; revert test is positional + file-agnostic.
- `api/file-events-extractors.js` / `api/edit-stream-extraction.js` — where edits are extracted and the `statusByLine[...] === 'ignored'` gate drops events (`buildAuthoredEvent`).
- `tools/detect-rewinds.js` + `tests/detect-rewinds.test.js` — CLI + the 15-scenario real-corpus test, now green.
- `tools/probe-engine-b.js`, `tools/format-engine-b-mismatches.js`, `tools/probe-results-engine-b.json`, `plans/engine-b-mismatches.md` — the report pipeline and its regenerated outputs.

## Context the Next Agent Won't Have
- **A WRONG fix was considered and rejected — do not revisit it.** First instinct was to make the rewind revert "file-aware" (gate `doRewindReverts` on `rewind.snapBefore.files` membership). It is a band-aid AND unimplementable at that layer: the `fileWrites` records the rewind classifier operates on carry only `{line, file(basename), type}` — NO full path — so the classifier literally cannot distinguish `.claude/launch.json` from `RevEng/.claude/launch.json` from `.vscode/launch.json` (all three exist in this transcript and share the basename `launch.json`). The correct lever is excluding `isMeta` prompts at detection, not patching the revert test.
- **Why `isMeta` is the right chokepoint:** `isMeta:true` messages (post-compaction continuations, caveats, summaries) are harness-injected, never genuine user prompts or turn boundaries. `isUserPrompt` is the single shared predicate feeding both `collectUserPrompts` (rewind detection) and `tools/turn-analyzer.js`, so both benefit. The phantom rewind's empty `snapAfter.files:{}` is the diagnostic signature of "no file restoration actually happened."
- **The `require.runMain` typo came from the 252-function rename pass.** It silently disabled every tool's CLI entrypoint: the tool ran, printed nothing, exited 0. `detect-rewinds.test.js` was red but UNNOTICED because the standard sweep globs `tests/test-*.js` and this file is named `detect-rewinds.test.js` (`.test.js` suffix) — it is excluded from the sweep. If you add tools, prefer the `test-<name>.js` naming so the sweep catches them.
- **Mismatch counts can only DECREASE from the isMeta fix** (it only keeps MORE writes; reconstruction can move toward PASS, never away). 248→247 net; the single in-project drop (159→158) is launch.json.
- **Env gotchas (still true):** exclude `tests/test-output-data.js` from sweeps; the Stop hook runs `tests/test-<basename>.js` after each edit and trips on intentional RED phases (expected); new files use 4-space indent, edits to existing 2-space files stay 2-space; `git status --short` floods with `.plate/captures/*`; node prints a `Debugger listening…` preamble on stderr (harmless — strip with `2>/dev/null`); `probe-engine-b.js` ~5min, run node with `--max-old-space-size=8192`.
- **Pre-existing lint warnings unrelated to this work:** the Stop hook flags deep nesting (lines 32-36) in `tools/diagnose-mismatch.js` and the 289-line size of `tools/probe-projects-v2.js`. Both predate this session (the hook re-checks whole files on any edit); left untouched on purpose.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
node tests/test-transcript-parsers.js        # 13 passed (incl. isMeta guard)
node tests/detect-rewinds.test.js            # 15 passed (real CLI; proves require.main fix + no rewind regression)
node tests/test-rewind-classification.js     # 14 passed
# Full JS regression (excludes test-output-data.js):
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" >/dev/null 2>&1 || echo "FAIL: $f"; done; echo "sweep done"
# Report reflects the fix:
head -1 plans/engine-b-mismatches.md                                                   # 247 total: 158 in-project, 89 not-in-project
grep -c "Desktop/claude code src/.claude/launch.json" plans/engine-b-mismatches.md     # 0 (launch.json now PASS)
# No dead CLI guards remain:
grep -rn "require.runMain" tools/ api/ | grep -v node_modules || echo "NONE"
```
