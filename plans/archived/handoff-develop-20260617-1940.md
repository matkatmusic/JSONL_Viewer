# Handoff: Roadmap Item 17 (unify the two read-event scanners) — PLANNED, ready to implement
Conversation name: plan RevEng item 17 — unify the two read-event scanners
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`, UNCHANGED this session — this was a
PLANNING session, no code written. Working tree is UNTRACKED by design (`git status --short` → many
`??` + a pre-existing unrelated `M .gitignore`, 2 insertions). This project commits nothing during
normal work; the committed source mirror lives on **`develop-baseline`**, currently **`a8947fc`**
(item-15 re-baseline: "PASS_PER_LINE probe status"), UNCHANGED this session. Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd `…/Desktop/claude code src` is the
Claude Code TS source (PRODUCER of the JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the git repo.

## Goal
Close roadmap item 17 (§D Consolidation) — "unify the two read-event scanners." The sidecar reads
each Read `tool_use`/`tool_result` pair from a transcript **twice**, through two independent scanners
that produce incompatible shapes:
- **Scanner A — `extractReadEdits(lines, parsed)`** (`api/file-event-observations.js:217`) →
  whole-content edit records `{line, filePath, file, type:'update', content, source:'read'}`; two
  callers, different filters: `appendFilteredReadEdits` (`api/edit-stream-extraction.js:145`,
  written-files-only → replay) and `appendReadTouches` (`api/file-historical-lineage.js:45`,
  unfiltered → **discovery** touches).
- **Scanner B — `extractReadEvents(jsonlText)`** (`api/split-read-assembly.js:79`) → per-chunk events
  `{filePath, firstLineNumber, contentLines, requestedLimit, timestamp, jsonlLine}`; one caller:
  `readEventsForFile` (`api/file-events-extractors.js:169`) → `buildReadKindEvent` → `readFull`/`readChunk`.

Item 17 replaces both with **one canonical scan** (`scanReadEvents`) plus two pure derivations,
repoints all three production callers + the CLI directly (no forwarding), and **must hold scanner
output byte-identical** — the `appendReadTouches` repoint feeds probe-gated discovery (item 5/5.5/5.6
class). The next agent EXECUTES the plan via strict red-green TDD.

## Current State
**Planning COMPLETE; implementation NOT started; no code written this session.** The plan is written
and user-approved at **`/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-wiggly-pixel.md`**
(per-item RevEng plans live in `~/.claude/plans/`, not `RevEng/plans/` — same convention as item 13's
`noble-floating-volcano.md`, item 14's `hidden-foraging-cloud.md`, item 16's `peaceful-tumbling-phoenix.md`).
The plan is conformant to `~/.claude/guides/planning.md` + `tdd.md` + `coding-standards.md` +
`single-condition-branching.md`.

**Empirical finding driving the plan** (ran BOTH scanners over all 786 transcripts in the frozen
fixture `~/Programming/jot-recovery/probe-fixture-20260615/` via a throwaway read-only `node -e` —
no file created): A and B genuinely DIVERGE, so the unified scan must capture A's **superset** and
faithfully reproduce both shapes.
- A captures **6336**, B captures **6076**.
- **260** A-only reads (B drops: non-empty results with NO tab-numbered line); **0** B-only.
- **128** shared reads where `A.content !== B.contentLines.join('\n')` — 44 box-format (`│`), 84
  trailing `<system-reminder>`/unnumbered lines A keeps and B drops.

**Going-in gates (re-measure before starting — this project re-baselines and warns "don't trust a
handoff number"):** per item 16's handoff, suite ≈ **66–68 suites / ~673 passed / 0 failed** (item 14
+ item 16 each add a suite); detect-rewinds **15/15**; sidecar `plate_summary.py` **247/247, 0
mismatched, conflicts = 8**; probe A/B identical vs `a8947fc`. Items 14/15/16 touched
`line-state-evidence.js` / `numbered-entries.js` / `promote-per-line-status.js` / probe files —
**none of item 17's read-scanner targets** — so the plan needs no revision when 14/16 land, only a
baseline re-measure.

## What Remains
Implement the plan (read it first), strict red-green TDD — watch each test FAIL before writing
behavior code. One condition per `if` (nest; never `&&`/`||`). NEW files 4-space; in-place edits to
existing 2-space files stay 2-space. New test file: `tests/test-read-event-scanner.js` (reuse
`tests/test-helpers.js` builders). Order:

1. **Build the canonical scan + derivations (Tasks 1–7)** in NEW `api/read-event-scanner.js`:
   `scanReadEvents(lines, parsed)` returning the superset record
   `{filePath, line, requestedLimit, timestamp, rawResultText, strippedContent, firstLineNumber,
   contentLines, isValidRead}`; reuse A's exact spine `scanToolUseResults(parsed, 'Read', …)`; port
   `stripCatLineNumbers`/`LINE_NUMBER_PATTERN` (box + tab), `parseNumberedContent`/`NUMBERED_LINE_PATTERN`
   (tab-only), `isValidReadContent`, `toolResultText` into the module; then `chunkEventToEditRecord`
   (A's 6-field shape, `content`=`strippedContent`, null when `!isValidRead`) and `chunkEventToReadEvent`
   (B's 6-field shape, `jsonlLine`=`line+1`, null when `firstLineNumber===null`). Export
   `buildEditRecord` from `file-event-observations.js` and import it (single record-shape home, no
   duplication).
2. **Characterization locks (Tasks 8–9)** — BEFORE deleting any legacy body, capture golden arrays
   from the legacy `extractReadEdits` / `extractReadEvents` on a transcript containing tab + box +
   trailing-reminder + unnumbered reads, and assert the derived outputs `deepStrictEqual` them.
3. **Repoint `appendFilteredReadEdits` (Task 10)** — `api/edit-stream-extraction.js`: scan →
   `chunkEventToEditRecord` per record, `continue` on null, keep the WRITTEN-FILES-ONLY filter at the
   call site. Parity: deep-equal `extractEditsFromJSONL` output vs pre-change golden.
4. **Repoint `appendReadTouches` (Task 11) — DISCOVERY-CRITICAL** — `api/file-historical-lineage.js`:
   scan → `chunkEventToEditRecord`, **keep the null gate**, push `{kind:'read', path, line}`
   UNFILTERED. Golden deep-equal with a box-format + trailing-reminder fixture (the divergence cases).
5. **Repoint `readEventsForFile` (Task 12)** — `api/file-events-extractors.js`: change signature to
   `(jsonlPath, lines, parsed, aliasSet)`, pass the already-computed `lines, parsed` at the call site
   (`:222`), scan → `chunkEventToReadEvent` per record, keep `aliasSet.has` + timestamp filters;
   `buildReadKindEvent`/`readProvedEof` UNCHANGED. Parity: deep-equal readFull/readChunk events.
6. **Retire legacy + archive (Task 13)** — delete A's scan trio from `file-event-observations.js`;
   delete B's scan helpers from `split-read-assembly.js` (KEEP `assembleSplitReads` stitching +
   `assembleOneFile`/`computeGaps`/`eofConfirmedAt`; import the scanner); repoint
   `tools/assemble-split-reads.js`. Move removed bodies → `archive/`; move obsolete `extractReadEdits`
   unit tests in `tests/test-file-event-observations.js` → `tests/archive/`. Confirm `git grep
   extractReadEdits` shows only archive + history.
7. **Run all gates** (§ How to Verify); confirm probe A/B `identical: true` (byte-identical → NO
   re-baseline). Then mark item 17 `[x]` in `plans/roadmap-100-percent-reconstruction.md` (line ~551)
   with a completion summary, write `plans/implementation-notes-item17-unify-read-scanners.md`, and
   write a completion handoff via `/jot:handoff-prompt`.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-wiggly-pixel.md` —
  THE plan to implement (read first); has the full canonical-record spec, both derivation snippets,
  the 13-task list with `test_<name>` + parity assertions, the line-count budget, and the gate section.
- `api/read-event-scanner.js` — **NEW** canonical home (`scanReadEvents`, `chunkEventToEditRecord`,
  `chunkEventToReadEvent`, ported strip/parse helpers).
- `api/file-event-observations.js` (278 L) — Scanner A (`extractReadEdits` :217, `buildReadPending`
  :190, `confirmReadResult` :202, plus `stripCatLineNumbers`/`isValidReadContent`/`buildEditRecord`/
  `scanToolUseResults` before :180). Remove A's trio; export `buildEditRecord`. Removing it drops the
  file UNDER the 250 cap (bonus).
- `api/split-read-assembly.js` (169 L) — Scanner B (`extractReadEvents` :79, `parseNumberedContent`
  :38, `toolResultText` :28, `registerReadUse` :52, `confirmReadResult` :60) + `assembleSplitReads`
  :151 (KEEP) + stitching helpers. Remove only B's scan helpers; import the scanner.
- `api/file-events-extractors.js` (247 L, AT cap) — `readEventsForFile` :169, `buildReadKindEvent`
  :156, `readProvedEof` :149; call site in `extractFileEventsFromText` :222 (already has `lines`+`parsed`).
- `api/file-historical-lineage.js` (246 L) — `appendReadTouches` :45 (discovery-critical, unfiltered).
- `api/edit-stream-extraction.js` (244 L, tightest) — `appendFilteredReadEdits` :145 (written-files-only).
- `tools/assemble-split-reads.js` — CLI consumer of `assembleSplitReads`/`extractReadEvents`; repoint.
- `tests/test-read-event-scanner.js` (NEW); `tests/test-file-event-observations.js` /
  `tests/test-edit-stream-extraction.js` / `tests/test-file-historical-lineage.js` /
  `tests/test-file-events-extractors.js` / `tests/test-split-read-assembly.js` — existing suites that
  must stay green (+ the new per-caller tests); `tests/archive/` + `archive/` for retired bodies/tests.
- `plans/roadmap-100-percent-reconstruction.md` — item 17 block at line ~551; § Constraints at ~585.

## Plan File
`/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-wiggly-pixel.md` (the
approved item-17 plan). No plan duplicated into `RevEng/plans/` (that dir holds handoffs / notes /
roadmap only).

## Context the Next Agent Won't Have
- **A and B are NOT interchangeable — five confirmed divergences** (measured, not assumed): (1) content
  form — A reads only string `item.content`, B's `toolResultText` also joins text-blocks (latent on the
  fixture: array reads carry no tab-numbered lines, so both drop them anyway); (2) numbering — A strips
  `│` box **and** `\t`, B's `/^(\d+)\t/` is tab-only; (3) composition — A keeps the WHOLE stripped
  result, B keeps ONLY numbered lines; (4) input — A `(lines, parsed)`, B `(jsonlText)` (A's `lines`
  param is UNUSED today); (5) validation — A's `isValidReadContent` vs B's null-when-no-numbered-line.
  The 84 + 44 + 260 cases are exactly where a naive merge would silently change discovery output.
- **`appendReadTouches` is THE byte-identity risk.** It feeds `collectTouches` → `buildLineageGraph` →
  probe-gated discovery. It reads ONLY `.filePath` + `.line` off each A-record, so as long as the
  derivation reproduces A's capture SET and those two fields 1:1 (Task 8 + Task 11 goldens), touches
  stay byte-identical. **Keep the `chunkEventToEditRecord` null gate in the repoint** — dropping it
  would emit touches A never emitted. If the probe A/B shows ANY discovery delta: STOP, characterize,
  do NOT silently re-baseline.
- **`content` is `strippedContent`, NOT `contentLines.join('\n')`.** This is what preserves the 84
  trailing-reminder cases and the 260 A-only cases. Getting this wrong passes Tasks 1–7 but fails the
  Task 8 golden.
- **Canonical input is `(lines, parsed)`** (chosen over `jsonlText`): 2 of 3 callers already hold it,
  the third's call site already computes both locally — avoids a second parse and matches
  `scanToolUseResults`'s contract.
- **`assembleSplitReads` STAYS** in `split-read-assembly.js` — it has a live CLI caller
  (`tools/assemble-split-reads.js`) and is a different capability (multi-chunk full-file recovery) from
  the per-event derivation. Preserve-not-delete: only B's SCAN helpers move out.
- **`buildEditRecord` is imported, not duplicated** — single record-shape home avoids drift (per the
  no-forwarding / one-canonical-home constraint).
- **250-line WRITE cap is hook-enforced** (the write is blocked). `edit-stream-extraction.js` (244) is
  tightest — its `appendFilteredReadEdits` rewrite must stay net-neutral; if any file would land ≥250,
  move the overflow helper into `read-event-scanner.js`. The write hook auto-runs
  `tests/test-<basename>.js` after each source write and reports RED/GREEN as a Stop-hook "blocking
  error" — that's the red-green signal, not a failure, and it does not block the write.
- **NEW files are 4-space; in-place edits to the existing 2-space files stay 2-space.** Avoid multi-line
  4-space object literals inside nested blocks (the deep-nesting hook counts in 2-space units).
- **Out of scope:** item-5.6's pre-designated unification of bash-read/grep timestampless-result
  handling. Item 17 is the Read-scanner unification only — note it, defer it.
- **Never run the probe against live `~/.claude/projects`/claude-data (self-contaminates)** — probe
  gates use the FROZEN fixture `~/Programming/jot-recovery/probe-fixture-20260615/projects`. The sidecar
  e2e (`plate_summary.py`) runs against `~/Programming/jot-recovery/claude-data` — that is fine.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.
```bash
# 1. Full suite — MEASURE going-in first (≈66–68 suites at item-16-handoff time), then expect +1 suite
#    (tests/test-read-event-scanner.js) + the new per-caller cases, 0 failed:
for fkt in tests/test-*.js; do case "$fkt" in tests/test-helpers.js|*output-data.js) continue;; esac; \
  node "$fkt" 2>/dev/null; done | grep -E "passed,|FAIL:" \
  | awk '/FAIL:/{print;next} /passed,/{p+=$1;f+=$3;s++} END{print "TOTAL: "s" suites, "p" passed, "f" failed"}'

# 2. New item-17 suite in isolation:
node tests/test-read-event-scanner.js 2>/dev/null | grep -E "passed,|FAIL:"

# 3. detect-rewinds (expect 15 passed / 0 failed):
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# 4. Probe A/B vs develop-baseline (a8947fc) on the FROZEN fixture (MUST be "identical: true" — the
#    appendReadTouches repoint is the discovery risk):
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

# 6. Line-cap check — every touched api/ file MUST be < 250:
wc -l api/read-event-scanner.js api/file-event-observations.js api/split-read-assembly.js \
  api/edit-stream-extraction.js api/file-historical-lineage.js api/file-events-extractors.js
```
