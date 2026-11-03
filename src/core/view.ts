// 認知層：UI 唯一的資料入口。只包含玩家「收到過的」資訊與自己知道的事，不含任何真相。

import { caseTitle, CASE_DEFS } from './cases';
import { discoveredCases } from './actions';
import { energyCap, ILL_TEXT, LEISURE, leisureHint, MOOD_TEXT, moodBand, PROJECTS, projectState } from './palace';
import { isFloodSeason } from './calendar';
import { foreignActions, POWERS } from './foreign';
import { hashSeed } from './rng';
import { REGION_ORDER, REGIONS, regionName, travelTurns } from './geography';
import type { CharId, CharKind, Choice, Claim, Decision, DocKind, FlowEntry, GameState, LedgerEntry, PerkId, RegionId, Request, Trust } from './types';

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
  task?: { choices: Choice[]; chosen?: string; deadline: number; fallback: string; recommend?: string };
  highlight?: string;
  read: boolean;
  free: boolean;
  urgent: boolean;
  isNew: boolean;
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
  leisure: { id: string; name: string; energy: number; silver: number; privy: number; desc: string; hint: string }[];
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

export interface ForeignView {
  id: string;
  name: string;
  kind: 'enemy' | 'tributary';
  borders: RegionId[];
  stance?: { value: string; source: string; turn: number };
  strength?: { value: number; source: string; turn: number };
  lastTribute?: number;
  raids: number;
  trade: boolean;
  look: number;
  actions: { kind: string; label: string; desc: string; silver: number; done: boolean }[];
}

export interface PlayerView {
  seed: string;
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
  foreign: ForeignView[];
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
        task: d.task ? { choices: d.task.choices, chosen: d.task.chosen, deadline: d.task.deadline, fallback: d.task.fallback, recommend: d.task.recommend } : undefined,
        highlight: d.highlight,
        read: d.read,
        free: !!d.free,
        urgent: !!d.urgent,
        isNew: d.arriveTurn === state.turn,
      };
    })
    .sort((a, b) => b.arriveTurn - a.arriveTurn || Number(b.urgent) - Number(a.urgent) || b.id - a.id);

  const regions = {} as Record<RegionId, RegionView>;
  for (const id of REGION_ORDER) {
    regions[id] = {
      id,
      lastNews: null,
      facts: [],
      note: state.notes[id] ?? '',
      gov: charView(state, `gov:${id}`, docCount[`gov:${id}`] ?? 0),
      inTransit: state.orders.filter((o) => o.region === id && o.status === 'transit' && state.turn < o.arriveTurn).length,
      urgent: false,
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
  for (const id of REGION_ORDER) regions[id].facts.sort((a, b) => b.sentTurn - a.sentTurn || b.docId - a.docId);
  // 陷落與敵情：飛報不必細讀也知道
  for (const d of [...arrived].sort((a, b) => a.sentTurn - b.sentTurn)) {
    for (const c of d.claims) {
      const [head, tail] = c.key.split('.');
      const rv = regions[tail as RegionId];
      if (!rv) continue;
      if (head === 'held') rv.held = c.value === '已收復' ? undefined : String(c.value);
      if (head === 'foe' && typeof c.value === 'number' && state.turn - d.sentTurn <= 5) rv.foe = c.value > 0 ? { size: c.value, turn: d.sentTurn, source: d.fromLabel } : undefined;
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

  const field = w.detachments.filter((d) => !d.returned).reduce((n, d) => n + d.troops, 0);
  const p = w.prestige;

  return {
    seed: state.seed,
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
    foreign: foreignView(state, arrived),
    over: state.over,
  };
}

export const PRESTIGE_TEXT = ['民怨沸騰', '物議洶洶', '尚屬平和', '頗孚眾望', '聖德遠播'];
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
    leisure: LEISURE.map((l) => ({ id: l.id, name: l.name, energy: l.energy, silver: l.silver ?? 0, privy: l.privy ?? 0, desc: l.desc, hint: leisureHint(state, l) })),
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
  for (const d of w.detachments) {
    if (d.returned) continue;
    if (t < d.arriveTurn) out.push({ turn: d.arriveTurn, kind: 'army', text: `京營${Math.round(d.troops / 1000)}千人抵${regionName(d.region)}` });
    out.push({ turn: d.homeTurn, kind: 'army', text: `出征${regionName(d.region)}的京營班師回京` });
  }
  for (const p of w.projects) if (!p.complete) out.push({ turn: p.done, kind: 'project', text: `${PROJECTS.find((x) => x.id === p.id)?.name}預計告成` });
  for (const d of arrived) {
    if (d.task && !d.task.chosen && d.task.deadline >= t) out.push({ turn: d.task.deadline, kind: 'deadline', text: `〈${d.title}〉裁決期限（逾期依例）`, docId: d.id });
  }
  if (w.emperor.restUntil > t) out.push({ turn: w.emperor.restUntil, kind: 'palace', text: '罷朝靜養期滿' });
  if (w.emperor.heirDue > t && arrived.some((d) => d.title.includes('宮中有喜'))) out.push({ turn: w.emperor.heirDue, kind: 'palace', text: '后妃預計誕育', approx: true });

  // 例行的朝廷行事曆
  for (let k = t + 1; k <= Math.min(t + CAL_HORIZON, state.maxTurn - 1); k++) {
    const m = k % 36;
    if (k % 6 === 2) out.push({ turn: k, kind: 'calendar', text: '戶部請發四邊兩月餉銀' });
    if (k % 12 === 0) out.push({ turn: k, kind: 'calendar', text: '戶部請定本期稅則' });
    if (k === 18 || k === 54) out.push({ turn: k, kind: 'calendar', text: '吏部京察大計' });
    if (k === 6 || k === 30 || k === 54) out.push({ turn: k, kind: 'calendar', text: '兵部請整頓京營' });
    if (k === 33 || k === 69) out.push({ turn: k, kind: 'calendar', text: '冬至郊祀' });
    if (m === 1) out.push({ turn: k, kind: 'calendar', text: '上元燈節' });
    if (m === 14) out.push({ turn: k, kind: 'calendar', text: '端陽節' });
    if (m === 23) out.push({ turn: k, kind: 'calendar', text: '中秋節' });
    if (m === 26) out.push({ turn: k, kind: 'calendar', text: '刑部秋決勾決' });
    if (isFloodSeason(k) && !isFloodSeason(k - 1)) out.push({ turn: k, kind: 'calendar', text: '伏秋大汛開始（黃河沿岸須防決堤）' });
  }
  return out.filter((x) => x.turn >= t).sort((a, b) => a.turn - b.turn || a.kind.localeCompare(b.kind));
}

function foreignView(state: GameState, arrived: GameState['docs']): ForeignView[] {
  const w = state.world;
  return POWERS.map((p) => {
    let stance: ForeignView['stance'];
    let strength: ForeignView['strength'];
    let lastTribute: number | undefined;
    let raids = 0;
    for (const d of arrived) {
      if (d.topic !== `foreign:${p.id}`) continue;
      if (d.title.includes('朝貢')) lastTribute = Math.max(lastTribute ?? -99, d.sentTurn);
      if (d.urgent && (d.title.includes('犯邊') || d.title.includes('入寇'))) raids += 1;
      for (const c of d.claims) {
        if (c.key === `stance.${p.id}` && (!stance || d.sentTurn >= stance.turn)) stance = { value: String(c.value), source: d.fromLabel, turn: d.sentTurn };
        if (c.key === `power.${p.id}` && typeof c.value === 'number' && (!strength || d.sentTurn >= strength.turn)) strength = { value: c.value, source: d.fromLabel, turn: d.sentTurn };
      }
    }
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      borders: p.borders,
      stance,
      strength,
      lastTribute,
      raids,
      trade: w.powers[p.id].trade,
      look: hashSeed(state.seed + p.id),
      actions: foreignActions(state, p.id).map((a) => ({ ...a, done: w.cooldown[`act:${p.id}:${a.kind}`] === state.turn })),
    };
  });
}
