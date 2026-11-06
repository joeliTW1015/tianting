// 兵事：兵種、官軍（駐軍、京營、出征部隊）與叛軍、流寇、外藩、海寇的移動與交戰。
// 交戰：雙方方略卡 → 接戰、鏖戰、決勝三階段 → 結果；每場都留下戰鬥紀錄（真實與據報），戰報送到京師時播放動畫。

import { claim, core, draft, post, registerBlocker } from './docs';
import { ADJ, BORDERS, edgeTurns, findPath, isSea, OUTER, REGIONS, regionName } from './geography';
import { generals, makeGeneral } from './people';
import { chance, int, noisy, pick, range } from './rng';
import { addStatus, fx } from './statuses';
import type { Army, ArmySide, BattleRecord, BattleSide, CharId, GameState, RegionId } from './types';
import { addMood, addPrestige, addUnrest, clamp, event, troops } from './util';

// ───────────────────────── 兵種 ─────────────────────────

export interface UnitDef {
  name: string;
  power: number;
  /** 野戰（平原、草原）加成 */
  field?: number;
  /** 守城加成 */
  siege?: number;
  /** 山地加成 */
  mountain?: number;
  /** 對海寇 */
  vsPirate?: number;
  /** 餉（萬兩／萬人／旬） */
  pay: number;
  crown?: boolean;
}

export const UNITS: Record<string, UnitDef> = {
  jingying: { name: '京營', power: 0.6, pay: 1.2, crown: true },
  weisuo: { name: '衛所兵', power: 0.5, pay: 0.4, crown: true },
  mubing: { name: '募兵', power: 0.8, pay: 0.8, crown: true },
  qin: { name: '秦兵', power: 1.1, field: 0.2, pay: 0.9, crown: true },
  liao: { name: '遼兵', power: 1.0, siege: 0.3, pay: 1.0, crown: true },
  guanning: { name: '關寧鐵騎', power: 1.5, field: 0.3, pay: 2.0, crown: true },
  baigan: { name: '白桿兵', power: 1.3, mountain: 0.3, pay: 0.9, crown: true },
  zhe: { name: '浙兵', power: 1.2, siege: 0.2, vsPirate: 0.3, pay: 1.0, crown: true },
  lang: { name: '狼兵', power: 1.2, mountain: 0.3, pay: 0.7, crown: true },
  huoqi: { name: '火器營', power: 1.3, siege: 0.3, pay: 1.5, crown: true },
  shuishi: { name: '水師', power: 1.2, vsPirate: 0.3, pay: 1.2, crown: true },
  jiading: { name: '家丁', power: 1.6, pay: 2.0, crown: true },
  baqi: { name: '八旗', power: 1.5, field: 0.3, pay: 0 },
  menggu: { name: '蒙古騎', power: 1.2, field: 0.2, pay: 0 },
  liukou: { name: '流寇', power: 0.6, pay: 0 },
  rebel: { name: '叛軍', power: 0.9, pay: 0 },
  haishang: { name: '海商水師', power: 1.3, pay: 0 },
  hongmao: { name: '紅毛', power: 1.8, siege: 0.4, pay: 0 },
  wo: { name: '倭寇', power: 1.0, pay: 0 },
  tusi: { name: '土司兵', power: 1.2, mountain: 0.3, pay: 0 },
  annan: { name: '安南兵', power: 0.9, mountain: 0.2, pay: 0 },
  mian: { name: '緬兵', power: 1.0, mountain: 0.2, pay: 0 },
  chaoxian: { name: '朝鮮兵', power: 0.8, pay: 0 },
};

const SIDE_UNIT: Record<ArmySide, string> = { rebel: 'rebel', invader: 'menggu', pirate: 'haishang', bandit: 'liukou', crown: 'mubing' };
const EVASION: Record<ArmySide, number> = { rebel: 0.8, invader: 1, pirate: 0.35, bandit: 0.5, crown: 1 };

// ───────────────────────── 方略卡 ─────────────────────────

export interface CardDef {
  id: string;
  name: string;
  desc: string;
  /** 剋 */
  beats: string[];
  /** 三階段倍率 */
  mult: [number, number, number];
  crown: boolean;
}

export const CARDS: Record<string, CardDef> = {
  line: { id: 'line', name: '列陣決戰', desc: '兵多勢眾時正面決戰。剋誘敵，怕夜襲。', beats: ['ambush'], mult: [1, 1.2, 1], crown: true },
  hold: { id: 'hold', name: '堅壁固守', desc: '我軍傷亡少四成，拖延戰局。剋列陣、夜襲、衝陣，怕斷糧。', beats: ['line', 'night', 'charge'], mult: [1, 1, 1], crown: true },
  night: { id: 'night', name: '夜襲', desc: '接戰時大增戰力；失手則士氣受挫。剋列陣，怕固守。', beats: ['line'], mult: [1.5, 1, 1], crown: true },
  ambush: { id: 'ambush', name: '誘敵伏擊', desc: '山地最宜，決勝時倍增。剋騎兵衝陣，怕列陣、斥候。', beats: ['charge'], mult: [1, 1, 1.6], crown: true },
  cut: { id: 'cut', name: '斷其糧道', desc: '不求速戰：敵軍此後三旬士氣日減。剋固守，怕速戰。', beats: ['hold'], mult: [0.6, 0.6, 0.6], crown: true },
  allin: { id: 'allin', name: '孤注一擲', desc: '全軍壓上，戰力大增；勝則大捷，敗則大潰，主將陣亡的機會三倍。', beats: [], mult: [1.6, 1.6, 1.6], crown: true },
  surrender: { id: 'surrender', name: '招降', desc: '對流寇、叛軍、土司：不戰而招之。成敗看我軍聲勢與敵軍士氣；降者或許是詐降。', beats: [], mult: [1, 1, 1], crown: true },
  charge: { id: 'charge', name: '騎兵衝陣', desc: '騎兵衝陣。剋列陣，怕伏擊、固守。', beats: ['line', 'cut'], mult: [1.4, 1, 1], crown: false },
};

export const CROWN_CARDS = Object.values(CARDS).filter((c) => c.crown);

// ───────────────────────── 建軍 ─────────────────────────

registerBlocker((state, doc) => {
  const r = state.world.regions[doc.region];
  return !!r?.heldBy && typeof doc.from === 'string' && doc.from === `gov:${doc.region}`;
});

export interface SpawnOpts {
  caseId: string;
  label: string;
  side: Army['side'];
  size: number;
  region: RegionId;
  path?: RegionId[];
  growth?: number;
  moveIn?: number;
  evasion?: number;
  power?: string;
  leaveIn?: number;
  unit?: string;
}

export function spawnArmy(state: GameState, o: SpawnOpts): Army {
  const a: Army = {
    id: state.nextId++,
    caseId: o.caseId,
    label: o.label,
    side: o.side,
    size: o.size,
    unit: o.unit ?? (o.power ? powerUnit(o.power) : SIDE_UNIT[o.side]),
    morale: 70,
    region: o.region,
    path: o.path ?? [],
    nextMove: state.turn + (o.moveIn ?? 3),
    growth: o.growth ?? 1,
    evasion: o.evasion ?? EVASION[o.side],
    active: true,
    power: o.power,
    leaveTurn: o.leaveIn !== undefined ? state.turn + o.leaveIn : undefined,
  };
  state.world.armies.push(a);
  return a;
}

function powerUnit(power: string): string {
  return { jianzhou: 'baqi', chahar: 'menggu', khalkha: 'menggu', hami: 'menggu', haishang: 'haishang', hongmao: 'hongmao', mian: 'mian', annan: 'annan', chaoxian: 'chaoxian', tusi: 'tusi' }[power] ?? 'rebel';
}

/** 官軍出征部隊 */
export function raiseArmy(state: GameState, o: { region: RegionId; size: number; unit: string; label?: string; commander?: CharId; fromCapital?: boolean; caseId?: string; roll?: number }): Army {
  const cmd = o.commander ?? pickCommander(state);
  const a: Army = {
    id: state.nextId++,
    caseId: o.caseId ?? 'crown',
    label: o.label ?? `${UNITS[o.unit]?.name ?? '官軍'}`,
    side: 'crown',
    size: o.size,
    roll: o.roll ?? o.size,
    unit: o.unit,
    morale: 65,
    region: o.region,
    path: [],
    nextMove: state.turn + 1,
    growth: 1,
    evasion: 1,
    active: true,
    commander: cmd,
    mission: 'hold',
    raised: state.turn,
    fromCapital: o.fromCapital,
  };
  if (cmd && state.chars[cmd]) {
    const c = state.chars[cmd];
    if (c.id.startsWith('gen:') || c.id.startsWith('res:')) {
      c.status = 'active';
      c.region = o.region;
    }
  }
  state.world.armies.push(a);
  return a;
}

export function pickCommander(state: GameState): CharId {
  const pool = generals(state);
  const best = pool.sort((a, b) => b.abil.mil - a.abil.mil)[0] ?? makeGeneral(state);
  best.status = 'active';
  return best.id;
}

export function releaseCommander(state: GameState, a: Army): void {
  const c = a.commander ? state.chars[a.commander] : null;
  if (c && (c.id.startsWith('gen:') || c.id.startsWith('res:'))) c.status = 'away';
}

export function crownArmies(state: GameState): Army[] {
  return state.world.armies.filter((a) => a.active && a.side === 'crown');
}

export function hostileArmies(state: GameState): Army[] {
  return state.world.armies.filter((a) => a.active && a.side !== 'crown');
}

export function armiesOf(state: GameState, caseId: string): Army[] {
  return state.world.armies.filter((a) => a.active && a.caseId === caseId && a.side !== 'crown');
}

export function armySize(state: GameState, caseId: string): number {
  return armiesOf(state, caseId).reduce((n, a) => n + a.size, 0);
}

/** 派出京營：出發即扣兵，抵達後駐剿，敵退後班師 */
export function sendDetachment(state: GameState, region: RegionId, n: number, _travel?: number, _stay?: number): Army {
  const w = state.world;
  const cap = w.capital;
  const take = Math.min(n, Math.max(0, w.jingying - 5000));
  w.jingying -= take;
  const a = raiseArmy(state, { region: cap, size: take, unit: w.mods.firearms || w.buffs.firearms ? 'huoqi' : 'jingying', label: '京營出征', fromCapital: true, roll: take });
  marchTo(state, a, region, 'suppress');
  return a;
}

export function marchTo(state: GameState, a: Army, dest: RegionId, mission: Army['mission'] = 'hold'): string | null {
  const noSea = state.world.navy < Math.ceil(a.size / 50);
  const path = findPath(a.region, dest, noSea);
  if (a.region !== dest && !path.length) return noSea ? '水師不足，無法渡海。' : '無路可達。';
  a.path = path;
  a.dest = dest;
  a.mission = mission;
  a.nextMove = state.turn + (path.length ? edgeTurns(a.region, path[0], state.turn) : 0);
  return null;
}

/** 京營、各地駐軍與在地官軍的戰力（兵數當量） */
export function regionDefense(state: GameState, region: RegionId): number {
  const w = state.world;
  const r = w.regions[region];
  let d = 0;
  if (REGIONS[region].kind !== 'outer' && !r.heldBy) d += r.garrison * UNITS[REGIONS[region].gunit].power * (BORDERS.includes(region) ? r.morale : 0.8);
  if (region === w.capital) d += w.jingying * (w.jingyingDrilled ? 0.9 : 0.6) * w.jingyingMorale * (w.buffs.firearms ? 1.15 : 1);
  for (const a of crownArmies(state)) if (a.region === region) d += a.size * UNITS[a.unit].power * moraleMult(a.morale);
  const walls = 1 + (r.walls ?? 0) + (region === 'jingshi' && w.buffs.walls ? 0.25 : 0) + fx(state, 'defense');
  return d * walls;
}

export function fieldUpkeep(state: GameState): { silver: number; grain: number } {
  let silver = 0;
  let grain = 0;
  for (const a of crownArmies(state)) {
    if (a.caseId === 'dongjiang' || a.caseId === 'border-army') continue; // 邊兵之餉由邊餉支給
    silver += (a.size / 10000) * UNITS[a.unit].pay;
    grain += (a.size / 10000) * 0.6;
  }
  return { silver, grain };
}

/** 舊介面：出征在外的兵數 */
export function activeDetachments(state: GameState): number {
  return crownArmies(state).filter((a) => a.fromCapital).reduce((n, a) => n + a.size, 0);
}

// ───────────────────────── 戰力計算 ─────────────────────────

export const MORALE_TEXT = ['潰散在即', '軍心浮動', '尚可一戰', '士氣高昂', '銳不可當'];

export function moraleBand(m: number): number {
  return m >= 80 ? 4 : m >= 60 ? 3 : m >= 40 ? 2 : m >= 20 ? 1 : 0;
}

export function moraleMult(m: number): number {
  return [0.5, 0.7, 0.85, 1.0, 1.2][moraleBand(m)];
}

function leaderMult(state: GameState, id: CharId | undefined): number {
  const c = id ? state.chars[id] : null;
  return c ? [0.8, 0.9, 1.0, 1.15, 1.3][c.abil.mil - 1] : 1;
}

interface Group {
  n: number;
  unit: string;
}

function terrainMult(unit: string, region: RegionId, defending: boolean, foeSide?: ArmySide): number {
  const u = UNITS[unit];
  const t = REGIONS[region].terrain;
  let m = 1;
  if (u.field && (t === 'plain' || t === 'steppe')) m += u.field;
  if (u.mountain && t === 'mountain') m += u.mountain;
  if (u.siege && defending && REGIONS[region].kind !== 'outer') m += u.siege;
  if (u.vsPirate && foeSide === 'pirate') m += u.vsPirate;
  return m;
}

function powerOf(groups: Group[], region: RegionId, defending: boolean, foeSide?: ArmySide): number {
  return groups.reduce((s, g) => s + g.n * UNITS[g.unit].power * terrainMult(g.unit, region, defending, foeSide), 0);
}

/** 依據報敵情估計勝算（供介面顯示） */
export function estimateOdds(ours: number, foeReported: number, card = 'line'): number {
  if (foeReported <= 0) return 0.9;
  let r = ours / foeReported;
  if (card === 'allin') r *= 1.6;
  if (card === 'hold') r *= 1.3;
  const p = (r * r) / (r * r + 1);
  return clamp(card === 'allin' ? p * 0.95 : p, 0.03, 0.97);
}

/** 我軍在某地可戰的兵力（戰力當量），供估計 */
export function crownPowerAt(state: GameState, region: RegionId): number {
  return regionDefense(state, region);
}

// ───────────────────────── 每旬 ─────────────────────────

export function warTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;

  for (const r of Object.keys(w.regions) as RegionId[]) w.regions[r].occupied = false;

  moveCrown(state);
  if (state.over) return;

  // 敵軍：退走、成長、進犯
  for (const a of hostileArmies(state)) {
    if (a.leaveTurn !== undefined && t >= a.leaveTurn) {
      a.active = false;
      a.fate = 'left';
      if (REGIONS[a.region].kind !== 'outer') addUnrest(state, a.region, 8);
      event(state, a.caseId, `${a.label}在${regionName(a.region)}飽掠而去。`, true);
      continue;
    }
    const g = a.size > 60000 ? 1 + (a.growth - 1) * 0.25 : a.size > 30000 ? 1 + (a.growth - 1) * 0.5 : a.growth;
    a.size *= g * range(state.rng, 0.97, 1.03);
    const here = w.regions[a.region];
    if (here.unrest > 70 && (a.side === 'bandit' || a.side === 'rebel')) a.size *= 1.04;
    if (a.starveUntil && t < a.starveUntil) a.morale = clamp(a.morale - 8, 0, 100);
    else a.morale = clamp(a.morale + (70 - a.morale) * 0.1, 0, 100);
  }

  // 交戰：每地一場
  const regions = new Set<RegionId>(hostileArmies(state).map((a) => a.region));
  for (const r of crownArmies(state)) if (REGIONS[r.region].kind === 'outer') regions.add(r.region);
  for (const region of regions) {
    battleAt(state, region);
    if (state.over) return;
  }

  // 敵軍進犯下一站
  for (const a of hostileArmies(state)) {
    if (!a.path.length || t < a.nextMove) continue;
    const target = a.path[0];
    const tdef = regionDefense(state, target);
    const power = a.size * UNITS[a.unit].power * moraleMult(a.morale);
    const need = target === w.capital ? 1.6 : 1.25;
    if (power > tdef * need || tdef < 500) {
      if (target === w.capital) {
        // 兵臨城下：京師戒嚴，圍城戰在下一旬開打
        a.region = target;
        a.path = [];
        a.nextMove = t + 2;
        addMood(state, -10);
        addPrestige(state, -5);
        event(state, a.caseId, `${a.label}${troops(a.size)}兵臨${regionName(target)}城下，京師戒嚴。`, true);
        const d = draft('memorial', 'bingbu', target, a.caseId, `飛報：${a.label}兵臨城下`);
        d.fromLabel = '兵部';
        d.urgent = true;
        d.arriveTurn = t;
        core(d, `飛報：${a.label}約${troops(noisy(state.rng, a.size, 0.2))}已抵城下，九門戒嚴！乞速調各鎮勤王。`, `${a.label}兵臨城下`, '敵軍打到京城外了！下一旬就要攻城。可以調附近的部隊勤王、發內帑犒賞京營，或者——出奔南京（大計）。');
        post(state, d);
        continue;
      }
      a.region = target;
      a.path = a.path.slice(1);
      a.nextMove = t + 2;
      event(state, a.caseId, `${a.label}${troops(a.size)}攻入${regionName(target)}。`, true);
      addMood(state, -4);
      if (REGIONS[target].kind !== 'outer') fall(state, a, target);
    } else {
      a.size *= 0.92;
      a.nextMove = t + 2;
      event(state, a.caseId, `${a.label}進犯${regionName(target)}，官軍${troops(tdef)}據守，不得逞。`);
    }
  }

  // 收復：境內已無敵軍
  for (const id of Object.keys(w.regions) as RegionId[]) {
    const r = w.regions[id];
    if (!r.heldBy || REGIONS[id].kind === 'outer') continue;
    addUnrest(state, id, 3);
    const hostile = hostileArmies(state).some((a) => a.region === id);
    if (!hostile && t > (r.heldSince ?? t)) recover(state, id);
  }

  warlords(state);
  if (state.battles.length > 80) state.battles.splice(0, state.battles.length - 80);
}

/** 有授權的主將：鄰近本朝之地（或京師）有敵，自行馳援 */
function relief(state: GameState): void {
  const w = state.world;
  const foes = new Map<RegionId, number>();
  for (const a of hostileArmies(state)) if (REGIONS[a.region].kind !== 'outer') foes.set(a.region, (foes.get(a.region) ?? 0) + a.size);
  if (!foes.size) return;
  for (const a of crownArmies(state)) {
    if (a.path.length || a.side !== 'crown' || a.posture === 'hold') continue;
    const c = a.commander ? state.chars[a.commander] : null;
    if (!c || c.authority === 'ask') continue;
    if (foes.has(a.region)) continue;
    const capThreat = [...foes.keys()].some((r) => r === w.capital || ADJ[w.capital].includes(r));
    const near = ADJ[a.region].filter((r) => foes.has(r) && REGIONS[r].kind !== 'outer' && foes.get(r)! >= 3000);
    const border = a.caseId === 'border-army' || a.caseId === 'dongjiang';
    let dest: RegionId | null = null;
    if (border && !capThreat) continue;
    if (capThreat && (ADJ[a.region].includes(w.capital) || findPath(a.region, w.capital, true).length <= 2) && a.region !== w.capital) dest = foes.has(w.capital) ? w.capital : near[0] ?? w.capital;
    else if (near.length && c.stance !== 'peace' && (a.caseId !== 'dongjiang')) dest = near.sort((x, y) => foes.get(y)! - foes.get(x)!)[0];
    if (!dest) continue;
    marchTo(state, a, dest, 'suppress');
    event(state, 'crown', `${a.label}自${regionName(a.region)}馳援${regionName(dest)}。`);
  }
}

function moveCrown(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  relief(state);
  for (const a of crownArmies(state)) {
    // 補給：太倉見底則士氣日降
    if (w.grain < 0) a.morale = clamp(a.morale - 5, 0, 100);
    else a.morale = clamp(a.morale + (60 - a.morale) * 0.05, 0, 100);
    if (REGIONS[a.region].kind === 'outer' && w.regions[a.region].owner !== 'crown') a.size *= 0.98;
    // 京營出征：敵退三旬後班師
    if (a.fromCapital && a.mission === 'suppress' && !a.path.length) {
      const foe = hostileArmies(state).some((x) => x.region === a.region || ADJ[a.region].includes(x.region));
      const key = `quiet:${a.id}`;
      w.cooldown[key] = foe ? 0 : (w.cooldown[key] ?? 0) + 1;
      if (w.cooldown[key] >= 3) {
        delete w.cooldown[key];
        marchTo(state, a, w.capital, 'march');
        event(state, 'court', `${a.label}${troops(a.size)}自${regionName(a.region)}班師。`);
      }
    }
    if (!a.path.length || t < a.nextMove) continue;
    const next = a.path[0];
    if (isSea(a.region, next)) {
      if (w.navy < Math.ceil(a.size / 50)) {
        a.path = [];
        continue;
      }
      const winter = (t % 36) >= 30 || (t % 36) < 3;
      if (chance(state.rng, winter ? 0.2 : 0.1)) {
        const lost = a.size * range(state.rng, 0.1, 0.3);
        a.size -= lost;
        event(state, 'crown', `${a.label}渡海遇風，溺死${troops(lost)}。`, true);
      }
    }
    a.region = next;
    a.path = a.path.slice(1);
    if (a.path.length) a.nextMove = t + edgeTurns(a.region, a.path[0], t);
    else if (a.fromCapital && a.region === w.capital && a.mission === 'march') {
      w.jingying += a.size;
      a.active = false;
      releaseCommander(state, a);
      event(state, 'court', `${a.label}${troops(a.size)}回京歸營。`);
    }
  }
}

// ───────────────────────── 交戰 ─────────────────────────

interface Side {
  groups: Group[];
  armies: Army[];
  garrison: number;
  jingying: number;
  commander?: CharId;
  morale: number;
  card: string;
  label: string;
}

function crownSide(state: GameState, region: RegionId, _foeSide: ArmySide): Side | null {
  const w = state.world;
  const r = w.regions[region];
  const armies = crownArmies(state).filter((a) => a.region === region && !a.path.length);
  const groups: Group[] = [];
  let garrison = 0;
  let jingying = 0;
  if (REGIONS[region].kind !== 'outer' && !r.heldBy && r.garrison > 0) {
    garrison = r.garrison;
    groups.push({ n: r.garrison, unit: REGIONS[region].gunit });
  }
  if (region === w.capital && w.jingying > 0) {
    jingying = w.jingying;
    groups.push({ n: w.jingying, unit: w.jingyingDrilled ? 'huoqi' : 'jingying' });
  }
  for (const a of armies) groups.push({ n: a.size, unit: a.unit });
  if (!groups.length) return null;
  const lead = armies.slice().sort((a, b) => b.size - a.size)[0];
  const govId = `gov:${region}`;
  const commander = lead?.commander ?? (state.chars[govId]?.kind === 'military' ? govId : undefined);
  const total = groups.reduce((s, g) => s + g.n, 0);
  let morale = armies.reduce((s, a) => s + a.morale * a.size, 0);
  morale += (garrison + jingying) * (BORDERS.includes(region) ? r.morale * 70 : region === w.capital ? w.jingyingMorale * 60 : 55);
  morale /= Math.max(1, total);
  if (state.world.emperor.campaignArmy && armies.some((a) => a.id === state.world.emperor.campaignArmy)) morale = clamp(morale + 25, 0, 100);
  return { groups, armies, garrison, jingying, commander, morale, card: 'hold', label: lead ? lead.label : region === w.capital ? '京營' : `${regionName(region)}守軍` };
}

function chooseCrownCard(state: GameState, side: Side, foe: Side, region: RegionId, foeArmy: Army, notes: string[]): string {
  const lead = side.armies.slice().sort((a, b) => b.size - a.size)[0];
  const c = side.commander ? state.chars[side.commander] : null;
  if (!lead) return 'hold';
  const ourP = powerOf(side.groups, region, true);
  const foeP = powerOf(foe.groups, region, false);
  // 皇帝所授方略
  const st = lead.stratagem;
  if (st && state.turn >= st.from) {
    lead.stratagem = undefined;
    const changed = st.region !== region || Math.abs(foeArmy.size - st.foe) / Math.max(1, st.foe) > 0.3;
    if (changed && c && (c.loyalty < 50 || (c.authority === 'free' && c.ambition > 60))) {
      notes.push(`君命已過時，${c.name}不奉方略「${CARDS[st.card].name}」，自行其是`);
    } else {
      if (changed) notes.push(`戰況已變，${c?.name ?? '主將'}仍奉旨用「${CARDS[st.card].name}」`);
      return st.card;
    }
  }
  if (!c) return 'hold';
  const ratio = (ourP / Math.max(1, foeP)) * range(state.rng, 1 - 0.1 * (6 - c.abil.wit), 1 + 0.1 * (6 - c.abil.wit));
  const mountain = REGIONS[region].terrain === 'mountain';
  let card = 'hold';
  if (lead.posture === 'hold') return 'hold';
  if (c.authority === 'ask' && lead.posture !== 'attack') return ratio > 1.5 ? 'line' : 'hold';
  if (c.stance === 'war') card = ratio > 0.8 ? (c.abil.wit >= 3 && chance(state.rng, 0.4) ? 'night' : 'line') : c.ambition > 70 && chance(state.rng, 0.25) ? 'allin' : 'hold';
  else if (c.stance === 'steady') card = ratio > 1.3 ? (c.abil.wit >= 4 && mountain ? 'ambush' : 'line') : ratio < 0.8 && c.abil.wit >= 3 && REGIONS[region].kind !== 'outer' ? 'cut' : 'hold';
  else card = foeArmy.side === 'bandit' || foeArmy.side === 'rebel' ? 'surrender' : 'hold';
  if (c.traits.includes('怯戰') && card !== 'surrender') card = 'hold';
  if (lead.posture === 'attack' && card === 'hold') card = 'line';
  return card;
}

function chooseFoeCard(state: GameState, a: Army, ratio: number): string {
  if (a.leaveTurn !== undefined && state.turn >= a.leaveTurn - 1) return 'hold';
  if (a.unit === 'baqi' || a.unit === 'menggu') return ratio > 1 ? 'charge' : chance(state.rng, 0.3) ? 'night' : 'hold';
  if (a.side === 'bandit') return chance(state.rng, 0.35) ? 'ambush' : 'line';
  if (a.side === 'pirate') return chance(state.rng, 0.4) ? 'night' : 'line';
  if (a.unit === 'hongmao') return 'hold';
  return ratio > 1.2 ? 'line' : 'hold';
}

function battleAt(state: GameState, region: RegionId): void {
  const w = state.world;
  const t = state.turn;
  let foes = hostileArmies(state).filter((a) => a.region === region);
  // 境外：攻打該地勢力的本部
  let virtual: Army | null = null;
  if (!foes.length && REGIONS[region].kind === 'outer') {
    const owner = w.regions[region].owner;
    const ps = w.powers[owner];
    if (!ps || owner === 'crown' || !crownArmies(state).some((a) => a.region === region && !a.path.length)) return;
    if (ps.standing !== 'hostile') return;
    const home = ps.strength * (OUTER_HOME[owner] === region ? 0.6 : 0.35);
    if (home < 300) {
      occupy(state, region);
      return;
    }
    virtual = { id: -1, caseId: `foreign:${owner}`, label: `${POWER_LABEL[owner] ?? owner}本部`, side: 'invader', size: home, unit: powerUnit(owner), morale: 75, region, path: [], nextMove: 0, growth: 1, evasion: 1, active: true, power: owner };
    foes = [virtual];
  }
  if (!foes.length) return;
  const foeSideKind = foes[0].side;
  const us = crownSide(state, region, foeSideKind);
  if (!us) {
    // 無兵可守：直接陷落
    if (REGIONS[region].kind !== 'outer') {
      w.regions[region].occupied = true;
      if (!w.regions[region].heldBy && region !== w.capital) fall(state, foes[0], region);
    }
    return;
  }
  const main = foes.slice().sort((a, b) => b.size - a.size)[0];
  const them: Side = {
    groups: foes.map((a) => ({ n: a.size, unit: a.unit })),
    armies: foes,
    garrison: 0,
    jingying: 0,
    morale: foes.reduce((s, a) => s + a.morale * a.size, 0) / Math.max(1, foes.reduce((s, a) => s + a.size, 0)),
    card: 'line',
    label: main.label,
  };
  const notes: string[] = [];
  const hasField = us.armies.length > 0;
  us.card = hasField ? chooseCrownCard(state, us, them, region, main, notes) : 'hold';
  const ratio0 = powerOf(them.groups, region, false) / Math.max(1, powerOf(us.groups, region, true));
  them.card = chooseFoeCard(state, main, ratio0);

  const rec = resolve(state, region, us, them, notes);
  if (!rec) return;
  if (virtual) {
    const ps = w.powers[virtual.power!];
    const lost = virtual.size - Math.max(0, virtual.size * 0); // 損失已計入 virtual.size
    ps.strength = Math.max(0, ps.strength - (rec.theirs.before - rec.theirs.after));
    void lost;
    if (rec.result === '大捷' || rec.result === '小勝') {
      const key = `occ:${region}`;
      w.cooldown[key] = (w.cooldown[key] ?? 0) + 1;
      if (w.cooldown[key] >= 3) occupy(state, region);
    }
  }
  // 戰報：有官軍出征部隊參戰，或敵軍頗眾，才送塘報
  if (hasField || (rec.theirs.before >= 4000 && t % 2 === 0)) battleReport(state, rec, us);
}

function occupy(state: GameState, region: RegionId): void {
  const w = state.world;
  const r = w.regions[region];
  const old = r.owner;
  r.owner = 'crown';
  r.control = 20;
  delete w.cooldown[`occ:${region}`];
  addPrestige(state, 5);
  addMood(state, 8);
  event(state, `foreign:${old}`, `官軍克${regionName(region)}，其地內屬。`, true);
  const d = draft('memorial', 'bingbu', region, `foreign:${old}`, `${regionName(region)}捷報：其地平定`);
  d.fromLabel = `${regionName(region)}行營`;
  d.highlight = '開疆拓土';
  core(d, `捷報：王師克定${regionName(region)}，酋長遁走，其地悉平，請設官治理。`, `克定${regionName(region)}`, `${regionName(region)}被官軍佔領，納入版圖（控制度很低，要駐軍、安撫才穩）。`);
  post(state, d);
  const ps = w.powers[old];
  if (ps && !Object.values(w.regions).some((x) => x.owner === old)) {
    ps.standing = 'gone';
    event(state, `foreign:${old}`, `${POWER_LABEL[old] ?? old}滅亡。`, true);
  }
}

/** 三階段結算；回傳戰鬥紀錄 */
function resolve(state: GameState, region: RegionId, us: Side, them: Side, notes: string[]): BattleRecord | null {
  const w = state.world;
  const r = state.rng;
  const foeSide = them.armies[0].side;
  const usCard = CARDS[us.card];
  const themCard = CARDS[them.card];
  const usBefore = us.groups.reduce((s, g) => s + g.n, 0);
  const themBefore = them.groups.reduce((s, g) => s + g.n, 0);

  // 招降
  if (us.card === 'surrender') {
    const ratio = powerOf(us.groups, region, true) / Math.max(1, powerOf(them.groups, region, false));
    const p = clamp(0.15 + ratio * 0.25 + (60 - them.morale) / 150 + w.prestige / 400, 0.05, 0.85);
    if (chance(r, p)) {
      const main = them.armies[0];
      const join = Math.round(main.size * 0.5);
      for (const a of them.armies) {
        a.active = false;
        a.fate = 'destroyed';
      }
      const lead = us.armies[0];
      if (lead) lead.size += join;
      const feigned = chance(r, 0.3);
      if (feigned && lead) {
        // 詐降：十五旬內復叛
        w.cooldown[`feign:${region}:${main.caseId}`] = state.turn + int(r, 6, 15);
      }
      event(state, main.caseId, `${main.label}受撫於${regionName(region)}${feigned ? '（實為詐降）' : ''}。`, true);
      const rec = record(state, region, us, them, usBefore, themBefore, usBefore + join, 0, [{ name: '招撫', ourLoss: 0, theirLoss: themBefore, line: 0.8, note: `${main.label}受撫歸降，編入官軍` }], '招降', notes);
      addPrestige(state, 2);
      return rec;
    }
    notes.push('招降不成，敵乘隙來攻');
    us.card = 'hold';
    us.morale -= 10;
  }

  const phases: BattleRecord['phases'] = [];
  const names = ['接戰', '鏖戰', '決勝'];
  const coef = [0.05, 0.1, 0.15];
  const fieldBattle = us.armies.length > 0;
  const scale = fieldBattle ? 1 : 0.6;
  let usN = usBefore;
  let themN = themBefore;
  let usMor = us.morale;
  let themMor = them.morale;
  const counterUs = usCard.beats.includes(them.card) ? 1.25 : themCard.beats.includes(us.card) ? 0.8 : 1;
  const counterThem = themCard.beats.includes(us.card) ? 1.25 : usCard.beats.includes(them.card) ? 0.8 : 1;
  const usBase = powerOf(us.groups, region, true, foeSide) / Math.max(1, usBefore);
  const themBase = powerOf(them.groups, region, false) / Math.max(1, themBefore);
  const lead = leaderMult(state, us.commander);
  let line = 0.5;
  for (let i = 0; i < 3; i++) {
    let usP = usN * usBase * moraleMult(usMor) * lead * usCard.mult[i] * counterUs * range(r, 0.85, 1.15);
    let themP = themN * themBase * moraleMult(themMor) * themCard.mult[i] * counterThem * range(r, 0.85, 1.15);
    if (usMor < 20) usP *= 0.5;
    if (themMor < 20) themP *= 0.5;
    let usLoss = Math.min(usN * 0.6, ((coef[i] * themP) / Math.max(1, usP)) * usN * scale);
    let themLoss = Math.min(themN * 0.6, ((coef[i] * usP) / Math.max(1, themP)) * themN * scale * (them.armies[0].evasion ?? 1));
    if (us.card === 'hold') {
      usLoss *= 0.6;
      themLoss *= 0.8;
    }
    if (them.card === 'hold') {
      themLoss *= 0.6;
      usLoss *= 0.8;
    }
    usN -= usLoss;
    themN -= themLoss;
    const usFrac = usLoss / Math.max(1, usN + usLoss);
    const themFrac = themLoss / Math.max(1, themN + themLoss);
    if (usFrac > themFrac) {
      usMor -= 12;
      themMor += 4;
    } else {
      themMor -= 12;
      usMor += 4;
    }
    line = clamp(line + (themFrac - usFrac) * 3, 0.1, 0.9);
    phases.push({ name: names[i], ourLoss: Math.round(usLoss), theirLoss: Math.round(themLoss), line, note: phaseNote(i, us, them, usFrac, themFrac, region, usMor, themMor) });
  }
  if (us.card === 'cut') {
    for (const a of them.armies) a.starveUntil = state.turn + 3;
    phases[2].note = '我軍分兵斷其糧道，敵軍此後三旬乏食';
  }
  const ratio = (usN * usBase * moraleMult(usMor)) / Math.max(1, themN * themBase * moraleMult(themMor));
  let result = ratio >= 2 ? '大捷' : ratio >= 1.2 ? '小勝' : ratio >= 0.83 ? '相持' : ratio >= 0.5 ? '小挫' : '大潰';
  if (us.card === 'allin') result = ratio >= 1 ? '大捷' : '大潰';
  if (them.card === 'hold' && us.card === 'hold') result = ratio >= 1.2 ? '小勝' : ratio >= 0.83 ? '相持' : '小挫';

  // 追擊
  if (result === '大捷') themN *= 0.8;
  if (result === '大潰') usN *= 0.85;

  applyLosses(state, region, us, usBefore, Math.max(0, usN), clamp(usMor, 0, 100));
  for (const a of them.armies) {
    a.size = Math.max(0, (a.size * themN) / Math.max(1, themBefore));
    a.morale = clamp(themMor - (result === '大捷' ? 20 : 0), 0, 100);
  }
  // 敗者
  const fate = aftermath(state, region, us, them, result);
  const rec = record(state, region, us, them, usBefore, themBefore, usN, themN, phases, result, notes);
  rec.fate = fate;
  return rec;
}

function phaseNote(i: number, us: Side, them: Side, usFrac: number, themFrac: number, region: RegionId, usMor: number, themMor: number): string {
  const uc = CARDS[us.card];
  const tc = CARDS[them.card];
  if (i === 0) {
    if (uc.beats.includes(them.card)) return `我用「${uc.name}」，恰剋敵之「${tc.name}」`;
    if (tc.beats.includes(us.card)) return `敵用「${tc.name}」，剋我「${uc.name}」，我軍吃虧`;
    if (us.card === 'night') return themFrac > usFrac ? '夜襲得手，敵營大亂' : '夜襲為敵所覺，無功而返';
    if (them.card === 'charge') return usFrac > themFrac ? '敵騎衝陣，我軍陣腳動搖' : '敵騎衝陣受挫';
    return themFrac > usFrac ? '兩軍接戰，我軍稍佔上風' : '兩軍接戰，敵軍來勢甚猛';
  }
  if (i === 1) {
    const t = REGIONS[region].terrain;
    if (usMor < 20) return '我軍士氣崩潰，陣勢大亂';
    if (themMor < 20) return '敵軍士氣崩潰，漸不能支';
    if (t === 'mountain') return themFrac > usFrac ? '山地鏖戰，我軍熟悉地勢' : '山地崎嶇，我軍施展不開';
    if (us.card === 'hold') return '我軍據城固守，矢石如雨';
    return themFrac > usFrac ? '鏖戰竟日，敵軍死傷枕藉' : '鏖戰竟日，我軍傷亡甚重';
  }
  if (us.card === 'ambush' && themFrac > usFrac) return '伏兵四起，敵軍大潰';
  if (us.card === 'allin') return themFrac > usFrac ? '全軍壓上，一鼓破敵' : '孤注一擲，竟為敵所乘';
  return themFrac > usFrac * 1.5 ? '決勝之際，敵陣崩潰' : usFrac > themFrac * 1.5 ? '決勝之際，我軍不支' : '兩軍各自收兵';
}

function applyLosses(state: GameState, region: RegionId, us: Side, before: number, after: number, morale: number): void {
  const w = state.world;
  const k = after / Math.max(1, before);
  if (us.garrison) w.regions[region].garrison = Math.max(0, w.regions[region].garrison * k);
  if (us.jingying) w.jingying = Math.max(0, w.jingying * k);
  for (const a of us.armies) {
    a.size = Math.max(0, a.size * k);
    if (a.roll) a.roll = Math.max(a.size, a.roll * k);
    a.morale = morale;
  }
  if (BORDERS.includes(region) && us.garrison) w.regions[region].morale = clamp(w.regions[region].morale + (morale - 60) / 400, 0.3, 1.2);
}

function aftermath(state: GameState, region: RegionId, us: Side, them: Side, result: string): string | undefined {
  const w = state.world;
  let fate: string | undefined;
  const field = us.armies.length > 0;
  if (result === '大捷') {
    if (field) {
      addPrestige(state, 2);
      addMood(state, 4);
    }
    for (const a of them.armies) {
      if (a.size < 600) continue;
      if (a.leaveTurn !== undefined) a.leaveTurn = state.turn;
      else if (a.side === 'bandit') {
        const nb = ADJ[region].filter((x) => REGIONS[x].kind !== 'outer' && x !== w.capital);
        if (nb.length) {
          a.region = pick(state.rng, nb);
          a.path = findPath(a.region, w.capital, true);
          a.nextMove = state.turn + 3;
        }
      } else if (a.side === 'invader' && a.power) {
        a.leaveTurn = state.turn;
      }
    }
    if (field && us.armies.some((x) => x.id === w.emperor.campaignArmy)) addStatus(state, 'awe');
  }
  if (result === '大潰' && field) {
    addPrestige(state, -3);
    addMood(state, -5);
    const c = us.commander ? state.chars[us.commander] : null;
    const allin = us.card === 'allin' ? 3 : 1;
    if (c) {
      const x = state.rng;
      const defect = c.loyalty < 40 ? 0.15 : 0.05;
      if (chance(x, 0.2 * allin)) {
        fate = `主將${c.name}力戰陣亡`;
        killCommander(state, us);
      } else if (chance(x, 0.1)) {
        fate = `主將${c.name}被俘`;
        killCommander(state, us);
      } else if (chance(x, defect)) {
        fate = `主將${c.name}降敵`;
        killCommander(state, us);
      }
    }
    // 親征被俘
    if (w.emperor.campaignArmy && us.armies.some((a) => a.id === w.emperor.campaignArmy) && chance(state.rng, 0.3)) {
      event(state, 'court', `王師大潰於${regionName(region)}，天子北狩。`, true);
      state.over = { reason: 'captured', turn: state.turn };
      return '天子陷於敵陣';
    }
    for (const a of us.armies) {
      if (a.region === w.capital) continue;
      const back = findPath(a.region, w.capital, true);
      if (back.length) {
        a.path = [back[0]];
        a.nextMove = state.turn + 1;
        a.dest = back[0];
      }
    }
  }
  // 敵軍殲滅
  for (const a of them.armies) {
    if (a.id > 0 && a.size < 600 && a.active) {
      a.active = false;
      a.fate = 'destroyed';
      event(state, a.caseId, `${a.label}在${regionName(region)}被官軍擊潰。`, true);
      addMood(state, 4);
    }
  }
  // 我軍殲滅
  for (const a of us.armies) {
    if (a.size < 300 && a.active) {
      a.active = false;
      releaseCommander(state, a);
      event(state, 'crown', `${a.label}在${regionName(region)}全軍覆沒。`, true);
    }
  }
  // 地方陷落
  if (REGIONS[region].kind !== 'outer') {
    const foeP = them.armies.filter((a) => a.active).reduce((s, a) => s + a.size * UNITS[a.unit].power * moraleMult(a.morale), 0);
    const def = regionDefense(state, region);
    const need = region === w.capital ? 1.6 : 1.3;
    if (foeP > def * need && (region !== w.capital || result === '大潰' || result === '小挫')) {
      w.regions[region].occupied = true;
      if (region === w.capital) {
        event(state, them.armies[0].caseId, `${them.label}攻破${regionName(region)}。`, true);
        state.over = { reason: 'capital', turn: state.turn };
        return '京師城破';
      }
      if (!w.regions[region].heldBy) fall(state, them.armies[0], region);
    } else addUnrest(state, region, 2);
  }
  return fate;
}

function killCommander(state: GameState, us: Side): void {
  const id = us.commander;
  if (!id) return;
  const c = state.chars[id];
  if (id.startsWith('gen:') || id.startsWith('res:')) c.status = 'dead';
  else {
    // 現任督撫陣亡：由次官暫署
    c.competence = 0.4;
    c.abil = { mil: 2, gov: 2, fin: 2, wit: 2 };
    c.term += 1;
  }
  for (const a of us.armies) if (a.commander === id) a.commander = pickCommander(state);
}

function record(state: GameState, region: RegionId, us: Side, them: Side, usBefore: number, themBefore: number, usAfter: number, themAfter: number, phases: BattleRecord['phases'], result: string, notes: string[]): BattleRecord {
  const c = us.commander ? state.chars[us.commander] : null;
  const honest = !c || state.world.emperor.campaignArmy !== undefined && us.armies.some((a) => a.id === state.world.emperor.campaignArmy);
  const inflate = honest ? 1 : c && (c.integrity < 0.5 || c.loyalty < 50) ? range(state.rng, 1.5, 3) : range(state.rng, 1.1, 1.5);
  const shrink = honest ? 1 : c && c.integrity < 0.5 ? range(state.rng, 0.3, 0.6) : range(state.rng, 0.7, 1);
  const units = (gs: Group[], k: number) => {
    const m = new Map<string, number>();
    for (const g of gs) m.set(UNITS[g.unit].name, (m.get(UNITS[g.unit].name) ?? 0) + g.n * k);
    return [...m.entries()].map(([name, n]) => ({ name, n: Math.round(n) }));
  };
  const main = them.armies[0];
  const ourSide: BattleSide = { label: us.label, commander: c ? `${c.title}${c.name}` : undefined, look: c?.look, units: units(us.groups, 1), morale: MORALE_TEXT[moraleBand(us.morale)], card: CARDS[us.card].name, before: Math.round(usBefore), after: Math.round(usAfter) };
  const theirSide: BattleSide = { label: them.label, units: units(them.groups, 1), morale: MORALE_TEXT[moraleBand(them.morale)], card: CARDS[them.card].name, before: Math.round(themBefore), after: Math.round(themAfter) };
  const rec: BattleRecord = {
    id: state.nextId++,
    turn: state.turn,
    region,
    title: `${regionName(region)}之戰`,
    source: c ? `${c.title}${c.name}戰報` : `${regionName(region)}塘報`,
    ours: ourSide,
    theirs: theirSide,
    phases: phases.map((p) => ({ ...p, theirLoss: Math.round(p.theirLoss * inflate), ourLoss: Math.round(p.ourLoss * shrink) })),
    result,
    reported: { ourLoss: Math.round((usBefore - usAfter) * shrink), theirLoss: Math.round((themBefore - themAfter) * inflate) },
  };
  if (notes.length) rec.phases[0] = { ...rec.phases[0], note: `${notes.join('；')}。${rec.phases[0].note}` };
  // 真實紀錄（史書用）
  (rec as BattleRecord & { truth?: unknown }).truth = { ourLoss: Math.round(usBefore - usAfter), theirLoss: Math.round(themBefore - themAfter) };
  void main;
  state.battles.push(rec);
  state.stats.battles += 1;
  return rec;
}

function battleReport(state: GameState, rec: BattleRecord, us: Side): void {
  const region = rec.region;
  const d = draft('memorial', 'bingbu', region, us.armies[0]?.caseId === 'crown' ? 'war' : 'war', `${regionName(region)}塘報：${rec.result === '招降' ? '招降' : rec.result}`);
  d.fromLabel = rec.source;
  d.battleId = rec.id;
  if (rec.result === '大潰' || rec.result === '小挫') d.urgent = true;
  if (rec.result === '大捷' || rec.result === '招降') d.highlight = '捷　報';
  const heads = rec.reported.theirLoss;
  const lost = rec.reported.ourLoss;
  core(
    d,
    `${rec.source.replace('戰報', '')}奏：與${rec.theirs.label}戰於${regionName(region)}，我用「${rec.ours.card}」，${rec.result}。斬首${troops(Math.max(10, heads))}級，我軍傷亡${troops(Math.max(10, lost))}。${rec.fate ? rec.fate + '。' : ''}`,
    `${regionName(region)}${rec.result}：報斬首${troops(Math.max(10, heads))}，傷亡${troops(Math.max(10, lost))}`,
    `${regionName(region)}打了一仗：${rec.result}。前線報告殺敵 ${heads} 人、自己損失 ${lost} 人（戰報常誇大戰果、少報損失）。可點「觀戰」看戰況。`,
  );
  const truth = (rec as BattleRecord & { truth?: { ourLoss: number; theirLoss: number } }).truth!;
  claim(d, `heads.${region}`, '斬首', heads, truth.theirLoss, { unit: '級', tol: 0.4 });
  claim(d, `loss.${region}`, '我軍傷亡', lost, truth.ourLoss, { unit: '人', tol: 0.4 });
  const left = rec.theirs.after;
  if (left > 0) claim(d, `foe.${region}`, '境內敵軍', noisy(state.rng, left, 0.25), left, { unit: '人', tol: 0.4, fmt: troops });
  post(state, d);
}

/** 地方陷落 */
function fall(state: GameState, a: Army, region: RegionId): void {
  const r = state.world.regions[region];
  if (r.heldBy) return;
  r.heldBy = a.label;
  r.heldSince = state.turn;
  r.garrison = Math.round(r.garrison * 0.3);
  r.control = Math.max(0, r.control - 30);
  addPrestige(state, region === 'jingshi' ? -15 : -3);
  addMood(state, -4);
  event(state, a.caseId, `${regionName(region)}陷於${a.label}。`, true);
  const d = draft('memorial', 'bingbu', region, a.caseId, `${regionName(region)}塘報：城池失陷`);
  d.fromLabel = `${regionName(region)}塘報`;
  d.urgent = true;
  const seen = noisy(state.rng, a.size, 0.3);
  core(
    d,
    `飛報：${a.label}約${troops(seen)}突入${REGIONS[region].name}，攻陷城池，${REGIONS[region].gov}出奔，地方糜爛。乞速發援兵收復！`,
    `${regionName(region)}陷於${a.label}，乞援`,
    `緊急軍情：${regionName(region)}被${a.label}（約 ${Math.round(seen / 1000)} 千人）攻佔了。陷落期間該地不繳錢糧、也不會有地方奏報。要派兵把敵軍趕走或殲滅才能收復。`,
  );
  claim(d, `held.${region}`, '陷落', a.label, a.label);
  claim(d, `foe.${region}`, '境內敵軍', seen, a.size, { unit: '人', tol: 0.4, fmt: troops });
  post(state, d);
}

/** 收復 */
function recover(state: GameState, region: RegionId): void {
  const r = state.world.regions[region];
  const who = r.heldBy;
  r.heldBy = undefined;
  r.heldSince = undefined;
  addMood(state, 4);
  addPrestige(state, 2);
  event(state, 'routine', `${regionName(region)}收復（${who}已退）。`, true);
  const d = draft('memorial', 'bingbu', region, 'routine', `${regionName(region)}塘報：克復城池`);
  d.fromLabel = `${regionName(region)}塘報`;
  d.highlight = '捷　報';
  core(d, `捷報：${who}已退，官軍克復${REGIONS[region].name}城池，招集流亡，地方漸安。`, `克復${regionName(region)}`, `好消息：${regionName(region)}收復了。`);
  claim(d, `held.${region}`, '陷落', '已收復', '已收復');
  post(state, d);
}

/** 地方駐軍逐旬回補（無戰事時），向「名冊 × 實額率」回復 */
export function garrisonRecover(state: GameState): void {
  const w = state.world;
  for (const id of Object.keys(w.regions) as RegionId[]) {
    if (REGIONS[id].kind === 'outer') continue;
    const r = w.regions[id];
    const g = state.chars[`gov:${id}`];
    const rate = clamp(0.6 + (g?.integrity ?? 0.5) * 0.3 + (w.borderArrears < 1 ? 0.1 : 0) + (r.audited ? 0.1 : 0), 0.4, 1);
    const target = r.roll * rate;
    const fighting = hostileArmies(state).some((a) => a.region === id);
    if (!fighting && r.garrison < target) r.garrison = Math.min(target, r.garrison + r.roll * 0.03);
    if (r.garrison > target) r.garrison -= (r.garrison - target) * 0.05;
    if (BORDERS.includes(id)) r.morale = clamp(r.morale + (0.85 - r.morale) * 0.05 - (w.borderArrears >= 4 ? 0.02 : 0), 0.3, 1.2);
  }
}

// ───────────────────────── 軍閥自立、詐降復叛 ─────────────────────────

function warlords(state: GameState): void {
  const w = state.world;
  for (const a of crownArmies(state)) {
    const c = a.commander ? state.chars[a.commander] : null;
    if (!c || c.authority !== 'free' || c.ambition < 80 || a.size < 10000) continue;
    if (!(w.borderArrears >= 4 || w.prestige < 30)) continue;
    if (!chance(state.rng, 0.1)) continue;
    a.side = 'rebel';
    a.caseId = `warlord:${c.id}`;
    a.power = `warlord:${c.id}`;
    a.label = `${c.name}叛軍`;
    a.unit = a.unit === 'jingying' ? 'rebel' : a.unit;
    a.path = REGIONS[a.region].kind === 'outer' ? [] : findPath(a.region, w.capital, true);
    a.nextMove = state.turn + 4;
    c.status = 'rebel';
    addPrestige(state, -8);
    event(state, a.caseId, `${c.title}${c.name}擁兵${troops(a.size)}自立。`, true);
    const d = draft('memorial', 'bingbu', a.region, a.caseId, `飛報：${c.title}${c.name}擁兵自立`);
    d.fromLabel = '兵部';
    d.urgent = true;
    d.arriveTurn = state.turn + 1;
    core(d, `飛報：${c.title}${c.name}久握重兵，便宜行事，今竟據${regionName(a.region)}自立，不奉朝命！`, `${c.name}擁兵自立`, `你給了${c.name}「便宜行事」的大權，他野心膨脹，加上欠餉或朝望太低，終於帶著${Math.round(a.size / 1000)}千兵馬自立了。`);
    post(state, d);
  }
  // 詐降復叛
  for (const [k, v] of Object.entries(w.cooldown)) {
    if (!k.startsWith('feign:') || v !== state.turn) continue;
    const [, region, ...rest] = k.split(':');
    const caseId = rest.join(':');
    delete w.cooldown[k];
    const size = int(state.rng, 4000, 9000);
    spawnArmy(state, { caseId, label: '降眾復叛', side: 'bandit', size, region: region as RegionId, path: findPath(region as RegionId, w.capital, true), growth: 1.05, moveIn: 3 });
    for (const a of crownArmies(state)) if (a.region === region) a.size = Math.max(0, a.size - size * 0.5);
    event(state, caseId, `${regionName(region as RegionId)}降眾復叛。`, true);
  }
}

// 供 battleAt 使用：勢力的本部與名號（由 foreign.ts 設定，避免循環引用）
export const OUTER_HOME: Record<string, RegionId> = {};
export const POWER_LABEL: Record<string, string> = {};
export { OUTER };
