import { runCli } from "./src/reconstruction_cli.ts";
import { readFileSync } from "node:fs";

// Section A: re-run trace on listed occurrences, confirm engine emits a genuine file-op verdict.
const A: Record<string, [string, number][]> = {
  "edit-result|user|text": [["/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/b5c8a619-0f19-4c55-ab98-ef5251ca9284.jsonl", 247]],
  "edit|assistant|text": [["/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/9fd48ef3-2bf4-4536-b88c-673cde50afd7.jsonl", 372]],
  "write|assistant|text": [["/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/294e0115-5544-4846-986b-dca3ff1c22d2.jsonl", 666]],
};
const ROW = /^(\d+):\s+(\S+).*?\btype=(\S+)\s+kind=(\S+)/;
for (const [triple, rows] of Object.entries(A)) {
  for (const [f, ln] of rows) {
    const out = runCli([f, "--trace", "--details"]);
    const line = out.split("\n").find((l) => l.startsWith(ln + ":"));
    const m = line && ROW.exec(line);
    const got = m ? `${m[2]}|${m[3]}|${m[4]}` : "(no trace row)";
    console.log(`A ${triple}: lineno ${ln} -> ${got}  ${got === triple ? "MATCH (engine captured op)" : "DIFF"}`);
  }
}

// Section B: parse report table, hunt for a real source-file mutation behind an ignored variant.
const md = readFileSync("./uncovered-real-jsonl-lines.md", "utf8");
const byKind: Record<string, number> = {};
const realMut: string[] = [];
const MUT = /\b(mv|cp|rm|git\s+mv|rename|shutil\.(move|copy)|os\.(rename|replace|remove))\b/;
const READONLY = /^\s*(ls|grep|cat|head|tail|find|wc|echo)\b/;
for (const r of md.split("\n").filter((l: string) => l.startsWith("| /Users"))) {
  const parts = r.split(" | ");
  const kind = parts[1].trim();
  if (parts[2].trim() !== "true") continue;
  const snip = parts.slice(3).join(" | ").replace(/\|$/, "").trim();
  byKind[kind] = (byKind[kind] || 0) + 1;
  const isBash = /bash/i.test(kind) && !/ctx_search/.test(kind);
  if (isBash && MUT.test(snip) && !READONLY.test(snip) && !/\.claude\//.test(snip)) realMut.push(`${kind}: ${snip}`);
}
console.log("\nSection B fileop=true rows by kind:", JSON.stringify(byKind));
console.log("Real source-file mutations hiding as an ignored bash variant:", realMut.length);
for (const m of realMut) console.log("  !!", m);
