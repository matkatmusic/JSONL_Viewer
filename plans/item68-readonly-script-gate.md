# Item 68 — static read-only gate for the script-execution sandbox

TASKS.md item 68: `discoverScriptCreatedPaths` / `injectScriptExecutions` eagerly execute
EVERY recorded script run (1000+ on the 33-session RevEng project), yet most recorded runs
are read-only analysis scripts. Add a static write-detection gate so a script whose code
provably contains no write primitive skips the sandbox entirely.

**Do NOT run `npm test` or the scenario coverage harness — the user runs them afterward.
The only permitted verification command is `npm run typecheck`.**

## Design facts the implementation relies on (do not re-derive)

1. `executeRunOnce` (`src/reconstruction_script_stage.ts:69`) is the memoized choke point
   every stage caller routes through (`runTouchesTarget`, `scriptExecutionForBeacon`,
   `runOutcomeForTarget` non-rolling branch, `discoverScriptCreatedPaths`). The gate goes
   there, after the memo-miss check and BEFORE `getPreExecutionState`, returning
   `{ pre: new Map(), post: undefined }`. This is safe because every caller checks
   `post === undefined` before touching `pre`.
2. The gate must NOT go inside `runScriptAgainstState`: the existing test
   `test_runScriptAgainstState_memoizes_failed_runs` spawns `raise SystemExit(1)` (no write
   primitive) and asserts exactly one spawn — a gate there would break it. Also
   `reconstruction_git_evidence.ts:397` calls `runScriptAgainstState` only for runs that
   already produced scriptExecution events (writer runs), so it needs no gate.
3. The rolling branch of `runOutcomeForTarget` (`reconstruction_script_stage.ts:280-287`)
   calls `runScriptAgainstState` directly, bypassing `executeRunOnce`'s post — a one-line
   guard at the top of `runOutcomeForTarget` skips read-only runs there too.
4. The sandbox runs everything as `python3` (`spawnSandboxRun`). Therefore only PYTHON
   write channels can lose evidence on a false "read-only" verdict: a shell or JS script
   crashes under python3 and yields `post: undefined` with or without the gate. This is why
   shell tokens (`mv`, `cp`, `rm`, bare `>` redirects) are deliberately NOT in the denylist
   — bare `>` would match every python comparison and gut the savings, while contributing
   nothing to correctness. (`writeFileSync`/`appendFileSync` are kept because they are free
   and task 68 names them.)
5. A false "may-write" verdict is always harmless (the run just executes as today). Every
   heuristic below therefore bails toward may-write on anything it cannot cheaply parse.
6. `import <seeded local module>` can run write code without any visible primitive (the s34
   script-indirection family) — so imports are handled by an ALLOWLIST of read-only-safe
   python stdlib roots; any other import ⇒ may-write.

## Phase 1 — RED: predicate tests

In `tests/reconstruction_script_execution.test.ts`, add
`scriptCodeMayWriteFiles` to the existing import from `../src/reconstruction_script_execution.ts`,
then add these tests (house style: plain-English step comments, `test_<behavior>` names):

```ts
test("test_scriptCodeMayWriteFiles_accepts_a_read_only_analysis_script", () => {
    // Scenario: the dominant recorded shape — a grep/count/print analysis script that only
    // reads files — must classify read-only so the sandbox is skipped (TASKS.md item 68).
    const script = 'import os\nimport re\nimport json\n'
        + 'text = open("ledger.py").read()\n'
        + 'hits = [line for line in text.splitlines() if re.search(r"def ", line)]\n'
        + 'print(json.dumps(len(hits)))\n';
    assert.equal(scriptCodeMayWriteFiles(script), false);
});

test("test_scriptCodeMayWriteFiles_flags_write_mode_opens", () => {
    // Scenario: literal "w"/"a" open modes are the classic write channel.
    assert.equal(scriptCodeMayWriteFiles('open("out.txt", "w").write("x")\n'), true);
    assert.equal(scriptCodeMayWriteFiles('open("log.txt", "a").write("x")\n'), true);
});

test("test_scriptCodeMayWriteFiles_flags_an_unprovable_open_mode", () => {
    // Scenario: a variable mode or nested-call arguments cannot be parsed cheaply — the
    // verdict must fall to may-write (a false may-write is harmless; the reverse is not).
    assert.equal(scriptCodeMayWriteFiles("open(p, mode)\n"), true);
    assert.equal(scriptCodeMayWriteFiles("open(os.path.join(a, b))\n"), true);
});

test("test_scriptCodeMayWriteFiles_accepts_read_mode_opens", () => {
    // Scenario: single-argument opens and literal read modes (incl. keyword-only forms)
    // stay read-only.
    assert.equal(scriptCodeMayWriteFiles('open("f.py", "r").read()\n'), false);
    assert.equal(scriptCodeMayWriteFiles('open("f.py", "rb").read()\n'), false);
    assert.equal(scriptCodeMayWriteFiles('open("f.py", encoding="utf-8").read()\n'), false);
});

test("test_scriptCodeMayWriteFiles_flags_pathlib_and_os_write_methods", () => {
    // Scenario: pathlib write methods, Path.open (whose FIRST argument is the mode), and
    // os rename/remove are write channels.
    assert.equal(scriptCodeMayWriteFiles('from pathlib import Path\nPath("f").write_text("x")\n'), true);
    assert.equal(scriptCodeMayWriteFiles('from pathlib import Path\nPath("f").open("w")\n'), true);
    assert.equal(scriptCodeMayWriteFiles('import os\nos.rename("a", "b")\n'), true);
    assert.equal(scriptCodeMayWriteFiles('import os\nos.remove("a")\n'), true);
});

test("test_scriptCodeMayWriteFiles_flags_unknown_and_escaping_imports", () => {
    // Scenario: a non-allowlisted import may be a seeded local module whose top level
    // writes (the s34 script-indirection family); shutil writes outright; a from-import
    // can smuggle a writing name out of a safe root; exec escapes static analysis.
    assert.equal(scriptCodeMayWriteFiles('import shutil\nshutil.move("a", "b")\n'), true);
    assert.equal(scriptCodeMayWriteFiles("import apply_renames\n"), true);
    assert.equal(scriptCodeMayWriteFiles('from os import remove\nremove("a")\n'), true);
    assert.equal(scriptCodeMayWriteFiles("exec(compiled)\n"), true);
});
```

## Phase 2 — RED: executeRunOnce gate test

In `tests/reconstruction_script_stage.test.ts` (it already has `buildToolRecord` and
`emptyReader`), add imports for `executeRunOnce` and `PROGRESS_LABEL_READ_ONLY_SKIP_PREFIX`
(from `../src/reconstruction_script_stage.ts`), `PROGRESS_LABEL_SANDBOX_SPAWN_PREFIX` (from
`../src/reconstruction_script_execution.ts`), and `setReconstructionProgressSink` (from
`../src/reconstruction_progress.ts`) — reuse any of these already imported. Add:

```ts
test("test_executeRunOnce_skips_the_sandbox_for_a_read_only_script", () => {
    // Scenario: a recorded analysis run with no write primitive must not spawn a sandbox —
    // its execution memoizes as { pre: empty, post: undefined } (TASKS.md item 68).
    // Steps:
    // record a Write plus a read-only counting script over it.
    const records = [
        buildToolRecord(ToolName.Write, { file_path: "/proj/ledger.py", content: "def add(): pass\n" }, "2026-01-01T00:00:01Z"),
        buildToolRecord(ToolName.CtxExecute, { cwd: "/proj", code: 'print(len(open("ledger.py").read()))\n' }, "2026-01-01T00:00:02Z"),
    ];
    const run = findScriptExecutionRuns(records)[0]!;
    // execute the run while counting sandbox-spawn and read-only-skip announcements.
    const spawnLabels: string[] = [];
    const skipLabels: string[] = [];
    setReconstructionProgressSink((event) => {
        if (event.label.startsWith(PROGRESS_LABEL_SANDBOX_SPAWN_PREFIX)) spawnLabels.push(event.label);
        if (event.label.startsWith(PROGRESS_LABEL_READ_ONLY_SKIP_PREFIX)) skipLabels.push(event.label);
    });
    try {
        const execution = executeRunOnce(run, records, emptyReader);
        // assert the sandbox never spawned, the skip announced itself, and post is undefined.
        assert.equal(execution.post, undefined);
        assert.equal(spawnLabels.length, 0);
        assert.equal(skipLabels.length, 1);
    } finally {
        setReconstructionProgressSink(undefined);
    }
});
```

If `setReconstructionProgressSink`'s actual name/signature differs, read
`src/reconstruction_progress.ts` and use the real sink setter (the pattern used by
`collectSandboxSpawnLabels` in `tests/reconstruction_script_execution.test.ts:181-194`).

## Phase 3 — regexes in `src/regex_expressions.ts`

Append these exports, following the file's style (composed fragments where simple, literals
where hairy, each with a plain-English comment + worked example + "Equivalent to the
literal …" note). Literal forms to implement:

1. `openCallToken` — `/open\s*\(/g`. Every `open(` occurrence, including method forms
   (`p.open(`, `io.open(`) and false hits inside longer names (`reopen(` — harmless, the
   caller's analysis only bails toward may-write). Used ONLY with `.matchAll()` (safe with
   `g`; do not use with `.test()`, per the file's `g`-flag note).
2. `readOnlyOpenArgument` —
   `/^\s*(?:["']r[bt]?["']|mode\s*=\s*["']r[bt]?["']|(?:encoding|errors|newline|buffering|closefd|opener)\s*=)/`.
   An open() argument that keeps the call a read: a literal `"r"`/`"rb"`/`"rt"` mode
   (quoted either way), `mode="r…"`, or a keyword that is not `mode` (mode then defaults
   to `"r"`). `"r+"` deliberately does NOT match (readable-and-writable).
3. `pythonWritePrimitive` (NO `g` flag — used with `.test()`) —
   `/\.(?:write_text|write_bytes|touch|mkdir|makedirs|rename|replace|remove|unlink|rmdir|symlink_to|hardlink_to|truncate|system|popen)\s*\(|\b(?:exec|eval)\s*\(|__import__|writeFileSync|appendFileSync/`.
   Method tokens cover both `os.rename(...)` and `Path(...).rename(...)` (the leading `.`
   matches either). `.replace(`/`.remove(` also hit read-only `str.replace`/`list.remove`
   — accepted false may-writes, called out in the comment.
4. `importStatementLine` — `/^[ \t]*import[ \t]+(.+)$/gm`. group 1 = everything after
   `import` on the line (may be a comma list, an `as` alias, or junk like `os; print(1)` —
   junk fails the allowlist and lands on may-write, which is the safe side).
5. `fromImportStatementLine` — `/^[ \t]*from[ \t]+([\w.]+)[ \t]+import[ \t]+(.+)$/gm`.
   group 1 = the module path, group 2 = the imported names.
6. `writingImportedName` (NO `g` flag) —
   `/\b(?:open|rename|replace|remove|unlink|rmdir|mkdir|makedirs|symlink|link|system|popen|truncate|fdopen)\b/`.
   A from-imported name that can write even when its root module is allowlisted
   (`from os import remove`). Whole-word, so `islink`/`Optional` do not match.

## Phase 4 — GREEN: predicate in `src/reconstruction_script_execution.ts`

Add a new section (e.g. after the run-detection section, before the forward-execution
pipeline), importing the six new names from `./regex_expressions.ts`:

```ts
// --- static read-only detection (TASKS.md item 68) --------------------------------------------------

// Python stdlib roots a read-only analysis script may import without becoming a writer. Any
// other import marks the script may-write: a seeded local module can run write code at import
// time (the s34 script-indirection family), and shutil/subprocess/sqlite3 write outright.
// A missing safe module only costs sandbox savings, never correctness — extend freely.
const READ_ONLY_SAFE_IMPORT_ROOTS = new Set([
    "os", "sys", "re", "json", "csv", "glob", "pathlib", "collections", "itertools",
    "functools", "math", "statistics", "textwrap", "difflib", "datetime", "time", "string",
    "typing", "dataclasses", "enum", "pprint", "fnmatch", "bisect", "heapq", "operator",
    "hashlib", "unicodedata", "copy", "ast", "tokenize", "keyword", "inspect", "traceback",
    "argparse", "random", "io", "base64", "struct", "uuid",
]);

// Whether every import statement in `code` names only read-only-safe stdlib roots, and no
// from-import smuggles a writing name (`from os import remove`) out of a safe root.
function allImportsAreReadOnlySafe(code: string): boolean {
    for (const match of code.matchAll(importStatementLine)) {
        for (const item of match[1]!.split(",")) {
            const root = item.trim().split(singleWhitespace)[0]?.split(".")[0] ?? "";
            if (!READ_ONLY_SAFE_IMPORT_ROOTS.has(root)) return false;
        }
    }
    for (const match of code.matchAll(fromImportStatementLine)) {
        const root = match[1]!.split(".")[0] ?? "";
        if (!READ_ONLY_SAFE_IMPORT_ROOTS.has(root)) return false;
        if (writingImportedName.test(match[2]!)) return false;
    }
    return true;
}

// Whether every open( call in `code` is provably a read: builtin open with one argument or a
// read-mode/keyword second argument; a dot-call (Path.open, io.open) must show a read mode or
// keyword-only args as its FIRST argument (Path.open's first parameter IS the mode). Anything
// the cheap first-")" parse cannot prove (nested calls, variable modes) counts as may-write.
function allOpenCallsAreReads(code: string): boolean {
    for (const match of code.matchAll(openCallToken)) {
        const argsStart = match.index + match[0].length;
        const argsEnd = code.indexOf(")", argsStart);
        if (argsEnd < 0) return false;
        const args = code.slice(argsStart, argsEnd);
        // A nested call defeats the first-")" slice (an f-string's embedded call can even
        // hide a write mode past it) — bail to may-write.
        if (args.includes("(")) return false;
        const parts = args.split(",");
        const isDotCall = match.index > 0 && code[match.index - 1] === ".";
        if (isDotCall) {
            // Path.open(): no arguments defaults to mode "r".
            if (args.trim() === "") continue;
            if (!readOnlyOpenArgument.test(parts[0]!)) return false;
            continue;
        }
        // builtin open(file): a single argument defaults to mode "r".
        if (parts.length === 1) continue;
        if (!readOnlyOpenArgument.test(parts[1]!)) return false;
    }
    return true;
}

// Whether the script could write, delete, rename, or create files when run under the python3
// sandbox. Conservative by construction: any unparseable construct answers true (may-write),
// which merely executes the run as before the gate; only a provably-read-only script answers
// false. Shell/JS-only tokens are irrelevant to correctness — a non-python script crashes in
// the sandbox and yields post:undefined with or without the gate.
// ponytail: raw-text scan — aliased builtins (`o = open`) and getattr tricks evade it; no
// recorded transcript uses them, and the executed-outcome check of task 67 is the exact answer.
export function scriptCodeMayWriteFiles(code: string): boolean {
    if (pythonWritePrimitive.test(code)) return true;
    if (!allImportsAreReadOnlySafe(code)) return true;
    if (!allOpenCallsAreReads(code)) return true;
    return false;
}
```

Note: `singleWhitespace` is already imported in this file. If `match.index` is typed
`number | undefined` under the project's TS config, use `match.index!` (matchAll indices are
always present).

## Phase 5 — GREEN: gate in `src/reconstruction_script_stage.ts`

1. Add `scriptCodeMayWriteFiles` to the existing import block from
   `./reconstruction_script_execution.ts`.
2. Export the skip label next to the file's other exports:

```ts
// Progress label announced instead of a sandbox execution when the static gate proves a run
// read-only (TASKS.md item 68). Exported for the spawn-count tests.
export const PROGRESS_LABEL_READ_ONLY_SKIP_PREFIX = "skipping read-only script run";
```

3. In `executeRunOnce`, immediately after `if (cached !== undefined) return cached;` and
   BEFORE the existing `reportReconstructionProgress("executing script run …")` line:

```ts
    // Item 68: a script with no statically detectable write primitive cannot change or
    // create files, so its pre-state build and sandbox run are provably no-ops for evidence.
    // The empty pre is safe: every caller checks `post === undefined` before touching `pre`.
    if (!scriptCodeMayWriteFiles(run.code)) {
        reportReconstructionProgress(
            `${PROGRESS_LABEL_READ_ONLY_SKIP_PREFIX} @ ${run.timestamp.toISOString()}${formatRunSource(run)}`,
        );
        const skipped: RunExecution = { pre: new Map(), post: undefined };
        byRun.set(key, skipped);
        return skipped;
    }
```

4. At the top of `runOutcomeForTarget` (before the `if (rolling === undefined)` branch):

```ts
    // Item 68: a read-only run can never produce an outcome; bail before any sandbox work
    // (the rolling branch below would otherwise spawn a sandbox per chained run).
    if (!scriptCodeMayWriteFiles(run.code)) return undefined;
```

## Phase 6 — TASKS.md + verify + stage

1. In `TASKS.md`, flip item 68's checkbox to `[x]` and append a short note in the style of
   other completed items, e.g.: "DONE 2026-07-11 — static gate `scriptCodeMayWriteFiles`
   (import allowlist + open-mode analysis + write-primitive tokens) skips the sandbox in
   `executeRunOnce`/`runOutcomeForTarget`; conservative: anything unparseable stays
   may-write. tsc clean; suite + scenario harness not run (user runs)."
2. Run `npm run typecheck` — must pass. Do NOT run `npm test` or any scenario harness.
3. Stage exactly the touched files with `git add` (source, tests, TASKS.md, this plan and
   the implementation notes). Do NOT commit.

## Correctness invariants (do not weaken during implementation)

- Never move the gate into `runScriptAgainstState` (fact 2).
- Never add bare `>` / shell-word tokens to the denylist (fact 4) and never remove
  `.replace(`/`.rename(`/`.remove(` from `pythonWritePrimitive` to chase savings.
- Any parsing shortcut must fail toward may-write, never toward read-only.
