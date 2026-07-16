## 2026-07-16:16:03:00 — Task 112: engine-pipeline-diagrams.html updated to the JFRED engine and copied into jfred/
Chat title: tackle-tasks 112 — update engine-pipeline-diagrams.html for JFRED
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/d31c5e38-07ad-424d-8d29-df30e254d27c.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task112-engine-pipeline-diagrams-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/engine-pipeline-diagrams.html
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/engine-pipeline-diagrams.html
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/src/reconstruction_branches.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/src/reconstruction_engine.ts

### Design decisions
- The updated file is JFRED-branded with `src/...` paths that are correct INSIDE the jfred repo; the RevEng
  root copy is a byte-identical mirror (RevEng no longer has a `src/`, so there is no RevEng-correct path
  spelling to preserve).
- New pipeline stage `seedBaseCommitBeacon` was inserted as node `P9b` in tab 2 (visible numbering shifted
  to 16 steps; mermaid node ids P10–P15 kept their old ids so the DRILL map keys survive) and as `②b` in
  tab 3 (avoids renumbering ③–⑪).
- The exec-gate (`reconstruction_exec_gate.ts`) got one node in tab 3's SCRIPT subgraph with dashed edges
  to injectScripts and gitEvidence, plus one-line mentions in tab 2's P12/P13 and tab 5's caption — not a
  full subsystem treatment.
- `reconstruction_labels.ts` and `reconstruction_progress.ts` deliberately omitted (display/plumbing
  helpers, not pipeline structure). `reconstruction_tool_calls.ts` / `reconstruction_json_steps.ts` /
  `reconstruction_orphans.ts` appear as label mentions only.

### Deviations
- Plan step 4's preferred smoke check (click through the real page's tabs headlessly) was impossible: the
  gstack browse daemon dies whenever a tab-switch click triggers `mermaid.run` (three attempts, sandboxed
  and unsandboxed; `file:` URLs are also blocked by the tool, so the check ran over a localhost
  `python3 -m http.server`). Fell back to the plan's stated minimum bar: a temporary page rendering all
  five extracted mermaid blocks at load — **5 SVGs, 0 parse errors** — plus a static validator confirming
  every DRILL-map id is a defined mermaid node. The temp page and HTTP servers were removed afterwards.
- tasks.json was reformatted (whitespace) by an external linter/user edit mid-session; left as found.

### Tradeoffs
- Byte-identical copy vs. repo-specific variants: one file, `cp`, `cmp`-verified. Two variants would drift.
- Static DRILL validation vs. real click-jump test: the click handler code itself is unchanged from the
  pre-task file; only the data map changed, and the data is what the validator checks.

### Open questions
- The interactive drill-jump (tab 1 S4 → tab 2 highlight incl. P9b) was verified statically, not by a real
  browser click, because of the browse-daemon crash above. A manual click-through when you next open the
  file would close that last gap.
