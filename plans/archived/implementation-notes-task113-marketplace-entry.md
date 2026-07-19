## 2026-07-17:08:49:00 — Task 113: marketplace.json for jfredToolsPlugin
Chat title: task 113 — jfredToolsPlugin marketplace entry
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/78685aaa-cf6d-4be3-8e65-49ecd9ac66f9.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task113-marketplace-entry-plan.md
/Users/matkatmusicllc/Programming/jot/.claude-plugin/marketplace.json
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/jfredToolsPlugin/.claude-plugin/plugin.json

### Design decisions
- The marketplace lives IN the jfredToolsPlugin repo (self-hosted single-plugin marketplace, source "./"), not as an entry in jot's marketplace.json. Rationale: mirrors the jot repo's own pattern, and task 109's direction is to decouple these tools from jot — putting the entry in jot's marketplace would re-couple their distribution.
- Marketplace name `matkatmusic-jfred-tools` (kebab-case, matching jot's `matkatmusic-jot` style), so the install spec is `jfredToolsPlugin@matkatmusic-jfred-tools`.
- `category: "development"` (not jot's "productivity") — these are dev/test tooling skills.
- All plugin-entry fields (name, version 0.1.0, description, keywords, author) copied verbatim from the existing plugin.json to avoid drift.

### Deviations
- None from the plan.

### Tradeoffs
- No tests: static JSON manifest, no logic. The runnable check is `python3 json.load` validation (passed for marketplace.json, tasks.json, completedTasks.json).

### Open questions
- The install flow only works once the jfredToolsPlugin repo is pushed to https://github.com/matkatmusic/jfredToolsPlugin — verify with a real `claude plugin marketplace add matkatmusic/jfredToolsPlugin` + `claude plugin install` after pushing, then decide whether the zshrc --plugin-dir wrapper (task 108's interim enablement) should be retired.
