import { cn, roundTo } from './calendar';
import { makeName } from './names';
import { next, range } from './rng';
import { genTraits } from './traits';
import type { Abilities, CharId, CharKind, Character, FactionId, GameState, RegionId, Stance, Temper, Topic } from './types';

/** 記入真相時間軸（玩家在局末才看得到） */
export function event(state: GameState, topic: Topic, text: string, major = false): void {
  state.world.events.push({ turn: state.turn, topic, text, major });
}

/** 兵數：取整到千或百，寫成中文 */
export function troops(n: number): string {
  return cn(roundTo(n, n >= 10000 ? 1000 : 100));
}

/** 銀兩：萬兩 */
export function silver(n: number): string {
  return `${cn(Math.max(1, Math.round(n)))}萬兩`;
}

/** 糧：萬石 */
export function grainText(n: number): string {
  return `${cn(Math.max(1, Math.round(n)))}萬石`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function usedSurnames(state: GameState): Set<string> {
  return new Set(Object.values(state.chars).map((c) => c.name[0]));
}

export function makeChar(
  state: GameState,
  id: CharId,
  title: string,
  region: RegionId,
  kind: CharKind,
  rank: number,
  opts: { name?: string; integrity?: number; competence?: number; faction?: FactionId | null; loyalty?: number; ambition?: number; stance?: Stance } = {},
): Character {
  const r = state.rng;
  const competence = opts.competence ?? range(r, 0.3, 0.95);
  const integrity = opts.integrity ?? range(r, 0.2, 0.95);
  const c: Character = {
    id,
    name: opts.name ?? makeName(r, usedSurnames(state)),
    title,
    region,
    kind,
    rank,
    status: 'active',
    term: 1,
    look: Math.floor(next(r) * 1e9),
    integrity,
    competence,
    abil: rollAbil(state, kind, competence),
    stance: opts.stance ?? pickStance(state, kind),
    temper: (['harsh', 'mid', 'mid', 'lenient'] as Temper[])[Math.floor(next(r) * 4)],
    faction: opts.faction === undefined ? null : opts.faction,
    traits: [],
    loyalty: opts.loyalty ?? Math.round(range(r, 45, 80)),
    ambition: opts.ambition ?? Math.round(range(r, 15, 60)),
    authority: 'normal',
    fame: Math.round(range(r, 20, 70)),
    age: Math.round(range(r, 32, 66)),
  };
  c.traits = genTraits(r, c);
  state.chars[id] = c;
  return c;
}

/** 依才幹擲四項能力；武將統兵高、文官治政高 */
export function rollAbil(state: GameState, kind: CharKind, competence: number): Abilities {
  const r = state.rng;
  const base = 1 + competence * 4;
  const roll = (bias: number) => clamp(Math.round(base + bias + range(r, -1.2, 1.2)), 1, 5);
  const mil = kind === 'military' || kind === 'chieftain' ? 0.6 : kind === 'prince' ? -1 : -1.2;
  const gov = kind === 'military' ? -1 : 0.2;
  return { mil: roll(mil), gov: roll(gov), fin: roll(kind === 'eunuch' ? 0.5 : -0.2), wit: roll(kind === 'eunuch' ? 0.8 : 0) };
}

function pickStance(state: GameState, kind: CharKind): Stance {
  const x = next(state.rng);
  if (kind === 'military') return x < 0.55 ? 'war' : x < 0.85 ? 'steady' : 'peace';
  return x < 0.3 ? 'war' : x < 0.65 ? 'steady' : 'peace';
}

/** 撤換人物：新任者換新名字與相貌，term +1；新任者預設清白 */
export function replaceChar(state: GameState, id: CharId, integrity = range(state.rng, 0.6, 0.95)): string {
  const c = state.chars[id];
  const old = c.name;
  c.name = makeName(state.rng, usedSurnames(state));
  c.term += 1;
  c.status = 'active';
  c.look = Math.floor(next(state.rng) * 1e9);
  c.integrity = integrity;
  c.competence = range(state.rng, 0.4, 0.9);
  c.abil = rollAbil(state, c.kind, c.competence);
  c.loyalty = Math.round(range(state.rng, 55, 80));
  c.ambition = Math.round(range(state.rng, 15, 50));
  c.traits = genTraits(state.rng, c);
  c.authority = 'normal';
  delete state.intel?.[id];
  return old;
}

export function govId(region: RegionId): CharId {
  return `gov:${region}`;
}

export function gov(state: GameState, region: RegionId): Character {
  return state.chars[govId(region)];
}

export function charLabel(state: GameState, id: CharId): string {
  const c = state.chars[id];
  return c ? `${c.title}${c.name}` : id;
}

/** 朝望增減（夾在 0～100） */
export function addPrestige(state: GameState, d: number): void {
  state.world.prestige = clamp(state.world.prestige + d, 0, 100);
}

/** 記帳並改動國庫、太倉、內帑（負數為支出） */
export function flow(state: GameState, cat: string, label: string, d: { silver?: number; grain?: number; privy?: number }): void {
  const w = state.world;
  const silver = d.silver ?? 0;
  const grain = d.grain ?? 0;
  const privy = d.privy ?? 0;
  if (!silver && !grain && !privy) return;
  w.treasury += silver;
  w.grain += grain;
  w.privy += privy;
  w.flows.push({ turn: state.turn, cat, label, silver, grain, privy });
}

/** 皇帝心情增減（夾在 0～100） */
export function addMood(state: GameState, d: number): void {
  state.world.emperor.mood = clamp(state.world.emperor.mood + d, 0, 100);
}

export function addUnrest(state: GameState, region: RegionId, d: number): void {
  const r = state.world.regions[region];
  r.unrest = clamp(r.unrest + d, 0, 100);
}
