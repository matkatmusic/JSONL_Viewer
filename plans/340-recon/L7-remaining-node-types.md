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

## AMBIGUITIES (grilling)

1. Which engine is L7's data source — port classic facts into layered_*, or
   layer1.html grows a second data path? (Cross-cutting with L3/L5; settle
   once.)
2. Do user prompts / agent responses belong on FILE bubbles at all —
   duplicated per touched file, a session-level lane/ruler annotation, or
   omitted (future session view)?
3. Scope rule: every parsed type gets a node, or only Verdict !== ignore?
   Explicit "no node, ever" ruling for session/meta records?
4. Tool call vs tool result: one collapsed node (classic precedent) or two
   dots (task 339 lists [t] and [r] separately, potentially seconds apart)?
5. "Code rewind" needs a DEFINITION before a node: derived per-file by
   diffing rewound-tip state vs surviving resumption, or no node (surfaces
   only via L5's structure)? New engine logic — scope/estimate separately.
6. Is L7 the layer that RESOLVES presumption nodes (promote/demote pass →
   confirmed user edit), or does "confirmed user edit" just mean the
   existing userEdit beacon (false cognate)?
7. Script execution result: fully covered by L6, or does L7 own the
   tool_result-confirms-run-finished slice?
8. System-info granularity: one generic kind, or only errors get nodes and
   hook chatter never does?
9. Closed list (fail-loudly, matching parseRecord's UnknownRecordTypeError
   philosophy) vs catch-all bucket for future record types?
