## 2026-07-14:16:42:00 — Task 97: consent view shows source JSONL path + line per script
Chat title: tackle-tasks 97 — consent source token
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/e783515a-20af-47e1-a5ba-a683528ebd75.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task97-consent-source-token.md

### Design decisions
- New exported pure helper `formatConsentSourceToken` in webapp/app.ts mirrors the server's
  `formatRecordSourceToken` (src/parse/loadTranscript.ts:32-37) instead of importing it — the
  server version uses node's `basename`, unavailable in the browser bundle. Basename extraction
  is `filePath.split("/").pop()`.
- `source` added as an inline optional field on `WireConsentScript` (no new named type) — the
  file's existing style, and this is the only consumer.
- The token is appended to the existing muted header line (timestamp · cwd) in
  `buildConsentScriptRow`, exactly as the task described. It is plain text, not a clickable
  link — the task asked only to *show* the source.

### Deviations
- Fixed a pre-existing `npm run typecheck` failure in `splitInlineInterpreterCode`
  (webapp/app.ts:609-611, committed in b508253): regex capture groups typed
  `string | undefined` under the root tsconfig's unchecked-index rules. Added `!` on groups
  1/3/4 (non-optional groups of a successful match). Verified pre-existing by stashing the
  task-97 edits and re-running typecheck. Without this fix the task's verification step
  could not pass.
- Tests were authored RED-first but NOT run manually — the tackle-tasks instructions say the
  user runs tests. (A PostToolUse hook auto-ran them mid-edit and confirmed the RED phase.)

### Tradeoffs
- Considered exporting `basenameOf` from webapp/views/sidebar.ts and importing it into app.ts;
  rejected — app.ts is the views' import root, so a reverse import risks a cycle for a one-liner.

### Open questions
None. (Clickability was raised and decided NO — the consent dialog appears before the
timeline is built, so a jump would have nowhere to land.)
