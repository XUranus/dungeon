---
name: run-frontend
description: build, run and screenshot the React+Vite frontend (dev server, dark/light mode, glassmorphism UI)
---

# Frontend — Dungeon Lord

React 19 + Vite 8 + Tailwind CSS v4 frontend with glassmorphism (毛玻璃) dark/light theme.

## Prerequisites

```bash
# Node.js 22+ (already in container)
node --version
```

## Build

```bash
cd frontend
npm install        # if node_modules is stale
npx vite build     # production build → dist/
npx tsc -b --noEmit  # type check only
```

## Run (dev server)

```bash
cd frontend
npx vite --port 3333 --host 0.0.0.0
# → http://localhost:3333
```

The Vite dev server proxies `/api` to `http://localhost:5555` (the backend).
Start the backend separately if you need API calls.

## Run (production preview)

```bash
cd frontend
npx vite build
npx vite preview --port 3333 --host 0.0.0.0
```

## Screenshot

```bash
# Light mode — MUST use --virtual-time-budget or React won't render in time
chromium --headless --disable-gpu --no-sandbox \
  --virtual-time-budget=5000 \
  --screenshot=/tmp/frontend-light.png \
  --window-size=1400,900 \
  "http://localhost:3333"

# Specific page
chromium --headless --disable-gpu --no-sandbox \
  --virtual-time-budget=5000 \
  --screenshot=/tmp/frontend-crawl.png \
  --window-size=1400,900 \
  "http://localhost:3333/crawl"
```

Dark mode requires toggling the `.dark` class on `<html>` — use puppeteer or
inject via DevTools. The theme toggle is in the sidebar footer.

## Architecture

```
src/
  contexts/ThemeContext.tsx   ← dark/light toggle, localStorage persisted
  components/
    layout/Sidebar.tsx        ← glass sidebar + theme toggle button
    chat/ChatPanel.tsx        ← streaming RAG chat UI
  pages/
    ChatPage.tsx              ← / (chat)
    TopicsPage.tsx            ← /topics (data browse + comment sidebar)
    SourcesPage.tsx           ← /crawl (platform crawl triggers)
    SettingsPage.tsx          ← /settings (LLM/embedding config)
  services/api.ts             ← fetch wrapper for /api/*
  index.css                   ← Tailwind v4 + @custom-variant dark + @utility glass*
```

## Glassmorphism

Custom Tailwind utilities defined in `index.css`:

| Utility | Usage |
|---------|-------|
| `glass` / `glass-dark` | Sidebar, header, input bar (heavy blur) |
| `glass-card` / `glass-card-dark` | Cards, buttons, chat bubbles (light blur) |

All utilities use `backdrop-filter: blur()` with semi-transparent `oklch()` backgrounds.
Dark variants use deeper opacity and cooler tones.

## Dark Mode

Class-based via `@custom-variant dark (&:where(.dark, .dark *))` in Tailwind v4.
Toggle button in sidebar footer stores preference in `localStorage`.
Respects `prefers-color-scheme` on first visit.

## Gotchas

- **Tailwind v4 dark mode**: Uses `@custom-variant` directive, not `tailwind.config.js`.
  The `dark:` variant matches `.dark` class on ancestor elements.
- **Vite proxy**: `/api` is proxied to port 5555. Without the backend running,
  chat and data pages will show network errors — this is expected.
- **Glass effect needs background**: The gradient body background is essential;
  without it, glass panels look flat white/dark.
- **Chromium screenshot timing**: Must use `--virtual-time-budget=5000` flag,
  otherwise Chromium captures before React renders and cards appear invisible.
  Without this flag, screenshots are always 343KB (blank page with gradient).
