/**
 * Daily Quest Log - Pure JSON Implementation 
 */

const { Plugin, TFile, Notice, PluginSettingTab, Setting, ItemView, Modal } = require('obsidian');

// ============================================================================
// CONSTANTS
// ============================================================================

const VIEW_TYPE_QUESTS = 'daily-quest-log-view';
const QUEST_LOG_FILE = 'QuestLog.json';

const DEFAULT_SETTINGS = {
  questLogPath: QUEST_LOG_FILE,
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
  { name: 'Student', icon: '📚', minLevel: 6, maxLevel: 8, color: '#9db4d8' },
  { name: 'Apprentice', icon: '📖', minLevel: 9, maxLevel: 11, color: '#8ea5c8' },
  { name: 'Acolyte', icon: '🕯️', minLevel: 12, maxLevel: 14, color: '#7eb8b8' },
  { name: 'Adept', icon: '🎯', minLevel: 15, maxLevel: 17, color: '#6ec9c9' },
  { name: 'Scholar', icon: '🎓', minLevel: 18, maxLevel: 20, color: '#5ed4d4' },
  { name: 'Mystic', icon: '🌙', minLevel: 21, maxLevel: 24, color: '#4ed9e5' },
  { name: 'Enchanter', icon: '💫', minLevel: 25, maxLevel: 28, color: '#3edff0' },
  { name: 'Conjurer', icon: '🪄', minLevel: 29, maxLevel: 32, color: '#2ee5fb' },
  { name: 'Summoner', icon: '🌀', minLevel: 33, maxLevel: 36, color: '#00e5ff' },
  { name: 'Diviner', icon: '🔮', minLevel: 37, maxLevel: 40, color: '#20d0ff' },
  { name: 'Illusionist', icon: '🎭', minLevel: 41, maxLevel: 44, color: '#40bbff' },
  { name: 'Alchemist', icon: '⚗️', minLevel: 45, maxLevel: 48, color: '#60a6ff' },
  { name: 'Evoker', icon: '⚡', minLevel: 49, maxLevel: 52, color: '#8091ff' },
  { name: 'Elementalist', icon: '🌪️', minLevel: 53, maxLevel: 56, color: '#a07cff' },
  { name: 'Warlock', icon: '☠️', minLevel: 57, maxLevel: 60, color: '#b794f6' },
  { name: 'Sorcerer', icon: '🔥', minLevel: 61, maxLevel: 64, color: '#c88ef6' },
  { name: 'Wizard', icon: '🧙', minLevel: 65, maxLevel: 68, color: '#d988f6' },
  { name: 'Arcanist', icon: '🕸️', minLevel: 69, maxLevel: 72, color: '#ea82f6' },
  { name: 'Magus', icon: '🌠', minLevel: 73, maxLevel: 76, color: '#f67cc8' },
  { name: 'Grand Magus', icon: '⭐', minLevel: 77, maxLevel: 80, color: '#f5a3ff' },
  { name: 'Archmagus', icon: '🌟', minLevel: 81, maxLevel: 85, color: '#f6ad55' },
  { name: 'Sage', icon: '🦉', minLevel: 86, maxLevel: 90, color: '#fc8181' },
  { name: 'Oracle', icon: '👁️', minLevel: 91, maxLevel: 95, color: '#ffa07a' },
  { name: 'Archmage', icon: '💎', minLevel: 96, maxLevel: 99, color: '#ffdf00' },
  { name: 'Primordial Mage', icon: '👑', minLevel: 100, maxLevel: Infinity, color: '#ffd700' }
];

const getRankForLevel = (level) => RANKS.find(r => level >= r.minLevel && level <= r.maxLevel) || RANKS[RANKS.length - 1];

// ============================================================================
// UTILITIES
// ============================================================================

const DAY_MAP = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const DAY_LETTERS = { u: 0, m: 1, t: 2, w: 3, r: 4, f: 5, s: 6 };

const todayStr = () => new Date().toISOString().split('T')[0];

function genId(len = 12) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => (b % 36).toString(36)).join('');
  }
  return Math.random().toString(36).slice(2, 2 + len);
}

function formatTime(minutes) {
  const totalSeconds = Math.max(0, Math.floor(minutes * 60));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m ${s}s` : `${h}h ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const safeJsonParse = (str, fallback) => { try { return JSON.parse(str); } catch { return fallback; } };

// ============================================================================
// MAIN PLUGIN
// ============================================================================

module.exports = class DailyQuestLogPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    await this.loadQuestLog();
    await this.ensureDailyRollover(true);
    await this.handleTimerStateOnLoad();

    this.registerView(VIEW_TYPE_QUESTS, (leaf) => new QuestView(leaf, this));
    this.addRibbonIcon('target', "Quest Log", () => this.activateView());
    this.addCommand({ id: 'open-quest-log', name: 'Open Quest Log', callback: () => this.activateView() });
    this.registerEvent(this.app.workspace.on('layout-ready', () => this.updateRibbonLabel()));
    this.addSettingTab(new QuestLogSettingTab(this.app, this));

    // Check daily rollover every minute
    this.registerInterval(window.setInterval(() => this.ensureDailyRollover(), 60_000));
    console.log('Daily Quest Log loaded.');
  }

  async onunload() {
    await this.autoPauseActiveQuest();
    console.log('Daily Quest Log unloaded.');
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
    }
    if (!this.questLog || typeof this.questLog !== 'object') this.initializeQuestLog();

    const ql = this.questLog;
    ql.quests ||= [];
    ql.completions ||= [];
    ql.player ||= { level: 1, xp: 0 };
    ql.timerState ||= { activeQuestId: null, startTime: null, pausedSessions: {} };
    ql.day ||= todayStr();
  }

  initializeQuestLog() {
    this.questLog = {
      quests: [],
      completions: [],
      player: { level: 1, xp: 0 },
      timerState: { activeQuestId: null, startTime: null, pausedSessions: {} },
      day: todayStr()
    };
  }

  async saveQuestLog() {
    const path = this.settings.questLogPath;
    const content = JSON.stringify(this.questLog, null, 2);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.modify(file, content);
    else await this.app.vault.create(path, content);
  }

  // --------------------------------------------------------------------------
  // Daily Reset
  // --------------------------------------------------------------------------
  async ensureDailyRollover(init = false) {
    const today = todayStr();
    if (this.questLog.day !== today) {
      await this.autoPauseActiveQuest(); // finalize any running timer
      this.questLog.timerState = { activeQuestId: null, startTime: null, pausedSessions: {} };
      this.questLog.day = today;
      await this.saveQuestLog();
      this.refreshView();
      console.log('Daily reset applied.');
    } else if (init && !this.questLog.day) {
      this.questLog.day = today;
      await this.saveQuestLog();
    }
  }

  updateRibbonLabel() {
    const rank = getRankForLevel(this.questLog.player.level);
    const ribbonIcon = document.querySelector('.side-dock-ribbon-action[aria-label^="Quest Log"]');
    if (ribbonIcon) ribbonIcon.setAttribute('aria-label', `Quest Log • ${rank.icon} ${rank.name} (Lv${this.questLog.player.level})`);
  }

  // --------------------------------------------------------------------------
  // Quest CRUD
  // --------------------------------------------------------------------------
  getActiveQuests() { return this.questLog.quests.filter(q => !q.archived).sort((a, b) => a.order - b.order); }

  async createQuest({ name, category, schedule, estimateMinutes }) {
    const quest = {
      id: genId(),
      name: name.trim(),
      category: category || 'Uncategorized',
      schedule: (schedule || 'daily').trim(),
      estimateMinutes: estimateMinutes || null,
      order: this.getActiveQuests().length,
      createdAt: todayStr(),
      archived: false
    };
    this.questLog.quests.push(quest);
    await this.saveQuestLog();
    this.refreshView();
    new Notice(`✓ Quest created: ${name}`);
    return quest;
  }

  async updateQuest(id, changes) {
    const quest = this.questLog.quests.find(q => q.id === id);
    if (!quest) return void new Notice('❌ Quest not found');
    Object.assign(quest, changes);
    await this.saveQuestLog();
    this.refreshView();
    new Notice(`✓ Quest updated`);
  }

  async deleteQuest(id, skipConfirm = false) {
    const quest = this.questLog.quests.find(q => q.id === id);
    if (!quest) return;
    if (!skipConfirm) {
      const confirmed = await this.showConfirmDialog('🗑️ Delete Quest', `Are you sure you want to delete "${quest.name}"?`);
      if (!confirmed) return;
    }
    quest.archived = true;
    const s = this.questLog.timerState;
    if (s.activeQuestId === id) { s.activeQuestId = null; s.startTime = null; }
    delete s.pausedSessions[id];
    await this.saveQuestLog();
    this.refreshView();
    new Notice(`✓ Quest deleted`);
  }

  async reorderQuests(questIds) {
    questIds.forEach((id, index) => {
      const quest = this.questLog.quests.find(q => q.id === id);
      if (quest) quest.order = index;
    });
    await this.saveQuestLog();
  }

  getTodayQuests() { return this.getActiveQuests().filter(q => this.isScheduledToday(q.schedule)); }
  getOtherQuests() { return this.getActiveQuests().filter(q => !this.isScheduledToday(q.schedule)); }

  // --------------------------------------------------------------------------
  // Scheduling
  // --------------------------------------------------------------------------
  isScheduledToday(schedule) {
    if (!schedule) return false;
    const now = new Date(), today = now.getDay();
    const s = schedule.trim().toLowerCase();
    if (s === 'daily') return true;
    if (s === 'weekdays') return today >= 1 && today <= 5;
    if (s === 'weekends') return today === 0 || today === 6;

    // specific date DD-MM-YYYY
    const dm = s.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (dm) {
      const [, d, m, y] = dm;
      const t = new Date(Number(y), Number(m) - 1, Number(d));
      return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate();
    }

    // letter days like M,W,F or T,R
    const letterDays = s.match(/[mtwrfsu]/g);
    if (letterDays && letterDays.some(letter => DAY_LETTERS[letter] === today)) return true;

    // tokens: sun, mon, tue, wed, thu, fri, sat or ranges: mon-fri, fri-mon
    const tokens = s.split(/[\s,]+/).filter(Boolean);
    if (tokens.length) {
      const dayIdx = (tok) => DAY_MAP[tok];
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

  isCompletedToday(questId) {
    const t = todayStr();
    return this.questLog.completions.some(c => c.questId === questId && c.date === t);
  }

  // --------------------------------------------------------------------------
  // Timer
  // --------------------------------------------------------------------------
  async startQuest(questId) {
    const s = this.questLog.timerState;
    if (this.isCompletedToday(questId)) return void new Notice('Already completed today.');
    if (s.activeQuestId && s.activeQuestId !== questId) await this.pauseQuest(s.activeQuestId);
    s.activeQuestId = questId;
    s.startTime = Date.now();
    await this.saveQuestLog();
    this.refreshView();
  }

  async pauseQuest(questId) {
    const s = this.questLog.timerState;
    if (s.activeQuestId !== questId) return;
    const elapsed = this.getActiveElapsedMinutes();
    s.pausedSessions[questId] = (s.pausedSessions[questId] || 0) + elapsed;
    s.activeQuestId = null;
    s.startTime = null;
    await this.saveQuestLog();
    this.refreshView();
  }

  async resumeQuest(questId) { await this.startQuest(questId); }

  getActiveElapsedMinutes() {
    const s = this.questLog.timerState;
    if (!s.activeQuestId || !s.startTime) return 0;
    return Math.max(0, (Date.now() - s.startTime) / 1000 / 60);
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

  async handleTimerStateOnLoad() {
    const s = this.questLog.timerState;
    if (s.activeQuestId && s.startTime) {
      const elapsed = (Date.now() - s.startTime) / 1000 / 60;
      s.pausedSessions[s.activeQuestId] = (s.pausedSessions[s.activeQuestId] || 0) + elapsed;
      s.activeQuestId = null;
      s.startTime = null;
      await this.saveQuestLog();
      console.log(`Timer recovered: +${elapsed.toFixed(1)}m`);
    }
  }

  // --------------------------------------------------------------------------
  // Completion & XP
  // --------------------------------------------------------------------------
  async completeQuest(quest) {
    const questId = quest.id;
    if (this.isCompletedToday(questId)) return void new Notice('Already completed today.');
    const totalMinutes = this.getTotalMinutes(questId);
    const xp = this.calculateXP(quest.estimateMinutes, totalMinutes);

    this.awardXP(xp);

    this.questLog.completions.push({
      questId,
      date: todayStr(),
      minutesSpent: Math.round(totalMinutes),
      xpEarned: xp
    });

    const s = this.questLog.timerState;
    if (s.activeQuestId === questId) { s.activeQuestId = null; s.startTime = null; }
    delete s.pausedSessions[questId];

    await this.saveQuestLog();
    new Notice(`✓ ${quest.name} completed! +${xp} XP`);
    this.refreshView();
  }

  async uncompleteQuest(questId) {
    const t = todayStr();
    const completion = this.questLog.completions.find(c => c.questId === questId && c.date === t);
    if (!completion) return;

    const p = this.questLog.player;
    p.xp -= completion.xpEarned;
    while (p.xp < 0 && p.level > 1) {
      p.level--;
      p.xp += this.getXPForNextLevel(p.level);
    }
    if (p.xp < 0) p.xp = 0;

    this.questLog.completions = this.questLog.completions.filter(c => !(c.questId === questId && c.date === t));
    await this.saveQuestLog();

    const quest = this.questLog.quests.find(q => q.id === questId);
    new Notice(`⟲ ${quest ? quest.name : 'Quest'} uncompleted. -${completion.xpEarned} XP`);
    this.refreshView();
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
      if (oldRank.name !== newRank.name) new Notice(`🎊 RANK UP! You are now ${newRank.icon} ${newRank.name.toUpperCase()} (Level ${p.level})`, 6000);
      else new Notice(`🎉 Level Up! Level ${p.level} • ${newRank.icon} ${newRank.name}`);
    }
    this.updateRibbonLabel();
  }

  getXPForNextLevel(level) {
    const { levelingBase, levelingExponent } = this.settings;
    return Math.round(levelingBase * Math.pow(level, levelingExponent));
  }

  // --------------------------------------------------------------------------
  // View Management
  // --------------------------------------------------------------------------
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_QUESTS)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_QUESTS, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  refreshView() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_QUESTS)) {
      if (leaf.view instanceof QuestView) leaf.view.render();
    }
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------
  showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const modal = new ConfirmModal(this.app, title, message, (result) => resolve(result));
      modal.open();
    });
  }

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------
  async resetAllData() {
    const confirmed = await this.showConfirmDialog('⚠️ Reset All Quest Data', 'This will clear all quests, completions, and reset level to 1. This cannot be undone!');
    if (!confirmed) return;
    this.initializeQuestLog();
    await this.saveQuestLog();
    new Notice('✓ All quest data has been reset!');
    this.refreshView();
  }

  // --------------------------------------------------------------------------
  // Reports
  // --------------------------------------------------------------------------
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
    const { completions, player, quests } = this.questLog;
    const questNames = {}; quests.forEach(q => questNames[q.id] = q.name);
    const totalCompleted = completions.length;
    const totalXP = completions.reduce((s, c) => s + (c.xpEarned || 0), 0);
    const totalMinutes = completions.reduce((s, c) => s + (c.minutesSpent || 0), 0);

    const byDate = {};
    completions.forEach(c => {
      if (!byDate[c.date]) byDate[c.date] = { count: 0, xp: 0, minutes: 0 };
      byDate[c.date].count++;
      byDate[c.date].xp += c.xpEarned || 0;
      byDate[c.date].minutes += c.minutesSpent || 0;
    });

    const byQuest = {};
    completions.forEach(c => {
      if (!byQuest[c.questId]) byQuest[c.questId] = { count: 0, xp: 0, minutes: 0 };
      byQuest[c.questId].count++;
      byQuest[c.questId].xp += c.xpEarned || 0;
      byQuest[c.questId].minutes += c.minutesSpent || 0;
    });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today); date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      last30Days.push({
        date: dateStr,
        count: byDate[dateStr]?.count || 0,
        xp: byDate[dateStr]?.xp || 0,
        minutes: byDate[dateStr]?.minutes || 0
      });
    }

    const topQuests = Object.entries(byQuest)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([id, data]) => ({ id, name: questNames[id] || id, ...data }));

    return { player, totalCompleted, totalXP, totalMinutes, last30Days, topQuests };
  }

  buildReportMarkdown(stats) {
    const now = todayStr();
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
`;
  }
};

// ============================================================================
// QUEST VIEW
// ============================================================================

class QuestView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.timerHandle = null;
    this.domIndex = new Map();
  }

  getViewType() { return VIEW_TYPE_QUESTS; }
  getDisplayText() { return "Quest Log"; }
  getIcon() { return 'target'; }

  async onOpen() { await super.onOpen(); await this.render(); this.startTicker(); }
  async onClose() { this.stopTicker(); await super.onClose(); }

  startTicker() {
    this.stopTicker();
    this.timerHandle = window.setInterval(() => this.updateActiveTimerRow(), 1000);
  }
  stopTicker() {
    if (this.timerHandle) { window.clearInterval(this.timerHandle); this.timerHandle = null; }
  }

  updateActiveTimerRow() {
    const { activeQuestId } = this.plugin.questLog.timerState;
    if (!activeQuestId) return;
    const entry = this.domIndex.get(activeQuestId);
    if (!entry) return;
    const { estimateEl, itemEl, quest } = entry;
    const totalMinutes = this.plugin.getTotalMinutes(activeQuestId);
    const isOvertime = !!(quest.estimateMinutes && totalMinutes > quest.estimateMinutes);
    this.updateEstimateDisplay(estimateEl, quest, totalMinutes, true, false, isOvertime);
    if (isOvertime) itemEl.addClass('quest-item--overtime'); else itemEl.removeClass('quest-item--overtime');
  }

  async render() {
    const container = this.contentEl;
    this.domIndex.clear();
    container.empty();
    container.addClass('quest-view-container');

    const player = this.plugin.questLog.player;
    const xpForNext = this.plugin.getXPForNextLevel(player.level);
    const xpPercent = clamp((player.xp / xpForNext) * 100, 0, 100);

    // Header
    const rank = getRankForLevel(player.level);
    const header = container.createDiv({ cls: 'quest-view-header' });
    const top = header.createDiv({ cls: 'quest-header-top' });
    top.createEl('h2', { text: "Today's Quests" });
    const rankDisplay = top.createDiv({ cls: 'quest-rank-display' });
    rankDisplay.innerHTML = `<span class="rank-icon">${rank.icon}</span> <span class="rank-name" style="color: ${rank.color}">${rank.name}</span>`;

    const todayQuests = this.plugin.getTodayQuests();
    const completedCount = todayQuests.filter(q => this.plugin.isCompletedToday(q.id)).length;
    const totalCount = todayQuests.length;

    const stats = header.createDiv({ cls: 'quest-view-stats' });
    stats.createEl('span', { text: `Level ${player.level}` });
    stats.createEl('span', { text: `${player.xp} / ${xpForNext} XP` });
    stats.createEl('span', { text: `${completedCount}/${totalCount} Quests`, cls: 'quest-completion-stat' });

    // Add Quest Button in header
    const addBtn = stats.createEl('button', { text: '➕ Add Quest', cls: 'btn-add-header' });
    addBtn.addEventListener('click', () => this.openAddQuestModal());

    const xpBar = header.createDiv({ cls: 'quest-xp-bar' });
    xpBar.createDiv({ cls: 'quest-xp-fill', attr: { style: `width: ${xpPercent}%` } });

    // Quests (filter out completed ones)
    const otherQuests = this.plugin.getOtherQuests();
    const activeToday = todayQuests.filter(q => !this.plugin.isCompletedToday(q.id));

    const categoriesMap = new Map();
    for (const q of activeToday) {
      const cat = q.category || 'Uncategorized';
      if (!categoriesMap.has(cat)) categoriesMap.set(cat, []);
      categoriesMap.get(cat).push(q);
    }

    if (categoriesMap.size > 0) {
      for (const [category, quests] of categoriesMap.entries()) {
        container.createDiv({ cls: 'quest-section-title', text: category });
        const categoryList = container.createDiv({ cls: 'quest-list' });
        categoryList.dataset.category = category;
        this.setupDragDrop(categoryList);
        for (const q of quests) this.renderQuestItem(categoryList, q, { draggable: true, locked: false });
      }
    } else {
      container.createDiv({ cls: 'quest-empty-state', text: '🎉 All quests completed for today!' });
    }

    if (otherQuests.length > 0) {
      container.createDiv({ cls: 'quest-section-title quest-section-other', text: '📅 Other Days' });
      const otherList = container.createDiv({ cls: 'quest-list quest-list--dimmed' });
      for (const q of otherQuests) this.renderQuestItem(otherList, q, { draggable: false, locked: true });
    }

    // Completed Today
    this.renderCompletedSection(container);

    // Footer
    const footer = container.createDiv({ cls: 'quest-footer' });
    const reportBtn = footer.createEl('button', { text: '📊 Generate Report', cls: 'btn-primary' });
    reportBtn.addEventListener('click', () => this.plugin.generateReport());
  }

  renderQuestItem(container, quest, options = {}) {
    const { draggable, locked } = options;
    const state = this.plugin.questLog.timerState;
    const isActive = state.activeQuestId === quest.id;
    const hasTime = this.hasAnyTime(quest.id);
    const isPaused = !isActive && hasTime;
    const totalMinutes = this.plugin.getTotalMinutes(quest.id);
    const isOvertime = !!(quest.estimateMinutes && totalMinutes > quest.estimateMinutes);
    const isCompleted = this.plugin.isCompletedToday(quest.id);

    const item = container.createDiv({ cls: 'quest-item' });
    item.dataset.questId = quest.id;

    if (isActive) item.addClass('quest-item--active');
    if (isPaused) item.addClass('quest-item--paused');
    if (isOvertime) item.addClass('quest-item--overtime');
    if (locked) item.addClass('quest-item--locked');
    if (isCompleted) item.addClass('quest-item--completed');

    if (draggable && !locked) {
      const dragHandle = item.createDiv({ cls: 'quest-drag-handle', title: 'Drag to reorder' });
      dragHandle.innerHTML = '⋮⋮';
      item.draggable = true;
    }

    const checkbox = item.createEl('input', { type: 'checkbox', cls: 'quest-checkbox' });
    checkbox.checked = isCompleted;
    checkbox.disabled = locked || isCompleted;
    if (!locked && !isCompleted) {
      checkbox.addEventListener('change', async () => { if (checkbox.checked) await this.plugin.completeQuest(quest); });
    } else if (isCompleted) {
      checkbox.title = 'Already completed today';
    }

    const info = item.createDiv({ cls: 'quest-info' });
    info.createDiv({ cls: 'quest-name', text: quest.name });

    const estimateEl = info.createDiv({ cls: 'quest-estimate' });
    this.updateEstimateDisplay(estimateEl, quest, totalMinutes, isActive, isPaused, isOvertime);

    const controls = item.createDiv({ cls: 'quest-controls' });
    if (!locked && !isCompleted) {
      if (!isActive && !isPaused) {
        const startBtn = this.createIconButton('play', 'Start');
        startBtn.addClass('primary');
        startBtn.addEventListener('click', async () => await this.plugin.startQuest(quest.id));
        controls.appendChild(startBtn);
      }
      if (isActive) {
        const pauseBtn = this.createIconButton('pause', 'Pause');
        pauseBtn.addClass('accent');
        pauseBtn.addEventListener('click', async () => await this.plugin.pauseQuest(quest.id));
        controls.appendChild(pauseBtn);
      }
      if (isPaused && !isActive) {
        const resumeBtn = this.createIconButton('play', 'Resume');
        resumeBtn.addClass('primary');
        resumeBtn.addEventListener('click', async () => await this.plugin.resumeQuest(quest.id));
        controls.appendChild(resumeBtn);
      }
    }

    // Minimal edit button (no gradient)
    if (!locked) {
      const editBtn = this.createIconButton('edit', 'Edit');
      editBtn.addEventListener('click', () => this.openEditModal(quest));
      controls.appendChild(editBtn);
    }

    if (locked) {
      const lockOverlay = item.createDiv({ cls: 'quest-lock-overlay', title: 'Not scheduled for today' });
      lockOverlay.innerHTML = '🔒';
    }

    this.domIndex.set(quest.id, { estimateEl, itemEl: item, quest });
  }

  updateEstimateDisplay(div, quest, totalMinutes, isActive, isPaused, isOvertime) {
    div.empty(); div.className = 'quest-estimate';
    const done = this.plugin.isCompletedToday(quest.id);
    const hasEstimate = quest.estimateMinutes != null && quest.estimateMinutes > 0;

    if (done) {
      div.setText('Completed');
      div.addClass('quest-estimate--paused');
      return;
    }

    if (hasEstimate) {
      const remaining = quest.estimateMinutes - totalMinutes;
      const absText = formatTime(Math.abs(remaining));
      const prefix = isActive ? '⏱ ' : (isPaused ? '⏸ ' : '');
      const text = (isActive || isPaused) ? (remaining >= 0 ? `${prefix}${absText}` : `${prefix}-${absText}`) : `Est: ${formatTime(quest.estimateMinutes)}`;
      if (isActive) div.addClass('quest-estimate--running');
      if (isPaused) div.addClass('quest-estimate--paused');
      if (remaining < 0) div.addClass('quest-estimate--overtime');
      div.setText(text);
      return;
    }

    if (totalMinutes > 0) {
      const prefix = isActive ? '⏱ ' : (isPaused ? '⏸ ' : '');
      if (isActive) div.addClass('quest-estimate--running');
      if (isPaused) div.addClass('quest-estimate--paused');
      div.setText(`${prefix}${formatTime(totalMinutes)}`);
    } else {
      div.setText('');
    }
  }

  hasAnyTime(questId) {
    const s = this.plugin.questLog.timerState;
    return s.activeQuestId === questId || (s.pausedSessions[questId] || 0) > 0;
  }

  setupDragDrop(container) {
    let draggedElement = null;
    container.addEventListener('dragstart', (e) => {
      if (!e.target.classList.contains('quest-item')) return;
      if (!e.target.draggable) return;
      draggedElement = e.target;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', e.target.dataset.questId);
      setTimeout(() => draggedElement.addClass('dragging'), 0);
    });

    container.addEventListener('dragend', async () => {
      if (draggedElement) {
        draggedElement.removeClass('dragging');
        const items = Array.from(container.querySelectorAll('.quest-item'));
        const newOrder = items.map(el => el.dataset.questId);
        await this.plugin.reorderQuests(newOrder);
        draggedElement = null;
      }
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = this.getDragAfterElement(container, e.clientY);
      const dragging = container.querySelector('.dragging');
      if (!dragging) return;
      if (!afterElement) container.appendChild(dragging);
      else container.insertBefore(dragging, afterElement);
    });
  }

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.quest-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  renderCompletedSection(container) {
    const t = todayStr();
    const completedToday = this.plugin.questLog.completions.filter(c => c.date === t).reverse();
    if (completedToday.length === 0) return;

    const section = container.createDiv({ cls: 'quest-completed-section' });
    const header = section.createDiv({ cls: 'quest-section-title quest-section-completed' });
    header.innerHTML = `✅ Completed Today (${completedToday.length})`;

    const list = section.createDiv({ cls: 'quest-completed-list' });

    for (const completion of completedToday) {
      const quest = this.plugin.questLog.quests.find(q => q.id === completion.questId);
      if (!quest) continue;

      const item = list.createDiv({ cls: 'quest-completed-item' });
      const checkbox = item.createEl('input', { type: 'checkbox', cls: 'quest-checkbox' });
      checkbox.checked = true;
      checkbox.addEventListener('change', async () => { if (!checkbox.checked) await this.plugin.uncompleteQuest(quest.id); });

      const info = item.createDiv({ cls: 'quest-completed-info' });
      info.createDiv({ cls: 'quest-completed-name', text: quest.name });

      const meta = info.createDiv({ cls: 'quest-completed-meta' });
      meta.innerHTML = `<span>+${completion.xpEarned} XP</span> <span>•</span> <span>${formatTime(completion.minutesSpent)}</span>`;
    }
  }

  openAddQuestModal() {
    const modal = new QuestModal(this.app, this.plugin, null, async (questData) => {
      await this.plugin.createQuest(questData);
    });
    modal.open();
  }

  openEditModal(quest) {
    const modal = new QuestModal(this.app, this.plugin, quest, async (updated) => {
      await this.plugin.updateQuest(quest.id, updated);
    });
    modal.open();
  }

  createIconButton(icon, title) {
    const btn = document.createElement('button');
    btn.className = 'btn-icon';
    btn.title = title;
    const svgs = {
      play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
      pause: '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" fill="currentColor"/>',
      edit: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>'
    };
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${svgs[icon] || ''}</svg>`;
    return btn;
  }
}

// ============================================================================
// UNIFIED QUEST MODAL (Add/Edit) - Dark & Minimal
// ============================================================================

class QuestModal extends Modal {
  constructor(app, plugin, quest, onSave) {
    super(app);
    this.plugin = plugin;
    this.quest = quest; // null for new quest, object for edit
    this.onSave = onSave;
    this.isEdit = !!quest;
    this.selectedDays = new Set();

    if (this.isEdit) {
      this.parseSchedule(quest.schedule);
    } else {
      // Default to weekdays for new quests
      this.selectedDays = new Set(['M', 'T', 'W', 'R', 'F']);
    }
  }

  parseSchedule(schedule) {
    const s = schedule.toLowerCase().trim();

    if (s === 'daily') {
      this.selectedDays = new Set(['M', 'T', 'W', 'R', 'F', 'S', 'U']);
    } else if (s === 'weekdays') {
      this.selectedDays = new Set(['M', 'T', 'W', 'R', 'F']);
    } else if (s === 'weekends') {
      this.selectedDays = new Set(['S', 'U']);
    } else {
      // Parse custom days like "M,W,F"
      const dayMap = { m: 'M', t: 'T', w: 'W', r: 'R', f: 'F', s: 'S', u: 'U' };
      const parts = s.split(',');
      this.selectedDays.clear();
      parts.forEach(part => {
        const trimmed = part.trim();
        if (dayMap[trimmed]) {
          this.selectedDays.add(dayMap[trimmed]);
        }
      });

      // If nothing parsed, default to daily
      if (this.selectedDays.size === 0) {
        this.selectedDays = new Set(['M', 'T', 'W', 'R', 'F', 'S', 'U']);
      }
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('quest-modal-minimal');

    // Header
    const header = contentEl.createDiv({ cls: 'modal-header-minimal' });
    header.createEl('h3', { text: this.isEdit ? 'Edit Quest' : 'New Quest' });
    header.createEl('p', { text: this.isEdit ? 'Update quest details' : 'Create a new quest to track', cls: 'modal-subtitle' });

    // Form Container
    const form = contentEl.createDiv({ cls: 'modal-form' });

    // Quest Name
    const nameGroup = form.createDiv({ cls: 'form-group' });
    nameGroup.createEl('label', { text: 'Quest Name', cls: 'form-label' });
    const nameInput = nameGroup.createEl('input', {
      type: 'text',
      value: this.isEdit ? this.quest.name : '',
      cls: 'form-input',
      placeholder: 'e.g., Morning Exercise, Read for 30min'
    });

    // Category
    const categoryGroup = form.createDiv({ cls: 'form-group' });
    categoryGroup.createEl('label', { text: 'Category', cls: 'form-label' });
    const categoryInput = categoryGroup.createEl('input', {
      type: 'text',
      value: this.isEdit ? this.quest.category : '',
      cls: 'form-input',
      placeholder: 'e.g., Health, Work, Learning'
    });

    // Estimate
    const estimateGroup = form.createDiv({ cls: 'form-group' });
    estimateGroup.createEl('label', { text: 'Estimated Time (minutes)', cls: 'form-label' });
    const estimateInput = estimateGroup.createEl('input', {
      type: 'number',
      value: this.isEdit && this.quest.estimateMinutes ? this.quest.estimateMinutes : '',
      cls: 'form-input',
      placeholder: 'Optional'
    });

    // Schedule Days
    const scheduleGroup = form.createDiv({ cls: 'form-group' });
    scheduleGroup.createEl('label', { text: 'Schedule Days', cls: 'form-label' });

    const dayPicker = scheduleGroup.createDiv({ cls: 'day-picker-minimal' });

    const days = [
      { key: 'M', label: 'Mon', fullName: 'Monday' },
      { key: 'T', label: 'Tue', fullName: 'Tuesday' },
      { key: 'W', label: 'Wed', fullName: 'Wednesday' },
      { key: 'R', label: 'Thu', fullName: 'Thursday' },
      { key: 'F', label: 'Fri', fullName: 'Friday' },
      { key: 'S', label: 'Sat', fullName: 'Saturday' },
      { key: 'U', label: 'Sun', fullName: 'Sunday' }
    ];

    days.forEach(day => {
      const dayBtn = dayPicker.createEl('button', {
        cls: 'day-btn-minimal',
        attr: {
          'data-day': day.key,
          'type': 'button',
          'title': day.fullName
        }
      });

      const dayLabel = dayBtn.createDiv({ cls: 'day-label' });
      dayLabel.createEl('span', { text: day.label, cls: 'day-short' });

      if (this.selectedDays.has(day.key)) {
        dayBtn.addClass('active');
      }

      dayBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.selectedDays.has(day.key)) {
          this.selectedDays.delete(day.key);
          dayBtn.removeClass('active');
        } else {
          this.selectedDays.add(day.key);
          dayBtn.addClass('active');
        }
      });
    });

    // Quick Presets
    const presetsDiv = scheduleGroup.createDiv({ cls: 'schedule-presets' });

    const presets = [
      { label: 'Daily', days: ['M', 'T', 'W', 'R', 'F', 'S', 'U'] },
      { label: 'Weekdays', days: ['M', 'T', 'W', 'R', 'F'] },
      { label: 'Weekends', days: ['S', 'U'] },
      { label: 'Clear All', days: [] }
    ];

    presets.forEach(preset => {
      const presetBtn = presetsDiv.createEl('button', {
        text: preset.label,
        cls: 'preset-btn',
        attr: { 'type': 'button' }
      });

      presetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectedDays.clear();
        preset.days.forEach(d => this.selectedDays.add(d));

        dayPicker.querySelectorAll('.day-btn-minimal').forEach(btn => {
          const dayKey = btn.getAttribute('data-day');
          if (this.selectedDays.has(dayKey)) {
            btn.addClass('active');
          } else {
            btn.removeClass('active');
          }
        });
      });
    });

    // Footer Buttons
    const footer = contentEl.createDiv({ cls: 'modal-footer-minimal' });

    if (this.isEdit) {
      const deleteBtn = footer.createEl('button', {
        text: 'Delete',
        cls: 'btn-delete-minimal'
      });
      deleteBtn.addEventListener('click', async () => {
        const confirmed = await this.plugin.showConfirmDialog(
          'Delete Quest',
          `Are you sure you want to delete "${this.quest.name}"?`
        );
        if (!confirmed) return;
        await this.plugin.deleteQuest(this.quest.id, true);
        this.close();
      });
    }

    const btnGroup = footer.createDiv({ cls: 'btn-group' });

    const cancelBtn = btnGroup.createEl('button', {
      text: 'Cancel',
      cls: 'btn-cancel-minimal'
    });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = btnGroup.createEl('button', {
      text: this.isEdit ? 'Save Changes' : 'Create Quest',
      cls: 'btn-save-minimal'
    });

    const doSave = async () => {
      const name = nameInput.value.trim();
      if (!name) {
        new Notice('❌ Quest name is required');
        nameInput.focus();
        return;
      }

      if (this.selectedDays.size === 0) {
        new Notice('❌ Select at least one day');
        return;
      }

      // Build schedule string
      let schedule;
      const daysArray = Array.from(this.selectedDays).sort();

      if (daysArray.length === 7) {
        schedule = 'daily';
      } else if (daysArray.length === 5 && !daysArray.includes('S') && !daysArray.includes('U')) {
        schedule = 'weekdays';
      } else if (daysArray.length === 2 && daysArray.includes('S') && daysArray.includes('U')) {
        schedule = 'weekends';
      } else {
        schedule = daysArray.join(',');
      }

      await this.onSave({
        name,
        category: categoryInput.value.trim() || 'Uncategorized',
        schedule,
        estimateMinutes: estimateInput.value ? parseInt(estimateInput.value) : null
      });

      this.close();
    };

    saveBtn.addEventListener('click', doSave);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSave();
    });

    setTimeout(() => nameInput.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}
// ============================================================================
// CONFIRM MODAL
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

    const btnContainer = contentEl.createDiv({ cls: 'modal-buttons' });

    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel', cls: 'btn-secondary' });
    cancelBtn.addEventListener('click', () => {
      this.close();
      this.onConfirm(false);
    });

    const confirmBtn = btnContainer.createEl('button', { text: 'Confirm', cls: 'btn-danger' });
    confirmBtn.addEventListener('click', () => {
      this.close();
      this.onConfirm(true);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ============================================================================
// SETTINGS TAB
// ============================================================================

class QuestLogSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Daily Quest Log Settings' });

    new Setting(containerEl)
      .setName('Quest log path')
      .setDesc('Path to store all quest data (default: QuestLog.json)')
      .addText(t => t
        .setPlaceholder('QuestLog.json')
        .setValue(this.plugin.settings.questLogPath)
        .onChange(async v => {
          this.plugin.settings.questLogPath = v || QUEST_LOG_FILE;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: 'XP & Leveling' });

    new Setting(containerEl)
      .setName('XP per minute')
      .setDesc('XP earned per minute when quest has an estimate')
      .addText(t => t
        .setPlaceholder('1')
        .setValue(String(this.plugin.settings.xpPerMinute))
        .onChange(async v => {
          const n = parseFloat(v);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.xpPerMinute = n;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('Flat XP (no estimate)')
      .setDesc('XP earned when quest has no time estimate')
      .addText(t => t
        .setPlaceholder('10')
        .setValue(String(this.plugin.settings.flatXp))
        .onChange(async v => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.flatXp = n;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('Leveling base')
      .setDesc('Base XP for leveling formula')
      .addText(t => t
        .setPlaceholder('100')
        .setValue(String(this.plugin.settings.levelingBase))
        .onChange(async v => {
          const n = parseFloat(v);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.levelingBase = n;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('Leveling exponent')
      .setDesc('Exponent for leveling formula (higher = steeper curve)')
      .addText(t => t
        .setPlaceholder('1.5')
        .setValue(String(this.plugin.settings.levelingExponent))
        .onChange(async v => {
          const n = parseFloat(v);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.levelingExponent = n;
            await this.plugin.saveSettings();
          }
        }));

    containerEl.createEl('p', {
      text: 'XP for next level = round(base × level^exponent)',
      cls: 'setting-item-description'
    });

    containerEl.createEl('h3', { text: '⚠️ Danger Zone' });

    new Setting(containerEl)
      .setName('Reset All Data')
      .setDesc('Permanently delete all quests, completions, and reset level/XP. This cannot be undone!')
      .addButton(btn => btn
        .setButtonText('Reset All Data')
        .setWarning()
        .onClick(async () => { await this.plugin.resetAllData(); }));
  }
}