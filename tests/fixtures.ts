// Absolute paths to the executed scenario transcripts the tests read from. One
// `<scenario>_JSONL` constant per scenario; each test imports the scenario(s) it
// exercises. The scenario JSONLs live outside this worktree (see handoff), so
// these are absolute paths.
export const S1_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s1-delete-file/b3634dc4-a385-40b9-8e23-6695a4f7bb7e.jsonl";

export const S2_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s2-move-file/1e82511e-05a3-4712-9a95-206b24128694.jsonl";

export const S3_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s3-copy-file/ac6edd6f-cc4e-4423-87f9-468530849db5.jsonl";

export const S4_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s4-overwrite-file/58f8c26c-48d5-4e8f-953c-265005a6ee73.jsonl";
