# Gap-fill recon

## All record "type:" literals defined in types/logs.ts
18 matches in 1 files:

types/logs.ts:56:type: 'summary'
types/logs.ts:62:type: 'custom-title'
types/logs.ts:76:type: 'ai-title'
types/logs.ts:82:type: 'last-prompt'
types/logs.ts:94:type: 'task-summary'
types/logs.ts:101:type: 'tag'
types/logs.ts:107:type: 'agent-name'
types/logs.ts:113:type: 'agent-color'
types/logs.ts:119:type: 'agent-setting'
types/logs.ts:129:type: 'pr-link'
types/logs.ts:138:type: 'mode'
types/logs.ts:168:type: 'worktree-state'
types/logs.ts:182:type: 'content-replacement'
types/logs.ts:189:type: 'file-history-snapshot'
types/logs.ts:209:type: 'attribution-snapshot'
types/logs.ts:234:type: 'speculation-accept'
types/logs.ts:256:type: 'marble-origami-commit'
types/logs.ts:283:type: 'marble-origami-snapshot'

## file-history-snapshot block (types/logs.ts ~180-235)
 */
export type ContentReplacementEntry = {
  type: 'content-replacement'
  sessionId: UUID
  agentId?: AgentId
  replacements: ContentReplacementRecord[]
}

export type FileHistorySnapshotMessage = {
  type: 'file-history-snapshot'
  messageId: UUID
  snapshot: FileHistorySnapshot
  isSnapshotUpdate: boolean
}

/**
 * Per-file attribution state tracking Claude's character contributions.
 */
export type FileAttributionState = {
  contentHash: string // SHA-256 hash of file content
  claudeContribution: number // Characters written by Claude
  mtime: number // File modification time
}

/**
 * Attribution snapshot message stored in session transcript.
 * Tracks character-level contributions by Claude for commit attribution.
 */
export type AttributionSnapshotMessage = {
  type: 'attribution-snapshot'
  messageId: UUID
  surface: string // Client surface (cli, ide, web, api)
  fileStates: Record<string, FileAttributionState>
  promptCount?: number // Total prompts in session
  promptCountAtLastCommit?: number // Prompts at last commit
  permissionPromptCount?: number // Total permission prompts shown
  permissionPromptCountAtLastCommit?: number // Permission prompts at last commit
  escapeCount?: number // Total ESC presses (cancelled permission prompts)
  escapeCountAtLastCommit?: number // ESC presses at last commit
}

export type TranscriptMessage = SerializedMessage & {
  parentUuid: UUID | null
  logicalParentUuid?: UUID | null // Preserves logical parent when parentUuid is nullified for session breaks
  isSidechain: boolean
  gitBranch?: string
  agentId?: string // Agent ID for sidechain transcripts to enable resuming agents
  teamName?: string // Team name if this is a spawned agent session
  agentName?: string // Agent's custom name (from /rename or swarm)
  agentColor?: string // Agent's color (from /rename or swarm)
  promptId?: string // Correlates with OTel prompt.id for user prompt messages
}

export type SpeculationAcceptMessage = {
  type: 'speculation-accept'
  timestamp: string

## Read tool result shape (tools/FileReadTool)
tools/FileReadTool/FileReadTool.ts:260:      file: z.object({
tools/FileReadTool/FileReadTool.ts:272:      file: z.object({
tools/FileReadTool/FileReadTool.ts:301:      file: z.object({
tools/FileReadTool/FileReadTool.ts:308:      file: z.object({
tools/FileReadTool/FileReadTool.ts:316:      file: z.object({
tools/FileReadTool/FileReadTool.ts:327:      file: z.object({
tools/FileReadTool/FileReadTool.ts:565:                file: { filePath: file_path },
tools/FileReadTool/FileReadTool.ts:725:function formatFileLines(file: { content: string; startLine: number }): string {
tools/FileReadTool/FileReadTool.ts:776:  file: {
tools/FileReadTool/FileReadTool.ts:792:    file: {
tools/FileReadTool/FileReadTool.ts:852:      file: { filePath: file_path, cells },
tools/FileReadTool/FileReadTool.ts:1047:    type: 'text' as const,
tools/FileReadTool/FileReadTool.ts:1048:    file: {
tools/FileReadTool/FileReadTool.ts:1148:        file: {

## structuredPatch import in utils/diff.ts (~270-290)
