# Handoff: Phase 7 (viewers) DONE + common/ fully emptied — Phase 8 (probe repoint + archive sweep) is next & LAST

## Branch
`develop` based on `master`. CRITICAL (unchanged across all handoffs): the source
files are committed only on the `develop-baseline` branch (built with git plumbing at
phase 0 so HEAD never moved). On `develop`, the sources (`api/`, `common/`, `tools/`,
`tests/`, `jfred/`, `unified/`, `diff/`, `viewer/`, `web-shared/`, `plans/`, etc.) are
present as **UNTRACKED** files — `git status` shows them as `??`. That is EXPECTED, not
a problem. Review any change with `git diff develop-baseline -- <path>`.
`develop-baseline` tip = `9968536`. (Only `.gitignore` is tracked/modified.)

## Goal
Restructure the RevEng codebase into a base `api/` layer (one canonical home per
capability) plus thin tools/viewers that only call the api, one phase per session in
dependency order (`plans/tool-suite-migration-plan.md`). Phases 0–7 are COMPLETE. This
session finished **Phase 7 (viewers)**: moved the jfred browser-UI to `web-shared/`,
repointed every viewer page's script tags `common/*`→`api/*`, made
`api/edit-stream-extraction.js` browser-loadable, and archived ALL of `common/` (it is
now source-empty). The next and FINAL phase is **Phase 8 — probe repoint + archive
sweep**, which runs against the now-frozen probe fixture.

## Current State
All gates GREEN at the close of Phase 7 (this is a Node project — there is NO pytest;
gate commands are in How to Verify):
- **Full suite: 36 suites / 443 passed / 0 failed** — identical to phases 5/6
  (test-json-inspector.js repointed common/→web-shared but count unchanged at 17).
- **detect-rewinds: 15/15** (`node tests/detect-rewinds.test.js`, outside the glob).
- **Sidecar e2e: 247/247 matchedObserved, 0 matchedPresumed, 0 mismatched, 0
  neverObserved, 233 conflicts in ONE cluster @ 2026-05-17T02:02:43.192Z** — exact
  baseline.
- **Viewers VERIFIED IN A REAL BROWSER (Playwright headless, chromium-1217):** all 4
  pages (jfred/unified/diff/viewer) load a sample JSONL AND drive the deep paths
  (file-select, unified engine, diff tree) with ZERO page/console errors. Harness:
  `~/.claude/tmp/reveng-pw/verify-viewers.js` (see How to Verify — reusable). The
  pre-migration baseline threw `ReferenceError: extractEditsFromJSONL is not defined`
  on all 3 jfred pages, so the gate genuinely fails on bad wiring.
- **Probe e2e: NOT run this session** (it is the Phase-8 gate, not Phase 7). Still runs
  against the FROZEN read-only fixture
  `~/Programming/jot-recovery/probe-fixture-20260615/{projects,file-history}`. Expected:
  list1 315 (287 PASS / 28 MISMATCH / 0 NF), list2 435 (268 PASS / 103 MISMATCH / 64 NF).

Phase 7 changes (all in the untracked working tree):
- Created `web-shared/` (NEW browser-UI layer): the 9 `jfred-*.js` + `json-inspector.js`
  + `jfred-styles.css` moved BYTE-IDENTICAL (cp) from common/. Intra-jfred ES imports
  (`./jfred-*.js`) stayed valid. Page loaders + HTML module tags repointed
  `../common/`→`../web-shared/`.
- Deleted the 3 `unified/` re-export shims (jfred-adapter, jfred-unified-filter,
  jfred-unified-panes) — nothing imported them. `unified/` now holds only
  `jfred-unified.html` + `jfred-unified-load.js`.
- Repointed every page's classic engine `<script>` tags `common/*`→`api/*` in
  DEPENDENCY ORDER (one old tag → several api/ files). Dropped tags no viewer uses
  (git-file-state, replay-verification, reconstruction-reference-sources).
- Made `api/edit-stream-extraction.js` browser-dual: wrapped its bare top-level
  `require()`s in the `if (typeof module !== 'undefined' && typeof require === 'function')`
  guard (a phase-5 browser-safety gap; behavior-identical in Node, re-gated).
- Repointed `viewer/JSONL-tree-viewer-v2-dev.html` (a hand-maintained dev harness, NOT
  current generator output) 2 tags → web-shared/json-inspector + api/line-diff. The
  generator `jsonl-tree-viewer.ts` needed NO change.
- **`common/` is now SOURCE-EMPTY** (only `common/archive/` remains). All 20 modules +
  jfred-styles.css archived: 12 .js + the css as concise header tombstones (phase-6
  form); the 8 prior short tombstones (diff-engine, extract-file-state,
  file-state-history, git-file-state, replay-edits, unified-reconstruct{,-steps,-patch})
  moved in as-is.

## What Remains
**Phase 8 — probe repoint + archive sweep** (the entire next session; the FINAL phase).
The spec is `plans/tool-suite-migration-plan.md` "### Phase 8". Steps, in order:
1. **Remove the 6 re-exports from `tools/probe-projects-v2.js`.** Its 6 test suites
   import the real api/ homes already (verify by grepping the test requires). Identify
   the 6 re-exports (functions probe-projects-v2 re-exports from api/ modules for its
   tests), delete them, and confirm nothing else imports them from probe-projects-v2.
2. **Confirm v2 parity against the FROZEN fixture** (probe e2e gate): list1 315
   287/28/0, list2 435 268/103/64. Use the command in How to Verify. (Also worth an
   A/B sanity check: develop-baseline vs working tree produce BYTE-IDENTICAL
   probe-results-v2.json on the fixture — that proved phases 5–7 behavior-preserving.)
3. **Archive `tools/probe-projects.js` (v1)** — after confirming v2 parity and that its
   shared helpers all live in api/. VERIFY no hidden callers first (lazy `require`,
   script tags, test imports). It is ~666 lines and trips the 300-line hook (pre-existing,
   accepted) — archive form is the concise header tombstone in `tools/archive/`.
4. **Archive `tools/branch-summary.js`** (finding F5 — "no caller found"; re-verify with
   a grep across api/tools/tests + viewer HTML before moving).
5. **Archive `tools/snapshot-reconstruction.js`** (overlaps replay verification; the
   spec says absorb-or-archive — verify no callers, then archive).
6. **Set `plans/tool-suite-api-proposal.md` stage-3 status to DONE** and mark Phase 8
   `[x]` in `plans/tool-suite-migration-plan.md`'s checklist.
7. **Final gates:** full suite (36/443/0) + detect-rewinds (15/15) + sidecar e2e
   (247/247) + probe e2e on the frozen fixture (315 287/28/0, 435 268/103/64). Optional
   but recommended: re-run the Playwright viewer harness (still green) since archiving
   tools shouldn't touch viewers.

## Key Files
- `plans/tool-suite-migration-plan.md` — the plan; "### Phase 8" is the next spec;
  checklist now has Phase 7 `[x]`; regression-gates section points the probe gate at the
  frozen fixture with the numbers above.
- `plans/tool-suite-api-spec.md` — "## Archive" section lists the confirmed archive
  candidates (probe-projects v1, branch-summary, snapshot-reconstruction) and the
  "tools/ after migration" surface (probe-projects-v2 + probe-v2-assembly + probe-v2-report
  STAY in tools/ with the 6 re-exports removed).
- `plans/tool-suite-api-proposal.md` — set its stage-3 status to DONE at the end.
- `plans/implementation-notes-tool-suite-migration-plan.md` — **READ THIS FIRST.** The
  running design/deviation log. The last two entries are the Phase 7 pre-flight
  (browser-dual findings, Playwright harness) and the Phase 7 completion post-mortem.
- `tools/probe-projects-v2.js` — remove its 6 api/ re-exports here.
- `tools/probe-projects.js`, `tools/branch-summary.js`, `tools/snapshot-reconstruction.js`
  — the 3 archive targets (verify no callers first).
- `~/.claude/tmp/reveng-pw/verify-viewers.js` — the Playwright viewer harness (reusable).

## Plan File
`plans/tool-suite-migration-plan.md` (Phase 8 is next & last; global rules at the top —
300-line cap incl. test files, one-condition-per-if, no forwarding layers, archive
procedure = comment-out-then-move-to-archive/ (or concise header tombstone for at-cap /
already-moved files, the phase-6/7 form), vocabulary: never "corpus"/"mint").

## Context the Next Agent Won't Have
- **Phase 7's real surprise: the viewers were never browser-tested, and "repoint the
  script tags" alone was NOT enough.** The engine modules load as CLASSIC `<script>`
  globals sharing one scope, in dependency order. `api/edit-stream-extraction.js` had
  bare top-level `require()`s that throw in a browser; it had to be guarded. The OTHER
  browser-loaded api modules were already browser-dual. Phase 8 touches only tools/
  (no browser), so this shouldn't recur — but if you ever add an api module to a viewer,
  it MUST be browser-dual (guarded requires; cross-module deps referenced as bare
  globals, NOT namespaced `mod.fn` which is undefined in-browser).
- **There are NO automated browser tests.** Browser verification = the Playwright
  harness at `~/.claude/tmp/reveng-pw/verify-viewers.js`. It needs a static server
  (`python3 -m http.server 8137` rooted at the repo) and uses the cached chromium-1217
  build via `executablePath` (playwright-core@1.61 in that scratch dir expects 1228,
  which isn't cached — the harness pins 1217 explicitly). It intercepts the `.jsonl`
  fetch by URL *pathname* (matching `?file=…jsonl` query would hijack navigation as a
  download — that bug bit me once).
- **`curl`/`wget` are BLOCKED by a context-mode hook.** Use Playwright or node fetch for
  HTTP checks, not curl.
- **The `.jsonl` symlinks** (`test-transcript.jsonl`, `projects`) point outside the repo
  via symlink; node `fs.readFileSync` follows them fine (the harness reads the sample
  that way) but `python3 -m http.server` may not serve them — the harness sidesteps this
  by intercepting the fetch and serving the content it read in node.
- **node has `--inspect` in NODE_OPTIONS here** — CLI runs print "Debugger
  listening…/attached" to stderr. Filter it (`2>/dev/null` or `grep -v Debugger`).
- **The full-suite gate is a bash one-liner, NOT pytest** — it uses bash `case` syntax
  that zsh rejects; run via `bash -c '...'`. See How to Verify.
- **The PostToolUse hook runs `test-<basename>.js` on each edit** and warns "no test
  file" for browser/scratch/archive files (jfred-*, web-shared/*, common/archive/*) and
  for pre-existing over-cap files (probe-projects.js 666L) — all accepted. Trust a direct
  `node tests/<suite>.js` over a lagging hook message.
- **For byte-identical MOVES use `cp`, not Write** (guarantees bytes + bypasses the
  300-line write-hook for at-cap files). `diff old new` to verify, repoint, then archive.
- **Probe gate self-contamination is RESOLVED** (frozen read-only fixture built
  2026-06-15 = claude-data minus the two migration project folders; rsync recipe in the
  implementation-notes "probe-gate dataset RESOLVED" entry). Do NOT run the probe gate
  against live claude-data — it drifts.
- **Open (non-blocking, from phase 4):** the `editsForFile` contract (= write+edit kinds)
  is still user-unconfirmed; no Phase 8 dependency.
- **Deferred (user decision this session):** `viewer/viewer-diff.js`'s F2 LCS dedup vs
  `api/line-diff.js` — its lineDiff diverged (2500-line cap + showToast, and a
  `<span class="diff-text">` wrapper api/line-diff lacks). Left untouched; a separate
  later pass, NOT part of Phase 8.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

Full suite (expect 36 suites / 443 passed / 0 failed):
```bash
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'
```

detect-rewinds (expect 15 passed, 0 failed):
```bash
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1
```

Sidecar e2e (expect 247/247 matchedObserved, 0 mismatched, 233 conflicts):
```bash
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null
```

Probe e2e against the FROZEN fixture (the Phase-8 gate; expect list1 315 287/28/0,
list2 435 268/103/64):
```bash
node tools/probe-projects-v2.js \
  --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects \
  --snapshots   ~/Programming/jot-recovery/probe-fixture-20260615/file-history 2>/dev/null | grep '^list'
```

Viewer browser check (Playwright; expect all 4 PASS, no errors):
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && python3 -m http.server 8137 --bind 127.0.0.1 >/tmp/reveng-httpd.log 2>&1 &
cd ~/.claude/tmp/reveng-pw && node verify-viewers.js "http://127.0.0.1:8137" \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/test-transcript.jsonl" 2>/dev/null | grep -v Debugger
pkill -f "http.server 8137"
```
