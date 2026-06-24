// Conversation-branch model. A rewind forks the parentUuid tree; each `last-prompt` record's
// `leafUuid` names a conversation head. The surviving branch is the one holding the on-disk working
// tree (usually the final head; see findSurvivingHead); abandoned heads (deduped to maximal tips)
// are rewound branches that forked at a rewind point. Selecting a branch keeps its tip's ancestor
// chain plus uuid-less meta records. The generic parentUuid/head walkers live in
// reconstruction_tree.ts; working-tree-owner detection in reconstruction_worktree.ts. See
// plans/s7/s7-reconstruction-plan.md and plans/s8/s8-reconstruction-plan.md.

import type { TranscriptRecord } from "./structures/envelope.ts";
import { Uuid } from "./structures/domain.ts";
import {
    collectAncestorUuids,
    collectHeadUuids,
    findHeadAtOrAbove,
    indexRecordsByUuid,
} from "./reconstruction_tree.ts";
import { findWorkingTreeOwner } from "./reconstruction_worktree.ts";
import { findStructuralRewoundBranches } from "./reconstruction_fork.ts";
import { extractFileEvents } from "./reconstruction_extract.ts";
import type {
    BranchedReconstruction,
    FileHistory,
} from "./reconstruction_engine.ts";

// A branch through the conversation's parentUuid tree, named by its tip (a last-prompt leafUuid).
// The surviving branch is the one the final last-prompt points to; a rewound branch forked at
// rewindPoint and was abandoned. rewindPoint is undefined for the surviving branch.
export type ConversationBranch = {
    tip: Uuid;
    rewindPoint: Uuid | undefined;
    isSurviving: boolean;
};

// The surviving head: normally the final last-prompt head, but when a conversation-only rewind left
// the working tree on a branch the final head can't reach, the head at-or-above the working-tree
// owner instead. Falls back to the final head when there is no snapshot / no tracked-set change.
function findSurvivingHead(records: TranscriptRecord[]): Uuid | undefined {
    const heads = collectHeadUuids(records);
    if (heads.length === 0) {
        return undefined;
    }
    const finalHead = heads[heads.length - 1]!;
    const owner = findWorkingTreeOwner(records);
    if (owner === undefined) {
        return finalHead;
    }
    const finalChain = collectAncestorUuids(records, finalHead);
    if (finalChain.has(owner.toString())) {
        return finalHead;
    }
    const workingTreeHead = findHeadAtOrAbove(records, owner);
    if (workingTreeHead === undefined) {
        return finalHead;
    }
    if (survivingBranchRecordsFileChange(records, finalHead)) {
        return finalHead;
    }
    return workingTreeHead;
}

// True when the final-head branch produces any file event of its own (its trunk holds the creating
// Writes). When it does, the on-disk working tree is already attributed to the surviving branch and a
// working-tree owner found off-branch is an abandoned post-rewind change, not the surviving tree — so
// the override must NOT redirect (S14). When it is empty, the on-disk files came from an off-branch
// Write and the override correctly redirects to the owner's head (S8/S9/S10).
function survivingBranchRecordsFileChange(
    records: TranscriptRecord[],
    finalHead: Uuid,
): boolean {
    return extractFileEvents(selectBranchRecords(records, finalHead)).length > 0;
}

// The rewind point of an abandoned tip: the deepest record on the tip's path that also lies on the
// surviving path — found by walking tip -> root and returning the first uuid in `survivingSet`.
function findRewindPoint(
    records: TranscriptRecord[],
    tip: Uuid,
    survivingSet: Set<string>,
): Uuid | undefined {
    const byUuid = indexRecordsByUuid(records);
    const visited = new Set<string>();
    let current = byUuid.get(tip.toString());
    while (current !== undefined) {
        const key = current.uuid!.toString();
        if (visited.has(key)) {
            return undefined;
        }
        visited.add(key);
        if (survivingSet.has(key)) {
            return current.uuid;
        }
        const parent = current.parentUuid;
        if (parent === undefined) {
            return undefined;
        }
        if (parent === null) {
            return undefined;
        }
        current = byUuid.get(parent.toString());
    }
    return undefined;
}

// Deduplicate uuids by their string value, preserving first-seen order.
function dedupeUuids(uuids: Uuid[]): Uuid[] {
    const seen = new Set<string>();
    const unique: Uuid[] = [];
    for (const uuid of uuids) {
        if (!seen.has(uuid.toString())) {
            seen.add(uuid.toString());
            unique.push(uuid);
        }
    }
    return unique;
}

// True when `head` is a maximal tip among the abandoned heads — i.e. it is NOT an ancestor of any
// other abandoned head. (A head that lies on another abandoned head's chain is an interior node of
// that deeper branch, not a branch tip of its own.)
function isMaximalTip(
    records: TranscriptRecord[],
    head: Uuid,
    abandoned: Uuid[],
): boolean {
    for (const other of abandoned) {
        if (other.toString() === head.toString()) {
            continue;
        }
        const otherAncestors = collectAncestorUuids(records, other);
        if (otherAncestors.has(head.toString())) {
            return false;
        }
    }
    return true;
}

// The abandoned (rewound) heads: heads not on the surviving chain, deduped to maximal tips.
function collectAbandonedHeads(
    records: TranscriptRecord[],
    survivingSet: Set<string>,
): Uuid[] {
    const heads = dedupeUuids(collectHeadUuids(records));
    const abandoned = heads.filter((head) => !survivingSet.has(head.toString()));
    return abandoned.filter((head) => isMaximalTip(records, head, abandoned));
}

// Enumerate the conversation's branches: the surviving branch (the final head) and zero or more
// rewound branches (abandoned heads deduped to maximal tips, each tagged with its rewind point).
// Returns [] when there is no surviving head — the callers fall back to all-records reconstruction.
export function findConversationBranches(
    records: TranscriptRecord[],
): ConversationBranch[] {
    const survivingHead = findSurvivingHead(records);
    if (survivingHead === undefined) {
        return [];
    }
    const survivingSet = collectAncestorUuids(records, survivingHead);
    const branches: ConversationBranch[] = [
        { tip: survivingHead, rewindPoint: undefined, isSurviving: true },
    ];
    for (const tip of collectAbandonedHeads(records, survivingSet)) {
        const rewindPoint = findRewindPoint(records, tip, survivingSet);
        branches.push({ tip, rewindPoint, isSurviving: false });
    }
    const existingTips = new Set(branches.map((branch) => branch.tip.toString()));
    branches.push(...findStructuralRewoundBranches(records, existingTips));
    return branches;
}

// Select the records on one branch: its tip's ancestor chain plus every uuid-less meta/header
// record. Falls back to all records when the tip resolves to nothing (cannot identify the branch).
export function selectBranchRecords(
    records: TranscriptRecord[],
    tip: Uuid,
): TranscriptRecord[] {
    const branchUuids = collectAncestorUuids(records, tip);
    if (branchUuids.size === 0) {
        return records;
    }
    return records.filter(
        (record) => record.uuid === undefined || branchUuids.has(record.uuid.toString()),
    );
}

// Select the surviving branch's records (the final head's chain + meta). Falls back to all records
// when there is no last-prompt head — preserving pre-S7 behavior for any unmarked transcript.
export function selectLiveBranch(
    records: TranscriptRecord[],
): TranscriptRecord[] {
    const survivingHead = findSurvivingHead(records);
    if (survivingHead === undefined) {
        return records;
    }
    return selectBranchRecords(records, survivingHead);
}

// The uuid strings on the surviving branch's ancestor chain — the canonical "which records are
// shared trunk" set a caller uses to find a rewound branch's diverging (post-rewind) records.
// Empty when there is no surviving head.
export function collectSurvivingUuids(
    records: TranscriptRecord[],
): Set<string> {
    const survivingHead = findSurvivingHead(records);
    if (survivingHead === undefined) {
        return new Set<string>();
    }
    return collectAncestorUuids(records, survivingHead);
}

// A branch tip shortened for display and selection: the first 8 chars of its uuid string. The one
// canonical short-id home — the CLI uses it both to render branch ids and to match `--branch <id>`.
// (Distinct from the renderer's changeId shortener, which trims a `toolu_` prefix.)
export function shortUuid(uuid: Uuid): string {
    return uuid.toString().slice(0, 8);
}

// Find one branch's histories by id: the literal "surviving" selects the surviving branch; any
// other id matches a rewound branch whose tip short id equals it. undefined when none matches.
export function findBranchById(
    branched: BranchedReconstruction,
    id: string,
): FileHistory[] | undefined {
    if (id === "surviving") {
        return branched.surviving;
    }
    const match = branched.rewound.find((entry) => shortUuid(entry.tip) === id);
    if (match === undefined) {
        return undefined;
    }
    return match.histories;
}
