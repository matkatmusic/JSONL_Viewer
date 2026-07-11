## 2026-07-10:14:05:00 — Item 66: port the Fork-style design into webapp/
Chat title: item66-fork-style-port
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/e8501d86-5c92-400e-883b-9f2a833cc715.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item66-fork-style-webapp-port.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/fork-style-mockup.html
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-fork-style-mockup.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/archive/timeline-pre-item66.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/archive/styles-pre-item66.css

### Design decisions

- 2026-07-10 Pre-port copies of `webapp/views/timeline.ts` and `webapp/styles.css` archived
  to `webapp/archive/` BEFORE any edits (archive-preserve convention); `webapp/archive`
  added to the `exclude` arrays of both tsconfigs so the copies never compile.
- 2026-07-10 Four user-approved scope decisions baked into the plan: Details right pane =
  the full existing transcript inspector (not the mockup's simple JSON); engine extracts
  the commit hash from tool_result text (`GitOperation.resultHash`); old sub-routes stay
  working (mounted into the Details pane); session ends render as thin muted rows.

### Deviations

- 2026-07-10 Phase 1: the commit-hash regex lives in `src/regex_expressions.ts`
  (`gitCommitResultHashLine`) instead of inline in `reconstruction_git_evidence.ts` — that
  module's header mandates it as the single canonical home for all patterns.
- 2026-07-10 Phase 1 finding: s85's commit tool_results print piped output (`ok 14e26ec`),
  not the `[branch hash]` line, so s85 commits get `resultHash === undefined` and render
  the `—` pill fallback. Plain `git commit -m` transcripts (s39 et al.) match normally.
- 2026-07-10 Phase 2: `findContributingNodeIndexes` skips orphaned nodes (mirrors
  `deriveCommitChangedFiles`'s walk) — a rewound row never highlights as contributing even
  when its path overlaps the commit's files. The "(tool activity)" summary fallback applies
  to agent turns only.

- 2026-07-10 Phase 3: mockup's hardcoded dark colors mapped to theme vars/`color-mix`
  (role-user→`--accent`, role-assistant→`--lane-violet`, role-tool→`--orange`,
  role-script→`--lane-teal`) so light mode works; `#breadcrumb` span retained for the
  config-error path; JFRED title stays a home link; projects-list route keeps `.view-pane`
  padding while timeline rows render edge-to-edge; body font is `var(--ui)` with a grouped
  rule pinning code-bearing views back to `var(--mono)`.

- 2026-07-10 Phase 5: `mapStoredDiffModeToToggle` routes through
  `resolveInitialDiffDisplayMode`, so an absent/garbage stored mode yields "columns" (the
  diff-vs-base split default), not the plan's literal "else inline" — one vocabulary
  source. Details header humanizes kind labels ("agent-turn" → "agent turn"). Commit mode
  with zero changed files shows a "No files changed" empty state. File mode auto-selects
  revision card #1 on entry. `/api/diff` requests carry `allowScripts=1` when consent is
  stored (parity with file-history; consent-gated projects would 4xx otherwise).
  `openSnapshotDrawer` re-pointed at `#details-right-body` so blob drawers keep working.

- 2026-07-10 Phase 4/6: session-end rows DO get a `{ }` button (opens the transcript at the
  session's last line) — Phase 4's explicit spec supersedes locked decision 4's terser "no
  `{ }`" wording. The session-anchor flash is suppressed when a line anchor is also present
  so the two scrolls don't fight. Dead item-55 helpers (`attachGitOperationsToAgentTurns`,
  `renderGitOperationRow`, `showGitOperationJson`, `formatGitOperationLabel`, SVG rail) are
  DELETED from the live file — they live on in `webapp/archive/timeline-pre-item66.ts`.
  `WireTimelineDocument`/`WireFileHistory`/`TimelineNode`/`FileChange` became exported types
  (details.ts contract).

### Tradeoffs

(none yet)

### Headless verification (2026-07-10, s84 + s39 on a fresh build, port 7343)

- s84: 55 rows, 3 GIT COMMIT rows with REAL hash pills (928eaa9 / a6b3cc3 / 8aae09d — the
  bare-hex-token fallback below made these live), 3 sessions + 4 files in the sidebar,
  49/55 rows carry `L:n (of N)`, zero console errors. Expand All → 49 expandable rows +
  flipped label. Message mode: header "Step 2 of 55 — agent turn — …", inspector JSON in
  the right pane. Commit mode: header "git commit a6b3cc3 — add find_item — …", changed
  file `core_inventory.py`, 1 `.contrib` row, diff rendered; Columns/Inline toggle
  round-trips and persists "inline"/"split". Picks: crossing a commit is refused with the
  "hard stops" flash; selectbar shows count + Export .patch. `/at/49` anchor selects the
  row and opens the inspector. `…/file/<target>` sub-route renders into the Details pane
  ("File history — …") with the timeline intact. Console auto-collapses to the status bar
  ~1s after load (an earlier probe simply beat the 400ms timer). s39: 20 rows matching the
  user's original mock (git init / ls / rtk ls / mkdir tool rows, 2 session ends, 12 chips
  with per-chip buttons), zero console errors.

### Deviations (added during verification)

- 2026-07-10 `extractCommitHashFromResultText` gained a FALLBACK (TDD,
  `test_commit_operations_carry_result_hash_from_bare_hex_token`): when the `[branch hash]`
  summary line is absent, a whole-word 7-40-char hex token in the commit's own result is
  taken as the hash (`bareCommitHashToken` in `src/regex_expressions.ts`). Reason: ALL
  scenario captures pipe git's summary away and echo `ok 928eaa9`-style lines — without the
  fallback every demo commit pill rendered "—".

### Post-verification bug fix (2026-07-10, user-reported)

- Consent-prompt layout: with the Details pane hidden, nothing in the `#rightcol` flex
  column grew — the timeline pane stopped at its 42% basis and the console floated
  mid-window. CSS-only fix (`webapp/styles.css`, beside `.details-pane.hidden`):
  `#rightcol:has(.details-pane.hidden)` hides `#split-td` and gives `#timeline-pane`
  `flex: 1 1 auto !important` (the `!important` beats a prior splitter drag's inline
  flex). Verified headlessly on s47's consent screen: `gapBelowConsole: 0`.

### Post-verification additions (2026-07-10, user-requested)

- Role pills: rows open with a pill-style role tag — "User" / "Agent" / "Tool"
  (tool-call rows) / "Script" (`computeRolePillLabel(node)` + `.role-pill-*` CSS colored
  like the row's role text; white on selection). "Script" marks an agent turn whose file
  chips carry a `script-execution` revision — that turn IS the script run's row (real
  transcripts have no separate script node kind). Commit and session-end rows get none.
  TDD'd (75/75 green); verified headlessly on s84: 10 User / 15 Agent / 23 Tool /
  1 Script (on the `apply_renames.py` turn).
- s39 "git commits aren't shown" (user report) — NOT a bug, nothing to render: the
  transcripts record only `git init` (line 33) and `git add orders.py tests/` (line 65),
  no `git commit` tool_use exists in either session, `commitMarkers` is 0, and the
  preserved repo's `git log --all` is EMPTY (init + add, never committed). s39's
  "baseline" is a seeded working tree, not a commit. Commit rows render wherever commits
  exist (s84: 3 rows with real hashes). Never-fabricate applies.

- s58 blank commit pill (user report): a hash-less commit rendered the `—` placeholder
  pill, which reads broken. Timeline row now renders NO pill when `resultHash` is
  undefined, and `computeDetailsHeaderText` drops the hash segment entirely (test
  renamed to `test_computeDetailsHeaderText_omits_missing_hash`, 5/5 green). Verified on
  s58: `pillCount: 0`, header "git commit — baseline — …". (Why s58 has no hash: its
  commit's tool_result carried no `[branch hash]` line and no bare hex token.)

- Session-start markers (user report, s58): interleaved multi-JSONL projects never showed
  where a later session began (the fork port dropped the old per-switch session headers).
  New `findSessionStartIndexes(nodes)` (TDD, 2 tests, 77/77 green) yields each session's
  FIRST node index; the render inserts a thin session-colored `.tl-session-start` rule
  ("session <short8> starts · <jsonl>") before that row — one marker per session, none at
  later interleave switches. Verified on s58: markers at container positions 0 and 14 in
  the two lane colors.

- Session-start markers now show the session's custom title (user request): new engine
  `findSessionTitles` (`src/reconstruction_json.ts`) maps `custom-title` records
  ({type, customTitle, sessionId}) to a wire `sessionTitles: Record<sessionId, title>`
  (2 tests in `tests/document-timeline-fields.test.ts`); webapp
  `computeSessionStartLabel(sessionTitles, sessionId)` renders
  "Session <title> started: <id>" or "Session started: <id>" when unnamed/absent
  (1 test, 78/78 green; optional wire field tolerates older cached documents). Marker CSS
  drops its uppercase so titles read as typed; the jsonl-filename suffix is gone (the id
  IS the filename stem). Scenario captures carry no custom-title records, so s58 verifies
  the fallback live; the title path is unit-pinned. Server restarted (engine change).

### Open questions

- The FIRST commit of a session ("baseline") shows "No files changed" + no contrib rows:
  its file chips live on the trailing reply bubble that sorts AFTER the commit row
  (snapshot attribution), so the walk-back finds nothing. Later commits work. Acceptable,
  or should `deriveCommitChangedFiles` also absorb the files bubble immediately after the
  commit?
- Rev-card op badges render single letters (A/M) rather than the mockup's word badges
  (write/edit/user-edit) — eyeball and decide which reads better.
- s39 emits NO commit node (its `git add … && git commit` compound extracted only the
  `add` op — pre-existing engine behavior, not a port regression). Flagging in case a
  commit row was expected there.
