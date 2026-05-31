import { CMEditor, guessLang, getLangLabel } from './editor.js';

// ─── Backend base ────────────────────────────────────────────────────
// GitHub Pages is static-only. Set to empty string or your backend URL if self-hosted.
const BACKEND = ''; // 'http://localhost:8000' or 'https://your-backend.onrender.com'

// ─── State ───────────────────────────────────────────────────────────
const state = {
  tabs: [],        // { id, name, lang, content, dirty, handle }
  activeId: null,
  dirHandle: null,
  explorer: [],
  problems: [],
  searchResults: [],
  wordWrap: false,
  eol: 'CRLF',     // CRLF | LF | CR
  showWhitespace: false,
  tabSize: 4,
  useTabs: false,
};

let editor = null;
let formatterWorker = null;
let lintWorker = null;
let lintTimer = null;
let nextId = 1;

// ─── DOM refs ────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const tabbar = $('#tabbar');
const editorContainer = $('#editor-container');
const statusPos = $('#status-pos');
const statusSel = $('#status-sel');
const statusLang = $('#status-lang');
const statusMsg = $('#status-msg');
const sidebar = $('#sidebar');
const fileTree = $('#file-tree');
const bottomPanels = $('#bottom-panels');
const panelProblems = $('#panel-problems');
const panelSearchResults = $('#panel-search-results');
const panelOutput = $('#panel-output');
const menuDropdown = $('#menu-dropdown');

// ─── Init ────────────────────────────────────────────────────────────
function init() {
  editor = new CMEditor(editorContainer, {
    onChange: handleEditorChange,
    onCursorChange: handleCursorChange,
  });

  initWorkers();
  initMenuBar();
  initToolbar();
  initTabContextMenu();
  initPanelTabs();
  initKeyboard();
  initSidebar();
  initStatusBar();
  restoreSession();

  if (state.tabs.length === 0) newFile();

  loadPreferences();
  window.addEventListener('beforeunload', (e) => {
    saveSession();
    savePreferencesToStorage();
    if (state.tabs.some(t => t.dirty)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ─── Workers ─────────────────────────────────────────────────────────
function initWorkers() {
  formatterWorker = new Worker(new URL('./workers/formatter.js', import.meta.url), { type: 'module' });
  lintWorker = new Worker(new URL('./workers/linter.js', import.meta.url), { type: 'module' });
}

function askWorker(worker, data) {
  return new Promise((resolve) => {
    const handler = (e) => { worker.removeEventListener('message', handler); resolve(e.data); };
    worker.addEventListener('message', handler);
    worker.postMessage(data);
  });
}

// ─── Tab Management ──────────────────────────────────────────────────
function newFile() {
  const id = `tab_${nextId++}`;
  const name = `new ${state.tabs.length + 1}`;
  state.tabs.push({ id, name, lang: 'plaintext', content: '', dirty: false, handle: null });
  activateTab(id);
  renderTabs();
}

function openTab(name, content, lang, handle) {
  const existing = state.tabs.find(t => t.name === name);
  if (existing) {
    existing.content = content;
    existing.lang = lang;
    existing.handle = handle;
    existing.dirty = false;
    activateTab(existing.id);
  } else {
    const id = `tab_${nextId++}`;
    state.tabs.push({ id, name, lang, content, dirty: false, handle });
    activateTab(id);
  }
  addRecentFile(name);
  renderTabs();
}

function activateTab(id) {
  // Save current editor content
  if (state.activeId) {
    const prev = state.tabs.find(t => t.id === state.activeId);
    if (prev && editor.view) prev.content = editor.getContent();
  }
  state.activeId = id;
  const tab = state.tabs.find(t => t.id === id);
  if (tab) {
    editor.create(tab.content, tab.lang);
    statusLang.textContent = getLangLabel(tab.lang);
    runDiagnostics(tab.content, tab.lang);
  }
  renderTabs();
  saveSession();
}

function closeTab(id) {
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx < 0) return;
  const tab = state.tabs[idx];
  if (tab.dirty && !confirm(`"${tab.name}" has unsaved changes. Close anyway?`)) return;
  state.tabs.splice(idx, 1);
  if (state.tabs.length === 0) {
    newFile();
    return;
  }
  if (state.activeId === id) {
    const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
    activateTab(next.id);
  }
  renderTabs();
  saveSession();
}

function renderTabs() {
  tabbar.innerHTML = '';
  for (let i = 0; i < state.tabs.length; i++) {
    const tab = state.tabs[i];
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === state.activeId ? ' active' : '') + (editor.isReadOnly() && tab.id === state.activeId ? ' readonly' : '');
    el.draggable = true;
    el.dataset.idx = i;
    el.innerHTML = `
      ${tab.dirty ? '<span class="tab-dirty">●</span>' : ''}
      <span class="tab-name">${escHtml(tab.name)}</span>
      <span class="tab-close">&times;</span>
    `;
    el.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.id); });
    el.addEventListener('click', () => activateTab(tab.id));
    // Tab drag reorder
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', i); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx = i;
      if (fromIdx === toIdx) return;
      const [moved] = state.tabs.splice(fromIdx, 1);
      state.tabs.splice(toIdx, 0, moved);
      renderTabs();
      saveSession();
    });
    tabbar.appendChild(el);
  }
}

function getActiveTab() { return state.tabs.find(t => t.id === state.activeId); }

// ─── Editor Callbacks ────────────────────────────────────────────────
function handleEditorChange(content) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.content = content;
  if (!tab.dirty) { tab.dirty = true; renderTabs(); }

  clearTimeout(lintTimer);
  lintTimer = setTimeout(() => runDiagnostics(content, tab.lang), 500);
}

function handleCursorChange({ line, col, selected }) {
  statusPos.textContent = `Ln ${line}, Col ${col}`;
  statusSel.textContent = selected > 0 ? `(${selected} selected)` : '';
  updateWordCount();
}

function updateWordCount() {
  const stats = editor.getStats();
  const el = document.getElementById('status-stats');
  if (el) el.textContent = `${stats.lines} lines, ${stats.words} words, ${stats.chars} chars`;
}

// ─── Diagnostics ─────────────────────────────────────────────────────
async function runDiagnostics(content, lang) {
  const issues = [];
  const lines = (content || '').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/\s+$/.test(line)) issues.push({ line: i + 1, message: 'Trailing whitespace', severity: 'warning' });
    if (line.length > 120) issues.push({ line: i + 1, message: `Line exceeds 120 chars (${line.length})`, severity: 'info' });
  });

  const resp = await askWorker(lintWorker, { code: content, language: lang });
  if (resp.ok && resp.messages) {
    for (const m of resp.messages) {
      issues.push({ line: m.line || 1, message: m.message, severity: m.severity === 2 ? 'error' : 'warning' });
    }
  }
  state.problems = issues;
  renderProblems();
}

function renderProblems() {
  if (state.problems.length === 0) {
    panelProblems.innerHTML = '<div class="panel-empty">No problems detected</div>';
    return;
  }
  panelProblems.innerHTML = state.problems.map((p, i) => `
    <div class="problem-row" data-line="${p.line}">
      <span class="problem-badge ${p.severity}">${p.severity}</span>
      <span>Ln ${p.line}: ${escHtml(p.message)}</span>
    </div>
  `).join('');
  panelProblems.querySelectorAll('.problem-row').forEach(el => {
    el.addEventListener('click', () => editor.goToLine(+el.dataset.line));
  });
}

// ─── Open Single File ────────────────────────────────────────────────
async function openSingleFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ multiple: false });
      const file = await handle.getFile();
      const text = await file.text();
      const lang = guessLang(file.name);
      openTab(file.name, text, lang, handle);
      showMsg(`Opened ${file.name}`);
    } catch { showMsg('Open cancelled'); }
  } else {
    // Fallback: <input type="file">
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      const lang = guessLang(file.name);
      openTab(file.name, text, lang, null);
      showMsg(`Opened ${file.name}`);
    });
    input.click();
  }
}

// ─── File System ─────────────────────────────────────────────────────
async function openFolder() {
  if (!window.showDirectoryPicker) { showMsg('File System Access not supported'); return; }
  try {
    const handle = await window.showDirectoryPicker();
    state.dirHandle = handle;
    showMsg('Scanning folder...');
    state.explorer = await scanDir(handle);
    renderFileTree();
    sidebar.classList.remove('hidden');
    showMsg(`Loaded ${state.explorer.length} files`);
  } catch { showMsg('Folder open cancelled'); }
}

async function scanDir(dirHandle, prefix = '') {
  const results = [];
  for await (const entry of dirHandle.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') results.push({ name: path, handle: entry, kind: 'file' });
    else if (entry.kind === 'directory' && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push({ name: path, kind: 'dir' });
      results.push(...await scanDir(entry, path));
    }
  }
  return results;
}

function renderFileTree() {
  if (state.explorer.length === 0) { fileTree.innerHTML = '<div class="tree-empty">Open a folder to browse files</div>'; return; }
  fileTree.innerHTML = state.explorer.map(e =>
    `<div class="tree-item ${e.kind === 'dir' ? 'dir' : ''}" data-name="${escHtml(e.name)}" data-kind="${e.kind}">
      ${e.kind === 'dir' ? '📁' : '📄'} ${escHtml(e.name)}
    </div>`
  ).join('');
  fileTree.querySelectorAll('.tree-item[data-kind="file"]').forEach(el => {
    el.addEventListener('click', () => openFileFromTree(el.dataset.name));
  });
}

async function openFileFromTree(name) {
  const entry = state.explorer.find(e => e.name === name && e.kind === 'file');
  if (!entry) return;
  try {
    const file = await entry.handle.getFile();
    const text = await file.text();
    const lang = guessLang(name);
    openTab(name, text, lang, entry.handle);
    showMsg(`Opened ${name}`);
  } catch (err) { showMsg(`Failed: ${err.message}`); }
}

async function openFromBackend() {
  try {
    const res = await fetch(`${BACKEND}/api/fs/list`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    state.explorer = (data.entries || []).map(e => ({
      name: e.name, kind: e.kind, backendPath: e.path,
    }));
    renderFileTreeBackend();
    sidebar.classList.remove('hidden');
    showMsg(`Backend: ${state.explorer.length} entries`);
  } catch (err) { showMsg(`Backend error: ${err.message}`); }
}

function renderFileTreeBackend() {
  fileTree.innerHTML = state.explorer.map(e =>
    `<div class="tree-item ${e.kind === 'dir' ? 'dir' : ''}" data-path="${escHtml(e.backendPath || '')}" data-kind="${e.kind}">
      ${e.kind === 'dir' ? '📁' : '📄'} ${escHtml(e.name)}
    </div>`
  ).join('');
  fileTree.querySelectorAll('.tree-item[data-kind="file"]').forEach(el => {
    el.addEventListener('click', () => openFileFromBackend(el.dataset.path));
  });
}

async function openFileFromBackend(path) {
  try {
    const res = await fetch(`${BACKEND}/api/fs/file?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const name = path.split(/[/\\]/).pop();
    const lang = guessLang(name);
    openTab(name, data.content || '', lang, { backendPath: path });
    showMsg(`Opened ${name}`);
  } catch (err) { showMsg(`Failed: ${err.message}`); }
}

async function saveActive() {
  const tab = getActiveTab();
  if (!tab) { showMsg('Nothing to save'); return; }
  tab.content = editor.getContent();

  // Backend file — save via API
  if (tab.handle?.backendPath) {
    try {
      const res = await fetch(`${BACKEND}/api/fs/file`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tab.handle.backendPath, content: tab.content }),
      });
      if (!res.ok) throw new Error(res.statusText);
      tab.dirty = false; renderTabs(); showMsg(`Saved ${tab.name} (backend)`);
    } catch (err) { showMsg(`Save failed: ${err.message}`); }
    return;
  }

  // FS Access API — existing file handle
  if (tab.handle?.createWritable) {
    try {
      const w = await tab.handle.createWritable();
      await w.write(tab.content); await w.close();
      tab.dirty = false; renderTabs(); showMsg(`Saved ${tab.name}`);
    } catch { showMsg('Save failed'); }
    return;
  }

  // No handle — prompt Save As via File System Access API or download fallback
  if (window.showSaveFilePicker) {
    try {
      const ext = tab.name.split('.').pop() || 'txt';
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: tab.name.startsWith('new ') ? 'untitled.txt' : tab.name,
        types: [{ description: 'Text Files', accept: { 'text/plain': ['.' + ext, '.txt'] } }],
      });
      const w = await fileHandle.createWritable();
      await w.write(tab.content);
      await w.close();
      tab.handle = fileHandle;
      tab.name = fileHandle.name;
      tab.lang = guessLang(fileHandle.name);
      tab.dirty = false;
      statusLang.textContent = getLangLabel(tab.lang);
      renderTabs();
      showMsg(`Saved as ${fileHandle.name}`);
    } catch { showMsg('Save cancelled'); }
  } else {
    // Fallback: download as file
    const blob = new Blob([tab.content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = tab.name.startsWith('new ') ? 'untitled.txt' : tab.name;
    a.click();
    URL.revokeObjectURL(a.href);
    tab.dirty = false;
    renderTabs();
    showMsg(`Downloaded ${a.download}`);
  }
}

async function saveAsActive() {
  const tab = getActiveTab();
  if (!tab) { showMsg('Nothing to save'); return; }
  tab.content = editor.getContent();
  if (window.showSaveFilePicker) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: tab.name.startsWith('new ') ? 'untitled.txt' : tab.name,
        types: [{ description: 'Text Files', accept: { 'text/plain': ['.txt', '.js', '.ts', '.html', '.css', '.json', '.md', '.py'] } }],
      });
      const w = await fileHandle.createWritable();
      await w.write(tab.content);
      await w.close();
      tab.handle = fileHandle;
      tab.name = fileHandle.name;
      tab.lang = guessLang(fileHandle.name);
      tab.dirty = false;
      statusLang.textContent = getLangLabel(tab.lang);
      renderTabs();
      showMsg(`Saved as ${fileHandle.name}`);
    } catch { showMsg('Save As cancelled'); }
  } else {
    const blob = new Blob([tab.content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = tab.name.startsWith('new ') ? 'untitled.txt' : tab.name;
    a.click();
    URL.revokeObjectURL(a.href);
    tab.dirty = false;
    renderTabs();
    showMsg(`Downloaded ${a.download}`);
  }
}

// ─── Search ──────────────────────────────────────────────────────────
async function searchProject() {
  const query = prompt('Search across project files:');
  if (!query) return;
  try {
    const res = await fetch(`${BACKEND}/api/fs/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    state.searchResults = data.results || [];
    renderSearchResults();
    showPanel('search-results');
    showMsg(`Found ${state.searchResults.length} matches${data.truncated ? ' (truncated)' : ''}`);
  } catch (err) { showMsg(`Search failed: ${err.message}`); }
}

function renderSearchResults() {
  if (state.searchResults.length === 0) {
    panelSearchResults.innerHTML = '<div class="panel-empty">No results</div>';
    return;
  }
  panelSearchResults.innerHTML = state.searchResults.map((r, i) => `
    <div class="search-row" data-idx="${i}">
      <span class="sr-path">${escHtml(r.path)}:${r.line}</span>
      <span class="sr-preview">${escHtml(r.preview)}</span>
    </div>
  `).join('');
  panelSearchResults.querySelectorAll('.search-row').forEach(el => {
    el.addEventListener('click', () => {
      const r = state.searchResults[+el.dataset.idx];
      openFileFromBackend(r.path).then(() => editor.goToLine(r.line));
    });
  });
}

// ─── Format ──────────────────────────────────────────────────────────
async function formatActive() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.content = editor.getContent();
  const resp = await askWorker(formatterWorker, { code: tab.content, language: tab.lang });
  if (resp.ok) {
    editor.setContent(resp.formatted);
    tab.content = resp.formatted;
    tab.dirty = true;
    renderTabs();
    runDiagnostics(resp.formatted, tab.lang);
    showMsg('Formatted');
  } else { showMsg(`Format error: ${resp.error}`); }
}

// ─── Menu System ─────────────────────────────────────────────────────
const menus = {
  file: [
    { label: 'New', shortcut: 'Ctrl+N', action: newFile },
    { label: 'Open File...', shortcut: 'Ctrl+O', action: openSingleFile },
    { label: 'Open Multiple Files...', shortcut: '', action: openMultipleFiles },
    { label: 'Open Folder', shortcut: '', action: openFolder },
    { label: 'Open from Backend', shortcut: '', action: openFromBackend },
    { label: 'Recent Files ▸', shortcut: '', action: showRecentFiles },
    { sep: true },
    { label: 'Reload from Disk', shortcut: '', action: reloadFromDisk },
    { label: 'Save', shortcut: 'Ctrl+S', action: saveActive },
    { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: saveAsActive },
    { label: 'Save All', shortcut: '', action: saveAllTabs },
    { sep: true },
    { label: 'Print', shortcut: 'Ctrl+P', action: printDocument },
    { sep: true },
    { label: 'Close Tab', shortcut: 'Ctrl+W', action: () => closeTab(state.activeId) },
    { label: 'Close All', shortcut: '', action: closeAllTabs },
  ],
  edit: [
    { label: 'Undo', shortcut: 'Ctrl+Z', action: () => editor.doUndo() },
    { label: 'Redo', shortcut: 'Ctrl+Y', action: () => editor.doRedo() },
    { sep: true },
    { label: 'Cut', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
    { label: 'Copy', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
    { label: 'Paste', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
    { label: 'Select All', shortcut: 'Ctrl+A', action: () => editor.selectAll() },
    { sep: true },
    { label: 'Comment', children: [
      { label: 'Toggle Comment', shortcut: 'Ctrl+/', action: () => editor.toggleComment() },
      { label: 'Block Comment', shortcut: 'Ctrl+Shift+/', action: () => editor.toggleBlockComment() },
    ]},
    { label: 'Convert Case', children: [
      { label: 'UPPERCASE', shortcut: 'Ctrl+Shift+U', action: () => editor.toUpperCase() },
      { label: 'lowercase', shortcut: 'Ctrl+U', action: () => editor.toLowerCase() },
      { label: 'Title Case', shortcut: '', action: () => editor.toTitleCase() },
      { label: 'Sentence case', shortcut: '', action: () => editor.toSentenceCase() },
      { label: 'iNVERT cASE', shortcut: '', action: () => editor.invertCase() },
    ]},
    { label: 'Line Operations', children: [
      { label: 'Duplicate Line', shortcut: 'Ctrl+D', action: () => editor.duplicateLine() },
      { label: 'Move Line Up', shortcut: 'Alt+↑', action: () => editor.moveLineUp() },
      { label: 'Move Line Down', shortcut: 'Alt+↓', action: () => editor.moveLineDown() },
      { sep: true },
      { label: 'Join Lines', shortcut: '', action: () => { editor.joinLines(); showMsg('Lines joined'); } },
      { label: 'Split Lines', shortcut: '', action: () => { editor.splitLines(); showMsg('Lines split'); } },
      { label: 'Reverse Line Order', shortcut: '', action: () => { editor.reverseLines(); showMsg('Lines reversed'); } },
      { sep: true },
      { label: 'Sort Lines (Asc)', shortcut: '', action: () => { editor.sortLinesAsc(); showMsg('Lines sorted ascending'); } },
      { label: 'Sort Lines (Desc)', shortcut: '', action: () => { editor.sortLinesDesc(); showMsg('Lines sorted descending'); } },
      { label: 'Remove Duplicate Lines', shortcut: '', action: () => { editor.removeDuplicateLines(); showMsg('Duplicate lines removed'); } },
      { label: 'Remove Empty Lines', shortcut: '', action: () => { editor.removeEmptyLines(); showMsg('Empty lines removed'); } },
    ]},
    { label: 'Indent / Whitespace', children: [
      { label: 'Indent', shortcut: 'Tab', action: () => editor.indent() },
      { label: 'Unindent', shortcut: 'Shift+Tab', action: () => editor.unindent() },
      { sep: true },
      { label: 'Trim Trailing Spaces', shortcut: '', action: () => { editor.trimTrailingWhitespace(); showMsg('Trimmed trailing spaces'); } },
      { label: 'Trim Leading Spaces', shortcut: '', action: () => { editor.trimLeadingWhitespace(); showMsg('Trimmed leading spaces'); } },
    ]},
    { sep: true },
    { label: 'Insert Date/Time', shortcut: 'F5', action: insertDateTime },
    { label: 'Read-Only Mode', shortcut: '', action: toggleReadOnly },
    { sep: true },
    { label: 'Format Document', shortcut: 'Shift+Alt+F', action: formatActive },
    { label: 'Run Linter', shortcut: '', action: () => { const t = getActiveTab(); if (t) runDiagnostics(t.content, t.lang); } },
  ],
  search: [
    { label: 'Find', shortcut: 'Ctrl+F', action: () => editor.openFind() },
    { label: 'Replace', shortcut: 'Ctrl+H', action: () => editor.openReplace() },
    { label: 'Go to Line', shortcut: 'Ctrl+G', action: goToLine },
    { sep: true },
    { label: 'Search in Project', shortcut: 'Ctrl+Shift+F', action: searchProject },
  ],
  view: [
    { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => sidebar.classList.toggle('hidden') },
    { label: 'Toggle Problems', shortcut: 'Ctrl+Shift+M', action: () => togglePanel('problems') },
    { label: 'Toggle Search Results', shortcut: '', action: () => togglePanel('search-results') },
    { label: 'Toggle Minimap', shortcut: '', action: toggleMinimap },
    { sep: true },
    { label: 'Full Screen', shortcut: 'F11', action: toggleFullScreen },
    { label: 'Zoom In', shortcut: 'Ctrl++', action: () => editor.zoom(1) },
    { label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => editor.zoom(-1) },
    { sep: true },
    { label: 'Word Wrap', shortcut: '', action: toggleWordWrap },
    { label: 'Show Whitespace', shortcut: '', action: toggleWhitespace },
    { label: 'Fold All', shortcut: '', action: () => { editor.foldAll(); showMsg('All folds collapsed'); } },
    { label: 'Unfold All', shortcut: '', action: () => { editor.unfoldAll(); showMsg('All folds expanded'); } },
    { sep: true },
    { label: 'EOL: Windows (CRLF)', action: () => setEol('CRLF') },
    { label: 'EOL: Unix (LF)', action: () => setEol('LF') },
    { sep: true },
    { label: 'Light Theme', action: () => setTheme('light') },
    { label: 'Dark Theme', action: () => setTheme('dark') },
  ],
  bookmarks: [
    { label: 'Toggle Bookmark', shortcut: 'Ctrl+F2', action: toggleBookmark },
    { label: 'Next Bookmark', shortcut: 'F2', action: () => editor.nextBookmark() },
    { label: 'Previous Bookmark', shortcut: 'Shift+F2', action: () => editor.prevBookmark() },
    { sep: true },
    { label: 'Clear All Bookmarks', shortcut: '', action: () => { editor.clearBookmarks(); showMsg('Bookmarks cleared'); } },
    { label: 'List Bookmarks', shortcut: '', action: listBookmarks },
  ],
  macro: [
    { label: 'Start Recording', shortcut: 'Ctrl+Shift+R', action: startMacroRecord },
    { label: 'Stop Recording', shortcut: 'Ctrl+Shift+R', action: stopMacroRecord },
    { label: 'Playback', shortcut: 'Ctrl+Shift+P', action: playMacro },
    { sep: true },
    { label: 'Run Multiple Times...', shortcut: '', action: runMacroMultiple },
  ],
  language: buildLanguageMenu(),
  settings: [
    { label: 'Font Size +', action: () => editor.zoom(1) },
    { label: 'Font Size -', action: () => editor.zoom(-1) },
    { sep: true },
    { label: 'Tab Size: 2', action: () => setIndent(2, false) },
    { label: 'Tab Size: 4', action: () => setIndent(4, false) },
    { label: 'Tab Size: 8', action: () => setIndent(8, false) },
    { label: 'Use Tabs', action: () => setIndent(state.tabSize, true) },
    { label: 'Use Spaces', action: () => setIndent(state.tabSize, false) },
    { sep: true },
    { label: 'Preferences...', action: openPreferences },
  ],
  help: [
    { label: 'About Web Notepad Plus', action: () => alert('Web Notepad Plus v3.0\nCodeMirror 6 + Vanilla JS\nProduction Ready\n\nFeatures: Multi-tab, Syntax Highlighting,\nFormat, Lint, Search, File Explorer,\nLine Operations, Bookmarks, Minimap,\nMacros, Themes, Print & more.') },
    { label: 'Keyboard Shortcuts', action: showShortcuts },
  ],
};

function buildLanguageMenu() {
  const langs = ['plaintext','javascript','typescript','jsx','tsx','python','html','css','json','markdown','xml','java','cpp','c','php','sql','rust'];
  return langs.map(l => ({
    label: getLangLabel(l),
    action: () => {
      const tab = getActiveTab();
      if (!tab) return;
      tab.lang = l;
      tab.content = editor.getContent();
      editor.create(tab.content, l);
      statusLang.textContent = getLangLabel(l);
      showMsg(`Language: ${getLangLabel(l)}`);
    },
  }));
}

function showShortcuts() {
  alert([
    'Ctrl+N — New file',
    'Ctrl+O — Open file',
    'Ctrl+S — Save',
    'Ctrl+Shift+S — Save As',
    'Ctrl+W — Close tab',
    'Ctrl+P — Print',
    'Ctrl+F — Find',
    'Ctrl+H — Replace',
    'Ctrl+G — Go to line',
    'Ctrl+D — Duplicate line',
    'Ctrl+/ — Toggle comment',
    'Ctrl+Shift+/ — Block comment',
    'Alt+↑/↓ — Move line up/down',
    'Ctrl+Shift+U — UPPERCASE',
    'Ctrl+U — lowercase',
    'Ctrl+B — Toggle sidebar',
    'Ctrl+Shift+M — Toggle problems',
    'Ctrl+Shift+F — Search project',
    'Shift+Alt+F — Format',
    'Ctrl+Z/Y — Undo/Redo',
    'Ctrl++/- — Zoom',
    'F5 — Insert Date/Time',
    'F11 — Full Screen',
    'Ctrl+F2 — Toggle Bookmark',
    'F2 / Shift+F2 — Next/Prev Bookmark',
    'Ctrl+Shift+R — Start/Stop Macro',
    'Ctrl+Shift+P — Play Macro',
  ].join('\n'));
}

function renderMenuItems(items) {
  return items.map(item => {
    if (item.sep) return '<div class="dropdown-sep"></div>';
    if (item.children) {
      return `<div class="dropdown-item has-submenu" data-action="${item.label}">
        <span>${item.label}</span><span class="submenu-arrow">▸</span>
        <div class="submenu">${renderMenuItems(item.children)}</div>
      </div>`;
    }
    return `<div class="dropdown-item" data-action="${item.label}">
      <span>${item.label}</span>
      ${item.shortcut ? `<span class="shortcut">${item.shortcut}</span>` : ''}
    </div>`;
  }).join('');
}

function flattenItems(items) {
  const flat = [];
  for (const item of items) {
    if (item.sep) continue;
    if (item.children) flat.push(...flattenItems(item.children));
    else flat.push(item);
  }
  return flat;
}

function wireMenuItems(container, items) {
  const allActions = flattenItems(items);
  container.querySelectorAll('.dropdown-item:not(.has-submenu)').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = allActions.find(i => i.label === el.dataset.action);
      if (item?.action) item.action();
      closeMenu();
    });
  });
}

let openMenu = null;
function initMenuBar() {
  document.querySelectorAll('.menu-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = trigger.dataset.menu;
      if (openMenu === name) { closeMenu(); return; }
      openMenu = name;
      document.querySelectorAll('.menu-trigger').forEach(t => t.classList.remove('open'));
      trigger.classList.add('open');

      const items = menus[name] || [];
      menuDropdown.innerHTML = renderMenuItems(items);

      const rect = trigger.getBoundingClientRect();
      menuDropdown.style.left = rect.left + 'px';
      menuDropdown.classList.remove('hidden');

      wireMenuItems(menuDropdown, items);
    });

    trigger.addEventListener('mouseenter', () => {
      if (openMenu && trigger.dataset.menu !== openMenu) trigger.click();
    });
  });

  document.addEventListener('click', closeMenu);
}

function closeMenu() {
  menuDropdown.classList.add('hidden');
  document.querySelectorAll('.menu-trigger').forEach(t => t.classList.remove('open'));
  openMenu = null;
}

// ─── Toolbar ─────────────────────────────────────────────────────────
function initToolbar() {
  const actions = {
    new: newFile,
    open: openFolder,
    save: saveActive,
    saveAll: saveAllTabs,
    undo: () => editor.doUndo(),
    redo: () => editor.doRedo(),
    cut: () => document.execCommand('cut'),
    copy: () => document.execCommand('copy'),
    paste: () => document.execCommand('paste'),
    find: () => editor.openFind(),
    replace: () => editor.openFind(),
    zoomIn: () => editor.zoom(1),
    zoomOut: () => editor.zoom(-1),
    wordwrap: toggleWordWrap,
    format: formatActive,
    lint: () => { const t = getActiveTab(); if (t) runDiagnostics(t.content, t.lang); },
  };
  document.querySelectorAll('#toolbar button').forEach(btn => {
    const action = actions[btn.dataset.action];
    if (action) btn.addEventListener('click', action);
  });
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;
    const key = e.key.toLowerCase();

    if (ctrl && !shift && key === 'n') { e.preventDefault(); newFile(); }
    if (ctrl && !shift && key === 'o') { e.preventDefault(); openSingleFile(); }
    if (ctrl && !shift && key === 's') { e.preventDefault(); saveActive(); }
    if (ctrl && shift && key === 's') { e.preventDefault(); saveAsActive(); }
    if (ctrl && !shift && key === 'w') { e.preventDefault(); closeTab(state.activeId); }
    if (ctrl && !shift && key === 'b') { e.preventDefault(); sidebar.classList.toggle('hidden'); }
    if (ctrl && !shift && key === 'g') { e.preventDefault(); goToLine(); }
    if (ctrl && !shift && key === 'd') { e.preventDefault(); editor.duplicateLine(); }
    if (ctrl && key === '/' && !shift) { e.preventDefault(); editor.toggleComment(); }
    if (ctrl && shift && key === 'u') { e.preventDefault(); editor.toUpperCase(); }
    if (ctrl && !shift && key === 'u') { e.preventDefault(); editor.toLowerCase(); }
    if (alt && !ctrl && e.key === 'ArrowUp') { e.preventDefault(); editor.moveLineUp(); }
    if (alt && !ctrl && e.key === 'ArrowDown') { e.preventDefault(); editor.moveLineDown(); }
    if (ctrl && shift && key === 'f') { e.preventDefault(); searchProject(); }
    if (ctrl && shift && key === 'm') { e.preventDefault(); togglePanel('problems'); }
    if (ctrl && !shift && key === 'h') { e.preventDefault(); editor.openReplace(); }
    if (shift && alt && key === 'f') { e.preventDefault(); formatActive(); }
    if (ctrl && !shift && key === 'p') { e.preventDefault(); printDocument(); }
    if (e.key === 'F5' && !ctrl) { e.preventDefault(); insertDateTime(); }
    if (e.key === 'F11') { e.preventDefault(); toggleFullScreen(); }
    if (ctrl && shift && key === '/') { e.preventDefault(); editor.toggleBlockComment(); }
    // Bookmarks
    if (ctrl && e.key === 'F2') { e.preventDefault(); toggleBookmark(); }
    if (!ctrl && !shift && e.key === 'F2') { e.preventDefault(); editor.nextBookmark(); }
    if (!ctrl && shift && e.key === 'F2') { e.preventDefault(); editor.prevBookmark(); }
    // Macros
    if (ctrl && shift && key === 'r') { e.preventDefault(); editor.isRecording() ? stopMacroRecord() : startMacroRecord(); }
    if (ctrl && shift && key === 'p') { e.preventDefault(); playMacro(); }
  });
}

function goToLine() {
  const input = prompt('Go to line:');
  const n = parseInt(input, 10);
  if (n > 0) editor.goToLine(n);
}

function closeAllTabs() {
  const ids = state.tabs.filter(t => !t.dirty).map(t => t.id);
  for (const id of ids) closeTab(id);
  // For dirty tabs, ask once
  if (state.tabs.length > 0) {
    if (confirm(`${state.tabs.length} file(s) have unsaved changes. Close all?`)) {
      while (state.tabs.length > 0) {
        state.tabs[0].dirty = false; // skip individual confirms
        closeTab(state.tabs[0].id);
      }
    }
  }
}

function saveAllTabs() {
  const dirtyTabs = state.tabs.filter(t => t.dirty);
  for (const t of dirtyTabs) {
    activateTab(t.id);
    saveActive();
  }
}

function toggleWordWrap() {
  state.wordWrap = !state.wordWrap;
  editor.setWordWrap(state.wordWrap);
  showMsg(`Word wrap: ${state.wordWrap ? 'ON' : 'OFF'}`);
}

function toggleWhitespace() {
  const on = editor.toggleWhitespace();
  state.showWhitespace = on;
  showMsg(`Show whitespace: ${on ? 'ON' : 'OFF'}`);
}

function setEol(eol) {
  state.eol = eol;
  document.getElementById('status-eol').textContent = eol;
  showMsg(`EOL set to ${eol}`);
  // Convert existing content
  const tab = getActiveTab();
  if (tab) {
    let text = editor.getContent();
    text = text.replace(/\r\n|\r|\n/g, eol === 'CRLF' ? '\r\n' : eol === 'CR' ? '\r' : '\n');
    tab.content = text;
  }
}

function setIndent(tabSize, useTabs) {
  state.tabSize = tabSize;
  state.useTabs = useTabs;
  editor.setIndentation(tabSize, useTabs);
  const label = useTabs ? `Tabs (size ${tabSize})` : `Spaces: ${tabSize}`;
  document.getElementById('status-indent').textContent = label;
  showMsg(`Indentation: ${label}`);
}

// ─── Tab context menu ────────────────────────────────────────────────
let ctxMenu = null;
function initTabContextMenu() {
  tabbar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;
    const idx = [...tabbar.children].indexOf(tabEl);
    if (idx < 0 || !state.tabs[idx]) return;
    const tab = state.tabs[idx];

    if (ctxMenu) ctxMenu.remove();
    ctxMenu = document.createElement('div');
    ctxMenu.className = 'tab-ctx-menu';
    const items = [
      { label: 'Close', action: () => closeTab(tab.id) },
      { label: 'Close Others', action: () => { const ids = state.tabs.filter(t => t.id !== tab.id).map(t => t.id); ids.forEach(id => closeTab(id)); } },
      { label: 'Close to the Right', action: () => { const ids = state.tabs.slice(idx + 1).map(t => t.id); ids.forEach(id => closeTab(id)); } },
      { sep: true },
      { label: 'Copy File Name', action: () => { navigator.clipboard?.writeText(tab.name); showMsg('Copied: ' + tab.name); } },
      { label: 'Copy File Path', action: () => { const path = tab.handle?.backendPath || tab.handle?.name || tab.name; navigator.clipboard?.writeText(path); showMsg('Copied path'); } },
      { sep: true },
      { label: 'Rename', action: () => { const n = prompt('Rename tab:', tab.name); if (n && n !== tab.name) { tab.name = n; tab.lang = guessLang(n); renderTabs(); showMsg('Renamed to ' + n); } } },
    ];

    ctxMenu.innerHTML = items.map(i =>
      i.sep ? '<div class="ctx-sep"></div>'
      : `<div class="ctx-item">${i.label}</div>`
    ).join('');

    ctxMenu.querySelectorAll('.ctx-item').forEach((el, i) => {
      const item = items.filter(x => !x.sep)[i];
      if (item) el.addEventListener('click', () => { item.action(); ctxMenu.remove(); ctxMenu = null; });
    });

    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';
    document.body.appendChild(ctxMenu);

    const closeCtx = (ev) => {
      if (ctxMenu && !ctxMenu.contains(ev.target)) { ctxMenu.remove(); ctxMenu = null; }
      document.removeEventListener('click', closeCtx);
    };
    setTimeout(() => document.addEventListener('click', closeCtx), 0);
  });
}

// ─── Drag & Drop ─────────────────────────────────────────────────────
function initDragDrop() {
  const body = document.body;
  body.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; body.classList.add('drag-over'); });
  body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
  body.addEventListener('drop', async (e) => {
    e.preventDefault();
    body.classList.remove('drag-over');
    for (const item of e.dataTransfer.items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (!file) continue;
        const text = await file.text();
        const lang = guessLang(file.name);
        openTab(file.name, text, lang, null);
        showMsg(`Opened ${file.name}`);
      }
    }
  });
}

// ─── Bottom Panels ───────────────────────────────────────────────────
function initPanelTabs() {
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => showPanel(tab.dataset.panel));
  });
  $('#panel-close').addEventListener('click', () => bottomPanels.classList.add('hidden'));
}

function showPanel(name) {
  bottomPanels.classList.remove('hidden');
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === name));
  document.querySelectorAll('.panel-body').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`panel-${name}`);
  if (target) target.classList.add('active');
}

function togglePanel(name) {
  if (!bottomPanels.classList.contains('hidden')) {
    const activeTab = document.querySelector('.panel-tab.active');
    if (activeTab?.dataset.panel === name) { bottomPanels.classList.add('hidden'); return; }
  }
  showPanel(name);
}

// ─── Sidebar ─────────────────────────────────────────────────────────
function initSidebar() {
  $('#sidebar-close').addEventListener('click', () => sidebar.classList.add('hidden'));
  renderFileTree();
}

function initStatusBar() {
  statusLang.addEventListener('click', () => {
    const langs = ['plaintext','javascript','typescript','jsx','tsx','python','html','css','json','markdown','xml','java','cpp','c','php','sql','rust'];
    const choice = prompt('Set language:\n' + langs.join(', '));
    if (choice && langs.includes(choice)) {
      const tab = getActiveTab();
      if (!tab) return;
      tab.lang = choice;
      tab.content = editor.getContent();
      editor.create(tab.content, choice);
      statusLang.textContent = getLangLabel(choice);
      showMsg(`Language: ${getLangLabel(choice)}`);
    }
  });
}

// ─── Session Persistence ─────────────────────────────────────────────
function saveSession() {
  try {
    const data = state.tabs.map(t => ({ name: t.name, lang: t.lang, content: t.content, dirty: t.dirty }));
    localStorage.setItem('nppweb_tabs', JSON.stringify(data));
    const activeTab = getActiveTab();
    localStorage.setItem('nppweb_active_name', activeTab?.name || '');
  } catch {}
}

function restoreSession() {
  try {
    const raw = localStorage.getItem('nppweb_tabs');
    if (!raw) return;
    const tabs = JSON.parse(raw);
    if (!Array.isArray(tabs) || tabs.length === 0) return;
    const savedActive = localStorage.getItem('nppweb_active_name') || '';
    let restoreId = null;
    for (const t of tabs) {
      const id = `tab_${nextId++}`;
      state.tabs.push({ id, name: t.name, lang: t.lang || 'plaintext', content: t.content || '', dirty: false, handle: null });
      if (t.name === savedActive) restoreId = id;
    }
    activateTab(restoreId || state.tabs[0].id);
    renderTabs();
  } catch {}
}

// ─── Open Multiple Files ─────────────────────────────────────────────
async function openMultipleFiles() {
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({ multiple: true });
      for (const handle of handles) {
        const file = await handle.getFile();
        const text = await file.text();
        openTab(file.name, text, guessLang(file.name), handle);
      }
      showMsg(`Opened ${handles.length} file(s)`);
    } catch { showMsg('Open cancelled'); }
  } else {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.addEventListener('change', async () => {
      for (const file of input.files) {
        const text = await file.text();
        openTab(file.name, text, guessLang(file.name), null);
      }
      showMsg(`Opened ${input.files.length} file(s)`);
    });
    input.click();
  }
}

// ─── Recent Files UI ─────────────────────────────────────────────────
function showRecentFiles() {
  const recent = getRecentFiles();
  if (recent.length === 0) { showMsg('No recent files'); return; }
  panelOutput.innerHTML = '<div style="padding:4px 8px;font-weight:600;color:#569cd6;">Recent Files</div>' +
    recent.map(name => `<div class="problem-row" style="cursor:pointer" data-name="${escHtml(name)}">📄 ${escHtml(name)}</div>`).join('');
  panelOutput.querySelectorAll('.problem-row').forEach(el => {
    el.addEventListener('click', () => {
      const existing = state.tabs.find(t => t.name === el.dataset.name);
      if (existing) activateTab(existing.id);
      else showMsg(`"${el.dataset.name}" — reopen from File > Open`);
    });
  });
  showPanel('output');
}

// ─── Reload from Disk ────────────────────────────────────────────────
async function reloadFromDisk() {
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.handle?.getFile) {
    try {
      const file = await tab.handle.getFile();
      const text = await file.text();
      tab.content = text;
      tab.dirty = false;
      editor.create(text, tab.lang);
      renderTabs();
      showMsg(`Reloaded ${tab.name}`);
    } catch { showMsg('Reload failed'); }
  } else if (tab.handle?.backendPath) {
    try {
      const res = await fetch(`${BACKEND}/api/fs/file?path=${encodeURIComponent(tab.handle.backendPath)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      tab.content = data.content || '';
      tab.dirty = false;
      editor.create(tab.content, tab.lang);
      renderTabs();
      showMsg(`Reloaded ${tab.name}`);
    } catch { showMsg('Reload failed'); }
  } else {
    showMsg('No file handle — cannot reload');
  }
}

// ─── Print ───────────────────────────────────────────────────────────
function printDocument() {
  const tab = getActiveTab();
  if (!tab) return;
  const content = editor.getContent();
  const printWin = window.open('', '_blank');
  printWin.document.write(`<!DOCTYPE html><html><head><title>${escHtml(tab.name)}</title>
    <style>body{font-family:'Cascadia Code',Consolas,monospace;font-size:12px;white-space:pre-wrap;padding:20px;line-height:1.5;}
    @media print{body{font-size:10px;padding:0;}}</style></head>
    <body>${escHtml(content)}</body></html>`);
  printWin.document.close();
  printWin.print();
}

// ─── Insert Date/Time ────────────────────────────────────────────────
function insertDateTime() {
  const now = new Date();
  editor.insertText(now.toLocaleString());
}

// ─── Read-Only Mode ──────────────────────────────────────────────────
function toggleReadOnly() {
  const on = !editor.isReadOnly();
  editor.setReadOnly(on);
  showMsg(`Read-only: ${on ? 'ON' : 'OFF'}`);
}

// ─── Full Screen ─────────────────────────────────────────────────────
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    showMsg('Full screen ON');
  } else {
    document.exitFullscreen();
    showMsg('Full screen OFF');
  }
}

// ─── Theme Switching ─────────────────────────────────────────────────
function setTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('nppweb_theme', theme);
  showMsg(`Theme: ${theme}`);
}

// ─── Macro Functions ─────────────────────────────────────────────────
let lastMacroActions = [];
function startMacroRecord() {
  editor.startMacro();
  showMsg('⏺ Macro recording started');
}
function stopMacroRecord() {
  lastMacroActions = editor.stopMacro();
  showMsg(`⏹ Macro stopped (${lastMacroActions.length} actions)`);
}
function playMacro() {
  if (lastMacroActions.length === 0) { showMsg('No macro recorded'); return; }
  editor.playMacro(lastMacroActions);
  showMsg('▶ Macro played');
}
function runMacroMultiple() {
  if (lastMacroActions.length === 0) { showMsg('No macro recorded'); return; }
  const n = parseInt(prompt('Run macro how many times?', '5'), 10);
  if (!n || n <= 0) return;
  for (let i = 0; i < n; i++) editor.playMacro(lastMacroActions);
  showMsg(`▶ Macro played ${n} times`);
}

// ─── Persist Preferences ─────────────────────────────────────────────
function savePreferencesToStorage() {
  try {
    localStorage.setItem('nppweb_prefs', JSON.stringify({
      fontSize: editor.fontSize,
      tabSize: state.tabSize,
      useTabs: state.useTabs,
      wordWrap: state.wordWrap,
      showWhitespace: state.showWhitespace,
      eol: state.eol,
      theme: document.body.getAttribute('data-theme') || 'dark',
    }));
  } catch {}
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem('nppweb_prefs');
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.fontSize && p.fontSize !== 14) {
      const delta = p.fontSize - editor.fontSize;
      if (delta !== 0) editor.zoom(delta);
    }
    if (p.tabSize) setIndent(p.tabSize, !!p.useTabs);
    if (p.wordWrap && !state.wordWrap) toggleWordWrap();
    if (p.showWhitespace && !state.showWhitespace) toggleWhitespace();
    if (p.eol) setEol(p.eol);
    if (p.theme) setTheme(p.theme);
  } catch {}
}

// ─── Bookmarks ──────────────────────────────────────────────────────
function toggleBookmark() {
  const result = editor.toggleBookmark();
  if (result) showMsg(`Bookmark ${result.added ? 'added' : 'removed'} at line ${result.line}`);
}

function listBookmarks() {
  const bm = editor.getBookmarks();
  if (bm.length === 0) { showMsg('No bookmarks'); return; }
  panelOutput.innerHTML = '<div style="padding:4px 8px;font-weight:600;color:#569cd6;">Bookmarks</div>' +
    bm.map(l => `<div class="problem-row" data-line="${l}" style="cursor:pointer">📌 Line ${l}</div>`).join('');
  panelOutput.querySelectorAll('.problem-row').forEach(el => {
    el.addEventListener('click', () => editor.goToLine(+el.dataset.line));
  });
  showPanel('output');
}

// ─── Minimap ────────────────────────────────────────────────────────
function toggleMinimap() {
  const on = editor.toggleMinimap();
  showMsg(`Minimap: ${on ? 'ON' : 'OFF'}`);
}

// ─── Recent Files ───────────────────────────────────────────────────
function addRecentFile(name) {
  try {
    let recent = JSON.parse(localStorage.getItem('nppweb_recent') || '[]');
    recent = recent.filter(n => n !== name);
    recent.unshift(name);
    if (recent.length > 10) recent.length = 10;
    localStorage.setItem('nppweb_recent', JSON.stringify(recent));
  } catch {}
}

function getRecentFiles() {
  try { return JSON.parse(localStorage.getItem('nppweb_recent') || '[]'); }
  catch { return []; }
}

// ─── Preferences Dialog ─────────────────────────────────────────────
function openPreferences() {
  let overlay = document.getElementById('prefs-overlay');
  if (overlay) { overlay.remove(); return; }

  overlay = document.createElement('div');
  overlay.id = 'prefs-overlay';
  overlay.innerHTML = `
    <div class="prefs-dialog">
      <div class="prefs-header">
        <span>Preferences</span>
        <button id="prefs-close">&times;</button>
      </div>
      <div class="prefs-body">
        <div class="prefs-group">
          <label>Font Size</label>
          <input type="range" id="pref-fontsize" min="8" max="32" value="${editor.fontSize}" />
          <span id="pref-fontsize-label">${editor.fontSize}px</span>
        </div>
        <div class="prefs-group">
          <label>Tab Size</label>
          <select id="pref-tabsize">
            <option value="2" ${state.tabSize === 2 ? 'selected' : ''}>2</option>
            <option value="4" ${state.tabSize === 4 ? 'selected' : ''}>4</option>
            <option value="8" ${state.tabSize === 8 ? 'selected' : ''}>8</option>
          </select>
        </div>
        <div class="prefs-group">
          <label>Indent With</label>
          <select id="pref-indent-type">
            <option value="spaces" ${!state.useTabs ? 'selected' : ''}>Spaces</option>
            <option value="tabs" ${state.useTabs ? 'selected' : ''}>Tabs</option>
          </select>
        </div>
        <div class="prefs-group">
          <label>Word Wrap</label>
          <input type="checkbox" id="pref-wordwrap" ${state.wordWrap ? 'checked' : ''} />
        </div>
        <div class="prefs-group">
          <label>Show Whitespace</label>
          <input type="checkbox" id="pref-whitespace" ${state.showWhitespace ? 'checked' : ''} />
        </div>
        <div class="prefs-group">
          <label>Line Ending</label>
          <select id="pref-eol">
            <option value="CRLF" ${state.eol === 'CRLF' ? 'selected' : ''}>Windows (CRLF)</option>
            <option value="LF" ${state.eol === 'LF' ? 'selected' : ''}>Unix (LF)</option>
          </select>
        </div>
      </div>
      <div class="prefs-footer">
        <button id="prefs-apply">Apply</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Wire events
  const fontSlider = document.getElementById('pref-fontsize');
  const fontLabel = document.getElementById('pref-fontsize-label');
  fontSlider.addEventListener('input', () => { fontLabel.textContent = fontSlider.value + 'px'; });

  document.getElementById('prefs-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('prefs-apply').addEventListener('click', () => {
    const newSize = parseInt(fontSlider.value, 10);
    const delta = newSize - editor.fontSize;
    if (delta !== 0) editor.zoom(delta);

    const tabSize = parseInt(document.getElementById('pref-tabsize').value, 10);
    const useTabs = document.getElementById('pref-indent-type').value === 'tabs';
    setIndent(tabSize, useTabs);

    const wantWrap = document.getElementById('pref-wordwrap').checked;
    if (wantWrap !== state.wordWrap) toggleWordWrap();

    const wantWS = document.getElementById('pref-whitespace').checked;
    if (wantWS !== state.showWhitespace) toggleWhitespace();

    setEol(document.getElementById('pref-eol').value);

    overlay.remove();
    showMsg('Preferences applied');
  });
}

// ─── Utilities ───────────────────────────────────────────────────────
function showMsg(msg) {
  statusMsg.textContent = msg;
  setTimeout(() => { if (statusMsg.textContent === msg) statusMsg.textContent = ''; }, 4000);
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Boot ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();
  initDragDrop();
  updateWordCount();
  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});