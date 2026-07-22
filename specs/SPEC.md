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
- Tasks: #167, #168
- Status: open

### S2. /run-scenario supports named, fixed workspace roots
The run-scenario skill + scripts can execute a scenario's sessions in
caller-specified (named/fixed) workspace roots reused across sessions, instead
of only a random temp dir per run.
- Verify: a scenario file declaring two named roots runs both sessions in those exact dirs; existing single-root scenarios still run unchanged.
- Tasks: #169
- Status: open

### S3. reveng-paths.json grows per-project `sources` lists
Config parsing accepts `sources: [{projectsDir, fileHistoryDir?, root?}, …]`
per project entry; legacy single-source entries parse exactly as before.
- Verify: config-parsing unit tests covering new shape, legacy shape, and root omission.
- Tasks: #172
- Status: open

### S4. Engine accepts multiple sources per reconstruction
`buildProjectReconstruction` (and the CLI) take a list of source entries —
multiple conversation-log folders and multiple file-history dirs; per-source
BackupReaders resolve snapshots to the owning source; single source is the
degenerate case.
- Verify: engine unit tests with a two-source fixture; full 87-scenario sweep stays green.
- Tasks: #173, #174
- Status: open

### S5. Merged per-file timeline across sources
One file's revision timeline is built from events across all sources:
identity per S1's rule, interleave by timestamp, contradictions emitted as
health-sink conflict notes (not errors), branch/rewind structure composed per
the S1 design.
- Verify: engine tests where the same file (differing absolute paths, same root-relative path) is edited in two sources and the merged ladder matches ground truth; a contradiction fixture yields a conflict note and a complete timeline.
- Tasks: #175, #176
- Status: open

### S6. Webapp supports multi-source projects
The Paths popover / reveng-paths.json flow lets a project list multiple
sources, and the served reconstruction is the merged multi-source result.
- Verify: webapp DOM tests (app-header / app-paths patterns) for entering multiple sources and for the merged reconstruction being fetched.
- Tasks: #177
- Status: open

### S7. Multi-source acceptance scenario at s87 parity
A new scenario (2 sessions, 2 named workspace roots via S2) edits multiple
files across both sessions, producing two conversation-log folders and two
file-history folders, with ground-truth revision ladders spanning the sources.
It exercises the four s87 mechanisms (cwd remap, time-aware indirection,
result-instant rename stamping, git-INDEX staged-blob evidence) split across
the sessions, joins the executed sweep, and is the acceptance gate for S3–S6.
- Verify: /run-scenario capture completes; per-step coverage green for the new scenario; full sweep (now 88 scenarios) green.
- Tasks: #170, #171, #178
- Status: open
