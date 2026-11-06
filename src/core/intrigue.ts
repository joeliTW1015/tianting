// 宮廷：太后與顧命老臣、宮廷刺殺、文字獄、兩難事件。

import { core, draft, local, post, task } from './docs';
import { addClout, addGrievance, clout } from './factions';
import { activeConsorts } from './harem';
import { exposed } from './intel';
import { chance, int, pick, range } from './rng';
import { addStatus, hasStatus } from './statuses';
import type { Choice, Doc, GameState } from './types';
import { addMood, addPrestige, addUnrest, clamp, event, flow, replaceChar } from './util';

// ───────────────────────── 護衛與刺殺 ─────────────────────────

export function guardLevel(state: GameState): number {
  const jy = state.chars.jinyiwei;
  let g = 1 + (jy.loyalty >= 70 ? 2 : jy.loyalty >= 50 ? 1 : 0) + (jy.abil.mil >= 4 ? 1 : 0);
  if (hasStatus(state, 'guard')) g += 1;
  if (jy.faction === 'yan' && state.cases.some((c) => c.def === 'eunuch' && !c.data.removed)) g -= 1;
  return clamp(g, 1, 5);
}

export const GUARD_TEXT = ['', '宿衛廢弛', '宿衛鬆懈', '宿衛如常', '宿衛嚴密', '宿衛森嚴'];

const KINDS = ['ting', 'pill', 'maid', 'powder'] as const;

/** 刺殺嘗試（來源：權閹、皇叔、怨望極深的派系、建州細作；微服時） */
export function assassinTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  const r = state.rng;
  const sources: string[] = [];
  if (w.cooldown['assassin:eunuch'] === t) sources.push('eunuch');
  if (w.cooldown['assassin:incognito'] === t) sources.push('incognito');
  const un = state.cases.find((c) => c.def === 'uncle');
  if (un && un.branch === 'covet' && !un.data.dead && !un.data.inCapital && un.data.progress >= 60 && chance(r, 0.03)) sources.push('uncle');
  for (const f of ['yan', 'xun'] as const) if (w.factions[f].grievance >= 95 && chance(r, 0.03)) sources.push(f);
  if (w.powers.jianzhou?.hostility >= 85 && w.emperor.campaignArmy && chance(r, 0.05)) sources.push('jianzhou');
  if (!sources.length || (w.cooldown.assassin ?? -99) > t) return;
  w.cooldown.assassin = t + 6;
  const src = sources[0];
  const p = clamp(0.3 - guardLevel(state) * 0.07 + (src === 'incognito' ? 0.15 : 0), 0.03, 0.5);
  let kind: (typeof KINDS)[number] = pick(r, ['ting', 'maid', 'powder'] as const);
  if (w.emperor.illness) kind = 'pill';
  if (kind === 'pill' || chance(r, p)) {
    if (kind !== 'pill') {
      event(state, 'court', `天子遇刺（${src === 'incognito' ? '微服之時' : '宮中'}），崩。`, true);
      state.over = { reason: 'assassinated', turn: t };
      return;
    }
  }
  attemptDoc(state, kind, src);
}

function attemptDoc(state: GameState, kind: (typeof KINDS)[number], src: string): void {
  const titles = { ting: '梃擊：狂徒持棍闖宮', pill: '方士進「紅丸」', maid: '宮婢夜謀行刺', powder: '王恭廠火藥局大爆' } as const;
  const text = {
    ting: '有男子持棗木棍闖入宮門，擊傷守門內侍，直至殿簷下，為侍衛擒獲。',
    pill: '有人進仙丹紅丸，言服之可立愈聖疾。',
    maid: '夜半宮婢數人以黃綾縊御寢，繩結誤成死扣，未遂，宮人走報皇后得救。',
    powder: '京師王恭廠火藥局猝然轟發，聲震數十里，屋舍崩摧，死傷無算。',
  } as const;
  const d = local(draft('task', 'jinyiwei', 'jingshi', 'court', titles[kind]), state);
  d.importance = 3;
  d.urgent = true;
  d.highlight = kind === 'pill' ? '宮中進藥' : '宮廷驚變';
  const choices: Choice[] =
    kind === 'pill'
      ? [
          { id: 'take', label: '服之', note: '賭一把：或許藥到病除，或許……（勝算不明）', odds: src === 'eunuch' || src === 'uncle' ? 0.35 : 0.6 },
          { id: 'refuse', label: '不服，交太醫驗看', note: '穩妥；追查進藥之人。' },
        ]
      : [
          { id: 'probe', label: '窮治到底', note: '交東廠、錦衣衛追查主使：可能牽出位高權重者，揭穿了就必須處置。', energy: 1 },
          { id: 'close', label: '以瘋癲結案', note: '息事寧人；真兇逍遙，下次更大膽。' },
          { id: 'blame', label: '嫁禍政敵', note: '借題發揮，打擊最強的一派（賭性）：事成該派大挫；事敗你羅織之名坐實。', odds: 0.5 },
        ];
  core(d, `錦衣衛謹奏：${text[kind]}`, titles[kind], kind === 'pill' ? '有人進獻仙丹。你在病中——這藥是誰送的？' : '有人行刺！幸好沒成功。這是誰指使的？追查下去，可能牽出你不想面對的人。');
  task(d, `as:${kind}`, choices, kind === 'pill' ? 'refuse' : 'close', state.turn + 1, { data: { src } });
  post(state, d);
  addStatus(state, 'shock');
  if (kind === 'powder') {
    addUnrest(state, 'jingshi', 20);
    state.world.jingying *= 0.9;
  }
  event(state, 'court', `${titles[kind]}（主使：${srcName(src)}）。`, true);
}

function srcName(src: string): string {
  return { eunuch: '權閹', uncle: '瑞王', yan: '閹黨', xun: '勳戚', jianzhou: '建州細作', incognito: '市井亡命' }[src] ?? src;
}

// ───────────────────────── 太后與顧命老臣 ─────────────────────────

export const DOWAGER_TEXT = (v: number) => (v >= 75 ? '慈顏甚悅' : v >= 55 ? '和顏悅色' : v >= 35 ? '神色淡淡' : v >= 20 ? '頗有慍色' : '震怒不見');

export function dowagerTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  const r = state.rng;
  w.dowager = clamp(w.dowager + (50 - w.dowager) * 0.01, 0, 100);
  if (t === 2) moveOut(state);
  const cd = w.cooldown;
  if ((cd.dowager ?? -99) > t) return;
  if (w.emperor.illness && w.emperor.illness.severity >= 2 && chance(r, 0.3) && !w.cooldown.regency) {
    cd.dowager = t + 8;
    w.cooldown.regency = t;
    dwTask(state, 'dw:regency', '廷臣請太后垂簾聽政', [
      { id: 'grant', label: '准太后垂簾', note: '病中由太后代理：精力每旬 −3，但朝局安定，權閹難以趁隙。', status: 'harmony' },
      { id: 'refuse', label: '不許', note: '親自撐著：權閹、皇叔或趁機發難。' },
    ], 'refuse', '聖躬違和，廷臣以為宜請太后垂簾。太后意不置可否。', '你病重了。有大臣提議請太后暫代聽政。');
    return;
  }
  const x = range(r, 0, 1);
  if (x < 0.04) {
    cd.dowager = t + 12;
    dwTask(state, 'dw:kin', '太后為姪求京營要職', [
      { id: 'grant', label: '准', note: '太后好感 +15、勳戚 +；但此人無能，京營士氣受損。' },
      { id: 'refuse', label: '不准', note: '太后好感 −15。' },
    ], 'refuse', '慈寧宮傳懿旨：太后之姪某，願效力京營。', '太后替娘家人要官。');
  } else if (x < 0.07 && state.chars.shoufu.term === 1) {
    cd.dowager = t + 18;
    dwTask(state, 'dw:retire', '首輔三上乞休疏', [
      { id: 'grant', label: '准其致仕', note: '可以換上自己的人；但清流怨望 +15、太后不悅。' },
      { id: 'keep', label: '溫旨慰留', note: '首輔更跋扈：封駁更多。' },
    ], 'keep', `首輔${state.chars.shoufu.name}以老病三上疏乞休。`, '先帝的顧命老臣在試探你：留他還是放他走？');
  }
}

function moveOut(state: GameState): void {
  dwTask(state, 'dw:move', '移宮案：先帝寵妃不肯遷出乾清宮', [
    { id: 'force', label: '強令移宮', note: '清流稱快、太后不悅；權閹少一個宮中耳目，危機感上升。' },
    { id: 'allow', label: '容其暫居', note: '太后欣慰；但權閹多一個宮中耳目，閹黨聲勢上升。' },
  ], 'allow', '先帝寵妃某氏居乾清宮不去，且言奉有先帝遺命。廷臣交章請移宮。', '先帝的寵妃賴在皇帝寢宮不搬走——她和九千歲很親近。');
}

function dwTask(state: GameState, id: string, title: string, choices: Choice[], fallback: string, text: string, plain: string): void {
  const d = local(draft('task', 'court', 'jingshi', 'court', title), state);
  d.fromLabel = '慈寧宮';
  d.importance = 3;
  core(d, text, title, plain);
  task(d, id, choices, fallback, state.turn + 2);
  post(state, d);
}

// ───────────────────────── 文字獄 ─────────────────────────

export function literaryTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  const r = state.rng;
  if ((w.cooldown.lit ?? -99) > t) return;
  const yan = clout(state).yan;
  if ((yan > 0.3 || w.dongchang === 'eunuch') && chance(r, 0.03)) {
    w.cooldown.lit = t + 20;
    const poet = pick(r, ['錢', '黃', '顧', '劉', '高', '左', '楊']) + pick(r, ['謙益', '宗羲', '憲成', '宗周', '攀龍', '光斗', '漣']);
    const d = local(draft('task', 'dongchang', 'jingshi', 'court', `東廠告發：${poet}詩語悖逆`), state);
    d.importance = 3;
    core(d, `東廠緝得清流名士${poet}詩集，中有「清風不識字，何故亂翻書」之句，語涉譏訕，請下法司究治。`, `${poet}詩語譏訕`, `東廠（${w.dongchang === 'crown' ? '在你手中' : '在權閹手中'}）告發一位清流名士的詩有影射之意。這是文字獄：嚴辦能打擊清流，但從此沒人敢說真話（言路大降）。`);
    task(d, 'lit:poem', [
      { id: 'harsh', label: '嚴辦，株連門生', note: '閹黨大喜；清流怨望 +20、言路 −20；「士林寒心」十二旬。', status: 'chill' },
      { id: 'mild', label: '從輕，罰俸了事', note: '閹黨不滿。' },
      { id: 'counter', label: '反坐告密者', note: '清流稱快、言路 +5；閹黨怨望 +15。' },
    ], 'mild', t + 2);
    post(state, d);
    return;
  }
  if (t > 24 && !w.once.history && chance(r, 0.012)) {
    w.once.history = t;
    w.cooldown.lit = t + 12;
    const d = local(draft('task', 'rites', 'jingshi', 'court', '江南私修史稿，語涉先帝'), state);
    d.importance = 3;
    core(d, '禮部奏：江南書坊刊行私史，記先帝晚年怠政、寵任中官諸事，士人爭相傳抄。', '私修史稿語涉先帝', '民間私修的史書揭露先帝晚年的醜事，讀書人搶著抄。');
    task(d, 'lit:history', [
      { id: 'ban', label: '禁毀書版', note: '言路 −10；太后欣慰。' },
      { id: 'ignore', label: '不問', note: '太后好感 −15；士林稱頌。' },
      { id: 'official', label: '開館修官史', note: '國庫 −15 萬；朝望 +3；兩全。', silver: 15 },
    ], 'ban', t + 2);
    post(state, d);
  }
}

// ───────────────────────── 兩難 ─────────────────────────

interface Dilemma {
  id: string;
  cond: (s: GameState) => boolean;
  make: (s: GameState) => void;
}

const DILEMMAS: Dilemma[] = [
  {
    id: 'dil:rain',
    cond: (s) => [12, 13, 14, 15, 16, 17].includes(s.turn % 36),
    make: (s) => {
      const d = dTask(s, 'dil:rain', '京師亢旱，術士請設壇祈雨', '京畿自春徂夏，滴雨未降，二麥枯槁。有術士自言能致雨。', '京城大旱。有個術士說他能求雨——讓他試試（賭一把），還是下罪己詔？', [
        { id: 'pray', label: '准其設壇', note: '賭性：下雨則朝望上升、龍心大悅；不下雨則淪為笑柄。', odds: 0.45 },
        { id: 'edict', label: '下罪己詔，減膳撤樂', note: '朝望 +4，龍顏 −8；狀態「天子節儉」。', status: 'frugal' },
        { id: 'none', label: '不理', note: '京師民心惡化。' },
      ], 'none');
      post(s, d);
    },
  },
  {
    id: 'dil:censure',
    cond: (s) => Object.values(s.world.emperor.leisureLog).flat().filter((t) => s.turn - t <= 6).length >= 3,
    make: (s) => {
      const d = dTask(s, 'dil:censure', '御史切諫：天子遊幸無度', '御史上疏：皇上近來屢幸西苑、觀戲南府，荒廢政事。', '言官說你玩太多了。', [
        { id: 'accept', label: '優詔褒納', note: '言路 +5、朝望 +2；龍顏 −8。' },
        { id: 'flog', label: '廷杖四十', note: '言路 −15、清流怨望 +12；龍顏 +4。' },
        { id: 'shelve', label: '留中不發', note: '朝望 −2。' },
      ], 'shelve');
      post(s, d);
    },
  },
  {
    id: 'dil:padded',
    cond: (s) => s.world.armies.some((a) => a.active && a.side === 'crown' && a.commander && (s.chars[a.commander]?.integrity ?? 1) < 0.45),
    make: (s) => {
      const a = s.world.armies.find((x) => x.active && x.side === 'crown' && x.commander && (s.chars[x.commander]?.integrity ?? 1) < 0.45)!;
      const c = s.chars[a.commander!];
      const d = dTask(s, 'dil:padded', `言官劾${c.name}虛冒兵餉`, `御史劾：${c.title}${c.name}所部名冊${Math.round((a.roll ?? a.size) / 1000)}千，實不及其半，冒領餉銀。`, `${c.name}帶兵還算能打，但被告吃空餉。`, [
        { id: 'arrest', label: '拿問', note: '整肅軍紀；臨陣換將，部隊士氣大降。' },
        { id: 'audit', label: '遣員點驗再說', note: '兩旬後知道實數；他會不悅。' },
        { id: 'protect', label: '包庇', note: '吏治更壞、清流不滿。' },
      ], 'protect', { army: String(a.id) });
      post(s, d);
    },
  },
  {
    id: 'dil:eunuchLord',
    cond: (s) => s.cases.some((c) => c.def === 'eunuch' && !c.data.removed) && s.turn > 6 && s.turn < 60,
    make: (s) => {
      const d = dTask(s, 'dil:shrine', '浙江巡撫請為九千歲建生祠', '浙江巡撫疏請於西湖之濱為司禮監建生祠，以頌其功。', '地方官要替九千歲蓋生祠——拍馬屁到極點。准了九千歲安心，駁了他起疑。', [
        { id: 'grant', label: '准', note: '權閹危機感大降、閹黨聲勢上升；清流怨望 +12、朝望 −3。' },
        { id: 'refuse', label: '駁', note: '清流稱快；權閹危機感上升。' },
      ], 'grant');
      post(s, d);
    },
  },
  {
    id: 'dil:mercy',
    cond: (s) => s.world.armies.some((a) => a.active && a.side === 'bandit' && a.size < 20000),
    make: (s) => {
      const a = s.world.armies.find((x) => x.active && x.side === 'bandit' && x.size < 20000)!;
      const d = dTask(s, 'dil:surrender', `${a.label}遣人請降，求就地安插`, `${a.label}遣人乞降，願解散部眾，但求朝廷給牛種，就地安插。`, '流寇想投降，條件是讓他們留在原地種田。', [
        { id: 'accept', label: '准降，就地安插', note: '省兵省餉；但可能詐降，十五旬內復叛。', odds: 0.65 },
        { id: 'scatter', label: '准降，分散安插各縣', note: '國庫 −20 萬；安全得多。', silver: 20 },
        { id: 'refuse', label: '不許，繼續剿', note: '軍費照舊。' },
      ], 'refuse', { army: String(a.id) });
      post(s, d);
    },
  },
  {
    id: 'dil:frugal',
    cond: (s) => s.world.treasury < 60,
    make: (s) => {
      const d = dTask(s, 'dil:frugal', '戶部請減宮中用度', '戶部奏：國用匱乏，乞減宮中膳羞、織造、燈火之費。', '國庫快沒錢了，戶部請你帶頭省錢。', [
        { id: 'cut', label: '減半', note: '狀態「天子節儉」九旬：朝望漸升、國庫略省；龍顏日減。', status: 'frugal' },
        { id: 'privy', label: '改由內帑支給', note: '內帑 −20 萬。', privy: 20 },
        { id: 'refuse', label: '不准', note: '朝望 −2。' },
      ], 'cut');
      post(s, d);
    },
  },
  {
    id: 'dil:gentry',
    cond: (s) => s.turn < s.world.mods.surveyUntil,
    make: (s) => {
      const d = dTask(s, 'dil:gentry', '江南士紳聯名請罷清丈', '應天、浙江士紳千餘人聯名上書，言清丈擾民，請罷之。', '清丈田畝動到江南大地主的利益，他們（多半是清流的人）聯名反對。', [
        { id: 'insist', label: '堅持清丈', note: '清流怨望 +15；完成後田賦永久增加。' },
        { id: 'stop', label: '罷清丈', note: '前功盡棄。' },
        { id: 'north', label: '只在北方清丈', note: '效果減半，江南安靜。' },
      ], 'insist');
      post(s, d);
    },
  },
];

function dTask(s: GameState, id: string, title: string, text: string, plain: string, choices: Choice[], fallback: string, data: Record<string, string> = {}): ReturnType<typeof draft> {
  const d = local(draft('task', 'court', 'jingshi', 'court', title), s);
  d.fromLabel = '通政司';
  d.importance = 3;
  core(d, text, title, plain);
  task(d, id, choices, fallback, s.turn + 2, { data });
  return d;
}

export function dilemmaTick(state: GameState): void {
  const w = state.world;
  const t = state.turn;
  if ((w.cooldown.dilemma ?? -99) > t || !chance(state.rng, 0.12)) return;
  const pool = DILEMMAS.filter((d) => (w.cooldown[d.id] ?? -99) <= t && d.cond(state));
  if (!pool.length) return;
  const d = pick(state.rng, pool);
  w.cooldown.dilemma = t + int(state.rng, 2, 4);
  w.cooldown[d.id] = t + 30;
  d.make(state);
}

// ───────────────────────── 套用 ─────────────────────────

export function applyIntrigueChoice(state: GameState, doc: Doc, id: string, ok: boolean): void {
  const w = state.world;
  const t = doc.task!;
  const data = t.data ?? {};
  const eu = state.cases.find((c) => c.def === 'eunuch');
  switch (t.id) {
    case 'as:pill':
      if (id === 'take') {
        if (ok) {
          w.emperor.illness = null;
          addMood(state, 10);
        } else if (data.src === 'eunuch' || data.src === 'uncle') {
          event(state, 'court', '上服紅丸，是夜崩。', true);
          state.over = { reason: 'assassinated', turn: state.turn };
        } else if (w.emperor.illness) w.emperor.illness.severity = Math.min(3, w.emperor.illness.severity + 1);
      } else event(state, 'court', '紅丸交太醫驗看，進藥者下獄。');
      return;
    case 'as:ting':
    case 'as:maid':
    case 'as:powder':
      if (id === 'probe') {
        const src = String(data.src);
        event(state, 'court', `窮治宮廷驚變，主使為${srcName(src)}。`, true);
        if (src === 'eunuch' && eu && !eu.data.removed) eu.data.crisis = 100;
        if (src === 'yan' || src === 'xun') addGrievance(state, src, 15);
        addPrestige(state, 3);
        if (w.dongchang === 'crown' && chance(state.rng, 0.3)) exposed(state, src === 'uncle' ? 'uncle' : 'silijian');
      } else if (id === 'blame') {
        const c = clout(state);
        const top = (['yan', 'qing', 'zhe', 'xun'] as const).reduce((a, b) => (c[b] > c[a] ? b : a));
        if (ok) {
          addClout(state, top, -10);
          addGrievance(state, top, 20);
          event(state, 'court', `借宮廷驚變打擊${top}。`, true);
        } else {
          exposed(state, null, true);
          addGrievance(state, top, 25);
        }
      }
      return;
    case 'dw:move':
      if (id === 'force') {
        addGrievance(state, 'qing', -10);
        w.dowager = clamp(w.dowager - 10, 0, 100);
        if (eu) eu.data.crisis = clamp(eu.data.crisis + 10, 0, 100);
      } else {
        w.dowager = clamp(w.dowager + 8, 0, 100);
        addClout(state, 'yan', 3);
      }
      return;
    case 'dw:kin':
      if (id === 'grant') {
        w.dowager = clamp(w.dowager + 15, 0, 100);
        addClout(state, 'xun', 3);
        w.jingyingMorale = clamp(w.jingyingMorale - 0.08, 0.3, 1.2);
      } else w.dowager = clamp(w.dowager - 15, 0, 100);
      return;
    case 'dw:retire':
      if (id === 'grant') {
        addGrievance(state, 'qing', 15);
        w.dowager = clamp(w.dowager - 8, 0, 100);
        replaceChar(state, 'shoufu', range(state.rng, 0.4, 0.9));
        state.chars.shoufu.faction = null;
        state.chars.shoufu.loyalty = 75;
      } else if (!state.chars.shoufu.traits.includes('剛直')) state.chars.shoufu.traits.push('剛直');
      return;
    case 'dw:regency':
      if (id === 'grant') {
        w.emperor.restUntil = state.turn + 6;
        w.dowager = clamp(w.dowager + 15, 0, 100);
        if (eu) eu.data.progress = Math.max(0, eu.data.progress - 10);
      }
      return;
    case 'lit:poem':
      if (id === 'harsh') {
        addClout(state, 'yan', 5);
        addGrievance(state, 'qing', 20);
        w.speech = clamp(w.speech - 20, 0, 100);
        w.wrongful.push('清流名士（詩案）');
      } else if (id === 'mild') addGrievance(state, 'yan', 6);
      else {
        addGrievance(state, 'qing', -10);
        addGrievance(state, 'yan', 15);
        w.speech = clamp(w.speech + 5, 0, 100);
      }
      return;
    case 'lit:history':
      if (id === 'ban') {
        w.speech = clamp(w.speech - 10, 0, 100);
        w.dowager = clamp(w.dowager + 5, 0, 100);
      } else if (id === 'ignore') {
        w.dowager = clamp(w.dowager - 15, 0, 100);
        addGrievance(state, 'qing', -5);
      } else addPrestige(state, 3);
      return;
    case 'dil:rain':
      if (id === 'pray') {
        if (ok) {
          addPrestige(state, 5);
          addMood(state, 12);
          addUnrest(state, 'jingshi', -10);
        } else {
          addPrestige(state, -4);
          addMood(state, -6);
        }
      } else if (id === 'edict') {
        addPrestige(state, 4);
        addMood(state, -8);
      } else addUnrest(state, 'jingshi', 8);
      return;
    case 'dil:censure':
      if (id === 'accept') {
        w.speech = clamp(w.speech + 5, 0, 100);
        addPrestige(state, 2);
        addMood(state, -8);
      } else if (id === 'flog') {
        w.speech = clamp(w.speech - 15, 0, 100);
        addGrievance(state, 'qing', 12);
        addMood(state, 4);
      } else addPrestige(state, -2);
      return;
    case 'dil:padded': {
      const a = w.armies.find((x) => x.id === Number(data.army));
      if (!a) return;
      if (id === 'arrest') {
        a.morale = clamp(a.morale - 25, 0, 100);
        a.roll = a.size;
        const old = a.commander;
        if (old && state.chars[old]) state.chars[old].status = old.startsWith('gen:') ? 'dead' : state.chars[old].status;
        a.commander = undefined;
        w.corruption = clamp(w.corruption - 3, 0, 100);
      } else if (id === 'audit') a.roll = a.size;
      else {
        w.corruption = clamp(w.corruption + 3, 0, 100);
        addGrievance(state, 'qing', 6);
      }
      return;
    }
    case 'dil:shrine':
      if (id === 'grant') {
        if (eu) eu.data.crisis = Math.max(0, eu.data.crisis - 20);
        addClout(state, 'yan', 4);
        addGrievance(state, 'qing', 12);
        addPrestige(state, -3);
      } else {
        addGrievance(state, 'qing', -6);
        if (eu) eu.data.crisis = clamp(eu.data.crisis + 10, 0, 100);
      }
      return;
    case 'dil:surrender': {
      const a = w.armies.find((x) => x.id === Number(data.army));
      if (!a || !a.active) return;
      if (id === 'accept') {
        a.active = false;
        a.fate = 'destroyed';
        if (!ok) w.cooldown[`feign:${a.region}:${a.caseId}`] = state.turn + int(state.rng, 6, 15);
        event(state, a.caseId, `${a.label}受撫，就地安插${ok ? '' : '（實為詐降）'}。`, true);
      } else if (id === 'scatter') {
        a.active = false;
        a.fate = 'destroyed';
        event(state, a.caseId, `${a.label}受撫，分散安插。`, true);
      }
      return;
    }
    case 'dil:frugal':
      if (id === 'refuse') addPrestige(state, -2);
      return;
    case 'dil:gentry':
      if (id === 'insist') addGrievance(state, 'qing', 15);
      else if (id === 'stop') {
        w.mods.surveyUntil = 0;
        w.mods.surveyed = false;
      } else w.mods.surveyUntil = state.turn + 1;
      return;
  }
  void flow;
  void activeConsorts;
}
