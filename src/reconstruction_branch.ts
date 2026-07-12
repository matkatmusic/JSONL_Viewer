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
    isGenuineUserPrompt,
} from "./reconstruction_tree.ts";
import { getContentBlocks } from "./structures/content-blocks.ts";
import { BlockType, RecordType } from "./structures/vocabulary.ts";
import { findWorkingTreeOwner } from "./reconstruction_worktree.ts";
import { findStructuralRewoundBranches } from "./reconstruction_fork.ts";
import { getCorpusState } from "./reconstruction_corpus.ts";
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

// The ancestor-chain uuid set of every head, keyed by head uuid string — computed once so the
// tree grouping below reads each chain a single time.
function mapHeadChains(records: TranscriptRecord[], heads: Uuid[]): Map<string, Set<string>> {
    const chains = new Map<string, Set<string>>();
    for (const head of heads) {
        chains.set(head.toString(), collectAncestorUuids(records, head));
    }
    return chains;
}

// True when the two chains share any uuid — their heads fork from a common record and belong to
// the same conversation tree.
function checkChainsOverlap(a: Set<string>, b: Set<string>): boolean {
    for (const uuid of a) {
        if (b.has(uuid)) {
            return true;
        }
    }
    return false;
}

// The final head of every conversation tree the surviving head does NOT belong to. A multi-session
// project (EndCurrentAgentAndSpawnNewAgent) is a FOREST of parentUuid-disconnected trees — each
// predecessor session is a completed chapter whose final head the next session continues from, so
// its chain is surviving trunk, never a rewound branch. Rewinds only exist WITHIN a tree.
function collectPredecessorFinalHeads(records: TranscriptRecord[], survivingHead: Uuid): Uuid[] {
    const heads = dedupeUuids(collectHeadUuids(records));
    const chains = mapHeadChains(records, heads);
    const survivingChain = chains.get(survivingHead.toString()) ?? collectAncestorUuids(records, survivingHead);
    const trees: { chainUnion: Set<string>; finalHead: Uuid }[] = [];
    for (const head of heads) {
        const chain = chains.get(head.toString())!;
        if (checkChainsOverlap(chain, survivingChain)) {
            continue;
        }
        const tree = trees.find((entry) => checkChainsOverlap(entry.chainUnion, chain));
        if (tree === undefined) {
            trees.push({ chainUnion: new Set(chain), finalHead: head });
            continue;
        }
        for (const uuid of chain) {
            tree.chainUnion.add(uuid);
        }
        tree.finalHead = head;
    }
    return trees.map((tree) => tree.finalHead);
}

// The uuid strings on the surviving trunk across every session tree: the surviving head's own
// chain plus each predecessor tree's final-head chain.
function collectSurvivingTrunkUuids(records: TranscriptRecord[], survivingHead: Uuid): Set<string> {
    const trunk = collectAncestorUuids(records, survivingHead);
    for (const head of collectPredecessorFinalHeads(records, survivingHead)) {
        for (const uuid of collectAncestorUuids(records, head)) {
            trunk.add(uuid);
        }
    }
    return trunk;
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
    const survivingSet = collectSurvivingTrunkUuids(records, survivingHead);
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

// Branch selections memoized per records-array identity. Downstream caches (executeRunOnce's
// per-array script memo, reconstructFileOver's history memo) key on the records array's IDENTITY;
// re-filtering a fresh array for the same (records, tip) on every call silently defeated them,
// so every document pass re-ran every sandbox script. Same inputs → the same array instance.
// corpus: moved to reconstruction_corpus.ts (item 14)
// const branchSelections = new WeakMap<TranscriptRecord[], Map<string, TranscriptRecord[]>>();

// Select the records on one branch: its tip's ancestor chain plus every uuid-less meta/header
// record. Falls back to all records when the tip resolves to nothing (cannot identify the branch).
export function selectBranchRecords(
    records: TranscriptRecord[],
    tip: Uuid,
): TranscriptRecord[] {
    // corpus: moved to reconstruction_corpus.ts (item 14)
    // let byTip = branchSelections.get(records);
    // if (byTip === undefined) {
    //     byTip = new Map<string, TranscriptRecord[]>();
    //     branchSelections.set(records, byTip);
    // }
    const byTip = getCorpusState(records).branchSelectionsByTip;
    const tipKey = tip.toString();
    const cached = byTip.get(tipKey);
    if (cached !== undefined) {
        return cached;
    }
    const selected = computeBranchRecords(records, tip);
    byTip.set(tipKey, selected);
    return selected;
}

function computeBranchRecords(
    records: TranscriptRecord[],
    tip: Uuid,
): TranscriptRecord[] {
    const branchUuids = collectAncestorUuids(records, tip);
    if (branchUuids.size === 0) {
        return records;
    }
    const selected = records.filter(
        (record) => record.uuid === undefined || branchUuids.has(record.uuid.toString()),
    );
    // Nothing dropped: keep the input's identity so downstream identity-keyed memos hit.
    if (selected.length === records.length) {
        return records;
    }
    return selected;
}

// Live-branch selections memoized per records-array identity, for the same reason as
// branchSelections above: downstream memos key on the selected array's IDENTITY.
// corpus: moved to reconstruction_corpus.ts (item 14)
// const liveBranchSelections = new WeakMap<TranscriptRecord[], TranscriptRecord[]>();

// Select the surviving trunk's records (every session tree's final chain + meta). Falls back to
// all records when there is no last-prompt head — preserving pre-S7 behavior for any unmarked
// transcript.
export function selectLiveBranch(
    records: TranscriptRecord[],
): TranscriptRecord[] {
    const survivingHead = findSurvivingHead(records);
    if (survivingHead === undefined) {
        // No surviving head: fall back to all records WITHOUT caching (the corpus's liveBranch
        // stays undefined = not cached).
        return records;
    }
    // corpus: moved to reconstruction_corpus.ts (item 14)
    // const cached = liveBranchSelections.get(records);
    const state = getCorpusState(records);
    const cached = state.liveBranch;
    if (cached !== undefined) {
        return cached;
    }
    const trunkUuids = collectSurvivingTrunkUuids(records, survivingHead);
    let selected = records.filter(
        (record) => record.uuid === undefined || trunkUuids.has(record.uuid.toString()),
    );
    // Nothing dropped: keep the input's identity so downstream identity-keyed memos hit.
    if (selected.length === records.length) {
        selected = records;
    }
    // corpus: moved to reconstruction_corpus.ts (item 14)
    // liveBranchSelections.set(records, selected);
    state.liveBranch = selected;
    return selected;
}

// The uuid strings on the surviving trunk (across every session tree) — the canonical "which
// records are shared trunk" set a caller uses to find a rewound branch's diverging (post-rewind)
// records. Empty when there is no surviving head.
export function collectSurvivingUuids(
    records: TranscriptRecord[],
): Set<string> {
    const survivingHead = findSurvivingHead(records);
    if (survivingHead === undefined) {
        return new Set<string>();
    }
    return collectSurvivingTrunkUuids(records, survivingHead);
}

// The uuid strings of every record on a rewound (abandoned) branch: the abandoned tips' chains
// minus the surviving trunk, plus every record whose parentUuid chain reaches that set before
// the trunk (post-tip descendants like a rewound "Looks good." exchange, and off-chain records
// parented into the dead stretch). Hook attachments and dangling leaves parented to surviving
// records resolve to the trunk and are NOT orphaned. Empty when there are no rewound branches.
// A hook command-rewrite (e.g. rtk PreToolUse) forks the tree mid-tool-call; the dead
// side is pure tool plumbing, not a /rewind the user should see dimmed. Skip it.
export function collectOrphanedUuids(records: TranscriptRecord[]): Set<string> {
    const rewoundTips = findConversationBranches(records).filter((branch) => !branch.isSurviving);
    if (rewoundTips.length === 0) {
        return new Set<string>();
    }
    const surviving = collectSurvivingUuids(records);
    const byUuid = indexRecordsByUuid(records);
    const abandoned = new Set<string>();
    for (const branch of rewoundTips) {
        const exclusive = new Set<string>();
        for (const uuid of collectAncestorUuids(records, branch.tip)) {
            if (!surviving.has(uuid)) {
                exclusive.add(uuid);
            }
        }
        if (checkBranchIsToolPlumbing(records, byUuid, surviving, exclusive)) {
            continue;
        }
        for (const uuid of exclusive) {
            abandoned.add(uuid);
        }
    }
    if (abandoned.size === 0) {
        return abandoned;
    }
    const orphaned = new Set<string>();
    // ponytail: walk is O(records × depth) uncached; most records exit on their own uuid —
    // memoize in CorpusState if a large project measures slow.
    for (const record of records) {
        if (record.uuid === undefined) {
            continue;
        }
        if (checkChainReachesAbandoned(record, byUuid, surviving, abandoned)) {
            orphaned.add(record.uuid.toString());
        }
    }
    return orphaned;
}

// True when the record's parentUuid chain (starting at the record itself) hits the abandoned
// set before the surviving trunk. Same cycle-guarded walk as findRewindPoint.
function checkChainReachesAbandoned(
    record: TranscriptRecord,
    byUuid: Map<string, TranscriptRecord>,
    surviving: Set<string>,
    abandoned: Set<string>,
): boolean {
    const visited = new Set<string>();
    let current: TranscriptRecord | undefined = record;
    while (current !== undefined && current.uuid !== undefined) {
        const key = current.uuid.toString();
        if (visited.has(key)) {
            return false;
        }
        visited.add(key);
        if (abandoned.has(key)) {
            return true;
        }
        if (surviving.has(key)) {
            return false;
        }
        const parent = current.parentUuid;
        if (parent === undefined || parent === null) {
            return false;
        }
        current = byUuid.get(parent.toString());
    }
    return false;
}

// True when the tip's branch-exclusive subtree (the exclusive ancestor set plus every record whose
// parentUuid chain reaches it before the trunk — trailing attachments, post-tip exchanges) holds
// nothing but tool plumbing: no genuine user prompt and no assistant text. Such micro-forks come
// from PreToolUse-hook command rewrites (a tool_use with two tool_result children), not a /rewind.
function checkBranchIsToolPlumbing(
    records: TranscriptRecord[],
    byUuid: Map<string, TranscriptRecord>,
    surviving: Set<string>,
    exclusive: Set<string>,
): boolean {
    for (const record of records) {
        if (record.uuid === undefined) {
            continue;
        }
        if (!checkChainReachesAbandoned(record, byUuid, surviving, exclusive)) {
            continue;
        }
        if (isGenuineUserPrompt(record)) {
            return false;
        }
        if (checkAssistantHasText(record)) {
            return false;
        }
    }
    return true;
}

// True when an assistant record carries displayed text: a non-empty string content or a non-empty
// TextBlock (extractMessageText's two shapes). tool_use-only and thinking-only replies are not text.
function checkAssistantHasText(record: TranscriptRecord): boolean {
    if (record.type !== RecordType.assistant) {
        return false;
    }
    const message = record.message as { content?: unknown } | undefined;
    if (message !== undefined && typeof message.content === "string") {
        return message.content.trim() !== "";
    }
    return getContentBlocks(record).some(
        (block) => block.type === BlockType.text && block.text.trim() !== "",
    );
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
