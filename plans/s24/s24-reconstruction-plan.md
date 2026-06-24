# Reconstruction Plan — Scenario **S24** (`s24-script-rename-functions`)

> **Bottom line for the implementer:** S24 is a **characterization / regression LOCK**.
> The engine ALREADY reconstructs S24 byte-perfect with **zero `src/` change**. Your job is to
> ADD tests that pin the load-bearing behavior, ADD the fixture, and ADD the docs — nothing more.
> If, while implementing, ANY test cannot be made GREEN without touching `src/`, **STOP and
> escalate** — that would mean the live ground truth in §2 has drifted and the plan must be revised.

---

## 1. Goal

Add a fixture, an engine lock test, a CLI lock test, and three doc edits that lock the engine's
**already-correct** reconstruction of S24, taking the suite from **337 → 347 tests** (5 engine + 5
CLI) with **no `src/` change**.

### 1.1 What S24 is

S24 is the first scenario where a tracked file is rewritten by an **external script run through the
Bash tool** — not by Claude's Edit/Write tools. The script ladder (from
`scenarios/s24-script-rename-functions.txt`):

1. Write `order_utils.py` (a ~149-line order/billing module with terse function names
   `calc_tot`, `fmt_money`, `chk_stock`, `mk_order`, `apply_disc`, …) + `tests/test_order_utils.py`.
2. Edit `order_utils.py` — add `validate_items`.
3. Edit `order_utils.py` — add `order_line`.
4. **Write `rename_funcs.py` and run it with `python3` via the Bash tool** — it does a whole-word
   rename `calc_tot→calculate_total`, `fmt_money→format_currency`, `chk_stock→check_stock`,
   `mk_order→build_order`, `apply_disc→apply_discount` by `open()`/`read()`/`re.sub`/`write()`.
   **The scenario explicitly forbids using Edit/Write to rename — the change happens only through
   the script.** So there is NO Edit/Write tool_use for `order_utils.py` at this step.
5. Edit `order_utils.py` — add `print_receipt` (references the now-renamed `calculate_total`,
   `format_currency`).
6. Edit `order_utils.py` — add `apply_loyalty` (references the renamed `apply_discount`,
   `format_currency`).

### 1.2 Why S24 reconstructs correctly anyway — the HAS-BEACON rule

The script write leaves **no Edit/Write record**, so on its own it is invisible to the engine.
What rescues S24 is a **beacon**: immediately after the script runs, the Claude Code harness
auto-snapshots the changed file and injects it as an `edited_text_file` **attachment** record
(uuid `859347d2…`, the full renamed file in `cat -n` format). The engine's existing S15 machinery
turns that snapshot into a `user-edit` revision carrying the renamed content.

This is exactly the distinction drawn by the sibling **RevEng "Script-Execution-as-Authored-Event"**
work (APPROVED spec/plan/tasks at
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/{spec,plan,tasks}-script-execution-replay.md`).
Its forward-validation premise (for NO-BEACON reconstruction) is:

> 1. Find the **beacon** after the script run (first content-establishing observation, ts > `T_exec`).
> 2. Rewind the observed edits in `(T_exec, beacon]` newest-first off the beacon → the **immediate
>    post-script state** ("PostScriptBeacon").
> 3. Take the **pre-script state**, run it forward through the script.
> 4. If `forward(pre) == PostScriptBeacon`, the script-run phase reconstructed correctly — inject the
>    transform forward as a synthetic event; else **flag, never fabricate**.
>
> *"The script-replay mechanism is **only needed for files with no post-script observation
> anywhere** (NO-BEACON). If a beacon exists, the file reconstructs correctly **from the beacon alone —
> no script-replay required** (HAS-BEACON / CLEARS-VIA-ENGINE)."*

**S24 is the clean-room HAS-BEACON case, and a degenerate one at that.** Mapping S24 onto the
premise above:
- `T_exec` = the `python3 rename_funcs.py` run (result returns at 20:12:44).
- The **beacon** is the `edited_text_file` attachment at **20:12:44.611**, injected as part of that
  Bash result turn. There are **zero edits between `T_exec` and the beacon** (the Read is 20:12:55,
  Edit H is 20:13:03 — both *after* it). So step 2's rewind is a **no-op**: **PostScriptBeacon == the
  beacon content directly** — the immediate post-script state is *directly observed*, not synthesized.
- Because the post-script state is observed, the `api-from-scenarios` engine **adopts the beacon as
  the post-script revision (the rev3 `user-edit`)** — it does NOT run the script forward and does NOT
  need forward-validation. Forward-validation and the script transform exist only to *synthesize* a
  post-script state when none was observed (NO-BEACON); S24 never reaches that path.

So S24 needs **no script-execution-replay feature** in `api-from-scenarios`. The two opaque
`python3 rename_funcs.py` Bash runs are **not parsed as file ops** (unlike m3's `>>` redirects) and
produce zero file events — and they don't need to, because the beacon carries the post-script content.

### 1.3 Why S24 is distinct from every prior scenario

| Prior | S24 differs |
|---|---|
| S15–S23 user-edits | Those `edited_text_file` attachments come from a **human/IDE** out-of-band edit. S24's attachment is triggered by a **script** (`python3`) run via Bash — the first script-driven trigger of the disk-echo path. The engine treats them identically (it cannot distinguish), which is exactly the behavior to lock. |
| m3 bash-redirect | m3's `>>` appends were **parsed from the Bash command** and recovered from file-history backups (reader-DEPENDENT). S24's `python3 script.py` is **opaque** — not parsed — and is recovered purely from the in-JSONL attachment beacon (**reader-INDEPENDENT**). |
| m5/m6/m7 rewinds | S24 is **linear** — one surviving branch, no rewind, no rewound branch. |

---

## 2. Ground truth (VERIFIED LIVE against the engine at worktree HEAD `3d3ac15`, suite 337 green)

> Everything in §2 was captured by running the real CLI/engine over the S24 transcript. Treat these
> as the exact assertions. If a re-run disagrees, STOP — do not "fix" the engine to match the plan.

### 2.1 Scenario source & inputs
- Script: `scenarios/s24-script-rename-functions.txt`
- Executed output (JSONL + rendered files): `scenarios/executed/s24-script-rename-functions/`
- **The fixture transcript (canonical Desktop path, mirroring every other `S*_JSONL`/`M*_JSONL`):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s24-script-rename-functions/c46c3db9-b5ac-4c20-adf8-9f33caa8359c.jsonl`
  (confirmed present at that path under that UUID.)

### 2.2 Event ladder (by real timestamp; the rename happens via the OPAQUE python runs)

| ev | time (Z) | record | order_utils.py effect |
|----|----------|--------|------------------------|
| B  | 20:08:40 | Write `order_utils.py` `toolu_01FaKcvA` | rev0 — 149 lines, terse names |
| C  | 20:08:44 | Write `tests/test_order_utils.py` `toolu_011XNwv9` | (sibling) |
| –  | 20:08:48 | Bash `python3 tests/test_order_utils.py` | test run — **0 file events** |
| D  | 20:09:04 | Edit `order_utils.py` `toolu_01SZaQbN` | rev1 — +`validate_items` → 167 lines |
| E  | 20:09:20 | Edit `order_utils.py` `toolu_0135G5yN` | rev2 — +`order_line` → 187 lines |
| F  | 20:09:34 | Write `rename_funcs.py` `toolu_01VJfcDh` | (sibling) |
| –  | 20:09:38 | Bash `python3 rename_funcs.py && echo … && grep …` `toolu_01UXpBov` | **OPAQUE — 0 file events** |
| –  | 20:09:47 | Bash `python3 rename_funcs.py` `toolu_013fPYsT` | **OPAQUE — 0 file events** (rewrites the file on disk) |
| **G** | **20:12:44.611** | **`attachment` record `859347d2-3413-439f-ba38-3ab7ee61474c`, `attachment.type = edited_text_file`, filename `order_utils.py`** | **rev3 — THE BEACON → `user-edit`, 187 lines, FULLY RENAMED** |
| –  | 20:12:55 | Read `order_utils.py` `toolu_01FFzd1J` | (read — no revision) |
| H  | 20:13:03 | Edit `order_utils.py` `toolu_01RbGtzf` | rev4 — +`print_receipt` → 216 lines |
| I  | 20:13:15 | Edit `order_utils.py` `toolu_01R5ouKe` | rev5 — +`apply_loyalty` → 234 lines (FINAL) |

The `edited_text_file` attachment G is the ONLY evidence of the rename. Its snippet is the full
renamed file (contains `calculate_total`, no whole-word `calc_tot`). The subsequent Edits H and I
replay cleanly on the renamed base — the engine's recorded Edit base (`originalFile`) already shows
the renamed disk, so the S19/S23 stale-edit-base reseed stays **INERT** (no spurious overwrite).

### 2.3 Reconstructed revisions for `order_utils.py` (VERIFIED via `reconstructBranches`)

Exactly **6 revisions**, kinds `[write, edit, edit, userEdit, edit, edit]`:

| rev | kind | lines | changeId | renamed? |
|----|------|------|----------|----------|
| 0 | write    | 149 | `toolu_01FaKcvA…` | no (terse) |
| 1 | edit     | 167 | `toolu_01SZaQbN…` | no (terse) |
| 2 | edit     | 187 | `toolu_0135G5yN…` | no (terse) |
| 3 | **userEdit** | 187 | **`859347d2-3413-439f-ba38-3ab7ee61474c`** | **YES (renamed)** |
| 4 | edit     | 216 | `toolu_01RbGtzf…` | YES |
| 5 | edit     | 234 | `toolu_01R5ouKe…` | YES |

- rev3 content length = **5063 chars**; final rev5 content length = **6478 chars**, **234 lines**.
- rev3 contains `calculate_total`, `format_currency`, `check_stock`, `build_order`, `apply_discount`
  and contains NO whole-word `calc_tot`/`fmt_money`/`chk_stock`/`mk_order`/`apply_disc`
  (note `apply_disc` is a substring of `apply_discount` — match on the whole-word `def ` headers, see §5).

### 2.4 Final reconstructed content (byte-identical to ground truth)
The final rev5 text equals `scenarios/executed/s24-script-rename-functions/order_utils.py`
**byte-for-byte** (234 lines, ending with the `print_receipt` `TOTAL  {}` block). Verified via diff
(identical). The renamed `def` headers present in the final: `def calculate_total(items):`,
`def format_currency(n):`, `def check_stock(item, qty):`, `def build_order(items):`,
`def apply_discount(total, pct):`; plus `def print_receipt(order):` and `def apply_loyalty(total, member):`.
None of the terse headers (`def calc_tot(`, `def fmt_money(`, `def chk_stock(`, `def mk_order(`,
`def apply_disc(`) appear.

### 2.5 S24 is READER-INDEPENDENT (the key regression guard)
`reconstructBranches(records)` (NO reader) and `reconstructBranches(records, anyReader)` produce
**byte-identical** `order_utils.py` histories — same 6 revisions, same final text. **Verified live.**
This proves the rename content is sourced from the **in-JSONL attachment snippet**, NOT from
file-history backups — i.e. S24 is HAS-BEACON and needs no `BackupReader`. (Contrast m3/m5/m6/m7,
which are reader-dependent.)

### 2.6 Branch shape — LINEAR
One surviving branch, **no rewound branch**: `branched.rewound.length === 0`, surviving tip
`#fba814f7`, three files: `order_utils.py`, `tests/test_order_utils.py`, `rename_funcs.py`.

### 2.7 Exact CLI output (captured live — the byte source for the §6 CLI tests)

**Default (no flags) — both DAGs:**
```
══ conversationDAG ══
A  prompt  #d4147463
  B  write      order_utils.py       #01FaKcvA
  C  write      test_order_utils.py  #011XNwv9
  D  edit       order_utils.py       #01SZaQbN
  E  edit       order_utils.py       #0135G5yN
  F  write      rename_funcs.py      #01VJfcDh
  G  user-edit  order_utils.py       #859347d2
  H  edit       order_utils.py       #01RbGtzf
  I  edit       order_utils.py       #01R5ouKe

══ fileDAG ══
order_utils.py
  B  write      #01FaKcvA
  D  edit       #01SZaQbN
  E  edit       #0135G5yN
  G  user-edit  #859347d2
  H  edit       #01RbGtzf
  I  edit       #01R5ouKe
test_order_utils.py
  C  write      #011XNwv9
rename_funcs.py
  F  write      #01VJfcDh
```

**`--list-branches`:**
```
surviving  tip #fba814f7    order_utils.py, test_order_utils.py, rename_funcs.py
```
(no `rewound` line.)

**`--surviving --verbose`** (for `order_utils.py`): revision headers `revision 0 … (149 lines)` …
`revision 5 … (234 lines)`; exactly six (`revision 0`..`revision 5`, NO `revision 6`). The rev3
block (the rename) renders the renamed `def` headers; the final rev5 block renders
`def print_receipt(order):` and `def apply_loyalty(total, member):`.

---

## 3. Why NO engine change is needed (reference map — cite these in impl-notes)

The reconstruction flows entirely through already-shipped code. The implementer must NOT add to it.

| Step | Code (file:function) | What it does for S24 |
|---|---|---|
| Detect the beacon | `src/reconstruction_user_edit.ts` `userEditEventFrom` | Reads the `attachment.type === edited_text_file` record; `changeId = entry.uuid` (→ `859347d2…`, a message UUID, not a `toolu_` id); `content = stripLineNumberPrefixes(snippet)` (strips the `N\t` `cat -n` prefixes). |
| Inject among tool events | `src/reconstruction_extract.ts` `collectEventsFromRecord` / `extractFileEvents` | Pushes the user-edit event alongside tool-use events; sorts by timestamp. The two `python3` Bash runs yield no `tool_use` file op, so they add nothing. |
| Content-aware guard (S15) | `src/reconstruction_replay.ts` `userEditChangesContent` | Records the snapshot as a `user-edit` revision ONLY because the renamed content differs from the current (terse) belief — line-count/line-by-line compare against the branch's reconstructed state. |
| Emit the user-edit revision | `src/reconstruction_replay.ts` `userEditRevision` | Replaces all lines (every line genesis) but keeps `kind = userEdit`. |
| Replay H, I on the renamed base | `src/reconstruction_replay_edit.ts` `applyEdit` (+ `editBaseIsStale`/`seedStaleEditBases` staying INERT) | H/I's recorded Edit base already matches the renamed belief (no stale base), so the removal+addition pairs splice cleanly; the S19/S23 reseed does NOT fire. |

S24 therefore generalizes the S15 user-edit family from "human/IDE out-of-band edit" to
"**script-driven** out-of-band edit captured by a beacon" — with no code delta.

---

## 4. Task 1 — Baseline & fixture (do first)

**4.1 Confirm baseline GREEN** (so the +10 delta is unambiguous):
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 337 pass / 0 fail
npx tsc --noEmit  # expect: No errors found
```
If baseline is not 337/clean, STOP and report — the tree drifted.

**4.2 Add the fixture.** Edit `tests/fixtures.ts`: append, immediately after the `M7_JSONL` entry,
a new constant (Desktop path, mirroring every other `S*_JSONL`/`M*_JSONL`):
```typescript
export const S24_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s24-script-rename-functions/c46c3db9-b5ac-4c20-adf8-9f33caa8359c.jsonl";
```
Rationale: the suite reads transcripts from the Desktop RevEng tree, not the worktree (every
`S*_JSONL`/`M*_JSONL` uses that root; the S24 JSONL is present there under this UUID).

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_s24.test.ts`, 5 tests)

Create the file. It mirrors `tests/reconstruction_engine_s22.test.ts` (a **reader-free** char-lock):
same imports, the `finalTextOf` / `historyEndingWith` helpers, `loadRecords`. **Reconstruct WITHOUT
a reader** (S24 is reader-independent — §2.5). Use a **leading-slash** suffix (`/order_utils.py`) so
it does not also match `/test_order_utils.py`.

Shared helpers (copy from `reconstruction_engine_s22.test.ts`):
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S24_JSONL } from "./fixtures.ts";

function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}
// whole-word terse-name check: match the `def <name>(` headers, NOT bare substrings
// (`apply_disc` is a substring of `apply_discount`).
const TERSE_DEFS = ["def calc_tot(", "def fmt_money(", "def chk_stock(", "def mk_order(", "def apply_disc("];
const RENAMED_DEFS = [
    "def calculate_total(", "def format_currency(", "def check_stock(",
    "def build_order(", "def apply_discount(",
];
```

**Test 1 — linear, one surviving branch, three files, no rewound.**
> *Why:* locks §2.6 — S24 introduces no branch/rewind; the script run does not fork anything.
```typescript
test("test_S24_linear_one_surviving_branch_three_files_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S24_JSONL)); // NO reader
    assert.equal(branched.rewound.length, 0);
    assert.equal(branched.surviving.length, 3);
    // the three touched files are present
    for (const suffix of ["/order_utils.py", "/test_order_utils.py", "/rename_funcs.py"]) {
        assert.ok(branched.surviving.some((h) => h.target.toString().endsWith(suffix)));
    }
});
```

**Test 2 — THE CRUX: the script rename surfaces as a `user-edit` revision.**
> *Why:* this is S24's entire reason for existing — a script-driven change with no Edit/Write
> record is captured (via the beacon) as rev3 `userEdit` holding the renamed content, with the
> attachment's message-UUID changeId. Locks §2.3.
```typescript
test("test_S24_order_utils_six_revisions_with_script_rename_as_userEdit_rev3", () => {
    const branched = reconstructBranches(loadRecords(S24_JSONL)); // NO reader
    const h = historyEndingWith(branched.surviving, "/order_utils.py");
    assert.equal(h.revisions.length, 6);
    assert.deepEqual(h.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit,
        EventKind.userEdit, EventKind.edit, EventKind.edit,
    ]);
    const rev3 = h.revisions[3]!;
    assert.equal(rev3.kind, EventKind.userEdit);
    assert.equal(rev3.changeId.toString(), "859347d2-3413-439f-ba38-3ab7ee61474c");
    assert.equal(rev3.lines.length, 187);
    const rev3Text = finalTextOf(rev3);
    for (const def of RENAMED_DEFS) assert.ok(rev3Text.includes(def), `rev3 missing ${def}`);
    for (const def of TERSE_DEFS) assert.ok(!rev3Text.includes(def), `rev3 still has ${def}`);
    // rev2 (the last pre-rename edit) is still terse — the rename boundary is exactly at rev3
    const rev2Text = finalTextOf(h.revisions[2]!);
    for (const def of TERSE_DEFS) assert.ok(rev2Text.includes(def), `rev2 missing ${def}`);
});
```

**Test 3 — the opaque `python3` Bash runs produce ZERO file events; exactly one user-edit.**
> *Why:* locks that the rename is recovered ONLY from the beacon attachment, not from parsing the
> Bash command (the m3 contrast). `extractFileEvents` must show 1 user-edit (the beacon, `859347d2`),
> the four Claude edits (D,E,H,I), and the three writes (B,C,F) — and nothing attributable to the
> two `python3 rename_funcs.py` runs.
```typescript
test("test_S24_extractFileEvents_one_userEdit_no_events_from_opaque_python_runs", () => {
    const events = extractFileEvents(loadRecords(S24_JSONL));
    const userEdits = events.filter((e) => e.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 1);
    assert.equal(userEdits[0]!.changeId.toString().slice(0, 8), "859347d2");
    // four Claude edits (D, E, H, I) and three writes (B order_utils, C test, F rename_funcs)
    assert.equal(events.filter((e) => e.kind === EventKind.edit).length, 4);
    assert.equal(events.filter((e) => e.kind === EventKind.write).length, 3);
    // the opaque python runs contribute no append/overwrite/delete events
    assert.equal(events.filter((e) => e.kind === EventKind.append).length, 0);
});
```

**Test 4 — READER-INDEPENDENT (the regression guard).**
> *Why:* locks §2.5 / §1.2 — S24 is the HAS-BEACON case: content comes from the in-JSONL attachment,
> so a `BackupReader` is irrelevant. With vs without a (deliberately wrong) reader, the
> `order_utils.py` history is identical. This guards against any future change that makes S24
> spuriously consult backups.
```typescript
test("test_S24_order_utils_identical_with_and_without_reader", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S24_JSONL)).surviving, "/order_utils.py");
    const withR = historyEndingWith(reconstructBranches(loadRecords(S24_JSONL), poison).surviving, "/order_utils.py");
    assert.equal(without.revisions.length, 6);
    assert.equal(withR.revisions.length, 6);
    assert.equal(historyFinalText(without), historyFinalText(withR));
    assert.ok(!historyFinalText(withR).includes("POISONED"));
});
```

**Test 5 — FINAL byte-lock (H, I replay on the renamed base; no stale-edit reseed).**
> *Why:* locks §2.4 — the final file is byte-identical to ground truth, proving the post-rename
> Edits spliced onto the renamed beacon (a fired S19/S23 reseed would add a 7th revision and/or
> corrupt the text). The 234-line literal is the strongest lock; capture it verbatim (see below).
```typescript
const S24_FINAL = `<<PASTE THE 234-LINE GROUND TRUTH HERE>>`;

test("test_S24_order_utils_final_is_ground_truth_234_lines_no_reseed", () => {
    const h = historyEndingWith(reconstructBranches(loadRecords(S24_JSONL)).surviving, "/order_utils.py");
    assert.equal(h.revisions.length, 6);               // a fired reseed would make this 7
    const finalText = historyFinalText(h);
    assert.equal(finalText.split("\n").length, 234);
    assert.equal(finalText.length, 6478);
    assert.equal(finalText, S24_FINAL);
    for (const def of RENAMED_DEFS) assert.ok(finalText.includes(def));
    for (const def of TERSE_DEFS) assert.ok(!finalText.includes(def));
    assert.ok(finalText.includes("def print_receipt(order):"));
    assert.ok(finalText.includes("def apply_loyalty(total, member):"));
});
```
**Capturing the `S24_FINAL` literal (do this, don't hand-type):** the final reconstructed text is
byte-identical to `scenarios/executed/s24-script-rename-functions/order_utils.py`. Generate the
exact escaped literal with:
```
node -e 'const fs=require("fs");const t=fs.readFileSync("scenarios/executed/s24-script-rename-functions/order_utils.py","utf8").replace(/\n$/,"");console.log("const S24_FINAL = "+JSON.stringify(t)+";")'
```
Paste its output as the `S24_FINAL` line (a single JSON-escaped string; the `replace(/\n$/,"")`
drops the file's trailing newline so it matches the engine's newline-joined revision text — the
length must come out to **6478** and the line count to **234**; if not, STOP).

**TDD for this char-lock (per the tdd guide):**
1. Write all 5 tests, run `node --import tsx --test tests/reconstruction_engine_s24.test.ts` —
   expect all 5 GREEN immediately (the engine is already correct).
2. **Prove the crux locks actually bite** (record each RED→GREEN in impl-notes, then revert):
   - Test 2: temporarily change the expected changeId to `"deadbeef-…"` → MUST go RED. Restore.
   - Test 4: temporarily assert `historyFinalText(withR).includes("POISONED")` → MUST go RED
     (proving the poison reader is genuinely ignored). Restore.
   - Test 5: temporarily change `S24_FINAL` by one character → MUST go RED. Restore.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_s24.test.ts`, 5 tests)

Create the file. It mirrors `tests/reconstruction_cli_m7.test.ts` / `reconstruction_cli_m3.test.ts`:
import `runCli` and `S24_JSONL`, call the REAL CLI (it builds the real sidecar reader — harmless,
S24 is reader-independent). Assert against the exact byte strings in §2.7.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S24_JSONL } from "./fixtures.ts";
```

**Test 1 — default conversationDAG lists the prompt + the user-edit G for the script rename.**
> *Why:* locks §2.7 — the script-driven rename appears in the conversation DAG as
> `G  user-edit  order_utils.py  #859347d2`, between the Claude edits.
```typescript
test("test_S24_default_conversationDAG_shows_script_rename_as_user_edit_turn", () => {
    const out = runCli([S24_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #d4147463"));
    assert.ok(out.includes("  B  write      order_utils.py       #01FaKcvA"));
    assert.ok(out.includes("  E  edit       order_utils.py       #0135G5yN"));
    assert.ok(out.includes("  F  write      rename_funcs.py      #01VJfcDh"));
    assert.ok(out.includes("  G  user-edit  order_utils.py       #859347d2"));
    assert.ok(out.includes("  H  edit       order_utils.py       #01RbGtzf"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});
```

**Test 2 — default fileDAG groups order_utils.py's six events incl. the user-edit.**
```typescript
test("test_S24_default_fileDAG_groups_order_utils_six_events", () => {
    const out = runCli([S24_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "order_utils.py\n  B  write      #01FaKcvA\n  D  edit       #01SZaQbN\n  E  edit       #0135G5yN\n  G  user-edit  #859347d2\n  H  edit       #01RbGtzf\n  I  edit       #01R5ouKe",
    ));
    assert.ok(out.includes("rename_funcs.py\n  F  write      #01VJfcDh"));
});
```

**Test 3 — list-branches: one surviving, three files, no rewound.**
```typescript
test("test_S24_list_branches_single_surviving_three_files", () => {
    const out = runCli([S24_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #fba814f7"));
    assert.ok(out.includes("order_utils.py"));
    assert.ok(out.includes("rename_funcs.py"));
    assert.ok(!out.includes("rewound"));
});
```

**Test 4 — surviving verbose: exactly six revisions; rev3 renders the renamed defs.**
> *Why:* locks §2.7 — the rename revision (rev3) shows renamed `def` headers; six revisions, no 7th
> (no spurious reseed in the rendered view).
```typescript
test("test_S24_surviving_verbose_six_revisions_rename_visible", () => {
    const out = runCli([S24_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 5  "));
    assert.ok(!out.includes("revision 6"));          // exactly six — no spurious reseed
    assert.ok(out.includes("revision 5  @") && out.includes("(234 lines)"));
    assert.ok(out.includes("| def calculate_total(items):"));   // renamed header rendered
    assert.ok(out.includes("| def build_order(items):"));
    assert.ok(!out.includes("| def calc_tot(items):"));         // terse header gone
});
```

**Test 5 — final renders the post-rename additions on renamed names (byte-lock + liveness).**
> *Why:* locks that H/I replayed on the renamed base — `print_receipt`/`apply_loyalty` are rendered
> and reference the renamed helpers; the terse `def` headers never appear in the rendered file.
```typescript
test("test_S24_surviving_verbose_final_has_renamed_print_receipt_and_apply_loyalty", () => {
    const out = runCli([S24_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("| def print_receipt(order):"));
    assert.ok(out.includes("| def apply_loyalty(total, member):"));
    assert.ok(out.includes("| def apply_discount(total, pct):"));
    for (const terse of ["| def calc_tot(", "| def fmt_money(", "| def chk_stock(", "| def mk_order(", "| def apply_disc("]) {
        assert.ok(!out.includes(terse), `terse header leaked: ${terse}`);
    }
});
```

**TDD:** run `node --import tsx --test tests/reconstruction_cli_s24.test.ts` — expect all 5 GREEN.
**Prove liveness** (record in impl-notes, then revert): temporarily change a unique assertion (e.g.
`#859347d2` → `#deadbeef` in Test 1, or `def calculate_total` → `def calculate_TOTAL` in Test 4) and
confirm RED, then restore.

---

## 7. Task 4 — Docs (3 edits + the fixture from Task 1)

**7.1 `plans/roadmap.md`** — add a NEW `S24` line (the S-series resumes after the M-series detour;
there is no existing S24 placeholder to flip). Place it after the `M7` line. Model the wording on
the existing one-line entries; it MUST state: script-driven rename via `python3 rename_funcs.py`
through Bash (no Edit/Write for `order_utils.py`); recovered via the `edited_text_file` **beacon**
attachment as a `user-edit` (rev3); the two `python3` runs are OPAQUE (0 file events, the m3
contrast); **reader-INDEPENDENT** (HAS-BEACON — content from the in-JSONL snippet, not backups);
linear (one surviving branch, tip `#fba814f7`); H/I replay on the renamed base so the S19/S23 reseed
stays INERT (6 revisions, not 7); engine ALREADY correct (characterization LOCK, NO src change);
10 new tests (5 engine + 5 CLI); 347 green; S1–S23 + m1–m7 byte-for-byte unchanged. Reference the
sibling HAS-BEACON rule (cite the `*-script-execution-replay.md` docs).

**7.2 `plans/implementation-notes-api-from-scenarios.md`** — PREPEND a new top entry (above the m7
entry at line 1), header form:
`## <YYYY-MM-DD:HH:MM:SS> — S24 reconstruction (script-driven function rename via Bash python3) — COMPLETE; characterization/regression LOCK, NO src change; 347 tests green`
Include: `### What S24 is` (the §1 ladder), `### Why no engine change` (the §3 reference map),
`### The HAS-BEACON rule` (cite the sibling RevEng spec/plan/tasks and why S24 needs no
script-execution-replay), `### RED→GREEN liveness` (the §5/§6 probes you ran),
`### Tradeoffs` (engine tests are reader-free with a poison-reader guard, mirroring s22; CLI tests
use the real sidecar reader, mirroring m3/m7).

**7.3 `plans/reconstruction-engine-design.md`** — APPEND a short S24 note after the m7 note
(~line 320): S24 = first script-driven trigger of the `edited_text_file` disk-echo (S15 family);
opaque `python3` Bash runs are not parsed; reader-independent HAS-BEACON; engine unchanged. Cite
`userEditEventFrom`/`userEditChangesContent`/`userEditRevision` and the sibling HAS-BEACON rule.

---

## 8. Task 5 — Full verification

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
node --import tsx --test tests/reconstruction_engine_s24.test.ts   # 5 green
node --import tsx --test tests/reconstruction_cli_s24.test.ts      # 5 green
npm test          # expect 347 pass / 0 fail
npx tsc --noEmit  # expect: No errors found
git diff --stat src/   # expect EMPTY — S24 adds NO src change
```
If `git diff src/` is non-empty, you violated the lock contract — revert the src change and
re-derive (the engine was already correct).

---

## 9. Task 6 — Commit (on user approval ONLY) then HAND OFF

**Do not commit without explicit user approval** (project rule: one commit per scenario, gated).
On approval, stage EXACTLY these files (never `git add -A` — the tree carries shared docs):
```
tests/fixtures.ts
tests/reconstruction_engine_s24.test.ts
tests/reconstruction_cli_s24.test.ts
plans/roadmap.md
plans/implementation-notes-api-from-scenarios.md
plans/reconstruction-engine-design.md
```
Commit message: `Implemented S24 handling` (+ the standard Co-Authored-By / Claude-Session trailers).

**create handoff** — after implementation is verified (and regardless of commit), write a COMPLETION
handoff via the `/jot:handoff-prompt` skill into `plans/s24/`. It must record: 347 green / tsc clean
/ NO src change; the three crux locks proven RED→GREEN; the HAS-BEACON framing; and that **S24 is the
last currently-defined scenario** — name the next scenario only if one exists (check
`scenarios/` for an `s25-*`/`m8-*` file); if none, state the series is complete and arm NO downstream
monitor.

---

## 10. Acceptance criteria (Definition of Done)
- [ ] `tests/fixtures.ts` has `S24_JSONL` (Desktop path) appended after `M7_JSONL`.
- [ ] `tests/reconstruction_engine_s24.test.ts` — 5 tests, all green, **reader-free**; the script
      rename is locked as the rev3 `userEdit` (changeId `859347d2…`); reader-independence proven with
      a poison reader; final byte-locked to the 234-line / 6478-char ground truth; crux locks proven
      to bite (RED when changeId / poison-assertion / final literal is altered).
- [ ] `tests/reconstruction_cli_s24.test.ts` — 5 tests, all green; asserts the `G  user-edit` turn,
      the six-event fileDAG, single surviving branch, and the renamed `def` headers in verbose.
- [ ] `npm test` = **347 pass / 0 fail**; `npx tsc --noEmit` clean.
- [ ] `git diff src/` is **EMPTY** — S24 adds no `src/` change.
- [ ] roadmap S24 line added; impl-notes entry prepended; design.md S24 note appended.
- [ ] Committed (exact 6-file list) only after user approval, message `Implemented S24 handling`.
- [ ] **Completion handoff written via `/jot:handoff-prompt`** into `plans/s24/` (states series status
      and whether any next scenario exists).
