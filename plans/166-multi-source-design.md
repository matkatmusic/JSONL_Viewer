# Task 168 — Multi-source reconstruction design (spec S1)

Design for spec item S1 of `specs/SPEC.md` (task 166). Every rule below is
validated against the real jot sources probed in
`plans/166-source-probe-notes.md` (10 conversation-log sources across 3 roots,
7,761 jot-edit events, 3 file-history roots). Section 5 of that file is the
hand-written conflict-policy verdict this design locks in.

Vocabulary: a **source** is one `{projectsDir, fileHistoryDir?, root?}` entry
in a project's `sources` list in reveng-paths.json (spec S3). A **root** is
the absolute workspace directory a source's paths are relative to.

## (a) File identity across sources

**Rule: two events from different sources describe the same file iff**

1. their **root-relative paths agree** (each event's absolute `file_path`
   minus its source's resolved root — the task-137 repo-matching rule), AND
2. **content agrees at the join point**: the joining source's first content
   evidence for the file (Edit `old_string` context, `originalFile`, or its
   file-history backup blob) matches the state the already-merged timeline has
   reconstructed at that timestamp.

Absolute-path equality is the trivial fast path (same root ⇒ rel-paths agree
and content evidence is the same lineage), and it is common in the real data:
`~/Programming/jot/scripts/jot_plugin_orchestrator.py` was edited by sessions
from FOUR different project folders (`jot`, `jot-backup`, `claude-code-src`,
`RevEng` — probe §3), so identity must never be keyed on the project folder
that recorded the edit.

**Why rel-path agreement alone is NOT sufficient** (the reason the content
gate exists): the largest genuine overlap cluster in the real data is
`~/Programming/jot` vs `~/Programming/jot-backup` — sibling **repo copies**
that share rel-paths while their contents diverge. `audit/build_call_graph.py`
has 37 events split across both roots, and probe §4 conflict candidates 1–4
are exactly these siblings receiving different edits hours apart (e.g.
`common/scripts/plate/plate_reverse_algo.py`, content `00d3041889fe` in
jot-backup at 2026-05-20T19:50Z vs `34599236a342` in
jot-backup-tests-reverseAlgo 4.1h later). Merging them by rel-path would
interleave two diverging repos into one false timeline. When the content gate
fails, the rel-path keeps **separate per-root timelines** — one file identity
per root — exactly as today's single-source engine would see them.

## (b) Per-source root resolution

Config-first, auto-detect fallback; explicit config always wins:

1. **Config**: a `root` declared on the source entry in reveng-paths.json is
   taken verbatim (jfred-root-relative or absolute, same resolution as the
   existing repo path — task-56 trap).
2. **Auto-detect fallback**: when `root` is absent, infer per session from the
   JSONL `cwd` fields, extending the s87 cwd-remap mechanism (which already
   remaps recorded cwds to the scenario workspace). The probe itself resolved
   every source this way — the project-folder names in probe §1
   (`-Users-matkatmusicllc-Programming-jot`, `…-jot-backup`, …) are encoded
   cwds, and un-encoding them was sufficient to compute the rel-paths of §3.
   A source whose sessions carry multiple cwds yields per-session roots, not
   one per-source root (real case: the `claude-code-src` project folder
   contains sessions that edited files under `~/Programming/jot` — the edit's
   absolute `file_path` is what gets the rel-path split, using the root whose
   prefix matches).
3. **Tie-break**: when both exist and disagree, config wins silently; the
   auto-detected value is discarded (it is a fallback, not a cross-check).

## (c) Merge / conflict semantics

Pipeline order, each stage validated by the probe:

1. **Record-level dedupe FIRST — by (sessionId, recordUuid).** 3,788 of 7,761
   raw events (49%) are the same record replicated across roots (claude-data
   is a sync of live; probe-fixture is a frozen copy of claude-data — probe
   §2). Without this stage, half of all "cross-source evidence" is phantom
   agreement. Diverged replica files need no winner policy: all 4 diverged
   JSONL copies found are strict **prefix growth** (one copy longer, e.g.
   RevEng session `b8ed3282…` live=988 lines vs claude-data=896), so
   per-record dedupe absorbs them — the union of records IS the longer copy.
2. **Identity resolution** per (a) — content-gated rel-path joining.
3. **Strict timestamp interleave** of same-identity events into one per-file
   ladder. Validated by the real 4-folder alternating edit stream on
   `jot_plugin_orchestrator.py` (2026-05-13 → 2026-07-17): wall-clock order
   is the true edit order. No clock-skew handling (all real sources came from
   one machine — spec Key Decision).
4. **Conflict notes, not errors.** A conflict fires when a later event's
   pre-state evidence does not match the reconstructed state at its timestamp
   (**lineage mismatch** — the same check the engine's stale-edit-base
   machinery already does per-source), and it surfaces as a task-119-style
   health-sink conflict note while reconstruction continues. Mere
   content-hash inequality between adjacent cross-source edits is NOT a
   conflict signal: all 5 probe §4 candidates are explicable as either
   sibling-repo divergence (an identity question, handled by (a)) or
   legitimate alternating edit streams. No true same-instant contradiction
   was found in the real data — the conflict path is a safety net, expected
   to be rare.
5. **Multi-source BackupReader.** File-history blobs are
   `<sessionUuid>/<hash>@vN` with no embedded path metadata (probe §1), so a
   blob joins to a file only via the owning session's JSONL. The reader takes
   all `fileHistoryDir`s, indexes session dirs by UUID across them, and
   dedupes replicated dirs (139 jot-editing session dirs exist in more than
   one location). Per the multi-session `@vN` collision lesson, a blob is
   always read from the dir OWNED by the requesting session — never from a
   same-named dir under a different root that happens to sort first.

## (d) Branch / rewind composition across session logs

**Rule: branch and rewind structure is session-local; sources compose at the
timeline level, not the branch level.** A rewind record references its own
session's record chain (parent uuids), so `reconstructBranches` keeps running
per session exactly as today. The merged per-file timeline is then built by
interleaving each session's revisions by timestamp (stage (c)3), with each
revision keeping its (sessionId, branch) attribution — branch ids are
session-qualified in the merged ladder so two sessions' "branch 1" never
collide. Off-branch (rewound) revisions stay dimmed/attributed exactly as in
single-source reconstruction; a rewind in session A never hides or reorders
revisions contributed by session B, because B's records are not in A's parent
chain.

Real-data validation: **no cross-source branch/rewind interplay was found in
the jot sources** — none of the probe §4 candidate pairs involves a rewound
branch; they are all linear alternating streams (e.g.
`plate_reverse_algo.py` ping-ponging between jot-backup and
jot-backup-tests-reverseAlgo sessions, which composes as plain sequential
interleave). The closest real case is replica prefix-growth (probe §2): the
live copy of RevEng session `462b143e…` has 259 lines vs claude-data's 188 —
the same session at two sync points. Record-level dedupe makes the union
equal the longer copy, so the branch structure computed from merged records
is identical to single-source reconstruction over the longer replica — i.e.
replication cannot invent or destroy branches.

## Consequences for S3–S6 (pointers, not design)

- S3: `sources: [{projectsDir, fileHistoryDir?, root?}]` — `root?` feeds (b);
  legacy single-source entries are the one-entry degenerate case.
- S4: per-source BackupReaders per (c)5; dedupe stage (c)1 lives at corpus
  load, before any existing reconstruction stage.
- S5: identity (a) + interleave (c)3 + conflict notes (c)4 + composition (d).
- S7: the acceptance scenario should include a sibling-root pair sharing a
  rel-path with diverging content, to lock the (a) content gate.
