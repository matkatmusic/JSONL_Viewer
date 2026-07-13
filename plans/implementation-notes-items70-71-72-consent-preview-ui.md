## 2026-07-13:13:04:00 — Items 70+71+72: consent-page preview expand, python highlighting, live Expand All
Chat title: tackle-tasks 70, 71, 72 (consent preview UI)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/8f010af6-6229-4cd3-96c4-0f98af6d7ddb.jsonl

### References

/Users/matkatmusicllc/.claude/plans/items70-71-72-consent-preview-ui.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (items 70-72, marked done)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/app.ts (all new logic)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/highlight.ts (reused, unchanged)

### Design decisions

- Item 70 overflow detection is a pure line-count heuristic (`checkConsentScriptOverflowsPreview`,
  code lines > 12) instead of measuring `scrollHeight` — measurable only after layout,
  untestable under node:test, and the preview `<pre>` never wraps (`overflow-x: auto`) so
  line count is proportional to rendered height. Marked with a `ponytail:` comment naming
  the upgrade path (measure the rendered element if wrapped lines ever misjudge).
- Item 71 highlights every consent script as Python via the existing `renderCodeInto` with
  pseudo-path `__script__.py` — the engine executes every recorded run as
  `python3 __script__.py` (reconstruction_script_execution.ts:525), so no language
  detection was built. `WireConsentScript` has no language field; none was added.
- Item 72 took the task's "make it work" option (not "hide the button"): a visible button
  labeled "Expand All" above collapsed previews should expand them, and item 70's
  per-preview state makes that nearly free.
- `#toggle-all` is wired by `onclick` property assignment (timeline.ts precedent) so
  re-renders never stack handlers; expandables are re-queried from the DOM on every click
  because the per-row Expand buttons and the item-69 Show/hide button mutate the same state
  between clicks.

### Deviations

- None from the plan. The plan itself defaults item 72's either/or to "wire it".

### Tradeoffs

- The global Expand All label can go momentarily stale after per-row or Show/hide clicks
  (those handlers don't call `updateToggleAllLabel`). Accepted: the global button recomputes
  truth on every click, so a stale-label click still expands the remainder — least
  surprising outcome, no cross-button plumbing.
- With zero expandables (all-short scripts, no read-only blocks) the button is inert and
  labeled "Expand All" rather than hidden — hiding would require un-hiding logic in every
  other renderer of the skeleton button.
- Tests were written but NOT run (invoking task forbids running suites; user runs them).
  Both typechecks and `npm run build:webapp` are clean.

### Open questions

- None blocking. If real consent scripts ever carry non-Python code, item 71's fixed
  pseudo-path needs a language field on `ConsentScript` (server side) instead.
