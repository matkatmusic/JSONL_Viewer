# s1 per-structure field inventory (only fields actually present in the data)

## Top-level keys per record.type
- **ai-title**: aiTitle, sessionId, type
- **assistant**: cwd, entrypoint, gitBranch, isSidechain, message, parentUuid, requestId, sessionId, timestamp, type, userType, uuid, version
- **attachment**: attachment, cwd, entrypoint, gitBranch, isSidechain, parentUuid, sessionId, timestamp, type, userType, uuid, version
- **bridge-session**: bridgeSessionId, lastSequenceNum, sessionId, type
- **file-history-snapshot**: isSnapshotUpdate, messageId, snapshot, type
- **last-prompt**: lastPrompt, leafUuid, sessionId, type
- **mode**: mode, sessionId, type
- **permission-mode**: permissionMode, sessionId, type
- **system**: content, cwd, durationMs, entrypoint, gitBranch, hasOutput, hookAdditionalContext, hookCount, hookErrors, hookInfos, isMeta, isSidechain, level, messageCount, parentUuid, preventedContinuation, sessionId, stopReason, subtype, timestamp, toolUseID, type, userType, uuid, version
- **user**: cwd, entrypoint, gitBranch, isSidechain, message, origin, parentUuid, permissionMode, promptId, promptSource, sessionId, sourceToolAssistantUUID, timestamp, toolUseResult, type, userType, uuid, version

## message.* keys per record.type (records that carry a message object)
- **assistant**: content, diagnostics, id, model, role, stop_details, stop_reason, stop_sequence, type, usage
- **user**: content, role

## content block keys per block type
- **text**: text, type
- **thinking**: signature, thinking, type
- **tool_result**: content, is_error, tool_use_id, type
- **tool_use**: caller, id, input, name, type

## toolUseResult keys per tool
- **Bash**: interrupted, isImage, noOutputExpected, stderr, stdout
- **Write**: content, filePath, originalFile, structuredPatch, type, userModified

# s1 file-history-snapshot nested shape (from data)

snapshot records: 5

## snapshot.* keys: messageId, timestamp, trackedFileBackups
## trackedFileBackups[path].* keys: backupFileName, backupTime, version

## sample backup entry:
```json
{
  "path": "s1_delete.py",
  "backupKeys": [
    "backupFileName",
    "version",
    "backupTime"
  ],
  "backupPreview": {
    "backupFileName": null,
    "version": 1,
    "backupTime": "<string len 24>"
  }
}
```