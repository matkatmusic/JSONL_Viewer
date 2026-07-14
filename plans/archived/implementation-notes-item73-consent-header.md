## 2026-07-13:13:39:00 — Item 73: Script Execution Consent Header
Chat title: tackle-tasks 73 — consent header
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/b8e42a09-442a-41e7-9f62-c0e45619bab8.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item73-consent-header.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (item 73)

### Design decisions

- **Sticky header, not a second skeleton row.** The header is the first child of
  `.consent-box` with `position: sticky; top: 0` inside the `#view` scroll pane.
  Native CSS satisfies "scrolling never hides the message", and the header is
  created/destroyed with the consent box, so no route-change cleanup is needed.
  Negative horizontal margins make it span the box's 16px side padding.
- **"Visible script preview" = a `.consent-script` row with no closed `<details>`
  ancestor** (`row.closest("details:not([open])") === null`). The task ties nav
  button enablement/visibility to preview visibility; this definition is
  deterministic and needs no layout measurement.
- **One capture-phase `toggle` listener on the box refreshes nav state.**
  `<details>` toggle events don't bubble but are observable in capture, and fire
  for programmatic `open` changes too — so the per-block triangles, the
  "Show/hide Read-only scripts" button, and Expand All all route through it.
- **Header owns Expand All; static `#toggle-all` hidden during consent.** The
  item-72 wiring was re-targeted to the header button unchanged
  (`const toggleAllButton = expandAllButton;` keeps the diff minimal). The
  skeleton button is hidden in renderConsentDialog and un-hidden at the top of
  renderRoute so every other route is untouched.
- **No auto-scroll on load.** The spec asks for a default *selection* (first
  Modifying script, exported `findDefaultConsentSelectionIndex`); centering
  happens only on Prev/Next clicks via `scrollIntoView({ block: "center" })`.
- **Selection is an element reference re-validated on every refresh.** If the
  selected row's read-only block closes, selection falls back to the first
  visible row so the outline never sits on a hidden script.

### Deviations

- None from the plan. Versus the task text: the `decide` helper moved above the
  header construction (the decision buttons now need it earlier); the old
  bottom `.consent-actions` block and the old `h2` are commented out, not
  deleted, per the standing comment-out-don't-delete preference.

### Tradeoffs

- Clamped (non-wrapping) Prev/Next stepping — the task doesn't specify; clamping
  plus disabled end-buttons is the least surprising reading of `[< Prev] [Next >]`.
- "Script n of N" counts VISIBLE rows only (N shrinks while read-only blocks are
  closed). Counting all scripts instead would make n jump non-contiguously when
  hidden rows are skipped.
- `[Jump to top]` stays visible even when the nav cluster hides — it scrolls the
  pane, not a script, so it is useful whenever the previews overflow.

### Open questions

- None blocking. If "Script n of N" should count ALL scripts (not just visible
  ones), say so — it's a two-line change in `updateScriptNavState`.
- Tests, typecheck, and `build:webapp` were intentionally NOT run (your
  instruction); `npm test` covers the two new exported helpers.
