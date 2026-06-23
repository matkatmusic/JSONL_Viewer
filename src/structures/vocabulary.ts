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
// opened_file_in_ide, task_reminder, diagnostics. Modeled as discriminant only;
// per-kind payload fields are deferred.
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
] as const;

// --- Engine-side discriminants -----------------------------------------------
// Not a wire string: this names the reconstruction engine's own event kinds. It
// lives here so every enum has a single canonical home (coding-requirements §2).

// The evidence kinds the reconstruction engine replays. s1: write (create) and
// delete (Bash rm). s2-move-file adds edit (in-place splice) and rename (Bash
// mv). s3-copy-file adds copy (Bash cp). s4-overwrite-file adds overwrite (a
// second Write to a present file). Later scenarios add read, etc.
export enum EventKind {
    write = "write",
    delete = "delete",
    edit = "edit",
    rename = "rename",
    copy = "copy",
    overwrite = "overwrite",
}
