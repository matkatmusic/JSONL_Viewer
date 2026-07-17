# Unified File Reconstruction Algorithm

## Goal

Given a JSONL transcript and a target file path, reconstruct the final state of that file by replaying all available evidence in chronological order. Use the highest-confidence source available at each point in time.

## Sources of Truth (highest to lowest confidence)

1. SNAPSHOT — file-history-snapshot record containing full file content via trackedFileBackups
2. ORIGINAL_FILE — the originalFile field on a toolUseResult, capturing full file content immediately before an edit
3. READ — a Read tool result returning full file content
4. STRUCTURED_PATCH — the structuredPatch field on a toolUseResult, providing line-numbered hunks with old-lines (pre-edit) and new-lines (post-edit)
5. CAT — a Bash cat command stdout returning full file content

## Timeline Model

The JSONL transcript is a linear sequence of events. Each event has a line number (its position in the file). Events relevant to reconstruction:

- SNAPSHOT events (type: file-history-snapshot)
- EDIT events (toolUseResult with create/update/edit type)
- READ events (Read tool use + result pair)
- CAT events (Bash cat tool use + result pair)

All events are sorted by line number (chronological order within the session).

## Algorithm

```
applyAndAccountForDrift(state, modificationSource):
  diffOfState = diff(state, modificationSource)
  if diffOfState is not None:
    record(diffOfState, type=UserEdit)
  oldContent = state.content
  applySourceToState(state, modificationSource)
  if state.content != oldContent:
    editDiff = diff(oldContent, state.content)
    record(editDiff, type=AgentEdit)

algorithm(jsonl[], state):
  steps = extractStepsFromJSONL(jsonl) # steps are sorted by JSON line timestamp
  for step in steps:
    if step.snapshot is not None:
      applyAndAccountForDrift(state, step.snapshot)
    else if step.originalFile is not None:
      applyAndAccountForDrift(state, step.originalFile)
    else if step.readResult is not None:
      applyAndAccountForDrift(state, step.readResult)
    else if step.bashReadResult is not None:
      applyAndAccountForDrift(state, step.bashReadResult)
    else if step.structuredPatch is not None:
      applyAndAccountForDrift(state, step.structuredPatch)
  return state


getJsonlFilesFromFolderForFile(folder, file):
  jsonls = getAllJSONLPaths(folder)
  matchingJSONLs = filterJSONLs(folder,file)
  return matchingJSONLs # an array of JSONL files

reconstructFile(jsonlSourceFolder, file):
  jsonls = getJsonlFilesFromFolderForFile(folder, file)
  state = ""
  algorithm(jsonls, state)
  if state == file: #compare against on-disk copy
    print( "reconstructed {file}" )
  else:
    print( "mismatched {file} during reconstruction" )
```

### applyAndAccountForDrift

Detects user edits by diffing current state against the source, records any drift as a user-created edit, then advances state through the source.

### diff(state, modificationSource)

For full-content sources (snapshot, originalFile, readResult): standard line diff of state against the source content. Returns null if identical.

For structuredPatch: compares state's lines at the patch's target line ranges against the patch's old-lines. Returns null if the covered regions match. Accounts for line number drift by using context lines as anchors to locate the correct region.

### applySourceToState(state, modificationSource)

| Source | Operation |
|--------|-----------|
| snapshot | state = snapshot content |
| originalFile | state = apply(edit, originalFile) — sets pre-edit state then applies the edit's oldString→newString or content |
| readResult | state = read content |
| structuredPatch | splice old-lines region with new-lines region at the patch's line ranges |
| cat | state = cat content |

## Patch Log

The algorithm produces a complete, ordered list of diff patches — both UserEdit (drift corrections) and AgentEdit (tool operations) — that transforms the empty file into its final state. This is the definitive edit chain for the file.

Each patch entry records:
- The diff (before/after content)
- Type: UserEdit or AgentEdit
- Line number and timestamp from the source step
- Source type that produced the patch (snapshot, originalFile, readResult, bashReadResult, structuredPatch)

JFReD displays UserEdit patches as MISMATCH steps. The full patch log can be replayed independently to reconstruct the file without the original JSONL.

## Handling Rewinds

When a rewind is detected (backward parentUuid jump):
- Edits between the rewind landing point and the rewind target are classified as "ignored"
- Ignored edits are NOT applied to STATE
- Snapshots and observations (Read/cat) within the ignored range ARE still processed — they're ground truth regardless of rewind status

## Handling File Creation and Deletion

- First EDIT with type='create' transitions STATE from "" to the created content
- If no snapshot or edit mentions the target file, STATE remains "" (file never existed in this session)
- File deletion is detected when a file appears in an earlier snapshot but not a later one
