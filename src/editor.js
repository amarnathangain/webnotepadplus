import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars, highlightWhitespace, highlightTrailingWhitespace } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, toggleComment, toggleBlockComment, indentMore, indentLess } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit, foldAll, unfoldAll } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';

import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { xml } from '@codemirror/lang-xml';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { php } from '@codemirror/lang-php';
import { sql } from '@codemirror/lang-sql';
import { rust } from '@codemirror/lang-rust';

const langMap = {
  javascript: javascript, typescript: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }), tsx: () => javascript({ jsx: true, typescript: true }),
  html, css, json, markdown, python, xml, java, cpp, php, sql, rust,
  c: cpp,
};

const extMap = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', jsx: 'jsx', tsx: 'tsx',
  py: 'python', html: 'html', htm: 'html',
  css: 'css', scss: 'css', less: 'css',
  json: 'json', md: 'markdown',
  xml: 'xml', svg: 'xml', yaml: 'plaintext', yml: 'plaintext',
  java: 'java', c: 'c', cpp: 'cpp', h: 'cpp', hpp: 'cpp',
  php: 'php', sql: 'sql', rs: 'rust',
  sh: 'plaintext', bash: 'plaintext',
  rb: 'plaintext', go: 'plaintext',
};

export function guessLang(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return extMap[ext] || 'plaintext';
}

export function getLangLabel(lang) {
  const labels = {
    javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'JSX', tsx: 'TSX',
    python: 'Python', html: 'HTML', css: 'CSS', json: 'JSON', markdown: 'Markdown',
    xml: 'XML', java: 'Java', cpp: 'C++', c: 'C', php: 'PHP', sql: 'SQL', rust: 'Rust',
    plaintext: 'Plain Text',
  };
  return labels[lang] || lang;
}

function getLangExtension(lang) {
  const factory = langMap[lang];
  return factory ? factory() : [];
}

export class CMEditor {
  constructor(container, { onChange, onCursorChange }) {
    this.container = container;
    this.onChange = onChange;
    this.onCursorChange = onCursorChange;
    this.view = null;
    this.fontSize = 14;
    this._showWhitespace = false;
    this._tabSize = 4;
    this._useTabs = false;
    this._whitespaceCpt = new Compartment();
    this._indentCpt = new Compartment();
    this._tabSizeCpt = new Compartment();
    this._bookmarks = new Set();
    this._minimap = null;
    this._minimapEnabled = false;
    this._readOnly = false;
    this._readOnlyCpt = new Compartment();
    this._macroRecording = false;
    this._macroActions = [];
    this._macroSavedList = [];
  }

  create(doc = '', lang = 'plaintext') {
    if (this.view) this.view.destroy();
    this._lastLang = lang;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && this.onChange) {
        this.onChange(update.state.doc.toString());
      }
      if (update.selectionSet && this.onCursorChange) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        const sel = update.state.selection.main;
        const selLen = Math.abs(sel.to - sel.from);
        this.onCursorChange({ line: line.number, col: pos - line.from + 1, selected: selLen });
      }
      if (update.docChanged || update.geometryChanged) {
        this._updateMinimap();
        this._renderBookmarkGutters();
      }
    });

    const state = EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        oneDark,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        getLangExtension(lang),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        EditorView.theme({
          '&': { fontSize: this.fontSize + 'px' },
          '.cm-content': { fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace" },
          '.cm-gutters': { fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: '12px' },
        }),
        ...(this._wordWrap ? [EditorView.lineWrapping] : []),
        this._whitespaceCpt.of(this._showWhitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : []),
        this._indentCpt.of(indentUnit.of(this._useTabs ? '\t' : ' '.repeat(this._tabSize))),
        this._tabSizeCpt.of(EditorState.tabSize.of(this._tabSize)),
        highlightSpecialChars(),
        this._readOnlyCpt.of(EditorState.readOnly.of(this._readOnly)),
        updateListener,
      ],
    });

    this.view = new EditorView({ state, parent: this.container });
  }

  getContent() { return this.view?.state.doc.toString() ?? ''; }

  setContent(text) {
    if (!this.view) return;
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } });
  }

  goToLine(line) {
    if (!this.view) return;
    const info = this.view.state.doc.line(Math.min(line, this.view.state.doc.lines));
    this.view.dispatch({ selection: { anchor: info.from }, scrollIntoView: true });
    this.view.focus();
  }

  doUndo() { if (this.view) undo(this.view); }
  doRedo() { if (this.view) redo(this.view); }

  openFind() { if (this.view) openSearchPanel(this.view); }
  openReplace() { if (this.view) openSearchPanel(this.view); }

  selectAll() {
    if (!this.view) return;
    this.view.dispatch({ selection: { anchor: 0, head: this.view.state.doc.length } });
  }

  duplicateLine() {
    if (!this.view) return;
    const { state } = this.view;
    const line = state.doc.lineAt(state.selection.main.head);
    this.view.dispatch({ changes: { from: line.to, insert: '\n' + line.text } });
  }

  moveLineUp() {
    if (!this.view) return;
    const { state } = this.view;
    const line = state.doc.lineAt(state.selection.main.head);
    if (line.number <= 1) return;
    const prev = state.doc.line(line.number - 1);
    this.view.dispatch({
      changes: { from: prev.from, to: line.to, insert: line.text + '\n' + prev.text },
      selection: { anchor: prev.from + line.text.length - (line.text.length - (state.selection.main.head - line.from)) }
    });
  }

  moveLineDown() {
    if (!this.view) return;
    const { state } = this.view;
    const line = state.doc.lineAt(state.selection.main.head);
    if (line.number >= state.doc.lines) return;
    const next = state.doc.line(line.number + 1);
    this.view.dispatch({
      changes: { from: line.from, to: next.to, insert: next.text + '\n' + line.text },
      selection: { anchor: line.from + next.text.length + 1 + (state.selection.main.head - line.from) }
    });
  }

  toggleComment() { if (this.view) toggleComment(this.view); }
  indent() { if (this.view) indentMore(this.view); }
  unindent() { if (this.view) indentLess(this.view); }

  toUpperCase() {
    if (!this.view) return;
    const { state } = this.view;
    const sel = state.selection.main;
    if (sel.from === sel.to) return;
    const text = state.sliceDoc(sel.from, sel.to);
    this.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text.toUpperCase() } });
  }

  toLowerCase() {
    if (!this.view) return;
    const { state } = this.view;
    const sel = state.selection.main;
    if (sel.from === sel.to) return;
    const text = state.sliceDoc(sel.from, sel.to);
    this.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text.toLowerCase() } });
  }

  toTitleCase() {
    if (!this.view) return;
    const { state } = this.view;
    const sel = state.selection.main;
    if (sel.from === sel.to) return;
    const text = state.sliceDoc(sel.from, sel.to);
    const titled = text.replace(/\b\w/g, c => c.toUpperCase());
    this.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: titled } });
  }

  toSentenceCase() {
    if (!this.view) return;
    const { state } = this.view;
    const sel = state.selection.main;
    if (sel.from === sel.to) return;
    const text = state.sliceDoc(sel.from, sel.to);
    const sentenced = text.toLowerCase().replace(/(^|[.!?]\s+)(\w)/g, (m, p1, p2) => p1 + p2.toUpperCase());
    this.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: sentenced } });
  }

  invertCase() {
    if (!this.view) return;
    const { state } = this.view;
    const sel = state.selection.main;
    if (sel.from === sel.to) return;
    const text = state.sliceDoc(sel.from, sel.to);
    const inverted = [...text].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');
    this.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: inverted } });
  }

  sortLinesAsc() {
    if (!this.view) return;
    const doc = this.getContent();
    const lines = doc.split('\n');
    const sorted = [...lines].sort((a, b) => a.localeCompare(b));
    if (sorted.join('\n') !== doc) this.setContent(sorted.join('\n'));
  }

  sortLinesDesc() {
    if (!this.view) return;
    const doc = this.getContent();
    const lines = doc.split('\n');
    const sorted = [...lines].sort((a, b) => b.localeCompare(a));
    if (sorted.join('\n') !== doc) this.setContent(sorted.join('\n'));
  }

  removeDuplicateLines() {
    if (!this.view) return;
    const doc = this.getContent();
    const lines = doc.split('\n');
    const unique = [...new Set(lines)];
    if (unique.length !== lines.length) this.setContent(unique.join('\n'));
  }

  removeEmptyLines() {
    if (!this.view) return;
    const doc = this.getContent();
    const filtered = doc.split('\n').filter(l => l.trim().length > 0);
    this.setContent(filtered.join('\n'));
  }

  trimTrailingWhitespace() {
    if (!this.view) return;
    const doc = this.getContent();
    const trimmed = doc.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
    if (trimmed !== doc) this.setContent(trimmed);
  }

  trimLeadingWhitespace() {
    if (!this.view) return;
    const doc = this.getContent();
    const trimmed = doc.split('\n').map(l => l.replace(/^\s+/, '')).join('\n');
    if (trimmed !== doc) this.setContent(trimmed);
  }

  splitLines() {
    if (!this.view) return;
    const { state } = this.view;
    const sel = state.selection.main;
    if (sel.from === sel.to) return;
    const text = state.sliceDoc(sel.from, sel.to);
    this.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text.replace(/ /g, '\n') } });
  }

  reverseLines() {
    if (!this.view) return;
    const doc = this.getContent();
    const reversed = doc.split('\n').reverse().join('\n');
    if (reversed !== doc) this.setContent(reversed);
  }

  insertText(text) {
    if (!this.view) return;
    const pos = this.view.state.selection.main.head;
    this.view.dispatch({ changes: { from: pos, insert: text } });
  }

  toggleBlockComment() { if (this.view) toggleBlockComment(this.view); }

  foldAll() { if (this.view) foldAll(this.view); }
  unfoldAll() { if (this.view) unfoldAll(this.view); }

  setReadOnly(on) {
    this._readOnly = on;
    if (!this.view) return;
    this.view.dispatch({ effects: this._readOnlyCpt.reconfigure(EditorState.readOnly.of(on)) });
  }

  isReadOnly() { return this._readOnly; }

  joinLines() {
    if (!this.view) return;
    const { state } = this.view;
    const sel = state.selection.main;
    if (sel.from === sel.to) return;
    const text = state.sliceDoc(sel.from, sel.to);
    this.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text.replace(/\n/g, ' ') } });
  }

  toggleWhitespace() {
    this._showWhitespace = !this._showWhitespace;
    if (!this.view) return;
    this.view.dispatch({ effects: this._whitespaceCpt.reconfigure(
      this._showWhitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : []
    )});
    return this._showWhitespace;
  }

  setIndentation(tabSize, useTabs) {
    this._tabSize = tabSize;
    this._useTabs = useTabs;
    if (!this.view) return;
    this.view.dispatch({ effects: [
      this._indentCpt.reconfigure(indentUnit.of(useTabs ? '\t' : ' '.repeat(tabSize))),
      this._tabSizeCpt.reconfigure(EditorState.tabSize.of(tabSize)),
    ]});
  }

  getStats() {
    if (!this.view) return { lines: 0, words: 0, chars: 0 };
    const doc = this.view.state.doc.toString();
    return {
      lines: this.view.state.doc.lines,
      words: doc.split(/\s+/).filter(w => w.length > 0).length,
      chars: doc.length,
    };
  }

  zoom(delta) {
    this.fontSize = Math.max(8, Math.min(32, this.fontSize + delta));
    if (!this.view) return;
    const el = this.container.querySelector('.cm-editor');
    if (el) el.style.fontSize = this.fontSize + 'px';
    this.view.requestMeasure();
  }

  setWordWrap(on) {
    this._wordWrap = on;
    if (!this.view) return;
    const doc = this.getContent();
    const cursor = this.view.state.selection.main.head;
    this.view.destroy();
    this.view = null;
    this.create(doc, this._lastLang || 'plaintext');
    try {
      this.view.dispatch({ selection: { anchor: Math.min(cursor, this.view.state.doc.length) } });
    } catch {}
  }

  // ─── Macro Recording ───────────────────────────────────────────────
  startMacro() {
    this._macroRecording = true;
    this._macroActions = [];
    if (!this.view) return;
    this._macroInitDoc = this.getContent();
    this._macroInitCursor = this.view.state.selection.main.head;
  }

  stopMacro() {
    this._macroRecording = false;
    return this._macroActions;
  }

  isRecording() { return this._macroRecording; }

  playMacro(actions) {
    if (!this.view || !actions || actions.length === 0) return;
    for (const action of actions) {
      if (action.type === 'insert') this.insertText(action.text);
      else if (action.type === 'delete') {
        const pos = this.view.state.selection.main.head;
        this.view.dispatch({ changes: { from: Math.max(0, pos - 1), to: pos } });
      }
    }
  }

  saveMacro(name) {
    this._macroSavedList.push({ name, actions: [...this._macroActions] });
  }

  getSavedMacros() { return this._macroSavedList; }

  // ─── Bookmarks ────────────────────────────────────────────────────
  toggleBookmark() {
    if (!this.view) return;
    const line = this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
    if (this._bookmarks.has(line)) this._bookmarks.delete(line);
    else this._bookmarks.add(line);
    this._renderBookmarkGutters();
    return { line, added: this._bookmarks.has(line) };
  }

  nextBookmark() {
    if (!this.view || this._bookmarks.size === 0) return;
    const cur = this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
    const sorted = [...this._bookmarks].sort((a, b) => a - b);
    const next = sorted.find(l => l > cur) || sorted[0];
    this.goToLine(next);
  }

  prevBookmark() {
    if (!this.view || this._bookmarks.size === 0) return;
    const cur = this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
    const sorted = [...this._bookmarks].sort((a, b) => b - a);
    const prev = sorted.find(l => l < cur) || sorted[0];
    this.goToLine(prev);
  }

  clearBookmarks() { this._bookmarks.clear(); this._renderBookmarkGutters(); }
  getBookmarks() { return [...this._bookmarks].sort((a, b) => a - b); }

  _renderBookmarkGutters() {
    // Visual indicator: highlight bookmarked line numbers in the gutter
    if (!this.view) return;
    const gutterEls = this.container.querySelectorAll('.cm-gutterElement');
    gutterEls.forEach(el => {
      const num = parseInt(el.textContent, 10);
      if (this._bookmarks.has(num)) {
        el.style.background = 'rgba(86,156,214,0.3)';
        el.style.borderLeft = '3px solid #569cd6';
      } else {
        el.style.background = '';
        el.style.borderLeft = '';
      }
    });
  }

  // ─── Minimap ──────────────────────────────────────────────────────
  toggleMinimap() {
    this._minimapEnabled = !this._minimapEnabled;
    if (this._minimapEnabled) this._createMinimap();
    else this._destroyMinimap();
    return this._minimapEnabled;
  }

  _createMinimap() {
    if (this._minimap) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'minimap-container';
    const canvas = document.createElement('canvas');
    canvas.className = 'minimap-canvas';
    canvas.width = 80;
    canvas.height = 600;
    wrapper.appendChild(canvas);
    this.container.appendChild(wrapper);
    this._minimap = { wrapper, canvas };

    canvas.addEventListener('click', (e) => {
      if (!this.view) return;
      const ratio = e.offsetY / canvas.height;
      const targetLine = Math.floor(ratio * this.view.state.doc.lines) + 1;
      this.goToLine(Math.min(targetLine, this.view.state.doc.lines));
    });

    this._updateMinimap();
  }

  _destroyMinimap() {
    if (this._minimap) {
      this._minimap.wrapper.remove();
      this._minimap = null;
    }
  }

  _updateMinimap() {
    if (!this._minimap || !this.view) return;
    const { canvas } = this._minimap;
    const ctx = canvas.getContext('2d');
    const doc = this.view.state.doc;
    const totalLines = doc.lines;
    canvas.height = Math.max(200, Math.min(this.container.clientHeight, 800));

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const lineHeight = canvas.height / Math.max(totalLines, 1);
    const colors = ['#569cd6', '#d4d4d4', '#ce9178', '#6a9955', '#c586c0', '#dcdcaa'];

    for (let i = 1; i <= totalLines; i++) {
      const line = doc.line(i);
      const text = line.text;
      if (text.trim().length === 0) continue;
      const indent = text.match(/^\s*/)[0].length;
      const textLen = Math.min(text.length, 80);
      const y = (i - 1) * lineHeight;
      const color = colors[i % colors.length];
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(indent * 0.8, y, Math.max(textLen * 0.8, 2), Math.max(lineHeight, 1));
    }

    // Viewport indicator
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#fff';
    const scrollInfo = this.view.scrollDOM;
    const viewTop = scrollInfo.scrollTop / scrollInfo.scrollHeight;
    const viewHeight = scrollInfo.clientHeight / scrollInfo.scrollHeight;
    ctx.fillRect(0, viewTop * canvas.height, canvas.width, viewHeight * canvas.height);
    ctx.globalAlpha = 1;

    // Bookmark markers
    for (const bLine of this._bookmarks) {
      const y = (bLine - 1) * lineHeight;
      ctx.fillStyle = '#569cd6';
      ctx.fillRect(0, y, 3, Math.max(lineHeight, 2));
    }
  }

  focus() { this.view?.focus(); }
  destroy() {
    this._destroyMinimap();
    this.view?.destroy();
    this.view = null;
  }
}
