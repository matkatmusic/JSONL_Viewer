import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M6_JSONL } from "./fixtures.ts";

// m6's conversationDAG is BRANCHED at the code rewind: the root prompt A is the rewind point, with a
// rewound branch (F edit, abandoned) and a surviving branch (G user-edit, H edit) beneath it.
test("test_m6_default_conversationDAG_shows_rewind_two_branches", () => {
    const out = runCli([M6_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #a2903cef   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #9b69e66c; rewind @ #a2903cef)"));
    assert.ok(out.includes("F  edit       m6_derived.py  #01PDWMdw"));
    assert.ok(out.includes("branch surviving (surviving; tip #1d474d0b)"));
    assert.ok(out.includes("G  user-edit  m6_derived.py  #e4073b7d"));
    assert.ok(out.includes("H  edit       m6_derived.py  #012Rfp8i"));
});

// The fileDAG groups all four m6_derived.py events in order, plus the m6_source.py write+edit.
test("test_m6_default_fileDAG_groups_three_files", () => {
    const out = runCli([M6_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "m6_derived.py\n  E  copy       #015JzRDQ\n  F  edit       #01PDWMdw\n  G  user-edit  #e4073b7d\n  H  edit       #012Rfp8i",
    ));
    assert.ok(out.includes("m6_source.py\n  B  write      #01D7RkYd\n  D  edit       #01DzkUDT"));
});

// Two branches: surviving (three files), rewound (one file), with the rewind-point marker.
test("test_m6_list_branches_surviving_three_files_rewound_one", () => {
    const out = runCli([M6_JSONL, "--list-branches"]);
    assert.ok(out.includes(
        "surviving  tip #1d474d0b    m6_source.py, test_m6_source.py, m6_derived.py",
    ));
    assert.ok(out.includes("rewound    tip #9b69e66c  rewind @ #a2903cef    m6_derived.py"));
});

// THE SURVIVING GROUND-TRUTH BYTE-LOCK: the surviving m6_derived.py final revision is the 10-line
// validate() version, with `# derived version` on line 3 (end-to-end through the on-disk reader).
test("test_m6_surviving_verbose_derived_ends_at_validate", () => {
    const out = runCli([M6_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes(
        '(10 lines)\n     1 | class Base:\n     2 |     def __init__(self):\n     3 | # derived version\n     4 |         self.name = "base"\n     5 | \n     6 |     def describe(self):\n     7 |         return self.name\n     8 | \n     9 |     def validate(self):\n    10 |         return True',
    ));
});

// THE FIX BYTE-LOCK: the rewound m6_derived.py shows revision 1 = the 7-line `# derived version` seed
// recovered from the backup, then a 10-line transform() final ending at return self.name.upper() —
// and NO duplicated `return self.name` (the pre-fix bug).
test("test_m6_rewound_branch_verbose_transform_no_duplicate", () => {
    const out = runCli([M6_JSONL, "--branch", "9b69e66c", "--verbose"]);
    // revision 1 — the 7-line backup-recovered seed with `# derived version`.
    assert.ok(out.includes(
        '(7 lines)\n     1 | class Base:\n     2 |     def __init__(self):\n     3 | # derived version\n     4 |         self.name = "base"\n     5 | \n     6 |     def describe(self):\n     7 |         return self.name',
    ));
    // the 10-line transform() final revision.
    assert.ok(out.includes(
        '(10 lines)\n     1 | class Base:\n     2 |     def __init__(self):\n     3 | # derived version\n     4 |         self.name = "base"\n     5 | \n     6 |     def describe(self):\n     7 |         return self.name\n     8 | \n     9 |     def transform(self):\n    10 |         return self.name.upper()',
    ));
    // NO duplicated `return self.name` (the pre-fix bug, where the comment was missing and the
    // splice landed past the bare 6-line copy).
    assert.ok(!out.includes("     6 |         return self.name\n     7 |         return self.name"));
});
