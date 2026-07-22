# s88-multi-source-two-roots — ground-truth design (task 170)

Acceptance reference for tasks 171 (capture) and 178 (coverage gate). The
scenario lives at `scenarios/s88-multi-source-two-roots.txt` (identical copy at
`jfred/scenarios/s88-multi-source-two-roots.txt`), 26 steps, two agents:

- **a1** — implicit, cwd = primary root `alpha` (`/tmp/scen88-alpha`)
- **a2** — `SpawnNewAgent: a2 in beta` (step 5), cwd = `beta` (`/tmp/scen88-beta`)

Every ladder below keys revisions to the scenario **step number** that produces
them. "user-edit stamp" = a runner-performed `Edit:` directive (an out-of-band
disk edit, no tool_use record). Content sketches describe the intended
post-state; the capture (task 171) locks exact bytes.

## Per-file revision ladders

### `inventory.py` — MERGED cross-source ladder (rel-path join)

This is the multi-source engine's expected output once the alpha and beta
sources are joined by root-relative path (design §a content gate at r4/r6:
the `cp` sync makes the joining revision byte-identical across sources).

| rev | step | kind | session/root | post-state sketch |
|-----|------|------|--------------|-------------------|
| r1 | 1 | write (Write tool) | a1 / alpha | dict-based module: docstring, `add_item`, `qty_chk`, `find_item` |
| r2 | 3 | script-execution (Bash whole-word substitution, no Edit/Write tool) | a1 / alpha | `qty_chk` → `check_quantity` everywhere |
| r3 | 4 | user-edit stamp (`Edit:` directive) | a1 / alpha | r2 + trailing `# reviewed by ops` |
| r4 | 6 | copy (`cp` alpha→beta; content-gate join point) | a2 / beta | byte-identical to r3 — beta's first revision of the shared rel-path |
| r5 | 10 | script-execution (rename_map.py via ctx_execute MCP sandbox) | a2 / beta | `add_item` → `insert_item` |
| r6 | 11 | copy (`cp` beta→alpha; sync-back, content-gate join point) | a1 / alpha | byte-identical to r5 — alpha re-joins beta's content |
| r7 | 12 | edit (Edit tool) | a1 / alpha | r6 + `restock(store, name, n)` using `check_quantity` + `insert_item` |
| r8 | 14 | script-execution (rename_map.py re-run via ctx_execute MCP sandbox) | a2 / beta | applied to r5 (beta's copy — **no** `restock`): `find_item` → `lookup_item` |

Note the deliberate terminal divergence: r8 is beta's `inventory.py`
(insert_item + lookup_item, no restock) while alpha's final state is r7
(insert_item + find_item + restock). The merged ladder alternates
alpha/beta/alpha/beta on one rel-path — the multi-source interleave this
scenario exists to exercise.

### `tests/test_inventory.py` — alpha only (a1)

| rev | step | kind | session/root | post-state sketch |
|-----|------|------|--------------|-------------------|
| r1 | 1 | write | a1 / alpha | tests covering `qty_chk` and `find_item` |
| r2 | 3 | script-execution (same Bash substitution as inventory r2) | a1 / alpha | `qty_chk` → `check_quantity` in test names/calls |
| r3 | 7 | edit | a1 / alpha | + zero-stock test for `check_quantity` |
| r4 | 15 | edit | a1 / alpha | + test for `restock` |
| r5 | 16 | user-edit stamp | a1 / alpha | + trailing `# tests updated` |

### `rename_map.py` — beta only (a2)

| rev | step | kind | session/root | post-state sketch |
|-----|------|------|--------------|-------------------|
| r1 | 8 | write | a2 / beta | `RENAMES` multi-line list, sole entry `("add_item", "insert_item"),`; whole-word apply to `inventory.py`; not run |
| r2 | 13 | user-edit stamp (`Edit @a2:` insert-after) | a2 / beta | second entry `("find_item", "lookup_item"),` inserted after the first |

## Mechanism → step map (the four s87 mechanisms, split across sessions)

| mechanism (s87 origin) | session/root | steps |
|------------------------|--------------|-------|
| git-INDEX staged-blob evidence (s87 steps 3/94/98/99) | a1 / alpha | 2 (init+stage+commit "baseline"), 18 (stage all, do NOT commit), 19 (prose window — draft message, still staged), 20 (commit) |
| result-instant rename stamping (s87 step 11) | a1 / alpha | 3 (Bash whole-word rename result) → 4 (`Edit:` stamp lands instantly on the renamed content) |
| cwd remap (s87 step 7) | a2 / beta | 10, 14 (script executed via ctx_execute MCP sandbox, whose cwd is NOT the beta root — engine must remap `inventory.py` to `/tmp/scen88-beta`) |
| time-aware indirection (s87 steps 4–7) | a2 / beta | 8 (rename list written, not run), 13 (list edited), 10 and 14 (renames resolved at RUN time from the list's content as of each run — run 1 sees one tuple, run 2 sees two) |

Cross-source sync steps (not an s87 mechanism, new to s88): 6 (alpha→beta
join) and 11 (beta→alpha sync-back). These are what let the identity join
agree at the content gate (design §a; mirrors the jot/jot-backup reality).

## reveng-paths.json `sources` entry for a capture of this scenario

Wire shape per `WireSourceEntry` in `jfred/src/reconstruction_overrides.ts`
(`{ projectsDir: string; fileHistoryDir?: string; root?: string }`), one entry
per root, alpha first (primary):

```json
{
  "s88-multi-source-two-roots": {
    "sources": [
      {
        "projectsDir": "<capture>/alpha/projects",
        "fileHistoryDir": "<capture>/alpha/file-history",
        "root": "/tmp/scen88-alpha"
      },
      {
        "projectsDir": "<capture>/beta/projects",
        "fileHistoryDir": "<capture>/beta/file-history",
        "root": "/tmp/scen88-beta"
      }
    ]
  }
}
```

`<capture>/<name>/projects` holds that root's session JSONLs
(`<projectsDir>/<project>/*.jsonl` — the `makeTwoSourceFixture` layout), and
`fileHistoryDir` that root's sidecar blobs. `root` is stated explicitly for
both entries so the rel-path join does not depend on cwd auto-detection
(design §b) — the a2 session's recorded cwds are sandbox-remapped tempdirs,
which is exactly the cwd-remap mechanism under test.
