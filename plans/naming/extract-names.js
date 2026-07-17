const fs = require('fs');
const { execSync } = require('child_process');

const files = execSync(
    'find . -name "*.js" -not -path "*/archive/*" -not -path "*/node_modules/*" -not -path "*/common/*"',
    { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

const CONTROL_FLOW = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'else', 'return',
    'throw', 'new', 'delete', 'typeof', 'void', 'do', 'with',
    'try', 'finally', 'class', 'super', 'this', 'import', 'export',
    'await', 'yield', 'break', 'continue', 'case', 'default',
    'debugger', 'instanceof', 'of', 'in', 'from', 'as', 'get', 'set',
    'constructor', 'static', 'extends', 'implements'
]);

const names = new Set();
const methodShorthandCandidates = new Set();

for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m;

        m = line.match(/\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
        if (m && m[1]) { names.add(m[1]); continue; }

        m = line.match(/^\s*(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?(?:function\b|\()/);
        if (m && m[1]) { names.add(m[1]); continue; }

        m = line.match(/^\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/);
        if (m && m[1] && !CONTROL_FLOW.has(m[1])) {
            if (!line.includes('.') || line.indexOf(m[1]) < line.indexOf('.')) {
                if (i > 0) {
                    const prev = lines[i - 1].trimEnd();
                    if (prev.endsWith('{') || prev.endsWith(',') || prev.endsWith('(')) {
                        methodShorthandCandidates.add(m[1]);
                    }
                }
            }
        }
    }
}

const methodOnly = [...methodShorthandCandidates].filter(n => !names.has(n)).sort();

const sorted = [...names].sort((a, b) => a.localeCompare(b));

const csvHeader = 'oldName,needsRename';
const csvRows = sorted.map(n => n + ',');
const csv = csvHeader + '\n' + csvRows.join('\n') + '\n';

fs.writeFileSync('plans/naming/function-names.csv', csv, 'utf8');

console.log('Functions from declarations/assignments: ' + sorted.length);
console.log('Method shorthand candidates (not already counted): ' + methodOnly.length);
if (methodOnly.length > 0) {
    console.log('Method shorthand names: ' + methodOnly.join(', '));
}
console.log('CSV written to plans/naming/function-names.csv');
