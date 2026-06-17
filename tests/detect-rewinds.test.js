#!/usr/bin/env node
// Tests for detect-rewinds.js algorithm against known test scenarios.
// Each scenario has a JSONL file with scripted rewinds and known classifications.
//
// Usage: node detect-rewinds.test.js

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var SCRIPT = path.join(__dirname, '../tools/detect-rewinds.js');

var tests = [
    {
        name: 'Scenario 8 (d415450b) — A→B→C→D(rewind B, code)→C1→D1(rewind A, code)→B2→C2→D1(rewind A, no code)→E',
        file: '/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/d415450b-34f7-4204-a335-4cacfedf1caf.jsonl',
        expected: [
            { rewind: 1, classification: 'code-restoration' },
            { rewind: 2, classification: 'code-restoration' },
            { rewind: 3, classification: 'conversation-only' }
        ]
    },
    {
        name: 'Scenario 6 (4dcf9bd0) — rewind 1 WITH code restore, rewind 2 conversation-only',
        file: '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/4dcf9bd0-523d-4669-a4be-a4dc2ca74302.jsonl',
        expected: [
            { rewind: 1, classification: 'code-restoration' },
            { rewind: 2, classification: 'conversation-only' }
        ]
    },
    {
        name: 'Scenario 7 (bb4623f2) — single rewind WITH code restore',
        file: '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/bb4623f2-26f5-4995-937d-83f83b55402f.jsonl',
        expected: [
            { rewind: 1, classification: 'code-restoration' }
        ]
    },
    {
        name: 'Scenario 3 (b73b9e80) — single rewind conversation-only',
        file: '/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/b73b9e80-e29c-42f2-968a-878899534e70.jsonl',
        expected: [
            { rewind: 1, classification: 'conversation-only' }
        ]
    },
    {
        name: 'Scenario 4 (7a04b3d1) — single rewind WITH code restore',
        file: '/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/7a04b3d1-890b-4aff-b38d-355bf75d5617.jsonl',
        expected: [
            { rewind: 1, classification: 'code-restoration' }
        ]
    },
    {
        name: 'Scenario 5 (f3ab1ad4) — rewind 1 conversation-only, rewind 2 code-restoration',
        file: '/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/f3ab1ad4-b858-4661-a999-3edb91e47114.jsonl',
        expected: [
            { rewind: 1, classification: 'conversation-only' },
            { rewind: 2, classification: 'code-restoration' }
        ]
    },
    {
        name: 'Scenario 9 (dfe3d05f) — code-restoration, no post-rewind file edits',
        file: '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/dfe3d05f-653c-4b3c-a361-d2639923258d.jsonl',
        expected: [
            { rewind: 1, classification: 'code-restoration' }
        ]
    },
    {
        name: 'Scenario 10 (6efe5d6d) — conversation-only, no post-rewind file edits',
        file: '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/6efe5d6d-d530-4218-943e-6e94f2a00279.jsonl',
        expected: [
            { rewind: 1, classification: 'conversation-only' }
        ]
    },
    {
        name: 'Scenario 11 (99a40d06) — write, conv step, rewind WITH code restore, re-write',
        file: '/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/99a40d06-730d-48dc-9562-c292ce6ad8cd.jsonl',
        expected: [
            { rewind: 1, classification: 'code-restoration' }
        ]
    },
    {
        name: 'Scenario 12 (fefe9dc2) — write, conv step, rewind conversation-only, re-write',
        file: '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/fefe9dc2-3505-46bd-a368-03a5b27489a5.jsonl',
        expected: [
            { rewind: 1, classification: 'conversation-only' }
        ]
    },
    {
        name: 'Scenario 13 (f3d26066) — multi-edit, rewind WITH code restore, read-only after',
        file: '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/f3d26066-7148-47cc-b3c5-b4d9654f7e8c.jsonl',
        expected: [
            { rewind: 1, classification: 'code-restoration' }
        ]
    },
    {
        name: 'Scenario 14 (269cdfdf) — multi-edit, rewind conversation-only, read-only after',
        file: '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/269cdfdf-2023-489b-a355-41ffac52ba56.jsonl',
        expected: [
            { rewind: 1, classification: 'conversation-only' }
        ]
    },
    {
        name: 'Scenario 15 (4209e1a1) — user edit outside Claude, conversation-only rewind',
        file: '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/4209e1a1-9aca-4475-9ead-89e191aa570f.jsonl',
        expected: [
            { rewind: 1, classification: 'conversation-only' }
        ]
    },
    {
        name: 'Scenario 16 (57d47184) — multi-edit, code-restore, re-edit after',
        file: '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/57d47184-6f32-4e7c-971a-c3b8e47ccf44.jsonl',
        expected: [
            { rewind: 1, classification: 'code-restoration' }
        ]
    },
    {
        name: 'Scenario 17 (2fe81cc0) — multi-edit, conv-only, re-edit after',
        file: '/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/2fe81cc0-1cd9-440d-8830-406410e12a81.jsonl',
        expected: [
            { rewind: 1, classification: 'conversation-only' }
        ]
    }
];

var passed = 0;
var failed = 0;
var skipped = 0;

for (var t = 0; t < tests.length; t++) {
    var test = tests[t];
    if (!fs.existsSync(test.file)) {
        console.log('SKIP: ' + test.name + ' — file not found');
        skipped++;
        continue;
    }

    var result = child_process.execSync('node "' + SCRIPT + '" "' + test.file + '"', { encoding: 'utf8' });

    // Parse classifications from output
    var classifications = [];
    var lines = result.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/Classification:\s*(\S+)/);
        if (m) classifications.push(m[1]);
    }

    // Parse rewind count
    var countMatch = result.match(/Total rewinds detected:\s*(\d+)/);
    var detectedCount = countMatch ? parseInt(countMatch[1]) : 0;

    var testPassed = true;

    // Check rewind count
    if (!test.skipCountCheck && detectedCount !== test.expected.length) {
        console.log('FAIL: ' + test.name);
        console.log('  Expected ' + test.expected.length + ' rewinds, detected ' + detectedCount);
        testPassed = false;
    }

    // Check each classification
    for (var e = 0; e < test.expected.length; e++) {
        var exp = test.expected[e];
        var got = classifications[e] || '(missing)';
        if (got !== exp.classification) {
            if (testPassed) console.log('FAIL: ' + test.name);
            console.log('  Rewind ' + exp.rewind + ': expected ' + exp.classification + ', got ' + got);
            testPassed = false;
        }
    }

    if (testPassed) {
        console.log('PASS: ' + test.name + ' (' + detectedCount + ' rewinds)');
        passed++;
    } else {
        failed++;
    }
}

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped');
process.exit(failed > 0 ? 1 : 0);
