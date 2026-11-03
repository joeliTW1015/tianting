import type { Chronicle } from '../core/scoring';
import type { GameState } from '../core/types';

const SAVE = 'tianting.save.v2';
const HISTORY = 'tianting.history.v2';

export interface HistoryEntry {
  seed: string;
  posthumous: string;
  score: number;
  reason: string;
  turn: number;
  correct: number;
  total: number;
  date: string;
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s.version === 2 ? s : null;
  } catch {
    return null;
  }
}

export function saveGame(s: GameState | null): void {
  try {
    if (s) localStorage.setItem(SAVE, JSON.stringify(s));
    else localStorage.removeItem(SAVE);
  } catch {
    /* 無痕模式等情況下忽略 */
  }
}

export function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY) ?? '[]') as HistoryEntry[];
  } catch {
    return [];
  }
}

export function pushHistory(s: GameState, c: Chronicle): void {
  const list = loadHistory();
  if (list.some((h) => h.seed === s.seed && h.turn === c.turn && h.score === c.score)) return;
  list.unshift({
    seed: s.seed,
    posthumous: c.posthumous,
    score: c.score,
    reason: c.reason,
    turn: c.turn,
    correct: c.verdicts.filter((v) => v.correct).length,
    total: c.verdicts.length,
    date: new Date().toLocaleDateString('zh-TW'),
  });
  try {
    localStorage.setItem(HISTORY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* ignore */
  }
}

const PLAIN = 'tianting.plain';

export function loadPlain(): boolean {
  try {
    return localStorage.getItem(PLAIN) !== '0';
  } catch {
    return true;
  }
}

export function savePlain(v: boolean): void {
  try {
    localStorage.setItem(PLAIN, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}
