// Tests for the hash-route predicates in webapp/app.js. Segments arrive exactly as
// parseRouteSegments produces them: decoded, empty segments dropped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRouteIsTimeline } from "../webapp/app.js";

test("test_check_route_is_timeline_accepts_timeline_routes", () => {
    // Scenario: the timeline view route (#/project/<name>/timeline) and its
    // session-anchored variant (#/project/<name>/timeline/session/<id>) are timeline routes.
    assert.equal(checkRouteIsTimeline(["project", "s84", "timeline"]), true);
    assert.equal(checkRouteIsTimeline(["project", "s84", "timeline", "session", "abc"]), true);
});

test("test_check_route_is_timeline_rejects_non_timeline_routes", () => {
    // Scenario: the projects list, the project landing page, the conversation view, and the
    // file-history view must NOT get the overlay-inspector styling.
    assert.equal(checkRouteIsTimeline([]), false);
    assert.equal(checkRouteIsTimeline(["project", "s84"]), false);
    assert.equal(checkRouteIsTimeline(["project", "s84", "jsonl", "a.jsonl"]), false);
    assert.equal(checkRouteIsTimeline(["project", "s84", "file", "x.ts"]), false);
});
