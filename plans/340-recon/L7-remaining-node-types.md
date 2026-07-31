# L7 recon — any remaining node types (the catch-all)

## Architecture framing (changes everything)

TWO parallel engines: classic (`reconstruction_*.ts` → old webapp
index.html/timeline views, parses full JSONL semantics) and layered
(`layered_*.ts` → /api/layered-graph → layered-app, NOT layer1.html).
layer1.html itself parses ZERO JSONL today. L3–L7 are the first JSONL
semantics on that page; which engine's vocabulary L7 draws from is itself
unresolved (cross-cutting with L3/L5).

## Full RecordType vocabulary (vocabulary.ts:4-21 + parse/recordKeys.ts)

user, assistant, system, attachment (14 AttachmentPayloadType kinds incl.
edited_text_file, hook_success, diagnostics…), fileHistorySnapshot,
fileHistoryDelta, lastPrompt, mode, permissionMode, bridgeSession, aiTitle,
customTitle, agentName, queueOperation, forkContextRef.
Sub-vocabularies: BlockType (text/thinking/tool_use/tool_result/image),
ToolName, EventKind (write/delete/edit/rename/copy/overwrite/append/
user-edit/script-execution), Verdict (per-line classifier incl. ignore),
GitOperationKind, BranchRole (surviving/rewound).

## Beacon classes with NO layer1.html node today

Write body, complete Read echo, Edit's originalFile — all three collapse
into L3's "extracted edit" scope, NOT L7.

## Presumed vs confirmed user edit

`listGapsBeforeVerifiedNode` (layered_end_state.ts:24-32) inserts
presumedUserEdit gap nodes; `EventKind.userEdit` (edited_text_file) is a
REAL beacon (harness-confirmed hand edit). NO third state exists for
"residual still-unexplained after all layers" — nothing ever
promotes/demotes a presumption node.

## Genuinely remaining candidates for L7

- tool call [t] / tool result [r] as bubble nodes (today only the classic
  timeline has ToolCallNode; results are folded into calls, never separate).
- user prompt [u] / agent response [a] — rich in classic TurnNode; per-FILE
  placement semantically odd (see ambiguities).
- conversation branch split [y] / rewind — modeled (ConversationBranch) but
  never a node on a bubble lane (L5 renders lanes; the NODE kinds may be L7).
- code rewind — NO event kind anywhere in either engine; needs new modeling
  (define first, then node).
- system info [s/i] — hooks/retries/compaction/errors; essentially
  unrendered in both engines.
- residual CONFIRMED user edit (post-all-layers leftover) — unmodeled.
- session/meta records (mode, permissionMode, bridgeSession, titles,
  agentName, queueOperation, forkContextRef, lastPrompt) — never nodes;
  spec should rule "no node, ever" explicitly rather than omit silently.

## Old-app node checklist (comparison baseline)

TimelineNode union (views/timeline-types.ts:216): user-turn/agent-turn,
session-end, commit (isError FAILED badge, isGitBaseline), tool-call
(carries scriptRun), jsonl-line (one row per Verdict). Dressings: FAILED
badge, skipped-line gaps, partial-reconstruction banner, rename/delete
badges.

## SETTLED (user, 2026-07-30)

### Data source: the classic engine

L7 draws from **the current reconstruction engine — the one that already feeds
the row-based viewer** (`reconstruction_*.ts`), not the layered engine.

### Every row becomes a node; ignorable ones are hidden by default

**Every parsed record type gets a node.** Every row in the conversation log is
drawn on the timeline. Rows the engine classifies as ignorable are **hidden by
default**, via a header button that reads **`[✓] hide ignored nodes`**, toggled
on when the page loads.

This replaces the old "explicit no-node-ever ruling for session/meta records" —
there is no such ruling. They get nodes; the filter hides them if the engine
says they are ignorable.

### Tool call and tool result are separate nodes, visually bracketed

Two nodes, not one collapsed node — a lot happens between them in the logs.
Draw a **dashed bracket** connecting a tool_use node to its tool_result node so
the pairing is visible.

### Presumption nodes get promoted by whichever layer can resolve them

If a layer can resolve a presumed node on it — because **no nodes occur between
that presumed node and its surrounding beacons** — that layer promotes it to a
**verified** node. This is not L7's exclusive job; it is a rule every layer
follows. (It is also new behaviour: today nothing ever promotes or demotes a
presumption node.)

### Script execution results are L6's, entirely

Fully covered by L6. L7 owns no slice of it.

## STILL OPEN

**A. User prompts and agent responses get nodes — but placed where?**

Settled: yes, they get nodes. Task 339 ("timeline node type icons and colors",
open) names them in its list — `user prompt [u]`, `agent response [a]`, along
with `[r]`, `[t]`, `[e]`, `[x]`, `[c]`, branch split `[y]`, rewind, code
rewind, system info `[s/i]`. That task also says the full list "will make
itself known when we look at what the original reconstruction engine parses
already, since it covers everything" — consistent with L7's settled data
source above — and that colors are still to be defined (agents currently pick
arbitrary ones, deliberately).

What task 339 does **not** settle is placement, and this page is per-file
bubbles. A user prompt is not about one file. So: does a prompt node appear
**duplicated on every file the resulting turn touched**, once as a
**session-level annotation** on the shared ruler, or not on this page at all
(deferred to a future session view)?

_Code re-check (2026-07-30): **still open, and one option is more expensive
than it sounds.**_
- _The old app confirms prompts are not per-file: `TurnNode`
  (views/timeline-types.ts:118-139) carries **no file field**, built one per
  message into a single conversation-ordered array
  (views/timeline-nodes.ts:176-177)._
- _Layer 1 has **no non-file-scoped lane that can host a node**. Every
  content-bearing widget is per-file (`buildStagePairs`/`buildOrphanBucket`,
  layer1-widgets.ts:71,89). The ruler prints only
  `"<timestamp> (<count>)"` tick labels — no room for content. The one
  session-level thing that exists, `renderSessionRanges`
  (layer1-widgets.ts:83-92), is a 7px coloured bar with a `title` tooltip, not
  a lane._
- _So "session-level annotation" means **building a new annotation track**,
  not reusing something. "Duplicate per touched file" reuses everything._

**B. Should a code rewind be its own node, distinct from a user edit?**

_Correction: the earlier claim "needs new modeling" was misleading. The user is
right that code-rewind scenarios exist and the engine handles them._

- **15 scenarios exercise code rewind** (`Rewind: N, code` steps): s7, s8, s9,
  s11, s13, s16, s20, s23, s45, s50, s51, s60, s72, s86, plus the
  `g-user-edit-code-rewind.txt` generator template. Conv-only twins exist
  alongside (s10, s12, s14, s17, s19, s52, s59).
- The engine **reconstructs them byte-for-byte correctly** — `plans/s20/` says
  so outright, and the scenario tests lock it.

But it gets there **without classifying the rewind**. Two kind-agnostic
mechanisms produce the right answer as a side effect:
- `findWorkingTreeOwner` (reconstruction_worktree.ts:38-57) picks the surviving
  owner by content signature, and its comment explains this is precisely so a
  code restore's trailing "refresh" snapshots — same content, bumped version —
  are ignored. It **tolerates** code restores; it returns a Uuid, never a flag
  saying one happened.
- Claude Code writes a checkpoint restore into the transcript as a synthetic
  `edited_text_file` record. `userEditChangesContent`
  (reconstruction_replay.ts:119) records it as a revision purely because the
  content differs — via the generic echo-vs-real-change rule, with no
  code-restore branch.

There is genuinely **no `RewindKind` / `codeRewind` type anywhere**
(EventKind's 9 members carry nothing for it), and the old webapp renders
nothing rewind-related at all — zero matches for "rewind" across webapp/.

**Code re-check against a real transcript (2026-07-30) — the answer is: a
distinct code-rewind node is NOT derivable.**

Inspected the captured JSONL for **s7-minimal-code-restore**, whose script is
literally `Rewind: 1, code`:

- `AttachmentPayloadType` (vocabulary.ts:55-71) has **no** restore / checkpoint
  / rewind member.
- s7 contains **zero `edited_text_file` attachments** — 45 attachments, none of
  that type. _(This refutes the earlier note in this doc that a restore
  surfaces as a synthetic `edited_text_file`; that came from plan prose, not
  from the data.)_
- `file-history-snapshot` versions simply keep incrementing across the rewind
  (v1 → v2). No reset, no "restored-to" marker.
- No sibling `system` record, no `/rewind` command text — the post-rewind user
  message is an ordinary prompt.
- The **only** trace is structural: the post-rewind prompt shares its
  `parentUuid` with the pre-rewind prompt — the exact same fork signature
  `findRewindPoint` (reconstruction_branch.ts:85-86) already uses for an
  ordinary conversation rewind.

So a code rewind is **structurally indistinguishable from a conv-only rewind**
in the transcript. Telling them apart would mean inferring intent from content
diffs, not reading a field.

**Revised question:** given that, does L7 (a) render one generic "rewind" node
and stop, or (b) fund the inference — derive code-vs-conv by comparing the
rewound branch's final bytes against the surviving resumption, which is real
new engine work with no explicit ground truth to check against?

**C. Unknown record types get a `[?]` node — and a synthesized timestamp.**

_Definition — what the earlier draft meant by "closed list":_ a design where
every record type is enumerated up front and anything unrecognised makes the
parser **throw** (`UnknownRecordTypeError`), rather than falling into a
catch-all bucket. The trade is fail-loudly-on-new-formats versus
degrade-gracefully.

Settled: **catch-all**, rendered as a `[?]` node. If the unknown record has a
timestamp, that places it. If it has none, its position is **approximated**.

**The approximation rule has to be decided here — it does not already exist.**
Searched all of `plans/`, `specs/`, `jfred/docs/`, the source, the tests, and
full git history (`git log -S`) for both remembered phrasings and every
synonym. Neither "average the surrounding timestamps" nor "previous + 1 ms"
appears anywhere as a settled rule.

What the code does today is **three different things** in three places, none of
them either candidate:
- **Drop it** — `viewer_api_layer1_sessions.ts:25-27` ("no axis place —
  undefined drops it"), and the per-line-state sidecar plan says the same.
- **Sort it first** — `views/timeline-line-nodes.ts` defaults `when` to `""`,
  which string-sorts above every real timestamp;
  `views/reconstruction-coverage.ts:84-86` keys a stampless gap to 0.
- **Sort it last** — `viewer_api_records.ts:83-86`.

One piece of on-topic precedent, from a related but different problem (clamping
a synthetic seed that *has* a timestamp into a monotonic ladder, task 224):
implementation-notes-tasks-223-224-…:107-111 explicitly **chose equal-to-
previous over previous + 1 ms**, reasoning that equal timestamps keep the
sequence non-decreasing — all the ladder needs — and "avoid inventing an
instant that no evidence supports."

So the choice is open: **average the two surrounding timestamps**, **equal to
the previous** (matching the task-224 precedent), or **previous + 1 ms**. Worth
noting the three existing behaviours should probably converge on whichever is
picked, rather than leaving four rules in the codebase.

**Code re-check (2026-07-30) — this is a real, high-volume case, and it comes
with a surprise.**

`EnvelopeBase.timestamp` is optional by design ("session-meta records carry
only a subset", structures/envelope.ts:16). Counting stampless lines across the
real corpus (2,228 files, 667,250 lines scanned; the jq run aborted on one
malformed line, so these are floors, not totals):

| type | count |
|---|---|
| `last-prompt` | 24,759 |
| `permission-mode` | 24,444 |
| `custom-title` | 23,203 |
| `agent-name` | 22,863 |
| `bridge-session` | 20,347 |
| `mode` | 18,252 |
| `file-history-snapshot` | 11,422 |
| `ai-title` | 2,647 |
| **`worktree-state`** | **124** |
| **`relocated`** | **87** |
| `fork-context-ref` | 25 |

**~124k+ stampless lines, roughly 18% of all records** — not a rare edge case.

Two things follow:

1. **The volume is in metadata, not content.** Every content-bearing type
   (`user`, `assistant`, `attachment`) carried a timestamp in every sample. So
   whichever rule is picked governs a large pile of session-meta rows, and the
   nodes users came to look at are unaffected.
2. **`worktree-state` and `relocated` are not in the `RecordType` enum.** The
   `[?]` catch-all decided above is not hypothetical — there are already **211
   unknown-type records** sitting in the real logs, and they are exactly the
   stampless kind that needs the approximation rule. The two settled decisions
   meet here.
