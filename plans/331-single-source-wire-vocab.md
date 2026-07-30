# Task 331 — Single-source the wire vocabulary webapp/ re-declares from src/

## The shape decision (made here, not by the implementer)

Candidate (a) — a build step copying files into webapp/ — is REJECTED: it adds a
build stage, produces two on-disk copies (the thing the repo's no-forwarding rule
exists to kill), and `npm run build:webapp` (`tsc -p tsconfig.webapp.json`,
rootDir=webapp) would still refuse sources outside webapp/.

Candidate (b) in its "shared third folder" form is also rejected: same rootDir
problem — tsconfig.webapp.json has `"rootDir": "webapp", "include": ["webapp"]`, so
a third folder means tsconfig surgery for zero gain.

CHOSEN: extend the existing precedent as-is. `src/` ALREADY imports from `webapp/`
(`src/viewer_api_layer1.ts:7` and `src/viewer_api_layered.ts:5` import
layer1-ruler-axis.ts). The canonical home for shared wire vocabulary is
`jfred/webapp/layer1-wire.ts`; server modules import from `../webapp/layer1-wire.ts`.
No tsconfig change, no build step, no new folder. Shared values are `as const`
objects, never TS `enum` (node's type-stripping test runner rejects enum — the
constraint already documented in layer1-source-paths.ts:7).

The server and client wire types differ ONLY in representation (server: `Instant` =
Date, `Path` domain type; client: ISO string, plain string — layer1-wire.ts's own
header says so). One generic shape parameterized by those two representations is the
single source; each side instantiates it. The aliases are instantiations, not
re-export shims — the no-forwarding rule bans a second HOME for the same thing, and
`WirePairOf<Date, Path>` vs `WirePairOf<string, string>` are different things.

## Step 1 — generic wire shapes in webapp/layer1-wire.ts

Rewrite the interfaces as generics, keeping today's client-facing names as string
instantiations so NO other webapp file changes for this step:

    export interface WireInstantOf<I> { instant: I; axisPx: number; }
    export interface WireCommitOf<I> extends WireInstantOf<I> { hash: string; }
    export interface WireRulerTickOf<I> extends WireInstantOf<I> { eventCount: number; }
    export interface WireSnapshotOf<I, P> extends WireInstantOf<I> {
        version: number; sessionId: string; sessionFile: P; line?: number; }
    export interface WirePairOf<I, P> { path: P; commits: WireCommitOf<I>[];
        onDisk: WireInstantOf<I>; created?: WireInstantOf<I>; snapshots?: WireSnapshotOf<I, P>[]; }
    export interface WireOrphanOf<I, P> extends WireInstantOf<I> { path: P; snapshots?: WireSnapshotOf<I, P>[]; }
    export interface WireLayer1ViewOf<I, P> { pairs: WirePairOf<I, P>[];
        gitOrphans: WireOrphanOf<I, P>[]; diskOrphans: WireOrphanOf<I, P>[]; ruler: WireRulerTickOf<I>[]; }
    export type WireInstant = WireInstantOf<string>;   // …and so on for every existing name

CAREFUL: server's `Layer1WireSnapshot` has `sessionId: Uuid; sessionFile: Path` —
check `src/layer1_snapshot_wire.ts:13` and give the generic exactly the parameters
those two sides need (a third param for the id type if Uuid vs string forces it; do
not widen to `string` on the server side — strict-typing rule). Keep every existing
doc comment; move it onto the generic.

Then in `src/viewer_api_layer1.ts`, DELETE the local `Layer1WireInstant/Commit/
RulerTick/Pair/Orphan/View` interface declarations and replace with instantiations:
`export type Layer1WirePair = WirePairOf<Instant, Path>;` etc. Same in
`src/layer1_snapshot_wire.ts` for `Layer1WireSnapshot`. Existing importer names are
preserved — nothing else in src/ churns. `WireSession`/`Layer1WireSession`
(src/viewer_api_layer1_sessions.ts) is all-strings on both sides: make
layer1-wire.ts's `WireSession` canonical and have viewer_api_layer1_sessions.ts
import it as its wire row type (delete its local `Layer1WireSession`, re-point the
handful of src importers — grep `Layer1WireSession`).

## Step 2 — SourceKind + CommitTimeSource become const objects in layer1-wire.ts

Both currently live as enums in `src/structures/vocabulary_view.ts` (NOT
vocabulary.ts — the task text is off by one file; verify with grep before editing).

- Add to layer1-wire.ts, as const objects + derived types (copy the exact pattern
  layer1-source-paths.ts uses today, including its comment about the enum-rejecting
  test runner). Declaration order: `committer` first — it is the default and
  `Object.values` order feeds the toggle.
- DELETE both enums from vocabulary_view.ts; if the file is then empty, delete the
  file. Re-point every src importer (grep `vocabulary_view` — expect
  viewer_api_layer1.ts, viewer_api_layer1_route.ts, viewer_api_layer1_sources.ts,
  tests) to `../webapp/layer1-wire.ts` (or `../../webapp/...` from structures/ — none
  should remain there). Enum-member COMPARISON call sites (`CommitTimeSource.author`)
  compile unchanged against a const object; fix any `enum`-only usage the compiler
  flags.
- `webapp/layer1-source-paths.ts`: delete its local SourceKind, import from
  `./layer1-wire.ts`.
- `webapp/layer1-sources.ts`: delete `TIME_SOURCE_VALUES` literal; derive it —
  `export const TIME_SOURCE_VALUES = Object.values(CommitTimeSource)` — and drop the
  now-false mirror comment.

## Step 3 — the refs shape

- Move `RepoCommitRow` (from `src/viewer_api_repo.ts`) and `Layer1RefsView` (from
  `src/viewer_api_layer1_refs.ts`) into layer1-wire.ts (all-string shapes, identical
  on both sides — no generics needed). Delete the originals; re-point their src
  importers (grep both names; parseGitLogOutput's return type annotation included).
- `webapp/layer1-refs.ts`: delete local `WireRefCommit`/`WireLayer1Refs`, import
  `RepoCommitRow`/`Layer1RefsView` from `./layer1-wire.ts` and rename the local uses.

## Step 4 — the ladder-order mirror in layer1-filter.ts

Move `listWirePairLadder`'s ORDER rule into layer1-wire.ts as one generic function
(this also hands task 330's fixture its assembly order):

    export function listPairLadderInstants<I, P>(pair: WirePairOf<I, P>): I[]
    export function listOrphanLadderInstants<I, P>(orphan: WireOrphanOf<I, P>): I[]

(return raw `I`; layer1-filter.ts maps `readWireInstant` over the result and keeps
its Date-conversion local). Delete `listWirePairLadder`/`listWireOrphanLadder`/
`listWireSnapshotInstants` from layer1-filter.ts in favor of these.

SCOPE LIMIT, deliberate: `src/viewer_api_layer1.ts`'s `listPairNodeLadder` reads
`PairHistory` (pre-wire server structs, different property names) and CANNOT consume
the generic without restructuring buildLayer1View — out of scope. Update its
"mirrors" comment to name `listPairLadderInstants` in layer1-wire.ts as the wire-side
canonical instead of pointing at layer1-filter.ts.

## Step 5 — sweep the marker comments

Grep webapp/ for `cannot import from src` / `re-spelled` / `Mirrors src/` and update
or delete each comment this task made false. The `Instant` re-declaration atop
layer1-ruler-axis.ts STAYS (it is `type Instant = Date`, webapp-local by design —
the task notes it, it is not a wire shape).

## Tests

Existing suites are the net: `npm run typecheck`, `npm run build:webapp` (tsc -p
tsconfig.webapp.json) must both pass — they are the proof the moved types still
satisfy every consumer. Add ONE new test file `tests/layer1-wire.test.ts`, authored
FIRST (strict red-green per ~/.claude/guides/tdd.md — RED because the symbols do not
exist in layer1-wire.ts yet; authorship order, since the implement pass runs
typecheck only and the suite executes at close time). One behavior per test function,
`test_<behavior>` names, plain-English step comments per step:

- `test_committer_leads_the_time_source_values` —
  `Object.values(CommitTimeSource)[0] === "committer"` (the toggle's default order);
- `test_pair_ladder_orders_created_commits_disk_then_snapshots` — build a literal
  `WirePairOf<string, string>` carrying all four node kinds and assert
  `listPairLadderInstants` returns created → commits (oldest first) → onDisk →
  snapshots appended;
- `test_source_kind_values_are_the_wire_spellings` — "jsonl" and "filehistory".

Then do steps 1-5.

## Order and verification

Steps in order 1→5 (each keeps both typechecks green before the next). Implement
pass runs ONLY `npm run typecheck` + `npm run build:webapp`; suites run at close
time. layer1-wire.ts must stay under the 250-line cap — with generics + aliases +
two const objects + refs shapes + two functions it lands ~150-180 lines; if it
crosses the cap, split the FUNCTIONS (not the types) into layer1-wire-ladders.ts.

## Traps

- webapp modules are loaded by node's type-stripping runner: no `enum`, no
  `namespace`, type-only syntax and plain values only, in everything added to webapp/.
- Do not leave a re-export in vocabulary_view.ts "for compatibility" — the repo rule
  is one canonical home, importers get re-pointed.
- `sessionFile` on the server snapshot is `Path`, sessionId is `Uuid` — the generic
  must carry them without widening (see Step 1 CAREFUL note).
- The comment-reflow hook may churn touched files; re-apply edits, don't fight it.
