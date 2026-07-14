## 2026-07-13:12:38:00 — Item 69: read-only vs Modifying scripts in the consent view
Chat title: Ponytail ultra — tackle task 69 (consent read-only UI)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/0af9448e-14bc-4f44-8b2c-d7bff5309b73.jsonl

### References

/Users/matkatmusicllc/.claude/plans/item69-consent-readonly-ui.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (item 69, closed; item 68 gate reused)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/src/viewer_api.ts (ConsentScript + tagging)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/app.ts (grouping + dialog rewrite)

### Design decisions

- Tagging happens only in `decideDocumentResponse` — all three consent-response sites
  (`/api/document` non-progress, progress stream, `/api/range-patch`) serialize that
  decision object directly, so one map() reaches every wire path.
- `readOnly` is optional on the client wire type and checked with `=== true`: an untagged
  script renders as a full Modifying row, so a stale server degrades to pre-item-69
  behavior instead of hiding anything.
- Native `<details>/<summary>` provides the expansion triangle and per-block state; the
  global button just flips `.open` on all blocks (open-all if any closed, else close-all).
  No hand-rolled toggle state, no persistence (per user decision in planning).
- `ConsentBlockKind` enum lives in `webapp/app.ts`, not `structures/vocabulary.ts` — it is
  a client display discriminant that never crosses the wire, matching the existing
  `DiffDisplayMode`/`SplitRowKind` precedent in `webapp/views/diff-vs-base.ts`.

### Deviations

- The headline count split (`— N modifying, M read-only`) renders only when at least one
  read-only script exists; the plan's example showed it unconditionally. A "0 read-only"
  suffix (and the Show/hide button) would be noise on all-modifying transcripts.
- Task instructions asked for a literal `[>]` prefix on the summary line; the native
  `<details>` disclosure marker IS that triangle, so the text starts at `-----` and the
  browser draws the marker.

### Tradeoffs

- Server tag test asserts flag-vs-classifier agreement over the S37 fixture rather than
  pinning synthetic read-only/writer records: the classifier's own true/false behavior is
  already pinned by item-68 tests; this test proves only the wiring, without inventing a
  synthetic script-run record shape.
- renderConsentDialog's DOM (button, details markup) is untested, matching the repo
  precedent that render functions stay untested and pure view-models carry the tests; the
  only branching logic (`groupConsentScriptsIntoBlocks`) has 3 dedicated tests.

### Open questions

- None blocking. The 356-script consent page now renders one `<pre>` per script only
  inside expanded blocks; if expanding a huge block ever feels slow, virtualize then
  (measure first).
