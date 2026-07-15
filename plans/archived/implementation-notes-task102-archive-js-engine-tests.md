## 2026-07-14:19:32:00 — Task 102: archive historical JS-engine tests + fixtures
Chat title: tackle-tasks 102
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/8370aff2-dd97-473b-a9a4-a1f60bf0aa6f.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task102-archive-js-engine-tests.md

### Design decisions

- `api/` stays put: `jfred/jfred.html` references it (JFReD's live engine, task 58 territory), so it is not "historical" despite being the frozen legacy engine.
- `envelope.test.ts` stays in `tests/archive/`: it is early Engine-B TypeScript (imports `src/structures/vocabulary.ts`), so filing it under `js-engine/` would mislabel it. `tests/archive/` now holds only that one file.
- Layout inside the new folder mirrors the old one: `js-engine/archived/tests/` and `js-engine/archived/fixtures/scenario-check/`.
- Plain `mv` (not `git mv`) because all four sources were untracked; new paths staged with `git add` (30 files: 3 tests + 27 fixtures), plus tasks.json/completedTasks.json. Nothing committed per instructions.

### Deviations

None — plan followed as written.

### Tradeoffs

- Task 102's `commitHashes` recorded as `[]` since the work is staged only; the closing commit hash can be backfilled after the user commits, or left empty (closureNote says why).

### Open questions

None.
