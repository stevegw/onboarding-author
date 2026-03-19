# CLAUDE.md — Authoring Platform

This file provides guidance to Claude Code when working with this repository.

## Project Overview

A browser-based eLearning authoring tool for creating PTC training courses. Authors populate skeleton templates (Windchill, Codebeamer, Creo) with content, then export **OB-compatible JSON** that drops directly into the [onboarding player repo](https://github.com/stevegw/onboarding) at `docs/courses/`.

**Tech stack:** Vanilla JavaScript + HTML + CSS. No frameworks, no build step, no server required.  
**Deploys to:** GitHub Pages via `.github/workflows/deploy.yml` (triggers on push to `main`).  
**Local dev:** `python server.py` → `http://localhost:8060` (or `start.bat` on Windows).

## Running Locally

```bash
cd authoring-platform
python server.py          # http://localhost:8060
# Windows: double-click start.bat
```

`fetch()` is used to load skeleton JSON files — a local server is recommended over `file://`.

## Architecture

### Namespace: `window.AP`

All JS uses IIFE module pattern attaching to `window.AP`. **Script load order in `index.html` matters:**

```
ui.js → state.js → catalog.js → catalog-view.js → blocks.js → tree.js → editor.js → export.js → narration.js → router.js
```

| Module | File | Purpose |
|--------|------|---------|
| `AP.ui` | `js/ui.js` | DOM helpers (`qs`, `el`), toast, confirm/prompt modals, theme toggle, undo bar init |
| `AP.state` | `js/state.js` | localStorage persistence + 10-step undo/redo stack |
| `AP.catalog` | `js/catalog.js` | Product definitions (Windchill, Codebeamer, Creo) + skeleton loader |
| `AP.catalogView` | `js/catalog-view.js` | Catalog home: product cards + saved projects grid |
| `AP.blocks` | `js/blocks.js` | Content block editors for all 9 OB block types |
| `AP.tree` | `js/tree.js` | Module/topic tree panel with drag-drop reorder |
| `AP.editor` | `js/editor.js` | Topic content editor (meta bar, blocks, takeaways) |
| `AP.exportMgr` | `js/export.js` | OB-compatible ZIP export + raw JSON import |
| `AP.narration` | `js/narration.js` | TTS preview via Web Speech API |
| `AP.router` | `js/router.js` | View switcher: `catalog` ↔ `editor` |

### Views

Two views toggled by `AP.router.go(view, param)`:

- `view-catalog` — home page, rendered by `AP.catalogView.render()`
- `view-editor` — split-pane editor (module tree left, content right), opened with a project ID

### File Structure

```
authoring-platform/
  index.html                  ← app shell, script tags, inline init
  server.py                   ← local static server (port 8060)
  start.bat                   ← Windows double-click launcher
  css/
    variables.css             ← PTC color tokens, dark + light themes
    main.css                  ← all styles (no separate component files)
  js/
    ui.js                     ← DOM helpers, toast, modal, theme
    state.js                  ← localStorage + undo/redo
    catalog.js                ← product definitions + skeleton fetch
    catalog-view.js           ← catalog home renderer
    blocks.js                 ← all 9 block type editors
    tree.js                   ← module tree + drag-drop
    editor.js                 ← topic content editor
    export.js                 ← OB ZIP export + JSON import
    narration.js              ← TTS preview (Web Speech API)
    router.js                 ← view switcher
  data/
    windchill.json            ← Windchill skeleton (4 modules, 16 topics)
    codebeamer.json           ← Codebeamer skeleton (4 modules, 17 topics)
    creo.json                 ← Creo skeleton (4 modules, 16 topics)
  .github/
    workflows/deploy.yml      ← GitHub Actions Pages deploy on push to main
  .nojekyll                   ← required for GitHub Pages to serve data/ folder
```

## State Management (`js/state.js`)

### Storage

- `ap_projects` — registry of all projects `{ [id]: { id, name, product, createdAt, updatedAt } }`
- `ap_project_{id}` — full project JSON per project

### Undo Stack

- Max 10 snapshots (configurable via `MAX_UNDO`)
- Deduplication: consecutive identical states are skipped via `_lastSnapshot` comparison
- Two commit patterns — **always use the right one:**

```javascript
// Structural changes (add/delete/reorder) — records undo entry:
AP.state.commitChange(function (project) {
  project.modules.push(newModule);
}, 'add-module');

// Text edits / auto-save — persists WITHOUT recording undo:
AP.state.persistOnly();
```

Using `commitChange` for every keystroke will exhaust the undo stack in seconds. Text fields should debounce and call `persistOnly()`.

### Public API

```javascript
AP.state.createProject(name, product, skeleton)  → project
AP.state.openProject(id)                          → project (clears undo stack)
AP.state.deleteProject(id)
AP.state.getAllProjects()                          → array sorted by updatedAt desc
AP.state.getCurrentProject()                      → current project or null
AP.state.commitChange(mutatorFn, label)            // snapshot + mutate + persist
AP.state.persistOnly()                             // persist only, no undo entry
AP.state.undo()                                   → restored project or false
AP.state.redo()                                   → restored project or false
AP.state.canUndo()                                → boolean
AP.state.canRedo()                                → boolean
AP.state.onUndoChange(callback)                   // cb(canUndo, canRedo, histLen)
```

## Content Block Schemas (`js/blocks.js`)

The OB player's `topic.js` renderer expects **exact property names**. Wrong keys cause silent failures. These schemas must be matched exactly on export:

```
paragraph:         { type, text }
heading:           { type, level (2|3), text }
callout:           { type, variant ("tip"|"info"|"warning"|"insight"), text }
comparison-table:  { type, headers: string[], rows: string[][] }
reveal-cards:      { type, cards: [{ front, back }] }
interactive-match: { type, prompt, pairs: [{ left, right }] }
interactive-sort:  { type, prompt, items: string[] }   ← key is "items" NOT "correctOrder"
image:             { type, src, alt, caption, size ("small"|"medium"|"large"|"full") }
exercise:          { type, exerciseId, title, objective,
                     tasks: [{ id, title,
                       steps: [{ action, detail, hint }] }] }
```

### Block Editor Pattern

Each block type has a dedicated `_xxxEditor(block, onChange)` function that:
1. Returns a real DOM element (NOT a `DocumentFragment` — fragments don't support `innerHTML`)
2. Mutates `block` properties in-place on user input
3. Calls `onChange()` to trigger a debounced `persistOnly()`

When adding a new block type, add it to both `BLOCK_TYPES` array and `defaultBlock()` map and `_buildBlockEditor()` switch in `blocks.js`.

## Module Tree (`js/tree.js`)

- Renders into `#module-tree`
- Drag-drop reorder for both modules (whole group) and topics (within a module)
- Each `dragstart` sets `_dragSrc = { type, id, moduleId? }`
- `AP.tree.render(project)` — full re-render
- `AP.tree.selectTopic(topicId, moduleId)` — highlights item and calls `AP.editor.loadTopic()`
- Topic fill dot: green dot appears when `topic.content.length > 0`

## Editor (`js/editor.js`)

- `AP.editor.loadTopic(topicId, moduleId)` — full render of topic into `#editor-body`
- `AP.editor.reload(project)` — re-render after undo/redo without losing topic selection
- `AP.editor.showPlaceholder()` — show "select a topic" state
- Debounce: 700ms for text input before `persistOnly()` is called
- Title input also updates the tree in real-time via `AP.tree.render()`

## Export (`js/export.js`)

`AP.exportMgr.exportProject()` builds OB-compatible output:

```
{course-id}/
  course.json       ← module list with contentFile + quizFile paths
  glossary.json     ← empty stub (terms: [])
  modules/
    {module-slug}.json    ← full topic content with re-indexed IDs
  quizzes/
    q{n}-{slug}.json      ← empty stub (questions: [])
```

IDs are re-indexed on export (`m1`, `m1t1`, etc.) regardless of internal IDs. Requires JSZip (loaded from CDN on demand). Falls back to single `course.json` download if CDN fails.

`AP.exportMgr.importProject(file)` — reads a raw AP project JSON and creates a new project from it.

## CSS Architecture (`css/`)

Single `main.css` file — no component splitting. Uses CSS custom properties from `variables.css`.

### Theme System

- `data-theme="dark"` / `data-theme="light"` on `<html>` — toggled by `AP.ui.toggleTheme()`
- Persisted to `localStorage` as `ap_theme`
- PTC color palette: accent green `#69be28` (dark) / `#4d8f1e` (light), Raleway + Open Sans fonts

### Key CSS Classes

```css
.view          — hidden by default; .view.active = shown
.editor-view   — flex row containing .editor-panel-left + .editor-content
.content-block — each block in the editor (header + body)
.module-group  — draggable module container in tree
.topic-item    — individual topic row; .active = selected; .exercise-topic = exercise
.topic-fill-dot.filled — green dot when topic has content
.undo-bar.visible — slides up from bottom when undo is available
.project-progress-bar — completion bar on catalog cards
```

## Narration (`js/narration.js`)

- Uses `window.speechSynthesis` (Web Speech API) — no external dependency
- Filters to English voices only (`v.lang.startsWith('en')`)
- Renders a panel at the bottom of `#sidebar` with play/stop/voice/rate controls
- `_extractText()` — finds the active topic by matching `topic.title` against `.topic-title-input` value, then walks all blocks extracting plain text (strips HTML tags)
- Only initialised if `AP.narration.isSupported()` returns true

## OB Player Compatibility

This platform outputs JSON consumed by the [onboarding player](https://github.com/stevegw/onboarding). Key compatibility rules:

- `course.json` must have `id`, `title`, `description`, `prerequisite`, `modules[]`
- Each module entry needs `id`, `title`, `description`, `estimatedMinutes`, `topicCount`, `contentFile`, `quizFile`, and optionally `exerciseTopicStart`
- Module JSON must have `id`, `title`, `description`, `topics[]`
- Each topic needs `id`, `title`, `estimatedMinutes`, `content[]`, `keyTakeaways[]`, optionally `isExercise: true`
- Topic IDs in OB format: `m1t1`, `m2t3` etc. — re-indexed on export regardless of internal IDs

## What's Not Yet Built

These features are planned but not implemented:

1. **Quiz editor** — author `q{n}-*.json` files with multiple-choice questions per module
2. **Glossary editor** — term/definition pairs for `glossary.json`  
3. **SCORM export** — SCORM 1.2/2004 ZIP packager (stub button exists in export)
4. **AI content assist** — call Anthropic API to draft paragraph/callout text from a topic title
5. **Build bundles** — client-side equivalent of `build-bundles.py` to produce `bundles/en.js` for `file://` compatibility
6. **Block narration preview** — play TTS for a single selected block rather than the whole topic
7. **User progress / motivation** — streak tracking, badges, completion celebrations (exists in OB player; not yet in authoring platform)
8. **Multi-language content** — UI for authoring locale variants (`fr/`, `de/`, `ja/` etc.)

## Adding a New Product Template

1. Create `data/{product-id}.json` following the structure of `data/codebeamer.json`
   - Must have `id`, `product`, `title`, `description`, `modules[]`
   - Each module needs `id`, `title`, `description`, `estimatedMinutes`, `topics[]`
   - Each topic needs `id`, `title`, `estimatedMinutes`, `content: []`, `keyTakeaways: []`
   - Exercise topics add `"isExercise": true`

2. Add product definition to `PRODUCTS` array in `js/catalog.js`:
   ```javascript
   {
     id: 'product-id',
     name: 'Display Name',
     tagline: 'Short tagline',
     icon: '🔧',
     color: '#hexcolor',
     colorDim: 'rgba(r,g,b,0.12)',
     colorBorder: 'rgba(r,g,b,0.25)',
     description: 'One sentence description.',
     file: 'data/product-id.json'
   }
   ```

3. No other changes needed — the catalog view and skeleton loader pick it up automatically.

## Adding a New Block Type

1. Add entry to `BLOCK_TYPES` array in `js/blocks.js`
2. Add default structure to `defaultBlock()` map
3. Add case to `_buildBlockEditor()` switch calling a new `_xxxEditor(block, onChange)` function
4. Add case to `_blockText()` in `js/narration.js` for TTS extraction
5. Add case to OB player's `topic.js` renderer (in the onboarding repo) to render it

## Common Patterns

### Committing a structural change

```javascript
AP.state.commitChange(function (project) {
  var mod = project.modules.find(function (m) { return m.id === moduleId; });
  if (mod) mod.topics.push(newTopic);
}, 'add-topic');
AP.tree.render(AP.state.getCurrentProject());
AP.ui.toast('Topic added', 'success');
```

### Debounced text auto-save

```javascript
var _saveTimer;
inputEl.oninput = function () {
  block.text = inputEl.value; // mutate in-place immediately
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function () {
    AP.state.persistOnly(); // save without undo entry
  }, 700);
};
```

### Reload after undo/redo

```javascript
var restored = AP.state.undo();
if (restored) {
  AP.editor.reload(restored);    // re-renders active topic
  AP.tree.render(restored);      // re-renders tree
  AP.ui.toast('Undone', 'info');
}
```

### Adding a modal action

```javascript
AP.ui.confirm('Delete module?', 'This cannot be undone.', function () {
  // confirmed callback
  AP.state.commitChange(function (p) { /* mutate */ }, 'delete-module');
  AP.tree.render(AP.state.getCurrentProject());
}, true /* danger = red button */);

AP.ui.prompt('Rename', 'New name', function (value) {
  // submit callback — value is trimmed, non-empty string
}, 'Default value');
```
