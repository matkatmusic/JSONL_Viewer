## 2026-07-08:13:10:00 — TASKS.md items 11, 12, 10(a–h)
Chat title: tackle-tasks 16, 12, 11, 10
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/8e789058-eb57-4447-8c8f-3b1f9a9b4ef1.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-items-10-11-12.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md

### Design decisions

- 2026-07-08 Item 16 (handled before this plan): retired the Phase B "kept[] sole input"
  refactor per user decision; only the stale header in src/reconstruction_parse_lines.ts was
  rewritten. No behavior change.
- 2026-07-08 Item 11: persistence is OPT-IN via configureSandboxMemoPersistence(path) called
  only by viewer_server.ts, so engine CLI runs and the existing spawn-counting tests stay
  memory-only and deterministic. Configure clears + reloads the memo, which also makes the
  seed-from-disk test writable without exporting the sha256 key function.
- 2026-07-08 Item 11: persisted file is .cache/sandbox-memo.json (repo root; .cache is
  gitignored). Whole-file rewrite after each new spawn — a spawn costs ~100ms, the write is
  trivial; the file mirrors the LRU-capped (256) memo.
- 2026-07-08 Item 10e: hunk rows are hidden in CSS only (font-size 0 + dashed separator);
  computeSplitRows keeps emitting them so gutter counters and existing view-model tests stay
  untouched.
- 2026-07-08 Item 10a: single toggle button flips between »/« and toggles a .collapsed class
  (24px rail like the Files drawer) — keyboard focus stays on the one control across
  collapse/expand.

### Deviations

- 2026-07-08 Item 10a premise correction: TASKS.md said the « rail button "is a CSS
  pseudo-element". No pseudo-element exists — the collapse control was already a real
  button; the actual gap was that collapsing set display:none with NO reopen affordance, and
  app.js's handleInspectorRailClick was unreachable dead code (a display:none pane receives
  no clicks). Fixed by the .collapsed rail; the dead handler is deleted.

### Tradeoffs

- Item 11 alternative considered: append-per-outcome JSONL to avoid rewrites. Rejected —
  whole-file JSON is simpler, self-compacting under the LRU cap, and write frequency equals
  spawn frequency (rare).

### Phase 1–3 records (done 2026-07-08 ~13:25, parallel subagents; whole-repo tsc clean after)

- Phase 1 (item 11): configureSandboxMemoPersistence + load/persist helpers in
  reconstruction_script_execution.ts (:284-338, persist call :373); viewer_server.ts opt-in
  (:261-263). 3 tests appended (:245-357). `.gitignore` untouched — `.cache/` already ignored
  (line 87). Path values feed fs via `.toString()`, matching reconstruction_sidecar_reader.ts.
- Phase 2 (item 12): tab `5 · Viewer request path` in engine-pipeline-diagrams.html
  (nav :35, tab :627-733; 20 nodes / 4 subgraphs; tab-3 palette). Agent rendered it via a
  temp local HTTP server + headless browser: SVG renders, zero mermaid/console errors.
- Phase 3 (items 10b/d/f): checkSelectionBlocksBackgroundClose + computeUnattributedStepTag
  exported from timeline.js (tag wired in the AGENT_TURN block — the only node kind carrying
  fileChanges chips); DiffDisplayMode + resolveInitialDiffDisplayMode + localStorage mirroring
  in diff-vs-base.js; 5 + 2 RED tests appended to timeline-viewmodels / viewer-viewmodels.

### Phase 4 record (done 2026-07-08 ~13:20, by the main session)

- 10a: inspector.js — toggleInspectorCollapsed(pane, button); collapse button now flips »/«
  and toggles .collapsed; openInspectorPane strips .collapsed on fresh opens. app.js —
  handleInspectorRailClick + its registration commented out (dead: no .hidden rail override
  exists in CSS, so it could never fire). styles.css — 24px .collapsed rail rules.
- 10c: timeline-route inspector width 0.4 → 0.5 (comment updated 60/40 → 50/50).
- 10e: .diff-line-hunk restyled as a 9px dashed separator with font-size 0 (old accent-color
  rule commented out); computeSplitRows/inline renderer untouched so existing view-model tests
  still describe the emitted rows.
- 10g: snapshot-drawer content column becomes flex column; .inspector-json capped at 50% and
  .snapshot-pane takes the remainder (flex 1 1 0 + min-height 0); old max-height pair
  commented out.
- 10h: button gains .snapshot-history-btn (keeps .row-btn); block display + system-ui
  typography inside the JSON <pre>.

### Open questions

- 10f: modern Node exposes a global localStorage stub, so importing diff-vs-base.js in the
  test runner may print a one-line ExperimentalWarning ("--localstorage-file was not
  provided"). Behavior is correct (getItem → null → split default); if the warning is
  noisy in test output, swap the typeof guard for a try/catch.
- 10c: chose 50/50 for the timeline/details split (task said "cramped", gave no target).
  Nudge the 0.5 multiplier (styles.css .layout.timeline-route .inspector-pane) if too wide.
- 10e: hunk gaps now render as thin dashed separators with the header text hidden. If you'd
  rather keep the text visible-but-muted, swap the .diff-line-hunk rule back and just change
  its color.
