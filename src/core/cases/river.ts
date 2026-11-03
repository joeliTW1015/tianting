// 疑案：河工虧空。河道總督請款修堤：堤工實需／侵吞河銀／虛報危情。汛期一到，見真章。

import { cn, shortDate } from '../calendar';
import { advise, claim, clue, core, draft, fluff, post, request } from '../docs';
import { REGIONS, regionName, travelTurns } from '../geography';
import type { CaseState, GameState } from '../types';
import { addPrestige, addUnrest, event, flow, makeChar, replaceChar, silver } from '../util';
import { cdoc, chance, every, noisy, resolve, rumor } from './common';
import type { CaseDef, CaseOption } from './types';

const H = (s: GameState, c: CaseState) => s.chars[c.actors.hedao];
const dikeText = (v: number) => (v >= 70 ? '堤岸堅固' : v >= 60 ? '堤岸尚可支撐' : v >= 45 ? '堤岸單薄' : '堤岸危殆');

function hedaoReport(s: GameState, c: CaseState): void {
  const h = H(s, c);
  const d = cdoc(s, c, 'memorial', h.id, '河道總督請發河工銀疏');
  const honest = c.branch === 'genuine' || h.term > 1;
  const shown = honest ? noisy(s.rng, c.data.dike, 0.08) : c.branch === 'embezzle' ? Math.min(85, c.data.dike + 25) : 40;
  core(
    d,
    `臣${h.name}謹奏：${regionName(c.region)}河段${dikeText(shown)}，${shortDate(c.data.floodTurn)}前後伏秋大汛將至，若不亟修，恐有決口之虞。`,
    `河段${dikeText(shown)}，大汛將至`,
    `河道總督（管黃河的大官）說：堤防狀況是「${dikeText(shown)}」，${shortDate(c.data.floodTurn)}左右汛期就要來，不修的話可能決堤。`,
  );
  claim(d, `${c.uid}.dike`, '堤防', dikeText(shown), dikeText(c.data.dike));
  if (c.branch === 'embezzle' && h.term === 1) {
    core(d, `臣自蒞任以來，已築新堤${cn(Math.round(c.data.funds * 40 + 300))}丈，然工鉅費繁，所需尚多。`, '自稱已築新堤甚多，所需尚多', '他說已經修了很長的新堤，但還需要更多錢。');
    if (chance(s.rng, 0.35)) clue(d, '近日物料騰貴，每束秫秸價至三錢，夫役工食亦倍於往年。', '物料、工食倍於往年', { against: c.uid, plain: '他說材料和工錢都比往年貴一倍。（真的這麼貴？還是浮報？）' });
  }
  if (c.branch === 'padded' && h.term === 1 && chance(s.rng, 0.3)) clue(d, '臣已將所領河銀分饋各衙門，以便會勘。', '河銀曾分饋各衙門', { against: c.uid, plain: '他不小心提到把修河的錢「分送」給各衙門。（送禮給京官？）' });
  const amount = 30;
  core(d, `伏乞發帑銀${silver(amount)}，以濟河工。`, `請發河工銀${silver(amount)}`);
  request(d, {
    kind: 'funds',
    region: c.region,
    amount,
    caseId: c.uid,
    desc: `發河工銀${silver(amount)}`,
    yes: `國庫 −${amount} 萬兩，交河道總督修堤。若他老實，堤防會加固；若他貪污，錢大多會消失。`,
    no: '不撥款。若堤防真的危險，汛期可能決堤。',
  });
  d.recommend = advise(s, c.branch === 'genuine', c.uid);
  post(s, d);
}

function govReport(s: GameState, c: CaseState): void {
  const g = s.chars[`gov:${c.region}`];
  const d = cdoc(s, c, 'memorial', g.id, `${regionName(c.region)}巡撫奏河防事`);
  const v = c.data.dike;
  core(d, `臣${g.name}謹奏：臣親赴河干察看，${dikeText(noisy(s.rng, v, 0.12))}。`, `巡撫稱${dikeText(v)}`, `地方巡撫親自去河邊看過，說堤防「${dikeText(v)}」。`);
  claim(d, `${c.uid}.dike`, '堤防', dikeText(noisy(s.rng, v, 0.12)), dikeText(v));
  if (c.branch === 'embezzle' && H(s, c).term === 1 && chance(s.rng, 0.5)) clue(d, '所築新堤，土鬆埽薄，椿木多以朽木充數，物料虛報甚多。', '新堤土鬆埽薄，物料虛報', { against: c.uid, plain: '新修的堤偷工減料，用爛木頭充數，材料數量造假。' });
  else fluff(d, '惟河工係河臣專責，臣不敢越俎。', '（河工是河道總督的事，巡撫不便多管）');
  post(s, d);
}

function flood(s: GameState, c: CaseState): void {
  const w = s.world;
  const reg = w.regions[c.region];
  c.data.flooded = 1;
  reg.disaster = { kind: '水', until: s.turn + 10, severity: 0.9 };
  addUnrest(s, c.region, 25);
  const next = REGIONS[c.region].toCapital[0];
  if (next && next !== 'jingshi') addUnrest(s, next, 10);
  if (c.region === 'shandong' || c.region === 'nanzhili') w.mods.canalBlockedUntil = Math.max(w.mods.canalBlockedUntil, s.turn + 9);
  addPrestige(s, -4);
  event(s, c.uid, `伏秋大汛，${regionName(c.region)}河決，淹沒州縣數十，漂沒人畜無算。`, true);
  const d = cdoc(s, c, 'memorial', `gov:${c.region}`, `${regionName(c.region)}飛報河決`);
  d.urgent = true;
  core(d, '飛報：大汛驟至，河堤潰決，洪流所過，城郭為墟，饑民數十萬嗷嗷待哺！', '河堤潰決，災民數十萬', '緊急：黃河決堤了，好幾十個州縣被淹，幾十萬災民沒飯吃。');
  post(s, d);
  resolve(s, c, `${regionName(c.region)}河決成災。`, false);
}

export const river: CaseDef = {
  id: 'river',
  name: '河工虧空',
  regions: ['henan', 'shandong', 'nanzhili'],
  branches: [
    { id: 'genuine', label: '堤工實需' },
    { id: 'embezzle', label: '侵吞河銀' },
    { id: 'padded', label: '虛報危情' },
  ],
  question: '河道總督要錢修堤，真相是什麼？',
  opinions: { genuine: '河防確屬危急，不可不修', embezzle: '河銀恐多入私囊，宜嚴查', padded: '河臣張大其詞，意在多領帑銀' },
  startAt: (slot) => Math.min(slot, 42),

  setup(s, c) {
    const h = makeChar(s, `hedao:${c.uid}`, '河道總督', c.region, 'civil', 1, { integrity: c.branch === 'genuine' ? 0.85 : c.branch === 'embezzle' ? 0.15 : 0.35 });
    c.actors = { hedao: h.id };
    const floodTurn = [16, 52].find((t) => t >= c.startTurn + 6) ?? 52;
    c.data = { dike: c.branch === 'padded' ? 74 : 40, funds: 0, embezzled: 0, floodTurn, flooded: 0, corvee: 0, inspected: 0, wrong: 0 };
  },

  tick(s, c) {
    if (s.turn >= c.data.floodTurn) {
      if (c.data.dike < 60) flood(s, c);
      else {
        event(s, c.uid, `伏秋大汛，${regionName(c.region)}河堤安瀾無事。`, true);
        resolve(s, c, '大汛安然度過。', true);
      }
      return;
    }
    if (every(s, c, 3)) hedaoReport(s, c);
    if (every(s, c, 5, 2)) govReport(s, c);
    if (every(s, c, 6, 4)) {
      if (c.branch === 'embezzle') rumor(s, c, '河督府中宴飲無度，姬妾數十，皆河銀所出。', '河督府宴飲無度', '傳說河道總督家裡天天宴客、姬妾成群，花的都是修河的錢。');
      else if (c.branch === 'padded') rumor(s, c, '河督饋遺京官甚厚，每歲冰敬、炭敬不下萬金。', '河督厚饋京官', '傳說河道總督每年給京官送很多禮。');
      else rumor(s, c, '河干民夫晝夜搶修，苦累不堪。', '河干民夫晝夜搶修', '傳說河邊的工人日夜趕工修堤。');
    }
  },

  options(s, c) {
    if (c.data.flooded || s.turn >= c.data.floodTurn) return [];
    const o: CaseOption[] = [
      { kind: 'funds', label: '撥河工銀三十萬兩', silver: 30, desc: '撥錢修堤。若河道總督老實，堤防加固；若他貪污，錢大多會被吞掉。' },
      { kind: 'corvee', label: '徵發民夫搶修', desc: '不花錢，強徵百姓修堤：堤防明顯加固，但當地民心大降。' },
    ];
    o.push({ kind: 'arrest', person: c.actors.hedao, label: '拿問河道總督', desc: '把河道總督撤職查辦，換人主持河工。若他貪污，可追回部分河銀；若他是盡心的好官，河工會因此耽誤。' });
    if (!c.data.inspected) o.push({ kind: 'inspect', label: '遣工部郎中勘河', silver: 2, desc: '派工部的技術官員去實地查看堤防，回報較準確，但可能被河道總督收買。' });
    return o;
  },

  onOrder(s, c, o) {
    const h = H(s, c);
    if (o.kind === 'funds') {
      const a = o.amount ?? 30;
      c.data.funds += a;
      if (c.branch === 'genuine' || h.term > 1) c.data.dike += a * 0.45;
      else if (c.branch === 'embezzle') {
        c.data.dike += a * 0.1;
        c.data.embezzled += a * 0.8;
      } else c.data.embezzled += a * 0.5;
      event(s, c.uid, `河工銀${silver(a)}到工，${c.branch === 'genuine' || h.term > 1 ? '堤工大進' : c.branch === 'embezzle' ? '大半落入河督私囊' : '多半用於饋遺'}。`);
      return true;
    }
    if (o.kind === 'corvee') {
      c.data.corvee += 1;
      c.data.dike += 12;
      addUnrest(s, c.region, 10);
      event(s, c.uid, '徵發民夫數萬搶修河堤，民間騷然。');
      return true;
    }
    if (o.kind === 'inspect') {
      c.data.inspected = 1;
      const d = draft('envoy', 'gongbu', c.region, c.uid, '工部郎中勘河覆疏');
      d.fromLabel = '工部都水司郎中';
      d.arriveTurn = s.turn + travelTurns(s, c.region) + 1;
      const bought = c.branch === 'embezzle' && h.term === 1 && chance(s.rng, 0.4);
      const v = bought ? 75 : noisy(s.rng, c.data.dike, 0.06);
      core(d, `臣奉命勘河，${dikeText(v)}。`, `勘得${dikeText(v)}`, `工部官員實地勘查：堤防「${dikeText(v)}」。`);
      claim(d, `${c.uid}.dike`, '堤防', dikeText(v), dikeText(c.data.dike));
      if (!bought && c.branch === 'embezzle' && h.term === 1) clue(d, `河督冊報築堤${cn(Math.round(c.data.funds * 40 + 300))}丈，臣逐段丈量，實不及三分之一。`, '冊報堤工實不及三分之一', { against: c.uid, plain: '河道總督報的修堤長度，實際量起來不到三分之一。' });
      if (!bought && c.branch === 'padded') clue(d, '舊堤完固，略加培補即可，所請帑銀實屬過多。', '舊堤完固，所請過多', { against: c.uid, plain: '舊堤其實很堅固，稍微補強就好，要的錢太多了。' });
      post(s, d);
      return true;
    }
    if (o.kind === 'arrest' && o.person === h.id) {
      const old = h.name;
      if (c.branch === 'embezzle') {
        flow(s, '抄沒', `抄沒河督${old}`, { silver: c.data.embezzled * 0.5 });
        event(s, c.uid, `河督${old}被逮，追回河銀約${silver(c.data.embezzled * 0.5)}。`, true);
      } else if (c.branch === 'genuine') {
        s.world.wrongful.push(`河道總督${old}`);
        addPrestige(s, -2);
        c.data.wrong = 1;
        event(s, c.uid, `盡心河工之${old}無罪被逮，河工停頓。`, true);
      } else event(s, c.uid, `河督${old}被逮，饋遺京官之事敗露。`, true);
      replaceChar(s, h.id);
      return true;
    }
    return false;
  },

  investigate(s, c, d, mode) {
    const r = s.rng;
    const h = H(s, c);
    if (mode.bribed) {
      core(d, '河工堅實，河臣勤勞，所請帑銀實不可少。', '查稱河工堅實，所請不可少', '巡按說河工做得很好，錢不能少給。');
      return;
    }
    const v = noisy(r, c.data.dike, mode.spy ? 0.15 : 0.08);
    core(d, `訪得${regionName(c.region)}河段${dikeText(v)}。`, `訪得${dikeText(v)}`, `查到堤防「${dikeText(v)}」。`);
    claim(d, `${c.uid}.dike`, '堤防', dikeText(v), dikeText(c.data.dike));
    if (chance(r, 0.7) || !mode.spy) {
      if (c.branch === 'embezzle' && h.term === 1) clue(d, '河督府中金銀山積，所謂新堤，土鬆椿朽。', '河督府中金銀山積，新堤土鬆', { against: c.uid, plain: '河道總督家裡堆滿金銀，新修的堤卻偷工減料。' });
      if (c.branch === 'padded' && h.term === 1) clue(d, '舊堤完固，河督所請多為饋遺京中之資。', '舊堤完固，河銀多為饋遺', { against: c.uid, plain: '舊堤很堅固，要來的錢大多拿去送禮。' });
      if (c.branch === 'genuine') clue(d, '河督布衣蔬食，親督民夫，堤工雖未竣，用銀皆有實跡。', '河督親督工程，用銀皆有實跡', { plain: '河道總督生活簡樸、親自監工，錢都用在工程上。' });
    }
    if (mode.fabricate && c.branch === 'genuine') {
      core(d, `訪得河督${h.name}侵蝕河銀數萬。`, '訪得河督侵蝕河銀', '密探說河道總督貪污。');
      claim(d, `${c.uid}.embezzle`, '河督侵蝕', '有', '無');
    }
  },

  bribe: (s, c) => (c.branch !== 'genuine' && H(s, c).term === 1 ? 0.4 : 0),
  guilty: (s, c) => (c.branch !== 'genuine' && H(s, c).term === 1 ? [c.actors.hedao] : []),

  score(s, c) {
    let p = 0;
    if (c.branch === 'padded') p = Math.max(5, 20 - Math.max(0, c.data.funds - 30) / 5);
    else if (c.data.flooded) p = H(s, c).term > 1 && c.branch === 'embezzle' ? 6 : 2;
    else p = s.turn >= c.data.floodTurn ? 20 : 12;
    if (c.data.wrong) p -= 6;
    const out = `共撥河工銀${silver(c.data.funds)}${c.data.corvee ? `，徵民夫${c.data.corvee}次` : ''}；${c.data.flooded ? '終致河決。' : s.turn >= c.data.floodTurn ? '大汛安然度過。' : '汛期未到。'}`;
    return { points: Math.max(0, p), outcome: out };
  },

  truth(s, c) {
    const h = H(s, c);
    const n = h.term === 1 ? h.name : '原任河督';
    return c.branch === 'genuine'
      ? `河督${n}所言屬實：堤防單薄，非修不可。`
      : c.branch === 'embezzle'
        ? `河督${n}侵吞河銀，所報堤工多屬虛造，堤防始終單薄。`
        : `堤防本自堅固，河督${n}虛報危情，所領帑銀多半饋遺京官。`;
  },
};
