# Task 97 — Consent view: show source JSONL path + line number per script

## Goal
Each script row in the consent dialog shows which JSONL file + line it was extracted
from, as a ` [file.jsonl:123]` token appended to the row's muted header line
(the line currently showing timestamp + cwd).

## Facts (verified against the codebase, 2026-07-14)
- The server already sends the data: `ConsentScript = ScriptRun & { readOnly }`
  (src/viewer_api.ts:294) and `ScriptRun` carries `source?: { filePath, lineNumber }`
  (`RecordSource`, src/parse/loadTranscript.ts:23). **No server change.**
- The client type `WireConsentScript` (webapp/app.ts:49) does not declare `source`,
  so the client cannot see it. Client-only change.
- Display format mirrors the server-side `formatRecordSourceToken`
  (src/parse/loadTranscript.ts:32-37): ` [<basename>:<lineNumber>]`, empty string when
  source is absent. The webapp cannot import that function (it uses node `basename`),
  so a small client mirror is required.
- Muted header line is built inline at webapp/app.ts:631 inside `buildConsentScriptRow`.
- Tests for webapp/app.ts pure helpers live in `tests/viewer-viewmodels.test.ts`
  (node:test + assert/strict; helpers imported from `../webapp/app.ts`).
- **Do NOT run tests or suites** — the user runs them after the work is staged.
  TDD still applies to authoring order: write the tests first, then the code.

## Steps (in order)

### 1. Tests first (tests/viewer-viewmodels.test.ts)
Append three tests exercising a new exported pure function
`formatConsentSourceToken(source: { filePath: string; lineNumber: number } | undefined): string`:

1. `test_formatConsentSourceToken_formats_basename_and_line` —
   `{ filePath: "/Users/x/.claude/projects/p/session.jsonl", lineNumber: 42 }`
   → `" [session.jsonl:42]"` (leading space, brackets, basename only).
2. `test_formatConsentSourceToken_returns_empty_string_without_source` —
   `undefined` → `""`.
3. `test_formatConsentSourceToken_keeps_bare_filename_unchanged` —
   `{ filePath: "session.jsonl", lineNumber: 7 }` → `" [session.jsonl:7]"`
   (no slash in the path — basename extraction must not break).

Import `formatConsentSourceToken` in the existing webapp/app.ts import at line 19.
Each test body: plain-English step comments, one behavior per test (per tdd.md).

### 2. Type (webapp/app.ts:49)
Add the optional field to `WireConsentScript`:
```ts
type WireConsentScript = { timestamp: string; cwd?: string; code: string; readOnly?: boolean; source?: { filePath: string; lineNumber: number } };
```
No new named type — this is the only consumer, matching the file's existing inline style.

### 3. Formatter (webapp/app.ts, near buildConsentScriptRow)
```ts
// Client mirror of the server's formatRecordSourceToken (loadTranscript.ts): " [file.jsonl:123]"
// for a known source, "" otherwise — appended to the consent row's muted header (task 97).
export function formatConsentSourceToken(source: { filePath: string; lineNumber: number } | undefined): string {
    if (source === undefined) {
        return "";
    }
    const fileName = source.filePath.split("/").pop()!;
    return ` [${fileName}:${source.lineNumber}]`;
}
```
(`.pop()` on a `split("/")` result is never undefined for a string input; the `!` is safe.)

### 4. Render (webapp/app.ts:631)
Append the token to the existing muted header expression in `buildConsentScriptRow`:
```ts
el("div", { class: "muted", text: new Date(script.timestamp).toLocaleString() + (script.cwd ? `  ·  cwd ${script.cwd}` : "") + formatConsentSourceToken(script.source) }),
```

### 5. Verify types only (no tests)
Run the project's typecheck (check package.json scripts for the exact name, e.g.
`npm run typecheck` / `tsc --noEmit`). Do not run `npm test`.

### 6. Stage
`git add webapp/app.ts tests/viewer-viewmodels.test.ts` — stage only these two files;
the working tree carries unrelated pending changes. **Do not commit.**
