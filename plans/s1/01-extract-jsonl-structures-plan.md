# Plan 01 — Extract the JSONL data structures for scenario **s1-delete-file** (clean-room TypeScript)

## Scope: s1 only

This plan builds **only** for the single scenario `s1-delete-file`. Per the one-scenario-at-a-time
loop, later scenarios get their own follow-on plans that extend these types. Do **not** build for
records, tools, or fields that `s1` never produces, even if other scenarios use them.

- s1 JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s1-delete-file/b3634dc4-a385-40b9-8e23-6695a4f7bb7e.jsonl`
- s1 vocabulary (the exact boundary for this plan): `recon/06-s1-vocabulary.md`
- s1 scenario script (what the session was told to do): `…/scenarios/s1-delete-file.txt`
  (Write `s1_delete.py` + a test, then "Delete s1_delete.py", then exit. The delete is done via
  `Bash rm`, not a dedicated tool.)

## What this plan produces (the "How", for the implementing agent)

Hand-written **TypeScript type definitions** in `src/structures/` modeling exactly the records and
sub-structures present in the s1 JSONL, plus a typed loader `loadTranscript(filePath)` in
`src/parse/` — proven by tests that parse the s1 JSONL with zero unknown record types and zero
dropped top-level keys.

This plan builds no reconstruction logic. It establishes the typed vocabulary the rest of the app reads.

## Hard rules (apply to every task)

1. **Clean room.** Declare our own types by hand. Do **not** import from, copy whole files from, or
   re-export the Claude Code source. The source is reference-only for field names/shapes. Original
   source root: `/Users/matkatmusicllc/Desktop/claude code src/` (quote the path; the space is real).
2. **Fog of war (s1), field-level.** Model only what occurs in the s1 JSONL. The boundary is the
   real data, not the source type:
   - Record/tool/block boundary: `recon/06-s1-vocabulary.md`.
   - **Field boundary: `recon/07-s1-field-inventory.md`** — the exact set of keys present, per record
     type / per content block / per tool result.
   - **Do not model a field that s1 never populates**, even if the source type declares it. The
     source is consulted only to get the correct *type/shape of fields that ARE present* (e.g. is
     `mode` a string union, is `timestamp` a string or epoch). A field absent from the inventory is
     out of scope for this plan; a later scenario that produces it will add it.
3. **TDD, strict red-green.** Every behavior gets a failing test first, named `test_<behavior>` with
   plain-English step comments (`~/.claude/guides/tdd.md`). Ground truth is the real s1 JSONL, never
   a hand-faked line.
4. **No guessing field shapes.** If a field's shape isn't visible in `recon/*.md`, grep the named
   source location and read the real definition before writing the type.

## The exact s1 vocabulary (from `recon/06-s1-vocabulary.md`)

80 records in one file. Model exactly these and nothing more:

- **Record `type` values (10):** `attachment`, `assistant`, `user`, `system`,
  `file-history-snapshot`, `last-prompt`, `mode`, `permission-mode`, `bridge-session`, `ai-title`.
  (**No `queue-operation`** — it does not occur in s1.)
- **`message.content` block types (4):** `text`, `thinking`, `tool_use`, `tool_result`.
- **Tool names (2):** `Bash`, `Write`. (**No `Read`, no `Edit`, no `MultiEdit`** in s1.)
- **`toolUseResult` key-sets (2):**
  - Bash → `{ interrupted, isImage, noOutputExpected, stderr, stdout }`
  - Write → `{ content, filePath, originalFile, structuredPatch, type, userModified }`

## Where each s1 structure is DEFINED in the source (the "where")

Line numbers are reference anchors confirmed during recon; read the surrounding block. Reference-only,
and **only to learn the type/shape of fields that are present in `recon/07`** — not to copy whole
type bodies. Fields the source declares but s1 never populates are out of scope.

| Structure | Source location | Notes |
|---|---|---|
| envelope (the fields s1 records carry) | `types/logs.ts:8` (`SerializedMessage`) | model only the s1 envelope keys per `recon/07`: `cwd, userType, entrypoint, sessionId, timestamp, version, gitBranch, isSidechain, parentUuid, uuid, type` (+ per-variant extras below) |
| `Message` (content/role base) | `types/message.ts` | imported at `types/logs.ts:6` |
| `FileHistorySnapshotMessage` | `types/logs.ts:188` | `{ type, messageId, snapshot, isSnapshotUpdate }` |
| `FileHistorySnapshot` (s1 shape) | `utils/fileHistory.ts:39` | s1 populates `{ messageId, timestamp, trackedFileBackups }` only (see `recon/07` nested shape) |
| `FileHistoryBackup` (s1 shape) | `utils/fileHistory.ts` (near :39) | s1 populates `{ backupFileName, version, backupTime }` — a **pointer** to an external backup file + version + ISO time, **not** inline content (`backupFileName` is `null` for v1) |
| `ModeEntry` (`mode`) | `types/logs.ts:138` | `{ type:'mode', sessionId, mode:'coordinator'\|'normal' }` |
| `last-prompt` record | `types/logs.ts:82` | field `lastPrompt` |
| `ai-title` record | `types/logs.ts:76` | field `aiTitle` |
| `bridge-session` record | `bridge/replBridge.ts:71` | field `bridgeSessionId` |
| Write tool result | `tools/FileWriteTool/FileWriteTool.ts:77` (zod), ctor ~`:376` | |
| Bash tool result | `tools/BashTool/BashTool.tsx:290`, ctor ~`:809` | |
| `structuredPatch` (Write result field) | n/a in s1 | **s1 observes only empty arrays** — Write creates files, no diff hunks. Type the field as an array whose element shape is **deferred** (no hunk is observable in s1). Do not import/copy the npm `diff` hunk shape; a later scenario that produces a diff defines the element type. |
| cross-ref `sourceToolAssistantUUID` | `utils/messages.ts:491` | links a tool result back to its tool_use assistant record |

Recon already captured full bodies for the core types — see `recon/03`,`recon/04`,`recon/05` before re-grepping.

## Project layout (this worktree)

```
src/structures/   → one file per structure group (the extracted types)
src/parse/        → loadTranscript(filePath) → typed records; discriminates on `type`
tests/structures/ → red-green tests, one behavior per test
recon/            → existing recon evidence (read-only inputs to this plan)
.vscode/          → launch.json for manual VSCode debugging of the generated TS
```

## Task 0 — scaffold (vitest + VSCode debugging, decided)

- [ ] **Task 0: TypeScript + vitest scaffold, with a working VSCode `launch.json`.**
  - Acceptance:
    - `npm test` runs vitest and reports an intentionally failing placeholder test.
    - `.vscode/launch.json` exists with two debug configs that hit breakpoints in our TS:
      1. **"Debug Vitest (current file)"** — runs vitest on the open test file with breakpoints.
      2. **"Debug TS file (current file)"** — runs the open `src/**/*.ts` file directly via `tsx`,
         so a source module with a temporary `main()`/scratch call can be stepped through manually.
    - `tsx` is added as a devDependency (the manual-debug runtime); vitest is the test runtime.
  - Verify:
    - `npm test` shows 1 failing test.
    - Set a breakpoint in the placeholder test, run config (1) — debugger stops on it.
    - Add a throwaway `console.log` line in a `src` `.ts` file, run config (2) — debugger stops on it.
  - Files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.vscode/launch.json`, one placeholder test.
  - Reference `launch.json` (ESM + TS; adjust paths if layout differs):
    ```json
    {
      "version": "0.2.0",
      "configurations": [
        {
          "type": "node",
          "request": "launch",
          "name": "Debug Vitest (current file)",
          "autoAttachChildProcesses": true,
          "skipFiles": ["<node_internals>/**", "**/node_modules/**"],
          "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
          "args": ["run", "${relativeFile}"],
          "smartStep": true,
          "console": "integratedTerminal"
        },
        {
          "type": "node",
          "request": "launch",
          "name": "Debug TS file (current file)",
          "runtimeExecutable": "node",
          "runtimeArgs": ["--import", "tsx"],
          "program": "${file}",
          "skipFiles": ["<node_internals>/**", "**/node_modules/**"],
          "smartStep": true,
          "console": "integratedTerminal"
        }
      ]
    }
    ```

## Ordered tasks (each is strict red-green TDD against the s1 JSONL)

- [ ] **Task 1: Record envelope + discriminator (10 s1 types).**
  - Behavior: the parser reads one s1 JSONL line and narrows it to one of the 10 s1 `type`
    variants, exposing the shared envelope fields (`type, uuid, parentUuid, sessionId, isSidechain,
    cwd, gitBranch, version, timestamp`) on records that carry them.
  - Acceptance: a `TranscriptRecord` discriminated union (10 variants) over an envelope base;
    `parseRecord(line)` returns the narrowed variant; an unknown `type` throws a typed error
    (so any future fog-of-war violation surfaces loudly).
  - Verify: `test_parseRecord_discriminates_every_record_type_in_s1` parses all 80 s1 lines and
    asserts each record's `type` is one of the 10 known variants.
  - Files: `src/structures/envelope.ts`, `src/parse/parseRecord.ts`, `tests/structures/envelope.test.ts`.
  - Source ref: `types/logs.ts:8`, `types/message.ts`.

- [ ] **Task 2: `message.content` blocks (4 types).**
  - Behavior: `user`/`assistant` records expose typed content blocks — `text`, `thinking`,
    `tool_use` (`name`, `input`, `id`), `tool_result` (`tool_use_id`, `content`).
  - Acceptance: a `ContentBlock` union of exactly the 4 observed block types.
  - Verify: `test_assistant_record_exposes_write_tool_use_block` against the Write turn in s1.
  - Files: `src/structures/content-blocks.ts`, `tests/structures/content-blocks.test.ts`.

- [ ] **Task 3: Tool input + `toolUseResult` for Bash and Write (only).**
  - Behavior: the `tool_use.input` and matching `toolUseResult` for Bash and Write are typed
    exactly per the 2 key-sets above.
  - Acceptance: `WriteResult` and `BashResult` types; a `toolUseResult` parser keyed by the
    originating tool (resolved via `sourceToolAssistantUUID` → the tool_use `name`). The Write
    result's `structuredPatch` is typed as an array whose **element type is deferred** — s1 only
    ever produces an empty `structuredPatch`, so no hunk shape is observable yet. Do not invent the
    hunk element fields; a later scenario with a real diff will define them.
  - Verify: `test_write_result_carries_originalFile_and_empty_structuredPatch` against the Write in
    s1 (assert `structuredPatch` is an array of length 0); `test_bash_result_carries_stdout_and_stderr`
    against the `rm` Bash call in s1.
  - Files: `src/structures/tool-results.ts`, `tests/structures/tool-results.test.ts`.

- [ ] **Task 4: File-state spine — `file-history-snapshot`.**
  - Behavior: a `FileHistorySnapshotMessage` exposes `snapshot.trackedFileBackups` as a
    `Record<filePath, FileHistoryBackup>`, plus the record's `messageId` and `isSnapshotUpdate`.
  - Acceptance: `FileHistorySnapshot` = `{ messageId, timestamp, trackedFileBackups }` and
    `FileHistoryBackup` = `{ backupFileName: string | null, version: number, backupTime: string }`,
    matching s1 exactly (`recon/07` nested shape). Model no other keys.
  - Verify: `test_file_history_snapshot_exposes_tracked_file_backups` against s1's 5
    `file-history-snapshot` records; assert the path `s1_delete.py` maps to a backup whose
    `version` is a number and `backupFileName` is `string | null`.
  - Files: `src/structures/file-history.ts`, `tests/structures/file-history.test.ts`.
  - Note: the backup is a *pointer* (`backupFileName`) to external on-disk content, not the content
    itself. Resolving that pointer to actual file bytes is **reconstruction** — out of scope here.

- [ ] **Task 5: Session-meta records present in s1.**
  - Behavior: `attachment`, `last-prompt`, `mode`, `permission-mode`, `bridge-session`, `ai-title`
    records parse into typed variants. (No `queue-operation` — absent in s1.)
  - Acceptance: each modeled exactly per its observed keys in `recon/07-s1-field-inventory.md`
    (e.g. `permission-mode` = `{ type, sessionId, permissionMode }`).
  - Verify: `test_mode_record_exposes_mode_value` and `test_last_prompt_record_exposes_lastPrompt`,
    each against the corresponding s1 records.
  - Files: `src/structures/session-meta.ts`, `tests/structures/session-meta.test.ts`.

- [ ] **Task 6: s1 parse gate (the acceptance test for this plan).**
  - Behavior: loading the s1 JSONL yields only typed records — no `type` falls through to
    "unknown" and no top-level key present in the data is absent from the type (strict-key check
    in the test, not the type system alone).
  - Acceptance: `loadTranscript(filePath)` returns `TranscriptRecord[]`.
  - Verify: `test_s1_jsonl_parses_into_known_typed_records` — fails if any s1 line produces an
    unknown record type or carries an unmodeled top-level key.
  - Files: `src/parse/loadTranscript.ts`, `tests/parse/s1-gate.test.ts`.

## Open questions

None blocking. All s1 structure shapes were resolved during recon.

Resolved during recon:
- **`FileHistoryBackup` shape:** s1 = `{ backupFileName: string | null, version: number,
  backupTime: string }` — a pointer to external backup content, not inline content (`recon/07`).
- **`permission-mode` field shape:** s1 = `{ type:'permission-mode', sessionId, permissionMode }`
  (`recon/07`). The source lacks a `type:'permission-mode'` literal; we model the observed shape
  directly and consult `types/permissions.ts` only for the value type of `permissionMode`.

## Success criteria for this plan

- All tasks' tests green.
- `test_s1_jsonl_parses_into_known_typed_records` passes for the s1 JSONL.
- No structure exists in `src/structures/` that s1 never produces (fog-of-war held).
- No **field** exists in any `src/structures/` type that is absent from `recon/07-s1-field-inventory.md`
  (field-level fog-of-war held).
- Zero imports from the Claude Code source tree (clean room held).
- `.vscode/launch.json` lets you hit breakpoints both in a vitest test and in a source `.ts` file
  run directly (manual debugging works).
