// 兵事：叛軍、流寇、虜騎、海寇與官軍（各地駐軍、京營出征部隊）的交戰；地方陷落與收復；督師戰報。

import { claim, core, draft, post, registerBlocker } from './docs';
import { BORDERS, REGIONS, regionName } from './geography';
import { noisy, range } from './rng';
import type { Army, GameState, RegionId } from './types';
import { addMood, addPrestige, addUnrest, clamp, event, troops } from './util';

const SIDE_POWER: Record<Army['side'], number> = { rebel: 1, invader: 1.25, pirate: 0.9, bandit: 0.7 };
const EVASION: Record<Army['side'], number> = { rebel: 0.8, invader: 1, pirate: 0.35, bandit: 0.5 };

// 陷落之地，長官無從上奏
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
}

export function spawnArmy(state: GameState, o: SpawnOpts): Army {
  const a: Army = {
    id: state.nextId++,
    caseId: o.caseId,
    label: o.label,
    side: o.side,
    size: o.size,
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

export function armiesOf(state: GameState, caseId: string): Army[] {
  return state.world.armies.filter((a) => a.active && a.caseId === caseId);
}

export function armySize(state: GameState, caseId: string): number {
  return armiesOf(state, caseId).reduce((n, a) => n + a.size, 0);
}

/** 某地官軍的戰力 */
export function regionDefense(state: GameState, region: RegionId): number {
  const w = state.world;
  const r = w.regions[region];
  const fire = w.buffs.firearms ? 1.15 : 1;
  let d = r.garrison * (BORDERS.includes(region) ? r.morale : 0.6);
  if (region === 'jingshi') d += w.jingying * w.jingyingMorale * fire;
  for (const det of w.detachments) if (det.region === region && !det.returned && det.arriveTurn <= state.turn && state.turn < det.untilTurn) d += det.troops * fire;
  if (region === 'jingshi' && w.buffs.walls) d *= 1.25;
  return d;
}

function detachmentsAt(state: GameState, region: RegionId) {
  return state.world.detachments.filter((d) => d.region === region && !d.returned && d.arriveTurn <= state.turn && state.turn < d.untilTurn);
}

function damageDefenders(state: GameState, region: RegionId, loss: number): void {
  const w = state.world;
  for (const d of detachmentsAt(state, region)) {
    const take = Math.min(d.troops, loss * 0.6);
    d.troops -= take;
    loss -= take;
  }
  if (region === 'jingshi') {
    const take = Math.min(w.jingying, loss);
    w.jingying -= take;
    loss -= take;
  }
  const r = w.regions[region];
  r.garrison = Math.max(0, r.garrison - loss);
}

/** 派出京營：出發即扣兵，抵達後駐剿 stay 旬，再回京 */
export function sendDetachment(state: GameState, region: RegionId, n: number, travel: number, stay = 6): void {
  const w = state.world;
  w.detachments.push({
    id: state.nextId++,
    region,
    troops: n,
    arriveTurn: state.turn + travel,
    untilTurn: state.turn + travel + stay,
    homeTurn: state.turn + travel * 2 + stay,
    returned: false,
  });
}

export function activeDetachments(state: GameState): number {
  return state.world.detachments.filter((d) => !d.returned).reduce((n, d) => n + d.troops, 0);
}

/** 本旬各地的戰果（供督師戰報） */
interface BattleStat {
  enemy: string;
  enemySize: number;
  killed: number;
  lost: number;
}

export function warTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  const battles = new Map<RegionId, BattleStat>();

  for (const d of w.detachments) {
    if (!d.returned && t >= d.homeTurn) {
      d.returned = true;
      w.jingying += d.troops;
      event(state, 'court', `出征京營${troops(d.troops)}自${regionName(d.region)}班師。`);
    }
  }

  for (const r of Object.keys(w.regions) as RegionId[]) w.regions[r].occupied = false;

  for (const a of w.armies) {
    if (!a.active) continue;
    // 掠邊者飽掠而去
    if (a.leaveTurn !== undefined && t >= a.leaveTurn) {
      a.active = false;
      a.fate = 'left';
      addUnrest(state, a.region, 8);
      event(state, a.caseId, `${a.label}在${regionName(a.region)}飽掠而去。`, true);
      continue;
    }
    a.size *= a.growth * range(state.rng, 0.97, 1.03);
    const here = w.regions[a.region];
    if (here.unrest > 70 && (a.side === 'bandit' || a.side === 'rebel')) a.size *= 1.04;

    // 與當地官軍交戰
    const def = regionDefense(state, a.region);
    const power = a.size * SIDE_POWER[a.side];
    if (def > 0) {
      const aLoss = Math.min(a.size, def * range(state.rng, 0.18, 0.32) * (a.evasion ?? 1));
      const dLoss = power * range(state.rng, 0.05, 0.12);
      a.size = Math.max(0, a.size - aLoss);
      damageDefenders(state, a.region, dLoss);
      if (detachmentsAt(state, a.region).length) {
        const b = battles.get(a.region) ?? { enemy: a.label, enemySize: 0, killed: 0, lost: 0 };
        b.enemySize += a.size + aLoss;
        b.killed += aLoss;
        b.lost += dLoss;
        battles.set(a.region, b);
      }
    }
    if (a.size < 600) {
      a.active = false;
      a.fate = 'destroyed';
      event(state, a.caseId, `${a.label}在${regionName(a.region)}被官軍擊潰。`, true);
      addMood(state, 4);
      continue;
    }
    if (power > def * 1.3) {
      here.occupied = true;
      addUnrest(state, a.region, 5);
      if (!here.heldBy && a.region !== 'jingshi') fall(state, a, a.region);
    } else addUnrest(state, a.region, 2);

    // 進犯下一站
    if (a.path.length && t >= a.nextMove) {
      const target = a.path[0];
      const tdef = regionDefense(state, target);
      if (a.size * SIDE_POWER[a.side] > tdef * 1.25) {
        if (target === 'jingshi') {
          event(state, a.caseId, `${a.label}${troops(a.size)}兵臨京師，京營${troops(tdef)}不能禦，城破。`, true);
          state.over = { reason: 'capital', turn: t };
          return;
        }
        damageDefenders(state, target, a.size * 0.2);
        a.region = target;
        a.path = a.path.slice(1);
        a.nextMove = t + 2;
        event(state, a.caseId, `${a.label}${troops(a.size)}攻入${regionName(target)}。`, true);
        addMood(state, -5);
        fall(state, a, target);
      } else {
        a.size *= 0.85;
        damageDefenders(state, target, a.size * 0.08);
        a.nextMove = t + 2;
        event(state, a.caseId, `${a.label}進犯${regionName(target)}，官軍${troops(tdef)}據守，賊不得逞。`);
      }
    }
  }

  // 收復：境內已無敵軍
  for (const id of Object.keys(w.regions) as RegionId[]) {
    const r = w.regions[id];
    if (!r.heldBy) continue;
    addUnrest(state, id, 3);
    const hostile = w.armies.some((a) => a.active && a.region === id);
    if (!hostile && t > (r.heldSince ?? t)) recover(state, id);
  }

  // 督師戰報：每兩旬一報（會誇大斬獲、隱瞞損失）
  if (t % 2 === 0) for (const [region, b] of battles) battleReport(state, region, b);
}

/** 地方陷落 */
function fall(state: GameState, a: Army, region: RegionId): void {
  const r = state.world.regions[region];
  if (r.heldBy) return;
  r.heldBy = a.label;
  r.heldSince = state.turn;
  r.garrison = Math.round(r.garrison * 0.3);
  addPrestige(state, -3);
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
    `緊急軍情：${regionName(region)}被${a.label}（約 ${Math.round(seen / 1000)} 千人）攻佔了，當地長官逃走。陷落期間該地不繳錢糧、也不會有地方奏報。要派兵把敵軍趕走或殲滅才能收復。`,
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

function battleReport(state: GameState, region: RegionId, b: BattleStat): void {
  const r = state.rng;
  const inflate = range(r, 1.5, 3);
  const heads = Math.round((b.killed * inflate) / 10) * 10;
  const lostShown = Math.round((b.lost * range(r, 0.2, 0.5)) / 10) * 10;
  const d = draft('memorial', 'bingbu', region, 'routine', `${regionName(region)}督師奏報戰況`);
  d.fromLabel = `${regionName(region)}督師`;
  core(
    d,
    `臣督率京營與${b.enemy}連日接戰，斬首${troops(heads)}級，我軍傷亡${troops(Math.max(50, lostShown))}，賊勢已挫。`,
    `督師報斬首${troops(heads)}，傷亡${troops(Math.max(50, lostShown))}`,
    `前線指揮官報告：殺敵 ${heads} 人，自己只損失 ${Math.max(50, lostShown)} 人。（戰報向來誇大戰果、少報損失）`,
  );
  claim(d, `heads.${region}`, '斬首', heads, Math.round(b.killed), { unit: '級', tol: 0.4 });
  claim(d, `loss.${region}`, '我軍傷亡', Math.max(50, lostShown), Math.round(b.lost), { unit: '人', tol: 0.4 });
  const left = Math.max(0, b.enemySize - b.killed);
  claim(d, `foe.${region}`, '境內敵軍', noisy(r, left, 0.25), left, { unit: '人', tol: 0.4, fmt: troops });
  post(state, d);
}

/** 地方駐軍逐旬回補（無戰事時） */
export function garrisonRecover(state: GameState): void {
  const w = state.world;
  for (const id of Object.keys(w.regions) as RegionId[]) {
    const r = w.regions[id];
    const base = REGIONS[id].garrison;
    const fighting = w.armies.some((a) => a.active && a.region === id);
    if (!fighting && r.garrison < base) r.garrison = Math.min(base, r.garrison + base * 0.03);
    if (BORDERS.includes(id)) r.morale = clamp(r.morale + (0.85 - r.morale) * 0.05, 0.3, 1.2);
  }
}

