import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S32_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files so a per-file assertion never matches a
// sibling file's revision line. (Verbatim from the S28/S29/S30/S31 CLI tests.)
function fileVerboseBlock(out: string, suffix: string): string {
    const lines = out.split("\n");
    const start = lines.findIndex((line) => line.startsWith("### ") && line.endsWith(suffix));
    assert.ok(start >= 0, `no verbose section for ${suffix}`);
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
        if (lines[index]!.startsWith("### ")) { end = index; break; }
    }
    return lines.slice(start, end).join("\n");
}

// Slice the LAST revision out of a file's verbose block (from its last `revision N  @` line to the block
// end). Needed because config_utils.py's EARLIER revisions (write / get_or_default build-up, all PRE-rename)
// legitimately carry the OLD names (`get_val`, `set_val`, `del_val`) — only the FINAL renamed revision must
// be free of their whole-word forms.
function finalRevisionSlice(block: string): string {
    const marker = "\nrevision ";
    const index = block.lastIndexOf(marker);
    return index >= 0 ? block.slice(index + 1) : block;
}

// The three `old → new` renames the one MCP `ctx_execute` (`python3 rename_config.py`) run applied — the lock
// for C6 (the script's RENAMES mapping rows).
const RENAMES: ReadonlyArray<readonly [string, string]> = [
    ["get_val", "get_value"], ["set_val", "set_value"], ["del_val", "delete_value"],
];

// C1 — the default view prints BOTH DAGs. The conversationDAG renders the single prompt then the file-touching
// turns, including the TWO `edited_text_file` beacons (one per script-rewritten file) as user-edit turns. The
// rename script ran through the MCP sandbox, so its run leaves NO file event — only the beacons surface it.
// The run is linear (no rewind/branch header). Locks the conversationDAG + fileDAG shape.
test("test_S32_default_conversationDAG_and_fileDAG", () => {
    const out = runCli([S32_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("A  prompt  #492eb763"));
    assert.ok(out.includes("user-edit  config_utils.py"));
    assert.ok(out.includes("#d9cbc214"));
    assert.ok(out.includes("user-edit  test_config_utils.py"));
    assert.ok(out.includes("#c7922fde"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// C2 — one surviving branch, tip #1be0133f, covering all three files; no rewound branch.
test("test_S32_list_branches_single_surviving_three_files", () => {
    const out = runCli([S32_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #1be0133f"));
    for (const basename of ["config_utils.py", "test_config_utils.py", "rename_config.py"]) {
        assert.ok(out.includes(basename), `missing ${basename}`);
    }
    assert.ok(!out.includes("rewound"));
});

// C3 — `--graphFile` node ladders. Each contiguous file block ends at the next file's name, so these
// assertions lock EXACTLY the node count per file: config_utils.py 8 (write / 3 edits / user-edit beacon / 3
// edits), test_config_utils.py 2 (write / user-edit beacon), rename_config.py 1 (write). Any spurious node
// (e.g. a synthetic overwrite leaking in as a DAG node) would break the `\n<next-file>` boundary.
test("test_S32_graphFile_node_ladders", () => {
    const out = runCli([S32_JSONL, "--graphFile"]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "config_utils.py\n" +
        "  B  write      #01YcQf8C\n" +
        "  D  edit       #01HWB6q1\n" +
        "  E  edit       #014dRP5X\n" +
        "  G  user-edit  #d9cbc214\n" +
        "  I  edit       #01KmqU8P\n" +
        "  J  edit       #012jbHaD\n" +
        "  K  edit       #01TFrrPf\n" +
        "  L  edit       #01UJCCZy\n" +
        "test_config_utils.py",
    ));
    assert.ok(out.includes(
        "test_config_utils.py\n" +
        "  C  write      #01NUow5n\n" +
        "  H  user-edit  #c7922fde\n" +
        "rename_config.py",
    ));
    assert.ok(out.includes("rename_config.py\n  F  write      #01PaKUZi"));
});

// C4 — verbose config_utils.py. Completed to an 11-revision history (0..10, no revision 11). The FINAL revision
// (260 lines) carries the renamed `def get_value(` / `def set_value(` / `def delete_value(` and the post-script
// `def apply_overrides(`, and has NO whole-word OLD name (`\bget_val\b`/`\bset_val\b`/`\bdel_val\b`) — those
// live only in the earlier pre-rename revisions, so the check is scoped to the final revision slice
// (`get_value` must not trip the `\bget_val\b` absence check).
test("test_S32_verbose_config_final_revision_renamed", () => {
    const block = fileVerboseBlock(runCli([S32_JSONL, "--verbose"]), "/config_utils.py");
    assert.ok(block.includes("revision 10  @"));
    assert.ok(!block.includes("revision 11  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(260 lines)"));
    assert.ok(finalRevision.includes("def get_value("));
    assert.ok(finalRevision.includes("def set_value("));
    assert.ok(finalRevision.includes("def delete_value("));
    assert.ok(finalRevision.includes("def apply_overrides("));
    assert.ok(!/\bget_val\b/.test(finalRevision));
    assert.ok(!/\bset_val\b/.test(finalRevision));
    assert.ok(!/\bdel_val\b/.test(finalRevision));
});

// C5 — verbose test_config_utils.py. Completed to a 2-revision history (0..1, no revision 2). The FINAL
// revision (87 lines) imports the NEW names: `from config_utils import get_value, set_value` (revision 0 still
// shows the old `get_val, set_val` import, hence the final-revision scoping). The kept whole-word-safe def
// names `test_get_val_flat_key` / `test_set_val_overwrites_existing` survive (whole-word rename, not substring).
test("test_S32_verbose_test_file_renamed_import_kept_names", () => {
    const block = fileVerboseBlock(runCli([S32_JSONL, "--verbose"]), "/tests/test_config_utils.py");
    assert.ok(block.includes("revision 1  @"));
    assert.ok(!block.includes("revision 2  @"));
    const finalRevision = finalRevisionSlice(block);
    assert.ok(finalRevision.includes("(87 lines)"));
    assert.ok(finalRevision.includes("from config_utils import get_value, set_value"));
    assert.ok(finalRevision.includes("def test_get_val_flat_key("));
    assert.ok(finalRevision.includes("def test_set_val_overwrites_existing("));
});

// C6 — verbose rename_config.py. Single write (62 lines, revision 0 only). It records the three `old: new`
// RENAMES mapping rows verbatim and the whole-word `re.sub(rf"\b{re.escape(old)}\b", new, text)` substitution —
// the full instruction set the one MCP `ctx_execute` run consumed.
test("test_S32_verbose_rename_config_records_three_mappings", () => {
    const block = fileVerboseBlock(runCli([S32_JSONL, "--verbose"]), "/rename_config.py");
    assert.ok(block.includes("revision 0  @"));
    assert.ok(!block.includes("revision 1  @"));
    assert.ok(block.includes("(62 lines)"));
    for (const [oldName, newName] of RENAMES) {
        assert.ok(block.includes(`"${oldName}": "${newName}"`), `rename_config missing mapping ${oldName} -> ${newName}`);
    }
    assert.ok(block.includes(String.raw`re.sub(rf"\b{re.escape(old)}\b", new, text)`), "rename_config missing whole-word substitution");
});
