# Plan: per-line file-state tracking sidecar

## Context

Reconstruction today is whole-content: replay produces one string per file and the verdict is
binary (PASS/MISMATCH/NOT_FOUND). Partial evidence — split reads with gaps, truncated cats —
is either discarded or wrongly treated as full content. The split-read assembly experiment
(see implementation-notes-make-a-plan-for-recursive-clarke.md) proved per-line evidence is
recoverable and diffable. This sidecar tracks the state of ONE file at per-line granularity
across every event that touched it, keyed by time, and emits a diagnostic report. It does NOT
change PASS/MISMATCH decisions — it runs beside the existing pipeline (sidecar), and gets
promoted into verdict logic only if the reports prove out on the current 9 list1 MISMATCHes.

## Inputs

1. `--path <abs file>` — the file being reconstructed (a lineage key, like
   find-jsonls-for-file.js; need not exist on disk).
2. The JSONL list — the output of `tools/find-jsonls-for-file.js`, which must FIRST be
   extended to include subagent transcripts (`<project>/<sessionId>/subagents/agent-*.jsonl`).
   Accepted as `--jsonls <file.json>` (the tool-1 output shape) or computed internally from
   `--projects-dir` when omitted.
3. `--snapshots <dir>` — file-history base for snapshot blobs (same flag as probe-projects-v2).

## Beacons: guaranteed source-of-truth JSONL lines

Verified against the Claude Code source (utils/fileHistory.ts, utils/handlePromptSubmit.ts,
QueryEngine.ts, tools/File*Tool): certain JSONL lines are guaranteed truth —
"JSONL:<lineNum> is the state of <file> at <timestamp>". These anchor the evolution; all
other evidence is relative to the nearest preceding beacon and is VERIFIED by the next one.

**Tier 1 — beacons (guaranteed):**
1. **`file-history-snapshot` record with a live blob.** Top-level `type:
   'file-history-snapshot'`, `snapshot.trackedFileBackups[<path>].backupFileName` non-null,
   AND the blob file still exists under the file-history base. Blob bytes = exact file
   content at the record's `snapshot.timestamp`. Both sub-kinds are valid:
   - `isSnapshotUpdate: false` (written unconditionally at every user-turn start): fresh
     backup, or verified-unchanged reuse (`checkOriginFileChanged` mtime/content check) —
     either way the blob equals the file at that timestamp.
   - `isSnapshotUpdate: true` (written by `fileHistoryTrackEdit` at the moment of the
     file's FIRST edit this session): blob = pre-edit content at that record's timestamp.
2. **Absence beacon.** Same record kind with `backupFileName: null` — positive evidence
   the file did NOT exist at that timestamp (fileHistory.ts denotes deleted/missing tracked
   files this way). Today's pipeline DISCARDS this signal (buildSnapshotEdit returns null).
3. **Successful Write.** A Write tool_use whose tool_result confirms success: file =
   `input.content` exactly, at the result's timestamp. The truth is inline in the JSONL
   line itself — no blob needed.

**Beacon caveats (all must be handled):**
- Resume-copied snapshots: `copyFileHistoryForResume` re-appends the previous session's
  snapshot entry into the resumed transcript with its OLD embedded `snapshot.timestamp`.
  The beacon is valid at that embedded timestamp, NOT at its position in the resumed
  file. Dedup by (messageId, snapshot.timestamp).
- Snapshot keys may be shortened paths (`maybeShortenFilePath`) — match by full-path
  suffix, never basename (harness bug #1 from the probe work).
- Snapshots only appear in MAIN transcripts: `fileHistoryTrackEdit` is invoked by tools
  with the parent session's state, so subagent jsonls contribute reads/edits but never
  snapshot beacons.
- SDK/headless sessions may have NO snapshots at all (`fileHistoryEnabled()` is off
  unless opted in) — absence of beacons is a config artifact, not evidence.

**Tier 2 — near-beacons (truthful modulo known harness loss):** EOF-confirmed offset-less
Read (trailing-newline trim; >2000-char line truncation), complete + EOF-confirmed
split-read assembly, cat capture (newline trim, pipe/truncation risk).

**Tier 3 — relative evidence:** Edit old→new splices, read chunks (partial overlays).

**The windowed algorithm this enables:** beacons partition the timeline into windows.
State anchors at each beacon (full truth, by reference), accumulates Tier 2/3 evidence
through the window, and is verified against the next beacon. A divergence is then
localized to ONE inter-beacon window — far tighter than today's whole-history replay
verdict. The final window's closing beacon is on-disk content (or git, when on-disk is
gone).

## The tracking object (JSON shape)

Top-level dict keyed by **unix-ms timestamp** of each extracted event. Per-line entries
store **evidence references, not text** — every claim is a pointer to a JSONL line (or
blob), so the object is auditable and stays small; text is materialized in memory during
computation and dereferenced on demand for display:

Annotated as a JS literal because JSON cannot carry comments; persisted as plain JSON.
No example values — each comment states the intent of the property.

```js
{
  // The file whose evolution is tracked, by its canonical absolute path
  // (the probe's identityKey / latest known path).
  filePath: string,

  // Every path this file has had across rename/move/copy lineage. Events are
  // matched against ALL of these. Snapshot keys may be shortened paths, so
  // matching is by full-path suffix — never by basename.
  aliasPaths: [string],

  // Every transcript consulted — main sessions and subagents. Every evidence
  // reference in this object points into one of these files. Listing them
  // makes the report self-contained: reference + this list = dereferenceable.
  jsonlsScanned: [string],

  // The evolution itself. One entry per instant at which evidence exists,
  // keyed by unix-ms timestamp (as a string, because JSON keys are strings).
  // Iterating keys in numeric order replays the file's history. An entry
  // describes belief AFTER applying that instant's events.
  timeline: {
    "<unixMs>": {

      // ISO-8601 rendering of the key. For human reading only — the key is
      // the authoritative time.
      timestamp: string,

      // True when this instant is Tier-1 truth (snapshot with a live blob,
      // file-absent record, or success-confirmed Write). Beacons are the
      // anchor points: belief is exact here, and the belief accumulated
      // since the PREVIOUS beacon gets verified against this one. Any
      // disagreement becomes a conflict localized to that window.
      isBeacon: boolean,

      // The evidence applied at this instant. An array because distinct
      // events can share a millisecond; they apply in deterministic order
      // (jsonl path, then jsonlLine) so reruns are reproducible.
      events: [{

        // The transcript record this event came from — always present, always
        // first. The core design rule: every claim in this object must be
        // traceable to a JSONL line.
        jsonl: string,
        jsonlLine: number,

        // EXACTLY ONE of the following sub-objects is non-null; the rest are
        // null. Each groups the properties that exist only for that event
        // kind — a feature's properties live together, and a feature that
        // doesn't apply contributes no placeholder fields. The non-null
        // sub-object IS the event's kind; there is no separate kind string
        // to keep in sync with the payload.

        // A file-history-snapshot record with a live backup blob (Tier-1
        // beacon). Null for every other event kind.
        snapshot: {
          // Path to the blob whose bytes are the ENTIRE file at this
          // instant. The blob is the content store; this object never
          // duplicates it.
          blob: string,
          // Distinguishes the unconditional turn-start snapshot (false)
          // from the pre-first-edit capture written by fileHistoryTrackEdit
          // (true) — both are truth, but they mean different things about
          // what the session was doing at that moment.
          isSnapshotUpdate: boolean
        } | null,

        // A file-history-snapshot record whose backupFileName is null —
        // positive evidence the file did NOT exist at this instant (Tier-1
        // absence beacon). No properties: the record's existence is the
        // entire claim, and the jsonl/jsonlLine above is its proof.
        fileAbsent: {} | null,

        // A success-confirmed Write (Tier-1 beacon). No properties: the
        // full content is inline in the referenced JSONL record
        // (input.content), and only success-confirmed Writes become events
        // at all — an unconfirmed Write is excluded at extraction.
        write: {} | null,

        // An old_string -> new_string splice (Tier-3 relative evidence).
        edit: {
          // True when old_string could NOT be located in currently known
          // content — the edit landed somewhere unknowable (likely inside a
          // gap). Its effect on line count is unknown, so every line below
          // it loses numberingCertain until the next anchor re-establishes
          // positions. This flag is the honest version of what today's
          // replay does silently and wrongly.
          floating: boolean
        } | null,

        // An offset-less Read that witnessed the whole file including EOF
        // (Tier-2 near-beacon). No properties: classification as readFull
        // — rather than readChunk — already encodes "complete and
        // EOF-confirmed"; a Read that can't prove that is extracted as a
        // readChunk instead.
        readFull: {} | null,

        // A Read with offset/limit geometry covering a slice of the file
        // (Tier-3 partial overlay).
        readChunk: {
          // The slice covered, from the Read's offset/limit geometry. This
          // is what lets partial reads overlay precisely instead of
          // masquerading as whole files.
          firstLine: number,
          lineCount: number,
          // True when the chunk returned fewer lines than it requested —
          // the one case where a chunk proves where the file ENDS.
          hitEof: boolean
        } | null,

        // A Bash cat capture (Tier-2, weakest observation: stdout trims the
        // trailing newline and piping can truncate). No properties: the
        // caveats are uniform for the kind, and the captured text lives in
        // the referenced JSONL record.
        cat: {} | null
      }],

      // Per-line belief after this instant.
      //
      // At a beacon: the literal string "ALL". One reference (the beacon
      // event) covers every line of the file; a per-line map would be pure
      // redundancy. To read any line, dereference the beacon's blob/content.
      //
      // Otherwise: a map of file-line-number -> line entry. The key is the
      // line's position AS OF THIS INSTANT — inserts and deletes re-key
      // everything below them, which is exactly why entries hold evidence
      // pointers (stable) rather than text keyed to a moving position.
      lines: "ALL" | {
        "<fileLineNumber>": {

          // Epistemic status — what KIND of claim we are making:
          //   'authored' — content came from the edit itself (a Write or a
          //                located Edit supplied these bytes).
          //   'observed' — something read the file and saw this content at
          //                this instant (read/cat/snapshot evidence).
          //   'presumed' — carried forward from an earlier instant and not
          //                reverified since. Believed, not proven.
          //   'unknown'  — inside an observation gap or under a floating
          //                edit's shadow. No claim at all.
          state: string,

          // When this line's content was last established or verified. The
          // distance between this and the entry's timestamp is the line's
          // staleness — how long it has gone unconfirmed. Null when unknown.
          confirmedAtMs: number,

          // Position trust, SEPARATE from content trust. False for every
          // line downstream of a floating edit: the content reference may
          // still be right, but the line NUMBER is in doubt until the next
          // beacon or matching observation re-anchors it. Content questions
          // and position questions fail independently; conflating them
          // loses exactly the information a diagnostician needs.
          numberingCertain: boolean,

          // WHERE the content lives — never the content itself. Text is
          // always readable from the transcript/blob, so persisting it here
          // would bloat the object, rot if regenerated, and detach the claim
          // from its proof. Null when state is 'unknown' (no claim, no
          // evidence).
          //
          // This is the evidenceRef shape — defined once here, reused
          // verbatim by conflicts.presumed/.observed and
          // finalVerdict.mismatchedLines.evidence.
          evidence: {
            // The transcript and record the content came from. Parsing that
            // line yields a dict; the sub-objects below say where inside the
            // dict the text is and how to slice this line out of it.
            jsonl: string,
            jsonlLine: number,

            // EXACTLY ONE of the following is non-null (same grouping rule
            // as events): the dereference recipe depends on the SHAPE of the
            // value holding the content, and each shape needs different
            // locator fields.

            // The content sits in a string-valued property of the parsed
            // record: a read result, a Write's input.content, a cat stdout,
            // an Edit's input.old_string / input.new_string — all just
            // strings once parsed.
            textProperty: {
              // Path to the property within the parsed dict, e.g.
              // "message.content[0].content" or
              // "message.content[0].input.new_string".
              property: string,
              // Substring bounds of THIS line within that string value
              // (endIndex exclusive). For numbered read results the span
              // covers only the content after the "N\t" prefix — the
              // dereference yields the line's text, not its decoration.
              startIndex: number,
              endIndex: number
            } | null,

            // The content sits inside a structuredPatch value (an array of
            // hunks, each with a lines array) — index-addressed, not
            // substring-addressed, because the value is structured data,
            // not one text blob.
            structuredPatch: {
              // Path to the patch within the parsed dict, e.g.
              // "toolUseResult.structuredPatch".
              property: string,
              hunkIndex: number,
              // Index into that hunk's lines array. The consumer strips the
              // leading +/-/space diff marker; the marker is diff syntax,
              // not file content.
              lineIndex: number
            } | null,

            // The content lives OUTSIDE the record, in a snapshot backup
            // blob — the record only names it. Both the pointer's
            // provenance (which property named the blob) and the resolved
            // location are kept, so the chain record -> blob -> bytes stays
            // auditable end to end.
            blobFile: {
              // Path to the backup entry within the parsed dict, e.g.
              // "snapshot.trackedFileBackups['common/scripts/x.py']".
              property: string,
              // Resolved blob path under the file-history base.
              path: string,
              // Substring bounds of THIS line within the blob's bytes
              // (endIndex exclusive).
              startIndex: number,
              endIndex: number
            } | null
          }
        }
      },

      // Roll-up so the timeline can be scanned without opening per-line maps.
      summary: {
        // Lines with any claim: authored + observed + presumed.
        knownLines: number,
        // Gap lines whose existence (and count) is implied by observation
        // geometry — known to exist, content unknown.
        unknownLines: number,
        // Highest line number we know about. NOT necessarily the file's
        // length — see eofConfirmed.
        lastLine: number,
        // Whether end-of-file was actually witnessed (a read returning fewer
        // lines than requested, a limit-less read, or a snapshot). Contiguity
        // from line 1 WITHOUT this can be a silently truncated prefix — the
        // central lesson of the split-read experiment.
        eofConfirmed: boolean,
        // knownLines / (knownLines + unknownLines), for ranking files by how
        // well-evidenced their reconstruction is.
        coveragePct: number
      }
    }
  },

  // The diagnostic payoff. Every time an observation CONTRADICTED current
  // belief, one record lands here. The observation wins the line (newer
  // evidence); this list preserves what was displaced and where both sides'
  // proof lives.
  conflicts: [{
    // Unix-ms — always equal to a timeline key, so
    // timeline[timestampOfContradictingRecord] is the entry where the
    // observation displaced the belief (join key, same clock as the
    // timeline). NOT when the file actually changed: the change happened
    // somewhere between the displaced belief's last confirmation and this
    // moment of discovery; `window` below bounds that span by beacons.
    timestampOfContradictingRecord: number,
    // The file line (as numbered at that instant).
    line: number,
    // What we believed, as an evidenceRef (the shape defined in the lines
    // entry above) — auditable, not asserted.
    presumed: evidenceRef,
    // What the observation showed, same shape.
    observed: evidenceRef,
    // Short inline text of both sides, PURELY for human reading of the
    // report. The references above are the authoritative data; these strings
    // are a convenience rendering.
    excerpt: { presumedText: string, observedText: string },
    // The inter-beacon window this divergence is localized to. This is the
    // whole point of beacons: "the file changed unexpectedly somewhere
    // between these two moments of certainty."
    window: { fromBeaconMs: number, toBeaconMs: number }
  }],

  // End-state comparison of final belief against the best available
  // reference, reusing the probe's source ladder (on-disk, else snapshot,
  // else git). This is the per-line generalization of PASS/MISMATCH.
  finalVerdict: {
    // Which reference the comparison used — the probe's source ladder, first
    // available wins:
    //   'on-disk'  — the file exists at lastSeenFullPath; compared against it.
    //   'snapshot' — file gone from disk; compared against the latest
    //                file-history backup blob.
    //   'git'      — no disk, no snapshot; compared against the file's last
    //                git-recoverable content.
    //   'none'     — no reference exists anywhere; perLineStats and
    //                mismatchedLines are empty and the verdict only reports
    //                what the timeline believed (the NOT_FOUND analogue).
    comparedVia: string,
    // Counts of final-belief lines by comparison outcome — statistics only,
    // no per-line detail (that lives in mismatchedLines). matchedPresumed
    // counting separately from matchedObserved matters: it says how much of
    // the "match" rests on unverified carry-forward versus actual
    // observation.
    perLineStats: {
      matchedObserved: number,
      matchedPresumed: number,
      mismatched: number,
      neverObserved: number
    },
    // One record per divergent line: its number, the state it held when the
    // timeline ended, the evidence reference for our version, and a short
    // excerpt of both sides for reading.
    mismatchedLines: [{
      line: number,
      lastState: string,
      // evidenceRef — the same value the FINAL timeline entry holds for this
      // line (lines[line].evidence), or derived from the beacon's blob when
      // that entry is a beacon with lines: "ALL". Copied here rather than
      // pointed at, so the verdict is self-contained: a reader gets from a
      // divergent line to its proof without walking the timeline backwards.
      evidence: evidenceRef,
      excerpt: { reconstructed: string, reference: string }
    }],
    // True when the final extent of the file was never EOF-confirmed — the
    // verdict may be comparing against a truncated belief, and says so.
    tailUncertain: boolean
  }
}
```

(The `state` taxonomy, `numberingCertain`, evidenceRef dereference recipes, and conflict
semantics are documented in-place in the schema comments above — the schema is the
authoritative documentation; this plan does not restate it.)

## Event semantics (how each kind transforms the line belief)

Kinds are named by which sub-object is non-null on the event (`snapshot`, `fileAbsent`,
`write`, `edit`, `readFull`, `readChunk`, `cat`):

- **`write`** (Tier-1 beacon): replaces all belief; the timeline entry gets
  `lines: "ALL"` with the Write record as its single reference; total length and EOF known.
- **`snapshot`** (Tier-1 beacon): same collapse to `lines: "ALL"`, referenced via the blob.
  Also the verification point: belief accumulated since the previous beacon is compared
  against the blob first — each disagreeing line creates a conflict record — and only then
  does the beacon become the new anchor.
- **`fileAbsent`** (Tier-1 beacon): belief becomes "no lines exist"; `lastLine` 0,
  `eofConfirmed` true. The next content evidence starts from nothing.
- **`edit`** (kept-status only — reuse the existing statusByLine classification): locate
  old_string in the contiguous known text. Found → splice; replaced lines become
  `authored`; lines below shift by (newLines − oldLines), re-keyed. Not found in known
  text but possibly inside an `unknown` region → mark the event `floating: true`; the
  unknown region's length becomes uncertain and all lines below it get
  `numberingCertain: false`. (Today's replay silently produces wrong content in this case;
  the tracker knows that it doesn't know.)
- **`readChunk`**: overlay the covered lines. Equal to current belief → upgrade to
  `observed`, refresh `confirmedAtMs` (corroboration — also re-anchors numbering:
  `numberingCertain` true for the covered span). Different → create a conflict record,
  take the observed text. `hitEof: true` additionally fixes `lastLine`/`eofConfirmed`.
- **`readFull` / `cat`** (Tier-2): whole-file overlay, same per-line rules as `readChunk`,
  plus `lastLine`/`eofConfirmed`. `readFull` is EOF-confirmed by classification (a Read
  that can't prove completeness is extracted as a `readChunk`); `cat` carries the known
  newline-trim/pipe-loss caveats.
- Timestamp collisions (two events in the same ms): the entry's `events` is an array;
  applied in deterministic order (jsonl path, then jsonlLine). The timeline key stays unique.

Memory note: per-line maps exist only on NON-beacon entries (beacons collapse to
`lines: "ALL"`), so cost is O(non-beacon events × lines) — fine for a one-file diagnostic
tool (plate_summary: ~30 events × ~300 lines). If it ever matters, the documented fallback
is storing only changed lines per entry plus a full map on the final non-beacon entry; the
shape above stays the contract either way.

## What exists vs what we need

**Already built (reuse, don't rewrite):**
- Snapshot detection + blob reading with a missing-blob guard: `common/extract-file-state.js`
  (`getSnapshotBackups`, `buildSnapshotEdit` returns null when the blob is unreadable,
  `findLastSnapshotBlob`). So "valid file-history-snapshot whose blob still exists" IS
  detected today — but only as a content checkpoint for replay, not as a timestamped beacon.
- Authored-edit extraction with kept/ignored classification: `replay.extractEditsFromJSONL`
  + `classify.analyzeJSONL` statusByLine.
- Chunked-read extraction with geometry: `tools/assemble-split-reads.js` (this session).
- Path-suffix alias matching for shortened snapshot keys: probe-v2-assembly's
  `editBelongsToFile` logic.

**Missing (the actual build list):**
1. **Timestamps on events.** Edit/snapshot records are keyed by JSONL line index only —
   map line index → record `timestamp` during extraction (Phase 2's core addition).
2. **Beacon semantics in the snapshot extractor:** keep `isSnapshotUpdate`, keep
   `snapshot.timestamp` vs record position, dedup resume-copied entries by
   (messageId, snapshot.timestamp), and STOP discarding `backupFileName: null`
   (today's buildSnapshotEdit drops the absence beacon).
3. **Write-success confirmation** for the Write beacon (today's extraction takes the
   tool_use input without checking the tool_result).
4. **Subagent jsonl discovery** (Phase 1) — for reads/edits only; beacons never live there.
5. **The windowed tracker itself** (Phase 3) — anchor at beacon, accumulate, verify at
   next beacon, emit conflicts with window refs.
6. **`baseHistoryDir` threading** — already a known deferred item from the probe handoff:
   snapshot blob reads default to `~/.claude/file-history`; the sidecar must take
   `--snapshots` and pass it through everywhere (breaks on foreign machines otherwise).

## Implementation phases (strict red-green TDD throughout)

### Phase 1 — subagent-aware find-jsonls-for-file
- New `common/subagent-jsonls.js` (~60 lines): `enumerateSubagentJsonls(projectsDir)` →
  every `<project>/<sessionDir>/subagents/agent-*.jsonl`; plus
  `subagentJsonlsReferencing(aliasPaths, projectsDir)` filtering by the same touch test
  `findReferencingJsonls` uses (collect-touches.js is EXACTLY 300 lines — do not grow it;
  the new module requires from it instead).
- `tools/find-jsonls-for-file.js`: include matching subagent transcripts in `referencedIn`
  by default (the parent session's main jsonl and its subagents sort adjacently).
- Tests: `tests/test-subagent-jsonls.js` (fixture: project folder with
  `<sid>/subagents/agent-a.jsonl` touching the target; assert enumeration + filtering;
  assert a non-referencing subagent is excluded).

### Phase 2 — per-file event extraction with timestamps
- New `tools/extract-file-events.js`: `extractFileEvents(jsonlPath, aliasPaths, snapshotsDir)`
  → events in the schema's shape: `{jsonl, jsonlLine, unixMs, timestamp}` plus exactly one
  non-null kind sub-object (`snapshot` | `fileAbsent` | `write` | `edit` | `readFull` |
  `readChunk` | `cat`) carrying that kind's fields. Reuses:
  `replay.extractEditsFromJSONL` + `classify.analyzeJSONL` statusByLine (kept edits only;
  same filtering as probe-v2-assembly's assembleKeptEdits), `assemble-split-reads`'
  `extractReadEvents` (chunk geometry → `readChunk.firstLine`/`lineCount`/`hitEof`),
  extract-file-state's snapshot extraction + blob reads (→ `snapshot.blob`/
  `isSnapshotUpdate`, and `fileAbsent` where today's code discards the null-backup signal).
  Timestamps: map each edit's `line` index to that record's `timestamp` (read the jsonl
  lines once; edits currently don't carry timestamps).
- Tests: `tests/test-extract-file-events.js` — each kind lands in its own sub-object with
  the others null, with correct unixMs; Write without success confirmation excluded; a
  Read that can't prove EOF extracts as `readChunk`, not `readFull`; ignored (rejected)
  edits excluded; alias-path filtering (full-path suffix rule for snapshot shortened
  paths — do NOT reintroduce harness bug #1).

### Phase 3 — the tracker
- New `tools/track-line-states.js`: `trackLineStates(events)` applies the semantics above,
  returns the tracking object; CLI
  `node tools/track-line-states.js --path <file> [--jsonls <out.json>] [--projects-dir d] [--snapshots d] [--out report.json]`,
  default `--out` next to the tool, prints the summary + conflicts + finalVerdict to stdout.
- Tests: `tests/test-track-line-states.js` — write/snapshot produce beacon entries with
  `lines: "ALL"`; located edit splices and shifts downstream keys; floating edit sets
  numberingCertain=false below the gap; readChunk corroborates (presumed→observed);
  readChunk disagreement creates a conflict record carrying both evidenceRefs, the
  excerpt, `timestampOfContradictingRecord` equal to the entry's timeline key, and the
  beacon-bounded `window`; fileAbsent zeroes belief; snapshot fixes eofConfirmed; same-ms
  events apply in deterministic order; finalVerdict `perLineStats` counts and
  `mismatchedLines` evidenceRefs vs an on-disk fixture.

### Phase 4 — run on real residuals
- Run against `plate_summary.py` first (known answer: the conflict/mismatch must localize
  to the blank line after the import block — that's the acceptance test), then the other 8
  list1 MISMATCHes. Capture reports under `tools/line-state-reports/` (gitignore-style
  scratch), summarize findings in the implementation notes.

## Constraints carried forward
- 300-line cap per file; single-condition `if`s (nest, never `&&`/`||`); never the word
  "corpus"; lint hook runs `tests/test-<basename>.js` on every edit — name test files
  accordingly; pure shaping separable from IO.

## Verification
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
node tests/test-subagent-jsonls.js && node tests/test-extract-file-events.js && node tests/test-track-line-states.js
node tools/find-jsonls-for-file.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects   # now lists subagent jsonls too
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history
# acceptance: finalVerdict localizes the known 1-line whitespace divergence; conflicts list
# pinpoints the May 16→17 docstring rewrite the assembly experiment found by hand.
```
