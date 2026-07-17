var fs = require('fs');
var path = require('path');
var { execSync } = require('child_process');

var csvPath = 'plans/naming/function-names.csv';
var lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
var header = 'oldName,newName,file,line,isExported,numReferences';
var outputRows = [];

var yRows = [];
for (var i = 1; i < lines.length; i++) {
    var parts = lines[i].split(',');
    if (parts[1] === 'Y') {
        yRows.push({ oldName: parts[0], newName: parts[2] });
    }
}

var inScopeFiles = execSync(
    'find . -name "*.js" -not -path "*/archive/*" -not -path "*/node_modules/*" -not -path "*/common/*"',
    { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

var htmlFiles = execSync(
    'find . -name "*.html" -not -path "*/archive/*" -not -path "*/node_modules/*" -not -path "*/common/*"',
    { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

var fileContents = {};
for (var f = 0; f < inScopeFiles.length; f++) {
    fileContents[inScopeFiles[f]] = fs.readFileSync(inScopeFiles[f], 'utf8');
}
for (var f = 0; f < htmlFiles.length; f++) {
    fileContents[htmlFiles[f]] = fs.readFileSync(htmlFiles[f], 'utf8');
}

function findDefinitions(oldName) {
    var defs = [];
    var declPattern = new RegExp('\\bfunction\\s+' + oldName + '\\s*\\(');
    var assignPattern = new RegExp('^\\s*(?:const|let|var)\\s+' + oldName + '\\s*=\\s*(?:async\\s+)?(?:function\\b|\\()');

    for (var f = 0; f < inScopeFiles.length; f++) {
        var file = inScopeFiles[f];
        var src = fileContents[file];
        var fileLines = src.split('\n');
        for (var li = 0; li < fileLines.length; li++) {
            if (declPattern.test(fileLines[li]) || assignPattern.test(fileLines[li])) {
                defs.push({ file: file, line: li + 1 });
            }
        }
    }
    return defs;
}

function isExported(file, oldName) {
    var src = fileContents[file];
    if (!src) { return false; }
    var exportObjPattern = new RegExp('module\\.exports\\s*=\\s*\\{[^}]*\\b' + oldName + '\\b', 's');
    if (exportObjPattern.test(src)) { return true; }
    var namedExportPattern = new RegExp('\\bexport\\s+(function|const|let|var)\\s+' + oldName + '\\b');
    if (namedExportPattern.test(src)) { return true; }
    var exportDefaultPattern = new RegExp('\\bexport\\s+default\\s+' + oldName + '\\b');
    if (exportDefaultPattern.test(src)) { return true; }
    var exportBracePattern = new RegExp('\\bexport\\s*\\{[^}]*\\b' + oldName + '\\b');
    if (exportBracePattern.test(src)) { return true; }
    return false;
}

function countReferences(oldName, scope, defFile) {
    var tokenPattern = new RegExp('\\b' + oldName + '\\b', 'g');
    var total = 0;

    if (scope === 'local') {
        var src = fileContents[defFile];
        if (src) {
            var matches = src.match(tokenPattern);
            total = matches ? matches.length : 0;
        }
    } else {
        for (var f = 0; f < inScopeFiles.length; f++) {
            var src = fileContents[inScopeFiles[f]];
            var matches = src.match(tokenPattern);
            if (matches) { total += matches.length; }
        }
        for (var f = 0; f < htmlFiles.length; f++) {
            var src = fileContents[htmlFiles[f]];
            var matches = src.match(tokenPattern);
            if (matches) { total += matches.length; }
        }
    }
    return total;
}

var totalDefs = 0;
var expandedCount = 0;

for (var r = 0; r < yRows.length; r++) {
    var row = yRows[r];
    var defs = findDefinitions(row.oldName);

    if (defs.length === 0) {
        console.log('WARNING: no definition found for ' + row.oldName);
        outputRows.push([row.oldName, row.newName, '?', '?', '?', '0'].join(','));
        continue;
    }

    if (defs.length === 1) {
        var d = defs[0];
        var exported = isExported(d.file, row.oldName);
        var scope = exported ? 'global' : 'local';
        var refs = countReferences(row.oldName, scope, d.file);
        outputRows.push([row.oldName, row.newName, d.file, d.line, exported ? 'Y' : 'N', refs].join(','));
        totalDefs++;
    } else {
        expandedCount++;
        for (var d = 0; d < defs.length; d++) {
            var def = defs[d];
            var exported = isExported(def.file, row.oldName);
            var scope = exported ? 'global' : 'local';
            var refs = countReferences(row.oldName, scope, def.file);
            outputRows.push([row.oldName, row.newName, def.file, def.line, exported ? 'Y' : 'N', refs].join(','));
            totalDefs++;
        }
    }
}

var enrichedCsv = header + '\n' + outputRows.join('\n') + '\n';
fs.writeFileSync('plans/naming/function-names-enriched.csv', enrichedCsv, 'utf8');

console.log('Enriched CSV written: plans/naming/function-names-enriched.csv');
console.log('Y names: ' + yRows.length);
console.log('Total rows (after expansion): ' + outputRows.length);
console.log('Names expanded to multi-file: ' + expandedCount);
console.log('Total definition sites: ' + totalDefs);
var warnings = outputRows.filter(function(r) { return r.includes(',?,'); });
console.log('Warnings (no def found): ' + warnings.length);
