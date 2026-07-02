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
import {
    reconstructStepStates,
    reconstructStepChanges,
    type RepoSnapshot,
} from "./reconstruction_steps.ts";
import {
    reconstructAll,
    type FileHistory,
    type BranchedReconstruction,
} from "./reconstruction_engine.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import { findSessionId } from "./reconstruction_sidecar_reader.ts";

export type ConversationMessage = {
    uuid: Uuid | undefined;
    parentUuid: Uuid | undefined;
    role: RecordType;
    timestamp: Date | undefined;
    text: string;
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

export function buildStepSnapshots(
    records: TranscriptRecord[],
    reader: BackupReader | undefined,
    target: Path | undefined,
): StepSnapshot[] {
    const states = reconstructStepStates(records, reader);
    const changes = reconstructStepChanges(records, reader);
    const pathOf = indexChangeIdsToPaths(reconstructAll(records, reader));
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

export type ReconstructionDocument = {
    sessionId: Uuid | undefined;
    messages: ConversationMessage[];
    branches: BranchSummary[];
    filesTouched: FileHistory[];
    steps: StepSnapshot[];
    lineVerdicts: LineVerdict[];
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
    return {
        sessionId: findSessionId(records),
        messages: extractConversationMessages(records),
        branches: summarizeBranches(records),
        filesTouched,
        steps: buildStepSnapshots(records, reader, target),
        lineVerdicts: buildLineVerdicts(records),
    };
}
