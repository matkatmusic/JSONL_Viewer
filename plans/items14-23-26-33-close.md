# Plan: close TASKS.md items 33, 26, 23, 14

User decisions (collected 2026-07-08): 33 = keep command prompts as dimmed steps (close, no
code); 26 = pin the regenerated s41 capture's git operations in a test; 23 = build the
blob-snapshot link/drawer/button feature as specced below; 14 = BUILD the ReconstructionCorpus
as the single home for per-build cache state.

## Global constraints (apply to every phase)

- **Do NOT run `npm test`, `npm run typecheck`, or any test file.** Write tests RED-first, then
  the code, but never execute them — the user runs the suite afterwards. The ONLY execution
  allowed is the one-off ground-truth capture script in Phase 2 (it is not a test).
- Follow `plans/coding-requirements.md` (domain types `Uuid`/`Path`/`Date`; enums from
  `src/structures/vocabulary.ts`; enum-member comparisons; verb-named functions; DRY helpers;
  no re-export shims).
- When replacing existing code, COMMENT OUT the old code (do not delete it); deletion happens
  only after the user confirms the new code works.
- Implement phases in order 1 → 2 → 3 → 4 (cheapest first; the corpus refactor last).
- When done: update TASKS.md closure notes (Phase 5), `git add` every touched file, do NOT
  commit.

---

## Phase 1 — Item 33: close in TASKS.md (no code)

Edit `TASKS.md` item 33 (currently under "## Decision needed (2026-07-08)"): mark `[x]` and
append:

> **Closed 2026-07-08 (decided — keep):** command-message prompts and their ack replies stay
> as numbered steps, rendered dimmed via `checkMessageTextIsSystem`
> (`webapp/views/timeline.js:441`). Filtering them out would renumber steps and hide real
> turns. No code change.

---

## Phase 2 — Item 26: s41 git-operations test

The regenerated s41 capture (`scenarios/executed/s41-git-baseline-mid-commit/`, run
`…20260708-105945`) has two sessions: baseline `d2b9a286…` (git init → add → commit
"baseline" → `git checkout -b feature`) and mid-stream `86c83fcd…` (add → commit "wip").

### 2a. Fixtures — `tests/fixtures.ts`

Next to `S41_JSONL` (line 103), add the multi-session pair following the S39/S40 pattern
(lines 95-102 — dir-based resolution survives scenario re-runs):

```ts
export const S41_PROJECT_DIR: Path = new Path(resolveScenarioDir(SCENARIO_ROOTS, "s41-git-baseline-mid-commit"));
export const S41_JSONL_PATHS: Path[] = listScenarioJsonlPaths(S41_PROJECT_DIR);
```

### 2b. Ground-truth capture (allowed execution — NOT a test)

Before writing assertions, capture what the engine actually produces (s33 lesson: pin tests to
live output, never to predicted output). Run from the repo root:

```bash
node --experimental-strip-types -e '
import("./src/viewer_api.ts").then(async ({ buildProjectDocument }) => {
  const { Path } = await import("./src/structures/domain.ts");
  const { readdirSync } = await import("node:fs");
  const dir = "scenarios/executed/s41-git-baseline-mid-commit";
  const paths = readdirSync(dir).filter(n => n.endsWith(".jsonl")).sort().map(n => new Path(`${dir}/${n}`));
  const document = buildProjectDocument(paths, undefined);
  console.log(document.gitOperations.map(o => `${o.kind}|${o.detail}|${o.command}`).join("\n"));
});'
```

(If the invocation form fails, adapt to however `scripts/*.ts` invoke the engine — e.g.
`npx tsx`. The point is one printed list of `kind|detail|command`.) s41 contains no script
runs, so this spawns no sandbox work.

### 2c. RED test — `tests/git-operations.test.ts`

Add one test after `test_s85_commit_operations_carry_their_messages`, importing
`S41_JSONL_PATHS` from fixtures. Expected shape — **pin the exact sequence/details printed by
2b**, which per the capture should cover all six operations across both sessions:

```ts
test("test_s41_two_session_git_operations_include_branch_creation", () => {
    // Scenario: s41's baseline session runs init → add → commit "baseline" → `git checkout -b
    // feature` (the first captured branch-creation command in any scenario); the mid-stream
    // session runs add → commit "wip". The two-session document must extract all six, and the
    // checkout must carry the new branch name as its detail.
    // Steps:
    // build the two-session s41 document.
    const document = buildProjectDocument(S41_JSONL_PATHS, undefined);
    // assert the checkout operation exists with detail "feature".
    const checkouts = document.gitOperations.filter(
        (operation) => operation.kind === GitOperationKind.checkout,
    );
    assert.equal(checkouts.length, 1);
    assert.equal(checkouts[0]!.detail, "feature");
    assert.equal(checkouts[0]!.command, "git checkout -b feature");
    // assert the full kind sequence in record order (pin from the 2b capture).
    assert.deepEqual(
        document.gitOperations.map((operation) => operation.kind),
        [/* pin from capture — expected init, add, commit, checkout, add, commit in SOME order */],
    );
    // assert the two commit details (pin from capture; expected "baseline" and "wip").
});
```

If the capture shows the operations in a different order than script order (record merge
order across two files), pin the captured order — the assertion documents reality.

### 2d. TASKS.md closure note for 26

> **Closed 2026-07-08:** the regenerated s41 capture (run 20260708-105945) records
> `git checkout -b feature` in its baseline session; pinned in
> `tests/git-operations.test.ts::test_s41_two_session_git_operations_include_branch_creation`
> via the new `S41_JSONL_PATHS` fixture. Note: branch creation was captured as the `checkout`
> subcommand, so `GitOperationKind.checkout` is what gains fixture coverage;
> `GitOperationKind.branch` shares the identical detail parser (`findFirstNonFlagArgument`,
> `src/reconstruction_git_evidence.ts:141-146`) and the literal `git branch` subcommand
> remains parser-design-only.

---

## Phase 3 — Item 23: blob snapshot links in the Details view

Feature spec (user-authored): inside the JSON inspector, a `backupFileName` value belonging to
the shown record's `snapshot.trackedFileBackups`:

- **on disk** → underlined link, tooltip `view snapshot`; click raises a drawer from the
  bottom of the Details pane splitting it (JSON above, verbatim blob content below). Next to
  the link, a `[View in File History]` button that navigates to the file-history view for that
  path (closing the JSON inspector), anchored to the revision in effect at the entry's
  `backupTime` when one resolves.
- **missing from disk** → no link/button; dimmed ` (missing from disk)` suffix after the
  quoted value.
- Only `backupFileName` values of the CURRENT record get this treatment; blob-shaped strings
  in any other position keep today's revision-link behavior
  (`webapp/inspector.js:252`).

### 3a. Server endpoint — RED tests first (`tests/viewer-api.test.ts`)

New exported function in `src/viewer_api.ts`:

```ts
export function readBlobSnapshot(sessionId: Uuid, blobName: Path): { exists: boolean; content: string | undefined }
```

Behavior:
- Validate `blobName.toString()` against `/^[0-9a-f]{16}@v\d+$/` and `sessionId.toString()`
  against `/^[0-9a-fA-F-]+$/` — throw `Error` on mismatch (trust boundary: both values reach a
  filesystem join; the patterns exclude `/`, `\`, `.` so traversal is impossible).
- Resolve `join(getDefaultFileHistoryRoot().toString(), sessionId.toString(), blobName.toString())`
  (`getDefaultFileHistoryRoot` from `src/reconstruction_sidecar_reader.ts:20-22` — export it
  if not already exported). `existsSync` → `{ exists: false, content: undefined }` or
  `{ exists: true, content: readFileSync(…, "utf8") }`. Owner-dir ONLY — no cross-session
  fallback (owner-keyed reads are the s56/s59/s64 collision fix; probing other sessions'
  dirs would reintroduce wrong-content risk).

Tests (function-level, `tests/viewer-api.test.ts` — the HTTP layer stays thin and untested,
per that file's convention):

- `test_readBlobSnapshot_rejects_a_blob_name_with_path_separators` — assert
  `assert.throws(() => readBlobSnapshot(new Uuid("a"), new Path("../etc/passwd")))`.
- `test_readBlobSnapshot_reports_a_nonexistent_blob_as_missing` — random session uuid +
  `new Path("0000000000000000@v1")` → `{ exists: false, content: undefined }`.
- `test_readBlobSnapshot_reads_an_existing_blob_from_the_owning_session_dir` —
  reader-dependent like `tests/reconstruction_json.test.ts:30-31` (uses the REAL
  `~/.claude/file-history`; there is no root override in this repo). Derive a live
  (session, blob) pair from the s43 capture: for each path in the new `S43_JSONL_PATHS`
  fixture (add `S43_PROJECT_DIR`/`S43_JSONL_PATHS` to `tests/fixtures.ts` exactly like the
  Phase-2a s41 pair), session = jsonl basename minus `.jsonl`; scan its lines for
  `"file-history-snapshot"` records and collect `backupFileName` values from
  `snapshot.trackedFileBackups`; pick the first (session, name) whose file `existsSync`
  under the home root. Assert at least one pair was found, then
  `readBlobSnapshot(...)` → `exists === true` and `content.length > 0`.

### 3b. Server route — `src/viewer_server.ts`

Add to the `handleRequest` dispatch chain (before the static-file branch, mirroring
`/api/raw` at lines 231-234):

```ts
} else if (url.pathname === "/api/blob") {
    const session = new Uuid(requireParam(url.searchParams, "session"));
    const name = new Path(requireParam(url.searchParams, "name"));
    sendJson(response, 200, readBlobSnapshot(session, name));
}
```

Validation errors throw → the existing outer catch returns 400 (`viewer_server.ts:244-245`).
Always 200 + `{exists, content}` JSON — the client branches on `exists`, no 404 handling.

### 3c. Client pure helpers — RED tests first (`tests/inspector-viewmodels.test.ts`)

New exports from `webapp/inspector.js` (flat `test(...)` cases, same import style as
`computeRevisionLinkRoute` tests at lines 65-83):

1. `findTrackedBackupEntry(record, blobName)` — scans
   `record.snapshot?.trackedFileBackups` (the same field `findBackupTimeForBlob` reads at
   `webapp/inspector.js:81-93`); returns `{ relativePath, backupTime }` for the entry whose
   `backupFileName === blobName`, else `undefined`. (`relativePath` is the trackedFileBackups
   key, e.g. `"tests/test_inventory.py"`.)
   Tests: found entry returns its key + backupTime; non-snapshot record returns undefined;
   blob not present returns undefined.
2. `computeSnapshotHistoryAnchor(filesTouched, relativePath, backupTime)` — finds the document
   file whose `target` equals `relativePath` OR ends with `"/" + relativePath`; returns
   `{ target, revisionNumber }` where `revisionNumber` is the 1-based number of the last
   revision with `revision.timestamp <= backupTime` (ISO-string comparison, the
   `computeContentAtTime` convention), or `revisionNumber: undefined` when no revision
   precedes the time; returns `undefined` when no target matches (button omitted).
   Tests: matching target with a revision before backupTime → that revision number; backupTime
   before every revision → `revisionNumber: undefined`; no matching target → `undefined`.
   (Inspect the `filesTouched` entry shape in `webapp/views/file-history.js:97-113` /
   `findRevisionForChangeId` before writing — reuse its field names exactly.)
3. `computeBlobRequestUrl(sessionId, blobName)` — returns
   `/api/blob?session=<enc>&name=<enc>` via `encodeURIComponent`. One test pins the string.
4. In `showLine`, session comes from the shown transcript: derive with the existing
   timeline convention (`fileName.startsWith(sessionId)`, `webapp/views/timeline.js:570`) —
   i.e. `jsonlName.replace(/\.jsonl$/, "")`. Fold this into `computeBlobRequestUrl`'s caller,
   not a separate helper.

### 3d. Client rendering — `webapp/inspector.js`

- Module-level presence cache: `const blobPresenceByKey = new Map();` key
  `` `${session}|${blobName}` ``, value `true`/`false` (fetched), plus cached content for
  opened snapshots if convenient (content is small; re-fetching on every open is also fine —
  pick the simpler).
- In `showLine` (`webapp/inspector.js:307`+): after parsing `value`, if the record has
  `snapshot.trackedFileBackups`, collect its `backupFileName`s with unknown presence; if any,
  `fetchJson(computeBlobRequestUrl(...))` each (`fetchJson` from `webapp/app.js:201`), store
  `exists` in the cache, and when all settle re-invoke `showLine(clamped)` ONLY if the pane
  still shows this line (guard with a module-level render counter incremented at each
  `showLine` entry; capture it before the fetches, compare after). First paint renders those
  tokens plain — progressive enhancement, no flicker loop.
- In `renderHighlightedJson` (`:233`): thread one extra context argument (an object
  `{ sessionId, presenceByKey, project, openSnapshotDrawer }` built in `showLine`) rather
  than more positional params. For each `json-string` token, BEFORE the existing
  `findRevisionForChangeId` branch at `:252`: if `findTrackedBackupEntry(record, value)`
  matches —
  - presence `true` → emit the link span: class `` `${tokenClass} jump-link` ``, `title:
    "view snapshot"`, `onclick: () => openSnapshotDrawer(value, entry)`. Immediately after
    it, emit a button `el("button", { class: "row-btn", text: "View in File History" })`
    whose onclick computes `computeSnapshotHistoryAnchor(filesTouched, entry.relativePath,
    entry.backupTime)` and, when defined, sets `location.hash =
    computeRevisionLinkRoute(project, anchor)` (`webapp/inspector.js:96-101`); when the
    anchor is `undefined`, do not render the button at all (compute it at render time, not
    click time).
  - presence `false` → emit the plain token followed by
    `el("span", { class: "muted", text: " (missing from disk)" })`.
  - presence unknown (fetch in flight) → plain token, no suffix.
  - In all three cases `continue` past the revision-link branch — the snapshot treatment
    replaces it for these tokens.
- `openSnapshotDrawer(blobName, entry)` (defined in `openTranscriptInspector`'s scope, beside
  `openRevision` at `:304`): fetch the content via the same endpoint, then append to the
  inspector content column (the `content` element from `openInspectorPane`,
  `webapp/inspector.js:212-224`) a drawer div and add a pane modifier class:
  - `inspectorPane.classList.add("snapshot-drawer")` (modifier-class precedent:
    `file-preview-drawer`, `:214` — and mirror that line so opening a fresh inspector
    REMOVES `snapshot-drawer`).
  - drawer = `el("div", { class: "snapshot-pane" }, [header, body])`; header row: muted label
    `` `${entry.relativePath} — ${blobName}` `` + a `.row-btn` close button (removes the
    drawer div and the modifier class); body: `el("pre", { class: "inspector-text",
    text: content })`.
  - Re-clicking a link while a drawer is open replaces the drawer's contents (remove old
    drawer div first).

### 3e. CSS — `webapp/styles.css`

Next to the `.inspector-pane.file-preview-drawer` rules (`:132-135`):

```css
.inspector-pane.snapshot-drawer .inspector-json { max-height: 50%; }
.snapshot-pane { border-top: 1px solid var(--border); max-height: 50%; overflow-y: auto; }
.snapshot-pane .snapshot-pane-header { display: flex; gap: 8px; align-items: center; }
```

(Adjust the variable name to the file's real border variable — check `:94-135` — and keep the
split at half the pane per the spec "splitting the detail view in half".)

### 3f. TASKS.md closure note for 23

> **Closed 2026-07-08:** `backupFileName` values in the JSON inspector now resolve against
> disk via `GET /api/blob` (`readBlobSnapshot`, owner-session dir only): on-disk blobs render
> as "view snapshot" links opening a bottom drawer (JSON above, blob content below) plus a
> [View in File History] button anchored by `backupTime`; missing blobs get a dimmed
> "(missing from disk)" suffix. The original xterm-console framing was re-scoped to the
> Details view with the user 2026-07-08; no blob→path map was needed (the snapshot record
> itself maps path → blob).

---

## Phase 4 — Item 14: ReconstructionCorpus (single home for per-build cache state)

**What "corpus" means here (agreed 2026-07-08):** consolidate the five per-records-identity
memo caches into ONE state object with ONE documented validity rule, in a new
`src/reconstruction_corpus.ts`. Compute functions, public function signatures, and every call
site stay untouched; nothing is wrapped or re-exported (the user's no-forwarding-layers rule —
a `corpus.historiesFor(...)` facade is explicitly NOT wanted). The corpus is the canonical
home for cache STATE, not a new API.

### What moves, what stays

Moves into `CorpusState` (current homes, to be commented out):
- `branchSelections` — `src/reconstruction_branch.ts:234`
- `liveBranchSelections` — `src/reconstruction_branch.ts:277`
- `fileOverCaches` — `src/reconstruction_branches.ts:52` (+ its `FileOverCache` type, 47-51)
- `lineageSeedCaches` — `src/reconstruction_branches.ts:186` (+ `LineageSeedCache`, 181-185)
- `executionsByRecords` — `src/reconstruction_script_stage.ts:30`

Stays put (NOT corpus state — different regimes, do not touch):
- cycle/window guards `resolving` (threaded param), `seedingLineages`
  (`reconstruction_branches.ts:175`), `activeLineageReplayCutoff`
  (`reconstruction_script_stage.ts:36`) — execution-stack state, not caches.
- `sandboxOutcomesByInput` (`reconstruction_script_execution.ts:281`) — content-addressed,
  deliberately outlives any records array.
- `parsedRecordsCache` / `builtDocumentCache` (`viewer_api.ts:90/221`) — stamp-keyed HTTP-tier
  LRUs.
- The `reconstructFileOver` purity guard (`reconstruction_branches.ts:65`: never cache when
  `resolving.size > 0 || seedingLineages.size > 0`) and the lineage-seed clean-stack guard
  (`:219-224`) — preserve behavior EXACTLY.

### `src/reconstruction_corpus.ts` shape

```ts
// The per-transcript-set cache state for one reconstruction: every memo that is keyed on a
// records-array identity lives here, in two validity groups. Branch selections are pure
// functions of the records alone and never invalidate. Derived caches depend on the sidecar
// reader identity AND the exec-gate flag; a change to either discards the whole group (a
// declined build's results must never serve a consented one, and vice versa). Guards
// (seedingLineages, activeLineageReplayCutoff, resolving) are execution-stack state, not
// cache state — they stay in their own modules.

export type DerivedCaches = {
    reader: BackupReader | undefined;
    impureAllowed: boolean;
    historiesByTarget: Map<string, FileRevision[]>;
    lineageSeedsByKey: Map<string, string | undefined>;
    executionsByRun: Map<string, RunExecution>;
};

export type CorpusState = {
    branchSelectionsByTip: Map<string, TranscriptRecord[]>;
    liveBranch: TranscriptRecord[] | undefined;   // undefined = not cached (preserves the
                                                  // no-surviving-head early-out semantics)
    derived: DerivedCaches;
};

const corpusStates = new WeakMap<TranscriptRecord[], CorpusState>();

export function getCorpusState(records: TranscriptRecord[]): CorpusState { … }

export function getDerivedCaches(
    records: TranscriptRecord[],
    reader: BackupReader | undefined,
): DerivedCaches { … }  // rebuilds state.derived when reader identity or
                        // isImpureExecutionAllowed() differ (the branches.ts:69 rule,
                        // now applied uniformly — including to executions)
```

`RunExecution` currently lives in `reconstruction_script_stage.ts:29` — export it from there
and import it here (types flow TOWARD the corpus; nothing re-exports). Same for
`FileRevision`/`BackupReader` from their existing homes.

### Call-site migrations (each keeps its public signature)

1. `selectBranchRecords` (`reconstruction_branch.ts:238-255`): replace the
   `branchSelections` WeakMap get/set with `getCorpusState(records).branchSelectionsByTip`.
2. `selectLiveBranch` (`reconstruction_branch.ts:282-303`): use `getCorpusState(records)`;
   keep the no-surviving-head early-out returning `records` WITHOUT setting `liveBranch`.
3. `reconstructFileOver` (`reconstruction_branches.ts:59-81`): purity guard first (unchanged),
   then `getDerivedCaches(records, reader).historiesByTarget` instead of `fileOverCaches`.
4. `getLineageSeedCache` (`reconstruction_branches.ts:188-204`): body collapses to
   `getDerivedCaches(records, reader).lineageSeedsByKey` (the validity re-check is now the
   corpus's job — comment out the local rebuild logic).
5. `executeRunOnce` (`reconstruction_script_stage.ts:65-85`): replace `executionsByRecords`
   with `getDerivedCaches(records, reader).executionsByRun` — the run key
   `` `${run.timestamp.getTime()}|${run.code}` `` (line 76) is unchanged. **This is the one
   behavior change in the phase:** the executions memo becomes reader/exec-gate-validated
   like its siblings (today it checks neither — a latent validity hole where a consented
   run's sandbox `post` state could be served into a declined rebuild of the same records
   array; `executeRunOnce` already receives `reader`, so no signature change).

### RED tests first — extend `tests/reconstruction_memo.test.ts`

The six existing tests (lines 35-91) pin the invariants that must survive; do not modify
them. Add:

- `test_execution_memo_is_invalidated_when_the_exec_gate_flips` — mirror the existing
  exec-gate test (`:78-91`) but observe `executeRunOnce` identity: same records + same run,
  gate flipped between calls → the returned `RunExecution` must be a different instance
  (compute fresh), proving executions joined the validity rule. Build the run/records from
  the same fixture the existing script-stage tests use (see
  `tests/reconstruction_script_stage.test.ts:56`'s setup).
- `test_execution_memo_is_reused_for_the_same_records_and_reader` — two identical calls →
  SAME instance (the memo still hits).
- `test_branch_selections_survive_an_exec_gate_flip` — `selectLiveBranch(records)` instance
  identical before/after a gate flip (pins the two-group validity split: branch selections
  are records-pure).
- `test_derived_caches_are_invalidated_when_the_reader_identity_changes` — call
  `reconstructAll(records, readerA)` then `reconstructAll(records, readerB)` (two distinct
  closure instances) and assert the per-file `revisions` instances differ (closes the gap the
  memo suite notes — reader-identity invalidation is currently asserted in code but untested).

### Execution order within the phase

1. Write the four RED tests.
2. Create `src/reconstruction_corpus.ts`.
3. Migrate sites 1-5 one file at a time (branch.ts → branches.ts → script_stage.ts),
   commenting out each replaced WeakMap declaration and its get/set blocks with a
   `// corpus: moved to reconstruction_corpus.ts (item 14)` marker.
4. Re-read `tests/reconstruction_memo.test.ts` and confirm every EXISTING assertion still
   holds by inspection (esp. identity-collapse tests — the corpus preserves them because the
   cached VALUES are unchanged, only their storage moved).

### TASKS.md closure note for 14

> **Closed 2026-07-08 (built):** per-build cache state consolidated into
> `src/reconstruction_corpus.ts` (`CorpusState`: records-pure branch selections + reader/
> exec-gate-validated derived caches for histories, lineage seeds, and executions). Public
> functions, compute pipelines, cycle guards, the content-addressed sandbox memo, and the
> viewer LRUs are unchanged; no facade/forwarding layer (per the no-forwarding-layers rule —
> the handoff-2232 `historiesFor(...)` facade shape was deliberately not built). Bonus fix:
> `executeRunOnce`'s memo now invalidates on reader-identity/exec-gate changes like its
> siblings (previously unchecked). New invariants pinned in
> `tests/reconstruction_memo.test.ts` (+4 tests).

---

## Phase 5 — wrap-up

1. TASKS.md: apply the four closure notes (Phases 1, 2d, 3f, 4) — items 33, 26, 23, 14 all
   `[x]`.
2. Append a dated entry to a new `plans/implementation-notes-items14-23-26-33-close.md`
   recording deviations from this plan (per the /jot:implement convention).
3. `git add` all touched files: TASKS.md, plan + notes files, `tests/fixtures.ts`,
   `tests/git-operations.test.ts`, `tests/viewer-api.test.ts`,
   `tests/inspector-viewmodels.test.ts`, `tests/reconstruction_memo.test.ts`,
   `src/viewer_api.ts`, `src/viewer_server.ts`, `src/reconstruction_sidecar_reader.ts` (if
   the root getter needed exporting), `src/reconstruction_corpus.ts`,
   `src/reconstruction_branch.ts`, `src/reconstruction_branches.ts`,
   `src/reconstruction_script_stage.ts`, `webapp/inspector.js`, `webapp/styles.css`.
   **Do NOT commit.**
4. Do NOT run the suite — hand off to the user.
