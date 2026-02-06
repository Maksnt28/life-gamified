# Architecture Reference

Detailed lookup tables for `index.html` internals. Referenced by CLAUDE.md.

## Task Completion Toggle Functions

All five must be updated together when adding completion behavior (XP, achievements, animations, etc.):

| Function | View | Line ~approx |
|---|---|---|
| `toggleTask()` | Day list | 8407 |
| `toggleWeekTask()` | Week | 8184 |
| `toggleTimelineTask()` | Day timeline | 8250 |
| `toggleGridTask()` | Month grid | 8685 |
| `togglePlanTask()` | Plan | 10269 |

## Task UI Creation Functions

All must be updated together when changing how tasks look:

| Function | View | Line ~approx |
|---|---|---|
| `createTaskElement()` | Day list | 8340 |
| `createTimelineUntimedTask()` | Day timeline (untimed) | 7912 |
| `createTimelineTaskBlock()` | Day timeline (timed) | 7957 |
| `createWeekTaskBlock()` | Week | 9107 |
| `createPlanTaskElement()` | Plan | 10127 |

## View Render Functions

| Function | View | Line ~approx |
|---|---|---|
| `renderDayView()` | Day | 7836 |
| `renderWeekView()` | Week | 8757 |
| `renderWeekViewDesktop()` | Week (desktop) | 8984 |
| `renderMonthListView()` | Month list | 9354 |
| `renderMonthGridView()` | Month grid | 9786 |
| `renderPlanView()` | Plan | 9965 |
| `renderStatsView()` | Stats | 10424 |

## Data Flow

```
User action → toggle*() → update taskCompletions[completionKey][dateStr]
           → awardXP() → saveData() → renderCurrentView()
```

Completion key: `task.dailyId || task.id`
Storage key: `lifeGamifiedData_<userId>` (or `lifeGamifiedData` if unauthenticated)
