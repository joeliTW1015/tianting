// 人事：職位、能力評語、任免、授權，以及大臣依授權自行處分的決策規則。

import { regionName, REGIONS } from './geography';
import { chance, hashSeed, int, pick, range } from './rng';
import type { Abilities, Authority, CharId, Character, Choice, Doc, FactionId, GameState, RegionId } from './types';
import { clamp, makeChar } from './util';

export const ABIL_TEXT = ['庸碌', '平平', '幹練', '優長', '卓絕'];
export const ABIL_NAME: Record<keyof Abilities, string> = { mil: '統兵', gov: '治政', fin: '理財', wit: '謀略' };
export const STANCE_TEXT = { war: '主戰', steady: '持重', peace: '主和' } as const;
export const TEMPER_TEXT = { harsh: '嚴刻', mid: '中道', lenient: '寬仁' } as const;
export const AUTH_TEXT: Record<Authority, string> = { ask: '事事奏請', normal: '常例自專', free: '便宜行事' };
export const FACTION_NAME: Record<FactionId, string> = { yan: '閹黨', qing: '清流', zhe: '齊楚浙', xun: '勳戚' };
export const FACTION_COLOR: Record<FactionId, string> = { yan: '#6b3a7a', qing: '#2f6d5a', zhe: '#b0842b', xun: '#9b2d22' };
export const FACTIONS: FactionId[] = ['yan', 'qing', 'zhe', 'xun'];

export interface PostDef {
  id: CharId;
  name: string;
  seats: number;
  kind: Character['kind'];
  rank: number;
  region: RegionId;
  /** 可設授權 */
  delegable: boolean;
}

/** 京中與督師職位（各地長官另由 gov:地區 表示） */
export const CAPITAL_POSTS: PostDef[] = [
  { id: 'shoufu', name: '首輔', seats: 10, kind: 'civil', rank: 1, region: 'jingshi', delegable: true },
  { id: 'cifu', name: '次輔', seats: 5, kind: 'civil', rank: 1, region: 'jingshi', delegable: false },
  { id: 'silijian', name: '司禮監掌印', seats: 8, kind: 'eunuch', rank: 1, region: 'jingshi', delegable: false },
  { id: 'dongchang', name: '東廠提督', seats: 4, kind: 'eunuch', rank: 2, region: 'jingshi', delegable: false },
  { id: 'jinyiwei', name: '錦衣衛指揮使', seats: 3, kind: 'military', rank: 2, region: 'jingshi', delegable: false },
  { id: 'jingying', name: '京營提督', seats: 3, kind: 'military', rank: 1, region: 'jingshi', delegable: true },
  { id: 'hubu', name: '戶部尚書', seats: 4, kind: 'civil', rank: 1, region: 'jingshi', delegable: true },
  { id: 'bingbu', name: '兵部尚書', seats: 4, kind: 'civil', rank: 1, region: 'jingshi', delegable: true },
  { id: 'libu', name: '吏部尚書', seats: 4, kind: 'civil', rank: 1, region: 'jingshi', delegable: true },
  { id: 'rites', name: '禮部尚書', seats: 4, kind: 'civil', rank: 1, region: 'jingshi', delegable: true },
  { id: 'gongbu', name: '工部尚書', seats: 4, kind: 'civil', rank: 1, region: 'jingshi', delegable: true },
  { id: 'xingbu', name: '刑部尚書', seats: 4, kind: 'civil', rank: 1, region: 'jingshi', delegable: true },
  { id: 'yushi', name: '左都御史', seats: 4, kind: 'civil', rank: 2, region: 'jingshi', delegable: false },
  { id: 'jinglue', name: '遼東經略', seats: 4, kind: 'military', rank: 1, region: 'liaodong', delegable: true },
  { id: 'sanbian', name: '三邊總督', seats: 4, kind: 'military', rank: 1, region: 'shaanxi', delegable: true },
  { id: 'dongjiang', name: '東江總兵', seats: 2, kind: 'military', rank: 2, region: 'chaoxian', delegable: true },
];

export function postOf(state: GameState, id: CharId): PostDef | null {
  const p = CAPITAL_POSTS.find((x) => x.id === id);
  if (p) return p;
  if (id.startsWith('gov:')) {
    const r = id.slice(4) as RegionId;
    return { id, name: REGIONS[r].gov, seats: 2, kind: REGIONS[r].kind === 'border' ? 'military' : 'civil', rank: 1, region: r, delegable: true };
  }
  return null;
}

export function allPosts(state: GameState): CharId[] {
  return [...CAPITAL_POSTS.map((p) => p.id), ...Object.keys(state.chars).filter((k) => k.startsWith('gov:'))].filter((k) => state.chars[k]);
}

export function seatsOf(id: CharId): number {
  return CAPITAL_POSTS.find((p) => p.id === id)?.seats ?? (id.startsWith('gov:') ? 2 : 0);
}

// ───────────────────────── 能力評語 ─────────────────────────

export interface AbilReport {
  abil: Abilities;
  source: string;
  certified: boolean;
  turn: number;
}

/** 吏部考語：±1 級的偏差；吏治越壞，貪官越被說成幹練 */
export function abilReport(state: GameState, id: CharId): AbilReport {
  const c = state.chars[id];
  const known = state.intel[id];
  if (known?.abil) return { abil: { ...known.abil }, source: '東廠確查', certified: true, turn: known.turn };
  const h = hashSeed(`${state.seed}:${c.look}`);
  const w = state.world;
  const skew = (k: number) => ((h >> (k * 3)) % 3) - 1;
  const flatter = c.integrity < 0.4 && w.corruption > 50 ? 1 : 0;
  const a: Abilities = {
    mil: clamp(c.abil.mil + skew(0) + (c.traits.includes('怯戰') ? 1 : 0), 1, 5),
    gov: clamp(c.abil.gov + skew(1) + flatter, 1, 5),
    fin: clamp(c.abil.fin + skew(2) + flatter, 1, 5),
    wit: clamp(c.abil.wit + skew(3), 1, 5),
  };
  return { abil: a, source: '吏部考語', certified: false, turn: 0 };
}

export function abilText(n: number): string {
  return ABIL_TEXT[clamp(Math.round(n), 1, 5) - 1];
}

/** 忠誠的外在神色（線索，不是數字） */
export function demeanor(c: Character): string {
  if (c.loyalty >= 80) return '恭謹勤勉';
  if (c.loyalty >= 60) return '奉職如常';
  if (c.loyalty >= 40) return '神色淡漠';
  if (c.loyalty >= 25) return '頗有怨色';
  return '言語閃爍';
}

// ───────────────────────── 人才池與任免 ─────────────────────────

/** 在野與候補官員 */
export function reserves(state: GameState): Character[] {
  return Object.values(state.chars).filter((c) => c.id.startsWith('res:') && c.status !== 'dead');
}

export function makeReserve(state: GameState, kind: Character['kind'], faction: FactionId | null): Character {
  const n = Object.keys(state.chars).filter((k) => k.startsWith('res:')).length + 1;
  const c = makeChar(state, `res:${n}`, kind === 'military' ? '候補將官' : kind === 'eunuch' ? '內官' : '候補京堂', 'jingshi', kind, 2, { faction });
  c.status = 'away';
  return c;
}

/** 吏部會推三人（加上皇帝可以特簡任何在野者） */
export function candidates(state: GameState, post: CharId): Character[] {
  const p = postOf(state, post);
  if (!p) return [];
  const want = p.kind === 'eunuch' ? 'eunuch' : p.kind === 'military' ? 'military' : 'civil';
  const pool = reserves(state).filter((c) => c.kind === want && c.status === 'away');
  // 吏部尚書依本派利益排序
  const libu = state.chars.libu;
  const score = (c: Character) => (c.faction && c.faction === libu.faction ? 2 : 0) + c.fame / 50 + (hashSeed(c.id + state.turn) % 7) / 10;
  return pool.sort((a, b) => score(b) - score(a)).slice(0, 3);
}

/** 交換：新人入職、原任者入在野名冊（可以起復） */
export function appoint(state: GameState, post: CharId, resId: CharId): string | null {
  const p = postOf(state, post);
  const cur = state.chars[post];
  const nw = state.chars[resId];
  if (!p || !cur || !nw) return '無此人。';
  const oldCopy: Character = { ...cur, id: resId, title: cur.kind === 'military' ? '去職將官' : cur.kind === 'eunuch' ? '閒住內官' : '在籍官員', status: 'away', authority: 'normal' };
  const newCopy: Character = { ...nw, id: post, title: p.name, region: p.region, status: 'active', term: cur.term + 1, rank: p.rank, authority: 'normal' };
  state.chars[post] = newCopy;
  state.chars[resId] = oldCopy;
  const ib = state.intel[resId];
  const ia = state.intel[post];
  if (ib) state.intel[post] = ib;
  else delete state.intel[post];
  if (ia) state.intel[resId] = ia;
  else delete state.intel[resId];
  return null;
}

export function setAuthority(state: GameState, id: CharId, a: Authority): string | null {
  const c = state.chars[id];
  const p = postOf(state, id);
  if (!c || !p) return '無此職。';
  if (!p.delegable) return `${p.name}無可授權之事。`;
  const changed = state.log.filter((l) => l.turn === state.turn && l.text.startsWith('授權：')).length;
  if (changed >= 3) return '每旬最多變更三個職位的授權。';
  c.authority = a;
  state.log.push({ turn: state.turn, text: `授權：${p.name}${c.name}「${AUTH_TEXT[a]}」` });
  return null;
}

// ───────────────────────── 大臣自行處分 ─────────────────────────

/** 各種政務的主管 */
export function taskOwner(state: GameState, doc: Doc): CharId | null {
  const id = doc.task?.id ?? '';
  const map: Record<string, CharId> = {
    tax: 'hubu',
    border: 'bingbu',
    disaster: 'hubu',
    jingcha: 'libu',
    drill: 'jingying',
    ceremony: 'rites',
    palace: 'hubu',
    revenue: 'hubu',
    canal: 'gongbu',
    vacancy: 'libu',
    grain: 'hubu',
    'for:tribute': 'rites',
    'for:rude': 'rites',
    'for:defector': 'bingbu',
    'for:market': 'bingbu',
    'for:jurchen': 'bingbu',
    'for:annan': 'rites',
    'pal:festival': 'rites',
    'pal:assize': 'xingbu',
    'pal:omen': 'rites',
    'pal:fire': 'gongbu',
    'pal:quake': 'gongbu',
    'pal:plague': 'hubu',
    'pal:theft': 'xingbu',
    'pal:compile': 'rites',
    'pal:clan': 'rites',
    'pal:review': 'jingying',
    'pal:cold': 'hubu',
    'pal:retire': 'libu',
  };
  if (map[id]) return map[id];
  if (id.startsWith('riot')) return `gov:${doc.task?.region ?? doc.region}`;
  if (id.startsWith('local')) return `gov:${doc.region}`;
  return null;
}

/** 各政務的重要度（1 例行、2 重要、3 大事） */
export function taskImportance(doc: Doc): number {
  const id = doc.task?.id ?? '';
  if (doc.importance) return doc.importance;
  if (['tax', 'border', 'revenue', 'jingcha', 'for:market', 'for:jurchen', 'for:annan', 'for:strike'].includes(id)) return 2;
  if (id.startsWith('pal:ill') || id.startsWith('edict:') || id.startsWith('ch:') || id.startsWith('harem:') || id.startsWith('eu:') || id === 'for:korea') return 3;
  if (id === 'disaster') return (Number(doc.task?.data?.severity ?? 0) >= 0.6 ? 2 : 1);
  if (id.startsWith('dil:') || id.startsWith('tw:') || id.startsWith('dw:') || id.startsWith('lit:') || id.startsWith('as:')) return 3;
  return 1;
}

const WAR = ['send', 'go', 'punish', 'scold', 'strict', 'recruit', 'train', 'full', 'clear', 'expel', 'refuse'];
const PEACE = ['open', 'grant', 'tolerate', 'invest', 'mediate', 'welcome', 'partial', 'accept'];
const HARSH = ['punish', 'strict', 'press', 'heavy', 'kill', 'expel', 'order', 'suppress'];
const LENIENT = ['soothe', 'remit', 'light', 'lenient', 'relief', 'amnesty', 'porridge', 'silver', 'granary'];

/** 大臣依傾向、私心與能力選一個辦法 */
export function delegateChoice(state: GameState, doc: Doc, by: CharId): { choice: string; why: string } {
  const c = state.chars[by];
  const t = doc.task!;
  const w = state.world;
  let best = t.recommend ?? t.fallback;
  let bestScore = -99;
  let why = '依票擬';
  for (const ch of t.choices) {
    if ((ch.silver ?? 0) > w.treasury || (ch.privy ?? 0) > w.privy || (ch.grain ?? 0) > w.grain) continue;
    if (ch.energy) continue;
    let s = ch.id === t.recommend ? 1.2 + c.abil.gov * 0.25 : 0;
    let reason = ch.id === t.recommend ? '依票擬' : '';
    if ((c.stance === 'war' && WAR.includes(ch.id)) || (c.stance === 'peace' && PEACE.includes(ch.id))) {
      s += 1.5;
      reason = `${STANCE_TEXT[c.stance]}之見`;
    }
    if ((c.temper === 'harsh' && HARSH.includes(ch.id)) || (c.temper === 'lenient' && LENIENT.includes(ch.id))) {
      s += 1;
      reason ||= `${TEMPER_TEXT[c.temper]}之性`;
    }
    if ((ch.silver ?? 0) >= 10 && c.integrity < 0.45) {
      s += (0.5 - c.integrity) * 4;
      reason = '其中有利可圖';
    }
    if (ch.odds !== undefined && c.stance !== 'war') s -= 1;
    s += (hashSeed(`${state.seed}:${doc.id}:${ch.id}`) % 10) / 40;
    if (s > bestScore) {
      bestScore = s;
      best = ch.id;
      why = reason || '照例辦理';
    }
  }
  return { choice: best, why };
}

/** 依授權決定這件政務是否由大臣自行處分 */
export function shouldDelegate(state: GameState, doc: Doc): CharId | null {
  if (!doc.task || doc.free || doc.task.chosen) return null;
  const by = taskOwner(state, doc);
  if (!by || !state.chars[by] || state.chars[by].status !== 'active') return null;
  const imp = taskImportance(doc);
  const a = state.chars[by].authority;
  if (imp >= 3) return null;
  if (a === 'ask') return null;
  if (a === 'normal' && imp >= 2) return null;
  return by;
}

/** 每旬：授權對忠誠與野心的影響 */
export function peopleTick(state: GameState): void {
  for (const id of allPosts(state)) {
    const c = state.chars[id];
    if (c.status !== 'active') continue;
    if (c.authority === 'ask') c.loyalty = clamp(c.loyalty - 0.4, 0, 100);
    if (c.authority === 'free') c.ambition = clamp(c.ambition + (c.traits.includes('擁兵自重') ? 2 : 1), 0, 100);
    if (c.traits.includes('擁兵自重') && c.authority !== 'free') c.ambition = clamp(c.ambition + 0.3, 0, 100);
    // 忠誠緩慢回歸，恩寵與冷落見各模組
    c.loyalty = clamp(c.loyalty + (60 - c.loyalty) * 0.01, 0, 100);
  }
  for (const c of Object.values(state.chars)) if (c.status === 'active') c.age += 1 / 36;
}

/** 將官池：可以挑來帶兵的人 */
export function generals(state: GameState): Character[] {
  return Object.values(state.chars).filter((c) => (c.id.startsWith('gen:') || (c.id.startsWith('res:') && c.kind === 'military')) && c.status === 'away');
}

export function makeGeneral(state: GameState): Character {
  const n = Object.keys(state.chars).filter((k) => k.startsWith('gen:')).length + 1;
  const r = state.rng;
  const c = makeChar(state, `gen:${n}`, pick(r, ['副總兵', '參將', '遊擊將軍']), 'jingshi', 'military', 2, {
    faction: chance(r, 0.4) ? 'xun' : null,
    competence: range(r, 0.25, 0.95),
    ambition: int(r, 20, 80),
  });
  c.status = 'away';
  return c;
}

export function charName(state: GameState, id: CharId | undefined): string {
  if (!id) return '';
  const c = state.chars[id];
  return c ? `${c.title}${c.name}` : '';
}

export function regionGov(state: GameState, r: RegionId): string {
  return REGIONS[r].kind === 'outer' ? regionName(r) : charName(state, `gov:${r}`);
}

export function tagsOf(ch: Choice): string[] {
  const t: string[] = [];
  if (WAR.includes(ch.id)) t.push('戰');
  if (PEACE.includes(ch.id)) t.push('和');
  if (HARSH.includes(ch.id)) t.push('嚴');
  if (LENIENT.includes(ch.id)) t.push('寬');
  return t;
}
