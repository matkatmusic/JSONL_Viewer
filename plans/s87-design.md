# S87 — demo-session composite (flush-out)

One inventory-domain repo, evolved across 12 phases and several agent
conversations, to exercise every JFRED surface for the Task 60 demo bundle.
Each phase borrows the *shape* of an existing scenario; provenance noted per
phase. Grammar = the scenario `.txt` directive grammar (`Say`, `Say @aN`,
`SpawnNewAgent`, `SayQueued`, `Edit:`, `Rewind`, `/compact`, `/clear`, `Exit`,
`Record`).

**Synced 2026-07-17 to the final `scenarios/s87-demo-composite.txt`: 118 steps,
agents a1–a15, after the correctness review (feature-ladder split, Phase-11
commit restructure) and the user's `--excludeJSONL` decision.**

## Context-mode strategy (unscripted)

Per your call: ctx_* usage is **not** pinned to steps. context-mode is installed,
so its guidance block is injected into every generating agent; the agent chooses
when to route through `ctx_execute`/`ctx_batch_execute` — that's the realistic
randomness. The scenario file adds **no** "use ctx" instructions of its own for
*analysis* moments (running tests, grepping call sites). The only explicit
"run through the MCP sandbox" instructions are the ones inherited from s36/s85/s84,
where routing a *script execution* through the sandbox is the borrowed scenario's
own realistic instruction — kept as-is.

## Module / function name thread (the load-bearing part)

| Symbol | Born | Renamed to | Where |
|---|---|---|---|
| `inventory.py` | Phase 1 | `inventory_core.py` | Phase 10 (s85 move) |
| `inventory_core.py` | Phase 10 | `core_inventory.py` | Phase 12 (s84 tail move) |
| `reporting.py` | Phase 2 (@a4) | `reporting_core.py` | Phase 10 (s85 move) |
| `qty_chk` | P1 | `check_quantity` | Phase 1 (rename_inv.py) |
| `add_item` | P1 | `insert_item` → `append_item` | P1, then P12 (s84 CSV) |
| `rm_item` | P1 | `remove_item` | Phase 1 |
| `find_item` | P1 | `lookup_item` | Phase 12 (s84 CSV) |
| `tot_value` | P1 | `total_value` | Phase 7 (s36 CSV) |
| `low_stock` | P1 | `below_threshold` | Phase 7 (s36 CSV) |
| `restock` | P1 | `replenish` | Phase 7 (s36 CSV) |
| `reorder` | P1 | `replenish_order` | Phase 7 (user-appended CSV row) |
| `stock_report` | P2 | `inventory_report` | Phase 10 (s85 CSV) |
| `value_report` | P2 | `valuation_report` | Phase 10 (s85 CSV) |

Four rename/move events, none colliding. Verified against the final .txt during
the 2026-07-17 review (every old name exists at the moment it's renamed; the
Phase-6 rewind doesn't break the thread because Phase 7 renames only pre-Phase-4
functions).

---

## Phase 1 — Baseline · provenance: **S44 minus the session split** · a1 · steps 1–15

S44's content in a **single a1 session**: write `inventory.py` (`qty_chk`,
`add_item`, `rm_item`, `find_item`, `tot_value`) + `tests/test_inventory.py`;
add `low_stock`; git init + commit "baseline"; write `rename_inv.py` (RENAMES
built up over 2 user edits); run it **via ctx sandbox** →
`qty_chk`/`add_item`/`rm_item` renamed; add `restock`, `reorder`
(+ `# reviewed by ops`), `shrink`; Exit @a1; Record @a1.

**Decision A — RESOLVED (user, 2026-07-17): `--excludeJSONL` dropped.** S44's
`EndCurrentAgentAndSpawnNewAgent: --excludeJSONL` split is not used; the
baseline session stays visible — "it's a transcript that can be used in the
reconstruction." (The git-baseline-*seed* trick is therefore not exercised by
s87; the git evidence channel still is, via the Phase-11 commit.)

End state: `inventory.py`, `tests/test_inventory.py`, `rename_inv.py`, git @ "baseline".

## Phase 2 — Multi-agent edits + rewind · provenance: **s62 steps 3–16** (intent-mapped) · a2/a3/a4 · steps 16–38

Fresh agent set. a2 plays s62's @a1 role, a3 plays s62's @a2 (the rewinder),
a4 plays s62's @a3. s62's branch creation (part of its baseline step) moves here:
@a2 opens with `Create and switch to a git branch called 'feature'` (step 17).

| s62 | S87 mapping |
|---|---|
| 3. @a2 edit orders.py `count` | @a3 edit `inventory.py` add `count_items(store)` |
| 4. spawn a3 | spawn a4 |
| 5. @a3 edit customers.py `find` | @a4 **write** `reporting.py` add `stock_report(store)` |
| 6. @a2 `subtotal` | @a3 add `subtotal(store, n)` |
| 7. @a2 `most_expensive` | @a3 add `most_valuable(store)` |
| 8. Rewind @a2: 2, code | Rewind @a3: 2, code (drops subtotal + most_valuable → abandoned branch) |
| 9. @a2 `cheapest` | @a3 add `least_valuable(store)` |
| 10. Edit customers.py `# reviewed by ops` | Edit `reporting.py` append `# reviewed by ops` |
| 11. @a1 emails | @a2 edit `reporting.py` add `low_stock_report(store, threshold)` |
| 12. Edit orders.py `# checked` | Edit `inventory.py` append `# checked` |
| 13. @a3 count | @a4 edit `reporting.py` add `value_report(store)` |
| 14–16. Thanks ×3 | Thanks ×3 |
| 17–22. Exit/Record ×3 | Exit a4/a3/a2, Record a2/a3/a4 |

**Decision B — companion file:** s62's second file was a real module (customers.py),
so a real `reporting.py` here rather than editing the test file. (Chosen.)

End state: + `reporting.py`; `inventory.py` has `count_items`, `least_valuable`,
`# checked`; abandoned-branch fork recorded in @a3's timeline; on branch `feature`.

## Phase 3 — Plan · new agent · a5 · steps 39–42

`Say @a5`: read `inventory.py` + `reporting.py`, then write `plans/feature-plan.md`
describing 3 features (`reserve`, `release`, `audit`), then stop.
End state: + `plans/feature-plan.md`.

## Phase 4 — Feature ladder · separate agent (this convo is rewound in Phase 6) · a6 · steps 43–46

**Three Says, one feature each** (split during the 2026-07-17 review so the
Phase-6 rewind has real conversation checkpoints): implement `reserve`, then
`release`, then `audit` in `inventory.py`, each adding a test to
`tests/test_inventory.py` and running `tests/test_inventory.py` with python3.
(Test-running is where ctx_* may surface organically; tool choice is left open.)

## Phase 5 — User edits (your step 4) · steps 47–48

`Edit: inventory.py — append '# feature pass complete'`
`Edit: tests/test_inventory.py — append '# tests updated'`

## Phase 6 — Wrong direction + handoff · **same agent as Phase 4**, then close · steps 49–52

`Rewind @a6: 2, code` — pops the `release` and `audit` turns onto the abandoned
branch; the code restore also wipes the two Phase-5 user-edit markers. `reserve`
(+ its test) **survives**, so the handoff has real content. (Note: user `Edit:`
steps are not rewind-picker entries — depth counts *user prompts* only; this is
why the ladder is three Says.) → `Say`: "that approach won't work — write
`plans/handoff-inventory.md` explaining what's implemented so far and which
functions to rename, then stop." → `Exit @a6` → `Record @a6`.
End state: + `plans/handoff-inventory.md`.

## Phase 7 — Script refactor · new agent · provenance: **s36** (CSV + user-edit + MCP-run) · a7 · steps 53–60

`Say`: "we need to rename some functions — see `plans/handoff-inventory.md`. Write
`renames.csv` (header old,new): `tot_value,total_value` / `low_stock,below_threshold`
/ `restock,replenish`." → **`Edit: renames.csv — append 'reorder,replenish_order'`**
(the s36 user-edit-before-run signature) → `Say`: write `apply_renames.py`, run it
**via ctx sandbox**, apply across `inventory.py` + `tests/test_inventory.py` → `Say`:
add `audit_value(store)` using `total_value`/`below_threshold` → Thanks → Exit → Record.
End state: + `renames.csv`, `apply_renames.py`; four functions renamed.

## Phase 8 — Concurrency · provenance: **s56** · a8/a9 · steps 61–73

@a8 adds `reserve_all` to `inventory.py`; spawn a9; @a9 adds `clear_reserved`;
user `Edit` append `# concurrency pass`; @a8 adds `reserved_count`; user `Edit`
append `# checked-2`; Thanks; Exit a9/a8; Record ×2.

## Phase 9 — /compact + /clear + rewind · provenance: **s72** · a10 · steps 74–87

Single agent on `inventory.py`: add `transfer_stock`; add `stock_of`;
**`/compact`**; user `Edit` append `# end of inventory module`; add `merge_stores`;
**`/clear`**; `Say` "open inventory.py to see what's there, then add `reset_store`";
add `is_empty`; **`Rewind @a10: 2, code`**; add `snapshot`; Thanks; Exit; Record.
(Bare `/compact`/`/clear` bind to the last-targeted agent — verified against
`run_scenario_lib.py`'s sticky-active routing, so they hit a10.)

## Phase 10 — File ops · provenance: **s85** (move via sandbox + CSV rename via Bash) · a11 · steps 88–96

`Say`: write `move_files.py` (shutil.move `inventory.py`→`inventory_core.py`,
`reporting.py`→`reporting_core.py`), run **via ctx sandbox** → `Edit: reporting_core.py
— append '# reviewed by ops'` → `Say`: write `renames.csv`+`apply_renames.py`
(`stock_report,inventory_report` / `value_report,valuation_report`), run **via
python3 Bash** (+ SayQueued "print each rename") → Thanks → `Say`: **stage all,
do NOT commit** (each git command separate) → Exit → Record.
s85's "post-rename" commit is deliberately deferred to Phase 11 so the
message-drafting flow has staged changes to commit (restructured in the
2026-07-17 review — the old a11-commit + a12-commit sequence produced an empty
second commit).

## Phase 11 — Wind-down (your step 10) · a12 · steps 97–102

One agent: @a12 drafts a commit message from the staged changes and shows it
(**no commit yet**); the user approves — "Great — commit the staged changes with
that message" — and @a12 commits. This is the s85 post-rename commit (git
blob-evidence channel) and the closest the grammar gets to "the user makes the
commit": there is no user-runs-git primitive, and Say text is static, so a
drafted message cannot be piped between two agents — hence one agent drafting
*and* committing on user approval (collapsed from the earlier a12+a13 pair).

## Phase 12 — Tail · provenance: **s84 minus git-init** · **new session, scenario continues** · a13/a14/a15 · steps 103–118

Per your answer: opens as a **fresh session on the same repo** *after* Phase 11's
exit; scenario is **not** over. No git-init (repo already exists).
- @a13: "Show the current files in this repository" (plays s84's a1 minus git-init).
- @a14: write `move_files.py` (shutil.move `inventory_core.py`→`core_inventory.py`),
  run **via ctx sandbox**; SayQueued "also print the rename."
- @a15: write `renames.csv` (`insert_item,append_item` / `find_item,lookup_item`) +
  `apply_renames.py`, run **via python3 Bash** across `core_inventory.py`; SayQueued
  "also print each rename."
- Thanks ×2; Exit a13/a14/a15; Record ×3.

---

## Residual decisions — all resolved 2026-07-17

- **A. Baseline `--excludeJSONL`** — **dropped** (user decision): the baseline
  transcript is an input to reconstruction; no hidden-baseline trick.
- **B. Phase-2 companion** — **`reporting.py`** (real module, faithful to s62).
- **C. Name thread** — **verified** against the final .txt during review; four
  rename/move events, no collisions.
- **D. After the s84 tail** — the tail's Exit/Record ×3 **is** the finale; the
  "scenario has not ended" remark meant the tail is a continuation (fresh
  session, same repo), not that more phases follow.
- **E. Size** — full cut kept: 12 phases, 118 steps, agents a1–a15. Parses clean
  through `runScenario_convertTxtToJson` (0 unknown steps, numbering contiguous,
  Exit/Record 15/15).
