// 外患與四夷：北虜、建州、倭寇、緬甸會擾邊入寇；朝鮮、安南、琉球朝貢。
// 各藩的敵意與兵力都是隱藏的，玩家只能從邊報、貢使、使臣回報推測。

import { monthOf } from './calendar';
import { claim, clue, core, draft, fluff, local, post, task } from './docs';
import { BORDERS, REGIONS, regionName } from './geography';
import { chance, int, noisy, pick, range } from './rng';
import type { Choice, Doc, GameState, PowerState, RegionId } from './types';
import { addMood, addPrestige, addUnrest, clamp, event, flow, gov, troops } from './util';
import { regionDefense, sendDetachment, spawnArmy } from './war';

export interface PowerDef {
  id: string;
  name: string;
  /** 敵國或藩屬 */
  kind: 'enemy' | 'tributary';
  borders: RegionId[];
  strength: number;
  /** 每旬兵力成長 */
  growth: number;
  hostility: number;
  side: 'invader' | 'pirate';
  armyLabel: string;
  /** 朝貢週期（旬） */
  tribute?: number;
  /** 秋高馬肥時特別活躍 */
  autumn?: boolean;
}

export const POWERS: PowerDef[] = [
  { id: 'beilu', name: '北虜（韃靼）', kind: 'enemy', borders: ['xuanda', 'jizhen', 'gansu'], strength: 55000, growth: 1.003, hostility: 55, side: 'invader', armyLabel: '韃靼虜騎', autumn: true },
  { id: 'jianzhou', name: '建州女直', kind: 'enemy', borders: ['liaodong'], strength: 16000, growth: 1.016, hostility: 40, side: 'invader', armyLabel: '建州兵' },
  { id: 'wo', name: '倭寇（日本）', kind: 'enemy', borders: ['zhejiang', 'fujian', 'nanzhili', 'shandong'], strength: 9000, growth: 1.004, hostility: 50, side: 'pirate', armyLabel: '倭寇' },
  { id: 'mian', name: '緬甸', kind: 'enemy', borders: ['yungui'], strength: 12000, growth: 1.004, hostility: 35, side: 'invader', armyLabel: '緬兵' },
  { id: 'chaoxian', name: '朝鮮', kind: 'tributary', borders: ['liaodong'], strength: 30000, growth: 1, hostility: 10, side: 'invader', armyLabel: '朝鮮兵', tribute: 20 },
  { id: 'annan', name: '安南', kind: 'tributary', borders: ['liangguang', 'yungui'], strength: 20000, growth: 1.002, hostility: 25, side: 'invader', armyLabel: '安南兵', tribute: 26 },
  { id: 'liuqiu', name: '琉球', kind: 'tributary', borders: ['fujian'], strength: 2000, growth: 1, hostility: 5, side: 'pirate', armyLabel: '琉球', tribute: 34 },
];

export function powerDef(id: string): PowerDef {
  return POWERS.find((p) => p.id === id)!;
}

export type { PowerState };

export function initPowers(state: GameState): Record<string, PowerState> {
  const r = state.rng;
  const out: Record<string, PowerState> = {};
  for (const p of POWERS) {
    out[p.id] = {
      id: p.id,
      hostility: clamp(p.hostility + int(r, -10, 10), 0, 100),
      strength: p.strength * range(r, 0.85, 1.15),
      trade: false,
      titled: false,
      nextRaid: int(r, 4, 14),
      nextTribute: p.tribute ? int(r, 2, p.tribute) : 999,
      raids: 0,
    };
  }
  return out;
}

export function stanceText(h: number): string {
  return h >= 75 ? '桀驁，意圖入寇' : h >= 55 ? '時有窺伺' : h >= 35 ? '觀望' : h >= 15 ? '尚稱恭順' : '恭順';
}

function borderMorale(state: GameState, regs: RegionId[]): number {
  const bs = regs.filter((x) => BORDERS.includes(x));
  if (!bs.length) return 0.85;
  return bs.reduce((n, x) => n + state.world.regions[x].morale, 0) / bs.length;
}

// ───────────────────────── 每旬 ─────────────────────────

export function foreignTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  const r = state.rng;

  // 結算本旬退走、被殲的外藩兵馬
  for (const a of w.armies) {
    if (!a.power || a.active || a.settled) continue;
    a.settled = true;
    const ps = w.powers[a.power];
    if (a.fate === 'destroyed') {
      ps.strength *= 0.78;
      ps.hostility = clamp(ps.hostility + 5, 0, 100);
      addPrestige(state, 3);
    } else {
      ps.strength *= 1.05;
      ps.hostility = clamp(ps.hostility - 12, 0, 100);
      addPrestige(state, -2);
    }
  }

  for (const def of POWERS) {
    const ps = w.powers[def.id];
    ps.strength *= def.growth;
    // 敵意漂移
    let dh = (def.hostility - ps.hostility) * 0.02;
    if (def.id === 'jianzhou') dh += 0.5;
    if (w.prestige < 35) dh += 0.4;
    if (borderMorale(state, def.borders) < 0.7) dh += 0.6;
    if (ps.trade) dh -= 0.6;
    if (ps.titled) dh -= 0.3;
    ps.hostility = clamp(ps.hostility + dh, 0, 100);

    if (def.kind === 'enemy') raidTick(state, def, ps);
    else if (t >= ps.nextTribute) tribute(state, def, ps);
  }

  if (chance(r, 0.15)) diplomaticEvent(state);
}

function raidTick(state: GameState, def: PowerDef, ps: PowerState): void {
  const w = state.world;
  const t = state.turn;
  const r = state.rng;
  // 執行已規劃的入寇
  if (ps.planned && t >= ps.planned.turn) {
    const p = ps.planned;
    ps.planned = undefined;
    ps.raids += 1;
    ps.nextRaid = t + int(r, 8, 14);
    const label = p.invade ? `${def.armyLabel}大軍` : def.armyLabel;
    spawnArmy(state, {
      caseId: `foreign:${def.id}`,
      label,
      side: def.side,
      size: p.size,
      region: p.target,
      power: def.id,
      path: p.invade ? REGIONS[p.target].toCapital : [],
      moveIn: 2,
      leaveIn: p.invade ? undefined : int(r, 3, 5),
    });
    event(state, `foreign:${def.id}`, `${label}約${troops(p.size)}${p.invade ? '大舉入寇' : '犯邊擄掠'}${regionName(p.target)}。`, true);
    addMood(state, -3);
    const d = draft('memorial', 'bingbu', p.target, `foreign:${def.id}`, `${regionName(p.target)}飛報：${def.armyLabel}${p.invade ? '大舉入寇' : '犯邊'}`);
    d.fromLabel = `${regionName(p.target)}塘報`;
    d.urgent = true;
    const seen = noisy(r, p.size, 0.35);
    core(d, `飛報：${def.armyLabel}約${troops(seen)}${p.invade ? '傾巢入犯，聲言直取京師' : '分道犯邊，焚掠堡寨'}！`, `${def.armyLabel}約${troops(seen)}${p.invade ? '大舉入寇' : '犯邊'}`, `緊急：${def.name}的兵馬大約 ${Math.round(seen / 1000)} 千人${p.invade ? '大舉入侵，揚言要打到京城' : '越境搶掠，通常搶完會退走'}。`);
    claim(d, `foe.${p.target}`, '境內敵軍', seen, p.size, { unit: '人', tol: 0.4, fmt: troops });
    post(state, d);
    return;
  }
  if (ps.planned || t < ps.nextRaid) return;
  // 決定是否入寇
  let p = (ps.hostility / 100) * 0.085;
  if (def.autumn && monthOf(t) >= 6 && monthOf(t) <= 9) p *= 2;
  if (borderMorale(state, def.borders) < 0.7) p *= 1.5;
  if (w.prestige < 35) p *= 1.3;
  if (!chance(r, p)) return;
  // 挑最弱的邊地
  const target = def.borders.reduce((best, x) => (regionDefense(state, x) < regionDefense(state, best) ? x : best), def.borders[0]);
  const invade = ps.hostility >= 78 && ps.strength > regionDefense(state, target) * 1.1 && chance(r, 0.45);
  const size = ps.strength * (invade ? range(r, 0.7, 0.9) : range(r, 0.3, 0.55));
  ps.planned = { turn: t + int(r, 2, 3), target, size, invade };
  // 邊報預警：六成有、偶有誤報
  if (chance(r, 0.6)) warning(state, def, target, size, invade, true);
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
  // 心懷不滿者不來朝貢——沒來，本身就是消息
  if (ps.hostility >= 55) {
    event(state, `foreign:${def.id}`, `${def.name}該貢之期，貢使不至。`);
    return;
  }
  const humble = ps.hostility < 30;
  const d = local(draft('task', 'rites', 'jingshi', `foreign:${def.id}`, `${def.name.replace(/（.*）/, '')}遣使朝貢`), state);
  core(d, `禮部謹奏：${def.name}國王遣陪臣奉表入貢，方物俱備。${humble ? '表文恭謹，禮儀如度。' : '然表文辭氣稍倨，陪臣禮節亦有未周。'}應如何賞賚，伏候聖裁。`, `${def.name}入貢，${humble ? '表文恭謹' : '表文稍倨'}`, `外藩${def.name}派使者來朝貢。${humble ? '態度恭敬。' : '使者態度有點傲慢——可能心裡不太服。'}要決定回賞多少：厚賞可以拉攏，太省則會得罪。`);
  claim(d, `stance.${def.id}`, `${def.name}態度`, humble ? '恭順' : '稍倨', stanceText(ps.hostility).slice(0, 2));
  task(d, 'for:tribute', [
    { id: 'lavish', label: '厚加賞賚', note: '萬國來朝，龍心大悅，朝望 +4；對方更加親附。', silver: 15 },
    { id: 'normal', label: '依例賞賚', note: '心情稍好，朝望 +1。', silver: 5 },
    { id: 'cut', label: '減省賞賜', note: '省錢，但有失體面，朝望 −2；對方心生不滿。' },
  ], 'cut', state.turn + 2, { recommend: 'normal', data: { power: def.id } });
  d.recommend = '擬：依例賞賚。';
  post(state, d);
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
    id: 'korea-aid',
    weight: 1,
    cooldown: 24,
    cond: (s) => s.world.powers.jianzhou.hostility > 50 || s.world.powers.wo.hostility > 55,
    make: (s) => {
      const foe = s.world.powers.wo.hostility > s.world.powers.jianzhou.hostility ? 'wo' : 'jianzhou';
      const d = dipTask(s, 'for:korea', '朝鮮國王遣使乞援', foe, [
        { id: 'send', label: '發兵援朝', note: '京營一萬赴遼東，國庫 −30 萬兩。對方元氣大傷、朝鮮感恩，朝望 +5；但京師空虛數旬。', silver: 30, troops: 10000 },
        { id: 'mediate', label: '遣使調停', note: '國庫 −5 萬兩；未必有用。', silver: 5 },
        { id: 'refuse', label: '婉拒', note: '朝鮮失望、朝望 −3；對方氣燄更盛。' },
      ], 'refuse', 'mediate');
      core(d, `禮部謹奏：朝鮮國王遣陪臣泣血陳情，言${foe === 'wo' ? '倭奴渡海犯其南境' : '建州之兵屢掠其北鄙'}，八道震動，乞天朝發兵救援。`, `朝鮮乞援，以${foe === 'wo' ? '倭奴' : '建州'}犯境`, `朝鮮被${foe === 'wo' ? '日本' : '建州女直'}攻打，派使者來求援。朝鮮是最忠誠的藩屬，見死不救會失去人心；但出兵要花錢、京城會空虛。`);
      post(s, d);
    },
  },
  {
    id: 'annan-usurp',
    weight: 0.8,
    cooldown: 999,
    make: (s) => {
      const d = dipTask(s, 'for:annan', '安南權臣篡位，請求冊封', 'annan', [
        { id: 'invest', label: '冊封新君', note: '承認既成事實，邊境無事；朝望 −1。' },
        { id: 'punish', label: '興師問罪', note: '發京營一萬、國庫 −40 萬兩南征。勝則威震南荒（朝望 +6），敗則損兵折將。', silver: 40, troops: 10000 },
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
    cond: (s) => !s.world.powers.beilu.trade,
    make: (s) => {
      const d = dipTask(s, 'for:market', '北虜遣使請開馬市', 'beilu', [
        { id: 'open', label: '准開馬市', note: '北虜敵意大減，互市每旬小有收入；但言官斥為「和戎」，朝望 −2。' },
        { id: 'refuse', label: '嚴詞拒絕', note: '朝臣稱快；北虜心懷不滿，敵意上升。' },
      ], 'refuse', 'refuse', 'bingbu');
      core(d, `兵部謹奏：北虜酋長遣使款塞，願以馬易茶布，請於${pick(s.rng, ['大同', '宣府', '張家口'])}開設馬市。`, '北虜請開馬市', '北方的蒙古部落派人來，想在邊境開市場用馬換茶葉布匹。有貿易就比較不會來搶，但朝中很多人認為這是向敵人示弱。');
      fluff(d, '臣等竊以為，虜情叵測，互市之議，恐養虎遺患。', '（兵部對開市不以為然）');
      post(s, d);
    },
  },
  {
    id: 'jurchen-title',
    weight: 0.9,
    cooldown: 20,
    make: (s) => {
      const d = dipTask(s, 'for:jurchen', '建州酋長請封都督', 'jianzhou', [
        { id: 'grant', label: '准其所請', note: '建州敵意下降，但得以名正言順兼併諸部，兵力增長。' },
        { id: 'refuse', label: '不許', note: '建州敵意上升。' },
        { id: 'divide', label: '撫其弱部、離間之', note: '國庫 −10 萬兩；或可削弱建州，但未必成功。', silver: 10 },
      ], 'refuse', 'grant', 'bingbu');
      core(d, '兵部謹奏：建州酋長遣使入貢，請加都督職銜，並許其統轄海西諸部。', '建州請加都督銜、統轄諸部', '東北的女直部落首領想要更高的官銜和管轄其他部落的權力。給了可以暫時安撫，但等於讓他壯大。');
      post(s, d);
    },
  },
  {
    id: 'japan-trade',
    weight: 0.8,
    cooldown: 24,
    make: (s) => {
      const d = dipTask(s, 'for:japan', '日本遣使請勘合貿易', 'wo', [
        { id: 'grant', label: '准發勘合', note: '倭寇之患大減；但言官議論，朝望 −1。' },
        { id: 'refuse', label: '不許', note: '倭寇敵意上升。' },
      ], 'refuse', 'refuse');
      core(d, '禮部謹奏：日本國遣使至寧波，請照舊例頒給勘合，許其入貢貿易。', '日本請頒勘合貿易', '日本派使者來，想取得合法貿易的許可證（勘合）。不許的話，很多人會轉去當海盜。');
      post(s, d);
    },
  },
  {
    id: 'rude-envoy',
    weight: 1,
    cooldown: 14,
    make: (s) => {
      const p = pick(s.rng, POWERS.filter((x) => s.world.powers[x.id].hostility > 40));
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
      const p = pick(s.rng, POWERS.filter((x) => x.kind === 'enemy' && x.side === 'invader'));
      const b = p.borders[0];
      const g = gov(s, b);
      const d = dipTask(s, 'for:strike', `${regionName(b)}總兵請出塞搗巢`, p.id, [
        { id: 'go', label: '准其出塞', note: '國庫 −20 萬兩。若對方虛弱，可重創之（朝望、心情大好）；若對方強盛，恐全軍覆沒。', silver: 20 },
        { id: 'no', label: '堅守為上', note: '照舊。' },
      ], 'no', 'no', 'bingbu');
      core(d, `兵部謹奏：${regionName(b)}總兵${g.name}請率精騎出塞，搗${p.armyLabel}巢穴，以絕後患。`, `${regionName(b)}總兵請出塞搗巢`, `邊將想主動出擊，偷襲${p.name}的大本營。成敗取決於對方實力——而對方實力你未必清楚。`);
      claim(d, `power.${p.id}`, `${p.name}兵力（總兵所估）`, noisy(s.rng, s.world.powers[p.id].strength, 0.4), s.world.powers[p.id].strength, { unit: '人', tol: 0.35, fmt: troops });
      post(s, d);
    },
  },
  {
    id: 'defector',
    weight: 0.8,
    cooldown: 18,
    make: (s) => {
      const p = pick(s.rng, POWERS.filter((x) => x.kind === 'enemy'));
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

export function applyForeignChoice(state: GameState, doc: Doc, id: string): void {
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
        w.jingying -= 10000;
        sendDetachment(state, 'liaodong', 10000, 2, 6);
        ps.strength *= 0.7;
        h(10);
        addPrestige(state, 5);
        w.powers.chaoxian.hostility = clamp(w.powers.chaoxian.hostility - 15, 0, 100);
        event(state, `foreign:${pid}`, '天朝援軍入朝，敵軍敗退。', true);
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
        w.jingying -= 10000;
        sendDetachment(state, 'liangguang', 10000, 4, 6);
        if (chance(state.rng, 0.55)) {
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
      } else {
        h(12);
        addPrestige(state, 1);
      }
      return;
    case 'for:jurchen':
      if (id === 'grant') {
        h(-15);
        ps.strength *= 1.12;
      } else if (id === 'refuse') h(10);
      else if (chance(state.rng, 0.5)) {
        ps.strength *= 0.8;
        event(state, 'foreign:jianzhou', '離間之計奏效，建州諸部內鬨。', true);
      } else h(8);
      return;
    case 'for:japan':
      if (id === 'grant') {
        ps.trade = true;
        h(-25);
        addPrestige(state, -1);
      } else h(10);
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
      const odds = clamp(regionDefense(state, b) / (ps.strength * 0.9), 0.15, 0.85);
      if (chance(state.rng, odds)) {
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
  }
}

// ───────────────────────── 四夷之策（玩家主動） ─────────────────────────

export interface ForeignAction {
  kind: 'envoy' | 'gift' | 'trade' | 'closeTrade';
  label: string;
  desc: string;
  silver: number;
}

export function foreignActions(state: GameState, id: string): ForeignAction[] {
  const ps = state.world.powers[id];
  const def = powerDef(id);
  const out: ForeignAction[] = [
    { kind: 'envoy', label: '遣使宣諭', desc: '派使臣前往，回報對方的態度與兵力（往返需時，所報未必全準）。', silver: 5 },
    { kind: 'gift', label: '厚加撫賞', desc: '送一批賞賜，對方敵意下降。', silver: 15 },
  ];
  if (def.kind === 'enemy' && !ps.trade) out.push({ kind: 'trade', label: '開關互市', desc: '開放邊境貿易：敵意逐旬下降；言官議論，朝望 −2。', silver: 0 });
  if (ps.trade) out.push({ kind: 'closeTrade', label: '閉關絕市', desc: '斷絕貿易：對方敵意上升。', silver: 0 });
  return out;
}

export function foreignAct(state: GameState, id: string, kind: ForeignAction['kind']): string | null {
  const w = state.world;
  const ps = w.powers[id];
  const def = powerDef(id);
  if (!ps) return '無此藩。';
  if (state.over) return '本局已終。';
  if (state.energy < 1) return '精力不足。';
  const act = foreignActions(state, id).find((a) => a.kind === kind);
  if (!act) return '此策不可行。';
  if (w.treasury < act.silver) return '庫銀不足。';
  if (w.cooldown[`act:${id}:${kind}`] === state.turn) return '本旬已議過此事。';
  w.cooldown[`act:${id}:${kind}`] = state.turn;
  state.energy -= 1;
  flow(state, '外交', `${def.name}：${act.label}`, { silver: -act.silver });
  state.log.push({ turn: state.turn, text: `${def.name}：${act.label}` });
  if (kind === 'gift') ps.hostility = clamp(ps.hostility - 12, 0, 100);
  if (kind === 'trade') {
    ps.trade = true;
    addPrestige(state, -2);
  }
  if (kind === 'closeTrade') {
    ps.trade = false;
    ps.hostility = clamp(ps.hostility + 10, 0, 100);
  }
  if (kind === 'envoy') {
    const back = Math.max(2, Math.ceil(REGIONS[def.borders[0]].days / 10) * 2 + 1);
    const d = draft('envoy', 'rites', 'jingshi', `foreign:${id}`, `出使${def.name}使臣覆命`);
    d.fromLabel = '使臣';
    d.arriveTurn = state.turn + back;
    const seenH = clamp(ps.hostility + int(state.rng, -12, 12), 0, 100);
    const seenS = noisy(state.rng, ps.strength, 0.3);
    core(d, `臣奉使${def.name}，觀其君臣：${stanceText(seenH)}。其兵馬約${troops(seenS)}。`, `使臣稱${def.name}${stanceText(seenH)}，兵約${troops(seenS)}`, `派去的使臣回報：${def.name}的態度是「${stanceText(seenH)}」，兵力大約 ${Math.round(seenS / 1000)} 千人。（使臣的觀察有誤差）`);
    claim(d, `stance.${id}`, `${def.name}態度`, stanceText(seenH).slice(0, 2), stanceText(ps.hostility).slice(0, 2));
    claim(d, `power.${id}`, `${def.name}兵力`, seenS, ps.strength, { unit: '人', tol: 0.3, fmt: troops });
    if (ps.planned) clue(d, `又見其部落聚集糧秣、整頓弓馬，恐不日犯邊。`, '見其聚集糧秣、整頓弓馬', { plain: '使臣看到對方正在準備糧草兵器，可能很快會來犯邊。' });
    post(state, d);
  }
  return null;
}

