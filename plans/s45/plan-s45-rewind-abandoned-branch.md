# Plan — Scenario s45 (`s45-rewind-abandoned-branch`)

## Context (why this work exists)

s45 is the first **code-rewind** scenario in the current pipeline (the prior s39–s44
runs were the `git-baseline` family). The human script is:

1. Write `calc.py` with a documented `add(a, b)` + `tests/test_calc.py` covering `add`.
2. Edit `calc.py`: add documented `subtract(a, b)`.
3. "Looks good."
4. **Rewind: 2, code** — abandons the `subtract` edit and restores `calc.py` on disk.
5. Edit `calc.py`: add documented `multiply(a, b)`.
6. "Thanks."

It is the twin of S20/S23 (code-rewind) and reuses the abandoned-edited-branch
enumeration of S13. The rendered ground truth lives in
`scenarios/executed/s45-rewind-abandoned-branch/`:
`calc.py` (surviving = `add`+`multiply`, 443 bytes), `tests/test_calc.py`, and the
abandoned snapshot `.abandoned_branches/abandoned-branch-1/calc.py` (= `add`+`subtract`).

### The gap (confirmed by live probe — this is NOT a char-lock)

Running the engine on the s45 JSONL today, **most of the reconstruction is already
correct**, but the **surviving branch's final revision of `calc.py` is wrong**:

| Item | Engine output today | Correct (on-disk) | Status |
|---|---|---|---|
| Rewound/abandoned `calc.py` tip | `add`+`subtract` (rev 1, 27 lines) | `add`+`subtract` | ✅ correct |
| `tests/test_calc.py` | `add` tests (rev 0, 27 lines) | same | ✅ correct |
| **Surviving `calc.py` final revision** | **`add`+`multiply`+`multiply` (40 lines, 653 bytes)** | `add`+`multiply` (27 lines, 443 bytes) | ❌ **WRONG** |

The surviving `calc.py` reconstructs a **4-revision ladder** where the LAST revision
duplicates the `multiply` function:

```
rev 0 (14 lines)  add                       <- Write B
rev 1 ( 8 lines)  partial-echo tail of add  <- user-edit E (rewind restore echo); partial tail, EXPECTED (cf s40)
rev 2 (27 lines)  add + multiply            <- CORRECT surviving tip content
rev 3 (40 lines)  add + multiply + multiply <- SPURIOUS duplicate, printed LAST (wrong)
```

The transcript contains **exactly one** `multiply` edit (single `def multiply`, clean
`return a + b` anchor) — verified at the event level. The duplicate is **fabricated by
the reconstruction engine**, not present in the data.

Because the verbose renderer prints rev 3 last, the existing tip-extraction convention
(`finalRevisionSlice` = last `revision N @` block) selects the 40-line duplicate as the
"tip", so a tip byte-match against on-disk `calc.py` **fails** (653 ≠ 443 bytes). This
is the same duplicate-insertion bug class fixed before in S23 ("surviving duplicates
push", stale-edit-base) and m6 ("duplicate `return self.name`").

**Goal:** make the engine reconstruct the surviving `calc.py` with NO spurious
`multiply`+`multiply` revision, so its final revision byte-matches the rendered on-disk
`calc.py`, while leaving the already-correct rewound branch and `test_calc.py` unchanged.

---

## Ground-truth facts the implementer will need (from live probe + JSONL analysis)

**Conversation / file DAG (from `runCli([S45_JSONL])`):**

```
══ conversationDAG ══
A  prompt  #d205e794   (rewind point)
├─ branch rewound   (tip #836ea480; rewind @ #d205e794)
│  D  edit       calc.py  #01JquFb6        (subtract — abandoned)
└─ branch surviving (tip #c3457a61)
   E  user-edit  calc.py  #294c26cb        (rewind restore echo; edited_text_file "state before multiply edit")
   F  edit       calc.py  #01WvVsu6        (multiply)

══ fileDAG ══
calc.py:   B write #01ULxQoJ → D edit #01JquFb6 → E user-edit #294c26cb → F edit #01WvVsu6
test_calc.py: C write #01XyPyNZ
```

- The surviving lineage for `calc.py` is **3 events** (B write, E user-edit, F edit) but
  the engine emits **4 revisions** — one is fabricated.
- The `multiply` Edit `F` (`#01WvVsu6`) `old_string` ends at `    return a + b` (the tail
  of `add`); `new_string` appends one `multiply` function. Applied to a base of just
  `add`, it must yield `add`+`multiply` and nothing more.
- s45 is **reader-DEPENDENT**: the rewind restore is represented by file-history backup
  snapshots (`calc.py` v2 after `add`, v4 = restored `add`-only before `multiply`). The
  engine builds a `BackupReader` via `buildSidecarReader` (`reconstruction_cli.ts:116`),
  and the stale-base reseed stage `seedStaleEditBases` is reader-gated
  (`reconstruction_branches.ts:52`).

**Leading root-cause hypothesis (must be confirmed by the RED test + a trace, not
assumed):** the `multiply` Edit `F` is being replayed onto a **stale base that already
contains `multiply`** (the correct `add`+`multiply` state), so its hunk inserts a second
`multiply`. The stale-base detector `editBaseIsStale` (`reconstruction_reseed.ts:58`)
should catch a base whose context does not match, but here the base it reconstructs comes
from the same event list, so the mismatch is invisible to it. The exact fix is one of:
(a) the surviving lineage seeds `F`'s base from the **rewind-restore backup** (`add`-only,
v4) instead of an already-`multiply` revision; or (b) a spurious extra revision is being
appended out of timestamp order and must not be. The implementer pins which via the trace
below.

**Code map (file:line anchors to start from):**
- `src/reconstruction_branches.ts:36-54` — `reconstructFileOver()` pipeline; `seedStaleEditBases` at `:52` (reader-gated).
- `src/reconstruction_reseed.ts:37-53` `firstHunkMatchesBase`; `:58-60` `editBaseIsStale`; `:112-125` `staleEditSeedFor`; `:131-145` `seedStaleEditBases`.
- `src/reconstruction_replay_edit.ts:96-107` `resolveContextLine`; `:113-139` `insertHunkAdditions`; `:174-187` `applyEdit` (base = `lastLinesOf(revisions)`).
- `src/reconstruction_sidecar.ts` — `findBackupPointAfter`, `backupSeedWriteFor(..., includeAfter)` (m6 fallback).
- `src/reconstruction_replay.ts:124` — `userEditChangesContent` (S15 guard: record a user-edit iff content differs).

---

## How to verify reconstruction (commands)

```
# Full verbose ladder for every file:
node --import tsx src/reconstruction_cli.ts scenarios/executed/s45-rewind-abandoned-branch/*.jsonl --verbose

# Just the surviving branch:
node --import tsx src/reconstruction_cli.ts scenarios/executed/s45-rewind-abandoned-branch/*.jsonl --surviving --verbose

# Just the rewound/abandoned branch (should already be add+subtract, 2 revs):
node --import tsx src/reconstruction_cli.ts scenarios/executed/s45-rewind-abandoned-branch/*.jsonl --branch 836ea480 --verbose
```

The verbose section header is the **full absolute temp path**
(`### /private/var/folders/.../calc.py`), so `--target calc.py` matches nothing — slice
by file section as the existing CLI tests do.

Full suite (runner is `node --test` via `npm test`, NOT vitest). Baseline after s44 = **552
passing**; this scenario adds the new s45 cases and must keep all prior tests green.

---

## Implementation steps (strict red-green TDD; do them in this order)

### Step 0 — Add the fixture

In `tests/fixtures.ts`, add `S45_JSONL` immediately after the `S44_JSONL` block, pointing
at the local executed JSONL, with a one-line comment matching the existing style:

```
scenarios/executed/s45-rewind-abandoned-branch/6bdd9f73-5ab9-4c7c-bb41-5fdf9da5a09a.jsonl
```

(Use the same absolute-path construction the surrounding constants use — keep `Path`
discipline if the other constants are wrapped; mirror them exactly.)

### Step 1 — New test file, clone the s44 harness

Create `tests/reconstruction_cli_s45.test.ts` by cloning the structure of
`tests/reconstruction_cli_s44.test.ts`. **Reuse the existing verbose helpers verbatim**
(`fileVerboseBlock`, `finalRevisionSlice`, `revisionSlice`, `stripLineNumberPrefixes`,
`stripTrailingNewline`) — copy them in exactly as s44 has them (they are duplicated
per-test-file by project convention). Point ground-truth reads at
`scenarios/executed/s45-rewind-abandoned-branch`. Name every test `test_S45_<behavior>`.
Each test must carry PLAIN-ENGLISH step comments in its body (see `~/.claude/guides/tdd.md`).

### Step 2 — GREEN-on-arrival characterization tests (lock what already works)

These should pass against the engine **as-is**. Write them first so any fix in Step 4 is
proven not to regress them.

- `test_S45_default_conversationDAG_shows_rewind_fork` — assert the conversationDAG has the
  rewind fork: prompt `A #d205e794` as the rewind point, a `rewound` branch carrying
  `D edit calc.py #01JquFb6`, and a `surviving` branch carrying `E user-edit calc.py
  #294c26cb` then `F edit calc.py #01WvVsu6`. Assert the fileDAG `calc.py` ladder
  `B write → D edit → E user-edit → F edit` and the single `test_calc.py` write
  `C #01XyPyNZ`.
- `test_S45_list_branches_surviving_and_rewound` — assert `surviving  tip #c3457a61` lists
  `calc.py, test_calc.py`, and `rewound    tip #836ea480` (rewind @ `#d205e794`) lists
  `calc.py`.
- `test_S45_rewound_branch_calc_is_add_then_subtract` — reconstruct the rewound branch
  (`--branch 836ea480 --verbose`); assert `calc.py` has exactly 2 revisions
  (`(14 lines)` then `(27 lines)`), the final revision contains `def add(` and
  `def subtract(` and NOT `def multiply(`, and its body byte-matches
  `.abandoned_branches/abandoned-branch-1/calc.py` after `stripLineNumberPrefixes` +
  `stripTrailingNewline`.
- `test_S45_test_calc_py_reconstructs_add_tests` — slice the `test_calc.py` verbose
  section; assert its single revision byte-matches the on-disk `tests/test_calc.py`.

### Step 3 — RED test that pins the bug (this is the failing test that drives the fix)

Write these to **fail against the current engine** — they encode the corrected surviving
reconstruction:

- `test_S45_surviving_calc_has_no_duplicated_multiply` — slice the surviving `calc.py`
  verbose block; assert its **final revision contains exactly ONE** `def multiply(`
  (count occurrences == 1) and does NOT contain a second `multiply` block. This is the
  sharp, minimal expression of the bug.
- `test_S45_surviving_calc_tip_byte_matches_on_disk` — `finalRevisionSlice` of the
  surviving `calc.py` block, `stripLineNumberPrefixes` + `stripTrailingNewline`, must
  equal the on-disk `calc.py`. (Today this extracts the 40-line `add+multiply+multiply`
  revision and fails.)
- `test_S45_surviving_calc_ladder_revision_count` — assert the surviving `calc.py` ladder
  ends at the correct final revision and carries **no** revision whose body has two
  `multiply` definitions. (Pin the exact expected revision line-counts only AFTER the fix
  reveals the corrected ladder — see Step 4; do not hardcode a guessed count first.)

Run `npm test` and confirm these new tests FAIL for the stated reason (duplicated
`multiply` in the final surviving revision) while the Step-2 tests and all 552 prior tests
still pass.

### Step 4 — Diagnose, then make the minimum engine change to go GREEN

Trace the surviving-branch reconstruction for `calc.py` to find where the second
`multiply` is introduced. Concretely:

1. Instrument or step through `reconstructFileOver` (`reconstruction_branches.ts:36-54`)
   for the surviving lineage and dump the `records`/revision list **before and after**
   `seedStaleEditBases` (`:52`). Determine whether the spurious 40-line revision is (a) a
   reseed-inserted synthetic revision, (b) the `F` edit replayed onto an
   already-`multiply` base, or (c) an out-of-order post-edit echo replayed before `F`.
2. Confirm the base that `applyEdit` (`reconstruction_replay_edit.ts:174-187`) uses for
   the `multiply` edit `F`. The correct base is the **restored `add`-only** content
   (rewind backup v4). If `lastLinesOf(revisions)` already holds `add`+`multiply` at that
   point, that is the defect — `F`'s base must be reseeded from the rewind-restore backup
   (use the existing `backupSeedWriteFor` / `findBackupPointAfter` machinery; m6 pattern),
   OR the duplicate revision must not be produced.
3. Apply the **smallest** change consistent with the existing reseed/replay design — the
   prior fixes here were a generalized `editBaseIsStale` content-walk (S23) and an
   `includeAfter` backup fallback (m6). Prefer extending the existing reader-gated
   `seedStaleEditBases`/`staleEditSeedFor` path over adding a new code path. Do NOT special-
   case s45 by name, branch hash, or filename — the fix must be a general rule about
   post-rewind Claude edits on a restored surviving branch.
4. Re-run `npm test`. The Step-3 tests must now pass; once the corrected surviving ladder
   is visible, fill in the exact expected revision count/line-counts in
   `test_S45_surviving_calc_ladder_revision_count`.

All new code obeys `plans/coding-requirements.md` (domain types over primitives, enum-member
discriminant comparisons, verb-named functions, no re-export shims, DRY helpers) and any
conditional logic follows `~/.claude/guides/single-condition-branching.md`.

### Step 5 — Verify end-to-end

- `npm test` → **all green**: the 552 prior tests plus the new s45 cases, 0 failures.
- Re-run the three CLI commands above and eyeball: surviving `calc.py` final revision is
  `add`+`multiply` (no duplicate), rewound branch is `add`+`subtract`, `test_calc.py`
  unchanged.
- Confirm no `src/` regression touched the git-baseline / rename / earlier rewind paths
  (the full suite covers them; a green run is the gate).

Per pipeline convention (s39+ family): **commit nothing.** Leave the working tree dirty for
the next agent.

---

## Out of scope / explicit non-goals

- Do **not** rewrite the rewound-branch or `test_calc.py` reconstruction — both are already
  byte-correct; the Step-2 tests guard them.
- Do **not** "fix" the rev 1 partial-echo tail of the restore user-edit — partial echo
  tails are expected (cf s40) and are not the bug.
- The MUST-READ `plans/script-handling.txt` (HAS-BEACON/NO-BEACON script replay) does **not**
  apply here: s45 has no Bash/MCP script rewrite. It is linked per template convention only.
