// 疑案總管：每局抽五案、排程浮現時間、逐旬推進、派送旨意。

import { regionName } from '../geography';
import { int, pick, shuffle } from '../rng';
import type { CaseState, GameState, Order } from '../types';
import { bandit } from './bandit';
import { border } from './border';
import { coast } from './coast';
import { eunuch } from './eunuch';
import { exam } from './exam';
import { prince } from './prince';
import { remit } from './remit';
import { river } from './river';
import { salt } from './salt';
import { tusi } from './tusi';
import type { CaseDef } from './types';
import { uncle } from './uncle';

export const CASE_DEFS: Record<string, CaseDef> = { eunuch, uncle, border, remit, bandit, prince, river, coast, salt, exam, tusi };
/** 疑案池（每局抽五案）；權閹、皇叔兩條前朝主線必出 */
export const CASE_IDS = ['border', 'remit', 'bandit', 'prince', 'river', 'coast', 'salt', 'exam', 'tusi'];
export const FIXED_CASES = ['eunuch', 'uncle'];

export function defOf(c: CaseState): CaseDef {
  return CASE_DEFS[c.def];
}

/** 浮現的時間槽：第一案開局不久，其後陸續 */
const SLOTS: [number, number][] = [
  [6, 12],
  [20, 32],
  [40, 56],
  [64, 84],
  [92, 120],
];

export function drawCases(state: GameState, count = 5, force?: string[]): CaseState[] {
  const r = state.rng;
  const ids = force ?? shuffle(r, CASE_IDS.slice()).slice(0, count);
  // 有季節限制的案件優先排進合適的槽
  const order = ids.slice().sort((a, b) => Number(!!CASE_DEFS[b].startAt) - Number(!!CASE_DEFS[a].startAt));
  const usedRegions = new Set<string>();
  const usedSlots = new Set<number>();
  const out: CaseState[] = [];
  order.forEach((id, i) => {
    const def = CASE_DEFS[id];
    let slot = SLOTS.findIndex((_, k) => !usedSlots.has(k) && (!def.startAt || def.startAt(SLOTS[k][0]) <= SLOTS[k][1] + 4));
    if (slot < 0) slot = SLOTS.findIndex((_, k) => !usedSlots.has(k));
    usedSlots.add(slot);
    let start = int(r, SLOTS[slot][0], SLOTS[slot][1]);
    if (def.startAt) start = def.startAt(start);
    const regions = def.regions.filter((x) => !usedRegions.has(x) || x === 'jingshi');
    const region = regions.length ? pick(r, regions) : pick(r, def.regions);
    usedRegions.add(region);
    out.push({
      uid: `c${i + 1}`,
      def: id,
      region,
      branch: pick(r, def.branches).id,
      startTurn: start,
      stage: 0,
      actors: {},
      data: {},
      flags: {},
      memo: [],
    });
  });
  out.sort((a, b) => a.startTurn - b.startTurn);
  out.forEach((c, i) => (c.uid = `c${i + 1}`));
  // 前朝主線
  const fixed: CaseState[] = FIXED_CASES.map((id, i) => ({
    uid: id === 'eunuch' ? 'k1' : 'k2',
    def: id,
    region: CASE_DEFS[id].regions[0],
    branch: id === 'uncle' && state.difficulty === 'hard' ? 'covet' : pickBranch(state, id),
    startTurn: i,
    stage: 0,
    actors: {},
    data: {},
    flags: {},
    memo: [],
  }));
  return [...fixed, ...out];
}

function pickBranch(state: GameState, id: string): string {
  const r = state.rng;
  const x = r.s % 100;
  void x;
  if (id === 'eunuch') return pick(r, ['plot', 'plot', 'plot', 'greed', 'greed']);
  return pick(r, ['content', 'content', 'covet', 'covet', 'covet', 'puppet', 'puppet']);
}

export function setupCases(state: GameState): void {
  for (const c of state.cases) CASE_DEFS[c.def].setup(state, c);
}

export function casesTick(state: GameState): void {
  for (const c of state.cases) {
    if (c.resolved || state.turn < c.startTurn) continue;
    CASE_DEFS[c.def].tick(state, c);
    if (state.over) return;
  }
}

export function activeCases(state: GameState): CaseState[] {
  return state.cases.filter((c) => state.turn >= c.startTurn && !c.resolved);
}

export function caseTitle(c: CaseState): string {
  const def = CASE_DEFS[c.def];
  return c.region === 'jingshi' ? def.name : `${def.name}・${regionName(c.region)}`;
}

/** 把旨意交給相關疑案；回傳 true 表示已被某案處理 */
export function caseOrder(state: GameState, o: Order): boolean {
  if (o.caseId) {
    const c = state.cases.find((x) => x.uid === o.caseId);
    if (c && state.turn >= c.startTurn) return CASE_DEFS[c.def].onOrder(state, c, o);
    return false;
  }
  let handled = false;
  for (const c of state.cases) {
    if (state.turn < c.startTurn || c.region !== o.region) continue;
    if (CASE_DEFS[c.def].onOrder(state, c, o)) handled = true;
  }
  return handled;
}

export type { CaseDef };
