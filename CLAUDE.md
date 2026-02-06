# CLAUDE.md

## Project Overview

Gamified personal task manager — single-file PWA with Supabase auth and Vercel serverless API.

## Architecture

- **`index.html`** (~12,600 lines) — entire app: HTML, CSS, JS. No framework, no build step.
- **`auth.js`** + **`config.js`** — Supabase authentication (email/password sign-up/in/out)
- **`api/suggest-tasks.js`** — Vercel serverless function calling Claude Haiku for AI task suggestions
- **`sw.js`** — service worker for offline caching
- **`manifest.json`** + **`icons/`** — PWA install config
- **External deps:** canvas-confetti (CDN), Supabase JS SDK (CDN)
- **Storage:** localStorage, keyed per user — `lifeGamifiedData_<userId>` (or `lifeGamifiedData` if not logged in)
- **Hosting:** Vercel, auto-deploys from `main` on GitHub (`git@github.com:Maksnt28/life-gamified.git`)
- **Env vars (Vercel):** `ANTHROPIC_API_KEY`

## Commands

- **Run locally:** Open `index.html` in a browser or use any static file server
- **Deploy:** Push to `main` on GitHub — Vercel auto-deploys
- **Force PWA update:** Bump `CACHE_NAME` version string in `sw.js`

## Critical Rules (Data Loss Risk)

**Always bump `CACHE_NAME` in `sw.js` when changing `index.html`.**
The service worker caches aggressively. Without a version bump, users get the old version indefinitely.

**Never modify localStorage structure without migration logic.**
Users have real data. Renaming a field (e.g., `task.type` → `task.taskType`) makes existing tasks invisible. Add migration code in `loadData()`.

**Completion key is `task.dailyId || task.id` — never bare `task.id`.**
Recurring tasks share a `dailyId`. Using `task.id` for completion tracking breaks recurrence (completing one day marks all days). This key is used across all five toggle functions, `getTasksForDate()`, delete logic, stats, and XP recalc — change it in one place and you must change all.

## Coding Rules

1. **Save + render after state changes:** Call `saveData()` then `renderCurrentView()`. No automatic reactivity.
2. **Task completion spans 5 toggle functions** — see `ARCHITECTURE.md` for the full list. Changes to completion behavior must go in all five.
3. **Task UI spans 5+ creation functions** — see `ARCHITECTURE.md`. Visual changes must go in all relevant functions.
4. **`getTasksForDate(date)` is the single source of truth** for which tasks appear on a date. Never duplicate its recurrence logic.
5. **Dark minimalist aesthetic** — #0a0a0a background, white text, gray accents. Only color is category dots. No emojis, no bright accents.
6. **Mobile-first (breakpoint: 768px)** — primary device is mobile. Touch interactions: tap to complete, long-press for details. Desktop adds grid layouts and `@media (hover: hover)` states.
7. **No new global render-blocking flags.** Fix the underlying DOM update logic instead.
8. **Update `project_memory.md` at end of every session** — record what changed, bugs fixed, decisions made, next priorities.
