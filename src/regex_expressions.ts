// Every regular expression used across the reconstruction engine and its tests, named once here so call
// sites read as `text.match(bashCopyCommand)` rather than carrying an opaque pattern inline. Each comment
// describes, in plain English, what the pattern matches and gives a worked example. The one canonical home
// for these patterns — callers import the named constant directly (no inline regex literals elsewhere).
//
// `g`-flag note: the global constants below are only ever used with `.match()` / `.replace()`, which reset
// `lastIndex` on every call, so sharing a single module-level object is safe. Do NOT use a `g` constant with
// `.test()` / `.exec()` in a loop — that advances `lastIndex` and the shared state would leak between callers.

// A token that is ALL digits from start (`^`) to end (`$`), i.e. a bare line number like "12".
export const numbersOnly = /^\d+$/;

// `rm <paths>`: `rm`, then spaces, then group 1 = the rest of the line (one or more paths, split later).
// e.g. "rm a.py b.py" -> group 1 = "a.py b.py".
export const bashRemoveCommand = /^rm\s+(.+)$/;

// `mv <src> <dst>` or `git mv <src> <dst>`: optional `git ` prefix, then `mv`, then two space-separated
// non-space words. group 1 = source, group 2 = destination. e.g. "git mv old.py new.py" -> "old.py","new.py".
export const bashMoveCommand = /^(?:git\s+)?mv\s+(\S+)\s+(\S+)$/;

// `cp <src> <dst>`: `cp`, then two space-separated non-space words. group 1 = source, group 2 = destination.
// e.g. "cp a.py b.py" -> "a.py","b.py".
export const bashCopyCommand = /^cp\s+(\S+)\s+(\S+)$/;

// A run of one or more whitespace characters, used to split a command tail into separate words.
export const whitespaceRun = /\s+/;

// A `>> <file>` append redirect at the END of a command: `>>`, optional spaces, group 1 = the filename,
// optional trailing spaces. e.g. "echo hi >> log.txt" -> group 1 = "log.txt".
export const bashAppendRedirect = />>\s*(\S+)\s*$/;

// A single `> <file>` overwrite redirect at the END of a command. group 1 = the filename. Two guards reject
// look-alikes: `(?<!>)` skips `>>` (append), `(?!&)` skips `>&2` (a file-descriptor dup, not a file).
// e.g. "echo hi > out.txt" -> group 1 = "out.txt".
export const bashOverwriteRedirect = /(?<!>)>\s*(?!&)(\S+)\s*$/;

// The literal `toolu_` only when it sits at the very start of an id; replacing it with "" drops that leading
// prefix. e.g. "toolu_01ABCD..." -> "01ABCD...".
export const toolUseIdPrefix = /^toolu_/;

// A single whitespace character; splitting on it and taking [0] keeps the first word of a string.
export const singleWhitespace = /\s/;

// Every double-quoted string that looks like a filename: an opening `"`, one-or-more non-quote chars, a
// literal dot, a 1-to-4-letter extension, a closing `"`. The `g` flag finds ALL of them, not just the first.
// e.g. matches `"billing.py"` and `"renames.csv"`. (Quotes are sliced off by the caller.)
export const quotedFilename = /"([^"]+\.[a-z]{1,4})"/g;

// Every run of whitespace (spaces, tabs, newlines); the `g` flag makes a replace hit all runs, not just the
// first, so collapsing to a single space flattens the whole string.
export const whitespaceRuns = /\s+/g;

// A leading line-number prefix: one-or-more digits at the start of the line followed by a TAB. Replacing it
// with "" strips the "3\t" off "3\tdef hello()".
export const lineNumberPrefix = /^\d+\t/;

// A numbered snippet line: group 1 = the leading digits (the line number), then a TAB, then group 2 = the
// rest of the line (the text). e.g. "12\tdef hello()" -> "12","def hello()". A bare `...` line has no
// number+tab, so it won't match.
export const numberedLine = /^(\d+)\t(.*)$/;

// One markdown ledger row shaped like `| s19 | PASS | 4/4 | 2026-06-25T20:41:00.000Z |`. Left to right:
// leading `|`, scenario id (group 1 = "s" + digits), `|`, status cell (ignored), `|`, count cell (ignored),
// `|`, last cell (group 2 = the timestamp or the word "never"), trailing `|`. Each `\s*` is cell padding.
export const ledgerRow = /^\|\s*(s\d+)\s*\|[^|]*\|[^|]*\|\s*(.+?)\s*\|$/;

// The literal text "branch rewound"; the `g` flag makes `.match` return EVERY occurrence, so `.length`
// counts how many branch-rewound wrappers a render contains.
export const branchRewoundHeader = /branch rewound/g;

// The literal word "rewound"; `g` so `.match(...).length` counts every mention in a render.
export const rewoundMention = /rewound/g;

// A "cut here but keep the marker" boundary: splits a diff right BEFORE every "@@ " hunk header without
// deleting it, so each resulting block still begins with its own "@@ …" header line.
export const beforeDiffHunkHeader = /(?=@@ )/;
