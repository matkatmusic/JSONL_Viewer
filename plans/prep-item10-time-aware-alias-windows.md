# Prep notes — Item 10: time-aware alias windows for mid-timeline renames

Orientation for the forthcoming plan. NOT the plan. Awaiting item-9 handoff before
finalizing. Sources read: roadmap §B item 10/10a; `api/file-historical-lineage.js`;
`tools/track-line-states.js`; `api/extract-bash-file-ops.js`; `api/file-events-extractors.js`;
`plans/implementation-notes-bash-op-event-kinds.md` (item-2 cp spike); `tools/probe-projects-v2.js`.

## What item 10 buys
`cp src dst` copies `src` into `dst` at ONE instant T. After T they diverge. The alias set is
STATIC for the whole timeline, so `src` edits AFTER T bleed into `dst`'s belief and mis-number it.
Windows bound alias membership to the interval the two paths genuinely share content.
Item-2 spike residual this fixes: `RED_GREEN_TDD.md` 1 mismatch / 11 conflicts; `SKILL.md` 3 / 35.

## 10a is a HARD prerequisite and is NOT done
- Roadmap order: `13 → 10a → 9 → 11 → 12 → 10`. User did 9; 10a still `[ ]`.
- `tools/track-line-states.js:94-95`: discovery (`discoverJsonls` → `findReferencingJsonlsIncludingSubagents([target], …)`)
  seeds from `target` ONLY; aliases resolved AFTER (line 95) and used for event-matching only.
- Why 10 needs 10a: once matching is time-bounded, a transcript that touches ONLY the cp `src`
  (holding the pre-copy `src` content we want to window INTO `dst`) is never scanned unless
  discovery seeds from the full union closure. 10a reorders: resolve union first, seed discovery
  from it. Trivial; no new module.
- DECISION NEEDED: fold 10a in as Phase 1 of the item-10 plan (recommended — shared code path,
  trivial) vs. ship 10a as a separate prior plan.

## CONFIRMED load-bearing constraint — do NOT touch the flat lineage exports
The probe (`tools/probe-projects-v2.js`) calls these DIRECTLY and depends on their current behavior:
- `ct.buildLineageGraph(ct.gatherAllOps(...))` — `:63` (samePathGraph).
- `ct.resolveAliases([authoredPath], samePathGraph)` — `:102` (timestamp-free union for identity enumeration).
The probe does NOT import `file-events-extractors` and does NOT call the sidecar engine
(`extractFileEvents`/`trackLineStates`) — it has its own replay path (`assembleKeptEdits` → `replayEdits` → `chooseReferenceSource`).

Consequences:
1. Time-awareness lives in a NEW sibling `api/alias-windows.js`. Leave `buildLineageGraph`,
   `gatherAllOps`, `resolveAliases` BYTE-IDENTICAL in behavior/signature.
2. Changing `extractFileEvents`'s signature is safe for the probe (not a caller).
3. Whole of 10 + 10a touches only the sidecar CLI + new module + `file-events-extractors.js` →
   NO probe reconstruction code touched → probe A/B should stay BYTE-IDENTICAL. Gate = confirm
   no-regression, NOT a re-baseline. (10a caveat: re-baseline only if a target's `transcriptsUsed` shifts.)

## Injection points (current → planned)
1. cp op timestamp is MISSING. `extractBashFileOps` sets `op.line = i` (parsed index); no timestamp.
   `buildLineageOp` (`file-historical-lineage.js:94`) returns `{type,src,dst,line}` — `stampTouchTimestamps`
   (`:114`) stamps TOUCHES only, not ops. tool_use records carry a timestamp 100% of the time
   (item-7 survey), so the copy instant = `parsed[op.line].timestamp`. PLAN: stamp ops in
   `collectTouches` (`:124`) alongside touches. Safe for probe — `buildLineageGraph` ignores extra fields.
2. Windowed closure (NEW `api/alias-windows.js`): build adjacency WITH edge metadata
   (`{type, opMs}`) from stamped ops, then windowed BFS from the seed →
   `Map<aliasPath, {fromMs, toMs}>`:
   - seed: `(-∞, +∞)`.
   - mv / git-mv (undirected, same identity): inherit parent window (full).
   - cp `dst→src` traversed from a node with window W: `src.to = min(W.to, T_copy)`. (Boundary inclusive `<= T`: the copy reads src state AT T.)
   - multi-hop: compose by min/intersection along the path.
3. Membership predicate. Today scattered: `editBelongsToFile(edit,aliasSet,aliasPaths)`
   (`file-historical-lineage.js:227`; callers: authored, originalFile, patchContext) + raw
   `aliasSet.has(path)` (read/cat/bashRead/grep/snapshot in `file-events-extractors.js`).
   PLAN: add `aliasPathValidAt(aliasWindows, path, unixMs)` in `alias-windows.js`; route the ~9
   emitter checks through it (emission-time, NOT post-filter — events do not carry their source
   path, so a post-filter cannot know which window applies; each emitter already has path+timestamp
   at the decision point). `editBelongsToFile` needs a time-aware variant preserving its snapshot
   repo-relative suffix exception.
4. CLI threading (`tools/track-line-states.js`): resolve windows once; flat union keyset feeds
   discovery (10a) AND `aliasPaths`; pass windows into `extractFileEvents`.

## Design forks to lock in the plan
- F1: fold 10a in vs separate (above).
- F2: emission-time predicate (recommended) vs carry source path on events + post-filter.
- F3: window struct = `Map<path,{fromMs,toMs}>` vs interval list per path (mv-of-a-cp-src edge cases).
- F4: cp boundary inclusive `<= T` (recommended) vs exclusive.
- F5: `extractFileEvents` signature — replace `aliasPaths` with `aliasWindows`, or add a 4th arg.

## Gate plan (per roadmap Constraints)
- Strict red-green TDD; 250-line write cap (`file-events-extractors.js` is 239L — has room but watch it;
  `file-historical-lineage.js` 245L — AT cap, do NOT grow → new sibling for the windowed closure).
- Full suite + detect-rewinds green; plate_summary.py e2e unchanged (247/247, 233 conflicts) — and the
  cp residual files should improve (validate `RED_GREEN_TDD.md`/`SKILL.md` mismatch+conflict drop).
- Probe A/B vs `develop-baseline` byte-identical (confirm no-regression).

## Needed from the item-9 handoff
1. Current `develop-baseline` commit (expect `880b69d` from item 5.6; item 9 is tracker-only → likely no re-baseline).
2. Post-item-9 full-suite count + detect-rewinds.
3. Any item-9 change to `edit-splice.js` / floating machinery (item 9 shares the floating flag; item 10 does not, but confirm no overlap with `file-historical-lineage.js`).
