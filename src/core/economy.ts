// 錢糧：各省實解、漕糧、鹽課、京營開銷、民心與朝望的漂移。

import { BORDERS, PROVINCES, REGIONS } from './geography';
import { range } from './rng';
import type { GameState, RegionId } from './types';
import { addUnrest, clamp, gov } from './util';
import { activeDetachments } from './war';

const POLICY = { light: 0.85, normal: 1, heavy: 1.2 } as const;

/** 某省本旬的實解倍率（不含案件與首府差異） */
export function collectionRate(state: GameState, region: RegionId): number {
  const w = state.world;
  const t = state.turn;
  const r = w.regions[region];
  if (r.occupied || r.heldBy) return 0;
  let k = POLICY[w.taxPolicy];
  k *= 1 - w.corruption / 250;
  k *= 1 - Math.max(0, r.unrest - 40) / 100;
  k *= 0.85 + w.prestige / 670;
  if (r.disaster && t < r.disaster.until) k *= 1 - r.disaster.severity * 0.5;
  if (t < r.remitUntil) k *= 0.3;
  else if (t < r.pressUntil) k *= 1.15;
  // 地方官截留
  const g = gov(state, region);
  if (g && g.integrity < 0.5) k *= 1 - (0.5 - g.integrity) * 0.5;
  return Math.max(0, k * r.caseTaxMod);
}

export function economyTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  const rng = state.rng;

  let income = 0;
  let provinces = 0;
  let grainIn = 0;
  for (const id of PROVINCES.concat('jingshi')) {
    const info = REGIONS[id];
    const r = w.regions[id];
    const k = collectionRate(state, id);
    r.taxPaid = info.tax * k * range(rng, 0.95, 1.05);
    const canal = (t < w.mods.canalBlockedUntil ? (w.buffs.canal ? 0.7 : 0.4) : 1) * (w.buffs.canal ? 1.12 : 1);
    r.grainPaid = info.grain * k * canal * range(rng, 0.9, 1.1);
    income += r.taxPaid;
    provinces += r.taxPaid;
    grainIn += r.grainPaid;
  }
  const salt = 6 * w.mods.saltMod;
  income += salt;
  const trade = (w.mods.seaTrade ? 3 : 0) + Object.values(w.powers).filter((p) => p.trade).length * 1.5;
  income += trade;

  // 內帑：皇莊、礦稅
  w.privy += 1;
  if (t < w.mods.mineTaxUntil) {
    w.privy += 4;
    addUnrest(state, 'shanxi', 1.5);
    addUnrest(state, 'henan', 1.5);
  }

  const field = activeDetachments(state);
  const routine = 14 + 2;
  const army = (w.jingying / 10000) * 1.2;
  const fieldCost = (field / 5000) * 1;
  const expense = routine + army + fieldCost;
  const grainOut = (w.buffs.granary ? 3 : 3.5) + (w.jingying / 10000) * 1.2 + (field / 5000) * 1;

  w.treasury += income - expense;
  w.grain += grainIn - grainOut;
  w.last = { income, expense, salt, grainIn, grainOut };
  w.treasuryLog.push(Math.round(w.treasury));
  w.ledger.push({ turn: t, provinces, salt, trade, routine, army, field: fieldCost, grainIn, grainOut, treasury: w.treasury, grain: w.grain, privy: w.privy });
  w.grainLog.push(Math.round(w.grain));

  // 京營士氣
  if (w.grain < 0 || w.treasury < 0) w.jingyingMorale = clamp(w.jingyingMorale - 0.08, 0.4, 1.1);
  else w.jingyingMorale = clamp(w.jingyingMorale + 0.03, 0.4, 1);

  // 吏治逐漸敗壞、朝望緩慢回歸
  w.corruption = clamp(w.corruption + 0.35, 0, 100);
  w.prestige = clamp(w.prestige + (50 - w.prestige) * 0.01, 0, 100);
}

/** 民心漂移（民變見 unrest.ts） */
export function unrestTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  for (const id of PROVINCES.concat('jingshi', ...BORDERS)) {
    const r = w.regions[id];
    let d = (20 - r.unrest) * 0.04;
    if (w.taxPolicy === 'heavy') d += 1;
    if (w.taxPolicy === 'light') d -= 0.5;
    if (t < r.pressUntil) d += 2;
    if (r.disaster && t < r.disaster.until) d += t < r.reliefUntil ? 0.5 : r.disaster.severity * 4;
    if (t < r.reliefUntil) d -= 2;
    r.unrest = clamp(r.unrest + d, 0, 100);
    if (r.disaster && t >= r.disaster.until) r.disaster = undefined;
  }
  // 京師米價
  if (w.grain < 30) addUnrest(state, 'jingshi', 4);

}
