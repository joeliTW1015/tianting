// 疑案：鹽政虧空。鹽課日減：私鹽充斥／鹽運使侵蝕鹽引／鹽監太監橫徵、鹽商罷市。

import { core, clue, claim, draft, fluff, local, post } from '../docs';
import { regionName } from '../geography';
import type { CaseState, GameState } from '../types';
import { addPrestige, addUnrest, clamp, event, makeChar, replaceChar, silver } from '../util';
import { spawnArmy } from '../war';
import { cdoc, chance, every, resolve, rumor } from './common';
import type { CaseDef, CaseOption } from './types';

const Y = (s: GameState, c: CaseState) => s.chars[c.actors.yanyun];

function fixed(s: GameState, c: CaseState): boolean {
  return !!c.data.fixedTurn;
}

function fix(s: GameState, c: CaseState, text: string): void {
  if (c.data.fixedTurn) return;
  c.data.fixedTurn = s.turn;
  event(s, c.uid, text, true);
}

function yanyunReport(s: GameState, c: CaseState): void {
  const y = Y(s, c);
  const d = cdoc(s, c, 'memorial', y.id, `${y.title}奏鹽課事`);
  core(d, `臣${y.name}謹奏：本年鹽課短絀，蓋因私鹽充斥，官引壅滯。`, '鹽課短絀，因私鹽充斥', '鹽運使（管鹽的官）說：鹽稅收入減少，是因為私鹽太多，官鹽賣不出去。');
  claim(d, `${c.uid}.cause`, '鹽課短絀之因', '私鹽', c.branch === 'smuggle' ? '私鹽' : c.branch === 'embezzle' ? '鹽官侵蝕' : '鹽監橫徵');
  if (c.branch === 'eunuch' && chance(s.rng, 0.5)) clue(d, `又鹽監${s.chars[c.actors.eunuch].name}於正課之外，每引加徵銀三錢，商人苦之，多不肯領引。`, '鹽監每引加徵，商人不肯領引', { against: c.uid, plain: '他偷偷提到：宮裡派來的鹽監太監在正稅之外多收錢，商人受不了，不肯批鹽來賣。（這才是真正原因？）' });
  if (c.branch === 'embezzle' && y.term === 1 && chance(s.rng, 0.3)) clue(d, '其已領之引，間有重複開支，係書吏舞弊，臣已嚴究。', '已領之引間有重複開支', { against: c.uid, plain: '他說鹽引（賣鹽許可）有重複支出，推給下面的小吏。（是誰在搞鬼？）' });
  core(d, '伏乞敕下各省，嚴緝私販。', '乞嚴緝私販');
  post(s, d);
}

function hubuReport(s: GameState, c: CaseState): void {
  const d = local(draft('memorial', 'hubu', 'jingshi', c.uid, '戶部奏鹽課短絀'), s);
  const m = s.world.mods.saltMod;
  core(d, `戶部謹奏：鹽課每旬額銀六萬兩，近旬實解約${silver(6 * m)}。`, `鹽課近旬實解約${silver(6 * m)}（額六萬）`, `戶部說：鹽稅每旬應收 6 萬兩，最近只收到約 ${(6 * m).toFixed(1)} 萬兩。`);
  claim(d, `${c.uid}.salt`, '鹽課每旬', Math.round(6 * m * 10) / 10, Math.round(6 * m * 10) / 10, { unit: '萬兩' });
  if (!fixed(s, c) && chance(s.rng, 0.55)) {
    if (c.branch === 'smuggle') clue(d, '查各場鹽引滯銷，而市上鹽價反賤，私鹽之盛可知。', '官引滯銷而市上鹽賤，私鹽盛行', { plain: '官鹽賣不掉，市面上的鹽卻很便宜——表示有很多便宜的私鹽。' });
    else if (c.branch === 'embezzle') clue(d, '查鹽引行銷如常，而課銀不至，其中必有侵蝕。', '鹽引行銷如常而課銀不至', { against: c.uid, plain: '賣鹽的許可證照常賣出去，錢卻沒進國庫——中間有人吞了。' });
    else clue(d, '商人多不肯赴場領引，云「正課之外，別有誅求」。', '商人不肯領引，云正課外別有誅求', { against: c.uid, plain: '鹽商不肯來批鹽，說「正稅之外還被額外勒索」。' });
  } else fluff(d, '國用所資，伏乞嚴飭。');
  post(s, d);
}

export const salt: CaseDef = {
  id: 'salt',
  name: '鹽政虧空',
  regions: ['nanzhili', 'liangguang', 'shandong'],
  branches: [
    { id: 'smuggle', label: '私鹽充斥' },
    { id: 'embezzle', label: '鹽官侵蝕' },
    { id: 'eunuch', label: '鹽監橫徵' },
  ],
  question: '鹽課為何日減？',
  opinions: { smuggle: '私鹽充斥，宜嚴緝鹽梟', embezzle: '鹽引多有重支，恐鹽官侵蝕', eunuch: '鹽監誅求無厭，商人裹足' },

  setup(s, c) {
    const y = makeChar(s, `salt:${c.uid}`, `${regionName(c.region)}鹽運使`, c.region, 'civil', 3, { integrity: c.branch === 'embezzle' ? 0.15 : 0.75 });
    c.actors = { yanyun: y.id };
    if (c.branch === 'eunuch') c.actors.eunuch = makeChar(s, `saltEunuch:${c.uid}`, `${regionName(c.region)}鹽監`, c.region, 'eunuch', 2, { integrity: 0.1 }).id;
    c.data = { fixedTurn: 0, crackdown: 0, audit: 0, recalled: 0, wrong: 0, lowest: 1 };
  },

  tick(s, c) {
    const m = s.world.mods;
    if (!fixed(s, c)) m.saltMod = clamp(m.saltMod - 0.035, 0.45, 1);
    else m.saltMod = clamp(m.saltMod + 0.05, 0, 1);
    c.data.lowest = Math.min(c.data.lowest, m.saltMod);
    if (c.branch === 'eunuch' && !fixed(s, c)) addUnrest(s, c.region, 1.2);
    if (fixed(s, c) && m.saltMod >= 0.95) return resolve(s, c, '鹽課漸復舊額。', true);
    if (every(s, c, 4)) yanyunReport(s, c);
    if (every(s, c, 4, 2)) hubuReport(s, c);
    if (c.branch === 'eunuch' && every(s, c, 5, 3) && !c.data.recalled) {
      const e = s.chars[c.actors.eunuch];
      const d = cdoc(s, c, 'memorial', e.id, `${e.title}奏鹽法事`);
      core(d, `奴婢${e.name}謹奏：鹽課之絀，皆由運司怠玩、鹽梟橫行。奴婢督催甚力，伏乞嚴飭運司。`, '鹽監歸咎運司怠玩、鹽梟橫行', '鹽監太監說：鹽稅少是因為鹽運使偷懶、私鹽販子猖獗。');
      claim(d, `${c.uid}.cause`, '鹽課短絀之因', '運司怠玩', '鹽監橫徵');
      post(s, d);
    }
    if (every(s, c, 6, 1)) {
      if (c.branch === 'smuggle') rumor(s, c, '鹽梟聚眾販私，持械拒捕，官兵莫敢誰何。', '鹽梟持械販私', '傳說私鹽販子成群結隊、帶著武器，官兵不敢管。');
      else if (c.branch === 'embezzle') rumor(s, c, `${Y(s, c).title}家中新納寵姬，揮金如土。`, '鹽運使揮金如土', '傳說鹽運使最近花錢如流水。');
      else rumor(s, c, `${regionName(c.region)}鹽商相約罷市，云不堪鹽監誅求。`, '鹽商罷市，不堪鹽監誅求', '傳說鹽商集體罷市，因為受不了太監勒索。');
    }
  },

  options(s, c) {
    if (fixed(s, c)) return [];
    const o: CaseOption[] = [
      { kind: 'crackdown', label: '嚴緝私鹽', silver: 15, desc: '派兵嚴查私鹽。若問題確是私鹽，鹽課會恢復；鹽梟有可能被逼成亂。若問題在官員，就沒什麼用。' },
      { kind: 'audit', label: '清查鹽引帳目', silver: 5, desc: '派員核對鹽引（賣鹽許可）的帳目，回報誰在搞鬼；若是鹽官貪污，查帳本身就能堵住漏洞。' },
    ];
    o.push({ kind: 'arrest', person: c.actors.yanyun, label: '拿問鹽運使', desc: '把鹽運使撤職查辦。若他確實貪污，弊端立除；若不是，就是冤枉好官。' });
    if (c.actors.eunuch && !c.data.recalled) o.push({ kind: 'recallEunuch', label: '召回鹽監太監', desc: '把宮裡派去的鹽監召回。外廷稱快（朝望 +2）；若他不是禍首，只是少了一個人督催。' });
    return o;
  },

  onOrder(s, c, o) {
    if (o.kind === 'crackdown') {
      c.data.crackdown = 1;
      if (c.branch === 'smuggle') {
        fix(s, c, '嚴緝私鹽，鹽梟斂跡，官引復行。');
        if (chance(s.rng, 0.3)) spawnArmy(s, { caseId: c.uid, label: '鹽梟', side: 'bandit', size: 3000, region: c.region, growth: 1.03 });
      } else event(s, c.uid, '嚴緝私鹽之旨到達，然鹽課短絀如故。');
      return true;
    }
    if (o.kind === 'audit') {
      c.data.audit = 1;
      const d = cdoc(s, c, 'envoy', 'hubu', '清查鹽引覆疏');
      d.fromLabel = '戶部清查鹽法主事';
      if (c.branch === 'embezzle' && Y(s, c).term === 1) {
        core(d, `查得${Y(s, c).title}${Y(s, c).name}將鹽引重複開支，私賣入己者不下數十萬引。`, '查得鹽運使重支鹽引、私賣入己', '查帳結果：鹽運使把鹽引重複發放、私下賣掉，錢進了自己口袋。');
        fix(s, c, '清查鹽引，堵塞侵蝕之弊。');
      } else if (c.branch === 'eunuch') {
        core(d, '查鹽引帳目無訛；惟商人供稱鹽監每引加徵三錢，致不肯領引。', '帳目無訛；商人供稱鹽監加徵', '帳目沒問題，但商人說太監額外收錢，所以不肯批鹽。');
      } else core(d, '查鹽引帳目大致無訛，私鹽之盛，實為主因。', '帳目無訛，私鹽為主因', '帳目沒問題，私鹽太多才是主因。');
      post(s, d);
      return true;
    }
    if (o.kind === 'recallEunuch') {
      c.data.recalled = 1;
      addPrestige(s, 2);
      if (c.branch === 'eunuch') fix(s, c, '召回鹽監，商人復業。');
      else event(s, c.uid, '鹽監召回，鹽課未見起色。');
      return true;
    }
    if (o.kind === 'arrest' && o.person === c.actors.yanyun) {
      const old = Y(s, c).name;
      if (c.branch === 'embezzle') fix(s, c, `鹽運使${old}被逮，侵蝕之弊遂絕。`);
      else {
        s.world.wrongful.push(`${regionName(c.region)}鹽運使${old}`);
        c.data.wrong = 1;
        addPrestige(s, -2);
        event(s, c.uid, `鹽運使${old}無罪被逮。`, true);
      }
      replaceChar(s, c.actors.yanyun);
      return true;
    }
    return false;
  },

  investigate(s, c, d, mode) {
    const r = s.rng;
    if (mode.bribed) {
      core(d, '鹽課之絀，皆因私販，運司並無過犯。', '查稱私販為因，運司無過', '巡按說都是私鹽的錯，鹽運使沒問題。');
      return;
    }
    if (chance(r, 0.8) || !mode.spy) {
      if (c.branch === 'smuggle') clue(d, '沿江私鹽船往來如織，鹽梟動輒數百人，持械護送。', '私鹽船往來如織', { plain: '江上運私鹽的船很多，私鹽販子幾百人帶著武器護送。' });
      if (c.branch === 'embezzle') clue(d, `${Y(s, c).title}衙門私賣鹽引，引價入己，商人皆知。`, '鹽運使私賣鹽引入己', { against: c.uid, plain: '鹽運使私下賣鹽引，錢進自己口袋，商人都知道。' });
      if (c.branch === 'eunuch') clue(d, '鹽監家人每引加徵，商人不堪，相率罷市。', '鹽監每引加徵，商人罷市', { against: c.uid, plain: '鹽監的人每張鹽引多收錢，商人受不了而罷市。' });
    } else fluff(d, '鹽場事體繁雜，番子未得要領。', '密探沒查出什麼名堂。');
    if (mode.fabricate && c.branch !== 'embezzle') {
      core(d, `訪得${Y(s, c).title}${Y(s, c).name}私賣鹽引。`, '訪得鹽運使私賣鹽引', '密探說鹽運使私賣鹽引。');
      claim(d, `${c.uid}.cause`, '鹽課短絀之因', '鹽官侵蝕', c.branch === 'smuggle' ? '私鹽' : '鹽監橫徵');
    }
  },

  bribe: (s, c) => (c.branch === 'embezzle' && Y(s, c).term === 1 ? 0.4 : 0),
  guilty: (s, c) => (c.branch === 'embezzle' && Y(s, c).term === 1 ? [c.actors.yanyun] : c.branch === 'eunuch' && !c.data.recalled ? [c.actors.eunuch] : []),

  score(s, c) {
    let p = fixed(s, c) ? Math.max(10, 20 - Math.floor((c.data.fixedTurn - c.startTurn) / 4)) : 3;
    if (c.data.wrong) p -= 6;
    return { points: Math.max(0, p), outcome: `鹽課最低時只剩額數的${Math.round(c.data.lowest * 100)}%；${fixed(s, c) ? '弊端已除。' : '弊端未除。'}` };
  },

  truth(s, c) {
    return c.branch === 'smuggle'
      ? `${regionName(c.region)}鹽課之絀，確因私鹽充斥。`
      : c.branch === 'embezzle'
        ? `${regionName(c.region)}鹽運使私賣鹽引入己，再以私鹽為藉口。`
        : `宮中派出的鹽監太監額外誅求，鹽商罷市，鹽課因而大減。`;
  },
};
