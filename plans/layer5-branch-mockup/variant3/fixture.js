// Conv-only-rewind twin (s20) of variant2/fixture.js's code-rewind case (s19).

export const BUBBLE = {
  file: "src/worker.ts",
  rewindKind: "conversation",
  lanes: [
    {
      session: "s20.jsonl",
      nodes: [
        { t: 10, kind: "user", label: "create worker" },
        { t: 70, kind: "snap", label: "final cleanup" },
      ],
    },
    {
      session: "s20b.jsonl",
      isOrphaned: true,
      forkFrom: { t: 25 },
      rejoinAt: 55,
      nodes: [
        { t: 25, kind: "user", label: "try alt backoff" },
        { t: 45, kind: "snap", label: "tune backoff" },
      ],
    },
  ],
};
