# Implementation notes — task 191: CLI per-stage progress on stderr

- **Timestamp:** 2026-07-22T22:30:00-07:00
- **Topic:** `--progress` / `--progress-all` flags on the reconstruction CLI; all progress to stderr; stdout pure JSON
- **Conversation:** tackle-task-191
- **Conversation JSONL:** /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/5269dd44-269c-4312-971f-7af584b8479e.jsonl

## References
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/191-cli-progress-stderr.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-per-file-target.md (task-182 attempt-1 motivation: silent reconstruction phase, stdout JSON pollution)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/src/reconstruction_progress.ts (pre-existing engine sink this work reuses)

## Design decisions
- **Reused the existing engine instrumentation wholesale.** ~20 `reportReconstructionProgress` call sites already exist for the viewer; the CLI now installs a stderr sink around its run (`setReconstructionProgressSink` in `runCli`, cleared in `finally`, mirroring the task-119 in-process-re-run precedent). No per-stage plumbing was invented.
- **Two verbosity levels, keyed on the event's counted-ness.** `--progress` prints only uncounted events (stage labels — `parsing records`, `reconstructing <target> — <stage>`, …); `--progress-all` adds counted per-item events as `<label> (<i>/<n>)`. The counted per-record parse events are one-per-JSONL-line (millions on the task-182 292MB run), which is why they are the level-2 tier.
- **`loadTranscript` gets the sink passed explicitly** (`loadTranscript(jsonlPath, sink)`), not via the module-level engine sink: `reconstruction_progress.ts` imports the `ProgressSink` type FROM `loadTranscript.ts`, so the reverse import would be circular.
- **Two new stage announcements in the CLI itself** — `merging <n> transcripts across <m> sources` (only when sources are declared) and `building sidecar backup reader` — covering the two runCli stages that had no engine-side instrumentation.

## Deviations
- None from the plan. One post-plan adjustment: the sink's event formatting was extracted into `formatProgressLine` (the jot Stop hook flagged >3-level nesting in the inline version).

## Tradeoffs
- **stdout "Loading transcript" line commented out, not moved to stderr.** Moving it to stderr would double-print alongside the sink's `loading <file>` event under `--progress`. Repo-wide grep confirmed no test/script/webapp dependency on the line; the viewer already prints sink events server-side.
- **No throttling of `--progress-all`** — the existing `ponytail:` ceiling note in `loadTranscript.ts` already marks where a stride throttle would go if a huge run makes the stream slow.

## Open questions
- None blocking. `src/reconstruction_cli.ts` is now exactly AT the 250-line cap — the next addition to that file must split something out.
