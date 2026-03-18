# PTC eLearning Authoring Platform

A browser-based authoring tool for creating PTC training courses compatible with the [onboarding player](https://github.com/stevegw/onboarding).

## Quick Start

```bash
# Serve locally (any static server works — no API needed)
cd authoring-platform
python -m http.server 8060
# Open http://localhost:8060
```

Or just open `index.html` directly in a browser — all data is loaded via `fetch()` so a local server is recommended.

## What it does

- **Create projects** from Windchill, Codebeamer, or Creo skeleton templates
- **Edit topics** with the full OB content block schema (paragraph, heading, callout, comparison-table, reveal-cards, interactive-match, interactive-sort, image, exercise)
- **Reorder modules and topics** via drag and drop
- **Add / delete** modules, topics, and content blocks
- **Undo / redo** up to 10 actions (Ctrl+Z / Ctrl+Y)
- **Export** an OB-compatible ZIP (course.json + module JSONs + quiz stubs + glossary stub)
- **Save** raw project JSON for re-import
- Light and dark theme

## Output format

The export produces a folder structure matching the OB player exactly:

```
{course-id}/
  course.json
  glossary.json
  modules/
    {module-slug}.json
  quizzes/
    q1-{slug}.json
    ...
```

Place this folder inside `docs/courses/` in the onboarding repo, then follow the "Adding a New Course" steps in `CLAUDE.md`.

## GitHub Pages deployment

Push the `authoring-platform/` folder to a `gh-pages` branch:

```bash
git subtree push --prefix authoring-platform origin gh-pages
```

Or configure GitHub Pages to serve from `/authoring-platform` on `main`.

## Content block schemas

All blocks match the OB player's `topic.js` renderer exactly. Click **Block Schema Reference** in the sidebar for a quick reference, or see `CLAUDE.md` in the onboarding repo.

## Undo

The undo stack holds the last 10 committed actions. Edits to text fields auto-commit after 800ms of inactivity. The undo bar appears at the bottom of the screen after any change. Keyboard shortcuts: `Ctrl+Z` to undo, `Ctrl+Y` or `Ctrl+Shift+Z` to redo.

## File structure

```
authoring-platform/
  index.html          — app shell
  css/
    variables.css     — PTC color tokens (dark + light)
    main.css          — all styles
  js/
    ui.js             — DOM helpers, toast, modal, theme
    state.js          — localStorage + undo/redo
    catalog.js        — product definitions + skeleton loader
    catalog-view.js   — catalog home renderer
    blocks.js         — content block editors (all 9 types)
    tree.js           — module/topic tree + drag-drop
    editor.js         — topic content editor
    export.js         — OB-compatible ZIP export
    router.js         — view switcher
  data/
    windchill.json    — Windchill skeleton
    codebeamer.json   — Codebeamer skeleton
    creo.json         — Creo skeleton
```
