# Plan 01 — Extend the JSONL data structures for scenario **s2-move-file** (clean-room TypeScript)

## Scope: s2 only

This plan extends the typed codebase for **only** the scenario `s2-move-file`,
following the one-scenario-at-a-time loop. It adds exactly the records, tools, and
fields that s2's JSONL emits and nothing the source declares but s2 never
produces (field-level, per-scenario fog of war).

- s2 JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s2-move-file/1e82511e-05a3-4712-9a95-206b24128694.jsonl`
- 125 records; the move is performed as **Read → Edit → Write → Bash (`mv`)**.
- Governed by `plans/coding-requirements.md` (domain types not primitives; enums +
  their `Object.values` sets in `vocabulary.ts`; DRY helpers; enum-member
  comparisons; verb-named functions).

## Recon delta (what s2 adds over s1)

Same 10 record types and 3 content-block types as s1. New vocabulary:

- **Tools:** `Read`, `Edit` (s1 had only `Bash`, `Write`).
- **Attachment payload kinds:** `opened_file_in_ide`, `task_reminder`,
  `diagnostics` (6 → 9).
- **`structuredPatch`:** Edit results carry a **non-empty** hunk
  `{ oldStart, oldLines, newStart, newLines, lines: string[] }` — the shape
  deferred since s1 (a create has no diff).
- **toolUseResult shapes:** `ReadResult` `{ type, file: { filePath, content,
  numLines, startLine, totalLines } }`; `EditResult` `{ filePath, oldString,
  newString, originalFile, structuredPatch, userModified, replaceAll }` (no
  `type` field).
- **Top-level keys:** every s2 key was already gated **except `isMeta` on
  `user`**.

## Changes (as built)

1. `src/structures/vocabulary.ts` — `ToolName` += `Read`, `Edit`;
   `AttachmentPayloadType` += the 3 new kinds.
2. `src/parse/loadTranscript.ts` — `isMeta` added to the `user` allow-set.
3. `src/structures/tool-results.ts` — real `StructuredPatchHunk`; `ReadResult` +
   `ReadFile` + `hydrateReadResult`; `EditResult` + `hydrateEditResult`;
   `ResolvedToolResult` union and `resolveToolResult` dispatch extended with
   Read/Edit; declared `ReadInput`/`EditInput`.
4. `tests/fixtures.ts` — `S2_JSONL` (absolute Desktop path, matching `S1_JSONL`).

## TDD task order (red → green, all landed)

1. **Fixture + gate acceptance** — `loadTranscript(S2_JSONL)` returns 125 records,
   throws nothing (`tests/loadTranscript.test.ts`).
2. **Tool vocabulary + `isMeta` gate** — `ToolName.Read/.Edit`; user `isMeta`.
3. **Attachment kinds** — enum += 3; s2 coverage test asserts each kind is present
   and recognized (`tests/session-meta.test.ts`).
4. **Read/Edit results + `StructuredPatchHunk`** — resolve Read/Edit, assert
   `Path` hydration and a non-empty Edit `structuredPatch`
   (`tests/tool-results.test.ts`). Extracted the `findToolResult` test helper.
5. **Regression + docs** — full suite green, `tsc` clean, notes + roadmap updated.

## Verification

```
npm test          # 28 pass / 0 fail (24 s1 + 4 s2)
npx tsc --noEmit  # No errors found
```

See `plans/implementation-notes-api-from-scenarios.md` for design decisions and
open questions (notably `EditResult.originalFile` cardinality).
