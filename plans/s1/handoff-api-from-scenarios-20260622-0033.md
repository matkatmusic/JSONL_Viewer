# Handoff: clean-room TypeScript JSONL structure-extraction — Plan 01 (s1) complete, ready for s2
Conversation name: api-from-scenarios — extract s1 JSONL structures
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/5f1896d3-f090-436c-8248-80070ba0c54d.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s1/01-extract-jsonl-structures-plan.md

## Branch
`api-from-scenarios` based on `master` (only commit so far is `1a9f098 Initial commit`; all work below is uncommitted/untracked).

## Goal
Build a tool ("a Git GUI for JSONL files") that reconstructs the full file-change history for every file touched by a Claude Code session, by processing one scenario at a time from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/`. The per-scenario loop is: parse/interpret one scenario's JSONL → extend the codebase/types so that scenario reconstructs with 100% fidelity → tests prove it and prevent regressions. This session completed **Plan 01**: the typed structure-extraction foundation for the first scenario, **s1-delete-file**.

## Current State
Plan 01 fully implemented and green. **`npm test` → 13 tests pass, 0 fail. `npx tsc --noEmit` → clean.**
- Scaffold: TypeScript + `node:test` + `tsx`; `.vscode/launch.json` with two debug configs; `package.json`, `tsconfig.json`.
- Structures (clean-room, hand-written, scoped to exactly what s1 produces):
  - `src/structures/envelope.ts` — `RecordType` string enum (10 s1 record types), envelope base, `TranscriptRecord`.
  - `src/structures/content-blocks.ts` — `BlockType` string enum (text/thinking/tool_use/tool_result), `getContentBlocks`.
  - `src/structures/tool-results.ts` — `ToolName` string enum (Bash/Write), Bash/Write input+result types, `structuredPatch` element deferred (empty in s1), tool-result resolution via `tool_use_id`.
  - `src/structures/file-history.ts` — `file-history-snapshot` spine; backups are POINTERS (`backupFileName|version|backupTime`), not content.
  - `src/structures/session-meta.ts` — ai-title/bridge-session/last-prompt/mode/permission-mode/attachment (attachment payload modeled minimally).
- Parsing/gate:
  - `src/parse/parseRecord.ts` — line → typed record; throws `UnknownRecordTypeError` on unknown `type`.
  - `src/parse/loadTranscript.ts` — whole-file loader + `ALLOWED_TOP_LEVEL_KEYS` runtime allow-list; throws `UnmodeledFieldError` on any key outside the s1 field boundary.
- All discriminants are **string enums** (`RecordType`/`BlockType`/`ToolName`/`AttachmentPayloadType`) — per user's `enum class` preference; comparisons use enum members, not bare strings.
- s1 docs live in `plans/s1/`; recon evidence in `recon/`.

## What Remains
1. **(Optional, non-blocking) Resolve the 3 open questions** in `plans/s1/implementation-notes-extract-s1-jsonl-structures.md`: (a) attachment payload depth (currently minimal — recommend defer), (b) hardcoded absolute s1 JSONL path in tests vs. a shared helper / committed fixtures, (c) loose value types (`Write.type`, `mode`, `permissionMode` typed as `string`).
2. **Decide whether to commit** the current work (everything is untracked; branch has only the initial commit). The user has not asked to commit yet — confirm before committing.
3. **Begin the next scenario, `s2-move-file`** (the user said "ready for s2"):
   a. Recon its vocabulary the same way s1 was done — write a Node scan over `…/scenarios/executed/s2-move-file/<uuid>.jsonl` producing per-record-type field inventories (mirror `recon/06`–`recon/09`). Find s2's UUID via `ls` of that folder.
   b. Draft `plans/s2/<plan>.md` scoped to ONLY what s2's JSONL contains (field-level fog of war).
   c. Extend the types via strict red-green TDD. The existing gate will fail LOUDLY on anything new — `UnknownRecordTypeError` (new record type), `UnknownToolNameError` (s2 likely uses Bash `mv`/`git mv`; if Read/Edit appear, add them), `UnmodeledFieldError` (new top-level key). s2 may introduce a non-empty `structuredPatch` — that defines the deferred `StructuredPatchHunk` element shape (see `tool-results.ts`).

## Key Files
- `plans/s1/01-extract-jsonl-structures-plan.md` — the (living) s1 plan; conventions + the 6-task structure.
- `plans/s1/implementation-notes-extract-s1-jsonl-structures.md` — decisions, deviations, open questions. READ FIRST.
- `recon/06-s1-vocabulary.md`, `recon/07-s1-field-inventory.md`, `recon/08-s1-block-field-types.md`, `recon/09-s1-tool-value-types.md` — s1 ground-truth field/value inventories that drove the types.
- `recon/01`–`recon/05` — broader source-tree recon (where Claude Code defines each structure); reference-only, NOT s1-specific.
- `src/parse/loadTranscript.ts` — the field-level gate; the place new record types/keys get registered.
- All `src/structures/*.ts` + paired `tests/*.test.ts`.

## Context the Next Agent Won't Have
- **Clean room is absolute.** NEVER import from, copy from, or re-export the Claude Code source tree at `/Users/matkatmusicllc/Desktop/claude code src/` (it is prior art / de-obfuscated source). Consult it ONLY to learn the shape/type of a field that actually appears in the scenario data. The user enforced this twice and rejected source-referencing attempts.
- **Fog of war is field-level AND per-scenario.** Model only record types / tools / blocks / FIELDS that the CURRENT scenario's JSONL actually produces — never the full source type. A field present with value `null` (e.g. s1 `originalFile`) is still "present"; a field the source declares but the scenario never emits is out of scope. Each scenario is processed independently; later scenarios extend the types.
- **The scenario JSONLs live OUTSIDE this worktree** (the Desktop path). Subagents are sandboxed to the working directory and CANNOT read that path (verified: multiple subagent failures). Therefore the recon scans and the TDD loop must run in the MAIN agent — do not fan out subagents to read scenario data or run these tests.
- **Test harness is dictated by the jot plugin hook** (`~/Programming/jot/hooks/post_tool_batch_test_hook.py`): it runs each edited `.ts` file's paired test via `npx tsx tests/<stem>.test.ts` standalone. Consequences: (1) use `node:test` + `node:assert`, NOT vitest (vitest can't run standalone under tsx); (2) tests are FLAT in `tests/<stem>.test.ts` (matched by basename only — no nested dirs); (3) every `src/**/*.ts` needs a paired test or the hook warns.
- **The hook routinely emits a STALE `ERR_MODULE_NOT_FOUND`** for a source file written in the same batch as its test (write-visibility race). IGNORE it — `npm test` (`node --import tsx --test tests/*.test.ts`) is the authoritative signal; it has been green at every task boundary.
- **`tsx` does NOT type-check.** Run `npx tsc --noEmit` as the static gate — critical now that discriminants are nominal string enums (a bare-string comparison or a bad enum member is only caught by `tsc`/editor, not at runtime). TS `enum` is not erasable, which is fine because everything runs through tsx.
- **`filesize_check.py`** (same plugin) enforces nesting depth ≤3 indent units and file/function length caps — keep helpers shallow (extract functions rather than nesting loops/ifs).
- **Data quirks already discovered for s1** (so you recognize them in s2): file-history snapshots store backup POINTERS not content; `structuredPatch` is empty for file creates (hunk shape deferred); `last-prompt.lastPrompt` is optional (pointer-only variant exists); `user` records have prompt vs tool-result variants and `system` has 3 subtype shapes (handled by the generic `TranscriptRecord` passthrough); tool results attach to `user` records and resolve to their tool via `tool_use_id` → assistant `tool_use.name`.
- **User working style:** highly iterative on design; expect to be grilled on type-design choices (chose string enums after weighing enum vs as-const). Confirm before committing or any outward action.

## How to Verify
```
npm test          # node --import tsx --test tests/*.test.ts  → expect 13 pass / 0 fail
npx tsc --noEmit  # expect: No errors found
```
