# Handoff: tool-suite api/ migration COMPLETE — resume the 100%-reconstruction roadmap against the new api/ layer

## Branch
`develop` based on `master`. The source tree is committed ONLY on the
`develop-baseline` branch (tip `9968536`, built with git plumbing at phase 0 so
HEAD never moved). On `develop`, all sources (`api/`, `tools/`, `tests/`, `jfred/`,
`unified/`, `diff/`, `viewer/`, `web-shared/`, `common/` (archive-only now),
`plans/`, etc.) are present but **UNTRACKED** — `git status` shows them as `??`.
That is EXPECTED. Review any change with `git diff develop-baseline -- <path>`.
(Only `.gitignore` is tracked/modified; `git log` shows the single `1a9f098`.)

## Goal
The 8-phase tool-suite restructuring into a base `api/` layer (one canonical home
per capability, with thin `tools/` CLIs and `web-shared/` browser UI that only call
the api) is **DONE**. This handoff RESUMES the work the migration interrupted: the
**100%-reconstruction roadmap** in `plans/handoff-develop-20260611-1727.md` —
closing the evidence/event-coverage gaps so the replay engine reconstructs real
JSONL-recorded files perfectly. The migration was an interlude; the roadmap is
untouched and is the next work — but every file it names has MOVED to `api/`.

## Current State
**Migration: COMPLETE — all 8 phases `[x]` in `plans/tool-suite-migration-plan.md`.**
Gates at completion (the starting point for the resumed work; all GREEN):
- Full suite: **35 suites / 437 passed / 0 failed** (this is the NEW baseline; the
  pre-migration roadmap quotes 385 / 30 suites — stale).
- detect-rewinds: **15/15**.
- Sidecar e2e: **247/247 matchedObserved, 0 mismatched, 0 neverObserved, 233
  conflicts in ONE cluster @ 2026-05-17T02:02:43.192Z**.
- Viewers (Playwright headless, chromium-1217): all 4 (jfred/unified/diff/viewer)
  PASS, zero page/console errors.
- Probe e2e (frozen fixture): list1 315 286/29/0, list2 435 268/103/64 — and
  `develop-baseline` === working tree produce BYTE-IDENTICAL probe-results-v2.json,
  proving the whole migration is behavior-preserving.

**Structure now:** `common/` is fully emptied of source (only `common/archive/`
remains). `api/` holds 26 modules (the canonical homes). `tools/` holds thin CLIs +
the probe orchestration (`probe-projects-v2.js` + `probe-v2-assembly.js` +
`probe-v2-report.js` + the new `probe-v2-shared.js`). `web-shared/` holds the
browser UI (`jfred-*.js`, `json-inspector.js`).

## What Remains
The roadmap in `plans/handoff-develop-20260611-1727.md` (16 items + §D item 17 = 17
total), re-pointed to `api/`. Read that file for each item's full detail; the
re-homing map is in **§ Key Files** below. Ordered by the roadmap's own payoff order:

**§A — Event-extraction coverage gaps (evidence the pipeline never reads):**
1. `toolUseResult.originalFile` on Edit records is a whole-file observation (Tier 2)
   that the sidecar drops — emit it as an event so the tracker gains a near-beacon at
   every edit. (Capture lives in `api/edit-stream-extraction.js`/`api/edit-replay.js`;
   event emission in `api/file-events-extractors.js`.)
2. Bash file ops as event kinds: `rm` (absence), `>` redirect (truncate-write; inline
   content for echo/printf/heredoc), `>>` (append), `cp` (dst = src's believed
   content). Reuse `api/extract-bash-file-ops.js`. Likely the only path for
   zero-content-event files (launch.json class).
3. `structuredPatch` context (' ') lines are unread neighbor observations
   (`findStructuredPatchLine` plumbing already in `api/line-state-evidence.js`).
4. Partial bash reads: `head`/`tail`/`sed -n A,Bp`/`grep -n` (line-addressed),
   `wc -l` (extent only).
5. Native Grep tool results (mode: content, -n) — `file:line:text` rows.
6. MCP-tool file reads in subagent transcripts (hard; survey first).
7. Records without timestamps are silently dropped — emit a dropped-count
   (no-silent-caps).
8. MultiEdit-style records (`toolUseResult.edits` array) — verify any exist, then
   handle in `extractEditsFromJSONL`.

**§B — Tracker gaps (9–13):** replaceAll splice across ALL runs / float on gap
(`api/edit-splice.js`); time-aware alias windows for mid-timeline renames;
`floatingOverKnownRegion` conflict record; collapse conflict cascades into
"insertion of K lines at L"; **add the git rung** to the track-line-states reference
ladder (on-disk → snapshot → git) using `api/git-file-state.js` resolveGitContent
(needed for list2's NOT_FOUND).

**§C — Residual + promotion (14–16):** resolve the trailing-extent (final blank
line) mismatch class — decide real vs. newline artifact, fix the extractor if
artifact; **promote the per-line verdict into probe verdict logic** (proposal: new
`PASS-PER-LINE` status when final belief matches per-line — discuss naming with the
user before merging); run the sidecar over list2 (needs the git rung).

**§D — Consolidation (17, deferred from the migration):** unify the two read-event
scanners — `extractReadEdits` (whole-content, in `api/file-event-observations.js`)
and `extractReadEvents` (per-chunk offset/limit metadata, in
`api/split-read-assembly.js`) — into one scanner that derives both shapes. (The
migration's phase-4 note revised this from "duplicate" to "two representations,
unify post-restructuring" — that condition is now met.)

## Key Files
**Path-translation map — the roadmap names `common/*`/`tools/extract-file-events.js`;
those moved. Current homes:**
- `api/file-events-extractors.js` (294L) ← was `tools/extract-file-events.js`. Where
  new event kinds get added (items 1, 2, 4, 5, 7, 8). Shape: exactly one non-null
  kind sub-object per event.
- `api/file-event-observations.js` (278L) ← the 4 extractors from
  `common/extract-file-state.js` (stripCatLineNumbers / extractBashCatEdits /
  extractReadEdits / extractSnapshotEdits). `extractReadEdits` is item 17's partner.
- `api/split-read-assembly.js` — `extractReadEvents` + `assembleSplitReads` (item 17).
- `api/line-state-evidence.js` (**299L — at cap**), `api/line-belief.js`,
  `api/edit-splice.js`, `api/final-line-verdict.js` — sidecar internals (items 3, 9, 11).
- `api/track-line-states.js` (tracker lib) + `tools/track-line-states.js` (CLI) —
  reference ladder / git rung lives in the CLI (item 13).
- `api/extract-bash-file-ops.js` ← was `common/` — bash-op parser to reuse (item 2).
- `api/git-file-state.js` — `resolveGitContent` for the git rung (item 13).
- `api/edit-stream-extraction.js` + `api/edit-replay.js` — replay; `originalFile`
  capture (item 1).
- `api/snapshot-store-io.js`, `api/reconstruction-reference-sources.js` — snapshot IO
  + `findLastSnapshot*` (the old `extract-file-state.js` reference half).
- `tools/probe-projects-v2.js` + `tools/probe-v2-shared.js` — probe; targets are
  `probe-results-v2.json` `filesInProject[].status==='MISMATCH'` and `filesNotInProject`
  (item 16).
- `plans/handoff-develop-20260611-1727.md` — **THE roadmap being resumed** (read its
  own "Context the Next Agent Won't Have" — it still applies).
- `plans/per-line-state-sidecar-plan.md` (+ its implementation-notes) — the
  implemented sidecar spec; schema comments are authoritative.
- `plans/tool-suite-api-spec.md` + `plans/implementation-notes-tool-suite-migration-plan.md`
  — the authoritative "which old function lives in which api/ module now" map.

## Plan File
`plans/handoff-develop-20260611-1727.md` (the 17-item roadmap = the resuming plan),
grounded by `plans/per-line-state-sidecar-plan.md` (implemented sidecar spec). The
just-completed restructuring is `plans/tool-suite-migration-plan.md` (all phases
`[x]`) with the full log in `plans/implementation-notes-tool-suite-migration-plan.md`.

## Context the Next Agent Won't Have
- **The roadmap is PRE-MIGRATION; its file paths and baselines are STALE.** Every
  `common/*` it names is now in `api/` (see the map above); `tools/extract-file-events.js`
  is archived (→ `api/file-events-extractors.js`). Its quoted baselines (385 passed /
  30 suites; list1 406/9, list2 364/103/68) are superseded by 437 / 35 suites and the
  frozen-fixture probe numbers. Use `plans/tool-suite-api-spec.md` + the migration
  implementation-notes to translate before touching anything.
- **The lint hook now enforces a 250-LINE limit and BLOCKS the write** — stricter than
  the plan's documented 300-line cap. Several roadmap-target files are already in the
  250–300 band (pre-existing, accepted): `api/line-state-evidence.js` 299,
  `api/replay-verification.js` 300, `api/file-events-extractors.js` 294,
  `tools/probe-projects-v2.js` 289. Adding event-kind materializations (items 1–3) to
  these WILL trip the hook — **plan to SPLIT into a new sibling api module, do not
  grow the file** (the migration did this repeatedly, e.g. `api/snapshot-store-io.js`,
  `api/split-read-assembly.js`).
- **The probe gate is A/B BEHAVIOR-EQUIVALENCE, not literal numbers.** The frozen
  fixture (`~/Programming/jot-recovery/probe-fixture-20260615/`) freezes transcripts +
  snapshots but NOT the live repos that list1 verifies against — so list1 numbers
  drift over time (it drifted 287/28→286/29 this session, on `develop-baseline` and
  the working tree identically); list2 (snapshot/git-verified) is stable. The gate is:
  run `develop-baseline` and the working tree against the fixture and confirm
  BYTE-IDENTICAL `probe-results-v2.json` (ignoring the top-level `generatedAt`). Do
  NOT run the probe against live claude-data (it self-contaminates). To A/B, make a
  worktree: `git worktree add /tmp/reveng-baseline develop-baseline`.
- **Archiving = preserve, not delete (user correction this session).** Move the real
  file body to an `archive/` subfolder (`cp`, or `git show develop-baseline:<path> >`
  if already gone — the Write tool can't, the 250-line hook rejects big files). Archive
  obsolete TEST files to `tests/archive/` too; only move genuinely-retired-function
  tests there (reusable tests move to the new module's suite). The full-suite glob
  `tests/test-*.js` is non-recursive, so `tests/archive/` doesn't run.
- **No forwarding layers:** functions live in ONE api/ home; callers import it
  directly. Never re-export/delegate (Phase 8 removed the last 7 such re-exports).
- **Vocabulary (enforced):** never "corpus" (say "all JSONL files in the projects
  folder"); "create", never "mint". Schemas are annotated JS literals with intent
  comments and NO example values; the non-null sub-object IS the kind (no kind
  strings, no placeholder fields).
- **Coding (lint hook every edit):** strict red-green TDD (watch it fail first); ONE
  condition per `if` (nest; never `&&`/`||`; ternaries only for value selection);
  >3-deep nesting rejected. The hook runs `tests/test-<basename>.js` — name suites to
  match the module; trust a direct `node tests/<suite>.js` over a lagging hook message.
- **The roadmap's own gotchas STILL APPLY — read its "Context" section:** suffix-match
  strictness (alias path must be STRICTLY LONGER than '/'+key — use `/work/repo/t.py`,
  never `/repo/t.py`); snapshot record facts (`isSnapshotUpdate` is top-level; beacon
  time is `snapshot.timestamp`, not a top-level timestamp); readFull vs readChunk
  (≥2000-line reads are readChunk); 'presumed' degradation keys off
  `confirmedAtMs === instant`; conflicts come from OBSERVATIONS only (write/fileAbsent
  REPLACE belief — a new `rm`/`redirect` kind is authored → replace, not conflict);
  rejected approaches not to re-litigate (text in per-line entries, kind discriminant
  strings, example values in schemas).
- **Open / carried-forward (non-blocking):** the `editsForFile` contract (= write +
  edit kinds) is still user-unconfirmed (no dependency yet); `viewer/viewer-diff.js`'s
  F2 LCS dedup vs `api/line-diff.js` is DEFERRED (its lineDiff diverged: 2500-line cap
  + showToast + a `<span class="diff-text">` wrapper) — a separate later pass.
- **Env quirks:** `curl`/`wget` are blocked by a hook (use node fetch / Playwright);
  `node` has `--inspect` in NODE_OPTIONS so CLI runs print "Debugger listening…" to
  stderr (filter with `2>/dev/null`); the full-suite gate is a bash `case` one-liner
  that zsh rejects — run via `bash -c`.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. These confirm the
post-migration starting point is intact (all currently green):
```bash
# Full suite — expect 35 suites / 437 passed / 0 failed:
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'

# detect-rewinds — expect 15 passed, 0 failed:
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# Sidecar e2e — expect 247/247 matchedObserved, 0 mismatched, conflicts=233:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null

# Probe e2e — A/B against the FROZEN fixture (the real gate is byte-identity vs
# develop-baseline, NOT the literal list numbers). Expect list1 315 ~286-287/28-29/0,
# list2 435 268/103/64:
node tools/probe-projects-v2.js \
  --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects \
  --snapshots   ~/Programming/jot-recovery/probe-fixture-20260615/file-history 2>/dev/null | grep '^list'
```
