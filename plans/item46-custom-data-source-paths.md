# Item 46 — Customized data-source paths (engine + viewer + webapp)

Goal: reconstruct projects whose JSONL transcripts were COPIED out of `~/.claude`
(e.g. `~/Programming/jot-recovery/claude-data/projects`, whose layout mirrors
`~/.claude`: `projects/` with a `file-history/` sibling holding
`<sessionUuid>/<blob@vN>` dirs). Four capabilities, all opt-in, all defaulting to
today's exact behavior when unconfigured:

1. **File-history root override** — resolution chain: explicit override → derived
   sibling (`file-history/` next to the projects folder) → `~/.claude/file-history`.
2. **Per-project overrides config** — `reveng-paths.json` inside the projects
   folder, mapping project dir name → `{ cwd, repo, baseCommit }`, read by both the
   viewer server and the engine CLI; direct CLI flags win over the config file.
3. **cwd / repo overrides** — consumed as additional candidate repo directories in
   the git-evidence channel. DELIBERATE DEVIATION from the item-46 text ("override
   the extracted CWD when parsing"): a parse-time cwd rewrite breaks
   `readCommittedFileContent`'s relpath math (`relative(recordedCwd, recordedFilePath)`
   escapes to `..` when cwd is rewritten but file paths stay recorded) and would put
   rename/copy resolution (`resolveAgainstCwd`) in a mixed path space that breaks
   lineage joins. Consumption-point fallbacks give the same user-visible outcome —
   the engine finds the relocated repo — with recorded paths staying internally
   consistent. User informed of the deviation in-conversation (2026-07-09).
4. **Base-commit beacon** — user-specified semantics: the supplied repo+commit acts
   as a tier-1 beacon at the commit's committer timestamp; for the target file, a
   synthetic `WriteEvent` carrying the committed bytes is spliced into the lineage at
   that instant (existing write-beacon replay semantics re-anchor belief; a
   MID-SESSION base commit supersedes earlier steps without removing them).
   Engine-efficiency work (skipping superseded pre-beacon steps) is OUT OF SCOPE —
   tracked as TASKS.md item 56.

Constraints: strict red-green TDD (write each test first, watch it fail
conceptually, then implement — but DO NOT run the suite; the user runs it);
follow `plans/coding-requirements.md` (domain types, vocabulary home, enum
comparisons, verb-named functions, 4-space indent); comment out replaced lines
rather than deleting them; stage everything at the end, do not commit.

## Architecture decision (applies to every phase)

Overrides live as **module-level state** in a new `src/reconstruction_overrides.ts`,
following the established process-wide-switch precedent of
`reconstruction_exec_gate.ts` (builds are synchronous and the server serializes
them). The viewer sets the state per request from the config file; the CLI sets it
once at startup. Default state is `{}`, which makes every new code path a no-op —
the 85/85 scenario sweep must be unaffected by an unconfigured engine.

---

## Phase 1 — the overrides module

**New file `src/reconstruction_overrides.ts`** (module header comment: what it holds,
the exec-gate precedent, and the parse-time-deviation rationale from above):

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Path, Uuid } from "./structures/domain.ts";

// The user-supplied data-source path overrides (TASKS.md item 46). Empty = all defaults.
export type PathOverrides = {
    fileHistoryRoot?: Path;   // file-history blob root (chain: this → derived sibling → ~/.claude/file-history)
    projectCwd?: Path;        // where the project lives on disk NOW (extra git-evidence repo candidate)
    repoDir?: Path;           // the git repo to read committed blobs from (wins over transcript-sibling clone)
    baseCommit?: Uuid;        // commit whose tree seeds tier-1 write beacons (requires repoDir)
};

let activePathOverrides: PathOverrides = {};

export function setPathOverrides(overrides: PathOverrides): void
export function getPathOverrides(): PathOverrides
// Stable string for cache stamps: JSON of the defined fields in fixed key order.
export function serializePathOverrides(): string
```

Config-file support in the same module (one canonical home, imported by CLI and
viewer):

```ts
export const PROJECT_PATHS_CONFIG_NAME = "reveng-paths.json";
// Wire shape of one project's entry in <projectsDir>/reveng-paths.json.
export type WireProjectPaths = { cwd?: string; repo?: string; baseCommit?: string };
// The whole config: project dir name → entry. {} when the file does not exist.
// Malformed JSON THROWS (a typo must be loud, not silently ignored).
export function readProjectPathsConfig(projectsDir: Path): Record<string, WireProjectPaths>
// Hydration point (coding-req §1: parse hydrates, never casts): wire strings → Path/Uuid.
export function hydrateProjectPaths(wire: WireProjectPaths): PathOverrides
```

`baseCommit` hydrates to `Uuid` (coding-req §1: identifiers → `Uuid`, including
non-RFC-4122 ones — same treatment as `toolu_…` ids).

**Tests first — new `tests/reconstruction_overrides.test.ts`** (each with
plain-English step comments; reset `setPathOverrides({})` in an `afterEach`/`t.after`
so state never leaks between tests — this rule applies to EVERY test file this plan
adds):

- `test_set_and_get_path_overrides_round_trip` — set a full override object; get
  returns the same values; set `{}` returns to empty.
- `test_serialize_path_overrides_is_stable_and_distinguishes_values` — two
  identical override sets serialize identically; changing any one field changes the
  string; `{}` serializes to a fixed constant.
- `test_read_project_paths_config_returns_empty_map_when_file_missing` — point at
  a temp dir with no config file; expect `{}`.
- `test_read_project_paths_config_reads_project_entry` — write a config JSON with
  one project entry into a temp dir; read it back; the entry's fields match.
- `test_read_project_paths_config_throws_on_malformed_json` — write `not json`;
  expect a throw.
- `test_hydrate_project_paths_builds_domain_types` — hydrate
  `{ cwd, repo, baseCommit }` strings; expect `Path`/`Path`/`Uuid` instances; absent
  fields stay absent.

Temp dirs: use `fs.mkdtempSync(join(os.tmpdir(), "reveng-overrides-"))` per test
(match the pattern already used in `tests/render_git_diff.test.ts`).

---

## Phase 2 — file-history root resolution

**`src/reconstruction_sidecar_reader.ts`** gains the derivation + resolution chain
(this module is the canonical FHS-root home — `getDefaultFileHistoryRoot` already
lives here):

```ts
// The file-history dir sitting next to a projects folder (<X>/projects → <X>/file-history),
// or undefined when no such sibling exists.
export function deriveSiblingFileHistoryRoot(projectsDir: Path): Path | undefined

// Derive the sibling root from where the records' transcript actually sits on disk:
// <X>/projects/<project>/y.jsonl → <X>/file-history. Uses getRecordSource (import from
// ./parse/loadTranscript.ts) on the first record that has a source; undefined when no
// record has a source or no sibling dir exists.
export function deriveFileHistoryRootFromRecords(records: TranscriptRecord[]): Path | undefined

// The chain: explicit override → transcript-derived sibling → ~/.claude/file-history.
export function resolveFileHistoryRoot(records: TranscriptRecord[]): Path
```

`deriveFileHistoryRootFromRecords` internally: `transcriptDir = dirname(source.filePath)`,
`projectsRoot = dirname(transcriptDir)`, then
`deriveSiblingFileHistoryRoot(new Path(projectsRoot))`. Note the derivation is a
strict generalization of the default: for a live `~/.claude/projects/<p>/x.jsonl`
transcript it lands exactly on `~/.claude/file-history`.

**Wire it into `buildSidecarReader`** (line 63): replace
`const root = getDefaultFileHistoryRoot().toString();` with
`const root = resolveFileHistoryRoot(records).toString();` — comment the old line
out with an `// item 46:` marker rather than deleting it.

**`src/viewer_api.ts` `readBlobSnapshot`** (line 297) has no records to derive
from; it resolves via the viewer's own chain added in Phase 6
(`getEffectiveFileHistoryDir()`); leave a Phase-6 marker here and do the actual
edit in Phase 6 so this phase stays engine-only.

**Tests first — add to `tests/reconstruction_overrides.test.ts`** (FHS resolution is
override-adjacent; keeping one new test file for both):

- `test_derive_sibling_file_history_root_finds_existing_sibling` — temp tree
  `<X>/projects` + `<X>/file-history`; derivation from `<X>/projects` returns
  `<X>/file-history`.
- `test_derive_sibling_file_history_root_returns_undefined_without_sibling` — temp
  tree with only `<X>/projects`; expect undefined.
- `test_resolve_file_history_root_prefers_override_over_derivation` — set a
  `fileHistoryRoot` override; resolution returns it even when records would derive a
  sibling.
- `test_resolve_file_history_root_falls_back_to_default_without_source_or_override`
  — records with no source, no override; expect `getDefaultFileHistoryRoot()`.
- `test_build_sidecar_reader_reads_blob_from_derived_sibling_root` — copy one real
  scenario JSONL (pick any `S*_JSONL_PATHS` fixture already exported by
  `tests/fixtures.ts` whose scenario has sidecar blobs, e.g. the s43 fixture) into a
  temp `<X>/projects/<project>/` tree, copy its session's blob dir under
  `<X>/file-history/<sessionId>/`, load records from the COPY, build the reader, and
  read one known blob name — content must equal the original blob file's bytes.
  (This test PROVES the audit use case end-to-end at the reader level.)

---

## Phase 3 — engine CLI flags + config-file pickup

**`src/reconstruction_cli.ts`**:

- `CliOptions` gains `fileHistoryRoot: Path | undefined`, `projectCwd: Path | undefined`,
  `repoDir: Path | undefined`, `baseCommit: Uuid | undefined`.
- `parseArgs` extracts four more value flags with the existing `extractValueFlag`
  helper, BEFORE the positional scan (same pattern as `--target`):
  `--file-history-loc` with alias `--fhsLoc` (mirror the `--target`/`--file` alias
  pattern at line 102-103: check `--file-history-loc` first, fall back to
  `--fhsLoc`), `--cwd`, `--repo`, `--base-commit`.
- Update `USAGE` to name the new flags:
  `[--file-history-loc|--fhsLoc <dir>] [--cwd <dir>] [--repo <dir>] [--base-commit <hash>]`.
- New function in the same file:

```ts
// Apply the path overrides for this run: the transcript's projects-folder config entry
// (projectsDir = dirname(dirname(jsonl)), project = basename(dirname(jsonl))) as the base,
// with any direct CLI flags winning per-field (item 46).
export function applyCliPathOverrides(options: CliOptions): void
```

  Body: compute `projectsDir`/`projectName` from `options.jsonlPath`; `entry =
  readProjectPathsConfig(new Path(projectsDir))[projectName]`; `base = entry ?
  hydrateProjectPaths(entry) : {}`; overlay the four flag fields when defined;
  `setPathOverrides(merged)`.
- `runCli`: call `applyCliPathOverrides(options)` immediately after `parseArgs`,
  before `loadTranscript`.

**Tests first** — find the existing `parseArgs` tests with
`grep -rln "parseArgs" tests/` and add there (create `tests/reconstruction_cli.test.ts`
only if none exists):

- `test_parse_args_extracts_path_override_flags` — argv with all four flags plus a
  transcript path; every field lands typed (`Path`/`Uuid`); the positional path is
  found (flag values never mistaken for it).
- `test_parse_args_accepts_fhs_alias` — `--fhsLoc` alone populates
  `fileHistoryRoot`.
- `test_apply_cli_path_overrides_merges_config_under_flags` — temp
  `<X>/projects/<p>/session.jsonl` tree with a `reveng-paths.json` entry for `<p>`
  supplying `cwd` and `repo`; options carry only `--repo` (a different value) —
  after applying, `getPathOverrides()` has the config's `cwd` and the FLAG's `repo`.
- `test_apply_cli_path_overrides_no_ops_without_config_or_flags` — bare options in
  a config-less temp tree → `getPathOverrides()` deep-equals `{}` (fields all
  undefined).

---

## Phase 4 — cwd/repo overrides join the git-evidence fallback chain

**`src/reconstruction_git_evidence.ts`**:

- `readCommittedFileContent`'s 4th parameter changes from
  `preservedRepoDir?: Path` to `fallbackRepoDirs: Path[] = []`; body builds
  `const repoDirs = [repoCwd, ...fallbackRepoDirs];` (comment out the old
  two-element construction with an `// item 46:` marker). Relpath math is
  UNTOUCHED: still `relative(repoCwd, filePath)` — the recorded cwd names the
  repo-internal layout; the fallback dirs are mirrors of that layout at other
  disk locations.
- New function replacing the direct `findPreservedRepoDir` use:

```ts
// Every fallback repo dir to try after the recorded cwd, most-explicit first:
// the configured repoDir, the configured projectCwd (the project's current disk
// location often contains the repo), then the transcript-sibling preserved clone.
function findFallbackRepoDirs(records: TranscriptRecord[]): Path[]
```

  Body: collect `getPathOverrides().repoDir`, `getPathOverrides().projectCwd`,
  `findPreservedRepoDir(records)`; filter out undefined.
- `placeOneCommitDiff` line 408: pass `findFallbackRepoDirs(records)` instead of
  `findPreservedRepoDir(records)` (comment the old call out above the new line).
- Update the other `readCommittedFileContent` callers found by
  `grep -rn "readCommittedFileContent" src/ tests/` to the array parameter (tests
  pass `[]` or `[dir]`).

**Tests first** — add to the file that already tests `readCommittedFileContent`
(find with the grep above; `tests/git-operations.test.ts` is the likely home):

- `test_read_committed_file_content_tries_each_fallback_repo_dir` — temp git repo
  B holding a commit of `orders.py`; call with a NONEXISTENT recorded cwd
  `repoCwd` whose relative layout matches, `fallbackRepoDirs: [repoB]` — the
  committed bytes come back (proves fallback order survives a dead recorded cwd).
- `test_find_fallback_repo_dirs_orders_override_before_preserved` — set `repoDir`
  and `projectCwd` overrides; with records that ALSO have a transcript-sibling
  repo, the returned array is `[repoDir, projectCwd, preserved]`. (Export
  `findFallbackRepoDirs` for the test — verb-named, already fits the module's
  export style.)

Building a throwaway commit inside a test: follow the exact
`execSync("git init …")` recipe in `tests/render_git_diff.test.ts` (init with
`-b main`, set `user.email`/`user.name` locally, `git add` + `git commit`).

---

## Phase 5 — the base-commit beacon stage

**New file `src/reconstruction_base_commit.ts`** (module header: the user-specified
tier-1-beacon semantics, the mid-session-supersedes rule, and WHY this stage does
NOT gate on `isImpureExecutionAllowed()` — that gate guards shell-outs derived from
TRANSCRIPT-recorded commands; here the repo and commit are the user's own explicit
configuration, which IS the consent):

```ts
export const BASE_COMMIT_CHANGE_ID_PREFIX = "gitBase:";

// Deterministic changeId (item-34 scriptRun: precedent) so every replay of the same
// baseline agrees: gitBase:<hash>:<target>.
export function computeBaseCommitChangeId(baseCommit: Uuid, target: Path): Uuid

// The committer timestamp of <commit> in <repoDir> (git show -s --format=%cI), or
// undefined when the repo/commit is unreadable (silent-degradation channel semantics).
export function readCommitTimestamp(repoDir: Path, baseCommit: Uuid): Date | undefined

// The committed bytes of <relativePath> at <commit>, or undefined when absent
// (mirror readCommittedFileContent's execSync + JSON.stringify quoting exactly).
export function readCommitFileContent(repoDir: Path, baseCommit: Uuid, relativePath: string): string | undefined

// The first record carrying a cwd — the recorded project root the repo layout is
// relative to.
export function findFirstRecordCwd(records: TranscriptRecord[]): Path | undefined

// Reconstruction stage: when repoDir+baseCommit overrides are set and the commit's
// tree holds this target, splice a tier-1 WriteEvent of the committed bytes at the
// commit's timestamp. Every absence (no overrides, no recorded cwd, target outside
// the project root, unreadable commit, file not in commit) returns events unchanged.
export function seedBaseCommitBeacon(records: TranscriptRecord[], events: FileEvent[], target: Path): FileEvent[]
```

`seedBaseCommitBeacon` steps, in order (single-condition branching per the guide —
each guard its own early return):

1. Read `{ repoDir, baseCommit }` from `getPathOverrides()`; either missing → return
   `events`.
2. `recordedRoot = findFirstRecordCwd(records)`; undefined → return `events`.
3. `relativePath = relative(recordedRoot.toString(), target.toString())`; empty or
   starting with `..` → return `events` (target outside the project → not in this
   repo). `// ponytail: assumes the repo root IS the recorded cwd — pass a config
   repoRelativeRoot if a nested-repo scenario ever appears.`
4. `timestamp = readCommitTimestamp(repoDir, baseCommit)`; undefined → return
   `events`.
5. `content = readCommitFileContent(repoDir, baseCommit, relativePath)`; undefined
   → return `events`.
6. Build the beacon:
   `{ kind: EventKind.write, changeId: computeBaseCommitChangeId(baseCommit, target), target, content, timestamp }`.
7. Insertion index = first index whose event timestamp is strictly after the
   beacon's; splice into a COPY of `events` (never mutate the input).
8. `noteStage({ stage: "seedBaseCommitBeacon", target, changeId, detail: "seeded a tier-1 write beacon from the configured base commit", when: timestamp })`.
9. Return the new array.

**Call site — `src/reconstruction_branches.ts`** (~line 97, right after the
`lineage` filter, BEFORE `seedCopyEvents`, because the beacon is lineage truth every
downstream reader-gated stage must see, and unlike them it needs no reader):

```ts
    const baselined = seedBaseCommitBeacon(records, lineage, finalTarget);
    const seeded = seedCopyEvents(records, baselined, resolving, reader);
```

(comment out the old `seedCopyEvents(records, lineage, …)` line with an
`// item 46:` marker.)

Known scope limit to state in the module header: only transcript-TOUCHED files gain
beacons — target enumeration comes from extracted events, so a file that exists only
in the base commit has no history to splice into. That matches the engine's charter
(reconstruct the files the session touched).

**Tests first — new `tests/reconstruction_base_commit.test.ts`** (temp git repo per
the Phase-4 recipe; every test resets overrides after itself):

- `test_compute_base_commit_change_id_is_deterministic` — same hash+target twice →
  equal ids; different target → different id; id string starts with
  `BASE_COMMIT_CHANGE_ID_PREFIX`.
- `test_seed_base_commit_beacon_no_ops_without_overrides` — events pass through
  identically (same array contents) when overrides are `{}`.
- `test_seed_base_commit_beacon_splices_committed_content_at_commit_timestamp` —
  repo with one commit of `orders.py`; records = one minimal record whose `cwd`
  matches the fake recorded root; a later WriteEvent in `events`; after seeding, a
  new first event exists with `kind === EventKind.write` (enum member comparison),
  the committed bytes, the commit's committer timestamp, and the deterministic
  changeId.
- `test_seed_base_commit_beacon_inserts_mid_stream_by_timestamp` — two events
  bracketing the commit time; the beacon lands between them (index 1).
- `test_seed_base_commit_beacon_no_ops_for_file_absent_from_commit` — target path
  not in the commit's tree → events unchanged.
- `test_read_commit_timestamp_returns_undefined_for_bad_repo` — nonexistent dir →
  undefined, no throw.

Minimal record construction: build a plain object with `cwd: new Path(...)` and
cast via the same `(record as { cwd?: Path })` access pattern the engine itself
uses; if existing tests already have a minimal-record helper (grep
`tests/utilities.ts`), reuse it.

---

## Phase 6 — viewer server wiring

**`src/viewer_api.ts`**:

- New module state + functions beside `activeProjectsDir`:

```ts
// The folder-level file-history override (POST /api/config). undefined = derive.
let activeFileHistoryDir: Path | undefined;

// "" clears the override (back to derivation); a non-directory throws; returns the new effective dir.
export function setFileHistoryDir(requested: string): Path
// The chain the viewer serves and shows: override → sibling of the projects dir → ~/.claude default.
export function getEffectiveFileHistoryDir(): Path
```

- `setProjectsDir` additionally clears `activeFileHistoryDir` (a folder switch
  re-derives, which is exactly the prepopulate behavior the user asked for).
- New per-request override application:

```ts
// Set the engine's path overrides for this request: the project's reveng-paths.json
// entry (if any), plus the viewer's effective file-history dir. Called by every
// project-scoped route BEFORE any build; overrides are process-wide module state,
// so each request overwrites the previous request's (builds are synchronous).
export function applyProjectOverrides(projectName: string): void
```

  Body: `entry = readProjectPathsConfig(activeProjectsDir)[projectName]`;
  `overrides = entry ? hydrateProjectPaths(entry) : {}`;
  `overrides.fileHistoryRoot = getEffectiveFileHistoryDir()`;
  `setPathOverrides(overrides)`.
- `readBlobSnapshot` (line 297): root becomes `getEffectiveFileHistoryDir()`
  (comment out the `getDefaultFileHistoryRoot()` line).
- `buildDocumentWithConsent` cache key (line 234): append
  `|${serializePathOverrides()}` so a config-file edit or folder-level FHS change
  never serves a stale document. `// ponytail: the stamp reads the ACTIVE overrides —
  callers must applyProjectOverrides first; a config-file edit between requests
  changes the stamp and misses the cache, which is the point.`

**`src/viewer_server.ts`**:

- `handleConfigUpdate`: body becomes `{ projectsDir?: string; fileHistoryDir?: string }`;
  at least one key required (400 otherwise); apply `setProjectsDir` then
  `setFileHistoryDir` when each is present; respond
  `{ projectsDir: getProjectsDir(), fileHistoryDir: getEffectiveFileHistoryDir() }`.
- GET `/api/config`: same two-field response shape.
- `handleDocumentRequest`, `handleDiffRequest`, `handleRangePatchRequest`: call
  `applyProjectOverrides(projectName)` immediately after the project name is known,
  before ANY records/build work (the diff and range-patch handlers read the project
  name from `requireParam(query, "project")` — hoist it to a named const where it is
  currently inline).
- `parseServerArgs` usage string: add `[--file-history-dir <path>]`, wired to
  `setFileHistoryDir` (same pattern as `--projects-dir`).

**Tests first — add to `tests/viewer-api.test.ts`**:

- `test_effective_file_history_dir_derives_sibling_of_projects_dir` — temp
  `<X>/projects` + `<X>/file-history`; `setProjectsDir(<X>/projects)`; effective dir
  is `<X>/file-history`; restore the previous projects dir in cleanup.
- `test_set_file_history_dir_override_wins_then_clears_on_projects_switch` — set an
  explicit dir; effective returns it; `setProjectsDir` again; effective re-derives.
- `test_apply_project_overrides_reads_config_entry_and_effective_fhs_root` — temp
  projects dir containing `reveng-paths.json` with an entry for project `p`;
  `applyProjectOverrides("p")`; `getPathOverrides()` carries the entry's typed
  values plus the effective FHS root; `applyProjectOverrides("other")` drops the
  per-project fields but keeps the FHS root.
- `test_document_cache_key_includes_override_serialization` — cheapest honest
  assertion: `serializePathOverrides()` changes when overrides change (already
  covered in Phase 1) PLUS a source-level check is overkill — instead assert via
  behavior: with a scenario fixture already used by existing viewer-api tests, build
  a document, change overrides to a nonsense-but-defined `projectCwd`, and confirm
  `buildDocumentWithConsent` does NOT return the identical cached object
  (`assert.notStrictEqual`). Keep `allowScripts` false so the build is pure.

**Existing wire-shape check**: `grep -rn "api/config" tests/` — if a test pins the
old one-field POST/GET shape, update it to the two-field shape in the same
red-green step.

---

## Phase 7 — webapp header field

**`webapp/index.html`** (after the `projects-dir-change` button, line 17):

```html
        <label class="dir-label" for="file-history-dir-input">File history</label>
        <input id="file-history-dir-input" class="dir-input" type="text" spellcheck="false">
```

The existing **`Change folder…` button submits both fields** — one action, no second
button.

**`webapp/app.ts`** (`initializeHeader`, ~line 505):

- `type WireConfig = { projectsDir: string; fileHistoryDir: string };`
- On init: populate BOTH inputs from GET `/api/config`.
- On click: POST `{ projectsDir: <input>, fileHistoryDir: <fhs input> }`; on success
  the response's `fileHistoryDir` (the server-resolved effective value) is written
  BACK into the file-history input — this is the user-requested prepopulation: type
  a new projects folder, leave file-history blank (send `""`), and the derived
  sibling appears in the field. Keep the existing cache-clear + rehash behavior
  verbatim.

No view-model change → no new webapp test file; the wire shape is covered by the
Phase-6 server tests. Run `npm run build:webapp` ONCE at the end of this phase —
that is a compile, not the test suite, and `webapp/dist/` must stay current.

---

## Phase 8 — bookkeeping

1. `TASKS.md` item 46: mark `[x]`, with a closure note naming: the resolution chain,
   `reveng-paths.json`, the CLI flags, the consumption-point deviation for cwd (and
   why), the `gitBase:` beacon semantics (mid-session supersedes), and that the
   suite was written-not-run (user runs it).
2. Verify TASKS.md item 56 (added 2026-07-09, pre-baseline reconstruction question
   UI) survived unedited next to it.
3. `git add` every touched/created file (including the plan file and
   implementation-notes). DO NOT COMMIT.

## Success criteria

- Unconfigured engine: overrides `{}` → every new branch is a provable no-op
  (default resolution lands on today's exact paths; base-commit stage returns its
  input; fallback repo list = the old preserved-dir singleton).
- Configured audit flow works at the unit level: Phase 2's copied-tree reader test
  and Phase 5's beacon tests are the proof.
- `npm run build:webapp` compiles clean.
- All new tests written red-green; suite NOT run.
