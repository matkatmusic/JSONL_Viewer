## 2026-07-11:14:05:00 — Item 68: static read-only gate for the script-execution sandbox
Chat title: tackle-tasks 68 (read-only script gate)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/139fdc39-02cc-44f7-abbf-e982ede76fd3.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item68-readonly-script-gate.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (item 68, now [x]; overlaps item 67's blocked prerequisite)

### Design decisions

- Gate placed inside `executeRunOnce` (after the memo-miss check, before `getPreExecutionState`), NOT inside `runScriptAgainstState`: the existing test `test_runScriptAgainstState_memoizes_failed_runs` spawns `raise SystemExit(1)` — a script with no write primitive — and asserts exactly one spawn; a sandbox-level gate would break it. A skipped run memoizes as `{ pre: empty Map, post: undefined }`, which is safe because every caller checks `post === undefined` before touching `pre`.
- A second one-line guard at the top of `runOutcomeForTarget` covers the rolling-lineage branch, which calls `runScriptAgainstState` directly and would otherwise spawn a sandbox per chained read-only run.
- The denylist only needs PYTHON write channels for correctness: the sandbox runs everything as `python3`, so a shell or JS script crashes and yields `post: undefined` with or without the gate. Bare `>` shell-redirect tokens (named in the task) were deliberately omitted — `>` matches every python comparison and would gut the savings while adding zero correctness. `writeFileSync`/`appendFileSync` were kept (free, and task 68 names them).
- Imports are handled by an ALLOWLIST of read-only-safe stdlib roots rather than a denylist: `import <seeded local module>` can run write code at import time (the s34 script-indirection family), and an unknown module can do anything. From-imports additionally reject writing names smuggled out of safe roots (`from os import remove`).
- `open(` analysis: builtin single-arg or literal read-mode/keyword second argument ⇒ read; dot-calls (`Path.open`) must show a read mode or keyword-only FIRST argument (Path.open's first parameter is the mode); any nested call or variable mode in the args bails to may-write.
- New regexes live in `src/regex_expressions.ts` per house rule (one canonical home for patterns), written as literal `new RegExp(...)` sources — the file's header sanctions literals for hairy patterns.

### Deviations

- None from the plan. Relative to the TASKS.md task text: shell tokens (`>`, `mv`, `cp`, `rm`, `mkdir`-as-shell) are not in the denylist, with rationale above (documented in the regex comment and TASKS.md note).

### Tradeoffs

- `.replace(`/`.remove(`/`.rename(` method tokens also hit read-only `str.replace`/`list.remove`/pandas `.rename` — accepted false may-writes: they only cost a sandbox run (today's behavior), never evidence.
- The raw-text scan can be evaded by aliased builtins (`o = open`) or getattr tricks — no recorded transcript uses them; task 67's executed-outcome check (`execution.post` vs `pre`) remains the exact answer. Marked with a `ponytail:` ceiling comment on `scriptCodeMayWriteFiles`.

### Verification performed

- `npm run typecheck` — clean.
- Direct probe of `scriptCodeMayWriteFiles` over 19 inputs (all six new test scenarios plus `r+`, `from os.path import join`, and a `git commit` bash command) — all classified correctly.
- Per explicit user instruction, `npm test` and the scenario coverage harness were NOT run — the user runs them.

### Open questions

- None blocking. If the scenario harness surfaces a writer script the gate misclassifies (it would show as a missing script-execution revision), the fix direction is to remove the offending pattern's read-only path, never to widen it.
