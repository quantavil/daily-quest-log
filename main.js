/**
 * Daily Quest Log - main.js (refactored)
 * A JSON-backed Obsidian plugin for gamifying habits and routines
 */

const { Plugin, TFile, Notice, PluginSettingTab, Setting, ItemView, Modal } = require('obsidian');

// ============================================================================
// CONSTANTS & DEFAULTS
// ============================================================================

const VIEW_TYPE_TODAY_QUESTS = 'daily-quest-log-today-view';
const HABITS_FILE_DEFAULT = 'HABITS.md';
const QUEST_LOG_FILE_DEFAULT = 'QuestLog.json';

const DEFAULT_SETTINGS = {
  habitsFilePath: HABITS_FILE_DEFAULT,
  questLogPath: QUEST_LOG_FILE_DEFAULT,
  xpPerMinute: 1,
  flatXp: 10,
  levelingBase: 100,
  levelingExponent: 1.5
};

// ============================================================================
// RANK SYSTEM
// ============================================================================

const RANKS = [
  { name: 'Novice', icon: '🌱', minLevel: 1, maxLevel: 2, color: '#a0d9a0' },
  { name: 'Initiate', icon: '✨', minLevel: 3, maxLevel: 5, color: '#b8d4f1' },
  { name: 'Apprentice', icon: '📘', minLevel: 6, maxLevel: 8, color: '#9db4d8' },
  { name: 'Seeker', icon: '🔍', minLevel: 9, maxLevel: 11, color: '#8ea5c8' },
  { name: 'Wanderer', icon: '🌍', minLevel: 12, maxLevel: 14, color: '#7eb8b8' },
  { name: 'Explorer', icon: '🗺️', minLevel: 15, maxLevel: 17, color: '#6ec9c9' },
  { name: 'Pathfinder', icon: '🧭', minLevel: 18, maxLevel: 20, color: '#5ed4d4' },
  { name: 'Adventurer', icon: '🗡️', minLevel: 21, maxLevel: 24, color: '#4ed9e5' },
  { name: 'Wayfarer', icon: '🚶', minLevel: 25, maxLevel: 28, color: '#3edff0' },
  { name: 'Tracker', icon: '👣', minLevel: 29, maxLevel: 32, color: '#2ee5fb' },
  { name: 'Scout', icon: '🦅', minLevel: 33, maxLevel: 36, color: '#00e5ff' },
  { name: 'Ranger', icon: '🏹', minLevel: 37, maxLevel: 40, color: '#20d0ff' },
  { name: 'Warrior', icon: '⚔️', minLevel: 41, maxLevel: 44, color: '#40bbff' },
  { name: 'Guardian', icon: '🛡️', minLevel: 45, maxLevel: 48, color: '#60a6ff' },
  { name: 'Sentinel', icon: '🗼', minLevel: 49, maxLevel: 52, color: '#8091ff' },
  { name: 'Vanguard', icon: '🎖️', minLevel: 53, maxLevel: 56, color: '#a07cff' },
  { name: 'Champion', icon: '🏆', minLevel: 57, maxLevel: 60, color: '#b794f6' },
  { name: 'Elite', icon: '💎', minLevel: 61, maxLevel: 64, color: '#c88ef6' },
  { name: 'Master', icon: '🎯', minLevel: 65, maxLevel: 68, color: '#d988f6' },
  { name: 'Virtuoso', icon: '🎭', minLevel: 69, maxLevel: 72, color: '#ea82f6' },
  { name: 'Paragon', icon: '⭐', minLevel: 73, maxLevel: 76, color: '#f67cc8' },
  { name: 'Hero', icon: '🦸', minLevel: 77, maxLevel: 80, color: '#f67ca0' },
  { name: 'Legend', icon: '👑', minLevel: 81, maxLevel: 85, color: '#f6ad55' },
  { name: 'Mythic', icon: '🔥', minLevel: 86, maxLevel: 90, color: '#fc8181' },
  { name: 'Ascendant', icon: '🌟', minLevel: 91, maxLevel: 95, color: '#ffa07a' },
  { name: 'Immortal', icon: '💫', minLevel: 96, maxLevel: 99, color: '#ffd700' },
  { name: 'Divine', icon: '✨', minLevel: 100, maxLevel: Infinity, color: '#fff' }
];

function getRankForLevel(level) {
  return RANKS.find(r => level >= r.minLevel && level <= r.maxLevel) || RANKS[RANKS.length - 1];
}


// ============================================================================
// UTIL
// ============================================================================

const DAY_MAP_FULL = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const DAY_LETTER_MAP = { u: 0, m: 1, t: 2, w: 3, r: 4, f: 5, s: 6 }; // U=Sun, R=Thu, S=Sat

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function genId(len = 12) {
  // Prefer crypto random for uniqueness
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => (b % 36).toString(36)).join('');
  }
  return Math.random().toString(36).slice(2, 2 + len);
}

function formatTime(minutes) {
  const totalSeconds = Math.floor(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return m > 0
      ? `${h}h ${m}m ${s}s`
      : `${h}h ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// ============================================================================
// MAIN PLUGIN
// ============================================================================

module.exports = class DailyQuestLogPlugin extends Plugin {
  async onload() {
    console.log('Loading Daily Quest Log plugin...');
    this.suppressNextModify = false;
    this.modifyDebounce = null;

    await this.loadSettings();
    await this.loadQuestLog();

    // Handle any active timer from previous session
    await this.handleTimerStateOnLoad();

    // Register the Today view
    this.registerView(VIEW_TYPE_TODAY_QUESTS, (leaf) => new TodayQuestsView(leaf, this));

    // Ribbon + command
    this.addRibbonIcon('target', "Today's Quests", () => this.activateTodayView());
    this.addCommand({ id: 'open-today-quests', name: "Open Today's Quests", callback: () => this.activateTodayView() });

    // Update tooltip with rank after load
    this.registerEvent(this.app.workspace.on('layout-ready', () => {
      const rank = getRankForLevel(this.questLog.player.level);
      const ribbonIcon = document.querySelector('.side-dock-ribbon-action[aria-label="Today\'s Quests"]');
      if (ribbonIcon) {
        ribbonIcon.setAttribute('aria-label', `Today's Quests • ${rank.icon} ${rank.name} (Lv${this.questLog.player.level})`);
      }
    }));

    // Watch HABITS.md for changes (bidirectional sync)
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (!(file instanceof TFile)) return;
      if (file.path !== this.settings.habitsFilePath) return;
      if (this.suppressNextModify) { this.suppressNextModify = false; return; }

      // Debounce to coalesce rapid changes
      if (this.modifyDebounce) clearTimeout(this.modifyDebounce);
      this.modifyDebounce = setTimeout(() => this.onHabitsFileModified(), 120);
    }));

    // Settings tab
    this.addSettingTab(new DailyQuestLogSettingTab(this.app, this));
  }

  async onunload() {
    console.log('Unloading Daily Quest Log plugin...');
    if (this.modifyDebounce) clearTimeout(this.modifyDebounce);
    await this.autoPauseActiveQuest();
  }

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------

  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }

  // --------------------------------------------------------------------------
  // Quest Log Data
  // --------------------------------------------------------------------------

  async loadQuestLog() {
    const path = this.settings.questLogPath;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      this.questLog = safeJsonParse(content, null);
      if (!this.questLog || typeof this.questLog !== 'object') this.initializeQuestLog();
    } else {
      this.initializeQuestLog();
    }
    // Ensure structure
    this.questLog.completions ||= []; // { questId, date, minutesSpent, xpEarned }
    this.questLog.player ||= { level: 1, xp: 0 };
    this.questLog.timerState ||= { activeQuestId: null, startTime: null, pausedSessions: {} };
  }

  initializeQuestLog() {
    this.questLog = {
      completions: [],
      player: { level: 1, xp: 0 },
      timerState: { activeQuestId: null, startTime: null, pausedSessions: {} }
    };
  }

  async saveQuestLog() {
    const path = this.settings.questLogPath;
    const content = JSON.stringify(this.questLog, null, 2);
    const file = this.app.vault.getAbstractFileByPath(path);
    file instanceof TFile ? await this.app.vault.modify(file, content) : await this.app.vault.create(path, content);
  }

  // --------------------------------------------------------------------------
  // HABITS.md parsing and stable IDs
  // --------------------------------------------------------------------------

  async readHabitsFile() {
    const file = this.app.vault.getAbstractFileByPath(this.settings.habitsFilePath);
    if (!(file instanceof TFile)) {
      new Notice(`HABITS.md not found at ${this.settings.habitsFilePath}`);
      return null;
    }
    return await this.app.vault.read(file);
  }

  async writeHabitsFile(content) {
    const file = this.app.vault.getAbstractFileByPath(this.settings.habitsFilePath);
    if (!(file instanceof TFile)) return;
    this.suppressNextModify = true;
    await this.app.vault.modify(file, content);
  }

  async ensureStableIdsInHabitsFile() {
    const content = await this.readHabitsFile();
    if (content == null) return;

    const lines = content.split('\n');
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Only top-level list items with a #quest(...)
      if (!/^\s*-\s\[([ xX])\]\s/.test(line)) continue;
      if (!/#quest\([^)]+\)/.test(line)) continue;

      // Already has qid?
      if (/#qid\([^)]+\)/.test(line)) continue;

      // Append a new #qid(id) token
      const id = genId();
      lines[i] = `${line} #qid(${id})`;
      changed = true;
    }

    if (changed) await this.writeHabitsFile(lines.join('\n'));
  }

  extractQuestsFromContent(content) {
    const lines = content.split('\n');
    const quests = [];
    let currentHeading = 'Uncategorized';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Heading
      const heading = line.match(/^#{1,6}\s+(.+)/);
      if (heading) { currentHeading = heading[1].trim(); continue; }

      // Task line (top-level)
      const task = line.match(/^\s*-\s\[([ xX])\]\s(.+)/);
      if (!task) continue;

      const isCompleted = task[1].toLowerCase() === 'x';
      const taskText = task[2];

      const qMatch = taskText.match(/#quest\(([^)]+)\)/);
      if (!qMatch) continue;

      const qidMatch = taskText.match(/#qid\(([^)]+)\)/);
      const id = qidMatch ? qidMatch[1].trim() : null;

      // Extract estimate (Est: 30m or 1h)
      const est = taskText.match(/\(Est:\s*(\d+)\s*(h|m)\)/i);
      let estimateMinutes = null;
      if (est) {
        const v = parseInt(est[1], 10);
        estimateMinutes = est[2].toLowerCase() === 'h' ? v * 60 : v;
      }

      // Name without tags/estimate
      const name = taskText
        .replace(/#quest\([^)]+\)/, '')
        .replace(/#qid\([^)]+\)/, '')
        .replace(/\(Est:\s*\d+\s*[hm]\)/i, '')
        .trim();

      quests.push({
        id, // stable
        name,
        schedule: qMatch[1].trim(),
        estimateMinutes,
        isCompleted,
        lineNumber: i,
        category: currentHeading
      });
    }
    return quests;
  }

  async parseHabitsFile() {
    // Ensure all quest lines have #qid(...)
    await this.ensureStableIdsInHabitsFile();
    const content = await this.readHabitsFile();
    if (content == null) return [];

    const quests = this.extractQuestsFromContent(content);

    // Cleanup pausedSessions for quests that no longer exist
    const validIds = new Set(quests.map(q => q.id).filter(Boolean));
    const ps = this.questLog.timerState.pausedSessions || {};
    Object.keys(ps).forEach(k => { if (!validIds.has(k)) delete ps[k]; });
    if (!validIds.has(this.questLog.timerState.activeQuestId)) {
      this.questLog.timerState.activeQuestId = null;
      this.questLog.timerState.startTime = null;
    }
    await this.saveQuestLog(); // persists cleanup if any

    return quests;
  }

  // --------------------------------------------------------------------------
  // Scheduling
  // --------------------------------------------------------------------------

  isScheduledToday(schedule) {
    if (!schedule) return false;
    const now = new Date();
    const today = now.getDay(); // 0=Sun...6=Sat
    const s = schedule.trim().toLowerCase();

    if (s === 'daily') return true;
    if (s === 'weekdays') return today >= 1 && today <= 5;
    if (s === 'weekends') return today === 0 || today === 6;

    // Specific date: DD-MM-YYYY
    const dm = s.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (dm) {
      const [, d, m, y] = dm;
      const t = new Date(Number(y), Number(m) - 1, Number(d));
      return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate();
    }

    // Day letters: M,T,W,R,F,S,U
    const letterDays = s.match(/[mtwrfsu]/g);
    if (letterDays && letterDays.some(letter => DAY_LETTER_MAP[letter] === today)) return true;

    // Full names or ranges e.g., "mon", "mon-fri"
    // Normalize tokens split by commas/spaces
    const tokens = s.split(/[\s,]+/).filter(Boolean);
    if (tokens.length) {
      const dayIdx = (tok) => DAY_MAP_FULL[tok];
      for (const tok of tokens) {
        if (tok.includes('-')) {
          const [a, b] = tok.split('-');
          const ai = dayIdx(a), bi = dayIdx(b);
          if (ai != null && bi != null) {
            if (ai <= bi ? today >= ai && today <= bi : today >= ai || today <= bi) return true;
          }
        } else {
          const di = dayIdx(tok);
          if (di != null && di === today) return true;
        }
      }
    }
    return false;
  }

  async getTodayQuests() {
    const all = await this.parseHabitsFile();
    return all.filter(q => q.id && this.isScheduledToday(q.schedule) && !q.isCompleted);
  }

  isCompletedToday(questId) {
    const today = new Date().toISOString().split('T')[0];
    return this.questLog.completions.some(c => c.questId === questId && c.date === today);
  }

  // --------------------------------------------------------------------------
  // Timer
  // --------------------------------------------------------------------------

  async startQuest(questId) {
    const s = this.questLog.timerState;
    if (s.activeQuestId && s.activeQuestId !== questId) await this.pauseQuest(s.activeQuestId);
    s.activeQuestId = questId;
    s.startTime = Date.now();
    await this.saveQuestLog();
    this.refreshTodayView();
  }

  async pauseQuest(questId) {
    const s = this.questLog.timerState;
    if (s.activeQuestId !== questId) return;
    const elapsed = this.getActiveElapsedMinutes();
    s.pausedSessions[questId] = (s.pausedSessions[questId] || 0) + elapsed;
    s.activeQuestId = null;
    s.startTime = null;
    await this.saveQuestLog();
    this.refreshTodayView();
  }

  async resumeQuest(questId) { await this.startQuest(questId); }

  getActiveElapsedMinutes() {
    const s = this.questLog.timerState;
    if (!s.activeQuestId || !s.startTime) return 0;
    const ms = Date.now() - s.startTime;
    return ms / 1000 / 60;
  }

  getTotalMinutes(questId) {
    const s = this.questLog.timerState;
    const paused = s.pausedSessions[questId] || 0;
    return s.activeQuestId === questId ? paused + this.getActiveElapsedMinutes() : paused;
  }

  async autoPauseActiveQuest() {
    const s = this.questLog.timerState;
    if (!s.activeQuestId) return;
    const elapsed = this.getActiveElapsedMinutes();
    s.pausedSessions[s.activeQuestId] = (s.pausedSessions[s.activeQuestId] || 0) + elapsed;
    s.activeQuestId = null;
    s.startTime = null;
    await this.saveQuestLog();
  }

  // --------------------------------------------------------------------------
  // Completion & XP
  // --------------------------------------------------------------------------

  async completeQuest(quest) {
    const questId = quest.id;
    const totalMinutes = this.getTotalMinutes(questId);
    const xp = this.calculateXP(quest.estimateMinutes, totalMinutes);

    this.awardXP(xp);

    const today = new Date().toISOString().split('T')[0];
    this.questLog.completions.push({
      questId,
      date: today,
      minutesSpent: Math.round(totalMinutes),
      xpEarned: xp
    });

    // Clear timer state
    const s = this.questLog.timerState;
    if (s.activeQuestId === questId) { s.activeQuestId = null; s.startTime = null; }
    delete s.pausedSessions[questId];

    await this.saveQuestLog();

    await this.markQuestInFileById(questId, true);

    new Notice(`✓ ${quest.name} completed! +${xp} XP`);
    this.refreshTodayView();
  }

  calculateXP(estimateMinutes, actualMinutes) {
    if (estimateMinutes != null && estimateMinutes > 0) {
      const mins = Math.max(estimateMinutes, actualMinutes);
      return Math.round(mins * this.settings.xpPerMinute);
    }
    return this.settings.flatXp;
  }

  awardXP(xp) {
    const p = this.questLog.player;
    p.xp += xp;
    while (p.xp >= this.getXPForNextLevel(p.level)) {
      const need = this.getXPForNextLevel(p.level);
      p.xp -= need;
      const oldRank = getRankForLevel(p.level);
      p.level += 1;
      const newRank = getRankForLevel(p.level);

      // Check if rank changed
      if (oldRank.name !== newRank.name) {
        new Notice(`🎊 RANK UP! You are now ${newRank.icon} ${newRank.name.toUpperCase()} (Level ${p.level})`, 6000);
      } else {
        new Notice(`🎉 Level Up! Level ${p.level} • ${newRank.icon} ${newRank.name}`);
      }
    }
  }

  getXPForNextLevel(level) {
    const { levelingBase, levelingExponent } = this.settings;
    return Math.round(levelingBase * Math.pow(level, levelingExponent));
  }

  // --------------------------------------------------------------------------
  // Bidirectional sync
  // --------------------------------------------------------------------------

  async markQuestInFileById(questId, completed) {
    const content = await this.readHabitsFile();
    if (content == null) return;

    const lines = content.split('\n');
    const idx = lines.findIndex(l => l.includes(`#qid(${questId})`));
    if (idx === -1) return;

    const line = lines[idx];
    const checkbox = completed ? '[x]' : '[ ]';
    const newLine = line.replace(/^(\s*-\s)\[([ xX])\]/, `$1${checkbox}`);
    if (newLine === line) return;

    lines[idx] = newLine;
    await this.writeHabitsFile(lines.join('\n'));
  }

  async onHabitsFileModified() {
    const quests = await this.parseHabitsFile();
    const today = new Date().toISOString().split('T')[0];

    for (const q of quests) {
      if (!q.id) continue;
      if (!this.isScheduledToday(q.schedule)) continue;

      const wasCompletedToday = this.isCompletedToday(q.id);
      const isNowCompleted = q.isCompleted;

      // Manual check => award
      if (isNowCompleted && !wasCompletedToday) {
        const totalMinutes = this.getTotalMinutes(q.id);
        const xp = this.calculateXP(q.estimateMinutes, totalMinutes);

        this.awardXP(xp);
        this.questLog.completions.push({
          questId: q.id,
          date: today,
          minutesSpent: Math.round(totalMinutes),
          xpEarned: xp
        });

        // Clear timer state
        const s = this.questLog.timerState;
        if (s.activeQuestId === q.id) { s.activeQuestId = null; s.startTime = null; }
        delete s.pausedSessions[q.id];

        await this.saveQuestLog();
        new Notice(`✓ ${q.name} completed! +${xp} XP`);
      }

      // Manual uncheck => revert
      if (!isNowCompleted && wasCompletedToday) {
        const c = this.questLog.completions.find(x => x.questId === q.id && x.date === today);
        if (c) {
          this.questLog.player.xp -= c.xpEarned;

          // Level down if needed
          while (this.questLog.player.xp < 0 && this.questLog.player.level > 1) {
            this.questLog.player.level -= 1;
            this.questLog.player.xp += this.getXPForNextLevel(this.questLog.player.level);
          }
          if (this.questLog.player.xp < 0) this.questLog.player.xp = 0;

          this.questLog.completions = this.questLog.completions.filter(x => !(x.questId === q.id && x.date === today));
          await this.saveQuestLog();
          new Notice(`⟲ ${q.name} uncompleted. -${c.xpEarned} XP`);
        }
      }
    }

    this.refreshTodayView();
  }

  // --------------------------------------------------------------------------
  // View management
  // --------------------------------------------------------------------------

  async activateTodayView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_TODAY_QUESTS)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_TODAY_QUESTS, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  refreshTodayView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TODAY_QUESTS);
    for (const leaf of leaves) {
      if (leaf.view instanceof TodayQuestsView) leaf.view.render();
    }
  }

  // --------------------------------------------------------------------------
  // Timer state recovery
  // --------------------------------------------------------------------------

  async handleTimerStateOnLoad() {
    const s = this.questLog.timerState;
    if (s.activeQuestId && s.startTime) {
      const elapsedMin = (Date.now() - s.startTime) / 1000 / 60;
      s.pausedSessions[s.activeQuestId] = (s.pausedSessions[s.activeQuestId] || 0) + elapsedMin;
      s.activeQuestId = null;
      s.startTime = null;
      await this.saveQuestLog();
      console.log(`Timer recovered: +${elapsedMin.toFixed(1)}m`);
    }
  }

  // --------------------------------------------------------------------------
  // Reset & Reports
  // --------------------------------------------------------------------------

  async resetAllData() {
    const confirmed = await this.showConfirmDialog(
      '⚠️ Reset All Quest Data',
      'This will clear all completions, reset level to 1, and reset XP to 0. This cannot be undone!'
    );

    if (!confirmed) return;

    this.initializeQuestLog();
    await this.saveQuestLog();

    new Notice('✓ All quest data has been reset!');
    this.refreshTodayView();
  }

  showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const modal = new ConfirmModal(this.app, title, message, (result) => {
        resolve(result);
      });
      modal.open();
    });
  }

  async generateReport() {
    new Notice('📊 Generating quest report...');

    try {
      const stats = await this.calculateStats();
      const reportContent = this.buildReportMarkdown(stats);

      // Save to vault in same directory as HABITS.md
      const habitsPath = this.settings.habitsFilePath;
      const dir = habitsPath.includes('/') ? habitsPath.substring(0, habitsPath.lastIndexOf('/')) : '';
      const reportPath = dir ? `${dir}/Quest-Report.md` : 'Quest-Report.md';

      const existingFile = this.app.vault.getAbstractFileByPath(reportPath);
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, reportContent);
      } else {
        await this.app.vault.create(reportPath, reportContent);
      }

      new Notice(`✓ Report generated: ${reportPath}`);

      // Open the report
      const file = this.app.vault.getAbstractFileByPath(reportPath);
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
      }
    } catch (err) {
      console.error('Report generation error:', err);
      new Notice('❌ Failed to generate report. Check console for details.');
    }
  }

  async calculateStats() {
    const { completions, player } = this.questLog;

    // Parse HABITS to get quest names
    const questNames = {};
    const allQuests = await this.parseHabitsFile();
    allQuests.forEach(q => {
      if (q.id) questNames[q.id] = q.name;
    });

    // Basic stats
    const totalCompleted = completions.length;
    const totalXP = completions.reduce((sum, c) => sum + (c.xpEarned || 0), 0);
    const totalMinutes = completions.reduce((sum, c) => sum + (c.minutesSpent || 0), 0);

    // Group by date
    const byDate = {};
    completions.forEach(c => {
      if (!byDate[c.date]) {
        byDate[c.date] = { count: 0, xp: 0, minutes: 0 };
      }
      byDate[c.date].count++;
      byDate[c.date].xp += c.xpEarned || 0;
      byDate[c.date].minutes += c.minutesSpent || 0;
    });

    // Group by quest
    const byQuest = {};
    completions.forEach(c => {
      if (!byQuest[c.questId]) {
        byQuest[c.questId] = { count: 0, xp: 0, minutes: 0 };
      }
      byQuest[c.questId].count++;
      byQuest[c.questId].xp += c.xpEarned || 0;
      byQuest[c.questId].minutes += c.minutesSpent || 0;
    });

    // Last 30 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      last30Days.push({
        date: dateStr,
        count: byDate[dateStr]?.count || 0,
        xp: byDate[dateStr]?.xp || 0,
        minutes: byDate[dateStr]?.minutes || 0
      });
    }

    // Top quests
    const topQuests = Object.entries(byQuest)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([id, data]) => ({
        id,
        name: questNames[id] || id,
        ...data
      }));

    return {
      player,
      totalCompleted,
      totalXP,
      totalMinutes,
      last30Days,
      topQuests,
      questNames
    };
  }

  buildReportMarkdown(stats) {
    const now = new Date().toISOString().split('T')[0];
    const hours = Math.floor(stats.totalMinutes / 60);
    const minutes = Math.floor(stats.totalMinutes % 60);

    return `# 📊 Quest Report
*Generated: ${now}*

---

## 🏆 Overview

| Stat | Value |
|------|-------|
| **Current Rank** | ${getRankForLevel(stats.player.level).icon} **${getRankForLevel(stats.player.level).name}** |
| **Current Level** | ${stats.player.level} |
| **Current XP** | ${stats.player.xp} |
| **Total Quests Completed** | ${stats.totalCompleted} |
| **Total XP Earned** | ${stats.totalXP.toLocaleString()} |
| **Total Time Spent** | ${hours}h ${minutes}m |

---

## 📈 Progress Charts

### Quests Completed (Last 30 Days)

<div style="margin: 20px 0;">
  <canvas id="questsChart" width="800" height="400"></canvas>
</div>

### XP Earned (Last 30 Days)

<div style="margin: 20px 0;">
  <canvas id="xpChart" width="800" height="400"></canvas>
</div>

### Time Spent (Last 30 Days)

<div style="margin: 20px 0;">
  <canvas id="timeChart" width="800" height="400"></canvas>
</div>

---

## 🎯 Top Quests

| Rank | Quest Name | Completions | Total XP | Total Time |
|------|-----------|-------------|----------|------------|
 ${stats.topQuests.map((q, idx) => {
      const h = Math.floor(q.minutes / 60);
      const m = Math.floor(q.minutes % 60);
      return `| ${idx + 1} | ${q.name} | ${q.count} | ${q.xp} XP | ${h}h ${m}m |`;
    }).join('\n')}

 ${stats.topQuests.length === 0 ? '| - | No quests completed yet | - | - | - |' : ''}

---

## 📅 Daily Breakdown (Last 30 Days)

| Date | Quests | XP Earned | Time Spent |
|------|--------|-----------|------------|
 ${stats.last30Days.slice().reverse().map(d => {
      const h = Math.floor(d.minutes / 60);
      const m = Math.floor(d.minutes % 60);
      const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      return `| ${d.date} | ${d.count} | ${d.xp} XP | ${timeStr} |`;
    }).join('\n')}

---

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
setTimeout(() => {
  if (typeof Chart === 'undefined') return;

  const chartConfig = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#e0e0e8', font: { size: 14 } } },
      tooltip: {
        backgroundColor: 'rgba(30, 30, 40, 0.9)',
        borderWidth: 1
      }
    },
    scales: {
      y: { 
        beginAtZero: true,
        ticks: { color: '#808090' },
        grid: { color: '#2a2a38' }
      },
      x: { 
        ticks: { color: '#808090', maxRotation: 45 },
        grid: { color: '#2a2a38' }
      }
    }
  };

  // Quests Chart
  const questsCtx = document.getElementById('questsChart');
  if (questsCtx) {
    new Chart(questsCtx, {
      type: 'line',
      data: {
        labels: [${stats.last30Days.map(d => `"${d.date.slice(5)}"`).join(', ')}],
        datasets: [{
          label: 'Quests Completed',
          data: [${stats.last30Days.map(d => d.count).join(', ')}],
          borderColor: 'rgb(0, 229, 255)',
          backgroundColor: 'rgba(0, 229, 255, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: chartConfig
    });
  }

  // XP Chart
  const xpCtx = document.getElementById('xpChart');
  if (xpCtx) {
    new Chart(xpCtx, {
      type: 'bar',
      data: {
        labels: [${stats.last30Days.map(d => `"${d.date.slice(5)}"`).join(', ')}],
        datasets: [{
          label: 'XP Earned',
          data: [${stats.last30Days.map(d => d.xp).join(', ')}],
          backgroundColor: 'rgba(183, 148, 246, 0.6)'
        }]
      },
      options: chartConfig
    });
  }

  // Time Chart
  const timeCtx = document.getElementById('timeChart');
  if (timeCtx) {
    new Chart(timeCtx, {
      type: 'line',
      data: {
        labels: [${stats.last30Days.map(d => `"${d.date.slice(5)}"`).join(', ')}],
        datasets: [{
          label: 'Minutes Spent',
          data: [${stats.last30Days.map(d => d.minutes).join(', ')}],
          borderColor: 'rgb(104, 211, 145)',
          backgroundColor: 'rgba(104, 211, 145, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: chartConfig
    });
  }
}, 500);
</script>

<style>
canvas {
  background: #1e1e28 !important;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #2a2a38;
  max-width: 100%;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
}
th, td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #2a2a38;
}
th {
  background: #1e1e28;
  color: #00e5ff;
  font-weight: 600;
}
tr:hover {
  background: #161620;
}
</style>
`;
  }
};

// ============================================================================
// TODAY VIEW (incremental timer updates; no full rerender every second)
// ============================================================================

class TodayQuestsView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.timerHandle = null;
    this.domIndex = new Map();
  }

  getViewType() { return VIEW_TYPE_TODAY_QUESTS; }
  getDisplayText() { return "Today's Quests"; }
  getIcon() { return 'target'; }

  async onOpen() {
    await super.onOpen();
    await this.render();
    this.startTicker();
  }

  async onClose() {
    this.stopTicker();
    await super.onClose();
  }

  startTicker() {
    this.stopTicker();
    this.timerHandle = window.setInterval(() => this.updateActiveTimerRow(), 1000);
  }

  stopTicker() {
    if (this.timerHandle) {
      window.clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  // Update ONLY the active quest's timer text (no full rerender)
  updateActiveTimerRow() {
    const state = this.plugin.questLog.timerState;
    const activeId = state.activeQuestId;
    if (!activeId) return;

    const entry = this.domIndex.get(activeId);
    if (!entry) return;

    const { estimateEl, itemEl, quest } = entry;

    const totalMinutes = this.plugin.getTotalMinutes(activeId);
    const isActive = true;
    const isPaused = false;
    const isOvertime = !!(quest.estimateMinutes && totalMinutes > quest.estimateMinutes);

    // Update display (countdown for estimated, count-up otherwise)
    this.updateEstimateDisplay(estimateEl, quest, totalMinutes, isActive, isPaused, isOvertime);

    // Keep overtime class in sync
    if (isOvertime) itemEl.addClass('quest-item--overtime');
    else itemEl.removeClass('quest-item--overtime');
  }

  async render() {
    const container = this.containerEl.children[1];
    this.domIndex.clear();
    container.empty();

    const quests = await this.plugin.getTodayQuests();
    const player = this.plugin.questLog.player;
    const xpForNext = this.plugin.getXPForNextLevel(player.level);
    const xpPercent = clamp((player.xp / xpForNext) * 100, 0, 100);
    const totalEstimate = quests.reduce((s, q) => s + (q.estimateMinutes || 0), 0);

    // Header
    const rank = getRankForLevel(player.level);
    const header = container.createDiv({ cls: 'quest-view-header' });
    const top = header.createDiv({ cls: 'quest-header-top' });
    top.createEl('h2', { text: "Today's Quests" });

    // Right side wrapper (total time + rank)
    const rightSide = top.createDiv({ cls: 'quest-header-right' });
    if (totalEstimate > 0) rightSide.createDiv({ cls: 'quest-total-est', text: `Total: ${formatTime(totalEstimate)}` });
    const rankDisplay = rightSide.createDiv({ cls: 'quest-rank-display' });
    rankDisplay.innerHTML = `<span class="rank-icon">${rank.icon}</span> <span class="rank-name" style="color: ${rank.color}">${rank.name.toUpperCase()}</span>`;

    // Stats (Level inline with XP and quests)
    const stats = header.createDiv({ cls: 'quest-view-stats' });
    stats.createEl('span', { text: `Level ${player.level}` });
    stats.createEl('span', { text: `${player.xp} / ${xpForNext} XP` });
    stats.createEl('span', { text: `${quests.length} quest${quests.length !== 1 ? 's' : ''}` });

    const xpBar = header.createDiv({ cls: 'quest-xp-bar' });
    xpBar.createDiv({ cls: 'quest-xp-fill', attr: { style: `width: ${xpPercent}%` } });

    if (quests.length === 0) {
      container.createDiv({ cls: 'quest-empty-state', text: '🎉 No quests scheduled for today, or all complete!' });
      return;
    }

    // Group by category
    const categories = new Map();
    for (const q of quests) {
      const cat = q.category || 'Uncategorized';
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat).push(q);
    }

    for (const [cat, qs] of categories.entries()) {
      const state = this.plugin.questLog.timerState;

      const active = qs.filter(q => this.hasAnyTime(q.id));
      const inactive = qs.filter(q => !this.hasAnyTime(q.id));
      const ordered = [...active, ...inactive];

      container.createDiv({ cls: 'quest-section-title', text: cat });
      const list = container.createDiv({ cls: 'quest-list' });

      for (const q of ordered) this.renderQuestItem(list, q);
    }

    // Add Generate Report button at bottom (reusing existing btn-icon styles)
    const reportContainer = container.createDiv({ cls: 'quest-footer' });
    const reportBtn = reportContainer.createEl('button', { text: '📊 Generate Report' });
    reportBtn.addClass('btn-icon');
    reportBtn.addClass('primary');
    reportBtn.style.width = 'auto';
    reportBtn.style.padding = '12px 24px';
    reportBtn.style.fontSize = '0.95em';
    reportBtn.addEventListener('click', async () => {
      await this.plugin.generateReport();
    });
  }

  renderQuestItem(container, quest) {
    const state = this.plugin.questLog.timerState;
    const isActive = state.activeQuestId === quest.id;
    const hasTime = this.hasAnyTime(quest.id);
    const isPaused = !isActive && hasTime;
    const totalMinutes = this.plugin.getTotalMinutes(quest.id);
    const isOvertime = !!(quest.estimateMinutes && totalMinutes > quest.estimateMinutes);

    const item = container.createDiv({ cls: 'quest-item' });
    if (isActive) item.addClass('quest-item--active');
    if (isPaused) item.addClass('quest-item--paused');
    if (isOvertime) item.addClass('quest-item--overtime');

    // Checkbox
    const checkbox = item.createEl('input', { type: 'checkbox', cls: 'quest-checkbox' });
    checkbox.checked = false;
    checkbox.addEventListener('change', async () => {
      if (checkbox.checked) await this.plugin.completeQuest(quest);
    });

    // Info
    const info = item.createDiv({ cls: 'quest-info' });
    info.createDiv({ cls: 'quest-name', text: quest.name });

    // Estimate / timer display
    const estimateEl = info.createDiv({ cls: 'quest-estimate' });
    this.updateEstimateDisplay(estimateEl, quest, totalMinutes, isActive, isPaused, isOvertime);

    // Actions
    const right = item.createDiv({ cls: 'quest-right' });
    if (!isActive && !isPaused) {
      const startBtn = this.createIconButton('play', 'Start quest');
      startBtn.addClass('primary');
      startBtn.addEventListener('click', async () => await this.plugin.startQuest(quest.id));
      right.appendChild(startBtn);
    }
    if (isActive) {
      const pauseBtn = this.createIconButton('pause', 'Pause quest');
      pauseBtn.addClass('accent');
      pauseBtn.addEventListener('click', async () => await this.plugin.pauseQuest(quest.id));
      right.appendChild(pauseBtn);
    }
    if (isPaused && !isActive) {
      const resumeBtn = this.createIconButton('play', 'Resume quest');
      resumeBtn.addClass('primary');
      resumeBtn.addEventListener('click', async () => await this.plugin.resumeQuest(quest.id));
      right.appendChild(resumeBtn);
    }

    // Index DOM nodes for fast live updates
    this.domIndex.set(quest.id, { estimateEl, itemEl: item, quest });
  }

  updateEstimateDisplay(div, quest, totalMinutes, isActive, isPaused, isOvertime) {
    div.empty();
    div.className = 'quest-estimate';

    const hasEstimate = quest.estimateMinutes != null && quest.estimateMinutes > 0;

    if (hasEstimate) {
      const remaining = quest.estimateMinutes - totalMinutes; // countdown
      const absText = formatTime(Math.abs(remaining));
      const prefix = isActive ? '⏱ ' : (isPaused ? '⏸ ' : '');
      let text;

      if (isActive || isPaused) {
        text = remaining >= 0 ? `${prefix}${absText}` : `${prefix}-${absText}`;
      } else {
        text = `Est: ${formatTime(quest.estimateMinutes)}`;
      }

      if (isActive) div.addClass('quest-estimate--running');
      if (isPaused) div.addClass('quest-estimate--paused');
      if (remaining < 0) div.addClass('quest-estimate--overtime');

      div.setText(text);
      return;
    }

    // No estimate: count-up when there's time; otherwise show nothing
    if (totalMinutes > 0) {
      const prefix = isActive ? '⏱ ' : (isPaused ? '⏸ ' : '');
      if (isActive) div.addClass('quest-estimate--running');
      if (isPaused) div.addClass('quest-estimate--paused');
      div.setText(`${prefix}${formatTime(totalMinutes)}`);
    } else {
      div.setText(''); // no estimate + not started => empty
    }
  }

  hasAnyTime(questId) {
    const s = this.plugin.questLog.timerState;
    return s.activeQuestId === questId || (s.pausedSessions[questId] || 0) > 0;
  }

  createIconButton(icon, title) {
    const btn = document.createElement('button');
    btn.className = 'btn-icon';
    btn.title = title;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      ${icon === 'play' ? '<path d="M8 5v14l11-7z" fill="currentColor"/>' :
        icon === 'pause' ? '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" fill="currentColor"/>' : ''}
    </svg>`;
    return btn;
  }
}

// ============================================================================
// CONFIRMATION MODAL
// ============================================================================

class ConfirmModal extends Modal {
  constructor(app, title, message, onConfirm) {
    super(app);
    this.title = title;
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: this.title });
    contentEl.createEl('p', { text: this.message, cls: 'modal-confirm-text' });

    const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.close();
      this.onConfirm(false);
    });

    const confirmBtn = btnContainer.createEl('button', { text: 'Confirm Reset' });
    confirmBtn.style.background = '#fc8181';
    confirmBtn.style.color = 'white';
    confirmBtn.addEventListener('click', () => {
      this.close();
      this.onConfirm(true);
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ============================================================================
// SETTINGS TAB
// ============================================================================

class DailyQuestLogSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Daily Quest Log Settings' });

    new Setting(containerEl)
      .setName('HABITS file path')
      .setDesc('Path to your quest source file (default: HABITS.md)')
      .addText(t => t.setPlaceholder('HABITS.md')
        .setValue(this.plugin.settings.habitsFilePath)
        .onChange(async v => { this.plugin.settings.habitsFilePath = v || HABITS_FILE_DEFAULT; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Quest log path')
      .setDesc('Path to store completions and player data (default: QuestLog.json)')
      .addText(t => t.setPlaceholder('QuestLog.json')
        .setValue(this.plugin.settings.questLogPath)
        .onChange(async v => { this.plugin.settings.questLogPath = v || QUEST_LOG_FILE_DEFAULT; await this.plugin.saveSettings(); }));

    containerEl.createEl('h3', { text: 'XP & Leveling' });

    new Setting(containerEl)
      .setName('XP per minute')
      .setDesc('XP earned per minute when quest has an estimate')
      .addText(t => t.setPlaceholder('1')
        .setValue(String(this.plugin.settings.xpPerMinute))
        .onChange(async v => { const n = parseFloat(v); if (!isNaN(n) && n > 0) { this.plugin.settings.xpPerMinute = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl)
      .setName('Flat XP (no estimate)')
      .setDesc('XP earned when quest has no time estimate')
      .addText(t => t.setPlaceholder('10')
        .setValue(String(this.plugin.settings.flatXp))
        .onChange(async v => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) { this.plugin.settings.flatXp = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl)
      .setName('Leveling base')
      .setDesc('Base XP for leveling formula')
      .addText(t => t.setPlaceholder('100')
        .setValue(String(this.plugin.settings.levelingBase))
        .onChange(async v => { const n = parseFloat(v); if (!isNaN(n) && n > 0) { this.plugin.settings.levelingBase = n; await this.plugin.saveSettings(); } }));

    new Setting(containerEl)
      .setName('Leveling exponent')
      .setDesc('Exponent for leveling formula (higher = steeper curve)')
      .addText(t => t.setPlaceholder('1.5')
        .setValue(String(this.plugin.settings.levelingExponent))
        .onChange(async v => { const n = parseFloat(v); if (!isNaN(n) && n > 0) { this.plugin.settings.levelingExponent = n; await this.plugin.saveSettings(); } }));

    containerEl.createEl('p', { text: 'XP for next level = round(base × level^exponent)', cls: 'setting-item-description' });

    // Danger Zone
    containerEl.createEl('h3', { text: '⚠️ Danger Zone' });

    new Setting(containerEl)
      .setName('Reset All Data')
      .setDesc('Permanently delete all quest completions, reset level and XP. This cannot be undone!')
      .addButton(btn => btn
        .setButtonText('Reset All Data')
        .setWarning()
        .onClick(async () => {
          await this.plugin.resetAllData();
        }));
  }
}