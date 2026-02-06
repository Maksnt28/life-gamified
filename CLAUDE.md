# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A gamified personal task manager built as a single-file PWA — no frameworks, no build step, no backend. All code lives in `index.html` with data stored in browser localStorage.

## Tech Stack

- **Single file:** `index.html` (~11,700 lines of embedded CSS + JS)
- **Support files:** `sw.js` (service worker), `manifest.json` (PWA config), `icons/` (PWA install icons)
- **External dependency:** canvas-confetti (loaded from CDN)
- **Storage:** Browser localStorage (single JSON blob under key `lifeGamifiedData`)
- **Hosting:** Vercel (auto-deploys from GitHub, no build step)

## Commands

There is no build system, test suite, or linter. The app is a single HTML file opened in a browser.

- **Run locally:** Open `index.html` in a browser, or use any static file server
- **Deploy:** Push to GitHub → Vercel auto-deploys
- **Force PWA update:** Bump `CACHE_NAME` version string in `sw.js`

## Coding Rules

### 1. Always call `saveData()` after changing state, then `renderCurrentView()` to update the screen
The app has no automatic reactivity. If you change a task, XP, or completion status in memory but forget to save and re-render, the user sees stale data and their changes vanish on refresh.

### 2. When adding behavior to task completion, update ALL five toggle functions
There are five functions that handle "user completes a task": `toggleTask()`, `toggleWeekTask()`, `toggleTimelineTask()`, `toggleGridTask()`, and `togglePlanTask()`. They each handle a different view. If you add something (like an achievement check) to one but not the others, that feature silently breaks in some views. This has already caused a real bug — achievements don't unlock from Day timeline or Week view.

### 3. When changing how tasks look, update ALL task-creation functions
There are separate functions that build task UI for each view: `createTaskElement()`, `createTimelineUntimedTask()`, `createTimelineTaskBlock()`, `createWeekTaskBlock()` (inside renderWeekView), and `createPlanTaskElement()`. A visual change (like adding an icon) needs to go into each relevant function or it will only appear in some views.

### 4. Use `getTasksForDate(date)` as the single source of truth for which tasks appear on a date
This function handles all recurrence logic (daily, custom days, every-N-days, monthly, one-time). Never write your own "does this task appear today?" check — use this function. If recurrence rules need to change, change them here only.

### 5. Track task completion using `completionKey`, not `task.id`
Recurring tasks share a `dailyId` across all their occurrences. The completion key is `task.dailyId || task.id`. Using bare `task.id` for completion tracking will cause recurring tasks to break (completing Monday's instance would complete Tuesday's too, or vice versa).

### 6. Keep the dark minimalist aesthetic — no emojis, no color outside category dots
The design is intentionally minimal: black background (#0a0a0a), white text, gray accents. The only color comes from the 7 category dot colors. Adding colorful UI elements, emojis, or bright accents breaks the visual identity.

### 7. Test changes on mobile (≤768px) first — it's the primary device
The CSS breakpoint is 768px. Mobile uses vertical scroll, simplified layouts, and touch interactions (tap to complete, long-press for details). Desktop adds grid layouts and hover states wrapped in `@media (hover: hover)`. If something works on desktop but breaks on mobile, it's broken.

### 8. Don't create new global flags to prevent re-renders — fix the root cause instead
The codebase has a pattern of using global boolean flags (like `isCompletingWeekTask`) to block renders during animations. These flags are fragile: if an error occurs before the flag resets, the view stops updating entirely. When encountering render-related issues, fix the underlying DOM update logic rather than adding another flag.

### 9. Update `project_memory.md` at the end of every session
This file is the project's institutional memory. Record: what was added, bugs fixed, design decisions made, and priorities for next session. Future sessions depend on this to pick up where we left off.

## Critical Rules (Mistakes Here Cause Real Data Loss or Broken Features)

### Never modify the localStorage data structure without migration logic
Users have real data saved. If you rename a field (e.g., `task.type` → `task.taskType`), every existing task becomes invisible. The `loadData()` function must include migration code for any schema changes so old data keeps working.

### Never change `completionKey` logic without updating all code paths
Completion tracking (`taskCompletions[completionKey][dateStr]`) is referenced across all five toggle functions, `getTasksForDate()`, delete logic, stats calculations, and XP recalculation. If the key format changes in one place but not others, completion data becomes orphaned — users lose their progress with no error message.

### Always bump `CACHE_NAME` in `sw.js` when changing `index.html`
The service worker caches `index.html` aggressively. If you change the app but don't bump the cache version (e.g., `'life-gamified-v3'` → `'life-gamified-v4'`), users' browsers will keep serving the old version indefinitely. This is the #1 reason "my changes aren't showing up" after deployment.
