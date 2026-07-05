# Handoff: Item 7 (timestampless dropped-count) SURVEYED → DEFERRED; item 8 is next
Conversation name: defer item 7 — timestampless-record survey (floofy-cake plan)
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree (`api/`,
`tools/`, `tests/`, `plans/`, …) is **UNTRACKED** by design (`git status` → `??`); only
`.gitignore` is tracked (shows `M`, +6 lines — pre-existing, unrelated). Review changes with
`git diff develop-baseline -- <path>`. The committed source tree lives on **`develop-baseline`**
(tip `880b69d`, the Item-5.6 re-baseline). No code changed this session — `develop-baseline` is
UNCHANGED. If `git status` ever shows files staged (`A`) instead of untracked (`??`), that's a
stray IDE/index artifact — `git reset`.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, driving toward 100% reconstruction (roadmap:
`plans/roadmap-100-percent-reconstruction.md`, 17 items). Items 1–6 are closed; **item 7 was just
surveyed and DEFERRED this session** (evidence below). **Item 8** (MultiEdit-style records) is next.

## Current State
**Item 7 SURVEYED → DEFERRED this session (documentation-only; no production code touched).**
The proposed "count of records silently dropped for missing timestamps" guards an empty premise:
the timestampless records carry no file-content evidence, so the drop sites are eligibility
FILTERS, not silent CAPS. Survey of the frozen fixture (`probe-fixture-20260615`, 786 transcripts
/ 194,425 records): **39,090 (20.1%) are timestampless and 100% are non-evidence** — 34,457
session/UI metadata (`last-prompt`/`permission-mode`/`custom-title`/`agent-name`/`bridge-session`/
`ai-title`/`mode`) + 4,633 `file-history-snapshot` (time nested at `.snapshot.timestamp`, 0 missing
it, already consumed). **Content records carry a timestamp 100% of the time** (assistant 46,117
incl. 27,631 `tool_use`; user 32,615 incl. 27,553 `tool_result`; 0 missing). The 10 emission
`if (!iso) return null` sites fire 0 times on content.

All four standing gates remain GREEN **by construction** (no code changed; re-run if you doubt it):
- Full suite **58 suites / 586 passed / 0 failed**.
- detect-rewinds **15 / 0**.
- Sidecar e2e `plate_summary.py` **247/247 matchedObserved, 0 mismatched, conflicts 233**.
- Probe A/B vs `develop-baseline` **`identical: true`**.

Work delivered this session (UNTRACKED on `develop`, under `plans/` only):
- NEW `plans/implementation-notes-item7-timestampless-survey.md` — full survey, the cap-vs-filter
  argument, per-type table, the carry-forward verdict, and the reopen trigger.
- EDITED `plans/roadmap-100-percent-reconstruction.md` — item 7 flipped `[ ]`→`[x]` with a
  `✅ SURVEYED — DEFERRED 2026-06-17` block (mirrors item 6's "SURVEYED — NOT VIABLE" style).

## What Remains
Ordered by execution sequence.

1. **Item 8 — MultiEdit-style records** (`toolUseResult.edits` array). FIRST verify any exist in
   the recovery set — grep the frozen fixture / recovery JSONLs for an `edits` array under
   `toolUseResult` (read-only `ctx_execute` scan, like the item-7 survey). If none exist, record
   NOT-VIABLE like item 6 (survey note + roadmap block). Otherwise handle in
   `api/edit-stream-extraction.js:extractEditsFromJSONL` (198 L — room). Strict red-green TDD.
2. **Items 9–17** per `plans/roadmap-100-percent-reconstruction.md` §B/§C/§D: replaceAll-across-runs
   (9), time-aware alias windows + precise-cp seeding (10/10a), floatingOverKnownRegion conflict
   record (11), conflict-cascade collapse (12), git rung on the reference ladder (13), trailing-
   extent mismatch (14), per-line→probe verdict promotion (15, **name the new status with the user
   first**), sidecar over list2 (16, needs the git rung), read-scanner unification (17 — the home
   to fold `bash-read-touches.js` + `grep-tool-results.js` discovery together).

## Key Files
- `plans/roadmap-100-percent-reconstruction.md` — the 17-item roadmap; **items 1–7 are `[x]`/closed,
  item 8 `[ ]` is next**. Constraints section: File-path handling, 250-line cap, one-condition-per-
  `if`, probe gate.
- `plans/implementation-notes-item7-timestampless-survey.md` — this session's deferral evidence +
  reopen trigger + carry-forward design constraints (read before reopening item 7).
- `plans/implementation-notes-item6-context-mode-survey.md` — the NOT-VIABLE template for item 8's
  "verify-existence-first" survey.
- `plans/handoff-develop-20260617-0115.md` — the prior handoff; its §How to Verify is copied
  verbatim into How to Verify below, and its gotchas still hold.
- `api/edit-stream-extraction.js` (198 L) — `extractEditsFromJSONL`, the item-8 target.
- `api/file-events-extractors.js` (239 L) — the emission CHOKE POINT (`extractFileEventsFromText`)
  where all per-kind extractors concatenate; **TIGHT at 239/250** — any growth needs a sibling split.
- `tools/track-line-states.js` (117 L) — the tracker CLI; builds `events` then `trackLineStates`,
  writes/prints the verdict. Where any future tracker-only diagnostic would surface.

## Plan File
`/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-floofy-cake.md`
(this session's "defer item 7 with evidence" plan — now executed). Item 8 has no plan yet; it
needs its own verify-existence-first survey pass (mirror item 6).

## Context the Next Agent Won't Have
- **Item 7's drop is a FILTER, not a CAP** — this is the whole reason it was deferred. A naive
  "records without a top-level `timestamp`" counter reports a misleading **20%** (88% session
  metadata, 12% snapshots whose time is nested and already used). The honest scoped counter reads a
  constant **0**. Do NOT implement item 7 as a raw record scan if it ever reopens.
- **`file-history-snapshot` records are NOT timestampless** in the meaningful sense — their time is
  at `.snapshot.timestamp` (top-level `.timestamp` is absent), and `api/snapshot-events.js:25`
  already reads the nested field. Any timestamp tooling must check nested fields, not just top-level.
- **The probe NEVER calls the emission pipeline** — `tools/probe-projects-v2.js` runs only
  `extractEditsFromJSONL` + `replayEdits` + `collectTouches`. So emission-only changes (the 10 drop
  sites, all of items 1–5's event kinds) are provably probe-safe; ONLY TOUCH/discovery changes move
  probe output and force a re-baseline. This determined item 7's "tracker-only, no re-baseline" framing.
- **Carry-forward timestamp inference** (use the nearest preceding line's timestamp) is the recovery
  tool to reach for IF item 7 reopens — but it must be **Tier-2 overlay only (never a beacon)** and
  its time treated as a **window, not a point** (a point-estimate mis-orders against beacons and
  corrupts conflict windows). It is a separate correctness-bearing item, not item 7's "count" mandate.
- **250-line cap is enforced by a post-write hook on the WHOLE edited file** (test files included).
  It also re-flags PRE-EXISTING deep nesting (>3 indent units / multi-line object literals at indent
  ≥8) in any file you touch — budget for collapsing unrelated builders to single-line form. This is
  why new collectors go in NEW files and why test files get split.
- **Re-baseline mechanism (temp-index MIRROR)** — only if a discovery change moves the probe. Build
  via a temp index so `develop`'s all-untracked state is never touched:
  ```
  OLD=$(git rev-parse develop-baseline)            # rollback ref (currently 880b69d)
  export GIT_INDEX_FILE=/tmp/bl-idx
  git read-tree --empty
  git add -- api common tools tests diff jfred unified viewer web-shared \
    copy-scenario-outputs.py jsonl-tree-viewer.ts run-all-scenarios.py LICENSE README.md .gitignore
  TREE=$(git write-tree); unset GIT_INDEX_FILE
  COMMIT=$(git commit-tree "$TREE" -p develop-baseline -m "Re-baseline (item N): …")
  git update-ref refs/heads/develop-baseline "$COMMIT"; rm -f /tmp/bl-idx
  ```
  EXCLUDE: `plans/`, `.claude/`, the `projects` + `test-transcript.jsonl` **symlinks** (point into
  live `~/.claude/projects` — NEVER commit), root `probe-results.json` + `.copy-seen.txt`. Always
  surface the divergence and get user sign-off before re-baselining.
- **Probe gotchas:** the A/B writes via `path.join(__dirname,…)` so each tree writes its OWN
  `tools/probe-results-v2.json` — compare with a `node` fs-walk stripping `generatedAt` (recursive
  `grep`/`diff` give FALSE negatives from status-line injectors). NEVER run the probe against live
  claude-data — use the FROZEN fixture `~/Programming/jot-recovery/probe-fixture-20260615/projects`
  ONLY. Process big JSONs in a sandbox (`ctx_execute`), not by reading them into context.
- **Test runner:** `node tests/test-*.js` (custom `h.run`/`h.summary`; exits 1 on failure).
  NODE_OPTIONS injects a VS Code debugger bootloader printing "Debugger listening…" on stderr —
  filter with `2>/dev/null | grep -E "passed,|FAIL:"`. A Stop hook re-runs tests after edits and
  BLOCKS on red — expected during the RED phase of TDD; push through to GREEN.

## How to Verify
This session changed no code, so the gates pass by construction. Run from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng` to confirm:
```bash
# 1. Full suite (expect 58 suites / 586 passed / 0 failed):
for fkt in tests/test-*.js; do case "$fkt" in tests/test-helpers.js|*output-data.js) continue;; esac; \
  node "$fkt" 2>/dev/null; done | grep -E "passed,|FAIL:" \
  | awk '/FAIL:/{print;next} /passed,/{p+=$1;f+=$3;s++} END{print "TOTAL: "s" suites, "p" passed, "f" failed"}'

# 2. detect-rewinds (expect 15 passed / 0 failed):
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# 3. Probe A/B vs develop-baseline on the FROZEN fixture (expect "identical: true"):
git worktree remove --force /tmp/reveng-baseline 2>/dev/null; rm -rf /tmp/reveng-baseline
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline >/dev/null 2>&1
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# 4. Sidecar e2e (plate_summary.py) — expect perLineStats 247/247, 0 mismatched, conflicts=233:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null

# 5. Item-7 survey reproducibility (read-only): re-scan the fixture for top-level-timestampless
#    records grouped by type; expect 786 transcripts / 194,425 records / 39,090 timestampless,
#    all metadata + nested-time snapshots, 0 content (assistant/user) records.
```
