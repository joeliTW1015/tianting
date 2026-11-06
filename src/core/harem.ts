// 後宮：妃嬪是政治棋子。家世（外戚屬某派）、性情、好感、恩寵、妒意、野心；晉封、冷落、廢后立后、立儲；
// 爭寵誣陷、下毒、巫蠱、外戚干政、後宮耳目等事件。

import { core, draft, local, post, task } from './docs';
import { addClout, addGrievance } from './factions';
import { FACTION_NAME } from './people';
import { chance, int, pick, range } from './rng';
import { addStatus, removeStatus } from './statuses';
import type { Child, Choice, Consort, Doc, FactionId, GameState } from './types';
import { addMood, addPrestige, clamp, event, flow, makeChar } from './util';

export const RANKS = ['答應', '貴人', '嬪', '妃', '貴妃', '皇貴妃', '皇后'];
export const CONSORT_TEMPER = { virtuous: '賢淑', jealous: '善妒', clever: '機敏', spoiled: '嬌縱', serene: '淡泊' } as const;
const SURNAMES = '周田袁張劉王李鄭范任方陸沈';
const GIVEN = ['淑', '婉', '惠', '慧', '瑾', '瑤', '蓉', '蘭', '雲', '靜', '貞', '容', '馨', '萱'];

export function consortName(state: GameState, c: Consort): string {
  const ch = state.chars[c.id];
  return `${ch?.name ?? ''}${RANKS[c.rank]}`;
}

export function makeConsort(state: GameState, rank: number, family: FactionId | null, opts: Partial<Consort> = {}): Consort {
  const r = state.rng;
  const n = state.consorts.length + 1;
  const id = `fei:${n}`;
  const ch = makeChar(state, id, RANKS[rank], 'jingshi', rank === 6 ? 'empress' : 'consort', 2, { faction: family, name: `${pick(r, SURNAMES.split(''))}氏` });
  ch.name = `${ch.name[0]}${pick(r, GIVEN)}`;
  const c: Consort = {
    id,
    rank,
    family,
    temper: opts.temper ?? pick(r, ['virtuous', 'jealous', 'clever', 'spoiled', 'serene'] as const),
    affection: opts.affection ?? int(r, 40, 65),
    grace: opts.grace ?? int(r, 20, 50),
    jealousy: opts.jealousy ?? int(r, 10, 35),
    ambition: opts.ambition ?? int(r, 20, 60),
    spy: opts.spy ?? false,
    status: 'active',
  };
  state.consorts.push(c);
  return c;
}

export function activeConsorts(state: GameState): Consort[] {
  return state.consorts.filter((c) => c.status === 'active');
}

export function empress(state: GameState): Consort | undefined {
  return state.consorts.find((c) => c.rank === 6 && c.status === 'active');
}

export function affectionText(a: number): string {
  return a >= 80 ? '傾心' : a >= 60 ? '敬愛' : a >= 40 ? '恭順' : a >= 20 ? '疏離' : '怨懟';
}

export function sons(state: GameState): Child[] {
  return state.children.filter((c) => c.son && c.alive);
}

// ───────────────────────── 行動 ─────────────────────────

/** 臨幸（消遣「臨幸後宮」時選定一位） */
export function favor(state: GameState, id: string): void {
  const c = state.consorts.find((x) => x.id === id);
  if (!c || c.status !== 'active') return;
  c.affection = clamp(c.affection + 8, 0, 100);
  c.grace = clamp(c.grace + 10, 0, 100);
  for (const o of activeConsorts(state)) {
    if (o.id === c.id) continue;
    o.jealousy = clamp(o.jealousy + (o.temper === 'jealous' ? 9 : 5), 0, 100);
    o.grace = clamp(o.grace - 2, 0, 100);
  }
  if (!c.pregnantUntil && chance(state.rng, c.grace / 1000 * 1.0 + 0.04)) {
    c.pregnantUntil = state.turn + 27;
    addMood(state, 6);
    const d = local(draft('notice', 'silijian', 'jingshi', 'court', '司禮監奏：宮中有喜'), state);
    d.free = true;
    d.highlight = '宮中喜訊';
    core(d, `奴婢謹奏：太醫診得${consortName(state, c)}有娠，約九月後誕育。`, `${consortName(state, c)}有娠`, `${consortName(state, c)}懷孕了，約二十七旬後生產。（行程中可以看到預計時間）`);
    post(state, d);
  }
}

export function haremAct(state: GameState, id: string, kind: string): string | null {
  const c = state.consorts.find((x) => x.id === id);
  if (!c) return '無此人。';
  const w = state.world;
  switch (kind) {
    case 'reward':
      if (w.privy < 3) return '內帑不足。';
      flow(state, '宮廷', `賞賜${consortName(state, c)}`, { privy: -3 });
      c.affection = clamp(c.affection + 10, 0, 100);
      return null;
    case 'promote': {
      if (c.rank >= 5) return '已至極品（立后另議）。';
      c.rank += 1;
      state.chars[c.id].title = RANKS[c.rank];
      c.affection = clamp(c.affection + 12, 0, 100);
      addClout(state, c.family, 2 + c.rank * 0.6);
      if (c.rank >= 4) for (const f of ['yan', 'qing', 'zhe', 'xun'] as FactionId[]) if (f !== c.family) addGrievance(state, f, 4);
      for (const o of activeConsorts(state)) if (o.id !== c.id) o.jealousy = clamp(o.jealousy + 6, 0, 100);
      return null;
    }
    case 'cold':
      c.grace = clamp(c.grace - 30, 0, 100);
      c.affection = clamp(c.affection - 20, 0, 100);
      addGrievance(state, c.family, 5);
      return null;
    case 'exile':
      if (c.rank === 6) return '皇后須先廢黜。';
      c.status = 'cold';
      addGrievance(state, c.family, 15);
      event(state, 'court', `${consortName(state, c)}被打入冷宮。`, true);
      return null;
    case 'depose': {
      if (c.rank !== 6) return '只能廢皇后。';
      if (w.dowager < 60) {
        addPrestige(state, -10);
        w.dowager = clamp(w.dowager - 20, 0, 100);
      }
      c.rank = 3;
      state.chars[c.id].title = RANKS[3];
      c.affection = 5;
      addGrievance(state, 'qing', 25);
      addGrievance(state, c.family, 15);
      addPrestige(state, -10);
      event(state, 'court', `廢皇后為${RANKS[3]}。`, true);
      return null;
    }
    case 'crown': {
      if (empress(state)) return '中宮未虛。';
      if (c.rank < 3) return '須妃位以上。';
      if (w.dowager < 40) {
        addPrestige(state, -6);
        w.dowager = clamp(w.dowager - 15, 0, 100);
      }
      c.rank = 6;
      state.chars[c.id].title = RANKS[6];
      state.chars[c.id].kind = 'empress';
      c.affection = clamp(c.affection + 20, 0, 100);
      addClout(state, c.family, 8);
      event(state, 'court', `冊立${state.chars[c.id].name}為皇后。`, true);
      return null;
    }
  }
  return '無此事。';
}

/** 立儲 */
export function designate(state: GameState, childId: string): string | null {
  const ch = state.children.find((x) => x.id === childId && x.alive && x.son);
  if (!ch) return '無此皇子。';
  if (state.heir === childId) return '已是儲君。';
  const w = state.world;
  const eldest = sons(state).sort((a, b) => a.born - b.born)[0];
  const mom = state.consorts.find((x) => x.id === ch.mother);
  state.heir = childId;
  removeStatus(state, 'noheir');
  if (eldest.id !== childId || (mom && mom.rank !== 6 && sons(state).some((s) => state.consorts.find((x) => x.id === s.mother)?.rank === 6))) {
    addGrievance(state, 'qing', 20);
    w.dowager = clamp(w.dowager - 15, 0, 100);
    addPrestige(state, -4);
    event(state, 'court', `立${ch.name}為太子，廷臣以「立嫡立長」力爭。`, true);
  } else {
    addPrestige(state, 6);
    w.dowager = clamp(w.dowager + 5, 0, 100);
    event(state, 'court', `冊立${ch.name}為皇太子，國本以定。`, true);
  }
  if (mom) addClout(state, mom.family, 5);
  return null;
}

// ───────────────────────── 每旬 ─────────────────────────

export function haremTick(state: GameState): void {
  const r = state.rng;
  const t = state.turn;
  for (const c of activeConsorts(state)) {
    c.grace = clamp(c.grace - 0.6, 0, 100);
    c.affection = clamp(c.affection + (c.grace > 40 ? 0.2 : -0.3), 0, 100);
    c.jealousy = clamp(c.jealousy - 0.8, 0, 100);
    if (c.pregnantUntil && t >= c.pregnantUntil) birth(state, c);
  }
  for (const ch of state.children) {
    if (!ch.alive) continue;
    if (t - ch.born < 72 && chance(r, 0.08 / 36)) {
      ch.alive = false;
      addMood(state, -15);
      event(state, 'court', `${ch.name}夭折。`, true);
      if (state.heir === ch.id) state.heir = undefined;
    }
  }
  if (t >= 72 && !sons(state).length) addStatus(state, 'noheir', 999);

  const cd = state.world.cooldown;
  if ((cd.harem ?? -99) > t) return;
  const list = activeConsorts(state);
  const jealous = list.filter((c) => c.jealousy >= 70).sort((a, b) => b.jealousy - a.jealousy)[0];
  const pregnant = list.find((c) => c.pregnantUntil);
  const high = list.find((c) => c.rank >= 4 && c.family && c.ambition > 50);
  const loving = list.find((c) => c.affection >= 70 && !c.spy && c.family !== 'yan');
  const roll = range(r, 0, 1);
  if (jealous && jealous.jealousy >= 85 && (pregnant || sons(state).length) && roll < 0.12) {
    cd.harem = t + 10;
    poison(state, jealous, pregnant);
  } else if (jealous && roll < 0.1) {
    cd.harem = t + 8;
    slander(state, jealous);
  } else if (jealous && jealous.temper === 'jealous' && roll < 0.14) {
    cd.harem = t + 12;
    witchcraft(state, jealous);
  } else if (high && roll < 0.18) {
    cd.harem = t + 12;
    kinRequest(state, high);
  } else if (loving && roll < 0.24 && t % 3 === 0) {
    cd.harem = t + 9;
    eyes(state, loving);
  }
}

function birth(state: GameState, c: Consort): void {
  c.pregnantUntil = undefined;
  const son = chance(state.rng, 0.5);
  const order = state.children.filter((x) => x.son === son).length;
  const NUM = ['長', '次', '三', '四', '五', '六'];
  const ch: Child = { id: `child:${state.children.length + 1}`, name: son ? `皇${NUM[order] ?? order + 1}子` : `皇${NUM[order] ?? order + 1}女`, son, mother: c.id, born: state.turn, alive: true };
  state.children.push(ch);
  state.world.emperor.heirs += 1;
  c.grace = clamp(c.grace + 15, 0, 100);
  c.affection = clamp(c.affection + 10, 0, 100);
  if (son) {
    addPrestige(state, 5);
    addMood(state, 20);
    addClout(state, c.family, 4);
    removeStatus(state, 'noheir');
  } else addMood(state, 10);
  event(state, 'court', `${consortName(state, c)}誕${ch.name}。`, true);
  const d = local(draft('notice', 'silijian', 'jingshi', 'court', `司禮監奏：${ch.name}誕生`), state);
  d.free = true;
  d.highlight = '宮中喜訊';
  core(d, `奴婢謹奏：${consortName(state, c)}誕${ch.name}，母子平安。`, `${ch.name}誕生`, `${son ? '皇子' : '公主'}出生了。${son ? '有了皇子，皇叔的圖謀會受挫；可以在後宮畫面「立儲」。' : ''}`);
  post(state, d);
}

function hTask(state: GameState, id: string, title: string, choices: Choice[], fallback: string, data: Record<string, string>): ReturnType<typeof draft> {
  const d = local(draft('task', 'silijian', 'jingshi', 'harem', title), state);
  d.importance = 3;
  d.fromLabel = '尚宮局';
  task(d, id, choices, fallback, state.turn + 2, { data });
  return d;
}

function slander(state: GameState, c: Consort): void {
  const victims = activeConsorts(state).filter((x) => x.id !== c.id && x.grace > c.grace - 10);
  if (!victims.length) return;
  const v = pick(state.rng, victims);
  const d = hTask(state, 'harem:slander', `宮人告發${consortName(state, v)}私通外臣`, [
    { id: 'dongchang', label: '交東廠密查', note: state.world.dongchang === 'crown' ? '東廠可查得真相；但查到後宮，若事洩是最重的第四級後果。' : '東廠在權閹手中，查出來的未必是真。', energy: 1 },
    { id: 'palace', label: '交宮正司查問', note: '宮中自查：可能冤枉好人。' },
    { id: 'ignore', label: '置之不問', note: '傳言不散；兩人積怨更深。' },
  ], 'ignore', { victim: v.id, accuser: c.id });
  core(d, `有宮人密告：${consortName(state, v)}與其兄往來書信，語涉外事。`, `告發${consortName(state, v)}私通外臣`, `有人告發${consortName(state, v)}（家世：${v.family ? FACTION_NAME[v.family] : '寒門'}）私通外臣。後宮爭寵常常互相誣陷。`);
  post(state, d);
}

function poison(state: GameState, c: Consort, pregnant?: Consort): void {
  const kid = sons(state)[0];
  const d = hTask(state, 'harem:poison', pregnant ? `${consortName(state, pregnant)}飲食中驗出毒物` : `${kid?.name ?? '皇子'}病危，太醫疑為中毒`, [
    { id: 'probe', label: '窮究主使', note: '徹查到底：真兇是誰都要辦。可能牽出某派外戚，派系動盪。', energy: 1 },
    { id: 'quiet', label: '杖斃膳房宮人了事', note: '暫息風波；真兇逍遙。' },
  ], 'quiet', { culprit: c.id, target: pregnant?.id ?? kid?.id ?? '' });
  core(d, '尚宮局奏：宮中膳食驗出毒物，所幸發覺及時。', '宮中膳食驗出毒物', '後宮有人下毒！這是爭寵最惡毒的手段。查到底會牽出某位妃嬪和她的家族。');
  post(state, d);
  if (pregnant && chance(state.rng, 0.3)) {
    pregnant.pregnantUntil = undefined;
    addMood(state, -15);
    event(state, 'harem', `${consortName(state, pregnant)}小產。`, true);
  }
}

function witchcraft(state: GameState, c: Consort): void {
  const v = activeConsorts(state).sort((a, b) => b.grace - a.grace).find((x) => x.id !== c.id);
  if (!v) return;
  const d = hTask(state, 'harem:witch', `${consortName(state, v)}宮中搜出巫蠱木偶`, [
    { id: 'harsh', label: '嚴辦', note: '株連宮人數十；龍顏不悅；可能冤枉。', status: 'chill' },
    { id: 'mild', label: '從寬處置', note: '巫蠱之說流傳不息。' },
  ], 'mild', { victim: v.id, culprit: c.id });
  core(d, `尚宮局奏：於${consortName(state, v)}宮中掘得桐木偶人，上書御名生辰。`, '搜出巫蠱木偶', `在${consortName(state, v)}宮裡挖出詛咒用的木偶。是她做的，還是有人栽贓？`);
  post(state, d);
}

function kinRequest(state: GameState, c: Consort): void {
  const d = hTask(state, 'harem:kin', `${consortName(state, c)}之兄求授京營要職`, [
    { id: 'grant', label: '准', note: `${c.family ? FACTION_NAME[c.family] : '外戚'}聲勢上升；她更傾心；但外戚多無能。` },
    { id: 'refuse', label: '不准', note: '她心生怨懟。' },
  ], 'refuse', { who: c.id });
  core(d, `${consortName(state, c)}乘間言：其兄${state.chars[c.id].name[0]}某忠勇可用，乞授京營參將。`, '外戚求官', '寵妃替娘家人要官，這是外戚干政的開端。');
  post(state, d);
}

function eyes(state: GameState, c: Consort): void {
  const w = state.world;
  const eu = state.cases.find((x) => x.def === 'eunuch');
  const un = state.cases.find((x) => x.def === 'uncle');
  const d = local(draft('audience', c.id, 'jingshi', 'harem', `${consortName(state, c)}枕邊密語`), state);
  d.free = true;
  d.fromLabel = consortName(state, c);
  const parts: string[] = [];
  if (eu && !eu.data.removed) parts.push(eu.data.progress >= 30 ? '九千歲近來常召京營將官入宮夜飲' : '九千歲的人常在各宮打探消息');
  if (un && !un.data.rebelled && !un.data.dead) parts.push(un.branch === 'covet' ? '瑞王府的人往來宮中，送禮給各宮' : '瑞王府只送些時鮮果品，並無他事');
  if (c.family) parts.push(`${FACTION_NAME[c.family]}諸公都說，${c.family === 'qing' ? '閹黨誤國' : c.family === 'yan' ? '清流結黨' : '朝中太亂'}`);
  core(d, `${consortName(state, c)}私語：${parts.join('；')}。`, `${consortName(state, c)}言宮中動靜`, `寵愛你的妃子私下告訴你宮中的動靜。可信，但帶著她娘家派系（${c.family ? FACTION_NAME[c.family] : '寒門'}）的偏見。`);
  post(state, d);
  void w;
}

export function applyHaremChoice(state: GameState, doc: Doc, id: string): void {
  const t = doc.task!;
  const data = t.data ?? {};
  const get = (k: string) => state.consorts.find((x) => x.id === String(data[k] ?? ''));
  switch (t.id) {
    case 'harem:slander': {
      const v = get('victim');
      const a = get('accuser');
      if (!v || !a) return;
      if (id === 'dongchang') {
        if (state.world.dongchang === 'crown') {
          a.status = 'cold';
          v.affection = clamp(v.affection + 15, 0, 100);
          addGrievance(state, a.family, 10);
          event(state, 'harem', `東廠查明誣告，${consortName(state, a)}入冷宮。`, true);
          if (chance(state.rng, 0.25)) state.world.cooldown['dc:expose:harem'] = state.turn;
        } else {
          v.status = 'cold';
          state.world.wrongful.push(`${consortName(state, v)}（遭誣私通）`);
          addGrievance(state, v.family, 15);
        }
      } else if (id === 'palace') {
        if (chance(state.rng, 0.5)) {
          v.status = 'cold';
          state.world.wrongful.push(`${consortName(state, v)}（遭誣私通）`);
          addGrievance(state, v.family, 15);
        } else a.jealousy = clamp(a.jealousy - 20, 0, 100);
      } else {
        v.affection = clamp(v.affection - 10, 0, 100);
        a.jealousy = clamp(a.jealousy + 5, 0, 100);
      }
      return;
    }
    case 'harem:poison': {
      const cul = get('culprit');
      if (!cul) return;
      if (id === 'probe') {
        cul.status = 'cold';
        addGrievance(state, cul.family, 20);
        addPrestige(state, 2);
        event(state, 'harem', `窮究下毒之事，主使為${consortName(state, cul)}。`, true);
      } else cul.jealousy = clamp(cul.jealousy + 5, 0, 100);
      return;
    }
    case 'harem:witch': {
      const v = get('victim');
      const cul = get('culprit');
      if (!v || !cul) return;
      if (id === 'harsh') {
        v.status = 'cold';
        state.world.wrongful.push(`${consortName(state, v)}（巫蠱之獄）`);
        addMood(state, -6);
        addGrievance(state, v.family, 20);
      } else addPrestige(state, -1);
      return;
    }
    case 'harem:kin': {
      const c = get('who');
      if (!c) return;
      if (id === 'grant') {
        addClout(state, c.family, 4);
        c.affection = clamp(c.affection + 15, 0, 100);
        state.world.jingyingMorale = clamp(state.world.jingyingMorale - 0.05, 0.3, 1.2);
      } else c.affection = clamp(c.affection - 15, 0, 100);
      return;
    }
  }
}
