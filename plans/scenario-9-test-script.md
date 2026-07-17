# Scenario 9 — Code restoration with no post-rewind file edits

Tests the case where Claude writes a file, the user rewinds with code restoration, and then does NOT ask Claude to modify the file again. This isolates the restoration signal from subsequent file writes.

- [ ] 1. Say: `Write a file called scenario9.py with a function called greet(name) that returns "Hello, " + name`
- [ ] 2. Wait for Claude to finish.
- [ ] 3. Say: `Looks good, thanks.`
- [ ] 4. Wait for Claude to respond.
- [ ] 5. **Rewind** back to message 1 — **WITH code restoration**.
- [ ] 6. Say: `Read scenario9.py and tell me what functions it has.`
- [ ] 7. Wait for Claude to respond.
- [ ] 8. Say: `Thanks, that's all.`
- [ ] 9. `/exit`
- [ ] 10. Record JSONL filename here: `_______________`

## What this tests

In existing scenarios (7, 8), Claude writes the file again AFTER the rewind landing, which contaminates the "after landing" snapshot with a new file-write version bump. In this scenario, the user only asks Claude to READ the file after rewind — no writes. The restoration version bump should be the only unexplained change.

Expected result: algorithm detects 1 rewind, classified as `code-restoration`.

## Bonus: Scenario 10 — Conversation-only with no post-rewind edits (control)

Same flow but with conversation-only rewind, to confirm the algorithm correctly identifies no version bump.

- [ ] 1. Say: `Write a file called scenario10.py with a function called greet(name) that returns "Hello, " + name`
- [ ] 2. Wait for Claude to finish.
- [ ] 3. Say: `Looks good, thanks.`
- [ ] 4. Wait for Claude to respond.
- [ ] 5. **Rewind** back to message 1 — **conversation only, do NOT restore code**.
- [ ] 6. Say: `Read scenario10.py and tell me what functions it has.`
- [ ] 7. Wait for Claude to respond.
- [ ] 8. Say: `Thanks, that's all.`
- [ ] 9. `/exit`
- [ ] 10. Record JSONL filename here: `_______________`

Expected result: algorithm detects 1 rewind, classified as `conversation-only`.
