# Task 56 — Pre-baseline reconstruction question UI (engine efficiency)

All implementation work happens in the `jfred/` submodule (never in `~/Programming/jfred`
clones). Before writing any code, read `plans/coding-requirements.md` (RevEng),
`~/.claude/guides/tdd.md`, and `~/.claude/guides/single-condition-branching.md`.

**Test policy for this task:** write every test RED-first (assert the new behavior before
the code exists), but do NOT run `npm test` — the user runs the suite afterward (item-46
precedent: "tests written, not run"). `npm run typecheck` IS allowed and must pass before
staging.

## Behavior (plain English)

When a project's `reveng-paths.json` entry supplies `repo` + `baseCommit` (item 46), the
WebApp must ask — before building/rendering the timeline — "Do you want to reconstruct
file states that precede the supplied baseline git commit?".

- **Yes** → build exactly as today (beacon spliced among earlier events).
- **No** → for every target that receives a base-commit beacon, the events the beacon
  supersedes (those at-or-before the beacon's insertion point) are dropped before replay
  (the engine skips that work), and the timeline's first shown step is the baseline
  commit node (the task-86 `gitBase` baseline turn).
- Projects without a configured `baseCommit` never see the question; the CLI never asks
  and always behaves as today.

The interaction protocol is a mirror of the existing script-execution consent gate:
NDJSON terminal line → dialog → choice stored in sessionStorage → re-request with a query
param. Ask the baseline question BEFORE the script-consent gate (the scope-of-work
decision precedes the run-scripts decision, and it needs no record scan).

---

## Phase 1 — vocabulary + engine skip flag (src/)

### 1.1 Vocabulary
In `jfred/src/structures/vocabulary.ts`, extend `DocumentResponseKind` (line ~192) with a
new member:

```ts
baselineQuestionRequired = "baseline-question",
```

(coding-req §2: the wire string lives ONLY here; §4: all comparisons use the member.)

### 1.2 Engine skip flag + trim (TDD)
File: `jfred/src/reconstruction_base_commit.ts`. Tests:
`jfred/tests/reconstruction_base_commit.test.ts`.

RED tests first (names follow `test_<behavior>`; node test runner style used by that file):

1. `test_seedBaseCommitBeacon_drops_superseded_events_when_pre_baseline_reconstruction_declined`
   — Steps (as comments in the test body):
   - configure repoDir+baseCommit overrides against a temp repo (reuse this file's
     existing fixture helpers / `overrides-test-helpers.ts`),
   - call `setPreBaselineReconstructionAllowed(false)`,
   - seed over `[earlierEvent, laterEvent]` where `earlierEvent.timestamp` < commit
     time < `laterEvent.timestamp` (mirror the existing mid-session splice test at
     line ~135),
   - assert the result is exactly `[beacon, laterEvent]` — the earlier event is gone,
   - `finally` reset the flag to `true` (module state must not leak into other tests).
2. `test_seedBaseCommitBeacon_keeps_pre_baseline_events_by_default` — same setup
   WITHOUT touching the flag; assert today's splice result `[earlierEvent, beacon,
   laterEvent]` (locks the default; existing tests double-lock it).

GREEN implementation:

```ts
// Task 56: whether events preceding the base-commit beacon are still replayed. true =
// today's behavior (splice). false = the beacon supersedes them (the WebApp's "No"
// answer): drop everything before the insertion point. Module state on the exec-gate
// precedent — builds are synchronous; the viewer sets it per request and resets after.
let preBaselineReconstructionAllowed = true;

export function setPreBaselineReconstructionAllowed(allowed: boolean): void {
    preBaselineReconstructionAllowed = allowed;
}
```

In `seedBaseCommitBeacon`, replace only the final splice block (all early-return guards
stay untouched — trimming must never fire when no beacon is seeded):

```ts
if (!preBaselineReconstructionAllowed) {
    const trimmed = [beacon, ...events.slice(insertionIndex)];
    noteStage({ stage: "seedBaseCommitBeacon", target, changeId,
        detail: `seeded a tier-1 write beacon and dropped ${insertionIndex} superseded pre-baseline event(s)`,
        when: timestamp });
    return trimmed;
}
```

(keep the existing splice + existing `noteStage` for the allowed path).

---

## Phase 2 — server gate (viewer_api.ts + viewer_server_routes.ts)

### 2.1 Decision function (TDD)
New RED tests in a new file `jfred/tests/baseline-question.test.ts` (fixture setup copied
from `reconstruction_base_commit.test.ts` / `overrides-test-helpers.ts`):

1. `test_baseline_question_required_when_base_commit_configured_and_no_choice_made` —
   overrides carry repoDir+baseCommit; call the new decision fn with `choiceMade: false`;
   assert `{ kind: DocumentResponseKind.baselineQuestionRequired, baseCommit: <hash>,
   repo: <path string> }`.
2. `test_no_baseline_question_without_base_commit_override` — empty overrides ⇒
   `undefined` regardless of `choiceMade`.
3. `test_no_baseline_question_when_choice_already_made` — overrides set, `choiceMade:
   true` ⇒ `undefined`.

GREEN in `jfred/src/viewer_api.ts` (next to `decideDocumentResponse`):

```ts
// Task 56: the pre-baseline question payload for the wire, or undefined when the gate
// does not apply. It applies only when the ACTIVE project overrides carry a base commit
// (item 46) and the client has not yet sent a preBaseline choice.
export type BaselineQuestion = {
    kind: DocumentResponseKind.baselineQuestionRequired;
    baseCommit: string;
    repo: string;
};

export function decideBaselineQuestion(choiceMade: boolean): BaselineQuestion | undefined {
    if (choiceMade) {
        return undefined;
    }
    const { repoDir, baseCommit } = getPathOverrides();
    if (repoDir === undefined) {
        return undefined;
    }
    if (baseCommit === undefined) {
        return undefined;
    }
    return {
        kind: DocumentResponseKind.baselineQuestionRequired,
        baseCommit: baseCommit.toString(),
        repo: repoDir.toString(),
    };
}
```

### 2.2 Thread the choice through the build
In `jfred/src/viewer_api.ts`:

- `buildReconstructionWithConsent(...)` and `buildDocumentWithConsent(...)` gain a
  `reconstructPreBaseline: boolean` parameter (after `allowScripts`).
- Cache key (line ~122) gains the new decision:
  `...|${allowScripts}|${reconstructPreBaseline}|${targetKey}|${serializePathOverrides()}`
  — a skipped and a full build must never share a cache entry (same reason
  `allowScripts` is in the key).
- Inside the existing `try`/`finally` around `buildProjectReconstruction`: call
  `setPreBaselineReconstructionAllowed(reconstructPreBaseline)` beside
  `setImpureExecutionAllowed(...)`, and reset to `true` in the `finally` (exact exec-gate
  lifecycle — the server's resting posture is today's behavior).
- After a successful build, when `reconstructPreBaseline === false` AND
  `getPathOverrides().baseCommit !== undefined`, stamp the wire document:
  `built.document.preBaselineSkipped = true;` — add optional field
  `preBaselineSkipped?: boolean` to `ReconstructionDocument` at its canonical home
  (follow the import in viewer_api.ts to find it; do NOT re-declare it anywhere else).
  The flag is what tells the timeline to start at the baseline node.

### 2.3 Routes
In `jfred/src/viewer_server_routes.ts`, at EVERY site that parses
`query.get("allowScripts")` (lines ~85, ~141 region, ~173, ~196, ~216):

```ts
const preBaselineChoice = query.get("preBaseline");            // "1" | "0" | null
const reconstructPreBaseline = preBaselineChoice !== "0";
```

and pass `reconstructPreBaseline` into the corresponding
`buildDocumentWithConsent`/`buildReconstructionWithConsent` call.

Question gate — ONLY in the two `/api/document` paths (non-progress ~line 98 and
progress ~line 141), placed BEFORE the `decideDocumentResponse` consent gate (both after
`applyProjectOverrides` has run, which every project-scoped route already does):

```ts
const baselineQuestion = decideBaselineQuestion(preBaselineChoice !== null);
if (baselineQuestion !== undefined) {
    // non-progress path: sendJson(response, 200, baselineQuestion); return;
    // progress path:     response.end(JSON.stringify(baselineQuestion) + "\n"); return;
}
```

The progress path also `reportStage`s a one-line note first, mirroring the consent
stage note: `` reportStage(`pre-baseline question required — base commit ${baselineQuestion.baseCommit}`) ``.
The range-patch/step-files/full-project routes get NO gate (the timeline already
decided) — they only thread the param so they hit the same cache entry.

---

## Phase 3 — client (webapp/)

### 3.1 app-fetch.ts
- Add beside the consent helpers (DRY per coding-req §3 — generalize the boot-id sweep
  instead of copying it):

```ts
const BASELINE_KEY_PREFIX = "baseline:";
// prefixes of per-project sessionStorage choices a server relaunch must forget
const CHOICE_KEY_PREFIXES = [CONSENT_KEY_PREFIX, BASELINE_KEY_PREFIX];

function computeBaselineKey(project: string): string { return `${BASELINE_KEY_PREFIX}${project}`; }
export function storeBaselineChoice(project: string, choice: string): void { … }
export function getBaselineChoice(project: string): string | null { … }
```

  and change `reconcileServerBootId`'s key test to
  `CHOICE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))`.
- `WireDocumentStreamLine`: `kind` union gains `"baseline-question"`; add optional
  `baseCommit?: string; repo?: string`.
- `fetchDocument`: after the `allowScripts` param lines, when
  `getBaselineChoice(project) !== null` set `params.set("preBaseline", storedChoice)`
  (absent = let the server ask). Handle the new terminal before the consent one:

```ts
if (finalPayload.kind === "baseline-question") {
    return { baselineQuestion: { baseCommit: finalPayload.baseCommit!, repo: finalPayload.repo! } };
}
```

  and extend the return type with
  `baselineQuestion?: { baseCommit: string; repo: string }`.
- Every OTHER webapp fetch that sends `allowScripts` (grep `allowScripts` under
  `webapp/`) also sends `preBaseline` when a choice is stored — required for cache-key
  agreement with the document build.

### 3.2 Dialog — new file `webapp/app-baseline-question.ts`
Small module mirroring `app-consent.ts`'s decide pattern (reuse the existing
`.consent-*` / `toolbar-btn` styles; no new CSS unless something renders unstyled):

```ts
export function renderBaselineQuestionDialog(container: HTMLElement, project: string,
        question: { baseCommit: string; repo: string }): void {
    const decide = (choice: string) => { storeBaselineChoice(project, choice); renderRoute(); };
    // h2: "Do you want to reconstruct file states that precede the supplied baseline git commit?"
    // muted line: `repo ${question.repo} · commit ${question.baseCommit.slice(0, 12)}`
    // button "Reconstruct pre-baseline states"  -> decide("1")
    // button "Start at the baseline commit"     -> decide("0")
}
```

The question sentence is the task's wording verbatim.

### 3.3 View call sites
At each of the five `consentRequired` handlers — `views/project.ts:114`,
`views/raw-lines.ts:71`, `views/diff-vs-base.ts:133`, `views/conversation.ts:122`,
`views/timeline.ts:92` — add the mirror check BEFORE the consent check (the server asks
baseline first, so a result can only carry one of the two):

```ts
if (result.baselineQuestion !== undefined) {
    renderBaselineQuestionDialog(container, project, result.baselineQuestion);
    return;
}
```

(ponytail: same two-line shape as the consent handler at all five sites; extracting a
shared gate helper would refactor working consent code — out of scope.)

### 3.4 Timeline starts at the baseline node (TDD)
File: `webapp/views/timeline-nodes.ts` (the task-86 baseline-turn logic already lives
here). Locate the existing tests for this module first (grep `tests/` for
`buildTurnNodes` / `gitBase`) and add the RED test THERE:

- `test_timeline_drops_turns_before_baseline_node_when_pre_baseline_skipped` — Steps:
  - build turn nodes from steps where a normal turn precedes a gitBase-only step,
  - with the document flag set, assert the first returned node IS the baseline turn and
    the earlier turn is absent,
- `test_timeline_keeps_all_turns_when_flag_absent` — same input, no flag ⇒ node list
  unchanged.

GREEN: `WireTimelineDocument` (in `views/timeline-types.ts`) gains
`preBaselineSkipped?: boolean`; the node-building entry point takes/reads it and, when
`true` AND a baseline turn was created, filters out every turn whose ordering timestamp
(the same field the baseline turn is ordered by) is strictly before the baseline turn's.
When the flag is true but NO baseline turn exists (commit unreadable → no beacons),
return the nodes unfiltered — never hide work that wasn't superseded.

Respect the 250-line file cap — if `timeline-nodes.ts` would exceed it, move the pure
filter into the module's tested model half instead of a new file.

---

## Phase 4 — clone-ready demo fixture (`jfred/demo-baseline/`)

Pattern: the existing `demo/` bundle (tasks 60+62) and `demo-corrupt/` (task 126). The
original scenario repos are GONE (temp cwds cleaned), so the fixture repo is RECREATED
with back-dated commits.

1. **Pick the session.** From `demo/projects/s87-demo-composite/`, choose ONE session
   that (a) contains NO recorded script executions — otherwise the consent dialog stacks
   in front of the demo — and (b) edits one file across ≥3 revisions with at least one
   revision boundary usable as a mid-timeline baseline. First candidate: session
   `ee3482f5…` (`inventory.py`, the task-126 fixture session). Verify (a) by scanning
   its JSONL with `findScriptExecutionRuns` in a scratch `tsx` one-liner (this is a
   check, not the test suite). If it fails (a), walk the other demo sessions until one
   passes; record the chosen session + file in `demo-baseline/README.md`.
2. **Bundle layout** (copies, no tar-extraction into git — task-60/62 TRAP: never
   `git add` an extracted repo, it becomes a gitlink and drops files):
   - `demo-baseline/projects/baseline-demo/<session>.jsonl` — copied from `demo/projects/s87-demo-composite/`.
   - `demo-baseline/file-history/<session>/` — copied from `demo/file-history/<session>/` when present.
3. **Recreate the baseline repo.** In a scratch dir: write the chosen file at the
   content of a MID-session revision N (take the bytes from the bundled file-history
   blob or the session's Write/Edit records — whichever holds the full revision), at the
   relative path `relative(<recorded cwd>, <recorded file path>)` (that string math is
   all `seedBaseCommitBeacon` uses the cwd for — the recorded cwd need not exist).
   `git init` + one commit with `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` set to an instant
   STRICTLY between revision N's and revision N+1's recorded timestamps (the committer
   date is what places the beacon). Then `tar -cf demo-baseline/repo.git.tar -C <scratch> repo`
   and record the commit hash. Write the exact recreation commands into
   `demo-baseline/README.md` so the fixture is reproducible.
4. **Config** — `demo-baseline/projects/reveng-paths.json`:

```json
{ "baseline-demo": { "repo": "demo-baseline/projects/baseline-demo/repo", "baseCommit": "<hash from step 3>" } }
```

   The repo path is relative and resolves against the process cwd — correct because the
   npm script below runs from the jfred root, exactly like `npm run demo`'s relative
   `tar -xf`/`-C` paths.
5. **npm script** in `jfred/package.json`, mirroring `demo`:

```json
"demo:baseline": "npm run build:webapp && tar -xf demo-baseline/repo.git.tar -C demo-baseline/projects/baseline-demo && tsx src/viewer_server.ts --projects-dir demo-baseline/projects --file-history-dir demo-baseline/file-history"
```

6. **Ignore the extracted repo**: find how the `demo/` extraction is kept out of git
   (`git check-ignore -v demo/projects/s87-demo-composite/repo` after a demo run, or
   inspect `.gitignore`); apply the same mechanism to
   `demo-baseline/projects/baseline-demo/repo/`, adding both patterns to `.gitignore`
   if the demo one was never covered.
7. **README** — `demo-baseline/README.md`: what the fixture shows (`npm run
   demo:baseline` → open `baseline-demo` → the pre-baseline question appears; "Yes" →
   full history; "No" → the timeline's first step is the git-baseline node and revisions
   before the commit are absent), the chosen session/file/revision, the repo recreation
   recipe, and the commit hash.

---

## Phase 5 — verification + wrap-up

1. `cd jfred && npm run typecheck` — must pass (webapp files compile under
   `tsconfig.webapp.json` via `npm run build:webapp`; run that too since the dialog file
   is new).
2. Do NOT run `npm test` (user runs it).
3. Confirm every new/edited file is ≤ 250 lines.
4. Stage everything in `jfred` AND the corresponding submodule-pointer/`plans` changes in
   RevEng. COMMIT NOTHING.
5. Update RevEng task ledger: leave task 56 in `tasks.json` (the user closes tasks after
   running the suite) — do not move it.

## Known simplifications (deliberate)

- The consent-then-baseline flow costs one extra request round-trip when both gates
  fire; both responses are record-scan-cheap (no build runs before either gate).
- Script-execution stages still run over pre-baseline records when "No" is chosen —
  the task grants "may skip"; the replay trim is where the per-target work goes away.
  Extend the skip into the script stage only if profiling ever says so.
- The five view call sites repeat a two-line gate instead of sharing a helper — matches
  the existing consent pattern; a shared gate helper would churn working code.
