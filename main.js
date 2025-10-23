/**
 * Daily Quest Log — Optimized version
 * Requires: Obsidian API
 */
const { Plugin, TFile, Notice, PluginSettingTab, Setting, ItemView, Modal } = require('obsidian');

/* ========================================================================== */
/* CONSTANTS                                                                  */
/* ========================================================================== */

const VIEW_TYPE_QUESTS = 'daily-quest-log-view';
const QUEST_LOG_FILE = 'QuestLog.json';
const DEFAULT_SETTINGS = { questLogPath: QUEST_LOG_FILE, dailyResetHour: 0 };

const XP_CONFIG = { xpPerMinute: 1, flatXp: 10, levelingBase: 100, levelingExponent: 1.5 };

const RANKS = [
  { name: 'Novice', icon: '🌱', minLevel: 1, maxLevel: 4, color: '#a0d9a0' },
  { name: 'Student', icon: '📚', minLevel: 5, maxLevel: 8, color: '#9db4d8' },
  { name: 'Apprentice', icon: '📖', minLevel: 9, maxLevel: 12, color: '#8ea5c8' },
  { name: 'Acolyte', icon: '🕯️', minLevel: 13, maxLevel: 16, color: '#7eb8b8' },
  { name: 'Scholar', icon: '🎓', minLevel: 17, maxLevel: 20, color: '#5ed4d4' },
  { name: 'Mystic', icon: '🌙', minLevel: 21, maxLevel: 24, color: '#4ed9e5' },
  { name: 'Enchanter', icon: '💫', minLevel: 25, maxLevel: 29, color: '#3edff0' },
  { name: 'Conjurer', icon: '🪄', minLevel: 30, maxLevel: 34, color: '#2ee5fb' },
  { name: 'Summoner', icon: '🌀', minLevel: 35, maxLevel: 39, color: '#00e5ff' },
  { name: 'Diviner', icon: '🔮', minLevel: 40, maxLevel: 44, color: '#20d0ff' },
  { name: 'Illusionist', icon: '🎭', minLevel: 45, maxLevel: 49, color: '#40bbff' },
  { name: 'Alchemist', icon: '⚗️', minLevel: 50, maxLevel: 54, color: '#60a6ff' },
  { name: 'Evoker', icon: '⚡', minLevel: 55, maxLevel: 59, color: '#8091ff' },
  { name: 'Elementalist', icon: '🌪️', minLevel: 60, maxLevel: 64, color: '#a07cff' },
  { name: 'Warlock', icon: '☠️', minLevel: 65, maxLevel: 69, color: '#b794f6' },
  { name: 'Sorcerer', icon: '🔥', minLevel: 70, maxLevel: 74, color: '#c88ef6' },
  { name: 'Wizard', icon: '🧙', minLevel: 75, maxLevel: 79, color: '#d988f6' },
  { name: 'Arcanist', icon: '🕸️', minLevel: 80, maxLevel: 84, color: '#ea82f6' },
  { name: 'Magus', icon: '🌠', minLevel: 85, maxLevel: 89, color: '#f67cc8' },
  { name: 'Sage', icon: '🦉', minLevel: 90, maxLevel: 94, color: '#fc8181' },
  { name: 'Oracle', icon: '👁️', minLevel: 95, maxLevel: 99, color: '#ffa07a' },
  { name: 'Archmage', icon: '👑', minLevel: 100, maxLevel: 9e9, color: '#ffdf00' },
];

const RANK_FOR = (lvl) => RANKS.find((r) => lvl >= r.minLevel && lvl <= r.maxLevel) || RANKS[RANKS.length - 1];

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MON_FIRST_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_INDEX = Object.fromEntries(DAY_KEYS.map((k, i) => [k, i]));
const WEEKDAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri']);
const WEEKENDS = new Set(['sat', 'sun']);

/* ========================================================================== */
/* UTILITIES                                                                  */
/* ========================================================================== */

const toLocalDMY = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const todayStr = (resetHour = 0) => {
  const now = new Date(), adjustedDate = new Date(now);
  if (now.getHours() < resetHour) adjustedDate.setDate(adjustedDate.getDate() - 1);
  return toLocalDMY(adjustedDate);
};

const getLogicalToday = (resetHour = 0, now = new Date()) => {
  const d = new Date(now);
  if (d.getHours() < resetHour) d.setDate(d.getDate() - 1);
  // normalize to noon to dodge DST edges when using getDay()
  d.setHours(12, 0, 0, 0);
  return d;
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const safeParse = (str, fallback = null) => { try { return JSON.parse(str); } catch { return fallback; } };
const genId = (len = 12) => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(len); crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  }
  return Math.random().toString(36).slice(2, 2 + len);
};

const formatTime = (minutes) => {
  const totalSeconds = Math.max(0, Math.floor((minutes || 0) * 60));
  const h = Math.floor(totalSeconds / 3600), m = Math.floor((totalSeconds % 3600) / 60), s = totalSeconds % 60;
  if (h) return `${h}h${m ? ` ${m}m` : ''} ${s}s`;
  return m ? `${m}m ${s}s` : `${s}s`;
};

const normDay = (v) => {
  const s = String(v || '').trim().toLowerCase();
  for (const k of DAY_KEYS) if (s.startsWith(k)) return k;
  return null;
};

/* ========================================================================== */
/* ICONS (ADD THIS)                                                           */
/* ========================================================================== */

const ICONS = Object.freeze({
  // Buttons
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  pause: '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',

  // Stats
  bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',

  // Actions
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M3 8v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  unarchive: '<path d="M3 3h18v5H3z"/><path d="M3 8v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8"/><path d="M12 12v5m-3-3l3-3 3 3"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',

});

function svgIcon(name, { size = 16, stroke = 'currentColor', strokeWidth = 2, fill = 'none', attrs = 'stroke-linecap="round" stroke-linejoin="round"' } = {}) {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${attrs} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

/* ========================================================================== */
/* SCHEDULE UTILITIES                                                         */
/* ========================================================================== */

function parseSchedule(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'daily' || s === 'all' || s === 'everyday') return { kind: 'daily', days: new Set(DAY_KEYS) };
  if (s === 'weekdays') return { kind: 'weekdays', days: new Set(WEEKDAYS) };
  if (s === 'weekends') return { kind: 'weekends', days: new Set(WEEKENDS) };

  const days = new Set();
  for (const tok of s.split(/[\s,]+/).filter(Boolean)) {
    const [a, b] = tok.split('-'), A = normDay(a);
    if (!b) { if (A) days.add(A); continue; }
    const B = normDay(b);
    if (!A || !B) continue;
    for (let i = 0; i < 7; i++) {
      const idx = (DAY_INDEX[A] + i) % 7, key = DAY_KEYS[idx];
      days.add(key);
      if (key === B) break;
    }
  }
  return { kind: 'days', days };
}

const isScheduledOnDate = (schedule, date = new Date()) => parseSchedule(schedule).days.has(DAY_KEYS[date.getDay()]);
const parseSelectedDaysFromSchedule = (schedule) => new Set(parseSchedule(schedule).days);

function selectedDaysToSchedule(selectedDays) {
  const set = new Set(selectedDays || []);
  const isEqual = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  if (set.size === 7) return 'daily';
  if (isEqual(set, WEEKDAYS)) return 'weekdays';
  if (isEqual(set, WEEKENDS)) return 'weekends';
  return [...set].sort((a, b) => MON_FIRST_ORDER.indexOf(a) - MON_FIRST_ORDER.indexOf(b)).join(',');
}

/* ========================================================================== */
/* MAIN PLUGIN                                                                */
/* ========================================================================== */

module.exports = class DailyQuestLogPlugin extends Plugin {
  async onload() {
    // 1) Settings must be loaded first
    await this.loadSettings();

    // 2) Safe in-memory state so early renders don't crash
    if (!this.questLog) this.initializeQuestLog();

    // 3) Register UI early so Obsidian can restore the leaf
    this.registerView(VIEW_TYPE_QUESTS, (leaf) => new QuestView(leaf, this));
    this.ribbonEl = this.addRibbonIcon('target', 'Quest Log', () => this.activateView());
    this.updateRibbonLabel();
    this.addCommand({ id: 'open-quest-log', name: 'Open Quest Log', callback: () => this.activateView() });
    this.addSettingTab(new QuestLogSettingTab(this.app, this));
    // Check every minute for daily rollover (stops active timers at reset hour)
    this.registerInterval(window.setInterval(() => {
      this.ensureDailyRollover();
    }, 60_000));
    // 4) Defer disk I/O until workspace/vault is fully ready
    this.app.workspace.onLayoutReady(async () => {
      await this.loadQuestLog();
      await this.ensureDailyRollover(true);
      this.updateRibbonLabel();
      this.refreshView();
    });
  }

  async onunload() {
    try {
      await this.saveQuestLog();
    } catch (err) {
      console.error('QuestLog onunload save failed:', err);
    }
  }

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...(loaded || {}) };
  }
  async saveSettings() { await this.saveData(this.settings); }

  initializeQuestLog() {
    this.questLog = {
      quests: [],
      completions: [],
      player: { level: 1, xp: 0 },
      timerState: { activeQuestId: null, startTime: null, pausedSessions: {} },
      day: todayStr(this.settings.dailyResetHour),
    };
  }

  async loadQuestLog() {
    const path = this.settings.questLogPath;
    const file = this.app.vault.getAbstractFileByPath(path);

    if (file instanceof TFile) {
      const parsed = safeParse(await this.app.vault.read(file), null);
      // Add basic validation
      if (parsed && Array.isArray(parsed.quests) && parsed.player && parsed.timerState) {
        this.questLog = parsed;
      }
    }

    if (!this.questLog || !this.questLog.quests) {
      this.initializeQuestLog();
    }
  }

  async saveQuestLog() {
    const path = this.app.fileManager.normalizePath(this.settings.questLogPath);
    const folderPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
    if (folderPath) await this.ensureFolder(folderPath);

    const content = JSON.stringify(this.questLog, null, 2);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.modify(file, content);
    else await this.app.vault.create(path, content);
  }
  async commit() { await this.saveQuestLog(); this.refreshView(); }

  async ensureDailyRollover(init = false) {
    const t = todayStr(this.settings.dailyResetHour);

    if (this.questLog.day !== t) {
      const s = this.questLog.timerState;
      const wasActive = s.activeQuestId;

      // Clear ALL timer state - no rollover
      s.activeQuestId = null;
      s.startTime = null;
      s.pausedSessions = {};

      this.questLog.day = t;
      await this.commit();

      if (wasActive) {
        new Notice('⏰ Daily reset! All active timers cleared.', 4000);
      }
    }
  }

  updateRibbonLabel() {
    const { level } = this.questLog.player, rank = RANK_FOR(level);
    this.ribbonEl?.setAttribute('aria-label', `Quest Log • ${rank.icon} ${rank.name} (Lv${level})`);
  }

  getActiveQuests() {
    return this.questLog.quests
      .filter((q) => !q.archived) // NEW: exclude archived from active lists
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async createQuest({ name, category, schedule, estimateMinutes }) {
    const quest = {
      id: genId(),
      name: name.trim(),
      category: category.trim().toLowerCase(),
      schedule: schedule.trim(),
      estimateMinutes: estimateMinutes > 0 ? Math.floor(estimateMinutes) : null,
      order: this.getActiveQuests().length,
      createdAt: todayStr(this.settings.dailyResetHour),
      archived: false,
    };
    this.questLog.quests.push(quest);
    await this.commit();
    new Notice(`✓ Quest created: ${quest.name}`);
    return quest;
  }

  async updateQuest(id, changes) {
    const q = this.questLog.quests.find((x) => x.id === id);
    if (!q) return void new Notice('❌ Quest not found');

    if ('category' in changes) {
      changes.category = changes.category.trim().toLowerCase();
    }
    if ('estimateMinutes' in changes) {
      changes.estimateMinutes = changes.estimateMinutes > 0 ? Math.floor(changes.estimateMinutes) : null;
    }

    Object.assign(q, changes);
    await this.commit();
    new Notice('✓ Quest updated');
  }

  async deleteQuest(id, skipConfirm = false) {
    const idx = this.questLog.quests.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const q = this.questLog.quests[idx];
    if (!skipConfirm && !(await this.showConfirmDialog('🗑️ Delete Quest', `Delete "${q.name}"?`))) return;

    const s = this.questLog.timerState;
    if (s.activeQuestId === id) { s.activeQuestId = null; s.startTime = null; }
    delete s.pausedSessions[id];
    this.questLog.completions = this.questLog.completions.filter((c) => c.questId !== id);
    this.questLog.quests.splice(idx, 1);
    this.questLog.quests.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach((q, i) => (q.order = i));
    await this.commit();
    new Notice('✓ Quest deleted');
  }

  async archiveQuest(id) {
    const q = this.questLog.quests.find((x) => x.id === id);
    if (!q) return void new Notice('❌ Quest not found');
    if (q.archived) return void new Notice('Already archived.');

    // Pause if running
    const s = this.questLog.timerState;
    if (s.activeQuestId === id) await this.pauseQuest(id);

    q.archived = true;
    await this.commit();
    new Notice(`📦 Archived: ${q.name}`);
  }

  async unarchiveQuest(id) {
    const q = this.questLog.quests.find((x) => x.id === id);
    if (!q) return void new Notice('❌ Quest not found');
    if (!q.archived) return void new Notice('Quest is not archived.');

    q.archived = false;
    await this.commit();
    new Notice(`⏎ Unarchived: ${q.name}`);
  }

  async reorderQuests(questIds, category) {
    const inCat = this.questLog.quests.filter((q) => q.category === category);
    const base = inCat.length ? Math.min(...inCat.map((q) => q.order ?? 0)) : 0;
    questIds.forEach((id, i) => {
      const q = this.questLog.quests.find((x) => x.id === id);
      if (q) q.order = base + i;
    });
    this.questLog.quests.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach((q, i) => (q.order = i));
    await this.commit();
  }
  getTodayQuests() {
    const ref = getLogicalToday(this.settings.dailyResetHour);
    return this.getActiveQuests().filter((q) => isScheduledOnDate(q.schedule, ref));
  }
  getOtherQuests() {
    const ref = getLogicalToday(this.settings.dailyResetHour);
    return this.getActiveQuests().filter((q) => !isScheduledOnDate(q.schedule, ref));
  }
  isCompletedToday(questId) {
    const t = todayStr(this.settings.dailyResetHour);
    return this.questLog.completions.some((c) => c.questId === questId && c.date === t);
  }

  getQuestState(questId) {
    const s = this.questLog.timerState;
    const isActive = s.activeQuestId === questId;
    const totalMinutes = this.getTotalMinutes(questId);
    const isPaused = !isActive && totalMinutes > 0;
    const isCompleted = this.isCompletedToday(questId);
    const quest = this.questLog.quests.find(q => q.id === questId);
    const isOvertime = !!(quest?.estimateMinutes && totalMinutes > quest.estimateMinutes);
    return { isActive, isPaused, isCompleted, isOvertime, totalMinutes, quest };
  }

  getActiveElapsedMinutes() {
    const { activeQuestId, startTime } = this.questLog.timerState;
    return activeQuestId && startTime ? Math.max(0, (Date.now() - startTime) / 60000) : 0;
  }
  getTotalMinutes(questId) {
    const s = this.questLog.timerState, paused = s.pausedSessions[questId] || 0;
    return s.activeQuestId === questId ? paused + this.getActiveElapsedMinutes() : paused;
  }

  async startQuest(questId) {
    if (this.isCompletedToday(questId)) return void new Notice('Already completed today.');
    const q = this.questLog.quests.find((x) => x.id === questId);
    if (!q) return void new Notice('❌ Quest not found');
    if (q.archived) return void new Notice('📦 This quest is archived. Unarchive it to start.');

    const s = this.questLog.timerState;
    if (s.activeQuestId && s.activeQuestId !== questId) await this.pauseQuest(s.activeQuestId);
    s.activeQuestId = questId;
    s.startTime = Date.now();
    await this.commit();
  }

  async pauseQuest(questId) {
    const s = this.questLog.timerState;
    if (s.activeQuestId !== questId) return;
    s.pausedSessions[questId] = (s.pausedSessions[questId] || 0) + this.getActiveElapsedMinutes();
    s.activeQuestId = null; s.startTime = null;
    await this.commit();
  }

  async resumeQuest(questId) { return this.startQuest(questId); }

  calculateXP(estimateMinutes, actualMinutes) {
    return estimateMinutes && estimateMinutes > 0
      ? Math.round(Math.max(estimateMinutes, actualMinutes) * XP_CONFIG.xpPerMinute)
      : XP_CONFIG.flatXp;
  }

  awardXP(xp) {
    const p = this.questLog.player;
    p.xp += xp;
    while (p.xp >= this.getXPForNextLevel(p.level)) {
      const need = this.getXPForNextLevel(p.level);
      p.xp -= need;
      const before = RANK_FOR(p.level);
      p.level += 1;
      const after = RANK_FOR(p.level);
      before.name !== after.name
        ? new Notice(`🎊 RANK UP! You are now ${after.icon} ${after.name.toUpperCase()} (Level ${p.level})`, 6000)
        : new Notice(`🎉 Level Up! Level ${p.level} • ${after.icon} ${after.name}`);
    }
    this.updateRibbonLabel();
  }

  getXPForNextLevel(level) { return Math.round(XP_CONFIG.levelingBase * Math.pow(level, XP_CONFIG.levelingExponent)); }

  async completeQuest(quest) {
    const id = quest.id;
    if (quest.archived) return void new Notice('❌ Cannot complete archived quest.');
    if (this.isCompletedToday(id)) return void new Notice('Already completed today.');
    const minutes = this.getTotalMinutes(id), xp = this.calculateXP(quest.estimateMinutes, minutes);
    this.awardXP(xp);
    this.questLog.completions.push({
      questId: id, date: todayStr(this.settings.dailyResetHour),
      minutesSpent: Math.round(minutes), xpEarned: xp,
    });
    const s = this.questLog.timerState;
    if (s.activeQuestId === id) { s.activeQuestId = null; s.startTime = null; }
    delete s.pausedSessions[id];
    await this.commit();
    new Notice(`✓ ${quest.name} completed! +${xp} XP`);
  }

  async uncompleteQuest(questId) {
    const t = todayStr(this.settings.dailyResetHour);
    const completion = this.questLog.completions.find((c) => c.questId === questId && c.date === t);
    if (!completion) return;
    const p = this.questLog.player;
    p.xp -= completion.xpEarned;
    while (p.xp < 0 && p.level > 1) { p.level--; p.xp += this.getXPForNextLevel(p.level); }
    if (p.xp < 0) p.xp = 0;
    this.updateRibbonLabel();
    this.questLog.completions = this.questLog.completions.filter((c) => !(c.questId === questId && c.date === t));
    await this.commit();
    const quest = this.questLog.quests.find((q) => q.id === questId);
    new Notice(`⟲ ${quest ? quest.name : 'Quest'} uncompleted. -${completion.xpEarned} XP`);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_QUESTS)[0];
    if (!leaf) { leaf = workspace.getRightLeaf(false); await leaf.setViewState({ type: VIEW_TYPE_QUESTS, active: true }); }
    workspace.revealLeaf(leaf);
  }

  refreshView() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_QUESTS)) {
      if (leaf.view instanceof QuestView) leaf.view.render();
    }
  }

  showConfirmDialog(title, message) {
    return new Promise((resolve) => new ConfirmModal(this.app, title, message, resolve).open());
  }

  async resetAllData() {
    if (!(await this.showConfirmDialog('⚠️ Reset All Quest Data', 'This will clear all quests, completions, and reset level to 1. This cannot be undone!'))) return;
    this.initializeQuestLog();
    await this.commit();
    this.updateRibbonLabel();
    new Notice('✓ All quest data has been reset!');
  }

  async exportData() {
    try {
      const data = JSON.stringify(this.questLog, null, 2), blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `QuestLog-Export-${todayStr()}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      new Notice('✓ Quest data exported successfully!');
    } catch (err) {
      console.error('Export error:', err);
      new Notice('❌ Failed to export data. Check console for details.');
    }
  }

  async importData(jsonContent) {
    try {
      const imported = JSON.parse(jsonContent);

      if (!imported || typeof imported !== 'object') {
        throw new Error('Invalid data structure');
      }
      if (!Array.isArray(imported.quests) || !Array.isArray(imported.completions)) {
        throw new Error('Missing required fields: quests or completions');
      }

      if (!(await this.showConfirmDialog('⚠️ Import Quest Data', 'This will replace all current quest data. Continue?'))) {
        return;
      }

      this.questLog = imported;
      await this.commit();
      this.updateRibbonLabel();
      new Notice('✓ Quest data imported successfully!');
    } catch (err) {
      console.error('Import error:', err);
      new Notice(`❌ Failed to import: ${err.message}`);
    }
  }

  async generateReport() {
    new Notice('📊 Generating quest report...');
    try {
      const stats = await this.calculateStats();
      const reportContent = this.buildReportMarkdown(stats);
      const reportPath = 'Quest-Report.md';
      const existingFile = this.app.vault.getAbstractFileByPath(reportPath);
      if (existingFile instanceof TFile) await this.app.vault.modify(existingFile, reportContent);
      else await this.app.vault.create(reportPath, reportContent);
      new Notice(`✓ Report generated: ${reportPath}`);
      const file = this.app.vault.getAbstractFileByPath(reportPath);
      if (file instanceof TFile) { const leaf = this.app.workspace.getLeaf(false); await leaf.openFile(file); }
    } catch (err) {
      console.error('Report generation error:', err);
      new Notice('❌ Failed to generate report. Check console for details.');
    }
  }

  async calculateStats() {
    const { completions, player, quests } = this.questLog;
    const qName = Object.fromEntries(quests.map((q) => [q.id, q.name]));
    const totalCompleted = completions.length;

    const totals = completions.reduce((acc, c) => {
      acc.totalXP += c.xpEarned;
      acc.totalMinutes += c.minutesSpent;

      const d = (acc.byDate[c.date] ||= { count: 0, xp: 0, minutes: 0 });
      d.count++;
      d.xp += c.xpEarned;
      d.minutes += c.minutesSpent;

      const bq = (acc.byQuest[c.questId] ||= { count: 0, xp: 0, minutes: 0 });
      bq.count++;
      bq.xp += c.xpEarned;
      bq.minutes += c.minutesSpent;

      return acc;
    }, { totalXP: 0, totalMinutes: 0, byDate: {}, byQuest: {} });

    const resetHour = this.settings.dailyResetHour;
    const todayKey = todayStr(resetHour);
    const [y, m, d] = todayKey.split('-').map(Number);
    const anchor = new Date(y, m - 1, d); // local midnight of the reset-aligned date

    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const day = new Date(anchor);
      day.setDate(day.getDate() - (29 - i));
      const ds = toLocalDMY(day);
      const x = totals.byDate[ds] || { count: 0, xp: 0, minutes: 0 };
      return { date: ds, ...x };
    });

    const topQuests = Object.entries(totals.byQuest)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([id, data]) => ({ id, name: qName[id] || id, ...data }));

    return {
      player,
      totalCompleted,
      totalXP: totals.totalXP,
      totalMinutes: totals.totalMinutes,
      last30Days,
      topQuests
    };
  }

  buildReportMarkdown(stats) {
    const now = todayStr(this.settings.dailyResetHour);
    const h = Math.floor(stats.totalMinutes / 60), m = Math.floor(stats.totalMinutes % 60);
    const rank = RANK_FOR(stats.player.level);

    return `# 📊 Quest Report
*Generated: ${now}*

---

## 🏆 Overview

| Stat | Value |
|------|-------|
| **Current Rank** | ${rank.icon} **${rank.name}** |
| **Current Level** | ${stats.player.level} |
| **Current XP** | ${stats.player.xp} |
| **Total Quests Completed** | ${stats.totalCompleted} |
| **Total XP Earned** | ${stats.totalXP.toLocaleString()} |
| **Total Time Spent** | ${h}h ${m}m |

---

## 🎯 Top Quests

| Rank | Quest Name | Completions | Total XP | Total Time |
|------|-----------|-------------|----------|------------|
 ${stats.topQuests.map((q, i) => `| ${i + 1} | ${q.name} | ${q.count} | ${q.xp} XP | ${Math.floor(q.minutes / 60)}h ${Math.floor(q.minutes % 60)}m |`).join('\n') || '| - | No quests completed yet | - | - | - |'}

---

## 📅 Daily Breakdown (Last 30 Days)

| Date | Quests | XP Earned | Time Spent |
|------|--------|-----------|------------|
 ${stats.last30Days.slice().reverse().map((d) => `| ${d.date} | ${d.count} | ${d.xp} XP | ${Math.floor(d.minutes / 60) ? `${Math.floor(d.minutes / 60)}h ${Math.floor(d.minutes % 60)}m` : `${Math.floor(d.minutes % 60)}m`} |`).join('\n')}
`;
  }
};

/* ========================================================================== */
/* QUEST VIEW                                                                 */
/* ========================================================================== */

class QuestView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.timerHandle = null;
    this.domIndex = new Map();
    this.editingId = null;
    this.editingDraft = null;
    this.totalRemainingSpan = null;
    this.archivedCollapsed = true;
  }

  getViewType() { return VIEW_TYPE_QUESTS; }
  getDisplayText() { return 'Quest Log'; }
  getIcon() { return 'target'; }

  async onOpen() { await super.onOpen(); await this.render(); this.startTicker(); }
  async onClose() { this.stopTicker(); await super.onClose(); }

  startTicker() { this.stopTicker(); this.timerHandle = window.setInterval(() => this.updateActiveTimerRow(), 1000); }
  stopTicker() { if (this.timerHandle) { window.clearInterval(this.timerHandle); this.timerHandle = null; } }

  updateActiveTimerRow() {
    const { activeQuestId } = this.plugin.questLog.timerState;
    if (!activeQuestId) return;
    const entry = this.domIndex.get(activeQuestId);
    if (!entry) return;
    const { estimateEl, itemEl, quest } = entry;
    const state = this.plugin.getQuestState(activeQuestId);
    this.updateEstimateDisplay(estimateEl, quest, state);
    itemEl.toggleClass('quest-item--overtime', state.isOvertime);
    this.updateHeaderTimer();
  }

  updateHeaderTimer() {
    if (!this.totalRemainingSpan) return;
    const unfinished = this.plugin.getTodayQuests().filter((q) => !this.plugin.isCompletedToday(q.id));
    const totalRemaining = unfinished.reduce((sum, q) => {
      if (q.estimateMinutes && q.estimateMinutes > 0) {
        return sum + Math.max(0, q.estimateMinutes - this.plugin.getTotalMinutes(q.id));
      }
      return sum;
    }, 0);
    this.totalRemainingSpan.textContent = formatTime(totalRemaining);
  }

  createElement(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.cls) el.className = options.cls;
    if (options.text) el.textContent = options.text;
    if (options.html) el.innerHTML = options.html;
    if (options.title) el.title = options.title;
    if (options.attr) Object.entries(options.attr).forEach(([k, v]) => el.setAttribute(k, v));
    if (options.style) Object.assign(el.style, options.style);
    return el;
  }

  async render() {
    const container = this.contentEl;
    this.domIndex.clear();
    this.totalRemainingSpan = null;
    container.empty();
    container.addClass('quest-view-container');

    const { player } = this.plugin.questLog;
    const xpForNext = this.plugin.getXPForNextLevel(player.level);
    const xpPercent = clamp((player.xp / xpForNext) * 100, 0, 100);
    const rank = RANK_FOR(player.level);

    const header = container.createDiv({ cls: 'quest-view-header' });
    const headerTop = header.createDiv({ cls: 'quest-header-top-compact' });
    headerTop.createEl('h2', { text: "Today's Quests", cls: 'quest-title-compact' });

    const rankCompact = headerTop.createDiv({ cls: 'rank-compact' });
    rankCompact.innerHTML = `
  <span class="rank-compact__icon" style="color:${rank.color};text-shadow:0 0 12px ${rank.color}80">${rank.icon}</span>
  <div class="rank-compact__info">
    <span class="rank-compact__level">Lv${player.level}</span>
    <span class="rank-compact__name" style="color:${rank.color}">${rank.name}</span>
  </div>`;

    const todayQuests = this.plugin.getTodayQuests();
    const completedCount = todayQuests.filter((q) => this.plugin.isCompletedToday(q.id)).length;
    const unfinished = todayQuests.filter((q) => !this.plugin.isCompletedToday(q.id));
    const totalRemaining = unfinished.reduce((sum, q) => {
      if (q.estimateMinutes && q.estimateMinutes > 0) {
        return sum + Math.max(0, q.estimateMinutes - this.plugin.getTotalMinutes(q.id));
      }
      return sum;
    }, 0);

    const progressRow = header.createDiv({ cls: 'quest-progress-row' });
    const xpContainer = progressRow.createDiv({ cls: 'xp-container-compact' });
    const xpBar = xpContainer.createDiv({ cls: 'xp-bar-compact' });
    const xpFill = xpBar.createDiv({ cls: 'xp-fill-compact' });
    xpFill.style.width = `${xpPercent}%`;

    const xpStats = xpContainer.createDiv({ cls: 'xp-stats-overlay' });
    xpStats.innerHTML = `
  <div class="xp-stat">
    ${svgIcon('bolt', { size: 12 })}
    <span>${player.xp}/${xpForNext}</span>
  </div>
  <div class="xp-stat xp-stat--success">
    ${svgIcon('check', { size: 12 })}
    <span>${completedCount}/${todayQuests.length}</span>
  </div>
  <div class="xp-stat xp-stat--time">
    ${svgIcon('clock', { size: 12 })}
    <span class="quest-total-remaining">${formatTime(totalRemaining)}</span>
  </div>`;

    this.totalRemainingSpan = xpStats.querySelector('.quest-total-remaining');

    const addBtnCompact = this.createElement('button', {
      cls: 'btn-add-compact',
      attr: { type: 'button', 'aria-label': 'Add Quest' },
      title: 'Add Quest',
      html: svgIcon('plus', { size: 14, strokeWidth: 2.5 })
    });
    addBtnCompact.addEventListener('click', () => this.openInlineAdd());
    progressRow.appendChild(addBtnCompact);

    if (this.editingId === 'new') this.renderInlineNew(container);

    const hasActiveQuest = !!this.plugin.questLog.timerState.activeQuestId;
    const otherQuests = this.plugin.getOtherQuests();
    const activeToday = todayQuests.filter((q) => !this.plugin.isCompletedToday(q.id));
    const categoriesMap = new Map();
    for (const q of activeToday) {
      const cat = q.category || 'uncategorized';
      if (!categoriesMap.has(cat)) categoriesMap.set(cat, []);
      categoriesMap.get(cat).push(q);
    }

    if (categoriesMap.size) {
      for (const [category, quests] of categoriesMap.entries()) {
        container.createDiv({ cls: 'quest-section-title', text: category });
        const categoryList = container.createDiv({ cls: 'quest-list' });
        categoryList.dataset.category = category;
        if (hasActiveQuest) categoryList.addClass('has-active-quest');
        this.setupDragDrop(categoryList);
        for (const q of quests) this.renderQuestItem(categoryList, q, { draggable: true, locked: false });
      }
    } else {
      container.createDiv({ cls: 'quest-empty-state', text: '🎉 All quests completed for today!' });
    }

    if (otherQuests.length) {
      container.createDiv({ cls: 'quest-section-title quest-section-other', text: '📅 Other Days' });
      const otherList = container.createDiv({ cls: 'quest-list quest-list--dimmed' });
      for (const q of otherQuests) this.renderQuestItem(otherList, q, { draggable: false, locked: true });
    }

    // Archived section with collapsible functionality
    const archived = this.plugin.questLog.quests.filter((q) => q.archived);
    if (archived.length) {
      // Create clickable header with chevron
      const header = container.createDiv({ cls: 'quest-section-title quest-section-archived quest-section-toggle' });
      header.innerHTML = `${svgIcon('chevronDown', { size: 12 })} 📦 Archived (${archived.length})`;
      header.style.cursor = 'pointer';
      if (this.archivedCollapsed) header.addClass('collapsed');

      // Create the list container
      const list = container.createDiv({ cls: 'quest-archived-list' });
      if (this.archivedCollapsed) list.style.display = 'none';

      // Toggle functionality
      header.addEventListener('click', () => {
        this.archivedCollapsed = !this.archivedCollapsed;
        header.toggleClass('collapsed', this.archivedCollapsed);
        list.style.display = this.archivedCollapsed ? 'none' : 'block';
      });

      // Render all archived items
      for (const q of archived) {
        const item = list.createDiv({ cls: 'quest-archived-item' });
        item.createDiv({ cls: 'quest-archived-name', text: q.name });

        const controls = item.createDiv({ cls: 'quest-archived-controls' });

        // Unarchive icon button
        const unarchiveBtn = this.createElement('button', {
          cls: 'btn-archived-icon',
          attr: { type: 'button', 'aria-label': 'Unarchive quest', title: 'Unarchive' }
        });
        unarchiveBtn.innerHTML = svgIcon('unarchive', { size: 16 });
        unarchiveBtn.addEventListener('click', async () => {
          await this.plugin.unarchiveQuest(q.id);
          this.render();
        });

        // Delete icon button
        const deleteBtn = this.createElement('button', {
          cls: 'btn-archived-icon btn-archived-icon--danger',
          attr: { type: 'button', 'aria-label': 'Delete quest', title: 'Delete permanently' }
        });
        deleteBtn.innerHTML = svgIcon('trash', { size: 16 });
        deleteBtn.addEventListener('click', async () => {
          await this.plugin.deleteQuest(q.id);
          this.render();
        });

        controls.appendChild(unarchiveBtn);
        controls.appendChild(deleteBtn);
      }
    }

    this.renderCompletedSection(container);

    const footer = container.createDiv({ cls: 'quest-footer' });
    const reportBtn = this.createElement('button', {
      text: '📊 Generate Report',
      cls: 'btn-primary',
      attr: { type: 'button', 'aria-label': 'Generate Report' }
    });
    reportBtn.addEventListener('click', () => this.plugin.generateReport());
    footer.appendChild(reportBtn);

    this.updateHeaderTimer();
  }

  renderInlineNew(container) {
    const host = container.createDiv();
    const item = host.createDiv({ cls: 'quest-item quest-item--editing quest-item--new' });
    const checkbox = item.createEl('input', { type: 'checkbox', cls: 'quest-checkbox', attr: { disabled: 'disabled' } });
    checkbox.disabled = true;

    const info = item.createDiv({ cls: 'quest-info' });
    const nameEl = info.createDiv({ cls: 'quest-name' });
    const nameInput = nameEl.createEl('input', {
      type: 'text', value: this.editingDraft?.name || '', cls: 'quest-name-input-inline',
      attr: { placeholder: 'Enter quest name...' },
    });
    nameInput.addEventListener('input', () => { (this.editingDraft ||= {}).name = nameInput.value; });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.saveInlineEdit('new', item); }
      if (e.key === 'Escape') { e.preventDefault(); this.closeInlineEdit(); }
    });

    this.attachInlineEditor(item, { name: '', category: '', estimateMinutes: null, schedule: 'daily' }, true, 'new');
    setTimeout(() => nameInput.focus(), 100);
  }

  renderQuestItem(container, quest, { draggable, locked }) {
    const state = this.plugin.getQuestState(quest.id);
    const isEditing = this.editingId === quest.id;

    const item = container.createDiv({ cls: 'quest-item' });
    item.dataset.questId = quest.id;

    const classes = {
      'quest-item--active': state.isActive,
      'quest-item--paused': state.isPaused,
      'quest-item--overtime': state.isOvertime,
      'quest-item--locked': locked,
      'quest-item--completed': state.isCompleted,
      'quest-item--editing': isEditing
    };
    Object.entries(classes).forEach(([cls, condition]) => item.toggleClass(cls, condition));

    if (draggable && !locked) {
      const dragHandle = item.createDiv({ cls: 'quest-drag-handle', title: 'Drag to reorder' });
      dragHandle.innerHTML = '⋮⋮';
      item.draggable = true;
    }

    const checkbox = item.createEl('input', { type: 'checkbox', cls: 'quest-checkbox' });
    checkbox.checked = state.isCompleted;
    checkbox.disabled = locked || state.isCompleted || state.isActive;
    checkbox.setAttribute('aria-label', `Complete ${quest.name}`);
    if (!locked && !state.isCompleted && !state.isActive) {
      checkbox.addEventListener('change', async () => {
        if (checkbox.checked) await this.plugin.completeQuest(quest);
      });
    }

    const info = item.createDiv({ cls: 'quest-info' });
    const nameEl = info.createDiv({ cls: 'quest-name' });

    if (isEditing) {
      const nameInput = nameEl.createEl('input', {
        type: 'text', value: this.editingDraft?.name || quest.name, cls: 'quest-name-input-inline',
        attr: { placeholder: 'Quest name...' },
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.saveInlineEdit(quest.id, item); }
        if (e.key === 'Escape') { e.preventDefault(); this.closeInlineEdit(); }
      });
      nameInput.addEventListener('input', () => { (this.editingDraft ||= {}).name = nameInput.value; });
      setTimeout(() => nameInput.focus(), 50);
    } else {
      nameEl.setText(quest.name);
      if (!state.isCompleted && !state.isActive) {
        const startInlineEdit = (e) => { e.preventDefault(); this.openInlineEdit(quest); };
        nameEl.addClass('quest-name--editable');
        nameEl.addEventListener('dblclick', startInlineEdit);

        let pressTimer = null;
        nameEl.addEventListener('touchstart', () => {
          pressTimer = setTimeout(() => { startInlineEdit(new Event('custom')); pressTimer = null; }, 500);
        });
        nameEl.addEventListener('touchend', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
        nameEl.addEventListener('touchmove', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
      }
    }

    const estimateEl = info.createDiv({ cls: 'quest-estimate' });
    this.updateEstimateDisplay(estimateEl, quest, state);

    const controls = item.createDiv({ cls: 'quest-controls' });
    if (!locked && !state.isCompleted) {
      if (!state.isActive && !state.isPaused) {
        const startBtn = this.iconBtn('play', 'Start'); startBtn.addClass('primary');
        startBtn.addEventListener('click', async () => await this.plugin.startQuest(quest.id));
        controls.appendChild(startBtn);
      }
      if (state.isActive) {
        const pauseBtn = this.iconBtn('pause', 'Pause'); pauseBtn.addClass('accent');
        pauseBtn.addEventListener('click', async () => await this.plugin.pauseQuest(quest.id));
        controls.appendChild(pauseBtn);
      }
      if (state.isPaused && !state.isActive) {
        const resumeBtn = this.iconBtn('play', 'Resume'); resumeBtn.addClass('primary');
        resumeBtn.addEventListener('click', async () => await this.plugin.resumeQuest(quest.id));
        controls.appendChild(resumeBtn);
      }
    }

    if (locked) {
      const overlay = item.createDiv({ cls: 'quest-lock-overlay', title: 'Not scheduled for today' });
      overlay.innerHTML = '🔒';
      overlay.style.pointerEvents = 'none';
      overlay.setAttribute('aria-hidden', 'true');
    }

    if (isEditing) {
      this.attachInlineEditor(item, {
        name: quest.name, category: quest.category,
        estimateMinutes: quest.estimateMinutes ?? null, schedule: quest.schedule || 'weekdays',
      }, false, quest.id);
    }

    this.domIndex.set(quest.id, { estimateEl, itemEl: item, quest });
  }

  updateEstimateDisplay(div, quest, state) {
    div.empty(); div.className = 'quest-estimate';
    if (state.isCompleted) { div.setText('Completed'); div.addClass('quest-estimate--paused'); return; }

    const hasEstimate = quest.estimateMinutes != null && quest.estimateMinutes > 0;
    if (hasEstimate) {
      const remaining = quest.estimateMinutes - state.totalMinutes;
      const absText = formatTime(Math.abs(remaining));
      const prefix = state.isActive ? '⏱ ' : (state.isPaused ? '⏸ ' : '');
      const text = (state.isActive || state.isPaused)
        ? (remaining >= 0 ? `${prefix}${absText}` : `${prefix}-${absText}`)
        : `Est: ${formatTime(quest.estimateMinutes)}`;

      if (state.isActive) div.addClass('quest-estimate--running');
      if (state.isPaused) div.addClass('quest-estimate--paused');
      if (remaining < 0) div.addClass('quest-estimate--overtime');
      div.setText(text);
    } else if (state.totalMinutes > 0) {
      const prefix = state.isActive ? '⏱ ' : (state.isPaused ? '⏸ ' : '');
      if (state.isActive) div.addClass('quest-estimate--running');
      if (state.isPaused) div.addClass('quest-estimate--paused');
      div.setText(`${prefix}${formatTime(state.totalMinutes)}`);
    }
  }

  setupDragDrop(container) {
    let dragged = null;
    container.addEventListener('dragstart', (e) => {
      if (!e.target.classList.contains('quest-item') || !e.target.draggable) return;
      dragged = e.target; e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', e.target.dataset.questId);
      setTimeout(() => dragged.addClass('dragging'), 0);
    });

    container.addEventListener('dragend', async () => {
      if (!dragged) return;
      dragged.removeClass('dragging');
      const items = Array.from(container.querySelectorAll('.quest-item'));
      const newOrder = items.map((el) => el.dataset.questId);
      await this.plugin.reorderQuests(newOrder, container.dataset.category);
      dragged = null;
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const after = this.getDragAfterElement(container, e.clientY);
      const dragging = container.querySelector('.dragging');
      if (!dragging) return;
      if (!after) container.appendChild(dragging); else container.insertBefore(dragging, after);
    });
  }

  getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll('.quest-item:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
  }

  renderCompletedSection(container) {
    const t = todayStr(this.plugin.settings.dailyResetHour);
    const completedToday = this.plugin.questLog.completions.filter((c) => c.date === t).reverse();
    if (!completedToday.length) return;

    const section = container.createDiv({ cls: 'quest-completed-section' });
    section.createDiv({ cls: 'quest-section-title quest-section-completed' }).innerHTML = `✅ Completed Today (${completedToday.length})`;

    const list = section.createDiv({ cls: 'quest-completed-list' });
    for (const completion of completedToday) {
      const quest = this.plugin.questLog.quests.find((q) => q.id === completion.questId);
      if (!quest) continue;
      const item = list.createDiv({ cls: 'quest-completed-item' });
      const checkbox = item.createEl('input', { type: 'checkbox', cls: 'quest-checkbox' });
      checkbox.checked = true; checkbox.setAttribute('aria-label', `Uncomplete ${quest.name}`);
      checkbox.addEventListener('change', async () => { if (!checkbox.checked) await this.plugin.uncompleteQuest(quest.id); });

      const info = item.createDiv({ cls: 'quest-completed-info' });
      info.createDiv({ cls: 'quest-completed-name', text: quest.name });
      info.createDiv({ cls: 'quest-completed-meta' }).innerHTML = `<span>+${completion.xpEarned} XP</span> <span>•</span> <span>${formatTime(completion.minutesSpent)}</span>`;
    }
  }

  openInlineAdd() {
    this.editingId = 'new';
    this.editingDraft = { name: '', category: '', estimateMinutes: null, selectedDays: new Set(DAY_KEYS) };
    this.render();
  }

  openInlineEdit(quest) {
    this.editingId = quest.id;
    this.editingDraft = {
      name: quest.name, category: quest.category, estimateMinutes: quest.estimateMinutes ?? null,
      selectedDays: parseSelectedDaysFromSchedule(quest.schedule || 'daily'),
    };
    this.render();
  }

  closeInlineEdit() { this.editingId = null; this.editingDraft = null; this.render(); }

  async saveInlineEdit(questId, item) {
    const name = (this.editingDraft?.name || '').trim();
    if (!name) {
      new Notice('❌ Quest name is required');
      const nameInput = item.querySelector('.quest-name-input-inline');
      if (nameInput) {
        nameInput.focus(); nameInput.addClass('input-error');
        setTimeout(() => nameInput.removeClass('input-error'), 1200);
      }
      return;
    }

    const selectedDays = this.editingDraft?.selectedDays || new Set();
    if (selectedDays.size === 0) return void new Notice('❌ At least one day must be selected');

    const category = (this.editingDraft?.category || '').trim().toLowerCase() || 'uncategorized';
    const estimateMinutes = this.editingDraft?.estimateMinutes ?? null;
    const schedule = selectedDaysToSchedule(selectedDays);
    const wasNew = questId === 'new' || !questId;
    const editor = item.querySelector('.quest-editor');

    this.editingId = null; this.editingDraft = null;

    const saveAction = async () => {
      if (wasNew) await this.plugin.createQuest({ name, category, schedule, estimateMinutes });
      else await this.plugin.updateQuest(questId, { name, category, schedule, estimateMinutes });
    };

    if (editor) this.animateCollapse(editor, saveAction);
    else await saveAction();
  }

  attachInlineEditor(item, draft, isNew, questId = null) {
    const editor = item.createDiv({ cls: 'quest-editor', attr: { 'aria-expanded': 'true' } });

    const z1 = editor.createDiv({ cls: 'quest-editor__zone zone1' });
    const row = z1.createDiv({ cls: 'form-row-two-col' });

    const existingCategories = [...new Set(this.plugin.questLog.quests.map(q => q.category || 'uncategorized'))].sort();
    const datalistId = `category-list-${genId(6)}`;

    const categoryGroup = row.createDiv({ cls: 'form-group-compact' });
    categoryGroup.createEl('label', { text: 'Category', cls: 'form-label-compact' });
    const datalist = categoryGroup.createEl('datalist', { attr: { id: datalistId } });
    existingCategories.forEach(cat => datalist.createEl('option', { value: cat }));

    const categoryInput = categoryGroup.createEl('input', {
      type: 'text', value: this.editingDraft?.category ?? draft.category ?? '', cls: 'form-input-beautiful',
      attr: { placeholder: 'e.g., health', list: datalistId, autocomplete: 'off' },
    });

    categoryInput.addEventListener('input', () => { (this.editingDraft ||= {}).category = categoryInput.value.trim().toLowerCase(); });
    categoryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        const currentValue = categoryInput.value.trim().toLowerCase();
        if (currentValue) {
          const match = existingCategories.find(cat => cat.toLowerCase().startsWith(currentValue));
          if (match) {
            e.preventDefault(); categoryInput.value = match;
            (this.editingDraft ||= {}).category = match;
            categoryInput.setSelectionRange(match.length, match.length);
          }
        }
      }
    });

    const estimateGroup = row.createDiv({ cls: 'form-group-compact' });
    estimateGroup.createEl('label', { text: 'Time (min)', cls: 'form-label-compact' });
    const estimateInput = estimateGroup.createEl('input', {
      type: 'number', value: (this.editingDraft?.estimateMinutes ?? draft.estimateMinutes) ?? '',
      cls: 'form-input-beautiful', attr: { placeholder: 'Optional' },
    });
    estimateInput.addEventListener('input', () => {
      (this.editingDraft ||= {}).estimateMinutes = estimateInput.value ? parseInt(estimateInput.value, 10) : null;
    });

    const z2 = editor.createDiv({ cls: 'quest-editor__zone zone2' });
    const scheduleHeader = z2.createDiv({ cls: 'schedule-header' });
    scheduleHeader.createEl('label', { text: 'Schedule Days', cls: 'form-label-schedule' });

    const presetsInline = scheduleHeader.createDiv({ cls: 'schedule-presets-inline' });
    const selectedDays = this.editingDraft?.selectedDays || parseSelectedDaysFromSchedule(draft.schedule || 'weekdays');

    const updateDayButtons = () => btns.forEach(({ btn, key }) => {
      const active = selectedDays.has(key);
      btn.toggleClass('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const applyPreset = (days) => { selectedDays.clear(); days.forEach((d) => selectedDays.add(d)); updateDayButtons(); };

    [
      { label: 'Daily', days: DAY_KEYS },
      { label: 'Weekdays', days: [...WEEKDAYS] },
      { label: 'Weekends', days: [...WEEKENDS] },
    ].forEach((preset) => {
      const b = presetsInline.createEl('button', { text: preset.label, cls: 'preset-btn-inline', attr: { type: 'button' } });
      b.addEventListener('click', (e) => { e.preventDefault(); applyPreset(preset.days); });
    });

    const dayPicker = z2.createDiv({ cls: 'day-picker-beautiful' });
    const dayDefs = [
      { key: 'mon', label: 'MON' }, { key: 'tue', label: 'TUE' }, { key: 'wed', label: 'WED' },
      { key: 'thu', label: 'THU' }, { key: 'fri', label: 'FRI' }, { key: 'sat', label: 'SAT' }, { key: 'sun', label: 'SUN' },
    ];
    const btns = [];
    dayDefs.forEach((d) => {
      const btn = dayPicker.createEl('button', {
        cls: 'day-btn-beautiful',
        attr: { 'data-day': d.key, type: 'button', title: d.label, 'aria-pressed': selectedDays.has(d.key) ? 'true' : 'false' },
      });
      btn.setText(d.label);
      btn.toggleClass('active', selectedDays.has(d.key));
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const isActive = selectedDays.has(d.key);
        if (isActive && selectedDays.size === 1) {
          new Notice('At least one day must be selected.');
          btn.toggleClass('shake', true);
          setTimeout(() => btn.toggleClass('shake', false), 400);
          return;
        }
        if (isActive) selectedDays.delete(d.key); else selectedDays.add(d.key);
        updateDayButtons();
      });
      btns.push({ btn, key: d.key });
    });

    const z3 = editor.createDiv({ cls: 'quest-editor__zone zone3' });
    if (!isNew) {
      // Archive button with SVG icon
      const archiveBtn = z3.createEl('button', {
        cls: 'btn-archive-beautiful',
        attr: { type: 'button', title: 'Archive quest (keep history)' }
      });
      archiveBtn.innerHTML = svgIcon('archive', { size: 14 });
      archiveBtn.addEventListener('click', async () => {
        await this.plugin.archiveQuest(questId);
        this.closeInlineEdit();
      });

      // Delete button
      const deleteBtn = z3.createEl('button', { cls: 'btn-delete-beautiful', attr: { type: 'button', title: 'Delete quest' } });
      deleteBtn.innerHTML = svgIcon('trash', { size: 16 });
      deleteBtn.addEventListener('click', async () => { await this.plugin.deleteQuest(questId); this.closeInlineEdit(); });
    }

    const right = z3.createDiv({ cls: 'footer-right' });
    const cancelBtn = right.createEl('button', { text: 'Cancel', cls: 'btn-cancel-beautiful', attr: { type: 'button' } });
    const saveBtn = right.createEl('button', { text: isNew ? 'Create' : 'Save', cls: 'btn-save-beautiful', attr: { type: 'button' } });
    cancelBtn.addEventListener('click', () => this.closeInlineEdit());
    saveBtn.addEventListener('click', () => this.saveInlineEdit(questId, item));

    [categoryInput, estimateInput].forEach((inp) => inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.saveInlineEdit(questId, item); }
      if (e.key === 'Escape') { e.preventDefault(); this.closeInlineEdit(); }
    }));

    this.animateExpand(editor);
  }

  animateExpand(el) {
    el.style.overflow = 'hidden'; el.style.maxHeight = '0px'; el.style.transition = 'max-height 220ms ease';
    requestAnimationFrame(() => { el.style.maxHeight = el.scrollHeight + 'px'; });
  }

  animateCollapse(el, done) {
    el.style.overflow = 'hidden'; el.style.transition = 'max-height 200ms ease'; el.style.maxHeight = el.scrollHeight + 'px';
    requestAnimationFrame(() => { el.style.maxHeight = '0px'; });
    const fn = () => { el.removeEventListener('transitionend', fn); done && done(); };
    el.addEventListener('transitionend', fn);
  }

  iconBtn(icon, title) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML = svgIcon(icon, { size: 16 });
    return btn;
  }
}

/* ========================================================================== */
/* CONFIRM MODAL                                                              */
/* ========================================================================== */

class ConfirmModal extends Modal {
  constructor(app, title, message, onConfirm) { super(app); this.title = title; this.message = message; this.onConfirm = onConfirm; }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.title });
    contentEl.createEl('p', { text: this.message, cls: 'modal-confirm-text' });
    const btns = contentEl.createDiv({ cls: 'modal-buttons' });
    const cancel = btns.createEl('button', { text: 'Cancel', cls: 'btn-secondary', attr: { type: 'button' } });
    const confirm = btns.createEl('button', { text: 'Confirm', cls: 'btn-danger', attr: { type: 'button' } });
    cancel.addEventListener('click', () => { this.close(); this.onConfirm(false); });
    confirm.addEventListener('click', () => { this.close(); this.onConfirm(true); });
  }
  onClose() { this.contentEl.empty(); }
}

/* ========================================================================== */
/* SETTINGS TAB                                                               */
/* ========================================================================== */

class QuestLogSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Daily Quest Log Settings' });

    new Setting(containerEl)
      .setName('Quest log path')
      .setDesc('Path to store all quest data (default: QuestLog.json)')
      .addText((t) => t.setPlaceholder('QuestLog.json')
        .setValue(this.plugin.settings.questLogPath)
        .onChange(async (v) => { this.plugin.settings.questLogPath = v || QUEST_LOG_FILE; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Daily reset hour')
      .setDesc('Hour when the day resets (0-23). For example: 4 = 4:00 AM. Times before this hour count as previous day.')
      .addText((t) => t
        .setPlaceholder('0')
        .setValue(String(this.plugin.settings.dailyResetHour))
        .onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0 && n <= 23) {
            this.plugin.settings.dailyResetHour = n;
            await this.plugin.saveSettings();
            await this.plugin.ensureDailyRollover(true);
            new Notice(`Daily reset time set to ${n}:00`);
          } else {
            new Notice('❌ Please enter a number between 0 and 23');
          }
        }));

    containerEl.createEl('h3', { text: '💾 Backup & Restore' });

    new Setting(containerEl)
      .setName('Export Data')
      .setDesc('Download all quest data as a JSON file for backup')
      .addButton((btn) => btn.setButtonText('Export Data').setCta().onClick(() => this.plugin.exportData()));

    new Setting(containerEl)
      .setName('Import Data')
      .setDesc('Restore quest data from a previously exported JSON file. This will replace all current data.')
      .addButton((btn) => btn.setButtonText('Import Data').setWarning().onClick(() => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async (event) => await this.plugin.importData(event.target.result);
          reader.onerror = () => new Notice('❌ Failed to read file');
          reader.readAsText(file);
        };
        input.click();
      }));

    containerEl.createEl('h3', { text: '⚠️ Danger Zone' });
    new Setting(containerEl)
      .setName('Reset All Data')
      .setDesc('Permanently delete all quests, completions, and reset level/XP. This cannot be undone!')
      .addButton((btn) => btn.setButtonText('Reset All Data').setWarning().onClick(async () => await this.plugin.resetAllData()));
  }
}