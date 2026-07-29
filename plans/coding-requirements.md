# Coding requirements — api-from-scenarios

Project-wide, mandatory coding-style requirements for all source and test code in
this worktree. Derived from explicit user direction. When a new requirement is
agreed, add it here.

## 1. No primitive types for domain values

A value that *means* something gets a domain type, never a bare `string`/`number`.

- **Identifiers → `Uuid`** (`src/structures/domain.ts`) — every id, including
  non-RFC-4122 ones (`toolu_…`, `cse_…`), not only canonical UUIDs.
- **Time-based values → `Date`** (the built-in datetime object) — e.g. `timestamp`,
  `backupTime`, `snapshot.timestamp`.
- **Filesystem paths → `Path`** (`src/structures/domain.ts`) — e.g. `cwd`,
  `file_path`/`filePath`, backup file names, path-map keys.

Rules:

- **Prefer a pre-existing type; hand-roll a class only when none exists.** `Date`
  is built-in → use it. Node/TS has no `Path`/`Uuid` class → minimal hand-rolled
  classes (raw value + `toString`/`toJSON`/`equals`).
- **Booleans, numbers, and genuinely free-form text stay primitive** (e.g.
  `gitBranch`, `mode`, `content`, `stdout`, version strings) — "unless absolutely
  necessary."
- **A collection keyed by a domain value gets a wrapper class** whose public
  interface speaks only the domain type, hiding any primitive-keyed internals.
  Example: `FileBackupMap` hides a `Map<string, …>` and exposes `get(path: Path)`.
- **Parsing hydrates, it does not cast.** Construct real domain objects from wire
  strings; never type a field as a domain type while it is still a primitive at
  runtime. Envelope fields are hydrated by `parseRecord`; nested/type-specific
  fields by their accessors. Hydration returns fresh objects — never mutate the
  raw record (accessors re-run over the same record).

## 2. One canonical source for the wire vocabulary

- All string `enum`s live in `src/structures/vocabulary.ts`; every other file
  imports them.
- Every `= Object.values(<Enum>)` set is defined in `vocabulary.ts`, beside its
  enum.
- Shared field-key / identifier groups (e.g. `ENVELOPE_KEYS`, `ENVELOPE_ID_KEYS`)
  live in `vocabulary.ts`.
- **No re-export shims.** Move a symbol to one canonical home and import it
  directly everywhere; never wrap or re-export it through an intermediate module.

## 3. DRY — extract to generic, parameterized helpers

- A repeated expression becomes a function that takes parameters, never one
  hardcoded to a single input. Example: `readNonEmptyLines(file)`, not
  `readS1Lines()`.
- A helper duplicated across files becomes one shared generic helper. Example:
  `loadRecords(file)`.
- Repeated constants move to a shared module, named for extension. Example:
  `tests/fixtures.ts` holds `S1_JSONL` (and future `S2_JSONL`, …).
- Test support is layered: `tests/utilities.ts` (generic functions) vs
  `tests/fixtures.ts` (data / paths).

## 4. Compare discriminants via enum members, never bare strings

`record.type !== RecordType.assistant`, never `record.type !== "assistant"`.
Applies to every discriminant: `RecordType`, `BlockType`, `ToolName`,
`AttachmentPayloadType`.

## 5. Function names must contain a verb

Name a function for what it does. `resolveToolResult` (not `typeToolResult`);
`getContentBlocks`, `hydrateWriteResult`, `loadRecords`, `readNonEmptyLines`.

## 6. Anything slow shows a progress bar

User rule, 2026-07-27: **for anything that takes a while to load, show a progress
bar to the user.**

- Any fetch or build that can exceed roughly a second gets a visible indicator for
  its whole duration — *including* work started with a bare `void promise` so it
  does not block the main render. That case is what produced this rule.
- A "nothing found" / empty-state message may only render once the work has
  actually completed. Loading and empty are different states, and showing one for
  the other tells the reader the work is done and produced nothing. The JSONLs pane
  displayed "no JSONLs touched this project's files" for the ~4 s its scan was still
  running, which read as the pane being broken (task 304).
- Prefer an incrementing **counter** to a static label for per-item stages: an
  advancing number is what distinguishes slow from hung (tasks 163, 303).
- Reuse the page's existing loadbar rather than adding a second idiom —
  `webapp/layer1-progress.ts` (`.loadbar` / `.loadbar-fill` / `.loadbar-label`), fed
  by the NDJSON `?progress=1` stream pattern in `src/viewer_api_layer1_route.ts`.
