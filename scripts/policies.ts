// 自動對局策略（用於批次模擬與平衡）。
// idle：什麼都不做（大臣依授權代辦）；random：亂按；followAdvice：照票擬；
// skilled：合理的玩家（查證後七成五判對疑案，懂得奪東廠、點驗、平寇、救國庫）；oracle：直接讀真相。

import { choose, decide, discoveredCases, issueOrder, orderOptions, readDoc, setBelief } from '../src/core/actions';
import { strikeOdds } from '../src/core/cases/eunuch';
import { summonOdds } from '../src/core/cases/uncle';
import { EDICTS, issueDip, issueEdict, previewEdict } from '../src/core/edicts';
import { clout } from '../src/core/factions';
import { REGIONS } from '../src/core/geography';
import { doLeisure } from '../src/core/palace';
import { chance, pick } from '../src/core/rng';
import type { CaseState, GameState, RegionId } from '../src/core/types';
import { playerView } from '../src/core/view';
import { CASE_DEFS } from '../src/core/cases';
import { crownArmies, hostileArmies, marchTo } from '../src/core/war';

export type Policy = (state: GameState) => void;

function order(state: GameState, region: RegionId, kind: string, caseId?: string): boolean {
  const opt = orderOptions(state, region).find((o) => o.kind === kind && (!caseId || o.caseId === caseId));
  return !!opt && issueOrder(state, opt) === null;
}

function edict(state: GameState, id: string, t = '', p = ''): boolean {
  return issueEdict(state, id, t, p) === null;
}

function pendingRequests(state: GameState) {
  return playerView(state).inbox.filter((d) => d.request && (!d.decision || d.decision === 'shelve') && !d.delegatedBy);
}

/** 依票擬處理所有待裁政務 */
function followTasks(state: GameState): void {
  for (const d of playerView(state).inbox) {
    if (!d.task || d.task.chosen || d.task.delegate || state.turn > d.task.deadline) continue;
    const pickId = d.task.recommend ?? d.task.fallback;
    if (choose(state, d.id, pickId) !== null) choose(state, d.id, d.task.fallback);
  }
}

export const idle: Policy = () => {};

/** 亂按：隨機細讀、隨機選、隨機下詔書，直到精力用完 */
export const random: Policy = (state) => {
  const r = state.rng;
  for (const d of playerView(state).inbox) {
    if (d.task && !d.task.chosen && state.turn <= d.task.deadline) {
      if (!d.read) readDoc(state, d.id);
      choose(state, d.id, pick(r, d.task.choices).id);
    }
    if (d.request && !d.decision) decide(state, d.id, chance(r, 0.5) ? 'approve' : 'reject');
  }
  for (let k = 0; k < 6 && state.energy > -2; k++) {
    const e = pick(r, EDICTS);
    const ts = e.targets?.(state) ?? [];
    const t = e.target === 'none' ? '' : ts.length ? pick(r, ts).id : '';
    const ps = e.params?.(state, t) ?? [];
    const p = ps.length ? pick(r, ps).id : '';
    issueEdict(state, e.id, t, p);
  }
};

export const followAdvice: Policy = (state) => {
  followTasks(state);
  for (const d of pendingRequests(state)) {
    const yes = /准|速發|宜即/.test(d.recommend ?? '') && !/駁/.test(d.recommend ?? '');
    decide(state, d.id, yes ? 'approve' : 'reject');
  }
};

/** 合理的治國手段（不靠真相） */
function statecraft(state: GameState): void {
  const w = state.world;
  const v = playerView(state);
  const t = state.turn;
  followTasks(state);
  // 病了就治
  for (const d of v.inbox) if (d.task?.choices.some((c) => c.id === 'doctors') && !d.task.chosen && t <= d.task.deadline) choose(state, d.id, 'doctors');
  // 開局：點驗京師（清京營空額）、整頓財政
  if (t === 0) edict(state, 'audit', 'jingshi');
  if (t === 1 && w.prestige >= 40) edict(state, 'sell');
  if (t >= 2 && t % 12 === 2 && w.treasury < 150) edict(state, 'mine');
  if (t === 4) edict(state, 'sea');
  if (t === 5) edict(state, 'postcut');
  // 邊餉：補發積欠
  for (const d of v.inbox) {
    if (d.task?.choices.some((c) => c.id === 'clear') && !d.task.chosen && t <= d.task.deadline) {
      const c = d.task.choices.find((x) => x.id === 'clear')!;
      if ((c.silver ?? 0) < w.treasury - 40) {
        if (!d.read) readDoc(state, d.id);
        choose(state, d.id, 'clear');
      }
    }
  }
  // 權閹：換掉閹黨的京營、錦衣衛，看準時機雷霆一擊
  const eu = state.cases.find((c) => c.def === 'eunuch');
  if (eu && !eu.data.removed) {
    for (const post of ['jinyiwei', 'jingying']) {
      const c = state.chars[post];
      if (c.faction === 'yan' || c.loyalty < 55) {
        const pv = previewEdict(state, 'appoint', post, '');
        void pv;
        const cand = EDICTS.find((e) => e.id === 'appoint')!.params!(state, post).find((x) => !x.label.includes('閹黨'));
        if (cand) edict(state, 'appoint', post, cand.id);
      }
    }
    if (strikeOdds(state) >= 0.6) order(state, 'jingshi', 'eu:strike', eu.uid);
    else if (w.prestige >= 50 || clout(state).yan < 0.3) order(state, 'jingshi', 'eu:remove', eu.uid);
  } else if (eu && eu.data.removed && !eu.data.arrested) order(state, 'jingshi', 'eu:arrest', eu.uid);
  // 皇叔
  const un = state.cases.find((c) => c.def === 'uncle');
  if (un && !un.resolved && t >= 8 && summonOdds(state, un) >= 0.8) order(state, 'henan', 'uncle:summon', un.uid);
  // 立儲
  const son = state.children.find((c) => c.son && c.alive);
  if (son && !state.heir) edict(state, 'heir', son.id);
  // 派系怨望過高就調停
  const g = w.factions;
  const hot = (['yan', 'qing', 'zhe', 'xun'] as const).filter((f) => g[f].grievance >= 70);
  if (hot.length) edict(state, 'mediate', '', `${hot[0]}|${hot[0] === 'qing' ? 'zhe' : 'qing'}`);
  // 軍事：境內有敵，就近派兵
  const foes = hostileArmies(state).filter((a) => REGIONS[a.region].kind !== 'outer');
  for (const f of foes) {
    const mine = crownArmies(state).filter((a) => !a.path.length && a.region !== f.region && a.caseId !== 'dongjiang');
    if (!mine.some((a) => a.region === f.region || a.dest === f.region)) {
      const near = mine.sort((a, b) => Math.abs(REGIONS[a.region].days - REGIONS[f.region].days) - Math.abs(REGIONS[b.region].days - REGIONS[f.region].days))[0];
      if (near && near.size > f.size * 0.6) marchTo(state, near, f.region, 'suppress');
      else if (w.jingying > 35000) edict(state, 'sendJingying', f.region, '10000');
    }
  }
  // 追剿：最大的機動部隊追著最大的叛軍打
  const big = hostileArmies(state).filter((a) => (a.side === 'bandit' || a.side === 'rebel') && REGIONS[a.region].kind !== 'outer').sort((a, b) => b.size - a.size)[0];
  if (big) {
    const hunters = crownArmies(state).filter((a) => a.caseId !== 'dongjiang' && a.caseId !== 'border-army' && !a.fromCapital).sort((a, b) => b.size - a.size);
    const h = hunters[0];
    if (h && h.region !== big.region && (!h.path.length || h.dest !== big.region)) marchTo(state, h, big.region, 'suppress');
    if (h) h.posture = 'attack';
    if (t % 6 === 1 && w.treasury > 90) edict(state, 'elite', 'shaanxi', '5000');
  }
  if (t % 9 === 3 && w.treasury > 150) edict(state, 'elite', 'shaanxi', '5000');
  if (t % 12 === 6 && w.treasury > 180) edict(state, 'recruit', 'jizhen', '10000');
  if (t >= 10 && !w.jingyingDrilled && w.treasury > 80) edict(state, 'drill');
  if (w.powers.jianzhou.standing === 'hostile' && w.powers.jianzhou.strength > 65000) issueDip(state, 'jianzhou', 'peace');
  for (const a of crownArmies(state)) if (a.morale < 40 && w.treasury > 60) edict(state, 'reward', String(a.id));
  if (t % 15 === 8 && w.treasury > 100) edict(state, 'walls', 'jizhen');
  // 外交：撫賞察哈爾、與喀爾喀互市、招撫海商
  if (t % 10 === 2 && w.treasury > 100) issueDip(state, 'chahar', 'gift');
  if (t === 3) issueDip(state, 'khalkha', 'trade');
  if (t === 7) issueDip(state, 'haishang', 'recruit');
  // 心情與勞損
  const pv = playerView(state).palace;
  if (pv.moodBand <= 1) doLeisure(state, 'garden');
  if (w.emperor.fatigue >= 5) edict(state, 'rest');
}

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
          once('guard', () => (next === 'jingshi' ? true : edict(state, 'sendJingying', next, '10000')));
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
        once('camp1', () => edict(state, 'sendJingying', R, '10000'));
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
        once('camp', () => edict(state, 'sendJingying', R, '10000'));
      } else {
        answer(false);
        once('fix', () => order(state, R, b === 'smuggle' ? 'crackdown' : 'open', id));
      }
      break;
    case 'salt':
      once('fix', () => order(state, R, b === 'smuggle' ? 'crackdown' : b === 'embezzle' ? 'audit' : 'recallEunuch', id));
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
        once('camp', () => edict(state, 'sendJingying', R, '10000'));
        if (acted.has('camp') && state.turn % 8 === 0) once('camp2', () => edict(state, 'sendJingying', R, '10000'));
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
    statecraft(state);
    for (const d of playerView(state).inbox.filter((x) => !x.read && x.isNew && x.importance >= 2).slice(0, 2)) if (state.energy > 1) readDoc(state, d.id);
    for (const c of discoveredCases(state)) {
      if (c.def === 'eunuch' || c.def === 'uncle') continue;
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
    for (const d of pendingRequests(state)) decide(state, d.id, /准|速發|宜即/.test(d.recommend ?? '') ? 'approve' : 'reject');
  };
}

/** 模擬玩家：察覺後兩旬（查證所需），有七成五判對 */
export const skilled: Policy = judged(0.75, 2);
/** 全知：察覺當旬就知道真相 */
export const oracle: Policy = judged(1, 0);

export const POLICIES: Record<string, Policy> = { idle, random, followAdvice, skilled, oracle };
