# Handoff: task 340 — all 9 timeline layers, ambiguities cleared, engine build-out not started
Conversation name: Task 340 L3–L9 ambiguity clearing + grilling
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/30708eca-5587-449a-b2b6-e53a1b0eecb4.jsonl
Plan file: plans/340-recon/DECISIONS.md (canonical), plus plans/340-recon/L3–L9 per-layer docs

## Branch
`develop` based on `master`. Submodule `jfred/` is also on `develop` at `7113bfc`.

## Goal
Task #340 adds timeline Layers 3–9 on top of the shipped Layer 1/2 webapp:
extracted Edit/Write nodes, script-run nodes, branches, script execution
results, remaining node types, node-kind filtering, and ruler-range → git
commit export. **The user's stated deadline is 2026-07-31 (tomorrow).** That is
aggressive: only L3 has a spec item, no engine work has started, and two design
mockups are still blocking. Scope-cutting is the user's call — surface it early.

## Current State

**Done this session (planning only — zero code changed):**
- All 60+ ambiguities across `plans/340-recon/L3-*.md` … `L9-*.md` were put to
  the user and resolved. Each doc now leads with answers; the questions and
  their code evidence are kept below as the record.
- `plans/340-recon/DECISIONS.md` rewritten as the single home for cross-cutting
  decisions. Round-1 entries that today's grilling overturned are marked
  `~~superseded~~` — **read those markers, the old text is actively wrong**.
- `specs/from-scratch-SPEC.md` S20 (Layer 3) **rewritten**; the morning draft
  contradicted the settled decisions in five places.
- Task #343's description trimmed to its scope boundary, pointing at S20.

**Uncommitted, staged:** `specs/from-scratch-SPEC.md`, `tasks.json`.
Committed earlier today: `a51fa8a`, `30c245d` (the recon docs).

**Not started:** every line of implementation. No engine work, no webapp work,
no fixture work, no mockups.

**Open tasks:** #338 (btw-forked investigation), #339 (node icons/colors),
#340 (parent), #341 (compact-gaps button), #342 (webapp verification),
#343 (L3 mockup), #344 (rename tie-group/capped-gap), #345 (document sibling
absorption). 33 open in total.

## What Remains

In execution order.

1. **Build the two blocking mockups.** Static HTML, zero interactivity, served
   via `cd plans/layer2-mockup && python3 -m http.server 8000` (ES modules do
   not load off `file://`).
   - **L5 branch rendering, 2–3 variants.** One variant must be the existing
     design in `plans/mvp-app-mockup.html` layer 8 (per-session 64px lane
     columns; rewound nodes dimmed to `opacity:.38` in place; `.blink` dashed
     elbow + `.bline` vertical connector; no rewind node). The user asked for
     alternatives to compare against it — a genuinely forked path is the
     obvious second. Lane scope and whether a tie-group rectangle spans lanes
     are both decided by this choice.
   - **L6 execution console, 2–3 variants.** Live script output with a cancel
     button that kills the run, probably a popup over the timeline. The global
     load bar is already settled; only the console shape is open.
2. **Write spec items for L4, L7, L8, L9** (S21–S24 or next free numbers).
   All four are fully decided — no further user input needed. Follow S20's
   rewritten shape. L5 and L6 spec items wait on step 1.
3. **Create the `data-layer` retirement task.** It must land in one commit:
   the CSS rule `layer1-styles.css:71`, `layer1-layer-toggle.ts`,
   `layer1.html:16,40-41`, `tests/layer1-layer-toggle.test.ts`, three probes
   (`scripts/visual/mockup.ts:27`, `layer2-checks.ts:18,53`,
   `mockup-checks.ts:44`), and `jfred/docs/ui-component-glossary.md:5,27`.
4. **Add the reuse rule** to `plans/coding-requirements.md`: if the engine
   computes it, consume it — never re-derive branch membership, rewind points,
   or file state in the webapp.
5. **Build #343** (L3 mockup, fixture-mode on the real layer1 page) against the
   rewritten S20. Ends at user sign-off; engine build-out tasks are created
   only after approval.
6. **Split the layer-2 fixture data.** `SNAPSHOTS` moves out of
   `viewer_api_layer1_fixture_data.ts` into `viewer_api_layer2_fixture_data.ts`;
   the shared bulk generator and self-check move somewhere common. New layers
   get `viewer_api_layer<N>_fixture_data.ts` (underscores).
7. **Engine build-out per layer**, only after each layer's mockup is approved.

## Key Files

- `plans/340-recon/DECISIONS.md` — **read this first.** Cross-cutting decisions;
  superseded entries are struck through.
- `plans/340-recon/L3…L9-*.md` — per-layer recon + decisions + the code
  evidence behind each.
- `specs/from-scratch-SPEC.md` — S19 is Layer 2 (shipped, a good template for
  "verify" sections); S20 is Layer 3, rewritten today.
- `plans/mvp-app-mockup.html` — the user's own branch/lane design, layer 8.
- `plans/layer2-mockup/{index.html,app.js,fixture.js,diff.js}` — the
  python-served mockup. `fixture.js` is the data (174 lines: crafted literals,
  then an 84-file bulk generator, then a throwing self-check).
- `jfred/src/viewer_api_layer1_fixture_data.ts` — the TS twin, "ported
  wholesale" from `fixture.js`. These two must stay in sync.
- `jfred/src/reconstruction_extract.ts:133-135` — the mandatory-structuredPatch
  gate.
- `jfred/src/reconstruction_script_runs.ts:73-119` — `executeRunOnce`.
- `jfred/webapp/layer1-ruler-axis.ts:37-42,108-114` — the gap clamp and ladder
  layout.
- `jfred/webapp/layer1-tie-groups.ts` — tie groups (task #344 renames this).

## Context the Next Agent Won't Have

**Corrections to beliefs that were wrong.** Do not re-derive these:
- **A code rewind is NOT derivable from the transcript.** Verified against the
  real s7 JSONL: zero `edited_text_file` attachments, no restore marker,
  `file-history-snapshot` versions just increment. The only trace is a shared
  `parentUuid` — identical to a conv-only rewind. Earlier plan prose claimed a
  restore surfaces as a synthetic `edited_text_file`; that came from prose, not
  data, and is wrong. **Decision: no rewind node at all.**
- **The engine DOES detect user edits.** `edited_text_file` → `UserEditEvent`
  (`reconstruction_user_edit.ts:23`), 14 scenarios, and **10,149 occurrences
  across 512 real session files** spanning 2026-04-11 → today. The user
  believed the property was too new to appear in their logs. It is not.
- **The sandbox does not "skip bash."** The sandbox is unconditionally
  `python3` (`reconstruction_script_sandbox.ts:190`). The skip is an explicit
  early return in `executeRunOnce` (`reconstruction_script_runs.ts:94-99`).
  Bash runs ARE identified; a bash command invoking a `.py` file is
  reclassified to python and does execute.
- **`executeRunOnce` collapses six outcomes** into the same `post: undefined`:
  sandbox crash, 5s timeout, bash, read-only, pre-baseline, empty pre-state.
- **Failure signal:** only `is_error` on tool_result blocks (4,361 in the real
  corpus). There is **no `exitCode`** on Bash results (the 812 nonzero hits are
  hook attachments). `interrupted` is **always false** in ~24,500 occurrences.
  `getToolResultForUserRecord` currently **discards** errored runs.
- **`process.cwd()` appears nowhere in `jfred/src/`.** Reading the live working
  tree (an L6 decision) is a first-ever capability, not a config flag.

**Hard facts that change design:**
- **`structuredPatch` is mandatory.** `oldString`/`newString` alone produces
  **no edit event at all**. Any fixture edit without real hunks renders nothing.
- **84 of the 88 fixture bubbles are bulk-generated.** Edits must go in the
  bulk loop too, or the mockup timeline looks empty.
- **Layer 1 has exactly ONE `.lane` per bubble today.** Per-session lanes exist
  only in `plans/mvp-app-mockup.html` and the older `layered-app.ts:128-135`.
- **No non-file lane exists in layer 1.** The session annotation track (L7) is
  new UI and needs windowing — it must host ~54k rows.
- **~22% of records carry no timestamp** (42,790 of 192,303 in the RevEng
  project) — all session metadata. `worktree-state` (124) and `relocated` (87)
  are real record types **absent from the `RecordType` enum**.
- **The real log corpus is at `~/Programming/jot-recovery/claude-data/projects`**
  (2,228 files, 1.8G), NOT inside the RevEng repo.

**User preferences learned the hard way:**
- **Never invent terminology.** "zero guess", "capped gap", "tie group" all
  drew corrections. Tasks #344/#345 exist because of this. If a term is in the
  codebase, cite where; if it isn't, don't use it.
- **Verify claims before asking the user to weigh in.** The user pushed back on
  an unverified assertion ("the sandbox always skips bash runs") and was right.
  Check first, then ask.
- **Two options maximum** when asking a question, with a recommendation.
- The user edits files between turns — unexpected diffs may be theirs.
- Stage only your own changes; never `git add -A`.
- `plans/340-recon/*.md` are **exempt from the 250-line cap** (user, today).

## How to Verify

Nothing to run for the planning work — it is documentation only. For any code
you write:

```
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred"
npm run typecheck
npm test                 # node --test, NOT vitest
npm run visual           # cold-start CDP, whole-page checks
npm run visual:mockup    # the plans/layer2-mockup checks
npm run visual:layer2    # the real page with real data
```

The project rule: a task is not done until typecheck passes, the **full**
relevant suite passes, and UI work is confirmed in a real browser via the
headless CDP tools in `jfred/scripts/visual/`. DOM assertions alone do not
close a visual fix.

To look at the mockup: `cd plans/layer2-mockup && python3 -m http.server 8000`.
To run the real app in fixture mode: `npm run build:webapp && tsx
src/viewer_server.ts --projects-dir <any> --fixture`.
