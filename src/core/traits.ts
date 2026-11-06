// 人物的個性標籤（各有規則效果，見 people.ts）。

import { next, type Rng } from './rng';
import type { Character } from './types';

export const TRAITS: Record<string, string> = {
  剛直: '遇不合祖制之事必封駁；不受賄；被罷時清流不平',
  圓滑: '各派怨望變動減半；票擬迎合上意',
  貪財: '理財的處分常中飽私囊',
  好名: '喜歡上疏切諫，好言戰事',
  擁兵自重: '野心滋長加倍；常求便宜行事',
  迂腐: '凡事援引祖制',
  敢任事: '便宜行事時辦得更好，也更容易越權',
  怯戰: '統兵評語往往虛高；臨陣多主固守',
  刻薄寡恩: '部下士氣較低，但軍紀嚴明',
};

export function genTraits(r: Rng, c: Pick<Character, 'kind' | 'integrity' | 'ambition' | 'stance' | 'competence'>): string[] {
  const out: string[] = [];
  if (c.integrity < 0.3 && next(r) < 0.6) out.push('貪財');
  if (c.integrity > 0.8 && next(r) < 0.5) out.push('剛直');
  if (c.kind === 'military' && c.ambition > 60 && next(r) < 0.6) out.push('擁兵自重');
  if (c.kind === 'military' && c.stance === 'peace' && next(r) < 0.5) out.push('怯戰');
  if (c.kind === 'military' && out.length < 2 && next(r) < 0.15) out.push('刻薄寡恩');
  if (c.stance === 'war' && c.kind !== 'military' && next(r) < 0.35) out.push('好名');
  if (out.length < 2 && c.competence > 0.7 && next(r) < 0.3) out.push('敢任事');
  if (out.length < 2 && c.competence < 0.4 && next(r) < 0.35) out.push('迂腐');
  if (out.length < 1 && next(r) < 0.3) out.push('圓滑');
  return out.slice(0, 2);
}
