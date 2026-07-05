# Handoff: close the event-coverage gaps toward 100% reconstruction success

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; the whole tree is
untracked — git history tells you nothing; the real state is in the files).

## Goal
The per-line state sidecar (plans/per-line-state-sidecar-plan.md) is fully implemented
and proved out on the 9 list1 MISMATCH residuals. The next push is 100% reconstruction
success: extract the evidence kinds the pipeline currently ignores, resolve the known
residual classes, and promote the per-line verdict into probe verdict logic.

## Current State
- Full suite: **385 passed / 0 failed** across 30 suites. e2e baseline: list1 415 files
  (406 PASS / 9 MISMATCH, 97.8%), list2 535 (364 PASS / 103 MISMATCH / 68 NOT_FOUND).
- Sidecar complete (all 4 phases, strict red-green TDD):
  - `common/subagent-jsonls.js` (+6 tests) — subagent transcript discovery;
    `tools/find-jsonls-for-file.js` includes them, lexicographic order (parent main
    jsonl adjacent to its subagents).
  - `tools/extract-file-events.js` (+14 tests) — 7 event kinds with timestamps:
    snapshot | fileAbsent | write | edit | readFull | readChunk | cat.
  - `tools/track-line-states.js` + `common/line-state-evidence.js` /
    `line-belief.js` / `edit-splice.js` / `final-line-verdict.js` (+42 tests) —
    windowed tracker, conflicts, per-line verdict, CLI.
- Phase 4 results (reports in `tools/line-state-reports/`, gitignored): of the 9 list1
  MISMATCHes — 5 are per-line PERFECT at end state (divergence localized to one
  inter-beacon conflict window), 2 differ only by one trailing blank line beyond the
  reference's EOF, 1 is a proven post-session rewrite (evidence ends 2026-05-09, file
  mtime 2026-05-15), 1 has zero content evidence at all (launch.json — probe also had
  0 kept edits).
- plate_summary.py acceptance passed: blank-line divergence localized to line 7, May
  16→17 docstring rewrite in the single conflict cluster at 2026-05-17T02:02:43Z.

## What Remains

### A. Event-extraction coverage gaps (evidence in the JSONLs the pipeline never reads)
Ordered by expected payoff:

1. **Edit records carry the ENTIRE pre-edit file in `toolUseResult.originalFile`** and
   the sidecar ignores it. `common/replay-edits.js` buildReplaceEdit captures it;
   `applyReplaceOp` line 143 uses it for replay; `extract-file-events.js` and
   `materializeEdit` drop it. Every Edit with non-null originalFile is a whole-file
   observation at that record's timestamp (Tier 2) — extract it as its own event (or a
   sub-observation on the edit event) and the tracker gains a near-beacon at every
   edit. This alone likely collapses most "presumed" carry-forward.
2. **Bash file operations are touches but not events.** `common/extract-bash-file-ops.js`
   already parses cp/mv/git-mv/rm/redirect; collect-touches uses them for lineage only.
   Missing event kinds: `rm` (absence evidence, like fileAbsent but Tier 2),
   redirect `>` (truncate-write; for `echo`/`printf`/heredoc sources the content is
   inline in the command), `>>` (append — extends extent), `cp` (dst's content = src's
   believed content at that instant). launch.json-class files (zero content events)
   may only be recoverable this way.
3. **structuredPatch context lines are unread observations.** Write/Edit toolUseResults
   carry hunks whose ' ' (context) lines witness neighboring lines at edit time. The
   evidence-ref plumbing for structuredPatch already exists in
   `common/line-state-evidence.js` (findStructuredPatchLine); extraction does not emit
   them as observations.
4. **Partial-content Bash reads:** `head`, `tail`, `sed -n A,Bp`, `grep -n` produce
   line-addressed content; `wc -l` proves extent (a lastLine/eofConfirmed fact with no
   content). None are extracted. The cat extractor's CAT_COMMAND_PATTERN
   (extract-file-state.js:14) only matches bare `cat [-flags] <file>` — piped cat is
   excluded by design (lossy), but a piped `cat -n x | head` still carries Tier-3
   line evidence.
5. **Native Grep tool results** (mode: content, -n true) carry `file:line:text` rows —
   line-addressed observations across many files at once. Unextracted.
6. **MCP-tool file reads in subagent transcripts** (e.g. context-mode
   `ctx_execute_file` printing file content summaries) — prior session observation:
   the a21fd65d audit agent read plate_summary.py this way. Hard; possibly only
   partially recoverable. Survey before building.
7. **Records without timestamps are silently dropped** by extract-file-events
   (recordTimestampAt → exclude). Emit a dropped-count so coverage loss is visible
   (no-silent-caps principle).
8. **MultiEdit-style records** (toolUseResult with an `edits` array, older transcripts)
   — verify whether any exist in the recovery set; extractEditsFromJSONL does not
   handle them.

### B. Tracker gaps (implemented conservatively, may matter at scale)
9. **replaceAll** splices only within the FIRST known run containing old_string
   (`common/edit-splice.js`); occurrences in other runs or inside unknown gaps are not
   modeled. Should at minimum splice ALL runs, and go floating when a gap could hide
   an occurrence.
10. **Mid-timeline renames:** aliasPaths is a static set for the whole timeline; if a
    cp creates a sibling that later diverges, events of both match the same alias set.
    Correct handling needs time-aware alias windows (probe has the same limitation).
11. **Floating edit over a fully-known region** (plan's open question): flagged
    (`floatingOverKnownRegion` from edit-splice, test-covered) but creates no conflict
    record. Never triggered on real data — leave until it does.
12. **Conflict cascades:** a one-line insertion emits N per-line conflicts (every line
    below shifts). Correct but noisy — collapse a cluster into "insertion of K lines
    at line L" during reporting.
13. **Reference ladder git rung** missing in track-line-states CLI (on-disk →
    snapshot → none). All 9 list1 targets exist on disk; list2's 68 NOT_FOUND will
    need it (reuse `common/git-file-state.js` resolveGitContent, like replay-edits'
    tryGitFallback).

### C. Residual investigation + promotion
14. **Trailing-extent mismatch class** (handoff-recovery line 85, diff_sequence_codex
    line 498: belief claims one final blank line beyond the reference EOF, recon='').
    Dereference the evidence refs in the two reports to decide: real historical
    trailing blank line vs. systematic newline artifact in an observation kind. If
    artifact, fix the extractor; both files then go end-state perfect.
15. **Promote the sidecar into verdict logic** — the plan's stated bar ("promoted into
    verdict logic only if the reports prove out on the current 9 list1 MISMATCHes")
    is MET. Proposal: probe emits per-line stats per file; a file whose final belief
    matches the reference per-line (0 mismatched) upgrades MISMATCH → PASS-PER-LINE
    (new status, do not silently merge with PASS). Discuss status naming with the user
    first.
16. **Run the sidecar over list2** (103 MISMATCH + 68 NOT_FOUND in
    `tools/probe-results-v2.json`, status field, `filesNotInProject`) — the sidecar
    has only seen list1's 9. Expect the git rung (item 13) to be required.

### D. Consolidation deferred from the api restructuring
17. **Two read-event scanners are not one** (surfaced during tool-suite migration
    phase 4, 2026-06-13). `extract-file-state.extractReadEdits` returns whole-content
    records (consumed by replay-edits and file-historical-lineage);
    `assemble-split-reads.extractReadEvents` keeps per-chunk metadata — offset/limit,
    parsed line numbers — that `assembleSplitReads` and the read-event kinds need. Both
    scan Read tool results but produce different shapes, and neither serves the other's
    callers. Filed under F2 as a duplicate (tool-suite-function-inventory.md); revised
    2026-06-13 — NOT a true duplicate. After phase 4 both live in
    `api/file-events-extractors` (extractReadEdits exported, extractReadEvents
    internal). Unify into one scanner that derives both shapes, per the
    two-representations decision (revisit only after the restructuring completes).

## Key Files
- `plans/per-line-state-sidecar-plan.md` — the implemented spec (schema comments are
  the authoritative documentation).
- `plans/implementation-notes-per-line-state-sidecar-plan.md` — this session's
  decisions/deviations/Phase-4 findings; read in full.
- `tools/extract-file-events.js` — where new event kinds get added (Phase 2 shape:
  exactly one non-null kind sub-object per event).
- `common/line-state-evidence.js` — EXACTLY 300 lines (hook limit). New
  materializations may force a split; do not grow past 300.
- `common/line-belief.js`, `common/edit-splice.js`, `common/final-line-verdict.js` —
  tracker internals, each with its own test suite.
- `tools/track-line-states.js` — tracker + CLI (reference ladder lives here).
- `common/extract-bash-file-ops.js` — existing bash-op parser to reuse for item 2.
- `common/extract-file-state.js` (394 lines, frozen) / `common/collect-touches.js`
  (EXACTLY 300 lines, frozen) — reuse, never grow.
- `tools/probe-results-v2.json` — targets: `filesInProject[].status === 'MISMATCH'`,
  plus `filesNotInProject` for list2.

## Plan File
`plans/per-line-state-sidecar-plan.md` (implemented; gaps above are the successor work)

## Context the Next Agent Won't Have
- **VOCABULARY (user directives, enforced):** never "corpus" (say "all JSONL files in
  the projects folder"); "create", never "mint". Name things for what they are
  (`timestampOfContradictingRecord`, not `atMs`). Feature-specific properties go in
  nullable sub-objects; the non-null sub-object IS the kind — no kind strings, no
  placeholder fields. Schemas are annotated JS literals with intent comments and NO
  example values.
- **Coding style (lint hook on every edit):** strict red-green TDD (watch the test
  fail first); ONE condition per `if` (nest, never `&&`/`||`; ternaries only for value
  selection); 300-line file cap (hook REJECTS the write); >3-deep nesting rejected
  (extract helpers; build nested literals in flat steps). The hook runs
  `tests/test-<basename>.js` on every edit — name test files accordingly; a missing
  test file is only a warning, but every new module this session got its own suite.
- **Suffix-match strictness:** an alias path must be STRICTLY LONGER than
  '/'+shortenedKey to match (`anyAliasPathEndsWith`). Test fixtures using
  '/repo/t.py' against snapshot key 'repo/t.py' silently match NOTHING — use a longer
  target like '/work/repo/t.py'. This cost a debugging round this session.
- **Snapshot record facts (verified on real data):** `isSnapshotUpdate` is TOP-LEVEL
  on the record, not inside `snapshot`; snapshot records have NO top-level
  `timestamp` — the beacon time is `snapshot.timestamp`; backup entries also carry a
  per-entry `backupTime` which on isSnapshotUpdate:true records is LATER than
  snapshot.timestamp (capture moment vs turn start) — unused so far, could anchor
  finer.
- **readFull strictness:** a limit-less Read returning ≥2000 lines (harness default
  cap) extracts as readChunk, NOT readFull — stricter than assemble-split-reads'
  eofConfirmedAt. Zero readFull events appeared across all 9 real files; chunks
  dominate real data.
- **'presumed' mechanics:** after each instant, claims not re-established at that
  exact unixMs degrade authored/observed → presumed via "entry.confirmedAtMs ===
  instant" detection — no separate touched-set bookkeeping. Keep that invariant if
  you add event kinds: establish/verify lines by setting confirmedAtMs to the event's
  unixMs.
- **Conflicts come from observations only** (snapshot verify + read/cat overlays).
  write/fileAbsent REPLACE belief without conflicts (they change the file). A new
  "rm" or "redirect" event kind must decide which side of that line it sits on:
  rm/redirect are authored changes → replace, not conflict.
- **The hook race:** PostToolUse test runs can lag sequential edits — trust a direct
  `node tests/<suite>.js` run over the last hook message.
- **Failed/rejected approaches (do not re-litigate):** storing text in per-line
  entries (evidence refs only); kind discriminant strings; `lineWithinEvent` content
  locator; example values in schemas.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# Baseline (expect 385 passed, 0 failed total; no suite failing):
for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) echo "$t: $(node "$t" 2>/dev/null | grep -E 'passed, [0-9]+ failed')";; esac; done
# Sidecar e2e (expect: 247/247 matchedObserved, 0 mismatched, 233 conflicts in one
# cluster at 2026-05-17T02:02:43Z):
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history \
  --out /tmp/plate-check.json | head -5
# Probe e2e regression (slow; expect list1 406/9, list2 364/103/68) — run only after
# changing shared extractors:
#   (see tools/probe-projects-v2.js CLI; needs --projects-dir and --snapshots as above)
```
