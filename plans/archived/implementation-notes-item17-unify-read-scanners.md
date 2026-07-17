## 2026-06-17:19:45:00 — Item 17: Unify the two read-event scanners
Chat title: implement RevEng item 17 — unify the two read-event scanners
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/cbd265ed-bba2-4c86-958d-9558deab7fa8.jsonl

### References
/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-wiggly-pixel.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1940.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md

### Going-in state (measured 2026-06-17)
- develop-baseline = a8947fc (UNCHANGED); HEAD = 1a9f098.
- Full suite: 67 suites / 679 passed / 0 failed.
- File line counts: file-event-observations.js 278, split-read-assembly.js 169,
  edit-stream-extraction.js 244, file-historical-lineage.js 246, file-events-extractors.js 247.

### Design decisions
- **Canonical superset record + two derivations.** `scanReadEvents(lines, parsed)`
  (`api/read-event-scanner.js`) ALWAYS emits one record per paired Read (valid or not);
  `chunkEventToEditRecord` (A shape) and `chunkEventToReadEvent` (B shape) apply each legacy
  scanner's drop rule, so the superset is the union of both capture sets.
- **`isValidRead` replicates A's exact gate on the RAW string.** Implemented as
  `isValidStringRead(item)`: `typeof item.content !== 'string' → false`, else
  `isValidReadContent(item.content)`. This is computed on the RAW content (NOT `strippedContent`)
  to match legacy `extractReadEdits` byte-for-byte — a file whose first numbered line is
  `"1\tError…"` is VALID under A (Error not at index 0 of the raw string) but would be wrongly
  rejected if validity were tested on the stripped content. Deviation from the plan's literal
  `isValidRead: isValidReadContent(strippedContent)` — see Deviations. Verified by the Task-8
  characterization golden.
- **Reused spine + record builder (no duplication).** `scanToolUseResults` and `buildEditRecord`
  are EXPORTED from `api/file-event-observations.js` and imported by the scanner (their canonical
  home — `extractBashCatEdits` still uses the spine). `stripCatLineNumbers` is likewise imported
  (cat still needs it). Only `isValidReadContent`, `toolResultText`, `parseNumberedContent`,
  `NUMBERED_LINE_PATTERN` were MOVED into the scanner (their only consumer was the retired Read
  scan).
- **`extractReadEvents` kept as a scanner-backed adapter in `split-read-assembly.js`.** Rather than
  deleting the name (which would force a rewrite of the CLI + `test-split-read-assembly.js`), it is
  reimplemented in 3 lines over the canonical scan:
  `scanReadEvents(lines, parsed).map(chunkEventToReadEvent).filter(Boolean)`. This removes the
  duplicated scan helpers (the actual target of the item) while routing the CLI and its tests
  THROUGH the unified scan. The Task-9 characterization proves the adapter ≡ legacy
  `extractReadEvents`.
- **Characterization goldens inlined (Tasks 8–9)** in `tests/test-read-event-scanner.js`, captured
  from the legacy scanners on a divergence-rich transcript (tab / box / tab+trailing-reminder /
  unnumbered / error reads) BEFORE deletion, so the parity locks outlive the legacy bodies.
- **Discovery-critical read-touch lock split to a sibling** (`tests/test-file-historical-lineage-read.js`)
  because `test-file-historical-lineage.js` was AT the 250-line cap. Golden deep-equal includes the
  box-format + unnumbered A-only cases (the discovery-divergence cases) and excludes the error read.

### Deviations
- **Plan said `isValidRead: isValidReadContent(strippedContent)`; implemented on the RAW string**
  (`isValidStringRead`) to exactly match legacy `extractReadEdits`, which gated on the raw content
  before stripping. Tested on the stripped content, a numbered file beginning `"1\tError…"` would
  flip validity. The characterization golden (Task 8) would have failed under the literal reading.
- **Plan Task 13 said "delete extractReadEvents"; retained as a thin scanner-backed adapter** (see
  Design decisions). Justified: it eliminates the duplicated SCAN helpers (the item's goal) and
  routes the CLI + tests through the canonical scan, with far less churn than rewriting both. It is
  a composition over the canonical scan, not a parallel scanner.
- **Removed legacy bodies preserved in `archive/read-scanner-legacy-bodies.js`** (commented) and the
  retired `extractReadEdits` unit tests in `tests/archive/test-file-event-observations-readedits.js`
  (non-recursive glob → does not run). This repo has a single commit and all work is untracked, so
  deletions are otherwise unrecoverable — the archive is the preservation record the §Constraints
  archive rule requires.

### Tradeoffs
- **Comment-trimming to hold the 250-cap.** Three repointed hosts (`edit-stream-extraction.js`,
  `file-historical-lineage.js`, `file-events-extractors.js`) each landed at exactly 250 after the
  2-name import + null-gated body. Trimmed function/comment lines (not logic) to stay at cap rather
  than spilling helpers into the scanner — the bodies stay readable and co-located with their callers.
- **`file-event-observations.js` transiently grew to 280** (the +2 export lines for buildEditRecord /
  scanToolUseResults landed before Task 13's deletions). Final state is 234 (well under cap). The
  exports could not be deferred — the scanner needs them from Task 1.

### Final gate results (all GREEN)
- Full suite: **69 suites / 690 passed / 0 failed** (going-in 67/679 → +2 suites
  [`test-read-event-scanner.js` +14, `test-file-historical-lineage-read.js` +1], +1 each in
  `test-edit-stream-extraction.js` / `test-file-events-extractors.js`, −6 retired extractReadEdits
  tests → archive; net +11).
- detect-rewinds: **15 passed / 0 failed**.
- Sidecar e2e (`plate_summary.py`): **247/247 matchedObserved, 0 mismatched, conflicts=8** (UNCHANGED).
- **Probe A/B vs `develop-baseline` (a8947fc): `identical: true`** — the `appendReadTouches` repoint
  preserved discovery output byte-for-byte → **NO re-baseline**, `develop-baseline` unchanged at `a8947fc`.
- Per-caller parity goldens (deep-equal vs pre-change legacy output): `extractEditsFromJSONL`
  identical, read-touches identical, readFull/readChunk events identical.
- Line counts (all ≤250): `read-event-scanner.js` 146 (NEW), `file-event-observations.js` 234
  (was 278 — under cap by removing the Read trio), `split-read-assembly.js` 107 (was 169),
  `edit-stream-extraction.js` 250, `file-historical-lineage.js` 250, `file-events-extractors.js` 250.

### Open questions
- None. Out of scope (noted, deferred): item-5.6's bash-read/grep timestampless-result unification.

