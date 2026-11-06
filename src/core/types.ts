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
  | 'yungui'
  // 境外九格
  | 'monan'
  | 'mobei'
  | 'jianzhou'
  | 'chaoxian'
  | 'donghai'
  | 'taiwan'
  | 'annan'
  | 'miandian'
  | 'hami';

export type CharId = string;
export type CharKind = 'civil' | 'military' | 'eunuch' | 'prince' | 'chieftain' | 'scholar' | 'consort' | 'empress';
export type CharStatus = 'active' | 'arrested' | 'rebel' | 'away' | 'dismissed' | 'dead';

/** 朝中四派 */
export type FactionId = 'yan' | 'qing' | 'zhe' | 'xun';
/** 授權：事事奏請／常例自專／便宜行事 */
export type Authority = 'ask' | 'normal' | 'free';
export type Stance = 'war' | 'steady' | 'peace';
export type Temper = 'harsh' | 'mid' | 'lenient';

/** 能力（1～5）：統兵、治政、理財、謀略 */
export interface Abilities {
  mil: number;
  gov: number;
  fin: number;
  wit: number;
}

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
  /** 隱藏：四項能力 */
  abil: Abilities;
  stance: Stance;
  temper: Temper;
  /** 公開的派系（null 為無黨） */
  faction: FactionId | null;
  /** 隱藏：暗附的派系 */
  secretFaction?: FactionId;
  traits: string[];
  /** 隱藏：忠誠 0～100 */
  loyalty: number;
  /** 隱藏：野心 0～100 */
  ambition: number;
  authority: Authority;
  /** 名望 0～100 */
  fame: number;
  age: number;
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
  /** 勝算（0～1），有則顯示五級描述並擲籤 */
  odds?: number;
  /** 給予的狀態 */
  status?: string;
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
  task?: {
    id: string;
    choices: Choice[];
    chosen?: string;
    deadline: number;
    fallback: string;
    recommend?: string;
    region?: RegionId;
    data?: Record<string, number | string>;
    /** 大臣依授權自行處分（本旬退朝時生效，可駁回改批） */
    delegate?: { by: CharId; choice: string; why: string };
  };
  /** 重要度：1 例行、2 重要、3 大事 */
  importance?: number;
  /** 奏請由大臣便宜准行 */
  delegatedBy?: CharId;
  /** 東廠確報、點驗、親見 */
  certified?: boolean;
  /** 附帶的戰鬥紀錄（戰報動畫） */
  battleId?: number;
  /** 擲籤結果（賭性選擇） */
  lot?: { tier: number; ok: boolean; label: string };
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
  /** 詔書：目錄 id、對象、參數、完成旬 */
  edict?: string;
  target?: string;
  param?: string;
  doneTurn?: number;
  applied?: boolean;
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
  /** 名冊兵數（駐軍據報的根據） */
  roll: number;
  /** 控制度 0～100 */
  control: number;
  /** 境外：所屬勢力（'crown' 為本朝） */
  owner: string;
  /** 本地近 12 旬已募兵數 */
  levied: { turn: number; n: number }[];
  /** 守城加成（築城） */
  walls: number;
  /** 點驗過 */
  audited?: number;
}

export type ArmySide = 'rebel' | 'invader' | 'pirate' | 'bandit' | 'crown';

export interface Army {
  id: number;
  caseId: string;
  label: string;
  side: ArmySide;
  /** 實兵 */
  size: number;
  /** 兵種 */
  unit: string;
  /** 士氣 0～100 */
  morale: number;
  /** 官軍：名冊兵數、主將、任務、授方略 */
  roll?: number;
  commander?: CharId;
  mission?: 'hold' | 'march' | 'suppress';
  /** 目的地 */
  dest?: RegionId;
  posture?: 'attack' | 'hold';
  stratagem?: { card: string; from: number; foe: number; region: RegionId };
  raised?: number;
  /** 京營出征者，班師回京 */
  fromCapital?: boolean;
  /** 斷糧至某旬 */
  starveUntil?: number;
  /** 詐降者 */
  feigned?: boolean;
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

export interface BattleSide {
  label: string;
  commander?: string;
  look?: number;
  units: { name: string; n: number }[];
  morale: string;
  card: string;
  before: number;
  after: number;
}

/** 一場戰鬥的紀錄：真實與據報兩份（動畫播放據報） */
export interface BattleRecord {
  id: number;
  turn: number;
  region: RegionId;
  title: string;
  source: string;
  ours: BattleSide;
  theirs: BattleSide;
  phases: { name: string; ourLoss: number; theirLoss: number; line: number; note: string }[];
  result: string;
  /** 據報（灌水）的數字 */
  reported: { ourLoss: number; theirLoss: number };
  fate?: string;
}

export interface Status {
  id: string;
  name: string;
  until: number;
  desc: string;
  fx: Partial<Record<StatusFx, number>>;
}

export type StatusFx = 'prestige' | 'mood' | 'unrest' | 'tax' | 'speech' | 'loyalty' | 'raid' | 'regen' | 'grievance' | 'ill' | 'veto' | 'defense' | 'treasury';

export interface Consort {
  id: CharId;
  /** 位分 0 答應～5 皇貴妃，6 皇后 */
  rank: number;
  family: FactionId | null;
  temper: 'virtuous' | 'jealous' | 'clever' | 'spoiled' | 'serene';
  /** 隱藏：好感 */
  affection: number;
  grace: number;
  /** 隱藏 */
  jealousy: number;
  ambition: number;
  /** 權閹的眼線（隱藏） */
  spy: boolean;
  pregnantUntil?: number;
  status: 'active' | 'cold' | 'dead';
}

export interface Child {
  id: string;
  name: string;
  son: boolean;
  mother: CharId;
  born: number;
  alive: boolean;
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
  /** 勞損 0～10 */
  fatigue: number;
  /** 本旬花費的精力 */
  spent: number;
  /** 本旬已消遣 */
  leisureTurn: number;
  /** 各消遣最近使用的旬（遞減） */
  leisureLog: Record<string, number[]>;
  /** 護衛加成（加強宿衛） */
  guardBonus: number;
  /** 親征中的部隊 */
  campaignArmy?: number;
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
  standing: 'hostile' | 'truce' | 'friendly' | 'allied' | 'vassal' | 'annexed' | 'gone';
  truceUntil: number;
  /** 歲幣（萬兩／旬） */
  tributePay: number;
  /** 盟餉 */
  allyPay: number;
  /** 對其他勢力的關係（−100～100） */
  rel: Record<string, number>;
  /** 招撫後的首領 */
  leader?: CharId;
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
  shoufu: ShoufuBias;
  /** 東廠在誰手中 */
  dongchang: 'eunuch' | 'crown';
  /** 京營名冊 */
  jingyingRoll: number;
  /** 京營整頓過 */
  jingyingDrilled: boolean;
  /** 言路 0～100 */
  speech: number;
  /** 太后好感 */
  dowager: number;
  /** 朝中派系：怨望與額外聲勢 */
  factions: Record<FactionId, { grievance: number; bonus: number }>;
  statuses: Status[];
  capital: RegionId;
  relocating?: { kind: 'south' | 'flee' | 'return'; until: number };
  /** 水師（艘） */
  navy: number;
  /** 中興條件連續達成旬數 */
  zxStreak: number;
  /** 一次性限制：罪己詔次數、大赦旬、晨昏定省旬 */
  once: Record<string, number>;
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
    /** 開礦、加派、裁驛、減宗祿、清丈等持續效果 */
    postCut: boolean;
    stipendCut: boolean;
    surveyUntil: number;
    surveyed: boolean;
    hongmaoTrade: boolean;
    firearms: boolean;
    settlers: number;
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

export type EndReason = 'zhongxing' | 'survived' | 'southern' | 'capital' | 'mutiny' | 'famine' | 'captured' | 'coup' | 'palace' | 'illness' | 'assassinated';
export type EndingKind = 'zhongxing' | 'shoucheng' | 'pianan' | 'wangguo' | 'jiabeng' | 'beifei';
export type Difficulty = 'easy' | 'normal' | 'hard';

export type Trust = 'trust' | 'doubt' | 'distrust';
export type PerkId = 'diligent' | 'spies' | 'treasury' | 'insight' | 'courier' | 'censors' | 'granary' | 'beloved';

/** 東廠查得、皇帝親見的確實資訊 */
export interface Intel {
  abil?: Abilities;
  integrity?: number;
  loyalty?: number;
  faction?: FactionId | null;
  collusion?: string;
  turn: number;
}

export interface GameState {
  version: 3;
  difficulty: Difficulty;
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
  stats: { reads: number; summons: number; orders: number; spies: number; tasks: number; overdraft: number; exposed: number; battles: number; edicts: number };
  consorts: Consort[];
  children: Child[];
  heir?: string;
  battles: BattleRecord[];
  intel: Record<CharId, Intel>;
  /** 本局主要敵我的「疆域」開局記錄 */
  startOwned: number;
  over?: { reason: EndReason; turn: number };
}
