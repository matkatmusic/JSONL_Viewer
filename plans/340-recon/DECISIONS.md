# Task 340 grilling decisions (2026-07-30)

Settled with the user; each layer's spec item restates what applies to it.

## Cross-cutting

- **Lazy per-layer fetch.** layer1.html stays JSONL-free at load. A new
  endpoint parses JSONL and serves layer ≥ 3 node data, fetched the FIRST
  time such a layer is switched on (NDJSON progress), cached after; later
  switches are pure CSS. Consequence: that first fetch must merge new
  instants and re-run the ladder layout client-side (relayOutLayer1View —
  already exists for the path filter).
- **Layer switcher stays cumulative** (each layer adds to the ones below),
  extending the data-layer CSS pattern.

## Per layer

- **L3 — Edit/Write only.** Only guaranteed data: Edit (oldString/newString,
  structuredPatch) and Write (full content). Bash file ops and user edits
  are NOT L3 (L7 catch-all rules on them). Parse-only node placement; the
  drawer shows the hunk/content directly; verified-against-context runs
  LAZILY (Q15 hunk discipline: patch checked at its recorded line against
  verified context; mismatch = the base below is wrong).
- **L4 — strictly visual.** Script-run nodes just place "a script ran here"
  on the timeline; NO affected-file computation or speculation at L4.
  Exact placement (bubble vs ruler-level) joins the user's Excalidraw
  discussion.
- **L5 — kept-vs-reverted is byte-content**, via the EXISTING composition:
  reconstructBranches (per-rewound-branch FileHistory) +
  findWorkingTreeOwner (rewind-moment snapshot content signatures) + the
  branch-agnostic steps core. Recon's "no comparator exists" was wrong.
- **L6 — consent page + execute-once cache.** Switching to [6] shows the
  previous webapp's consent page AS IS (full-page, hiding the rest of
  layer1.html) until the script-execution cache is generated; the cache is
  then the layer's data source forever (scripts execute exactly once).
  After consent, a console surface shows each execution and its duration.
  DESIGN DISCUSSION PENDING: user will mock up the timeline-perspective
  behaviour in Excalidraw and share screenshots BEFORE this is specced/built.
- **L8 — CSS-hide only** (gaps stay; all-hidden ruler rows hide via the
  generalized markMultiEventTicks pattern). Task **#341** adds the global
  header "compact the timeline gaps" button (one-shot re-layout, opt-in).
- **L9 — DESIGN DISCUSSION PENDING**: user will mock up the ruler-range
  tool in Excalidraw and share screenshots before spec.

## Open (deliberately deferred to mockups / Excalidraw)

- L4 node placement surface; L7 scope rulings (prompts/responses/tool
  calls/system info on FILE bubbles?); L8 control shape (chips vs
  checkboxes) and URL persistence; all L6/L9 interaction details.
