// 帶種子的亂數（mulberry32）。狀態存在 GameState 中，整局可重現、可存檔。

export interface Rng {
  s: number;
}

export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function next(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(r: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * next(r);
}

export function int(r: Rng, lo: number, hi: number): number {
  return Math.floor(range(r, lo, hi + 1));
}

export function chance(r: Rng, p: number): boolean {
  return next(r) < p;
}

export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[Math.floor(next(r) * arr.length)];
}

export function shuffle<T>(r: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next(r) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 以真值為中心加上相對誤差，例如 noisy(r, 1000, 0.2) → 800~1200 */
export function noisy(r: Rng, value: number, rel: number): number {
  return value * (1 + range(r, -rel, rel));
}
