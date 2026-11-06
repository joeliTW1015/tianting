// 認知層：UI 唯一的資料入口。只包含玩家「收到過的」資訊與自己知道的事，不含任何真相。

import { caseTitle, CASE_DEFS } from './cases';
import { discoveredCases } from './actions';
import { energyCap, FATIGUE_TEXT, fatigueBand, ILL_TEXT, LEISURE, leisureBlock, leisureHint, MOOD_TEXT, moodBand, PROJECTS, projectState } from './palace';
import { isFloodSeason } from './calendar';
import { alive, foreignActions, POWERS, STANDING_TEXT } from './foreign';
import { hashSeed } from './rng';
import { ALL_REGIONS, REGION_ORDER, REGIONS, regionName, travelTurns } from './geography';
import { balanced, clout, dominant } from './factions';
import { affectionText, CONSORT_TEMPER, RANKS } from './harem';
import { DOWAGER_TEXT, guardLevel, GUARD_TEXT } from './intrigue';
import { oddsText } from './intel';
import { abilReport, abilText, allPosts, AUTH_TEXT, demeanor, FACTION_COLOR, FACTION_NAME, FACTIONS, postOf, STANCE_TEXT, TEMPER_TEXT } from './people';
import { STATUS_DEFS } from './statuses';
import { zhongxing } from './tick';
import { CARDS, crownArmies, MORALE_TEXT, moraleBand, UNITS } from './war';
import type { Abilities, Authority, BattleRecord, CharId, CharKind, Choice, Claim, Decision, Difficulty, DocKind, FactionId, FlowEntry, GameState, LedgerEntry, PerkId, RegionId, Request, Trust } from './types';

export interface ParaView {
  text: string;
  plain?: string;
  tag: 'core' | 'clue' | 'fluff';
  omitted: boolean;
}

export interface DocView {
  id: number;
  kind: DocKind;
  from: string;
  fromLabel: string;
  fromLook?: number;
  fromKind?: CharKind;
  fromRank?: number;
  region: RegionId;
  topic: string;
  topicTitle?: string;
  sentTurn: number;
  arriveTurn: number;
  title: string;
  summary: string;
  recommend?: string;
  paras: ParaView[] | null;
  claims: Claim[] | null;
  request?: Request;
  decision?: Decision;
  task?: { choices: Choice[]; chosen?: string; deadline: number; fallback: string; recommend?: string; delegate?: { by: string; byLook?: number; choice: string; label: string; why: string } };
  highlight?: string;
  read: boolean;
  free: boolean;
  urgent: boolean;
  isNew: boolean;
  importance: number;
  certified: boolean;
  battleId?: number;
  lot?: { tier: number; ok: boolean; label: string };
  delegatedBy?: string;
}

export interface KnownFact {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  source: string;
  sentTurn: number;
  docId: number;
}

export interface RegionView {
  id: RegionId;
  lastNews: number | null;
  facts: KnownFact[];
  note: string;
  gov: CharView;
  inTransit: number;
  urgent: boolean;
  /** 據報已陷落（敵軍名號） */
  held?: string;
  /** 最近所報的敵軍 */
  foe?: { size: number; turn: number; source: string };
  owner: string;
  ownerName: string;
  ownerColor: string;
  control: number;
  /** 據報兵數（最新一筆） */
  troops?: { value: number; source: string; turn: number; certified: boolean };
}

export interface OrderView {
  id: number;
  kind: string;
  label: string;
  region: RegionId;
  issuedTurn: number;
  arriveTurn: number;
  returnTurn?: number;
  delivered: boolean;
}

export interface CharView {
  id: CharId;
  name: string;
  title: string;
  region: RegionId;
  kind: CharKind;
  rank: number;
  look: number;
  trust?: Trust;
  docCount: number;
  term: number;
}

export interface CaseView {
  uid: string;
  title: string;
  region: RegionId;
  question: string;
  options: { value: string; label: string }[];
  firstSeen: number;
}

export interface FinanceView {
  /** 戶部帳冊（晚一旬） */
  ledger: LedgerEntry[];
  /** 你自己的撥款、政務支出與抄沒入帳 */
  flows: FlowEntry[];
  /** 各省實解錢糧（來自戶部錢糧總冊） */
  regionTax: Record<RegionId, { turn: number; value: number }[]>;
  /** 各地民情（你讀過的奏報與匯錄） */
  regionMood: Record<RegionId, { turn: number; value: string; source: string }[]>;
}

export interface PalaceView {
  /** 0～4，只給描述 */
  moodBand: number;
  moodText: string;
  ill: { kind: string; text: string; severity: number } | null;
  capReasons: string[];
  heirs: number;
  westerner: boolean;
  buffs: string[];
  projects: { id: string; name: string; cost: number; turns: number; effect: string; privy: boolean; status: 'idle' | 'building' | 'done'; doneTurn?: number; locked: boolean }[];
  leisure: { id: string; name: string; energy: number; silver: number; privy: number; desc: string; hint: string; block: string | null }[];
}

export type AgendaKind = 'order' | 'report' | 'arrival' | 'army' | 'project' | 'deadline' | 'calendar' | 'palace';

export interface AgendaItem {
  turn: number;
  kind: AgendaKind;
  text: string;
  /** 預估（可能延誤、可能不來） */
  approx?: boolean;
  docId?: number;
  look?: number;
  charKind?: CharKind;
}

export interface ArmyView {
  id: number;
  label: string;
  region: RegionId;
  unit: string;
  /** 據報（名冊）兵數 */
  reported: number;
  /** 點驗、監軍、親征時的實數 */
  real?: number;
  commander?: { id: string; name: string; look: number; kind: CharKind; stance: string; authority: Authority };
  morale: string;
  moraleBand: number;
  mission: string;
  path: RegionId[];
  eta?: number;
  stratagem?: string;
  posture?: string;
  campaign: boolean;
  fromCapital: boolean;
}

export interface PowerView {
  id: string;
  name: string;
  kind: string;
  color: string;
  desc: string;
  standing: string;
  alive: boolean;
  regions: RegionId[];
  home: RegionId;
  stance?: { value: string; source: string; turn: number };
  strength?: { value: number; source: string; turn: number };
  trade: boolean;
  tributePay: number;
  allyPay: number;
  raids: number;
  look: number;
  actions: { kind: string; label: string; desc: string; energy: number; silver: number; block?: string; odds?: string; done: boolean }[];
}

export interface OfficialView {
  id: CharId;
  post: string;
  name: string;
  look: number;
  kind: CharKind;
  rank: number;
  region: RegionId;
  faction: FactionId | null;
  stance: string;
  temper: string;
  traits: string[];
  abil: Abilities;
  abilSource: string;
  certified: boolean;
  demeanor: string;
  authority: Authority;
  delegable: boolean;
  age: number;
  fame: number;
  intel?: { integrity: string; loyalty: string; faction: string };
  trust?: Trust;
  term: number;
}

export interface ConsortView {
  id: string;
  name: string;
  rank: number;
  rankName: string;
  family: FactionId | null;
  temper: string;
  affection: string;
  grace: number;
  pregnant: boolean;
  status: string;
  look: number;
}

export interface PlayerView {
  seed: string;
  difficulty: Difficulty;
  fatigue: { band: number; text: string };
  regen: number;
  speechBand: number;
  dowager: string;
  guard: string;
  dongchang: 'eunuch' | 'crown';
  capital: RegionId;
  relocating?: { kind: string; until: number };
  factions: { id: FactionId; name: string; color: string; clout: number; grievance: number }[];
  dominant: FactionId | null;
  balanced: boolean;
  statuses: { id: string; name: string; left: number; desc: string; good: boolean }[];
  armies: ArmyView[];
  powers: PowerView[];
  officials: OfficialView[];
  consorts: ConsortView[];
  children: { id: string; name: string; son: boolean; mother: string; born: number; alive: boolean; heir: boolean }[];
  battles: BattleRecord[];
  navy: number;
  zhongxing: { label: string; ok: boolean | null }[];
  leisureUsed: boolean;
  orderLog: { id: number; label: string; issued: number; arrive: number; done: number; applied: boolean }[];
  turn: number;
  maxTurn: number;
  perk: PerkId;
  energy: number;
  energyMax: number;
  treasury: number;
  grain: number;
  privy: number;
  jingying: number;
  inField: number;
  prestigeBand: number;
  taxPolicy: 'light' | 'normal' | 'heavy';
  borderArrears: number;
  inbox: DocView[];
  regions: Record<RegionId, RegionView>;
  orders: OrderView[];
  chars: CharView[];
  cases: CaseView[];
  beliefs: Record<string, string>;
  log: { turn: number; text: string }[];
  finance: FinanceView;
  palace: PalaceView;
  agenda: AgendaItem[];
  over: GameState['over'];
}

function charView(state: GameState, id: CharId, docCount: number): CharView {
  const c = state.chars[id];
  return { id: c.id, name: c.name, title: c.title, region: c.region, kind: c.kind, rank: c.rank, look: c.look, trust: state.trust[c.id], docCount, term: c.term };
}

export function factRegion(state: GameState, key: string): RegionId | null {
  const [head, tail] = key.split('.');
  if (['unrest', 'tax', 'fame', 'held', 'foe', 'heads', 'loss'].includes(head)) return tail as RegionId;
  if (head === 'stance' || head === 'power') return null;
  if (head === 'guilt') return state.chars[tail]?.region ?? null;
  const c = state.cases.find((x) => x.uid === head);
  return c ? c.region : null;
}

export function playerView(state: GameState): PlayerView {
  const w = state.world;
  const arrived = state.docs.filter((d) => d.arriveTurn <= state.turn);
  const docCount: Record<string, number> = {};
  for (const d of arrived) docCount[d.from] = (docCount[d.from] ?? 0) + 1;
  const known = discoveredCases(state);
  const titles = new Map(known.map((c) => [c.uid, caseTitle(c)]));

  const inbox: DocView[] = arrived
    .map((d) => {
      const ch = state.chars[d.from];
      return {
        id: d.id,
        kind: d.kind,
        from: d.from,
        fromLabel: d.fromLabel,
        fromLook: ch?.look,
        fromKind: ch?.kind,
        fromRank: ch?.rank,
        region: d.region,
        topic: d.topic,
        topicTitle: titles.get(d.topic),
        sentTurn: d.sentTurn,
        arriveTurn: d.arriveTurn,
        title: d.title,
        summary: d.summary,
        recommend: d.recommend,
        paras: d.read ? d.paras.map((p) => ({ text: p.text, plain: p.plain, tag: p.tag, omitted: !d.free && !!p.brief && !p.inSummary })) : null,
        claims: d.read ? d.claims.map((c) => ({ ...c })) : null,
        request: d.request ? { ...d.request } : undefined,
        decision: d.decision,
        task: d.task
          ? {
              choices: d.task.choices,
              chosen: d.task.chosen,
              deadline: d.task.deadline,
              fallback: d.task.fallback,
              recommend: d.task.recommend,
              delegate: d.task.delegate
                ? { by: `${state.chars[d.task.delegate.by]?.title ?? ''}${state.chars[d.task.delegate.by]?.name ?? ''}`, byLook: state.chars[d.task.delegate.by]?.look, choice: d.task.delegate.choice, label: d.task.choices.find((c) => c.id === d.task!.delegate!.choice)?.label ?? '', why: d.task.delegate.why }
                : undefined,
            }
          : undefined,
        highlight: d.highlight,
        read: d.read,
        free: !!d.free,
        urgent: !!d.urgent,
        isNew: d.arriveTurn === state.turn,
        importance: d.importance ?? (d.urgent ? 3 : d.request ? 2 : 1),
        certified: !!d.certified,
        battleId: d.battleId,
        lot: d.lot,
        delegatedBy: d.delegatedBy ? `${state.chars[d.delegatedBy]?.title ?? ''}${state.chars[d.delegatedBy]?.name ?? ''}` : undefined,
      };
    })
    .sort((a, b) => b.arriveTurn - a.arriveTurn || Number(b.urgent) - Number(a.urgent) || b.id - a.id);

  const regions = {} as Record<RegionId, RegionView>;
  for (const id of ALL_REGIONS) {
    const reg = w.regions[id];
    const owner = REGIONS[id].kind === 'outer' ? reg.owner : 'crown';
    const pd = POWERS.find((p) => p.id === owner);
    regions[id] = {
      id,
      lastNews: null,
      facts: [],
      note: state.notes[id] ?? '',
      gov: charView(state, state.chars[`gov:${id}`] ? `gov:${id}` : 'shoufu', docCount[`gov:${id}`] ?? 0),
      inTransit: state.orders.filter((o) => o.region === id && o.status === 'transit' && state.turn < o.arriveTurn).length,
      urgent: false,
      owner,
      ownerName: owner === 'crown' ? '本朝' : pd?.name ?? owner,
      ownerColor: owner === 'crown' ? '#c9b48a' : pd?.color ?? '#888',
      control: Math.round(reg.control),
    };
  }
  for (const d of arrived) {
    const rv = regions[d.region];
    if (d.kind !== 'audience' && d.kind !== 'rumor' && d.kind !== 'digest' && (rv.lastNews === null || d.sentTurn > rv.lastNews)) rv.lastNews = d.sentTurn;
    if (d.urgent && state.turn - d.arriveTurn <= 3) rv.urgent = true;
    if (!d.read) continue;
    for (const c of d.claims) {
      const target = factRegion(state, c.key) ?? d.region;
      regions[target].facts.push({ ...c, source: d.fromLabel, sentTurn: d.sentTurn, docId: d.id });
    }
  }
  for (const id of ALL_REGIONS) regions[id].facts.sort((a, b) => b.sentTurn - a.sentTurn || b.docId - a.docId);
  // 據報兵數：兵部冊報、點驗、東廠（不必細讀）
  for (const d of [...arrived].sort((a, b) => a.sentTurn - b.sentTurn)) {
    for (const c of d.claims) {
      const [head, tail] = c.key.split('.');
      if (head !== 'troops' || typeof c.value !== 'number') continue;
      const rv = regions[tail as RegionId];
      if (rv && (!rv.troops || !rv.troops.certified || d.certified)) rv.troops = { value: c.value, source: d.fromLabel, turn: d.sentTurn, certified: !!d.certified };
    }
  }
  // 陷落與敵情：飛報不必細讀也知道
  for (const d of [...arrived].sort((a, b) => a.sentTurn - b.sentTurn)) {
    for (const c of d.claims) {
      const [head, tail] = c.key.split('.');
      const rv = regions[tail as RegionId];
      if (!rv) continue;
      if (head === 'held') rv.held = c.value === '已收復' ? undefined : String(c.value);
      if (head === 'foe' && typeof c.value === 'number' && state.turn - d.sentTurn <= 5) rv.foe = c.value > 0 ? { size: c.value, turn: d.sentTurn, source: d.fromLabel } : undefined;
      if (head === 'held' && c.value === '已收復') rv.foe = undefined;
    }
  }

  const orders: OrderView[] = state.orders
    .filter((o) => o.kind !== 'task')
    .map((o) => ({ id: o.id, kind: o.kind, label: o.label, region: o.region, issuedTurn: o.issuedTurn, arriveTurn: o.arriveTurn, returnTurn: o.returnTurn, delivered: state.turn >= o.arriveTurn }))
    .sort((a, b) => b.issuedTurn - a.issuedTurn || b.id - a.id);

  const relevant = new Set<CharId>();
  for (const id of Object.keys(state.chars)) {
    if (!id.includes(':') || id.startsWith('gov:') || docCount[id]) relevant.add(id);
  }
  const chars = [...relevant].map((id) => charView(state, id, docCount[id] ?? 0));

  const cases: CaseView[] = known.map((c) => {
    const def = CASE_DEFS[c.def];
    const first = Math.min(...arrived.filter((d) => d.topic === c.uid).map((d) => d.arriveTurn));
    return { uid: c.uid, title: caseTitle(c), region: c.region, question: def.question, options: def.branches.map((b) => ({ value: b.id, label: b.label })), firstSeen: first };
  });

  const field = crownArmies(state).filter((a) => a.fromCapital).reduce((n, a) => n + a.size, 0);
  const p = w.prestige;
  const cl = clout(state);
  const battleIds = new Set(arrived.filter((d) => d.battleId).map((d) => d.battleId));

  return {
    seed: state.seed,
    difficulty: state.difficulty,
    fatigue: { band: fatigueBand(w.emperor.fatigue), text: FATIGUE_TEXT[fatigueBand(w.emperor.fatigue)] },
    regen: energyCap(state).regen,
    speechBand: w.speech >= 70 ? 4 : w.speech >= 50 ? 3 : w.speech >= 30 ? 2 : w.speech >= 15 ? 1 : 0,
    dowager: DOWAGER_TEXT(w.dowager),
    guard: GUARD_TEXT[guardLevel(state)],
    dongchang: w.dongchang,
    capital: w.capital,
    relocating: w.relocating,
    factions: FACTIONS.map((f) => ({ id: f, name: FACTION_NAME[f], color: FACTION_COLOR[f], clout: cl[f], grievance: Math.round(w.factions[f].grievance) })),
    dominant: dominant(state),
    balanced: balanced(state),
    statuses: w.statuses.filter((x) => x.until > state.turn).map((x) => ({ id: x.id, name: x.name, left: x.until - state.turn, desc: x.desc, good: STATUS_DEFS[x.id]?.good ?? true })),
    armies: armyViews(state),
    powers: powerViews(state, arrived),
    officials: officialViews(state),
    consorts: state.consorts.map((c) => ({ id: c.id, name: state.chars[c.id]?.name ?? '', rank: c.rank, rankName: RANKS[c.rank], family: c.family, temper: CONSORT_TEMPER[c.temper], affection: affectionText(c.affection), grace: Math.round(c.grace), pregnant: !!c.pregnantUntil && arrived.some((d) => d.title.includes('宮中有喜')), status: c.status, look: state.chars[c.id]?.look ?? 0 })),
    children: state.children.map((c) => ({ ...c, mother: state.chars[c.mother]?.name ?? '', heir: state.heir === c.id })),
    battles: state.battles.filter((b) => battleIds.has(b.id)).map((b) => ({ ...b, truth: undefined }) as BattleRecord),
    navy: w.navy,
    zhongxing: zhongxing(state).map((z, i) => ({ label: z.label, ok: [2, 3, 7].includes(i) ? null : i === 5 ? state.reportedTreasury >= 120 : z.ok })),
    leisureUsed: w.emperor.leisureTurn === state.turn,
    orderLog: state.orders
      .filter((o) => o.edict)
      .map((o) => ({ id: o.id, label: o.label, issued: o.issuedTurn, arrive: o.arriveTurn, done: o.doneTurn ?? o.arriveTurn, applied: !!o.applied }))
      .sort((a, b) => b.issued - a.issued || b.id - a.id),
    turn: state.turn,
    maxTurn: state.maxTurn,
    perk: state.perk,
    energy: state.energy,
    energyMax: state.energyCap,
    treasury: state.reportedTreasury,
    grain: state.reportedGrain,
    privy: w.privy,
    jingying: w.jingying,
    inField: field,
    prestigeBand: p >= 75 ? 4 : p >= 55 ? 3 : p >= 35 ? 2 : p >= 15 ? 1 : 0,
    taxPolicy: w.taxPolicy,
    borderArrears: w.borderArrears,
    inbox,
    regions,
    orders,
    chars,
    cases,
    beliefs: Object.fromEntries(Object.entries(state.beliefs).filter(([k]) => k === 'shoufu' || known.some((c) => c.uid === k))),
    log: [...state.log],
    finance: financeView(state, regions),
    palace: palaceView(state),
    agenda: agendaView(state),
    over: state.over,
  };
}

export const PRESTIGE_TEXT = ['民怨沸騰', '物議洶洶', '人心浮動', '頗孚眾望', '聖德遠播'];
export const SPEECH_TEXT = ['言路閉塞', '言路壅塞', '言路尚通', '言路暢通', '言路大開'];

function armyViews(state: GameState): ArmyView[] {
  const w = state.world;
  return crownArmies(state).map((a) => {
    const c = a.commander ? state.chars[a.commander] : null;
    const honest = w.emperor.campaignArmy === a.id || !!w.cooldown[`mon:${a.id}`] || (a.roll ?? a.size) <= a.size * 1.02;
    return {
      id: a.id,
      label: a.label,
      region: a.region,
      unit: UNITS[a.unit]?.name ?? a.unit,
      reported: Math.round(a.roll ?? a.size),
      real: honest ? Math.round(a.size) : undefined,
      commander: c ? { id: c.id, name: c.name, look: c.look, kind: c.kind, stance: STANCE_TEXT[c.stance], authority: c.authority } : undefined,
      morale: MORALE_TEXT[moraleBand(a.morale)],
      moraleBand: moraleBand(a.morale),
      mission: a.mission === 'suppress' ? '進剿' : a.mission === 'march' ? (a.dest === w.capital ? '班師' : '行軍') : a.path.length ? '行軍' : '駐守',
      path: a.path.slice(),
      eta: a.path.length ? a.nextMove : undefined,
      stratagem: a.stratagem ? CARDS[a.stratagem.card]?.name : undefined,
      posture: a.posture === 'attack' ? '催戰' : a.posture === 'hold' ? '禁戰' : undefined,
      campaign: w.emperor.campaignArmy === a.id,
      fromCapital: !!a.fromCapital,
    };
  });
}

function powerViews(state: GameState, arrived: GameState['docs']): PowerView[] {
  const w = state.world;
  return POWERS.map((p) => {
    let stance: PowerView['stance'];
    let strength: PowerView['strength'];
    let raids = 0;
    for (const d of arrived) {
      if (d.topic !== `foreign:${p.id}`) continue;
      if (d.urgent && (d.title.includes('犯邊') || d.title.includes('入寇'))) raids += 1;
      for (const c of d.claims) {
        if (c.key === `stance.${p.id}` && (!stance || d.sentTurn >= stance.turn)) stance = { value: String(c.value), source: d.fromLabel, turn: d.sentTurn };
        if (c.key === `power.${p.id}` && typeof c.value === 'number' && (!strength || d.sentTurn >= strength.turn)) strength = { value: c.value, source: d.fromLabel, turn: d.sentTurn };
      }
    }
    const ps = w.powers[p.id];
    return {
      id: p.id,
      name: p.name,
      kind: { enemy: '鄰敵', tributary: '藩屬', sea: '海上', minor: '小部' }[p.kind],
      color: p.color,
      desc: p.desc,
      standing: STANDING_TEXT[ps.standing],
      alive: alive(state, p.id),
      regions: ALL_REGIONS.filter((r) => w.regions[r].owner === p.id),
      home: p.home,
      stance,
      strength,
      trade: ps.trade,
      tributePay: ps.tributePay,
      allyPay: ps.allyPay,
      raids,
      look: hashSeed(state.seed + p.id),
      actions: foreignActions(state, p.id).map((a) => ({ kind: a.kind, label: a.label, desc: a.desc, energy: a.energy, silver: a.silver, block: a.block, odds: a.odds !== undefined ? oddsText(a.odds) : undefined, done: state.orders.some((o) => o.edict === `dip:${a.kind}` && o.target === p.id && o.issuedTurn === state.turn) })),
    };
  });
}

const LOYAL_TEXT = (v: number) => (v >= 70 ? '忠心耿耿' : v >= 45 ? '尚屬安分' : v >= 25 ? '心懷怨望' : '包藏禍心');

function officialViews(state: GameState): OfficialView[] {
  return allPosts(state).map((id) => {
    const c = state.chars[id];
    const p = postOf(state, id)!;
    const ar = abilReport(state, id);
    const it = state.intel[id];
    return {
      id,
      post: p.name,
      name: c.name,
      look: c.look,
      kind: c.kind,
      rank: c.rank,
      region: c.region,
      faction: c.faction,
      stance: STANCE_TEXT[c.stance],
      temper: TEMPER_TEXT[c.temper],
      traits: c.traits.slice(),
      abil: ar.abil,
      abilSource: ar.source,
      certified: ar.certified,
      demeanor: demeanor(c),
      authority: c.authority,
      delegable: p.delegable,
      age: Math.round(c.age),
      fame: c.fame,
      intel: it ? { integrity: (it.integrity ?? 0.5) >= 0.7 ? '廉潔' : (it.integrity ?? 0.5) >= 0.45 ? '平常' : '貪墨', loyalty: LOYAL_TEXT(it.loyalty ?? 50), faction: it.faction ? FACTION_NAME[it.faction] : '無黨' } : undefined,
      trust: state.trust[id],
      term: c.term,
    };
  });
}

export { abilText, AUTH_TEXT };
export { REGIONS };

function financeView(state: GameState, regions: Record<RegionId, RegionView>): FinanceView {
  const w = state.world;
  const regionTax = {} as FinanceView['regionTax'];
  const regionMood = {} as FinanceView['regionMood'];
  for (const id of REGION_ORDER) {
    const facts = regions[id].facts;
    regionTax[id] = facts
      .filter((f) => f.key === `tax.${id}` && typeof f.value === 'number')
      .map((f) => ({ turn: f.sentTurn, value: f.value as number }))
      .sort((a, b) => a.turn - b.turn);
    regionMood[id] = facts
      .filter((f) => f.key === `unrest.${id}`)
      .map((f) => ({ turn: f.sentTurn, value: String(f.value), source: f.source }))
      .sort((a, b) => a.turn - b.turn);
  }
  return {
    ledger: w.ledger.filter((e) => e.turn < state.turn).map((e) => ({ ...e })),
    flows: w.flows.map((f) => ({ ...f })),
    regionTax,
    regionMood,
  };
}

function palaceView(state: GameState): PalaceView {
  const w = state.world;
  const e = w.emperor;
  const band = moodBand(e.mood);
  return {
    moodBand: band,
    moodText: MOOD_TEXT[band],
    ill: e.illness ? { kind: e.illness.kind, text: ILL_TEXT[e.illness.severity], severity: e.illness.severity } : null,
    capReasons: energyCap(state).reasons,
    heirs: e.heirs,
    westerner: w.westerner,
    buffs: Object.keys(w.buffs),
    projects: PROJECTS.map((p) => {
      const st = projectState(state, p.id);
      return {
        id: p.id,
        name: p.name,
        cost: p.cost,
        turns: p.turns,
        effect: p.effect,
        privy: !!p.privy,
        status: st,
        doneTurn: w.projects.find((x) => x.id === p.id)?.done,
        locked: !!p.needWest && !w.westerner,
      };
    }),
    leisure: LEISURE.map((l) => ({ id: l.id, name: l.name, energy: l.energy, silver: l.silver ?? 0, privy: l.privy ?? 0, desc: l.desc, hint: leisureHint(state, l), block: leisureBlock(state, l.id) })),
  };
}

const CAL_HORIZON = 12;

/** 各種查核由誰回報 */
const REPORT_FROM: Record<string, string> = { spy: 'dongchang', envoy: 'yushi', inspect: 'gongbu', audit: 'hubu', registry: 'court', retest: 'rites' };

/** 行程：玩家已知、未來會發生或送達的事 */
function agendaView(state: GameState): AgendaItem[] {
  const t = state.turn;
  const w = state.world;
  const out: AgendaItem[] = [];
  const arrived = state.docs.filter((d) => d.arriveTurn <= t);

  for (const o of state.orders) {
    if (o.kind === 'task') continue;
    const travel = Math.max(travelTurns(state, o.region), 1);
    if (o.status === 'transit' && t < o.arriveTurn) out.push({ turn: o.arriveTurn, kind: 'order', text: `旨意「${o.label}」送抵${regionName(o.region)}` });
    if (o.returnTurn !== undefined && o.returnTurn > t - 1) {
      const from = REPORT_FROM[o.kind];
      const back = arrived.some((d) => d.from === from && d.sentTurn >= o.issuedTurn && d.region === o.region);
      if (!back) out.push({ turn: Math.max(t, o.returnTurn), kind: 'report', text: `「${o.label}」的回報抵京`, approx: o.returnTurn < t });
    }
    // 奉召入京的官員
    if ((o.kind === 'recall' || o.kind === 'summon') && o.person !== undefined) {
      const ch = state.chars[o.person];
      if (!ch) continue;
      const came = arrived.some((d) => d.from === ch.id && d.sentTurn >= o.issuedTurn && (d.kind === 'audience' || d.title.includes('辭召') || d.title.includes('緩期')));
      if (!came) {
        const eta = o.issuedTurn + travel + Math.max(travelTurns(state, o.region), 1);
        out.push({ turn: Math.max(t, eta), kind: 'arrival', text: `${ch.title}${ch.name}奉召赴京陛見`, approx: true, look: ch.look, charKind: ch.kind });
      }
    }
  }
  for (const o of state.orders) {
    if (o.kind === 'summon' && o.caseId) {
      const c = state.cases.find((x) => x.uid === o.caseId);
      const pid = c?.actors.prince;
      if (!pid) continue;
      const ch = state.chars[pid];
      const came = arrived.some((d) => d.from === pid && d.sentTurn >= o.issuedTurn && (d.kind === 'audience' || d.title.includes('辭召')));
      if (!came && !out.some((x) => x.kind === 'arrival' && x.text.startsWith(`${ch.title}${ch.name}`))) {
        out.push({ turn: Math.max(t, o.arriveTurn + 2), kind: 'arrival', text: `${ch.title}${ch.name}奉召入覲`, approx: true, look: ch.look, charKind: ch.kind });
      }
    }
  }
  for (const a of crownArmies(state)) {
    if (a.path.length && a.dest) out.push({ turn: a.nextMove + Math.max(0, a.path.length - 1), kind: 'army', text: `${a.label}抵${regionName(a.dest)}`, approx: a.path.length > 1 });
  }
  for (const o of state.orders) {
    if (!o.edict || o.applied) continue;
    out.push({ turn: o.doneTurn ?? o.arriveTurn, kind: 'order', text: `詔書「${o.label}」${(o.doneTurn ?? 0) > o.arriveTurn ? '執行完畢' : '送達生效'}` });
  }
  for (const c of state.consorts) if (c.pregnantUntil && arrived.some((d) => d.title.includes('宮中有喜'))) out.push({ turn: c.pregnantUntil, kind: 'palace', text: `${state.chars[c.id]?.name ?? ''}預計誕育`, approx: true });
  for (const p of w.projects) if (!p.complete) out.push({ turn: p.done, kind: 'project', text: `${PROJECTS.find((x) => x.id === p.id)?.name}預計告成` });
  for (const d of arrived) {
    if (d.task && !d.task.chosen && d.task.deadline >= t) out.push({ turn: d.task.deadline, kind: 'deadline', text: `〈${d.title}〉裁決期限（逾期依例）`, docId: d.id });
  }
  if (w.emperor.restUntil > t) out.push({ turn: w.emperor.restUntil, kind: 'palace', text: '罷朝靜養期滿' });

  // 例行的朝廷行事曆
  for (let k = t + 1; k <= Math.min(t + CAL_HORIZON, state.maxTurn - 1); k++) {
    const m = k % 36;
    if (k % 6 === 2) out.push({ turn: k, kind: 'calendar', text: '戶部請發四邊兩月餉銀' });
    if (k % 12 === 0) out.push({ turn: k, kind: 'calendar', text: '戶部請定本期稅則' });
    if (m === 18) out.push({ turn: k, kind: 'calendar', text: '吏部京察大計' });
    if (m === 33) out.push({ turn: k, kind: 'calendar', text: '冬至郊祀' });
    if (m === 1) out.push({ turn: k, kind: 'calendar', text: '上元燈節' });
    if (m === 14) out.push({ turn: k, kind: 'calendar', text: '端陽節' });
    if (m === 23) out.push({ turn: k, kind: 'calendar', text: '中秋節' });
    if (m === 26) out.push({ turn: k, kind: 'calendar', text: '刑部秋決勾決' });
    if (isFloodSeason(k) && !isFloodSeason(k - 1)) out.push({ turn: k, kind: 'calendar', text: '伏秋大汛開始（黃河沿岸須防決堤）' });
  }
  return out.filter((x) => x.turn >= t).sort((a, b) => a.turn - b.turn || a.kind.localeCompare(b.kind));
}
