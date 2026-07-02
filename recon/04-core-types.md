# Core load-bearing type definitions

## FileHistorySnapshot definition (where declared)
types/logs.ts:188:export type FileHistorySnapshotMessage = {
utils/fileHistory.ts:39:export type FileHistorySnapshot = {
utils/fileHistory.ts:299:      const newSnapshot: FileHistorySnapshot = {
utils/sessionStorage.ts:50:  type FileHistorySnapshotMessage,
utils/conversationRecovery.ts:24:  type FileHistorySnapshot,
hooks/useFileHistorySnapshotInit.ts:3:  type FileHistorySnapshot,
### body:
(file: types/logs.ts)
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

## SerializedMessage definition
types/logs.ts:8:export type SerializedMessage = Message & {
utils/sessionStorage.ts:53:  type SerializedMessage,
utils/log.ts:14:  type SerializedMessage,
commands/branch/branch.ts:136:    const serialized: SerializedMessage = {

## mode + permission-mode record blocks (types/logs.ts 135-175)
}

export type ModeEntry = {
  type: 'mode'
  sessionId: UUID
  mode: 'coordinator' | 'normal'
}

/**
 * Worktree session state persisted to the transcript for resume.
 * Subset of WorktreeSession from utils/worktree.ts — excludes ephemeral
 * fields (creationDurationMs, usedSparsePaths) that are only used for
 * first-run analytics.
 */
export type PersistedWorktreeSession = {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
  originalBranch?: string
  originalHeadCommit?: string
  sessionId: string
  tmuxSessionName?: string
  hookBased?: boolean
}

/**
 * Records whether the session is currently inside a worktree created by
 * EnterWorktree or --worktree. Last-wins: an enter writes the session,
 * an exit writes null. On --resume, restored only if the worktreePath
 * still exists on disk (the /exit dialog may have removed it).
 */
export type WorktreeStateEntry = {
  type: 'worktree-state'
  sessionId: UUID
  worktreeSession: PersistedWorktreeSession | null
}

/**
 * Records content blocks whose in-context representation was replaced with a
 * smaller stub (the full content was persisted elsewhere). Replayed on resume

## grep type: 'permission-mode' anywhere
