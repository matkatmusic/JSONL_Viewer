// Tests for the hash-route predicates in webapp/app.js. Segments arrive exactly as
// parseRouteSegments produces them: decoded, empty segments dropped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRouteIsTimeline } from "../webapp/app.js";

test("test_check_route_is_timeline_accepts_every_project_route", () => {
    // Scenario: the timeline is ALWAYS a loaded project's base view (user decision 2026-07-06) —
    // every #/project/* route gets the overlay-inspector layout, jsonl and file sub-routes
    // included (they render as drawers over the timeline).
    assert.equal(checkRouteIsTimeline(["project", "s84", "timeline"]), true);
    assert.equal(checkRouteIsTimeline(["project", "s84", "timeline", "session", "abc"]), true);
    assert.equal(checkRouteIsTimeline(["project", "s84"]), true);
    assert.equal(checkRouteIsTimeline(["project", "s84", "jsonl", "a.jsonl"]), true);
    assert.equal(checkRouteIsTimeline(["project", "s84", "file", "x.ts"]), true);
});

test("test_check_route_is_timeline_rejects_non_project_routes", () => {
    // Scenario: the projects list and unknown routes carry no timeline underneath.
    assert.equal(checkRouteIsTimeline([]), false);
    assert.equal(checkRouteIsTimeline(["bogus"]), false);
});
