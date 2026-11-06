// 四夷與海上：建州、察哈爾、喀爾喀、朝鮮、安南、緬甸、閩海海商、紅毛夷、西南土司、吐魯番。
// 各勢力的敵意與兵力都是隱藏的；有領地（境外格）、彼此的關係、地位（敵對、停戰、通好、盟約、藩屬、內附、滅亡）。
// 玩家可以遣使、撫賞、互市、和親、結盟、離間、招撫、冊封、議和、宣戰、要求內附；亦可出兵佔領其地。

import { monthOf } from './calendar';
import { claim, clue, core, draft, fluff, local, post, task } from './docs';
import { addGrievance } from './factions';
import { BORDERS, REGIONS, regionName, travelTurns } from './geography';
import { oddsText } from './intel';
import { chance, int, noisy, pick, range } from './rng';
import { addStatus, fx } from './statuses';
import type { Choice, Doc, GameState, PowerState, RegionId } from './types';
import { addMood, addPrestige, addUnrest, clamp, event, flow, gov, makeChar, troops } from './util';
import { OUTER_HOME, POWER_LABEL, regionDefense, sendDetachment, spawnArmy } from './war';

export interface PowerDef {
  id: string;
  name: string;
  kind: 'enemy' | 'tributary' | 'sea' | 'minor';
  home: RegionId;
  /** 開局的領地 */
  owns: RegionId[];
  /** 會侵擾的本朝地區 */
  borders: RegionId[];
  strength: number;
  growth: number;
  hostility: number;
  side: 'invader' | 'pirate' | 'rebel';
  armyLabel: string;
  tribute?: number;
  autumn?: boolean;
  color: string;
  desc: string;
  standing: PowerState['standing'];
}

export const POWERS: PowerDef[] = [
  { id: 'jianzhou', name: '建州', kind: 'enemy', home: 'jianzhou', owns: ['jianzhou'], borders: ['liaodong', 'jizhen'], strength: 50000, growth: 1.006, hostility: 70, side: 'invader', armyLabel: '建州兵', color: '#33405e', desc: '八旗勁旅，逐旬坐大；攻遼東、壓朝鮮、拉攏漠南諸部。與察哈爾世仇。', standing: 'hostile' },
  { id: 'chahar', name: '察哈爾', kind: 'enemy', home: 'monan', owns: ['monan'], borders: ['xuanda', 'jizhen', 'shanxi'], strength: 80000, growth: 1.002, hostility: 50, side: 'invader', armyLabel: '察哈爾虜騎', autumn: true, color: '#7a5a2e', desc: '漠南大汗，以掠奪為生，也可以用撫賞收買；與建州世仇。', standing: 'hostile' },
  { id: 'khalkha', name: '喀爾喀', kind: 'enemy', home: 'mobei', owns: ['mobei'], borders: ['gansu'], strength: 60000, growth: 1.001, hostility: 30, side: 'invader', armyLabel: '喀爾喀騎', autumn: true, color: '#8a6f45', desc: '漠北諸部，重通商。', standing: 'friendly' },
  { id: 'hami', name: '吐魯番', kind: 'minor', home: 'hami', owns: ['hami'], borders: ['gansu'], strength: 6000, growth: 1.0, hostility: 25, side: 'invader', armyLabel: '吐魯番騎', color: '#a07c4a', desc: '西域小部，若示以恩威，可以內附。', standing: 'friendly' },
  { id: 'chaoxian', name: '朝鮮', kind: 'tributary', home: 'chaoxian', owns: ['chaoxian'], borders: ['liaodong'], strength: 30000, growth: 1, hostility: 10, side: 'invader', armyLabel: '朝鮮兵', tribute: 20, color: '#4f7a6a', desc: '最恭順的藩屬，北受建州威脅。', standing: 'vassal' },
  { id: 'annan', name: '安南', kind: 'tributary', home: 'annan', owns: ['annan'], borders: ['liangguang', 'yungui'], strength: 20000, growth: 1.002, hostility: 25, side: 'invader', armyLabel: '安南兵', tribute: 26, color: '#6c8a3e', desc: '南方藩屬，權臣內鬥。', standing: 'vassal' },
  { id: 'mian', name: '緬甸', kind: 'enemy', home: 'miandian', owns: ['miandian'], borders: ['yungui'], strength: 12000, growth: 1.004, hostility: 35, side: 'invader', armyLabel: '緬兵', color: '#8c5a3a', desc: '蠶食雲南邊外土司。', standing: 'hostile' },
  { id: 'haishang', name: '閩海海商', kind: 'sea', home: 'donghai', owns: ['donghai'], borders: ['fujian', 'zhejiang'], strength: 12000, growth: 1.004, hostility: 40, side: 'pirate', armyLabel: '海商船隊', color: '#2f6d8a', desc: '以台灣西岸為巢，船三百艘，亦商亦盜；可以招撫為水師，但會坐大。', standing: 'friendly' },
  { id: 'hongmao', name: '紅毛夷', kind: 'sea', home: 'taiwan', owns: ['taiwan'], borders: ['fujian'], strength: 1500, growth: 1.002, hostility: 35, side: 'pirate', armyLabel: '紅毛夷船', color: '#b0452e', desc: '荷蘭人據台灣大員，築熱蘭遮城，收鹿皮、蔗糖；求互市，被拒則劫掠澎湖、閩海。有紅夷大砲。', standing: 'friendly' },
  { id: 'tusi', name: '西南土司', kind: 'minor', home: 'yungui', owns: [], borders: ['yungui', 'sichuan'], strength: 20000, growth: 1.002, hostility: 30, side: 'rebel', armyLabel: '土司兵', color: '#7d6b3a', desc: '雲貴、川南山中的土司，半自治；被逼則反。改土歸流可以收其地。', standing: 'friendly' },
];

for (const p of POWERS) {
  OUTER_HOME[p.id] = p.home;
  POWER_LABEL[p.id] = p.name;
}

export function powerDef(id: string): PowerDef {
  return POWERS.find((p) => p.id === id) ?? POWERS[0];
}

export function initPowers(state: GameState): Record<string, PowerState> {
  const r = state.rng;
  const out: Record<string, PowerState> = {};
  const hard = state.difficulty === 'hard' ? 1.3 : state.difficulty === 'easy' ? 0.65 : 1;
  for (const def of POWERS) {
    out[def.id] = {
      id: def.id,
      hostility: def.hostility + int(r, -8, 8),
      strength: def.strength * (def.id === 'jianzhou' ? hard : 1) * range(r, 0.9, 1.1),
      trade: false,
      titled: false,
      nextRaid: int(r, 3, 10),
      nextTribute: int(r, 4, 16),
      raids: 0,
      standing: def.standing,
      truceUntil: 0,
      tributePay: 0,
      allyPay: 0,
      rel: {},
    };
  }
  const rel = (a: string, b: string, v: number) => {
    out[a].rel[b] = v;
    out[b].rel[a] = v;
  };
  rel('jianzhou', 'chahar', -60);
  rel('jianzhou', 'chaoxian', -50);
  rel('haishang', 'hongmao', -20);
  rel('chahar', 'khalkha', -20);
  rel('mian', 'tusi', -30);
  return out;
}

export function stanceText(h: number): string {
  return h >= 75 ? '敵意甚深' : h >= 55 ? '桀驁不馴' : h >= 35 ? '時恭時倨' : h >= 15 ? '尚稱恭順' : '傾心歸附';
}

export const STANDING_TEXT: Record<PowerState['standing'], string> = { hostile: '敵對', truce: '停戰', friendly: '通好', allied: '盟約', vassal: '藩屬', annexed: '歸附', gone: '滅亡' };

function borderMorale(state: GameState, regs: RegionId[]): number {
  const bs = regs.filter((x) => BORDERS.includes(x));
  if (!bs.length) return 0.85;
  return bs.reduce((n, x) => n + state.world.regions[x].morale, 0) / bs.length;
}

export function alive(state: GameState, id: string): boolean {
  const s = state.world.powers[id]?.standing;
  return !!s && s !== 'gone' && s !== 'annexed';
}

export function foreignTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  const r = state.rng;

  // 結算本旬退走、被殲的外藩兵馬
  for (const a of w.armies) {
    if (!a.power || a.active || a.settled || !w.powers[a.power]) continue;
    a.settled = true;
    const ps = w.powers[a.power];
    if (a.fate === 'destroyed') {
      ps.strength *= 0.8;
      ps.hostility = clamp(ps.hostility + 5, 0, 100);
      addPrestige(state, 3);
    } else {
      ps.strength *= 1.04;
      ps.hostility = clamp(ps.hostility - 12, 0, 100);
      addPrestige(state, -2);
    }
  }

  for (const def of POWERS) {
    const ps = w.powers[def.id];
    if (!alive(state, def.id)) continue;
    ps.strength *= 1 + (def.growth - 1) * (state.difficulty === 'hard' ? 1.5 : state.difficulty === 'easy' ? 0.6 : 1);
    let dh = (def.hostility - ps.hostility) * 0.02;
    if (def.id === 'jianzhou') dh += 0.5;
    if (w.prestige < 35) dh += 0.4;
    if (borderMorale(state, def.borders) < 0.7) dh += 0.6;
    if (ps.trade) dh -= 0.6;
    if (ps.titled) dh -= 0.3;
    if (ps.standing === 'allied') dh -= 0.5;
    ps.hostility = clamp(ps.hostility + dh, 0, 100);
    if (ps.standing === 'truce' && t >= ps.truceUntil) ps.standing = ps.hostility >= 55 ? 'hostile' : 'friendly';
    if (ps.standing === 'friendly' && ps.hostility >= 70 && def.kind !== 'tributary') {
      ps.standing = 'hostile';
      event(state, `foreign:${def.id}`, `${def.name}與本朝失和，絕好。`, true);
    }
    if (ps.standing === 'vassal' && ps.hostility >= 60) ps.standing = 'friendly';
    if (ps.tributePay) flow(state, '外交', `${def.name}歲幣`, { silver: -ps.tributePay });
    if (ps.allyPay) flow(state, '外交', `${def.name}盟餉`, { silver: -ps.allyPay });

    const raider = def.kind !== 'tributary' && (ps.standing === 'hostile' || (ps.standing === 'friendly' && ps.hostility >= 60));
    if (raider) raidTick(state, def, ps);
    else if (def.tribute && (ps.standing === 'vassal' || ps.standing === 'friendly') && t >= ps.nextTribute) tribute(state, def, ps);
  }

  powerAI(state);
  haishangAmbition(state);
  if (chance(r, 0.15)) diplomaticEvent(state);
}

function raidTick(state: GameState, def: PowerDef, ps: PowerState): void {
  const w = state.world;
  const t = state.turn;
  const r = state.rng;
  if (ps.planned && t >= ps.planned.turn) {
    const p = ps.planned;
    ps.planned = undefined;
    ps.raids += 1;
    ps.nextRaid = t + int(r, 8, 14);
    const label = p.invade ? `${def.armyLabel}大軍` : def.armyLabel;
    spawnArmy(state, {
      caseId: `foreign:${def.id}`,
      label,
      side: def.side === 'rebel' ? 'rebel' : def.side,
      size: p.size,
      region: p.target,
      power: def.id,
      path: p.invade ? REGIONS[p.target].toCapital : [],
      moveIn: 2,
      leaveIn: p.invade ? int(r, 9, 12) : int(r, 3, 5),
    });
    ps.strength -= p.size * 0.5;
    event(state, `foreign:${def.id}`, `${label}約${troops(p.size)}${p.invade ? '大舉入寇' : '犯邊擄掠'}${regionName(p.target)}。`, true);
    addMood(state, -3);
    const d = draft('memorial', 'bingbu', p.target, `foreign:${def.id}`, `${regionName(p.target)}飛報：${def.armyLabel}${p.invade ? '大舉入寇' : '犯邊'}`);
    d.fromLabel = `${regionName(p.target)}塘報`;
    d.urgent = true;
    const seen = noisy(r, p.size, 0.35);
    core(d, `飛報：${def.armyLabel}約${troops(seen)}${p.invade ? '傾巢入犯，聲言直取京師' : '分道犯邊，焚掠堡寨'}！`, `${def.armyLabel}約${troops(seen)}${p.invade ? '大舉入寇' : '犯邊'}`, `緊急：${def.name}的兵馬大約 ${Math.round(seen / 1000)} 千人${p.invade ? '大舉入侵，揚言要打到京城' : '越境搶掠，通常搶完會退走'}。可派兵迎擊，或令當地固守。`);
    claim(d, `foe.${p.target}`, '境內敵軍', seen, p.size, { unit: '人', tol: 0.4, fmt: troops });
    post(state, d);
    return;
  }
  if (ps.planned || t < ps.nextRaid) return;
  let p = (ps.hostility / 100) * 0.085;
  if (def.autumn && monthOf(t) >= 6 && monthOf(t) <= 9) p *= 2;
  if (borderMorale(state, def.borders) < 0.7) p *= 1.5;
  if (w.prestige < 35) p *= 1.3;
  if (w.borderArrears >= 4) p *= 1.3;
  p *= 1 + fx(state, 'raid');
  if (def.id === 'jianzhou' && w.powers.chahar.standing === 'allied') p *= 0.6;
  if (!chance(r, p)) return;
  const targets = def.borders.filter((x) => !w.regions[x].heldBy);
  if (!targets.length) return;
  const target = targets.reduce((best, x) => (regionDefense(state, x) < regionDefense(state, best) ? x : best), targets[0]);
  const invade = ps.hostility >= 75 && ps.strength > regionDefense(state, target) * 1.1 && chance(r, 0.45);
  const size = ps.strength * (invade ? range(r, 0.45, 0.6) : range(r, 0.2, 0.35));
  ps.planned = { turn: t + int(r, 2, 3), target, size, invade };
  if (chance(r, 0.6)) warning(state, def, target, size, invade, true);
  else if (chance(r, 0.15)) warning(state, def, def.borders[0], size, false, false);
}

function warning(state: GameState, def: PowerDef, target: RegionId, size: number, invade: boolean, real: boolean): void {
  const r = state.rng;
  const g = gov(state, target);
  const d = draft('memorial', g.id, target, `foreign:${def.id}`, `${regionName(target)}邊報：${def.armyLabel}聚集`);
  const seen = noisy(r, size, 0.4) * (g.integrity < 0.4 ? 1.5 : 1);
  core(d, `臣${g.name}謹奏：據哨探，${def.armyLabel}約${troops(seen)}聚於邊外，${invade ? '聲言大舉' : '似將犯邊'}。臣已嚴飭各堡戒備。`, `哨探稱${def.armyLabel}約${troops(seen)}聚於邊外`, `邊境偵察回報：${def.name}約 ${Math.round(seen / 1000)} 千人在邊外集結，可能${invade ? '大舉入侵' : '來搶掠'}。（邊報未必準確，也可能是虛驚）`);
  claim(d, `foe.${target}`, '邊外敵軍', seen, real ? size : 0, { unit: '人', tol: 0.5, fmt: troops });
  post(state, d);
}

function tribute(state: GameState, def: PowerDef, ps: PowerState): void {
  const r = state.rng;
  ps.nextTribute = state.turn + (def.tribute ?? 18) + int(r, -2, 3);
  if (ps.hostility >= 55) {
    event(state, `foreign:${def.id}`, `${def.name}該貢之期，貢使不至。`);
    return;
  }
  const humble = ps.hostility < 30;
  const d = local(draft('task', 'rites', 'jingshi', `foreign:${def.id}`, `${def.name}遣使朝貢`), state);
  core(d, `禮部謹奏：${def.name}國王遣陪臣奉表入貢，方物俱備。${humble ? '表文恭謹，禮儀如度。' : '然表文辭氣稍倨，陪臣禮節亦有未周。'}應如何賞賚，伏候聖裁。`, `${def.name}入貢，${humble ? '表文恭謹' : '表文稍倨'}`, `外藩${def.name}派使者來朝貢。${humble ? '態度恭敬。' : '使者態度有點傲慢——可能心裡不太服。'}`);
  claim(d, `stance.${def.id}`, `${def.name}態度`, humble ? '恭順' : '稍倨', stanceText(ps.hostility).slice(0, 2));
  task(d, 'for:tribute', [
    { id: 'lavish', label: '厚加賞賚', note: '萬國來朝，龍心大悅，朝望 +4；對方更加親附。', silver: 15 },
    { id: 'normal', label: '依例賞賚', note: '心情稍好，朝望 +1。', silver: 5 },
    { id: 'cut', label: '減省賞賜', note: '省錢，但有失體面，朝望 −2；對方心生不滿。' },
  ], 'cut', state.turn + 2, { recommend: 'normal', data: { power: def.id } });
  d.recommend = '擬：依例賞賚。';
  post(state, d);
}

// ───────────────────────── 勢力之間 ─────────────────────────

function powerAI(state: GameState): void {
  const w = state.world;
  const r = state.rng;
  const P = w.powers;
  // 建州壓朝鮮
  if (alive(state, 'jianzhou') && alive(state, 'chaoxian') && w.regions.chaoxian.owner === 'chaoxian' && P.jianzhou.strength > P.chaoxian.strength * 1.8 && chance(r, 0.03)) {
    P.chaoxian.strength *= 0.7;
    P.jianzhou.strength *= 0.95;
    event(state, 'foreign:chaoxian', '建州兵渡鴨綠江，侵掠朝鮮。', true);
    const d = local(draft('memorial', 'rites', 'jingshi', 'foreign:chaoxian', '朝鮮告急：建州兵渡江'), state);
    d.urgent = true;
    core(d, '朝鮮國王飛咨：建州兵數萬渡鴨綠江，連陷數城，乞天朝聲援。', '朝鮮告急', '建州打朝鮮了。朝鮮若被征服，建州會多一大塊地盤、更強，遼東也會兩面受敵。可以出兵援朝、遣使、撫賞朝鮮，或不管。');
    post(state, d);
    if (P.chaoxian.strength < P.jianzhou.strength * 0.3) {
      w.regions.chaoxian.owner = 'jianzhou';
      P.chaoxian.standing = 'gone';
      P.jianzhou.strength += P.chaoxian.strength * 0.5;
      addPrestige(state, -6);
      event(state, 'foreign:chaoxian', '朝鮮力屈，與建州結城下之盟，奉其正朔。', true);
      const d2 = local(draft('memorial', 'rites', 'jingshi', 'foreign:chaoxian', '朝鮮降於建州'), state);
      d2.urgent = true;
      core(d2, '朝鮮力不能支，與建州盟於江華，歲輸幣帛，絕天朝之貢。', '朝鮮降於建州', '朝鮮投降建州了：輿圖上朝鮮改為建州的顏色。建州更強了，遼東東側也暴露了。');
      post(state, d2);
    }
  }
  // 建州、察哈爾相攻
  if (alive(state, 'jianzhou') && alive(state, 'chahar') && chance(r, 0.04)) {
    const j = P.jianzhou.strength;
    const c = P.chahar.strength;
    P.chahar.strength *= j > c * 0.6 ? 0.9 : 0.96;
    P.jianzhou.strength *= 0.96;
    event(state, 'foreign:chahar', '建州與察哈爾交兵於漠南。');
    if (P.chahar.strength < P.jianzhou.strength * 0.5 && w.regions.monan.owner === 'chahar' && chance(r, 0.25)) {
      w.regions.monan.owner = 'jianzhou';
      P.jianzhou.strength += P.chahar.strength * 0.4;
      P.chahar.standing = 'gone';
      addPrestige(state, -4);
      event(state, 'foreign:chahar', '察哈爾為建州所破，大汗西奔，漠南諸部盡附建州。', true);
      const d = local(draft('memorial', 'bingbu', 'jingshi', 'foreign:chahar', '漠南劇變：察哈爾為建州所破'), state);
      d.urgent = true;
      core(d, '宣大塘報：建州大破察哈爾，漠南諸部盡附建州。自此宣大、薊鎮邊外皆建州之騎矣。', '察哈爾為建州所破', '建州吞併了漠南：輿圖改色。宣大、薊鎮邊外從此都是建州的兵。');
      post(state, d);
    }
  }
  // 盟友出兵牽制
  for (const def of POWERS) {
    const ps = P[def.id];
    if (ps.standing !== 'allied') continue;
    for (const [foe, v] of Object.entries(ps.rel)) if (v < -40 && alive(state, foe) && P[foe].standing === 'hostile') P[foe].strength *= 0.992;
    if (chance(r, (ps.hostility - 30) / 400)) {
      ps.standing = 'friendly';
      ps.allyPay = 0;
      event(state, `foreign:${def.id}`, `${def.name}背盟。`, true);
    }
  }
}

/** 招撫的海商首領坐大 */
function haishangAmbition(state: GameState): void {
  const ps = state.world.powers.haishang;
  if (ps.standing !== 'annexed' || !ps.leader) return;
  const c = state.chars[ps.leader];
  if (!c || c.status !== 'active') return;
  c.ambition = clamp(c.ambition + 1.2, 0, 100);
  if (c.ambition >= 95 && state.world.prestige < 40 && chance(state.rng, 0.15)) {
    ps.standing = 'hostile';
    ps.hostility = 80;
    ps.strength = 15000;
    state.world.navy = Math.max(0, state.world.navy - 300);
    state.world.regions.donghai.owner = 'haishang';
    state.world.mods.seaTrade = false;
    c.status = 'rebel';
    event(state, 'foreign:haishang', `${c.name}坐大，復叛入海。`, true);
    const d = local(draft('memorial', 'bingbu', 'fujian', 'foreign:haishang', `飛報：${c.name}擁水師叛去`), state);
    d.urgent = true;
    core(d, `福建飛報：海防${c.name}擁舟師數百艘揚帆出海，復據台灣西岸，閩海震動。`, `${c.name}復叛`, '當初招撫的海商首領坐大後又叛了：水師跟著他走了。');
    post(state, d);
  }
}

// ───────────────────────── 外交事件 ─────────────────────────

interface DipEvent {
  id: string;
  weight: number;
  cooldown: number;
  cond?: (s: GameState) => boolean;
  make: (s: GameState) => void;
}

function dipTask(state: GameState, id: string, title: string, power: string, choices: Choice[], fallback: string, recommend: string, from = 'rites'): ReturnType<typeof draft> {
  const d = local(draft('task', from, 'jingshi', `foreign:${power}`, title), state);
  task(d, id, choices, fallback, state.turn + 2, { recommend, data: { power } });
  const rec = choices.find((c) => c.id === recommend);
  if (rec) d.recommend = `擬：${rec.label}。`;
  return d;
}

const DIP_EVENTS: DipEvent[] = [
  {
    id: 'hongmao-penghu',
    weight: 0.9,
    cooldown: 24,
    cond: (s) => alive(s, 'hongmao') && !s.world.mods.hongmaoTrade,
    make: (s) => {
      const d = dipTask(s, 'tw:penghu', '紅毛夷求於澎湖設館互市', 'hongmao', [
        { id: 'open', label: '准其於台灣互市', note: '每旬互市收入；可以向紅毛買紅夷大砲。海商不滿，清流議論。' },
        { id: 'penghu', label: '連澎湖也准', note: '紅毛大悅；但澎湖為閩海門戶，海防從此受制。', status: 'anger' },
        { id: 'refuse', label: '嚴拒，令其退出台灣', note: '紅毛恐將劫掠澎湖、閩海；或可趁機驅逐（須水師）。' },
      ], 'refuse', 'open', 'bingbu');
      core(d, '福建巡撫奏：紅毛夷船泊澎湖，其酋具書求互市，言願輸方物、助剿海寇。', '紅毛求互市', '荷蘭人（紅毛夷）佔據台灣南部大員，想跟你做生意。准了有錢、有西洋火器；拒絕的話他們可能劫掠福建沿海。');
      fluff(d, '臣訪得其船堅砲利，非尋常海寇可比。', '紅毛的船堅砲利。');
      post(s, d);
    },
  },
  {
    id: 'haishang-offer',
    weight: 0.9,
    cooldown: 20,
    cond: (s) => alive(s, 'haishang') && s.world.powers.haishang.standing !== 'annexed',
    make: (s) => {
      const ps = s.world.powers.haishang;
      const d = dipTask(s, 'tw:haishang', '閩海海商首領遣人投書，求受招撫', 'haishang', [
        { id: 'grant', label: '授海防都督', note: '得水師三百艘、開海稅；但他坐大的機會很高。', odds: clamp(0.85 - ps.hostility / 200, 0.2, 0.9) },
        { id: 'small', label: '只授遊擊', note: '他或許嫌官小而拒絕。', odds: clamp(0.6 - ps.hostility / 200, 0.1, 0.8) },
        { id: 'refuse', label: '不許，嚴令剿捕', note: '海商敵意上升，閩浙海患加劇。' },
      ], 'refuse', 'small', 'bingbu');
      core(d, '福建巡撫奏：海商某以笨港為巢，船數百艘，今遣人投書，願受招撫，為朝廷守海。', '海商求撫', '盤據台灣西岸的海商集團想要受招安。招撫可以得到現成的水師（渡海、驅逐紅毛都需要），但首領會越來越有野心。');
      post(s, d);
    },
  },
  {
    id: 'khalkha-trade',
    weight: 0.6,
    cooldown: 30,
    cond: (s) => alive(s, 'khalkha') && !s.world.powers.khalkha.trade,
    make: (s) => {
      const d = dipTask(s, 'for:market', '喀爾喀請於甘肅開市', 'khalkha', [
        { id: 'open', label: '准開市', note: '喀爾喀親附，每旬小有收入；言官議論。' },
        { id: 'refuse', label: '不許', note: '喀爾喀不滿。' },
      ], 'refuse', 'open', 'bingbu');
      core(d, '甘肅總兵奏：漠北喀爾喀諸部遣使，願以馬駝易茶布。', '喀爾喀請互市', '漠北的喀爾喀想通商。');
      post(s, d);
    },
  },
  {
    id: 'korea-aid',
    weight: 1,
    cooldown: 24,
    cond: (s) => alive(s, 'chaoxian') && (s.world.powers.jianzhou.hostility > 50 || s.world.powers.haishang.hostility > 55),
    make: (s) => {
      const foe = s.world.powers.haishang.hostility > s.world.powers.jianzhou.hostility ? 'haishang' : 'jianzhou';
      const d = dipTask(s, 'for:korea', '朝鮮國王遣使乞援', foe, [
        { id: 'send', label: '發兵援朝', note: '京營一萬赴遼東，國庫 −30 萬兩。對方元氣大傷、朝鮮感恩，朝望 +5；但京師空虛數旬。', silver: 30, troops: 10000 },
        { id: 'mediate', label: '遣使調停', note: '國庫 −5 萬兩；未必有用。', silver: 5 },
        { id: 'refuse', label: '婉拒', note: '朝鮮失望、朝望 −3；對方氣燄更盛。' },
      ], 'refuse', 'mediate');
      core(d, `禮部謹奏：朝鮮國王遣陪臣泣血陳情，言${foe === 'haishang' ? '倭奴渡海犯其南境' : '建州之兵屢掠其北鄙'}，八道震動，乞天朝發兵救援。`, `朝鮮乞援，以${foe === 'haishang' ? '倭奴' : '建州'}犯境`, `朝鮮被${foe === 'haishang' ? '日本' : '建州女直'}攻打，派使者來求援。朝鮮是最忠誠的藩屬，見死不救會失去人心；但出兵要花錢、京城會空虛。`);
      post(s, d);
    },
  },
  {
    id: 'annan-usurp',
    weight: 0.8,
    cooldown: 999,
    cond: (s) => alive(s, 'annan'),
    make: (s) => {
      const d = dipTask(s, 'for:annan', '安南權臣篡位，請求冊封', 'annan', [
        { id: 'invest', label: '冊封新君', note: '承認既成事實，邊境無事；朝望 −1。' },
        { id: 'punish', label: '興師問罪', note: '發京營一萬、國庫 −40 萬兩南征。勝則威震南荒（朝望 +6），敗則損兵折將。', silver: 40, troops: 10000, odds: 0.55 },
        { id: 'deny', label: '不予承認', note: '安南心懷怨恨，日後可能擾邊。' },
      ], 'deny', 'invest');
      core(d, '禮部謹奏：安南權臣某弒其君而自立，遣使奉表，請求冊封。', '安南權臣弒君自立，請冊封', '越南的權臣殺了國王自立，現在派人來請你正式承認他。承認省事，但等於縱容篡位；討伐則師出有名，可是路遠費錢。');
      post(s, d);
    },
  },
  {
    id: 'horse-market',
    weight: 1,
    cooldown: 20,
    cond: (s) => alive(s, 'chahar') && !s.world.powers.chahar.trade,
    make: (s) => {
      const d = dipTask(s, 'for:market', '察哈爾遣使請開馬市', 'chahar', [
        { id: 'open', label: '准開馬市', note: '北虜敵意大減，互市每旬小有收入；但言官斥為「和戎」，朝望 −2。' },
        { id: 'refuse', label: '嚴詞拒絕', note: '朝臣稱快；北虜心懷不滿，敵意上升。' },
      ], 'refuse', 'refuse', 'bingbu');
      core(d, `兵部謹奏：察哈爾酋長遣使款塞，願以馬易茶布，請於${pick(s.rng, ['大同', '宣府', '張家口'])}開設馬市。`, '北虜請開馬市', '漠南的察哈爾部派人來，想在邊境開市場用馬換茶葉布匹。有貿易就比較不會來搶，但朝中很多人認為這是向敵人示弱。');
      fluff(d, '臣等竊以為，虜情叵測，互市之議，恐養虎遺患。', '（兵部對開市不以為然）');
      post(s, d);
    },
  },
  {
    id: 'jurchen-title',
    weight: 0.9,
    cooldown: 20,
    cond: (s) => alive(s, 'jianzhou') && !s.world.powers.jianzhou.titled,
    make: (s) => {
      const d = dipTask(s, 'for:jurchen', '建州酋長請封都督', 'jianzhou', [
        { id: 'grant', label: '准其所請', note: '建州敵意下降，但得以名正言順兼併諸部，兵力增長。' },
        { id: 'refuse', label: '不許', note: '建州敵意上升。' },
        { id: 'divide', label: '撫其弱部、離間之', note: '國庫 −10 萬兩；或可削弱建州，但未必成功。', silver: 10, odds: 0.5 },
      ], 'refuse', 'grant', 'bingbu');
      core(d, '兵部謹奏：建州酋長遣使入貢，請加都督職銜，並許其統轄海西諸部。', '建州請加都督銜、統轄諸部', '東北的女直部落首領想要更高的官銜和管轄其他部落的權力。給了可以暫時安撫，但等於讓他壯大。');
      post(s, d);
    },
  },
  {
    id: 'rude-envoy',
    weight: 1,
    cooldown: 14,
    make: (s) => {
      const p = pick(s.rng, POWERS.filter((x) => s.world.powers[x.id].hostility > 40 && s.world.powers[x.id].standing !== 'gone'));
      if (!p) return;
      const d = dipTask(s, 'for:rude', `${p.name}使臣失禮`, p.id, [
        { id: 'scold', label: '嚴詞斥責', note: '朝望 +1；對方敵意上升。' },
        { id: 'tolerate', label: '優容之', note: '朝望 −1；對方敵意稍降。' },
      ], 'tolerate', 'tolerate');
      core(d, `禮部謹奏：${p.name}使臣入覲，倨傲不拜，口出不遜之言。`, `${p.name}使臣倨傲不拜`, `${p.name}的使者見你時態度傲慢、不肯下跪。（這通常代表對方不太把你放在眼裡）`);
      claim(d, `stance.${p.id}`, `${p.name}態度`, '倨傲', stanceText(s.world.powers[p.id].hostility).slice(0, 2));
      post(s, d);
    },
  },
  {
    id: 'raid-strike',
    weight: 0.9,
    cooldown: 16,
    make: (s) => {
      const p = pick(s.rng, POWERS.filter((x) => x.kind === 'enemy' && x.side === 'invader' && s.world.powers[x.id].standing !== 'gone'));
      const b = p.borders[0];
      const g = gov(s, b);
      const est = noisy(s.rng, s.world.powers[p.id].strength, 0.4);
      const d = dipTask(s, 'for:strike', `${regionName(b)}總兵請出塞搗巢`, p.id, [
        { id: 'go', label: '准其出塞', note: '國庫 −20 萬兩。若對方虛弱，可重創之（朝望、心情大好）；若對方強盛，恐全軍覆沒。勝算依總兵所估敵情。', silver: 20, odds: clamp(regionDefense(s, b) / (est * 0.9), 0.1, 0.85) },
        { id: 'no', label: '堅守為上', note: '照舊。' },
      ], 'no', 'no', 'bingbu');
      core(d, `兵部謹奏：${regionName(b)}總兵${g.name}請率精騎出塞，搗${p.armyLabel}巢穴，以絕後患。`, `${regionName(b)}總兵請出塞搗巢`, `邊將想主動出擊，偷襲${p.name}的大本營。成敗取決於對方實力——而對方實力你未必清楚。`);
      claim(d, `power.${p.id}`, `${p.name}兵力（總兵所估）`, est, s.world.powers[p.id].strength, { unit: '人', tol: 0.35, fmt: troops });
      post(s, d);
    },
  },
  {
    id: 'defector',
    weight: 0.8,
    cooldown: 18,
    make: (s) => {
      const p = pick(s.rng, POWERS.filter((x) => x.kind === 'enemy' && s.world.powers[x.id].standing !== 'gone'));
      const d = dipTask(s, 'for:defector', `${p.name}頭目率眾來降`, p.id, [
        { id: 'welcome', label: '厚加撫恤', note: '國庫 −5 萬兩；朝望 +1，對方內部離心。', silver: 5 },
        { id: 'refuse', label: '拒而不納', note: '照舊。' },
        { id: 'kill', label: '斬之以絕後患', note: '對方敵意大增。' },
      ], 'refuse', 'welcome', 'bingbu');
      core(d, `兵部謹奏：${p.name}頭目某率部屬數百人叩關來降，言其主${s.world.powers[p.id].hostility > 60 ? '日夜聚兵，將有大舉' : '近來內爭，部眾離散'}。`, `${p.name}頭目來降，言其主${s.world.powers[p.id].hostility > 60 ? '將有大舉' : '內爭離散'}`, `${p.name}有小頭目帶人投降，他透露了對方的情況。（降人的話值得參考，但也可能是詐降）`);
      claim(d, `stance.${p.id}`, `${p.name}態度（降人言）`, s.world.powers[p.id].hostility > 60 ? '將有大舉' : '內爭離散', s.world.powers[p.id].hostility > 60 ? '將有大舉' : '內爭離散');
      post(s, d);
    },
  },
];

function diplomaticEvent(state: GameState): void {
  const t = state.turn;
  const cd = state.world.cooldown;
  const pool = DIP_EVENTS.filter((e) => (cd[e.id] ?? -99) <= t && (!e.cond || e.cond(state)));
  if (!pool.length) return;
  const total = pool.reduce((n, e) => n + e.weight, 0);
  let x = range(state.rng, 0, total);
  for (const e of pool) {
    x -= e.weight;
    if (x <= 0) {
      cd[e.id] = t + e.cooldown;
      e.make(state);
      return;
    }
  }
}

// ───────────────────────── 套用選項 ─────────────────────────

export function applyForeignChoice(state: GameState, doc: Doc, id: string, ok = true): void {
  const w = state.world;
  const t = doc.task!;
  const pid = String(t.data?.power ?? '');
  const ps = w.powers[pid];
  if (!ps) return;
  const h = (d: number) => (ps.hostility = clamp(ps.hostility + d, 0, 100));
  switch (t.id) {
    case 'for:tribute':
      if (id === 'lavish') {
        addMood(state, 8);
        addPrestige(state, 4);
        h(-10);
      } else if (id === 'normal') {
        addMood(state, 4);
        addPrestige(state, 1);
        h(-3);
      } else {
        addPrestige(state, -2);
        h(8);
      }
      return;
    case 'for:korea':
      if (id === 'send') {
        sendDetachment(state, 'liaodong', 10000);
        ps.strength *= 0.75;
        h(10);
        addPrestige(state, 5);
        w.powers.chaoxian.hostility = clamp(w.powers.chaoxian.hostility - 15, 0, 100);
        w.powers.chaoxian.strength *= 1.2;
        event(state, `foreign:${pid}`, '天朝援軍出遼東，朝鮮之圍稍解。', true);
      } else if (id === 'mediate') {
        if (chance(state.rng, 0.4)) h(-10);
      } else {
        addPrestige(state, -3);
        w.powers.chaoxian.hostility = clamp(w.powers.chaoxian.hostility + 15, 0, 100);
        ps.strength *= 1.1;
      }
      return;
    case 'for:annan':
      if (id === 'invest') addPrestige(state, -1);
      else if (id === 'punish') {
        sendDetachment(state, 'liangguang', 10000);
        if (ok) {
          addPrestige(state, 6);
          addMood(state, 8);
          event(state, 'foreign:annan', '南征之師克安南，篡臣伏誅。', true);
          h(-20);
        } else {
          addPrestige(state, -5);
          addMood(state, -6);
          addUnrest(state, 'liangguang', 10);
          event(state, 'foreign:annan', '南征之師水土不服，損兵折將而還。', true);
          h(25);
        }
      } else h(30);
      return;
    case 'for:market':
      if (id === 'open') {
        ps.trade = true;
        h(-30);
        addPrestige(state, -2);
        addGrievance(state, 'qing', 4);
      } else {
        h(12);
        addPrestige(state, 1);
      }
      return;
    case 'for:jurchen':
      if (id === 'grant') {
        h(-15);
        ps.titled = true;
        ps.strength *= 1.12;
      } else if (id === 'refuse') h(10);
      else if (ok) {
        ps.strength *= 0.8;
        event(state, 'foreign:jianzhou', '離間之計奏效，建州諸部內鬨。', true);
      } else h(8);
      return;
    case 'for:rude':
      if (id === 'scold') {
        addPrestige(state, 1);
        h(8);
      } else {
        addPrestige(state, -1);
        h(-3);
      }
      return;
    case 'for:strike': {
      if (id !== 'go') return;
      const def = powerDef(pid);
      const b = def.borders[0];
      if (ok) {
        ps.strength *= 0.65;
        addPrestige(state, 4);
        addMood(state, 8);
        event(state, `foreign:${pid}`, `${regionName(b)}總兵出塞搗巢，大破${def.armyLabel}。`, true);
        const d = draft('memorial', 'bingbu', b, `foreign:${pid}`, `${regionName(b)}捷報：出塞搗巢`);
        d.fromLabel = `${regionName(b)}塘報`;
        d.highlight = '捷　報';
        core(d, `捷報：我軍出塞，夜襲${def.armyLabel}營帳，斬獲甚眾，虜酋遁走。`, '出塞搗巢大捷', '好消息：出塞偷襲成功，重創敵軍。');
        post(state, d);
      } else {
        w.regions[b].garrison *= 0.7;
        addPrestige(state, -4);
        addMood(state, -6);
        h(10);
        event(state, `foreign:${pid}`, `${regionName(b)}總兵出塞中伏，喪師數千。`, true);
        const d = draft('memorial', 'bingbu', b, `foreign:${pid}`, `${regionName(b)}塘報：出塞失利`);
        d.fromLabel = `${regionName(b)}塘報`;
        d.urgent = true;
        core(d, `塘報：我軍出塞，中伏敗績，喪師數千，總兵僅以身免。`, '出塞中伏敗績', '壞消息：出塞偷襲中了埋伏，損失慘重。');
        post(state, d);
      }
      return;
    }
    case 'for:defector':
      if (id === 'welcome') {
        addPrestige(state, 1);
        ps.strength *= 0.95;
        h(-3);
      } else if (id === 'kill') h(15);
      return;
    case 'tw:penghu':
      if (id === 'open' || id === 'penghu') {
        w.mods.hongmaoTrade = true;
        ps.trade = true;
        h(-25);
        w.powers.haishang.hostility = clamp(w.powers.haishang.hostility + 10, 0, 100);
        addGrievance(state, 'qing', 5);
      } else {
        h(20);
        if (ps.standing === 'friendly') ps.standing = 'hostile';
      }
      return;
    case 'tw:haishang':
      if (id === 'refuse') {
        h(15);
        return;
      }
      if (ok) recruitHaishang(state, id === 'grant');
      else {
        h(10);
        event(state, 'foreign:haishang', '海商嫌官職卑微，拒不受撫。');
      }
      return;
  }
}

export function recruitHaishang(state: GameState, big: boolean): void {
  const w = state.world;
  const ps = w.powers.haishang;
  ps.standing = 'annexed';
  ps.hostility = 10;
  w.regions.donghai.owner = 'crown';
  w.regions.donghai.control = 40;
  w.navy += 300;
  w.mods.seaTrade = true;
  const c = makeChar(state, 'res:haishang', big ? '海防都督' : '海防遊擊', 'fujian', 'military', 2, { faction: null, competence: 0.8, ambition: big ? 70 : 55, loyalty: 45 });
  c.status = 'active';
  ps.leader = c.id;
  addPrestige(state, 3);
  event(state, 'foreign:haishang', `閩海海商受撫，授${c.title}，舟師三百艘歸朝廷調遣。`, true);
  const d = local(draft('memorial', 'bingbu', 'fujian', 'foreign:haishang', '福建奏：海商受撫'), state);
  d.highlight = '海上歸心';
  core(d, `海商${c.name}率舟師三百艘受撫，閩海稍靖。`, '海商受撫', `海商受招撫了：水師 +300 艘（可以渡海去台灣）、開海每旬有稅收。注意他的野心會越來越大。`);
  post(state, d);
}

// ───────────────────────── 外交行動（詔書・外交類） ─────────────────────────

export interface DipAction {
  kind: string;
  label: string;
  desc: string;
  energy: number;
  silver: number;
  /** 不可行的原因 */
  block?: string;
  odds?: number;
}

export function foreignActions(state: GameState, id: string): DipAction[] {
  const w = state.world;
  const ps = w.powers[id];
  const def = powerDef(id);
  if (!ps || !alive(state, id)) return [];
  const out: DipAction[] = [];
  const add = (a: DipAction, block?: string | false) => out.push(block ? { ...a, block } : a);
  add({ kind: 'envoy', label: '遣使', desc: '使臣往返，帶回對方的態度與兵力估計（受使臣謀略影響）；態度稍好。', energy: 1, silver: 2 });
  add({ kind: 'gift', label: '撫賞', desc: '送一批賞賜：敵意大降、掠邊減少；遊牧拿了錢會變強一點。', energy: 1, silver: 20 });
  if (!ps.trade) add({ kind: 'trade', label: '互市', desc: '開邊市：每旬有收入、敵意漸降；但對方逐旬壯大。清流反對與敵國互市。', energy: 1, silver: 0 }, ps.standing === 'hostile' && ps.hostility > 70 && '敵意太深，對方不肯互市。');
  else add({ kind: 'closeTrade', label: '絕市', desc: '斷絕貿易：對方敵意上升。', energy: 1, silver: 0 });
  if (def.kind === 'enemy' || def.kind === 'minor') add({ kind: 'marry', label: '和親', desc: '以宗室女下嫁：敵意大降，十八旬內不會入寇；朝望 −5，清流不滿。', energy: 2, silver: 20 }, ps.hostility > 85 && '對方不屑和親。');
  if (ps.standing !== 'allied') add({ kind: 'ally', label: '結盟', desc: '共抗強敵：盟友會牽制其仇敵；每旬盟餉。對方態度要夠好；有野心者可能背盟。', energy: 2, silver: 10 }, ps.hostility > 55 && '對方不願結盟（敵意太深）。');
  add({ kind: 'sow', label: '離間', desc: '挑撥它與其仇敵互攻（賭性）：事成兩方相殘；事洩兩方都更敵視本朝。', energy: 1, silver: 5, odds: clamp(0.55 + (w.dongchang === 'crown' ? 0.1 : 0) - ps.hostility / 400, 0.2, 0.8) });
  if (id === 'haishang' || id === 'tusi') add({ kind: 'recruit', label: '招撫', desc: id === 'haishang' ? '授官招撫：得水師三百艘、開海稅；首領會坐大。' : '撫慰土司：西南安靜。', energy: 2, silver: 20, odds: clamp(0.85 - ps.hostility / 120, 0.1, 0.9) });
  if (!ps.titled && def.kind !== 'tributary') add({ kind: 'invest', label: '冊封', desc: '承認其地位：敵意大降；但冊封建州等敵國會讓它更強、朝望 −5。', energy: 1, silver: 0 });
  if (ps.standing === 'hostile') add({ kind: 'peace', label: '議和', desc: '停戰十八旬，每旬歲幣；清流大譁。', energy: 2, silver: 0, odds: clamp(0.3 + (60 - ps.hostility) / 100 + (regionDefense(state, def.borders[0] ?? 'jingshi') > ps.strength ? 0.25 : 0), 0.1, 0.9) });
  if (ps.standing !== 'hostile') add({ kind: 'war', label: '宣戰', desc: '進入戰爭：可以出兵攻打其領地；遊牧會報復性入寇。', energy: 2, silver: 0 });
  if (def.kind === 'tributary' || def.kind === 'minor') add({ kind: 'annex', label: '要求內附', desc: '令其舉國內附，成為本朝領土（控制度三成）。要對方極恭順、而本朝兵勢遠勝。', energy: 2, silver: 0 }, (ps.hostility > 20 || ps.strength * 3 > totalCrown(state)) && '時機未到：對方要「傾心歸附」，而且本朝兵勢要遠勝。');
  return out;
}

function totalCrown(state: GameState): number {
  const w = state.world;
  return Object.values(w.regions).reduce((n, r) => n + r.garrison, 0) + w.jingying + w.armies.filter((a) => a.side === 'crown' && a.active).reduce((n, a) => n + a.size, 0);
}

/** 送達對方後的效果 */
export function applyDip(state: GameState, id: string, kind: string, ok: boolean): void {
  const w = state.world;
  const ps = w.powers[id];
  const def = powerDef(id);
  if (!ps) return;
  const h = (d: number) => (ps.hostility = clamp(ps.hostility + d, 0, 100));
  switch (kind) {
    case 'envoy': {
      h(-5);
      const d = draft('envoy', 'rites', 'jingshi', `foreign:${id}`, `出使${def.name}使臣覆命`);
      d.fromLabel = '使臣';
      d.arriveTurn = state.turn + Math.max(1, travelTurns(state, def.home));
      const seenH = clamp(ps.hostility + int(state.rng, -12, 12), 0, 100);
      const seenS = noisy(state.rng, ps.strength, 0.3);
      core(d, `臣奉使${def.name}，觀其君臣：${stanceText(seenH)}。其兵馬約${troops(seenS)}。`, `使臣稱${def.name}${stanceText(seenH)}，兵約${troops(seenS)}`, `使臣回報：${def.name}「${stanceText(seenH)}」，兵力約 ${Math.round(seenS / 1000)} 千人。（使臣的觀察有誤差）`);
      claim(d, `stance.${id}`, `${def.name}態度`, stanceText(seenH).slice(0, 2), stanceText(ps.hostility).slice(0, 2));
      claim(d, `power.${id}`, `${def.name}兵力`, seenS, ps.strength, { unit: '人', tol: 0.3, fmt: troops });
      if (ps.planned) clue(d, '又見其部落聚集糧秣、整頓弓馬，恐不日犯邊。', '見其聚集糧秣、整頓弓馬', { plain: '使臣看到對方正在準備糧草兵器，可能很快會來犯邊。' });
      post(state, d);
      return;
    }
    case 'gift':
      h(-18);
      if (def.kind === 'enemy') ps.strength *= 1.02;
      ps.nextRaid = Math.max(ps.nextRaid, state.turn + 4);
      return;
    case 'trade':
      ps.trade = true;
      if (id === 'hongmao') w.mods.hongmaoTrade = true;
      addPrestige(state, def.kind === 'enemy' ? -2 : 0);
      if (def.kind === 'enemy') addGrievance(state, 'qing', 5);
      return;
    case 'closeTrade':
      ps.trade = false;
      if (id === 'hongmao') w.mods.hongmaoTrade = false;
      h(10);
      return;
    case 'marry':
      h(-40);
      ps.standing = 'truce';
      ps.truceUntil = state.turn + 18;
      ps.planned = undefined;
      addPrestige(state, -5);
      addGrievance(state, 'qing', 5);
      event(state, `foreign:${id}`, `以宗室女下嫁${def.name}。`, true);
      return;
    case 'ally':
      ps.standing = 'allied';
      ps.allyPay = def.kind === 'enemy' ? 3 : 1.5;
      h(-15);
      event(state, `foreign:${id}`, `與${def.name}結盟。`, true);
      return;
    case 'sow': {
      const foes = Object.entries(ps.rel).filter(([f]) => alive(state, f)).sort((a, b) => a[1] - b[1]);
      const foe = foes[0]?.[0];
      if (!foe) return;
      if (ok) {
        ps.strength *= 0.88;
        w.powers[foe].strength *= 0.88;
        ps.rel[foe] = -100;
        w.powers[foe].rel[id] = -100;
        event(state, `foreign:${id}`, `離間得手，${def.name}與${powerDef(foe).name}相攻。`, true);
      } else {
        h(20);
        w.powers[foe].hostility = clamp(w.powers[foe].hostility + 20, 0, 100);
        event(state, `foreign:${id}`, `離間之計洩露，${def.name}與${powerDef(foe).name}皆怒。`, true);
      }
      return;
    }
    case 'recruit':
      if (!ok) {
        h(10);
        event(state, `foreign:${id}`, `招撫${def.name}不成。`);
        return;
      }
      if (id === 'haishang') recruitHaishang(state, true);
      else {
        ps.standing = 'friendly';
        h(-30);
        event(state, `foreign:${id}`, `${def.name}受撫。`, true);
      }
      return;
    case 'invest':
      ps.titled = true;
      h(-20);
      if (def.kind === 'enemy') {
        ps.strength *= 1.1;
        addPrestige(state, -5);
      }
      return;
    case 'peace':
      if (!ok) {
        h(5);
        event(state, `foreign:${id}`, `${def.name}不許和。`);
        return;
      }
      ps.standing = 'truce';
      ps.truceUntil = state.turn + 18;
      ps.tributePay = def.id === 'jianzhou' ? 6 : 3;
      ps.planned = undefined;
      for (const a of w.armies) if (a.active && a.power === id && a.side !== 'crown') a.leaveTurn = state.turn;
      addPrestige(state, -6);
      addGrievance(state, 'qing', 20);
      event(state, `foreign:${id}`, `與${def.name}議和，歲輸幣帛。`, true);
      return;
    case 'war':
      ps.standing = 'hostile';
      ps.tributePay = 0;
      ps.allyPay = 0;
      h(25);
      ps.nextRaid = state.turn + 2;
      event(state, `foreign:${id}`, `對${def.name}宣戰。`, true);
      return;
    case 'annex':
      if (!ok) {
        h(30);
        return;
      }
      ps.standing = 'annexed';
      for (const r of Object.values(w.regions)) if (r.owner === id) {
        r.owner = 'crown';
        r.control = 30;
      }
      addPrestige(state, 8);
      addStatus(state, 'fervor');
      event(state, `foreign:${id}`, `${def.name}舉國內附。`, true);
      return;
  }
}

export function dipOdds(state: GameState, id: string, kind: string): number | undefined {
  return foreignActions(state, id).find((a) => a.kind === kind)?.odds;
}

export function oddsLabel(p?: number): string {
  return p === undefined ? '' : oddsText(p);
}
