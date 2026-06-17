#!/usr/bin/env python3
"""
Coverage-goal-driven generator for agent-conversation test scenarios.

Driver = mode B: you declare a set of coverage GOALS; the generator builds
valid candidate scenarios from a motif library, tags each with the goals it
satisfies, greedily selects a minimal set that covers every goal, and renders
the selected scenarios to the `- [ ] N. ...` .txt format.

Validity is guaranteed *by construction*: the Builder refuses any illegal step
(create when the file already exists, edit/delete when it doesn't, rewind
deeper than the live stack, etc.), so anything that renders is a legal script.

State tracked per scenario
--------------------------
  exists : bool                 -- does the working file exist
  ops    : list[str]            -- content op-stack (rewind reverts this)
  cur    : str                  -- current working filename (move/rename change it)
  live   : list[snapshot]       -- rewind stack; one entry per recorded *live* line,
                                   storing the (exists, ops, cur) state *before* it.
                                   Rewind:K pops K entries; `,code` restores the
                                   oldest-popped snapshot; bare rewind leaves files.

Design choice: generated edits are append-only (each adds a uniquely named
symbol), so file *content* stays coherent without anchor tracking while the
op-stack still models exactly what a code-rewind reverts. Anchored edits
(`after `self.items=[]``) are a future extension.
"""
from __future__ import annotations
import argparse, os
from dataclasses import dataclass, field


# --------------------------------------------------------------------------- #
# Engine
# --------------------------------------------------------------------------- #
@dataclass
class Builder:
    name: str
    exists: bool = False
    ops: list = field(default_factory=list)
    cur: str = ""
    live: list = field(default_factory=list)   # snapshots (exists, tuple(ops), cur)
    lines: list = field(default_factory=list)  # rendered step bodies (unnumbered)
    goals: set = field(default_factory=set)
    _n: int = 0                                 # symbol counter

    def __post_init__(self):
        if not self.cur:
            self.cur = f"{self.name.replace('-', '_')}.py"

    # -- helpers ----------------------------------------------------------- #
    def tag(self, *g): self.goals.update(g)

    def _sym(self, prefix):
        self._n += 1
        return f"{prefix}{self._n}"

    def _live_line(self, text):
        """Record a line that IS a rewindable live step (snapshot taken pre-mutation)."""
        self.live.append((self.exists, tuple(self.ops), self.cur))
        self.lines.append(text)

    def _ctrl_line(self, text):
        """Record a control line that is NOT a live step (rewind/clear/compact-as-control)."""
        self.lines.append(text)

    # -- framing ----------------------------------------------------------- #
    def greet(self):  self._live_line("Say: `Hello`"); self.tag("greet"); return self
    def ack(self, p="Thanks."): self._live_line(f"Say: `{p}`"); self.tag("ack"); return self
    def filler(self): self._live_line("Say: `What time is it?`"); self.tag("filler"); return self

    # -- file creation ----------------------------------------------------- #
    def create(self):
        assert not self.exists, "create requires the file to be absent"
        fn = self._sym("f")
        self._live_line(
            f"Say: `Write a file called {self.cur} with a function called {fn}() "
            f"that returns {self._n}, and write tests/test_{self.cur} that tests "
            f"{fn}() returns {self._n}.`")
        self.exists, self.ops = True, [fn]
        self.tag("create"); return self

    def user_create(self):
        assert not self.exists, "user_create requires the file to be absent"
        fn = self._sym("f")
        self._live_line(f"Create: {self.cur} — `def {fn}(): return {self._n}`")
        self.exists, self.ops = True, [fn]
        self.tag("user_create"); return self

    # -- file modification (require exists) -------------------------------- #
    def agent_edit(self):
        assert self.exists, "agent_edit requires the file to exist"
        fn = self._sym("f")
        self._live_line(f"Say: `Edit {self.cur}. Add a function called {fn}() that returns {self._n}.`")
        self.ops.append(fn); self.tag("agent_edit"); return self

    def user_edit(self):
        assert self.exists, "user_edit requires the file to exist"
        fn = self._sym("u")
        self._live_line(f"Edit: {self.cur} — append `def {fn}(): return {self._n}`")
        self.ops.append(fn); self.tag("user_edit"); return self

    def move(self):
        assert self.exists, "move requires the file to exist"
        dst = self.cur.replace(".py", "_moved.py")
        self._live_line(f"Say: `Move {self.cur} to {dst}.`")
        self.cur = dst; self.ops.append("move"); self.tag("move"); return self

    def rename(self):
        assert self.exists, "rename requires the file to exist"
        dst = self.cur.replace(".py", "_renamed.py")
        self._live_line(f"Say: `Rename {self.cur} to {dst} using mv.`")
        self.cur = dst; self.ops.append("rename"); self.tag("rename"); return self

    def copy(self):
        assert self.exists, "copy requires the file to exist"
        dst = self.cur.replace(".py", "_copy.py")
        self._live_line(f"Say: `Copy {self.cur} to {dst}.`")
        self.ops.append("copy"); self.tag("copy"); return self  # primary file unchanged

    def delete(self):
        assert self.exists, "delete requires the file to exist"
        self._live_line(f"Say: `Delete {self.cur}.`")
        self.exists, self.ops = False, []; self.tag("delete"); return self

    def bash(self):
        assert self.exists, "bash requires the file to exist"
        self._live_line(f"Say: `Use a bash command to append a comment line to {self.cur}.`")
        self.ops.append("bash"); self.tag("bash"); return self

    def overwrite(self):
        assert self.exists, "overwrite requires the file to exist"
        fn = self._sym("f")
        self._live_line(
            f"Say: `Rewrite {self.cur} completely. Replace everything with a function "
            f"called {fn}() that returns {self._n}. Update the test file too.`")
        self.ops = [fn]; self.tag("overwrite"); return self

    def read(self):
        assert self.exists, "read requires the file to exist"
        self._live_line(f"Say: `Read {self.cur} and tell me what functions it has.`")
        self.tag("read"); return self

    # -- conversation ops -------------------------------------------------- #
    def compact(self):
        self._live_line("/compact")            # live step, no file change
        self.tag("compact"); return self

    def clear(self):
        self._ctrl_line("/clear")              # wipes the rewind stack; files persist
        self.live = []; self.tag("clear"); return self

    def rewind(self, k, code):
        assert 1 <= k <= len(self.live), f"rewind {k} exceeds live depth {len(self.live)}"
        before = self.live[-k]                 # oldest popped == new-top state
        self.live = self.live[:-k]
        if code:
            self._ctrl_line(f"Rewind: {k}, code")
            self.exists, self.ops, self.cur = before[0], list(before[1]), before[2]
            self.tag("rewind_code")
        else:
            self._ctrl_line(f"Rewind: {k}")    # conversation only: files untouched
            self.tag("rewind_conv")
        return self

    # -- render ------------------------------------------------------------ #
    def render(self):
        body = self.lines + ["Exit", "Record: JSONL filename"]
        out = [f"session: {self.name}", "---"]
        out += [f"- [ ] {i}. {line}" for i, line in enumerate(body, 1)]
        return "\n".join(out) + "\n"


def resume_of(companion: Builder, name: str) -> Builder:
    """A scenario that /resumes a companion: inherits its end file-state.
    Default: the prior session is NOT on the fresh rewind stack."""
    b = Builder(name, exists=companion.exists, ops=list(companion.ops), cur=companion.cur)
    b._n = companion._n
    b._ctrl_line(f"/resume {companion.name}")  # resume command, not a live step
    b.tag("resume")
    return b


# --------------------------------------------------------------------------- #
# Motif library  (each returns one finished candidate scenario)
# --------------------------------------------------------------------------- #
def single_op(op):
    b = Builder(f"g-{op}").create()
    getattr(b, op)()
    return b.ack()

def user_create_motif():
    return Builder("g-user-create").user_create().agent_edit().ack()

def compact_motif():
    return Builder("g-compact").create().agent_edit().compact().agent_edit().ack()

def clear_motif():
    return Builder("g-clear").create().agent_edit().clear().agent_edit().ack()

def code_rewind_read():
    b = Builder("g-code-rewind-read").create().agent_edit().agent_edit().ack()
    b.rewind(2, code=True).read().ack()
    b.tag("code_rewind+read"); return b

def conv_rewind_reedit():
    b = Builder("g-conv-rewind-reedit").create().agent_edit().agent_edit().ack()
    b.rewind(2, code=False).agent_edit().ack()
    b.tag("conv_rewind+reedit"); return b

def user_edit_code_rewind():
    b = Builder("g-user-edit-code-rewind").create().user_edit().agent_edit().ack()
    b.rewind(2, code=True).read().ack()
    b.tag("user_edit+rewind_code", "code_rewind+read"); return b

def user_edit_conv_rewind():
    b = Builder("g-user-edit-conv-rewind").create().user_edit().agent_edit().ack()
    b.rewind(2, code=False).agent_edit().ack()
    b.tag("user_edit+rewind_conv", "conv_rewind+reedit"); return b

def multi_rewind_diff_n():
    # Mirrors the worked example: rewinds of K = 1, 3, 2 over a shifting live stack.
    b = Builder("g-multi-rewind-diff-n").create()
    b.agent_edit().agent_edit().agent_edit()      # Edit1 Edit2 Edit3
    b.rewind(1, code=True)                         # undo Edit3
    b.agent_edit().delete()                        # Edit4, Delete
    b.rewind(3, code=True)                         # undo Delete, Edit4, Edit2 -> back to Edit1
    b.agent_edit().agent_edit().move().agent_edit()
    b.rewind(2, code=True)                         # undo last edit + move
    b.move().agent_edit().ack()
    b.tag("multi_rewind_diff_n"); return b

def resume_pair():
    companion = Builder("g-resume-base").create().agent_edit().ack()
    resumed = resume_of(companion, "g-resume-continue").read().agent_edit().ack()
    return companion, resumed


def candidates():
    cands = [single_op(op) for op in
             ("agent_edit", "user_edit", "move", "rename", "copy",
              "delete", "bash", "overwrite", "read")]
    cands += [user_create_motif(), compact_motif(), clear_motif(),
              code_rewind_read(), conv_rewind_reedit(),
              user_edit_code_rewind(), user_edit_conv_rewind(),
              multi_rewind_diff_n()]
    companion, resumed = resume_pair()
    cands += [resumed]
    # `resumed` references `companion` by name, so companion must ship if resumed is chosen.
    return cands, {resumed.name: companion}


# --------------------------------------------------------------------------- #
# Coverage goals (mode B: declare what must be exercised)
# --------------------------------------------------------------------------- #
GOALS = {
    # every action at least once
    "create", "user_create", "agent_edit", "user_edit", "move", "rename",
    "copy", "delete", "bash", "overwrite", "read", "compact", "clear", "resume",
    # both rewind modes
    "rewind_code", "rewind_conv",
    # higher-order patterns
    "multi_rewind_diff_n",
    "user_edit+rewind_code", "user_edit+rewind_conv",
    "code_rewind+read", "conv_rewind+reedit",
}


def greedy_cover(cands, goals):
    remaining = set(goals)
    chosen = []
    pool = list(cands)
    while remaining:
        # pick the candidate covering the most still-uncovered goals
        best = max(pool, key=lambda b: len(b.goals & remaining))
        gain = best.goals & remaining
        if not gain:
            break  # nothing left can cover the rest
        chosen.append(best); pool.remove(best); remaining -= gain
    return chosen, remaining


# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="generated")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    cands, deps = candidates()
    chosen, missed = greedy_cover(cands, GOALS)

    # pull in dependencies (resume companions)
    emit = list(chosen)
    names = {b.name for b in emit}
    for b in chosen:
        dep = deps.get(b.name)
        if dep and dep.name not in names:
            emit.append(dep); names.add(dep.name)

    for b in emit:
        with open(os.path.join(args.out, f"{b.name}.txt"), "w") as fh:
            fh.write(b.render())

    covered = set().union(*(b.goals for b in emit))
    print(f"declared goals : {len(GOALS)}")
    print(f"scenarios emit : {len(emit)}")
    print(f"goals covered  : {len(covered & GOALS)}/{len(GOALS)}")
    if missed:
        print(f"UNCOVERED      : {sorted(missed)}")
    print("files:")
    for b in sorted(emit, key=lambda x: x.name):
        print(f"  {b.name}.txt   <- {sorted(b.goals & GOALS)}")


if __name__ == "__main__":
    main()
