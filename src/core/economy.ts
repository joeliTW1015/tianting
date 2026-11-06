// 錢糧：各省實解、漕糧、鹽課、京營開銷、民心與朝望的漂移。

import { BORDERS, NORTH, OUTER, PROVINCES, REGION_ORDER, REGIONS } from './geography';
import { range } from './rng';
import { fx } from './statuses';
import type { GameState, RegionId } from './types';
import { addUnrest, clamp, gov } from './util';
import { fieldUpkeep } from './war';

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
  k *= Math.min(1, 0.5 + r.control / 120);
  k *= 1 + fx(state, 'tax');
  if (w.mods.surveyed) k *= 1.15;
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
    r.grainPaid = info.grain * Math.sqrt(k) * canal * range(rng, 0.9, 1.1);
    income += r.taxPaid;
    provinces += r.taxPaid;
    grainIn += r.grainPaid;
  }
  // 新附之地
  for (const id of OUTER) {
    const r = w.regions[id];
    if (r.owner !== 'crown' || !w.cooldown[`county:${id}`]) continue;
    const v = (id === 'taiwan' ? 1 : 0.6) * (r.control / 100);
    r.taxPaid = v;
    income += v;
    provinces += v;
  }
  // 台灣墾殖：十二旬後產糧
  for (let i = 1; i <= w.mods.settlers; i++) if (t - (w.cooldown[`settle:${i}`] ?? t) >= 12) grainIn += 1;
  const salt = 5 * w.mods.saltMod;
  income += salt;
  let trade = 2 + (w.mods.seaTrade ? 3 : 0) + (w.powers.haishang?.standing === 'annexed' ? 3 : 0) + (w.mods.hongmaoTrade ? 2 : 0);
  for (const [id, p] of Object.entries(w.powers)) if (p.trade && id !== 'hongmao') trade += id === 'jianzhou' || id === 'chahar' ? 2 : 1.5;
  income += trade;
  income += fx(state, 'treasury');

  // 內帑：皇莊、礦稅
  w.privy += 1;
  if (t < w.mods.mineTaxUntil) {
    w.privy += 4;
    addUnrest(state, 'shanxi', 1.5);
    addUnrest(state, 'henan', 1.5);
  }

  const up = fieldUpkeep(state);
  const routine = 12 + (w.mods.stipendCut ? 1.5 : 3) + (w.mods.postCut ? 1 : 2.5);
  const army = (w.jingyingRoll / 10000) * 1.2;
  const expense = routine + army + up.silver;
  const grainOut = (w.buffs.granary ? 3 : 3.5) + (w.jingying / 10000) * 1.2 + up.grain;

  w.treasury += income - expense;
  w.grain += grainIn - grainOut;
  w.last = { income, expense, salt, grainIn, grainOut };
  w.treasuryLog.push(Math.round(w.treasury));
  w.ledger.push({ turn: t, provinces, salt, trade, routine, army, field: up.silver, grainIn, grainOut, treasury: w.treasury, grain: w.grain, privy: w.privy });
  w.grainLog.push(Math.round(w.grain));

  // 京營士氣
  if (w.grain < 0 || w.treasury < 0) w.jingyingMorale = clamp(w.jingyingMorale - 0.08, 0.3, 1.2);
  else w.jingyingMorale = clamp(w.jingyingMorale + 0.03, 0.3, w.jingyingDrilled ? 1.1 : 1);

  // 吏治逐漸敗壞、朝望緩慢回歸；狀態
  w.corruption = clamp(w.corruption + 0.35, 0, 100);
  w.prestige = clamp(w.prestige + (50 - w.prestige) * 0.02 + fx(state, 'prestige'), 0, 100);
  w.speech = clamp(w.speech + (40 - w.speech) * 0.01 + fx(state, 'speech'), 0, 100);
  const g = fx(state, 'grievance');
  if (g) w.factions.qing.grievance = clamp(w.factions.qing.grievance + g, 0, 100);
  const loy = fx(state, 'loyalty');
  if (loy) for (const c of Object.values(state.chars)) if (c.status === 'active') c.loyalty = clamp(c.loyalty + loy, 0, 100);
  if (w.treasury < 0) w.prestige = clamp(w.prestige - 2, 0, 100);

  // 控制度
  for (const id of REGION_ORDER) {
    const r = w.regions[id];
    if (r.heldBy) continue;
    const target = w.capital === 'nanzhili' && NORTH.includes(id) ? 55 : 80;
    r.control = clamp(r.control + (target - r.control) * 0.03, 0, 100);
  }
  for (const id of OUTER) {
    const r = w.regions[id];
    if (r.owner !== 'crown') continue;
    const held = w.armies.some((a) => a.active && a.side === 'crown' && a.region === id);
    r.control = clamp(r.control + (held ? 0.6 : -0.2), 0, w.cooldown[`county:${id}`] ? 100 : 60);
  }
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
    if (PROVINCES.includes(id)) d += fx(state, 'unrest');
    if ((id === 'nanzhili' || id === 'zhejiang') && t < w.mods.surveyUntil) d += 0.5;
    r.unrest = clamp(r.unrest + d, 0, 100);
    if (r.disaster && t >= r.disaster.until) r.disaster = undefined;
  }
  // 京師米價
  if (w.grain < 30) addUnrest(state, 'jingshi', 4);

}
