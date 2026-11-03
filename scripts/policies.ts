// 自動對局策略（用於批次模擬與平衡）。
// idle／trustAll／followAdvice 只用玩家看得到的資訊；
// skilled 模擬「查證後有七成五判對」的玩家；oracle 直接讀真相，作為可勝性的上限。

import { choose, decide, discoveredCases, issueOrder, orderOptions, readDoc, setBelief } from '../src/core/actions';
import { REGIONS } from '../src/core/geography';
import { BORDER_PAY } from '../src/core/routine';
import { chance, pick } from '../src/core/rng';
import type { CaseState, GameState, RegionId } from '../src/core/types';
import { playerView } from '../src/core/view';
import { CASE_DEFS } from '../src/core/cases';
import { doLeisure } from '../src/core/palace';

export type Policy = (state: GameState) => void;

function order(state: GameState, region: RegionId, kind: string, caseId?: string): boolean {
  const opt = orderOptions(state, region).find((o) => o.kind === kind && (!caseId || o.caseId === caseId));
  return !!opt && issueOrder(state, opt) === null;
}

function pendingRequests(state: GameState) {
  return playerView(state).inbox.filter((d) => d.request && (!d.decision || d.decision === 'shelve'));
}

/** 合理的日常政務處置（讓各策略只差在疑案的判斷） */
function routine(state: GameState): void {
  const v = playerView(state);
  for (const d of v.inbox) {
    if (!d.task || d.task.chosen || state.turn > d.task.deadline) continue;
    const ids = d.task.choices.map((c) => c.id);
    let pickId = d.task.fallback;
    if (ids.includes('full')) pickId = v.treasury > BORDER_PAY + 60 ? 'full' : 'partial';
    else if (ids.includes('silver')) pickId = v.treasury > 150 ? 'silver' : v.grain > 150 ? 'granary' : 'remit';
    else if (ids.includes('buy')) pickId = v.treasury > 45 ? 'buy' : 'ignore';
    else if (ids.includes('dredge')) pickId = v.treasury > 100 ? 'dredge' : 'ignore';
    else if (ids.includes('refuse')) pickId = 'refuse';
    else if (ids.includes('normal') && ids.includes('heavy')) pickId = v.treasury < 80 ? 'heavy' : 'normal';
    else if (ids.includes('self')) pickId = 'self';
    else if (ids.includes('c0')) pickId = 'c0';
    else if (ids.includes('soothe')) pickId = v.treasury > 60 ? 'soothe' : 'punish';
    if (d.task.recommend && !ids.some((x) => ['full', 'silver', 'buy', 'dredge', 'refuse', 'normal', 'self', 'c0', 'soothe'].includes(x))) pickId = d.task.recommend;
    // 不是票擬的辦法，得先細讀
    if (pickId !== d.task.recommend && !d.read && !d.free) {
      if (state.energy > 2) readDoc(state, d.id);
      else pickId = d.task.recommend ?? d.task.fallback;
    }
    if (choose(state, d.id, pickId) !== null && choose(state, d.id, d.task.recommend ?? d.task.fallback) !== null) choose(state, d.id, d.task.fallback);
  }
  // 心情不佳時消遣一下
  const pv = playerView(state).palace;
  if (pv.moodBand <= 1 && state.energy >= 2) doLeisure(state, pv.moodBand === 0 ? 'opera' : 'garden');
}

export const idle: Policy = () => {};

export const trustAll: Policy = (state) => {
  routine(state);
  for (const d of pendingRequests(state)) decide(state, d.id, 'approve');
};

export const followAdvice: Policy = (state) => {
  routine(state);
  for (const d of pendingRequests(state)) {
    const yes = /准|速發|宜即/.test(d.recommend ?? '') && !/駁/.test(d.recommend ?? '');
    decide(state, d.id, yes ? 'approve' : 'reject');
  }
};

/** 針對「相信」的分支採取最佳應對 */
function respond(state: GameState, c: CaseState, b: string, acted: Set<string>): void {
  const once = (key: string, f: () => boolean) => {
    if (!acted.has(key) && f()) acted.add(key);
  };
  const R = c.region;
  const id = c.uid;
  const reqs = pendingRequests(state).filter((d) => d.request?.caseId === id);
  const answer = (yes: boolean) => reqs.forEach((d) => decide(state, d.id, yes ? 'approve' : 'reject'));
  switch (c.def) {
    case 'border':
      if (b === 'loyal') answer(true);
      else {
        answer(false);
        once('arrest', () => order(state, R, 'arrest'));
        if (b === 'traitor') {
          const next = REGIONS[R].toCapital[0];
          once('guard', () => (next === 'jingshi' ? true : order(state, next, 'campaign')));
        }
      }
      break;
    case 'remit':
      if (b === 'disaster') answer(true);
      else {
        answer(false);
        if (b === 'gentry') once('survey', () => order(state, R, 'survey', id));
        else once('arrest', () => order(state, R, 'arrest'));
      }
      break;
    case 'bandit':
      if (b === 'hidden') {
        answer(true);
        once('camp1', () => order(state, R, 'campaign'));
      } else if (b === 'feigned') {
        answer(false);
        once('disperse', () => order(state, R, 'disperse', id));
      } else answer(false);
      break;
    case 'prince':
      answer(false);
      if (b === 'greedy') once('rep', () => order(state, R, 'reprimand', id));
      if (b === 'plot') once('cut', () => order(state, R, 'cut', id));
      break;
    case 'river':
      if (b === 'genuine') answer(true);
      else if (b === 'embezzle') {
        once('arrest', () => order(state, R, 'arrest', id));
        if (acted.has('arrest')) answer(true);
        else answer(false);
      } else answer(false);
      break;
    case 'coast':
      if (b === 'wokou') {
        answer(true);
        once('camp', () => order(state, R, 'campaign'));
      } else {
        answer(false);
        once('fix', () => order(state, R, b === 'smuggle' ? 'crackdown' : 'open', id));
      }
      break;
    case 'salt':
      once('fix', () => order(state, R, b === 'smuggle' ? 'crackdown' : b === 'embezzle' ? 'audit' : 'recallEunuch', id));
      break;
    case 'inner':
      if (b !== 'slandered') once('remove', () => (state.world.prestige >= 35 ? order(state, R, 'remove', id) : order(state, R, 'warn', id)));
      break;
    case 'exam':
      once('retest', () => order(state, R, 'retest', id));
      if (b === 'real') once('ae', () => order(state, R, 'arrestExaminer', id));
      if (b === 'partial') once('af', () => order(state, R, 'arrestFang', id));
      break;
    case 'tusi':
      if (b === 'provoked') {
        answer(false);
        once('arrest', () => order(state, R, 'arrest'));
        once('pacify', () => order(state, R, 'pacify', id));
      } else if (b === 'ambition') {
        answer(true);
        once('camp', () => order(state, R, 'campaign'));
        if (acted.has('camp') && state.turn % 8 === 0) once('camp2', () => order(state, R, 'campaign'));
        once('reform', () => order(state, R, 'reform', id));
      } else {
        answer(false);
        const legit = c.data.legit;
        const guess = acted.has('wrongHeir') ? 1 - legit : legit;
        once('pick', () => order(state, R, `pick${guess}`, id));
      }
      break;
  }
}

const memory = new WeakMap<GameState, { belief: Record<string, string>; acted: Record<string, Set<string>>; knownAt: Record<string, number> }>();

function judged(accuracy: number, delay: number): Policy {
  return (state) => {
    let m = memory.get(state);
    if (!m) {
      m = { belief: {}, acted: {}, knownAt: {} };
      memory.set(state, m);
    }
    routine(state);
    // 讀一些文書（耗精力，模擬真人的閱讀）
    for (const d of playerView(state).inbox.filter((x) => !x.read && x.isNew).slice(0, 2)) readDoc(state, d.id);
    for (const c of discoveredCases(state)) {
      m.knownAt[c.uid] ??= state.turn;
      if (state.turn - m.knownAt[c.uid] < delay) continue;
      if (!m.belief[c.uid]) {
        const def = CASE_DEFS[c.def];
        m.belief[c.uid] = chance(state.rng, accuracy) ? c.branch : pick(state.rng, def.branches.filter((b) => b.id !== c.branch)).id;
        if (c.def === 'tusi' && c.branch === 'succession' && !chance(state.rng, accuracy)) (m.acted[c.uid] ??= new Set()).add('wrongHeir');
        setBelief(state, c.uid, m.belief[c.uid]);
      }
      respond(state, c, m.belief[c.uid], (m.acted[c.uid] ??= new Set()));
    }
    // 有賊入境的飛報：就近派兵
    for (const d of playerView(state).inbox.filter((x) => x.urgent && x.isNew)) {
      if (d.region !== 'jingshi' && state.world.jingying > 35000) order(state, d.region, 'campaign');
    }
  };
}

/** 模擬玩家：察覺後兩旬（查證所需），有七成五判對 */
export const skilled: Policy = judged(0.75, 2);
/** 全知：察覺當旬就知道真相 */
export const oracle: Policy = judged(1, 0);

export const POLICIES: Record<string, Policy> = { idle, trustAll, followAdvice, skilled, oracle };
