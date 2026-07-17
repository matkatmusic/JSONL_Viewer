// LCS line diff engine and compare selection state.
function computeLineDiff(a, b) {
  var CAP = 2500;
  if (a.length > CAP || b.length > CAP) {
    showToast('Diff truncated to ' + CAP + ' lines per side', 2500);
    if (a.length > CAP) a = a.slice(0, CAP);
    if (b.length > CAP) b = b.slice(0, CAP);
  }
  var n = a.length, m = b.length;
  var dp = new Array(n + 1);
  for (var i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
  for (var i = n - 1; i >= 0; i--) {
    for (var j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  var ops = [], x = 0, y = 0;
  while (x < n && y < m) {
    if (a[x] === b[y]) { ops.push({ op: 'ctx', text: a[x] }); x++; y++; }
    else if (dp[x + 1][y] >= dp[x][y + 1]) { ops.push({ op: 'del', text: a[x] }); x++; }
    else { ops.push({ op: 'add', text: b[y] }); y++; }
  }
  while (x < n) { ops.push({ op: 'del', text: a[x] }); x++; }
  while (y < m) { ops.push({ op: 'add', text: b[y] }); y++; }
  return ops;
}

function diffLinesFor(uuid) {
  var raw = JSONL_RAW[uuid];
  try { return JSON.stringify(JSON.parse(raw), null, 4).split('\n'); }
  catch (e) { return (raw || '').split('\n'); }
}

function renderInlineDiff(ops) {
  var h = '<div class="diff-view"><div class="diff-hunk">';
  for (var i = 0; i < ops.length; i++) {
    var o = ops[i];
    var cls = o.op === 'add' ? 'diff-add' : o.op === 'del' ? 'diff-del' : 'diff-ctx';
    var pfx = o.op === 'add' ? '+' : o.op === 'del' ? '-' : ' ';
    h += '<div class="diff-line ' + cls + '"><span class="diff-text">' + escapeHtml(pfx + o.text) + '</span></div>';
  }
  return h + '</div></div>';
}

function renderSxsDiff(ops) {
  var h = '<div class="diff-view"><div class="diff-sxs">', i = 0;
  while (i < ops.length) {
    if (ops[i].op === 'ctx') {
      h += '<div class="diff-sxs-row ctx-row"><div class="diff-cell ctx">' + escapeHtml(' ' + ops[i].text) + '</div></div>';
      i++;
    } else {
      var dels = [], adds = [];
      while (i < ops.length && ops[i].op === 'del') { dels.push(ops[i].text); i++; }
      while (i < ops.length && ops[i].op === 'add') { adds.push(ops[i].text); i++; }
      var rows = Math.max(dels.length, adds.length);
      for (var r = 0; r < rows; r++) {
        var left = r < dels.length ? '<div class="diff-cell del">' + escapeHtml('-' + dels[r]) + '</div>' : '<div class="diff-cell empty"></div>';
        var right = r < adds.length ? '<div class="diff-cell add">' + escapeHtml('+' + adds[r]) + '</div>' : '<div class="diff-cell empty"></div>';
        h += '<div class="diff-sxs-row">' + left + right + '</div>';
      }
    }
  }
  return h + '</div></div>';
}

function showDiff(uuidA, uuidB) {
  var ops = computeLineDiff(diffLinesFor(uuidA), diffLinesFor(uuidB));
  document.getElementById('inspect-content').innerHTML =
    diffMode === 'inline' ? renderInlineDiff(ops) : renderSxsDiff(ops);
  document.getElementById('inspect-title').textContent = 'Diff: ' + uuidA.slice(0,8) + ' ↔ ' + uuidB.slice(0,8);
  document.getElementById('inspect-pos').style.display = 'none';
  document.getElementById('inspect-prev').style.display = 'none';
  document.getElementById('inspect-next').style.display = 'none';
  document.getElementById('diff-controls').classList.add('show');
  document.getElementById('diff-mode-sxs').classList.toggle('active', diffMode === 'sxs');
  document.getElementById('diff-mode-inline').classList.toggle('active', diffMode === 'inline');
  var panel = document.getElementById('inspect-panel');
  if (!panel.classList.contains('show')) {
    panel.classList.add('show');
    document.getElementById('tree').style.paddingBottom = '38vh';
  }
}

function applyTypeGate() {
  var boxes = document.querySelectorAll('.cmp-chk');
  for (var i = 0; i < boxes.length; i++) {
    var node = boxes[i].closest('.node');
    var off = cmpType && nodeTypeOf(node) !== cmpType;
    boxes[i].disabled = !!off;
    if (node) node.classList.toggle('cmp-disabled', !!off);
  }
}

function clearTypeGate() {
  var boxes = document.querySelectorAll('.cmp-chk');
  for (var i = 0; i < boxes.length; i++) {
    boxes[i].disabled = false;
    var node = boxes[i].closest('.node');
    if (node) node.classList.remove('cmp-disabled');
  }
}

function revealMatching() {
  var boxes = document.querySelectorAll('.cmp-chk');
  for (var i = 0; i < boxes.length; i++) {
    if (nodeTypeOf(boxes[i].closest('.node')) === cmpType) revealNode(boxes[i].getAttribute('data-uuid'));
  }
}

function resetCompare() {
  cmpSel = []; cmpType = null;
  var boxes = document.querySelectorAll('.cmp-chk');
  for (var i = 0; i < boxes.length; i++) {
    boxes[i].checked = false;
    boxes[i].disabled = false;
    var node = boxes[i].closest('.node');
    if (node) node.classList.remove('cmp-disabled');
  }
}

function closeInspectPanel() {
  document.getElementById('inspect-panel').classList.remove('show');
  document.getElementById('tree').style.paddingBottom = '';
  document.getElementById('diff-controls').classList.remove('show');
  var prev = document.querySelector('.node.inspected');
  if (prev) prev.classList.remove('inspected');
}
