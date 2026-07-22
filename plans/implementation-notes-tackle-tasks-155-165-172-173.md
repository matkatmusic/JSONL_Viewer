## 2026-07-22:09:43:16 — Tasks 172 + 173 implemented (multi-source config + per-source reader); 165 pushed to CI; 155 awaiting user sweep
Chat title: task 155 165 172 173
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/61803da9-8708-4e62-b260-81db0c026600.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/172-173-multi-source-config-and-reader.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-multi-source-design.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/SPEC.md (S3, S4)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-tackle-tasks-142-143-144-145.md (task-155 residue origin)

### Design decisions

- Task 172: the legacy degenerate case does NOT map `cwd` → `root`. `projectCwd` is the
  item-46 git-evidence disk-access override ("where the project lives NOW"), not a
  rel-path workspace root; legacy entries hydrate to one source with `root` absent —
  the design-§b auto-detect signal — same as any sources entry that omits `root`.
- Task 172: `hydrateProjectPaths` / `readProjectPathsConfig` / `writeProjectPathsEntry`
  untouched; `sources` is purely additive and rides through the JSON parse untouched.
- Task 173: per-session root resolution chain for declared sources is
  matching source's explicit `fileHistoryDir` → that session's transcript-derived
  sibling → `~/.claude` default. The global item-46 `fileHistoryRoot` override is
  deliberately NOT consulted on this path: it is the single-source knob set from the
  same config entry's legacy `fileHistory` field; a project that declares `sources`
  expresses per-source dirs instead, and consulting both would create a precedence
  tangle for zero real configurations. Sessions no source claims (and sources-less
  callers) keep the full legacy chain.
- Task 173: only `buildProjectReconstruction` gained the trailing optional `sources`
  parameter. `buildProjectDocument`, `buildReconstructionWithConsent`, and the
  consent-layer cache key are untouched — no caller passes `sources` yet (server/CLI
  plumbing is later S4 work), and the cache key only needs a sources component when
  that plumbing lands.
- Sessions are matched to sources by the transcript's on-disk location
  (`dirname(dirname(record source filePath))` vs `resolve()`-normalized
  `source.projectsDir`), reusing the loadTranscript source stamping — no new metadata.

### Deviations

- The plan's RED phases end at "test written", not "test observed failing", because the
  user runs all tests — but the project's Stop hook auto-ran each edited test file
  anyway, and confirmed both RED failures (missing `hydrateProjectSources` export;
  ENOENT reading session B's blob from tree A's root) and subsequent GREENs. No
  intentional deviation from the plan's code shapes except `computeSessionFileHistoryRoots`:
  restructured from nested ifs to early-`continue` guards plus an extracted
  `resolveSourceFileHistoryRoot` helper, after the jot post-tool hook flagged >3-level
  nesting. Single-condition-per-branch is preserved.

### Tradeoffs

- The viewer-api smoke test (`test_build_project_reconstruction_accepts_two_source_transcripts`)
  only asserts a two-source build succeeds; the owning-source blob behavior is proven at
  the reader unit level. A full document-level two-source fixture with real backups is
  spec-S7 territory (acceptance scenario, task 178-ish) — not duplicated here.
- `Map<string, string>` keyed by sessionId string stays module-private inside the reader;
  the public reader surface still speaks `Uuid`/`Path` (coding-req §1 wrapper rule applies
  to public interfaces).

### Session status (tasks 155 / 165)

- Task 165: jfred develop pushed (de12e75..80c1a84) — first full-suite CI run triggered
  (`npm test` + scenarios submodule + repo.git.tar extraction). Scenarios repo captures
  were already pushed (9c44354). First run: 947 pass / 4 fail (run 29937410261). All four
  residuals triaged and fixed (staged, not committed):
  1. `test_range_patch_covers_renamed_files_in_s85` — NOT machine-bound: task 155's
     rename revisions now legitimately put the moved-away source (`one.py`) in the range
     patch; the test's "sources persist as destination creations" expectation was stale.
     Assertion flipped to expect the source's diff block.
  2. `test_s37_ledger_has_a_script_execution_revision_renamed_without_the_comment` —
     `reconstructLedger` hard-wired `createSidecarReader(session, getDefaultFileHistoryRoot())`
     (live machine only); switched to `buildSidecarReader(records)` so the engine's own
     sibling-derivation chain serves the captured scenarios/file-history sidecars on CI.
     This is exactly task 165's "verify whether tests resolve file-history from inside
     scenario dirs or the live machine" item.
  3. `test_build_sidecar_reader_reads_blob_from_derived_sibling_root` and
  4. `test_readBlobSnapshot_reads_an_existing_blob_from_the_owning_session_dir` —
     genuinely machine-bound (they derive a live (session, blob) pair from
     ~/.claude/file-history by design); both now `t.skip()` when that input is absent.
     Also fixed a latent `join(root, session, null)` TypeError in
     `findBackupInSnapshotLine` (captured snapshot lines can carry `backupFileName: null`;
     locally the scan returned before reaching such a line, on CI it didn't).
  Side effect: viewer-api-projects.test.ts crossed the 250-line cap with the skip guard;
  its blob-snapshot section moved whole to NEW tests/viewer-api-blob-snapshots.test.ts
  (split, never condense).
- Task 155: engine implementation was already committed (80c1a84,
  reconstruction_script_move_events.ts); the remaining work is the 87-scenario sweep,
  which the user runs. Note the s85 range-patch expectation update above is the first
  sweep-adjacent consequence of 155 — the user's sweep will confirm the rest.

### Open questions

- Task 173's acceptance includes "full 87-scenario sweep stays green" — deferred to the
  user's test run (per instruction not to run tests). The sources-less code path is
  byte-identical by construction, so sweep risk is minimal.
- Should the consent-layer (`buildReconstructionWithConsent`) grow the `sources`
  parameter + cache-key component now or with the server plumbing task? Deferred to the
  plumbing task (nothing can pass it yet).
