// 日常政務：稅則、邊餉、災異、京察、宮廷用度、開源、京營、漕運、人事、郊祀、京師糧價。
// 每件政務是一份帶選項的文書；選擇會立即扣除成本，地方性的效果隨驛程送達。

import { shortDate } from './calendar';
import { core, draft, fluff, local, post, task, type DocDraft } from './docs';
import { BORDERS, PROVINCES, REGIONS, regionName, travelTurns } from './geography';
import { chance, int, pick, range } from './rng';
import type { Choice, Doc, GameState, RegionId } from './types';
import { applyForeignChoice } from './foreign';
import { applyPalaceChoice } from './palace';
import { applyRiotChoice } from './unrest';
import { applyEunuchGift } from './cases/eunuch';
import { registerPostHook } from './docs';
import { applyVetoChoice } from './edicts';
import { applyHaremChoice } from './harem';
import { drawLot } from './intel';
import { applyIntrigueChoice } from './intrigue';
import { delegateChoice, shouldDelegate } from './people';
import { addStatus } from './statuses';
import { addMood, addPrestige, addUnrest, clamp, event, flow, gov, govId, grainText, replaceChar, silver } from './util';

export const BORDER_PAY = 90;

const TASK_CAT: Record<string, string> = { border: '邊餉', disaster: '賑濟', grain: '購糧', palace: '宮廷', drill: '軍費', canal: '河漕', revenue: '開源' };

function pending(state: GameState, id: string): boolean {
  return state.docs.some((d) => d.task && d.task.id === id && !d.task.chosen && state.turn <= d.task.deadline);
}

function recentlyHad(state: GameState, id: string, gap: number): boolean {
  return state.docs.some((d) => d.task?.id === id && state.turn - d.sentTurn < gap);
}

/** 每旬檢查是否有新政務 */
export function routineTick(state: GameState): void {
  const t = state.turn;
  const r = state.rng;
  if (t % 12 === 0 && t > 0) taxDoc(state);
  if (t % 6 === 2) borderPayDoc(state);
  if (t % 36 === 18) jingchaDoc(state);
  if (t % 36 === 33) ceremonyDoc(state);
  borderUnrest(state);
  if (chance(r, 0.2) && !recentlyHad(state, 'disaster', 3)) disasterDoc(state);
  if (chance(r, 0.06) && !recentlyHad(state, 'palace', 12)) palaceDoc(state);
  if (chance(r, 0.06) && !recentlyHad(state, 'revenue', 8)) revenueDoc(state);
  if (chance(r, 0.04) && t >= state.world.mods.canalBlockedUntil && !recentlyHad(state, 'canal', 12)) canalDoc(state);
  if (chance(r, 0.07) && !recentlyHad(state, 'vacancy', 6)) vacancyDoc(state);
  if (state.reportedGrain < 95 && !pending(state, 'grain') && !recentlyHad(state, 'grain', 4)) grainDoc(state);
}

/** 逾期未批的政務，依例處置；大臣代辦的政務在退朝時生效 */
export function routineDeadlines(state: GameState): void {
  for (const d of state.docs) {
    if (!d.task || d.task.chosen) continue;
    const dg = d.task.delegate;
    if (dg && state.turn > d.task.deadline) {
      const c = d.task.choices.find((x) => x.id === dg.choice);
      const w = state.world;
      const ok = c && (c.silver ?? 0) <= w.treasury && (c.privy ?? 0) <= w.privy && (c.grain ?? 0) <= w.grain;
      const pick = ok ? dg.choice : d.task.fallback;
      d.task.chosen = pick;
      applyChoice(state, d, pick, !ok);
      continue;
    }
    if (state.turn > d.task.deadline) {
      d.task.chosen = d.task.fallback;
      const c = d.task.choices.find((x) => x.id === d.task!.fallback);
      state.log.push({ turn: state.turn, text: `〈${d.title}〉逾期未批，依例「${c?.label ?? '照舊'}」` });
      applyChoice(state, d, d.task.fallback, true);
    }
  }
}

/** 依授權：大臣自行處分（本旬退朝時生效，皇帝可以駁回改批） */
registerPostHook((state, doc) => {
  if (doc.request && typeof doc.from === 'string' && doc.from.startsWith('gov:') && state.chars[doc.from]?.authority === 'free') doc.delegatedBy = doc.from;
  const by = shouldDelegate(state, doc);
  if (!by || !doc.task) return;
  const { choice, why } = delegateChoice(state, doc, by);
  doc.task.delegate = { by, choice, why };
  doc.task.deadline = Math.min(doc.task.deadline, doc.arriveTurn);
});

/** 邊餉積欠：四個月起有兵變之虞 */
function borderUnrest(state: GameState): void {
  const a = state.world.borderArrears;
  const p = a >= 6 ? 0.2 : a >= 4 ? 0.05 : 0;
  if (p && chance(state.rng, p)) borderMutiny(state);
}

// ───────────────────────── 套用選項 ─────────────────────────

export function applyChoice(state: GameState, doc: Doc, choiceId: string, auto = false): void {
  const w = state.world;
  const t = doc.task!;
  const c = t.choices.find((x) => x.id === choiceId)!;
  if (!auto) flow(state, TASK_CAT[t.id] ?? '其他', `${doc.title}：${c.label}`, { silver: -(c.silver ?? 0), grain: -(c.grain ?? 0), privy: -(c.privy ?? 0) });
  if (c.status) addStatus(state, c.status);
  let ok = true;
  if (c.odds !== undefined) {
    const lot = drawLot(state, c.odds);
    ok = lot.ok;
    doc.lot = { tier: lot.tier, ok, label: lot.label };
    state.log.push({ turn: state.turn, text: `〈${doc.title}〉「${c.label}」擲籤：${lot.label}（${ok ? '事成' : '不成'}）` });
  }
  if (t.delegate && t.delegate.choice === choiceId) state.log.push({ turn: state.turn, text: `處分：${state.chars[t.delegate.by]?.title ?? ''}${state.chars[t.delegate.by]?.name ?? ''}〈${doc.title}〉「${c.label}」` });
  const region = t.region;
  const data = t.data ?? {};
  switch (t.id) {
    case 'tax':
      w.taxPolicy = choiceId as 'light' | 'normal' | 'heavy';
      if (choiceId === 'heavy') addPrestige(state, -3);
      if (choiceId === 'light') addPrestige(state, 2);
      break;
    case 'border': {
      const dm = choiceId === 'clear' ? 0.15 : choiceId === 'full' || choiceId === 'privy' ? 0.06 : choiceId === 'partial' ? -0.04 : -0.15;
      for (const b of BORDERS) w.regions[b].morale = clamp(w.regions[b].morale + dm, 0.3, 1.2);
      if (choiceId === 'defer') w.borderArrears += 2;
      else if (choiceId === 'partial') w.borderArrears += 0.6;
      else if (choiceId === 'clear') w.borderArrears = 0;
      if (choiceId === 'privy') addPrestige(state, 3);
      break;
    }
    case 'disaster':
    case 'grain':
      if (region && choiceId !== 'ignore') {
        state.orders.push({
          id: state.nextId++,
          kind: 'task',
          region,
          taskId: t.id,
          choiceId,
          issuedTurn: state.turn,
          arriveTurn: state.turn + (region === 'jingshi' ? 0 : travelTurns(state, region)),
          status: 'transit',
          label: `${doc.title}：${c.label}`,
        });
      }
      if (t.id === 'disaster' && choiceId === 'ignore') addPrestige(state, -1);
      break;
    case 'jingcha':
      if (choiceId === 'strict') {
        w.corruption = clamp(w.corruption - 15, 0, 100);
        addPrestige(state, -4);
        const bad = PROVINCES.filter((p) => gov(state, p).integrity < 0.45 && !isCaseActor(state, govId(p)));
        for (const p of bad.slice(0, 3)) {
          const old = replaceChar(state, govId(p));
          event(state, 'routine', `京察黜退貪劣之${REGIONS[p].gov}${old}。`);
        }
      } else if (choiceId === 'normal') w.corruption = clamp(w.corruption - 6, 0, 100);
      else {
        w.corruption = clamp(w.corruption + 4, 0, 100);
        addPrestige(state, 3);
      }
      break;
    case 'palace':
      if (choiceId === 'treasury') addPrestige(state, -2);
      if (choiceId === 'privy') addPrestige(state, 2);
      if (choiceId === 'refuse') addPrestige(state, 3);
      break;
    case 'revenue':
      if (choiceId === 'yes') {
        const k = String(data.kind);
        if (k === 'mine') {
          w.mods.mineTaxUntil = state.turn + 18;
          addPrestige(state, -4);
        } else if (k === 'sell') {
          flow(state, '開源', '開事例捐納', { silver: 50 });
          w.corruption = clamp(w.corruption + 10, 0, 100);
        } else if (k === 'coin') {
          flow(state, '開源', '鑄當十大錢', { silver: 60 });
          w.mods.debasedTurn = state.turn + 6;
          addPrestige(state, -2);
        } else if (k === 'estate') {
          flow(state, '其他', '清查皇莊', { privy: -10 });
          addPrestige(state, 4);
          addUnrest(state, 'jingshi', -5);
        }
      }
      break;
    case 'drill':
      if (choiceId === 'recruit') w.jingying += 6000;
      if (choiceId === 'train') w.jingyingMorale = clamp(w.jingyingMorale + 0.15, 0.4, 1.15);
      if (choiceId === 'cut') {
        w.jingying = Math.max(20000, w.jingying - 6000);
        addPrestige(state, -1);
      }
      break;
    case 'canal':
      if (choiceId === 'sea') {
        if (chance(state.rng, 0.25)) {
          flow(state, '河漕', '海運沉船', { grain: -30 });
          event(state, 'routine', '海運漕船遇風，沉沒糧米約三十萬石。', true);
        }
      } else if (choiceId === 'ignore') w.mods.canalBlockedUntil = state.turn + 9;
      break;
    case 'vacancy': {
      const p = region!;
      const pickIdx = Number(choiceId.slice(1));
      const g = gov(state, p);
      replaceChar(state, g.id);
      g.name = String(data[`name${pickIdx}`]);
      g.integrity = Number(data[`int${pickIdx}`]);
      g.competence = Number(data[`com${pickIdx}`]);
      g.look = Number(data[`look${pickIdx}`]);
      event(state, 'routine', `${REGIONS[p].gov}由${g.name}出任（操守${g.integrity > 0.7 ? '清廉' : g.integrity > 0.45 ? '中平' : '貪鄙'}，才幹${g.competence > 0.7 ? '幹練' : g.competence > 0.45 ? '中平' : '平庸'}）。`);
      break;
    }
    case 'ceremony':
      if (choiceId === 'self') addPrestige(state, w.buffs.temple ? 12 : 6);
      else addPrestige(state, -2);
      break;
    default:
      if (t.id.startsWith('for:') || t.id.startsWith('tw:')) applyForeignChoice(state, doc, choiceId, ok);
      else if (t.id.startsWith('riot:')) applyRiotChoice(state, doc, choiceId);
      else if (t.id.startsWith('harem:')) applyHaremChoice(state, doc, choiceId);
      else if (t.id === 'edict:veto') applyVetoChoice(state, doc, choiceId);
      else if (t.id === 'eu:gift') applyEunuchGift(state, choiceId, ok);
      else if (/^(as|dw|lit|dil):/.test(t.id)) applyIntrigueChoice(state, doc, choiceId, ok);
      else applyPalaceChoice(state, doc, choiceId);
      break;
  }
}

/** 地方性政務送達 */
export function routineArrive(state: GameState, taskId: string, choiceId: string, region: RegionId): void {
  const w = state.world;
  const r = w.regions[region];
  const leak = 1 - w.corruption / 200;
  if (taskId === 'disaster') {
    if (choiceId === 'silver' || choiceId === 'granary') {
      r.reliefUntil = state.turn + Math.round(6 * leak);
      addUnrest(state, region, -12 * leak);
      event(state, 'routine', `賑濟到${regionName(region)}${leak < 0.8 ? '，然胥吏侵漁，饑民所得無幾' : '，饑民稍安'}。`);
    } else if (choiceId === 'remit') {
      r.remitUntil = state.turn + 12;
      addUnrest(state, region, -10);
      event(state, 'routine', `蠲免${regionName(region)}錢糧之旨到達。`);
    }
  } else if (taskId === 'grain') {
    if (choiceId === 'buy') {
      flow(state, '購糧', '採買糧米到倉', { grain: 40 });
      event(state, 'routine', '採買糧米四十萬石入太倉。');
    } else if (choiceId === 'sell') {
      addUnrest(state, 'jingshi', -12);
    }
  }
}

function isCaseActor(state: GameState, id: string): boolean {
  return state.cases.some((c) => !c.resolved && Object.values(c.actors).includes(id));
}

function borderMutiny(state: GameState): void {
  const w = state.world;
  const b = pick(state.rng, BORDERS);
  w.regions[b].garrison *= 0.7;
  w.regions[b].morale = 0.4;
  addPrestige(state, -5);
  w.borderArrears = 1;
  addMood(state, -5);
  event(state, 'routine', `${regionName(b)}欠餉日久，士卒譁變，殺傷將官，逃散甚眾。`, true);
  const d = draft('memorial', govId(b), b, 'routine', `${regionName(b)}兵變飛報`);
  d.urgent = true;
  core(d, `臣${gov(state, b).name}飛報：本鎮欠餉累月，士卒鼓譟譁變，逃散者三之一。乞速發餉銀，以安軍心。`, `${regionName(b)}因欠餉兵變，逃散三之一`, `${regionName(b)}的軍隊因為長期拿不到軍餉而譁變，三分之一的人逃走了。`);
  post(state, d);
}

// ───────────────────────── 各類政務文書 ─────────────────────────

function capitalTask(state: GameState, from: string, title: string, id: string, choices: Choice[], fallback: string, days = 2, extra: Partial<NonNullable<Doc['task']>> = {}): DocDraft {
  const d = local(draft('task', from, 'jingshi', 'routine', title), state);
  task(d, id, choices, fallback, state.turn + days, extra);
  const rec = choices.find((c) => c.id === extra.recommend);
  if (rec) d.recommend = `擬：${rec.label}。`;
  return d;
}

function taxDoc(state: GameState): void {
  const w = state.world;
  const d = capitalTask(state, 'hubu', '戶部請定本期稅則', 'tax', [
    { id: 'light', label: '寬徵', note: '未來四個月各省錢糧收八成五；民心逐旬好轉；朝望 +2。' },
    { id: 'normal', label: '照常', note: '維持原額。' },
    { id: 'heavy', label: '加派', note: '未來四個月錢糧多收兩成；各地民心逐旬惡化；朝望 −3。' },
  ], 'normal', 3, { recommend: 'normal' });
  core(d, `戶部謹奏：本期錢糧將次開徵，前此每旬歲入約${silver(w.last.income)}，歲出約${silver(w.last.expense)}。應否加派、寬徵，伏候聖裁。`, '請定本期稅則', `戶部問你：接下來四個月要怎麼收稅？上一旬收入約 ${Math.round(w.last.income)} 萬兩，支出約 ${Math.round(w.last.expense)} 萬兩（不含邊餉）。`);
  fluff(d, '臣聞「百姓足，君孰與不足」，然邊餉孔亟，亦不得不慮。', '書上說「百姓富足，國君怎麼會不足」；但邊防需要錢，也不能不考慮。');
  post(state, d);
}

function borderPayDoc(state: GameState): void {
  const w = state.world;
  const choices: Choice[] = [
    { id: 'full', label: '足額發本期', note: `國庫支出 ${BORDER_PAY} 萬兩；士氣上升；舊欠不動。`, silver: BORDER_PAY },
    { id: 'partial', label: '先發七成', note: `國庫支出 ${Math.round(BORDER_PAY * 0.7)} 萬兩；士氣略降，積欠多約半個月。`, silver: Math.round(BORDER_PAY * 0.7) },
    { id: 'defer', label: '暫緩發放', note: '不花錢；四邊士氣大降、積欠多兩個月。積欠四個月以上，邊鎮可能兵變。' },
  ];
  if (w.borderArrears >= 1) {
    const clear = Math.round(BORDER_PAY + 45 * w.borderArrears);
    choices.unshift({ id: 'clear', label: '連積欠一併補發', note: `國庫支出 ${clear} 萬兩：本期與積欠的 ${Math.round(w.borderArrears)} 個月一次發清；士氣大振。`, silver: clear });
  }
  if (w.privy >= BORDER_PAY) choices.push({ id: 'privy', label: '發內帑代支', note: `用你的私房錢（內帑）${BORDER_PAY} 萬兩代付；士氣上升，朝望 +3。`, privy: BORDER_PAY });
  const d = capitalTask(state, 'hubu', '戶部請發四邊兩月餉銀', 'border', choices, 'defer', 2, { recommend: w.treasury >= BORDER_PAY ? 'full' : 'partial' });
  core(d, `戶部謹奏：薊鎮、宣大、遼東、甘肅四鎮兩月餉銀，共該${silver(BORDER_PAY)}。${w.borderArrears >= 1 ? '前餉尚有積欠，邊軍嗷嗷。' : ''}伏乞聖裁。`, `四邊兩月餉銀共${silver(BORDER_PAY)}${w.borderArrears >= 1 ? '，前餉尚欠' : ''}`, `四個邊鎮兩個月的軍餉，一共要 ${BORDER_PAY} 萬兩。${w.borderArrears >= 1 ? '之前還有欠著沒發的。' : ''}`);
  post(state, d);
}

function jingchaDoc(state: GameState): void {
  const d = capitalTask(state, 'libu', '吏部請行京察大計', 'jingcha', [
    { id: 'strict', label: '嚴加考察', note: '耗精力 2；吏治大幅改善，罷黜約三名貪劣巡撫；但百官怨懟，朝望 −4。', energy: 2 },
    { id: 'normal', label: '照例考察', note: '吏治略有改善。' },
    { id: 'lenient', label: '從寬', note: '百官感恩，朝望 +3；吏治更壞。' },
  ], 'normal', 3, { recommend: 'normal' });
  core(d, '吏部謹奏：京察之期已屆，內外官員考核賢否，應如何處置，伏候欽定。', '京察之期已屆，請定寬嚴', '六年一次的官員大考核到了。嚴格考核可以整頓貪官，但會得罪很多人。');
  fluff(d, `近年吏治${state.world.corruption > 50 ? '頗為廢弛，貪墨成風' : '尚稱整肅'}。`, state.world.corruption > 50 ? '最近官場風氣很差，貪污很普遍。' : '最近官場風氣還算可以。');
  post(state, d);
}

function ceremonyDoc(state: GameState): void {
  const d = capitalTask(state, 'rites', '禮部請行冬至郊祀', 'ceremony', [
    { id: 'self', label: '親詣南郊', note: '耗精力 2；朝望 +6。', energy: 2 },
    { id: 'proxy', label: '遣官代祀', note: '朝望 −2。' },
  ], 'proxy', 2, { recommend: 'self' });
  core(d, '禮部謹奏：冬至大祀圜丘，請皇上親詣行禮，以昭誠敬。', '冬至郊祀，請親詣行禮', '冬至要在天壇祭天。皇帝親自去，臣民會覺得你敬天勤政。');
  post(state, d);
}

const DISASTERS = [
  { kind: '旱', text: '亢旱不雨，赤地千里', plain: '大旱，田裡沒有收成' },
  { kind: '蝗', text: '飛蝗蔽天，禾稼食盡', plain: '蝗蟲把莊稼吃光了' },
  { kind: '水', text: '霪雨連旬，江河泛溢，田廬漂沒', plain: '連日大雨，河水氾濫，田地房屋被沖毀' },
  { kind: '疫', text: '疫癘大作，死者枕藉', plain: '瘟疫流行，死了很多人' },
  { kind: '震', text: '地震有聲，城垣傾圮，壓死人畜無算', plain: '大地震，城牆倒塌，死傷很多' },
];

function disasterDoc(state: GameState): void {
  const r = state.rng;
  const region = pick(state.rng, PROVINCES);
  const reg = state.world.regions[region];
  if (reg.disaster) return;
  const dz = pick(r, DISASTERS);
  const severity = range(r, 0.3, 0.8);
  reg.disaster = { kind: dz.kind, until: state.turn + int(r, 5, 8), severity };
  event(state, 'routine', `${regionName(region)}${dz.kind}災（輕重${Math.round(severity * 10)}分）。`);
  const g = gov(state, region);
  const amount = Math.round(10 + severity * 25);
  const d = draft('task', g.id, region, 'routine', `${regionName(region)}奏報${dz.kind}災`);
  // 操守差的巡撫會把災情說得輕些，免得被追究
  const shown = g.integrity < 0.4 ? severity * 0.6 : severity;
  core(d, `臣${g.name}謹奏：本省${dz.text}，${shown > 0.55 ? '饑民流離，嗷嗷待哺' : '民間頗有饑色'}。`, `${regionName(region)}${dz.kind}災，${shown > 0.55 ? '饑民流離' : '民有饑色'}`, `${regionName(region)}${dz.plain}。${shown > 0.55 ? '災民到處流浪，等著救濟。' : '百姓生活困難。'}`);
  const choices: Choice[] = [
    { id: 'silver', label: `發帑${amount}萬兩賑濟`, note: `國庫 −${amount} 萬兩；送達後當地民心回升（吏治差時會被侵吞一部分）。`, silver: amount },
    { id: 'granary', label: `截漕${amount}萬石賑濟`, note: `太倉糧 −${amount} 萬石；效果同發帑。`, grain: amount },
    { id: 'remit', label: '蠲免本省錢糧四月', note: '不花錢；送達後民心回升，但該省四個月只收三成錢糧。' },
    { id: 'ignore', label: '不予理會', note: '不花錢；民心持續惡化，嚴重時會激起民變；朝望 −1。' },
  ];
  task(d, 'disaster', choices, 'ignore', state.turn + travelTurns(state, region) + 2, { region, recommend: 'silver' });
  d.recommend = `擬：發帑${amount}萬兩賑濟。`;
  post(state, d);
}

const PALACE = [
  { what: '修繕乾清宮', cost: 40, text: '乾清宮年久失修，梁柱朽蠹，雨漏不止', plain: '皇宮的乾清宮很久沒修，漏雨了' },
  { what: '恭辦太后萬壽', cost: 25, text: '聖母皇太后萬壽聖節將屆，應辦慶典', plain: '太后生日快到了，要辦慶典' },
  { what: '皇子出閣讀書', cost: 20, text: '皇長子出閣講學，應備講筵、修葺書堂', plain: '皇子要開始讀書，需要準備書房和老師' },
];

function palaceDoc(state: GameState): void {
  const p = pick(state.rng, PALACE);
  const choices: Choice[] = [
    { id: 'treasury', label: `國庫支出${p.cost}萬兩`, note: `國庫 −${p.cost}；言官批評奢靡，朝望 −2。`, silver: p.cost },
    { id: 'half', label: '減半辦理', note: `國庫 −${Math.round(p.cost / 2)}。`, silver: Math.round(p.cost / 2) },
    { id: 'privy', label: '以內帑支應', note: `內帑 −${p.cost}；不動國庫，朝望 +2。`, privy: p.cost },
    { id: 'refuse', label: '從儉罷辦', note: '不花錢；朝野稱頌節儉，朝望 +3。' },
  ];
  const d = capitalTask(state, 'silijian', `司禮監請${p.what}`, 'palace', choices, 'refuse', 2, { recommend: 'half' });
  core(d, `司禮監謹奏：${p.text}，約需銀${silver(p.cost)}。伏候聖旨。`, `${p.what}，約需${silver(p.cost)}`, `${p.plain}，大約要 ${p.cost} 萬兩。（司禮監是宮裡的太監衙門。）`);
  post(state, d);
}

const REVENUE = [
  { kind: 'mine', from: 'silijian', title: '司禮監請遣礦監開採', text: '山西、河南諸山多有銀礦，請遣內官開採，所得解入內帑', plain: '太監建議派人去山西、河南開銀礦，收入歸你的內帑（私房錢）', yes: '未來六個月內帑每旬 +4 萬兩；山西、河南民心逐旬惡化；朝望 −4。' },
  { kind: 'sell', from: 'hubu', title: '戶部請開事例捐納', text: '國用不足，請開事例，許富民納銀授官', plain: '國庫不夠用，戶部建議讓有錢人花錢買官', yes: '國庫立刻 +50 萬兩；吏治明顯敗壞。' },
  { kind: 'coin', from: 'hubu', title: '戶部請鑄當十大錢', text: '請鑄當十大錢，以一當十，可濟目前之急', plain: '戶部建議鑄造面額大的銅錢，短期內可以多出錢來', yes: '國庫立刻 +60 萬兩；兩個月後物價騰貴，京師民心惡化；朝望 −2。' },
  { kind: 'estate', from: 'yushi', title: '御史請清查皇莊', text: '皇莊、勳戚莊田侵佔民業，請清查歸還', plain: '御史建議清查皇家莊園侵佔百姓田地的情況，歸還給百姓', yes: '內帑 −10 萬兩；京畿民心好轉；朝望 +4。' },
];

function revenueDoc(state: GameState): void {
  const p = pick(state.rng, REVENUE);
  const d = capitalTask(state, p.from, p.title, 'revenue', [
    { id: 'yes', label: '准行', note: p.yes },
    { id: 'no', label: '不准', note: '一切照舊。' },
  ], 'no', 3, { data: { kind: p.kind }, recommend: p.kind === 'estate' ? 'yes' : 'no' });
  core(d, `臣謹奏：${p.text}。`, p.title.replace(/^.+?請/, '請'), p.plain + '。');
  post(state, d);
}

function canalDoc(state: GameState): void {
  const d = capitalTask(state, 'gongbu', '工部奏漕河淤淺', 'canal', [
    { id: 'dredge', label: '發帑疏浚', note: '國庫 −25 萬兩；漕運如常。', silver: 25 },
    { id: 'sea', label: '改行海運', note: '國庫 −5 萬兩；有四分之一機會遇風沉船，損失三十萬石糧。', silver: 5 },
    { id: 'ignore', label: '暫且不理', note: '不花錢；未來三個月南方漕糧只能運到四成。' },
  ], 'ignore', 2, { recommend: 'dredge' });
  core(d, '工部謹奏：會通河一帶淤淺，漕船膠滯，若不即行挑浚，今歲漕糧恐難如期抵通。', '運河淤淺，漕船受阻，請挑浚', '運河有一段淤積變淺，運糧船過不去。不清理的話，今年南方的糧食會運不到京城。');
  post(state, d);
}

function vacancyDoc(state: GameState): void {
  const r = state.rng;
  const candidates = PROVINCES.filter((p) => !isCaseActor(state, govId(p)));
  if (!candidates.length) return;
  const p = pick(r, candidates);
  const old = gov(state, p);
  const reason = pick(r, ['丁憂去任', '病故', '乞休致仕', '考滿陞轉']);
  const used = new Set(Object.values(state.chars).map((c) => c.name[0]));
  const data: Record<string, number | string> = {};
  const types = [
    { int: range(r, 0.8, 0.95), com: range(r, 0.3, 0.55) },
    { int: range(r, 0.2, 0.55), com: range(r, 0.7, 0.95) },
    { int: range(r, 0.45, 0.8), com: range(r, 0.45, 0.7) },
  ];
  const corrupt = state.world.corruption > 55;
  const descs: string[] = [];
  types.forEach((ty, i) => {
    const name = makeCandidateName(state, used);
    data[`name${i}`] = name;
    data[`int${i}`] = ty.int;
    data[`com${i}`] = ty.com;
    data[`look${i}`] = int(r, 1, 1e9);
    // 吏部的評語：吏治敗壞時，會把貪而能幹的人說成「廉幹」
    const desc = i === 0 ? '清介自持，然才具稍短' : i === 1 ? (corrupt ? '廉幹有聲，素稱能吏' : '才識明敏，然物議頗及其操守') : '歷任中外，老成持重';
    descs.push(`${name}：${desc}`);
  });
  const choices: Choice[] = [0, 1, 2].map((i) => ({ id: `c${i}`, label: `用${data[`name${i}`]}`, note: descs[i] }));
  const d = capitalTask(state, 'libu', `吏部會推${REGIONS[p].gov}`, 'vacancy', choices, 'c2', 2, { region: p, data, recommend: corrupt ? 'c1' : 'c2' });
  core(d, `吏部謹奏：${REGIONS[p].gov}${old.name}${reason}，員缺。謹會推三員：${descs.join('；')}。伏候欽點。`, `${REGIONS[p].gov}${reason}，會推三員`, `${regionName(p)}的地方長官出缺，吏部推薦了三個人選。評語只是吏部的說法，未必可靠。地方官清廉，錢糧就不會被截留；能幹，民心就比較穩。`);
  post(state, d);
}

function makeCandidateName(state: GameState, used: Set<string>): string {
  const r = state.rng;
  const SUR = '尹白程韋任翁柳蔡湛祁閔裴管鄔鮑羅季俞欒';
  const F = '應文世之國廷士大承宗德允光維時';
  const S = '龍鳳鵬舉傑賢良忠孝禮儀明昌泰弼';
  for (;;) {
    const n = pick(r, SUR.split('')) + pick(r, F.split('')) + pick(r, S.split(''));
    if (!used.has(n[0])) {
      used.add(n[0]);
      return n;
    }
  }
}

function grainDoc(state: GameState): void {
  const d = capitalTask(state, govId('jingshi'), '順天府奏京師米價騰貴', 'grain', [
    { id: 'buy', label: '發帑採買四十萬石', note: '國庫 −35 萬兩；下旬太倉糧 +40 萬石。', silver: 35 },
    { id: 'sell', label: '開倉平糶', note: '太倉糧 −10 萬石；京師民心好轉。', grain: 10 },
    { id: 'ignore', label: '不予理會', note: '京師民心惡化；太倉糧見底會釀成饑荒。' },
  ], 'ignore', 1, { region: 'jingshi', recommend: 'buy' });
  core(d, `順天府謹奏：太倉存糧日少，京師米價騰貴，小民嗷嗷。伏乞早為之計。`, '京師米價騰貴，太倉存糧日少', `京城糧食不夠，米價大漲。太倉（國家糧倉）存糧約 ${Math.round(state.reportedGrain)} 萬石。`);
  post(state, d);
}

/** 開局的第一份稅則（教學用：期限較長） */
export function openingTasks(state: GameState): void {
  taxDoc(state);
  const d = state.docs[state.docs.length - 1];
  if (d?.task) d.task.deadline = 3;
}

export function shortTaskDate(turn: number): string {
  return shortDate(turn);
}

export { grainText };
