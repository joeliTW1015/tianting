// 狀態（多輪 buff）：事件選擇給予持續 N 旬的效果，頂欄顯示圖示與剩餘旬數。

import type { GameState, Status, StatusFx } from './types';

export interface StatusDef {
  name: string;
  desc: string;
  fx: Partial<Record<StatusFx, number>>;
  turns: number;
  good: boolean;
}

export const STATUS_DEFS: Record<string, StatusDef> = {
  frugal: { name: '天子節儉', desc: '每旬朝望略升、國庫略省；龍顏略減', fx: { prestige: 0.3, treasury: 1, mood: -1 }, turns: 9, good: true },
  snow: { name: '瑞雪兆豐年', desc: '田賦 +10%', fx: { tax: 0.1 }, turns: 6, good: true },
  chill: { name: '士林寒心', desc: '言路每旬 −2；清流怨望每旬 +1', fx: { speech: -2, grievance: 1 }, turns: 12, good: false },
  drilled: { name: '京營新練', desc: '京營士氣上升', fx: { defense: 0.15 }, turns: 9, good: true },
  anger: { name: '民怨沸騰', desc: '各省民心每旬惡化', fx: { unrest: 1 }, turns: 6, good: false },
  awe: { name: '天威震懾', desc: '外藩掠邊的機率減半', fx: { raid: -0.5 }, turns: 6, good: true },
  terror: { name: '廠衛之禍', desc: '百官忠誠每旬 −1', fx: { loyalty: -1 }, turns: 9, good: false },
  plague: { name: '疫癘', desc: '京師民心每旬惡化；聖躬易病', fx: { ill: 0.08 }, turns: 6, good: false },
  harmony: { name: '君臣相得', desc: '封駁的機會減半', fx: { veto: -0.5 }, turns: 6, good: true },
  noheir: { name: '國本未定', desc: '朝望每旬略降；皇叔窺伺', fx: { prestige: -0.2 }, turns: 999, good: false },
  cannon: { name: '紅夷大砲', desc: '守城 +30%', fx: { defense: 0.3 }, turns: 999, good: true },
  grace: { name: '皇恩浩蕩', desc: '各省民心每旬好轉', fx: { unrest: -1 }, turns: 6, good: true },
  shock: { name: '驚魂未定', desc: '龍顏每旬 −2；精力回復 −1', fx: { mood: -2, regen: -1 }, turns: 3, good: false },
  resign: { name: '百官乞休', desc: '部務廢弛：田賦 −5%', fx: { tax: -0.05 }, turns: 6, good: false },
  guard: { name: '加強宿衛', desc: '護衛 +1 級；每旬國庫 −1', fx: { treasury: -1 }, turns: 12, good: true },
  reform: { name: '清丈田畝', desc: '江南豪紳怨懟：南直隸、浙江民心惡化', fx: {}, turns: 12, good: false },
  fervor: { name: '士民激昂', desc: '朝望每旬略升', fx: { prestige: 0.4 }, turns: 6, good: true },
  famineCap: { name: '京師米貴', desc: '京師民心每旬惡化', fx: {}, turns: 6, good: false },
};

export function addStatus(state: GameState, id: string, turns?: number): void {
  const def = STATUS_DEFS[id];
  if (!def) return;
  const until = state.turn + (turns ?? def.turns);
  const cur = state.world.statuses.find((s) => s.id === id);
  if (cur) {
    cur.until = Math.max(cur.until, until);
    return;
  }
  const s: Status = { id, name: def.name, until, desc: def.desc, fx: { ...def.fx } };
  state.world.statuses.push(s);
}

export function hasStatus(state: GameState, id: string): boolean {
  return state.world.statuses.some((s) => s.id === id && s.until > state.turn);
}

export function removeStatus(state: GameState, id: string): void {
  state.world.statuses = state.world.statuses.filter((s) => s.id !== id);
}

/** 所有狀態某效果的合計 */
export function fx(state: GameState, k: StatusFx): number {
  let n = 0;
  for (const s of state.world.statuses) if (s.until > state.turn) n += s.fx[k] ?? 0;
  return n;
}

export function statusTick(state: GameState): void {
  state.world.statuses = state.world.statuses.filter((s) => s.until > state.turn);
}
