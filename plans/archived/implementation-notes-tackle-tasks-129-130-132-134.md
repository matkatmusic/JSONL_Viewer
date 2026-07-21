## 2026-07-20:22:55:00 — Tasks 129, 130, 132, 134 (jfred webapp)
Chat title: tackle-tasks 129 130 132 134
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/82491760-9063-47b6-a1c2-13817bc3f694.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-129-130-132-134-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tasks.json

### Design decisions

- 129 message copy: `rev N (of TOTAL) failed to apply <opLabel>` (task's "L:n" framing mapped
  to revision numbers — the card is a revision, and the healthy heads already speak `#N`).
  The raw engine error is preserved verbatim as the `.why` div's hover `title`.
- 129/130 share one edit: `buildMissingRevisionCard` now takes
  `(buildActionButton, context, card, revisionCount)`; the call site passes `cards.length`.
- 134 per user's AskUserQuestion answer: real in-timeline rows (node derivation), not a link
  to the raw-lines view. New canonical module `webapp/views/timeline-line-nodes.ts` holds
  `LINE_NODE_KIND`, `WireLineVerdict`, `LineNode`, `deriveLineNodes`, and the sessionStorage
  toggle accessors (`timeline:allLines`). Dedupe rule: a verdict line gets a row only when no
  turn/tool-call row already carries its uuid. Timestamp-less records sort via `when: ""`.
- 134 toggle button lives in the filter bar but re-renders through `renderRoute()` (the
  app-consent precedent) because it changes derivation, not display.
- Raw-line rows are thin (not expandable), unnumbered (step numbers drive picks/range
  patches), visible only under the "All" filter mode (existing predicate falls out that way —
  no filter-model change needed).

### Deviations

- No subagents: every touched file's bytes were already in context from planning; delegation
  would only have forced re-reads.
- `src/reconstruction_json.ts` was already over the 250-line cap (259) before the task-134
  fields pushed it to 264 and the size hook blocked. Root fix: moved `LineVerdict` +
  `buildLineVerdicts` to a new canonical home `src/reconstruction_line_verdicts.ts` (no
  re-export shim; both consumers re-pointed), bringing reconstruction_json.ts to 239. The
  three buildLineVerdicts tests moved with their subject to
  `tests/reconstruction_line_verdicts.test.ts` (also satisfies the per-file-test hook).
- One unplanned type fix: `openTurnInspector` / `openStepInspector`
  (timeline-render-inspectors.ts) widened to accept `LineNode` — they only touch
  uuid/sessionId/snapshots, all of which LineNode declares; a uuid-less line falls through to
  the existing muted "no transcript line" message.
- Test order for 134 Phase B/C was source-then-test (the plan's red-first order would have
  spammed the auto-test hook with module-not-found noise); RED evidence for 129/130 and
  Phase A came from the hook's failing runs before each GREEN edit.

### Tradeoffs

- `resolveLineLabels` stays O(rows × transcript lines); with the toggle on, row count grows.
  Accepted (opt-in feature, per-file raw fetches are cached); ceiling + upgrade path noted as
  a `ponytail:` comment on `deriveLineNodes`.
- Line rows get no role pill (text already reads `<type> · <verdict>`; a pill would need new
  CSS for zero information).
- `timeline-types.ts` sits at exactly 250 lines after gaining the type-only import and the
  `lineVerdicts?` field; the union edit was done in place to spend no line.

### Open questions

- Tasks 129/130/132/134 remain OPEN in tasks.json — close-tasks needs commit hashes, and per
  instructions nothing was committed (all work staged only).
- 132: the inline button now carries `margin: 0 0 0 8px`; if any OTHER `.snapshot-history-btn`
  render site wanted the old block spacing, none exists today (single call site verified).
