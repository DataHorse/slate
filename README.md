# Slate — a scratchpad & whiteboard PWA

A fast, distraction-free place to write and draw by hand: pen, pencil, highlighter,
eraser, multiple pages, and a presentation laser pointer that fades away on its own.
Installs like a native app on iPhone, iPad, and Android — no App Store needed.

## Host it on GitHub Pages

1. Create a new GitHub repository (e.g. `slate`).
2. Upload every file in this folder (`index.html`, `styles.css`, `app.js`,
   `manifest.json`, `sw.js`, and the `icons/` folder) to the repository root.
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**,
   pick the `main` branch and the `/ (root)` folder, then **Save**.
5. GitHub gives you a URL like `https://yourname.github.io/slate/`. It can take
   a minute or two to go live the first time.

## Install on your devices

**iPhone / iPad (Safari):** open the GitHub Pages URL → tap the **Share** icon →
**Add to Home Screen**. It now opens full-screen like a normal app, and works offline.

**Android (Chrome):** open the URL → tap the **⋮** menu → **Add to Home screen**
(or **Install app** if Chrome offers it directly).

**Desktop (Chrome/Edge):** open the URL → click the install icon in the address bar,
or the **⋮** menu → **Install Slate**.

Each device keeps its own pages — nothing syncs between devices, since this is a
fully local, no-account, no-server app. Everything is saved automatically on the
device you're using, right after you draw.

## What's inside

- **Pen, pencil, highlighter, eraser** — each with its own color palette and
  thickness, remembered independently so switching tools doesn't lose your settings.
- **Laser pointer** — draws in red, green, or blue and fades out over about a
  second, for talking through what's on the page without leaving a mark.
- **Pages (tabs)** — add as many as you like; each keeps its own drawing,
  paper style, and undo history. Double-tap a tab to rename it.
- **Paper styles** — plain, ruled, grid, or dotted, set per page from the
  page-settings icon.
- **Palm rejection** — when turned on, only a stylus (Apple Pencil, S Pen, etc.)
  draws; finger touches are ignored so a resting palm doesn't leave marks. Mouse
  and trackpad always work regardless of this setting.
- **Pressure sensitivity** — stroke width responds to pressure automatically
  when drawing with a stylus that reports it.
- **Undo / redo**, a one-tap **Clear page** (with an "Undo" toast right after),
  and **Save as image** (PNG) for the current page.
- **Light / Dark / Auto theme**, keyboard shortcuts for everything (see the
  **?** button in the app), and offline support once installed.

## Known limits

- Storage is local to each browser/device (via `localStorage`), so pages don't
  sync across devices and very heavy pages (thousands of strokes) could
  eventually approach the browser's storage limit.
- There's no cloud backup — if you clear your browser's site data, pages are
  lost. Use **Save as image** to keep a copy of anything important.
