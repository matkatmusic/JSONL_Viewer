# Task 338 — Investigation: does the engine understand `/btw` conversation forks?

Investigation only. No source files edited, nothing committed.

Transcript: `~/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/f7d5bed5-6831-4332-912e-e19fe5396350.jsonl` (the tasks-328-to-331 session, `gitBranch: tasks-328-to-331`).

## What actually happens at the fork point

- Line 1426: `{"type":"system","subtype":"local_command", "content":"<command-name>/btw</command-name>...","uuid":"65cdea91-...","parentUuid":"e7be8076-..."}` — the user's `/btw` invocation.
- Line 1427: `{"type":"system","subtype":"local_command","content":"<local-command-stdout>⑂ forked im-not-seeing (de01)</local-command-stdout>","uuid":"217cc870-...","parentUuid":"65cdea91-..."}` — the CLI's own stdout reporting the fork.
- Line 1428 (n+1 in the file): a `queue-operation` `<task-notification>` record referencing `task-id: aim-not-seeing-22b231f10bbede01`.
- The next real conversational record (`user`, uuid `9c389408-...`) has `parentUuid: "217cc870-..."` — i.e. it chains directly off the `local_command` stdout record. **The main session's parentUuid graph is unbroken and fully linear through the fork.**
- `/btw` (`/Users/matkatmusicllc/Desktop/claude code src/commands/btw/{index.ts,btw.tsx}`) spawns a real `Agent(subagent_type:"fork")` call. This produced a genuine second file on disk: `~/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/f7d5bed5-6831-4332-912e-e19fe5396350/subagents/agent-aim-not-seeing-22b231f10bbede01.jsonl`, plus a sibling `.meta.json`: `{"agentType":"fork","isFork":true,"name":"im-not-seeing","spawnDepth":1}`.
- That subagent file's first line is `{"type":"fork-context-ref","agentId":"aim-not-seeing-22b231f10bbede01","parentSessionId":"f7d5bed5-...","parentLastUuid":"e7be8076-...","contextLength":1829}`, then its own independent `parentUuid:null`-rooted chain with `isSidechain:true` throughout.
- Checked the subagent's 21,448-byte transcript for tool calls (`grep -o '"type":"tool_use"...'`): **zero matches**. This particular fork was pure Q&A (the wash-visibility question) — it made no Edit/Write/Bash calls, so no files were actually touched inside it.

## Q1 — Does the engine parse `type:"system"` / `subtype:"local_command"`?

**Handled correctly. Verified by running the real parser against the real lines, not by inspection.**

- `RecordType.system = "system"` is a modeled enum member: `jfred/src/structures/vocabulary.ts:8`.
- `jfred/src/parse/recordKeys.ts:56-61` allow-lists, for `RecordType.system`, `ENVELOPE_KEYS` plus `"subtype", "level", "content", "isMeta", ...` — every top-level key actually present on lines 1426/1427 (`type, uuid, parentUuid, sessionId, isSidechain, cwd, gitBranch, version, timestamp, userType, entrypoint, slug, subtype, content, level, isMeta`) is covered: the envelope fields by `ENVELOPE_KEYS` (`jfred/src/structures/vocabulary.ts:81-92`, which explicitly includes `slug`), the rest by the system-specific extras.
- Ran it for real:
  ```
  $ npx tsx check_record.mts   # parseTranscriptLine() from loadTranscript.ts against lines 1424-1428 of the real file
  1424 OK system stop_hook_summary
  1425 OK system turn_duration
  1426 OK system local_command
  1427 OK system local_command
  1428 OK queue-operation
  ```
  No throw, no skip. `local_command` (and `turn_duration`, `stop_hook_summary`) parse cleanly.

**Verdict: not a gap.** This is unrelated to the prior "unknown TYPE crashes the viewer" issue (that was about a record `type` value entirely absent from the enum, e.g. `worktree-state`/`relocated`). `system` has been a modeled type since Task 1, and `local_command` is inside its allowed-subtype content already.

## Q2 — Does the fork produce a branch/rewind the engine's lineage code understands?

**In the main session: nothing to detect, correctly.** The `/btw` fork does not touch the parentUuid DAG of the transcript at all — `217cc870-...` (the fork-stdout record) is simply the parent of the next turn, same as any other turn boundary. There is no duplicate parentUuid, no re-parenting to an earlier ancestor, nothing resembling a rewind. Branch/lineage reconstruction (which walks parentUuid) has nothing to misinterpret here because Claude Code itself didn't fork this session's graph — it only printed a status line and kicked off a *separate* agent process.

**But the separate agent transcript that WAS created is invisible to the engine, and this is a real, verified gap:**

- `RecordType.forkContextRef = "fork-context-ref"` is modeled in the vocabulary (`vocabulary.ts:19`) and has an allow-list entry (`recordKeys.ts:49-51`: `agentId, parentSessionId, parentLastUuid, contextLength`) — so *if* something fed `subagents/agent-*.jsonl` to `loadTranscript`, the first line would parse fine.
- Nothing does. `viewer_api_projects.ts:103-113` (`listJsonlFiles`) does a single-level `readdirSync(dir)` filtering `name.endsWith(".jsonl")` — it never recurses into a subdirectory. `scanProjects` (`viewer_api_projects.ts:122-128`) treats only the immediate children of the projects root as either "loose files" or "named projects"; a session's own `<sessionId>/subagents/` folder, nested one level inside an already-resolved project directory, is structurally never visited.
- `rg -n 'forkContextRef|agentId|subagent' jfred/src/layered_load.ts jfred/src/reconstruction_cli.ts jfred/src/reconstruction_sidecar_reader.ts` → zero hits. No loader anywhere resolves `forkContextRef.parentSessionId` / `.parentLastUuid` back to a subagent file, and no loader discovers `subagents/*.jsonl` by directory convention either.
- `rg -ni subagents jfred/src jfred/webapp jfred/tests` → the only hits are `jfred/tests/vocabulary.test.ts` and `jfred/tests/recordKeys.test.ts` (schema/allow-list tests, not loader tests). There is no test anywhere that exercises loading a real `subagents/agent-*.jsonl` file.

So `forkContextRef` is modeled but orphaned: the type system accepts the record shape, but no code path ever finds or reads one. The whole `agentType:"fork"` mechanism (used by `/btw`, and presumably by any other `Agent(subagent_type:"fork")` call, which the CLAUDE.md-documented Agent tool supports directly) produces a file the engine cannot ever be pointed at without a new CLI flag, because there's no discovery convention wired up.

**Verdict: not a graph-branch/rewind gap (correctly seen as nothing), but a real, separate gap: the engine has no mechanism to discover or load subagent-fork transcripts at all.**

## Q3 — Are post-fork file changes attributed correctly, dropped, or misattributed?

**In the main session's own file changes: attributed correctly, and trivially so.** Everything after line 1427 in `f7d5bed5-....jsonl` (the Edit/Bash/MultiEdit calls doing the rest of tasks 328-331, e.g. relative offsets +38, +47, +72, +101, +146... after line 1427) is just the next turns of the same linear, unbroken parentUuid chain, same `sessionId`, `isSidechain:false`, `gitBranch: tasks-328-to-331`. There is no fork-shaped structure for the reconstruction/lineage code to get confused by, so there's nothing to misattribute — the "fork" is invisible to it by construction, which happens to be the correct outcome for the trunk.

**In the fork subagent's own file changes: would be silently dropped, not misattributed — but not exercised in this transcript.** This particular `im-not-seeing` fork made zero tool calls (confirmed empty `tool_use` grep over its 21KB transcript), so there is no actual file-change loss to point at in this specific case. But per Q2, if a fork/subagent *did* edit a file, that edit would never even be attempted for reconstruction: the file it lives in is never discovered (`viewer_api_projects.ts`) and never loaded (`layered_load.ts` / `reconstruction_cli.ts`). It wouldn't show up as a wrong node on the wrong branch — it just wouldn't show up.

**Verdict: no misattribution demonstrated or expected (main session is linear); dropping is a real but latent risk for fork-type subagents that do touch files — not proven to have happened in any task 328-331 file, since this one didn't edit anything.**

## Summary

| Question | Verdict |
|---|---|
| Q1: parses `system`/`local_command`? | Handled. Verified by running `parseTranscriptLine` on the real lines — no throw, no skip. |
| Q2: branch/rewind/nothing? | Nothing, correctly — parentUuid chain never forks. Separate real gap: subagent-fork transcripts (`fork-context-ref` type, modeled but unused) are never discovered or loaded by any code path. |
| Q3: attribution of post-fork changes? | Main-session changes: correct (trivial, linear). Fork-subagent changes: would be dropped, not misattributed — not exercised here since this fork made no edits. |

## Proposed fix (one task, sized small)

**Task: teach the session loader to discover and (optionally) fold in subagent-fork transcripts.**

Scope:
1. Add a `listSubagentTranscripts(projectDir, sessionId)` helper (near `viewer_api_projects.ts`'s `listJsonlFiles`) that looks for `<projectDir>/<sessionId>/subagents/agent-*.jsonl` and returns them alongside the main session's `.jsonl` file as an explicit, separate source list — do not silently merge into `scanProjects`'s existing per-project listing, since these are per-session, not per-project.
2. In `reconstruction_cli.ts` / `layered_load.ts`, when a `local_command` record's stdout matches the `⑂ forked ...` pattern (or, more robustly, whenever a subagent transcript's `fork-context-ref` line's `parentSessionId`/`parentLastUuid` matches the session being reconstructed), load that subagent file through the existing `loadTranscript`/`parseTranscriptLine` path (already handles `fork-context-ref` — no parser change needed) and run its own tool-use records through the normal file-event extraction (`reconstruction_extract.ts`), attributing any resulting `EditEvent`/`FileEvent` to the tree at `parentLastUuid`, tagged as a sidechain (mirrors how `isSidechain:true` is already carried on those records).
3. Add one fixture: a synthetic session + a `subagents/agent-*.jsonl` with at least one real `Edit`/`Write` inside the fork, to prove a change made *inside* a fork is no longer silently dropped.

This is scoped to "notice these files exist and run them through the pipeline that already exists for main-session tool calls" — it is not a new reconstruction algorithm. Ponytail note: skip building general multi-agent-depth (`spawnDepth > 1`) support until a real transcript needs it; `spawnDepth` is already captured in `.meta.json` for whenever that's needed.

## Resolution (task 375)

Item 1 above is done: `listSubagentTranscripts(projectDir, sessionId)` lives in
`jfred/src/viewer_api_projects.ts`, and `jfred/src/layered_load.ts`'s
`loadLayeredProject` now calls it per discovered session file and folds each
subagent transcript's nodes into the same entity graph via the existing
`collectSessionNodes`/`extractFileEvents` pipeline — no new extraction logic
needed (`reconstruction_extract.ts` is unchanged). Covered by
`test_loadLayeredProject_includes_fork_subagent_file_events` in
`jfred/tests/layered_load.test.ts`, which fails on pre-task-375 code (the
forked file's entity is missing) and passes after.

Item 2's CLI-side half (`reconstruction_cli.ts` /
`reconstruction_cli_args.ts`) is **not done** — that path resolves
`--jsonl`/directory paths independently of `layered_load.ts` and needs its own
read of `reconstruction_engine.ts`'s branch-reconstruction walk before a fix
can be written (see `plans/task-375-plan.md`, Phase 3). Fork-subagent file
edits are now visible in the webapp Layer 1 viewer; they are still invisible
to the CLI reconstruction path. Follow-up task recommended.
