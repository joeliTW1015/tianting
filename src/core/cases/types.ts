import type { DocDraft } from '../docs';
import type { CaseState, CharId, GameState, Order, RegionId } from '../types';

export interface CaseOption {
  kind: string;
  label: string;
  /** 白話效果說明 */
  desc: string;
  energy?: number;
  silver?: number;
  troops?: number;
  person?: CharId;
}

export interface InvestigateMode {
  spy: boolean;
  /** 巡按被收買 */
  bribed: boolean;
  /** 東廠羅織 */
  fabricate: boolean;
}

export interface CaseDef {
  id: string;
  /** 察覺後顯示的案名 */
  name: string;
  regions: RegionId[];
  branches: { id: string; label: string }[];
  /** 心證的提問 */
  question: string;
  /** 大臣召見時，依其所見的分支給出的看法 */
  opinions: Record<string, string>;
  /** 案件開始的旬（可選限制，例如會試在春天） */
  startAt?: (slotTurn: number) => number;
  setup(state: GameState, c: CaseState): void;
  /** 每旬：真相演化並產生奏報 */
  tick(state: GameState, c: CaseState): void;
  /** 察覺後在該地可下的專屬旨意 */
  options?(state: GameState, c: CaseState): CaseOption[];
  /** 旨意送達；回傳 true 表示已處理（不再走通用處置） */
  onOrder(state: GameState, c: CaseState, o: Order): boolean;
  /** 密查、巡按的查核內容 */
  investigate(state: GameState, c: CaseState, d: DocDraft, mode: InvestigateMode): void;
  /** 巡按被收買的機率 */
  bribe?(state: GameState, c: CaseState): number;
  /** 目前「真的有罪」的人 */
  guilty(state: GameState, c: CaseState): CharId[];
  score(state: GameState, c: CaseState): { points: number; outcome: string };
  truth(state: GameState, c: CaseState): string;
}
