// 文書的產生、謊言登錄、首輔票擬、內廷截留。

import { travelTurns } from './geography';
import { chance, type Rng } from './rng';
import type { CharId, Choice, Claim, Doc, DocKind, GameState, Para, RegionId, Request, Topic } from './types';
import { charLabel } from './util';

export interface DocDraft {
  kind: DocKind;
  from: CharId | 'rumor' | 'court';
  fromLabel?: string;
  region: RegionId;
  topic: Topic;
  title: string;
  paras: Para[];
  claims: Claim[];
  lies: { label: string; claimed: string; truth: string }[];
  request?: Request;
  task?: Doc['task'];
  recommend?: string;
  delay?: number;
  arriveTurn?: number;
  sentTurn?: number;
  free?: boolean;
  urgent?: boolean;
  highlight?: string;
  importance?: number;
  certified?: boolean;
  battleId?: number;
  lot?: Doc['lot'];
}

export function draft(kind: DocKind, from: DocDraft['from'], region: RegionId, topic: Topic, title: string): DocDraft {
  return { kind, from, region, topic, title, paras: [], claims: [], lies: [] };
}

/** 京中文書：當旬送達 */
export function local(d: DocDraft, state: GameState): DocDraft {
  d.arriveTurn = state.turn;
  return d;
}

export function core(d: DocDraft, text: string, brief?: string, plain?: string): void {
  d.paras.push({ text, brief, plain, tag: 'core' });
}

export function clue(d: DocDraft, text: string, brief: string, opts: { against?: string; plain?: string } = {}): void {
  d.paras.push({ text, brief, tag: 'clue', against: opts.against, plain: opts.plain });
}

export function fluff(d: DocDraft, text: string, plain?: string): void {
  d.paras.push({ text, tag: 'fluff', plain });
}

/**
 * 登錄一則結構化陳述。數值相差超過 tol（相對）即視為不實，記入謊言簿。
 */
export function claim(
  d: DocDraft,
  key: string,
  label: string,
  claimed: number | string,
  truth: number | string,
  opts: { unit?: string; tol?: number; fmt?: (v: number) => string } = {},
): void {
  const shown = typeof claimed === 'number' ? (Math.abs(claimed) < 100 ? Math.round(claimed * 10) / 10 : Math.round(claimed)) : claimed;
  d.claims.push({ key, label, value: shown, unit: opts.unit });
  const fmt = opts.fmt ?? ((v: number) => `${Math.round(v)}${opts.unit ?? ''}`);
  if (typeof claimed === 'number' && typeof truth === 'number') {
    const tol = opts.tol ?? 0.25;
    const base = Math.max(Math.abs(truth), 1);
    if (Math.abs(claimed - truth) / base > tol) d.lies.push({ label, claimed: fmt(claimed), truth: fmt(truth) });
  } else if (claimed !== truth) {
    d.lies.push({ label, claimed: String(claimed), truth: String(truth) });
  }
}

export function request(d: DocDraft, req: Request): void {
  d.request = req;
}

export function task(d: DocDraft, id: string, choices: Choice[], fallback: string, deadline: number, extra: Partial<NonNullable<Doc['task']>> = {}): void {
  d.task = { id, choices, fallback, deadline, ...extra };
}

/** 內廷截留的判定（由疑案模組註冊） */
type Interceptor = (state: GameState, doc: Doc) => boolean;
const interceptors: Interceptor[] = [];
export function registerInterceptor(f: Interceptor): void {
  interceptors.push(f);
}

/** 文書送不出去的情形（例如當地已陷落），不記為截留 */
type Blocker = (state: GameState, doc: Doc) => boolean;
const blockers: Blocker[] = [];
export function registerBlocker(f: Blocker): void {
  blockers.push(f);
}

/** 文書入匣後的處理（例如大臣依授權自行處分） */
type PostHook = (state: GameState, doc: Doc) => void;
const postHooks: PostHook[] = [];
export function registerPostHook(f: PostHook): void {
  postHooks.push(f);
}

/** 送出文書。回傳 null 表示在途遺失或遭截留。 */
export function post(state: GameState, d: DocDraft, lost = false): Doc | null {
  const r = state.rng;
  const id = state.nextId++;
  const sentTurn = d.sentTurn ?? state.turn;
  const arriveTurn = d.arriveTurn ?? sentTurn + travelTurns(state, d.region) + (d.delay ?? 0);
  const fromLabel = d.fromLabel ?? (d.from === 'rumor' ? '京城傳聞' : d.from === 'court' ? '通政司' : charLabel(state, d.from));
  const doc: Doc = {
    id,
    kind: d.kind,
    from: d.from,
    fromLabel,
    region: d.region,
    topic: d.topic,
    sentTurn,
    arriveTurn,
    title: d.title,
    paras: d.paras,
    summary: '',
    claims: d.claims,
    request: d.request,
    task: d.task,
    read: !!d.free,
    free: d.free,
    urgent: d.urgent,
    highlight: d.highlight,
    importance: d.importance,
    certified: d.certified,
    battleId: d.battleId,
    lot: d.lot,
  };
  if (lost || blockers.some((f) => f(state, doc))) return null;
  const mijie = typeof doc.from === 'string' && state.world.cooldown[`mijie:${doc.from}`];
  if (!mijie && interceptors.some((f) => f(state, doc))) {
    state.world.mods.suppressed += 1;
    state.world.events.push({ turn: state.turn, topic: d.topic, text: `${fromLabel}〈${d.title}〉遭司禮監截留，未曾呈覽。` });
    return null;
  }
  for (const l of d.lies) state.lies.push({ docId: id, turn: sentTurn, from: fromLabel, topic: d.topic, ...l });
  summarize(state, doc, r);
  doc.recommend = d.recommend ?? defaultRecommend(doc);
  state.docs.push(doc);
  for (const h of postHooks) h(state, doc);
  return doc;
}

/** 內閣票擬：核心必載；線索可能因篇幅或私心略去。 */
export function summarize(state: GameState, doc: Doc, r: Rng): void {
  const bias = shoufuBias(state);
  const parts: string[] = [];
  for (const p of doc.paras) {
    if (!p.brief) {
      p.inSummary = false;
      continue;
    }
    let include = true;
    if (p.tag === 'clue') {
      const partisan = bias !== 'clean' && p.against === bias;
      include = partisan ? false : !chance(r, 0.25);
    }
    p.inSummary = include;
    if (include) parts.push(p.brief);
  }
  doc.summary = parts.length ? parts.join('；') + '。' : '（內閣無摘要）';
}

/** 首輔目前袒護的疑案 uid；被撤換後新任者清白 */
export function shoufuBias(state: GameState): string {
  return state.chars.shoufu.term > 1 ? 'clean' : state.world.shoufu;
}

function defaultRecommend(doc: Doc): string {
  if (doc.task) return '擬：伏候聖裁。';
  if (doc.request) return '擬：下部議覆。';
  if (doc.kind === 'secret') return '擬：留覽。';
  if (doc.kind === 'rumor') return '擬：市井之言，不足深究。';
  return '擬：知道了。';
}

/** 依首輔立場產生對奏請的建議（清白首輔六成五準確） */
export function advise(state: GameState, legit: boolean, caseUid?: string): string {
  if (caseUid && shoufuBias(state) === caseUid) return '擬：所請甚是，宜即准行。';
  const yes = chance(state.rng, 0.65) ? legit : !legit;
  return yes ? '擬：所請可准。' : '擬：所請未必盡實，宜駁回或遣員查核。';
}
