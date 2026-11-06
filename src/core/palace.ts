// 內廷與京師：皇帝的心情與病痛、娛樂、京師營建、京師事件、地方雜事。
// 心情與病情的數字玩家看不到，只看得到描述與畫像表情。

import { monthOf, seasonOf } from './calendar';
import { claim, clue, core, draft, fluff, local, post, shoufuBias, task, type DocDraft } from './docs';
import { PROVINCES, REGIONS, regionName } from './geography';
import { chance, pick, range } from './rng';
import type { Choice, Doc, GameState, RegionId } from './types';
import { favor } from './harem';
import { fx } from './statuses';
import { addMood, addPrestige, addUnrest, clamp, event, flow, gov, replaceChar } from './util';

export const MOOD_TEXT = ['煩躁易怒', '鬱鬱寡歡', '略感煩悶', '心緒平和', '龍心大悅'];
export const ILL_TEXT = ['', '偶感微恙', '病勢不輕', '病勢沉重'];

export function moodBand(m: number): number {
  return m >= 75 ? 4 : m >= 55 ? 3 : m >= 40 ? 2 : m >= 25 ? 1 : 0;
}

// ───────────────────────── 精力與勞損 ─────────────────────────
// 精力池 0～10（勤政 11），不再每旬回滿：每旬回復 4，可透支到 −3；透支與操勞累積勞損，勞損提高生病機率。

export const ENERGY_FLOOR = -3;
export const FATIGUE_TEXT = ['神清氣爽', '略有倦意', '頗感疲憊', '積勞成疾之兆', '形神俱疲'];

export function fatigueBand(f: number): number {
  return f >= 8 ? 4 : f >= 6 ? 3 : f >= 4 ? 2 : f >= 2 ? 1 : 0;
}

/** 下一旬的精力回復與原因 */
export function energyCap(state: GameState): { cap: number; regen: number; reasons: string[] } {
  const e = state.world.emperor;
  const cap = state.energyMax;
  let regen = state.perk === 'diligent' ? 5 : 4;
  const reasons: string[] = [`每旬回復 ${regen}`];
  if (e.mood >= 75) {
    regen += 1;
    reasons.push('龍心大悅 +1');
  } else if (e.mood < 25) {
    regen -= 1;
    reasons.push('心緒煩亂 −1');
  }
  if (e.illness) {
    regen -= e.illness.severity;
    reasons.push(`${ILL_TEXT[e.illness.severity]} −${e.illness.severity}`);
  }
  if (e.spent <= 1) {
    regen += 2;
    reasons.push('本旬休養 +2');
  }
  const fxr = fx(state, 'regen');
  if (fxr) {
    regen += fxr;
    reasons.push(`驚魂未定 ${fxr}`);
  }
  if (state.turn < e.restUntil) {
    regen += 1;
    reasons.push('靜養 +1');
  }
  return { cap, regen: Math.max(1, regen), reasons };
}

/** 花精力：可以透支到 −3 */
export function spend(state: GameState, n: number): string | null {
  if (n <= 0) return null;
  if (state.energy - n < ENERGY_FLOOR) return '精力已透支到極限（−3），今旬不能再勞神了。';
  state.energy -= n;
  state.world.emperor.spent += n;
  return null;
}

/** 退朝時：結算勞損、回復精力（在推進旬數之前呼叫） */
export function settleEnergy(state: GameState): void {
  const e = state.world.emperor;
  if (state.energy < 0) {
    e.fatigue = clamp(e.fatigue - state.energy, 0, 10);
    state.stats.overdraft += 1;
  }
  if (e.spent >= 7) e.fatigue = clamp(e.fatigue + 1, 0, 10);
  if (state.energy >= 0 && e.spent <= 4) e.fatigue = clamp(e.fatigue - 0.5, 0, 10);
  if (state.world.cooldown.restTurn === state.turn) e.fatigue = clamp(e.fatigue - 3, 0, 10);
  const { cap, regen } = energyCap(state);
  state.energy = Math.min(cap, state.energy + regen);
  state.energyCap = cap;
  e.spent = 0;
}

// ───────────────────────── 京師營建 ─────────────────────────

export interface ProjectDef {
  id: string;
  name: string;
  cost: number;
  /** 可改用內帑支付 */
  privy?: boolean;
  turns: number;
  effect: string;
  needWest?: boolean;
}

export const PROJECTS: ProjectDef[] = [
  { id: 'walls', name: '重修京城九門', cost: 60, turns: 5, effect: '京師守禦永久 +25%：叛軍、流寇兵臨城下時更難攻破。' },
  { id: 'canal', name: '疏浚通惠河', cost: 40, turns: 4, effect: '漕糧入京永久 +12%；運河淤塞時的損失減半。' },
  { id: 'granary', name: '增修太倉廒房', cost: 30, turns: 3, effect: '太倉存糧不易霉耗：每旬少耗約五千石。' },
  { id: 'clinic', name: '設惠民藥局', cost: 20, turns: 2, effect: '京師疫病減半；聖躬染病時康復較快；京城民心緩升。' },
  { id: 'academy', name: '重修國子監', cost: 35, turns: 4, effect: '士林歸心：朝望逐旬微升；科場風波時舉子較易安撫。' },
  { id: 'courier', name: '整飭驛傳急遞鋪', cost: 50, turns: 5, effect: '各地文書、旨意往返快約一成五。' },
  { id: 'firearms', name: '設京營神機火器營', cost: 45, turns: 4, effect: '京營與出征部隊戰力 +15%。' },
  { id: 'temple', name: '修葺太廟天壇', cost: 30, turns: 3, privy: true, effect: '親行郊祀時朝望加倍；完工時龍心大悅。' },
  { id: 'garden', name: '修葺西苑', cost: 45, turns: 4, privy: true, effect: '遊幸、觀戲等娛樂的解悶效果 +50%；但言官議論奢靡，朝望 −2。' },
  { id: 'observatory', name: '建觀象台、修曆法', cost: 25, turns: 3, needWest: true, effect: '天象不再引起朝野恐慌；朝望 +3。（需曾優禮西洋教士）' },
];

export function projectState(state: GameState, id: string): 'idle' | 'building' | 'done' {
  const p = state.world.projects.find((x) => x.id === id);
  return !p ? 'idle' : p.complete ? 'done' : 'building';
}

export function startProject(state: GameState, id: string, usePrivy = false): string | null {
  const def = PROJECTS.find((x) => x.id === id);
  if (!def) return '無此工程。';
  if (state.over) return '本局已終。';
  if (projectState(state, id) !== 'idle') return '此工程已興辦。';
  if (state.world.projects.some((x) => !x.complete)) return '工部奏：一時不能並舉兩項大工。';
  if (def.needWest && !state.world.westerner) return '欽天監奏：無西洋曆算之人，難以興辦。';
  const w = state.world;
  if (usePrivy ? w.privy < def.cost : w.treasury < def.cost) return usePrivy ? '內帑不足。' : '戶部奏：庫銀不足。';
  if (state.orders.every((o) => o.edict !== 'build' || o.issuedTurn !== state.turn)) {
    const err = spend(state, 1);
    if (err) return err;
  }
  flow(state, '營建', def.name, usePrivy ? { privy: -def.cost } : { silver: -def.cost });
  w.projects.push({ id, start: state.turn, done: state.turn + def.turns, complete: false });
  state.log.push({ turn: state.turn, text: `興工：${def.name}` });
  return null;
}

// ───────────────────────── 娛樂 ─────────────────────────

export interface LeisureDef {
  id: string;
  name: string;
  energy: number;
  silver?: number;
  privy?: number;
  mood: number;
  desc: string;
}

export const LEISURE: LeisureDef[] = [
  { id: 'garden', name: '遊幸西苑', energy: 1, mood: 8, desc: '泛舟太液池，賞花觀魚。勞損 −1。' },
  { id: 'opera', name: '觀戲聽曲', energy: 1, privy: 2, mood: 12, desc: '傳教坊司、南府演戲。花些內帑；言官或議奢靡。' },
  { id: 'calligraphy', name: '臨池揮毫', energy: 1, mood: 6, desc: '讀書寫字，靜心養性。勞損 −1，士林稱道（言路 +1）。' },
  { id: 'harem', name: '臨幸後宮', energy: 1, mood: 10, desc: '選一位妃嬪共度：她的好感、恩寵上升，其他人妒意上升；或有喜訊。' },
  { id: 'temple', name: '禮佛問道', energy: 1, mood: 6, desc: '入宮中佛堂、道觀。病中有助康復。' },
  { id: 'hunt', name: '南苑校獵', energy: 2, silver: 5, mood: 15, desc: '率京營校獵，京營士氣稍振；有墜馬之險。' },
  { id: 'incognito', name: '微服私訪', energy: 2, mood: 10, desc: '換上便服出宮，帶回一份確實的京師見聞；有遇刺之險、言官或議。' },
];

export const LEISURE_COOLDOWN = 3;

/** 6 旬內第幾次：效果 100%／60%／30% */
export function leisureFactor(state: GameState, id: string): number {
  const uses = (state.world.emperor.leisureLog[id] ?? []).filter((t) => state.turn - t < 6).length;
  return uses === 0 ? 1 : uses === 1 ? 0.6 : 0.3;
}

export function leisureBlock(state: GameState, id: string): string | null {
  const e = state.world.emperor;
  if (e.leisureTurn === state.turn) return '本旬已經消遣過了（每旬一種）。';
  const last = (e.leisureLog[id] ?? []).slice(-1)[0];
  if (last !== undefined && state.turn - last < LEISURE_COOLDOWN) return `近來才玩過（冷卻 ${LEISURE_COOLDOWN - (state.turn - last)} 旬）。`;
  return null;
}

/** 以文字描述娛樂的效果（不給數字） */
export function leisureHint(state: GameState, def: LeisureDef): string {
  const k = leisureFactor(state, def.id);
  const strength = def.mood * k >= 12 ? '大可解憂' : def.mood * k >= 7 ? '頗能解悶' : '略可舒心';
  return k < 1 ? `${strength}（近來玩過，興致只剩${k === 0.6 ? '六' : '三'}成）` : strength;
}

export function doLeisure(state: GameState, id: string, consort?: string): string | null {
  const def = LEISURE.find((x) => x.id === id);
  const w = state.world;
  const e = w.emperor;
  if (!def) return '無此事。';
  if (state.over) return '本局已終。';
  const block = leisureBlock(state, id);
  if (block) return block;
  if ((def.silver ?? 0) > w.treasury) return '庫銀不足。';
  if ((def.privy ?? 0) > w.privy) return '內帑不足。';
  if (id === 'harem' && !state.consorts.some((c) => c.id === consort && c.status === 'active')) return '請選一位妃嬪。';
  const err = spend(state, def.energy);
  if (err) return err;
  flow(state, '宮廷', def.name, { silver: -(def.silver ?? 0), privy: -(def.privy ?? 0) });
  let gain = def.mood * leisureFactor(state, id);
  if (w.buffs.garden && (id === 'garden' || id === 'opera')) gain *= 1.5;
  addMood(state, gain);
  e.leisureTurn = state.turn;
  (e.leisureLog[id] ??= []).push(state.turn);
  e.leisure[id] = state.turn;
  const r = state.rng;
  switch (id) {
    case 'garden':
      e.fatigue = clamp(e.fatigue - 1, 0, 10);
      break;
    case 'calligraphy':
      e.fatigue = clamp(e.fatigue - 1, 0, 10);
      w.speech = clamp(w.speech + 1, 0, 100);
      break;
    case 'opera':
      if (chance(r, 0.1)) addPrestige(state, -1);
      break;
    case 'temple':
      if (e.illness && !e.illness.treated) e.illness.treat += 0.1;
      break;
    case 'hunt':
      w.jingyingMorale = clamp(w.jingyingMorale + 0.05, 0.3, 1.2);
      if (chance(r, 0.05) && !e.illness) {
        e.illness = { kind: '墜馬傷', severity: 1, since: state.turn, treat: 0, treated: false };
        event(state, 'court', '上校獵墜馬，傷足。', true);
      }
      break;
    case 'harem':
      favor(state, consort!);
      break;
    case 'incognito':
      incognitoReport(state);
      if (chance(r, 0.08)) addPrestige(state, -2);
      if (chance(r, 0.03)) w.cooldown['assassin:incognito'] = state.turn + 1;
      break;
  }
  state.log.push({ turn: state.turn, text: `${def.name}` });
  return null;
}

function incognitoReport(state: GameState): void {
  const r = state.rng;
  const w = state.world;
  const d = local(draft('audience', 'court', 'jingshi', 'court', '微服見聞'), state);
  d.fromLabel = '御前隨侍';
  d.free = true;
  const u = w.regions.jingshi.unrest;
  core(d, `上微服出宣武門，入市井茶肆。所聞：京城${u >= 60 ? '物議洶洶，多怨朝廷' : u >= 35 ? '頗有怨言，米價為苦' : '市面安靜，小民安業'}。`, '微服所聞京城民情', `你換上便服到市井走走。親耳聽到的京城民心：${u >= 60 ? '很不滿' : u >= 35 ? '有些抱怨，米價太貴' : '還算安定'}。`);
  const p = pick(r, PROVINCES);
  const pu = w.regions[p].unrest;
  core(d, `又聞${regionName(p)}來的客商言：彼處${pu >= 65 ? '民情洶洶' : pu >= 40 ? '民多怨言' : '地方安靜'}。`, `客商言${regionName(p)}民情`, `從${regionName(p)}來的商人說那邊「${pu >= 65 ? '民情洶洶' : pu >= 40 ? '民多怨言' : '地方安靜'}」。（這是親耳所聞，比地方官自己報的可靠）`);
  claim(d, `unrest.${p}`, '民情（微服所聞）', pu >= 65 ? '民情洶洶' : pu >= 40 ? '民多怨言' : '地方安靜', pu >= 65 ? '民情洶洶' : pu >= 40 ? '民多怨言' : '地方安靜');
  const bias = shoufuBias(state);
  if (chance(r, 0.6)) {
    const c = state.cases.find((x) => x.uid === bias);
    if (bias !== 'clean' && c) clue(d, `茶肆中有人私議：首輔門下多${regionName(c.region)}之人，凡彼處之事，皆替其說話。`, `市井私議首輔袒護${regionName(c.region)}`, { plain: `有人私下議論：首輔替${regionName(c.region)}那邊的人說話。` });
    else clue(d, '茶肆中有人稱道首輔清廉，門無私謁。', '市井稱首輔清廉', { plain: '有人說首輔很清廉，不收禮。' });
  }
  post(state, d);
}

// ───────────────────────── 每旬 ─────────────────────────

export function palaceTick(state: GameState): void {
  const w = state.world;
  const e = w.emperor;
  const t = state.turn;
  const r = state.rng;

  // 心情：朝望牽動、操勞消磨
  const target = 30 + w.prestige * 0.45;
  addMood(state, (target - e.mood) * 0.08);
  if (e.fatigue >= 4) addMood(state, -(e.fatigue - 3) * 0.8);
  if (w.treasury < 0) addMood(state, -3);
  if (w.regions.jingshi.unrest > 60) addMood(state, -2);
  addMood(state, fx(state, 'mood'));
  const fatigue = e.fatigue;
  e.reads = 0;

  // 營建
  for (const p of w.projects) {
    if (!p.complete && t >= p.done) {
      p.complete = true;
      w.buffs[p.id] = true;
      const def = PROJECTS.find((x) => x.id === p.id)!;
      addMood(state, p.id === 'temple' ? 10 : 3);
      if (p.id === 'garden') addPrestige(state, -2);
      if (p.id === 'observatory') addPrestige(state, 3);
      const d = local(draft('notice', 'gongbu', 'jingshi', 'court', `工部奏：${def.name}告成`), state);
      d.free = true;
      d.highlight = '營建告成';
      core(d, `工部謹奏：${def.name}，工程告成。`, `${def.name}告成`, `工程完工了。效果：${def.effect}`);
      post(state, d);
      event(state, 'court', `${def.name}告成。`);
    }
  }
  if (w.buffs.academy) addPrestige(state, 0.15);
  if (w.buffs.clinic) addUnrest(state, 'jingshi', -0.3);

  illnessTick(state, fatigue);
  if (state.over) return;


  // 心情極差：遷怒臣下
  if (e.mood < 20 && chance(r, 0.25)) outburst(state);

  // 京師事件：節令、秋決、隨機
  const m = t % 36;
  if (m === 1) festival(state, '元宵', '上元燈節');
  if (m === 14) festival(state, '端午', '端陽龍舟');
  if (m === 23) festival(state, '中秋', '中秋賞月');
  if (m === 26) autumnAssize(state);
  if (chance(r, 0.6)) capitalEvent(state);
  if (chance(r, 0.25)) capitalEvent(state);
  if (chance(r, 0.55)) localAffair(state);

}

// ───────────────────────── 病痛 ─────────────────────────

const ILLS = ['風寒', '瘧疾', '痢疾', '頭風'];

function illnessTick(state: GameState, fatigue: number): void {
  const r = state.rng;
  const w = state.world;
  const e = w.emperor;
  const t = state.turn;
  if (!e.illness) {
    let p = 0.02 + fatigue * 0.03 * (state.difficulty === 'easy' ? 0.6 : 1);
    if (e.mood < 25) p += 0.05;
    if (t < w.plagueUntil) p += w.buffs.clinic ? 0.04 : 0.08;
    if (t < e.elixirUntil) p += 0.04;
    p += fx(state, 'ill');
    if (chance(r, p)) {
      const sev = chance(r, 0.6) ? 1 : chance(r, 0.75) ? 2 : 3;
      e.illness = { kind: pick(r, ILLS), severity: sev, since: t, treat: 0, treated: false };
      event(state, 'court', `聖躬違和（${e.illness.kind}，${ILL_TEXT[sev]}）。`, true);
      illnessTask(state, false);
    }
    return;
  }
  const ill = e.illness;
  if (t === ill.since) return;
  addMood(state, -2);
  const base = [0, 0.35, 0.2, 0.1][ill.severity];
  const rate = base + ill.treat + (w.buffs.clinic ? 0.1 : 0);
  if (chance(r, rate)) {
    e.illness = null;
    addMood(state, 6);
    const d = local(draft('notice', 'court', 'jingshi', 'court', '太醫院奏：聖躬康復'), state);
    d.fromLabel = '太醫院';
    d.free = true;
    d.highlight = '聖躬康復';
    core(d, '太醫院謹奏：仰賴天佑，聖躬康復，臣等不勝欣忭。', '聖躬康復', '你的病好了。');
    post(state, d);
    event(state, 'court', '聖躬康復。');
    return;
  }
  if (!ill.treated && ill.severity < 3 && chance(r, e.fatigue >= 6 ? 0.24 : 0.12)) {
    ill.severity += 1;
    event(state, 'court', `聖躬病勢加重（${ILL_TEXT[ill.severity]}）。`, true);
    illnessTask(state, true);
  }
  if (ill.severity === 3 && chance(r, ill.treated ? 0.06 : 0.15)) {
    event(state, 'court', `上疾大漸，崩於乾清宮。`, true);
    state.over = { reason: 'illness', turn: t };
    return;
  }
  // 久病不癒，太醫院再奏
  if (t - ill.since >= 4 && (t - ill.since) % 4 === 0) illnessTask(state, true);
}

function illnessTask(state: GameState, again: boolean): void {
  const w = state.world;
  const ill = w.emperor.illness!;
  const choices: Choice[] = [
    { id: 'doctors', label: '太醫會診', note: '穩妥的療法，康復機會明顯提高。', silver: 2 },
    { id: 'elixir', label: '服方士丹藥', note: '見效最快，但丹藥燥烈，有一定機會反而加重病情。', privy: 5 },
    { id: 'rest', label: '罷朝靜養三旬', note: '康復較快、心情好轉；但這三旬精力再少一點。' },
    { id: 'pray', label: '設壇祈禱禳災', note: '對病情幫助不大，但能寬慰聖心，朝野也稱誠敬。', silver: 3 },
  ];
  if (w.westerner) choices.push({ id: 'west', label: '試西洋藥方', note: '西洋教士所獻藥方，治瘧疾有奇效，治他病則平平。' });
  choices.push({ id: 'none', label: '不必理會', note: '不花錢，但病情可能加重；病勢沉重時，有駕崩之虞。' });
  const d = local(draft('task', 'court', 'jingshi', 'court', again ? '太醫院再奏聖躬' : '太醫院奏：聖躬違和'), state);
  d.fromLabel = '太醫院院使';
  d.free = true;
  d.highlight = '聖躬違和';
  core(
    d,
    `太醫院謹奏：聖躬${ill.kind}，${ILL_TEXT[ill.severity]}。伏乞聖心寬懌，善加調攝。`,
    `聖躬${ill.kind}，${ILL_TEXT[ill.severity]}`,
    `你生病了：${ill.kind}，${ILL_TEXT[ill.severity]}。病中精力會減少（輕 −1、重 −2、危 −3），心情也會變差。請選擇怎麼治療。`,
  );
  task(d, 'pal:ill', choices, 'none', state.turn + 1, { recommend: 'doctors' });
  post(state, d);
}

function outburst(state: GameState): void {
  const pool = ['hubu', 'bingbu', 'libu', 'rites', 'gongbu', 'yushi'];
  const id = pick(state.rng, pool);
  const c = state.chars[id];
  addPrestige(state, -3);
  addMood(state, 3);
  const d = local(draft('notice', 'silijian', 'jingshi', 'court', '司禮監奏：天顏震怒'), state);
  d.free = true;
  d.highlight = '天顏震怒';
  core(d, `奴婢謹奏：昨日${c.title}${c.name}奏事稍遲，上震怒，命錦衣衛廷杖四十。朝臣惶懼，外間頗有議論。`, `上震怒，廷杖${c.title}`, `你最近心情很差，昨天因為小事遷怒，下令當廷杖打${c.title}${c.name}。大臣們很害怕，朝野議論紛紛（朝望下降）。多讓自己休息、娛樂一下吧。`);
  post(state, d);
  event(state, 'court', `天子心緒惡劣，遷怒廷杖${c.title}${c.name}。`, true);
}

// ───────────────────────── 京師事件 ─────────────────────────

function palTask(state: GameState, id: string, fromLabel: string, title: string, choices: Choice[], fallback: string, recommend: string, from = 'court'): DocDraft {
  const d = local(draft('task', from, 'jingshi', 'court', title), state);
  if (from === 'court') d.fromLabel = fromLabel;
  task(d, id, choices, fallback, state.turn + 2, { recommend });
  const rec = choices.find((c) => c.id === recommend);
  d.recommend = rec ? `擬：${rec.label}。` : undefined;
  return d;
}

function festival(state: GameState, name: string, scene: string): void {
  const d = palTask(state, 'pal:festival', '禮部', `禮部請辦${name}節慶`, [
    { id: 'feast', label: '與民同樂', note: '京城張燈結綵、施粥賞錢：京城民心好轉，龍心大悅。', silver: 6 },
    { id: 'small', label: '宮中小宴', note: '動用一點內帑，宮中自娛，心情好轉。', privy: 2 },
    { id: 'none', label: '罷宴節用', note: '朝野稱頌節儉，朝望 +1；但節日冷清，心情略差。' },
  ], 'none', 'small', 'rites');
  core(d, `禮部謹奏：${scene}在即，應否張燈設宴，伏候聖裁。`, `${name}節慶如何辦理`, `${name}節快到了，要怎麼過？`);
  post(state, d);
}

function autumnAssize(state: GameState): void {
  const d = palTask(state, 'pal:assize', '刑部', '刑部請行秋決勾決', [
    { id: 'personal', label: '親自勾決', note: '耗精力 2；親覽案卷、決定生死，朝望 +2；但心情沉重。', energy: 2 },
    { id: 'lenient', label: '從寬減等', note: '多數死囚減等，朝望 +3、心情稍好；但治安略差。' },
    { id: 'routine', label: '依刑部所擬', note: '照刑部的意見處決。' },
  ], 'routine', 'routine');
  core(d, '刑部謹奏：秋審已畢，情實人犯若干名，應否勾決，伏乞聖裁。', '秋審情實人犯應否勾決', '每年秋天要決定死刑犯是否處決（勾決）。親自看案卷很花精力。');
  post(state, d);
}

interface CapitalEvent {
  id: string;
  weight: number;
  cooldown: number;
  cond?: (s: GameState) => boolean;
  make: (s: GameState) => void;
}

const OMENS = [
  { what: '嘉禾一莖九穗', plain: '一株稻長了九個穗' },
  { what: '白鹿見於山中', plain: '山裡出現白色的鹿' },
  { what: '甘露降於松柏', plain: '松柏上降下甜露' },
  { what: '黃河水清三日', plain: '黃河水清了三天' },
];

const CAPITAL_EVENTS: CapitalEvent[] = [
  {
    id: 'omen',
    weight: 2.5,
    cooldown: 14,
    make: (s) => {
      const o = pick(s.rng, OMENS);
      const p = pick(s.rng, PROVINCES);
      const d = palTask(s, 'pal:omen', '禮部', `${regionName(p)}奏獻祥瑞`, [
        { id: 'celebrate', label: '告廟稱賀', note: '百官上表稱賀，龍心大悅，朝望 +1。', silver: 5 },
        { id: 'modest', label: '卻而不受', note: '示天下以謙德，朝望 +3，心情略好。' },
      ], 'modest', 'celebrate', 'rites');
      core(d, `禮部謹奏：${regionName(p)}奏稱「${o.what}」，此聖德感召之瑞，請告廟稱賀。`, `${regionName(p)}奏祥瑞：${o.what}`, `${regionName(p)}報告出現祥瑞：${o.plain}。古人認為這是上天嘉獎皇帝的徵兆。`);
      post(s, d);
    },
  },
  {
    id: 'remonstrance',
    weight: 1.6,
    cooldown: 10,
    cond: (s) => Object.values(s.world.emperor.leisure).filter((t) => s.turn - t <= 6).length >= 2 || chance(s.rng, 0.3),
    make: (s) => {
      const playful = Object.values(s.world.emperor.leisure).filter((t) => s.turn - t <= 6).length >= 2;
      const d = palTask(s, 'pal:remon', '都察院', '御史上疏切諫', [
        { id: 'accept', label: '嘉納其言', note: '朝望 +4；但被當面數落，心情不佳。' },
        { id: 'ignore', label: '留中不報', note: '不理會；心情略差。' },
        { id: 'punish', label: '廷杖示儆', note: '出了一口氣（心情稍好），但朝望大跌 −8。' },
      ], 'ignore', 'accept', 'yushi');
      core(
        d,
        `臣${s.chars.yushi.name}昧死上言：${playful ? '近聞皇上數幸西苑、觀戲校獵，臣恐逸豫之漸，不可不戒' : '近日章奏多留中不下，臣恐上下否隔，伏乞皇上勤御經筵、早朝不輟'}。`,
        playful ? '御史切諫皇上逸豫' : '御史諫勤政',
        playful ? '御史上奏批評你最近玩樂太多。（批評皇帝是言官的職責）' : '御史上奏勸你更勤於政事。',
      );
      post(s, d);
    },
  },
  {
    id: 'fire',
    weight: 1.8,
    cooldown: 12,
    make: (s) => {
      addUnrest(s, 'jingshi', 4);
      const d = palTask(s, 'pal:fire', '順天府', '順天府奏京城失火', [
        { id: 'relief', label: '發帑撫恤', note: '京城民心好轉。', silver: 10 },
        { id: 'order', label: '責令五城兵馬司', note: '不花錢；災民無著，京城民心變差，心情也不好。' },
      ], 'order', 'relief', `gov:jingshi`);
      core(d, `順天府謹奏：昨夜${pick(s.rng, ['正陽門外', '崇文門外', '西四牌樓', '東直門內'])}失火，延燒民居數百間，災民露宿。`, '京城失火，災民露宿', '京城失火，燒了幾百間房子，很多人無家可歸。');
      post(s, d);
    },
  },
  {
    id: 'plague',
    weight: 1,
    cooldown: 24,
    make: (s) => {
      s.world.plagueUntil = s.turn + (s.world.buffs.clinic ? 3 : 6);
      addUnrest(s, 'jingshi', 6);
      const d = palTask(s, 'pal:plague', '順天府', '順天府奏京師疫癘', [
        { id: 'medicine', label: '太醫院施藥', note: '疫情早平、民心好轉；宮中染病的機會也降低。', silver: 8 },
        { id: 'pray', label: '設壇祈禳', note: '寬慰人心，但疫情照舊。', silver: 2 },
        { id: 'none', label: '不予理會', note: '疫情延續，京城民心惡化，聖躬也可能染病。' },
      ], 'none', 'medicine', `gov:jingshi`);
      core(d, '順天府謹奏：京師疫癘大作，比戶傳染，死者日以百計。', '京師疫癘大作', `京城爆發瘟疫，每天死上百人。${s.world.buffs.clinic ? '（惠民藥局已在施藥，疫情較輕）' : ''}疫病期間，你自己也比較容易生病。`);
      post(s, d);
    },
  },
  {
    id: 'quake',
    weight: 0.3,
    cooldown: 48,
    // 地震應屬罕見：即使輪到，也只有三成機會真的發生
    cond: (s) => chance(s.rng, 0.3),
    make: (s) => {
      addUnrest(s, 'jingshi', 4);
      addMood(s, -4);
      const d = palTask(s, 'pal:quake', '順天府', '順天府奏京師地震', [
        { id: 'repair', label: '發帑修葺', note: '京城民心好轉。', silver: 8 },
        { id: 'edict', label: '下詔罪己', note: '向天下認錯，朝望 +3；心情不佳。' },
        { id: 'none', label: '照常', note: '不理會。' },
      ], 'none', 'repair', `gov:jingshi`);
      core(d, '順天府謹奏：京師地震有聲，房屋傾圮數十間，人心惶惶。', '京師地震，人心惶惶', '京城地震，倒了幾十間房子。古人認為地震是上天示警。');
      post(s, d);
    },
  },
  {
    id: 'comet',
    weight: 1,
    cooldown: 16,
    make: (s) => {
      const calm = s.world.buffs.observatory;
      if (!calm) addMood(s, -4);
      const d = local(draft('notice', 'court', 'jingshi', 'court', '欽天監奏天象'), s);
      d.fromLabel = '欽天監';
      d.free = true;
      core(d, `欽天監奏：${pick(s.rng, ['彗星見於西北，長丈餘', '日有食之', '熒惑守心', '太白晝見'])}。${calm ? '然新修曆法已推算在先，朝野晏然。' : '占曰：主兵革、權臣。'}`, '天象示警', calm ? '天象異常，但觀象台早已算出，大家並不驚慌。' : '天象異常。古人認為是上天的警告，你也有些不安（心情略差）。');
      post(s, d);
    },
  },
  {
    id: 'alchemist',
    weight: 1,
    cooldown: 20,
    make: (s) => {
      const d = palTask(s, 'pal:elixir', '司禮監', '方士進獻仙丹', [
        { id: 'take', label: '服之', note: '服後精神大振（心情大好）；但此後一段時間較易生病，甚至可能立刻中毒。' },
        { id: 'reward', label: '賞而藏之', note: '賞方士一點內帑，心情稍好。', privy: 2 },
        { id: 'expel', label: '逐之出京', note: '朝臣稱善，朝望 +1。' },
      ], 'expel', 'expel', 'silijian');
      core(d, `奴婢謹奏：有${pick(s.rng, ['龍虎山', '茅山', '終南山'])}方士某，自言煉得金丹，服之可以延年益壽，求獻御前。`, '方士進獻金丹', '有道士說他煉出了能延年益壽的仙丹，想獻給你。');
      post(s, d);
    },
  },
  {
    id: 'westerner',
    weight: 1,
    cooldown: 999,
    cond: (s) => !s.world.westerner && s.turn >= 6,
    make: (s) => {
      const d = palTask(s, 'pal:west', '禮部', '西洋教士進獻方物', [
        { id: 'accept', label: '收而優禮之', note: '龍心大悅；日後可用西洋藥方治病、可建觀象台。保守的朝臣不以為然。', silver: 3 },
        { id: 'decline', label: '卻其所獻', note: '朝臣稱善，朝望 +1。' },
      ], 'decline', 'decline', 'rites');
      core(d, '禮部謹奏：有大西洋國人利某、湯某，航海九萬里而來，獻自鳴鐘、萬國輿圖、西洋藥方，願留京效力。', '西洋教士獻自鳴鐘、輿圖、藥方', '有歐洲傳教士來到京城，獻上自鳴鐘、世界地圖和藥方，想留下來為朝廷做事。');
      fluff(d, '臣等竊以為，夷人奇技淫巧，不足為訓。', '（禮部官員對外國人頗有偏見）');
      post(s, d);
    },
  },
  {
    id: 'clan',
    weight: 1.4,
    cooldown: 10,
    make: (s) => {
      const d = palTask(s, 'pal:clan', '宗人府', '宗人府奏宗室請祿', [
        { id: 'pay', label: '照數給發', note: '宗室感恩，朝望 +1。', silver: 10 },
        { id: 'half', label: '先給一半', note: '各退一步。', silver: 5 },
        { id: 'refuse', label: '暫緩', note: '宗室怨望，朝望 −2，心情略差。' },
      ], 'refuse', 'half');
      core(d, '宗人府謹奏：各府宗室祿米積欠，貧宗有不能舉火者，伏乞發給。', '宗室祿米積欠，請發給', '皇族遠親的俸祿欠了很久，有的窮到開不了伙。');
      post(s, d);
    },
  },
  {
    id: 'retire',
    weight: 0.9,
    cooldown: 16,
    make: (s) => {
      const id = pick(s.rng, ['hubu', 'bingbu', 'libu', 'rites', 'gongbu']);
      const c = s.chars[id];
      const d = palTask(s, 'pal:retire', c.title, `${c.title}${c.name}乞休`, [
        { id: 'grant', label: '准其致仕', note: '換一位新任尚書（才幹未知）。' },
        { id: 'keep', label: '溫旨慰留', note: '留下他；他會繼續任職。' },
      ], 'keep', 'keep', id);
      core(d, `臣${c.name}謹奏：臣年老多病，精力日衰，伏乞放歸田里。`, `${c.title}乞休`, `${c.title}說自己年老多病，想退休。`);
      d.task!.data = { who: id };
      post(s, d);
    },
  },
  {
    id: 'theft',
    weight: 1,
    cooldown: 14,
    make: (s) => {
      const d = palTask(s, 'pal:theft', '司禮監', '內官監奏宮中失竊', [
        { id: 'punish', label: '嚴加究治', note: '整肅宮禁，心情稍好、朝望 +1。' },
        { id: 'ignore', label: '不必深究', note: '息事寧人；心情略差。' },
      ], 'ignore', 'ignore', 'silijian');
      core(d, '奴婢謹奏：內庫所藏玉器數件不翼而飛，疑係內侍監守自盜。', '內庫玉器失竊', '宮裡倉庫的玉器被偷了，可能是太監監守自盜。');
      post(s, d);
    },
  },
  {
    id: 'compile',
    weight: 0.5,
    cooldown: 999,
    cond: (s) => s.turn >= 12,
    make: (s) => {
      const d = palTask(s, 'pal:compile', '翰林院', '翰林院請修大典', [
        { id: 'fund', label: '開館纂修', note: '文治之盛，士林歸心：朝望 +6，心情大好。', silver: 30 },
        { id: 'no', label: '國用方殷，暫緩', note: '不花錢。' },
      ], 'no', 'no', 'rites');
      core(d, '翰林院謹奏：請開館纂修《崇寧大典》，網羅天下典籍，以垂萬世。', '請開館纂修大典', '翰林院建議編一部大型百科全書，讓後世稱頌你的文治。');
      post(s, d);
    },
  },
  {
    id: 'goods',
    weight: 1.8,
    cooldown: 6,
    make: (s) => {
      const p = pick(s.rng, PROVINCES);
      const thing = pick(s.rng, ['荔枝', '新茶', '雲錦', '端硯', '鰣魚', '貢橘']);
      addMood(s, 3);
      const d = local(draft('notice', gov(s, p).id, 'jingshi', 'court', `${regionName(p)}進貢${thing}`), s);
      d.free = true;
      core(d, `${REGIONS[p].gov}${gov(s, p).name}謹進${thing}若干，以供御用。`, `${regionName(p)}進貢${thing}`, `${regionName(p)}送來${thing}給你享用。（心情略好）`);
      post(s, d);
    },
  },
  {
    id: 'cold',
    weight: 2,
    cooldown: 12,
    cond: (s) => seasonOf(s.turn) === 'winter',
    make: (s) => {
      const d = palTask(s, 'pal:cold', '順天府', '順天府奏大雪奇寒', [
        { id: 'porridge', label: '開廠施粥', note: '京城民心好轉、朝望 +1。', grain: 8 },
        { id: 'none', label: '不必', note: '凍餒者眾，京城民心變差。' },
      ], 'none', 'porridge', `gov:jingshi`);
      core(d, '順天府謹奏：連日大雪，奇寒徹骨，京城貧民凍餒者眾，伏乞開廠施粥。', '大雪奇寒，請開粥廠', '連下大雪、非常冷，京城窮人挨凍受餓，請你開設施粥廠。');
      post(s, d);
    },
  },
  {
    id: 'harvest',
    weight: 1.6,
    cooldown: 12,
    cond: (s) => monthOf(s.turn) >= 6 && monthOf(s.turn) <= 8,
    make: (s) => {
      addMood(s, 5);
      const d = local(draft('notice', 'gov:jingshi', 'jingshi', 'court', '順天府奏京畿秋成'), s);
      d.free = true;
      core(d, '順天府謹奏：京畿今秋雨暘時若，五穀豐登，小民鼓腹而歌。', '京畿豐收', '京城附近今年大豐收。（心情好轉）');
      post(s, d);
    },
  },
  {
    id: 'gossip',
    weight: 1.4,
    cooldown: 8,
    make: (s) => {
      const r = s.rng;
      const d = local(draft('rumor', 'silijian', 'jingshi', 'court', '宮中閒話'), s);
      d.fromLabel = '御前太監';
      d.free = true;
      const p = pick(r, PROVINCES);
      const g = gov(s, p);
      const truthful = chance(r, 0.6);
      const greedy = truthful ? g.integrity < 0.45 : g.integrity >= 0.45;
      core(d, `侍奉的太監閒話：聽說${REGIONS[p].gov}${g.name}${greedy ? '在任上撈了不少，家裡新起了宅子' : '為官清苦，連轎子都捨不得換'}。`, `太監閒話：${g.name}${greedy ? '撈了不少' : '為官清苦'}`, `身邊太監聊八卦，說${regionName(p)}的長官${greedy ? '很貪' : '很清廉'}。（太監的閒話未必可靠）`);
      post(s, d);
    },
  },
  {
    id: 'review',
    weight: 0.8,
    cooldown: 18,
    make: (s) => {
      const d = palTask(s, 'pal:review', '兵部', '兵部請行大閱', [
        { id: 'review', label: '親臨大閱', note: '耗精力 2；京營士氣大振，龍心大悅，朝望 +1。', energy: 2 },
        { id: 'skip', label: '遣將代閱', note: '照常。' },
      ], 'skip', 'skip', 'bingbu');
      core(d, '兵部謹奏：京營操練已久，請皇上親臨校場大閱，以振軍威。', '請親臨大閱京營', '兵部請你親自去校場檢閱京營。');
      post(s, d);
    },
  },
];

function capitalEvent(state: GameState): void {
  const t = state.turn;
  const cd = state.world.cooldown;
  const pool = CAPITAL_EVENTS.filter((e) => (cd[e.id] ?? -99) <= t && (!e.cond || e.cond(state)));
  if (!pool.length) return;
  const total = pool.reduce((n, e) => n + e.weight, 0);
  let x = range(state.rng, 0, total);
  for (const e of pool) {
    x -= e.weight;
    if (x <= 0) {
      cd[e.id] = t + e.cooldown;
      e.make(state);
      return;
    }
  }
}

// ───────────────────────── 地方雜事 ─────────────────────────

const LOCAL = [
  { id: 'wall', title: '請修城垣', text: '城垣年久傾圮，伏乞發帑修築', plain: '城牆壞了，請撥錢修理', silver: 6, yes: '當地民心好轉、駐軍略增。' },
  { id: 'school', title: '請建社學', text: '鄉間子弟失學，請於各鄉設立社學', plain: '請在鄉下設學校', silver: 3, yes: '朝望 +1。' },
  { id: 'chastity', title: '請旌表節孝', text: '境內節婦孝子若干人，請賜旌表，以勵風俗', plain: '請表揚地方上的節婦孝子', yes: '朝望 +1，心情略好。' },
  { id: 'arrears', title: '請寬免積欠', text: '民間歷年積欠錢糧，追比甚苦，請予寬免', plain: '百姓欠了多年的稅，追討很苦，請免除', yes: '當地民心好轉，但兩月內錢糧少收。' },
  { id: 'police', title: '請增設巡檢司', text: '境內盜賊竊發，請增設巡檢司，以靖地方', plain: '地方上有小偷強盜，請增設治安據點', silver: 4, yes: '當地民心好轉。' },
] as const;

function localAffair(state: GameState): void {
  const r = state.rng;
  const p = pick(r, PROVINCES);
  const g = gov(state, p);
  const a = pick(r, LOCAL);
  const d = draft('task', g.id, p, 'routine', `${regionName(p)}${a.title}`);
  core(d, `臣${g.name}謹奏：${a.text}。`, `${regionName(p)}${a.title}`, `${regionName(p)}的長官：${a.plain}。`);
  if (chance(r, 0.4)) fluff(d, '臣忝守是邦，夙夜兢惕，惟恐有負聖恩。', '（客套話）');
  task(
    d,
    `loc:${a.id}`,
    [
      { id: 'yes', label: '准', note: a.yes, silver: 'silver' in a ? a.silver : undefined },
      { id: 'no', label: '不准', note: '一切照舊。' },
    ],
    'no',
    state.turn + 4,
    { region: p, recommend: 'yes' },
  );
  d.recommend = '擬：准行。';
  post(state, d);
}

// ───────────────────────── 套用選項 ─────────────────────────

export function applyPalaceChoice(state: GameState, doc: Doc, id: string): void {
  const w = state.world;
  const e = w.emperor;
  const t = doc.task!;
  const mood = (d: number) => addMood(state, d);
  switch (t.id) {
    case 'pal:ill': {
      const ill = e.illness;
      if (!ill) return;
      if (id !== 'none') ill.treated = true;
      if (id === 'doctors') ill.treat = Math.max(ill.treat, 0.25);
      if (id === 'elixir') {
        ill.treat = Math.max(ill.treat, 0.45);
        if (chance(state.rng, 0.25) && ill.severity < 3) {
          ill.severity += 1;
          event(state, 'court', '丹藥燥烈，聖躬反而加重。', true);
        }
      }
      if (id === 'rest') {
        ill.treat = Math.max(ill.treat, 0.35);
        e.restUntil = state.turn + 3;
        mood(4);
      }
      if (id === 'pray') {
        ill.treat = Math.max(ill.treat, 0.05);
        mood(4);
        addPrestige(state, 1);
      }
      if (id === 'west') ill.treat = Math.max(ill.treat, ill.kind === '瘧疾' ? 0.55 : 0.15);
      return;
    }
    case 'pal:heir':
      if (id === 'amnesty') {
        addPrestige(state, 4);
        for (const p of PROVINCES) addUnrest(state, p, -5);
      }
      if (id === 'celebrate') mood(6);
      return;
    case 'pal:festival':
      if (id === 'feast') {
        mood(10);
        addUnrest(state, 'jingshi', -6);
      } else if (id === 'small') mood(5);
      else {
        addPrestige(state, 1);
        mood(-2);
      }
      return;
    case 'pal:assize':
      if (id === 'personal') {
        addPrestige(state, 2);
        mood(-3);
      } else if (id === 'lenient') {
        addPrestige(state, 3);
        mood(2);
        addUnrest(state, 'jingshi', 2);
      }
      return;
    case 'pal:omen':
      if (id === 'celebrate') {
        mood(10);
        addPrestige(state, 1);
      } else {
        mood(3);
        addPrestige(state, 3);
      }
      return;
    case 'pal:tribute':
      if (id === 'lavish') {
        mood(8);
        addPrestige(state, 4);
      } else if (id === 'normal') {
        mood(4);
        addPrestige(state, 1);
      } else addPrestige(state, -2);
      return;
    case 'pal:remon':
      if (id === 'accept') {
        mood(-6);
        addPrestige(state, 4);
      } else if (id === 'ignore') mood(-1);
      else {
        mood(3);
        addPrestige(state, -8);
        w.wrongful.push(`諫臣（廷杖）`);
      }
      return;
    case 'pal:fire':
      if (id === 'relief') addUnrest(state, 'jingshi', -8);
      else {
        addUnrest(state, 'jingshi', 6);
        mood(-3);
      }
      return;
    case 'pal:plague':
      if (id === 'medicine') {
        w.plagueUntil = Math.min(w.plagueUntil, state.turn + 2);
        addUnrest(state, 'jingshi', -6);
      } else if (id === 'pray') mood(2);
      else addUnrest(state, 'jingshi', 6);
      return;
    case 'pal:quake':
      if (id === 'repair') addUnrest(state, 'jingshi', -6);
      if (id === 'edict') {
        addPrestige(state, 3);
        mood(-3);
      }
      return;
    case 'pal:elixir':
      if (id === 'take') {
        mood(12);
        e.elixirUntil = state.turn + 12;
        if (!e.illness && chance(state.rng, 0.2)) {
          e.illness = { kind: '丹毒', severity: 2, since: state.turn, treat: 0, treated: false };
          event(state, 'court', '服丹後丹毒發作，聖躬違和。', true);
          illnessTask(state, false);
        }
      } else if (id === 'reward') mood(3);
      else addPrestige(state, 1);
      return;
    case 'pal:west':
      if (id === 'accept') {
        w.westerner = true;
        mood(8);
        addPrestige(state, -1);
      } else addPrestige(state, 1);
      return;
    case 'pal:clan':
      if (id === 'pay') addPrestige(state, 1);
      if (id === 'refuse') {
        addPrestige(state, -2);
        mood(-1);
      }
      return;
    case 'pal:retire':
      if (id === 'grant') {
        const who = String(t.data?.who ?? '');
        if (who && state.chars[who]) {
          const old = replaceChar(state, who);
          event(state, 'court', `${state.chars[who].title}${old}致仕，${state.chars[who].name}繼任。`);
        }
      }
      return;
    case 'pal:theft':
      if (id === 'punish') {
        mood(2);
        addPrestige(state, 1);
      } else mood(-2);
      return;
    case 'pal:compile':
      if (id === 'fund') {
        addPrestige(state, 6);
        mood(8);
      }
      return;
    case 'pal:cold':
      if (id === 'porridge') {
        addUnrest(state, 'jingshi', -6);
        addPrestige(state, 1);
      } else addUnrest(state, 'jingshi', 5);
      return;
    case 'pal:review':
      if (id === 'review') {
        w.jingyingMorale = clamp(w.jingyingMorale + 0.15, 0.4, 1.15);
        mood(6);
        addPrestige(state, 1);
      }
      return;
    default:
      break;
  }
  if (t.id.startsWith('loc:') && id === 'yes') {
    const p = t.region as RegionId;
    const kind = t.id.slice(4);
    if (kind === 'wall') {
      addUnrest(state, p, -3);
      w.regions[p].garrison += 500;
    } else if (kind === 'school') addPrestige(state, 1);
    else if (kind === 'chastity') {
      addPrestige(state, 1);
      mood(1);
    } else if (kind === 'arrears') {
      addUnrest(state, p, -6);
      w.regions[p].remitUntil = Math.max(w.regions[p].remitUntil, state.turn + 6);
    } else if (kind === 'police') addUnrest(state, p, -4);
  }
}

