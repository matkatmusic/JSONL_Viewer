# Handoff: Roadmap Item 6 SURVEYED → decision = CLOSE as NON-VIABLE; close-out + items 5.5, 7–17 remain
Conversation name: RevEng — survey roadmap item 6 (MCP-tool file reads → context-mode store retrieval)

## Branch
`develop` based on `master`. The committed source tree exists ONLY on `develop-baseline` (tip
"Baseline: source tree before stage-3 tool-suite api/ migration"); the local `git log` on
`develop` shows just one `Initial commit`. On `develop` everything (`api/`, `tools/`, `tests/`,
`plans/`, …) is present but UNTRACKED (`git status` → `??`) — EXPECTED, not a mistake (only
`.gitignore` is tracked). Review changes with `git diff develop-baseline -- <path>`. No `-plate`
branch exists.

## Goal
The sidecar (`RevEng/`) rebuilds a file's per-line history from events extracted out of Claude
Code JSONL transcripts, driving toward 100% reconstruction (roadmap:
`plans/roadmap-100-percent-reconstruction.md`). This session SURVEYED roadmap Item 6 and reached a
go/no-go. **No production code was written and nothing in the source tree changed.**

## Current State — Item 6 surveyed; verdict NON-VIABLE; close-out NOT yet executed
Item 5 (native Grep) remains SHIPPED & GREEN per `plans/handoff-develop-20260616-1858.md`. The four
standing gates are GREEN by construction (this session changed no code): full suite 55/575/0,
detect-rewinds 15/0, probe A/B byte-identical vs `develop-baseline`, plate_summary.py 247/247.

Item 6 ("MCP-tool file reads in subagent transcripts") was surveyed two ways; **both dead**:
1. **Transcript angle:** MCP `tool_result`s in the JSONL carry only context-mode's SUMMARY string
   (e.g. "Executed 5 commands (130 lines, 3.7KB). Indexed 5 sections."), never file bytes, and no
   file path. 0 of 431 fixture subagent transcripts use context-mode — all use is in MAIN
   transcripts. The roadmap's "in subagent transcripts" premise is wrong.
2. **context-mode on-disk store angle (user-redirected):** context-mode persists VERBATIM content
   in per-project SQLite FTS5 DBs, BUT it is a ≤14-day, per-machine, purgeable CACHE — not an
   archive. Confirmed by direct read-only DB inspection (see Context below): NO content DB for any
   jot or fixture cwd; the one extant content DB is an unrelated bezier project with 0 file-backed
   sources; the session store survives longer but records file PATHS only (≤69-char `file_edit`
   data), never content.

A close-out PLAN was written this session at
`~/.claude/plans/write-a-plan-for-curious-eclipse.md` (3 steps below) but was NOT executed — the
user chose to hand off rather than execute in-session.

## What Remains (ordered by execution sequence)
1. **Execute the Item 6 close-out** (documentation + one diagnostic spike; NO reconstruction code):
   a. Write `plans/implementation-notes-item6-context-mode-survey.md` capturing: the retrieval
      recipe (read-only SQLite over `chunks ⋈ sources`; `ctx_search` returns partial snippets, not
      whole files), the structural blockers with `README.md` line refs (14-day cleanup `:1021`; 24h
      fetch TTL `:971`; session deletion without `--continue` `:41`; `ctx_purge` `:93,975`;
      per-machine/per-project), the jot DB evidence, and the reopen threshold
      (`UNIQUE_TARGET_COVERAGE ≥ 5` with ≥1 `file_path`-backed source).
   b. Create `tools/spike-item6-context-mode-yield.js` (≤250 lines; read-only; MUST never write/
      index/purge the context-mode store nor mutate the projects folder — open every DB with
      `?mode=ro`) + minimal red-green test `tests/test-spike-item6-context-mode-yield.js` for its
      two pure helpers: `resolveContentDbPath(cwd)` (assert `/Users/matkatmusicllc/Programming/jot`
      → `~/.claude/context-mode/content/b55ec227de3101d0.db`) and `isWholeFileSource(source)` (true
      for `file_path` set; false for a prose `batch:` label). The spike resolves each transcript
      cwd → `sha256(cwd).hex[0:16]` → content DB, derives targets from `tools/probe-results-v2.json`
      `filesInProject[].path`, and prints a JSON verdict with `UNIQUE_TARGET_COVERAGE` (expected
      `0` on the frozen fixture).
   c. Flip roadmap item-6 box `[ ]`→`[x]` (`plans/roadmap-100-percent-reconstruction.md:116`) with
      a DONE summary in the established item-1..5 style (redirected; ≤14-day cache not archive;
      11/11 fixture + all jot cwds have no content DB; the one extant content DB is non-fixture with
      0 file-backed sources; session store is path-only; retrieval mechanism documented, data absent
      by design; re-run gate = the spike).
2. **Item 5.5** — apply the File-path-handling convention to the raw-matching kinds (`cat` via
   `buildCatPending`→`catEventsForFile`, and the item-4 bash reads at `api/bash-read-events.js:85`):
   resolve each captured RAW path with `resolveAgainstCwd(sessionCwd, rawPath)` BEFORE the
   `aliasSet` test (template: `api/bash-op-events.js`). Needs its own planning pass — only the
   roadmap §C stub exists. The `cat` TOUCH-collection half re-baselines the probe; the emission
   halves are tracker-only.
3. **Items 7–17** per `plans/roadmap-100-percent-reconstruction.md` (dropped-record count, MultiEdit
   records, replaceAll-across-all-runs, time-aware alias windows, conflict-cascade collapse, git
   rung, residual investigation, read-scanner unification).

## Key Files
- `plans/roadmap-100-percent-reconstruction.md` — the 17-item roadmap (item 5 `[x]`; 6 surveyed → close).
- `~/.claude/plans/write-a-plan-for-curious-eclipse.md` — the full Item-6 close-out plan written this
  session (Steps 1a–c above, with verification + critical files). Re-create in `plans/` if a fresh
  session can't read it.
- `plans/handoff-develop-20260616-1858.md` — the item-5 handoff (exact gate commands, the 5-point
  wiring pattern, sparse-vs-whole-overlay rule).
- context-mode store (Claude Code host): content `~/.claude/context-mode/content/<sha256(cwd)[:16]>.db`;
  sessions `~/.claude/context-mode/sessions/<hash>[__suffix].db`. Plugin source + README at
  `~/.claude/plugins/marketplaces/context-mode/` (README §"TTL Cache" ≈ line 1014).
- Spike reuse: `extractSessionMetadata` (`api/transcript-parsers.js`), `resolveAgainstCwd`
  (`api/file-historical-lineage.js`), targets from `tools/probe-results-v2.json`.

## Context the Next Agent Won't Have (most important — discovered constraints + user redirects)
- **User redirect:** the original Item 6 (mine MCP tool_results in the JSONL) was found non-viable
  (summaries only); the user then redirected to "retrieve contents from context-mode MCP" — i.e.,
  read context-mode's own store. That second angle was investigated in depth and is ALSO non-viable.
- **context-mode is a CACHE, not an archive** — `README.md:1021`: "Content databases and sources
  older than 14 days are removed on startup." This is the structural reason historical
  reconstruction from it is impossible. Do NOT re-attempt unless the reopen threshold is met.
- **Direct DB evidence (read-only, jot):** content store has NO db for `…/jot` (`b55ec227de3101d0`),
  `…/jot-ultraplan` (`21659143141a59cd`), `…/jot-backup` (`2990ab3dc6ccdd10`). The only content db
  (`d7102cce37be6134.db`) is a bezier/SVG project with `file_path IS NULL` on all 24 sources. The
  session store has jot DBs back to 2026-04, but `file_edit`/`file_read`/`file_write` `data` is the
  absolute PATH only (max 67–69 chars); bulk fields are `subagent_completed`/`rule_content`/
  `error_tool` — no file content anywhere.
- **content schema:** `chunks(title, content[verbatim], source_id, content_type, session_id[NULL],
  event_id[NULL], timestamp)`; `sources(id, label["batch:…"], chunk_count, indexed_at,
  file_path[set ONLY for ctx_index], content_hash[SHA-256])`. Whole-file recovery would require
  iterating chunks by `rowid`, deduping heading/line-group OVERLAP (naive concat duplicates lines),
  and verifying against `content_hash`. `ctx_execute_file` stores user-code stdout, NOT source bytes.
- **If ever reopened (build design, NOT built):** a `ctxStoreFile` whole-file overlay event kind fed
  by a FROZEN export of DB rows (preserves probe byte-identity), mirroring the item-5 `grepMatches`
  triplet + 5 wiring points. CRITICAL: `api/line-state-evidence.js` is at 249/250 lines — its
  `materializeEvent` dispatch MUST be split into a sibling module BEFORE adding a branch. A
  whole-file kind MUST call `finishWholeOverlay`; sparse kinds must NOT (the `apply-one-event.js`
  DEFAULT branch confirms EOF and would drop the tail).
- **The post-write hook re-checks the WHOLE edited file** (250-line cap, >3 indent depth,
  one-condition-per-`if`) and flags PRE-EXISTING violations in any file you touch — budget for
  collateral cleanup. Read-only `grep`/`diff` give FALSE NEGATIVES on the probe gate (status-line
  injectors) — use a `node` fs-walk + JSON compare (strip `generatedAt`), filter `2>/dev/null`.

## How to Verify
Per `plans/handoff-develop-20260616-1858.md` §How to Verify (full suite 55/575/0; detect-rewinds
15/0; probe A/B byte-identical vs `develop-baseline` against the FROZEN fixture
`~/Programming/jot-recovery/probe-fixture-20260615/projects`; plate_summary.py 247/247). The
close-out adds NO production code, so these stay green by construction. Additionally: the spike must
leave context-mode DB mtimes unchanged (`ls -la --time-style=full-iso ~/.claude/context-mode/content
~/.claude/context-mode/sessions` before/after) and print `UNIQUE_TARGET_COVERAGE: 0`; both new files
≤ 250 lines; the spike test goes red→green. NEVER run the probe against live claude-data
(self-contaminates).
