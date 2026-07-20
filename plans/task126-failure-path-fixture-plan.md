# Task 126 — failure-path fixture (demo-corrupt) + launch.json entry

Goal: a repo-local corrupted copy of the s87 demo bundle that makes the task-119
failure UI (health banner, coverage strip, placeholder rev-card) actually appear in
the viewer, plus a VS Code debug configuration that serves it. The user then clicks
the placeholder rev-card to observe the t124:Q2 problem (card shows a carried-forward
diff instead of the failure reason).

No engine/webapp source changes. No test-suite runs (user runs tests afterward).

## Facts the steps below rely on (verified 2026-07-20)

- Bundle layout: `jfred/demo/` = `projects/s87-demo-composite/` (16 session JSONLs),
  `file-history/<sessionId>/` (14 dirs), `repo.git.tar` (contains a literal `.git/` —
  extracting it before staging triggers the gitlink trap that drops the JSONLs from
  the index; it must only ever be extracted AFTER the fixture is staged).
- `npm run demo` = `build:webapp` + `tar -xf demo/repo.git.tar -C demo/projects/s87-demo-composite`
  + `viewer_server.ts --projects-dir demo/projects --file-history-dir demo/file-history`.
  The corrupt config must mirror BOTH dirs, and the tar extraction, or the git-baseline
  mechanisms degrade the session.
- The engine replays Edits from `toolUseResult.structuredPatch` hunks — NOT from
  `input.old_string` (mangling old_string changes nothing). `applyEdit`
  (`jfred/src/reconstruction_replay_edit.ts`) never throws on content mismatch.
  The only data-reachable path to an unrecoverable placeholder revision is a throw
  inside `appendRevisionsForEvent` (`jfred/src/reconstruction_replay.ts:152-224`):
  set a hunk's `lines` to `null` → `removedOldIndicesOf` iterates `hunk.lines` →
  TypeError → caught per-event → `unrecoverableRevision` (prior lines carried
  forward + `unrecoverable: { reason }`). Hydration (`hydrateEditResult` in
  `jfred/src/structures/tool-results.ts`) and extraction
  (`jfred/src/reconstruction_extract.ts:143` — truthiness check only) both pass a
  null-`lines` hunk through, and `Array.isArray(structuredPatch)` classification
  (`reconstruction_parse_lines.ts:80`) still holds. The record stays a VALID known
  record type (the s87 unknown-record-type trap is avoided).
- Target edit: file `/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.7y52smqe/inventory.py`
  (20 Edits across the bundle — many rev cards). Chosen mid-session edit:
  tool_use id `toolu_01HBGW8JsVGEN8cSzpaWsYNj`, timestamp `2026-07-17T23:44:09.283Z`,
  in session `ee3482f5-9efa-4827-ae72-85bc9975a9a4.jsonl`; the tool_use is line 75,
  its result record (carrying `toolUseResult.structuredPatch`, 1 hunk, 20 hunk lines)
  is line 76 (1-indexed).
- Viewer document cache (`jfred/.cache/built-documents`) is persisted and the corrupt
  bundle reuses the SAME session UUIDs as the clean demo — a warm cache would serve
  the clean document and hide the failure UI. The corrupt launch config therefore
  passes `--resetDocumentCache`. (Also covers the known "warm-cache drops stage notes"
  trap.)
- `jfred` is a git submodule; `demo-corrupt/` is staged inside jfred,
  `.vscode/*.json` inside the outer RevEng repo.

## Step 1 — copy the bundle

```sh
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred"
cp -R demo demo-corrupt
rm demo-corrupt/repo.git.tar
```

`demo/` currently contains NO extracted `.git` (verified), so the copy is safe.
The tar copy is deleted because the prep task (step 3) extracts from
`demo/repo.git.tar` directly — no need to duplicate a 218 KB binary in git.

## Step 2 — corrupt the chosen Edit result

Edit exactly one line of
`jfred/demo-corrupt/projects/s87-demo-composite/ee3482f5-9efa-4827-ae72-85bc9975a9a4.jsonl`,
via a throwaway node script in the scratchpad (NOT committed). The script must:

1. Read the file, split on `"\n"`.
2. Take line 76 (index 75), `JSON.parse` it, and assert ALL of:
   - `record.message.content` contains a block with `type === "tool_result"` and
     `tool_use_id === "toolu_01HBGW8JsVGEN8cSzpaWsYNj"`,
   - `Array.isArray(record.toolUseResult.structuredPatch)` and length 1.
   If any assertion fails, abort without writing (the line numbers drifted — locate
   the record by tool_use_id instead, then re-run).
3. Set `record.toolUseResult.structuredPatch[0].lines = null`.
4. Replace only that line with `JSON.stringify(record)`; join with `"\n"` and write
   back. Every other line must remain byte-identical (no reformatting pass).
5. Re-read and assert the line count is unchanged and line 76 now contains
   `"lines":null`.

## Step 3 — VS Code prep task

`RevEng/.vscode/tasks.json` — add one task after `build:webapp`:

```json
{
    "label": "prep:demo-corrupt",
    "type": "shell",
    "command": "tar -xf demo/repo.git.tar -C demo-corrupt/projects/s87-demo-composite",
    "options": { "cwd": "${workspaceFolder}/jfred" },
    "dependsOn": ["build:webapp"],
    "presentation": { "reveal": "silent", "clear": true }
}
```

Why a task and not a pre-extracted dir: the tar contains a literal `.git/`; if it is
extracted before staging, `git add demo-corrupt` turns the session dir into a gitlink
and drops the JSONLs (the recorded demo trap). Extracting at F5-time mirrors
`npm run demo` exactly and keeps the staged fixture tar-free.

## Step 4 — launch.json entry

`RevEng/.vscode/launch.json` — add a fourth configuration, a clone of
"Debug viewer server (port 7343)" with three differences (name, preLaunchTask,
args):

```json
{
    "type": "node",
    "request": "launch",
    "name": "Debug viewer server (failure fixture)",
    "preLaunchTask": "prep:demo-corrupt",
    "runtimeExecutable": "node",
    "runtimeArgs": ["--import", "tsx"],
    "program": "${workspaceFolder}/jfred/src/viewer_server.ts",
    "args": ["--port", "7343", "--projects-dir", "demo-corrupt/projects", "--file-history-dir", "demo-corrupt/file-history", "--resetDocumentCache"],
    "cwd": "${workspaceFolder}/jfred",
    "skipFiles": ["<node_internals>/**", "**/node_modules/**"],
    "smartStep": true,
    "console": "integratedTerminal"
}
```

`preLaunchTask` is `prep:demo-corrupt` (which itself depends on `build:webapp`), so
one F5 does build + tar extract + serve — same shape as `npm run demo`.

## Step 5 — headless verification probe (scratchpad, throwaway)

Confirm the corruption actually produces an unrecoverable revision before handing
the interactive part to the user. Do NOT run the test suite.

1. Find the document-build composition: `grep -rn "export function handleDocumentRequest" jfred/src/`
   and read how it composes `buildReconstructionDocument`
   (`jfred/src/reconstruction_json.ts:186`) — mirror that composition in a probe.
2. Write a scratchpad tsx script that builds the document for
   `demo-corrupt/projects/s87-demo-composite/ee3482f5-9efa-4827-ae72-85bc9975a9a4.jsonl`
   (tolerant mode, file-history dir pointed at `demo-corrupt/file-history`; the
   un-extracted `.git` is fine here — a missing baseline only adds a health note).
3. Assert, and print the evidence:
   - `JSON.stringify(document)` contains `"unrecoverable"`,
   - the affected file is `inventory.py`,
   - `inventory.py` carries ≥ 3 revisions (so the viewer shows a rev-card ladder
     around the placeholder).
4. Fallback if no `"unrecoverable"` appears (a rescue stage repaired it): change the
   corruption to `record.toolUseResult.structuredPatch = {}` (truthy non-array →
   `for (const hunk of event.hunks)` throws at the top of `applyEdit`) and re-run
   the probe. If that ALSO produces nothing, stop and report findings instead of
   guessing further.
5. Delete nothing from `demo-corrupt` on success; delete the probe script or leave
   it in the scratchpad (it is outside the repo either way).

## Step 6 — stage (do not commit)

Order matters — stage before any F5/tar extraction ever runs:

```sh
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred"
git add demo-corrupt
git ls-files demo-corrupt | head        # must list the JSONLs (no gitlink)
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
git add .vscode/launch.json .vscode/tasks.json plans/task126-failure-path-fixture-plan.md
```

Verify `git status --short` in both repos shows the adds and nothing unexpected.

## Step 7 — hand-off notes for the user (interactive part of task 126)

- Run the "Debug viewer server (failure fixture)" launch configuration, open
  http://localhost:7343, pass the consent dialog.
- Open session `ee3482f5-9efa-4827-ae72-85bc9975a9a4`, then `inventory.py`.
- Expect: health banner + coverage strip gap + a placeholder rev-card at
  `2026-07-17T23:44:09` (the corrupted Edit).
- Click the placeholder rev-card: today it shows a carried-forward diff instead of
  the failure reason — that is the t124:Q2 behavior to observe; file the fix as its
  own task afterward.
- Task 126 stays OPEN until this observation is done; clear it (move to
  completedTasks.json) after.
