// Global state and pure helper functions for the JSONL tree viewer.
var INDENT_PX = 5;
var DISPLAYABLE_TYPES = { user: true, assistant: true, system: true };
var JSONL_RAW = {};
var JSONL_UUIDS = [];
var TOOL_ID_TO_UUIDS = {};
var FIELD_INDEX = {};
var inspectIndex = -1;
var SHOW_ALL = false;   // when true, every uuid'd entry is shown in the tree (incl. attachments/meta)
var LAST_TEXT = null;   // last-loaded transcript text, for re-render on toggle
var LAST_FILE = null;
var cmpSel = [];        // checked uuids, in click order (max 2)
var cmpType = null;     // locked role-* type while a selection is active
var diffMode = 'sxs';   // 'sxs' (side-by-side) | 'inline'
var activeFilter = null;
var activeFilterMatches = [];
var activeFilterPos = -1;

var PRESET_FIELDS = [
  'originalFile', 'structuredPatch', 'old_string', 'new_string',
  'oldString', 'newString', 'tool_use', 'tool_result', 'toolUseResult',
  'thinking', 'isSidechain'
];

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function summarizeContent(entry) {
  var c = entry.message && entry.message.content;
  if (!c) return entry.subtype || '(empty)';
  if (typeof c === 'string') return c.slice(0,100).replace(/\n/g,' ');
  for (var i = 0; i < c.length; i++) {
    var b = c[i];
    if (b.type === 'text' && b.text) return b.text.slice(0,100).replace(/\n/g,' ');
    if (b.type === 'tool_use') return 'tool_use:' + (b.name || '?');
    if (b.type === 'tool_result') return 'tool_result';
    if (b.type === 'thinking') return 'thinking';
  }
  return c.map(function(b){return b.type}).join(', ');
}

function isPlumbingNode(node) {
  if (node.entryType === 'assistant' && node.contentSummary.indexOf('tool_use:') === 0) return true;
  if (node.entryType === 'assistant' && node.contentSummary === 'thinking') return true;
  if (node.entryType === 'user' && node.contentSummary.indexOf('tool_result') === 0) return true;
  if (node.entryType === 'system') return true;
  return false;
}

function isAgentText(node) {
  return node.entryType === 'assistant' && !isPlumbingNode(node);
}
