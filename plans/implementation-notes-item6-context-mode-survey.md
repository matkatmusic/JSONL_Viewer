# Implementation notes — Item 6: context-mode store survey (close-out)

## 2026-06-16:20:50:00 — Roadmap Item 6 closed as NON-VIABLE (context-mode store survey)
Chat title: RevEng — implement the Item-6 close-out plan (curious-eclipse)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/18e2d5f5-52a3-4285-a07a-b9e205031e19.jsonl

This file is BOTH the canonical close-out record for roadmap Item 6 and the running
implementation-notes log for the session that executed the close-out plan. Item 6
("MCP-tool file reads in subagent transcripts") was **surveyed, not built** — the survey
concludes *don't build*. The only code produced is one read-only diagnostic spike that
serves as the documented re-run gate.

### References
- Plan executed: /Users/matkatmusicllc/.claude/plans/write-a-plan-for-curious-eclipse.md
- Roadmap: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md  (Item 6 ≈ line 134)
- Survey handoff in: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260616-2044.md
- Item-5 verify handoff (gate commands): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260616-1858.md
- context-mode README (installed v1.0.126): /Users/matkatmusicllc/.claude/plugins/marketplaces/context-mode/README.md
- Spike: /Users/matkatmusicllc/Desktop/claude code src/RevEng/tools/spike-item6-context-mode-yield.js
- Spike test: /Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test-spike-item6-context-mode-yield.js

---

## Survey record

### What Item 6 asked
Can MCP-tool file reads (e.g. context-mode `ctx_execute_file` / `ctx_batch_execute`) be mined
as file-content evidence for the per-line reconstruction sidecar? Flagged *"Hard / possibly
partial — survey before building."* The user sharpened it: **can the real file bytes be
retrieved from context-mode's own on-disk store**, since context-mode keeps verbatim output in
a sandbox and only a summary reaches the JSONL?

### Conclusion: NON-VIABLE (two independent dead ends)

**1. The transcript angle is dead.** MCP `tool_result` payloads in the JSONL carry only
context-mode's *summary* string (e.g. `"Executed 5 commands (130 lines, 3.7KB). Indexed 5
sections."`), never verbatim file content, and carry no file path. context-mode exists
specifically to keep raw output out of the transcript. Zero of 431 subagent transcripts in the
frozen fixture contain any context-mode MCP use (all use is in MAIN transcripts) — the roadmap's
"in subagent transcripts" premise is wrong.

**2. The context-mode on-disk store angle is also dead — for a documented structural reason.**
context-mode persists verbatim content in a per-project, per-machine SQLite FTS5 store, but it
is a context-savings **cache, not a historical archive**:
- **14-day cleanup** — *"Content databases and sources older than 14 days are removed on
  startup."* (`README.md:1021`).
- **24h fetch TTL** for `ctx_fetch_and_index` (`README.md:971`, `:1016`).
- **Session data deleted immediately without `--continue`** (`README.md:41`).
- **`ctx_purge` permanently deletes everything** at any time (`README.md:93`, `:975`).
- Per-machine and per-project (keyed by `sha256(cwd)`).

**3. Direct read-only DB inspection of jot confirms it empirically.** Resolving each jot cwd to
`sha256(cwd).hex[0:16]`:
- **Content store** (`~/.claude/context-mode/content/`): **no DB** for any jot cwd —
  `…/jot`→`b55ec227de3101d0`, `…/jot-ultraplan`→`21659143141a59cd`,
  `…/jot-backup`→`2990ab3dc6ccdd10` are all absent. The only content DB present on the machine
  (`d7102cce37be6134.db`) is an unrelated bezier/SVG project with **0 file-backed sources**
  (`file_path IS NULL` on all sources). The frozen-fixture project cwds likewise have **no
  content DB**.
- **Session store** (`~/.claude/context-mode/sessions/`): jot DBs *do* survive longer (events
  back to 2026-04), but file events are **path-only** — `file_edit`/`file_read`/`file_write`
  `data` is the absolute path (≤69 chars), **never content**.

**Net:** context-mode supplies no file-content evidence the JSONL lacks. The path provenance it
keeps is already covered by the pipeline's transcript discovery. The retrieval *mechanism* is
real and documented below; the *data* simply isn't there and, by the 14-day design, won't be for
any historical reconstruction target.

### The retrieval recipe (for the record — how one WOULD read content from context-mode)
- **Store path (Claude Code host):** `~/.claude/context-mode/content/<sha256(cwd)[:16]>.db`
  (other hosts root elsewhere, e.g. OMP at `~/.omp/context-mode/`; the README's generic prose
  cites `~/.context-mode/content/` at `:1016`).
- **Open read-only:** `sqlite3 "file:<db>?mode=ro"` (also `-readonly`). `node:sqlite` is
  unavailable on this host's Node v24.3.0 (`ERR_UNKNOWN_BUILTIN_MODULE`); `better-sqlite3` is
  resolvable but RevEng ships no `node_modules`, so the spike uses the `sqlite3` CLI.
- **Whole-document read** (NOT `ctx_search`, which returns partial query-focused snippets):
  ```sql
  SELECT chunks.content, chunks.timestamp, sources.label, sources.file_path, sources.content_hash
  FROM chunks JOIN sources ON sources.id = chunks.source_id
  ORDER BY chunks.rowid;
  ```
- **Whole-file cases only:** `sources.file_path NOT NULL` (set only by `ctx_index`/file-backed).
  Reassemble a file's chunks by `rowid`, dedupe heading/line-group overlap (naive concat
  duplicates lines), and **verify `sha256(reassembled) === sources.content_hash`**; reject on
  mismatch.
- **Verified schema (installed v1.0.126):**
  `sources(id, label, chunk_count, code_chunk_count, indexed_at, file_path, content_hash)`;
  `chunks(title, content, source_id, content_type, source_category, session_id, event_id,
  timestamp)` (FTS5; `session_id`/`event_id` NULL in normal flow). `label` is `"batch:…"` prose
  for `ctx_batch_execute`/`ctx_execute` output; `file_path`/`content_hash` are set only by
  `ctx_index`.

### Why neither store is usable
- Content store = ≤14-day cache → historical targets have expired (and were never indexed:
  reconstruction targets are *edited by the agent*, not `ctx_index`-ed).
- Session store = path-only metadata → no bytes.
- Transcript = summaries only → no bytes, no path beyond what discovery already has.

### Re-run recipe + reopen threshold
The read-only re-run gate is `tools/spike-item6-context-mode-yield.js` (Step 2). It resolves each
fixture transcript cwd → content DB, walks any existing DB read-only, and prints
`UNIQUE_TARGET_COVERAGE` = the count of probe targets for which context-mode holds verbatim,
whole-file-positionable content the transcript's own evidence lacks. **Reopen Item 6 only** if a
future dataset — run within the 14-day retention window on the originating machine — yields
`UNIQUE_TARGET_COVERAGE ≥ 5` with ≥1 `file_path`-backed (`ctx_index`) source. On the frozen
fixture the gate prints `UNIQUE_TARGET_COVERAGE: 0` → **NON-VIABLE**.

### The build design, if ever reopened (recorded, NOT built)
A `ctxStoreFile` whole-file overlay event kind fed by a *frozen export* of the relevant DB rows
(so the probe stays byte-identity reproducible), mirroring the Item-5 `grepMatches` triplet
(`grep-tool-{results,events,evidence}.js`) + its 5 wiring points (`KIND_NAMES`,
`line-state-evidence.js` dispatch, `apply-one-event.js` branch, `file-events-extractors.js`
emitter, `collectTouches`). CRITICAL: a whole-file kind must call `finishWholeOverlay` (sparse
kinds must NOT — the `apply-one-event.js` DEFAULT branch confirms EOF and would drop the tail);
and `api/line-state-evidence.js` is at 249/250 lines, so its `materializeEvent` dispatch must be
split into a sibling module BEFORE a new branch is added.

---

### Design decisions
- **The spike's two pure helpers are the only unit-tested surface** (per the plan): the DB-walk
  is integration-verified by running the spike against the frozen fixture (expected
  `UNIQUE_TARGET_COVERAGE: 0`). Helpers: `resolveContentDbPath(cwd)` and `isWholeFileSource(src)`.
- **SQLite backend = `sqlite3` CLI** via `child_process`, opened `file:<db>?mode=ro` + `-readonly`.
  Chosen over `node:sqlite` (unavailable here) and `better-sqlite3` (resolvable but RevEng has no
  `node_modules`, so depending on it would be fragile). Matches the plan's first-listed recipe.
- **Whole-file reassembly = naive concat of a source's chunk `content` in `rowid` order, then
  `sha256` hash-verify against `sources.content_hash`; reject on mismatch.** No overlap-dedup is
  implemented: a mismatch (e.g. from heading/line-group overlap) conservatively *fails* the
  candidate, which only ever undercounts toward 0 — safe for a kill-gate whose reopen threshold
  is ≥5. A genuine reopen would warrant a careful overlap-aware reassembler.
- **`cwdsWithDb` / `cwdsMissingDb` are counted per transcript** (matching the plan's "for each
  transcript JSONL"), not per unique cwd. `contentDBsFound` is the count of unique existing DBs.
- **"Absent from the transcript's own evidence"** is implemented by unioning
  `collectTouches(text).touches[].path` across all transcripts sharing a content DB's cwd; a
  whole-file candidate counts toward coverage only when its resolved absolute path is a known
  probe target, is NOT in that touched set, and is hash-verified verbatim.
- **Only DBs resolved from a fixture transcript cwd are opened.** The one extant content DB
  (`d7102…`, bezier) maps to no fixture cwd, so it is never opened → context-mode DB mtimes are
  trivially unchanged on the fixture run (read-only guarantee holds by construction here).
- **`transcripts` counts JSONL files that carry a session cwd** (a `system` record), i.e. main
  transcripts. The walker reads all 786 fixture JSONL files; 349 carry a cwd (11 unique
  jot-family cwds) and 437 are subagent transcripts with no `system` record, so they are not
  cwd-resolvable and contribute no DB lookup. This is consistent with — and reinforces — the
  survey finding that subagent transcripts carry no context-mode use at all.

### Verified run (frozen fixture `~/Programming/jot-recovery/probe-fixture-20260615/projects`)
`{ transcripts: 349, cwdsWithDb: 0, cwdsMissingDb: 349, contentDBsFound: 0, fileBackedSources: 0,
batchSources: 0, UNIQUE_TARGET_COVERAGE: 0 }` → **VERDICT: NON-VIABLE**. 11/11 unique cwds have
no content DB; content store byte-identical (sha+mtime+size) before/after the run; helper test
4/4; both new files ≤250 lines (243 / 44).

### Deviations
- **`probe-results-v2.json` has no `path` field.** The plan (Step 2.3) says derive targets from
  `filesInProject[].path`, but the actual entry schema is
  `{identityKey, earliestSeenFullPath, lastSeenFullPath, aliasPaths, status, comparedVia,
  replayVariant, referencePath, totalKeptEdits, replayedChars, replayedLines, transcriptsUsed,
  snapshotBlob, gitRef, dataSources}` (315 entries; `filesInProject[0].path === undefined`).
  The spike derives the target set from `earliestSeenFullPath` + `lastSeenFullPath` +
  `aliasPaths[]` (every path a probed file has been seen under). The verdict is unaffected
  (coverage is 0 regardless of target-set membership on the frozen fixture).

### Tradeoffs
- **`sqlite3` CLI vs `better-sqlite3`:** the CLI is zero-dependency and portable (RevEng ships no
  `node_modules`) and exactly matches the plan's `file:?mode=ro` recipe; the cost is shelling out
  per DB, negligible for a diagnostic and never exercised on the frozen fixture (0 DBs).
- **Naive concat vs overlap-aware reassembly:** chose conservative undercount over a complex
  reassembler that the gate (which prints 0) does not need; documented so a reopen can revisit.

### Open questions
None block the close-out — `UNIQUE_TARGET_COVERAGE` is 0 on the frozen fixture under every
reasonable choice below. Surfaced for your confirmation:
1. **Target-set field choice** — I treat `earliestSeenFullPath` + `lastSeenFullPath` +
   `aliasPaths[]` as the probe target set (the plan's `.path` does not exist). Confirm that
   matches your intent for the re-run gate, or restrict it to `earliestSeenFullPath` only.
2. **Naive-concat reassembly without overlap-dedup** — acceptable for the kill-gate as a
   conservative undercount? (A real reopen would need a careful reassembler.)
3. **The `batch:`/cat-detector arm** is intentionally a near no-op: observed `label`s are prose,
   not shell commands, so the detector for a bare `cat F` matches nothing (reported as
   `batchSources` for visibility). Confirm you don't want a deeper heuristic here.
