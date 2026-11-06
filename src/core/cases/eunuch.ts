// 前朝勢力・剷除權閹（開局主線，必出）。
// 先帝的司禮監掌印兼掌東廠，人稱「九千歲」：截留奏疏、羅織密報、拉攏京營，被逼急了會刺殺、宮變擁立皇叔。
// 隱藏：危機感（皇帝每做一件不利於他的事就升高）、謀逆進度（危機感夠高時逐旬增長）。

import { shortDate } from '../calendar';
import { claim, clue, core, draft, fluff, local, post, registerInterceptor } from '../docs';
import { addClout, addGrievance, clout } from '../factions';
import { PROVINCES } from '../geography';
import { oddsText } from '../intel';
import { shuffle } from '../rng';
import { addStatus } from '../statuses';
import type { CaseState, Doc, GameState } from '../types';
import { addMood, addPrestige, clamp, event, flow, replaceChar } from '../util';
import { age, chance, every, int, resolve } from './common';
import type { CaseDef } from './types';

export function eunuchCase(s: GameState): CaseState | undefined {
  return s.cases.find((c) => c.def === 'eunuch');
}

function active(s: GameState): CaseState | undefined {
  const c = eunuchCase(s);
  return c && !c.resolved && !c.data.removed ? c : undefined;
}

/** 皇帝做了不利於權閹的事 */
export function provoke(s: GameState, n: number): void {
  const c = active(s);
  if (c) c.data.crisis = clamp(c.data.crisis + n, 0, 100);
}

registerInterceptor((s: GameState, doc: Doc) => {
  const c = active(s);
  if (!c || doc.urgent || doc.free || doc.task || doc.certified) return false;
  if (doc.kind !== 'memorial' && doc.kind !== 'secret' && doc.kind !== 'envoy') return false;
  if (c.data.coopted && c.branch === 'greed') return false;
  const warned = s.turn < c.data.warnUntil ? 0.5 : 1;
  const from = typeof doc.from === 'string' ? s.chars[doc.from] : null;
  let p = 0;
  if (doc.from === 'yushi') p = 0.45;
  else if (doc.topic === c.uid) p = 0.5;
  else if (from && from.faction === 'qing') p = 0.25;
  else if (typeof doc.from === 'string' && doc.from.startsWith('gov:') && c.flags[`r:${doc.region}`]) p = 0.3;
  if (!chance(s.rng, p * warned)) return false;
  c.data.suppressed += 1;
  if (chance(s.rng, 0.6) && from) c.memo.push(`${s.turn + int(s.rng, 3, 5)}|${doc.from}|${doc.sentTurn}|${doc.title}|${doc.region}`);
  return true;
});

function complaint(s: GameState, c: CaseState, from: string, sent: number, title: string, region: string): void {
  const who = s.chars[from];
  if (!who) return;
  const d = draft('memorial', from, region as never, c.uid, `${who.title}催問前疏`);
  core(d, `臣${who.name}謹奏：臣於${shortDate(sent)}具疏〈${title}〉，迄今未蒙批答。事關緊要，臣不勝惶惑，謹再具疏上聞。`, `${who.title}稱${shortDate(sent)}所上〈${title}〉未蒙批答`, `${who.title}說他在${shortDate(sent)}送過〈${title}〉，到現在沒有回音。你有收到嗎？（沒收到，就是被人半路扣下了）`);
  claim(d, `${c.uid}.lost`, '前疏下落', '未達御前', '遭截留');
  post(s, d);
}

/** 雷霆一擊的勝算 */
export function strikeOdds(s: GameState): number {
  const jy = s.chars.jinyiwei;
  const jg = s.chars.jingying;
  let p = 0.4 + (jy.loyalty - 50) / 120 + (jg.loyalty - 50) / 150 - clout(s).yan * 0.7;
  if (jy.faction === 'yan') p -= 0.25;
  if (jg.faction === 'yan') p -= 0.2;
  if (s.world.dongchang === 'crown') p += 0.1;
  if (s.world.dowager >= 70) p += 0.1;
  return clamp(p, 0.05, 0.92);
}

/** 罷司禮監的條件 */
export function canRemove(s: GameState): string | null {
  if (s.world.prestige >= 50 || s.world.dowager >= 70 || clout(s).yan < 0.3) return null;
  return '朝望未到「頗孚眾望」、太后未肯出面、閹黨聲勢仍在三成以上：此時罷黜，內廷必群起反撲。';
}

function confiscate(s: GameState, c: CaseState): void {
  const r = s.rng;
  const silver = int(r, 150, 300);
  flow(s, '抄沒', `抄沒司禮監${c.data.name ? '' : ''}家產`, { silver, privy: 30 });
  addPrestige(s, 15);
  addMood(s, 15);
  s.world.dongchang = 'crown';
  addGrievance(s, 'yan', 25);
  addClout(s, 'yan', -15);
  for (const p of PROVINCES) s.world.regions[p].unrest = clamp(s.world.regions[p].unrest - 3, 0, 100);
  const d = local(draft('notice', 'xingbu', 'jingshi', c.uid, '刑部奏：籍沒權閹家產'), s);
  d.highlight = '權閹伏法';
  d.free = true;
  core(d, `刑部謹奏：籍沒逆閹家產，得銀${silver}萬兩、金珠無算。各地生祠，次第拆毀。`, `籍沒得銀${silver}萬兩`, `權閹倒了：抄出銀子 ${silver} 萬兩入國庫、內帑另得三十萬；東廠回到你手中，從此東廠密報完全可靠。朝望大升，各地拆毀生祠，民心稍好。`);
  post(s, d);
}

/** 宮變 */
function coup(s: GameState, c: CaseState): void {
  const jg = s.chars.jingying;
  const jy = s.chars.jinyiwei;
  const win = jg.faction === 'yan' || jg.loyalty < 45 || (jy.faction === 'yan' && jy.loyalty < 55);
  if (win) {
    event(s, c.uid, `司禮監${s.chars.silijian.name}勾結京營，夜開宮門，矯太后懿旨，廢天子，迎立皇叔。`, true);
    s.over = { reason: 'palace', turn: s.turn };
    return;
  }
  c.data.removed = 1;
  c.data.arrested = 1;
  addPrestige(s, -6);
  addMood(s, -20);
  addStatus(s, 'shock');
  resolve(s, c, `司禮監${s.chars.silijian.name}夜謀宮變，京營、錦衣衛不從，事敗伏誅。`, true);
  confiscate(s, c);
  replaceChar(s, 'silijian', 0.6);
  s.chars.silijian.faction = null;
}

export const eunuch: CaseDef = {
  id: 'eunuch',
  name: '剷除權閹',
  regions: ['jingshi'],
  branches: [
    { id: 'plot', label: '包藏禍心，圖謀廢立' },
    { id: 'greed', label: '貪權斂財，尚無異志' },
  ],
  question: '九千歲只是貪權，還是已有不臣之心？',
  opinions: { plot: '司禮監近日與京營將領、藩邸往來甚密，其心叵測', greed: '司禮監雖專權貪墨，然其所求不過富貴' },

  setup(s, c) {
    c.actors = { silijian: 'silijian' };
    c.data = { crisis: 15, progress: 0, suppressed: 0, warnUntil: 0, removed: 0, arrested: 0, coopted: 0, stage: 0, registry: 0 };
    for (const r of shuffle(s.rng, PROVINCES.slice()).slice(0, 4)) c.flags[`r:${r}`] = true;
  },

  tick(s, c) {
    if (c.data.removed) return;
    const sj = s.chars.silijian;
    // 謀逆進度
    if (c.branch === 'plot') {
      c.data.progress += 0.25;
      if (c.data.crisis >= 50) c.data.progress += c.data.crisis / 20;
    } else if (c.data.crisis >= 80) c.data.progress += c.data.crisis / 25;
    if (c.data.coopted) c.data.progress = Math.max(0, c.data.progress - 1);
    if (s.world.emperor.illness && s.world.emperor.illness.severity >= 2) c.data.progress += 3;
    if (!s.children.some((x) => x.son && x.alive)) c.data.progress += c.branch === 'plot' && s.turn > 36 ? 0.5 : 0;
    c.data.crisis = clamp(c.data.crisis - 0.5, 0, 100);
    c.data.progress = clamp(c.data.progress, 0, 100);

    // 追問前疏
    const due = c.memo.filter((m) => Number(m.split('|')[0]) <= s.turn);
    c.memo = c.memo.filter((m) => Number(m.split('|')[0]) > s.turn);
    for (const m of due) {
      const [, from, sent, title, region] = m.split('|');
      complaint(s, c, from, Number(sent), title, region);
    }
    // 借支內帑
    if (chance(s.rng, 0.06) && s.world.privy > 5) {
      flow(s, '宮廷', '司禮監借支', { privy: -3 });
      event(s, c.uid, '司禮監以宮中修造為名，借支內帑三萬兩。');
    }
    // 階段
    if (c.data.progress >= 30 && c.data.stage < 1) {
      c.data.stage = 1;
      s.chars.jingying.loyalty = clamp(s.chars.jingying.loyalty - 15, 0, 100);
      event(s, c.uid, '司禮監遣心腹結納京營提督，又通書於瑞王府。', true);
      const d = draft('rumor', 'rumor', 'jingshi', c.uid, '京城傳聞・九千歲');
      d.arriveTurn = s.turn + 1;
      core(d, '坊間傳言：九千歲府中夜宴京營諸將，又有王府使者出入。', '九千歲夜宴京營諸將', '傳說九千歲在拉攏京營的將領，還和皇叔的王府往來。京營若被他收買，宮變時就沒人保護你。可以撤換京營提督、加強宿衛。');
      post(s, d);
    }
    if (c.data.progress >= 60 && c.data.stage < 2) {
      c.data.stage = 2;
      event(s, c.uid, '司禮監散布天子失德之言於京師。', true);
    }
    if (c.data.stage >= 2) {
      addPrestige(s, -0.5);
      if (chance(s.rng, 0.06)) s.world.cooldown['assassin:eunuch'] = s.turn;
    }
    if (c.data.progress >= 90) {
      coup(s, c);
      return;
    }

    // 彈章與自陳
    if (every(s, c, 6, 2)) {
      const d = local(draft('memorial', 'yushi', 'jingshi', c.uid, '御史劾司禮監擅權'), s);
      core(d, `臣${s.chars.yushi.name}謹劾：司禮監掌印${sj.name}，竊弄威福，章奏多有留中不發者；生祠遍於天下，稱「九千歲」，人臣之僭，莫此為甚。`, `御史劾司禮監${sj.name}擅權`, `御史彈劾九千歲：扣留奏疏、各地替他蓋生祠。准了能讓清流滿意、激怒權閹（危機感上升）。`);
      claim(d, `${c.uid}.intercept`, '司禮監截留章奏', '有', '有');
      d.request = { kind: 'eu:impeach', region: 'jingshi', desc: '下部議處司禮監', yes: '交部議處：清流大喜；權閹危機感大升。', no: '留中：清流失望。', caseId: c.uid };
      post(s, d);
    }
    if (every(s, c, 8, 5)) {
      const d = local(draft('memorial', 'silijian', 'jingshi', c.uid, '司禮監自陳疏'), s);
      core(d, `奴婢${sj.name}謹奏：奴婢服侍先帝三十年，一片忠心，天日可表。外廷諸臣結黨攻訐，欲去奴婢而專權，伏乞聖明洞鑒。`, '司禮監自陳忠心，反指外廷結黨', '九千歲說自己忠心耿耿，是外廷結黨要整他。');
      if (c.branch === 'plot' && c.data.progress > 30 && chance(s.rng, 0.5)) clue(d, '奴婢近日奉太后慈旨，常往來藩邸，皆宗室之事，不敢不謹。', '自稱常往來藩邸', { against: c.uid, plain: '他說自己最近常跑王府，「都是宗室的事」。（他和皇叔走得這麼近？）' });
      post(s, d);
    }
    // 獻金（兩難）
    if (every(s, c, 12, 7) && c.data.crisis < 70 && !c.data.coopted) {
      const d = local(draft('task', 'silijian', 'jingshi', c.uid, '司禮監進銀百萬，助國家邊餉'), s);
      d.importance = 3;
      core(d, `奴婢${sj.name}聞邊餉匱乏，願捐輸私財百萬兩，以助國用。`, '司禮監獻銀百萬', '九千歲願意拿出一百萬兩私財充作軍餉。收下，國庫立刻寬裕，但等於向他示好；拒絕，清流稱快；也可以收下後立刻拿問他——賭一把。');
      d.task = {
        id: 'eu:gift',
        choices: [
          { id: 'accept', label: '收下，溫旨褒獎', note: '國庫 +100 萬；閹黨聲勢上升；清流怨望 +10；權閹危機感大降。' },
          { id: 'refuse', label: '婉拒', note: '清流稱快；權閹危機感略升。' },
          { id: 'trap', label: '收下，隨即拿問', note: `賭性：成則權閹伏法；敗則他提前發難。勝算「${oddsText(strikeOdds(s))}」（依錦衣衛、京營與閹黨聲勢）`, odds: strikeOdds(s) },
        ],
        deadline: s.turn + 1,
        fallback: 'refuse',
        recommend: 'accept',
      };
      d.recommend = '擬：收下，溫旨褒獎。';
      post(s, d);
    }
    if (c.branch === 'greed' && age(s, c) >= 150 && c.data.progress < 50) resolve(s, c, '九千歲年老多病，權勢漸衰。', false);
  },

  options(s, c) {
    if (c.data.removed && !c.data.arrested) return [{ kind: 'eu:arrest', label: '拿問權閹、籍沒家產', desc: '他已失勢。拿問抄家：得銀一百五十萬至三百萬兩，閹黨怨望大增。' }];
    if (c.data.removed) return [];
    const block = canRemove(s);
    const out = [
      { kind: 'registry', label: '調閱通政司收疏簿', desc: '核對近六旬送到的奏疏數，和你實際看到的數量。差得多，就是被截留了。' },
      { kind: 'eu:warn', label: '申飭司禮監', desc: '下旨訓誡：截留收斂十二旬；權閹危機感略升。' },
      { kind: 'eu:remove', label: '罷司禮監掌印', desc: block ? `【現在罷不了】${block}` : '撤換司禮監：權閹失勢，可以接著拿問抄家。若他已圖謀日深，可能狗急跳牆。' },
      { kind: 'eu:strike', label: '密詔雷霆一擊', energy: 2, desc: `密詔錦衣衛與京營夜捕權閹：一舉決勝。勝算「${oddsText(strikeOdds(s))}」（依錦衣衛、京營將領的忠誠與閹黨聲勢）。事敗則宮變。` },
    ];
    if (!c.data.coopted) out.push({ kind: 'eu:coopt', label: '收為己用', desc: '溫言籠絡：危機感大降、不再截留；但閹黨更盛、清流怨望大增、吏治日壞。' });
    return out;
  },

  onOrder(s, c, o) {
    switch (o.kind) {
      case 'registry': {
        const shown = s.docs.filter((d) => d.kind === 'memorial' && d.sentTurn >= s.turn - 6 && d.sentTurn < s.turn && d.arriveTurn <= s.turn).length;
        const lost = Math.min(c.data.suppressed, Math.round(c.data.suppressed * 0.6 + 1));
        const forged = c.data.progress >= 20 && s.world.dongchang !== 'crown' && chance(s.rng, 0.5);
        const total = shown + (forged ? 0 : lost);
        const d = local(draft('notice', 'court', 'jingshi', c.uid, '通政司收疏簿摘錄'), s);
        core(d, `通政司謹奏：近六旬收受內外章奏共${total}件，俱已轉送司禮監。`, `通政司稱近六旬收疏${total}件`, `通政司說最近六旬一共收到 ${total} 份奏疏。你自己這段期間收到的約 ${shown} 份——對得上嗎？`);
        claim(d, `${c.uid}.registry`, '近六旬收疏', total, shown + lost, { tol: 0.05 });
        post(s, d);
        provoke(s, 5);
        return true;
      }
      case 'eu:impeach':
        provoke(s, 15);
        addGrievance(s, 'qing', -10);
        addGrievance(s, 'yan', 8);
        event(s, c.uid, '劾司禮監之疏下部議處，閹黨震動。');
        return true;
      case 'eu:warn':
        c.data.warnUntil = s.turn + 12;
        provoke(s, 8);
        event(s, c.uid, '司禮監受申飭，稍稍收斂。');
        return true;
      case 'eu:remove': {
        if (canRemove(s)) {
          addPrestige(s, -5);
          provoke(s, 20);
          event(s, c.uid, '欲罷司禮監，內廷群閹環泣御前，事遂中止。', true);
          return true;
        }
        if (c.branch === 'plot' && c.data.progress >= 60) {
          coup(s, c);
          return true;
        }
        c.data.removed = 1;
        replaceChar(s, 'silijian', 0.6);
        s.chars.silijian.faction = null;
        s.world.dongchang = 'crown';
        addClout(s, 'yan', -10);
        addGrievance(s, 'yan', 20);
        addPrestige(s, 5);
        event(s, c.uid, '罷司禮監掌印，權閹失勢，東廠歸於天子。', true);
        return true;
      }
      case 'eu:arrest':
        if (!c.data.removed || c.data.arrested) return true;
        c.data.arrested = 1;
        confiscate(s, c);
        resolve(s, c, '權閹失勢後被拿問，籍沒家產，伏法。', true);
        return true;
      case 'eu:strike': {
        if (chance(s.rng, strikeOdds(s))) {
          c.data.removed = 1;
          c.data.arrested = 1;
          replaceChar(s, 'silijian', 0.6);
          s.chars.silijian.faction = null;
          confiscate(s, c);
          resolve(s, c, '密詔夜下，錦衣衛擒權閹於私第，一舉而定。', true);
          lotDoc(s, c, true);
        } else {
          lotDoc(s, c, false);
          coup(s, c);
        }
        return true;
      }
      case 'eu:coopt':
        c.data.coopted = 1;
        c.data.crisis = Math.max(0, c.data.crisis - 30);
        addClout(s, 'yan', 8);
        addGrievance(s, 'qing', 15);
        event(s, c.uid, '天子溫旨籠絡司禮監。', true);
        return true;
    }
    return false;
  },

  investigate(s, c, d, mode) {
    if (mode.spy && s.world.dongchang !== 'crown') {
      fluff(d, '東廠番子回報：司禮監奉公守法，並無可議。', '東廠稱司禮監並無可議（東廠受司禮監節制）');
      return;
    }
    clue(d, `司禮監值房中積壓章奏${c.data.suppressed + 3}件。`, `司禮監積壓章奏${c.data.suppressed + 3}件`, { against: c.uid, plain: '司禮監的辦公房裡堆著沒送上去的奏疏。' });
    if (c.branch === 'plot') clue(d, `其心腹近${c.data.progress >= 30 ? '屢' : '偶'}出入京營與瑞王邸。`, '心腹出入京營與王府', { against: c.uid, plain: `他的心腹${c.data.progress >= 30 ? '常常' : '偶爾'}進出京營和皇叔的王府。` });
    else clue(d, '其家人廣置田宅，然與藩邸並無往來。', '廣置田產，不通藩邸', { plain: '他只顧斂財置產，和王府沒有往來。' });
  },

  guilty: (_s, c) => (!c.data.removed ? ['silijian'] : []),

  score(s, c) {
    let p: number;
    if (c.data.arrested) p = Math.max(10, 20 - Math.floor((c.resolved?.turn ?? s.turn) / 12));
    else if (c.data.removed) p = 12;
    else if (c.data.coopted) p = c.branch === 'greed' ? 10 : 4;
    else p = s.over?.reason === 'palace' ? 0 : 3;
    return { points: p, outcome: `被截留的奏疏共${c.data.suppressed}份；局終時謀逆進度約${Math.round(c.data.progress)}／100。` };
  },

  truth(s, c) {
    return c.branch === 'plot'
      ? `九千歲${s.chars.silijian.name}包藏禍心：結京營、通王府，伺機廢立。截留奏疏${c.data.suppressed}份。`
      : `九千歲只是貪權斂財，被逼急了才會反撲。截留奏疏${c.data.suppressed}份。`;
  },
};

function lotDoc(s: GameState, c: CaseState, ok: boolean): void {
  const d = local(draft('notice', 'jinyiwei', 'jingshi', c.uid, ok ? '錦衣衛奏：逆閹就擒' : '錦衣衛奏：事洩'), s);
  d.free = true;
  d.highlight = ok ? '雷霆一擊' : '事　敗';
  d.lot = { tier: 0, ok, label: ok ? '上上籤' : '下下籤' };
  core(d, ok ? '錦衣衛夜圍權閹私第，擒之於臥內，黨羽星散。' : '密詔外洩，權閹先發，宮門夜閉。', ok ? '權閹就擒' : '密詔外洩', ok ? '雷霆一擊成功！' : '事情洩漏了，權閹搶先發難……');
  post(s, d);
}

/** 獻金的兩難 */
export function applyEunuchGift(s: GameState, id: string, ok: boolean): void {
  const c = eunuchCase(s);
  if (!c || c.data.removed) return;
  if (id === 'accept') {
    flow(s, '捐輸', '司禮監獻銀', { silver: 100 });
    addClout(s, 'yan', 5);
    addGrievance(s, 'qing', 10);
    c.data.crisis = Math.max(0, c.data.crisis - 20);
  } else if (id === 'refuse') {
    addGrievance(s, 'qing', -5);
    provoke(s, 5);
  } else {
    flow(s, '捐輸', '司禮監獻銀', { silver: 100 });
    if (ok) {
      c.data.removed = 1;
      c.data.arrested = 1;
      replaceChar(s, 'silijian', 0.6);
      s.chars.silijian.faction = null;
      confiscate(s, c);
      resolve(s, c, '受其獻金，隨即拿問，權閹猝不及防，伏法。', true);
    } else coup(s, c);
  }
}
