# Handoff: m3 (`m3-bash-redirect`) IMPLEMENTED as a characterization/regression LOCK — NO `src/` change. 296 tests pass (287 baseline + 9 new). All acceptance criteria in `plans/m3/m3-reconstruction-plan.md` §10 met; uncommitted, gated on user approval. **Next scenario: m4 (`m4-delete-recreate`)** — plan and implement it the same way (ground-truth-first: run the CLI live against the executed transcript, verify byte-for-byte, then char-lock or real-fix depending on whether the engine is already correct).
Conversation name: api-from-scenarios — m3 impl monitor → implement m3 (bash-redirect)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/c54f9594-53d3-4e10-9496-d16a79e04585.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m3/m3-reconstruction-plan.md
Planning handoff (gated this impl): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m3/handoff-api-from-scenarios-20260624-0025.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling` (S23 and m1 are committed). Working tree carries uncommitted m2 + m3 work — do NOT revert it. Untracked: `plans/m2/`, `plans/m3/`, `tests/reconstruction_cli_m2.test.ts`, `tests/reconstruction_engine_m2.test.ts`, `tests/reconstruction_cli_m3.test.ts`, `tests/reconstruction_engine_m3.test.ts`. Modified (shared with m2): `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/roadmap.md`, `tests/fixtures.ts`. `git diff src/` is **EMPTY** — m3 added zero `src/` change.

## Goal
Lock — with tests only — that `reconstruction_cli` correctly reconstructs `m3-bash-redirect`: ONE file `m3_mixed.txt` is written (`line one`), `>>`-appended (`line two`), edited (`line one`→`LINE ONE`), then `>>`-appended again (`line three`). The two `>>` redirects carry NO content in the JSONL — recovered from `~/.claude/file-history` backups (`@v3`, `@v5`) via the `BackupReader`; the Edit's base (`line one`/`line two`) is content the append revision recovered from a backup. m3 is the FIRST scenario to interleave an Edit between two bash redirects on one file, and the FIRST to prove that the S23 per-line `editBaseIsStale` walk does NOT false-positive on a backup-recovered append base (the dormant complement of S19/S23, where it fires). Engine is already correct, so this is a characterization/regression LOCK with no production-code change — exactly like m1/m2/S20/S21/S22.

## Current State
**m3 IMPLEMENTED, fully verified, uncommitted.** Acceptance criteria from plan §10:
- [x] `tests/fixtures.ts` has `M3_JSONL` (Desktop path), appended after `M2_JSONL` (1 file edited, +6 lines).
- [x] `tests/reconstruction_engine_m3.test.ts` — 4 tests, reader-wired (in-memory `M3_BACKUPS` map with all 4 blobs @v2/@v3/@v4/@v5), all GREEN on first run. Both crux tests proven to bite: removal expectation `"line two"`→`"line one"` flipped → RED (actual `"line two"`); `writeRevisions.length` `1`→`2` flipped → RED (actual `1`); both restored.
- [x] `tests/reconstruction_cli_m3.test.ts` — 5 tests, NO reader (CLI builds its own real on-disk sidecar reader), all GREEN on first run. Sentinel prove-the-lock flip `line three`→`line THREE-SENTINEL` → RED (`includes` returned `false`), restored.
- [x] `npm test` = **296 pass / 0 fail** (12.9s); `npx tsc --noEmit` clean.
- [x] `git diff --stat src/` is **EMPTY** (m3 added no engine change). HEAD already commits S23 + m1; m2 added no `src/`; m3 added no `src/`.
- [x] roadmap M3 line 27 flipped to `[x]` with the full §7.1 entry; impl-notes entry prepended above the m2 entry; design.md m3 note appended after the m2 note (NO new spec number).
- End-to-end CLI byte-spot-check (worktree JSONL, `--surviving --verbose`) is byte-identical to plan §2.5: 5 revisions, kinds `[write, append, edit, edit, append]`, `(1 lines)` block at rev 2 holds only `line two`, rev 4 = 29-byte `LINE ONE\nline two\nline three`; `--list-branches` lists exactly `surviving  tip #6076417b    m3_mixed.txt` with NO `rewound`.
- [ ] Commit — **DEFERRED**, gated on user approval per project rule (one commit per scenario). Files to stage are listed under "What Remains" below.

## What Remains
1. **User approval to commit.** Project rule: one commit per scenario, only after the user approves. Stage **exactly** the 7 files below — do NOT `git add -A` (the worktree carries uncommitted m2 work which is a separate commit and must not be swept in, and the `plans/sN/`/`plans/m1/`/`plans/m2/`/`plans/m3/` handoff layout must not be swept in):
   - `tests/fixtures.ts`
   - `tests/reconstruction_engine_m3.test.ts`
   - `tests/reconstruction_cli_m3.test.ts`
   - `plans/roadmap.md`
   - `plans/implementation-notes-api-from-scenarios.md`
   - `plans/reconstruction-engine-design.md`
   - `plans/m3/m3-reconstruction-plan.md`
   There is no `src/` file in the commit. Suggested message: `Implemented m3 handling`. NOTE: m2's commit (its parallel 7-file set, plus `plans/m2/`) is also outstanding and is a separate decision — do not bundle.
2. **Plan and implement m4 (`m4-delete-recreate`)** — roadmap line 28 (`[ ] M4 ->`). Ground-truth-first methodology, identical to m1/m2/m3:
   - Read `scenarios/m4-delete-recreate.txt` (the scenario script) and inspect `scenarios/executed/m4-delete-recreate/<uuid>.jsonl` + rendered files.
   - Run the CLI live against the executed JSONL: `npx tsx src/reconstruction_cli.ts <m4-jsonl> --list-branches` and `--surviving --verbose`.
   - Compare the reconstructed output to the on-disk ground-truth files byte-for-byte.
   - If byte-identical → char/regression LOCK (no `src/` change): write `plans/m4/m4-reconstruction-plan.md` mirroring m3's structure (verbatim tests, §3 file:line map, prove-the-lock flips, commit list, acceptance criteria). Expected baseline after m3 commits: 296; m4 will likely add 9 → 305.
   - If diverges → real engine fix is required: forensics (file:line map of the gap), prototype the fix live, then write the plan with the fix.
   - Either way: hand off via `/jot:handoff-prompt` so an impl agent can execute.

## Key Files
- `plans/m3/m3-reconstruction-plan.md` — the executed plan (verbatim tests, §2.3 backup table, §2.5 exact CLI output, §3 engine file:line map, TDD, commit list, acceptance criteria). Already complete; preserved for the next agent's reference.
- `plans/m3/handoff-api-from-scenarios-20260624-0025.md` — the planning handoff that gated this implementation.
- `tests/fixtures.ts` — `M3_JSONL` appended after `M2_JSONL` (Desktop path `…/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl`).
- `tests/reconstruction_engine_m3.test.ts` — 4 reader-wired engine tests (mirror `tests/reconstruction_engine_s5.test.ts:11-16`).
- `tests/reconstruction_cli_m3.test.ts` — 5 CLI tests (no reader; mirror `tests/reconstruction_cli_m2.test.ts`).
- `plans/roadmap.md` — line 27 `[ ] M3 ->` flipped to `[x]` with the full m3 entry. Line 28 is the next target (`[ ] M4 ->`).
- `plans/implementation-notes-api-from-scenarios.md` — top entry (newest-first) is the m3 implementation note dated `2026-06-24:07:30:00`, with References / Design decisions / Deviations / Tradeoffs / Open questions.
- `plans/reconstruction-engine-design.md` — m3 note appended after the m2 note (around line 239), inside the existing scope-so-far paragraph. NO new spec number.
- Scenario inputs (read-only): `scenarios/m3-bash-redirect.txt`; `scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl`.
- READ-ONLY (why m3 is already correct — do NOT edit): `src/reconstruction_sidecar.ts:60-71,139-157` (sidecar recovery), `src/reconstruction_replay_edit.ts:145-187` (appendRevision + applyEdit removal/addition pair), `src/reconstruction_branches.ts:60-122` (seedStaleEditBases/editBaseIsStale — stayed inert), `src/reconstruction_cli.ts:114-122,189` (CLI sidecar wiring), `src/reconstruction_extract.ts` (parseRedirect).
- Next scenario inputs: `scenarios/m4-delete-recreate.txt` and `scenarios/executed/m4-delete-recreate/<uuid>.jsonl` (run from the worktree to seed the live forensics).

## Context the Next Agent Won't Have
- **This was a LOCK, not a fix** — exactly like m1/m2/S20/S21/S22. All 9 m3 tests went GREEN on first run; both engine-crux prove-the-lock flips and the CLI sentinel flip all confirmed RED then restored cleanly. The premise from the planning handoff held end-to-end.
- **The 5th revision is NOT a bug.** Initial inspection of `--surviving --verbose` shows a `revision 2 (1 lines)` holding only `line two` between revs 1 and 3 — this is the engine's designed removal-intermediate for an edit hunk that both removes and adds (`applyEdit` at `src/reconstruction_replay_edit.ts:174-187`, locked by `tests/reconstruction_engine.test.ts:103`). It is NOT a reseed (a reseed would carry the backup snapshot `line one\nline two`, 2 lines; rev 2 is 1 line). Do not "fix" it.
- **The reseed-dormancy is the novel invariant m3 locks.** `editBaseIsStale` is FALSE here because the Edit's recorded base (`line one\nline two\n`) matches the reconstructed append revision exactly — so m3 regression-locks that the S23 per-line context-match walk does NOT false-positive on a base advanced by a backup-recovered append. m3 is the dormant complement of S19/S23 (where the reseed fires).
- **m3 is NOT reader-free (unlike m2).** Engine tests MUST wire an in-memory `BackupReader` — the `>>` redirects carry no content in the JSONL. Blob map (from live forensics): `936191f45d79faed@v2`=`line one\n`, `@v3`=`line one\nline two\n` (queried by append C), `@v4`=`LINE ONE\nline two\n`, `@v5`=`LINE ONE\nline two\nline three\n` (queried by append E). Include all four for robustness. CLI tests pass NO reader (CLI builds its own real on-disk reader, exercising the real `~/.claude/file-history` blobs).
- **The Stop hook ran the suite after every test-file edit and BLOCKED on RED.** Expect (and ignore) its failure notifications during deliberate prove-the-lock flips — it passes once restored. All 3 RED→GREEN cycles in this session executed cleanly under the hook.
- **Plan §6 sentinel rule:** when proving a CLI line-count/content assertion bites, pick a sentinel that appears NOWHERE else in the output. Do NOT reuse `(1 lines)`/`(2 lines)` (they recur across revision blocks). This session used `line three`→`line THREE-SENTINEL` and confirmed RED.
- **Never `git add -A` and never `git checkout`/`restore` the shared docs.** `tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md` carry uncommitted m2 edits as well as the m3 edits. Revert specific lines by hand if a temp edit needs undoing (the worktree-git-checkout hazard documented since S18).
- **Two commits are outstanding** (m2 and m3) — they are independent, each their own 7-file scope. The user may approve them in either order; do not bundle.
- **m4 is next** (roadmap line 28, `[ ] M4 ->`). Per the project pattern, plan it ground-truth-first (live CLI + byte compare) and char-lock if the engine is already correct; otherwise prototype the fix live before writing the plan.
- **Auto-memory `m3 impl monitor` is stale** — the watcher (`blzzsvmya`) was killed when the previous session torn down; the m3 plan + handoff had already landed in `plans/m3/` (created 2026-06-24 00:23 and 00:26) and were detected manually on resume. Update the memory entry to DONE if you rely on it.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # expect 296 pass / 0 fail
npx tsc --noEmit    # expect clean
git diff --stat src/   # expect EMPTY (m3 adds zero src/ change)
# end-to-end byte spot-check (worktree JSONL):
P="scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
#   -> m3_mixed.txt: 5 revisions ending at LINE ONE / line two / line three;
#      the (1 lines) block at rev 2 holds only "line two".
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
#   -> "surviving  tip #6076417b    m3_mixed.txt"  (no rewound)
```
