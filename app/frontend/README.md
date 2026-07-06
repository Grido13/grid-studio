# Grid Studio — frontend

Single-page app for exploring the German transmission-grid simulation. Served by the
FastAPI backend (`app/backend/main.py`) at `/` — no build step, no `node_modules`:
native ES modules + React (esm.sh) + [htm](https://github.com/developit/htm) tagged
templates instead of JSX.

## Layout

```
studio.html            thin shell: mounts #root, loads css + /js/studio/main.js
css/studio.css         all styles — design tokens in :root, dark theme via
                       :root[data-theme=dark], component sections below
js/studio/
  core.js              framework wiring (React, htm→h, createRoot, html2canvas)
  format.js            units, tech colors/names (TECH, cn, GW, MW, EUR, …)
  i18n.js              I18N chrome dict (en/de), tr() runtime string table, LangCtx
  api.js               fetch layer: j(), per-hour state caches, bus names, snapView
  mapcore.js           Leaflet: useMap hook, theme-aware CARTO tiles, bounds, VCOL
  ui.js                shared widgets: Timeline, TopicNav, Bars, DsToggle, TABS
  home.js              Overview: hero, scroll story, "grid at night" canvas render
  pages.js             GridPage / ScenariosPage (topic nav + sub-view switching)
  gen|gridtab|loadtab|flow|cong|capex|bess|official|market|invest|
  territories|regional|reform|analysis|dc|ai|docs.js
                       one module per feature area
  main.js              App: routing, theme + language state, boot fetches
```

## Conventions

- **Theming** — never hard-code surface colors; use the tokens in `studio.css`
  (`--bg --bg2 --card --ink* --hair* --glass* --pop`). The theme toggle sets
  `document.documentElement.dataset.theme` and dispatches a `gs-theme` window event;
  maps listen to it to swap tile URLs (`tileUrl()` in `mapcore.js`).
- **Language** — UI strings go through `tr('English source string')` from `i18n.js`
  (English is the key; German lives in the `DE` table). Home-page/chrome copy uses the
  structured `I18N` dict passed down as `T`. `App` calls `setLang()` each render and
  provides `LangCtx` for memoized components (e.g. the Timeline).
- **Imports** — leaf feature modules may import shared modules (`format`, `api`,
  `mapcore`, `ui`, `i18n`) and each other sparingly; nothing imports `pages.js`
  except `main.js`, and nothing imports `main.js`.
- Legacy pages (`index.html`, `explorer.html`, `grid.html`, `studio-dark.html`) predate
  Grid Studio and keep their own standalone js/css.
