# Plan: Tasks 60 + 62 — bundle sanitized s87 demo session + capture README screenshots/GIF

All work happens in the `jfred/` submodule (branch `develop`) unless a path says otherwise.
Superproject root: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

## Established facts (verified 2026-07-17; do not re-derive)

- `findPreservedRepoDir` (`jfred/src/reconstruction_git_evidence.ts:118-127`) discovers a repo
  when a literal `.git` directory sits in the SAME folder as the transcript JSONLs.
  `findFallbackRepoDirs` (`:133-136`) tries recorded cwd → `repoDir` override → `projectCwd`
  override → that transcript-sibling `.git`. `readStagedFileContent` and
  `readCommittedFileContent` use the same chain. NO engine change is needed.
- File-history sidecar root resolves override → transcript-sibling → `~/.claude/file-history`.
  The viewer accepts `--file-history-dir` (`jfred/src/viewer_server.ts:54,67-70`). Layout under
  the root is `<sessionId>/<backupFileName>`.
- The viewer scans `--projects-dir` ONE level deep: each immediate subdirectory = one project
  (`jfred/src/viewer_api_projects.ts:118-131`).
- s87 needs ALL 16 JSONLs together (cross-session blobs are owner-keyed); the coverage checker
  merges every `*.jsonl` directly inside a scenario folder.
- Hook command strings inside records are never parsed by the engine — rewriting the username
  inside them cannot change reconstruction. Strict mode only rejects UNKNOWN top-level keys;
  `sed` adds none.
- `scenarios/executed/s87-demo-composite/.git` is already a byte-identical clone of the live
  tmpdir repo (HEAD `fbe1a38`, staged `reporting_core.py` blob `a919702`). The tmpdir at
  `/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.7y52smqe` must NOT be
  modified or cleaned.
- The baseline commit author is `Matkat Music LLC <matkatmusic@gmail.com>` — the repo owner's
  public git identity, identical to every public JFRED commit. Ship the `.git` byte-identical;
  do NOT rewrite it (rewrites change hashes and buy no privacy).
- Personal strings in the 16 JSONLs: exactly the username `matkatmusicllc` inside absolute
  paths (~62 hits: hook command paths + 1 self-referential projects path). No email, no other
  identifiers. The recorded cwd is already neutral (`/private/var/folders/.../run-scenario.7y52smqe`).
- `ffmpeg` is installed; `gifski` is NOT — build the GIF with ffmpeg palettegen/paletteuse.
- No `.gitignore` rule matches `*.jsonl`; `scenarios/.gitignore` ignores `executed/` (so
  nothing under `scenarios/executed/` is tracked — the demo must live elsewhere).
- Browse-daemon gotchas (from memory, reconfirmed recipes): the daemon dies between Bash tool
  calls — do goto → consent-click → poll → capture in ONE Bash invocation; webapp static files
  are served under `/app/`; the consent button text is "Run scripts for this reconstruction"
  inside `#view`. Script replay is safe: the Phase-1 sandbox cwd remap keeps runs off recorded
  paths.
- DO NOT run `npm test` or any test suite — the user runs tests afterward. The scenario
  coverage checker (`npx tsx scripts/check_scenario_coverage.ts <name>`) is the verification
  oracle for this plan and IS allowed.

## Phase 1 — Build the committed demo bundle at `jfred/demo/`

1. Create `jfred/demo/projects/s87-demo-composite/` and `jfred/demo/file-history/`.
2. For each of the 16 `*.jsonl` files in `jfred/scenarios/executed/s87-demo-composite/`,
   write a sanitized copy (same filename) into `demo/projects/s87-demo-composite/`:
   `LC_ALL=C sed 's/matkatmusicllc/demo/g'`. Nothing else is rewritten.
3. For each of the 16 session UUIDs (the JSONL basenames), if
   `~/.claude/file-history/<uuid>/` exists (14 of 16 do), copy the whole directory to
   `demo/file-history/<uuid>/`. The 2 missing ones are expected — skip silently.
4. Create the repo tarball (a nested `.git` dir cannot be git-tracked; ship it as a tar and
   unpack at runtime): from `jfred/`,
   `tar -cf demo/repo.git.tar -C scenarios/executed/s87-demo-composite .git`.
5. Sanitization gate (must pass before anything is staged):
   - `grep -rl 'matkatmusicllc' demo/projects demo/file-history` → zero matches.
   - `grep -rl "$(hostname)" demo/projects demo/file-history` → zero matches.
   - Extract the tar to a scratchpad dir and `grep -r 'matkatmusicllc'` plus hostname over it
     → zero matches (the author email inside commit objects is exempt per Established facts).
   Any hit = stop, widen the sed, rebuild the copies, re-run the gate.

## Phase 2 — `npm run demo` script

1. Read the existing `"app"` script in `jfred/package.json` and mirror its exact runner
   (`tsx` invocation form, build step, port) — do not invent a new style.
2. Add: `"demo": "npm run build:webapp && tar -xf demo/repo.git.tar -C demo/projects/s87-demo-composite && <same runner as app> src/viewer_server.ts --projects-dir demo/projects --file-history-dir demo/file-history"`
   (keep the app script's port behavior). Re-running must be idempotent (tar overwrite is).

## Phase 3 — Prove the sanitized bundle reconstructs identically (oracle)

1. Build a THROWAWAY verify scenario (auto-gitignored via `scenarios/.gitignore` `executed/`):
   create `jfred/scenarios/executed/s87-demo-verify/` containing
   (a) the 16 SANITIZED JSONLs from `demo/projects/s87-demo-composite/`,
   (b) a copy of `scenarios/executed/s87-demo-composite/.step_states/`,
   (c) a copy of `scenarios/executed/s87-demo-composite/.git/`.
2. From `jfred/`: `npx tsx scripts/check_scenario_coverage.ts s87-demo-verify` → must report
   PASS 118/118. (Sidecar reads fall back to the live `~/.claude/file-history` on this
   machine — fine; sanitization does not touch sessionIds.)
3. On PASS, delete `scenarios/executed/s87-demo-verify/` entirely (it would otherwise pollute
   the user's future full sweeps). On FAIL, stop and diagnose — remember the checker reports
   only the FIRST differing file per step; diff ground-truth step folders directly.

## Phase 4 — Screenshots + GIF into `jfred/assets/` (task 62)

Targets are the four README references: `assets/hero-timeline.png`,
`assets/timeline-filterbar.png`, `assets/inspector.png`, `assets/revision-stepper.gif`.
(The task description's `jfred.html` is stale — the shipped surface is the webapp served by
`viewer_server.ts`; the README's asset names confirm the webapp is what gets shot.)

1. Start the demo server in the background: `npm run demo` from `jfred/` (confirm it binds and
   `curl http://localhost:7343/api/projects` lists `s87-demo-composite`).
2. Capture session rules: headless browse daemon; viewport 1440×900 for every frame; light
   theme (check the webapp default first — if it follows `prefers-color-scheme`, force light
   via the daemon's color-scheme emulation); each capture sequence (goto → consent click →
   poll for rendered timeline → interact → screenshot) inside ONE Bash invocation.
3. Stills:
   - `hero-timeline.png`: the loaded s87 timeline, scrolled to a visually rich mid-session
     region (script runs + file chips visible).
   - `timeline-filterbar.png`: same view with the event-type filter bar prominent and one
     filter active (e.g. Files).
   - `inspector.png`: the details pane open on a substantive record (a tool call or message
     with content).
4. GIF: open the file-revisions view for `core_inventory.py` (31 revisions — the richest
   stepper subject). Step through ~12 consecutive revisions, capturing one PNG frame per step
   into the scratchpad, then assemble:
   `ffmpeg -framerate 1 -i frame%02d.png -vf "scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" assets/revision-stepper.gif`.
5. Visually inspect every produced asset (Read the PNGs; spot-check GIF frames): light theme,
   consistent size, readable text, and zero personal paths in any frame (`/Users/demo/...` is
   the expected sanitized form). Re-shoot anything that fails.
6. Stop the demo server.

## Phase 5 — README

In `jfred/README.md`:
1. Delete the two `<!-- screenshots: task 62 -->` comment lines (the four image references
   stay exactly as written — the assets now exist).
2. Add a short "Try the demo" subsection at the END of the Quick start section:
   `npm run demo` serves a bundled, sanitized real session (the composite demo scenario) so
   the timeline is populated without pointing JFRED at your own `~/.claude`. Two or three
   sentences, matching the README's existing voice.

## Phase 6 — Bookkeeping (superproject) + staging

1. In the superproject: move task objects 60 and 62 from `tasks.json` to
   `completedTasks.json`, each with `completionDate: "2026-07-17"` and a one-sentence
   `closureNote` (60: sanitized s87 bundle committed under jfred/demo with npm run demo;
   62: four README assets captured against it). Omit `commitHashes` — the resolving commit
   does not exist yet (user commits); note that in the closureNote.
2. Stage (do NOT commit) everything: in `jfred/` — `demo/`, `assets/`, `package.json`,
   `README.md`; in the superproject — `tasks.json`, `completedTasks.json`, this plan file,
   the implementation notes, and the updated `jfred` gitlink if applicable.
3. Do not run `npm test`; the user runs the suite.
