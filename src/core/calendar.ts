// 一回合 = 一旬（十日）。turn 0 = 崇寧元年正月上旬。

const MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const XUN = ['上', '中', '下'];
const YEARS = ['元', '二', '三', '四'];

export const ERA = '崇寧';

export function dateLabel(turn: number): string {
  if (turn < 0) {
    const t = 36 + turn;
    return `去歲${MONTHS[Math.floor(t / 3)]}月${XUN[t % 3]}旬`;
  }
  const year = Math.floor(turn / 36);
  const t = turn % 36;
  return `${ERA}${YEARS[year] ?? year + 1}年${MONTHS[Math.floor(t / 3)]}月${XUN[t % 3]}旬`;
}

/** 短格式：「元年三月中」 */
export function shortDate(turn: number): string {
  if (turn < 0) {
    const t = 36 + turn;
    return `去歲${MONTHS[Math.floor(t / 3)]}月${XUN[t % 3]}`;
  }
  const year = Math.floor(turn / 36);
  const t = turn % 36;
  return `${YEARS[year] ?? year + 1}年${MONTHS[Math.floor(t / 3)]}月${XUN[t % 3]}`;
}

/** 0～11 */
export function monthOf(turn: number): number {
  return Math.floor((((turn % 36) + 36) % 36) / 3);
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export function seasonOf(turn: number): Season {
  const m = monthOf(turn);
  return m < 3 ? 'spring' : m < 6 ? 'summer' : m < 9 ? 'autumn' : 'winter';
}

/** 汛期：五月至七月 */
export function isFloodSeason(turn: number): boolean {
  const m = monthOf(turn);
  return m >= 4 && m <= 6;
}

const DIGITS = '〇一二三四五六七八九';

/** 數字轉中文（萬以下夠用） */
export function cn(n: number): string {
  n = Math.round(n);
  if (n < 0) return '負' + cn(-n);
  if (n < 10) return DIGITS[n];
  if (n >= 10000) {
    const w = Math.floor(n / 10000);
    const rest = n % 10000;
    if (rest === 0) return cn(w) + '萬';
    return cn(w) + '萬' + (rest < 1000 ? '〇' : '') + cn(rest);
  }
  const units = ['', '十', '百', '千'];
  const s = String(n);
  let out = '';
  let zero = false;
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const u = units[s.length - 1 - i];
    if (d === 0) {
      zero = true;
      continue;
    }
    if (zero && out) out += '〇';
    zero = false;
    out += (d === 1 && u === '十' && i === 0 ? '' : DIGITS[d]) + u;
  }
  return out;
}

/** 兵員、人數取整成「約數」的寫法 */
export function roundTo(n: number, step: number): number {
  return Math.max(step, Math.round(n / step) * step);
}
