// 開局：新君即位。人物（含四派）、各地、勢力、三股前朝勢力、後宮、官軍與流寇、抽疑案、開局文書。

import { drawCases, setupCases } from './cases';
import { core, draft, fluff, post } from './docs';
import { initPowers, POWERS } from './foreign';
import { ALL_REGIONS, REGIONS, regionName } from './geography';
import { makeConsort } from './harem';
import { CAPITAL_POSTS, makeGeneral, makeReserve } from './people';
import { chance, hashSeed, int, pick, range, type Rng } from './rng';
import { openingTasks } from './routine';
import type { Difficulty, FactionId, GameState, PerkId, RegionId, RegionState } from './types';
import { govId, makeChar } from './util';
import { raiseArmy, spawnArmy } from './war';
import { royalName } from './names';

export const PERKS: Record<PerkId, { name: string; desc: string }> = {
  diligent: { name: '勤政', desc: '精力上限 +1，每旬回復 +1。' },
  spies: { name: '潛邸舊人', desc: '有一位忠心的太監可以接掌東廠：隨時都能奪回東廠，不受權閹阻撓。' },
  treasury: { name: '內帑充盈', desc: '內帑多八十萬兩。' },
  granary: { name: '太倉充盈', desc: '太倉多六十萬石。' },
  insight: { name: '知人', desc: '開局就看透首輔與九千歲的底細（人物卡顯示確實資訊）。' },
  courier: { name: '驛傳迅捷', desc: '各地文書、旨意往返快約三成。' },
  censors: { name: '言路大開', desc: '言路 +25：彈章更多、更可信。' },
  beloved: { name: '東宮舊望', desc: '開局朝望 +15。' },
};

export const DIFFICULTY_NAME: Record<Difficulty, { name: string; desc: string }> = {
  easy: { name: '守成', desc: '國庫二百萬、無大旱、建州較弱、閹黨聲勢較小。適合第一次玩。' },
  normal: { name: '中興', desc: '國庫八十萬、欠餉三月、陝西大旱、闖營已起、建州五萬、閹黨掌東廠。' },
  hard: { name: '末世', desc: '國庫四十萬、欠餉五月、闖營三萬、建州七萬；皇叔必有異志。' },
};

export const MAX_TURN = 180;

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

/** 開局的派系分布 */
const OPENING_FACTION: Record<string, FactionId | null> = {
  shoufu: 'qing',
  cifu: 'yan',
  silijian: 'yan',
  dongchang: 'yan',
  jinyiwei: 'xun',
  jingying: 'xun',
  hubu: 'yan',
  bingbu: 'yan',
  libu: 'qing',
  rites: 'qing',
  gongbu: 'yan',
  xingbu: 'zhe',
  yushi: 'qing',
  jinglue: null,
  sanbian: 'zhe',
  dongjiang: 'xun',
  'gov:shaanxi': 'yan',
  'gov:henan': 'yan',
  'gov:shandong': 'yan',
  'gov:zhejiang': 'yan',
  'gov:jizhen': 'yan',
  'gov:gansu': 'yan',
  'gov:nanzhili': 'qing',
  'gov:jiangxi': 'qing',
  'gov:huguang': 'qing',
  'gov:shanxi': 'zhe',
  'gov:sichuan': 'zhe',
  'gov:fujian': 'zhe',
  'gov:liangguang': 'zhe',
  'gov:yungui': 'zhe',
  'gov:jingshi': 'zhe',
  'gov:xuanda': 'xun',
  'gov:liaodong': 'xun',
};

export function newRun(seed: string, perk: PerkId, opts: { cases?: string[]; difficulty?: Difficulty } = {}): GameState {
  const difficulty = opts.difficulty ?? 'normal';
  const rng: Rng = { s: hashSeed(seed) };
  const D = { easy: 0, normal: 1, hard: 2 }[difficulty];
  const energyMax = perk === 'diligent' ? 11 : 10;
  const regions = {} as Record<RegionId, RegionState>;
  for (const id of ALL_REGIONS) {
    const info = REGIONS[id];
    const outer = info.kind === 'outer';
    regions[id] = {
      unrest: outer ? 20 : int(rng, 15, 35),
      remitUntil: 0,
      pressUntil: 0,
      occupied: false,
      garrison: info.garrison * 0.75,
      morale: 0.75,
      reliefUntil: 0,
      taxPaid: info.tax * 0.7,
      grainPaid: info.grain,
      caseTaxMod: 1,
      sect: 0,
      roll: info.garrison,
      control: outer ? 0 : info.kind === 'border' ? 70 : int(rng, 65, 85),
      owner: outer ? '' : 'crown',
      levied: [],
      walls: info.kind === 'border' ? 0.2 : id === 'jingshi' ? 0.5 : 0,
    };
  }
  regions.shaanxi.unrest = [45, 72, 80][D];
  regions.shaanxi.control = 55;
  if (D > 0) {
    regions.shaanxi.disaster = { kind: '旱', until: 18, severity: [0, 0.8, 0.95][D] };
    regions.shanxi.unrest += 10;
  }
  const state: GameState = {
    version: 3,
    difficulty,
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
      treasury: [200, 80, 40][D],
      grain: [150, 120, 90][D] + (perk === 'granary' ? 60 : 0),
      privy: 60 + (perk === 'treasury' ? 80 : 0),
      jingying: [55000, 45000, 38000][D],
      jingyingMorale: 0.8,
      jingyingRoll: 80000,
      jingyingDrilled: false,
      prestige: [50, 40, 35][D] + (perk === 'beloved' ? 15 : 0),
      corruption: [45, 60, 68][D],
      speech: 35 + (perk === 'censors' ? 25 : 0),
      dowager: 50,
      factions: {
        yan: { grievance: 20, bonus: [-6, 0, 4][D] },
        qing: { grievance: 45, bonus: 0 },
        zhe: { grievance: 30, bonus: 0 },
        xun: { grievance: 30, bonus: 0 },
      },
      statuses: [],
      capital: 'jingshi',
      navy: 60,
      zxStreak: 0,
      once: {},
      taxPolicy: 'normal',
      borderArrears: [1, 3, 5][D],
      regions,
      armies: [],
      shoufu: 'clean',
      dongchang: perk === 'spies' ? 'eunuch' : 'eunuch',
      wrongful: [],
      events: [],
      treasuryLog: [],
      grainLog: [],
      negTreasury: 0,
      negGrain: 0,
      mods: { mineTaxUntil: 0, debasedTurn: 0, canalBlockedUntil: 0, seaTrade: false, saltMod: 1, suppressed: 0, postCut: false, stipendCut: false, surveyUntil: 0, surveyed: false, hongmaoTrade: false, firearms: false, settlers: 0 },
      last: { income: 38, expense: 30, salt: 5, grainIn: 8, grainOut: 8 },
      ledger: [],
      flows: [],
      emperor: { mood: 55, illness: null, reads: 0, leisure: {}, heirChance: 0, heirDue: 0, heirs: 0, restUntil: 0, elixirUntil: 0, fatigue: 0, spent: 0, leisureTurn: -1, leisureLog: {}, guardBonus: 0 },
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
    stats: { reads: 0, summons: 0, orders: 0, spies: 0, tasks: 0, overdraft: 0, exposed: 0, battles: 0, edicts: 0 },
    consorts: [],
    children: [],
    battles: [],
    intel: {},
    startOwned: 17,
  };

  // 京官與督師
  for (const p of CAPITAL_POSTS) {
    const f = OPENING_FACTION[p.id] ?? null;
    makeChar(state, p.id, p.name, p.region, p.kind, p.rank, { faction: f, integrity: f === 'yan' ? range(rng, 0.1, 0.45) : undefined });
  }
  const sj = state.chars.silijian;
  sj.integrity = 0.08;
  sj.competence = 0.85;
  sj.abil = { mil: 2, gov: 3, fin: 4, wit: 5 };
  sj.ambition = 95;
  sj.loyalty = 25;
  sj.stance = 'peace';
  sj.temper = 'harsh';
  sj.traits = ['圓滑'];
  sj.fame = 80;
  sj.age = 58;
  state.chars.dongchang.loyalty = 30;
  const jy = state.chars.jinyiwei;
  if (chance(rng, [0.15, 0.3, 0.5][D])) jy.faction = 'yan';
  jy.loyalty = int(rng, 45, 70);
  const jg = state.chars.jingying;
  if (chance(rng, [0.15, 0.35, 0.55][D])) jg.faction = 'yan';
  jg.loyalty = int(rng, 40, 65);
  const sf = state.chars.shoufu;
  sf.age = 68;
  sf.integrity = range(rng, 0.6, 0.95);
  sf.loyalty = 60;
  if (chance(rng, 0.5)) sf.traits = ['剛直'];
  const jl = state.chars.jinglue;
  jl.abil.mil = Math.max(jl.abil.mil, 4);
  jl.stance = 'war';
  const dj = state.chars.dongjiang;
  dj.integrity = 0.22;
  dj.ambition = 62;
  dj.loyalty = 45;
  dj.authority = 'free';
  dj.traits = ['擁兵自重'];
  dj.abil.mil = Math.max(dj.abil.mil, 3);
  // 地方長官
  for (const id of Object.keys(REGIONS) as RegionId[]) {
    const info = REGIONS[id];
    if (info.kind === 'outer') continue;
    const f = OPENING_FACTION[govId(id)] ?? null;
    makeChar(state, govId(id), info.gov, id, info.kind === 'border' ? 'military' : 'civil', id === 'jingshi' ? 3 : 1, { faction: f, integrity: f === 'yan' ? range(rng, 0.1, 0.45) : undefined });
  }
  // 皇叔
  const un = makeChar(state, 'uncle', '瑞王', 'henan', 'prince', 1, { name: royalName(rng), faction: null });
  un.age = 36;
  // 在野與候補
  const facs: (FactionId | null)[] = ['yan', 'qing', 'zhe', 'xun', null];
  for (let i = 0; i < 12; i++) makeReserve(state, 'civil', facs[i % 5]);
  for (let i = 0; i < 5; i++) makeReserve(state, 'military', facs[(i + 3) % 5]);
  for (let i = 0; i < 3; i++) makeReserve(state, 'eunuch', i === 0 ? 'yan' : null);
  if (perk === 'spies') {
    const loyal = makeReserve(state, 'eunuch', null);
    loyal.loyalty = 95;
    loyal.integrity = 0.8;
    loyal.name = '王' + loyal.name.slice(1);
    loyal.title = '潛邸舊人';
  }
  for (let i = 0; i < 6; i++) makeGeneral(state);

  // 後宮
  makeConsort(state, 6, 'qing', { temper: pick(rng, ['virtuous', 'clever'] as const), affection: 60, grace: 45, jealousy: 20 });
  makeConsort(state, 2, 'yan', { spy: chance(rng, 0.5), grace: 40 });
  makeConsort(state, 2, 'xun', { temper: pick(rng, ['spoiled', 'jealous'] as const), grace: 35 });

  // 外藩
  state.world.powers = initPowers(state);
  for (const p of POWERS) for (const r of p.owns) regions[r].owner = p.id;

  // 官軍
  const dja = raiseArmy(state, { region: 'chaoxian', size: 20000, unit: 'liao', label: '東江兵', commander: 'dongjiang', caseId: 'dongjiang', roll: 40000 });
  dja.morale = 55;
  dja.mission = 'hold';
  raiseArmy(state, { region: 'liaodong', size: 15000, unit: 'guanning', label: '關寧軍', commander: 'jinglue', roll: 18000, caseId: 'border-army' }).morale = 65;
  raiseArmy(state, { region: 'shaanxi', size: 10000, unit: 'qin', label: '秦兵', commander: 'sanbian', roll: 14000, caseId: 'border-army' }).morale = 55;
  for (const id of ['dongjiang', 'jinglue', 'sanbian']) state.chars[id].status = 'active';

  // 闖營
  spawnArmy(state, { caseId: 'chuang', label: '闖營', side: 'bandit', size: [6000, 15000, 30000][D], region: 'shaanxi', path: REGIONS.shaanxi.toCapital, growth: [1.01, 1.025, 1.03][D], moveIn: 12, unit: 'liukou' });

  state.cases = drawCases(state, 5, opts.cases);
  const protectable = state.cases.filter((c) => c.def !== 'exam' && c.def !== 'eunuch' && c.def !== 'uncle');
  if (protectable.length && chance(rng, 0.5)) state.world.shoufu = pick(rng, protectable).uid;
  setupCases(state);
  for (const c of state.cases) state.beliefs[c.uid] = '';

  if (perk === 'insight') {
    for (const id of ['shoufu', 'silijian']) {
      const c = state.chars[id];
      state.intel[id] = { abil: { ...c.abil }, integrity: c.integrity, loyalty: c.loyalty, faction: c.faction, turn: 0 };
    }
  }

  state.reportedTreasury = Math.round(state.world.treasury * 1.25);
  state.reportedGrain = state.world.grain;
  openingNotice(state);
  openingTasks(state);
  return state;
}

function openingNotice(state: GameState): void {
  const c = state.chars;
  const w = state.world;
  const d = draft('notice', 'court', 'jingshi', 'court', '內閣呈：新君御極，百務待舉');
  d.fromLabel = '內閣';
  d.arriveTurn = 0;
  d.free = true;
  core(d, `皇上新登大寶。內閣首輔${c.shoufu.name}謹呈：國庫見存銀約${Math.round(state.reportedTreasury)}萬兩，太倉糧約${Math.round(w.grain)}萬石；九邊欠餉${Math.round(w.borderArrears)}月；陝西告旱，饑民嘯聚。`, '國庫將盡，邊餉積欠，陝西不靖', `你剛登基。戶部說國庫約 ${Math.round(state.reportedTreasury)} 萬兩（戶部侍郎是閹黨，可能灌水）、存糧約 ${Math.round(w.grain)} 萬石；邊軍欠餉 ${Math.round(w.borderArrears)} 個月；陝西旱災、饑民聚集。每旬的收支本來就是赤字。`);
  core(d, `司禮監掌印${c.silijian.name}，先帝時提督東廠，內外稱「九千歲」。皇叔瑞王${c.uncle.name}就藩河南。慈寧宮皇太后、顧命諸臣，俱望聖明。`, '九千歲掌司禮監與東廠；皇叔在河南', '先帝留下三股勢力：①九千歲：掌司禮監（批紅）與東廠（密探），閹黨占了半個朝廷；②皇叔瑞王：先帝寵愛的弟弟；③太后與顧命老臣：用「祖制」約束你。');
  fluff(d, '【開局三問】一、東廠不在朕手：奪回之前，密報都可能被過濾。二、國庫將盡：照目前收支，十餘旬便見底。三、陝西不靖：巡撫說無事，傳聞卻說饑民嘯聚。', '開局三問：奪回東廠、救國庫、平陝西。');
  fluff(d, '【玩法】左邊是奏摺匣：看票擬免費、細讀耗精力。下方是詔書列：徵兵、調兵、任免、外交……每道都有執行時間。中間的輿圖可以點地區、部隊、外藩。各部大臣依「授權」自行處理例行事務，處分錄在奏摺匣裡。精力不會回滿，可以透支，但會積勞成疾。', '玩法提示');
  if (state.perk === 'insight') core(d, `【知人】朕在潛邸時已知：首輔${c.shoufu.name}${state.world.shoufu === 'clean' ? '清正可倚' : '另有私交，凡涉其私者須留意'}；九千歲其心叵測。`, '知人');
  post(state, d);
}

export { regionName };
