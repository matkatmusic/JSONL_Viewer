# Plan: Item 5.5 — Apply the File-path-handling convention to the raw-matching kinds

## Goal (one sentence)
Make the three remaining RAW-path match sites (`cat` emission, `cat` touch collection, and the
item-4 bash reads) resolve each captured path with `resolveAgainstCwd(sessionCwd, rawPath)` BEFORE
the `aliasSet` test, so a relative path (e.g. `cat sub/f.py`) matches the file's absolute alias.

## Decisions baked in (resolved during the planning pass — do NOT re-litigate)
1. **Scope = path resolution only.** Bash-reads becoming discovery *touches* is OUT of 5.5 and is
   recorded as a new stub item (Step 0). 5.5 touches exactly three functions.
2. **Full 5.5, re-baseline only if the probe actually diverges.** Implement all three sites; run the
   probe A/B gate; if (and only if) it diverges, prove the change is scoped + enrichment, then
   advance `develop-baseline`. The emission sites (Steps 1–2) are provably probe-safe; only the
   touch site (Step 3) can move probe output.

## Why these three sites, and which is probe-affecting (read before editing)
The probe (`tools/probe-projects-v2.js`) reconstructs via `extractEditsFromJSONL` + `replayEdits`
and discovers files via `collectTouches` (`api/file-historical-lineage.js`). It does **not** call
the kind-event emission pipeline (`catEventsForFile` / `bashReadEventsForFile`). Therefore:
- **Emission resolution (Steps 1, 2)** feeds only the sidecar tracker → **tracker-only, probe-safe**.
- **Touch resolution (Step 3)** feeds `collectTouches` → **discovery → re-baselines the probe**.

Measured on the frozen fixture (`~/Programming/jot-recovery/probe-fixture-20260615/projects`):
96 `cat` commands, 6 relative; **exactly 2 relative cats newly resolve to probe targets** —
`…/Programming/jot/.claude-plugin/plugin.json` and `…/marketplace.json` (both currently
`status: PASS`, on-disk, `transcriptsUsed` 3 and 10). So Step 3 *may* move probe output for those
two files; whether reconstructed bytes actually change (vs. only discovery bookkeeping) is decided
empirically in Step 4.

## The convention to apply (the template)
`api/bash-op-events.js` already does this — copy its shape:
```js
var resolveAgainstCwd = require('./file-historical-lineage').resolveAgainstCwd;
var extractSessionMetadata = require('./transcript-parsers').extractSessionMetadata;
// ...
var cwd = extractSessionMetadata(jsonlText).cwd;     // once per file, from the transcript text
var resolved = resolveAgainstCwd(cwd, rawPath);      // expand ~, join against cwd if relative
if (!aliasSet.has(resolved)) { /* skip */ }          // match the RESOLVED absolute path
```
Require-cycle safety: neither `file-historical-lineage` nor `transcript-parsers` imports
`bash-read-events` or `file-events-extractors`, and `bash-op-events` already load-time-requires
both of these modules, so the same two `require`s are safe in Steps 1 and 2.

Coding standards for every snippet below: one condition per `if` (no `&&`/`||` in conditions —
nest instead); ternary only for value-selection; one brief comment per function; each edited file
stays **≤ 250 lines** (the post-write hook re-checks the WHOLE file).

---

## Step 0 — Record the deferred sub-item (housekeeping, no code)
**File:** `plans/roadmap-100-percent-reconstruction.md`, immediately after item 5.5.
Add a stub so the deferral is tracked, not dropped:
```
- [ ] **5.6. Bash-reads as discovery touches.** head/tail/sed/`grep -n`/`wc -l` reads are NOT
  yet file touches, so a transcript that only bash-reads a file never discovers it (cat and
  native Grep already are touches — `collectGrepTouches`). Mirror `collectGrepTouches`: add a
  `collectBashReadTouches(parsed, cwd)` and wire it into `collectTouches`. Discovery change →
  probe re-baseline. Related: item 17 (read-scanner unification).
```

---

## Step 1 — Bash-read emission resolution (tracker-only)
**File:** `api/bash-read-events.js` (currently 116 lines → ~120 after; safe).
The raw match is at line 85: `if (!ctx.aliasSet.has(parsedCmd.path)) { return null; }`. The
`jsonlText` param of `bashReadEventsForFile` (line 99) is already reserved for exactly this.

### 1a — Failing test first (RED)
**File:** `tests/test-bash-read-events.js` (append). Reuse this file's existing bash-read fixture
builders + `test-helpers` `makeSystemLine` (exported) for the cwd-bearing `system` record.
```
test_bashReadEventsForFile_matches_a_relative_read_path_resolved_against_session_cwd
  // Behavior: a `head` whose RAW path is relative emits a bashReadChunk event only when the
  // file's aliasSet contains the path RESOLVED against the transcript's session cwd.
  // Step: build a transcript = [ system(cwd='/abs/proj'), Bash head 'head -n 5 sub/f.py' use,
  //   its tool_result with 5 lines of stdout ]; jsonlText = lines joined; parsed = lines parsed.
  // Step: aliasSet = Set(['/abs/proj/sub/f.py']) (the RESOLVED absolute path).
  // Step: call bashReadEventsForFile(jsonlPath, jsonlText, parsed, aliasSet).
  // Step: assert exactly one event, kind 'bashReadChunk', at the result record's 1-based line.
  // Step (control): with aliasSet = Set(['sub/f.py']) (the RAW path), assert ZERO events
  //   (proves matching is on the resolved path, not the raw one).
```
Run `node tests/test-bash-read-events.js` → the first assertion FAILS (raw `sub/f.py` ≠ resolved).

### 1b — Minimum code to pass (GREEN)
1. Add the two requires (top of file, after the existing requires):
   ```js
   var resolveAgainstCwd = require('./file-historical-lineage').resolveAgainstCwd;
   var extractSessionMetadata = require('./transcript-parsers').extractSessionMetadata;
   ```
2. In `bashReadEventsForFile`, derive cwd once and carry it on `ctx`:
   ```js
   function bashReadEventsForFile(jsonlPath, jsonlText, parsed, aliasSet) {
     var cwd = extractSessionMetadata(jsonlText).cwd;
     var ctx = { jsonlPath: jsonlPath, parsed: parsed, aliasSet: aliasSet, pending: {}, cwd: cwd };
     // ...unchanged loop...
   }
   ```
3. Replace the raw match in `emitResultEvent` (line 85):
   ```js
   var resolved = resolveAgainstCwd(ctx.cwd, parsedCmd.path);
   if (!ctx.aliasSet.has(resolved)) { return null; }
   ```
4. Update the `bashReadEventsForFile` comment (lines 96–98): `jsonlText` is now USED for the
   session-cwd lookup (no longer "reserved"); matching is resolved-vs-aliasSet (no longer "raw…like
   cat"). This applies to all three item-4 kinds (`parseBashReadCommand` returns `.path` for
   `bashReadChunk`, `bashExtent`, `bashGrep`), so all three benefit from one change.

---

## Step 2 — Cat emission resolution (tracker-only)
**File:** `api/file-events-extractors.js` (currently 233 lines → ~236 after; safe).
The raw match is `catEventsForFile` line 181: `if (!aliasSet.has(catEdits[i].filePath)) { continue; }`.
Note: `extractBashCatEdits(lines, parsed)` ignores its `lines` param (`scanToolUseResults` reads
only `parsed`), so the unused `lines` slot can be replaced by `jsonlText`.

### 2a — Failing test first (RED)
**File:** `tests/test-file-events-extractors.js` (append). Reuse `test-helpers`
`makeSystemLine`, `makeBashCatToolUse`, `makeBashCatToolResult`.
```
test_catEventsForFile_matches_a_relative_cat_path_resolved_against_session_cwd
  // Behavior: a `cat sub/f.py` (relative) emits a 'cat' event only when the file's aliasSet
  // contains the path RESOLVED against the transcript's session cwd.
  // Step: transcript = [ system(cwd='/abs/proj'), Bash 'cat sub/f.py' use, its cat result w/ stdout ].
  // Step: aliasSet = Set(['/abs/proj/sub/f.py']); call catEventsForFile(jsonlPath, jsonlText, parsed, aliasSet).
  // Step: assert exactly one event, kind 'cat', at the result record's 1-based line.
  // Step (control): aliasSet = Set(['sub/f.py']) → assert ZERO events.
```
Run → first assertion FAILS.

### 2b — Minimum code to pass (GREEN)
1. Add the two requires if absent (confirm first — `resolveAgainstCwd` is reachable, this file
   already imports `bash-op-events` which imports it):
   ```js
   var extractSessionMetadata = require('./transcript-parsers').extractSessionMetadata;
   var resolveAgainstCwd = require('./file-historical-lineage').resolveAgainstCwd;
   ```
2. Change `catEventsForFile` to take `jsonlText` (replacing the unused `lines`) and resolve:
   ```js
   // cat events for every Bash cat capture of this file. The raw cat path may be relative, so
   // resolve it against the session cwd before the alias test (File-path-handling convention).
   function catEventsForFile(jsonlPath, jsonlText, parsed, aliasSet) {
     var cwd = extractSessionMetadata(jsonlText).cwd;
     var catEdits = extractBashCatEdits(jsonlText.split('\n'), parsed);
     var events = [];
     for (var i = 0; i < catEdits.length; i++) {
       var resolved = resolveAgainstCwd(cwd, catEdits[i].filePath);
       if (!aliasSet.has(resolved)) { continue; }
       var isoTimestamp = recordTimestampAt(parsed, catEdits[i].line);
       if (!isoTimestamp) { continue; }
       events.push(createKindEvent(jsonlPath, catEdits[i].line + 1, isoTimestamp, 'cat', {}));
     }
     return events;
   }
   ```
3. Update the call site (currently line 210) to pass `jsonlText` instead of `lines`:
   ```js
   Array.prototype.push.apply(events, catEventsForFile(jsonlPath, jsonlText, parsed, aliasSet));
   ```
   (`lines` remains defined and used elsewhere in `extractFileEventsFromText`.)

---

## Step 3 — Cat touch resolution (probe-affecting)
**File:** `api/file-historical-lineage.js` (currently 240 lines → ~243 after; TIGHTEST file —
keep the diff to one new line + a 2-line comment; if anything would exceed 250, STOP and ask
before extracting). `resolveAgainstCwd` is already defined in-module (no import needed).
The raw path is recorded in `appendEditTouches` (line 65): `path: edits[i].filePath`. For
cat-sourced edits (`touchKindForEdit` already special-cases `edit.source === 'cat'` → `'read'`),
this is the RAW command path.

### 3a — Failing test first (RED)
**File:** `tests/test-file-historical-lineage.js` (append). Use `test-helpers`
`makeSystemLine` + `makeBashCatToolUse`/`makeBashCatToolResult`.
```
test_collectTouches_resolves_a_relative_cat_touch_to_an_absolute_path
  // Behavior: collectTouches records a cat of a RELATIVE path as a touch whose path is resolved
  // against the transcript's session cwd (so discovery matches the file's absolute alias).
  // Step: transcript text = [ system(cwd='/abs/proj'), Bash 'cat sub/f.py' use, cat result w/ stdout ].
  // Step: call collectTouches(jsonlText).
  // Step: assert touches contains an entry { kind: 'read', path: '/abs/proj/sub/f.py' }
  //   (the RESOLVED absolute path), and NOT the raw 'sub/f.py'.
```
Run → FAILS (touch path is the raw `sub/f.py`).

### 3b — Minimum code to pass (GREEN)
1. Give `appendEditTouches` a `cwd` param and resolve cat-sourced paths (ternary = value-selection,
   allowed; read/write/edit paths are already absolute so they pass through unchanged):
   ```js
   // Append write/edit/cat touches drawn from extractEditsFromJSONL. cat-sourced edits carry the
   // RAW command path (possibly relative); resolve those against the session cwd before recording
   // the touch. read/write/edit paths already arrive absolute and pass through unchanged.
   function appendEditTouches(touches, jsonlText, cwd) {
     var edits = extractEditsFromJSONL(jsonlText);
     for (var i = 0; i < edits.length; i++) {
       var kind = touchKindForEdit(edits[i]);
       if (!kind) { continue; }
       var touchPath = edits[i].source === 'cat' ? resolveAgainstCwd(cwd, edits[i].filePath) : edits[i].filePath;
       touches.push({ kind: kind, path: touchPath, line: edits[i].line });
     }
   }
   ```
2. Update the caller in `collectTouches` (line 128) to pass the already-computed `cwd`:
   ```js
   appendEditTouches(touches, jsonlText, cwd);
   ```

---

## Step 4 — Gates, probe A/B, and conditional re-baseline
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

1. **Full suite** (3 new tests added to existing suites → no new suite file): expect
   **56 suites / 582 passed / 0 failed** (was 56/579 after item 6). Use the loop command from
   `plans/handoff-develop-20260616-1858.md` §How to Verify.
2. **detect-rewinds**: `node tests/detect-rewinds.test.js` → 15 passed / 0 failed.
3. **Sidecar e2e (`plate_summary.py`)**: run the §4 command from that handoff; expect
   `perLineStats` 247/247, 0 mismatched, conflicts 233. Emission resolution (Steps 1–2) feeds the
   tracker; confirm no regression (if `plate_summary.py` is only ever cat'd by ABSOLUTE path,
   this is unchanged — verify, don't assume).
4. **Probe A/B byte-identity** vs `develop-baseline` (the §3 command), against the FROZEN fixture:
   - **If `identical: true`** → Step 3's touch resolution did not move probe output on the fixture
     (the relative-cat transcripts were already discovered, or their cat edits are not assembled
     into reconstruction). DONE — no re-baseline. Record this outcome.
   - **If `identical: false`** → this is the EXPECTED, intentional case. Before re-baselining:
     a. Diff the two probe JSONs (strip `generatedAt`) and list every `filesInProject` entry whose
        fields changed. **Assert the changed set is a subset of the files reachable via the 6
        relative cat paths** (expected: `plugin.json`, `marketplace.json`).
     b. **Assert no regression**: every changed entry keeps `status: PASS` (no PASS→MISMATCH); the
        change is enrichment (more `transcriptsUsed` / unchanged-or-better `replayed*`). Capture the
        per-file before/after (status, replayedLines, replayedChars, transcriptsUsed) for the notes.
     c. **Surface (a)+(b) to the user** and confirm the divergence is intended.
     d. **Re-baseline `develop-baseline`** to the post-5.5 source tree (the user pre-approved
        re-baselining): first determine whether `develop-baseline` is a branch or a tag
        (`git for-each-ref --format='%(objecttype) %(refname)' | grep develop-baseline`), then
        advance that ref to a new commit snapshotting the current working-tree source (the same
        capture method used for the original baseline). Verify by re-running the A/B → now
        `identical: true`. Do NOT hand-edit `tools/probe-results-v2.json` to force a match.
5. **Line caps**: `wc -l api/bash-read-events.js api/file-events-extractors.js
   api/file-historical-lineage.js` — all ≤ 250.

## Step 5 — Close out
- Flip `plans/roadmap-100-percent-reconstruction.md` item 5.5 `[ ]`→`[x]` with a DONE block in the
  item-1..5 style: the three resolved sites, the empirical fixture finding (2 relative cats →
  plugin.json/marketplace.json), the probe outcome (byte-identical OR re-baselined-with-evidence),
  and gate numbers.
- Write `plans/implementation-notes-item5.5-filepath-resolution.md` (template + design decisions,
  deviations, the probe A/B outcome, and any re-baseline evidence). Reference this plan and the
  JSONL log.

## Verification checklist (must all hold before declaring done)
- [ ] Each of Steps 1–3 had a test that FAILED before the code change and PASSED after (red→green).
- [ ] Full suite 56/582/0; detect-rewinds 15/0; sidecar e2e 247/247.
- [ ] Probe A/B either byte-identical OR re-baselined with a scoped, no-regression diff that the
      user confirmed.
- [ ] All three edited files ≤ 250 lines.
- [ ] Roadmap 5.5 flipped; 5.6 stub added; implementation notes written.

## Constraints honored
- **Survey/decision settled first**: bash-reads-as-touches deferred (Step 0); re-baseline path chosen.
- **Strict red-green TDD** for all three sites (tests fail first).
- **One condition per `if`**; ternary only for value-selection; one comment per function.
- **250-line cap** on every edited file (`file-historical-lineage.js` is the binding constraint).
- **No probe run against live claude-data** — the A/B reads the frozen fixture only.
- **No silent probe mutation** — re-baseline (if any) advances `develop-baseline` with evidence,
  never by editing the results JSON.

## Critical files
- Edit: `api/bash-read-events.js` (Step 1), `api/file-events-extractors.js` (Step 2),
  `api/file-historical-lineage.js` (Step 3).
- Tests: `tests/test-bash-read-events.js`, `tests/test-file-events-extractors.js`,
  `tests/test-file-historical-lineage.js` (+ integration via `tests/test-track-line-states*.js`).
- Template (do NOT edit — copy its shape): `api/bash-op-events.js`.
- Roadmap: `plans/roadmap-100-percent-reconstruction.md` (Step 0 stub + Step 5 flip).
- Probe gate: `plans/handoff-develop-20260616-1858.md` §How to Verify (exact commands);
  `tools/probe-projects-v2.js` (reconstructs via `extractEditsFromJSONL`+`replayEdits`, discovers
  via `collectTouches` — why only Step 3 is probe-affecting).
- Reference for Step 3's tightness: `api/file-historical-lineage.js` is at 240/250.
