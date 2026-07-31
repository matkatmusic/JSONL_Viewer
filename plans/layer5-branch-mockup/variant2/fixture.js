// Decided L5 design, code-rewind case (s19). variant3/fixture.js has its conv-only twin (s20).

export const BUBBLE = {
  file: "src/worker.ts",
  rewindKind: "code",
  lanes: [
    {
      session: "s19.jsonl",
      nodes: [
        { t: 10, kind: "user", label: "create worker" },
        { t: 70, kind: "snap", label: "final cleanup" },
      ],
    },
    {
      session: "s19b.jsonl",
      isOrphaned: true,
      forkFrom: { t: 25 },
      nodes: [
        { t: 25, kind: "user", label: "try alt backoff" },
        { t: 45, kind: "snap", label: "tune backoff", abandonedTip: true },
      ],
    },
  ],
};
