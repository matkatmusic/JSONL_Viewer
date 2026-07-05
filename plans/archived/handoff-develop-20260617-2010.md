# Handoff: Roadmap Item 17 (unify the two read-event scanners) — DONE; item 18 is next
Conversation name: implement RevEng item 17 — unify the two read-event scanners
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`, UNCHANGED this session. The working
tree is UNTRACKED by design (`git status --short` → ~19 `??` entries + a pre-existing unrelated
`M .gitignore`); this project commits nothing during normal work. The committed source mirror lives
on **`develop-baseline`**, **`a8947fc`** (item-15 re-baseline), **UNCHANGED this session — item 17 is
probe-byte-identical so NO re-baseline was needed.** Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd `…/Desktop/claude code src` is the
Claude Code TS source (PRODUCER of the JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the git repo.

## Goal
Item 17 (§D Consolidation) replaced the two independent Read scanners — which read each Read
`tool_use`/`tool_result` pair twice into incompatible shapes — with ONE canonical scan plus two
pure derivations, repointed all three production callers + the CLI directly (no forwarding), and
held scanner output byte-identical (the `appendReadTouches` repoint feeds probe-gated discovery).
**This is the LAST §D item.** With it done, §A items 1–8 + 18, §B 9–13 + 10a, and §C 14–16 are all
complete; only **item 18 (§A — first-class user-edit tracking via `userModified`)** remains open in
the roadmap.

## Current State
**Item 17 COMPLETE. All four standing gates GREEN.**
- NEW `api/read-event-scanner.js` (146 L): `scanReadEvents(lines, parsed)` → superset record per
  Read; `chunkEventToEditRecord` (legacy edit shape) + `chunkEventToReadEvent` (legacy chunk shape).
- Repointed (no forwarding): `appendFilteredReadEdits` (`api/edit-stream-extraction.js`),
  `appendReadTouches` (`api/file-historical-lineage.js`, DISCOVERY-critical), `readEventsForFile`
  (`api/file-events-extractors.js`, signature now `(jsonlPath, lines, parsed, aliasSet)`), and the
  CLI via `split-read-assembly.js`'s `extractReadEvents` (now a scanner-backed adapter).
- Retired: legacy `extractReadEdits`/`buildReadPending`/`confirmReadResult`/`isValidReadContent`
  from `file-event-observations.js`; legacy scan helpers from `split-read-assembly.js`. Bodies
  preserved in `archive/read-scanner-legacy-bodies.js`; retired tests in
  `tests/archive/test-file-event-observations-readedits.js` (non-recursive glob → won't run).
- **Gates:** full suite **69 suites / 690 passed / 0 failed** (was 67/679); detect-rewinds **15/15**;
  `plate_summary.py` **247/247 matchedObserved, 0 mismatched, conflicts=8** (UNCHANGED); **probe A/B
  `identical: true` vs `develop-baseline` a8947fc → NO re-baseline**. All touched files ≤250.
- Deliverables: `plans/implementation-notes-item17-unify-read-scanners.md`; roadmap item 17 flipped
  `[x]` with a full DONE summary (line ~653).

## What Remains
Item 17 needs nothing further. The next unit of work is **planning + implementing item 18** (the only
open roadmap item):
1. Read the item-18 block in `plans/roadmap-100-percent-reconstruction.md` (lines ~244–283) — it is
   already a detailed planning brief (Intent / Now / Gap / DORMANT-defensive / Semantics-UNCONFIRMED /
   Home-approach / Deps-gate).
2. Read `~/.claude/guides/planning.md` + `tdd.md` + `coding-standards.md` +
   `single-condition-branching.md` before authoring the plan.
3. Write the item-18 plan to `~/.claude/plans/` (per-item RevEng plans live there, NOT `RevEng/plans/`
   — same convention as items 13/14/16/17), then a companion handoff into `RevEng/plans/` via
   `/jot:handoff-prompt`.
4. Implement via strict red-green TDD; item 18 is **DORMANT defensive** (`userModified:true` occurs
   0× on all known data) → build with synthetic tests only; tracker-only → probe byte-identical, e2e
   conflicts=8 unchanged.

## Key Files
- `plans/roadmap-100-percent-reconstruction.md` — item 18 brief at lines ~244–283; item 17 DONE
  summary at ~653; § Constraints at ~687 (250-cap, red-green, single-condition, archive rules).
- `plans/implementation-notes-item17-unify-read-scanners.md` — full item-17 record (design decisions,
  the `isValidRead`-on-raw-string deviation, the extractReadEvents-adapter deviation, gate results).
- `api/read-event-scanner.js` — the canonical Read scan (item 17's deliverable; item 18 does NOT
  touch it).
- `api/edit-stream-extraction.js` (250 L) — `buildReplaceEdit` :50 DROPS `userModified` today; item 18
  surfaces it here (one field, mirror `originalFile`).
- `api/file-events-extractors.js` (250 L, AT cap) — `buildOriginalFileEvent` :121 is the template for
  item 18's `buildUserModifiedEvent`; emit it from `extractFileEventsFromText` :210.
- `tools/track-line-states.js` — the sidecar CLI driver; `api/apply-one-event.js` — tracker dispatch.
- `tests/test-helpers.js` — `makeEditLine` already sets `userModified:false`; item 18 will need a
  `userModified:true` variant.

## Plan File
Item 17's plan: `/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-wiggly-pixel.md`
(executed, complete). Item 18 has NO plan yet — authoring it is the next task.

## Context the Next Agent Won't Have
- **Item 17's `isValidRead` deviates from the plan ON PURPOSE.** It gates on the RAW tool_result
  string (`isValidStringRead`: non-string→false, else `isValidReadContent(item.content)`), NOT on
  `strippedContent` as the plan's record spec said. Required for byte-parity: a numbered file whose
  first line is `"1\tError…"` is VALID under legacy A (the raw string starts with a digit) but would
  flip to invalid if validity were tested after stripping. The Task-8 characterization golden enforces
  this. Do NOT "fix" it back to the literal plan text.
- **`split-read-assembly.js` kept the name `extractReadEvents`** as a 3-line scanner-backed adapter
  (the plan said delete it). This routes the CLI + `test-split-read-assembly.js` through the canonical
  scan with minimal churn while removing the duplicated scan helpers — it is a composition, not a
  parallel scanner.
- **Three repointed hosts sit at EXACTLY 250 lines** (`edit-stream-extraction.js`,
  `file-historical-lineage.js`, `file-events-extractors.js`). The 2-name scanner import + null-gated
  body cost a few lines; they were absorbed by trimming comments. Any future edit to these files must
  split into a sibling, not grow them.
- **This repo has a SINGLE commit and an all-untracked tree** — deleting code loses it permanently
  (no git history to recover from). That is why item 17 preserved removed bodies in `archive/`. Apply
  the same rule for item 18.
- **The empirical A↔B divergence is real and measured** (over the frozen 786-transcript fixture): A
  captures 6336, B 6076; 260 A-only (unnumbered reads), 0 B-only, 128 shared with differing content
  (44 box-format, 84 trailing-`<system-reminder>`). The superset record + per-derivation drop rules
  are what reproduce both — relevant if any future read-scanner change is considered.
- **Item 18 is DORMANT** (`userModified:true` occurs 0× across 6,065 records) and its SEMANTICS are
  UNCONFIRMED (pre-edit vs post-edit change). The roadmap brief says: when the first
  `userModified:true` record appears, check whether its `newString` matches the NEXT observation's
  `originalFile`/read BEFORE finalizing tracker behavior. Build defensively with synthetic tests only.
- **Never run the probe against live `~/.claude/projects`/claude-data (self-contaminates)** — probe
  gates use the FROZEN fixture `~/Programming/jot-recovery/probe-fixture-20260615/projects`. The
  sidecar e2e (`plate_summary.py`) runs against `~/Programming/jot-recovery/claude-data` — that is fine.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.
```bash
# 1. Full suite (expect 69 suites / 690 passed / 0 failed at item-17-done; MEASURE, don't trust):
for f in tests/test-*.js; do case "$f" in tests/test-helpers.js|*output-data.js) continue;; esac; \
  node "$f" 2>/dev/null; done | grep -E "passed,|FAIL:" \
  | awk '/FAIL:/{print;next} /passed,/{p+=$1;f+=$3;s++} END{print "TOTAL: "s" suites, "p" passed, "f" failed"}'

# 2. New item-17 scanner suite in isolation (expect 14 passed):
node tests/test-read-event-scanner.js 2>/dev/null | grep -E "passed,|FAIL:"

# 3. detect-rewinds (expect 15 passed / 0 failed):
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# 4. Probe A/B vs develop-baseline (a8947fc) on the FROZEN fixture (MUST be "identical: true"):
git worktree remove --force /tmp/reveng-baseline 2>/dev/null; rm -rf /tmp/reveng-baseline
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline >/dev/null 2>&1
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# 5. Sidecar e2e (plate_summary.py) — MUST be 247/247, 0 mismatched, conflicts=8:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)'

# 6. Line-cap check — every touched api/ file MUST be ≤ 250:
wc -l api/read-event-scanner.js api/file-event-observations.js api/split-read-assembly.js \
  api/edit-stream-extraction.js api/file-historical-lineage.js api/file-events-extractors.js
```
