// JFReD Diff: Hierarchical file tree from conversation edit paths.

function insertPath(root, fullPath, editCount) {
  var parts = fullPath.split('/').filter(Boolean);
  var node = root;
  for (var p = 0; p < parts.length - 1; p++) {
    if (!node.children[parts[p]]) {
      node.children[parts[p]] = { name: parts[p], children: {}, files: [] };
    }
    node = node.children[parts[p]];
  }
  var filename = parts[parts.length - 1] || fullPath;
  node.files.push({ name: filename, fullPath: fullPath, editCount: editCount });
}

export function buildFileTree(fileMap) {
  var root = { name: '', children: {}, files: [] };
  var paths = Object.keys(fileMap);
  for (var i = 0; i < paths.length; i++) {
    insertPath(root, paths[i], fileMap[paths[i]].length);
  }
  return root;
}

function collapseChains(node) {
  var dirNames = Object.keys(node.children);
  for (var i = 0; i < dirNames.length; i++) {
    var child = node.children[dirNames[i]];
    collapseChains(child);
    var childDirs = Object.keys(child.children);
    if (child.files.length === 0 && childDirs.length === 1) {
      var grandchild = child.children[childDirs[0]];
      grandchild.name = child.name + '/' + grandchild.name;
      node.children[dirNames[i]] = grandchild;
    }
  }
}

function countEdits(node) {
  var total = 0;
  for (var i = 0; i < node.files.length; i++) { total += node.files[i].editCount; }
  var dirs = Object.keys(node.children);
  for (var d = 0; d < dirs.length; d++) { total += countEdits(node.children[dirs[d]]); }
  return total;
}

function makeDirToggle(body, hdr) {
  return function() {
    var collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    hdr.querySelector('.tree-toggle').textContent = collapsed ? '▾' : '▸';
  };
}

function makeFileClick(path, onFileSelect) {
  return function() { onFileSelect(path); };
}

function renderDirNode(child, parent, depth, onFileSelect) {
  var totalEdits = countEdits(child);
  var dirEl = document.createElement('div');
  dirEl.className = 'tree-dir';

  var hdr = document.createElement('div');
  hdr.className = 'tree-dir-hdr';
  hdr.style.paddingLeft = (depth * 16 + 4) + 'px';
  hdr.innerHTML = '<span class="tree-toggle">▾</span> ' +
    '<span class="tree-dir-name">' + esc(child.name) + '/</span>' +
    '<span class="tree-count">' + totalEdits + '</span>';
  dirEl.appendChild(hdr);

  var body = document.createElement('div');
  body.className = 'tree-dir-body';
  renderNode(child, body, depth + 1, onFileSelect);
  dirEl.appendChild(body);

  hdr.addEventListener('click', makeDirToggle(body, hdr));
  parent.appendChild(dirEl);
}

function renderFileNode(file, parent, depth, onFileSelect) {
  var fileEl = document.createElement('div');
  fileEl.className = 'tree-file';
  fileEl.dataset.path = file.fullPath;
  fileEl.style.paddingLeft = (depth * 16 + 4) + 'px';
  fileEl.innerHTML = '<span class="tree-file-name">' + esc(file.name) + '</span>' +
    '<span class="tree-count">' + file.editCount + '</span>';
  fileEl.title = file.fullPath;
  fileEl.addEventListener('click', makeFileClick(file.fullPath, onFileSelect));
  parent.appendChild(fileEl);
}

function renderNode(node, parent, depth, onFileSelect) {
  var dirNames = Object.keys(node.children).sort();
  for (var i = 0; i < dirNames.length; i++) {
    renderDirNode(node.children[dirNames[i]], parent, depth, onFileSelect);
  }
  var files = node.files.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
  for (var f = 0; f < files.length; f++) {
    renderFileNode(files[f], parent, depth, onFileSelect);
  }
}

export function renderFileTree(fileMap, containerId, onFileSelect) {
  var root = buildFileTree(fileMap);
  collapseChains(root);
  var container = document.getElementById(containerId);
  if (!container) { return; }
  container.innerHTML = '';
  renderNode(root, container, 0, onFileSelect);
  requestAnimationFrame(function() { sizeTreePane(container); });
}

function sizeTreePane(treeBody) {
  var pane = treeBody.closest('.diff-file-tree');
  if (!pane) { return; }
  var col = pane.closest('.diff-left-col');
  if (!col) { return; }
  var rows = treeBody.querySelectorAll('.tree-file, .tree-dir-hdr');
  if (rows.length === 0) { return; }
  var rowHeight = rows[0].offsetHeight || 22;
  var header = pane.querySelector('.diff-pane-header');
  var headerHeight = header ? header.offsetHeight : 0;
  var contentHeight = rows.length * rowHeight + Math.floor(rowHeight * 0.5) + headerHeight;
  var colHeight = col.offsetHeight || window.innerHeight * 0.6;
  var maxHeight = Math.floor(colHeight * 0.5);
  pane.style.height = Math.min(contentHeight, maxHeight) + 'px';
}

export function highlightTreeFile(fullPath, containerId) {
  var container = document.getElementById(containerId);
  if (!container) { return; }
  var all = container.querySelectorAll('.tree-file');
  for (var i = 0; i < all.length; i++) {
    all[i].classList.toggle('tree-file-selected', all[i].dataset.path === fullPath);
  }
}
