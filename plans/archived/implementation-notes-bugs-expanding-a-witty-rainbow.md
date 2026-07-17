# Implementation Notes — JSONL-tree-viewer-v2

Spec: `/Users/matkatmusicllc/.claude/plans/bugs-expanding-a-witty-rainbow.md`

## Files

| File | Purpose |
|---|---|
| `RevEng/JSONL-tree-viewer-v2.html` | Stable viewer — flat line list with all features through step 7 (diff) |
| `RevEng/JSONL-tree-viewer-v2-dev.html` | Dev viewer — adds conversational view, branch detection, rewind classification, file edit badges |
| `RevEng/detect-rewinds.js` | Standalone CLI tool — detects rewinds in a JSONL file and classifies them |
| `RevEng/detect-rewinds.test.js` | Test suite — 15 scenarios, 17 rewinds, all passing |
| `RevEng/test-transcript.jsonl` | Symlink to test JSONL file (scenario 8) |

## Progress

### Steps 1–7: Load + flat list + colors + expand + select + inspector + diff
- **Status**: Complete in both v2.html and v2-dev.html
- All lines shown with 17 distinct color-coded subtypes
- `{ }` expands raw JSON inline with syntax highlighting (keys bold, values normal)
- `[+]` shows/hides child nodes in conversational view
- Checkbox selects lines for JSON inspector; two selections trigger diff view
- Diff view has per-pane `◀ Line N ▶` navigation, skipping the other pane's line
- Jump links: clicking parentUuid, tool_use IDs, or any UUID in the inspector jumps to that line
- Filter bar with preset field chips (originalFile, structuredPatch, tool_use, etc.)
- "Prev/Next (same type)" buttons in single-select inspector
- "Diff with next same-type line" button for quick comparison
- Draggable resize handle on inspector panel

### Step 8: Conversational view (v2-dev.html only)
- Default view shows only user prompts + agent text responses
- "Show All Lines" button toggles to flat list
- Lines before first user message grouped under synthetic "system" node
- `[+]` on conversational nodes reveals intermediate steps (tool_use, tool_result, attachments, etc.)
- All child lines show friendly labels instead of raw JSON (e.g. "Hook_Success: PreToolUse:Read", "Tool Result: Edit", "tool_use: Write")
- `{ }` on child lines expands to: friendly label + syntax-highlighted raw JSON
- File edit badges on conversational rows: `△ scenario8.py` with **kept**/**ignored** status

### Step 9: Branch detection (v2-dev.html only)
- Rewinds detected and classified as code-restoration or conversation-only
- Branch fork points rendered with labels: "Branches (rewind — code restored)" or "Branches (rewind — conversation only)"
- Inactive branches collapsed by default, active branches expanded
- Branch count shown in header

## Rewind Detection Algorithm

### Overview

The algorithm in `detect-rewinds.js` detects rewinds in Claude Code JSONL transcripts and classifies each as "code-restoration" (files were reverted to an earlier state) or "conversation-only" (only the conversation rewound, files untouched).

### How rewinds appear in JSONL

Claude Code's `/rewind` feature creates a fork in the conversation tree. The new user message's `parentUuid` points back to an earlier node, creating a "backward jump" in the linear JSONL file.

### Detection: 3 signals

1. **Direct backward jump**: A user prompt's `parentUuid` resolves to a line much earlier than the current high-water mark (`parentLine < lastHighWater - 3`).

2. **Indirect backward jump**: The user prompt's immediate parent is sequential, but walking the parent chain finds a backward link. This catches cases where `system.away_summary` nodes sit between the rewind and the landing (seen in scenario 5 rewind 2).

3. **Sibling detection**: Two user prompts share the same `parentUuid`. The second one is a rewind fork. This catches short rewinds where the backward jump is only a few lines (seen in scenario 15).

**Filter**: Messages starting with `<command-name>` or `<local-command` are excluded — these are CLI command artifacts (e.g. `/exit`) that create backward jumps but aren't rewinds.

### Classification: 3 windows

Once a rewind is detected, it's classified by checking for "unexplained" file version bumps — version changes in `file-history-snapshot` entries that have no corresponding `toolUseResult` file write to explain them. Claude's edits always produce a `toolUseResult`; code restoration by the rewind mechanism does not.

1. **Window 1**: Compare the two consecutive `file-history-snapshot` entries before the landing. If the version changed and no file write occurred between them → code-restoration. This catches cases where the restoration snapshot lands before the user message (e.g. scenario 4).

2. **Window 2**: Compare the snapshot before the landing with the snapshot after the landing. If the version changed and no file write occurred between them → code-restoration. This catches cases where the restoration bump appears after the landing (e.g. scenario 6).

3. **Window 3 (backup=null heuristic)**: If Windows 1 and 2 both find file writes masking the restoration (e.g. scenario 7: write → restore → re-write with no separating snapshot), check whether the pre-landing snapshot has `backupFileName === null` with `version > 1`. Code restoration consumes/resets the backup file, leaving null. Conversation-only rewinds leave the backup intact. This heuristic is a tiebreaker for the one edge case (scenario 7) where the other windows fail.

### Key discovery: file-history-snapshot structure

```json
{
    "type": "file-history-snapshot",
    "snapshot": {
        "messageId": "uuid-of-rewind-target",
        "trackedFileBackups": {
            "scenario8.py": {
                "version": 3,
                "backupFileName": "04920aa3b65f5480@v2",
                "backupTime": "2026-06-02T18:25:59.422Z"
            }
        }
    }
}
```

- `messageId`: points to the rewind target message (clickable in the viewer)
- `version`: increments on each file write by Claude. Code restoration also bumps the version.
- `backupFileName`: references a file in `~/.claude/file-history/<sessionId>/`. When code restoration occurs, this field becomes `null` (backup consumed). When `null` on version > 1, it's a strong signal of code restoration.
- `trackedFileBackups`: maps filenames to version info. The filename key (e.g. `scenario8.py`) is the tracked file; the `backupFileName` value (e.g. `04920aa3b65f5480@v2`) is a hash+version identifier in the file-history directory.
- User edits outside Claude do NOT bump the version (verified in scenario 15).

### File edit kept/ignored classification

Each file write (toolUseResult with create/update/edit) is classified as **kept** or **ignored**:

- **Ignored**: A later rewind has `classification === 'code-restoration'` AND `parentLine < writeLineIndex` (the rewind target is before this write, meaning the write was reverted).
- **Kept**: No subsequent code-restoration rewind reverts past this write. Note: a conversation-only rewind does NOT revert file changes, so writes survive those.

### Test scenarios

All test JSONL files are in:
- `/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/`
- `/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/`

Scripts: `/Users/matkatmusicllc/Programming/jot-recovery/plans/rewind-signal-test-scenarios.md`

| Scenario | JSONL | Rewinds | Expected | Notes |
|---|---|---|---|---|
| 3 | b73b9e80 | 1 | conversation-only | Single file, write before rewind |
| 4 | 7a04b3d1 | 1 | code-restoration | Mirror of S3 |
| 5 | f3ab1ad4 | 2 | conv-only, code-restore | Multi-edit, mixed rewind types |
| 6 | 4dcf9bd0 | 2 | code-restore, conv-only | S5 with rewind types swapped |
| 7 | bb4623f2 | 1 | code-restoration | Edge case: no snapshot between write and restore (Window 3 catches it) |
| 8 | d415450b | 3 | code, code, conv-only | Complex tree: 3 nested rewinds |
| 9 | dfe3d05f | 1 | code-restoration | No post-rewind file edits |
| 10 | 6efe5d6d | 1 | conversation-only | Control for S9 |
| 11 | 99a40d06 | 1 | code-restoration | Write, conv step, rewind, re-write |
| 12 | fefe9dc2 | 1 | conversation-only | Control for S11 |
| 13 | f3d26066 | 1 | code-restoration | Multi-edit, read-only after rewind |
| 14 | 269cdfdf | 1 | conversation-only | Control for S13 |
| 15 | 4209e1a1 | 1 | conversation-only | User edit outside Claude, short rewind (sibling detection) |
| 16 | 57d47184 | 1 | code-restoration | Multi-edit, re-edit after rewind |
| 17 | 2fe81cc0 | 1 | conversation-only | Control for S16 |

### Known limitation

Scenario 7's pattern (write → immediate rewind → re-write, no conversational step between write and rewind) is the hardest case. Windows 1 and 2 both see file writes masking the restoration. Only Window 3 (backup=null heuristic) catches it. If a future scenario has this pattern AND backup is non-null, the algorithm would fail. In practice, users almost always say something before rewinding, which creates the snapshot boundary the algorithm needs.

## Design Decisions

- 2026-06-02: `showOpenFilePicker` loads directly rather than setting `?file=` and reloading — browser security prevents reading the full local path from the picker API.
- 2026-06-02: Test JSONL symlinked into RevEng as `test-transcript.jsonl` since the Python HTTP server only serves from its working directory.
- 2026-06-02: 17 distinct subtype buckets for color coding, each with a unique color. User prompts (bright green) and agent replies (bright orange) are most prominent; everything else spreads across the opposite side of the hue wheel.
- 2026-06-02: tool_use subtypes include the tool name (e.g. `tool-use-edit`, `tool-use-bash`) so diff type-gating treats different tools as separate types.
- 2026-06-02: `?file=` parameter strips surrounding quotes and shows helpful symlink instructions for absolute paths that fail to fetch.
- 2026-06-03: Separate `{ }` button for expanding raw JSON inline vs `[+]` for showing/hiding child nodes. Prevents confusion between the two operations.
- 2026-06-03: `friendlyName()` function generates human-readable labels for all 17 subtypes instead of showing raw JSON prefixes.

## Subtype Classification

Every JSONL line is classified into one of these subtypes (used for coloring, diff gating, and labels):

| Subtype | Source | Label |
|---|---|---|
| `user-prompt` | type=user, text content | User: \<message\> |
| `assistant-text` | type=assistant, text content | Agent: \<message\> |
| `assistant-thinking` | type=assistant, thinking block | Thinking |
| `tool-use-\<name\>` | type=assistant, tool_use block | tool_use: \<Name\> |
| `tool-result` | type=user, tool_result block | Tool Result: \<Source Tool\> |
| `system` | type=system | System: \<subtype\> |
| `preamble` | last-prompt, custom-title, agent-name, mode, permission-mode, bridge-session | \<type name\> |
| `file-history` | type=file-history-snapshot | file-history-snapshot |
| `queue-op` | type=queue-operation | queue-operation |
| `attach-hook-success` | attachment.type=hook_success | Hook_Success: \<hookName\> |
| `attach-hook-context` | attachment.type=hook_additional_context | Hook: additional context |
| `attach-hook-system` | attachment.type=hook_system_message | Hook: system message |
| `attach-deferred` | attachment.type=deferred_tools_delta | Deferred tools delta |
| `attach-skill` | attachment.type=skill_listing | Skill listing |
| `attach-queued` | attachment.type=queued_command | Queued command |
| `attach-task` | attachment.type=task_reminder | Task reminder |
| `attach-other` | attachment with unknown type | Attachment: \<type\> |
