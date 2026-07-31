// L5 mockup data from mvp-app-mockup.html lanes fixture (~236-267); `tie` marks a coincident instant.

export const BUBBLE = {
  file: "src/worker.ts",
  lanes: [
    {
      session: "a35.jsonl",
      nodes: [
        { t: 10, kind: "user", label: "create worker" },
        { t: 40, kind: "snap", label: "add retry", tie: true },
        { t: 70, kind: "user", label: "final cleanup" },
      ],
    },
    {
      session: "b575.jsonl",
      isOrphaned: true,
      forkFrom: { session: "a35.jsonl", t: 25 },
      nodes: [
        { t: 25, kind: "user", label: "try alt backoff" },
        { t: 40, kind: "snap", label: "tune backoff", abandonedTip: true, tie: true },
      ],
    },
    {
      session: "ww455.jsonl",
      nodes: [
        { t: 15, kind: "user", label: "unrelated fix" },
        { t: 55, kind: "user", label: "unrelated tweak" },
      ],
    },
  ],
};
