# Web Notepad Plus — Feature Comparison & Production Plan

## Complete Feature Comparison: Notepad++ Desktop vs Web Edition

### Legend
- ✅ = Implemented | ⚠️ = Partial | ❌ = Missing | 🚫 = N/A (web limitation)

---

## 1. FILE MENU

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 1 | New | ✅ | ✅ Ctrl+N | ✅ |
| 2 | Open Single File | ✅ | ✅ Ctrl+O + fallback | ✅ |
| 3 | Open Multiple Files | ✅ | ❌ | ❌ |
| 4 | Open Folder | ✅ | ✅ FS Access API | ✅ |
| 5 | Open from Backend/Remote | ❌ | ✅ FastAPI integration | ✅ |
| 6 | Reload from Disk | ✅ | ❌ | ❌ |
| 7 | Save | ✅ | ✅ Ctrl+S | ✅ |
| 8 | Save As | ✅ | ✅ Ctrl+Shift+S | ✅ |
| 9 | Save Copy As | ✅ | ❌ | ❌ |
| 10 | Save All | ✅ | ✅ | ✅ |
| 11 | Rename File | ✅ | ⚠️ Tab rename only | ⚠️ |
| 12 | Close Tab | ✅ | ✅ Ctrl+W | ✅ |
| 13 | Close All | ✅ | ✅ | ✅ |
| 14 | Close All BUT This | ✅ | ✅ via context menu | ✅ |
| 15 | Close to Right | ✅ | ✅ via context menu | ✅ |
| 16 | Recent Files Submenu | ✅ | ⚠️ Tracked but no UI | ⚠️ |
| 17 | Print / Print Preview | ✅ | ❌ | ❌ |
| 18 | Delete from Disk | ✅ | ❌ | ❌ |
| 19 | Exit Prompt | ✅ | ⚠️ beforeunload only | ⚠️ |

## 2. EDIT MENU

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 20 | Undo / Redo | ✅ | ✅ Ctrl+Z / Ctrl+Y | ✅ |
| 21 | Cut / Copy / Paste | ✅ | ✅ | ✅ |
| 22 | Select All | ✅ | ✅ Ctrl+A | ✅ |
| 23 | Duplicate Line | ✅ | ✅ Ctrl+D | ✅ |
| 24 | Move Line Up/Down | ✅ | ✅ Alt+↑/↓ | ✅ |
| 25 | Toggle Comment | ✅ | ✅ Ctrl+/ | ✅ |
| 26 | Block Comment | ✅ | ❌ | ❌ |
| 27 | UPPERCASE | ✅ | ✅ Ctrl+Shift+U | ✅ |
| 28 | lowercase | ✅ | ✅ Ctrl+U | ✅ |
| 29 | Title Case | ✅ | ❌ | ❌ |
| 30 | Sentence case | ✅ | ❌ | ❌ |
| 31 | Invert case | ✅ | ❌ | ❌ |
| 32 | Indent / Unindent | ✅ | ✅ Tab / Shift+Tab | ✅ |
| 33 | Trim Trailing Spaces | ✅ | ✅ | ✅ |
| 34 | Trim Leading Spaces | ✅ | ❌ | ❌ |
| 35 | Sort Lines (Asc/Desc) | ✅ | ✅ | ✅ |
| 36 | Remove Duplicate Lines | ✅ | ✅ | ✅ |
| 37 | Remove Empty Lines | ✅ | ✅ | ✅ |
| 38 | Join Lines | ✅ | ✅ | ✅ |
| 39 | Split Lines | ✅ | ❌ | ❌ |
| 40 | Reverse Line Order | ✅ | ❌ | ❌ |
| 41 | Column / Block Editor | ✅ | ❌ | ❌ |
| 42 | Read-Only Mode | ✅ | ❌ | ❌ |
| 43 | Insert Date/Time | ✅ | ❌ | ❌ |
| 44 | Copy Current File Path | ✅ | ✅ Tab context menu | ✅ |
| 45 | Copy Filename | ✅ | ✅ Tab context menu | ✅ |
| 46 | Character Panel | ✅ | ❌ | ❌ |
| 47 | Clipboard History | ✅ | ❌ | ❌ |
| 48 | Paste as HTML/RTF | ✅ | ❌ | ❌ |
| 49 | Format Document | ❌ | ✅ Prettier worker | ✅ |
| 50 | Run Linter | ❌ | ✅ ESLint worker | ✅ |

## 3. SEARCH MENU

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 51 | Find | ✅ | ✅ Ctrl+F (CodeMirror) | ✅ |
| 52 | Replace | ✅ | ✅ Ctrl+H | ✅ |
| 53 | Find Next / Previous | ✅ | ✅ CodeMirror built-in | ✅ |
| 54 | Go to Line | ✅ | ✅ Ctrl+G | ✅ |
| 55 | Find in Files | ✅ | ✅ Backend search | ✅ |
| 56 | Regex Search | ✅ | ✅ CodeMirror built-in | ✅ |
| 57 | Mark / Highlight All | ✅ | ⚠️ CM highlight matches | ⚠️ |
| 58 | Incremental Search | ✅ | ✅ CodeMirror built-in | ✅ |
| 59 | Count Occurrences | ✅ | ❌ | ❌ |
| 60 | Bookmark Matching Lines | ✅ | ❌ | ❌ |
| 61 | Find/Replace in Selection | ✅ | ❌ | ❌ |
| 62 | Select All Occurrences | ✅ | ❌ | ❌ |

## 4. VIEW MENU

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 63 | Word Wrap | ✅ | ✅ | ✅ |
| 64 | Show Whitespace | ✅ | ✅ | ✅ |
| 65 | Show Line Endings | ✅ | ❌ | ❌ |
| 66 | Zoom In/Out | ✅ | ✅ Ctrl++/- | ✅ |
| 67 | Fold All / Unfold All | ✅ | ❌ (individual folding works) | ❌ |
| 68 | Toggle Sidebar | N/A | ✅ Ctrl+B | ✅ |
| 69 | Minimap / Document Map | ✅ | ✅ Canvas-based | ✅ |
| 70 | Full Screen Mode | ✅ | ❌ | ❌ |
| 71 | Always on Top | ✅ | 🚫 | 🚫 |
| 72 | Split Editor View | ✅ | ❌ | ❌ |
| 73 | Synchronized Scrolling | ✅ | ❌ | ❌ |
| 74 | Summary / Doc Stats | ✅ | ✅ Status bar | ✅ |
| 75 | Toggle Bottom Panels | N/A | ✅ | ✅ |

## 5. ENCODING

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 76 | EOL Conversion (CRLF/LF) | ✅ | ✅ | ✅ |
| 77 | Show Encoding in Status | ✅ | ✅ Fixed UTF-8 | ⚠️ |
| 78 | Convert Encoding | ✅ | ❌ | ❌ |
| 79 | BOM Handling | ✅ | ❌ | ❌ |

## 6. LANGUAGE / SYNTAX

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 80 | Syntax Highlighting | ✅ 80+ langs | ✅ 17 languages | ⚠️ |
| 81 | Language Auto-detect | ✅ | ✅ By extension | ✅ |
| 82 | Change Language | ✅ | ✅ Click status bar | ✅ |
| 83 | User Defined Language | ✅ | ❌ | ❌ |
| 84 | Language Menu | ✅ | ✅ Full menu | ✅ |

## 7. BOOKMARKS

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 85 | Toggle Bookmark | ✅ | ✅ Ctrl+F2 | ✅ |
| 86 | Next/Previous Bookmark | ✅ | ✅ F2 / Shift+F2 | ✅ |
| 87 | Clear All Bookmarks | ✅ | ✅ | ✅ |
| 88 | List Bookmarks | ✅ | ✅ Output panel | ✅ |
| 89 | Bookmark Gutter Markers | ✅ | ✅ Blue highlight | ✅ |

## 8. MACRO

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 90 | Record Macro | ✅ | ❌ | ❌ |
| 91 | Playback Macro | ✅ | ❌ | ❌ |
| 92 | Save / Load Macros | ✅ | ❌ | ❌ |
| 93 | Run Multiple Times | ✅ | ❌ | ❌ |

## 9. RUN / EXECUTE

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 94 | Run External Program | ✅ | ❌ | ❌ |
| 95 | Integrated Terminal | ❌ | ❌ | ❌ |

## 10. SETTINGS / PREFERENCES

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 96 | Preferences Dialog | ✅ | ✅ Modal dialog | ✅ |
| 97 | Font Size | ✅ | ✅ Slider + zoom | ✅ |
| 98 | Tab Size | ✅ | ✅ 2/4/8 | ✅ |
| 99 | Tabs vs Spaces | ✅ | ✅ | ✅ |
| 100 | Theme Switching | ✅ | ❌ Dark only | ❌ |
| 101 | Shortcut Mapper | ✅ | ❌ | ❌ |
| 102 | Persist Preferences | ✅ | ❌ Session only | ❌ |

## 11. TABS & UI

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 103 | Multi-tab Editing | ✅ | ✅ | ✅ |
| 104 | Tab Context Menu | ✅ | ✅ Full menu | ✅ |
| 105 | Tab Drag Reorder | ✅ | ❌ | ❌ |
| 106 | Tab Scroll (overflow) | ✅ | ❌ | ❌ |
| 107 | Dirty Indicator | ✅ | ✅ ● marker | ✅ |
| 108 | Toolbar | ✅ | ✅ Emoji icons | ✅ |
| 109 | Status Bar | ✅ | ✅ Full info | ✅ |
| 110 | Menu Bar | ✅ | ✅ 8 menus | ✅ |

## 12. OTHER FEATURES

| # | Feature | N++ Desktop | Web Edition | Status |
|---|---------|:-----------:|:-----------:|:------:|
| 111 | Drag & Drop Files | ✅ | ✅ Visual overlay | ✅ |
| 112 | Session Persistence | ✅ | ✅ localStorage | ✅ |
| 113 | Bracket Matching | ✅ | ✅ CodeMirror | ✅ |
| 114 | Code Folding | ✅ | ✅ CodeMirror | ✅ |
| 115 | Auto-completion | ✅ | ✅ CodeMirror | ✅ |
| 116 | Auto-close Brackets | ✅ | ✅ | ✅ |
| 117 | Rectangular Selection | ✅ | ✅ CodeMirror | ✅ |
| 118 | Recent Files | ✅ | ⚠️ Tracked, no menu | ⚠️ |
| 119 | File Explorer | ✅ | ✅ Sidebar | ✅ |
| 120 | Compare / Diff | ✅ (plugin) | ❌ | ❌ |
| 121 | Spell Checker | ✅ (plugin) | ❌ | ❌ |

## 13. PRODUCTION READINESS

| # | Feature | Status |
|---|---------|:------:|
| 122 | Error Boundaries | ❌ |
| 123 | Loading States / Spinners | ❌ |
| 124 | Empty State UX | ⚠️ |
| 125 | Accessibility (ARIA) | ❌ |
| 126 | Keyboard Navigation in Menus | ❌ |
| 127 | Mobile / Responsive | ❌ |
| 128 | PWA (Offline, Installable) | ❌ |
| 129 | Large File Performance | ❌ |
| 130 | Light Theme | ❌ |
| 131 | Print Stylesheet | ❌ |
| 132 | Build Optimization | ❌ |
| 133 | beforeunload Warning | ❌ |
| 134 | Tab Overflow Scroll | ❌ |

---

## SCORE SUMMARY (After All 4 Phases)

| Category | Total | ✅ Done | ⚠️ Partial | ❌ Missing | 🚫 N/A |
|----------|:-----:|:------:|:----------:|:---------:|:------:|
| File | 19 | 17 | 1 | 1 | 0 |
| Edit | 31 | 31 | 0 | 0 | 0 |
| Search | 12 | 6 | 1 | 5 | 0 |
| View | 13 | 12 | 0 | 0 | 1 |
| Encoding | 4 | 1 | 1 | 2 | 0 |
| Language | 5 | 4 | 1 | 0 | 0 |
| Bookmarks | 5 | 5 | 0 | 0 | 0 |
| Macro | 4 | 4 | 0 | 0 | 0 |
| Run | 2 | 0 | 0 | 2 | 0 |
| Settings | 7 | 6 | 0 | 1 | 0 |
| Tabs & UI | 8 | 8 | 0 | 0 | 0 |
| Other | 11 | 9 | 1 | 1 | 0 |
| Production | 13 | 7 | 1 | 5 | 0 |
| **TOTAL** | **134** | **110 (82%)** | **6 (4%)** | **17 (13%)** | **1** |

### Improvement: 57% → 82% feature coverage (+25%)

---

## PRODUCTION PLAN — 4 Phases

### Phase 1: Production Polish (Critical — Week 1)
> Make the existing features bulletproof

1. **beforeunload warning** — prevent accidental data loss
2. **Tab overflow scrolling** — horizontal scroll when many tabs open
3. **Recent Files submenu** — File > Recent Files with stored history
4. **Error boundaries** — try/catch around all async operations, user-friendly messages
5. **Loading states** — spinner for file open, folder scan, backend calls
6. **Persist preferences** — save font size, tab size, EOL, wrap, whitespace to localStorage
7. **Open multiple files** — allow multi-select in file picker
8. **Reload from disk** — re-read the file handle
9. **Full screen mode** — F11 toggle via Fullscreen API
10. **Print support** — Ctrl+P with print stylesheet

### Phase 2: Missing Core N++ Features (High — Week 2)
> Close the biggest gaps with real Notepad++

11. **Title Case / Sentence Case / Invert Case** — additional case conversions
12. **Trim Leading Spaces** — complement to trailing
13. **Split Lines / Reverse Lines** — additional line operations
14. **Insert Date/Time** — Edit menu
15. **Read-Only mode toggle** — lock editor
16. **Count occurrences** — show match count in search
17. **Select All Occurrences** — Ctrl+Shift+L
18. **Fold All / Unfold All** — View menu
19. **Show Line Endings** — visualize CR/LF
20. **Block Comment** — Ctrl+Shift+/ for multi-line comments
21. **Tab drag reorder** — HTML5 drag API on tabs
22. **Light/Dark theme toggle** — dual theme support

### Phase 3: Advanced Features (Medium — Week 3)
> Power user features from N++

23. **Macro Record/Playback** — record keystrokes, replay
24. **Split Editor** — side-by-side view of same or different file
25. **Column / Block Editor** — column mode editing
26. **Diff/Compare** — side-by-side file comparison
27. **Find/Replace in Selection** — scope search to selection
28. **Bookmark matching lines** — bookmark all search results
29. **Shortcut Mapper** — customizable keyboard shortcuts
30. **Encoding conversion** — UTF-8, UTF-16, ANSI switch

### Phase 4: PWA & Production Deploy (High — Week 4)
> Ship-ready product

31. **PWA manifest + Service Worker** — offline capable, installable
32. **Accessibility (ARIA)** — screen reader support, focus management
33. **Keyboard navigation** — arrow keys in menus, focus traps in dialogs
34. **Mobile responsive** — touch-friendly UI adaptations
35. **Build optimization** — Vite production build, code splitting, minification
36. **Large file performance** — virtual scrolling, lazy loading for 100k+ line files
37. **Comprehensive error handling** — network failures, quota exceeded, permission denied
38. **SEO/Meta tags** — OpenGraph, description, proper title
39. **Documentation** — README, usage guide, keyboard shortcut reference

---

## Priority Matrix

```
          IMPACT
    High ┃ Phase 1    Phase 4
         ┃ (Polish)   (PWA/Deploy)
         ┃
         ┃ Phase 2    Phase 3
    Low  ┃ (Core)     (Advanced)
         ┗━━━━━━━━━━━━━━━━━━━━━
           Low         High
                EFFORT
```

## Estimated Effort

| Phase | Items | Est. Time | Priority |
|-------|:-----:|:---------:|:--------:|
| Phase 1 — Production Polish | 10 | 2-3 days | **CRITICAL** |
| Phase 2 — Missing Core | 12 | 3-4 days | **HIGH** |
| Phase 3 — Advanced | 8 | 4-5 days | **MEDIUM** |
| Phase 4 — PWA & Deploy | 9 | 3-4 days | **HIGH** |
| **Total** | **39** | **~2-3 weeks** | |
