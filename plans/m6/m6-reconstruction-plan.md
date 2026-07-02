# Reconstruction Plan — Scenario **m6** (`m6-cp-user-edit-rewind`)

> **TYPE: REAL ENGINE FIX** (not a characterization lock). m6 is the FIRST engine-code change
> since S23/S19. Two `src/` files change (+21/−2); the rewound branch was reconstructing
> `m6_derived.py` WRONG (a duplicated line). The fix is small, scoped, and was prototyped live
> against this exact transcript (315 → all green with the new tests) then reverted. Follow §4 and §5
> verbatim.

---

## 1. Goal

Make `reconstruction_cli` reconstruct the **rewound branch** of `m6_derived.py` correctly. m6 is a
`cp`-fork (m1 pattern) of `m6_source.py` → `m6_derived.py`, then a USER out-of-band edit inserts
`# derived version` into the copy, Claude adds `transform()`, a `Rewind: 2, code` discards
`transform()`, and Claude adds `validate()` instead. This produces TWO branches of `m6_derived.py`:

- **surviving** (tip `#1d474d0b`): `copy → # derived version → validate()` — **already correct.**
- **rewound** (tip `#9b69e66c`, rewind @ `#a2903cef`): `copy → # derived version → transform()` —
  **was WRONG**: the engine dropped the `# derived version` user edit from the rewound base and the
  `transform()` Edit spliced onto the bare 6-line copy, **duplicating `return self.name`**.

After the fix, the rewound branch reconstructs as the 10-line v2 ground truth with NO duplicate.

### 1.1 Why m6 is distinct from every prior scenario

- FIRST scenario combining a **`cp`-fork** (m1) with a **user edit on the forked copy** AND a **code
  rewind** (m5/S19/S20) — the user edit lands on the copy, then the rewind forks the copy's history.
- FIRST time the **stale-edit-base reseed** (S19/S23) must fire on a **rewound branch** where the
  pre-edit on-disk snapshot is timestamped **slightly AFTER** the edit's tool-use time. The existing
  `findBackupAtOrBefore` lookup misses it (off by 22 ms), so the reseed was inert and the bug showed.
- The bug is the **first observed wrong OUTPUT on a rewound branch** in the m-series (m1–m5 rewound
  branches were already correct or char-locked). m6's rewound endpoint is **reader-dependent**:
  without a `BackupReader` the duplicate persists (unlike m5, whose endpoint was reader-independent).

---

## 2. Ground truth (VERIFIED live against the engine at HEAD `91ac563` + uncommitted m2–m5)

### 2.1 Scenario source & inputs

- Scenario script: `scenarios/m6-cp-user-edit-rewind.txt`.
- Executed transcript (worktree copy, used for live CLI runs):
  `scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl`.
- Fixture path (Desktop copy, used by the tests — mirrors M1–M5):
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl`
- Final on-disk files present in the executed folder are the **surviving** state
  (`m6_derived.py` = 10-line validate version; `m6_source.py` = 6-line describe version).

### 2.2 Event ladder (by real timestamp — the executed order matches the script)

| # | time (Z) | op | file | result |
|---|----------|----|------|--------|
| B | 16:07:00.224 | Write | m6_source.py | 3 lines (`class Base` + `__init__`) |
| C | 16:07:00.978 | Write | tests/test_m6_source.py | 5 lines |
| D | 16:07:25.109 | Edit | m6_source.py | +`describe()` → 6 lines |
| E | 16:07:36.963 | `cp` (copy) | m6_source.py → m6_derived.py | copy born = source@cp = 6 lines (describe) |
| — | 16:07:51.688 | USER out-of-band edit (record `8897e505`) | m6_derived.py | inserts `# derived version` → 7 lines (v1) |
| F | 16:07:55.524 | Edit | m6_derived.py | +`transform()` (base = 7-line v1) → 10 lines (v2) **[REWOUND lineage]** |
| — | 16:07:42.629 | **Rewind point** (`a2903cef`) | — | conversation forks here; F is abandoned |
| G | 16:08:21.524 | USER edit (disk-echo at the post-rewind Read, record `e4073b7d`) | m6_derived.py | `# derived version` re-surfaces → 7 lines **[SURVIVING lineage]** |
| H | 16:08:39.202 | Edit | m6_derived.py | +`validate()` (base = 7-line) → 10 lines **[SURVIVING]** |

**Key subtlety (the crux of the whole scenario):** the ORIGINAL out-of-band user edit (`8897e505`,
16:07:51) is on the **abandoned** lineage (after the rewind point) and `extractFileEvents` emits NO
file event for it — so the rewound branch's `m6_derived` raw events are just `[copy(E), edit(F)]`,
with no user-edit revision. On the **surviving** branch, `# derived version` re-enters via a SEPARATE
disk-echo user-edit (`e4073b7d`, 16:08:21) at the post-rewind Read — a different changeId. The
file-history backups confirm the true rewound tip content is v2 (10 lines with `# derived version`):

| backup | time (Z) | lines | content |
|--------|----------|-------|---------|
| `b90d0fcb711472b4@v1` | 16:07:55.546 | 7 | copy + `# derived version` (PRE-transform) — **the reseed source** |
| `…@v2` | 16:08:01.155 | 10 | v1 + `transform()` (the true rewound tip) |
| `…@v3` | 16:08:22.664 | 7 | rewind landing (back to v1) |
| `…@v4` | 16:08:44.888 | 10 | v1 + `validate()` (surviving final, = on-disk) |

### 2.3 Reconstructed revisions — AFTER THE FIX (VERIFIED live via `reconstructBranches`)

Branch identities: `survivingTip = 1d474d0b-85f5-4f62-bec4-7eb34442d9d6`,
`rewound tip = 9b69e66c-55b9-490d-bf1f-98ce3a1b7d00`,
`rewindPoint = a2903cef-f7d2-4571-ab1e-4d46e3930e67`.

**SURVIVING (3 histories) — UNCHANGED by the fix:**

- `m6_source.py` — 2 revisions:
  - rev0 `write` `toolu_01D7RkYdAhqVBjjH6gop73kh` → `class Base:\n    def __init__(self):\n        self.name = "base"`
  - rev1 `edit` `toolu_01DzkUDT6BTgoXgmm5Y6h58L` → +`describe()` (6 lines)
- `tests/test_m6_source.py` — 1 revision:
  - rev0 `write` `toolu_019p5w7NmPmEMNV1VXNgxp1f` → `from m6_source import Base\n\n\ndef test_base_name():\n    assert Base().name == "base"`
- `m6_derived.py` — 3 revisions:
  - rev0 `copy` `toolu_015JzRDQkRA9zZhDqeVkGiRJ` → 6 lines (describe, NO `# derived version`)
  - rev1 `user-edit` `e4073b7d-904d-4a1d-86c5-6885693b04de` → 7 lines (`# derived version`)
  - rev2 `edit` `toolu_012Rfp8iTv1iBP4H4KXa7bmE` → 10 lines (`validate()`)

**REWOUND (1 history) — THE FIX:**

- `m6_derived.py` — 3 revisions:
  - rev0 `copy` `toolu_015JzRDQkRA9zZhDqeVkGiRJ` → 6 lines (describe, NO `# derived version`)
  - rev1 `overwrite` **`b90d0fcb711472b4@v1`** (synthetic backup-seed) → 7 lines (`# derived version`)
  - rev2 `edit` `toolu_01PDWMdwZBP6xsqb5kc4es8K` → 10 lines (`transform()`, **NO duplicate**)

### 2.4 Final reconstructed content (byte-identical to ground truth)

Surviving `m6_derived.py` final (rev2):
```
class Base:
    def __init__(self):
# derived version
        self.name = "base"

    def describe(self):
        return self.name

    def validate(self):
        return True
```

Rewound `m6_derived.py` final (rev2) — **= backup v2**:
```
class Base:
    def __init__(self):
# derived version
        self.name = "base"

    def describe(self):
        return self.name

    def transform(self):
        return self.name.upper()
```

### 2.5 The BUG (what the engine produced BEFORE the fix, on the rewound branch)

Without the fix, the rewound `m6_derived.py` was **2 revisions** `[copy, edit]` and the edit revision
was 10 lines with a **duplicated `return self.name`** and **no `# derived version`**:
```
class Base:
    def __init__(self):
        self.name = "base"

    def describe(self):
        return self.name
        return self.name          ← SPURIOUS DUPLICATE
                                  ← (and # derived version is MISSING)
    def transform(self):
        return self.name.upper()
```
This exact wrong output is ALSO what the engine produces **WITHOUT a reader** even after the fix
(the fix is reader-dependent) — engine test §5.4 locks that.

### 2.6 Exact CLI output (captured live — byte source-of-truth for the §6 CLI tests)

`reconstruction_cli <m6.jsonl>` (default, two DAGs):
```
══ conversationDAG ══
A  prompt  #a2903cef   (rewind point)
│
├─ branch rewound (rewound; tip #9b69e66c; rewind @ #a2903cef)
│  F  edit       m6_derived.py  #01PDWMdw
│
└─ branch surviving (surviving; tip #1d474d0b)
   G  user-edit  m6_derived.py  #e4073b7d
   H  edit       m6_derived.py  #012Rfp8i

══ fileDAG ══
m6_source.py
  B  write      #01D7RkYd
  D  edit       #01DzkUDT
test_m6_source.py
  C  write      #019p5w7N
m6_derived.py
  E  copy       #015JzRDQ
  F  edit       #01PDWMdw
  G  user-edit  #e4073b7d
  H  edit       #012Rfp8i
```

`--list-branches`:
```
surviving  tip #1d474d0b    m6_source.py, test_m6_source.py, m6_derived.py
rewound    tip #9b69e66c  rewind @ #a2903cef    m6_derived.py
```

`--branch 9b69e66c --verbose` (rewound) — m6_derived.py, 3 revisions:
```
revision 0  copy  …m6_source.py → …m6_derived.py  @ 2026-06-18T16:07:36.963Z  (6 lines)
     1 | class Base:
     2 |     def __init__(self):
     3 |         self.name = "base"
     4 | 
     5 |     def describe(self):
     6 |         return self.name

revision 1  @ 2026-06-18T16:07:55.546Z  (7 lines)
     1 | class Base:
     2 |     def __init__(self):
     3 | # derived version
     4 |         self.name = "base"
     5 | 
     6 |     def describe(self):
     7 |         return self.name

revision 2  @ 2026-06-18T16:07:55.524Z  (10 lines)
     1 | class Base:
     2 |     def __init__(self):
     3 | # derived version
     4 |         self.name = "base"
     5 | 
     6 |     def describe(self):
     7 |         return self.name
     8 | 
     9 |     def transform(self):
    10 |         return self.name.upper()
```

---

## 3. Root cause (why the duplicate appears)

The `transform()` Edit `F`'s structuredPatch (verbatim from the JSONL): `oldStart=5`, with three
context lines `[" ", "     def describe(self):", "         return self.name"]` then three `+` adds
(`+""`, `+"    def transform(self):"`, `+"        return self.name.upper()"`). Its `originalFile` is
the 7-line v1 (WITH `# derived version`). So the patch was computed against the 7-line v1 base.

`insertHunkAdditions` (`src/reconstruction_replay_edit.ts:113`) carries context lines **by index,
without checking their text**. Against the CORRECT 7-line v1 base, `oldStart=5` lands the context
window on `[blank, describe, return]` and the splice is clean → 10-line v2. But the rewound branch
reconstructs the base as the **6-line copy** (the `# derived version` user edit is absent), so
`oldStart=5` slides the window by one: the third context line `return self.name` resolves at index 6,
which is **past the 6-line base**, and `resolveContextLine` (`:96`) materialises it as a **genesis
line** → the duplicate.

Why the base is the 6-line copy: the original out-of-band user edit (`8897e505`) yields no file event
(see §2.2), so the rewound `m6_derived` lineage is `[copy, edit]`. The S19/S23 stale-edit reseed
(`seedStaleEditBases`/`editBaseIsStale` in `reconstruction_branches.ts`) **correctly DETECTS** the
stale base (context `blank` ≠ base `def describe`), but its recovery via `backupSeedWriteFor` returns
`undefined`: `findBackupAtOrBefore` requires a backup with `backupTime ≤ edit.timestamp`, and the
only pre-edit backup (`@v1`, 16:07:55.**546**) is **22 ms AFTER** the edit (16:07:55.**524**) — the
user edit and the edit that consumes it share one turn, so the pre-edit snapshot lands just after the
edit record. With no seed, the reseed is inert and the duplicate survives.

---

## 4. The fix (2 files, +21/−2 — VERIFIED: prototyped live, all tests green, then reverted)

Reuse the existing reseed machinery; only broaden where it looks for the pre-edit backup, scoped to
the stale-edit reseed path so the S12 first-event-edit semantics are untouched.

### 4.1 `src/reconstruction_sidecar.ts`

**(a)** Add a helper immediately AFTER `findBackupAtOrBefore` (before `seedEditBaseFromBackup`):

```ts
// The first non-null backup point of `target` taken strictly after `when` — the pre-edit content when
// the file-history snapshot capturing it was timestamped just AFTER the edit's tool-use time (m6: a
// user edit and the edit that follows it land in the same turn, so the pre-edit snapshot lands 22ms
// after the edit record). The BackupPoint variant of findBackupAfter (the seed needs its backupTime).
function findBackupPointAfter(
    timeline: Map<string, BackupPoint[]>,
    cwd: Path | undefined,
    target: Path,
    when: Date,
): BackupPoint | undefined {
    const points = timeline.get(resolveAgainstCwd(cwd, target)) ?? [];
    return points.find(
        (point) => point.backupFileName !== null && point.backupTime.getTime() > when.getTime(),
    );
}
```

**(b)** Add an `includeAfter` parameter (default `false`) to `backupSeedWriteFor` and fall back to the
helper ONLY when no at-or-before backup exists:

```ts
export function backupSeedWriteFor(
    records: TranscriptRecord[],
    target: Path,
    when: Date,
    reader: BackupReader,
    includeAfter: boolean = false,
): WriteEvent | undefined {
    const cwd = findCwd(records);
    const timeline = buildBackupTimeline(records, cwd);
    const atOrBefore = findBackupAtOrBefore(timeline, cwd, target, when);
    const base =
        atOrBefore ?? (includeAfter ? findBackupPointAfter(timeline, cwd, target, when) : undefined);
    if (base === undefined || base.backupFileName === null) {
        return undefined;
    }
    return {
        kind: EventKind.write,
        changeId: new Uuid(base.backupFileName.toString()),
        target,
        content: reader(base.backupFileName),
        timestamp: base.backupTime,
    };
}
```

### 4.2 `src/reconstruction_branches.ts` — NET-ZERO LINE CHANGE (file is AT the 250-line cap)

In `staleEditSeedFor`, pass `true` for the new `includeAfter` arg. Change ONLY the call line — do NOT
add comments here (the file is exactly 250 lines; any added line breaks the size hook):

```ts
// BEFORE:
    return backupSeedWriteFor(records, event.target, event.timestamp, reader);
// AFTER:
    return backupSeedWriteFor(records, event.target, event.timestamp, reader, true);
```

### 4.3 Why this is safe (do not skip — this is the reasoning behind every line)

- The fallback is gated by `includeAfter`, passed `true` ONLY from `staleEditSeedFor`. The other
  caller, `seedEditBaseFromBackup` (spec-39 first-event-edit), keeps the default `false`, so the S12
  test `test_seed_passes_through_when_no_backup_precedes_the_edit` (which locks "later backup ⇒ no
  seed" for the first-event case) STAYS GREEN.
- The fallback only runs when `findBackupAtOrBefore` returns `undefined` (`??`), so every existing
  reseed (m5/S19/S23, all of which have an at-or-before backup) is byte-for-byte unchanged.
- `staleEditSeedFor` only calls this when `editBaseIsStale` is already `true` — i.e. the reconstructed
  base is PROVEN wrong — so seeding from the nearest later snapshot can only improve correctness.
- Verified empirically: with the fix, `npm test` = 315 pass / 0 fail (no regressions) AND the rewound
  `m6_derived` is correct; without the fix the rewound branch shows the duplicate.

---

## 5. Tasks (TDD order — write each test RED first where possible, then apply §4 to GREEN it)

### Task 1 — Baseline & fixture
1. Confirm baseline: `npm test` = **315 pass / 0 fail**; `npx tsc --noEmit` clean; `git diff src/` empty.
2. Append to `tests/fixtures.ts` after the `M5_JSONL` constant (currently the last line, ~line 87):
```ts
export const M6_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl";
```

### Task 2 — Apply the engine fix (§4)
Apply §4.1 and §4.2 exactly. Then `npx tsc --noEmit` must be clean and `npm test` still 315 (the fix
alone changes no existing test outcome — it only adds the after-fallback on a path no current fixture
exercises except m6, whose tests come next).

### Task 3 — Sidecar unit tests (`tests/reconstruction_sidecar.test.ts`, +2 tests)
Add two tests next to `test_seed_passes_through_when_no_backup_precedes_the_edit` (reuse its
`buildCwdRecord`/`buildSnapshotRecord`/`buildEditEvent` helpers and a reader returning a known blob):
1. `test_seed_recovers_later_backup_when_includeAfter_true` — same setup as the passthrough test (only
   backup is AFTER the edit), but call `backupSeedWriteFor(records, target, when, reader, true)`
   directly and assert it RETURNS a `WriteEvent` whose `changeId` is the after-backup blob name and
   whose `content` is what the reader returns. (Proves the new fallback fires.)
2. `test_seed_prefers_at_or_before_over_later_when_both_exist` — two backups, one before and one after
   the edit; `backupSeedWriteFor(..., true)` must return the BEFORE one (locks the `??` precedence so
   the fallback never overrides a valid pre-edit backup).

### Task 4 — Engine lock (`tests/reconstruction_engine_m6.test.ts`, 5 tests)
Mirror `tests/reconstruction_engine_m5.test.ts` exactly (same imports, `finalTextOf`,
`historyEndingWith`, `loadRecords`, in-memory reader). In-memory reader — the v1 backup blob:
```ts
const M6_BACKUPS: Record<string, string> = {
    "b90d0fcb711472b4@v1":
        'class Base:\n    def __init__(self):\n# derived version\n        self.name = "base"\n\n    def describe(self):\n        return self.name\n',
};
const m6Reader: BackupReader = (name) => M6_BACKUPS[name.toString()] ?? "";
```
`historyEndingWith` suffixes MUST lead with a slash (`/m6_derived.py`) — `test_m6_source.py` is fine,
but `m6_source.py` would also match `test_m6_source.py` without the leading slash. Tests:

1. **`test_m6_surviving_three_histories_source_test_derived`** — `branches.surviving.length === 3`;
   `m6_source.py` = 2 revs `[write, edit]` ending at the 6-line describe version; `test_m6_source.py`
   = 1 `write` rev; `m6_derived.py` = 3 revs `[copy, userEdit, edit]`.
2. **`test_m6_surviving_derived_ends_at_validate_with_derived_comment`** — surviving `/m6_derived.py`
   rev2 `finalTextOf` === the 10-line validate ground truth (§2.4), and rev1 is `userEdit` with
   changeId `e4073b7d-904d-4a1d-86c5-6885693b04de` and the 7-line `# derived version` text.
3. **`test_m6_rewound_derived_is_copy_overwrite_edit_three_revisions`** (THE FIX) —
   `branches.rewound.length === 1`; `rewound.tip === "9b69e66c-55b9-490d-bf1f-98ce3a1b7d00"`;
   `rewound.rewindPoint === "a2903cef-f7d2-4571-ab1e-4d46e3930e67"`; `/m6_derived.py` = 3 revs with
   kinds `[copy, overwrite, edit]`; rev2 `finalTextOf` === the 10-line transform ground truth (§2.4).
4. **`test_m6_rewound_overwrite_is_backup_recovered_derived_comment`** (THE CRUX) — rewound
   `/m6_derived.py` rev1 kind `overwrite`, changeId `"b90d0fcb711472b4@v1"`, `finalTextOf` === the
   7-line `# derived version` text.
5. **`test_m6_rewound_requires_reader_else_duplicate_persists`** (reader is LOAD-BEARING) — call
   `reconstructBranches(loadRecords(M6_JSONL))` WITHOUT a reader; rewound `/m6_derived.py` = 2 revs
   `[copy, edit]`; assert the final text **contains** `"        return self.name\n        return self.name"`
   (the duplicate). Then with `m6Reader` assert the final text **does NOT** contain that duplicate.
   (Proves the reader+fix recover correctness; this is the bug's regression guard.)

### Task 5 — CLI lock (`tests/reconstruction_cli_m6.test.ts`, 5 tests)
Mirror `tests/reconstruction_cli_m5.test.ts` (import `runCli`, `M6_JSONL`). Assert with `out.includes(...)`
against the §2.6 byte output:

1. **`test_m6_default_conversationDAG_shows_rewind_two_branches`** — includes
   `"A  prompt  #a2903cef   (rewind point)"`,
   `"branch rewound (rewound; tip #9b69e66c; rewind @ #a2903cef)"`,
   `"F  edit       m6_derived.py  #01PDWMdw"`,
   `"branch surviving (surviving; tip #1d474d0b)"`,
   `"G  user-edit  m6_derived.py  #e4073b7d"`, `"H  edit       m6_derived.py  #012Rfp8i"`.
2. **`test_m6_default_fileDAG_groups_three_files`** — includes the `m6_derived.py` block
   `"m6_derived.py\n  E  copy       #015JzRDQ\n  F  edit       #01PDWMdw\n  G  user-edit  #e4073b7d\n  H  edit       #012Rfp8i"`
   and `"m6_source.py\n  B  write      #01D7RkYd\n  D  edit       #01DzkUDT"`.
3. **`test_m6_list_branches_surviving_three_files_rewound_one`** — includes
   `"surviving  tip #1d474d0b    m6_source.py, test_m6_source.py, m6_derived.py"` and
   `"rewound    tip #9b69e66c  rewind @ #a2903cef    m6_derived.py"`.
4. **`test_m6_surviving_verbose_derived_ends_at_validate`** — `runCli([M6_JSONL, "--surviving", "--verbose"])`
   includes the 10-line validate block
   `'(10 lines)\n     1 | class Base:\n     2 |     def __init__(self):\n     3 | # derived version\n     4 |         self.name = "base"\n     5 | \n     6 |     def describe(self):\n     7 |         return self.name\n     8 | \n     9 |     def validate(self):\n    10 |         return True'`.
5. **`test_m6_rewound_branch_verbose_transform_no_duplicate`** (THE FIX BYTE-LOCK) —
   `runCli([M6_JSONL, "--branch", "9b69e66c", "--verbose"])` includes the 7-line seed block
   (`revision 1 … (7 lines)` with `# derived version`) and the 10-line transform block ending
   `'    10 |         return self.name.upper()'`, and assert it **does NOT** include the duplicate
   `"     6 |         return self.name\n     7 |         return self.name"`.

### Task 6 — Docs (3 edits)
1. **`plans/roadmap.md`** line 30: flip `[ ] M6 ->` to `[x] M6 -> [x]` with a one-liner summarising
   the scenario, the bug, the fix (`findBackupPointAfter` + `includeAfter`), and the new test count.
2. **`plans/implementation-notes-api-from-scenarios.md`**: PREPEND a new `## <timestamp> — m6 …`
   entry ABOVE the m5 entry (newest-first), noting this is the first real engine fix since S19/S23.
3. **`plans/reconstruction-engine-design.md`**: after the m5 note (ends ~line 282, just before the
   `- src/structures/path-resolve.ts` bullet) append an m6 note describing the rewound `cp`+user-edit
   case and the `findBackupPointAfter`/`includeAfter` after-fallback in `backupSeedWriteFor`.

### Task 7 — Full verification
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test              # expect: tests 327 / pass 327 / fail 0   (315 + 12 new)
npx tsc --noEmit      # expect: clean
git diff --stat src/  # expect: reconstruction_sidecar.ts + reconstruction_branches.ts ONLY (+21/-2)
P="scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --branch 9b69e66c --verbose 2>/dev/null
# expect: m6_derived.py 3 revisions; rev2 = the 10-line transform v2; NO duplicated return self.name
```
Prove each new test bites: temporarily break the fix (revert §4.2's `true`) and confirm the rewound
engine/CLI tests + the duplicate-guard go RED, then restore.

### Task 8 — Commit (on user approval ONLY) then create handoff
Stage EXACTLY these files — never `git add -A` (m2–m5 commits are separate outstanding decisions):
`src/reconstruction_sidecar.ts`, `src/reconstruction_branches.ts`, `tests/reconstruction_sidecar.test.ts`,
`tests/reconstruction_engine_m6.test.ts`, `tests/reconstruction_cli_m6.test.ts`, `tests/fixtures.ts`,
`plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`,
`plans/reconstruction-engine-design.md`, `plans/m6/`. Suggested message: `Implemented m6 handling`.
Then **create a completion handoff** via `/jot:handoff-prompt` (this is an explicit task — do it even
if nothing is committed).

---

## 6. Acceptance criteria (Definition of Done)

1. `npm test` = **327 pass / 0 fail** (315 baseline + 12 new: 2 sidecar + 5 engine + 5 CLI).
2. `npx tsc --noEmit` clean.
3. `git diff --stat src/` shows ONLY `reconstruction_sidecar.ts` and `reconstruction_branches.ts`
   (+21/−2); `reconstruction_branches.ts` stays ≤ 250 lines; `reconstruction_sidecar.ts` ≤ 250.
4. Rewound `m6_derived.py` reconstructs as 3 revisions ending at the 10-line `transform()` v2 with NO
   duplicated `return self.name`; surviving branch byte-identical to on-disk (§2.4).
5. The reader-load-bearing guard (engine §5.5) and the duplicate byte-lock (CLI §5.5) both bite when
   the fix is reverted (verified in Task 7).
6. S1–S23 + m1–m5 reconstructions byte-for-byte unchanged (covered by the existing 315 staying green).
7. (User approval only) committed per Task 8; completion handoff written.

---

## 7. Reference map (cite in impl-notes)

- Bug locus: `src/reconstruction_replay_edit.ts:113` `insertHunkAdditions` (carries context by index;
  `resolveContextLine:96` materialises the past-the-base context line as the duplicate).
- Why the base was short: `src/reconstruction_branches.ts:71` `editBaseIsStale` (correctly detects),
  `:92` `staleEditSeedFor` → `:101` `backupSeedWriteFor` returned `undefined` pre-fix.
- The fix: `src/reconstruction_sidecar.ts` `findBackupPointAfter` + `backupSeedWriteFor(includeAfter)`;
  `src/reconstruction_branches.ts:101` passes `true`.
- Branch assembly: `src/reconstruction_engine.ts:222` `buildRewoundBranchHistory` (passes the reader);
  `src/reconstruction_branch.ts:172` `selectBranchRecords`.
