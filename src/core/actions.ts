// 玩家行動：細讀、硃批、政務抉擇、下旨、召見、心證。UI 與自動策略共用。

import { CASE_DEFS } from './cases';
import { audience, SUMMONABLE } from './court';
import { REGIONS, regionName, travelTurns } from './geography';
import { applyChoice } from './routine';
import type { CaseState, CharId, Decision, GameState, RegionId, Trust } from './types';
import { spend } from './palace';
import { flow, gov } from './util';
import { sendDetachment } from './war';

export interface OrderOption {
  kind: string;
  region: RegionId;
  person?: CharId;
  amount?: number;
  troops: number;
  silver: number;
  energy: number;
  label: string;
  desc: string;
  caseId?: string;
  /** 本旬已下過同一道旨 */
  issued?: boolean;
}

export const MIN_JINGYING = 15000;

function orderCat(kind: string): string {
  if (kind === 'spy' || kind === 'envoy' || kind === 'inspect' || kind === 'audit') return '查核';
  if (kind === 'campaign') return '軍費';
  if (kind === 'relief') return '賑濟';
  return '撥款';
}

/** 玩家已察覺的疑案（收到過相關文書） */
export function discoveredCases(state: GameState): CaseState[] {
  const seen = new Set(state.docs.filter((d) => d.arriveTurn <= state.turn).map((d) => d.topic));
  return state.cases.filter((c) => seen.has(c.uid));
}

export function orderOptions(state: GameState, region: RegionId): OrderOption[] {
  const o: OrderOption[] = [];
  const add = (x: Partial<OrderOption> & { kind: string; label: string; desc: string }) => o.push({ region, energy: 1, troops: 0, silver: 0, ...x });
  const info = REGIONS[region];
  add({ kind: 'spy', label: '遣東廠番子密查', silver: 3, desc: state.world.dongchang === 'crown' ? '東廠已在你手中：密報完全確實（標〔確〕）。往返都要走驛路；有曝光之險。' : '東廠還在權閹手中：閹黨的事一律說好話，清流常被扣罪名。往返都要走驛路。' });
  if (region !== 'jingshi') {
    add({ kind: 'envoy', label: '遣巡按御史查核', silver: 2, desc: '派御史公開巡查：較周詳，比密探多一旬；但可能被地方收買或被安排好的場面蒙蔽。' });
    const g = gov(state, region);
    add({ kind: 'recall', person: g.id, label: `召${info.gov}入京陛見`, desc: '把地方長官叫來當面問話。心中無鬼的會來；有的人會拖延或推辭——這本身就是線索。' });
    add({ kind: 'arrest', person: g.id, label: `革職拿問${info.gov}`, desc: '撤換並查辦地方長官。抓對了是整肅，抓錯了是冤獄（朝望下降）。新任者到任後會回報前任底細。' });
  }
  if (info.kind === 'province') {
    add({ kind: 'sectBan', silver: 3, label: '查禁邪教', desc: '查拿秘密教門。教門尚小時可防患未然；若已坐大，查禁可能逼其提前起事。' });
    add({ kind: 'amnesty', silver: 15, label: '招撫亂民', desc: '對境內的亂民宣布招安。民心已好轉時大多會散去；民心太差時效果有限。朝望 −1。' });
    add({ kind: 'press', label: '嚴令催科', desc: '送到後該省三個月多收一成五錢糧，但民心惡化。' });
  }
  for (const c of discoveredCases(state)) {
    if (c.region !== region) continue;
    const def = CASE_DEFS[c.def];
    for (const x of def.options?.(state, c) ?? []) {
      add({ kind: x.kind, label: x.label, desc: x.desc, energy: x.energy ?? 1, silver: x.silver ?? 0, troops: x.troops ?? 0, person: x.person, caseId: c.uid });
    }
  }
  for (const x of o) x.issued = issuedThisTurn(state, x);
  return o;
}

/** 同一旬、同一地、同一道旨（含同一對象、同一疑案）只能下一次 */
export function issuedThisTurn(state: GameState, opt: Pick<OrderOption, 'kind' | 'region' | 'person' | 'caseId'>): boolean {
  return state.orders.some(
    (x) => x.issuedTurn === state.turn && x.kind === opt.kind && x.region === opt.region && (x.person ?? '') === (opt.person ?? '') && (x.caseId ?? '') === (opt.caseId ?? '') && !x.reqDocId,
  );
}

function log(state: GameState, text: string): void {
  state.log.push({ turn: state.turn, text });
}

export function issueOrder(state: GameState, opt: OrderOption): string | null {
  if (state.over) return '本局已終。';
  const w = state.world;
  if (issuedThisTurn(state, opt)) return '本旬已下過此旨。';
  if (state.world.cooldown.restTurn === state.turn) return '本旬罷朝靜養，不再下旨。';
  if (w.treasury < opt.silver) return `戶部奏：庫銀不足 ${opt.silver} 萬兩。`;
  if (opt.troops && w.jingying - opt.troops < MIN_JINGYING) return '兵部奏：京營不可再調，否則京師空虛。';
  if (opt.kind === 'arrest' && state.orders.some((x) => x.kind === 'arrest' && x.person === opt.person && x.status === 'transit')) return '拿問之旨已在途中。';
  const err = spend(state, opt.energy);
  if (err) return err;
  flow(state, orderCat(opt.kind), opt.label, { silver: -opt.silver });
  const travel = travelTurns(state, opt.region);
  if (opt.kind === 'campaign') sendDetachment(state, opt.region, opt.troops);
  const back = opt.kind === 'spy' ? travel : opt.kind === 'envoy' || opt.kind === 'inspect' ? travel + 1 : opt.kind === 'audit' ? travel : opt.kind === 'retest' ? 2 : opt.kind === 'registry' ? 0 : undefined;
  state.orders.push({
    id: state.nextId++,
    kind: opt.kind,
    region: opt.region,
    person: opt.person,
    amount: opt.amount,
    troops: opt.troops,
    caseId: opt.caseId,
    issuedTurn: state.turn,
    arriveTurn: state.turn + travel,
    // 京中旨意下一旬才生效，故以 max(travel, 1) 起算
    returnTurn: back !== undefined ? state.turn + Math.max(travel, 1) + back : undefined,
    status: 'transit',
    label: opt.label,
  });
  state.stats.orders += 1;
  if (opt.kind === 'spy' || opt.kind === 'envoy') state.stats.spies += 1;
  log(state, `下旨：${opt.label}（${regionName(opt.region)}）`);
  return null;
}

/** 對奏請的硃批：准、駁、留中。不耗精力，但旨意同樣要在路上走。 */
export function decide(state: GameState, docId: number, decision: Decision): string | null {
  if (state.over) return '本局已終。';
  const doc = state.docs.find((d) => d.id === docId);
  if (!doc || !doc.request || doc.arriveTurn > state.turn) return '無此奏請。';
  if (doc.decision && doc.decision !== 'shelve') return '已經批覆。';
  const req = doc.request;
  const w = state.world;
  if (decision === 'approve') {
    const troops = req.kind === 'campaign' ? req.troops ?? 10000 : 0;
    const cost = req.kind === 'campaign' ? 10 : req.amount ?? 0;
    if (w.treasury < cost) return `戶部奏：庫銀不足 ${cost} 萬兩。`;
    if (troops && w.jingying - troops < MIN_JINGYING) return '兵部奏：京營不可再調。';
    flow(state, req.kind === 'campaign' ? '軍費' : req.kind === 'relief' ? '賑濟' : '撥款', req.desc, { silver: -cost });
    const travel = travelTurns(state, req.region);
    if (troops) sendDetachment(state, req.region, troops);
    state.orders.push({
      id: state.nextId++,
      kind: req.kind,
      region: req.region,
      amount: req.amount,
      troops,
      caseId: req.caseId,
      issuedTurn: state.turn,
      arriveTurn: state.turn + travel,
      status: 'transit',
      label: `准：${req.desc}`,
      reqDocId: doc.id,
    });
  }
  doc.decision = decision;
  log(state, `硃批〈${doc.title}〉：${decision === 'approve' ? '准' : decision === 'reject' ? '駁' : '留中'}`);
  return null;
}

/** 日常政務的抉擇 */
export function choose(state: GameState, docId: number, choiceId: string): string | null {
  if (state.over) return '本局已終。';
  const doc = state.docs.find((d) => d.id === docId);
  if (!doc?.task || doc.arriveTurn > state.turn) return '無此政務。';
  if (doc.task.chosen) return '已經裁決。';
  if (state.turn > doc.task.deadline) return '已逾期。';
  if (!doc.read && !doc.free && choiceId !== doc.task.recommend) return '未曾細讀，只能依票擬辦理；要親自裁奪，請先細讀全文。';
  const c = doc.task.choices.find((x) => x.id === choiceId);
  if (!c) return '無此選項。';
  const w = state.world;
  if ((c.silver ?? 0) > w.treasury) return `戶部奏：庫銀不足 ${c.silver} 萬兩。`;
  if ((c.grain ?? 0) > w.grain) return `太倉存糧不足 ${c.grain} 萬石。`;
  if ((c.privy ?? 0) > w.privy) return `內帑不足 ${c.privy} 萬兩。`;
  if (c.troops && w.jingying - c.troops < MIN_JINGYING) return '兵部奏：京營不可再調。';
  const err = spend(state, c.energy ?? 0);
  if (err) return err;
  doc.task.chosen = choiceId;
  applyChoice(state, doc, choiceId);
  state.stats.tasks += 1;
  log(state, `裁決〈${doc.title}〉：${c.label}`);
  return null;
}

export function readDoc(state: GameState, docId: number): string | null {
  const doc = state.docs.find((d) => d.id === docId);
  if (!doc || doc.arriveTurn > state.turn) return '無此文書。';
  if (doc.read) return null;
  if (state.world.cooldown.restTurn === state.turn) return '本旬罷朝靜養，不能細讀。';
  const err = spend(state, 1);
  if (err) return err;
  doc.read = true;
  state.stats.reads += 1;
  state.world.emperor.reads += 1;
  return null;
}

export function summon(state: GameState, who: CharId, topic: string): string | null {
  if (state.over) return '本局已終。';
  if (!SUMMONABLE.includes(who)) return '此人不在京中。';
  if (topic !== 'state' && !discoveredCases(state).some((c) => c.uid === topic)) return '朕尚未聞知此事。';
  const already = state.log.some((l) => l.turn === state.turn && l.text.startsWith('召見'));
  const err = spend(state, already ? 1 : 2);
  if (err) return err;
  state.stats.summons += 1;
  audience(state, who, topic);
  log(state, `召見${state.chars[who].title}${state.chars[who].name}`);
  return null;
}

export function setBelief(state: GameState, key: string, value: string): void {
  state.beliefs[key] = value;
}

export function setNote(state: GameState, region: RegionId, text: string): void {
  state.notes[region] = text;
}

export function setTrust(state: GameState, who: CharId, t: Trust | undefined): void {
  if (t) state.trust[who] = t;
  else delete state.trust[who];
}
