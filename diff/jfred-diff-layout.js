// JFReD Diff: Resize handles and layout management.

function setupVerticalResize(handleId, leftSel, rightSel) {
  var handle = document.getElementById(handleId);
  if (!handle) { return; }
  var left = typeof leftSel === 'string' ? document.querySelector(leftSel) : leftSel;
  var right = typeof rightSel === 'string' ? document.querySelector(rightSel) : rightSel;
  if (!left || !right) { return; }
  var dragging = false;
  var startX = 0;
  var startLeftW = 0;

  handle.addEventListener('mousedown', function(e) {
    dragging = true;
    startX = e.clientX;
    startLeftW = left.offsetWidth;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) { return; }
    var dx = e.clientX - startX;
    var newW = Math.max(80, startLeftW + dx);
    left.style.flex = '0 0 ' + newW + 'px';
  });
  document.addEventListener('mouseup', function() { dragging = false; });
}

function setupHorizontalResize(handleId, topSel, bottomSel) {
  var handle = document.getElementById(handleId);
  if (!handle) { return; }
  var top = typeof topSel === 'string' ? document.querySelector(topSel) : topSel;
  var bottom = typeof bottomSel === 'string' ? document.querySelector(bottomSel) : bottomSel;
  if (!top || !bottom) { return; }
  var dragging = false;
  var startY = 0;
  var startTopH = 0;
  var startBotH = 0;

  handle.addEventListener('mousedown', function(e) {
    dragging = true;
    startY = e.clientY;
    startTopH = top.offsetHeight;
    startBotH = bottom.offsetHeight;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) { return; }
    var dy = e.clientY - startY;
    var total = startTopH + startBotH;
    var newTop = Math.max(60, Math.min(total - 60, startTopH + dy));
    var ratio = newTop / total;
    top.style.flex = ratio.toFixed(4);
    bottom.style.flex = (1 - ratio).toFixed(4);
  });
  document.addEventListener('mouseup', function() { dragging = false; });
}

export function initLayout() {
  // Top/bottom split
  setupHorizontalResize('rh-top-bot', '.diff-top-half', '.diff-bottom-half');
  // Left column: file tree / alllines split
  setupHorizontalResize('rh-left-col', '#file-tree-pane', '#alllines-pane');
  // Vertical: left col / mid col
  setupVerticalResize('rv-left-mid', '.diff-left-col', '.diff-mid-col');
  // Vertical: mid col / right col
  setupVerticalResize('rv-mid-right', '.diff-mid-col', '.diff-right-col');
}

initLayout();
