# Handoff: per-line reconstruction engine — S1 slice complete & committed; S2 slice (Edit/oldLineNum/paired-changeId) is next
Conversation name: s1 reconstruction_engine.ts
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/a905e9cc-9ea3-4a7e-a989-1b5e5a8896e5.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `39627cb reconstruction engine, built from S1's fixture`. **Working tree is clean — everything is committed.**

## Goal
Clean-room TypeScript rebuild of "Engine B" (`/Users/matkatmusicllc/Desktop/claude code src/RevEng/docs/engine-b-overview.md`): reconstruct the on-disk history of every file a Claude Code session touches, from its JSONL transcript, one scenario at a time. Each file becomes an ordered list of whole-file **revisions** built from replayed transcript evidence; the CLI renders that history. The parse layer (S1+S2 record/tool/attachment typing) already exists; this engine sits on top of it.

## Current State
**S1 slice done, committed, green: `npm test` → 42 pass / 0 fail; `npx tsc --noEmit` → clean; `filesize_check.py` clean.**
- Engine split into three single-responsibility files (per user preference: split over cramming, full comments + multi-line expressions, all well under the 250-line cap):
  - `src/reconstruction_engine.ts` — model types (`LineValue`, `LineEntry`, `FileRevision`, `FileHistory`), event types (`WriteEvent`/`DeleteEvent`/`FileEvent`), `extractFileEvents`, `splitLines`, `reconstructFile(records, target)`, `reconstructAll(records)`, `findDeletedTarget(records)`. Pure library, no `main`.
  - `src/reconstruction_render.ts` — `renderVerbose` / `renderDiff` (pure).
  - `src/reconstruction_cli.ts` — `parseArgs`, `runCli`, entry point (`main` guard). Three views: default lists touched files + revision counts; `--verbose` full line state; `--diff` changes per revision. `--target <abs path>` narrows to one file.
- `EventKind` enum lives in `src/structures/vocabulary.ts` (rule 2: every enum, one home), imported directly — no re-export shim.
- Paired tests: `tests/reconstruction_engine.test.ts` (extraction/reconstruct, off real `S1_JSONL`), `tests/reconstruction_render.test.ts` (pure literal revisions), `tests/reconstruction_cli.test.ts` (parseArgs + runCli end-to-end).
- S1 reconstructs **every** touched file: `s1_delete.py` (Write create → Bash rm delete = 2 revisions) and `tests/test_s1_delete.py` (create only = 1 revision).

## What Remains
1. **Start the S2 slice** against the design doc's deferred specs (`plans/reconstruction-engine-design.md`, specs 10–12). S2 = `s2-move-file`: Read → Edit → Write → Bash `mv`. Recon already known: two real Edit hunks, e.g. `{oldStart:1, oldLines:2, newStart:1, newLines:6, lines:[...]}` (inserts a `goodbye()` fn) and a same-count import-swap.
2. **Add an `edit` event kind** to `EventKind` (vocabulary.ts) and extract it from `Edit` tool_use blocks (the `structuredPatch` hunks are already typed in `src/structures/tool-results.ts` as `StructuredPatchHunk`).
3. **Implement the splice + `oldLineNum` mapping in replay**: per Rule 1, an insert/remove mints a new revision with lines renumbered and unchanged context lines carrying `oldLineNum` back-pointers; per Rule 2 (coarse), a `-`/`+` pair is remove+insert, and the removal & addition revisions from ONE edit share a `changeId` **derived from that Edit's tool_use id**.
4. **Add `mv` handling** (rename = lineage; `findDeletedTarget`-style helper, alias of one path to another) so the moved file's history survives the rename.
5. **Write S2 specs first (red→green)** in a new/extended test file driven off `S2_JSONL` (already in `tests/fixtures.ts`); prove `oldLineNum` chaining against the real hunks. Keep `npm test` + `tsc` + `filesize_check` clean at every boundary.
6. **Commit only when the user approves** (they confirm before every commit).

## Key Files
- `plans/reconstruction-engine-design.md` — **READ FIRST.** The agreed model (revisions, `oldLineNum` back-pointer, the two rules, `changeId`), code layout, and TDD specs (S1 done = 1–9; S2 deferred = 10–12).
- `plans/implementation-notes-api-from-scenarios.md` — dated decisions/deviations for the S1 engine slice and the earlier S2 parse work.
- `src/reconstruction_engine.ts` / `_render.ts` / `_cli.ts` — the engine to extend.
- `src/structures/tool-results.ts` — `StructuredPatchHunk`, `EditResult`/`ReadResult` already typed (S2 parse layer).
- `src/structures/vocabulary.ts` — `EventKind` + all wire enums live here.
- `plans/coding-requirements.md` — mandatory style rules (domain types not primitives; enums in vocabulary.ts; DRY; enum-member comparisons; verb-named functions).
- `plans/roadmap.md` — scenario checklist; reconstruction-engine row shows S1 slice done.

## Context the Next Agent Won't Have
- **`changeId` is derived from the originating tool_use id** (user decision), NOT randomly generated — deterministic runs + provenance, and a `-`/`+` edit's paired revisions share it automatically.
- **Revision boundary rule = ANY insert/remove (structural change), not "line count changed"** — count can stay equal while positions shift; only pure same-position text replacement appends to a line's `values[]`.
- **Coarse in-hunk identity by default**: take the diff literally (`-` removed, `+` born with `oldLineNum -1`, context keeps identity); do NOT sub-diff to pair `-`→`+` unless a scenario demands it.
- **Fog of war is the hard rule**: only model evidence kinds the CURRENT scenario emits; the *interface* may be generic but the *event kinds* are scenario-limited. The user pushed back twice on over-reaching (asking about completion-time stamps / absent-vs-empty markers we don't need yet) — don't re-raise those.
- **Engine stamps events at tool_use (issue) time**, not tool_result (completion) time — single source, fine for S1; revisit only if a scenario forces it.
- **Clean room is absolute**: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` — consult `engine-b-overview.md` for the design only.
- **User strongly prefers splitting files over condensing comments / single-lining expressions** to stay under the 250-line cap. Also: all enums go in vocabulary.ts; no forwarding/re-export shims; flat tests `tests/<stem>.test.ts`, `node:test`+`node:assert` (NOT vitest).
- **Harness quirks**: the `PostToolBatch` hook often emits a STALE failure for a file written in the same batch as its test — IGNORE it; `npm test` is authoritative. `tsx` doesn't type-check (run `npx tsc --noEmit`). `tsx` prints `Debugger listening…` to stderr — append `2>/dev/null` for clean CLI output.
- **Subagents CAN now read the scenario JSONLs** via the in-worktree `scenarios/` symlink (verified) — the older handoff's "subagents can't read Desktop" is outdated. Per user, test fixtures still use absolute Desktop paths.

## How to Verify
```
npm test                 # node --import tsx --test tests/*.test.ts → expect 42 pass / 0 fail (more as S2 adds tests)
npx tsc --noEmit         # expect: No errors found
python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py src/reconstruction_*.ts   # expect exit 0
# Run the tool (S1 example; path resolves through the scenarios/ symlink):
npx tsx src/reconstruction_cli.ts scenarios/executed/s1-delete-file/b3634dc4-a385-40b9-8e23-6695a4f7bb7e.jsonl --diff 2>/dev/null
```
