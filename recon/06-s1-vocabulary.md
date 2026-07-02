# s1-delete-file vocabulary
lines: 80

## record.type
- attachment: 29
- assistant: 11
- user: 8
- system: 8
- file-history-snapshot: 5
- last-prompt: 4
- mode: 4
- permission-mode: 4
- bridge-session: 4
- ai-title: 3

## content blocks
- text: 5
- tool_use: 5
- tool_result: 5
- thinking: 1

## tool_use names
- Bash: 3
- Write: 2

## toolUseResult key-sets
- [interrupted,isImage,noOutputExpected,stderr,stdout]: 3
- [content,filePath,originalFile,structuredPatch,type,userModified]: 2

## top-level keys
- type: 80
- sessionId: 75
- parentUuid: 56
- isSidechain: 56
- uuid: 56
- timestamp: 56
- userType: 56
- entrypoint: 56
- cwd: 56
- version: 56
- gitBranch: 56
- attachment: 29
- message: 19
- requestId: 11
- promptId: 8
- subtype: 8
- permissionMode: 7
- messageId: 5
- snapshot: 5
- isSnapshotUpdate: 5
- toolUseResult: 5
- sourceToolAssistantUUID: 5
- level: 5
- isMeta: 5
- leafUuid: 4
- mode: 4
- bridgeSessionId: 4
- lastSequenceNum: 4
- origin: 3
- promptSource: 3
- lastPrompt: 3
- aiTitle: 3
- hookCount: 3
- hookInfos: 3
- hookErrors: 3
- hookAdditionalContext: 3
- preventedContinuation: 3
- stopReason: 3
- hasOutput: 3
- toolUseID: 3
- durationMs: 3
- messageCount: 3
- content: 2
