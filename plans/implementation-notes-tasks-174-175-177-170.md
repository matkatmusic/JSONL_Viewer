## 2026-07-22:10:58:00 — Multi-source batch: CLI (174), merged timeline (175), webapp (177), s88 scenario (170)
Chat title: task 174 175 177 170
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/cd52c321-257b-4f35-824b-43fae2db98bc.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/174-175-177-170-multi-source-batch.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-multi-source-design.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/172-173-multi-source-config-and-reader.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/SPEC.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/159-paths-wizard-mockup.md

### Design decisions

- (task 174) Multiple conversation-log folders arrive as multiple positional
  transcript paths; per-source file-history dirs/roots are config-driven via
  the existing reveng-paths.json `sources` shape. No new repeatable flags —
  the config file already models exactly this shape (task 172).
- (task 174) With multiple positionals spanning >1 distinct projects root and
  no config `sources`, the CLI derives one bare `{projectsDir}` source per
  root so per-source sibling file-history resolution works with zero config.
- (task 175) Identity join runs dedupe → interleave → join (the design's §c
  order with identity resolved on the interleaved stream, so "earlier root" is
  well-defined by wall clock).
- (task 175) Content gate implements the Edit-evidence channels only
  (originalFile equality; hunk pre-side containment). Non-Edit first evidence
  → no join (ponytail comment in code; backup-blob channel deferred until a
  fixture needs it).
- (task 175) Path remap is clone-on-write (never mutates records — they live
  in loadProjectRecords' LRU cache); cloned records are re-source-stamped via
  a new `setRecordSource` export in parse/loadTranscript.ts.
- (task 177) `sources` rides PathOverrides (process-wide, request-scoped like
  every other override) so no build-signature threading; serializePathOverrides
  includes it so document cache keys distinguish source configs.
- (task 177) When a project entry declares `sources`, the source list is
  authoritative for jsonl discovery (union of scanProjects over each source's
  projectsDir); legacy entries keep the single-dir scan.
- (task 170) The cross-source shared-file interleave uses explicit `cp` sync
  steps between roots (mirrors the real jot/jot-backup sync mechanism that
  makes the §a content gate agree at the join).

### Deviations

- Per user direction mid-session, work stopped after finishing implementation
  (all four tasks' code/tests/scenario written, everything staged, nothing
  committed) and a handoff doc was generated for tasks 175/177/170 instead of
  running the SPEC.md-update / close-tasks wrap-up in this session.
- The planned webapp DOM test `test_apply_after_sources_refetches_document`
  was dropped; the existing postProjectPaths flow (cache drop + renderRoute)
  already covers the refetch and is exercised by the other five tests.
- The join orchestration/gate split into THREE modules
  (reconstruction_multi_source.ts / _join.ts / _gate.ts) instead of two — the
  250-line-cap hook forced the extra split; session roots are passed into the
  join as a parameter to keep imports one-way.
- resolveJsonlPaths moved to a NEW viewer_api_sources.ts (not
  viewer_api_projects.ts as planned) — both viewer_server_routes.ts and
  viewer_api_projects.ts sit at the 250 cap.

### Tradeoffs

- Multi-source builds re-run the per-records WeakMap memos cold (new merged
  array per build). Correctness first; memoize per (stamp, sources) if
  profiling shows it.
- Inspector blob drawer (readBlobSnapshot) still reads the single effective
  file-history dir — multi-source blobs outside it won't render in the drawer.
  Known gap, follow-up task material.

### Open questions

(none yet)
