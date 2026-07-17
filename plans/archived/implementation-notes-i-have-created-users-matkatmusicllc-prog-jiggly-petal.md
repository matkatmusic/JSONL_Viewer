## 2026-07-04T22:12:00 — Migrate scenarios to jfred-claude-scenarios submodule
Chat title: jiggly-petal
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/bcca5ea3-c7fe-4c53-b96a-ba14139b2091.jsonl

### References

- Plan: /Users/matkatmusicllc/.claude/plans/i-have-created-users-matkatmusicllc-prog-jiggly-petal.md
- Submodule remote: https://github.com/matkatmusic/jfred-claude-scenarios.git (branch: develop)

### Design decisions

- Submodule placed at `scenarios/` (repo root), replacing the old `scenarios -> plans/scenarios` symlink. This preserves the `../scenarios/` relative URL resolution used by `scripts/` without changes.
- `.gitmodules` tracks `branch = develop` to match the jfred-claude-scenarios repo's active branch (scenarios were pushed to develop, not master).
- `executed/` copied as a real directory into the submodule checkout (not symlinked). It's gitignored in the submodule so it stays local.

### Deviations

- Plan originally said `git submodule add -b master` — changed to no `-b` flag initially, then set `branch = develop` in `.gitmodules` after discovering scenarios live on the `develop` branch.
- Had to manually advance the submodule HEAD from the initial LICENSE-only commit to the develop branch containing the 85 scenario files.

### Tradeoffs

- `executed/` is duplicated: still exists at `plans/scenarios/executed/` (old location) and now also at `scenarios/executed/` (copied). The old copy can be removed once the user confirms the migration is complete.

### Open questions

- Should `plans/scenarios/` (the old location) be deleted now, or kept as a fallback until the submodule workflow is proven?
- The worktree symlink at `/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios` still points to the old `plans/scenarios` path — should it be updated or removed?
