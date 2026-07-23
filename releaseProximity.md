# JFRED release proximity

## Assessment date

2026-07-23

## Executive assessment

JFRED has a mature implementation and a strong automated-test foundation, but
it is not yet release-ready as a general-purpose recovery tool.

The project is best described as:

- **engineering state:** advanced alpha;
- **captured-scenario correctness:** strong;
- **real-project correctness:** not yet proven;
- **real-project performance:** currently blocking;
- **public packaging:** incomplete;
- **release-candidate status:** no.

The raw task ledger is 180 completed tasks and 13 open tasks, or approximately
93% complete by task count. That percentage materially overstates release
proximity because most remaining JFRED work is behind one critical blocker and
contains the first large-scale validation of the product's central claim.

The most important fact is not the number of completed tasks. It is that the
real `plate_cli.py` reconstruction has not completed once. The latest bounded
single-file attempt ran for approximately 6 hours 49 minutes and was stopped
before producing JSON.

## Verified current health

The current worktree was verified locally on 2026-07-23:

- `npm run typecheck`: passed;
- `npm run build:webapp`: passed;
- `npm test`: 1,026 passed, 0 failed;
- captured reconstruction scenarios s1 through s89 reproduced their expected
  step states;
- GitHub Actions CI exists and runs typecheck, the full test suite, and the
  webapp build on pushes and pull requests.

This is meaningful evidence that the architecture is coherent and that recent
changes have not broadly destabilized the engine or UI.

It is not a substitute for the real-data viability run. The captured scenarios
are small, controlled corpora. The release blocker appears only when 156
transcripts, tens of thousands of records, hundreds of conversation heads, and
thousands of script runs are combined.

## What is already substantial

JFRED is not an early prototype. The codebase already contains:

- strict typed JSONL parsing and source attribution;
- multi-session and multi-source merging;
- file Write, Edit, append, overwrite, copy, rename, and delete reconstruction;
- sidecar file-history backup integration;
- git baseline and commit evidence;
- conversation rewind and surviving/abandoned branch modeling;
- script-run detection, replay, validation, and script-created-file discovery;
- lineage, history, execution, document, and sandbox-result caches;
- revision ladders, diffs, step snapshots, timeline reconstruction, and
  provenance;
- a local web viewer with project selection, path configuration, consent,
  baseline selection, progress reporting, filtering, inspectors, and file
  navigation;
- a bundled demonstration corpus;
- extensive unit, DOM, integration, and scenario-reproduction coverage;
- public-repository CI configuration and a user-facing README.

The implementation breadth is sufficient for an alpha release. The remaining
question is whether it performs and recovers history reliably on the real
corpus it is intended to handle.

## Current blocking path

The main dependency chain in `tasks.json` is:

```text
192 -> 182 -> 183 -> 184
          -> 186 -> 187 -> 189 -> 190
          -> 188 ------^
```

Task 194, the bounded/full reconstruction choice in the webapp, is not
formally blocked in JSON but operationally depends on the same performance
work.

### Task 192: execution and reconstruction blowup

This is the immediate blocker.

The original task records one script being sandbox-executed about 11,980
times. The latest investigation found a broader problem: the single-file CLI
first reconstructs every file on every branch and only then filters by
`--branch surviving` and `--file`.

The requested file's surviving history had already completed when the latest
run entered another 2,824-script branch pass. The complete remediation plan is
in `optimizations.md`.

Until the targeted reconstruction path completes in minutes rather than hours,
the CLI cannot support the per-file viewer or the planned 131-file recovery
sweep.

### Task 182: first real-data correctness proof

After performance is fixed, JFRED still has to prove that the emitted
`plate_cli.py` ladder is useful:

- the command completes;
- the baseline blob `9d14d60d` is present byte-for-byte;
- intermediate evidenced revisions are present;
- the final revision is correct;
- gaps and mismatches are reported rather than omitted;
- the recovered revision count is documented.

This is the first end-to-end proof against the actual recovery data. Until it
passes, JFRED's central recovery claim remains scenario-proven but not
project-proven.

### Tasks 183-190: product workflow and corpus validation

Once task 182 passes, the remaining chain builds and validates the actual
recovery workflow:

- dedicated per-file debug viewer endpoint and page;
- revision-ladder UI and DOM coverage;
- sweep harness and results table;
- validation across 68 modified files;
- iterative reconstruct, commit, and re-seed proof;
- validation across 11 added files, including move/rename origins;
- validation across 52 deleted files and move-source pairing.

These are not cosmetic tasks. They establish whether the tool recovers most of
the history needed to repair the corrupted branch, rather than merely finding
one correct endpoint.

### Task 194: bounded reconstruction UX

The webapp still needs a mode-selection screen before reconstruction begins:

- full-project reconstruction;
- bounded reconstruction through a selected file revision/turn.

The supporting pre-scan and request wiring remain open. The performance path
must be proven before this can be considered an interactive feature.

## Other open work

### GitHub Pages demo

Task 17 remains deliberately deferred. The repository has a local bundled
demo, but the static GitHub Pages tier and its static-data API shim have not
been implemented.

This is not required for a source-only alpha release. It is important for a
low-friction public demonstration.

### External jot refactor

Task 7 belongs to the separate `jot` repository and is explicitly deferred
until all other work is complete. It should not be counted as a JFRED engine
release blocker unless the release process explicitly includes the jot
integration.

### Actual jot reconstruction umbrella

Task 83 is the high-level goal that tasks 182 and 186-190 operationalize. It
cannot be closed until the real-corpus sweep establishes the result.

## Release-preparation gaps not tracked in tasks.json

### Package publication is disabled

The submodule package is version `0.1.0` with `"private": true`. The root
wrapper is version `0.0.0` and is also private. There is no release workflow,
artifact build, changelog gate, tag procedure, or package-publication command.

This is acceptable for a source-run alpha, where users clone the repository and
run `npm install && npm run app`. It is not a finished npm/package release.

### License metadata is inconsistent

`jfred/LICENSE` contains the GNU Affero General Public License v3, and the
README says AGPL. `jfred/package.json` declares `GPL-3.0-only`.

The package metadata must be changed to the correct SPDX identifier
`AGPL-3.0-only`, or the intended license must be decided and all three locations
made consistent before a public release.

### Script execution needs an explicit security contract

JFRED asks for consent before replaying scripts, which is necessary. However,
the current script runner writes code to a temporary directory and invokes:

```text
python3 __script__.py
```

A temporary working directory is not an operating-system sandbox. Arbitrary
Python can access absolute paths, environment variables, processes, and
network resources permitted to the JFRED process. Remapping the recorded
working-directory string reduces accidental writes to that one path but does
not create isolation.

Before public release, choose and document one of these contracts:

1. Harden execution with an actual isolation boundary.
2. Disable executable replay by default and label it as trusted-code-only.
3. Keep explicit consent but clearly state that replay executes recorded code
   with the user's privileges and is not a security sandbox.

The README's statement that JFRED is read-only over Claude data is narrower
than the execution risk and should not be the only safety statement.

### Release state must be reproducible from a clean commit

The current root has untracked files, and the `jfred` submodule contains staged
changes. Before tagging a release, all intended source, scenario, and submodule
commits must be pinned from a clean superproject worktree and CI must pass on
that exact commit.

## Release scorecard

| Area | State | Release implication |
| --- | --- | --- |
| Typed parsing and reconstruction architecture | Green | Broad implementation exists |
| Captured-scenario correctness | Green | 1,026 tests and s1-s89 pass |
| Type safety and webapp build | Green | Both pass locally |
| Real-corpus single-file performance | Red | Multi-hour run does not complete |
| Real-corpus revision accuracy | Red | Task 182 has produced no ladder |
| Multi-file recovery confidence | Red | M/A/D sweeps not started |
| Per-file recovery UX | Red | Tasks 183-184 open |
| Bounded/full webapp workflow | Red | Task 194 open |
| Local demo and README | Green | Usable source-run entry point exists |
| Static hosted demo | Yellow | Task 17 deferred |
| Package/release automation | Red | Packages are private; no release flow |
| License metadata | Red | AGPL/GPL mismatch |
| Script replay security documentation | Red | Consent exists; isolation contract unclear |

## Practical release tiers

### Internal development build

JFRED is already usable as an internal development build for captured
scenarios and smaller projects.

### Public alpha

A source-only public alpha becomes defensible after:

1. the targeted optimization passes its real-corpus time gate;
2. task 182 emits and validates the first real ladder;
3. the license metadata is corrected;
4. script-execution risk is documented accurately;
5. a clean tagged commit passes CI;
6. known limitations and the incomplete sweep are stated prominently.

The debug viewer and complete 131-file sweep could remain alpha follow-up work
if the release is explicitly positioned as experimental.

### Public beta

A beta should additionally require:

1. tasks 183 and 184, providing an ergonomic per-file inspection workflow;
2. tasks 186 and 187, proving the harness and 68 modified-file sweep;
3. task 188, proving the iterative commit/re-seed workflow;
4. task 194, providing the bounded/full choice before expensive reconstruction;
5. documented performance and recovery-coverage results.

### Recovery-ready 1.0

A release that confidently claims it can reconstruct the damaged jot history
should wait for tasks 189 and 190 and closure of task 83. The added and deleted
file sets exercise the move, rename, birth, and deletion cases most likely to
expose missing lineage.

The GitHub Pages demo and package publication are distribution decisions. They
are useful for 1.0 but do not replace the recovery-validation gates.

## How close is it?

By implementation volume, JFRED is close: approximately 93% of tracked tasks
are complete, its test suite is large and green, and the core viewer already
exists.

By release confidence, it is not yet close to a general release. The first
real-data reconstruction remains blocked, and seven downstream tasks exist
specifically to prove the workflow across the actual modified, added, and
deleted files.

The shortest honest summary is:

- **internal alpha:** available now;
- **public experimental alpha:** one major performance/correctness gate plus
  release hygiene away;
- **public beta:** the task-192/182 chain, debug viewer, modified-file sweep,
  iterative workflow, and bounded-mode UX away;
- **recovery-ready 1.0:** all real-corpus M/A/D validation plus packaging and
  safety closure away.

Calendar distance cannot be estimated responsibly from task count because
task 182 may reveal reconstruction gaps that create new work. The next
meaningful measure of proximity is not another percentage; it is whether the
optimized `plate_cli.py` command completes within the defined time budget and
produces the expected revision ladder.
