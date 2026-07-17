# Implementation notes — Roadmap Item 8: MultiEdit-style records (array-shaped `toolUseResult`)

## 2026-06-17:09:56:31 PDT — Item 8: type-gated iteration of an array-shaped `toolUseResult`
Chat title: plan RevEng item 8 — array-shaped toolUseResult extraction (dapper-sprout)
Path to JSONL log: (omitted per handoff rules — the session JSONL is ephemeral and lives under live `~/.claude/projects`, which is never committed)

### References
- /Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-dapper-sprout.md  (the item-8 plan executed here)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-0938.md  (handoff into this session)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-0807.md  (prior handoff: exact gate commands, temp-index re-baseline mechanism, probe gotchas)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md  (item 8 flipped [ ]→[x] with a DONE block)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/edit-stream-extraction.js  (implementation target: 197→244 L)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/file-event-observations.js  (the cross-record READ pairing pipeline — why reads are NOT handled element-wise)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test-edit-stream-extraction.js  (integration test)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test-array-tool-use-result.js  (NEW — unit tests for the two predicates)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test-helpers.js  (+makeArrayToolUseResultLine)

### Design decisions
- **What the gap was.** `extractToolUseEdits` passed `toolUseResult` whole to
  `buildEditFromToolUseResult`. `toolUseResult` is the tool's Output recorded verbatim, so its shape
  varies: object (Edit/Write/Read/Bash), string, or **array of content blocks** (MCP tools). When it
  was an array it had no top-level `type`/`oldString`, so the entire record was skipped without
  inspecting its elements — a silent drop.
- **The chosen logic (user-directed).** When `toolUseResult` is an array, iterate its elements and
  extract each *usable non-read* element via an explicit, null-safe type gate:
  `getNonReadType(el)` → `isUsableNonReadReconstructionType(type)` → `buildEditFromToolUseResult(i, el)`
  for each kept element. The inner loop is lifted into `extractNonReadEditsFromArrayToolUseResult(i, tr)`
  so `extractToolUseEdits` stays ≤3 levels deep (repo nesting limit).
- **Type-gate alignment guarantees no null pushes.** `getNonReadType`'s create/update/edit recognition
  mirrors `classifyToolUseResult`'s accept set (`:61-66`), so whenever `isUsableNonReadReconstructionType`
  is true, `buildEditFromToolUseResult` is guaranteed to return non-null. The whitelist is the single
  source of truth for "extractable from one self-contained element."
- **Reads are deliberately excluded (the `NonRead` qualifier is load-bearing).** A read's file path
  comes from the paired `tool_use.input.file_path` and its content from the matching `tool_result`
  (paired by `tool_use_id` in `scanToolUseResults`); a single array element carries neither. Reads are
  already reconstructed via `mergeExternalEdits → appendFilteredReadEdits`
  (`edit-stream-extraction.js:100-103,111`). Adding `'read'`/`'Read'` to the whitelist would either
  no-op (a lone element has no pairing) or DUPLICATE reads already emitted. Extension point: add
  `'read'` ONLY if a future *self-contained* read element (carrying its own `filePath`+`content`) ever
  appears.
- **Null-safety is intentional, not incidental.** `getNonReadType` guards `!el` and
  `typeof el !== 'object'` and returns null without throwing. The existence survey found 0 null
  elements today, but defensive code must not depend on "no nulls today."
- **Exports.** Only the two predicates (`getNonReadType`, `isUsableNonReadReconstructionType`) are
  exported, for direct unit testing. `extractNonReadEditsFromArrayToolUseResult` stays internal and is
  exercised through `extractEditsFromJSONL` by the integration test.

### Deviations
- **All array-shaped-`toolUseResult` tests grouped into a sibling test file (NOT in the plan).** The
  plan put all new tests in `tests/test-edit-stream-extraction.js`. Adding all 15 tests pushed that
  file to 310 lines, over the hook-enforced 250-line cap (the plan anticipated the *implementation*
  file possibly overflowing, but not the *test* file). Resolution (per user direction — enforce the
  cap strictly by grouping relevant tests into a new file): ALL array tests — the 14 unit tests for
  the two predicates AND the `extractEditsFromJSONL` array integration test — live together in a NEW
  `tests/test-array-tool-use-result.js` (123 L). `tests/test-edit-stream-extraction.js` drops back to
  204 L, well under the cap. Consequence: the full suite is now **59 suites** (was 58). The
  implementation itself stayed in `edit-stream-extraction.js` exactly as planned (244 L, under cap) —
  moving it to a sibling `api/` module was rejected because it would drag in browser classic-script
  load-order changes (the file documents a required global load order) for no benefit.
- **Notes filename.** The `jot:implement` skill's convention is
  `plans/implementation-notes-<convo_name>.md`. I used the plan's deliverable name
  `implementation-notes-item8-multiedit.md` instead, because the roadmap DONE block, the plan, and the
  handoff all reference that exact path — consistency with the existing artifacts outweighs the
  convo-name convention.
- **No subagents/parallelism** (the skill suggested it). Strict red-green TDD on three interdependent
  files with a Stop hook that re-runs the target test is inherently sequential; parallel agents would
  break red-green ordering and cause write conflicts. Done inline.

### Tradeoffs
- **Implement-anyway vs defer-as-NOT-VIABLE.** The existence survey found 0 instances across all 3
  corpora, so item 8 could have been deferred like items 6/7. The user chose to implement defensively
  to close the dormant drop. Trade-off: a small amount of provably-inert code now (the branch is dead
  on all known data) vs. a guaranteed-correct path the day an edit-bearing array element first appears.
  Honestly framed as a forward-proof guard, not a fix for observed data loss.
- **`Array.prototype.push.apply` vs a spread / concat.** Used `push.apply(edits, helperOut)` to append
  in place, matching the file's existing ES5 `var`/`function` browser-classic-script idiom (no spread,
  no arrow functions). Slightly less readable than `edits.push(...helperOut)` but consistent with the
  module's loadable-in-both-Node-and-browser constraint.
- **Granularity vs the line cap.** The TDD guide favors many tiny single-assert tests; the 250-line cap
  pushes the other way. Kept the unit tests granular (one behavior per `test_` function) by splitting
  to a sibling file rather than collapsing assertions — granularity preserved, cap respected.

### Verification (all gates GREEN — from `…/RevEng`)
- Full suite: **59 suites / 601 passed / 0 failed** (+14 unit, +1 integration).
- detect-rewinds: **15 / 0**.
- Probe A/B vs `develop-baseline` on the FROZEN fixture (`probe-fixture-20260615`):
  **`identical: true`** — branch dormant (no usable array element), `extractEditsFromJSONL` byte-identical
  → **NO re-baseline**, `develop-baseline` unchanged at `880b69d`.
- Sidecar e2e `plate_summary.py`: **247/247 matchedObserved, 0 mismatched, conflicts 233**.
- Line caps (all ≤250): `edit-stream-extraction.js` 244, `test-edit-stream-extraction.js` 204,
  `test-array-tool-use-result.js` 123, `test-helpers.js` 220.

### Open questions
- **RESOLVED (2026-06-17, user):** The object-with-`edits`-field shape (the historical MultiEdit tool
  Output, `tr.edits` being an array on an object — distinct from the array-shaped `toolUseResult`
  handled here) is **NOT covered, and deliberately so**. We reviewed the actual transcript files to
  understand the structure of `toolUseResult` arrays and confirmed there are **no multi-edits** in
  that object-with-`edits` shape. No symmetric `Array.isArray(tr.edits)` branch is added. Reopen only
  if such a record ever appears (same reopen-validate discipline as the array-shaped case above).
- None outstanding.
