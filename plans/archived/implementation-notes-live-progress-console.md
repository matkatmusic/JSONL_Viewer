## 2026-07-03:14:20:00 — Live console-log loading view for the JFRED viewer (xterm.js)
Chat title: live-progress-console
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/60ca750c-8f1c-421f-affa-de06b8c65467.jsonl

### References

/Users/matkatmusicllc/.claude/plans/foamy-orbiting-quail.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-phase35-localhost-viewer.md

### Design decisions

- Followed the plan's TDD ordering (RED then GREEN) per step. New test file: tests/viewer-progress.test.ts.
- Terminal theme reads live CSS vars (--code-bg, --muted) confirmed present in webapp/styles.css (both light+dark blocks) — theme portability comes for free.

### Deviations

- **TDD ordering batched, not strictly per-step interleaved.** The plan asked for RED-then-GREEN
  per step. I wrote one combined RED (the new test file imports symbols that don't exist yet →
  import failure, confirmed failing), then landed Steps 1/2/4 GREEN and re-ran to green. The exact
  implementation was dictated by the plan's code blocks, so there was no design latitude a per-step
  RED would have shaped. Final suite: 373 pass / 0 fail (368 pre-existing + 5 new).
- **serveStaticFile needed NO fix.** Plan Step 5.4 flagged verifying nested `vendor/` paths resolve.
  They already do — `/app/vendor/xterm.{js,css}` and `addon-fit.js` serve 200 with correct MIME. No
  change made.
- **Browser gate: mid-load terminal screenshot + theme screenshots not captured.** The gstack browse
  daemon restarted between/within calls (environmental), and local builds are sub-second so the
  transient terminal flashes faster than a poll+screenshot can catch. The behavior is proven instead
  by: (a) direct NDJSON stream inspection — 84 progress lines, exact stage labels in order, 79 counted
  per-record events 1..79; (b) clean client end-state — window.Terminal loaded, 79 records rendered,
  `.progress-console` disposed, zero console errors, consent-accept + cached-revisit paths both green.

### Verification results (Step 8)

- `npm test` → 373 pass, 0 fail.  `npm run typecheck` → exit 0, clean.
- Server stream (`?progress=1`): `application/x-ndjson`, 84 progress + 1 final document line; stage
  labels `["loading …","parsing records","reading sidecar backups","constructing branches","building
  document"]`; **non-progress path byte-identical to the streamed final doc** (no regression).
- Consent short-circuit streams a single `consent-required` line; bad jsonl name → **HTTP 400** (resolver
  refuses before headers, so param errors never become a broken stream).
- Browser: consent-accept → 79 records render, no console errors; cached revisit renders with no terminal.

### Gotcha for future sessions

- A **stale `viewer_server.ts` from a prior session was holding port 7343** and served the OLD (non-
  streaming) code, which looked like a bug until traced. `lsof -ti tcp:7343 | xargs kill -9` before
  `npm run app`. Also: `tsx` is not on `nohup`'s PATH — start the server with `npx tsx` (or `node
  --import tsx`), not bare `tsx`.

### Tradeoffs

- Did NOT parallelize with subagents: steps mutate a few shared files (app.js touched in steps 4/6/7; viewer_api/server sequentially depend on the loadTranscript types). Sequential TDD on shared files is cheaper than merging parallel worktrees for a change this size.

### Open questions

- None blocking. The consented ("run scripts") build of large real transcripts is slow, and the
  project-level view rebuilds over ALL of a project's JSONLs (145 for RevEng) — the known
  out-of-scope perf item (handoff open question c). Not addressed here.

---

## 2026-07-03:15:30:00 — Follow-up: post-spec UI changes + real-session parse/engine fixes

All below are follow-ups requested interactively AFTER the spec above shipped, driven by the user
dogfooding the viewer against their real ~/.claude/projects (not the scenario captures).

### 1. Loading console made persistent, docked, full-width, 10 rows

The spec created the xterm terminal lazily inside `#view` and disposed it on paint (a transient
block). The user wanted it persistent, docked at the window bottom, full width, exactly 10 text
rows tall.

- `webapp/index.html` — added `<section id="progress-console" class="progress-console">` as a
  sibling AFTER `</main>`, so route re-renders (which `view.replaceChildren()`) never wipe it.
- `webapp/app.js` — `ensureProgressTerminal()` creates the terminal ONCE (pinned `rows: 10`),
  reused for every load; `fitProgressColumns()` fits only columns to width, holding rows at 10.
  Created eagerly at bootstrap so the empty strip shows before any load. Removed
  `clearProgressConsole()` and its two `renderRoute` calls — nothing disposes it now; lines
  accumulate and the last load's tail stays visible.
- `webapp/styles.css` — `.progress-console` is `flex-shrink:0` with auto height; the 10-row
  terminal defines the height (xterm's `.xterm` sizes to its content — no pixel guessing).
- **Design note**: `.xterm` (vendored xterm.css) has no forced height, so `rows:10` + auto-height
  container = exactly 10 lines regardless of the resolved font row-height. Verified: 10 rendered
  rows at home (empty) and after load; geometry `x:0, width==window, bottom==window` (full-width,
  bottom-docked).

### 2. Console shows server activity for EVERY view (incl. the projects list at #/)

The projects list (`#/` → `renderProjectsView` → `fetchJson("/api/projects")`) never touched the
console. DRY root-cause fix in `webapp/app.js`: a `logRequest(url)` helper logs `GET <pathname>`,
called at the top of the shared `fetchJson` and `fetchText`. Every view routes through those (or
through `fetchDocument`, which streams its own detailed progress), so all views now announce their
server calls with no per-view edits. Removed the now-redundant `"loading raw lines"` line
(`fetchText` announces `/api/raw` itself).

### 3. Real transcripts broke the strict parser — three fixes

Opening the RevEng project (`#/project/-Users-…-RevEng`, a unified build over 145 real transcripts)
surfaced a chain of failures the scenario captures never exercised. Root-caused each by inspecting
the actual on-disk records, not guessing.

a. **Unknown record TYPES** — `custom-title` and `agent-name` (1185 each) are discriminant-only
   session-meta records, same shape as `ai-title` (`{type, sessionId, <one payload field>}`).
   Modeled in `src/structures/vocabulary.ts` (RecordType enum) + `src/parse/loadTranscript.ts`
   (`ALLOWED_TOP_LEVEL_KEYS` — a `Record<RecordType, …>`, so TS forces the entry). Updated
   `tests/vocabulary.test.ts` expected set (+2).

b. **Unmodeled FIELDS** — real records carry fields the scenarios lack (`url`, `sessionKind`,
   `error`, `retryInMs`, `retryAttempt`, `maxRetries`, `pendingBackgroundAgentCount`,
   `interruptedMessageId`, `isApiErrorMessage`, `apiErrorStatus`, `sourceToolUseID`). The strict
   `assertOnlyKnownTopLevelKeys` gate hard-failed the whole view with a 400.
   **User decision** (via AskUserQuestion): *relax the field gate for the viewer + log each tolerated
   field*. Implemented as `loadTranscript(path, onProgress?, tolerateUnmodeledFields=false)`:
   - strict by default (CLI + all tests + `parseTranscriptLine` unchanged — the engine's fog-of-war
     guard is preserved where correctness depends on it);
   - `tolerateUnmodeledFields` (viewer only) reports each `(type, field)` ONCE per file via
     `onProgress` as `unmodeled field "x" on y record`, instead of throwing;
   - an unknown record TYPE still throws either way (its whole shape is unknown, not just one field).
   Wired at `buildProjectDocument` (with sink → logs to console) and the server's pre-build consent
   pass in `handleDocumentRequest` (no sink → tolerates silently, else it would 400 before the
   stream starts).

c. **Engine crash** — `TypeError: Cannot read properties of null (reading 'split')` in
   `src/reconstruction_reseed.ts` `originalFileSeedFor` → `splitLines`. Real Edit tool-results record
   `originalFile: null` (typed `originalFile?: string`, so the `=== undefined` guard missed it),
   building a seed with `content: null`. Fix: `if (event.originalFile == null)` (nullish) so a
   null/absent originalFile yields no seed — identical to the undefined case, scenarios unaffected.
   This is the reconstruction engine, not the viewer; the null guard is the root fix (the malformed
   seed is never constructed).

### Verification (follow-up)

- **375 tests pass, 0 fail** after the vocabulary-test update.
- Typecheck clean EXCEPT one pre-existing, unrelated error:
  `tests/viewer-viewmodels.test.ts` imports `filterProjectsByName` from `webapp/views/projects.js`,
  which doesn't export it (someone else's WIP; esbuild/tsx tolerates it at runtime so the suite still
  passes). NOT introduced by this work.
- Repro over the once-crashing transcript (`1144d78f…jsonl`, 2379 records): builds 11 files, no crash
  (exercises the exact `reconstructFileOver → seedStaleEditBases` path).
- Server declined build of that transcript now returns a DOCUMENT (11 files); console stream shows
  `parsing records` → `unmodeled field "url" on system record` → the three stage labels.

### Follow-up open questions

- **Unknown record TYPES still hard-fail the viewer** (only FIELDS were relaxed, per the scoped
  decision). Other real projects may carry a new type; if so, either model it (if discriminant-only
  meta, trivial) or extend the same relax+log treatment to types. Not done pre-emptively.
- The gstack **browse daemon was too flaky** this session (repeatedly dropped to `about:blank`) to
  capture a final visual screenshot of the RevEng view; correctness proven server-side + via repro.
