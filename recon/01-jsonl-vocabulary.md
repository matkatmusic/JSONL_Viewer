# Scenario JSONL Vocabulary (fog-of-war boundary)

files: 30  lines: 3557  sidechain-lines: 0  root(parentUuid=null): 30

## Scenarios
- m1-cp-fork  6dd28b9c-6553-4a42-ba00-0b681bd890bb.jsonl  146 lines
- m2-mv-rename  70c5989e-017b-425f-8a8b-89daec0c4528.jsonl  124 lines
- m3-bash-redirect  0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl  93 lines
- m4-delete-recreate  c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl  134 lines
- m5-full-interleave  d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl  136 lines
- m6-cp-user-edit-rewind  134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl  160 lines
- m7-conv-rewind-no-user-edits  725204e2-8678-4c45-82d0-262557bff0ad.jsonl  134 lines
- s1-delete-file  b3634dc4-a385-40b9-8e23-6695a4f7bb7e.jsonl  80 lines
- s10-conv-only-no-post-edit  517dcc05-8809-43cd-86d4-7f6907b9ee76.jsonl  96 lines
- s11-write-code-restore-rewrite  a26b3dcb-cf00-4b17-a595-86dd57d4df83.jsonl  119 lines
- s12-write-conv-only-rewrite  e320b4f6-c7ec-4084-90b9-44ca935d7577.jsonl  140 lines
- s13-multi-edit-code-restore-read  546faa49-72b6-4b57-9557-d54e2ff7aa56.jsonl  111 lines
- s14-multi-edit-conv-only-read  6d632174-79b3-4c11-953f-1308a957d748.jsonl  109 lines
- s15-user-edit-then-conv-rewind  7365140d-8666-4dbf-81bc-9d92e9d6cac9.jsonl  92 lines
- s16-multi-edit-code-restore-re-edit  1ae6a672-d55d-41a6-add3-46123a227440.jsonl  116 lines
- s17-multi-edit-conv-only-re-edit  4c41e3a3-a213-40f4-8df7-169bf61a8e40.jsonl  122 lines
- s18-user-edit-no-rewind  a2146944-adfe-408d-b9be-0de8cc1d4c72.jsonl  90 lines
- s19-user-edit-conv-rewind  6fc31802-b970-4698-9814-cc04c0fef14f.jsonl  118 lines
- s2-move-file  1e82511e-05a3-4712-9a95-206b24128694.jsonl  125 lines
- s20-user-edit-code-rewind  cff07216-e002-4839-9e95-42547049332e.jsonl  127 lines
- s21-multiple-user-edits  7a7ce498-01f6-469d-ba3f-a8ba0ee748cb.jsonl  117 lines
- s22-user-edits-conv-rewind  64ab0dde-e737-4ba6-9d31-64ead32f6ff4.jsonl  120 lines
- s23-user-edits-code-rewind  2bb895d4-b58b-483e-bc3a-d6a4505cbf08.jsonl  130 lines
- s3-copy-file  ac6edd6f-cc4e-4423-87f9-468530849db5.jsonl  104 lines
- s4-overwrite-file  58f8c26c-48d5-4e8f-953c-265005a6ee73.jsonl  90 lines
- s5-bash-redirect  621364dd-a153-42f4-b44f-b6b5232c57e9.jsonl  78 lines
- s6-git-mv  9cf5d06b-af23-469a-9451-a3c562ba9938.jsonl  124 lines
- s7-minimal-code-restore  d0d14660-4477-40fa-824c-e7f0bb91cd66.jsonl  133 lines
- s8-repeated-code-restore-rewinds  ac304418-47fe-4c2b-be86-ea62783110e0.jsonl  188 lines
- s9-code-restore-no-post-edit  b381c39b-e81e-45e8-b400-03edc4ee4be3.jsonl  101 lines

## Top-level record keys
- type: 3557
- sessionId: 3333
- timestamp: 2581
- parentUuid: 2539
- isSidechain: 2539
- uuid: 2539
- userType: 2539
- entrypoint: 2539
- cwd: 2539
- version: 2539
- gitBranch: 2539
- attachment: 1323
- message: 914
- requestId: 474
- promptId: 440
- subtype: 302
- permissionMode: 299
- toolUseResult: 246
- sourceToolAssistantUUID: 246
- messageId: 224
- snapshot: 224
- isSnapshotUpdate: 224
- origin: 194
- isMeta: 179
- level: 162
- bridgeSessionId: 158
- lastSequenceNum: 158
- leafUuid: 156
- mode: 156
- promptSource: 143
- hookCount: 140
- hookInfos: 140
- hookErrors: 140
- hookAdditionalContext: 140
- preventedContinuation: 140
- stopReason: 140
- hasOutput: 140
- toolUseID: 140
- durationMs: 140
- messageCount: 140
- lastPrompt: 126
- aiTitle: 126
- content: 43
- operation: 42

## record.type values
- attachment: 1323
- assistant: 474
- user: 440
- system: 302
- file-history-snapshot: 224
- bridge-session: 158
- last-prompt: 156
- mode: 156
- permission-mode: 156
- ai-title: 126
- queue-operation: 42

## message.content block types
- tool_use: 246
- tool_result: 246
- text: 198
- thinking: 30

## tool_use names
- Bash: 90
- Write: 69
- Read: 48
- Edit: 39

## toolUseResult key-sets (sorted keys -> count)
- [interrupted,isImage,noOutputExpected,stderr,stdout]: 88
- [content,filePath,originalFile,structuredPatch,type,userModified]: 69
- [file,type]: 47
- [filePath,newString,oldString,originalFile,replaceAll,structuredPatch,userModified]: 38
