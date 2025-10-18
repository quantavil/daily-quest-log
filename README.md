# Daily Quest Log

A modern, JSON-backed Obsidian plugin for gamifying your habits and routines. Write your quests in HABITS.md, track time and completions in-app, and store everything in a single JSON file. No monthly Markdown logs. No legacy code. Clean, fast, and reliable.

- **Data store**: QuestLog.json (configurable)
- **Source of truth**: HABITS.md
- **Today view**: Timers, XP, levels, undo, and reporting
- **Modern setup**: TypeScript/ES module

## 🚀 Quick Start

1. [Install the plugin](#installation)
2. Create `HABITS.md` in your vault root
3. Add quests with `#quest(daily)` tags
4. Click the sword icon to open Today's Quests
5. Start tracking with timers and gamify your productivity!

## 📋 Features

### JSON-Backed Persistence
- Completions, timer states, and player data stored in a single JSON file (configurable path)
- Everything is machine-readable and instant to update — no more monthly logs!

### Today's Quests View
- Shows only quests scheduled for today (based on HABITS.md)
- Inline timers with one-click start/pause/resume/complete
- Visual XP progress bar and level display

### Smart Timers
- Persist across Obsidian reloads
- Auto-pause on app close
- Supports paused sessions per quest — resume anytime
- Overtime warnings for estimated quests

### Bidirectional HABITS.md Sync
- Completing a quest in the view checks it [x] in HABITS.md
- Checking/unchecking directly in HABITS.md is detected and synced to JSON
- Stable quest IDs ensure reliable tracking

### XP & Leveling System
- Configurable XP per minute, base, and exponent
- Estimated-time-aware XP: Earn `max(estimate, actual) * rate`
- Flat XP fallback for quests without time estimates
- Level up with exponential scaling: `XP = base × level^exponent`

### Reporting & Analytics
- Generate detailed Markdown reports with charts
- Visualize progress over the last 30 days
- Top quests leaderboard and time breakdown



## 📝 Usage

### Quest Format in HABITS.md
Quests are defined as Markdown todo items with a `#quest(schedule)` tag. Only top-level tasks are processed.

**Basic Syntax:**
```markdown
- [ ] Quest name #quest(schedule) (Est: time)
```

### Scheduling Patterns
- **`#quest(daily)`** — Every day
- **`#quest(weekdays)`** — Monday to Friday
- **`#quest(M,T,W,R,F,S,U)`** — Specific days (M=Monday, T=Tuesday, W=Wednesday, R=Thursday, F=Friday, S=Saturday, U=Sunday)
  - Examples: `#quest(M,W,F)`, `#quest(T,R)`, `#quest(S,U)`
- **`#quest(DD-MM-YYYY)`** — Specific date (e.g., `#quest(03-11-2025)`)

### Time Estimates
Add estimates to improve XP calculations. Use `(Est: Xm)`, `(Est: Xh)`, or combined `(Est: Xh Ym)` formats:

**Examples:**
- `(Est: 30m)` — 30 minutes
- `(Est: 1h)` — 1 hour
- `(Est: 1h 23m)` — 1 hour 23 minutes

### Example HABITS.md
```
# Daily Habits
- [ ] Journal #quest(daily) (Est: 15m)
- [ ] Exercise #quest(M,W,F) (Est: 1h 30m)
- [ ] Meditate #quest(daily) (Est: 20m)
- [ ] Plan tomorrow #quest(weekdays) (Est: 10m)

# Weekly Tasks
- [ ] Grocery shopping #quest(S) (Est: 45m)
- [ ] Laundry #quest(S,U) (Est: 1h)
- [ ] Deep cleaning #quest(15-10-2025)

# Specific Dates
- [ ] Dentist appointment #quest(07-12-2025) (Est: 1h)
- [ ] Birthday party #quest(25-12-2025)

# Routines
# Morning Routine
- [ ] Stretch #quest(daily) (Est: 5m)
- [ ] Vitamins #quest(daily) (Est: 2m)

# Evening Routine
- [ ] Read 20 pages #quest(daily) (Est: 30m)
- [ ] Review day #quest(daily) (Est: 10m)
```

### Today's Quests View
Access via the sword ribbon icon. Shows all scheduled quests for today.

**Features:**
- Real-time timers with start/pause/resume
- Visual progress bar for XP and level
- Complete quests with checkbox — updates HABITS.md automatically
- Bidirectional sync: Changes in HABITS.md reflect in the view immediately

**Timer Behavior:**
- Active timers persist across Obsidian restarts
- Auto-pause when closing the app
- Per-quest paused sessions — resume later
- Overtime warning for estimated quests

**XP System:**
- **With estimate**: XP = `max(estimate, actual minutes) × rate`
- **Without estimate**: Flat XP (default: 10)
- Level up when XP reaches threshold: `base × level^exponent`


## 🔧 Installation

### Manual Installation (Recommended)
1. Download the latest release from [GitHub Releases](https://github.com/quantavil/daily-quest-log/releases)
2. Extract the files into your vault's `.obsidian/plugins/daily-quest-log/` folder
3. Restart Obsidian or reload plugins
4. Enable "Daily Quest Log" in Community Plugins → Installed plugins

### Requirements
- Obsidian v0.1.0 or higher
- Works on desktop only (`isDesktopOnly: false` in manifest)

## ⚙️ Configuration

Access settings through **Settings → Community plugins → Daily Quest Log**.

### File Paths
- **HABITS file path**: Where your quests are defined (default: `HABITS.md`)
- **Quest log path**: JSON file for data storage (default: `QuestLog.json`)

### XP & Leveling
- **XP per minute**: XP earned per minute on estimated quests (default: 1)
- **Flat XP**: XP for quests without time estimates (default: 10)
- **Leveling base**: Base value for level scaling (default: 100)
- **Leveling exponent**: Exponent for level scaling (default: 1.5)

**Formula**: Next level XP = `round(base × level^exponent)`

### Danger Zone
- **Reset All Data**: Permanently clear completions, reset level to 1 and XP to 0

## 📊 Reporting

Generate comprehensive progress reports from the Today's Quests view:
- 30-day charts using Chart.js
- Quest completions, XP earned, and time spent
- Top quests leaderboard
- Daily breakdowns

Reports are saved as `Quest-Report.md` in the same folder as your HABITS file.

## 🤝 Contributing

- Report bugs or request features via [GitHub Issues](https://github.com/quantavil/daily-quest-log/issues)
- Submit pull requests for improvements
- Star the repo if you find it useful!

## 📄 License

Copyright (c) 2025 quantavil

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📋 Version History

- **v2.0**: Added reporting, improved timers, settings tab
- **v1.7**: Initial public release with basic quest tracking

---

*Made with ❤️ by [quantavil](https://github.com/quantavil)*
