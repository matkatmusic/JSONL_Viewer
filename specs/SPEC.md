# Task 166: Multi-Source Reconstruction — Spec

## Goal
The reconstruction engine, CLI, and webapp accept MULTIPLE conversation-log
folders and MULTIPLE file-history snapshot folders for a single project
reconstruction, merging events for the same file (identified across differing
absolute roots) into one per-file revision timeline. Done = a new multi-source
acceptance scenario (2 sessions, 2 workspace roots, s87 mechanism parity)
passes at full per-step coverage AND the existing 87-scenario sweep stays
green. Actually reconstructing jot remains task 83, built on top of this.

## Key Decisions
- Root declaration: config first, auto-detect fallback — each source entry may declare its root in config; when absent, infer from JSONL cwd fields (extends the s87 cwd-remap mechanism); explicit config wins.
- Conflict policy: interleave strictly by timestamp; cross-source contradictions surface as health-sink conflict notes (task-119 style), never abort — BUT validate this policy against real jot data during the S1 investigation before locking it.
- Clock skew: trust wall-clock timestamps as-is (all real sources came from one machine); no skew detection.
- Config shape: extend reveng-paths.json — project entries grow a `sources` list of `{projectsDir, fileHistoryDir?, root?}`; single-source is the one-entry degenerate case and existing files keep working unchanged.
- Scope: engine + CLI + webapp all in task 166.
- Done bar: scenario green + sweep green; jot reconstruction itself is task 83.
- Per-file mode (S8–S10): a projection over the existing multi-source reconstruction — reuse the built engine pieces, no new reconstruction algorithm. The CLI arg already exists (`--target`/`--file` in reconstruction_cli_args.ts, verified 2026-07-22), as do `--repo`/`--base-commit` git-baseline seeding; S9 verifies/extends rather than adds.
- Per-file success bar (user-corrected 2026-07-22): endpoints alone are NOT success — the goal is recovering all (or most) intermediate revisions of the file, to recreate the commit history lost when the plate branch became corrupted. Endpoint byte-matches are necessary, not sufficient.
- Target file (user-specified 2026-07-22): `common/scripts/plate/plate_cli.py` in `~/Programming/jot` at baseline commit `793e65241902f276caf5f5c28d539269e7d36d11` (blob `9d14d60df7aebcba8455bdea7d6b817bca572fe6`, verified present). Provenance: first created at `7a7ea11a` (2026-05-01), renamed at `dcb25ce1` (2026-05-08) — both PRE-baseline ancestors, so since the baseline it is modify-only.
- Recovery workflow (user-specified 2026-07-22): iterative partial reconstruction — seed from a git hash (`--repo`/`--base-commit`), reconstruct a chunk of revisions (~5–10), commit them, re-seed from the new hash, repeat until the full history is restored. Partial reconstructibility is a feature, not a failure.
- S10 shape (user decision 2026-07-22): a dedicated debug viewer page for per-file reconstruction, not a 'Filename' filter on the main webapp — free to expose engine internals (source attribution, conflict notes, seed hashes).
- Per-file sources (user-specified): `~/Programming/jot-recovery/claude-data/` only — its `projects/` JSONL folders and `file-history/` snapshot dirs.
- Candidate set + phase order (user-specified): every file `git diff --name-status 793e6524…` reports against `~/Programming/jot` is a per-file target; M files first (never renamed, only modified), then A, then D — each phase fully reconstructible before the next starts.

## Spec Items

### S1. Design doc: file identity across sources, validated against real jot data
A design doc at `plans/166-multi-source-design.md` answers: (a) the identity
rule (root-relative path agreement + content agreement, per the task-137
repo-matching rule) with concrete examples from the real jot sources; (b) how
each source's root is resolved (config-first, cwd auto-detect fallback);
(c) the merge/conflict semantics, backed by a probe of the real four jot
conversation-log sources and two file-history dirs enumerating actual
cross-source disagreements found; (d) how branch/rewind structure from
different logs composes.
- Verify: doc exists and each of (a)–(d) cites at least one real-data example or states none was found.
- Tasks: #167 (done 2026-07-21 — probe + plans/166-source-probe-notes.md), #168 (done 2026-07-22 — plans/166-multi-source-design.md)
- Status: done — identity/roots/merge/branch design locked from real probe data

### S2. /run-scenario supports named, fixed workspace roots
The run-scenario skill + scripts can execute a scenario's sessions in
caller-specified (named/fixed) workspace roots reused across sessions, instead
of only a random temp dir per run.
- Verify: a scenario file declaring two named roots runs both sessions in those exact dirs; existing single-root scenarios still run unchanged.
- Tasks: #169 (done 2026-07-21)
- Status: done — staged in jfredToolsPlugin (header `root:` lines + spawn `in <name>`)

### S3. reveng-paths.json grows per-project `sources` lists
Config parsing accepts `sources: [{projectsDir, fileHistoryDir?, root?}, …]`
per project entry; legacy single-source entries parse exactly as before.
- Verify: config-parsing unit tests covering new shape, legacy shape, and root omission.
- Tasks: #172 (done 2026-07-22)
- Status: done — hydrateProjectSources in jfred/src/reconstruction_overrides.ts (jfred@3ba6ab5)

### S4. Engine accepts multiple sources per reconstruction
`buildProjectReconstruction` (and the CLI) take a list of source entries —
multiple conversation-log folders and multiple file-history dirs; per-source
BackupReaders resolve snapshots to the owning source; single source is the
degenerate case.
- Verify: engine unit tests with a two-source fixture; full 87-scenario sweep stays green.
- Tasks: #173 (done 2026-07-22), #174 (done 2026-07-22)
- Status: done — engine seams (jfred@3ba6ab5) + CLI multi-positional sources and corpus-load dedupe (reconstruction_cli_args.ts / reconstruction_multi_source.ts, staged)

### S5. Merged per-file timeline across sources
One file's revision timeline is built from events across all sources:
identity per S1's rule, interleave by timestamp, contradictions emitted as
health-sink conflict notes (not errors), branch/rewind structure composed per
the S1 design.
- Verify: engine tests where the same file (differing absolute paths, same root-relative path) is edited in two sources and the merged ladder matches ground truth; a contradiction fixture yields a conflict note and a complete timeline.
- Tasks: #175 (done 2026-07-22), #176 (done 2026-07-22)
- Status: done — identity join + timestamp interleave + §c4 conflict notes (noteJoinedPathConflicts in reconstruction_multi_source_gate.ts; contradiction fixture in tests/reconstruction_multi_source_gate.test.ts, staged)

### S6. Webapp supports multi-source projects
The Paths popover / reveng-paths.json flow lets a project list multiple
sources, and the served reconstruction is the merged multi-source result.
- Verify: webapp DOM tests (app-header / app-paths patterns) for entering multiple sources and for the merged reconstruction being fetched.
- Tasks: #177 (done 2026-07-22)
- Status: done — popover sources list (webapp/app-paths-sources.ts) + merged multi-source serving (viewer_api_sources.ts), DOM + server tests green (staged)

### S7. Multi-source acceptance scenario at s87 parity
A new scenario (2 sessions, 2 named workspace roots via S2) edits multiple
files across both sessions, producing two conversation-log folders and two
file-history folders, with ground-truth revision ladders spanning the sources.
It exercises the four s87 mechanisms (cwd remap, time-aware indirection,
result-instant rename stamping, git-INDEX staged-blob evidence) split across
the sessions, joins the executed sweep, and is the acceptance gate for S3–S6.
- Verify: /run-scenario capture completes; per-step coverage green for the new scenario; full sweep (now 88 scenarios) green.
- Tasks: #170 (done 2026-07-22), #171 (done 2026-07-22), #178 (done 2026-07-22)
- Status: done — scenario RESTRUCTURED to same-folder concurrent agents (user directive 2026-07-22; multi-source-ness = per-session replica source trees over one root) and CAPTURED with all four s87 mechanisms verified (ladders in the capture's capture-notes.md; superseded two-root ladders noted in plans/170-s88-ground-truth-design.md); #178 gate CLOSED 2026-07-22: coverage checker discovers `source-*/projects` trees and routes them through the multi-source merge + per-source reader (plans/178-s7c-coverage-multi-source-gate.md), s88 per-step coverage 26/26 green through that path with zero engine gaps; full-sweep + npm-test validation run is the user's

### S8. Per-file candidate set + ground truth doc
`plans/166-per-file-target.md` records: the baseline commit
(`793e65241902f276caf5f5c28d539269e7d36d11` in `~/Programming/jot`), the
candidate enumeration from `git diff --name-status <commit>` (68 M / 11 A /
52 D as of 2026-07-22), the phase order M → A → D, and the first target
(`common/scripts/plate/plate_cli.py`, blob `9d14d60d`) with its git
provenance: created at `7a7ea11a`, renamed at `dcb25ce1`, both pre-baseline —
modify-only since the baseline.
- Verify: doc exists with commit, per-status file lists, first-target blob sha, and the provenance commits confirmed as baseline ancestors.
- Tasks: #180 (done 2026-07-22)
- Status: done — plans/166-per-file-target.md written with all facts re-verified live against ~/Programming/jot.

### S9. CLI per-file reconstruction — viability proof on plate_cli.py
The existing `--target`/`--file` CLI arg, combined with the multi-source
loading and `--repo`/`--base-commit` seeding, emits one file's revision
ladder. Run with `~/Programming/jot-recovery/claude-data/` (its `projects/`
JSONLs + `file-history/` snapshots) as the source, it completes and emits the
ladder for `common/scripts/plate/plate_cli.py`. Verify the existing arg does
this end-to-end; extend only where a real gap surfaces. This is the step-1
viability proof for the per-file approach.
- Verify: unit test proving `--file` filters the ladder to the named file on a multi-source fixture; a real-data run completes, contains a revision byte-identical to blob `9d14d60d`, and emits the intermediate revisions the sources evidence (revision count reported; mismatches documented in the S8 doc — a finding, not a silent pass).
- Tasks: #181 (done 2026-07-22), #182
- Status: open — #181 unit test landed (it surfaced and fixed a real gap: the JSON document's steps array wasn't narrowed by --target); the #182 real-data viability run remains.

### S10. Dedicated per-file debug viewer
A dedicated debug viewer page (user decision 2026-07-22: NOT a filter on the
main webapp) shows one file's revision ladder from the merged reconstruction,
free to expose engine internals the main webapp doesn't — source attribution,
conflict notes, seed hash. Navigate to (or deep-link) one file and see its
ladder.
- Verify: DOM tests (existing webapp test patterns) for selecting a file and rendering its revision list; manual check against plate_cli.py on the real claude-data sources.
- Tasks: #183, #184
- Status: open

### S11. All 'modified' files recover their revision history
Every file with status M in the S8 enumeration runs through the S9 per-file
mode. Success (user-corrected 2026-07-22) = all or most of the file's
revisions are recovered — enough to recreate the commit history lost when the
plate branch became corrupted. Endpoint matches (baseline blob present, final
revision = current `~/Programming/jot` content) are necessary but NOT
sufficient; every recovered intermediate revision must be emitted, with
per-file revision counts in a results table in the S8 doc. Phase gate:
complete before starting S12.
- Verify: results table covers all M files — endpoints matched, revision count, and gaps itemized as findings, not omissions.
- Tasks: #186, #187
- Status: open

### S12. 'Added' files reconstruct per-file (rename/move-aware)
Files with status A are likely the products of script-driven rename/move
events (their delete twins land in S13). Per-file mode must fold in: the
rename/move event that created the path, and all modifications AFTER it.
Where history is only partially recoverable, the iterative workflow applies —
reconstruct a chunk from a seed hash, commit, re-seed, repeat (see Key
Decisions). Results recorded as in S11. Phase gate: after S11, before S13.
- Verify: results table covers all A files, each ladder starting at its rename/move (or born-fresh) origin and including post-move modifications.
- Tasks: #188, #189
- Status: open

### S13. 'Removed' files reconstruct per-file (paired with S12 moves)
Files with status D run through per-file mode; ladders end in deletion or a
move-away (paired with the S12 file the content moved to, when the D is the
source side of a rename/move). Results recorded as in S11.
- Verify: results table covers all D files, each classified as true-delete or move-source with its S12 pair named.
- Tasks: #190
- Status: open

### S14. File Nav: JSONL list capped at 50% column height
The JSONL list in the File Nav column currently grows with the number of JSONL
files in a session, squeezing the file tree. Cap the JSONL list at 50% of the
column height (scrolling within itself); the file tree gets the rest.
- Verify: DOM/CSS test that with many JSONLs the list's height is ≤50% of the column and the list scrolls; file tree remains visible.
- Tasks: #185 (done 2026-07-22)
- Status: done — .drawer-jsonl-list container (max-height 50%, own scroll) + tests/project.test.ts DOM/CSS test.
