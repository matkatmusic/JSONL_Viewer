# S31 Reconstruction Plan — `s31-script-rename-many-rows`

## Verdict (why this plan is a lock, not a fix)

`reconstruction_cli` processes Scenario 31 **without needing any engine modification.**
This was confirmed LIVE this planning session: the JSONL was run through `reconstructBranches`,
the final revision of every touched file was materialized, and each was compared **byte-for-byte**
against the independently-rendered ground-truth files. All four match (the only delta is a single
trailing `\n`, which the engine's line model never stores — identical to every prior char-lock
S25–S30). It is also **reader-INDEPENDENT**: byte-identical with and without the `BackupReader`.

Therefore this plan creates two test files (engine + CLI) that **capture the current correct output
as a regression lock**, plus the fixture and doc updates. **Do NOT change `src/`.** If any assertion
fails during implementation, the bug is in a test literal — not the engine.

S31 is the **many-row** sibling of S25/S26/S29: one `python3 bulk_rename.py` Bash run reads a
**12-row** `many_renames.csv` and applies all twelve whole-word renames across `textutil.py` and
`tests/test_textutil.py`. Both files are HAS-BEACON (the post-script `user-edit` beacon carries the
fully-renamed file), so the engine adopts the renamed state for free. The novelty being locked is
**scale** — twelve renames in one run with no per-row degradation — bracketed by a pre-script Edit
(`normalize`, old-name body) and a post-script Edit (`headline`, new-name body).

## Ground truth (verified live — these are the lock literals)

### Source of expected values
- **Fixture path (S31_JSONL):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s31-script-rename-many-rows/ef17241e-1775-4003-9141-92f5b6f334e7.jsonl`
- **Rendered ground-truth dir (read with `readFileSync`, model on S30):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s31-script-rename-many-rows`
  Files: `textutil.py`, `tests/test_textutil.py`, `many_renames.csv`, `bulk_rename.py`.
  (The sibling store and the worktree's `scenarios/executed/…` copy are byte-identical — verified.)

### conversationDAG / fileDAG (bare CLI, no flags)
```
══ conversationDAG ══
A  prompt  #425f4da2
  B  write      textutil.py       #01M6WBbt
  C  write      test_textutil.py  #01GUHzsE
  D  edit       textutil.py       #0133o9ck
  E  write      many_renames.csv  #01WnQf6y
  F  write      bulk_rename.py    #01Liii6o
  G  user-edit  textutil.py       #98ce2cbf
  H  user-edit  test_textutil.py  #590f882d
  I  edit       textutil.py       #01VPXxeW

══ fileDAG ══
textutil.py
  B  write      #01M6WBbt
  D  edit       #0133o9ck
  G  user-edit  #98ce2cbf
  I  edit       #01VPXxeW
test_textutil.py
  C  write      #01GUHzsE
  H  user-edit  #590f882d
many_renames.csv
  E  write      #01WnQf6y
bulk_rename.py
  F  write      #01Liii6o
```
- **Single surviving branch, no rewinds.** `--list-branches` → `surviving  tip #1349c502` with all four files.

### Revision ladders (verbose; final line counts)
- **textutil.py — 4 revisions:** r0 write (193 L) → r1 edit `normalize` (205 L) → r2 user-edit
  rename beacon (205 L, **complete** — full file) → r3 edit `headline` (218 L). Last kind = `edit`.
- **tests/test_textutil.py — 2 revisions:** r0 write (71 L) → r1 user-edit rename beacon (71 L,
  complete). Last kind = `user-edit`.
- **many_renames.csv — 1 revision:** write (13 L = header + 12 rows).
- **bulk_rename.py — 1 revision:** write (54 L).

### Content anchors (final renamed state)
- `many_renames.csv` rows: `cap,capitalize` `low,lowercase` `up,uppercase` `rev,reverse`
  `trim,trim_whitespace` `pad,pad_right` `cnt,count` `idx,index_of` `rep,replace` `splt,split`
  `joi,join` `slug,slugify`.
- `textutil.py` final `def`s (in order): `capitalize, lowercase, uppercase, reverse,
  trim_whitespace, pad_right, count, index_of, replace, split, join, normalize, slugify, headline`.
- **Pre-script Edit (`normalize`, r1) body is renamed by the script** — final docstring references
  `:func:\`trim_whitespace\`` and `:func:\`lowercase\``, NOT the old `trim`/`low`.
- **Post-script Edit (`headline`, r3) lands on the renamed beacon** — references `:func:\`capitalize\``
  and `:func:\`slugify\`` (the NEW names) and is the only revision adding the `headline` def.
- `tests/test_textutil.py` imports `from textutil import capitalize, reverse, slugify`.
- `bulk_rename.py` prints `OK {} -> {}` per row and `{} OK` summary; renames via
  `re.sub(r"\b" + re.escape(old) + r"\b", new, text)`.

### Whole-word vs substring (assertion hazard — same as S30)
The script renames **whole words only** (`\bold\b`). So:
- 11 of 12 old names have **zero** whole-word occurrences in final `textutil.py`.
- `\bslug\b` legitimately appears **twice** — as English prose inside `headline`'s docstring
  ("…paired with its slug", "…its slug)"), written by the post-script Edit, never a missed rename.
- Test function names keep terse substrings (`def test_cap_basic`, `test_rev_*`, `test_slug_*`)
  because `cap`/`rev`/`slug` there are bounded by `_` (a word char), so `\b…\b` does not match them.
- **All absence assertions MUST use `\bname\b` regex, never bare `includes()`.**

## Tasks (TDD — write tests that pass against the unmodified engine)

> Model both files directly on `tests/reconstruction_engine_s30.test.ts` and
> `tests/reconstruction_cli_s30.test.ts` (same imports, same helpers:
> `finalTextOf`, `historyFinalText`, `historyEndingWith`, `stripTrailingNewline`, `readGroundTruth`).
> Reuse the cross-source check: expected = `readFileSync` of the rendered file with trailing newline
> stripped; actual = engine's `historyFinalText`.

### Task 1 — Fixture
Add to `tests/fixtures.ts`, immediately after `S30_JSONL`:
```ts
export const S31_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s31-script-rename-many-rows/ef17241e-1775-4003-9141-92f5b6f334e7.jsonl";
```

### Task 2 — Engine test `tests/reconstruction_engine_s31.test.ts`
Reconstruct via `reconstructBranches(loadRecords(S31_JSONL), reader?)`. Ground-truth dir constant =
the sibling `s31-script-rename-many-rows` path above. Assertions:
- **T1 — four-file byte-lock:** for each of `textutil.py`, `tests/test_textutil.py`,
  `many_renames.csv`, `bulk_rename.py`, `historyFinalText(history)` === `stripTrailingNewline(readGroundTruth(rel))`.
  (This is the headline lock — it covers the entire many-row rename + both surrounding edits.)
- **T2 — revision ladder:** `textutil.py` has 4 revisions with kinds `[write, edit, user-edit, edit]`
  and final 218 lines; `tests/test_textutil.py` has 2 revisions `[write, user-edit]`, 71 lines;
  `many_renames.csv` 1 `write` (13 lines); `bulk_rename.py` 1 `write` (54 lines).
- **T3 — all 12 renames applied (whole-word):** in final `textutil.py`, assert `0` matches for each
  `\b(cap|low|up|rev|trim|pad|cnt|idx|rep|splt|joi)\b` and **exactly 2** for `\bslug\b`; assert each
  NEW name (`capitalize`…`slugify`) is present.
- **T4 — edit ordering crux:** final `textutil.py` contains `def normalize(` whose body references
  `trim_whitespace` and `lowercase` (pre-script edit renamed by the script), AND `def headline(`
  referencing `capitalize` and `slugify` (post-script edit on the renamed beacon).
- **T5 — reader-independence:** reconstruct a second time with `reader = undefined`; assert the four
  final texts equal the T1 results byte-for-byte. (Proves the clean poison matrix — no backup needed.)
- **T6 — `extractFileEvents`:** assert the event multiset = 4 writes, 3 edits, 2 user-edits, 0
  overwrites (matches the conversationDAG).

### Task 3 — CLI test `tests/reconstruction_cli_s31.test.ts`
Drive `runCli([S31_JSONL, …flags])`. Assertions:
- **C1 — bare graphs:** output contains the conversationDAG block (prompt `#425f4da2`; the two
  `user-edit` lines `#98ce2cbf` textutil.py and `#590f882d` test_textutil.py) and the fileDAG.
- **C2 — `--list-branches`:** one surviving branch, `tip #1349c502`, listing all four files; no
  rewound branch.
- **C3 — `--graphFile`:** `textutil.py` shows exactly 4 nodes `write/edit/user-edit/edit`;
  `test_textutil.py` shows `write/user-edit`; `csv` and `bulk_rename.py` one node each.
- **C4 — verbose textutil.py (`--target … --verbose`):** revision 3 present (no revision 4); body
  contains `def headline(` and `slugify`; whole-word `\btrim\b`/`\blow\b`/`\bcap\b` absent.
- **C5 — verbose test_textutil.py:** revision 1 present (no revision 2); contains
  `from textutil import capitalize, reverse, slugify`.
- **C6 — CSV bytelock:** verbose/diff of `many_renames.csv` contains the 12 mapping rows verbatim
  (e.g. `cap,capitalize` and `slug,slugify`) and the `old,new` header.

### Task 4 — Docs
- `plans/roadmap.md`: append the S31 line (count `424 → <new>`).
- `plans/implementation-notes-api-from-scenarios.md`: prepend the S31 entry (char-lock, many-row
  rename, reader-independent, no src change).
- `plans/reconstruction-engine-design.md`: add the S31 design note after the S29/S30 block.

### Task 5 — Verify
- `npm test` → all green (424 baseline + the new S31 tests, 0 fail).
- `npx tsc --noEmit` → clean.
- `git diff -- src/` shows **no S31 hunks** (only the pre-existing uncommitted S28/S29/S30 deltas).

## Crux / mutation note (optional confidence probe)
There is **no rescue stage** in play here — both beacons are COMPLETE, so `completeTruncatedBeacon`
(S27) and `completeElidedBeacons` (S28) are inert for S31; `seedStaleEditBases` (S19) is inert
(reader-independent). The load-bearing behavior is the ordinary HAS-BEACON path: adopt the post-script
`user-edit` beacon as a full-content revision, then replay the post-script Edit (`headline`) on top of
it. To demonstrate the lock bites, an implementer may temporarily neutralize the user-edit beacon
adoption (or skip the post-script Edit replay) and confirm T1/T4 go RED, then restore byte-clean.
This is optional — the four-file byte-lock (T1) already fails loudly on any regression.

## Commit hygiene (for the implementer)
- Stage **exactly**: `tests/fixtures.ts`, `tests/reconstruction_engine_s31.test.ts`,
  `tests/reconstruction_cli_s31.test.ts`, `plans/roadmap.md`,
  `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`,
  `plans/s31/`. **Never `git add -A`.** Do **not** stage any `src/*` (zero S31 src change), nor
  `src/Plan_template.md` / `src/Impl_template.md`, nor uncommitted S28/S29/S30 files.
- **COORDINATION HAZARD:** the three doc files also carry uncommitted S28/S29/S30 doc edits — confirm
  the commit-split strategy with the user before committing. Commit is **USER-APPROVAL-ONLY**.
- Message: `Implemented S31 handling` + standard Co-Authored-By / Claude-Session trailers.
