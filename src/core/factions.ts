// 朝中四派：席位、聲勢、怨望；朝局天平與專權、均衡、彈劾潮、乞休潮、發難。

import { core, draft, local, post } from './docs';
import { allPosts, FACTION_NAME, FACTIONS, seatsOf } from './people';
import { chance, pick } from './rng';
import { addStatus } from './statuses';
import type { CharId, FactionId, GameState } from './types';
import { addMood, addPrestige, clamp, event } from './util';

export function seats(state: GameState): Record<FactionId, number> {
  const out: Record<FactionId, number> = { yan: 0, qing: 0, zhe: 0, xun: 0 };
  for (const id of allPosts(state)) {
    const c = state.chars[id];
    if (c.status !== 'active' || !c.faction) continue;
    out[c.faction] += seatsOf(id);
  }
  return out;
}

/** 聲勢（0～1，四派合計 1） */
export function clout(state: GameState): Record<FactionId, number> {
  const s = seats(state);
  const f = state.world.factions;
  const raw = FACTIONS.map((k) => Math.max(0.5, s[k] + f[k].bonus));
  const total = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(FACTIONS.map((k, i) => [k, raw[i] / total])) as Record<FactionId, number>;
}

export function dominant(state: GameState): FactionId | null {
  const c = clout(state);
  const top = FACTIONS.reduce((a, b) => (c[b] > c[a] ? b : a));
  return c[top] >= 0.5 ? top : null;
}

export function balanced(state: GameState): boolean {
  const c = clout(state);
  return FACTIONS.every((k) => c[k] <= 0.4 && c[k] >= 0.15);
}

export function addGrievance(state: GameState, f: FactionId | null | undefined, d: number): void {
  if (!f) return;
  const g = state.world.factions[f];
  g.grievance = clamp(g.grievance + d, 0, 100);
}

export function addClout(state: GameState, f: FactionId | null | undefined, d: number): void {
  if (!f) return;
  state.world.factions[f].bonus = clamp(state.world.factions[f].bonus + d, -10, 40);
}

/** 詔書的派系反應：+ 喜、− 怨 */
export function react(state: GameState, fx: Partial<Record<FactionId, number>>): void {
  for (const [k, v] of Object.entries(fx) as [FactionId, number][]) {
    if (v > 0) {
      addClout(state, k, v * 0.5);
      addGrievance(state, k, -v);
    } else addGrievance(state, k, -v * 2);
  }
}

export function factionTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  const c = clout(state);
  for (const k of FACTIONS) {
    const g = w.factions[k];
    g.grievance = clamp(g.grievance - 1, 0, 100);
    g.bonus *= 0.98;
    if (c[k] < 0.1) g.grievance = clamp(g.grievance + 2, 0, 100);
  }
  if (balanced(state)) w.corruption = clamp(w.corruption - 0.5, 0, 100);

  for (const k of FACTIONS) {
    const g = w.factions[k].grievance;
    const cd = `fac:${k}`;
    if ((w.cooldown[cd] ?? -99) > t) continue;
    if (g >= 90) {
      w.cooldown[cd] = t + 12;
      uprising(state, k);
    } else if (g >= 80 && chance(state.rng, 0.3)) {
      w.cooldown[cd] = t + 8;
      resignWave(state, k);
    } else if (g >= 70 && chance(state.rng, 0.35)) {
      w.cooldown[cd] = t + 4;
      impeachWave(state, k);
    }
  }
}

function members(state: GameState, f: FactionId): CharId[] {
  return allPosts(state).filter((id) => state.chars[id].faction === f && state.chars[id].status === 'active');
}

function impeachWave(state: GameState, f: FactionId): void {
  const others = (['yan', 'qing', 'zhe', 'xun'] as FactionId[]).filter((x) => x !== f);
  const targets = others.flatMap((o) => members(state, o)).filter((id) => id !== 'silijian');
  if (!targets.length) return;
  const id = pick(state.rng, targets);
  const v = state.chars[id];
  const d = local(draft('memorial', 'yushi', 'jingshi', 'court', `${FACTION_NAME[f]}諸臣交章劾${v.title}${v.name}`), state);
  d.importance = 2;
  core(d, `${FACTION_NAME[f]}諸臣連章彈劾${v.title}${v.name}，言其結黨營私、蠹國害民，乞賜罷斥。`, `${FACTION_NAME[f]}交章劾${v.name}`, `${FACTION_NAME[f]}心有不平，一連上了好幾份奏章攻擊${v.title}${v.name}（${v.faction ? FACTION_NAME[v.faction] : '無黨'}）。這是黨爭，不一定是真的；准了會讓${FACTION_NAME[f]}滿意，但他的派系會怨恨。`);
  d.request = { kind: 'impeach', region: 'jingshi', desc: `罷免${v.title}${v.name}`, yes: `罷免他，${FACTION_NAME[f]}怨望大減；${v.faction ? FACTION_NAME[v.faction] : '他的同僚'}不滿。`, no: `留中不發，${FACTION_NAME[f]}怨望照舊。`, caseId: `impeach:${id}` };
  post(state, d);
  w(state).speech = clamp(w(state).speech + 2, 0, 100);
}

function w(state: GameState) {
  return state.world;
}

function resignWave(state: GameState, f: FactionId): void {
  const ms = members(state, f).filter((id) => !id.startsWith('gov:') && id !== 'silijian' && id !== 'dongchang');
  const out = ms.filter(() => chance(state.rng, 0.3)).slice(0, 2);
  if (!out.length) return;
  for (const id of out) {
    const c = state.chars[id];
    c.competence = Math.max(0.2, c.competence - 0.2);
    c.abil = { mil: Math.max(1, c.abil.mil - 1), gov: Math.max(1, c.abil.gov - 1), fin: Math.max(1, c.abil.fin - 1), wit: Math.max(1, c.abil.wit - 1) };
    c.loyalty = clamp(c.loyalty - 15, 0, 100);
  }
  const names = out.map((id) => `${state.chars[id].title}${state.chars[id].name}`).join('、');
  const d = local(draft('notice', 'court', 'jingshi', 'court', `${FACTION_NAME[f]}諸臣乞休`), state);
  d.free = true;
  d.highlight = '朝臣乞休';
  core(d, `${names}等以疾乞休，閉門不出，部務廢弛。`, `${names}乞休不出`, `${FACTION_NAME[f]}的怨氣很重，${names}稱病不上班了（能力打折、忠誠下降）。要降低他們的怨望：任用該派的人、調停、或順他們的意下旨。`);
  post(state, d);
  addStatus(state, 'resign', 6);
  event(state, 'court', `${FACTION_NAME[f]}怨望極深，${names}乞休不出。`);
}

function uprising(state: GameState, f: FactionId): void {
  const d = local(draft('notice', 'court', 'jingshi', 'court', `${FACTION_NAME[f]}發難`), state);
  d.free = true;
  d.highlight = '朝局大變';
  d.urgent = true;
  if (f === 'qing') {
    addPrestige(state, -10);
    addMood(state, -15);
    core(d, '清流諸臣數百人伏闕哭諫，聲徹禁中，言「國事日非，皆由奸佞」。', '清流伏闕哭諫', '清流官員幾百人跪在宮門外大哭請願。朝望大降、你很不開心。');
  } else if (f === 'zhe') {
    const strongest = (['yan', 'qing', 'xun'] as FactionId[]).reduce((a, b) => (clout(state)[b] > clout(state)[a] ? b : a));
    for (const id of members(state, 'zhe')) if (chance(state.rng, 0.5)) state.chars[id].faction = strongest;
    core(d, `齊楚浙諸臣見事不可為，紛紛投附${FACTION_NAME[strongest]}。`, `齊楚浙倒向${FACTION_NAME[strongest]}`, `中間派看你不照顧他們，一半的人投靠了${FACTION_NAME[strongest]}——朝局更失衡了。`);
  } else if (f === 'xun') {
    state.world.jingyingMorale = clamp(state.world.jingyingMorale - 0.25, 0.3, 1.2);
    state.chars.jingying.loyalty = clamp(state.chars.jingying.loyalty - 25, 0, 100);
    core(d, '勳戚武臣聚議於京營，鼓噪索餉，京營將士譁然。', '勳戚鼓動京營', '勳貴武臣在京營裡煽動，京營士氣、京營提督的忠誠都大降。再不安撫，可能出大事。');
  } else {
    core(d, '閹黨諸人密謀於司禮監，宮中氣氛詭譎。', '閹黨密謀', '閹黨被逼急了，正在宮中密謀。（權閹的謀逆加速）');
    const eu = state.cases.find((c) => c.def === 'eunuch');
    if (eu) eu.data.progress = Math.min(100, (eu.data.progress ?? 0) + 15);
  }
  post(state, d);
  event(state, 'court', `${FACTION_NAME[f]}怨望已極，發難。`, true);
  state.world.factions[f].grievance = 60;
}
