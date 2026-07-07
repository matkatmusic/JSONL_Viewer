# Implementation notes — Phase 3+5: Localhost app / greenfield JFRED viewer

## 2026-07-02:19:20 — Steps 1–4 complete; Step 5 (island deletion) awaits user sign-off
Chat title: (unnamed session, continuation of harmonic-raccoon handoff)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/262dc6ef-03c8-4294-8a6f-2de06465fe65.jsonl

Final gates: `npm test` 368/368 (343 pre-existing + 25 new), `npm run typecheck` clean,
`check_scenario_coverage` 85/85, browse-tool smoke gates 3.1→3.7 all green with zero console
errors on expected flows (consent decline AND accept paths, conversation with branch strip +
edit markers, file history with 3 revisions + working jump-to-line, raw-line filters 119→1,
inspector, vs-base diff). New surface: `npm run app` → http://127.0.0.1:7343 (left running).
New files: src/reconstruction_exec_gate.ts, src/viewer_api.ts, src/viewer_server.ts, webapp/*,
tests/{exec-gate,viewer-api,viewer-viewmodels}.test.ts. Engine edits: one guard line in each of
reconstruction_script_stage.ts / reconstruction_git_evidence.ts; buildSidecarReader unified in
reconstruction_sidecar_reader.ts (multi-session version); scripts/coverage_sidecar.ts retired
(commented out); DocumentResponseKind added to vocabulary.ts; tsconfig +allowJs; package.json
+"app" script.

## 2026-07-03 — Revision: OS light/dark mode support (user request)
webapp/styles.css now routes every color through :root custom properties with a light palette
as default and the original navy/cyan palette under `@media (prefers-color-scheme: dark)`;
index.html gained `<meta name="color-scheme" content="light dark">` so native controls and
scrollbars follow. Pure CSS, no JS. Verified in headless Chromium (light default): body bg
rgb(245,246,248), zero console errors.

## 2026-07-03 — Revisions: JFRED title, legacy-style inspector, project drawer (user requests)
- Title/header now "JFRED - JSONL File Reverse Engineer Debugger" / "JFRED".
- Inspector rebuilt to the legacy presentation (web-shared/json-inspector.js concept): the
  selected line as pretty-printed JSON text with braces, token-highlighted WITHOUT innerHTML
  (text nodes + spans — page content can't inject markup). Prev/Next walk the transcript;
  uuid and toolu_… string values are jump-links (uuid → the record it names; tool id → its
  use/result counterpart, first other carrier line). Navigation notifies the calling view,
  which scrolls/highlights the matching conversation entry or raw-line row in step.
- New persistent left drawer on every #/project/* route: JSONL files (always) + Files touched
  (only once the unified document is cached — `peekCachedDocument` never forces a build just
  for navigation; the drawer refreshes after each view render so the section appears as soon
  as the landing build completes). The project landing view's two panes are gone — the drawer
  IS the nav; the landing hosts the consent dialog + a summary line.
- All verified in browse: sections populate post-consent, drawer persists with active
  highlight on conversation/file routes, inspector nav label walks lines, jump-link clicks
  land on the target line, zero console errors.

## 2026-07-02:16:43:00 — Implementation start
Chat title: (unnamed session, continuation of harmonic-raccoon handoff)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/262dc6ef-03c8-4294-8a6f-2de06465fe65.jsonl

### References

- /Users/matkatmusicllc/.claude/plans/reveng-phase35-localhost-viewer.md (the plan being implemented)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260702-1639.md (handoff into this session)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-phase2-js-retirement.md (locked feature scope + Phase 2 record)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md

### Design decisions

- 2026-07-02:17:35 — Step 2 API signatures use domain types (`Path` for dirs/file names, `Date` for mtimes) where the plan sketched `string`, per `plans/coding-requirements.md` §1. `DocumentResponseKind` (document / consent-required) added to `src/structures/vocabulary.ts` — it crosses the HTTP wire as the 428 payload discriminant, and all string enums live there (§2).
- 2026-07-02:17:35 — `test_decideDocumentResponse_builds_when_no_scripts` uses a synthetic Write-only fixture instead of the plan's s19: s19 is NOT script-free (it carries an `ls` probe and a `pytest` run), and a scan showed NO covered scenario is script-free — the run-scenario harness itself issues script probes.
- 2026-07-02:18:05 — Step 3.0 view models consume the JSON-SERIALIZED document (what the client receives over HTTP: Path/Uuid/Date already strings), so every view-model test feeds `JSON.parse(JSON.stringify(document))`. Content-at-revision is derived by the plan's steps[].files walk keyed on ISO-string timestamp comparison (steps are chronological; ISO strings compare lexicographically).
- 2026-07-02:18:05 — Scenario ground-truth reality checks: (a) s19's scenario19.py reconstructs as 3 revisions (write→overwrite→edit), not the plan's "4+" — the 3.4 browse gate will assert 3+; (b) the scenario's .step_states capture dirs (9) do NOT map 1:1 to engine steps (5) — tests anchor on content equality, not step indices; (c) captured state files carry a trailing newline the engine's snapshots normalize away — tests compare through the same `stripTrailingNewline` the coverage checker uses.
- 2026-07-02:18:05 — `allowJs: true` added to tsconfig so the TS test suite can import the plain-JS webapp view-model modules (no build step, per plan Step 3; `checkJs` stays off).
- 2026-07-02:17:05 — Step 1 exec-gate test for `placeGitCommitEvidence` reuses the s85-in-miniature temp-git-repo fixture from `tests/reconstruction_git_evidence.test.ts` (not a lighter one): it is the only fixture that provably makes the enabled stage return a NEW events array, so the disabled-gate identity assertion is genuinely red without the guard. A no-repo fixture would pass even without the gate.



### Deviations

- 2026-07-02:18:55 — **Consent response is HTTP 200 + `{ kind: "consent-required", scripts }`, not the plan's 428.** Browsers log every non-2xx fetch as a console error, and the plan's own 3.2 smoke gate requires a clean console on the consent flow — the two plan statements conflict. The `DocumentResponseKind` discriminant (already in vocabulary.ts) rides the 200 payload instead; a real document has no `kind` field, so the client discriminates on its presence.
- 2026-07-02:18:55 — **Jump-to-line, edit markers, and the Edits-Only filter map changeId → raw line by SUBSTRING SCAN, not lineVerdicts-uuid equality.** The plan's engine-surface note ("changeId → lineVerdicts entry with matching uuid") is false in practice: measured on s19, revision changeIds are tool_use ids (`toolu_…`) or backup blob names (`…@vN`) — never record uuids — but each appears verbatim in exactly the raw JSONL line that caused the revision (`findLineForChangeId` in webapp/views/file-history.js). Steps[].changeIds likewise matched only 1/119 s19 lines (they're re-stamped uuids), so the Edits-Only filter and the edit markers key on the revision-changeId scan too. Conversation anchors are now `/at/<line-index>` instead of `/at/<uuid>`.
- 2026-07-02:18:55 — No `alert()` anywhere in the client: native dialogs block headless automation (the jump gate's first run hung the browse daemon on one). Errors render as in-page boxes / the breadcrumb.

- 2026-07-02:17:10 — **Step 2.1 lifted the multi-session reader, not the CLI's single-session one.** The plan said to extract `buildSidecarReader` from `reconstruction_cli.ts:156`. Discovered a second, multi-session `buildSidecarReader` in `scripts/coverage_sidecar.ts` (reads each backup from the session dir that OWNS it) — the viewer's unified project view merges multi-session record streams (s53-style), where the CLI's single-session reader would ENOENT on the second session's backups. The multi-session reader is a strict superset (identical behavior on single-session records), so it became THE `buildSidecarReader` in `src/reconstruction_sidecar_reader.ts`; the CLI, coverage checker, and viewer now share it; `scripts/coverage_sidecar.ts` retired. Verified: 346/346 tests, typecheck clean, 85/85 coverage. User questioned the initial deletion of the file and directed: never delete files — comment out instead. `coverage_sidecar.ts` restored as a fully commented-out stub with a RETIRED header pointing at the new home.



### Tradeoffs



### Open questions

- 2026-07-02:19:15 — **Most real `~/.claude/projects` transcripts don't parse yet.** A scan of 4 small real projects found 3 parseable; the failures are the engine's loud `UnmodeledFieldError`s (e.g. `preventContinuation` on a system record) — the clean-room field gate working as designed. The viewer surfaces the error in-page (screenshot taken). Growing coverage is the existing scenario-gap-analysis track, not a viewer task — but confirm that's the intended division.
- 2026-07-02:19:15 — **Unified project view on huge projects is unbounded.** The biggest real project has 3,574 JSONLs; `GET /api/document` (no `jsonl` param) rebuilds everything per request with no server-side cache or size cap. Fine for scenario-sized projects; the ceiling will show on real ones. Options when it matters: per-document server cache keyed on mtimes, or a JSONL-count cap with a "load anyway" affordance.
- 2026-07-02:19:15 — The gstack browse daemon also died MID-call twice this session (not only between calls, as the handoff said) — worked around with short poll loops; noting for future smoke gates.

- 2026-07-02:17:36 — Every captured real transcript carries script-execution runs (harness `ls`/`pytest` probes count as runs), so with the server's default-OFF posture the consent dialog will appear on the FIRST view of essentially every transcript (then per-session memory suppresses it). If that feels too chatty, a future refinement could whitelist trivially-read-only runs (`ls`, `pytest -q`) out of the consent prompt — not doing that now (trust boundary: executing anything needs consent).
- (inherited, unresolved) The legacy viewers were broken before Phase 2 (missing read-event-scanner script tag, fixed on develop-baseline as a5098fa); user has not explicitly reacted to that discovery.
