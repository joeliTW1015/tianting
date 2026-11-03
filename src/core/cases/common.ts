// 疑案共用的小工具。

import { draft, local, post, type DocDraft } from '../docs';
import { regionName } from '../geography';
import { chance, int, noisy, range } from '../rng';
import type { CaseState, CharId, DocKind, GameState } from '../types';
import { addMood, event, gov } from '../util';

export function cdoc(state: GameState, c: CaseState, kind: DocKind, from: CharId | 'rumor' | 'court', title: string): DocDraft {
  const d = draft(kind, from, c.region, c.uid, title);
  if (from === 'rumor') d.arriveTurn = state.turn + 1;
  return d;
}

/** 京城傳聞：一旬後傳到 */
export function rumor(state: GameState, c: CaseState, text: string, brief: string, plain?: string): void {
  const d = draft('rumor', 'rumor', 'jingshi', c.uid, `京城傳聞・${regionName(c.region)}`);
  d.arriveTurn = state.turn + 1;
  d.paras.push({ text: `坊間傳言：${text}`, brief, plain, tag: 'core' });
  post(state, d);
}

/** 京中官員的文書：當旬送達 */
export function cdocLocal(state: GameState, c: CaseState, kind: DocKind, from: CharId | 'court', title: string): DocDraft {
  return local(draft(kind, from, 'jingshi', c.uid, title), state);
}

export function resolve(state: GameState, c: CaseState, text: string, good: boolean): void {
  if (c.resolved) return;
  c.resolved = { turn: state.turn, text, good };
  addMood(state, good ? 4 : -5);
  event(state, c.uid, `【結案】${text}`, true);
}

/** 自案件開始經過的旬數 */
export function age(state: GameState, c: CaseState): number {
  return state.turn - c.startTurn;
}

export function every(state: GameState, c: CaseState, n: number, offset = 0): boolean {
  return (age(state, c) - offset) % n === 0 && age(state, c) >= offset;
}

export function govName(state: GameState, c: CaseState): string {
  return gov(state, c.region).name;
}

export { chance, int, noisy, range };
