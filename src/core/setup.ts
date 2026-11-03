// 開局：人物、各地、抽出五件疑案、開局文書。

import { drawCases, setupCases } from './cases';
import { CAPITAL_OFFICIALS } from './court';
import { core, draft, fluff, post } from './docs';
import { REGION_ORDER, REGIONS, regionName } from './geography';
import { chance, hashSeed, int, pick, type Rng } from './rng';
import { initPowers } from './foreign';
import { openingTasks } from './routine';
import type { GameState, PerkId, RegionId, RegionState } from './types';
import { govId, makeChar } from './util';

export const PERKS: Record<PerkId, { name: string; desc: string }> = {
  diligent: { name: '勤政', desc: '每旬精力 +1。' },
  spies: { name: '廠衛得力', desc: '東廠提督必為精幹之人，密報不會羅織。' },
  treasury: { name: '內帑充盈', desc: '開局國庫多一百萬兩。' },
  granary: { name: '太倉充盈', desc: '開局存糧多八十萬石。' },
  insight: { name: '知人', desc: '登基前已看透首輔的底細。' },
  courier: { name: '驛傳迅捷', desc: '各地文書、旨意往返快四成。' },
  censors: { name: '言路大開', desc: '言官彈章更多、更可信。' },
  beloved: { name: '新君得人望', desc: '開局朝望 +15。' },
};

export const MAX_TURN = 72;

export function perkChoices(seed: string): PerkId[] {
  const r: Rng = { s: hashSeed(seed + '#perk') };
  const all = Object.keys(PERKS) as PerkId[];
  const out: PerkId[] = [];
  while (out.length < 3) {
    const p = pick(r, all);
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

export function randomSeed(): string {
  const chars = '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + Math.floor(Math.random() * 1000);
}

export function newRun(seed: string, perk: PerkId, opts: { cases?: string[] } = {}): GameState {
  const rng: Rng = { s: hashSeed(seed) };
  const energyMax = perk === 'diligent' ? 7 : 6;
  const regions = {} as Record<RegionId, RegionState>;
  for (const id of REGION_ORDER) {
    regions[id] = {
      unrest: int(rng, 12, 30),
      remitUntil: 0,
      pressUntil: 0,
      occupied: false,
      garrison: REGIONS[id].garrison,
      morale: 0.85,
      reliefUntil: 0,
      taxPaid: REGIONS[id].tax * 0.9,
      grainPaid: REGIONS[id].grain,
      caseTaxMod: 1,
      sect: 0,
    };
  }
  const state: GameState = {
    version: 2,
    seed,
    rng,
    turn: 0,
    maxTurn: MAX_TURN,
    perk,
    energy: energyMax,
    energyMax,
    energyCap: energyMax,
    chars: {},
    world: {
      treasury: 300 + (perk === 'treasury' ? 100 : 0),
      grain: 180 + (perk === 'granary' ? 80 : 0),
      privy: 40,
      jingying: 50000,
      jingyingMorale: 1,
      prestige: 50 + (perk === 'beloved' ? 15 : 0),
      corruption: 35,
      taxPolicy: 'normal',
      borderArrears: 0,
      regions,
      armies: [],
      detachments: [],
      shoufu: 'clean',
      dongchang: perk === 'spies' ? 'capable' : chance(rng, 0.5) ? 'capable' : 'fabricator',
      wrongful: [],
      events: [],
      treasuryLog: [],
      grainLog: [],
      negTreasury: 0,
      negGrain: 0,
      mods: { mineTaxUntil: 0, debasedTurn: 0, canalBlockedUntil: 0, seaTrade: false, saltMod: 1, suppressed: 0 },
      last: { income: 40, expense: 18, salt: 6, grainIn: 9, grainOut: 10 },
      ledger: [],
      flows: [],
      emperor: { mood: 60, illness: null, reads: 0, leisure: {}, heirChance: 0, heirDue: 0, heirs: 0, restUntil: 0, elixirUntil: 0 },
      projects: [],
      buffs: {},
      cooldown: {},
      westerner: false,
      plagueUntil: 0,
      powers: {},
    },
    cases: [],
    docs: [],
    nextId: 1,
    orders: [],
    lies: [],
    notes: {},
    trust: {},
    beliefs: { shoufu: '' },
    reportedTreasury: 0,
    reportedGrain: 0,
    log: [],
    stats: { reads: 0, summons: 0, orders: 0, spies: 0, tasks: 0 },
  };

  for (const [id, title, rank] of CAPITAL_OFFICIALS) {
    makeChar(state, id, title, 'jingshi', id === 'silijian' || id === 'dongchang' ? 'eunuch' : 'civil', rank);
  }
  for (const id of REGION_ORDER) {
    const info = REGIONS[id];
    makeChar(state, govId(id), info.gov, id, info.kind === 'border' ? 'military' : 'civil', id === 'jingshi' ? 3 : 1);
  }

  state.world.powers = initPowers(state);
  state.cases = drawCases(state, 5, opts.cases);
  // 首輔：一半清正，一半袒護其中一案
  const protectable = state.cases.filter((c) => c.def !== 'exam' && c.def !== 'inner');
  if (protectable.length && chance(rng, 0.5)) state.world.shoufu = pick(rng, protectable).uid;
  setupCases(state);
  for (const c of state.cases) state.beliefs[c.uid] = '';

  state.reportedTreasury = state.world.treasury;
  state.reportedGrain = state.world.grain;
  openingNotice(state);
  openingTasks(state);
  return state;
}

function openingNotice(state: GameState): void {
  const c = state.chars;
  const d = draft('notice', 'court', 'jingshi', 'court', '內閣呈：新君御極，百務待舉');
  d.fromLabel = '內閣';
  d.arriveTurn = 0;
  d.free = true;
  core(d, `皇上新登大寶。內閣首輔${c.shoufu.name}謹呈：天下十七處，邊鎮四、省十二、京畿一。國庫見存銀約三百萬兩，太倉糧約一百八十萬石。`, undefined, '你剛登基。天下分成 17 個地區：4 個邊防重鎮、12 個省、1 個京城。國庫大約有 300 萬兩，糧倉約 180 萬石。');
  core(d, '歲有常務：每四月定稅則，每兩月發邊餉，水旱災異隨時奏聞。皇上宜留意錢糧、兵備與人心。', undefined, '每隔一段時間會有固定的政務要你決定（稅、軍餉、災情……）。錢、糧、兵、民心、朝廷聲望，彼此牽動。');
  fluff(d, '凡奏牘到京，皆由內閣票擬呈覽。然票擬出於臣等之手，聖明自有權衡。', '所有奏摺都會先由內閣寫摘要（票擬）。摘要是首輔寫的——他未必全寫，也未必無私。');
  fluff(d, '【提示】這兩年間，天下會陸續發生幾件大事，有真有假。沒有人會先告訴你是哪幾件——你只能從奏報裡發現。按「玩法」可隨時查看說明；段落下方的「白話」可切換白話翻譯。', '遊戲提示：大事（疑案）會陸續浮現，要從奏報裡自己發現。');
  if (state.perk === 'insight') {
    const sb = state.world.shoufu;
    const cs = state.cases.find((x) => x.uid === sb);
    core(d, `【知人】${sb === 'clean' ? `朕在潛邸時已知：首輔${c.shoufu.name}為人清正，票擬可以倚信。` : `朕在潛邸時已知：首輔${c.shoufu.name}與${cs ? regionName(cs.region) : '外官'}方面私交甚篤，凡涉彼處之事，其票擬須留意。`}`);
  }
  post(state, d);
}
