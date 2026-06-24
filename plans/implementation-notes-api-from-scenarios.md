## 2026-06-24:15:05:00 — S26 reconstruction (CSV-map multi-file script rename via Bash python3) — COMPLETE; characterization/regression LOCK, NO src change; 371 tests green
Chat title: api-from-scenarios — S26 impl monitor → implement S26 (script-rename-csv-map)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/5f016807-76b4-479c-9871-4efc0ca3b36c.jsonl

### References
- MUST READ: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/script-handling.txt (HAS-BEACON vs NO-BEACON premise)
- Plan: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s26/s26-reconstruction-plan.md
- Handoff (in): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s26/handoff-api-from-scenarios-20260624-1446.md
- S25 LOCK this inverts: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s25/s25-reconstruction-plan.md
- Scenario: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/s26-script-rename-csv-map.txt
- Executed output: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s26-script-rename-csv-map/

### What S26 is
The CSV-map / data-driven variant of S25's multi-file script rename. ONE `python3 apply_renames.py`
Bash run rewrites TWO tracked sources (`billing.py`, `tests/test_billing.py`), but the rename mapping
is READ from a tracked `renames.csv` (header `old,new` + 4 pairs: `calc_tot→calculate_total`,
`fmt_money→format_currency`, `chk_stock→check_stock`, `apply_disc→apply_discount`) rather than
hardcoded in the script. Ladder: Write `billing.py` (terse) + `tests/test_billing.py` → Edit `billing`
+`validate` → Write `renames.csv` → Write `apply_renames.py` then run it with `python3` via the Bash
tool → Edit `billing` +`print_invoice` (uses the renamed `calculate_total`/`format_currency`). The
scenario FORBIDS Edit/Write for the rename — it happens only through the script, so there is NO
Edit/Write tool_use for the rename; the rename is carried by TWO `edited_text_file` beacons (uuids
`298a585d…` billing / `507c3e6b…` test_billing).

### All reader-INDEPENDENT — the inversion of S25
S25's `geo_report.py` had a post-script Edit (`totals`) whose base was the true 95-line disk state
while its beacon was an INCOMPLETE 77-line snapshot → the m6 backup-seed fired (synthetic `overwrite`
keyed `a5675d5dd5201ac8@v4`). S26's `billing.py` ALSO has a post-script Edit (`print_invoice`, step 5),
but its beacon is a COMPLETE 149-line snapshot, so the Edit's recorded base matches it and the splice
is clean (149 → 177) with NO backup-seed and NO `overwrite` revision. Verified live with no reader, a
poison reader, and the real sidecar reader — all three byte-identical for every file:

| File | revisions | reader-INDEPENDENT? |
|---|---|---|
| `billing.py` | 4 [write, edit, userEdit, edit] → 177 ln / 5813 ch | YES (complete beacon; print_invoice splices clean) |
| `tests/test_billing.py` | 2 [write, userEdit] → 60 ln / 1394 ch | YES (complete beacon; no later edits) |
| `renames.csv` | 1 [write] → 5 ln / 106 ch | YES (ordinary Write, the rename map) |
| `apply_renames.py` | 1 [write] → 43 ln / 1125 ch | YES (ordinary Write, the driver) |

This is the first scenario that proves "post-script Edit ⇏ reader-dependent" — only an INCOMPLETE
beacon forces reader-dependence. The m5/m6 `seedEditBaseFromBackup`/`backupSeedWriteFor` reseed stays
DORMANT throughout (no backup is requested), which is exactly what S26 locks.

### Why no engine change
S26 stays inside the S24/S25 HAS-BEACON family. `userEditEventFrom` (reconstruction_user_edit.ts)
reads each `edited_text_file` attachment (changeId = entry.uuid); `collectEventsFromRecord` /
`extractFileEvents` (reconstruction_extract.ts) inject the 2 user-edits alongside the 4 writes / 2
edits (the opaque `python3` run adds nothing); `userEditChangesContent` / `userEditRevision`
(reconstruction_replay.ts) record each beacon as a `user-edit` revision; `applyEdit`
(reconstruction_replay_edit.ts) splices the `validate` and `print_invoice` Edits onto the prior base;
and `seedEditBaseFromBackup` / `backupSeedWriteFor` (reconstruction_sidecar.ts) stay INERT — the
`print_invoice` Edit's base already matches the complete beacon. `git diff src/` is EMPTY.

### The CSV map
S26's new wrinkle vs S24/S25: the rename mapping lives in a tracked DATA file (`renames.csv`) the
script READS, not hardcoded in the script body. Engine Test 5 byte-locks `renames.csv` (5 ln / 106 ch)
and checks all 4 pairs, and confirms `apply_renames.py` references `renames.csv`.

### RED→GREEN liveness (proven, then reverted)
- Engine Test 2: changeId `298a585d…` → `deadbeef…` → RED. Restored.
- Engine Test 2: `S26_BILLING_FINAL` one-char flip (`Small` → `Xmall`) → RED (the 5813 byte-lock bites). Restored.
- Engine Test 3: assert `overwrite` PRESENT (it is absent) → RED (the inverse-of-S25 signature bites). Restored.
- Engine Test 5: `S26_RENAMES_CSV` one-char flip (`old,new` → `old,NEW`) → RED. Restored.
- CLI Test 4: `def print_invoice(` → `def PRINT_INVOICE(` → RED. Restored.
All 12 tests GREEN after each restore; full suite 371/0; `npx tsc --noEmit` clean.

### Deviations
- CLI Test 5 (`test_S26_verbose_test_billing_two_revisions_renamed`): the plan's negative check
  `!block.includes("import calc_tot")` was NOT scoped to the final revision. `--verbose` prints EVERY
  revision, and the terse pre-rename revision 0 of `tests/test_billing.py` legitimately still contains
  `from billing import calc_tot, fmt_money`, so the unscoped check falsely failed RED. Fixed by scoping
  the terse-absence check to the FINAL revision (slice from `revision 1  @`), mirroring the plan's own
  billing.py Test 4 pattern. This is a test-authoring fix consistent with the plan's §2.7 guidance
  ("per-file verbose assertions must be scoped"); the ENGINE is correct (the byte-lock on the renamed
  final revision passes), so NO src change.

### Tradeoffs
- All engine tests are reader-free with a poison guard; NO hermetic backup map is needed (unlike S25's
  `s25Reader`/`S25_GEO_REPORT_BACKUP`) because S26 is fully reader-independent.
- The test-file rename lock uses the renamed import line + call forms, NOT bare tokens, because the
  whole-word rename correctly leaves terse substrings inside test METHOD names (`test_calc_tot_empty`,
  `test_fmt_money_zero`). A bare `!includes("calc_tot")` check would falsely fail.
- CLI tests use the real, inert sidecar reader (the CLI builds it; it is simply never consulted).

### Open questions
- None blocking. Commit is gated on explicit user approval (project rule: one commit per scenario);
  not committed by this session. Next scenario per the plan: `s27-script-rename-edited-before-run`.

## 2026-06-24:14:25:00 — S25 reconstruction (multi-file script rename via Bash python3) — COMPLETE; characterization/regression LOCK, NO src change; 359 tests green
Chat title: api-from-scenarios — S25 impl monitor → implement S25 (script-rename-multi-file)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/52d94dd7-8312-411c-b526-9d6dafb7b47b.jsonl

### References
- MUST READ: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/script-handling.txt (HAS-BEACON vs NO-BEACON premise)
- Plan: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s25/s25-reconstruction-plan.md
- Handoff (in): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s25/handoff-api-from-scenarios-20260624-1409.md
- S24 LOCK this mirrors: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s24/s24-reconstruction-plan.md
- Scenario: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/s25-script-rename-multi-file.txt
- Executed output: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s25-script-rename-multi-file/

### What S25 is
Multi-file extension of S24: ONE `python3 rename_geo.py` Bash run rewrites THREE tracked files at once
(`geo_core.py`, `geo_report.py`, `tests/test_geo_core.py`), a whole-word rename `area→rectangle_area`,
`perim→rectangle_perimeter`, `vol→box_volume`. The scenario forbids Edit/Write for the rename, so the
single opaque run leaves NO tool_use file op and produces ZERO file events (the m3 contrast). What
carries the rename is THREE `edited_text_file` BEACONs (one per file) at `20:02:55.775Z` — the same
S15 disk-echo machinery as S24, firing three times from one Bash run. changeId of each beacon = the
attachment record's own message uuid: geo_report `dd04eabc…`, geo_core `755a78dd…`, test `fcaacf80…`.

### Mixed reader-dependence (the reason S25 exists)
- `geo_core.py` — 8 revs [write,edit,edit,edit,userEdit,edit,edit,edit], rev4 userEdit, → 196 ln /
  5263 ch — reader-INDEPENDENT (complete 169-line beacon; later Edits M,N splice cleanly).
- `tests/test_geo_core.py` — 2 revs [write,userEdit] → 42 ln / 1145 ch — reader-INDEPENDENT (purest
  single-beacon file; write → beacon, no later edits).
- `geo_report.py` — 7 revs [write,edit,edit,userEdit,overwrite,edit,edit] → 120 ln / 3810 ch —
  reader-DEPENDENT. Its beacon (rev3) is an INCOMPLETE 77-line snapshot, but the post-script `totals`
  Edit was computed against the true 95-line disk state. So the m5/m6 backup-seed fires: a synthetic
  `overwrite` rev4 keyed `a5675d5dd5201ac8@v4` (the 95-line disk base, the ONLY backup the engine
  requests) is injected, then the `totals` Edit replays cleanly onto it. WITHOUT a backup the reseed
  can't fire (6 revs, truncated 102-line final — provably WRONG); a poison reader corrupts it (35-line
  final). The `@v4` backup is LOAD-BEARING. FIRST scenario where a HAS-BEACON file still needs the
  backup reader.

### Why no engine change
S25 reuses shipped machinery verbatim: `userEditEventFrom`/`stripLineNumberPrefixes`
(reconstruction_user_edit.ts) detect each beacon; `collectEventsFromRecord`/`extractFileEvents`
(reconstruction_extract.ts) inject the 3 user-edits and ignore the opaque python runs;
`userEditChangesContent`/`userEditRevision` (reconstruction_replay.ts) record each as a user-edit;
`seedEditBaseFromBackup`/`backupSeedWriteFor`/`findBackupPointAfter` (reconstruction_sidecar.ts) reseed
`@v4` for geo_report and stay INERT for geo_core+test; `applyEdit` (reconstruction_replay_edit.ts)
splices the post-rename Edits. The m5/m6 reseed is REUSED, not new — first time it bridges a
beacon→later-Edit gap (vs a rewind/copy).

### The HAS-BEACON refinement
"Beacon alone suffices" (script-handling.txt) governs the post-script revision ITSELF — correctly
established by the beacon, no forward-validation. The base-alignment of a LATER Edit is a separate, m6
concern, solved by a backup-seed (NOT a script transform). So S25 REFINES, does not contradict, the
premise: it needs NO script-execution-replay / forward-validation feature.

### RED→GREEN liveness (proven, then reverted)
Engine: (1) geo_core changeId `755a78dd…`→`deadbeef…` → RED; (2) geo_report overwrite key
`a5675d5dd5201ac8@v4`→`wrong@v9` → RED; (3) geo_report final literal one-char mutation → RED;
(4) Test 5 `notEqual`→`equal` on the no-reader path → RED (proves the `@v4` backup is load-bearing).
CLI: Test 5 `def totals(`→`def TOTALS(` → RED. All restored; final suite 359/0.

### Design decisions
- Engine test: geo_core + test are reader-FREE with a poison guard (mirrors S24); geo_report uses a
  hermetic `@v4` backup map (mirrors m7) so the engine test never touches `~/.claude/file-history`.
- CLI test: uses the REAL CLI (which builds the real sidecar reader), so geo_report reconstructs
  correctly; a `fileVerboseBlock` helper slices each file's `### …/<file>` verbose section because the
  per-file `revision N` numbers overlap (geo_core & geo_report both reach revision 6/7).
- The 4 ground-truth literals (backup 3024, geo_core 5263, geo_report 3810, test 1145 chars) were
  INJECTED byte-for-byte from the rendered files via a one-off generator (placeholder-token
  substitution), never hand-typed, then length-guarded against the plan.

### Deviations
- Engine Test 4 (geo_report crux): the plan reused `geo_core`'s `def <name>(` header check
  (`RENAMED_DEFS`/`TERSE_DEFS`) to verify the rename. That is WRONG for `geo_report.py`: it IMPORTS
  `geo_core` and CALLS `geo_core.rectangle_area(...)` — it never DEFINES area/perim/vol (those headers
  live in geo_core.py). The byte-lock `assert.equal(finalText, S25_GEO_REPORT_FINAL)` passed first, so
  reconstruction is byte-perfect; only the supplementary assertion was wrong. Replaced it with a
  call-site lock: renamed call forms `.rectangle_area(`/`.rectangle_perimeter(`/`.box_volume(` present,
  terse call forms `.area(`/`.perim(`/`.vol(` absent. A bare-word `\barea\b` check is ALSO unsafe: the
  post-rename `totals` docstring legitimately contains the English word "area".
- CLI Test 4 (verbose geo_core): the plan's whole-block terse-absence check
  (`!block.includes("| def area(")`) is wrong because `--verbose` prints EVERY revision, and the terse
  pre-rename revisions (0..3) of geo_core legitimately still contain `def area(`. Scoped the
  renamed-present / terse-absent check to the FINAL revision only (`block.slice(block.indexOf("revision
  7  @"))`) — the meaningful "final rendered state is fully renamed" lock. geo_report/test verbose
  tests are unaffected (those files never DEFINE the terse names).

### Tradeoffs
- Kept the engine/CLI split exactly as the plan specified (6 + 6). The geo_report engine test could
  have used the real reader, but a hermetic backup map keeps the engine test deterministic and
  independent of the developer's `~/.claude/file-history` tree (the m7 precedent).

### Open questions
- None blocking. Commit is gated on explicit user approval (project rule: one commit per scenario);
  nothing is staged. The unrelated `src/Plan_Impl_template.md` edit + new `src/*_template.md` files in
  the tree are NOT part of S25 and must never be staged.

## 2026-06-24:13:46:00 — S24 reconstruction (script-driven function rename via Bash python3) — COMPLETE; characterization/regression LOCK, NO src change; 347 tests green
Chat title: api-from-scenarios — S24 impl monitor → implement S24 (script-rename-functions)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/5a3a589d-9f7d-4cdd-b8ae-15b5a955f226.jsonl

### References
- Plan: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s24/s24-reconstruction-plan.md
- Planning handoff: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s24/handoff-api-from-scenarios-20260624-1330.md
- Scenario script: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/s24-script-rename-functions.txt
- Executed output (JSONL + rendered): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s24-script-rename-functions/
- Sibling HAS-BEACON rule (APPROVED): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/{spec,plan,tasks}-script-execution-replay.md

### What S24 is
A tracked file `order_utils.py` is rewritten by an EXTERNAL `python3 rename_funcs.py` run through the
Bash tool — NOT by Claude's Edit/Write tools (the scenario forbids it). The ladder: Write
`order_utils.py` (149 lines, terse names) → Edit +`validate_items` → Edit +`order_line` → Write
`rename_funcs.py` + run it TWICE with `python3` (whole-word `def` rename calc_tot→calculate_total,
fmt_money→format_currency, chk_stock→check_stock, mk_order→build_order, apply_disc→apply_discount) →
Edit +`print_receipt` → Edit +`apply_loyalty`. `order_utils.py` reconstructs as SIX revisions
[write, edit, edit, userEdit, edit, edit] ending at the 234-line / 6478-char ground truth, byte-
identical to `scenarios/executed/s24-script-rename-functions/order_utils.py`.

### Why no engine change (the reference map I CITED, did NOT modify)
- `src/reconstruction_user_edit.ts` `userEditEventFrom` / `stripLineNumberPrefixes` — reads the
  `attachment.type === edited_text_file` beacon; changeId = `entry.uuid` (→ `859347d2…`, a message
  UUID, not a `toolu_` id); content = the snippet with `N\t` cat-n prefixes stripped.
- `src/reconstruction_extract.ts` `collectEventsFromRecord` / `extractFileEvents` — injects the
  user-edit among tool events, sorted by timestamp. The two `python3` Bash runs yield no tool_use
  file op, so they add nothing.
- `src/reconstruction_replay.ts` `userEditChangesContent` / `userEditRevision` — records the beacon as
  the rev3 `user-edit` ONLY because the renamed content differs from the current (terse) belief.
- `src/reconstruction_replay_edit.ts` `applyEdit` (+ `editBaseIsStale` / `seedStaleEditBases` INERT) —
  H/I's recorded Edit base already matches the renamed belief, so they splice cleanly and the S19/S23
  reseed does NOT fire (six revisions, not seven).

### The HAS-BEACON rule
S24 is the clean-room HAS-BEACON case of the sibling RevEng "Script-Execution-as-Authored-Event" work.
That forward-validation engine exists ONLY for NO-BEACON files (no post-script observation): find the
beacon, rewind observed edits in `(T_exec, beacon]` to get the immediate post-script state, then check
`forward(pre-script) == that state`. S24 never reaches that path: its beacon (the `edited_text_file`
attachment at 20:12:44.611) lands with ZERO intervening edits before it (the Read is 20:12:55, Edit H
is 20:13:03 — both after), so the immediate post-script state is DIRECTLY OBSERVED. The
`api-from-scenarios` engine adopts the beacon as the rev3 user-edit — no transform, no forward-
validation, no `src/` change. I did NOT port the RevEng replay feature — that would be over-
engineering for a file that already has observed truth.

### RED→GREEN liveness (ran, then reverted)
- Engine Test 2: changeId `859347d2…` → `deadbeef…` ⇒ RED (4 pass / 1 fail), restored 5/5.
- Engine Test 4: poison-reader assertion flipped to `.includes("POISONED")` ⇒ RED (4/1), restored 5/5.
- Engine Test 5: one-char change to the 234-line `S24_FINAL` literal ⇒ RED (4/1), restored 5/5.
- CLI Test 1/2: `#859347d2` → `#deadbeef` ⇒ RED (3 pass / 2 fail), restored 5/5.
- CLI Test 4/5: `def calculate_total(` → `def calculate_TOTAL(` ⇒ RED (3/2), restored 5/5.

### Tradeoffs
- Engine tests are reader-FREE (mirroring s22) with a POISON-reader guard (a `BackupReader` returning
  garbage, proven ignored) — this is the regression guard for S24's reader-independence, stronger than
  comparing two real runs. CLI tests use the REAL sidecar reader (mirroring m3/m7) — harmless here
  because S24 is reader-independent.
- The whole-word terse-name check matches `def <name>(` headers, never bare substrings: `apply_disc`
  is a substring of `apply_discount`, so a naive substring check reports a phantom match.

### Deviations
- Plan §6 CLI Test 4/5 asserted the terse `def` headers are ABSENT from the whole `--surviving
  --verbose` dump. That is incorrect: verbose renders EVERY revision (each file section `### <path>`
  with all its revisions), so the terse headers legitimately appear in the early pre-rename revision
  blocks (rev0/1/2). I scoped the "terse absent / renamed present" assertion to the FINAL revision-5
  block (isolated from the unique `revision 5  @` header up to the next `\n### ` file section), which
  is where "terse gone" is genuinely true. The positive renamed-header assertions and the six-revision
  count lock are unchanged. NO `src/` change resulted — this was a test-design correction only. The
  exact-final-byte lock still lives in engine Test 5 (234 lines / 6478 chars / no terse).

### Open questions
- None blocking. S24 appears to be the LAST currently-defined scenario (no `s25-*` / `m8-*` in
  `scenarios/`). Commit is gated on explicit user approval (one commit per scenario; never `git add
  -A`; the pre-existing `src/Plan_Impl_template.md` modification is left OUT of the S24 stage).

## 2026-06-24:10:05:00 — m7 reconstruction (conversation-only rewind, no user edits) — COMPLETE; characterization/regression LOCK, NO src change; 337 tests green
Chat title: api-from-scenarios — m7 impl monitor → implement m7 (conv-rewind-no-user-edits)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/7fb776ae-90c5-443b-8bbd-a5b8072e51a1.jsonl

### References
- Plan: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m7/m7-reconstruction-plan.md
- Gating handoff (m7 plan): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m7/handoff-api-from-scenarios-20260624-0958.md
- Scenario: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/m7-conv-rewind-no-user-edits.txt
- Executed transcript (worktree): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/m7-conv-rewind-no-user-edits/725204e2-8678-4c45-82d0-262557bff0ad.jsonl
- Precedents: tests/reconstruction_engine_m5.test.ts + tests/reconstruction_cli_m5.test.ts (reader-dependent stale-edit-base reseed); tests/reconstruction_engine_s17.test.ts (conv-only rewind + structural rewound branch)
- No-fix reference map (file:line): plan §3 — findConversationBranches/findStructuralRewoundBranches (src/reconstruction_branch.ts:150-168, src/reconstruction_fork.ts), editBaseIsStale/staleEditSeedFor/seedStaleEditBases (src/reconstruction_branches.ts:71,92,108-122), backupSeedWriteFor (src/reconstruction_sidecar.ts), reconstructFileOver reader-gating (src/reconstruction_branches.ts:41-58), born-path resolveContextLine/insertHunkAdditions (src/reconstruction_replay_edit.ts:96-139)

### Design decisions
- NO engine change. m7 is a characterization LOCK: the engine already reconstructs both branches byte-for-byte correct WITH a BackupReader (verified live before coding; baseline 327/0). Added M7_JSONL fixture + 10 tests (5 engine + 5 CLI) + 3 doc edits only.
- The surviving branch is reconstructed WITH an in-memory m7Reader keyed by the backup blob `29a113119f194d6f@v4` (the 10-line off-branch disk base), mirroring the m5/m6 engine-test pattern; the CLI tests use the live ~/.claude/file-history reader (m5/m6 pattern).
- WHY no src change works: the off-branch Claude edits D (step2) and E (step3) are scoped out of the surviving lineage, so the surviving base for F (step2_alt) is the 2-line step1 Write, but F's structuredPatch was computed against the 10-line on-disk file. editBaseIsStale (S23 per-line context walk) detects the stale base; backupSeedWriteFor recovers the 10-line disk from backup @v4, inserted as an `overwrite` revision before F replays. This is the S19/m5 reseed — firing for the FIRST time because of OFF-BRANCH CLAUDE EDITS, not a user edit.
- The reseed backup (@v4, 16:08:12.997) precedes F's edit (16:08:40.473), so findBackupAtOrBefore finds it directly; m7 does NOT exercise m6's includeAfter after-fallback (no assertion on includeAfter for m7).

### Deviations
- Plan §9 asks the completion handoff to name "the next unchecked roadmap line after M7." There is NO next scenario: M7 is the LAST roadmap line and scenarios/ contains only m1–m7 (all now done). The handoff therefore records m7 complete and that no further scenario is defined — nothing to gate a downstream planning monitor on. Surfaced as an open question below.
- None otherwise from the plan. Implemented §4–§8 verbatim. The §5/§6 test code was used as written (enum-member EventKind comparisons, finalTextOf/historyEndingWith accessors, in-memory BackupReader stub).
- Prove-the-lock RED→GREEN steps executed and reverted (all confirmed RED then restored to GREEN):
  - engine test 3: reseed blob `@v4`→`@v3` → RED (actual @v4 ≠ expected @v3); restored.
  - engine test 4: no-reader revision count `2`→`3` → RED (actual 2 ≠ expected 3, reader load-bearing); restored.
  - CLI surviving byte-lock: `def step2_alt():`→`def step2_alt_SENTINEL():` → RED (substring absent); restored.

### Tradeoffs
- Engine tests use an in-memory reader (deterministic, no live-FS dependency) like m5/m6; CLI tests depend on the live backup `29a113119f194d6f@v4` in ~/.claude/file-history/725204e2-…/ (confirmed present). If a surviving verbose ever shows `    return 1\n    return 2`, the live backup is missing — re-sync via /jot:sync-jsonl-projects; do NOT "fix" the engine.
- Surviving correctness is reader-DEPENDENT and locked both directions (with-reader = correct 3-rev 14-line; without-reader = corrupted 2-rev). Rewound is reader-INDEPENDENT and locked byte-identical with/without a reader. m7 is the FIRST scenario reader-independent on one branch and reader-dependent on the other.

### Open questions
- m7 is the final defined scenario (m1–m7 + S1–S23 all implemented). Is the scenario series complete, or is an m8+ planned? The completion handoff names no next scenario because none exists.
- Commit is pending your approval (plan §9 = one commit per scenario after approval). The exact 7-file stage list is ready; nothing has been committed.

## 2026-06-24:09:38:00 — m6 reconstruction (cp-fork + user edit + code rewind on the forked copy) — COMPLETE; REAL ENGINE FIX (first since S19/S23), 2 src files +21/−2; 327 tests green
Chat title: api-from-scenarios — m6 impl monitor → implement m6 (cp-user-edit-rewind)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/17cd387d-e9df-47e6-88a1-98adee8edcdd.jsonl

### References
- Plan file (authoritative, executed verbatim): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m6/m6-reconstruction-plan.md
- Planning handoff that gated this impl: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m6/handoff-api-from-scenarios-20260624-0930.md
- Scenario script: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/m6-cp-user-edit-rewind.txt
- Executed transcript (worktree): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl
- Fixture (Desktop suite root): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl
- THE FIX: src/reconstruction_sidecar.ts `findBackupPointAfter` (new helper after `findBackupAtOrBefore`) + `backupSeedWriteFor(includeAfter)` after-fallback; src/reconstruction_branches.ts:101 `staleEditSeedFor` passes `true`
- Bug locus (unchanged): src/reconstruction_replay_edit.ts:113 `insertHunkAdditions` (carries context by index; :96 `resolveContextLine` materialises the past-the-base context line as the duplicate)
- Stale-base detection (unchanged, correctly fired): src/reconstruction_branches.ts:71 `editBaseIsStale`, :92 `staleEditSeedFor`

### Design decisions
- The fix reuses the existing S19/S23 stale-edit reseed machinery and only broadens WHERE it looks for the pre-edit backup. The new `findBackupPointAfter` is the BackupPoint variant of the existing `findBackupAfter` (the seed needs the snapshot's `backupTime`, not just the blob name).
- The fallback is gated behind a new `includeAfter` parameter (default `false`) on `backupSeedWriteFor`, and only `staleEditSeedFor` passes `true`. The fallback fires ONLY when `findBackupAtOrBefore` returns undefined (`??`), so every existing reseed (m5/S19/S23, all of which have an at-or-before backup) is byte-for-byte unchanged.
- Added 2 sidecar unit tests beside `test_seed_passes_through_when_no_backup_precedes_the_edit` (the existing at-or-before lock): one proving the includeAfter fallback fires, one proving at-or-before still wins when both backups exist (locks the `??` precedence).

### Deviations
- None. §4.1 and §4.2 applied exactly; §5 Tasks 1–7 followed verbatim. The `reconstruction_branches.ts` change is the planned net-zero one-call edit (file held at the 250-line cap; all explanatory comments live in `reconstruction_sidecar.ts`, which has room).

### Tradeoffs
- Scoping via the `includeAfter` flag vs. a blanket after-fallback in `backupSeedWriteFor`: the blanket version breaks `test_seed_passes_through_when_no_backup_precedes_the_edit` (spec-39 first-event-edit MUST NOT seed from a later backup). The flag keeps both call sites correct — confirmed by that test staying green.

### Open questions
- None outstanding. Committing is gated on user approval (Task 8). The four shared docs (`tests/fixtures.ts`, `plans/roadmap.md`, this file, `plans/reconstruction-engine-design.md`) carry uncommitted m2–m5 edits, so any commit must stage the exact m6 file list — never `git add -A`, never `git checkout`/`restore` the shared docs.

## 2026-06-24:08:39:32 — m5 reconstruction (full interleave: user+agent edits across a code rewind, backup-recovered user_add_2) — COMPLETE; characterization/regression LOCK, NO src change; 315 tests green
Chat title: api-from-scenarios — m5 impl monitor → implement m5 (full-interleave)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/059abe45-cdbf-4f0c-a645-d8f65587274d.jsonl

### References
- Plan file (authoritative, executed verbatim): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m5/m5-reconstruction-plan.md
- Planning handoff that gated this impl: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m5/handoff-api-from-scenarios-20260624-0833.md
- Scenario script: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/m5-full-interleave.txt
- Executed transcript (worktree): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl
- Fixture (Desktop suite root): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl
- THE CRUX — S19 reseed (FIRES here): src/reconstruction_branches.ts:41-57 (`reconstructFileOver`/`seedStaleEditBases`), :61-65 (`reconstructedBaseText`), :71-88 (`editBaseIsStale`, base-too-short case), :92-102 (`staleEditSeedFor`); src/reconstruction_sidecar.ts:115 (`backupSeedWriteFor` recovers `@v5`)
- Branch enumeration / rewound scoping: src/reconstruction_engine.ts:206-218 (`reconstructBranches`), :222-242 (`buildRewoundBranchHistory`/`divergingIds`); src/reconstruction_branch.ts:37-59 (`findSurvivingHead`, simple path), :75-102 (`findRewindPoint`), :150-183 (`findConversationBranches`/`selectBranchRecords`)
- user-edit recorded as a real revision: src/reconstruction_replay.ts:124-134 (`userEditChangesContent`); vocabulary src/structures/vocabulary.ts:102-110

### Design decisions
- Engine tests use an IN-MEMORY `BackupReader` (`m5Reader`) seeded with the single `17bbea89afb745a4@v5` blob — mirrors `tests/reconstruction_engine_m3.test.ts`/`_s5`, so the engine lock is independent of the live `~/.claude/file-history` tree.
- CLI tests drive `runCli`'s REAL on-disk sidecar reader; tests 4–5 (surviving-verbose) depend on that backup resolving on the host (the same hazard m3's CLI tests accept). All 5 CLI tests were GREEN on the first run, so the live backup resolves on this machine.
- `historyEndingWith` suffixes lead with a slash (`/m5_interleave.py`) because `test_m5_interleave.py` also ends with `m5_interleave.py` — a slash-less suffix would match the wrong file.

### Deviations
- None. The plan's 10 test bodies, the fixture block, and the 3 doc edits were applied verbatim. NO `src/` change (`git diff src/` empty). No engine machinery was touched.

### Tradeoffs
- Implemented sequentially in this session rather than via subagents: every write target is a SHARED file (`tests/fixtures.ts` + the 3 docs already carry uncommitted m2/m3/m4 edits), so parallel agents would contend on the same files. Sequential edits avoid the worktree-shared-doc hazard the plan flags.

### Open questions
- None blocking. Commit is intentionally withheld pending user approval (plan §9). The completion handoff (naming m6) is the remaining required deliverable.

### Prove-the-lock RED→GREEN log (each flip confirmed RED, then restored)
- engine test 2 (crux): `seeded.kind` flipped to `EventKind.write` → RED `actual='overwrite', expected='write'`; restored to `EventKind.overwrite`.
- engine test 3 (reader-dependence): no-reader `revisions.length` flipped to `4` → RED `actual=3, expected=4`; restored to `3` (proves the reader injects the 4th `@v5` revision).
- CLI test 4 (backup-recovery byte-lock): injected `user2SENTINEL` into the `@v5` 4-line block → RED (`includes` false); restored.
- CLI test 5 (final ground-truth byte-lock): renamed `agent_add_2` → `agent_add_2_SENTINEL` in the 5-line block → RED (`includes` false); restored.

## 2026-06-24:08:05:00 — m4 reconstruction (delete then recreate at the same path) — COMPLETE; characterization/regression LOCK, NO src change; 305 tests green
Chat title: api-from-scenarios — m4 impl monitor → implement m4 (delete-recreate)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/2e8b966a-b7ab-4da5-b2b4-9cd17d2f9485.jsonl

### References
- Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m4/m4-reconstruction-plan.md
- Planning handoff that gated this impl: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m4/handoff-api-from-scenarios-20260624-0757.md
- Scenario script: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/m4-delete-recreate.txt
- Executed transcript (worktree): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/m4-delete-recreate/c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl
- Engine vocabulary: src/structures/vocabulary.ts:103 (`EventKind.delete`)
- Delete extraction: src/reconstruction_extract.ts:39-45 (`parseRmTarget`), :91-100 (`bashEventFrom`), :163-164 (dispatch)
- Delete replay: src/reconstruction_replay.ts:55-62 (`deleteRevision`), :144-147 (dispatch)
- CRUX (born-fresh recreate): src/reconstruction_replay_edit.ts:30-35 (`fileIsPresent` — "locked decision 3"); src/reconstruction_replay.ts:43-53 (`writeRevision`), :140-142 (dispatch)
- Render: src/reconstruction_render.ts:36-42 (`(file absent — 0 lines)` em-dash literal)
- Precedent: tests/reconstruction_engine.test.ts:30-85 (S1 terminal delete); :103 (paired edit lock); tests/reconstruction_replay.test.ts:50-71 (overwrite-vs-create inverse branch)

### Design decisions
NO engine change. The existing machinery already produces m4's ground truth byte-for-byte. Decisions documented in §3 of the plan:
- Delete extraction (`parseRmTarget`/`bashEventFrom`) emits a content-less `DeleteEvent`; `deleteRevision` produces an empty 0-line revision stamped at the rm time — the same S1 path, here NON-terminal for the first time.
- Born-fresh recreate ("locked decision 3"): `writeRevision` builds an unconditional all-genesis full-content revision; `fileIsPresent` returns false when the latest revision is a delete, so the post-delete Write is labelled `EventKind.write` (a create), NOT `EventKind.overwrite`, and carries NONE of the pre-delete v1/v1_helper lineage. m4 is the FIRST fixture to drive this delete-branch (the inverse of `test_second_write_to_a_present_file_is_an_overwrite`).
- Edit pair: the sibling test's single Edit becomes the engine's standard removal+addition pair (both halves sharing the one Edit's changeId); the pre-delete Edit on the source is `+`-only so it yields a single addition revision (rev 1, 6 lines).
- Reader-free (m2 pattern): no bash redirect events, so engine tests call `reconstructAll(loadRecords(M4_JSONL))` with NO reader, and the CLI tests pass no reader (the CLI builds its own sidecar reader which simply resolves unused).

### Deviations
None. Plan §5/§6 test code was used verbatim. All prove-the-lock RED→GREEN cycles ran clean:
- Engine A (`recreate.kind`): flipped `EventKind.write` → `EventKind.overwrite` → RED with `actual='write', expected='overwrite'` (proves `fileIsPresent` saw the trailing delete and labelled the recreate a fresh create). Restored.
- Engine B (`delete revision lines.length`): flipped `0` → `1` → RED with `actual=0, expected=1` (proves the non-terminal delete revision is empty). Restored.
- CLI C (recreate v2 sentinel): flipped `def v2():` → `def v2_SENTINEL():` → RED (sentinel appears nowhere in the rendered output). Restored.
- CLI D (file-absent sentinel): appended `SENTINEL` inside the `(file absent — 0 lines)` literal → RED. Restored.

### Tradeoffs
- Engine tests are reader-free (m2/m3 idiom) rather than wiring an in-memory backup map — m4 needs no backup recovery (all content is inline or as Edit `originalFile` bases), so the test signature stays minimal.
- The born-fresh property is locked at BOTH levels: the engine test asserts `recreate.kind === EventKind.write` AND every line is `DOES_NOT_EXIST_YET` genesis; the CLI test asserts the rendered v2 block carries only the 2-line v2 content (no carried `v1`/`v1_helper`). Either layer alone would catch a regression, but the double-coverage matches the m1/m2/m3 char-lock style.

### Open questions
None. Plan was complete and accurate; all acceptance criteria met without escalation.

## 2026-06-24:07:30:00 — m3 reconstruction (bash-redirect interleaved with an edit) — COMPLETE; characterization/regression LOCK, NO src change; 296 tests green
Chat title: api-from-scenarios — m3 impl monitor → implement m3 (bash-redirect)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/c54f9594-53d3-4e10-9496-d16a79e04585.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m3/m3-reconstruction-plan.md (THE authoritative plan, executed verbatim)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m3/handoff-api-from-scenarios-20260624-0025.md (planning handoff that gated this impl)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/m3-bash-redirect.txt (scenario script)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl (worktree copy of executed transcript)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl (Desktop fixture path used by tests)
- Engine reference map (no change needed): `parseRedirect` (src/reconstruction_extract.ts — redirect branch, spec 26) emits a content-less AppendEvent; `fillRedirectContent`/`findBackupAfter` (src/reconstruction_sidecar.ts:60-71,139-157 — specs 25, 27) recover @v3 / @v5 via the injected BackupReader; `appendRevision` (src/reconstruction_replay_edit.ts:145-169 — specs 24, 28) carries the file forward and births the recovered tail; `applyEdit` (src/reconstruction_replay_edit.ts:174-187) emits the standard removal+addition pair, locked by tests/reconstruction_engine.test.ts:103; `seedStaleEditBases`/`editBaseIsStale` (src/reconstruction_branches.ts:60-122) stay INERT because the Edit's recorded base aligns with the reconstructed append revision.

### Design decisions
- **NO engine change.** The engine reconstructs m3 byte-for-byte correct already (verified live by the planning session against the CLI; re-verified here by running the engine + CLI test files — all 9 GREEN on first run). m3 is a characterization/regression LOCK, mirroring m1/m2/S20/S21/S22 — not a real fix (unlike S19/S23).
- **Three existing guarantees composed for the first time:** (a) redirect recovery — `parseRedirect` emits content-less AppendEvents for both `>>` events, and `fillRedirectContent` recovers `line two` from backup `936191f45d79faed@v3` and `line three` from `@v5` via the injected `BackupReader`. (b) Paired edit — `applyEdit` emits the standard two revisions for the Edit (removal: `line one` dropped leaving the appended `line two`; addition: `LINE ONE`/`line two`), here for the first time spliced on top of a base produced by a backup-recovered append. (c) Reseed dormancy — the Edit's recorded base (`line one\nline two\n`) matches the reconstructed append revision exactly, so `editBaseIsStale` is false and `seedStaleEditBases` injects no synthetic Write. Net: exactly five revisions (one write revision), not six.
- **Engine tests wire an in-memory BackupReader (unlike m2, which is reader-free).** m3's `>>` redirects carry no content in the JSONL; the engine recovers the appended chunks from `~/.claude/file-history` blobs. The reader-wired pattern mirrors `tests/reconstruction_engine_s5.test.ts:11-16`. The in-memory map includes all four observed blobs (@v2, @v3, @v4, @v5) so the test is robust to which name the engine queries (it queries @v3 + @v5).
- **CLI tests pass NO reader.** `runCli` builds its own real on-disk sidecar reader internally (`buildSidecarReader` → `createSidecarReader(sessionId, getDefaultFileHistoryRoot())`, src/reconstruction_cli.ts:114-122,189), so the CLI tests exercise the real `~/.claude/file-history` blobs end-to-end for session `0a7f5fa5-deda-4208-823e-1cfe7d650a74`.
- **m3's novelty:** FIRST scenario to interleave an Edit between two bash `>>` redirects on one file. FIRST proof that the S23 per-line `editBaseIsStale` walk does NOT false-positive when the edit's recorded base was produced by a backup-recovered append (the dormant complement of S19/S23, where it fires).

### Deviations
- None from the plan's literal test code. All 9 tests GREEN on first run.
- Prove-the-lock RED→GREEN flips per plan §5/§6 ran clean and were all restored:
  - Engine `test_m3_edit_is_paired_removal_then_addition_over_appended_base`: flipped removal expectation `"line two"` → `"line one"` → RED (actual `"line two"`, expected `"line one"`), restored.
  - Engine `test_m3_aligned_edit_base_keeps_reseed_inert_single_write_revision`: flipped `writeRevisions.length, 1` → `2` → RED (actual `1`, expected `2`), restored.
  - CLI `test_m3_surviving_verbose_appends_recover_backup_content_to_ground_truth`: flipped `line three` → `line THREE-SENTINEL` (per plan §6 sentinel guidance — avoid reusing `(1 lines)`/`(2 lines)` which recur across blocks) → RED (`assert.ok(... includes ...)` returned `false`), restored.

### Tradeoffs
- Engine tests are reader-WIRED (in-memory `M3_BACKUPS` map per s5) vs reader-free (m2). m3 cannot test redirect recovery without the reader because the JSONL carries no content for `>>` events. CLI tests use the real on-disk reader to verify end-to-end recovery from the actual file-history blobs.
- Sentinel for prove-the-lock CLI flip: chose `line THREE-SENTINEL` (per plan §6 / m2 handoff lesson) — a substring guaranteed to appear nowhere else in the verbose output, unlike `(N lines)` which recurs across revision blocks.

### Open questions
- None. The no-fix premise held (all 9 tests GREEN on first run, both prove-the-lock crux assertions confirmed to bite). Commit is gated on user approval per project rule (one commit per scenario, staged file list per plan §9).

## 2026-06-24:00:05:00 — m2 reconstruction (mv-rename: edit, rename, then edit the renamed file) — COMPLETE; characterization/regression LOCK, NO src change; 287 tests green
Chat title: api-from-scenarios — m2 impl monitor → implement m2 (mv-rename)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/dee18a44-0c90-433f-ab40-6c32f5544dca.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m2/m2-reconstruction-plan.md (THE authoritative plan executed verbatim)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m1/m1-reconstruction-plan.md (m1 cp-fork — the prior scenario; m2 is its rename twin)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/m2-mv-rename.txt (scenario script)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m2-mv-rename/70c5989e-017b-425f-8a8b-89daec0c4528.jsonl (executed transcript / fixture)
- Engine reference map (no change needed): `parseMvPaths`/`bashEventFrom` (src/reconstruction_extract.ts:49,91-107); `buildRenameChain`/`resolveFinalPath`/`contentPathOf`/`eventBelongsToLineage` (src/reconstruction_lineage.ts:11-51); `distinctFinalPaths` (src/reconstruction_lineage.ts:53-65); `renameRevision`/`lastLinesOf`/`carryAt` (src/reconstruction_replay.ts:64-78, src/reconstruction_replay_edit.ts:38-46); applied in `reconstructFileOver`/`reconstructFilesOver` (src/reconstruction_branches.ts:41-58,189-195).

### Design decisions
- **NO engine change.** The engine reconstructs m2 byte-for-byte correct already (verified live via the CLI on the worktree JSONL BEFORE writing tests, and against the final content in plan §2.3). m2 is a characterization/regression LOCK, mirroring m1/S20/S21/S22 — not a real fix (unlike S19/S23).
- **One-history merge across the rename:** `buildRenameChain`/`resolveFinalPath`/`eventBelongsToLineage` fold the old-path write (B) + edit (D), the rename (E), and the new-path edit (F) into a SINGLE `m2_new_name.py` lineage — a four-revision history (write→edit→rename→edit).
- **Pre-rename content carried:** `renameRevision` carries the prior revision's lines (`process+validate`, 6 lines) forward via `lastLinesOf`/`carryAt`, so the post-rename `finalize` edit (F) composes on top of the carried content → final 10 lines.
- **Old path collapses:** `distinctFinalPaths` resolves the rename source to its destination, so `m2_old_name.py` is never a separate surviving history; `reconstructAll` returns exactly TWO histories (`m2_new_name.py` + the test file) and `--list-branches` omits the old name.
- **m2's novelty:** FIRST rename scenario edited on BOTH sides of the rename — generalises the S2 move lineage ("edit only AFTER the move") to "edit on both sides". The rename twin of m1's cp-fork.

### Deviations
- **Plan §6 prove-the-lock flip is flawed; substituted a valid sentinel.** The plan said to flip the CLI crux `(6 lines)` → `(2 lines)` to confirm RED. That does NOT go RED: `(2 lines)` legitimately appears in `--surviving --verbose` as revision 0 (the 2-line `process` write), so `out.includes("(2 lines)")` still matches. I instead flipped to an absent sentinel `(99 lines)` to prove the assertion bites (confirmed RED, `actual: false`), then restored `(6 lines)`.
- Engine prove-the-lock per plan §5 was valid as written: flipped `OLD_AT_RENAME` → `MERGED_FINAL` → `test_m2_pre_rename_edit_is_carried_across_rename…` went RED (`actual` = pre-rename process+validate, distinct from the final), then restored.

### Tradeoffs
- Engine tests are **reader-free** (`reconstructAll(loadRecords(M2_JSONL))` with no `BackupReader`) — m2 needs no file-history sidecar: a rename is recovered entirely from the JSONL mv command (from/to paths) and the carried content is inline. (Contrast bash `>`/`>>` redirects, which DO need the sidecar.) The CLI builds its own real reader internally and is unaffected.

### Open questions
- None. The no-fix premise held (all 9 tests GREEN on first run); commit is gated on user approval per project rule (one commit per scenario).

## 2026-06-23:23:46:00 — m1 reconstruction (cp-fork: copy then independent edits to both files) — COMPLETE; characterization/regression LOCK, NO src change; 278 tests green
Chat title: api-from-scenarios — m1 impl monitor → implement m1 (cp-fork)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/cbeb9820-ab83-4daa-9a4a-dfa04711cfbf.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m1/m1-reconstruction-plan.md (THE authoritative plan executed verbatim)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m1/handoff-api-from-scenarios-20260623-2340.md (the planning handoff that gated this implementation)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/src/reconstruction_branches.ts (lines 139-156: `seedOneCopy` → `lastRevisionAtOrBefore`, the copy-time snapshot — READ-ONLY, not edited)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/src/reconstruction_lineage.ts (lines 9-15, 33-52: copy excluded from the rename chain; source/copy stay independent — READ-ONLY)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/src/reconstruction_graph.ts (lines 76-81, 108-123: copy keyed to its destination via `contentPathOf`/`turnTarget` — READ-ONLY)

### Design decisions
- NO engine change. m1 was implemented as a characterization/regression LOCK (like S20/S21/S22), not a fix (unlike S19/S23). The plan verified live that the engine reconstructs all three m1 files byte-for-byte correct before any test was written; the new tests pin that behaviour.
- Why correct already: (1) copy-time snapshot — `seedOneCopy` seeds the fork from `lastRevisionAtOrBefore(sourceRevisions, cpTimestamp)`, so `m1_fork.py` is born as `m1_base.py` AS OF the `cp` moment (init+enable_debug, 7 lines), and the base's later `disable_all` cannot leak in; (2) per-path independence — the copy event is keyed to its destination path and excluded from the rename chain (`buildRenameChain` follows only `EventKind.rename`), so `m1_base.py` and `m1_fork.py` stay two histories. Reconstructing the base filters the copy event OUT; reconstructing the fork keeps copy+its own edit and drops the base's `disable_all`.
- m1 is the FIRST file-level fork (all of S7–S23 forked the conversation) and the FIRST scenario to edit BOTH the source and the copy after a `cp` (S3 only edited the copy). It is linear — one surviving branch (tip #3740a519), no rewound branch.

### Deviations
- None from the plan's instructions. The 9 tests were written verbatim from plan §5/§6 and all passed GREEN on first run (engine + CLI), confirming the no-fix premise.
- Prove-the-lock RED→GREEN proof (plan §5 step 2): temporarily flipped the crux engine assertion from `BASE_AT_COPY` to `BASE_FINAL`; `test_m1_fork_born_as_copy_of_base_at_copy_time…` went RED with `actual` = the 7-line base@copy text and `expected` = the 11-line base-final text (proving the test distinguishes copy-time from final content). Restored `BASE_AT_COPY`; re-ran → 4/4 GREEN. The CLI crux line-counts (`(7 lines)` copy / `(10 lines)` fork-final / `(11 lines)` base-final) are the regression signal.

### Tradeoffs
- Engine tests run reader-free (no `BackupReader`) because m1's copy seeding reconstructs the source inline; no file-history sidecar is needed (mirrors S22). The CLI builds its own real reader internally and is unaffected. Considered passing a backup map for parity with S19/S23 — rejected as unnecessary and misleading (m1 has no stale-edit base).

### Open questions
- None.

## 2026-06-23:23:10:00 — S23 reconstruction (two user edits across a CODE rewind) — COMPLETE; REAL production-code change (first since S19); 269 tests green
Chat title: api-from-scenarios — S23 impl monitor → implement S23 (user-edits-code-rewind)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/04c4acc5-cf42-4a1b-802c-831311d8fa74.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s23/s23-reconstruction-plan.md (THE authoritative plan executed; contains the verified fix code)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-2259.md (the S23 IMPLEMENT handoff that gated this session)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s19/ (the conv-rewind twin where `seedStaleEditBases`/`backupSeedWriteFor` were born; S23 generalises the staleness predicate that feeds them)

### Design decisions
- REAL `src/` change, ONE file: generalised `editBaseIsStale` (`src/reconstruction_branches.ts`) from a length-overflow check (`oldStart-1 > baseLength`) to a per-line context-match walk against the reconstructed base, plus a small `reconstructedBaseText` accessor. Once `editBaseIsStale` returns true for G, the existing `staleEditSeedFor`/`seedStaleEditBases`/`backupSeedWriteFor` pipeline (unchanged) reseeds the `…@v5` backup as a synthetic overwrite before G.
- Engine test uses an in-memory `BackupReader` supplying only the v5 blob (init+size+push) that G's seed reads (v4 included for completeness), mirroring the S19 engine test. CLI tests use the real on-disk file-history reader built inside `runCli` (the v5 blob is present on disk at `~/.claude/file-history/2bb895d4-…/`).
- Key locks: the surviving 4-revision seeded ladder (write→userEdit→overwrite→edit, rev2 = the 5-line v5 seed), the regression byte-lock (size on line 4, a SINGLE push on line 5 — the unfixed engine dropped size and duplicated push), and the rewound-branch reconstruction (5-line init+push+pop).

### Deviations
- Plan §Task 4 noted `branched.rewound`'s shape "is `FileHistory[]`"; in practice `reconstructBranches` returns `rewound: RewoundBranchHistory[]`, each wrapping `.histories: FileHistory[]`. The rewound test therefore selects the rewound branch by tip (`e62d73ad`) and reads `.histories` rather than passing `branched.rewound` directly to `historyEndingWith`. Result is identical; only the access path differs.

### Tradeoffs
- The fix is strictly more conservative than the old check: for an ALIGNED edit every context/removed line equals the base line at its index, so the loop never returns true and the lineage passes through unchanged (S1–S22 byte-for-byte unaffected, verified by 260 → all-green). The S19 length-overflow case (`index >= base.length`) is now a special case of the same walk, so S19 still seeds its v3 base.

### Open questions
- None blocking. `src/reconstruction_branches.ts` lands at exactly 250 lines (the cap); the `editBaseIsStale` doc comment was kept to four lines per the plan. A future change needing more room must split a helper into a new module rather than condense (the project's "split, never condense" rule).

## 2026-06-23:22:30:00 — S22 reconstruction (two user edits across a conversation rewind) — COMPLETE; characterization/regression LOCK, no production-code change; 260 tests green
Chat title: api-from-scenarios — S22 impl monitor → implement S22 (user-edits-conv-rewind)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/8e7ceadb-0426-4adb-83e3-d50d13f3b81c.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s22/s22-reconstruction-plan.md (THE authoritative plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-2225.md (the S22 IMPLEMENT handoff that gated this session)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s19/ (the conv-rewind twin where the reseed is ACTIVE); plans/s18/, plans/s21/ (the linear user-edit twins)

### Design decisions
- NO `src/` change. The S19+S20+S21 engine already reconstructs S22 byte-identically WITH and WITHOUT a reader: S15's `userEditChangesContent` records both user edits (D/F), and the conv-only rewind leaves push+pop on disk so F's snapshot absorbs them; the S19 reseed stays inert (F is a user-edit; G's base is aligned).
- Added `S22_JSONL` fixture + `tests/reconstruction_engine_s22.test.ts` (4) + `tests/reconstruction_cli_s22.test.ts` (5).
- Key locks: the surviving 3-revision absorption test (rev1 = 6 lines, no seed), the rewound-branch reconstruction test (5-line init+push+pop), and the two-user-edits extraction test.

### Deviations
- None. All 9 tests GREEN on arrival (no RED phase). CLI whitespace re-captured live before finalizing the CLI test and matched the plan's verbatim strings exactly. `git diff src/` confirmed empty.

### Tradeoffs
- Engine tests use NO BackupReader (user-edit content, including the absorbed off-branch push/pop in F's snapshot, is self-contained in the JSONL attachment), unlike S20 which supplied an in-memory reader. Verified that the no-reader reconstruction is byte-identical, so the reseed is provably inert.

### Open questions
- None blocking.

## 2026-06-23:22:08:00 — S21 reconstruction (multiple interleaved user edits, no rewind) — COMPLETE; characterization/regression LOCK, no production-code change; 251 tests green
Chat title: api-from-scenarios — S21 impl monitor → implement S21 (multiple-user-edits)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/caa8005d-217f-4064-9949-e313b604bc33.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s21/s21-reconstruction-plan.md (THE authoritative plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-2200.md (S21 handoff that gated this implementation)
- plans/s18/… and plans/s20/… (the no-rewind user-edit + reseed-dormancy twins)

### Design decisions
- NO `src/` change. The S19+S20 engine already reconstructs S21 byte-identically: S15's `userEditChangesContent` records all three user edits (D/F/H), and S19's `editBaseIsStale` is false for the aligned edits E/G so `seedStaleEditBases` never fires.
- Added `S21_JSONL` fixture + `tests/reconstruction_engine_s21.test.ts` (4) + `tests/reconstruction_cli_s21.test.ts` (5).
- Key lock: the 6-revision alternating-kind test + the "three user-edits among two edits and two writes" extraction test prove the multi-user-edit interleaving and the reseed dormancy.

### Deviations
- Dropped the unused `reconstructAll` import from the engine test (the plan's verbatim block copied it from the S18 template, which DOES call it; the S21 tests use only `reconstructBranches`). Removed to keep the file free of dead code; tsc stays clean either way (project sets `strict` but not `noUnusedLocals`).
- CLI whitespace was re-captured live before finalizing — every asserted substring matched the plan verbatim; no string edits needed.
- `git diff src/` is NOT empty, but the only change is `src/Plan_Impl_template.md` (a markdown orchestration template) — a PRE-EXISTING uncommitted edit unrelated to S21, not touched by this work. No `src/*.ts` source changed, so the S21 "no engine change" gate holds. The template is NOT part of the S21 commit (staging is the 7 listed files only).

### Tradeoffs
- Engine tests use NO BackupReader (user-edit content is self-contained in the JSONL attachment), unlike S20 which supplied an in-memory reader to keep the reseed path active.

### Open questions
- None blocking.

## 2026-06-23:21:50:00 — S20 reconstruction (multi-edit user-edit then CODE rewind, then a post-rewind RE-EDIT) — COMPLETE as a characterization/regression lock; NO production-code change; 242 tests green
Chat title: api-from-scenarios — S20 impl monitor → implement S20 (user-edit-code-rewind)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/19d63a17-b3be-471b-ae3b-3564955ad4cc.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s20/s20-reconstruction-plan.md (THE authoritative plan executed — verbatim test code + verified ground truth)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s19/s19-reconstruction-plan.md (S19 — the conversation-rewind twin whose `seedStaleEditBases` reseed S20 proves stays inert)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s15/s15-reconstruction-plan.md (S15 — the content-aware `userEditChangesContent` guard that records F on the surviving branch)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/s20-user-edit-code-rewind.txt (the scenario script driving the captured JSONL)

### Design decisions
- **No production-code change — S20 was already reconstructed byte-for-byte correctly by the shipped engine; this slice LOCKS that with tests + docs.** Final state = **242 pass / 0 fail** (233 baseline + 9 new: 4 engine + 5 CLI), `npx tsc --noEmit` clean, filesize sweep clean (new test files 105 / 56 lines), `git diff src/` EMPTY.
- **S20 is the code-rewind twin of S19.** B writes `scenario20.py` (`add`) + the test C; the user edits `scenario20.py` out-of-band (`# user tweak`, D); E (Claude) adds `subtract` anchored on the user content; the user rewinds (`Rewind: 2, code`) to the original prompt; Claude reads the file then G adds `multiply` on the surviving branch. D + E land on the REWOUND branch (tip #51227411, rewind @ #e76a23d3); the CODE rewind reverts the file on disk and Claude Code's checkpoint re-write surfaces as a synthetic `edited_text_file` (user-edit F) on the SURVIVING branch (tip #cacc87c7).
- **Why the engine is already correct (read-only references — not modified):** the code-rewind restore F is recorded by the S15 content-aware guard (`userEditChangesContent`, `reconstruction_replay.ts`), which advances the surviving base to the full 3-line disk state (`add` + `# user tweak`). G's `multiply` hunk (`oldStart=1, oldLines=3`) was computed against exactly that base, so it is ALIGNED — `editBaseIsStale` (`reconstruction_branches.ts`) is false, and the S19 `seedStaleEditBases` reseed is INERT (no synthetic overwrite spliced). Contrast S19: there the rewind was conversation-only, the user-edit stayed off the surviving branch, the base was too short, and the reseed had to fire.
- **S20 is the FIRST scenario carrying a `user-edit` on BOTH branches** — D (the real human edit) on the rewound branch, F (the code-rewind restore echo) on the surviving branch. The assertions lock that both user-edits appear in the conversationDAG/fileDAG.
- **Engine test 3 is the regression guard.** `test_S20_surviving_file_has_three_revisions_and_no_synthetic_seed` asserts the surviving scenario20.py is exactly 3 revisions with kinds `[write, userEdit, edit]`. If a future change made the S19 reseed mis-fire on an aligned base, a 4th `overwrite` revision would appear and this test would go RED. The `s20Reader` supplies v2/v4 backup blobs so the reseed code path is ACTIVE and provably dormant (not skipped because the reader is empty).

### Deviations
- **The plan's "confirm `git diff src/` is empty" check (Task 4) reads non-empty here, but S20 still touches NO source.** The diff shows `src/reconstruction_branches.ts` + `src/reconstruction_sidecar.ts` — these are S19's fix, which is UNCOMMITTED in this worktree (S19's own test files are also untracked). The plan assumed S19 had been committed. Verified S20 edited zero src files: the diff's only two paths are exactly S19's two fix files, and no `src/` Edit/Write was performed for S20. The 242-green baseline already included S19's uncommitted fix in the working tree.
- **Otherwise none.** Unlike S19 (whose CLI verbose test had to be rewritten from raw substrings to line-position assertions), the S20 plan's assertion strings were already line-position / substring forms; every assertion matched the live CLI output verbatim with no edits. The `# user tweak` on line 3 (no blank before it) is the S20-vs-S19 inversion — in S19 `subtract` sat on line 5.

### Tradeoffs
- **Characterization lock against the current engine, not strict RED-against-a-fix.** S20 changes no production code, so each test was written then confirmed GREEN against the shipped engine (per the plan's TDD-for-a-characterization-lock note). The regression value is real: test 3 would go RED if the S19 reseed regressed.
- **New per-scenario test files** (`tests/reconstruction_engine_s20.test.ts`, `tests/reconstruction_cli_s20.test.ts`) rather than additions to a shared file — follows the S10–S19 per-scenario split precedent. Imports + `finalTextOf`/`historyEndingWith` helpers copied verbatim from the S19 engine test template.

### Open questions
- **None blocking.** NOTHING is committed — awaiting the user's review/commit (project rule: commit only when asked; one-commit-per-scenario → `Implemented S20 handling`). Stage exactly: `tests/fixtures.ts`, `tests/reconstruction_engine_s20.test.ts`, `tests/reconstruction_cli_s20.test.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/s20/s20-reconstruction-plan.md`. Do NOT `git add -A` (no `src/` files; keep untracked handoff docs out).

## 2026-06-23:21:30:00 — S19 reconstruction (multi-edit user-edit then CONVERSATION-ONLY rewind, then a post-rewind RE-EDIT) — COMPLETE; FIRST production-code change since S12; 233 tests green
Chat title: api-from-scenarios — S19 impl monitor → implement S19 (user-edit-conv-rewind)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/8ffd1656-909b-4d5f-82f1-0e9fe0ca9676.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s19/s19-reconstruction-plan.md (THE authoritative plan executed — verified fix code + verbatim test code)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-2121.md (S19 planning handoff that triggered this implementation)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s12/s12-reconstruction-plan.md (S12 — spec 39 `seedEditBaseFromBackup`, the first-event precedent this fix generalises)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s18/s18-reconstruction-plan.md (S18 — the no-rewind twin S19 mirrors as a conversation-rewind)

### Design decisions
- **FIRST production-code change since S12 (S16/S17/S18 were no-op characterization locks).** Two source files changed: `src/reconstruction_sidecar.ts` (extract+export `backupSeedWriteFor`) and `src/reconstruction_branches.ts` (new `seedStaleEditBases`/`staleEditSeedFor`/`editBaseIsStale` + a `restaged` pass in `reconstructFileOver`). Final state = **233 pass / 0 fail** (224 baseline + 9 new: 4 engine + 5 CLI), `npx tsc --noEmit` clean, filesize sweep clean (sidecar.ts 177, branches.ts 226 — both under the 250-line cap).
- **The bug.** On the surviving branch, F's `multiply` edit base is B's 2-line `add` write only (D's user-edit and E's `subtract` are off-branch/rewound), but F's hunk (`oldStart=5`, context `def subtract`/`return a-b`/`# user tweak`) was computed by Claude Code against the real 7-line v3 disk. `insertHunkAdditions` does `workingLines.slice(0, oldStart-1)` = `slice(0,4)` on a 2-line base, silently dropping base indices 2,3 — the two blank lines between `add` and `subtract`. Result: 9 lines instead of 11. `subtract` still appears (its context lines materialise via `resolveContextLine`'s born-path), but the two leading blanks cannot be recovered from the hunk.
- **The fix = spec 39 GENERALISED, not a new mechanism.** Spec 39 seeds an edit's base from the file-history backup when the edit is the FIRST event on a branch. S19 is the same disease one step later: the creating Write (B) IS on-branch, but off-branch edits (D, E) advanced the disk past it. `seedStaleEditBases` walks the lineage and splices the SAME synthetic backup-seed Write (`backupSeedWriteFor`, reused from the refactored sidecar) before any edit whose first hunk `oldStart-1 > reconstructedBaseLength`. It runs AFTER `seedEditBaseFromBackup`, so a spec-39 first-event edit is already seeded and not re-seeded (no double-seed). The synthetic seed's changeId is the backup blob name (`928642d7d0c1c258@v3`), so it stays OUT of the conversationDAG/fileDAG/`--list-branches` — only `--surviving --verbose` gains the corrected 3rd revision.
- **Why no regression:** `editBaseIsStale` is true ONLY when a hunk references lines past its reconstructed base — exactly the off-branch-rewind divergence. For every aligned edit it is false and the lineage is returned unchanged, so S1–S18 are byte-for-byte identical (verified: 224 still green with the fix applied, then 233 with the new tests).
- **Helpers split into three small functions** (`editBaseIsStale`/`staleEditSeedFor`/`seedStaleEditBases`) to keep nesting ≤ 3 indent units (a `jot` post-tool hook flags deeper nesting). Discriminants compared via enum members (`event.kind !== EventKind.edit`), every function verb-named — per `plans/coding-requirements.md`.

### Deviations
- **One CLI test assertion was rewritten from the plan (Task 5, test 4).** The plan's `test_S19_surviving_verbose_reconstructs_eleven_line_file_with_blank_lines` asserted raw multi-line substrings (`"    return a + b\n\n\ndef subtract(a, b):"`, `"# user tweak\n\n\ndef multiply(a, b):"`) against `--surviving --verbose`. But the verbose render is **line-numbered** (`     5 | def subtract(a, b):`), so those raw substrings can never appear. The reconstruction itself is correct (verified 11 lines with both blank-line pairs). Replaced with line-POSITION assertions that lock the same behaviour even more precisely: `def subtract` on line 5 (⇒ lines 3,4 are the two blanks after `return a + b`), `# user tweak` on line 7, `def multiply` on line 10 (⇒ lines 8,9 are the two blanks after `# user tweak`), `return a * b` on line 11. If the engine dropped the blanks, subtract/multiply would shift up and these fail. The engine test (`test_S19_surviving_scenario_file_keeps_off_branch_subtract_with_blank_lines`) still byte-locks the exact raw 11-line string incl. `\n\n\n`, so raw-byte coverage is unchanged.
- **Plan §7's "S16/S17/S18 are uncommitted — do NOT git checkout shared files" hazard no longer applies.** They were committed mid-session as `f0ec2f0 Implemented S16-18 handling` (the S19 handoff confirms this). The working tree was clean except untracked `plans/s19/` + the S19 handoff, so S19 can be committed normally. No shared-file `git checkout` was performed regardless.

### Tradeoffs
- **Seed at the staging layer, not at `insertHunkAdditions`.** The bug surfaces in `insertHunkAdditions`' leading-carry slice, but fixing it there (e.g. born-filling the leading gap) would invent content the hunk never described. Seeding the real pre-edit disk content from the file-history backup (the authoritative source) keeps the splice honest and reuses the proven spec-39 machinery. The handoff explicitly flags `reconstruction_replay_edit.ts:113` as DO-NOT-CHANGE.
- **New per-scenario test files** (`tests/reconstruction_engine_s19.test.ts`, `tests/reconstruction_cli_s19.test.ts`) rather than additions to the shared CLI test file — follows the S10–S18 per-scenario split precedent.
- **Wrote all 4 engine tests in one file pass rather than a strict per-test RED gate.** RED was still demonstrated: the auto-run hook reported `actual: 2, expected: 3` (the unfixed engine yields 2 revisions, not the seeded 3) before the fix; applying §4a/§4b turned all 4 green.

### Open questions
- **None blocking.** NOTHING is committed — awaiting the user's review/commit (project rule: commit only when asked; one-commit-per-scenario → `Implemented S19 handling`). Stage exactly: `tests/fixtures.ts`, `tests/reconstruction_engine_s19.test.ts`, `tests/reconstruction_cli_s19.test.ts`, `src/reconstruction_sidecar.ts`, `src/reconstruction_branches.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/s19/s19-reconstruction-plan.md`. Do NOT `git add -A`.

## 2026-06-23:20:52:00 — S18 reconstruction (linear external user-edit with NO rewind, then a post-edit RE-EDIT on top) — COMPLETE as a characterization/regression lock; NO production-code change; 224 tests green
Chat title: api-from-scenarios — S18 impl monitor → implement S18 (user-edit-no-rewind)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/d47d2d20-8e0f-49e3-b854-44038c10018b.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s18/s18-reconstruction-plan.md (THE authoritative plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-2048.md (S18 planning handoff that triggered this implementation)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s15/s15-reconstruction-plan.md (S15 — the user-edit-on-rewound-branch scenario S18 inverts; test scaffolding mirrored)

### Design decisions
- **No production-code change — S18 was already reconstructed correctly by the shipped S15 content-aware user-edit guard + the spec-39 born-path + the linear `findSurvivingHead` case; this slice LOCKS that with tests + docs.** Final state = **224 pass / 0 fail** (215 baseline + 9 new: 4 engine + 5 CLI), `npx tsc --noEmit` clean, filesize sweep clean (new test files 86 / 72 lines).
- **S18 is the inversion of S15.** S18 is strictly LINEAR (no rewind, no fork): B writes `scenario18.py` (greet) + the test C; the user edits `scenario18.py` out-of-band (an `edited_text_file` attachment prepending `# user was here`); E (Claude) edits the file to add `farewell` anchored on the user-edited content. Surviving (and only) tree = `# user was here` + greet + farewell. Where S15 stranded its user edit on a rewound branch and its `--surviving` view EXCLUDES the edit, S18 KEEPS the edit on the surviving lineage and its `--surviving` view INCLUDES it.
- **S18 is the FIRST scenario whose fileDAG shows a `user-edit` kind on the surviving lineage**, and the first where a Claude edit is reconstructed on top of a recorded external user edit. The assertions were INVERTED from S15/S16/S17 deliberately, not copied: assert `branches.length === 1` (surviving only), `rewound.length === 0`, the fileDAG `includes("user-edit")`, and `--surviving` KEEPS `# user was here` + greet + farewell.
- **Why the engine is already correct (read-only references — not modified):** the user's `# user was here` content DIFFERS from B's greet-only write, so `userEditChangesContent` (`reconstruction_replay.ts:118-134`) returns true and KEEPS the user-edit revision (in S16 the echo matched current → dropped — the inverted path). E's `farewell` edit anchors on the user-edited base via `resolveContextLine` carryAt (`reconstruction_replay_edit.ts:96-107`). With no rewind, `findSurvivingHead` (`reconstruction_branch.ts:37-59`) returns the single head directly; the rewind-handling lines never execute.

### Deviations
- **None.** The plan's test code (engine + CLI) was transcribed verbatim; the scaffolding (imports + the three `finalTextOf`/`historyFinalText`/`historyEndingWith` helpers, `runCli`/`loadRecords` usage) mirrors `tests/reconstruction_engine_s15.test.ts` / `tests/reconstruction_cli_s15.test.ts`. Every assertion passed GREEN on arrival, confirming the plan's live engine-probe verification. No assertion was loosened and no production change was invented.

### Tradeoffs
- **New per-scenario test files (`tests/reconstruction_engine_s18.test.ts`, `tests/reconstruction_cli_s18.test.ts`) rather than additions to the shared CLI test file** — follows the S10–S17 per-scenario split precedent (the shared `reconstruction_cli.test.ts` sits at 243/250 and cannot absorb more).
- **Characterization locks (GREEN on arrival) rather than a fabricated RED phase.** Like S10/S11/S16/S17, the engine is already correct; the 9 tests give regression protection for the exact S18 combination (linear external user-edit KEPT on the surviving lineage + a Claude re-edit anchored on it). A future RED here signals a real regression.

### Open questions
- **None blocking.** No design-doc/spec change was made (S18 introduces no new engine rule — it exercises the existing positive branch of the S15 content-aware guard plus the spec-39 born-path). NOTHING is committed — awaiting the user's review/commit (project rule: commit only when asked; one-commit-per-scenario precedent → `Implemented S18 handling`). S16/S17 may still be uncommitted in this worktree; keep S18 a DISTINCT commit — stage exactly the S18 artifacts (`tests/fixtures.ts`, the two new S18 test files, `plans/roadmap.md`, this notes file), never `git add -A`.

## 2026-06-23:20:39:00 — S17 reconstruction (multi-edit, conversation-only rewind, then post-rewind RE-EDIT) — COMPLETE as a characterization/regression lock; NO production-code change; 215 tests green
Chat title: api-from-scenarios — S17 handoff monitor → implement S17 (multi-edit-conv-only-re-edit)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/26cdb2a2-3c50-4e56-a4d2-4bebb589e59f.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s17/s17-reconstruction-plan.md (THE authoritative plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-2034.md (S17 planning handoff that triggered this implementation)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s16/s16-reconstruction-plan.md (S16 — the code-restore twin S17 inverts; templates mirrored)

### Design decisions
- **No production-code change — S17 was already reconstructed correctly by the shipped S12 born-path + S13 structural discovery + S14 surviving-head guard; this slice LOCKS that with tests + docs.** Final state = **215 pass / 0 fail** (206 baseline + 9 new: 4 engine + 5 CLI), `npx tsc --noEmit` clean, filesize sweep clean (new test files 87 / 73 lines; `reconstruction_cli.test.ts` untouched at 243).
- **S17 is the conversation-only twin of S16.** B writes `scenario17.py` (greet) + the test C; D edits in `farewell`; a conv-only rewind (`Rewind: 2`, NO `code` suffix) abandons D CONVERSATIONALLY but leaves `farewell` on disk; E re-edits the still-farewell file to add `shout`. Surviving working tree = greet + farewell + shout (KEEPS farewell). This inverts S16, whose `code` restore rolled disk back to greet-only so its surviving tree was greet + shout. Same write→edit→rewind→re-edit shape and the same B/C/D changeIds across the twins; they diverge on exactly the rewind kind, which determines the disk the re-edit sees.
- **The one assertion that inverts vs S16 (the whole point of the slice):** S16's surviving tests assert the tree has `shout` and NOT `farewell`; S17's assert it has `farewell` AND `shout`. The S16 templates were mirrored, but this single inversion was applied deliberately (the engine and CLI surviving tests both assert both functions present) — NOT a blind copy.
- **Why the engine is already correct on a partially-present base:** the surviving branch reconstructs over its own records (D excluded), so E's `farewell` context lines are absent from the greet-only base B; `resolveContextLine` (`reconstruction_replay_edit.ts:96-107`) finds them undefined and materialises them as genesis (`born: true`), and `insertHunkAdditions` appends the `+ shout` lines — yielding `scenario17.py` as TWO revisions (greet Write, then one Edit revision holding greet + farewell + shout). This born-path firing on a partially-present base (greet present, farewell absent) is the behavior S17 uniquely exercises and locks. The rewound `farewell` branch (tip #07038b43) is named by no last-prompt head, so it is found STRUCTURALLY (the S13 path); `findWorkingTreeOwner` returns #60cee518 on the final chain, so `findSurvivingHead` keeps the final head #e53225b5 via its on-branch short-circuit (the S14 guard a second line of defense).
- **No `edited_text_file` attachment exists in S17 at all** (full-transcript scan = zero). Unlike S16 (which had a record-80 greet-only echo dropped by the S15 content-aware guard), S17 has nothing for that guard to evaluate, so "no `user-edit` turn" holds trivially and the fileDAG kind column stays width 5 (`write`/`edit`). The CLI test asserts `!out.includes("user-edit")` to lock this.

### Deviations
- **None.** The plan's test code (engine + CLI) was transcribed verbatim; the `reconstructBranches`/`ConversationBranch` accessors match the existing S16 test exactly. Every assertion passed GREEN on arrival, confirming the plan's four-way verification. No assertion was loosened and no production change was invented (the plan explicitly forbids manufacturing a RED→GREEN cycle where there is nothing to fix). The end-to-end check confirmed S17 `--surviving` = greet + farewell + shout AND that S16 `--surviving` STILL shows greet + shout with NO farewell — the twins differ by exactly the kept `farewell`.

### Tradeoffs
- **New per-scenario CLI test file (`tests/reconstruction_cli_s17.test.ts`) rather than additions to `tests/reconstruction_cli.test.ts`** — that file is at 243/250 and five more tests would breach the hard 250-line cap. This follows the S10–S16 per-scenario split precedent.
- **Characterization locks (GREEN on arrival) rather than a fabricated RED phase.** Like S10/S11/S16, the engine is already correct; the value of the 9 tests is regression protection for the exact S17 combination (conv-only-kept-farewell + surviving re-edit on a partially-present base). A future RED here signals a real regression, not expected churn.
- **The farewell-attribution artifact is intentional, not a bug.** On the surviving branch, `farewell`'s content lands on E's edit revision (its real author D is off-branch). Per the project directive "reconstruct the change history 100%, attribution second" the surviving content is byte-correct; special-casing attribution would be scope creep risking S1–S16.

### Open questions
- **None blocking.** No design-doc/spec change was made (S13–S16 added none; S17 introduces no new engine rule — it exercises the existing spec-39 born-path). If a short S17 prose note in `plans/reconstruction-engine-design.md` is wanted for completeness, that is an optional follow-up. NOTHING is committed — awaiting the user's review/commit (project rule: commit only when asked; one-commit-per-scenario precedent → `Implemented S17 handling`). If S16 is still uncommitted, keep S16 and S17 as DISTINCT commits — do not fold S17 into the S16 commit. The unrelated working-tree edit `src/Plan_Impl_template.md` (now committed at `39700e6`) and any other stray edits must NOT be swept into the S17 commit.

## 2026-06-23:20:16:00 — S16 reconstruction (multi-edit, code restore, then post-restore RE-EDIT) — COMPLETE as a characterization/regression lock; NO production-code change; 206 tests green
Chat title: api-from-scenarios — S16 handoff monitor → implement S16 (multi-edit-code-restore-re-edit)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/fe7cb86f-e453-4b27-9a0c-c3645251748d.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s16/s16-reconstruction-plan.md (THE authoritative plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-2005.md (S16 planning handoff that triggered this implementation)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1722.md (S13 planning handoff; S16 is the re-edit twin of S13)

### Design decisions
- **No production-code change — S16 was already reconstructed correctly by the shipped S13+S14+S15 machinery; this slice LOCKS that with tests + docs.** Final state = **206 pass / 0 fail** (197 baseline + 9 new: 4 engine + 5 CLI), `npx tsc --noEmit` clean, filesize sweep clean (new test files 88 / 67 lines; `reconstruction_cli.test.ts` untouched at 243).
- **S16 is the re-edit twin of S13.** B writes `scenario16.py` (greet) + the test C; D edits in `farewell`; a code-restore rewind (`Rewind: 2, code`) abandons D and rolls disk back to greet-only; E re-edits to add `shout`. Surviving working tree = greet + shout; the abandoned `farewell` edit is preserved as a structurally-discovered rewound branch.
- **Why S16 is its own slice despite no code change:** it is the FIRST scenario where a structurally-discovered rewound branch (the S13 mechanism — abandoned tip `24093c68` is NOT a last-prompt head) coexists with a surviving branch that records its OWN file change (the `shout` re-edit). In S13/S14/S15 the surviving branch was file-less (`(no file changes)`); here it renders its `E edit`. The load-bearing reason the surviving head stays correct is the on-branch working-tree-owner short-circuit (`reconstruction_branch.ts:48-49`): `findWorkingTreeOwner` returns the `shout` snapshot `2de1cd62`, which sits on the final chain, so `findSurvivingHead` keeps the final head `a4ec5565` and never reaches the S14 `survivingBranchRecordsFileChange` guard (which would independently also keep it — doubly robust).
- **The lone `edited_text_file` (record 80, greet-only) is a disk-snapshot ECHO, not a user edit.** The S15 content-aware, branch-aware guard drops it (it equals the file's current greet-only content on its own branch), so no `user-edit` turn appears and the fileDAG kind column stays width 5 (`write`/`edit`). The CLI test asserts `!out.includes("user-edit")` to lock this.

### Deviations
- **None.** The plan's test code (engine + CLI) was transcribed verbatim; the `reconstructBranches`/`ConversationBranch` accessors match the existing S15 test exactly. Every assertion passed GREEN on arrival, confirming the plan's four-way verification. No assertion was loosened and no production change was invented (the plan explicitly forbids manufacturing a RED→GREEN cycle where there is nothing to fix).

### Tradeoffs
- **New per-scenario CLI test file (`tests/reconstruction_cli_s16.test.ts`) rather than additions to `tests/reconstruction_cli.test.ts`** — that file is at 243/250 and five more tests would breach the hard 250-line cap. This follows the S10–S15 per-scenario split precedent.
- **Characterization locks (GREEN on arrival) rather than a fabricated RED phase.** Like S10/S11, the engine is already correct; the value of the 9 tests is regression protection for the exact S16 combination (structural rewound branch + file-recording surviving branch). A future RED here signals a real regression, not expected churn.

### Open questions
- **None blocking.** No design-doc/spec change was made (S13–S15 added none; S16 introduces no new engine rule). If a short S16 prose note in `plans/reconstruction-engine-design.md` is wanted for completeness, that is an optional follow-up. NOTHING is committed — awaiting the user's review/commit (project rule: commit only when asked; one-commit-per-scenario precedent → `Implemented S16 handling`). The unrelated working-tree edit `src/Plan_Impl_template.md` must NOT be swept into the S16 commit.

## 2026-06-23:19:12:00 — S15 reconstruction (user out-of-band edit then conv-only rewind) — COMPLETE (corrected a plan defect; 197 tests green)
Chat title: api-from-scenarios — S15 handoff monitor → implement S15 (user-edit-then-conv-rewind)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/4a8f2643-0dae-45b6-9c02-eef26c555235.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s15/s15-reconstruction-plan.md (the plan being executed; its regression-safety claim was wrong — see Deviations)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1855.md (S15 planning handoff that triggered this implementation)

### Design decisions
- **Implemented the plan's six edits, PLUS a content-aware guard the plan omitted.** Final state: **197 pass / 0 fail** (180 prior + 17 new: 1 vocab EventKind membership + 3 user_edit + 4 engine + 5 cli + 4 branches), `npx tsc --noEmit` clean, every file ≤ 250 lines (graph.ts 249, branches.ts 186, replay.ts 185).
- **The user-edit family's true signal is CONTENT, per the user's directive** ("it is less important that an edit be 100% attributed to the user and more important that the change history can be reconstructed 100%"). An `edited_text_file` attachment is the IDE echoing a file's bytes whenever it is written OR read; it is a genuine change ONLY when its snapshot differs from the file's current content. So the engine records an `edited_text_file` as a `user-edit` change iff it actually changed the file — every real change in, no phantom changes.
- **Where the guard lives (single source of truth = replay):** `reconstruction_replay.userEditChangesContent` drops a `user-edit` revision whose snapshot equals the file's current content (`fileIsPresent` + line-by-line compare). Because replay runs per branch over sidecar-filled events, this is branch-aware and reader-correct for every lineage (write/edit AND bash-redirect). This alone fixes all CONTENT views (`--surviving`/`--branch`/`renderHistoryList`).
- **Graphs follow the same truth via an accepted-set:** `reconstruction_branches.collectAcceptedUserEditIds(records, reader)` reconstructs every branch and collects the changeIds of `user-edit` revisions that SURVIVED replay; `extractRenderableEvents(records, accepted)` filters the graph's events so a redundant echo never becomes a fileDAG/conversationDAG turn. The CLI now passes its sidecar reader into `renderGraphs` (reader built before the graph dispatch) so the file graph is content-correct even for the bash-redirect lineage (S5).

### Deviations
- **The plan's central regression-safety claim was FALSE; I corrected it.** Plan §"Regression safety" asserted `edited_text_file` "appears for the first time in S15." A grep shows it in **S5 and S13** (both implemented/locked) and 9 future scenarios. The plan author validated only S15 (prototype reverted), so the full-suite regression was never seen. Unconditional extraction therefore emitted phantom `user-edit` turns for S5/S13. The content-aware guard above is the fix; the plan's six edits are all still present (the guard is additive). The user explicitly authorized building the correct solution against the S1–S15 datasets.
- **Added a new `EventKind` membership test** to `tests/vocabulary.test.ts` — the plan said to extend an existing one, but none existed; this realizes the plan's intent.
- **Added `tests/reconstruction_branches.test.ts`** (4 tests) covering the new `collectAcceptedUserEditIds`/`extractRenderableEvents` discriminator AND clearing the repo's per-source no-test warning for `reconstruction_branches.ts`.

### Tradeoffs
- **Content comparison vs. a structural heuristic.** The attachment shape (`userType:"external"`, `isSidechain:false`, parent type) is byte-identical between a genuine edit and a disk echo, and the echo can sit on a "Read the file" turn with no same-file tool_use — so no structural signal separates them. Content comparison is the only robust discriminator and is exactly what "reconstruct the change history 100%" wants (record a change iff content changed). Cost: the graph path now reconstructs branch content to build the accepted-set (was topology-only); contained to `buildConversationDag`/`buildFileDag`, which already had `records` and now take an optional `reader`.
- **Validated against the real S1–S15 datasets:** every default view runs clean (exit 0); S1–S14 show ZERO `user-edit` turns (byte-unchanged), S15 shows exactly the genuine edit (the fork's rewound `user-edit` turn + its fileDAG turn). S5's previously-latent phantom fileDAG turn is also gone now that the graph gets a reader.

### Open questions
- **None blocking.** Generalizes to the rest of the user-edit family (S16, S18–S23) and the M-scenarios that carry `edited_text_file` (m3/m5/m6): each such snapshot will be kept iff it changed content. NOTHING is committed — awaiting the user's review/commit (project rule: commit only when asked; one-commit-per-scenario precedent → `Implemented S15 handling`).

## 2026-06-23:18:30:00 — S14 reconstruction (multi-edit conv-only-read: the conversation-only twin of S13 — a conv-only rewind leaves the abandoned `farewell` Edit on disk, mis-routing findSurvivingHead and hiding the rewound branch; two surgical fixes route the case onto S13's already-correct path)
Chat title: api-from-scenarios — S14 handoff monitor → implement S14 (multi-edit-conv-only-read)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/c0d50750-e7e5-4817-a7cf-2f1d78f61cc9.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s14/s14-reconstruction-plan.md (THE authoritative plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1820.md (S14 planning handoff that triggered this implementation)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1722.md (S13 planning handoff; S14 mirrors the S13 tests almost line-for-line)

### Design decisions
- **Two surgical edits exactly as planned, strict RED→GREEN TDD.** Final state = **180 pass / 0 fail** (172 prior + 8 new: 4 engine + 4 CLI), `npx tsc --noEmit` clean, filesize sweep clean (`reconstruction_branch.ts` 231 / 250, `reconstruction_fork.ts` 125).
- **Part 1 (`reconstruction_branch.ts`):** added `survivingBranchRecordsFileChange(records, finalHead)` = `extractFileEvents(selectBranchRecords(records, finalHead)).length > 0` and an `import { extractFileEvents } from "./reconstruction_extract.ts"` (no import cycle — extract imports none of branch/fork/worktree). `findSurvivingHead` now keeps `finalHead` when that helper is true, so the working-tree override only redirects for a file-less surviving branch (S8/S9/S10). S14's surviving Read branch carries the trunk Writes → keeps `de63b23a`.
- **Part 2 (`reconstruction_fork.ts`):** deleted the `claimed.has(abandonedPrompt)` short-circuit in `subtreeHoldsClaimedTip`. `collectDescendantUuids` excludes `start`, so S7/S8/S11/S12 (whose claimed head tip is a descendant) stay skipped; only S14's deeper structural tip `68f74356` is now discovered.
- **CLI output is byte-identical to the plan's authoritative Expected-outputs section** (verified by direct CLI run): `--list-branches` = surviving `#de63b23a` + rewound `#68f74356` rewind @ `#acc07a57`; default fork + unchanged fileDAG (`B write #0131TtyG`, `D edit #01X52CXE`, `C write #01YE6fsX`).

### Deviations
- **Plan Task 1 said `findConversationBranches(...).length === 2`; the real value is 3.** After Part 1, the abandoned prompt `fadbe55d` — which in S14 is itself a `last-prompt` head — is enumerated by the head-based pass as a degenerate abandoned branch (tip = the prompt). The plan's own root-cause text describes this branch as "degenerate ... filtered downstream (no diverging file change) — harmless," which confirms it exists at the `findConversationBranches` level and is removed only by `reconstructBranches` (`rewound.length === 1`, asserted by Task 2 and passing). So the raw count is 3, not 2 — the plan's stated `=== 2` was inconsistent with its own design. **Resolution:** the engine test `test_S14_findConversationBranches_includes_the_structural_rewound_branch` asserts the two MEANINGFUL branches are present (surviving tip `de63b23a`; a non-surviving branch `68f74356` @ `acc07a57`) instead of `length === 2`. This still proves both bugs are fixed and matches the authoritative CLI output exactly. No production change was made to suppress the degenerate branch (the plan explicitly forbids going beyond the two edits, and the branch is invisible in every rendered view).

### Tradeoffs
- Considered adding ancestor-dedup so `findConversationBranches` drops `fadbe55d` (it is an ancestor of the structural tip `68f74356`) to make a literal `length === 2` true. Rejected: that is a third production change with regression surface across S7/S8/S11/S12, the plan forbids extra edits, and the degenerate branch never reaches a rendered view (filtered by `reconstructBranches`). Asserting the meaningful invariants is faithful and lower-risk.

### Open questions
- None blocking. The one deviation (test asserts branch presence, not raw `length === 2`) is documented above; flag for review if a literal raw-count lock is preferred.

## 2026-06-23:17:40:00 — S13 reconstruction (multi-edit code-restore-read: discover the rewound branch STRUCTURALLY from the parentUuid fork — the abandoned branch edited a file but its tip is named by NO last-prompt head — and render the file-less surviving branch so the conversationDAG shows the fork)
Chat title: api-from-scenarios — S13 handoff monitor → implement S13 (multi-edit-code-restore-read)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/297fd035-d302-4c9d-98f4-2792b11d67dd.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s13/s13-reconstruction-plan.md (THE authoritative plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1722.md (S13 planning handoff that triggered this implementation)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1655.md (S12 implementation handoff; S12 work is the uncommitted predecessor in the tree)

### Design decisions
- **Baseline confirmed before any change:** `npm test` = 151 pass / 0 fail (the uncommitted-S12 baseline). Final state = **172 pass / 0 fail** (151 + 21 new S13 tests), `npx tsc --noEmit` clean, every changed file ≤ 250 lines.
- **Part 1 (structural rewound discovery) — DONE.** Four new forest walkers in `reconstruction_tree.ts`: `isGenuineUserPrompt` (user, not isMeta, no tool_result block), `findPromptForkPoints` (parents of ≥2 genuine prompts, first-appearance order), `collectDescendantUuids` (BFS down following children of EVERY type — the abandoned subtree threads through `attachment` records), `findDeepestPromptOrReply` (latest-timestamp user/assistant descendant = the abandoned tip). The append/dedup glue lives in a NEW leaf module `reconstruction_fork.ts` (`findStructuralRewoundBranches`), wired into `findConversationBranches` (`reconstruction_branch.ts`) as a purely-additive 2-line tail.
- **Part 2 (render the fork when surviving is file-less) — DONE.** `buildSurvivingConvoBranch` now keeps an empty-`turns` surviving branch when `rewound.length > 0` (else still drops it, preserving linear scenarios); `firstTurnTime` returns `Number.POSITIVE_INFINITY` for a 0-turn branch so it sorts last; `renderBranchBlock` emits a single `(no file changes)` marker line for an empty branch. The S13 bare-CLI conversationDAG now matches the plan's authoritative literal byte-for-byte (root `#8faab841 (rewind point)`, rewound `#45cf4bf8` above surviving `#9641c49c`).

### Deviations
- **The structural-append logic went into a NEW module `reconstruction_fork.ts`, not into `reconstruction_branch.ts` (plan's first choice) nor `reconstruction_tree.ts` (plan's fallback).** Reason: after Part 1's four walkers, `reconstruction_tree.ts` hit 249/250 (no room), and `reconstruction_branch.ts` had only ~35 lines of headroom — too little for the ~70-line append logic with single-condition-branching + the deep-nesting hook. `reconstruction_fork.ts` imports the `ConversationBranch` TYPE only (erased at runtime), so there is no value import cycle with `reconstruction_branch.ts`. This honors the project's no-forwarding-layer rule (one canonical home, direct import) and the plan's explicit "move the symbol to one home; do NOT create a re-export shim."
- **Two helper extractions to satisfy the >3× indent (deep-nesting) hook**, both behavior-preserving: `recordNewChildren` (the BFS inner loop in `collectDescendantUuids`) and the `isConversationalTurn`/`isLaterThan` split in `findDeepestPromptOrReply`.
- **Added a dedicated unit test file `tests/reconstruction_fork.test.ts`** (2 tests: a synthetic fork yields one structural rewound branch; the dedup guard skips a subtree already holding an existing tip). The plan tested the fork logic only through `findConversationBranches`; the unit file isolates the dedup-guard regression contract AND satisfies the repo's per-source test-file check for the new module.

### Tradeoffs
- **New module vs. cramming an existing file.** Splitting `reconstruction_fork.ts` out keeps every file well under the 250-line cap and gives the structural-fork logic a named home, at the cost of one more module + a type-only import edge. The alternative (squeezing into `reconstruction_branch.ts`) would have breached the cap and forced condensing existing functions — which the project rule forbids ("split, don't condense").
- **Display choice (the plan's flagged open decision): keep the file-less surviving branch VISIBLE with `(no file changes)`** rather than omitting it. Chosen because it is honest about the two-branch fork, mirrors S11's layout, and signals the on-disk `greet` came from the pre-fork writes + restore. Reversing this later touches only Part 2's gate + the Task 5/6 expected strings.

### Open questions
- **None blocking.** The plan's flagged display decision was resolved as "show it" (above). S1–S12 outputs verified unchanged (S9/S10 stay linear — the read-only structural branch is filtered downstream by `divergingIds.size===0`; S11 shows exactly one rewound branch — the dedup guard prevents double-counting). NOTHING is committed: the uncommitted S12 work plus this S13 work both sit in the tree, awaiting the user's review/commit (project rule: commit only when asked).

## 2026-06-23:16:16:00 — S12 reconstruction (conversation-only rewind + post-rewind EDIT: fix the crash by seeding the Edit base from the file-history backup, AND add a two-DAG CLI render that becomes the new global default)
Chat title: api-from-scenarios — implement S12 (write-conv-only-rewrite) [autonomous monitor session]
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/0caa7b79-b451-443a-912c-646973eabe23.jsonl

### References
- /Users/matkatmusicllc/.claude/plans/reactive-imagining-llama.md (THE authoritative plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s12/s12-reconstruction-plan.md (earlier draft; SUPERSEDED on branch order — see plan warning; ground-truth tables still valid)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1611.md (S12 implementation handoff that launched this session)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md (specs 39 + 40 added)

### Design decisions
- Baseline confirmed before any change: `npm test` = 129 pass / 0 fail at HEAD 6a47c39; the real S12
  transcript CRASHES the unchanged engine at `reconstruction_branches.ts:116` → `insertHunkAdditions`
  (empty-base Edit). Both facts captured as the RED starting point.
- **Part 1 (crash fix) — DONE, 133 pass / 0 fail, tsc clean.** Three changes per plan: (1)
  `seedEditBaseFromBackup` + private `findBackupAtOrBefore` in `reconstruction_sidecar.ts` — when a
  per-file lineage's first event is an Edit, prepend a synthetic Write whose content is the
  at-or-before file-history backup; (2) wired into `reconstructFileOver` after `fillRedirectContent`,
  guarded on `reader`; (3) `insertHunkAdditions`' context branch made total. End-to-end `--surviving`
  on the real S12 transcript now yields scenario12.py = create(`add`)+edit(`multiply`) and
  test_scenario12.py = create+edit(removal)+edit(addition); final scenario12.py has both `def add` and
  `def multiply`.

### Deviations
- **`insertHunkAdditions` refactor went beyond the plan's literal 4-line nested `if` to satisfy the
  project's deep-nesting hook (>3× indent).** Extracted a `resolveContextLine(workingLines,
  workingIndex, text, timestamp) -> {entry, born}` helper (reusing existing `genesisLine`/`carryAt`),
  and converted the '+' branch to an early `continue`. Behavior is identical to the plan's pseudocode
  (verified: all 129 prior tests + the new empty-base guard green); the change is purely structural to
  clear the lint gate and honor single-condition-branching.

### Tradeoffs
- **Synthetic seed Write's `changeId` is the backup filename** (e.g. `43c1313ce6fd5f24@v2`), per plan.
  It surfaces in `--surviving` content views as `#43c1313c`. This is internal-reconstruction identity,
  NOT a real turn; the fileDAG (Part 2, decision 9) attributes the file's base to the REAL Write turn
  (`#015zSRxJ`) via `extractFileEvents` over all records, so the synthetic id stays out of the graphs.

### Open questions
- **None blocking — all six tasks complete, 151 green, tsc clean, every file ≤ 250 lines, nothing
  committed (awaiting user approval).** Resolved during implementation: (1) the root-node-is-rewind-point
  vs parentUuid-null discrepancy (resolved to match the plan's expected literal — see Progress); (2) the
  `insertHunkAdditions` nesting refactor to clear the project lint gate. Carried-forward / out-of-scope
  (flagged in the plan's Risks, unchanged by S12): multi-fork transcripts (S8) render flat one-wrapper-
  per-branch (not nested); the seed picks the at-or-before backup by TIMESTAMP (clock-skew edge falls
  back to the genesis guard; not present in S12); `parseRedirect` still mis-parses `2>&1` / `>/dev/null`
  (its own future slice). A `--graphConvo`/`--graphFile` content-bearing variant and nested multi-fork
  rendering are possible future enhancements, not requested here.

### Progress
- **Part 2 CLI wiring + global default + 12 rewritten tests — DONE.** `--graphConvo`/`--graphFile`
  added; bare default turns BOTH on via `resolveGraphFlags` (only when no selector AND no
  content-view modifier, so `--verbose`/`--diff` still render content). `renderAllBranches` and
  `formatBranchHeader` retired. The 12 default-view CLI tests rewritten to the new graph output
  (linear S1–S6/S9/S10; forked S7/S8/S11). **Plan-vs-output resolution:** the plan said the
  conversationDAG root = the parentUuid-null record, but the plan's own EXPECTED literal shows the
  root as `#94000895` — the REWIND point (== the rewound branch's `rewind @`), not the absolute root
  (`#dfd8d07c`). I made `resolveRootUuid` use the rewind point when forked (else the parentUuid-null
  root for linear), which reproduces the expected output exactly. **Topology-only consequence:** the
  graph shows raw `EventKind` ("write", not the list view's "create"; S4's second write is "write",
  not "overwrite"; no line counts), so the rewritten tests assert kinds/changeIds/structure, not the
  old content-view strings.
- **Part 2 S12 real-transcript lock — DONE, 151 pass / 0 fail, tsc clean.** `S12_JSONL` in
  `fixtures.ts`; `reconstruction_engine_s12.test.ts` (in-memory `S12_BACKUPS` reader — the two
  `@v2` pre-edit blobs) proves the seeded `add`+`multiply` surviving files and the single rewound
  `add` branch (rewindPoint `94000895`); `reconstruction_cli_s12.test.ts` (real reader) locks the
  both-graph default (root `#94000895`, rewound tip `#cba30c9f` above surviving tip `#2c9424c4`,
  the four B–E turns), `--graphConvo`/`--graphFile` isolation, `--surviving --verbose` content, and
  the three `parseArgs` graph-flag cases. **Branch B's surviving tip `#2c9424c4` was read off the
  real `runCli` output and transcribed** (per the plan).
- **Docs — DONE.** Specs 39 (crash fix) + 40 (two-DAG render) added to
  `reconstruction-engine-design.md`; code-layout updated (3 new modules + sidecar/replay_edit/
  render_list/cli edits) and the TDD test inventory extended; this notes entry; `roadmap.md` S12
  flipped to `[x]`. Full filesize sweep across `src/**` + `tests/*` is clean (all ≤ 250 lines).
- **Part 2 graph renderers — DONE, 141 pass / 0 fail, tsc clean.** New `src/reconstruction_graph_render.ts`
  (`renderConversationDag`/`renderFileDag`/`renderGraphs`). Relocated `shortenChangeId` AND `getBaseName`
  to a new shared `src/reconstruction_labels.ts` (one canonical home, no re-export shim); `render_list.ts`
  now imports them. Column alignment computed per-render over the turns being shown (kind + base-name
  widths) so it reproduces the plan's exact spacing.
- **Part 2 graph model + builders — DONE, 137 pass / 0 fail, tsc clean.** New `src/reconstruction_graph.ts`
  (`assignTurnLetters`, `buildFileDag`, `buildConversationDag` + the `GraphTurn`/`ConvoBranch`/
  `ConversationDag`/`FileDag` types) and `BranchRole` enum in `vocabulary.ts`. Surviving-branch diverging
  turns are computed as "records below the rewind point" (via `selectPostForkRecords`) when a real fork
  exists, else all surviving file turns (linear) — this is the one place the plan's "mirror
  buildRewoundBranchHistory" rule needed adapting, because that rule (branch minus surviving-uuids) yields
  EMPTY for the surviving branch itself. Letters come from a single global `assignTurnLetters` pass
  (timestamp order, "B"-first, bijective base-26 past Z) so fileDAG and convoDAG share them.

---

## 2026-06-23:14:21:00 — S11 reconstruction (code restore then post-rewind rewrite — surviving working tree is the REWRITTEN code, abandoned pre-restore write preserved as a rewound branch; NO production-code change, the engine was already correct)
Chat title: api-from-scenarios — implement S11 (write-code-restore-rewrite) [autonomous monitor session]
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/89dc8e9e-295c-4cbd-8411-271183003dc6.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s11/s11-reconstruction-plan.md (THE plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1352.md (S10 implementation handoff — predecessor; names S11 as next)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md (spec 38 added; specs 35 and 36 cross-referenced)

### Design decisions
- **No production-code change — S11 is locked with characterization tests, not a fix.** Verified before
  coding (end-to-end CLI + direct `reconstructAll`/`reconstructBranches` drive on the real transcript):
  the engine already reports the two `multiply` (rewrite) files as the surviving working tree (surviving
  tip `d03f0078`) and preserves the abandoned `add` turn as ONE rewound branch (tip `a7ceb7ae`,
  rewindPoint `742f44f2`). The new tests are characterization/regression locks expected GREEN on arrival;
  all confirmed GREEN on the unchanged `src/`.
- **S11 is the complement of S9 — the "owner advances on a real rewrite" half of spec 36.** S9 proved a
  `code`-restore *refresh* (bumped `version`, `null` `backupFileName`) must NOT move the working-tree
  owner; S11 proves a real *rewrite* after the restore (a NEW non-null `backupFileName` at a NEW
  `version`) MUST move it. The synthetic `buildCodeRestoreThenRewriteRecords` test is the direct
  complement of S9's `buildCodeRestoreNoPostEditRecords`: same refresh (v3, null bfn), then a real rewrite
  (v4, `backup-A@v4`) that advances the owner from Wa to Wb.
- **The `@v<version>` suffix is the load-bearing distinguisher (verified).** The harness names backups
  `<path-hash>@v<version>` where `<path-hash>` derives from the file PATH, not its content; the `add` and
  `multiply` `scenario11.py` carry the IDENTICAL path-hash `ef7eb2c33a0c873b`, differing only as
  `@v2`→`@v4`. `resolveContentId` returns the FULL `backupFileName` string (suffix included), so the
  signature changes and the owner advances. A refactor comparing only the hash component would regress
  S11 (owner stuck at the `add` head) while S9/S10 still passed — the S11 tests guard exactly that.
- **S11 is the first rewind-family scenario where two branches write the SAME paths with DIFFERENT
  content.** Branch-aware reconstruction keeps them fully separate (each branch reconstructs its own
  create), so there is no cross-branch line bleed; the surviving `scenario11.py` has exactly one revision
  (the `multiply` create), the rewound one has the `add` create.

### Deviations
- **The 4 CLI regression tests went into a NEW file `tests/reconstruction_cli_s11.test.ts`, as the plan's
  Task 2a directed** — `tests/reconstruction_cli.test.ts` is at 246/250 and four more tests would breach
  the hard 250-line cap. This follows the per-scenario split S10 established
  (`tests/reconstruction_cli_s10.test.ts`). The assertions are modelled on the S7 CLI tests (the existing
  single-surviving-plus-single-rewound shape, identical in structure to S11).
- **No RED phase.** Per the plan's "On the absence of a RED phase", S11 has no failing behavior to fix —
  the engine is already correct. Each of the 7 new tests was run and confirmed GREEN on the unchanged
  `src/`. No production-code change was fabricated to manufacture a RED→GREEN cycle (doing so would risk
  regressing S1–S10).

### Tradeoffs
- **Per-scenario CLI test file vs. splitting the rewind-family (S7–S11) CLI tests into one shared file.**
  Chose the per-scenario file again: minimal/surgical (touches no existing green tests), matches the S10
  precedent. The shared-rewind-family split is a larger refactor of unrelated passing tests; still
  deferred. `reconstruction_cli.test.ts` remains at 246 — future rewind scenarios will keep needing their
  own files until a family split is done.

### Open questions
- **None blocking.** The plan's locked decisions (1–5) are confirmed by the verified ground truth and the
  green suite; they mirror S7–S10's accepted conventions. Carried-forward, out-of-scope items (flagged in
  the plan's Risks, unrelated to S11): (1) a rewrite that *edits* rather than fully overwrites a restored
  file (multi-revision surviving history) is not in scope — note for a future slice; (2) the
  `@v<version>`-only distinction is lightly guarded — a future transcript rewriting a file to its
  pre-restore content (same path-hash AND version) would not advance the owner; track if it appears; (3)
  `parseRedirect` mis-parses `2>&1` / `>/dev/null` (its own future hardening slice).

## 2026-06-23:13:52:00 — S10 reconstruction (conversation-only rewind with no post-edit — the kept files ARE the surviving working tree; NO production-code change, the engine was already correct)
Chat title: api-from-scenarios — implement S10 (conv-only-no-post-edit) [autonomous monitor session]
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/8150bb15-5769-46bb-98dc-a0fed57d2fe2.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s10/s10-reconstruction-plan.md (THE plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1342.md (S10 planning handoff — input to this session)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1322.md (S9 implementation handoff — predecessor)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md (spec 37 added; specs 35 and 36 cross-referenced)

### Design decisions
- **No production-code change — S10 is locked with characterization tests, not a fix.** Verified
  before coding (end-to-end CLI + direct `reconstructAll`/`reconstructBranches` drive on the real
  transcript): the engine already reports the two kept files as the surviving working tree (surviving
  tip `bfd9d428`), with zero rewound branches. S10 is the *isolated* instance of spec 35 (the
  conversation-only case with no accompanying `code` rewind) and a *strict no-op* for spec 36.
- **Why S10 is a no-op for the spec-36 content signature (the crux for spec 37):** a conversation-only
  rewind never touches disk, so the post-rewind `file-history-snapshot` records repeat the SAME
  `version` (`v2`) AND the SAME non-null `backupFileName`. There is no version bump and no `null`-bfn
  refresh (the opposite of S9's `code`-restore churn `v3→v4→v5`/null). So the working-tree owner is
  stable under BOTH the old `{path → version}` rule and the spec-36 signature — it settles at
  `bfd9d428` and never moves. S10 confirms the S9 fix in isolation.
- **The new synthetic branch test exercises the real-backup carry-forward path** that S8's existing
  `buildConversationRewindRecords` (null bfn) does not: `buildConversationOnlyRewindRealBackupRecords`
  repeats a non-null `backupFileName` (`backup-A@v2`) across the conv-only refresh, driving
  `resolveContentId`'s carried `set` path. The null-bfn conv-only variant is already locked by S8's
  `test_find_conversation_branches_survives_working_tree_not_final_head` — not duplicated.

### Deviations
- **The 3 CLI regression tests went into a NEW file `tests/reconstruction_cli_s10.test.ts`, not into
  `tests/reconstruction_cli.test.ts` as the plan's Task 2a literally said.** Reason: adding them inline
  pushed `reconstruction_cli.test.ts` to 276 lines, over the project's hard 250-line cap (PostToolUse
  hook + verify-gate filesize check both enforce it). A per-scenario CLI test file mirrors the existing
  per-scenario engine-test split (`reconstruction_engine_s9.test.ts`, `reconstruction_engine_s10.test.ts`).
  The main CLI test file is back at 246 lines; the new file is 39. Test names, assertions, and the
  `runCli` invocation style are exactly as the plan specified.
- **No RED phase.** Strict red-green TDD writes a failing test first, but S10 has no failing behavior to
  fix — the engine is already correct. Per the plan's "On the absence of a RED phase", the 6 new tests
  are characterization/regression locks expected GREEN on arrival; each was run and confirmed GREEN on
  the unchanged `src/`. This is the project's established no-op-slice pattern (S9 Task 2). No
  production-code change was fabricated to manufacture a RED→GREEN cycle.

### Tradeoffs
- **Per-scenario CLI test file vs. splitting the rewind-family (S7–S10) CLI tests into one shared
  file.** Chose the per-scenario file: it is the minimal/surgical change (touches no existing green
  tests) and matches the engine-test precedent. The shared-rewind-family split would be a larger
  refactor of unrelated passing tests; deferred. Note: `reconstruction_cli.test.ts` at 246 lines is
  near the cap, so S11's CLI tests will likely also need their own file (or a family split then).

### Open questions
- **None blocking.** The plan's locked decisions (1–5) are confirmed by the verified ground truth and
  the green suite; they mirror S7–S9's accepted conventions. Two pre-existing, out-of-scope items
  carried from the S8/S9 handoffs remain open and unrelated to S10: the default view does not visually
  flag that a (file-history-invisible) rewind occurred, and `parseRedirect` mis-parses `2>&1` /
  `>/dev/null` (its own future hardening slice).

## 2026-06-23:13:21:00 — S9 reconstruction (code restore to older code with no post-edit — surviving working tree is the restored code; working-tree change detected by content identity, not the version counter)
Chat title: api-from-scenarios — implement S9 (code-restore-no-post-edit) [autonomous monitor session]
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/172cf527-ac51-430c-bd3f-0a0c47b3cd85.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s9/s9-reconstruction-plan.md (THE plan executed)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1313.md (S9 planning handoff — input to this session)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1243.md (S8 implementation handoff — predecessor)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md (spec 36 added; spec 35 cross-referenced as refined)

### Design decisions
- **Working-tree change is detected by content identity (carried-forward `backupFileName`), not the
  `version` counter.** This REVISES S8's locked decision #3. A `code` restore with no post-edit emits
  trailing "refresh" snapshots that bump each file's `version` (v3→v4→v5 on S9) while content is
  unchanged (their `backupFileName` is `null`). The S8 `{path → version}` key changed on every refresh,
  so it wrongly named the last refresh (`b71764ed`, on the read-only branch) as the working-tree owner.
  `findWorkingTreeOwner` now builds a per-snapshot content signature: per path, the last-known non-null
  `backupFileName` carried forward across null-bfn refreshes. Refreshes keep the same signature → the
  owner stays at `f1b8dede` (the restored-code write turn).
- **The freshly-written-file concern (why S8 chose `version`) is handled by the PATH SET.** A file's
  first tracked version reports `backupFileName: null`; carried forward that is the `NEVER_BACKED_UP`
  placeholder. But a brand-new file ALSO changes the tracked PATH SET, and the signature keys on the
  path set too, so the write is still detected. The carry-forward only collapses *refresh* snapshots
  (same paths, null bfn, bumped version).
- **Reconstruct the restored files from the Write events already on `f1b8dede`'s branch — no synthetic
  backup-sourced revision.** The restored bytes ARE those Writes restored to disk, so reconstructing
  from the events preserves the real `changeId`s (`scenario9.py` #01PZ3yAw, test #012EzSkd) and line
  history. The final snapshot's `backupFileName` is `null` anyway, so there is nothing on disk to read.
- **Strict no-op for S1–S8.** The change is confined to `findWorkingTreeOwner`'s comparison key;
  `findSurvivingHead`'s "keep the final head when the owner is on its ancestor chain" guard is
  untouched. Verified: S8's owner is unchanged (its trailing conversation-only snapshot repeats the
  prior content id), and the full suite stayed green with S8/S7/S1 output identical.

### Deviations
- **None from the plan's GREEN code.** `src/reconstruction_worktree.ts` was rewritten verbatim to the
  plan's literal code (`NEVER_BACKED_UP`, `resolveContentId`, `buildContentSignature`,
  `findWorkingTreeOwner`), and the test files match the plan's literal RED. No CLI source change was
  needed (the plan predicted this; the S7 all-branches renderer already produces correct S9 output once
  the owner is content-aware).
- **The 3 CLI regression test assertions were written against the captured real-transcript output**
  rather than transcribed from the plan's prose, then confirmed to match the plan's prediction (plain
  list, `--list-branches` single `surviving tip #f1b8dede`, `--surviving` both files). Same behavior,
  evidence-based assertions.

### Tradeoffs
- **`version` is retained in the data but no longer used for change detection.** Considered keeping a
  combined version+content key; rejected — version is precisely the field the harness bumps on refresh,
  so including it reintroduces the bug. Content identity alone is the correct discriminator.
- **The default S9 view does not visually flag that a rewind/restore occurred** (it renders like a
  plain S1-style session). Surfacing "a code restore happened" would touch the renderer for ALL
  scenarios — out of scope (plan decision #5; see Open questions / Risks).

### Open questions
- **Default-view rewind indicator (out of scope, decision #5).** Should the default output flag that a
  `code` restore produced the surviving tree, even when the abandoned branch has no distinct file
  history? Today S9 is indistinguishable from a plain session in the default view.
- **Entirely-null-backup transcripts.** The fix tolerates a null final `backupFileName` via
  carry-forward, but a transcript whose snapshots are *entirely* null-bfn would degrade to
  path-set-only detection. No such scenario is in scope; flag if one appears.
- **`parseRedirect` `2>&1` / `>/dev/null` mis-parse (S5 regression)** carried forward from the S8
  handoff — still open, unrelated to S9, track as its own hardening slice.

## 2026-06-23:12:40:00 — S8 reconstruction (repeated code-restore rewinds + a final conversation-only rewind — surviving working tree from file-history snapshots, not the final conversation head)
Chat title: api-from-scenarios — S8 (repeated-code-restore-rewinds) implement plan
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/b4c30907-c6d8-4cd5-92f3-319980aa7fbf.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s8/s8-reconstruction-plan.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1220.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1152.md (S7, the architecture this builds on)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md (spec 35 added)

### Design decisions
- **Surviving working tree comes from the `file-history-snapshot` records, not the final conversation
  head.** A `code` rewind restores the working tree; a conversation-only rewind does not. S8 ends with
  a conversation-only rewind, so v_c (the last code written) stays on disk while the final `last-prompt`
  head (step-12 `Hello`) wrote nothing. `findWorkingTreeOwner` returns the `messageId` of the LAST
  snapshot whose `{path → version}` tracked set changed; `findSurvivingHead` maps that owner up to its
  conversation head. (Confirmed with the user before coding — the principled, S9-ready choice over the
  rejected "abandoned branch with the latest write" heuristic.)
- **No-op-for-S1–S7 guard kept as written.** When the working-tree owner is on the final head's
  ancestor chain (every non-rewind and `code`-rewind-ending transcript), keep the final head. Only S8's
  conversation-only divergence takes the new branch. Verified: S7 surviving tip stays `#77494da3`,
  S1–S6 byte-identical (109 tests green, the 105 pre-CLI run included the S7/S1 sanity specs).
- **Change detection keys on `version`, not `backupFileName`.** `version` is always present and
  monotonic; `backupFileName` is null for a file's first tracked version (would compare equal-to-absent).

### Deviations
- **`findHeadAtOrAbove` parent guard split into two single-condition `if`s** instead of the plan's
  literal `if (parent === undefined || parent === null)`. Reason: the project's mandatory
  single-condition-branching rule, and the sibling walkers (`collectAncestorUuids`, `findRewindPoint`)
  already split them this way. Behaviorally identical.
- **`tests/reconstruction_engine_s8.test.ts` helper params typed `FileHistory[]`** (the plan's literal
  `scriptOf(histories)`/`testFileOf(histories)` were untyped). Reason: `noImplicitAny` makes an untyped
  param a hard `tsc` error; the verify gate requires `tsc` clean. Imported `FileHistory` type-only.
- **No CLI source change** (as the plan predicted). The S7 all-branches renderer already produces the
  correct surviving-v_c + two-rewound output once `findSurvivingHead` is working-tree-aware; Task 2 only
  added the four regression tests that lock it in.

### Tradeoffs
- **Two new leaf modules (`reconstruction_tree.ts`, `reconstruction_worktree.ts`) rather than inlining
  into `reconstruction_branch.ts`.** Forced by the 250-line cap (`reconstruction_branch.ts` was 241/250)
  and the acyclic-import constraint: the snapshot/tree helpers depend only on `structures/*`, never the
  engine/extract. Mirrors S7's `reconstruction_branches.ts` split. The walkers moved to their canonical
  home (`reconstruction_tree.ts`) and `reconstruction_branch.ts` imports them back — no re-export shim.

### Open questions
- None blocking. Flagged for S9 (`s9-code-restore-no-post-edit`): the final action is a `code` restore
  to OLDER code with no new write; the snapshot tracked-set still CHANGES at the restore, so this same
  mechanism should point the surviving head at the restored code. Validate against the S9 transcript when
  planning it. (The rejected "latest write wins" shortcut would fail S9.)
- Carried-forward, not S8: `parseRedirect` mis-parses `2>&1` / `>/dev/null` (S5 regression). S8 never
  triggers it; track as a separate `parseRedirect` hardening slice.

## 2026-06-23:11:50:00 — S7 reconstruction (conversation rewind / code restore — branch-aware, rewound branches preserved)
Chat title: api-from-scenarios — S7 (minimal-code-restore) implement plan
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/f58fac66-0c73-4855-977e-f82fd5c7fa82.jsonl

### References

/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s7/s7-reconstruction-plan.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1119.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md
S7 JSONL: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s7-minimal-code-restore/d0d14660-4477-40fa-824c-e7f0bb91cd66.jsonl

### Design decisions

- **A rewind is a `parentUuid` fork; the surviving branch is named by the FINAL `last-prompt`'s
  `leafUuid`.** Not by counting fork points (attachments are routine siblings of user records, so
  fork-counting yields false positives and never says which child survived). `last-prompt` heads in
  file order are the conversation's branch tips; the last one is the surviving head. A branch's
  records = its tip's `parentUuid` ancestor chain + every uuid-less meta/header record (meta records
  carry no `uuid`, so keeping them preserves what the sidecar/session lookup needs while the
  ancestor test drops abandoned messages).
- **Rewound branches are PRESERVED and retrievable, never discarded (user directive, reversed
  mid-plan).** A rewind is an unmerged git branch; its file changes stay reconstructable like
  `git log <unmerged-branch>`. `reconstructBranches` returns `surviving` + one `RewoundBranchHistory`
  per rewound branch (rewind point + tip + the histories of files changed AFTER the rewind). The
  engine's `reconstructAll`/`reconstructFile` still return the surviving branch only (the "current
  files" API); the all-branches view is the CLI's default rendering.
- **The engine was split into a branch-agnostic core + a surviving-default public API.**
  `reconstructFileOver`/`reconstructFilesOver` reconstruct over EXACTLY the records given (no
  filtering); `extractFileEvents` does no filtering either. Branch selection happens only in the
  public API (`selectLiveBranch`) and in `reconstructBranches` (`selectBranchRecords` per branch).
  This is what makes reconstructing a NON-surviving branch possible — the whole point of S7.
- **Rewound-branch scoping by diverging changeId.** A rewound branch is reported only if its
  diverging records (past the rewind point) carry ≥1 file event, and its histories are filtered to
  those files (changes "after the rewind"). On S7 this excludes the `#72` Read/`ls` tangent (no file
  change) and keeps the v1 branch (two Writes born post-fork).
- **CLI default = all branches**, with a no-rewound passthrough (byte-identical to the old plain
  list, so S1–S6 are unchanged). `--surviving` (kept files only), `--list-branches` (one summary
  line per branch), `--branch <tip-short-id>` (one branch; composes with `--target`/`--diff`/
  `--verbose`; unknown id throws the usage message + available ids). `shortUuid` (first 8 chars of a
  tip uuid) is the one canonical branch short-id, distinct from the renderer's `toolu_`-trimming
  changeId shortener.

### Deviations

- **Two filesize-cap-driven deviations from the plan's literal module placement (split, never
  condense).** (1) The plan named `reconstruction_branches.ts` only for Task 3; but Task 2's core
  alone pushed `reconstruction_engine.ts` to 261/250, so the branch-agnostic CORE
  (`reconstructFileOver`/`reconstructFilesOver` + copy-seed helpers) moved there too. Engine.ts is
  now 224 lines, branches.ts 120. (2) `reconstructBranches` + its types stayed IN
  `reconstruction_engine.ts` (the plan's stated home and the test's import path) — engine.ts had
  room (224) and re-exporting would violate the no-forwarding-layers rule.
- **`BranchedReconstruction` gained a `survivingTip: Uuid | undefined` field** not in the plan's
  literal type. The `--list-branches` summary and the `## surviving` header both need the surviving
  tip; the type symmetrically already carries each rewound tip, so the surviving tip belongs there.
  `undefined` only for an unmarked transcript with no `last-prompt` head (the defensive fallback).
- **`reconstruction_branches.ts` has no paired test file** (a PostToolBatch warning). Its two
  exported core functions are exercised transitively by every existing engine/CLI test plus the new
  `reconstruction_engine_s7.test.ts`; the split was behavior-preserving (all 88 prior tests stayed
  green across it), so a dedicated unit test would duplicate coverage. The branch *model* logic that
  is genuinely new (`reconstruction_branch.ts`) does have its own paired test.

### Tradeoffs

- **`--target` now filters reconstructed histories by exact final path** rather than re-running
  `reconstructFile` for that one path. Equivalent for non-renamed files and for renamed files
  addressed by their final path (every existing case); it would differ only if a caller addressed a
  renamed file by its PRE-rename name, which no test or scenario does. Chosen for uniform branch
  composition (one `renderChosen` shared by every branch view) per the plan's design.
- **Maximal-tip dedup walks each abandoned head's ancestor set** (O(heads²) ancestor walks). Fine
  for the handful of heads a real transcript has; not optimized for pathological head counts.

### Open questions

- None blocking. Confirm at S8 planning: the leaf-ancestor walk + maximal-tip dedup is built to
  handle multiple independent rewinds, but a rewind nested INSIDE an already-rewound branch (a tree
  deeper than two levels) is untested — `s8-repeated-code-restore-rewinds` is where to verify/extend.

## 2026-06-23:10:56:00 — S6 reconstruction (`git mv` rename with cwd-relative path resolution)
Chat title: api-from-scenarios — S6 (`git mv`) implement plan
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/4361c956-98cb-4629-8055-39e5bd522860.jsonl

### References

/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s6/s6-reconstruction-plan.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260623-1044.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md
S6 JSONL: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s6-git-mv/4ad1d191-23e8-41de-adfa-d182b6a1cf55.jsonl

### Design decisions

- **`git mv` is recognized by generalizing the one `mv` parser, not a sibling parser.**
  `parseMvPaths`'s regex gained an optional `git ` prefix (`^(?:git\s+)?mv\s+(\S+)\s+(\S+)$`),
  so `bashEventFrom` emits the same `RenameEvent` for `mv` and `git mv`. One canonical mv
  parser, one `RenameInfo` shape — no behavioral difference to justify duplication.
- **The rename's relative paths are resolved to absolute at the event source.** `git mv`'s
  args are cwd-relative (`s6_git.py`) while every Write/Edit target is absolute, so the rename
  endpoints are resolved against the record `cwd` via `resolveAgainstCwd` before the
  `RenameEvent` is built. Resolving once at extraction keeps every downstream lineage compare
  absolute (as it already is for Write/Edit); resolution is idempotent for absolute paths, so
  S2's absolute plain `mv` is unchanged (`test_extract_finds_rename_from_mv` still green).
- **The cwd resolver was promoted to a leaf module `src/structures/path-resolve.ts`.** It was
  private to `reconstruction_sidecar.ts`; extraction now needs it too, so it moved to one
  canonical home that imports only node `path`. A leaf module avoids any engine import cycle
  (`engine → extract` is a runtime import; routing through the sidecar would add an
  extract→sidecar edge). The sidecar now imports it; its stray `resolve` import was pruned.
- **No sidecar for S6** — `reconstructAll(records)` is called with no `BackupReader`. Every
  revision's content is in the JSONL (Write `content`, rename carry, Edit `structuredPatch`);
  the transcript has no `>>`/`>` redirect.
- **`applyEdit` stayed strict.** The pre-fix `TypeError` in `insertHunkAdditions` (the
  `goodbye()` Edit targeting `s6_git_renamed.py`, which had no base revision while `git mv`
  was unrecognized) is a symptom — recognizing the rename gives the Edit its base and the
  crash disappears. No defensive guard was added, which would mask genuinely-orphaned edits.

### Deviations

None. Executed the 3 planned tasks in order (RED→GREEN→Verify gate each). End-to-end output
matches the plan exactly: `s6_git_renamed.py` create `#01FJ4hLH` → rename `#019BbcnY` → edit
`#01CVhCVD` (6 lines, +4), plus `tests/test_s6_git.py` create `#019htcN9`. No render/engine
code changed — `getEntryLabel` and the diff renderer already handle `rename`/`edit` (S2).

### Tradeoffs

- **Generalize the regex vs. a sibling `parseGitMvPaths`** — chose generalize (DRY, one home).
- **Resolve at the event source vs. at lineage-compare time** — chose the source, so the
  rest of the pipeline keeps comparing absolute paths and no compare site changes.

### Open questions

- **Latent `2>&1` / `>/dev/null` redirect mis-parse (S5 regression), left OUT of S6 scope.**
  `parseRedirect`'s `(?<!>)>\s*(\S+)\s*$` matches a trailing `2>&1` (capturing `&1`) or
  `>/dev/null`, producing a spurious overwrite/append to a non-file target. S6's transcript
  does not trigger it (extraction yields exactly the 3 real events), so it was not fixed here.
  Recommend a dedicated hardening slice: make `parseRedirect` ignore fd-duplication (`N>&M`)
  and `/dev/null`. Confirm you want this tracked separately.
- **Commit + stray file.** Work is uncommitted per the standing convention (commit only after
  your approval). `src/Plan_Impl_template.md` is still an untracked stray unrelated to any
  slice — confirm whether to remove it or leave it before any commit.

## 2026-06-22:19:37:00 — S4 reconstruction (overwrite: a second Write to a present file)
Chat title: api-from-scenarios — S4 overwrite-file (implement plan)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ (this session)

### References

/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s4-reconstruction-plan.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260622-1922.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md
S4 JSONL: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s4-overwrite-file/58f8c26c-48d5-4e8f-953c-265005a6ee73.jsonl

### Design decisions

- **Overwrite is detected at replay time by file presence, not at extraction.** A
  write event whose file is currently present (latest revision exists and is not a
  delete) becomes an `EventKind.overwrite` revision; the first write (no prior
  revision) stays a create. `writeRevision(event, replacesPresent)` sets the kind;
  `fileIsPresent(revisions)` decides. Extraction keeps emitting plain
  `EventKind.write` events. The overwrite Write's `structuredPatch`/`originalFile`
  are deliberately not read (clean-room; consistent with S3's `originalFile`
  rejection, memory note `originalfile-not-always-populated`).
- **An overwrite is a fresh full-content revision** — every line genesis
  (`oldLineNum -1`), content from the Write's `content`, NOT an Edit-style splice.
  The diff heads it `@@ overwritten @ … @@` and shows a wholesale remove-all /
  add-all (verified on the real transcript).
- **Overwrite is its own revision kind (`EventKind.overwrite`), not a new event
  type.** There is no `OverwriteEvent`; `WriteEvent` covers both. A write after a
  delete stays a create (the file is absent), so overwrite is specifically
  "replace present content".
- **No engine/extraction/lineage code changes were needed** (Tasks 2, 3, and the
  CLI half of 6 passed on Task 1's replay change alone) — they lock behavior with
  tests, the same shape as S3's Task 4.

### Deviations

- **New record type `queue-operation` had to be modeled (plan did not anticipate
  it).** The S4 transcript carries two `queue-operation` records (a queued user
  prompt: keys `type`/`sessionId`/`operation`/`timestamp`/`content`) absent from
  S1–S3. `loadRecords` threw `UnknownRecordTypeError` before extraction ran, so the
  "no code change" Task 2 actually required: add `queueOperation = "queue-operation"`
  to `RecordType` (`vocabulary.ts`), add its allow-set to `ALLOWED_TOP_LEVEL_KEYS`
  (`loadTranscript.ts`), and extend `test_record_type_enum_holds_the_s1_wire_strings`
  (`vocabulary.test.ts`) — same precedent as AttachmentPayloadType growing 6→9 for
  S2. Modeled as discriminant only (no per-field payload type); extraction stays
  overwrite-agnostic and emits no event for it.
- **Split the engine test file, not just the render module.** Adding the two S4
  engine tests pushed `tests/reconstruction_engine.test.ts` to 269 lines (over the
  250 cap the post-tool hook enforces on every file). Per the standing "split over
  condense" preference and the render-split precedent, the S4 engine tests live in a
  new `tests/reconstruction_engine_s4.test.ts`. NB: the plan's Verify-gate command
  (`filesize_check.py src/reconstruction_*.ts`) only checks src files AND the script
  only reads `argv[1]` (a single path), so passing it multiple files silently checks
  just the first — I checked every file individually instead.

### Tradeoffs

- **Task 4 render split executed as planned** (the pre-agreed S3 remedy):
  `renderHistoryList` + its helpers moved to `src/reconstruction_render_list.ts`
  (122 lines); `reconstruction_render.ts` dropped to 128 lines (verbose + diff
  only). The unused `Uuid` and `FileHistory` imports were pruned from
  `reconstruction_render.ts` (noUnusedLocals is a hard `tsc` error). The one
  list-view test moved to `tests/reconstruction_render_list.test.ts` with its own
  inline copy fixture; `copyRevisionFixture` stays in `reconstruction_render.test.ts`
  for the diff/verbose copy tests.
- **Overwrite diff reuses the existing `removedLines`/`addedLines` helpers.** Because
  every overwrite line is genesis (`oldLineNum -1`), `removedLines` drops every
  previous line and `addedLines` adds every new one — a full replace falls out of
  the existing machinery; only the `overwritten` header is new.

### Open questions

- None blocking. All six tasks landed RED→GREEN; final gate: `npm test` → 73 pass /
  0 fail, `npx tsc --noEmit` clean, every src+test file ≤ 250 lines. The locked
  default-view format matches the real S4 transcript. Commit pending user approval —
  S2, S3 and S4 are all still uncommitted; confirm whether to commit them together or
  separately, and what to do with stray untracked files (`src/Plan_Impl_template.md`,
  `plans/.gitignore`).

---

## 2026-06-22:18:51:00 — S3 reconstruction (copy `cp` lineage as a first-class genesis entry)
Chat title: api-from-scenarios — S3 copy-file (implement plan)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/39244c72-eeba-4e65-a030-b901aa08d33b.jsonl

### References

/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s3-reconstruction-plan.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260622-1847.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md
S3 JSONL: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s3-copy-file/ac6edd6f-cc4e-4423-87f9-468530849db5.jsonl

### Design decisions

- **A copy is its own event kind (`EventKind.copy`), not a rename.** The `cp` yields
  TWO independent histories (source survives, destination is new), so a copy is kept
  out of the rename chain and `reconstructAll(S3)` returns three histories.
- **A copy's genesis content is the reconstructed SOURCE state as of the copy time**,
  not the destination Edit's `originalFile` field — clean-room, evidence-based, and
  generalizes to a source edited after the copy.
- **Seed recursion lives in the engine** (it needs `reconstructFile` as a value) with a
  `resolving: Set<string>` cycle guard, preserving the type-only import direction from
  the mechanics modules.

### Deviations

- **Plan said "import `CopyInfo` (type-only)" into `reconstruction_render.ts`.** It
  is not imported there. `renderRenameArrow` was generalized to
  `renderPathArrow(transition: { from: Path; to: Path })` using an inline
  structural type, which made the `RenameInfo` import unused too. Both type names
  were dropped from render's imports rather than left dangling, because the project
  builds with `noUnusedLocals`/`noUnusedParameters` (an unused import is a hard
  `tsc` error, codes 6133/6196). `CopyInfo` is still imported type-only in
  `reconstruction_extract.ts`, where it is actually used. No behavior change.
- **Seed helpers kept in `reconstruction_engine.ts` (no `reconstruction_seed.ts`
  split).** The plan offered the split only if the engine crossed 250 lines; it
  sits at 213, so the recursion stays with `reconstructFile` as planned.

### Tradeoffs

- **`reconstruction_render.ts` is now 249/250 lines.** S3 added the copy branches
  in place rather than splitting the list view (filesize_check exit 0). The next
  line added to that file will force the planned split into
  `reconstruction_render_list.ts` (+ `tests/reconstruction_render_list.test.ts`).
  Chose not to pre-split now to keep the S3 diff minimal and avoid a churny move
  with no current need; flagged so the next editor isn't surprised.

### Open questions

- None blocking. All six tasks landed RED→GREEN; the locked default-view format
  matches the real S3 transcript byte-for-byte. Commit pending user approval (S2
  work is also still uncommitted — confirm whether to commit S2 and S3 together or
  separately).

---

## 2026-06-22:17:47:00 — S2 reconstruction (Edit splice + rename lineage + paired changeId)
Chat title: api-from-scenarios — S2 reconstruction (implement plan)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/bd46ed56-7c1c-46cf-8d5e-e299733cffb6/

### References

/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s2-reconstruction-plan.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260622-1715.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md
S2 JSONL: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s2-move-file/1e82511e-05a3-4712-9a95-206b24128694.jsonl
Planning convo JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/17715352-f1da-442f-a848-778d6e26e905.jsonl

### Design decisions

- **`kind` on every `FileRevision`** (`EventKind`): replay is now a left-fold
  (`replayEvents` → `appendRevisionsForEvent`) that may append more than one
  revision per event and can read the previous one, so each revision records the
  evidence kind that produced it. `UnsupportedEventKindError` guards unmodeled
  kinds (fog-of-war; mirrors `UnknownToolNameError`).
- **Hunk-driven Edit splice (Rule 2, coarse `-`/`+`).** Each Edit hunk with any
  `-` mints a removal revision; with any `+`, an addition revision — both carry
  the Edit's `changeId` (so the pair never delinks). Survivors keep their previous
  index as `oldLineNum`; inserted lines are born `-1`. `015b59mN` → 2 revisions
  (5 then 6 lines); the pure-insertion `016L3mk1` → 1. No `-`→`+` sub-diff.
- **`changeId` = the originating tool_use id** (the existing `Uuid` from the parse
  layer), as in S1 — deterministic + provenance; a paired remove/add shares it
  automatically.
- **`structuredPatch` read from the user record's top-level `toolUseResult`**
  (an `EditResult`), keyed back to the Edit via the `tool_result` block's
  `tool_use_id` (`indexEditHunksByToolUseId`). Write results carry `[]`.
- **Rename is a first-class carried-forward entry** (locked decision): the `mv`
  becomes its own revision (kind `rename`, `rename: { from, to }`, the mv's
  `changeId`) that carries the prior line snapshot forward with identity
  `oldLineNum` and mints no content change.
- **Merge by lineage** (locked decision): `reconstructFile` follows the rename
  chain (`buildRenameChain` → `resolveFinalPath`) to the file's final path and
  replays every event whose content path resolves there; `reconstructAll` keys
  histories by `distinctFinalPaths`, so a renamed file is ONE history keyed by
  `s2_moved.py` and `reconstructAll(S2)` returns exactly two.
- **`--diff` is now `oldLineNum`-driven** (real changes only): additions =
  entries born here (`-1`); removals = previous indices no current entry points
  back to. A rename renders as `@@ renamed A → B @@` / `revision N rename A → B`
  with no churn. The S1 genesis/delete diffs still come out as all-`+` / all-`-`.
- **Default CLI view = `renderHistoryList`**: per file, numbered entries with
  kind label, line count + `(+N)`/`(−N)` delta (or the rename arrow), short time
  (`HH:MM:SSZ`), and short changeId (`toolu_` stripped, 8 chars). Matches the
  plan's locked format; verified against the real S2 transcript.

### Deviations

- **Split into more modules than the plan named.** The plan said "if the engine
  nears the 250-line cap, split replay/lineage into `reconstruction_replay.ts`."
  Replay + lineage together still exceeded the cap (252 lines), and the engine's
  own extraction pushed it to 278, so I split into **three** new modules:
  `reconstruction_extract.ts` (records→events), `reconstruction_replay.ts`
  (events→revisions), `reconstruction_lineage.ts` (rename following). Each is well
  under 250 with full comments, and each has a paired test
  (`tests/reconstruction_{extract,replay,lineage}.test.ts`). This follows your
  stated preference to split over condense and the project's paired-test
  convention. No re-export/forwarding shims — callers import from the canonical
  module (e.g. tests import `extractFileEvents` from `reconstruction_extract.ts`,
  `splitLines` from `reconstruction_replay.ts`).
- **Extraction/`splitLines` tests relocated.** The S1 extraction spec and the
  trailing-newline spec moved out of `reconstruction_engine.test.ts` into the
  extract/replay test files to match where the code now lives; the engine test
  keeps the `reconstructFile`/`reconstructAll` specs.
- **CLI default-view test rewritten.** The old `(N revisions)` one-liner format is
  gone; `test_run_cli_default_lists_touched_files` now asserts the per-entry list.

### Tradeoffs

- **Edit-diff lines keep the `+ `/`- ` (space) prefix** of the S1 diff, so the new
  edit-diff test asserts `+ def goodbye():` (with the space), not the plan's
  illustrative `+def goodbye():`. Chosen for consistency with the existing S1
  render and to avoid editing the S1 diff test; the behavioral intent (show only
  real `+`/`-` lines) is met.
- **No runtime import cycle.** `reconstruction_engine.ts` holds the model types
  and imports the mechanics (extract/replay/lineage) as *values*; those modules
  import the types back *type-only* (erased), so there is no value cycle.
- **`mv` parser is the s2 form only** (`mv <src> <dst>`, two paths, no flags),
  mirroring S1's `rm <path>` parser. Flags/globs/multi-arg `mv` are deferred until
  a scenario emits them (fog of war).

### Open questions

None blocking. Per the plan, **the work is committed only after you approve** —
the working tree currently holds the S2 implementation uncommitted. Possible
follow-ups when their scenarios arrive: the `-`→`+` fine-grained sub-diff (Rule
2's deferred half), reads/observations appending to `values[]`, and `cp` lineage.

## 2026-06-22:15:05:00 — Per-line reconstruction engine (S1 slice)
Chat title: api-from-scenarios — strict typing + DRY refactor, then handoff
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/a905e9cc-9ea3-4a7e-a989-1b5e5a8896e5.jsonl

### References

/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/src/reconstruction_engine.ts
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/tests/reconstruction_engine.test.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/docs/engine-b-overview.md

### Design decisions

- **Built only the S1 slice of the design doc.** Specs for paired-changeId,
  oldLineNum chaining, and the revision-boundary rule are deferred — they need
  Edit/observation evidence that S1 doesn't emit.
- **Generic over files, not S1-named.** `reconstructFile(records, target)` is the
  per-file primitive and `reconstructAll(records)` reconstructs **every file the
  transcript touches** — so `tests/test_s1_delete.py` (created, never deleted) gets
  its own create-only history, not just the deleted `s1_delete.py`. Only the
  *evidence kinds* (write/delete) are fog-of-war limited, not the interface.
- **`EventKind` lives in `vocabulary.ts`** (coding-requirements §2: every enum has
  one canonical home), imported directly by engine and tests — no re-export shim.
- **CLI takes the transcript path as a required arg** (no hardcoded S1 default);
  `--target <path>` narrows to one file, else all touched files are rendered.
- **Split into three files by concern** (engine / render / cli), each with a
  paired test — per your preference to split rather than condense comments or
  single-line expressions to fit the 250-line cap. Runnable entry moved to
  `src/reconstruction_cli.ts`; `reconstruction_engine.ts` is now pure library.
- **`changeId` derived from the originating tool_use id** (per your call):
  deterministic runs + provenance. S1's create/delete come from different tool_use
  blocks → distinct changeIds, as the spec requires.
- **Extraction reads tool_use INPUT blocks**, not tool_result records: both the
  Write content (`input.content`) and the rm command (`input.command`) live in the
  tool_use input, so one pass over assistant records suffices — no tool_use↔result
  join needed for S1.
- **Reused the existing parse layer** (`loadTranscript`, `getContentBlocks`,
  `ToolName`/`BlockType`, `Path`/`Uuid`) as the extraction substrate.
- **Design doc moved out of the engine file.** The agreed model now lives in
  `plans/reconstruction-engine-design.md`; the source file stays under the project
  250-line cap with a one-line pointer.

### Deviations

- **Did not use subagents.** Scenario JSONLs are outside the worktree and the loop
  is a tight red→green TDD cycle needing `npm test`/`tsc`/`filesize_check` between
  steps — serial main-agent work was correct, as in the S2 slice.

### Tradeoffs

- **Events stamped at tool_use (issue) time** (the assistant block's timestamp) —
  the single source that already carries both the Write content and the rm
  command. Correct for S1; if a future scenario's evidence needs completion-time
  accuracy, that gets handled when that scenario arrives (fog of war).
- **`--diff` uses a trivial remove-all/add-all diff**, valid because S1's
  transitions are genesis (empty→N) and delete (N→empty), which never partially
  overlap. A real LCS line-diff arrives with S2's Edits, when it's needed.

### Open questions

None. S1 is fully modeled; later evidence kinds (edit, read, mv/cp, verdict) get
modeled when their scenarios introduce them — not before.

## 2026-06-22:14:40:00 — S2 (s2-move-file) parsing capabilities
Chat title: api-from-scenarios — strict typing + DRY refactor, then handoff
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/a905e9cc-9ea3-4a7e-a989-1b5e5a8896e5.jsonl

### References

/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-programming-re-compiled-blanket.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/coding-requirements.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260622-1345.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s1/01-extract-jsonl-structures-plan.md
S2 JSONL: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s2-move-file/1e82511e-05a3-4712-9a95-206b24128694.jsonl

### Design decisions

- **`StructuredPatchHunk` is now a real type** `{ oldStart, oldLines, newStart,
  newLines, lines: string[] }` (was `Record<string, never>`). s2's Edit results
  reveal it. `WriteResult.structuredPatch` stays `StructuredPatchHunk[]`; an empty
  `[]` still satisfies the new element type, so the s1 Write test is unchanged.
- **Hunk fields stay primitive.** Line ranges are `number`, diff `lines` are raw
  `+`/`-`/` ` text — free-form, no domain type (coding-requirements rule 1's
  "numbers/genuinely free-form text stay primitive").
- **`ReadResult` nests a `file` object** (`ReadFile`) matching the wire shape
  `{ type, file: { filePath, content, numLines, startLine, totalLines } }`. Only
  `file.filePath` is hydrated to `Path`; line counts stay numeric.
- **`EditResult` has no `type` field** (recon confirmed) — modeled exactly as
  emitted: `{ filePath, oldString, newString, originalFile, structuredPatch,
  userModified, replaceAll }`.
- **Gate vs. discriminant validation are separate.** `loadTranscript` validates
  record `type` + top-level keys only; it does NOT check tool names, attachment
  kinds, or block types (those are validated by their own accessors). So the s2
  acceptance test went green from the single `isMeta` gate fix; Read/Edit and the
  3 attachment kinds needed their own driving tests.
- **`ReadInput`/`EditInput` added** alongside the existing `BashInput`/`WriteInput`
  — declared but not constructed (input hydration still has no consumer), purely
  for vocabulary completeness.
- **Extracted `findToolResult(file, toolName)` test helper** (DRY, rule 3) and
  refactored the s1 Bash/Write tests onto it, removing three copies of the
  index-and-scan loop.

### Deviations

- **Did not use subagents for implementation** (the /implement skill suggests
  parallel subagents). The change set is small, tightly coupled, and gated by a
  strict red→green TDD loop that needs `npm test` + `tsc` run between each step —
  serial work in the main agent was correct here. Subagents WERE used during
  research (one verified symlink readability).

### Tradeoffs

- **`EditResult.originalFile: string`** (not `string | null`). Fog-of-war: s2
  emits a string for both Edits. Memory note `originalfile-not-always-populated`
  says it's absent on some Edits in other transcripts, so a later scenario may
  force `string | null` or optional. Modeled to s2's reality, flagged here.
- **Result `type` fields** (`WriteResult.type` "create", `ReadResult.type`
  "text") kept as plain `string`, consistent with the existing `WriteResult.type`.
  Promote to an enum only if a later scenario makes it a load-bearing discriminant.

### Open questions

1. **`EditResult.originalFile` cardinality** — keep `string`, or widen to
   `string | null` / optional now in anticipation of scenarios where it's absent?
   (Fog-of-war says keep `string` until a scenario forces the change.)
2. **Result `type` as an enum?** Should `"create"`/`"text"`/`"update"` become a
   `ToolResultType` discriminant enum, or stay free-form strings until needed?
3. **Handoff correction worth saving to memory:** subagents CAN now read the
   scenario JSONLs via the in-worktree `scenarios/` symlink (verified). The
   handoff's "subagents cannot read the Desktop path" is outdated. (Per your
   decision, fixtures still use absolute Desktop paths to match s1.)

## 2026-06-23:09:15:00 — S5 bash-redirect (`>>` append, `>` overwrite) via the file-history sidecar
Chat title: api-from-scenarios — S5 implementation
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/575b1aed-bd52-478e-a7ac-faf407c18225.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s5/s5-reconstruction-plan.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/reconstruction-engine-design.md (specs 24–28, Code-layout)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/coding-requirements.md

### Design decisions
- **Implemented the plan's 9 tasks in order, RED→GREEN, verify gate after each.** Final: 84 tests green (was 73), `tsc --noEmit` clean, every file ≤250 lines.
- **`>>` append = carried-prefix + genesis-suffix revision** (`EventKind.append`): prior lines carry forward with identity back-pointers (`carryAt`), the appended tail is genesis (`DOES_NOT_EXIST_YET`). `appendRevision` lives in the new `reconstruction_replay_edit.ts`. Append-to-absent creates the file (kind `write`).
- **`>` overwrite reuses the S4 overwrite path** — `OverwriteEvent` routes through `writeRevision(event, fileIsPresent(...))`; no new line logic.
- **Redirect content comes from the file-history sidecar, never the `echo` command** — `fillRedirectContent` reads the backup blob named by the first non-null `file-history-snapshot` taken strictly after the redirect, through an injected `BackupReader`. Tests use an in-memory map; the CLI builds the real on-disk reader (`~/.claude/file-history/<sessionId>/`).
- **Split `reconstruction_replay.ts` (247→127 lines)** into `reconstruction_replay_edit.ts` (primitives + Edit splice + `appendRevision`); one-directional import (replay → edit), no cycle.
- **`DOES_NOT_EXIST_YET` (= -1) sentinel** extracted to the leaf module `src/structures/line-model.ts`, replacing every genesis `-1` across src and tests.
- **Verb-renamed the 8 list-view helpers** (`baseName`→`getBaseName`, `entryLabel`→`getEntryLabel`, …) per coding-requirements rule 5.

### Deviations
- **DEVIATION (load-bearing): snapshot paths are cwd-relative, not absolute.** The plan's sidecar assumed `trackedFileBackups` keys matched the event's absolute target. They do not — Claude Code keys backups by the path **relative to the session cwd** (e.g. `s5_redirect.txt`), while events carry the absolute path. Without handling this, every redirect resolved to empty content (append showed 1 line, overwrite 0). Fix: `findCwd(records)` + `resolveAgainstCwd` resolve each snapshot path against the transcript `cwd` before matching; `resolve()` leaves an already-absolute path unchanged, so the rule stays correct if a future transcript stores absolute keys. Locked with `test_fill_matches_a_cwd_relative_snapshot_path_to_an_absolute_target` (Task 5) and end-to-end by the real-transcript Task 7/9 tests.
- **DEVIATION (test strengthening, Task 9):** the plan's CLI test only asserted the `append`/`overwrite` labels + a change id — these appear even with **no** reader wired (the event *kind* is set at extraction), so the test was green before the GREEN step and did not drive the reader. Strengthened it to assert the recovered line counts (`append … 2 lines`, `overwrite … 1 lines`), which require the real sidecar reader — a true RED that drives the wiring.
- **DEVIATION (test scoping, Task 8):** the plan's diff test asserted `!out.includes("+ line one")` over the whole multi-block diff, but the create revision legitimately emits `+ line one`. Scoped the negative assertions to the `@@ appended …@@` block (`appendedBlockOf`) — the actual intent ("the carried prefix is not re-emitted *in the append block*").

### Tradeoffs
- **cwd resolution via `path.resolve` over basename-matching:** basename matching would also pass S5 (one file) but collides when two files share a name in different dirs; resolving against cwd is correct and general. Cost: a `findCwd` scan of the records.
- **`reconstruction_engine.ts` is at 248/250 lines** after threading the optional `BackupReader` through `reconstructFile`/`reconstructLineage`/`seedCopyEvents`/`seedOneCopy`/`reconstructAll`. The next engine change will likely need a split (precedent: replay/render splits).

### Open questions
1. **The sidecar alignment rule assumes ≤1 mutation to a path between two non-null snapshots.** S5 satisfies it (one mutation per turn). A future scenario that mutates one file twice between snapshots would leave the intermediate state unrecoverable from the sidecar — flag it then.
2. **`reconstruction_engine.ts` at 248/250** — pre-emptively split (e.g. move the copy-seed recursion) before S6, or wait until a change forces it?
