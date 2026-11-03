// 核心型別。World 與 CaseState 是真相層，只有模擬與局末史書可以讀；
// UI 一律透過 view.ts 的 playerView() 取得認知層資料。

import type { Rng } from './rng';

export type RegionId =
  | 'jingshi'
  | 'jizhen'
  | 'xuanda'
  | 'liaodong'
  | 'gansu'
  | 'shanxi'
  | 'shandong'
  | 'henan'
  | 'shaanxi'
  | 'sichuan'
  | 'huguang'
  | 'jiangxi'
  | 'nanzhili'
  | 'zhejiang'
  | 'fujian'
  | 'liangguang'
  | 'yungui';

export type CharId = string;
export type CharKind = 'civil' | 'military' | 'eunuch' | 'prince' | 'chieftain' | 'scholar';
export type CharStatus = 'active' | 'arrested' | 'rebel' | 'away' | 'dismissed';

export interface Character {
  id: CharId;
  name: string;
  title: string;
  region: RegionId;
  kind: CharKind;
  /** 品級：1 緋袍、2 緋袍、3 青袍、4 綠袍（決定肖像衣色） */
  rank: number;
  status: CharStatus;
  term: number;
  /** 肖像種子 */
  look: number;
  /** 隱藏：操守（0 貪～1 廉），影響地方錢糧截留與奏報粉飾 */
  integrity: number;
  /** 隱藏：才幹 */
  competence: number;
}

/** 文書所屬：疑案 uid、朝中、日常政務 */
export type Topic = string;

export interface Para {
  text: string;
  /** 白話註解 */
  plain?: string;
  /** 票擬用的縮寫；沒有就不會出現在票擬中 */
  brief?: string;
  tag: 'core' | 'clue' | 'fluff';
  /** 這條線索對哪一案的罪人不利；首輔若袒護此案，票擬會略去 */
  against?: string;
  inSummary?: boolean;
}

export interface Claim {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
}

export interface Request {
  kind: string;
  region: RegionId;
  amount?: number;
  troops?: number;
  desc: string;
  /** 准／駁的白話效果 */
  yes: string;
  no: string;
  caseId?: string;
}

/** 日常政務的選項 */
export interface Choice {
  id: string;
  label: string;
  /** 白話效果說明 */
  note: string;
  silver?: number;
  grain?: number;
  privy?: number;
  energy?: number;
  troops?: number;
}

export type DocKind = 'memorial' | 'secret' | 'envoy' | 'rumor' | 'audience' | 'notice' | 'task' | 'digest';
export type Decision = 'approve' | 'reject' | 'shelve';

export interface Doc {
  id: number;
  kind: DocKind;
  from: CharId | 'rumor' | 'court';
  fromLabel: string;
  region: RegionId;
  topic: Topic;
  sentTurn: number;
  arriveTurn: number;
  title: string;
  paras: Para[];
  summary: string;
  recommend?: string;
  claims: Claim[];
  request?: Request;
  decision?: Decision;
  /** 日常政務 */
  task?: { id: string; choices: Choice[]; chosen?: string; deadline: number; fallback: string; recommend?: string; region?: RegionId; data?: Record<string, number | string> };
  read: boolean;
  free?: boolean;
  urgent?: boolean;
  /** 內廷大事：彈窗的標題 */
  highlight?: string;
}

export interface LieRecord {
  docId: number;
  turn: number;
  from: string;
  topic: Topic;
  label: string;
  claimed: string;
  truth: string;
}

export interface TruthEvent {
  turn: number;
  topic: Topic;
  text: string;
  major?: boolean;
}

export interface Order {
  id: number;
  kind: string;
  region: RegionId;
  person?: CharId;
  amount?: number;
  troops?: number;
  caseId?: string;
  taskId?: string;
  choiceId?: string;
  reqKind?: string;
  reqDocId?: number;
  issuedTurn: number;
  arriveTurn: number;
  returnTurn?: number;
  status: 'transit' | 'done';
  label: string;
}

export interface RegionState {
  unrest: number;
  /** 蠲免至某旬 */
  remitUntil: number;
  /** 嚴令催科至某旬 */
  pressUntil: number;
  occupied: boolean;
  garrison: number;
  /** 邊鎮士氣（0～1.2） */
  morale: number;
  disaster?: { kind: string; until: number; severity: number };
  reliefUntil: number;
  /** 本旬實解錢糧（萬兩） */
  taxPaid: number;
  /** 本旬漕糧（萬石） */
  grainPaid: number;
  /** 案件造成的稅收倍率（例如鹽政、洪災） */
  caseTaxMod: number;
  /** 被誰佔據（陷落時為敵軍名號） */
  heldBy?: string;
  heldSince?: number;
  /** 邪教滲透（隱藏，0～100） */
  sect: number;
}

export interface Army {
  id: number;
  caseId: string;
  label: string;
  side: 'rebel' | 'invader' | 'pirate' | 'bandit';
  size: number;
  region: RegionId;
  /** 接下來要進犯的路線 */
  path: RegionId[];
  nextMove: number;
  growth: number;
  /** 受到的傷害倍率（流寇、海寇善於流竄、遁海） */
  evasion: number;
  active: boolean;
  /** 外藩所屬 */
  power?: string;
  /** 掠邊者到期退走 */
  leaveTurn?: number;
  /** 結局：退走、被殲（供外藩模組結算） */
  fate?: 'left' | 'destroyed';
  settled?: boolean;
}

export interface Detachment {
  id: number;
  region: RegionId;
  troops: number;
  arriveTurn: number;
  untilTurn: number;
  homeTurn: number;
  returned: boolean;
}

/** 戶部帳冊：每旬一筆（萬兩、萬石） */
export interface LedgerEntry {
  turn: number;
  /** 各省實解錢糧 */
  provinces: number;
  salt: number;
  trade: number;
  /** 百官俸祿、宮廷常支 */
  routine: number;
  /** 京營月餉 */
  army: number;
  /** 出征部隊開銷 */
  field: number;
  grainIn: number;
  grainOut: number;
  treasury: number;
  grain: number;
  privy: number;
}

/** 一次性的收支（玩家撥款、政務、抄沒等）；負數為支出 */
export interface FlowEntry {
  turn: number;
  cat: string;
  label: string;
  silver: number;
  grain: number;
  privy: number;
}

export interface Illness {
  kind: string;
  /** 1 輕、2 重、3 危 */
  severity: number;
  since: number;
  /** 治療帶來的痊癒機率加成 */
  treat: number;
  treated: boolean;
}

/** 皇帝本人：心情與身體（玩家只看得到描述，看不到數字） */
export interface Emperor {
  mood: number;
  illness: Illness | null;
  /** 本旬細讀份數（操勞） */
  reads: number;
  /** 各種娛樂最近一次的旬數（遞減效果） */
  leisure: Record<string, number>;
  heirChance: number;
  heirDue: number;
  heirs: number;
  restUntil: number;
  elixirUntil: number;
}

export interface Project {
  id: string;
  start: number;
  done: number;
  complete: boolean;
}

export interface PowerState {
  id: string;
  hostility: number;
  strength: number;
  trade: boolean;
  titled: boolean;
  nextRaid: number;
  planned?: { turn: number; target: RegionId; size: number; invade: boolean };
  nextTribute: number;
  raids: number;
}

export type ShoufuBias = 'clean' | string; // 'clean' 或袒護的疑案 uid

export interface World {
  treasury: number;
  grain: number;
  privy: number;
  jingying: number;
  jingyingMorale: number;
  /** 朝望：朝野對天子的信服（0～100） */
  prestige: number;
  /** 吏治敗壞程度（0～100） */
  corruption: number;
  taxPolicy: 'light' | 'normal' | 'heavy';
  borderArrears: number;
  regions: Record<RegionId, RegionState>;
  armies: Army[];
  detachments: Detachment[];
  shoufu: ShoufuBias;
  dongchang: 'capable' | 'fabricator';
  wrongful: string[];
  events: TruthEvent[];
  treasuryLog: number[];
  grainLog: number[];
  negTreasury: number;
  negGrain: number;
  mods: {
    mineTaxUntil: number;
    debasedTurn: number;
    canalBlockedUntil: number;
    seaTrade: boolean;
    saltMod: number;
    suppressed: number;
  };
  last: { income: number; expense: number; salt: number; grainIn: number; grainOut: number };
  ledger: LedgerEntry[];
  flows: FlowEntry[];
  emperor: Emperor;
  projects: Project[];
  /** 京師營建完成的增益 */
  buffs: Record<string, boolean>;
  /** 京師事件冷卻 */
  cooldown: Record<string, number>;
  westerner: boolean;
  plagueUntil: number;
  /** 四夷（隱藏的敵意與兵力） */
  powers: Record<string, PowerState>;
}

export interface CaseState {
  uid: string;
  def: string;
  region: RegionId;
  branch: string;
  startTurn: number;
  stage: number;
  actors: Record<string, CharId>;
  data: Record<string, number>;
  flags: Record<string, boolean>;
  /** 文字型的備忘（例如被截留的奏疏） */
  memo: string[];
  resolved?: { turn: number; text: string; good: boolean };
}

export type EndReason = 'survived' | 'capital' | 'mutiny' | 'famine' | 'coup' | 'illness';

export type Trust = 'trust' | 'doubt' | 'distrust';
export type PerkId = 'diligent' | 'spies' | 'treasury' | 'insight' | 'courier' | 'censors' | 'granary' | 'beloved';

export interface GameState {
  version: 2;
  seed: string;
  rng: Rng;
  turn: number;
  maxTurn: number;
  perk: PerkId;
  energy: number;
  energyMax: number;
  /** 本旬實際精力上限（受心情、病情影響） */
  energyCap: number;
  chars: Record<CharId, Character>;
  world: World;
  cases: CaseState[];
  docs: Doc[];
  nextId: number;
  orders: Order[];
  lies: LieRecord[];
  notes: Partial<Record<RegionId, string>>;
  trust: Record<CharId, Trust>;
  beliefs: Record<string, string>;
  reportedTreasury: number;
  reportedGrain: number;
  log: { turn: number; text: string }[];
  stats: { reads: number; summons: number; orders: number; spies: number; tasks: number };
  over?: { reason: EndReason; turn: number };
}
