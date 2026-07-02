# Spec: generic handoff monitor (`monitor-handoff.sh`)

## Objective
Replace the brittle, scenario-hardcoded `monitor-s26-impl-handoff.sh` with one generic
script any agent can run to block until a *specific* handoff document lands. A handoff is
identified by **(scenario, stage)** where stage is the role that produced it — a Planning
agent or an Implementing agent. The script exits 0 the moment the matching handoff exists,
and only then.

## Interface
```
./monitor-handoff.sh <scenario> <stage> [poll_seconds]
  <scenario>     e.g. s27, m4  (case-insensitive; maps to the plans/<scenario>/ folder)
  <stage>        plan | impl
                   plan = the Planning agent's outgoing handoff ("IMPLEMENT Scenario X")
                   impl = the Implementing agent's completion handoff ("X … IMPLEMENTED")
  [poll_seconds] optional poll interval, default 15
```
On match: prints `HANDOFF READY (<scenario>/<stage>): <path>` and exits 0.
Missing/!=2 args: prints usage to stderr, exits 2.

Typical use, per the Plan_/Impl_ templates:
- Implementer of X waits for its plan:        `./monitor-handoff.sh s27 plan`
- Planner of X waits for the upstream impl:    `./monitor-handoff.sh s26 impl`

## Identification rules (derived from every handoff in plans/)
For each `plans/<scenario>/handoff-*.md`, read the title line `grep -m1 '^# Handoff:'`
(NOT `head -1` — implementer handoffs put `MUST READ: …` on line 1).

1. **Subject scenario** = the FIRST `[sm][0-9]+` token in the title (case-insensitive).
   Must equal `<scenario>`. This rejects forward-references like
   "Next scenario: m4 (`m4-…`)" that appear later in a different scenario's title.
2. **Stage** = whether the title contains the whole word `IMPLEMENTED` (case-insensitive):
   - present  → implementer/completion handoff  → matches `impl`
   - absent   → planner handoff (IMPLEMENT / PLANNED / PLAN) → matches `plan`
   Word-boundary matching keeps `IMPLEMENT` (imperative, planner) distinct from
   `IMPLEMENTED` (past tense, implementer).

A file matches iff rule 1 AND rule 2 hold. If several match, pick the newest (sorted).
Scoping the glob to `plans/<scenario>/` is the first guard; the title checks are the
real gate (belt-and-suspenders).

## Boundaries
- Always: scan the `# Handoff:` title line only, never the body (per the S22 false-fire
  lesson). `export PATH` and `set -u` at top (per the S23 watcher-busy-loop lesson).
- Never: match on filename, body prose, or `head -1`.
- Assumption: targets are modern-convention scenarios (~s10+ and m1+), where planner titles
  carry IMPLEMENT/PLANNED and completion titles carry the word IMPLEMENTED. Pre-s10 legacy
  handoffs ("S1 complete") are historical and not waited on; out of scope.

## Success criteria
- `s26 impl` matches `plans/s26/handoff-…-1505.md` ("Scenario s26 (`s26-…`) IMPLEMENTED")
  and does NOT match `plans/s26/handoff-…-1446.md` ("IMPLEMENT Scenario S26 …").
- `s27 plan` would match an "IMPLEMENT Scenario S27 (`s27-…`)" handoff and not its later
  completion handoff.
- A title reading "… m3 … IMPLEMENTED … Next scenario: m4 (`m4-…`)" matches `m3 impl`
  and never `m4 …`.
- Until the matching file exists, the script keeps polling and never exits 0.

## Open questions
1. Disposition of the old `monitor-s26-impl-handoff.sh` (it is already STOPPED/dead).
2. Stage interface: explicit `<scenario> <stage>` two-arg form vs. anything else.
