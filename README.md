# Daily Quest Log (JSON)

A modern, JSON-backed Obsidian plugin for gamifying your habits and routines. Write your quests in HABITS.md, track time and completions in-app, and store everything in a single JSON file. No monthly Markdown logs. No legacy code. Clean, fast, and reliable.

- Data store: QuestLog.json (configurable)
- Source of truth: HABITS.md
- Today view, timers, XP, levels, and undo supported
- Modern TypeScript/ES module setup


Features
- JSON-backed log
  - Completions, timer state, and player data are stored in a single JSON file (configurable path).
  - No more monthly Markdown tables; everything is machine-readable and instant to update.
- Today’s Quests view
  - Shows only quests scheduled for today (based on HABITS.md).
  - One-click start/pause/resume/complete with inline timers.
- Smart timers
  - Persist across reloads.
  - Auto-pause on app close.
  - Supports paused sessions per quest; resume later.
- HABITS.md sync
  - Checking a quest in the view marks it [x] in HABITS.md.
  - Checking/unchecking directly in HABITS.md is detected and logged/undone in JSON automatically (for quests scheduled today).
- XP and leveling
  - Configurable XP per minute, base, and exponent.
  - Estimated-time-aware XP: XP = max(estimate, actual) * rate. Flat fallback when no estimate.




Example:
- [ ] Read 20 pages #quest(daily) (Est: 30m)
- [ ] Workout #quest(MWF) Est: 1h
- [ ] Call mom #quest(03-11-2025)

Open Today’s Quests (ribbon icon with a sword). Start a quest, pause/resume, and complete it. Your XP, levels update automatically. Everything is logged to JSON.

Writing quests in HABITS.md
- Quests are Markdown tasks with a #quest(...) tag.
- Only top-level tasks are considered (no nested/indented subtasks).
- A quest line looks like:
- [ ] Do a thing #quest(schedule) [Est: 30m or 1h]

Examples:
- [ ] Journal #quest(daily) (Est: 15m)
- [ ] Study math #quest(TR) Est: 1h
- [ ] Clean kitchen #quest(weekdays)
- [ ] Dentist #quest(07-12-2025)


Supported patterns:
- daily — every day
- weekdays — Monday to Friday
- Specific days using letters:
  - M (Mon), T (Tue), W (Wed), R (Thu), F (Fri), S (Sat), U (Sun)
  - Example: #quest(M,W,F), #quest(T,R), #quest(S,U)
- Specific date: DD-MM-YYYY
  - Example: #quest(03-11-2025)

Notes:
- Thursday is R and Sunday is U.
- Specific date is checked against your local day (DD-MM-YYYY).
- The plugin matches any combination of day letters (case-insensitive).

Estimates syntax
Estimates are optional and improve XP accuracy.

Accepted forms:
- (Est: 1h)
- (Est: 45m)

Examples:
- [ ] Deep work #quest(weekdays) (Est: 2h)
- [ ] Mobility (Est: 20m) #quest(daily)

Using the Today view
- Ribbon icon: "Today's Quests" (sword)
- What you see:
  - All top-level quests in HABITS.md that are scheduled for today and not already completed.
  - Total estimated time.
  - Your level, XP progress
- Interactions:
  - Start: begins timing a quest.
  - Pause/Resume: pause or resume the active quest.
  - Complete: tick the checkbox to finish the quest, grant XP, and write to JSON.

Timers and paused sessions
- Active quest maintains running time and persists across reloads.
- Auto-pause on app close.
- You can pause a quest and later start a different quest; your paused time is kept per quest.
- Resuming a quest restores the accumulated paused time and continues counting.
- Each quest is identified as name||schedule. Renaming a quest or changing schedule may stop a running timer if the identity changes.

XP, leveling
- XP per minute: configurable in settings.
- If a quest has an estimate:
  - XP = round(max(estimate, actual) minutes × xpPerMinute)
- If no estimate is provided:
  - XP = 10 (flat)
- Leveling:
  - Next level XP = round(levelingBase × level^levelingExponent)
  - XP carries over to the next level when you level up.


Typical project structure:
- main.js (the code)
- manifest.json
- styles.css 

Example manifest.json:
{
  "id": "daily-quest-log",
  "name": "Daily Quest Log",
  "version": "1.7",
  "minAppVersion": "0.1.0",
  "description": "Transform task management into a gamified productivity system with XP, levels",
  "author": "quantavil",
  "authorUrl": "https://github.com/quantavil/",
  "isDesktopOnly": false
}
