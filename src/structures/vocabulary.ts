// The s1 transcript's discriminant vocabulary — every string enum, in one
// canonical home, each paired with the runtime set of its wire strings
// (Object.values). Each member's value IS the wire string (enum-class style), so
// parsing is a validated cast, not a transform. Every structure file imports the
// discriminants it needs from here.

// The 10 record `type` values that occur in the s1-delete-file transcript
// (recon/06-s1-vocabulary.md). Later scenarios extend this: s4-overwrite-file
// adds queue-operation (a queued user prompt, modeled as discriminant only).
export enum RecordType {
    attachment = "attachment",
    assistant = "assistant",
    user = "user",
    system = "system",
    fileHistorySnapshot = "file-history-snapshot",
    lastPrompt = "last-prompt",
    mode = "mode",
    permissionMode = "permission-mode",
    bridgeSession = "bridge-session",
    aiTitle = "ai-title",
    queueOperation = "queue-operation",
}

export const KNOWN_RECORD_TYPES: RecordType[] = Object.values(RecordType);

// The 4 `message.content` block types that occur in s1 (recon/07, recon/08).
export enum BlockType {
    text = "text",
    thinking = "thinking",
    tool_use = "tool_use",
    tool_result = "tool_result",
}

export const KNOWN_CONTENT_BLOCK_TYPES: BlockType[] = Object.values(BlockType);

// Tool names observed across scenarios: Bash/Write in s1; Read/Edit added by
// s2-move-file (a move done as Read -> Edit -> Write -> Bash `mv`).
export enum ToolName {
    Bash = "Bash",
    Write = "Write",
    Read = "Read",
    Edit = "Edit",
}

// Attachment payload kinds observed across scenarios: 6 in s1; s2-move-file adds
// opened_file_in_ide, task_reminder, diagnostics; s15-user-edit-then-conv-rewind
// adds edited_text_file (a user's out-of-band disk edit, snippet = full post-edit
// content in `cat -n` form). The all-scenario re-run on a newer Claude Code adds
// command_permissions, hook_cancelled, selected_lines_in_ide (seen in s1/s2/s19),
// plus file and invoked_skills (seen in the compact-session scenarios, s63+).
// Modeled as discriminant only; per-kind payload fields are deferred
// (edited_text_file's filename/snippet are read via getAttachmentEntry).
export enum AttachmentPayloadType {
    hook_success = "hook_success",
    hook_system_message = "hook_system_message",
    hook_additional_context = "hook_additional_context",
    deferred_tools_delta = "deferred_tools_delta",
    agent_listing_delta = "agent_listing_delta",
    skill_listing = "skill_listing",
    opened_file_in_ide = "opened_file_in_ide",
    task_reminder = "task_reminder",
    diagnostics = "diagnostics",
    edited_text_file = "edited_text_file",
    command_permissions = "command_permissions",
    hook_cancelled = "hook_cancelled",
    selected_lines_in_ide = "selected_lines_in_ide",
    file = "file",
    invoked_skills = "invoked_skills",
}

export const ATTACHMENT_PAYLOAD_TYPES: AttachmentPayloadType[] =
    Object.values(AttachmentPayloadType);

// --- Field-key groups (top-level wire field names) ---------------------------
// The above enums are the discriminant *values*; these are top-level field
// *names* shared across records. TS types erase at runtime, so the parse gate
// (loadTranscript) and the hydrator (parseRecord) share these lists rather than
// each re-spelling the field names.

// The id-typed envelope fields, hydrated into Uuid by parseRecord.
export const ENVELOPE_ID_KEYS = ["uuid", "parentUuid", "sessionId"] as const;

// Every top-level key an EnvelopeBase carries (the runtime mirror of the
// EnvelopeBase type in envelope.ts) — the field set of every conversational
// record (user/assistant/system/attachment).
export const ENVELOPE_KEYS = [
    "type",
    ...ENVELOPE_ID_KEYS,
    "isSidechain",
    "cwd",
    "gitBranch",
    "version",
    "timestamp",
    "userType",
    "entrypoint",
    "slug",
] as const;

// --- Engine-side discriminants -----------------------------------------------
// Not a wire string: this names the reconstruction engine's own event kinds. It
// lives here so every enum has a single canonical home (coding-requirements §2).

// The evidence kinds the reconstruction engine replays. s1: write (create) and
// delete (Bash rm). s2-move-file adds edit (in-place splice) and rename (Bash
// mv). s3-copy-file adds copy (Bash cp). s4-overwrite-file adds overwrite (a
// second Write to a present file). s5-bash-redirect adds append (a >> redirect to
// a present file). s15-user-edit-then-conv-rewind adds user-edit (a user's
// out-of-band disk edit, captured as an edited_text_file attachment, replayed as a
// full-content revision like overwrite). Later scenarios add read, etc.
export enum EventKind {
    write = "write",
    delete = "delete",
    edit = "edit",
    rename = "rename",
    copy = "copy",
    overwrite = "overwrite",
    append = "append",
    userEdit = "user-edit",
}

// The role a conversation branch plays in the two-DAG render (s12-write-conv-only-rewrite). The
// surviving branch holds the on-disk working tree; a rewound branch forked at a rewind point and was
// abandoned. Same string-enum style as EventKind so the renderer and the CLI speak one vocabulary.
export enum BranchRole {
    surviving = "surviving",
    rewound = "rewound",
}
