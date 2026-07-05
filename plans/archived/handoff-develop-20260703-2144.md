# Handoff: JFRED live loading-console + real-session parse/engine fixes; chasing a ~28s pre-stream gap
Conversation name: live-progress-console
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/60ca750c-8f1c-421f-affa-de06b8c65467.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/foamy-orbiting-quail.md (original spec, already implemented)
Notes file: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-live-progress-console.md (living log of all work below)

## Branch
`develop` based on `develop` (no feature branch; all work is uncommitted in the working tree). Repo root: `/Users/matkatmusicllc/Desktop/claude code src/RevEng` (path has spaces — always quote it).

## Goal
Give the JFRED viewer (`npm run app`, a localhost transcript-reconstruction debugger) a live xterm.js "loading console" that streams what the server is doing while a document builds, instead of a blank page. That shipped. Follow-on work then made the viewer survive REAL `~/.claude/projects` sessions (not just the s1–s84 scenario captures) and made the console a persistent, full-width, 10-row bottom strip that timestamps every line. The CURRENT open thread is diagnosing a ~28-second gap the user sees before any console output when opening the s84 PROJECT view.

## Current State
All work is UNCOMMITTED (user's standing rule: never commit unless explicitly asked). Verify with `npm test` → last full run **375 pass / 0 fail**. `npm run typecheck` is clean EXCEPT one pre-existing, NOT-MINE error (see Context).

Done and verified this session:
1. **Live loading console (original spec, `plans/foamy-orbiting-quail.md`)** — NDJSON streaming from `/api/document?progress=1`; xterm.js vendored into `webapp/vendor/`; client splitter + streaming fetch. New test file `tests/viewer-progress.test.ts` (5 tests, green).
2. **Console made persistent** — moved out of `#view` into a sibling `<section id="progress-console">` in `webapp/index.html`; created once at bootstrap, never disposed; docked full-width at window bottom, pinned to **exactly 10 text rows** (`rows:10` + auto-height container; `fitProgressColumns` fits only columns). CSS `.progress-console`.
3. **Every view logs server activity** — `logRequest`/`fetchLogged` in `webapp/app.js` wrap `fetchJson`/`fetchText` to log `GET <path>` + timed `↳ <path> <status> (Nms)`. `fetchDocument` logs `GET /api/document …` + `↳ /api/document responding (Nms to first byte)`.
4. **Timestamps** — every console line is prefixed `HH:MM:SS.mmm` via `formatConsoleTime()` in `logProgress`.
5. **Real-session parse fixes** — (a) modeled two new record TYPES `custom-title` + `agent-name` (discriminant-only session-meta, like `ai-title`) in `vocabulary.ts` + `loadTranscript.ts` `ALLOWED_TOP_LEVEL_KEYS`; (b) **field-gate relaxation**: `loadTranscript(path, onProgress?, tolerateUnmodeledFields=false)` — viewer passes `true`, tolerating + logging unmodeled fields (`unmodeled field "x" on y record`) instead of throwing; engine/CLI/tests stay strict; unknown TYPES still throw. Updated `tests/vocabulary.test.ts` expected set (+2).
6. **Engine crash fix** — `src/reconstruction_reseed.ts` `originalFileSeedFor`: real Edit results carry `originalFile: null` (typed `?: string`), so `=== undefined` missed it and `splitLines(null)` crashed. Changed to `== null`.
7. **Server streaming restructure (LATEST, uncommitted, VERIFIED works on my test server)** — `handleDocumentRequest` now writes NDJSON headers FIRST for the progress path, then streams named stages that were previously silent-before-first-byte: `resolving transcript files …`, `resolved N transcript file(s)`, `consent scan: loading <file>` (one per file), `scanning parsed records for recorded script executions`, `consent required — N …`. Non-progress path unchanged (still resolves before headers so bad-project → 400).

## What Remains
1. **Finish diagnosing the user's ~28s gap** (the live thread). The user opened `http://127.0.0.1:7343/#/project/s84-multiagent-scripts-git-baseline` and saw 28632ms "to first byte" then instant output. CRITICAL: their server was running OLD code at that moment (confirmed — no new stage lines). I restarted 7343 in the background with NEW code (see below). On MY new-code run over the s84 project view (scenarios dir, declined build) the gap did NOT reproduce as 28s — the FIRST line arrived at +3.3s (Δ3302ms) and then the ENTIRE build completed in the same millisecond bucket. That 3.3s is BEFORE the handler emits anything (writeHead is immediate in new code), so it looks like **first-request warmup**, not `resolveJsonlPaths`/parse/decide.
2. **The next measurement to run** (the user interrupted right before this): time 3 consecutive WARM project-view requests' time-to-first-byte. If warm ≈ instant, the gap was cold-start / first-request warmup and re-selecting is fast. If a warm request is still slow, the cost is the **consented build with script execution** (the user's request built to "loading", so it had `allowScripts=1` or `declined=1`; a consented single-file s84 build timed out at 120s earlier — script execution is genuinely slow). Command shape:
   ```js
   // against http://127.0.0.1:7343 (new-code server, scenarios dir)
   for (const label of ["#1","#2","#3"]) {
     const t0=Date.now();
     const r=await fetch("/api/document?"+new URLSearchParams({project:"s84-multiagent-scripts-git-baseline",allowScripts:"0",declined:"1",progress:"1"}));
     const rd=r.body.getReader(); await rd.read(); console.log(label,"ttfb",Date.now()-t0,"ms"); for(;;){const x=await rd.read();if(x.done)break;}
   }
   ```
   Use ctx_execute or node (host fetch to 127.0.0.1 is hook-blocked — use the context-mode ctx_execute tool). NOTE: the user REJECTED this exact tool call right before the interrupt — ask them before re-running, or they may want a different approach (e.g. instrument the server itself).
3. **If it IS script execution**: the real fix is to stream progress DURING `buildDocumentWithConsent` (the script-execution stage is currently silent between "building document" and the final doc line). That means threading the progress sink deeper into the script-execution stage, OR adding a coarse "running N recorded scripts…" marker. Out-of-scope perf (server-side doc cache / unbounded multi-file rebuild) is deliberately NOT to be built — see the plan's "Out of scope".
4. **Fold the LATEST changes into the notes file** — `plans/implementation-notes-live-progress-console.md` documents items 1–6 but NOT item 7 (the `handleDocumentRequest` stage-logging restructure) or the client timing logs (`fetchLogged`, `↳ responding to first byte`) or the timestamps. Add a dated sub-section.
5. **Decide on the pre-existing `filterProjectsByName` breakage** (NOT this session's work — see Context). It's the only typecheck error and it's someone else's incomplete WIP.

## Key Files
- `src/viewer_server.ts` — `handleDocumentRequest` (the restructured streaming/stage-logging handler; the live investigation centers here). Untested thin wiring by repo convention.
- `src/viewer_api.ts` — `buildProjectDocument` / `buildDocumentWithConsent` (loads transcripts with `tolerateUnmodeledFields=true`, forwards the progress sink).
- `src/parse/loadTranscript.ts` — `loadTranscript(path, onProgress?, tolerateUnmodeledFields=false)`, `findUnmodeledTopLevelKeys`, `ProgressEvent`/`ProgressSink`, `PROGRESS_LABEL_PARSING_RECORDS`.
- `src/reconstruction_reseed.ts` — `originalFileSeedFor` null guard (the crash fix).
- `src/structures/vocabulary.ts` — `RecordType` (+custom-title, +agent-name), `DocumentResponseKind` (+progress, +error).
- `webapp/app.js` — the whole client: `ensureProgressTerminal`/`logProgress`/`formatConsoleTime`, `fetchLogged`/`fetchJson`/`fetchText`, streaming `fetchDocument`, `splitNdjsonChunk`.
- `webapp/index.html`, `webapp/styles.css` — the `#progress-console` element + CSS; xterm vendor `<script>`/`<link>` tags.
- `webapp/views/conversation.js` — `logProgress("building view"/"rendering")` + paint yields.
- `tests/viewer-progress.test.ts` (new), `tests/vocabulary.test.ts` (RecordType set +2).
- `plans/implementation-notes-live-progress-console.md` — the running design log (update per item 4 above).

## Context the Next Agent Won't Have
- **The server currently on port 7343 is MINE (background, `npx tsx … --port 7343 --projects-dir "plans/scenarios/executed"`, pid ~66682).** The user had been running their OWN server manually in a foreground terminal; I killed it and took over when they said "try it yourself." The user has TWICE asked me to kill the server and hand them the manual respawn command — they prefer running it themselves. Respawn command: `cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && npx tsx src/viewer_server.ts --port 7343` (add `--projects-dir "plans/scenarios/executed"` for the s84 scenario). Use `npx tsx`, NOT bare `tsx` (not on PATH); `lsof -ti tcp:7343 | xargs kill -9` first if EADDRINUSE.
- **Client vs server code confusion is the trap here.** Reloading the browser picks up `webapp/*` (app.js) changes instantly, but `src/viewer_server.ts` changes need the NODE PROCESS restarted. The user's "still 28s, no new lines" report was exactly this: updated client (showed the new `↳ responding` line) but STALE server (no new stage lines). Always confirm the server has new code before trusting a repro — I did it by checking a stream for the `resolving transcript files`/`consent scan:` markers.
- **The console only shows what the CLIENT logs + what `/api/document` STREAMS.** `/api/projects`, `/api/config`, `/api/raw`, `/api/diff` are plain responses; their server-side time is invisible except via the client-side `↳ … (Nms)` completion log. Anything the server does BEFORE `writeHead` on `/api/document` is invisible unless you move `writeHead` earlier (which item 7 did).
- **`tests/viewer-viewmodels.test.ts` and `webapp/views/projects.js` are modified in the working tree but were NOT touched this session** — a concurrent session added a `filterProjectsByName` project-search feature. `projects.js` does not export `filterProjectsByName`, so `tsc` errors (TS2305) but `tsx`/esbuild tolerates the missing named import at runtime, so `npm test` still passes 375/0. Do NOT "fix" this by guessing the feature; it's someone else's WIP. This repo has heavy concurrent multi-session activity — re-check `git status` before assuming a diff is yours.
- **User decisions locked in:** (a) field gate = *relax + log* for the viewer only (via AskUserQuestion), engine stays strict; (b) unknown record TYPES still hard-fail (only fields relaxed) — if a new type appears, model it or ask before relaxing types; (c) console is persistent + exactly 10 rows + full width + timestamped.
- **`gstack browse` daemon was chronically flaky all session** (repeatedly dropped to `about:blank` mid-run under load) — do goto+asserts in ONE bash call, and don't trust a blank result as an app failure. Server-side verification via `ctx_execute` fetch to `127.0.0.1` is more reliable (raw `curl`/inline node fetch is hook-blocked and redirected to context-mode).
- **Ponytail ultra mode is active** this session (lazy/minimal solutions; root-cause fixes; `ponytail:` comments mark deliberate shortcuts). Coding requirements enforced: domain types over primitives, single vocabulary home (`vocabulary.ts`), verb-named functions, enum-member comparisons, 4-space indent everywhere incl. webapp JS.
- The s84 scenario files live under `plans/scenarios/executed/s84-multiagent-scripts-git-baseline/` (3 JSONLs: ba044097…, 24b1753b…, 2735fe41…). s84 has 11 recorded script executions → project view hits the consent gate.

## How to Verify
```
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
npm test          # expect 375 pass, 0 fail
npm run typecheck # clean EXCEPT the pre-existing tests/viewer-viewmodels.test.ts filterProjectsByName TS2305 (not ours)
```
For the live investigation: ensure 7343 runs NEW server code (stream `/api/document?project=s84-multiagent-scripts-git-baseline&progress=1&allowScripts=0` and confirm the `resolving transcript files …` / `consent scan:` lines appear), then measure warm time-to-first-byte per item 2.
