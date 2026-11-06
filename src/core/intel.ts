// 情報：勝算五級、東廠曝光、確實資訊。

import { core, draft, local, post } from './docs';
import { addGrievance } from './factions';
import { chance } from './rng';
import { addStatus } from './statuses';
import type { CharId, GameState } from './types';
import { addPrestige, clamp, event } from './util';

export const ODDS_TEXT = ['九死一生', '凶多吉少', '五五之數', '勝算頗高', '十拿九穩'];

export function oddsTier(p: number): number {
  return p >= 0.9 ? 4 : p >= 0.7 ? 3 : p >= 0.4 ? 2 : p >= 0.15 ? 1 : 0;
}

export function oddsText(p: number): string {
  return ODDS_TEXT[oddsTier(p)];
}

/** 擲籤：依勝算判定成敗，回傳籤等 */
export function drawLot(state: GameState, p: number): { ok: boolean; tier: number; label: string } {
  const ok = chance(state.rng, p);
  const tier = oddsTier(p);
  const label = ok ? (p < 0.4 ? '上上籤' : '上籤') : p >= 0.7 ? '下籤' : '下下籤';
  return { ok, tier, label };
}

/** 目標的位階：1 地方、2 尚書督師、3 內閣宗室、4 太后後宮 */
export function targetLevel(state: GameState, id: CharId | null): number {
  if (!id) return 1;
  if (id.startsWith('fei:') || id === 'dowager') return 4;
  if (['shoufu', 'cifu', 'silijian', 'uncle'].includes(id) || state.chars[id]?.kind === 'prince') return 3;
  if (['hubu', 'bingbu', 'libu', 'rites', 'gongbu', 'xingbu', 'yushi', 'jinglue', 'sanbian', 'jingying', 'jinyiwei', 'dongchang'].includes(id)) return 2;
  return 1;
}

/** 曝光機率 */
export function exposureRate(state: GameState, target: CharId | null, frame = false): number {
  const lv = targetLevel(state, target);
  const bonus = [0, 5, 15, 25, 30][lv];
  const f = target ? state.chars[target]?.faction : null;
  const cl = f ? state.world.factions[f] && cloutOf(state, f) : 0;
  const recent = state.orders.filter((o) => o.edict?.startsWith('dc') && o.target === target && state.turn - o.issuedTurn <= 9).length;
  const wit = state.chars.dongchang?.abil.wit ?? 3;
  let p = (10 + bonus + cl * 25 + recent * 10 - wit * 4) / 100;
  if (frame) p *= 1.5;
  return clamp(p, 0.03, 0.9);
}

function cloutOf(state: GameState, f: string): number {
  // 粗略：該派在職人數占比
  const all = Object.values(state.chars).filter((c) => c.status === 'active' && c.faction);
  return all.filter((c) => c.faction === f).length / Math.max(1, all.length);
}

/** 東廠行動曝光的後果（四級） */
export function exposed(state: GameState, target: CharId | null, frame = false): void {
  const lv = frame ? 4 : targetLevel(state, target);
  const c = target ? state.chars[target] : null;
  const who = c ? `${c.title}${c.name}` : '地方';
  state.stats.exposed += 1;
  const d = local(draft('memorial', 'yushi', 'jingshi', 'court', `言官劾廠衛橫行：番子偵伺${who}`), state);
  d.urgent = lv >= 3;
  d.importance = 2;
  if (lv === 1) {
    addPrestige(state, -3);
    if (c) c.loyalty = clamp(c.loyalty - 20, 0, 100);
  } else if (lv === 2) {
    addPrestige(state, -6);
    addGrievance(state, c?.faction, 15);
    if (c) c.loyalty = clamp(c.loyalty - 20, 0, 100);
  } else if (lv === 3) {
    addPrestige(state, -12);
    for (const f of ['yan', 'qing', 'zhe', 'xun'] as const) addGrievance(state, f, 8);
    state.world.speech = clamp(state.world.speech - 10, 0, 100);
    addStatus(state, 'terror');
  } else {
    addPrestige(state, -20);
    state.world.dowager = clamp(state.world.dowager - 30, 0, 100);
    addGrievance(state, 'qing', 25);
  }
  core(
    d,
    `臣等風聞：東廠番子${frame ? '羅織罪狀，誣陷' : '潛伺'}${who}，${lv >= 3 ? '朝野震駭，人人自危' : '物議沸騰'}。祖宗設廠，本為緝奸，豈容如此！`,
    `言官劾東廠${frame ? '羅織' : '偵伺'}${who}`,
    `東廠的行動被發現了（第${['一', '二', '三', '四'][lv - 1]}級後果）。${lv === 1 ? '朝望小降，被查的人心生怨恨。' : lv === 2 ? '朝望下降，被查者的派系怨望大增。' : lv === 3 ? '朝望大降、各派不安、言路收縮，「廠衛之禍」九旬。' : '朝望重挫，太后震怒，清流大譁。'}`,
  );
  post(state, d);
  event(state, 'court', `東廠${frame ? '羅織' : '偵伺'}${who}事洩。`, lv >= 3);
}

export function exposeRoll(state: GameState, target: CharId | null, frame = false): boolean {
  if (state.world.dongchang !== 'crown') return false;
  if (chance(state.rng, exposureRate(state, target, frame))) {
    exposed(state, target, frame);
    return true;
  }
  return false;
}

/** 密查某人：完全確實（東廠在天子手中時） */
export function probePerson(state: GameState, id: CharId): void {
  const c = state.chars[id];
  if (!c) return;
  const w = state.world;
  const sure = w.dongchang === 'crown';
  const d = local(draft('secret', 'dongchang', 'jingshi', 'court', `${sure ? '〔確〕' : ''}東廠密查・${c.title}${c.name}`), state);
  d.certified = sure;
  d.free = true;
  if (sure) {
    state.intel[id] = { abil: { ...c.abil }, integrity: c.integrity, loyalty: c.loyalty, faction: c.secretFaction ?? c.faction, collusion: c.status === 'rebel' ? 'rebel' : undefined, turn: state.turn };
    const loyal = c.loyalty >= 70 ? '忠心耿耿' : c.loyalty >= 45 ? '尚屬安分' : c.loyalty >= 25 ? '心懷怨望' : '包藏禍心';
    const clean = c.integrity >= 0.7 ? '廉潔' : c.integrity >= 0.45 ? '平常' : '貪墨';
    core(d, `〔確〕番子查得：${c.name}操守${clean}，於上${loyal}。${c.secretFaction ? `其實暗附${['閹黨', '清流', '齊楚浙', '勳戚'][['yan', 'qing', 'zhe', 'xun'].indexOf(c.secretFaction)]}。` : ''}`, `${c.name}：${clean}、${loyal}`, `東廠已在你手中，這份密報是確實的：${c.name}操守「${clean}」，對你「${loyal}」。人物卡上的能力評語也已更正為確實值。`);
  } else {
    const fake = c.faction === 'yan' ? '忠勤可用' : c.faction === 'qing' && chance(state.rng, 0.5) ? '結黨營私，誹謗朝政' : '尚屬安分';
    core(d, `番子查得：${c.name}${fake}。`, `${c.name}${fake}`, `東廠還在權閹手中：閹黨的人一律說好話，清流常被扣上罪名。這份密報不能全信。`);
  }
  post(state, d);
}
