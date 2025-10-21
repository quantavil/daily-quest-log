/**
 * Daily Quest Log — simplified date handling, fixes, and ordering
 * Requires: Obsidian API
 */
const { Plugin, TFile, Notice, PluginSettingTab, Setting, ItemView, Modal } = require('obsidian');

/* ========================================================================== */
/* CONSTANTS                                                                  */
/* ========================================================================== */

const VIEW_TYPE_QUESTS = 'daily-quest-log-view';
const QUEST_LOG_FILE = 'QuestLog.json';

const DEFAULT_SETTINGS = {
  questLogPath: QUEST_LOG_FILE,
  xpPerMinute: 1,
  flatXp: 10,
  levelingBase: 100,
  levelingExponent: 1.5,
};

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
  { name: 'Alchemist', icon: '⚗️', minLevel: 50, maxLevel:54, color: '#60a6ff' },
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

/* ========================================================================== */
/* UTILITIES                                                                  */
/* ========================================================================== */

const toLocalDMY = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const todayStr = () => toLocalDMY(new Date());
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
  if (h) return m ? `${h}h ${m}m ${s}s` : `${h}h ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};

/* ========================================================================== */
/* SCHEDULE UTILS — simplified (no specific date parsing)                     */
/* ========================================================================== */

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Date.getDay(): 0=Sun..6=Sat
const DAY_TO_INDEX = Object.fromEntries(DAY_KEYS.map((k, i) => [k, i]));
const MON_FIRST_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function parseSchedule(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'daily') return { kind: 'daily', days: new Set(DAY_KEYS) };
  if (s === 'weekdays') return { kind: 'weekdays', days: new Set(['mon', 'tue', 'wed', 'thu', 'fri']) };
  if (s === 'weekends') return { kind: 'weekends', days: new Set(['sat', 'sun']) };

  // Only day-of-week tokens and ranges, e.g., "mon,wed,fri" or "mon-fri" (wrap allowed: "fri-mon")
  const tokens = s.split(/[\s,]+/).filter(Boolean);
  const days = new Set();
  const isKey = (k) => Object.prototype.hasOwnProperty.call(DAY_TO_INDEX, k);
  for (const tok of tokens) {
    if (tok.includes('-')) {
      const [a, b] = tok.split('-');
      if (isKey(a) && isKey(b)) {
        const ai = DAY_TO_INDEX[a], bi = DAY_TO_INDEX[b];
        for (let i = 0; i < 7; i++) {
          const idx = (ai + i) % 7;
          days.add(DAY_KEYS[idx]);
          if (idx === bi) break;
        }
      }
    } else if (isKey(tok)) {
      days.add(tok);
    }
  }
  return { kind: 'days', days };
}

function isScheduledOnDate(schedule, date = new Date()) {
  const parsed = parseSchedule(schedule);
  if (parsed.kind === 'daily') return true;
  if (parsed.kind === 'weekdays') { const d = date.getDay(); return d >= 1 && d <= 5; }
  if (parsed.kind === 'weekends') { const d = date.getDay(); return d === 0 || d === 6; }
  const todayKey = DAY_KEYS[date.getDay()];
  return parsed.days.has(todayKey);
}

function parseSelectedDaysFromSchedule(schedule) {
  return new Set(parseSchedule(schedule).days);
}

function selectedDaysToSchedule(selectedDays) {
  const set = new Set(selectedDays || []);
  if (set.size === 7) return 'daily';
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const weekends = ['sat', 'sun'];
  if (weekdays.every((d) => set.has(d)) && weekends.every((d) => !set.has(d))) return 'weekdays';
  if (weekends.every((d) => set.has(d)) && weekdays.every((d) => !set.has(d))) return 'weekends';
  const arr = Array.from(set).sort((a, b) => MON_FIRST_ORDER.indexOf(a) - MON_FIRST_ORDER.indexOf(b));
  return arr.join(',');
}

/* ========================================================================== */
/* MAIN PLUGIN                                                                */
/* ========================================================================== */

module.exports = class DailyQuestLogPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    await this.loadQuestLog();
    await this.ensureDailyRollover(true);
    await this.handleTimerRecovery();

    this.registerView(VIEW_TYPE_QUESTS, (leaf) => new QuestView(leaf, this));

    this.ribbonEl = this.addRibbonIcon('target', 'Quest Log', () => this.activateView());
    this.updateRibbonLabel();

    this.addCommand({ id: 'open-quest-log', name: 'Open Quest Log', callback: () => this.activateView() });
    this.addSettingTab(new QuestLogSettingTab(this.app, this));

    this.registerInterval(window.setInterval(() => this.ensureDailyRollover(), 60_000));
  }

  async onunload() {
    await this.autoPauseActiveQuest();
  }

  /* ----------------------------- Settings --------------------------------- */
  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }

  /* ---------------------------- Data helpers ------------------------------ */
  initializeQuestLog() {
    this.questLog = {
      quests: [],
      completions: [],
      player: { level: 1, xp: 0 },
      timerState: { activeQuestId: null, startTime: null, pausedSessions: {} },
      day: todayStr(),
    };
  }

  async loadQuestLog() {
    const file = this.app.vault.getAbstractFileByPath(this.settings.questLogPath);
    if (file instanceof TFile) this.questLog = safeParse(await this.app.vault.read(file), null);
    if (!this.questLog || typeof this.questLog !== 'object') this.initializeQuestLog();

    const ql = this.questLog;
    ql.quests ??= [];
    ql.completions ??= [];
    ql.player ??= { level: 1, xp: 0 };
    ql.timerState ??= { activeQuestId: null, startTime: null, pausedSessions: {} };
    ql.day ??= todayStr();
  }

  async saveQuestLog() {
    const path = this.settings.questLogPath;
    const content = JSON.stringify(this.questLog, null, 2);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.modify(file, content);
    else await this.app.vault.create(path, content);
  }

  async commit() { await this.saveQuestLog(); this.refreshView(); }

  /* --------------------------- Daily rollover ----------------------------- */
  async ensureDailyRollover(init = false) {
    const t = todayStr();
    if (this.questLog.day !== t) {
      await this.autoPauseActiveQuest(); // move active elapsed into pausedSessions
      this.questLog.timerState.activeQuestId = null;
      this.questLog.timerState.startTime = null;
      this.questLog.day = t;
      await this.commit();
    } else if (init && !this.questLog.day) {
      this.questLog.day = t; await this.commit();
    }
  }

  updateRibbonLabel() {
    const { level } = this.questLog.player;
    const rank = RANK_FOR(level);
    this.ribbonEl?.setAttribute('aria-label', `Quest Log • ${rank.icon} ${rank.name} (Lv${level})`);
  }

  /* ------------------------------- CRUD ----------------------------------- */
  getActiveQuests() {
    return this.questLog.quests
      .filter((q) => !q.archived)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async createQuest({ name, category, schedule, estimateMinutes }) {
    const quest = {
      id: genId(),
      name: name.trim(),
      category: (category || 'Uncategorized').trim(),
      schedule: (schedule || 'daily').trim(),
      estimateMinutes: Number.isFinite(estimateMinutes) && estimateMinutes > 0 ? Math.floor(estimateMinutes) : null,
      order: this.getActiveQuests().length,
      createdAt: todayStr(),
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
    if ('estimateMinutes' in changes) {
      const v = changes.estimateMinutes;
      changes.estimateMinutes = Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
    }
    Object.assign(q, changes);
    await this.commit();
    new Notice('✓ Quest updated');
  }

  async deleteQuest(id, skipConfirm = false) {
    const q = this.questLog.quests.find((x) => x.id === id);
    if (!q) return;
    if (!skipConfirm) {
      const ok = await this.showConfirmDialog('🗑️ Delete Quest', `Delete "${q.name}"?`);
      if (!ok) return;
    }
    q.archived = true;
    const s = this.questLog.timerState;
    if (s.activeQuestId === id) { s.activeQuestId = null; s.startTime = null; }
    delete s.pausedSessions[id];
    await this.commit();
    new Notice('✓ Quest deleted');
  }

  async reorderQuests(questIds, category) {
    const list = this.questLog.quests.filter((q) => !q.archived);
    const inCat = list.filter((q) => q.category === category);
    const base = inCat.length ? Math.min(...inCat.map((q) => q.order ?? 0)) : 0;
    questIds.forEach((id, i) => { const q = list.find((x) => x.id === id); if (q) q.order = base + i; });
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach((q, i) => (q.order = i));
    await this.saveQuestLog(); // avoid full rerender thrash; caller triggers on dragend end
  }

  /* ----------------------------- Scheduling ------------------------------- */
  getTodayQuests() { return this.getActiveQuests().filter((q) => this.isScheduledToday(q.schedule)); }
  getOtherQuests() { return this.getActiveQuests().filter((q) => !this.isScheduledToday(q.schedule)); }

  isScheduledToday(schedule) { return isScheduledOnDate(schedule, new Date()); }

  isCompletedToday(questId) {
    const t = todayStr();
    return this.questLog.completions.some((c) => c.questId === questId && c.date === t);
  }

  /* -------------------------------- Timer --------------------------------- */
  getActiveElapsedMinutes() {
    const { activeQuestId, startTime } = this.questLog.timerState || {};
    return !activeQuestId || !startTime ? 0 : Math.max(0, (Date.now() - startTime) / 60000);
  }

  getTotalMinutes(questId) {
    const s = this.questLog.timerState, paused = s.pausedSessions[questId] || 0;
    return s.activeQuestId === questId ? paused + this.getActiveElapsedMinutes() : paused;
  }

  async startQuest(questId) {
    if (this.isCompletedToday(questId)) return void new Notice('Already completed today.');
    const s = this.questLog.timerState;
    if (s.activeQuestId && s.activeQuestId !== questId) await this.pauseQuest(s.activeQuestId);
    s.activeQuestId = questId; s.startTime = Date.now();
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

  async autoPauseActiveQuest() {
    const s = this.questLog.timerState;
    if (!s.activeQuestId) return;
    s.pausedSessions[s.activeQuestId] = (s.pausedSessions[s.activeQuestId] || 0) + this.getActiveElapsedMinutes();
    s.activeQuestId = null; s.startTime = null;
    await this.saveQuestLog();
  }

  async handleTimerRecovery() {
    const s = this.questLog.timerState;
    if (s.activeQuestId && s.startTime) {
      const elapsed = (Date.now() - s.startTime) / 60000;
      s.pausedSessions[s.activeQuestId] = (s.pausedSessions[s.activeQuestId] || 0) + elapsed;
      s.activeQuestId = null; s.startTime = null;
      await this.saveQuestLog();
    }
  }

  /* -------------------------- Completion & XP ----------------------------- */
  calculateXP(estimateMinutes, actualMinutes) {
    return estimateMinutes && estimateMinutes > 0
      ? Math.round(Math.max(estimateMinutes, actualMinutes) * this.settings.xpPerMinute)
      : this.settings.flatXp;
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

  getXPForNextLevel(level) {
    const { levelingBase, levelingExponent } = this.settings;
    return Math.round(levelingBase * Math.pow(level, levelingExponent));
  }

  async completeQuest(quest) {
    const id = quest.id;
    if (this.isCompletedToday(id)) return void new Notice('Already completed today.');
    const minutes = this.getTotalMinutes(id);
    const xp = this.calculateXP(quest.estimateMinutes, minutes);
    this.awardXP(xp);

    this.questLog.completions.push({
      questId: id,
      date: todayStr(),
      minutesSpent: Math.round(minutes),
      xpEarned: xp,
    });

    const s = this.questLog.timerState;
    if (s.activeQuestId === id) { s.activeQuestId = null; s.startTime = null; }
    delete s.pausedSessions[id];

    await this.commit();
    new Notice(`✓ ${quest.name} completed! +${xp} XP`);
  }

  async uncompleteQuest(questId) {
    const t = todayStr();
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

  /* ---------------------------- View control ------------------------------ */
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

  /* ------------------------------ Utilities ------------------------------- */
  showConfirmDialog(title, message) {
    return new Promise((resolve) => new ConfirmModal(this.app, title, message, resolve).open());
  }

  /* -------------------------------- Reset --------------------------------- */
  async resetAllData() {
    const ok = await this.showConfirmDialog('⚠️ Reset All Quest Data', 'This will clear all quests, completions, and reset level to 1. This cannot be undone!');
    if (!ok) return;
    this.initializeQuestLog();
    await this.commit();
    this.updateRibbonLabel();
    new Notice('✓ All quest data has been reset!');
  }

  /* ------------------------------ Reports --------------------------------- */
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
      acc.totalXP += c.xpEarned || 0;
      acc.totalMinutes += c.minutesSpent || 0;
      const d = (acc.byDate[c.date] ||= { count: 0, xp: 0, minutes: 0 });
      d.count++; d.xp += c.xpEarned || 0; d.minutes += c.minutesSpent || 0;
      const bq = (acc.byQuest[c.questId] ||= { count: 0, xp: 0, minutes: 0 });
      bq.count++; bq.xp += c.xpEarned || 0; bq.minutes += c.minutesSpent || 0;
      return acc;
    }, { totalXP: 0, totalMinutes: 0, byDate: {}, byQuest: {} });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (29 - i));
      const ds = toLocalDMY(d);
      const x = totals.byDate[ds] || { count: 0, xp: 0, minutes: 0 };
      return { date: ds, ...x };
    });

    const topQuests = Object.entries(totals.byQuest)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([id, data]) => ({ id, name: qName[id] || id, ...data }));

    return { player, totalCompleted, totalXP: totals.totalXP, totalMinutes: totals.totalMinutes, last30Days, topQuests };
  }

  buildReportMarkdown(stats) {
    const now = todayStr(), h = Math.floor(stats.totalMinutes / 60), m = Math.floor(stats.totalMinutes % 60), rank = RANK_FOR(stats.player.level);
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
${stats.topQuests.map((q, i) => `| ${i + 1} | ${q.name} | ${q.count} | ${q.xp} XP | ${Math.floor(q.minutes/60)}h ${Math.floor(q.minutes%60)}m |`).join('\n') || '| - | No quests completed yet | - | - | - |'}

---

## 📅 Daily Breakdown (Last 30 Days)

| Date | Quests | XP Earned | Time Spent |
|------|--------|-----------|------------|
${stats.last30Days.slice().reverse().map((d) => `| ${d.date} | ${d.count} | ${d.xp} XP | ${Math.floor(d.minutes/60) ? `${Math.floor(d.minutes/60)}h ${Math.floor(d.minutes%60)}m` : `${Math.floor(d.minutes%60)}m`} |`).join('\n')}
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
  }

  getViewType() { return VIEW_TYPE_QUESTS; }
  getDisplayText() { return 'Quest Log'; }
  getIcon() { return 'target'; }

  async onOpen() { await super.onOpen(); await this.render(); this.startTicker(); }
  async onClose() { this.stopTicker(); await super.onClose(); }

  startTicker() { this.stopTicker(); this.timerHandle = window.setInterval(() => this.updateActiveTimerRow(), 1000); }
  stopTicker() { if (this.timerHandle) { window.clearInterval(this.timerHandle); this.timerHandle = null; } }

  updateActiveTimerRow() {
    const { activeQuestId } = this.plugin.questLog.timerState; if (!activeQuestId) return;
    const entry = this.domIndex.get(activeQuestId); if (!entry) return;
    const { estimateEl, itemEl, quest } = entry;
    const totalMinutes = this.plugin.getTotalMinutes(activeQuestId);
    const isOvertime = !!(quest.estimateMinutes && totalMinutes > quest.estimateMinutes);
    this.updateEstimateDisplay(estimateEl, quest, totalMinutes, true, false);
    itemEl.toggleClass('quest-item--overtime', isOvertime);
    this.updateHeaderTimer();
  }

  updateHeaderTimer() {
    const totalRemainingSpan = this.contentEl.querySelector('.quest-total-remaining');
    if (!totalRemainingSpan) return;
    const unfinished = this.plugin.getTodayQuests().filter((q) => !this.plugin.isCompletedToday(q.id));
    const totalRemaining = unfinished.reduce((sum, q) => {
      if (q.estimateMinutes && q.estimateMinutes > 0) {
        const spent = this.plugin.getTotalMinutes(q.id);
        return sum + Math.max(0, q.estimateMinutes - spent);
      }
      return sum;
    }, 0);
    totalRemainingSpan.textContent = formatTime(totalRemaining);
  }

  async render() {
    const container = this.contentEl;
    this.domIndex.clear();
    container.empty();
    container.addClass('quest-view-container');

    const { player } = this.plugin.questLog;
    const xpForNext = this.plugin.getXPForNextLevel(player.level);
    const xpPercent = clamp((player.xp / xpForNext) * 100, 0, 100);
    const rank = RANK_FOR(player.level);

    // Header
    const header = container.createDiv({ cls: 'quest-view-header' });
    const top = header.createDiv({ cls: 'quest-header-top' });

    const leftSide = top.createDiv({ cls: 'header-left' });
    leftSide.createDiv({ cls: 'header-left-inner' }).createEl('h2', { text: "Today's Quests" });

    const rightSide = top.createDiv({ cls: 'header-right' });
    rightSide.createEl('span', { text: '—', cls: 'quest-total-remaining' });

    const rankDisplay = rightSide.createDiv({ cls: 'header-rank-display' });
    rankDisplay.innerHTML = `<div class="rank-icon" style="font-size:3rem;text-shadow:0 0 20px ${rank.color}">${rank.icon}</div><div class="rank-name" style="color:${rank.color};font-size:.6rem">${rank.name.toUpperCase()}</div>`;

    const todayQuests = this.plugin.getTodayQuests();
    const completedCount = todayQuests.filter((q) => this.plugin.isCompletedToday(q.id)).length;

    const stats = header.createDiv({ cls: 'quest-view-stats' });
    stats.createEl('span', { text: `Lvl ${player.level}` });
    stats.createEl('span', { text: `${player.xp} / ${xpForNext} XP` });
    stats.createEl('span', { text: `${completedCount}/${todayQuests.length} Completed`, cls: 'quest-completion-stat' });

    const addBtn = stats.createEl('button', { text: '➕ Add Quest', cls: 'btn-add-header' });
    addBtn.type = 'button';
    addBtn.setAttribute('aria-label', 'Add Quest');
    addBtn.addEventListener('click', () => this.openInlineAdd());

    const xpBar = header.createDiv({ cls: 'quest-xp-bar' });
    xpBar.createDiv({ cls: 'quest-xp-fill', attr: { style: `width:${xpPercent}%` } });

    // Inline "new" editor
    if (this.editingId === 'new') this.renderInlineNew(container);

    const hasActiveQuest = !!this.plugin.questLog.timerState.activeQuestId;
    const otherQuests = this.plugin.getOtherQuests();
    const activeToday = todayQuests.filter((q) => !this.plugin.isCompletedToday(q.id));
    const categoriesMap = new Map();
    for (const q of activeToday) {
      const cat = q.category || 'Uncategorized';
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

    this.renderCompletedSection(container);

    const footer = container.createDiv({ cls: 'quest-footer' });
    const reportBtn = footer.createEl('button', { text: '📊 Generate Report', cls: 'btn-primary' });
    reportBtn.type = 'button';
    reportBtn.setAttribute('aria-label', 'Generate Report');
    reportBtn.addEventListener('click', () => this.plugin.generateReport());

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
      type: 'text',
      value: this.editingDraft?.name || '',
      cls: 'quest-name-input-inline',
      attr: { placeholder: 'Enter quest name...' },
    });
    nameInput.addEventListener('input', () => { (this.editingDraft ||= {}).name = nameInput.value; });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.saveInlineEdit('new', item); }
      if (e.key === 'Escape') { e.preventDefault(); this.closeInlineEdit(); }
    });

    this.attachInlineEditor(item, { name: '', category: '', estimateMinutes: null, schedule: 'weekdays' }, true, 'new');
    setTimeout(() => nameInput.focus(), 100);
  }

  renderQuestItem(container, quest, { draggable, locked }) {
    const s = this.plugin.questLog.timerState;
    const isActive = s.activeQuestId === quest.id;
    const hasTime = this.hasAnyTime(quest.id);
    const isPaused = !isActive && hasTime;
    const totalMinutes = this.plugin.getTotalMinutes(quest.id);
    const isOvertime = !!(quest.estimateMinutes && totalMinutes > quest.estimateMinutes);
    const isCompleted = this.plugin.isCompletedToday(quest.id);
    const isEditing = this.editingId === quest.id;

    const item = container.createDiv({ cls: 'quest-item' });
    item.dataset.questId = quest.id;
    item.toggleClass('quest-item--active', isActive);
    item.toggleClass('quest-item--paused', isPaused);
    item.toggleClass('quest-item--overtime', isOvertime);
    item.toggleClass('quest-item--locked', locked);
    item.toggleClass('quest-item--completed', isCompleted);
    item.toggleClass('quest-item--editing', isEditing);

    if (draggable && !locked) {
      const dragHandle = item.createDiv({ cls: 'quest-drag-handle', title: 'Drag to reorder' });
      dragHandle.innerHTML = '⋮⋮';
      item.draggable = true;
    }

    const checkbox = item.createEl('input', { type: 'checkbox', cls: 'quest-checkbox' });
    checkbox.checked = isCompleted; checkbox.disabled = locked || isCompleted;
    checkbox.setAttribute('aria-label', `Complete ${quest.name}`);
    if (!locked && !isCompleted) checkbox.addEventListener('change', async () => { if (checkbox.checked) await this.plugin.completeQuest(quest); });

    const info = item.createDiv({ cls: 'quest-info' });
    const nameEl = info.createDiv({ cls: 'quest-name' });
    if (isEditing) {
      const nameInput = nameEl.createEl('input', {
        type: 'text',
        value: this.editingDraft?.name || quest.name,
        cls: 'quest-name-input-inline',
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
      if (!locked && !isCompleted) {
        const startInlineEdit = (e) => { e.preventDefault(); this.openInlineEdit(quest); };
        nameEl.addClass('quest-name--editable');
        nameEl.addEventListener('dblclick', startInlineEdit);

        let pressTimer = null;
        nameEl.addEventListener('touchstart', () => { pressTimer = setTimeout(() => { startInlineEdit(new Event('custom')); pressTimer = null; }, 500); });
        nameEl.addEventListener('touchend', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
        nameEl.addEventListener('touchmove', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
      }
    }

    const estimateEl = info.createDiv({ cls: 'quest-estimate' });
    this.updateEstimateDisplay(estimateEl, quest, totalMinutes, isActive, isPaused);

    const controls = item.createDiv({ cls: 'quest-controls' });
    if (!locked && !isCompleted) {
      if (!isActive && !isPaused) {
        const startBtn = this.iconBtn('play', 'Start'); startBtn.addClass('primary');
        startBtn.addEventListener('click', async () => await this.plugin.startQuest(quest.id));
        controls.appendChild(startBtn);
      }
      if (isActive) {
        const pauseBtn = this.iconBtn('pause', 'Pause'); pauseBtn.addClass('accent');
        pauseBtn.addEventListener('click', async () => await this.plugin.pauseQuest(quest.id));
        controls.appendChild(pauseBtn);
      }
      if (isPaused && !isActive) {
        const resumeBtn = this.iconBtn('play', 'Resume'); resumeBtn.addClass('primary');
        resumeBtn.addEventListener('click', async () => await this.plugin.resumeQuest(quest.id));
        controls.appendChild(resumeBtn);
      }
    }

    if (locked) item.createDiv({ cls: 'quest-lock-overlay', title: 'Not scheduled for today' }).innerHTML = '🔒';
    if (isEditing) this.attachInlineEditor(item, {
      name: quest.name, category: quest.category, estimateMinutes: quest.estimateMinutes ?? null, schedule: quest.schedule || 'weekdays',
    }, false, quest.id);

    this.domIndex.set(quest.id, { estimateEl, itemEl: item, quest });
  }

  updateEstimateDisplay(div, quest, totalMinutes, isActive, isPaused) {
    div.empty(); div.className = 'quest-estimate';
    const done = this.plugin.isCompletedToday(quest.id);
    const hasEstimate = quest.estimateMinutes != null && quest.estimateMinutes > 0;
    if (done) { div.setText('Completed'); div.addClass('quest-estimate--paused'); return; }

    if (hasEstimate) {
      const remaining = quest.estimateMinutes - totalMinutes;
      const absText = formatTime(Math.abs(remaining));
      const prefix = isActive ? '⏱ ' : (isPaused ? '⏸ ' : '');
      const text = (isActive || isPaused) ? (remaining >= 0 ? `${prefix}${absText}` : `${prefix}-${absText}`) : `Est: ${formatTime(quest.estimateMinutes)}`;
      if (isActive) div.addClass('quest-estimate--running');
      if (isPaused) div.addClass('quest-estimate--paused');
      if (remaining < 0) div.addClass('quest-estimate--overtime');
      div.setText(text);
    } else if (totalMinutes > 0) {
      const prefix = isActive ? '⏱ ' : (isPaused ? '⏸ ' : '');
      if (isActive) div.addClass('quest-estimate--running');
      if (isPaused) div.addClass('quest-estimate--paused');
      div.setText(`${prefix}${formatTime(totalMinutes)}`);
    } else div.setText('');
  }

  hasAnyTime(questId) {
    const s = this.plugin.questLog.timerState;
    return s.activeQuestId === questId || (s.pausedSessions[questId] || 0) > 0;
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
    const t = todayStr();
    const completedToday = this.plugin.questLog.completions.filter((c) => c.date === t).reverse();
    if (!completedToday.length) return;

    const section = container.createDiv({ cls: 'quest-completed-section' });
    section.createDiv({ cls: 'quest-section-title quest-section-completed' }).innerHTML = `✅ Completed Today (${completedToday.length})`;

    const list = section.createDiv({ cls: 'quest-completed-list' });
    for (const completion of completedToday) {
      const quest = this.plugin.questLog.quests.find((q) => q.id === completion.questId); if (!quest) continue;
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
    this.editingDraft = { name: '', category: '', estimateMinutes: null, selectedDays: new Set(['mon', 'tue', 'wed', 'thu', 'fri']) };
    this.render();
  }

  openInlineEdit(quest) {
    this.editingId = quest.id;
    this.editingDraft = {
      name: quest.name,
      category: quest.category,
      estimateMinutes: quest.estimateMinutes ?? null,
      selectedDays: parseSelectedDaysFromSchedule(quest.schedule || 'weekdays'),
    };
    this.render();
  }

  closeInlineEdit() {
    this.editingId = null; this.editingDraft = null; this.render();
  }

  async saveInlineEdit(questId, item) {
    const name = (this.editingDraft?.name || '').trim();
    if (!name) {
      new Notice('❌ Quest name is required');
      const nameInput = item.querySelector('.quest-name-input-inline');
      if (nameInput) { nameInput.focus(); nameInput.addClass('input-error'); setTimeout(() => nameInput.removeClass('input-error'), 1200); }
      return;
    }

    const category = (this.editingDraft?.category || '').trim() || 'Uncategorized';
    const estimateMinutes = this.editingDraft?.estimateMinutes ?? null;
    const schedule = selectedDaysToSchedule(this.editingDraft?.selectedDays || new Set(['mon', 'tue', 'wed', 'thu', 'fri']));

    const editor = item.querySelector('.quest-editor');
    const apply = async () => {
      if (questId === 'new' || !questId) await this.plugin.createQuest({ name, category, schedule, estimateMinutes });
      else await this.plugin.updateQuest(questId, { name, category, schedule, estimateMinutes });
      this.editingId = null; this.editingDraft = null;
    };

    if (editor) this.animateCollapse(editor, apply);
    else await apply();
  }

  attachInlineEditor(item, draft, isNew, questId = null) {
    const editor = item.createDiv({ cls: 'quest-editor', attr: { 'aria-expanded': 'true' } });

    // Zone 1
    const z1 = editor.createDiv({ cls: 'quest-editor__zone zone1' });
    const row = z1.createDiv({ cls: 'form-row-two-col' });

    const categoryGroup = row.createDiv({ cls: 'form-group-compact' });
    categoryGroup.createEl('label', { text: 'Category', cls: 'form-label-compact' });
    const categoryInput = categoryGroup.createEl('input', {
      type: 'text',
      value: this.editingDraft?.category ?? draft.category ?? '',
      cls: 'form-input-beautiful',
      attr: { placeholder: 'e.g., Health' },
    });
    categoryInput.addEventListener('input', () => { (this.editingDraft ||= {}).category = categoryInput.value; });

    const estimateGroup = row.createDiv({ cls: 'form-group-compact' });
    estimateGroup.createEl('label', { text: 'Time (min)', cls: 'form-label-compact' });
    const estimateInput = estimateGroup.createEl('input', {
      type: 'number',
      value: (this.editingDraft?.estimateMinutes ?? draft.estimateMinutes) ?? '',
      cls: 'form-input-beautiful',
      attr: { placeholder: 'Optional' },
    });
    estimateInput.addEventListener('input', () => {
      (this.editingDraft ||= {}).estimateMinutes = estimateInput.value ? parseInt(estimateInput.value, 10) : null;
    });

    // Zone 2
    const z2 = editor.createDiv({ cls: 'quest-editor__zone zone2' });
    const scheduleHeader = z2.createDiv({ cls: 'schedule-header' });
    scheduleHeader.createEl('label', { text: 'Schedule Days', cls: 'form-label-schedule' });

    const presetsInline = scheduleHeader.createDiv({ cls: 'schedule-presets-inline' });
    const selectedDays = this.editingDraft?.selectedDays || parseSelectedDaysFromSchedule(draft.schedule || 'weekdays');
    const applyPreset = (days) => { selectedDays.clear(); days.forEach((d) => selectedDays.add(d)); updateDayButtons(); };

    [
      { label: 'Daily', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
      { label: 'Weekdays', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      { label: 'Weekends', days: ['sat', 'sun'] },
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
      btn.addEventListener('click', (e) => { e.preventDefault(); selectedDays.has(d.key) ? selectedDays.delete(d.key) : selectedDays.add(d.key); updateDayButtons(); });
      btns.push({ btn, key: d.key });
    });

    const updateDayButtons = () => btns.forEach(({ btn, key }) => {
      const active = selectedDays.has(key); btn.toggleClass('active', active); btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    // Zone 3
    const z3 = editor.createDiv({ cls: 'quest-editor__zone zone3' });
    if (!isNew) {
      const deleteBtn = z3.createEl('button', { cls: 'btn-delete-beautiful', attr: { type: 'button', title: 'Delete quest' } });
      deleteBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
    btn.type = 'button'; btn.className = 'btn-icon'; btn.title = title; btn.setAttribute('aria-label', title);
    const svgs = { play: '<path d="M8 5v14l11-7z" fill="currentColor"/>', pause: '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" fill="currentColor"/>' };
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${svgs[icon] || ''}</svg>`;
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

    containerEl.createEl('h3', { text: 'XP & Leveling' });

    new Setting(containerEl)
      .setName('XP per minute')
      .setDesc('XP earned per minute when quest has an estimate')
      .addText((t) => t.setPlaceholder('1')
        .setValue(String(this.plugin.settings.xpPerMinute))
        .onChange(async (v) => { const n = parseFloat(v); if (!isNaN(n) && n > 0) { this.plugin.settings.xpPerMinute = n; await this.plugin.saveSettings(); }}));

    new Setting(containerEl)
      .setName('Flat XP (no estimate)')
      .setDesc('XP earned when quest has no time estimate')
      .addText((t) => t.setPlaceholder('10')
        .setValue(String(this.plugin.settings.flatXp))
        .onChange(async (v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) { this.plugin.settings.flatXp = n; await this.plugin.saveSettings(); }}));

    new Setting(containerEl)
      .setName('Leveling base')
      .setDesc('Base XP for leveling formula')
      .addText((t) => t.setPlaceholder('100')
        .setValue(String(this.plugin.settings.levelingBase))
        .onChange(async (v) => { const n = parseFloat(v); if (!isNaN(n) && n > 0) { this.plugin.settings.levelingBase = n; await this.plugin.saveSettings(); }}));

    new Setting(containerEl)
      .setName('Leveling exponent')
      .setDesc('Exponent for leveling formula (higher = steeper curve)')
      .addText((t) => t.setPlaceholder('1.5')
        .setValue(String(this.plugin.settings.levelingExponent))
        .onChange(async (v) => { const n = parseFloat(v); if (!isNaN(n) && n > 0) { this.plugin.settings.levelingExponent = n; await this.plugin.saveSettings(); }}));

    containerEl.createEl('p', { text: 'XP for next level = round(base × level^exponent)', cls: 'setting-item-description' });

    containerEl.createEl('h3', { text: '⚠️ Danger Zone' });
    new Setting(containerEl)
      .setName('Reset All Data')
      .setDesc('Permanently delete all quests, completions, and reset level/XP. This cannot be undone!')
      .addButton((btn) => btn.setButtonText('Reset All Data').setWarning().onClick(async () => { await this.plugin.resetAllData(); }));
  }
}