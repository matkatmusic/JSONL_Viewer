# Handoff: Roadmap item 5 (native Grep tool results) — fully planned & de-ambiguated, ready to implement
Conversation name: RevEng — plan roadmap item 5 (native Grep tool results)
JSONL: (omitted per handoff rules)

## Branch
`develop` based on `master`. The committed source tree lives only on `develop-baseline`;
on `develop` the working tree (`api/`, `tools/`, `tests/`, `plans/`, …) is UNTRACKED (`??`) —
EXPECTED, not a mistake (only `.gitignore` is tracked). Review changes with
`git diff develop-baseline -- <path>`.

## Goal
Implement roadmap item 5: emit native Grep tool results (`output_mode:"content"`, `-n:true`) as a
new `grepMatches` sparse-overlay event kind — line-addressed observations across many files per call
— AND count grep as a file "touch" so grepped-only transcripts become discoverable. Also adds a
standing file-path-resolution convention and a follow-up Item 5.5. The sidecar drives toward 100%
reconstruction; item 5 adds corroboration that shrinks presumed carry-forward.

## Current State
- This was a PLANNING session. The complete, de-ambiguated spec is at
  `~/.claude/plans/read-users-matkatmusicllc-desktop-claude-peaceful-floyd.md` — READ IT IN FULL; it
  is the authoritative instruction set (ordered RED→GREEN TDD steps + a "Key concepts" glossary).
- Item 4 (partial-content bash reads) already SHIPPED & GREEN (52 suites / 556 / 0) — see
  `plans/handoff-develop-20260616-1613.md`.
- One roadmap edit ALREADY APPLIED: the probe-gate constraint in
  `plans/roadmap-100-percent-reconstruction.md` now distinguishes the pre-grep gate (through item 4)
  from the grep-inclusive gate (item 5 onward, re-baselined).
- NOT done yet: no item-5 code written; the plan is not yet formally approved (ExitPlanMode pending);
  two roadmap-doc edits are still PENDING (drafted verbatim in the plan §A and §C).

## What Remains (execution order)
0. Apply the two pending roadmap edits (plan §D): add the **File-path handling** convention bullet
   (plan §A text) to the roadmap "Constraints", and add the **Item 5.5** stub (plan §C text).
1–10. Execute plan Steps 1–10 in order, each RED test first then GREEN: `parseGrepRows`;
   `extractGrepToolResults`; register `'grepMatches'` in `KIND_NAMES`; `grepMatchEventsForFile`
   (emission, resolves relpaths→absolute); `materializeGrepMatches`; dispatch in `materializeEvent`;
   apply branch in `api/apply-one-event.js`; wire into `extractFileEventsFromText`; `appendGrepTouches`
   in `collectTouches`; the shared Grep fixture builder.
11. Verify (full suite, detect-rewinds, probe re-baseline + diff characterization, sidecar e2e),
    write `plans/implementation-notes-grep-tool-results.md`, check the item-5 box.

## Key Files
- `~/.claude/plans/read-users-matkatmusicllc-desktop-claude-peaceful-floyd.md` — the spec (read fully).
- `plans/roadmap-100-percent-reconstruction.md` — item 5 is next `[ ]`; gate updated; convention + 5.5
  edits pending.
- `plans/handoff-develop-20260616-1613.md` — item-4 handoff: modules to mirror, gotchas, verify cmds.
- CREATE: `api/grep-tool-results.js` (pure parser), `api/grep-tool-events.js` (emission),
  `api/grep-tool-evidence.js` (materialization).
- EDIT: `api/file-event-kinds.js` (KIND_NAMES, 49L), `api/apply-one-event.js` (apply branch — NOT
  track-line-states; 113L), `api/line-state-evidence.js` (dispatch; 248L — cap-tight),
  `api/file-events-extractors.js` (wiring; 232L), `api/file-historical-lineage.js` (appendGrepTouches; 238L).
- COPY FROM: `api/bash-read-events.js` (pairing), `api/bash-read-evidence.js` (`grepEntries`:50-67),
  `api/bash-op-events.js` (cwd-resolution template).

## Plan File
`~/.claude/plans/read-users-matkatmusicllc-desktop-claude-peaceful-floyd.md`

## Context the Next Agent Won't Have
- **Real Grep `toolUseResult` shape (confirmed from live transcripts; NO repo fixtures exist):** object
  `{ content, filenames, mode, numFiles, numLines }`; extract only `mode:"content"`; `content` =
  newline-joined `relpath:line:text` rows; **paths are RELATIVE to the session cwd**; the
  `tool_result` block's string `content` mirrors `toolUseResult.content`.
- **User directive (load-bearing): resolve EVERY captured path to its absolute on-disk path before any
  "which file is this" decision.** Now a standing convention (plan §A) + a retroactive **Item 5.5**
  for the kinds still matching raw (cat, item-4 bash reads). Already compliant: Read/Edit/Write,
  originalFile (1), patchContext (3), bash ops rm/`>`/`>>` (2 — the resolution template), snapshot
  (suffix-match exception). Item 5 resolves via `resolveAgainstCwd` everywhere.
- **User directive: grep counts as a file touch GLOBALLY** (discovery), which INTENTIONALLY breaks the
  pre-grep probe A/B baseline → item 5 RE-BASELINES the probe (characterize the diff: only
  grep-touched transcripts added to `transcriptsUsed`; any verdict change traceable to grep
  discovery/reordering — nothing unexplained; then freeze a new grep-inclusive fixture). The roadmap
  gate text was already updated for this.
- **grep is a FULL observation (overwrite belief + record conflicts), NOT soft corroboration**
  (carry-over of item-4's user decision); but it NEVER witnesses the file extent → `applyOverlayLines`
  ONLY, NO `finishWholeOverlay`/`finishChunk` (same EOF-unreliable rule the item-4 bash reads follow).
- **Apply branches now live in `api/apply-one-event.js`** (extracted from `track-line-states.js` for
  the 250-line cap) — add the grep branch THERE, copied from the `bashGrep` branch (98-103).
- **Kind sub-object `{ filePath, cwd }`:** `filePath` = the resolved absolute path; `cwd` is stored so
  materialize can re-resolve the multi-file rows back to this event's file. `resultLine` is 1-based
  (events/`jsonlLine`) vs the 0-based parsed-array index touches use (hence `resultLine - 1`).
- The plan was deliberately de-ambiguated at the user's request (a grounded "Key concepts" glossary,
  inlined filenames, explicit offset/indexing mechanics) so it executes cold. Honor it line-by-line.
- **Plan NOT yet approved** (ExitPlanMode kept getting interrupted with refinements) — confirm with the
  user before executing.

## How to Verify
From `RevEng/`, per `plans/handoff-develop-20260616-1613.md` § How to Verify:
1. Full suite one-liner (was 52 suites / 556 / 0; expect ≈ +3 suites).
2. `node tests/detect-rewinds.test.js` → 15/0.
3. Probe A/B `node` fs-walk + `node -e` JSON compare against the FROZEN fixture
   `~/Programming/jot-recovery/probe-fixture-20260615/projects` (recursive grep/diff give false
   negatives; clean `/tmp/reveng-baseline` first; `2>/dev/null`). Item 5 INTENTIONALLY shifts this →
   characterize the diff, then re-baseline.
4. Sidecar e2e via `tools/track-line-states.js` on `plate_summary.py` — verdict no regression; record
   the presumed-residual reduction (the payoff).
5. Every new/edited source + test file ≤ 250 lines.
