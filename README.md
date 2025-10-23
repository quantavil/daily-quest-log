# Daily Quest Log

Transform your task management into a gamified productivity system with XP, levels, and rewards in Obsidian.

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Go to Community Plugins → Browse
3. Search for "Daily Quest Log"
4. Install and enable the plugin

### Manual Installation

1. Download the latest release from the [GitHub Releases page](https://github.com/quantavil/daily-quest-log/releases)
2. Extract the plugin files (`main.js`, `manifest.json`, `styles.css`) into your Obsidian vault's `.obsidian/plugins/daily-quest-log/` folder
3. Reload Obsidian and enable the plugin in Community Plugins

## Features

- **Gamified Experience**: Earn XP for completing quests and level up through inspiring ranks (Novice to Archmage)
- **Quest Management**: Create, edit, archive, and delete quests with categories and scheduling
- **Time Tracking**: Start, pause, and resume timers with visual feedback
- **Scheduling**: Schedule quests daily, on weekdays/weekends, or specific days
- **Progress Overview**: View today's quests, other scheduled quests, and completed quests
- **XP & Levels**: Progress through ranks as you complete quests and earn XP
- **Reports**: Generate comprehensive Markdown reports of your quest history (last 30 days, top quests, etc.)
- **Data Management**: Export/import quest data for backups, or reset all data if needed

## Usage

### Opening the Quest Log

- Click the target icon (🎯) in the Obsidian ribbon to open the Quest Log view
- Or use the command palette: Open Command Palette → `Daily Quest Log: Open Quest Log`

### Creating a Quest

1. Click the `+` button in the Quest Log view
2. Enter a quest name (required)
3. Optionally set a category (e.g., "work", "health", "personal")
4. Optionally set time estimate in minutes
5. Select schedule days (daily, weekdays, weekends, or custom)
6. Click "Create" or press Enter

### Managing Quests

- **Start/Pause/Resume**: Use the play/pause buttons to control timers
- **Complete**: Check the checkbox next to a quest when finished
- **Edit**: Double-click a quest name to edit inline
- **Archive**: Use the archive button to hide completed/old quests while keeping history
- **Delete**: Delete quests permanently (with confirmation)
- **Reorder**: Drag quests to reorder within categories

### Categories & Scheduling

- **Categories**: Automatically created from quest names (e.g., "exercise" becomes category "exercise")
- **Scheduling**: Choose from presets (Daily, Weekdays, Weekends) or select individual days

### Leveling & XP

- Complete quests to earn XP based on time spent (relative to estimates)
- Level up through ranks with unique icons and colors
- View current XP/level in the status bar and quest header

### Generating Reports

1. Click "📊 Generate Report" in the Quest Log footer
2. A `Quest-Report.md` file will be created/updated in your vault
3. Includes: overview stats, daily breakdown (last 30 days), and top quests

## Settings

Access settings via Obsidian Settings → Community Plugins → Daily Quest Log:

- **Daily Reset Hour**: Set the hour (0-23) when the day resets and timers clear (e.g., 4 = 4:00 AM)
- **Export Data**: Download all quest data as JSON for backup
- **Import Data**: Restore data from a previously exported JSON file (replaces current data)
- **Reset All Data**: Permanently delete all data and reset to level 1 (use with caution)

## Data Storage

Quest data is stored in your vault at `.obsidian/plugins/daily-quest-log/questlog.json`. Exports are saved to `.obsidian/plugins/daily-quest-log/exports/`.

## Compatibility

- **Obsidian Version**: Requires Obsidian v1.0.0+
- **Mobile**: Fully supported, including touch gestures for mobile editing

## Contributing

Contributions are welcome! Please see the [GitHub repository](https://github.com/quantavil/daily-quest-log) for issues, feature requests, and pull requests.

## Support

If you encounter any issues or have questions, please open an issue on the [GitHub Issues page](https://github.com/quantavil/daily-quest-log/issues).

## License

This plugin is released under the [MIT License](LICENSE).
