// Pure JSON builders: turn the engine's reconstruction objects into plain serializable shapes for the
// CLI's --json output (parallels reconstruction_render.ts for the text views). MUST NOT import from
// reconstruction_cli.ts — one-way dependency, no cycle. The renderJson dispatch lives in the CLI.

import type { Path, Uuid } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { RecordType, BlockType, Verdict } from "./structures/vocabulary.ts";
import { getContentBlocks, type TextBlock } from "./structures/content-blocks.ts";
import { isGenuineUserPrompt } from "./reconstruction_tree.ts";
import { recordVerdict } from "./reconstruction_parse_lines.ts";
import { findConversationBranches } from "./reconstruction_branch.ts";
import { findGitCommitEvents, findGitOperations, type GitOperation } from "./reconstruction_git_evidence.ts";
import {
    reconstructStepTimeline,
    type RepoSnapshot,
} from "./reconstruction_steps.ts";
import {
    reconstructAll,
    type FileHistory,
    type BranchedReconstruction,
} from "./reconstruction_engine.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import { ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX } from "./reconstruction_reseed.ts";
import { findSessionId } from "./reconstruction_sidecar_reader.ts";
import { reportReconstructionProgress } from "./reconstruction_progress.ts";

export type ConversationMessage = {
    uuid: Uuid | undefined;
    parentUuid: Uuid | undefined;
    role: RecordType;
    timestamp: Date | undefined;
    text: string;
    sessionId: Uuid | undefined;
};

// The displayed text of a user prompt or assistant reply: a plain-string content is the text itself;
// an array content is its TextBlocks joined. "" when the record carries no text.
function extractMessageText(record: TranscriptRecord): string {
    const message = record.message as { content?: unknown } | undefined;
    if (message !== undefined && typeof message.content === "string") {
        return message.content;
    }
    const textBlocks = getContentBlocks(record).filter(
        (block): block is TextBlock => block.type === BlockType.text,
    );
    return textBlocks.map((block) => block.text).join("\n");
}

// Build one ConversationMessage from a record (caller has already decided it qualifies).
function buildConversationMessage(record: TranscriptRecord): ConversationMessage {
    return {
        uuid: record.uuid,
        parentUuid: record.parentUuid ?? undefined,
        role: record.type as RecordType,
        timestamp: record.timestamp,
        text: extractMessageText(record),
        sessionId: record.sessionId,
    };
}

// The conversation as the user sees it: genuine typed-in user prompts (engine's isGenuineUserPrompt,
// which rejects tool-result / isMeta / `/exit` user records) plus assistant replies that have displayed
// text (pure tool_use turns carry no text and are skipped).
export function extractConversationMessages(records: TranscriptRecord[]): ConversationMessage[] {
    const messages: ConversationMessage[] = [];
    for (const record of records) {
        if (isGenuineUserPrompt(record)) {
            messages.push(buildConversationMessage(record));
            continue;
        }
        if (record.type === RecordType.assistant && extractMessageText(record) !== "") {
            messages.push(buildConversationMessage(record));
        }
    }
    return messages;
}

export type BranchSummary = {
    tip: Uuid;
    rewindPoint: Uuid | undefined;
    isSurviving: boolean;
    wasRewound: boolean;
};

export function summarizeBranches(records: TranscriptRecord[]): BranchSummary[] {
    return findConversationBranches(records).map((branch) => ({
        tip: branch.tip,
        rewindPoint: branch.rewindPoint,
        isSurviving: branch.isSurviving,
        wasRewound: !branch.isSurviving,
    }));
}

export type StepSnapshot = {
    index: number;
    when: Date;
    changeIds: Uuid[];
    changedPaths: string[];
    files: Record<string, string>;
    sessionId: Uuid | undefined;
};

// Flatten a RepoSnapshot (Map<Path,string>, which JSON.stringify renders as `{}`) into a plain object
// keyed by each path's wire string. When `target` is given, keep only that file.
function convertSnapshotToFileMap(snapshot: RepoSnapshot, target: Path | undefined): Record<string, string> {
    const files: Record<string, string> = {};
    for (const [path, text] of snapshot) {
        if (target !== undefined && !path.equals(target)) {
            continue;
        }
        files[path.toString()] = text;
    }
    return files;
}

// A changeId(string) -> source sessionId index. Two id namespaces resolve here, so a step's changeIds
// can be attributed to the session that evidenced them: every tool_use block's id, and every record's
// own uuid (a user-edit evidence splice carries a file-history-snapshot RECORD uuid as its changeId —
// s40 step 5). The namespaces are disjoint (toolu_… / cse_… vs RFC-4122), so adding record uuids never
// shadows a tool_use id. Synthetic changeIds that match neither (e.g. a `<blob>@vN` ref) resolve to nothing.
function indexChangeIdsToSessionIds(records: TranscriptRecord[]): Map<string, Uuid> {
    const byChangeId = new Map<string, Uuid>();
    for (const record of records) {
        if (record.sessionId === undefined) {
            continue;
        }
        if (record.uuid !== undefined) {
            byChangeId.set(record.uuid.toString(), record.sessionId);
        }
        for (const block of getContentBlocks(record)) {
            if (block.type === BlockType.tool_use) {
                byChangeId.set(block.id.toString(), record.sessionId);
            }
        }
    }
    return byChangeId;
}

// Un-wrap a synthetic reseed changeId to the source id the index knows. An `originalFile` seed stamps
// `originalFile:<real edit changeId>` (reconstruction_reseed); stripping the prefix exposes the real
// tool_use id (s40 step 3). A plain changeId — real, or a record-uuid evidence splice — is returned as-is.
function resolveSyntheticChangeIdToSourceId(changeId: string): string {
    if (changeId.startsWith(ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX)) {
        return changeId.slice(ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX.length);
    }
    return changeId;
}

// A changeId(string) -> final path(string) index across every reconstructed file, so a step's
// changeIds can be resolved to the file paths they touched.
function indexChangeIdsToPaths(histories: FileHistory[]): Map<string, string> {
    const byChangeId = new Map<string, string>();
    for (const history of histories) {
        for (const revision of history.revisions) {
            byChangeId.set(revision.changeId.toString(), history.target.toString());
        }
    }
    return byChangeId;
}

// `surviving` lets a caller that already reconstructed the surviving branch (the document
// builder's BranchedReconstruction) share it; absent, it is derived here (the CLI path).
export function buildStepSnapshots(
    records: TranscriptRecord[],
    reader: BackupReader | undefined,
    target: Path | undefined,
    surviving?: FileHistory[],
): StepSnapshot[] {
    const { states, changes } = reconstructStepTimeline(records, reader);
    reportReconstructionProgress("indexing change ids across surviving files");
    const pathOf = indexChangeIdsToPaths(surviving ?? reconstructAll(records, reader));
    const sessionOf = indexChangeIdsToSessionIds(records);
    return states.map((snapshot, index) => {
        const changeIds = changes[index]!.changeIds;
        // ponytail: best-effort — a step's triggering changeId is not always a surviving revision's
        // changeId (the engine re-stamps revisions during beacon/reseed completion), so off-branch or
        // re-stamped steps resolve to []. changeIds is the reliable pointer; changedPaths is the hint.
        const changedPaths = [
            ...new Set(changeIds.map((id) => pathOf.get(id.toString())).filter((p): p is string => p !== undefined)),
        ];
        return {
            index: index + 1,
            when: changes[index]!.when,
            changeIds,
            changedPaths,
            files: convertSnapshotToFileMap(snapshot, target),
            sessionId: changeIds
                .map((id) => sessionOf.get(resolveSyntheticChangeIdToSourceId(id.toString())))
                .find((sessionId) => sessionId !== undefined),
        };
    });
}

export type LineVerdict = {
    line: number;
    uuid: Uuid | undefined;
    type: RecordType;
    verdict: Verdict;
    isGenuinePrompt: boolean;
};

// The engine's per-line classification, line-aligned to the parsed records array. Pure surfacing of
// recordVerdict + isGenuineUserPrompt (both per-record, no transcript context) — no new logic.
export function buildLineVerdicts(records: TranscriptRecord[]): LineVerdict[] {
    return records.map((record, index) => ({
        line: index,
        uuid: record.uuid,
        type: record.type,
        verdict: recordVerdict(record),
        isGenuinePrompt: isGenuineUserPrompt(record),
    }));
}

// When a `git commit` ran and which session ran it — detected purely from the transcript
// (findGitCommitEvents; no exec gate, no on-disk repo). Commit markers are the timeline's pick
// hard-stops. NOTE: evidence-spliced commit revisions carry RANDOM changeIds that match no JSONL
// line — markers, not changeIds, are the only commit signal usable by the viewer.
export type CommitMarker = {
    timestamp: Date;
    sessionId: Uuid | undefined;
};

export type ReconstructionDocument = {
    sessionId: Uuid | undefined;
    messages: ConversationMessage[];
    branches: BranchSummary[];
    filesTouched: FileHistory[];
    rewoundFilesTouched: FileHistory[];
    steps: StepSnapshot[];
    lineVerdicts: LineVerdict[];
    commitMarkers: CommitMarker[];
    gitOperations: GitOperation[];
};

export function buildReconstructionDocument(
    records: TranscriptRecord[],
    branched: BranchedReconstruction,
    reader: BackupReader | undefined,
    target: Path | undefined,
): ReconstructionDocument {
    const filesTouched =
        target === undefined
            ? branched.surviving
            : branched.surviving.filter((history) => history.target.equals(target));
    // Rewound (abandoned-branch) histories, unwrapped from their branch tags — the timeline marks
    // steps orphaned when their changeIds resolve only here. Filtered like filesTouched.
    const rewoundHistories = branched.rewound.flatMap((branch) => branch.histories);
    const rewoundFilesTouched =
        target === undefined
            ? rewoundHistories
            : rewoundHistories.filter((history) => history.target.equals(target));
    // Sequenced (not an inline object literal) so each sub-phase announces before it runs and the
    // console's line timestamps attribute the build time to the right phase.
    reportReconstructionProgress("extracting conversation messages");
    const messages = extractConversationMessages(records);
    reportReconstructionProgress("summarizing branches");
    const branches = summarizeBranches(records);
    reportReconstructionProgress("building step snapshots");
    const steps = buildStepSnapshots(records, reader, target, branched.surviving);
    reportReconstructionProgress("building line verdicts");
    const lineVerdicts = buildLineVerdicts(records);
    const commitMarkers = findGitCommitEvents(records).map((event) => ({
        timestamp: event.timestamp,
        sessionId: event.sessionId,
    }));
    const gitOperations = findGitOperations(records);
    return {
        sessionId: findSessionId(records),
        messages,
        branches,
        filesTouched,
        rewoundFilesTouched,
        steps,
        lineVerdicts,
        commitMarkers,
        gitOperations,
    };
}
