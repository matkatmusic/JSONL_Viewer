// The s1 transcript's discriminant vocabulary — every string enum, in one
// canonical home, each paired with the runtime set of its wire strings
// (Object.values). Each member's value IS the wire string (enum-class style), so
// parsing is a validated cast, not a transform. Every structure file imports the
// discriminants it needs from here.

// The 10 record `type` values that occur in the s1-delete-file transcript
// (recon/06-s1-vocabulary.md). A later scenario extends this.
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

// The 2 tool names that occur in s1 (recon/06-s1-vocabulary.md).
export enum ToolName {
    Bash = "Bash",
    Write = "Write",
}

// The 6 attachment payload kinds observed in s1 (session-meta attachment record).
// Modeled as discriminant only; per-kind payload fields are deferred.
export enum AttachmentPayloadType {
    hook_success = "hook_success",
    hook_system_message = "hook_system_message",
    hook_additional_context = "hook_additional_context",
    deferred_tools_delta = "deferred_tools_delta",
    agent_listing_delta = "agent_listing_delta",
    skill_listing = "skill_listing",
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
