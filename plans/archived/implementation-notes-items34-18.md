## 2026-07-08:17:05:00 — TASKS.md items 34 (deterministic synthetic changeIds) + 18 (webapp → TypeScript)
Chat title: tackle-tasks 34, 18
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/8b481a6c-d61a-4d96-a2c3-ccf6ca7be5c3.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item34-deterministic-changeids.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item18-webapp-typescript.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md

### Design decisions

- **Item 34 id format is `scriptRun:<sourceSegment>:<targetPath>`**, not a hash of
  target+timestamp. The source segment is the run's tool_use id when the run came from a
  transcript record (`ScriptRun.toolUseId`, new field populated in `runsInRecord`), falling
  back to epoch-ms timestamp for synthetic runs. Rationale: embedding the tool_use id makes
  the id unwrappable by `resolveSyntheticChangeIdToSourceId` → `indexChangeIdsToSessionIds`,
  so the fix also repairs SESSION attribution of script-run steps (the 29 unattributed-lane
  scenarios from item 31's sweep), which a pure target+timestamp hash could not do.
- Neither `toolu_…`/`cse_…` ids nor epoch-ms contain `:`, so the first `:` after the prefix
  always terminates the source segment regardless of what the target path contains.
- New helpers live in `reconstruction_script_execution.ts` (owner of `ScriptRun`), not the
  stage file — `reconstruction_json.ts` imports them without any cycle.

### Deviations

- The plan (and TASKS.md item text) said "target + run timestamp"; the implementation embeds
  the tool_use id preferentially, timestamp only as fallback — strictly more informative,
  same determinism (both replays parse the same records → same tool_use id).

### Tradeoffs

- A timestamp-fallback id (`scriptRun:<epoch-ms>:<target>`) resolves to no session — identical
  to the old behavior for such runs; acceptable because transcript-parsed runs always carry a
  tool_use id.
- `reconstruction_git_evidence.ts:377`'s `randomUUID()` (evidence-spliced commit user-edits)
  left untouched by design: the viewer uses commit MARKERS for those, documented above
  `CommitMarker` in reconstruction_json.ts.

### Design decisions (item 18)

- **tsc transpile, no bundler** (user-picked): new `tsconfig.webapp.json` emits `webapp/` →
  `webapp/dist/` with `rewriteRelativeImportExtensions: true` (TS 5.9 installed) — webapp
  source imports `.ts` like `src/` does, emitted browser JS imports `.js`. Root tsconfig
  gained `webapp` in include and DOM libs (tests import webapp modules, so the root program
  contains them regardless).
- **Dist-first static serving**: `resolveStaticFilePath` lives in `src/viewer_api.ts` (not
  viewer_server.ts) because the server listens at module top level — a test importing it
  would boot a listener; viewer_api is the file's own documented home for logic. 2 tests in
  `tests/viewer-static.test.ts`.
- **Per-file agent fan-out**: 10 parallel subagents, one per file, after a single mechanical
  pass (git mv + specifier rewrite) — no cross-file edit collisions. timeline.ts (54KB,
  191 errors) verified its transpiled JS byte-identical to the committed .js.
- **Generic fetch helpers**: `fetchDocument<DocumentType>` / `peekCachedDocument<DocumentType>`
  / `fetchJson<PayloadType>` — each view names the wire fields it reads via a local `Wire*`
  type; app.ts stays shape-agnostic (`Record<string, unknown>` default).
- **Minimal structural param types** where tests/inspector pass smaller fixtures than the full
  view-model shapes: `WireRevisionRef`/`WireFileHistoryRef` (file-history.ts),
  `{ path; changeId? }` for `computeSnapshotJumpRoute`, `{ isCollapsed }` for
  `checkSelectionBlocksBackgroundClose`, generic `filterProjectsByName<ProjectType>`.
- **xterm stays a script-tag global**: `declare global` types `Terminal`/`FitAddon` +
  type-only imports from @xterm packages (erased at emit); no bare-specifier imports the
  browser can't resolve.

### Deviations (item 18)

- The plan's per-file conversion loop (rename → convert importers in the same pass) was
  replaced by one mechanical rename+rewrite pass THEN parallel typing — same end state,
  collision-free for the agent fan-out.
- `onJumpToLine` never needed loosening — the inspector agent typed the options object with
  it optional from the start; the predicted test errors resolved themselves.
- Tests gained type-level-only edits beyond import specifiers (non-null `!` on optional
  timeline-node fields their fixtures guarantee, dropped over-narrow inline callback
  annotations). No assertion or fixture values changed.

### Open questions

- None blocking. After the user runs the suite + scenario sweep: re-check item 31's
  "(unattributed)" CSS hide rule (webapp/styles.css ~254) — with deterministic ids the 29
  scenarios' script turns should now attribute, making the rule removable.
- `npm run app` now rebuilds the webapp on every start (~1s tsc). If that grates, split a
  `app:fast` script that skips the build.
