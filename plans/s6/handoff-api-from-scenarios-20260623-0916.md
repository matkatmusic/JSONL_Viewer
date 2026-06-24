# Handoff: Write the S6 (`git mv`) reconstruction plan for the api-from-scenarios engine
Conversation name: api-from-scenarios — S5 implementation
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/575b1aed-bd52-478e-a7ac-faf407c18225.jsonl
Plan file (your output): plans/s6/s6-reconstruction-plan.md (does not exist yet — you write it)
Reference plan (the shape to match): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s5/s5-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
The project is a clean-room TypeScript engine that reconstructs the file-change history of a
Claude Code session from its JSONL transcript, one scenario at a time. S1–S5 are implemented.
**Your job is to investigate Scenario 6 (`s6-git-mv`) and WRITE its TDD implementation plan**
(`plans/s6/s6-reconstruction-plan.md`), in the same style as `plans/s5/s5-reconstruction-plan.md`.
**Do NOT implement it** — produce the plan only, for a later agent to execute.

## Current State
- **S5 (bash-redirect) is fully implemented and green.** `npm test` → **84 tests pass, 0 fail**;
  `npx tsc --noEmit` → clean; every source/test file ≤250 lines. Work is **uncommitted** in the
  working tree (the prior convention is to commit only after the user approves — see
  `git status`; ~443 insertions across 18 files plus 5 new untracked source/test modules).
- **EventKind now has:** `write`, `delete`, `edit`, `rename`, `copy`, `overwrite`, `append`
  (`src/structures/vocabulary.ts`).
- **Extraction (`src/reconstruction_extract.ts`) recognizes:** Write→create; Bash `rm`→delete,
  `mv`→rename, `cp`→copy, `>>`→append, `>`→overwrite; Edit→splice. Each parser is a small
  `parse<X>` regex over the Bash `command` string.
- **Rename is already a first-class, fully-working revision kind** (built in S2): `parseMvPaths`
  (`^mv\s+(\S+)\s+(\S+)$`) → `RenameEvent`; lineage collapse (`reconstruction_lineage.ts`)
  merges source+destination into one history; `renameRevision` carries lines forward with
  identity back-pointers; the list view labels it `rename`, the diff heads `@@ renamed … @@`.

## What Remains (your deliverable: the S6 plan)
1. **Read the S6 ground truth.** Scenario transcript:
   `scenarios/executed/s6-git-mv/9cf5d06b-af23-469a-9451-a3c562ba9938.jsonl` (in-worktree symlink;
   absolute equivalent under `/Users/matkatmusicllc/Desktop/claude code src/RevEng/...`). The
   scenario script is `scenarios/executed/s6-git-mv-run-20260618-091725.txt`. The recorded steps:
   (1) init git repo, write `s6_git.py` with `hello()` + `tests/test_s6_git.py`, stage & commit;
   (2) **`git mv s6_git.py s6_git_renamed.py`**; (3) **Edit** `s6_git_renamed.py` to add
   `goodbye()`; (4) "Thanks"; (5) exit.
2. **Run the current engine against S6 to see what's missed** (diagnostic, like S5's first step):
   `npx tsx src/reconstruction_cli.ts "scenarios/executed/s6-git-mv/9cf5d06b-af23-469a-9451-a3c562ba9938.jsonl"`
   — confirm whether `git mv` is currently recognized (it almost certainly is NOT: `parseMvPaths`
   matches `^mv …`, not `git mv …`).
3. **Determine the net-new work.** Likely small: S6 is the existing rename+edit lineage, but the
   rename arrives as **`git mv <src> <dst>`** (a Bash command) rather than plain `mv`. Decide
   whether to (a) generalize `parseMvPaths` to also accept a `git mv` prefix, or (b) add a
   sibling `parseGitMvPaths`. Verify against the transcript HOW `git mv` appears (is it the whole
   command, or part of a compound `git add … && git commit`? does the initial commit's `git`
   calls produce any spurious events? does the engine see the file-history snapshots?).
4. **Confirm the content source.** Unlike S5, `git mv` likely leaves no surprises — the rename
   carries lines forward and the subsequent Edit's `structuredPatch` drives the `goodbye()` add
   (already handled). Verify the Edit's hunks are present in the transcript (S2 mechanism). Check
   whether content must be recovered from the file-history sidecar (S5's `BackupReader`) at all —
   probably not, but confirm.
5. **Watch for git-noise events.** The scenario stages/commits and inits a repo; make sure no
   `git init`/`git add`/`git commit` Bash command is mis-parsed as a redirect/mv/rm/cp. (S5 added
   a `>`/`>>` parser — double-check a `git commit -m "…"` or similar can't trip `parseRedirect`'s
   `>` regex or `parseRmTarget`.) This is the highest-risk regression area; call it out explicitly
   in the plan.
6. **Write `plans/s6/s6-reconstruction-plan.md`** mirroring the S5 plan's structure: "What S6
   adds", "Locked decisions", per-line model impact (probably "no new per-line shape — reuses
   rename + edit"), ground-truth table (literal timestamps, tool_use ids/`changeId`s, expected
   line contents), "Expected reconstruction" (the exact entry list + locked list/diff format),
   then ordered RED-first TDD tasks each ending in the **Verify gate**, and an End-to-end check.
   Create `plans/s6/` first (`mkdir -p`).
7. **Conform the plan to the guides BEFORE presenting** (S5's plan went through a conformance
   audit): `~/.claude/guides/planning.md`, `~/.claude/guides/coding-standards.md`,
   `~/.claude/guides/tdd.md`, and `plans/coding-requirements.md`. Specifically: every function
   name has a verb; no primitive types for domain values (`Path`/`Uuid`/`Date`); enum-member
   comparisons; single-condition branching; one canonical wire-vocabulary home; named types over
   inline anonymous return types.

## Key Files
- `plans/s5/s5-reconstruction-plan.md` — **the template to match.** Read this first; copy its shape.
- `plans/reconstruction-engine-design.md` — the living design doc; TDD specs 1–28, Code-layout.
  S6 will add specs 29+ and update Code-layout. (Read "S2 — implemented now" specs 10–14 for how
  rename is modelled.)
- `plans/coding-requirements.md` — mandatory coding-style rules (5 rules). Plan code must conform.
- `plans/roadmap.md` — S5 row now `[x]`; S6 row is the next `[ ]`.
- `src/reconstruction_extract.ts` — the parsers (`parseMvPaths`, `parseRmTarget`, `parseCpPaths`,
  `parseRedirect`) + `bashEventFrom` dispatch. S6's `git mv` parsing lands here.
- `src/reconstruction_lineage.ts` — rename-chain lineage collapse (already handles renames).
- `src/reconstruction_replay.ts` + `src/reconstruction_replay_edit.ts` — `renameRevision`,
  `applyEdit` (both already do what S6 needs at the line level).
- `src/reconstruction_render_list.ts` / `src/reconstruction_render.ts` — `getEntryLabel` /
  `diffBlock` already handle `rename`.
- `tests/fixtures.ts` — add `S6_JSONL` here (absolute Desktop path, matching S1–S5 convention).
- `plans/implementation-notes-api-from-scenarios.md` — the running notes; latest entry (2026-06-23)
  documents S5 + its 3 deviations.

## Context the Next Agent Won't Have
- **`git mv` ≠ `mv`.** The existing `parseMvPaths` regex is anchored `^mv\s+…` and will NOT match
  `git mv …`. This is the central S6 question — decide generalize-vs-new-parser and verify against
  the actual transcript command string (the command may be exactly `git mv s6_git.py s6_git_renamed.py`,
  or wrapped). Don't assume; read the JSONL.
- **Snapshot paths are cwd-relative** (discovered in S5, load-bearing): Claude Code's
  `file-history-snapshot` records key `trackedFileBackups` by the path **relative to the session
  cwd**, not absolute. `reconstruction_sidecar.ts` resolves them against the transcript `cwd`
  (`findCwd` + `resolveAgainstCwd`). If S6 ends up needing the sidecar, reuse that; do not re-key
  by absolute path.
- **Fixtures use absolute Desktop paths** (`/Users/matkatmusicllc/Desktop/claude code src/…`) to
  match S1, even though the in-worktree `scenarios/` symlink also works. Keep that convention for
  `S6_JSONL`. Tests that need backup blobs use an **in-memory `BackupReader`**, never disk — the
  clean-room rule forbids code/tests reading the executed scenario tree directly (the JSONL
  transcript itself is fine to read via the fixture path).
- **The harness `PostToolBatch`/`PostToolUse` hooks run tests mid-batch and frequently report
  STALE failures** for a file edited in the same batch as its test (module-not-found, or an
  assertion from before the matching source edit landed). `npm test` run manually is authoritative;
  don't trust an in-batch hook failure without re-running.
- **`reconstruction_engine.ts` is at 248/250 lines.** Threading anything new through the public API
  may force a split (precedent: the replay split in S5, the render split in S4). The plan should
  note this and prefer "split, never condense" (a standing user preference).
- **Verify gate = three checks after every task:** `npm test` (0 fail), `npx tsc --noEmit`
  (tsx does NOT type-check, so this is the real type gate; `noUnusedLocals`/`noUnusedParameters`
  make a stray import a hard error), and a per-file `filesize_check.py` loop
  (`python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py <file>` — it
  only reads argv[1], so loop over each file; flags >250 lines, >15-line functions, deep nesting).
- **Clean room is absolute:** never import or copy from `/Users/matkatmusicllc/Desktop/claude code src/`
  in source or tests beyond the JSONL fixture path.

## How to Verify
You are producing a PLAN, not code, so "verification" is plan quality, not a test run. Before
presenting `plans/s6/s6-reconstruction-plan.md`:
1. Confirm the baseline is still green so your plan builds on solid ground:
   `cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios && npm test` → 84 pass,
   then `npx tsc --noEmit` → clean.
2. Run the diagnostic to ground the plan in real behavior:
   `npx tsx src/reconstruction_cli.ts "scenarios/executed/s6-git-mv/9cf5d06b-af23-469a-9451-a3c562ba9938.jsonl"`
   — record exactly what is missing/wrong (e.g. the `git mv` rename not recognized → the file
   shows as two separate histories instead of one).
3. Self-audit the plan against the four guides + `coding-requirements.md` (Step 7 above): for nearly
   every instruction, you should be able to answer "why is this written this way". Fix vague or
   ambiguous instructions before presenting.
