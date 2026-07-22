// tests/probe_166_fixtures.ts — synthetic EditEvent builder shared by the
// probe_166_* test files (layered per coding-requirements: fixtures hold data).
import { Path, Uuid } from "../jfred/src/structures/domain.ts";
import type { EditEvent } from "../tools/probe_166_scan.ts";

export function buildProbeEditEvent(overrides: Partial<EditEvent>): EditEvent {
    const defaults: EditEvent = {
        rootLabel: "live",
        projectFolder: "-Users-matkatmusicllc-Programming-jot",
        sessionId: new Uuid("session-1"),
        recordUuid: new Uuid("record-1"),
        timestamp: new Date("2026-01-01T00:00:00Z"),
        absPath: new Path("/Users/matkatmusicllc/Programming/jot/skills/jot/SKILL.md"),
        jotRoot: "jot",
        relPath: "skills/jot/SKILL.md",
        tool: "Edit",
        contentHash: "hash-a",
    };
    return { ...defaults, ...overrides };
}
