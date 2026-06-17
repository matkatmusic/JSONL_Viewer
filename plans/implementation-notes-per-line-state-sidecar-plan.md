# Implementation notes: per-line file-state tracking sidecar

Spec: `plans/per-line-state-sidecar-plan.md` (via handoff `plans/handoff-develop-20260611-1117.md`).
Running log of design decisions, deviations, tradeoffs, and open questions.

## 2026-06-11T11:32-07:00 — baseline verified

- All 26 suites green: 0 failed.
- Total passing tests: 322, not the 317 the handoff states. No suite fails, so I am
  treating the handoff count as stale (suites grew after the count was written) and
  proceeding. Flagging in case 317 was load-bearing for someone.

## 2026-06-11T11:40-07:00 — Phase 1 complete (RED→GREEN, 6/6; full sweep green)

Design decisions:
- The merged main+subagent lookup (`findReferencingJsonlsIncludingSubagents`) lives in
  `common/subagent-jsonls.js`, not in the tool — keeps the CLI thin and the tested
  behavior in one module. The tool just swaps which function it calls.
- Lineage graph for the merged lookup is built from ALL transcripts (main + subagent)
  in one combined cache, so a rename recorded in a main session reaches a subagent that
  only saw the old name. Test covers this.
- `referencedIn` ordering changed from first-matching-line to lexicographic path order.
  The spec requires parent-main/subagent adjacency; lexicographic gives it for free
  (`<sid>.jsonl` sorts directly before `<sid>/subagents/...` because '.' < '/'). The old
  first-line order carried no semantic weight (line indexes aren't comparable across
  transcripts) and no test depended on it.
- `subagentJsonlsReferencing(aliasPaths, projectsDir)` runs the touch test over a cache
  of subagent files only; alias expansion there sees only subagent-recorded ops. Callers
  that need cross-transcript lineage use the merged function (which the tool now does).
- Enumeration goes through `discoverProjects`, which requires ≥1 main .jsonl directly in
  a project dir. A (hypothetical) project holding ONLY session subdirs would be skipped;
  real projects always have main transcripts, so accepted.

Verified on real data: plate_summary.py now lists 5 transcripts including the
a21fd65d subagent (`agent-ad0e7846cceb08691.jsonl`), adjacent to its parent main jsonl.

## 2026-06-11T13:25-07:00 — Phase 2 complete (RED→GREEN, 14/14 + 1 export test; sweep green)

Design decisions:
- `editBelongsToFile` is now EXPORTED from `tools/probe-v2-assembly.js` (own RED test
  first) so path matching has exactly one implementation; extract-file-events reuses it
  for authored edits AND snapshot keys.
- The snapshot scan is implemented inside `tools/extract-file-events.js` rather than by
  growing `common/extract-file-state.js` (frozen at its 394-line size exception). The
  beacon semantics that module discards are handled here: `isSnapshotUpdate` kept,
  `backupFileName: null` becomes a fileAbsent event, resume-copies deduped by
  (messageId, snapshot.timestamp), beacon time = `snapshot.timestamp`.
- Verified against real records: `isSnapshotUpdate` is TOP-LEVEL on the record (not
  inside `snapshot`); snapshot records carry NO top-level `timestamp`. Also observed:
  backup entries carry a per-entry `backupTime`, and on `isSnapshotUpdate: true` records
  it is LATER than `snapshot.timestamp` (the capture moment vs the turn-start time). The
  spec anchors beacons at `snapshot.timestamp`; that is still sound (capture happens
  before the session's FIRST edit, so content is valid at the earlier time too), but
  `backupTime` could later give finer anchoring if wanted.
- Write success confirmation: only success-confirmed tool runs produce a toolUseResult
  OBJECT (errors record a string or nothing), so consuming extractEditsFromJSONL's
  create/update edits IS the confirmation; the error-result test proves exclusion.
- readFull guard beyond the spec text: a limit-less Read returning >= 2000 lines (the
  harness default cap) extracts as readChunk, not readFull. This is STRICTER than
  assemble-split-reads' eofConfirmedAt (which trusts limit-less unconditionally) — a
  2000-line result proves nothing about the tail. Consequence: a file of exactly 2000
  lines read limit-less is conservatively a chunk with hitEof false.
- Events whose record carries no timestamp are excluded (they cannot join a time-keyed
  timeline). Helper-built fixtures need explicit timestamp patching for this reason.
- `jsonlLine` is 1-based over NON-EMPTY transcript lines (same convention as
  assemble-split-reads). Real transcripts have no blank interior lines.
- `edit.floating` extracts as false always; the Phase 3 tracker is what flips it.
- Kept/ignored classification applies to authored kinds only (write/edit); the
  ignored-exclusion test uses a synthetic statusByLine at the exported
  `authoredEventsFromKeptEdits` seam — same precedent as test-probe-v2-assembly (no
  fixture helpers exist for real rewind records).

Real-data check (plate_summary.py, 5 transcripts): 63 events — 26 snapshot, 21
readChunk, 13 edit, 2 fileAbsent, 1 write, 0 readFull. Zero readFull matches the
split-read experiment's finding (no read of this file ever proved EOF); the 2
fileAbsent beacons are signal the old pipeline dropped.

## 2026-06-11T13:55-07:00 — Phase 3 complete (42 new tests across 5 suites; sweep green)

The 300-line cap forced decomposition beyond the spec's single-file sketch. The spec's
`tools/track-line-states.js` (trackLineStates + CLI) exists as specified, but the
machinery lives in three new common/ modules, each TDD'd separately:
- `common/line-state-evidence.js` — spans, evidenceRef builders (textProperty/
  structuredPatch/blobFile), cached record loading, per-kind event materialization
  (event -> in-memory per-line text + refs). 12 tests.
- `common/line-belief.js` — the in-memory belief model: unknown/claim entries, implied
  lines, known runs, overlay (corroborate/conflict), write/snapshot/fileAbsent beacon
  appliers, presumed degradation, summary roll-up. 9 tests.
- `common/edit-splice.js` — locate old_string in contiguous known runs, splice with
  prefix/suffix diff + downstream re-keying, floating fallback. 6 tests.
- `common/final-line-verdict.js` — the per-line PASS/MISMATCH generalization. 4 tests.
- `tools/track-line-states.js` — ordering/grouping, conflict windowing, timeline
  emission, CLI. 11 integration tests (the spec's list).

Design decisions:
- **'presumed' semantics:** after each instant, claims not re-established at that exact
  instant degrade authored/observed -> presumed, with confirmedAtMs UNTOUCHED (its
  distance from the entry's timestamp is the staleness). Touched-line detection is
  "entry.confirmedAtMs === this instant" — no separate bookkeeping.
- **Where evidence points for edit-authored lines:** structuredPatch locator when the
  patch holds the line verbatim ('+'/' ' lines only), else a substring span into
  newString; null when neither locates it (degenerate; state stays authored). This is
  why the schema has the structuredPatch variant — boundary lines merging edit bytes
  with pre-existing bytes don't exist verbatim in newString.
- **Conflicts come from observations only** (snapshot verify, readChunk/readFull/cat
  overlay). write/fileAbsent REPLACE belief (they change the file; disagreement with
  prior belief is not evidence of error). Window = [last beacon, the contradicting
  record's instant]; for a chunk conflict the chunk itself closes the window.
- **Floating over a fully-known region (the plan's open question):** implemented as
  floating + ALL numbering unanchored + a floatingOverKnownRegion flag returned by
  edit-splice (test-covered). Not yet a conflict record — flagged for Phase 4 rather
  than silently choosing, per the handoff.
- **replaceAll** is applied within the ONE known run where old_string is first located
  (split/join). Occurrences hiding inside unknown gaps are not handled — would need
  floating semantics per occurrence; deferred unless Phase 4 shows it matters.
- **Beacon entries at shared-ms instants:** if ANY event in a same-ms group is Tier-1,
  the entry is a beacon (lines "ALL"); subsequent same-ms events still apply to belief.
- **CLI reference ladder:** on-disk -> latest snapshot blob -> none. The git rung is NOT
  implemented (deviation): all 9 Phase 4 targets are MISMATCH (file exists), so on-disk
  covers them; adding git means threading repo/branch discovery — deferred until a
  target needs it.
- Fixture lesson re-learned: a shortened snapshot key equal in length to the alias path
  ('repo/t.py' vs '/repo/t.py') does NOT suffix-match (strictly-longer rule) — snapshot
  fixtures must use a longer absolute target ('/work/repo/t.py').

## 2026-06-11T14:15-07:00 — Phase 4 complete: all 9 list1 MISMATCH residuals tracked

Reports under `tools/line-state-reports/` (gitignored scratch, per the plan).

**Acceptance test PASSED (plate_summary.py):**
- The FIRST conflict is line 7: presumed "" (the blank line after the import block) vs
  observed content, followed by the off-by-one cascade of a one-line insertion — the
  known one-blank-line divergence, localized.
- The May 16→17 docstring rewrite appears in the same single conflict cluster at
  2026-05-17T02:02:43Z (lines 28–35, 95–96 old-docstring-vs-new), windowed to the
  preceding beacon: "the file changed between these two moments of certainty."
- finalVerdict: 247/247 matchedObserved, 0 mismatched, EOF confirmed — the per-line
  tracker fully resolves what whole-content replay reports as MISMATCH.

**The other 8, by diagnosis class:**
1. End-state per-line PERFECT, divergence localized to ONE inter-beacon conflict
   cluster (whole-replay MISMATCH was history noise, not end-state error):
   - plate-assessment-2026-04-28.md (283/283, 0 conflicts at all)
   - architecture.md (588/588; 298-conflict cluster at 2026-04-26T17:28Z)
   - milestones.md (306/306; 253-conflict cluster at 2026-04-23T16:25Z)
   - skills-migration-plan.md (344/344; 258-conflict cluster at 2026-04-26T17:28Z)
2. Near-perfect with ONE trailing-extent mismatch (belief claims one final empty line
   beyond the reference's EOF):
   - handoff-recovery-20260519-1250.md (84 matched, line 85: recon='' ref=none)
   - diff_sequence_codex.py (80 observed + 417 presumed matched; line 498: recon=''
     ref=none; 4265 conflicts across 7 clusters — heavy multi-session churn)
3. Post-session rewrite (not reconstructable, and the tracker PROVES it):
   - test_util_terminal.py — last evidence is a snapshot beacon 2026-05-09T18:26Z; the
     on-disk file's mtime is 2026-05-15T23:42Z. Zero conflicts (all session evidence
     self-consistent), 248/249 end-state mismatches: the file was rewritten six days
     after the last transcript touched it.
4. No content evidence at all:
   - launch.json ('claude code src/.claude/') — zero events; the probe itself had 0
     kept edits for it. Verdict: 11/11 neverObserved, tailUncertain. Its old MISMATCH
     was "replayed nothing vs an 11-line file"; the honest verdict is NOT_EVIDENCED.

**Phase 4 observations / follow-ups:**
- The plan's open question (unlocatable edit over a fully-known region) NEVER occurred:
  0 floating edits across all 9 files. The floatingOverKnownRegion flag exists and is
  test-covered but has no real-world trigger yet — the question can stay open.
- The trailing-extent mismatch class (recon='' one line beyond reference EOF, 2 files)
  is worth a follow-up: it is either a real historical trailing blank line later
  removed, or a systematic trailing-newline artifact in an observation kind. The
  evidence refs in both reports point at the exact records to dereference.
- Conflict cascades: a one-line insertion shows up as N per-line conflicts (every line
  below shifts). Localization is correct; a possible later refinement is collapsing a
  cluster into a single "insertion at line K" description.
