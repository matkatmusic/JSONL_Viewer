# Task 89 — recognize each git op in `&&`-chained compound Bash commands

## Corrected problem statement

Task 89 names s39, but s39's transcript records NO `git commit` at all (a
`block-compound.sh` capture hook forced separate commands; verified by extracting every
Bash `tool_use` command from both s39 JSONLs — only `git init` and `git add orders.py tests/`
exist). The existing `test_s39_git_operations_are_init_then_add` assertion `[init, add]`
matches reality and MUST NOT change.

The engine gap itself is real and empirically confirmed (probe run through
`findGitOperations`): the compound command
`git add orders.py tests/ && git commit -m "baseline"` yields ONE operation —
`{kind: add, detail: 'orders.py tests/ && git commit "baseline"'}` — no commit op, no
`resultHash`, and `findGitCommitEvents` returns `[]` (its `gitCommitCommand` regex is
start-anchored). The real transcript exercising this is **s6-git-mv**, which records
`git add s6_git.py tests/test_s6_git.py && git commit -m "$(cat <<'EOF'…EOF\n)"` (the
compound failed at capture time; the agent then reissued the add and commit separately,
so the same transcript also carries plain `git add` / `git commit` commands).

User's chosen direction: extend extraction to recognize each op in `&&`-chained compound
commands. Both extraction points live in `src/reconstruction_git_evidence.ts`, so one
shared segment-splitting helper fixes both:

- `findGitOperations` (line 213) — the timeline's `git <kind> <detail>` rows; a compound
  commit gains its own commit node with `resultHash`.
- `findGitCommitEvents` (line 45) — the viewer's `CommitMarker`s (timeline pick
  hard-stops) and the git-blob evidence channel.

## Step 1 — RED tests

### 1a. `tests/git-operations.test.ts`

Add two tests (reuse the file's existing `buildBashToolUseRecord` / `buildToolResultRecord`
builders and its import list; import `S6_JSONL` from `./fixtures.ts` and follow the
S19 pattern at line 200 for building a document from a single path):

1. `test_compound_command_yields_one_operation_per_git_segment` — records:
   `buildBashToolUseRecord('git add a.py && git commit -m "fix: x"', "toolu_compound1", "2026-01-01T00:00:01Z")`
   plus `buildToolResultRecord("toolu_compound1", "[master 4fa08d2] fix: x\n 2 files changed", "2026-01-01T00:00:02Z")`.
   Call `findGitOperations(records)` and assert:
   - exactly 2 operations, kinds `[GitOperationKind.add, GitOperationKind.commit]`;
   - details `["a.py", "fix: x"]` (the add detail no longer carries the compound tail);
   - `command` fields are the per-segment texts `"git add a.py"` and `'git commit -m "fix: x"'`
     (each segment trimmed — the timeline row shows the op's own command, and the `{ }`
     button still resolves the shared JSONL line through `uuid`);
   - the commit operation's `resultHash` is `"4fa08d2"` (the compound's single tool_result
     serves every segment; only kind-commit segments read it).

2. `test_s6_compound_add_and_commit_each_get_an_operation` — build the document with
   `buildProjectDocument([new Path(S6_JSONL)], undefined)` and assert
   `document.gitOperations.map((operation) => operation.kind)` deep-equals
   `[init, add, commit, add, commit, other]` (enum members). Probed pre-fix baseline is
   `[init, add, add, commit, other]`: s6's compound `git add … && git commit …` FAILED at
   capture time and the agent reissued add and commit separately, so the compound's two
   segments must ADD a commit op at index 2 (RED pre-fix). Also assert operation[1]'s
   detail is exactly `"s6_git.py tests/test_s6_git.py"` — the compound tail no longer
   pollutes the add detail. (A failed compound commit still gets a row — identical to how
   a failed plain `git commit` gets one today; its resultHash stays undefined because the
   error result has no `[branch hash]` line. Note this in the implementation notes as an
   open question, do not special-case is_error.)

### 1b. `tests/reconstruction_git_evidence.test.ts`

Extend the existing `test_findGitCommitEvents_reads_the_repo_dir_from_dash_C_or_the_record_cwd`
(line 39) OR add one sibling test (follow that test's record-building shape):

3. `test_findGitCommitEvents_sees_a_commit_inside_a_compound_command` — one Bash record
   whose command is `git add a.py && git -C /tmp/repo commit -m "x"`; assert exactly one
   event comes back and its `cwd` stringifies to `/tmp/repo` (the `-C` dir is read from
   the commit's OWN segment, not the compound head).

Run only these new tests to confirm they FAIL for the right reason (missing split), e.g.
`node --import tsx --test tests/git-operations.test.ts tests/reconstruction_git_evidence.test.ts`.
(The user runs the full suite afterward — do not run other suites.)

## Step 2 — GREEN implementation, all in `src/reconstruction_git_evidence.ts`

### 2a. Shared segment splitter

Add one helper above `findGitCommitEvents` (both extraction functions call it — DRY,
coding-requirements 3):

```ts
// A compound Bash command's `&&`-chained segments, each trimmed — `git add a && git commit -m "x"`
// -> ["git add a", 'git commit -m "x"']. A command with no `&&` comes back as its own single
// segment. Task 89: each git segment then gets its own operation/commit-event.
// ponytail: a literal `&&` INSIDE a quoted argument would split wrongly — no transcript
// exercises that; move to a quote-aware scan if one ever does.
function splitCompoundCommandSegments(command: string): string[] {
    return command.split("&&").map((segment) => segment.trim());
}
```

`&&` only — the user chose `&&`-chains; `;` / `||` chaining appears in no scenario
transcript (verified by grep over `scenarios/executed/*/*.jsonl`).

### 2b. `findGitCommitEvents` (line ~59)

Replace the single `command.match(gitCommitCommand)` with a loop over
`splitCompoundCommandSegments(command)`, matching each segment against `gitCommitCommand`
and pushing one event per matching segment (same `dashCDir`/`recordCwd`/`timestamp`/
`sessionId` handling, `dashCDir` taken from the segment's own match). The memoized
`state.gitCommitEvents` contract is unchanged.

### 2c. `findGitOperations` (line ~224)

Replace the whole-command `trimmed.match(gitCommandStart)` + single `parseGitOperation`
with: for each segment of `splitCompoundCommandSegments(command)`, skip segments not
matching `gitCommandStart`, parse the SEGMENT via `parseGitOperation(segment, …)` (so
`operation.command` is the segment text), keep the existing kind-commit `resultHash`
lookup per segment (the block's single tool_result id serves all segments). Non-git
head segments (`cd repo && git commit …`) now yield their git tail ops — intended.

Update the function's doc comment (line ~209) to state compound commands contribute one
operation per `&&` segment.

## Step 3 — verify, close, stage

1. Re-run ONLY the two touched test files (same command as Step 1) — all green,
   including the untouched s39/s85/s19 tests in them. Run `npx tsc --noEmit` if the
   project's typecheck script exists (check `package.json`); otherwise skip.
2. Move task 89's object from `tasks.json` to `completedTasks.json`, adding
   `completionDate: "2026-07-15"`, `commitHashes: []` (filled by the user's commit), and a
   `closureNote` recording: (a) the s39 premise was wrong — s39 records no commit command
   at all, so no s39 node was ever recoverable; (b) the compound-command gap was real,
   exercised by s6-git-mv, and fixed by per-`&&`-segment extraction in both
   `findGitOperations` and `findGitCommitEvents`.
3. `git add` the touched files (`src/reconstruction_git_evidence.ts`,
   `tests/git-operations.test.ts`, `tests/reconstruction_git_evidence.test.ts`,
   `tasks.json`, `completedTasks.json`, this plan file, the implementation-notes file) —
   stage only, DO NOT commit.
