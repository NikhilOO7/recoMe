import { createLogger } from '@shared/Logger';
import { eventBus } from '@shared/EventBus';

const log = createLogger('Achievements');

export const ACHIEVEMENTS = [
  // First Steps
  { id: 'first_block',   icon: '🎯', label: 'First Block',   desc: 'Blocked your first topic' },
  { id: 'clean_start',   icon: '✨', label: 'Clean Start',   desc: '10 items hidden' },
  { id: 'quick_learner', icon: '🎓', label: 'Quick Learner', desc: 'First pattern detected' },
  // Growing
  { id: 'clean_sweep',   icon: '💯', label: 'Clean Sweep',   desc: '100 items hidden' },
  { id: 'mind_reader',   icon: '🧠', label: 'Mind Reader',   desc: '10 patterns detected' },
  { id: 'laser_focus',   icon: '🔍', label: 'Laser Focus',   desc: '5 topics blocked' },
  // Mastery
  { id: 'feed_master',   icon: '🏆', label: 'Feed Master',   desc: '1,000 items hidden' },
  { id: 'power_user',    icon: '⚡', label: 'Power User',    desc: 'Active for 30 days' },
  // Secret
  { id: 'unicorn',       icon: '🦄', label: 'Unicorn',       desc: 'Found an Easter egg' },
  { id: 'party_time',    icon: '🎉', label: 'Party Time',    desc: 'Blocked 10 items in 1 minute' },
] as const;

type AchievementId = typeof ACHIEVEMENTS[number]['id'];

export interface AchievementState {
  unlocked: AchievementId[];
  milestone_toasts_shown: number[];
  /** ISO date strings of days the extension was active (for Power User) */
  active_days: string[];
  /** Timestamps of recent block actions (for Party Time) */
  recent_blocks: number[];
}

const MILESTONES = [
  { count: 10,   emoji: '🎉', message: "You're on a roll!" },
  { count: 100,  emoji: '💯', message: 'Triple digits! Impressive!' },
  { count: 500,  emoji: '🚀', message: 'Half a thousand banished!' },
  { count: 1000, emoji: '🏆', message: 'Feed Master achieved!' },
];

const KEY = 'recome_achievements';

async function getState(): Promise<AchievementState> {
  const r = await chrome.storage.local.get(KEY);
  const raw = r[KEY] as Partial<AchievementState> | undefined;
  return {
    unlocked: raw?.unlocked ?? [],
    milestone_toasts_shown: raw?.milestone_toasts_shown ?? [],
    active_days: raw?.active_days ?? [],
    recent_blocks: raw?.recent_blocks ?? [],
  };
}

async function setState(state: AchievementState): Promise<void> {
  await chrome.storage.local.set({ [KEY]: state });
}

export async function getAchievementState(): Promise<AchievementState> {
  return getState();
}

async function notifyActiveTab(message: string, kind: 'achievement' | 'milestone'): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'ACHIEVEMENT_TOAST',
        payload: { message, kind },
      }).catch(() => undefined);
    }
  } catch {
    log.debug('Could not notify tab for achievement toast');
  }
}

async function unlock(state: AchievementState, id: AchievementId): Promise<boolean> {
  if (state.unlocked.includes(id)) return false;
  state.unlocked.push(id);
  const def = ACHIEVEMENTS.find((a) => a.id === id)!;
  await notifyActiveTab(`${def.icon} ${def.label} unlocked!`, 'achievement');
  eventBus.emit('ACHIEVEMENT_UNLOCKED', { id, label: def.label, icon: def.icon });
  return true;
}

export async function checkAchievements(params: {
  totalHidden: number;
  blockedCount: number;
  patternCount: number;
}): Promise<void> {
  const state = await getState();
  let changed = false;

  // ── Count-based achievements ────────────────────────────────────────────
  const conditions: Array<{ id: AchievementId; condition: boolean }> = [
    { id: 'clean_start',   condition: params.totalHidden >= 10 },
    { id: 'clean_sweep',   condition: params.totalHidden >= 100 },
    { id: 'feed_master',   condition: params.totalHidden >= 1000 },
    { id: 'laser_focus',   condition: params.blockedCount >= 5 },
    { id: 'quick_learner', condition: params.patternCount >= 1 },
    { id: 'mind_reader',   condition: params.patternCount >= 10 },
  ];

  for (const { id, condition } of conditions) {
    if (condition && await unlock(state, id)) changed = true;
  }

  // ── Power User — 30 unique active days ──────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  if (!state.active_days.includes(today)) {
    state.active_days.push(today);
    changed = true;
  }
  if (state.active_days.length >= 30) {
    if (await unlock(state, 'power_user')) changed = true;
  }

  // ── Milestones ──────────────────────────────────────────────────────────
  for (const milestone of MILESTONES) {
    if (
      params.totalHidden >= milestone.count &&
      !state.milestone_toasts_shown.includes(milestone.count)
    ) {
      state.milestone_toasts_shown.push(milestone.count);
      changed = true;
      await notifyActiveTab(
        `${milestone.emoji} ${milestone.count} items hidden — ${milestone.message}`,
        'milestone',
      );
    }
  }

  if (changed) await setState(state);
}

export async function unlockFirstBlock(): Promise<void> {
  const state = await getState();
  let changed = false;

  if (await unlock(state, 'first_block')) changed = true;

  // ── Party Time — 10 blocks in 1 minute ──────────────────────────────────
  const now = Date.now();
  // Prune blocks older than 60 seconds
  state.recent_blocks = state.recent_blocks.filter((t) => now - t < 60_000);
  state.recent_blocks.push(now);
  if (state.recent_blocks.length >= 10) {
    if (await unlock(state, 'party_time')) changed = true;
  }
  changed = true; // recent_blocks always mutated

  await setState(state);
}

/** Unlock the secret Unicorn achievement (called from easter egg triggers). */
export async function unlockUnicorn(): Promise<void> {
  const state = await getState();
  if (await unlock(state, 'unicorn')) {
    await setState(state);
  }
}
