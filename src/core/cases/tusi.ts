// 疑案：土司叛服。流官苛索、逼反土司／土司坐大、侵奪鄰境／土司身故、二子爭襲。

import { advise, claim, clue, core, fluff, post, request } from '../docs';
import { REGIONS, regionName } from '../geography';
import type { CaseState, GameState } from '../types';
import { addPrestige, addUnrest, event, gov, makeChar, replaceChar, troops } from '../util';
import { armiesOf, armySize, spawnArmy } from '../war';
import { age, cdoc, chance, every, int, noisy, resolve, rumor } from './common';
import type { CaseDef } from './types';

const TRIBES = ['水西', '播州', '永寧', '思南', '烏撒', '麗江', '田州', '泗城'];
const T = (s: GameState, c: CaseState) => s.chars[c.actors.tusi];

function heirName(s: GameState, c: CaseState, i: number): string {
  return s.chars[i === 0 ? c.actors.heirA : c.actors.heirB].name;
}

function govReport(s: GameState, c: CaseState): void {
  const g = gov(s, c.region);
  const t = T(s, c);
  const real = armySize(s, c.uid);
  const d = cdoc(s, c, 'memorial', g.id, `${regionName(c.region)}奏報土司事`);
  if (c.branch === 'succession') {
    core(d, `臣${g.name}謹奏：${t.title}病故，其子${heirName(s, c, 0)}、${heirName(s, c, 1)}爭襲，各聚土兵相持。伏乞欽定承襲之人。`, `${t.title}病故，二子爭襲`, `巡撫說：土司（世襲統治少數民族地區的首領）死了，兩個兒子${heirName(s, c, 0)}和${heirName(s, c, 1)}爭位，各自集結兵馬。請你決定由誰繼承。`);
    if (chance(s.rng, 0.5)) clue(d, `查${t.title}舊印，現在${heirName(s, c, c.data.legit)}手中。`, `舊印在${heirName(s, c, c.data.legit)}手中`, { plain: `他提到土司的官印在${heirName(s, c, c.data.legit)}手上。（誰拿著官印，通常是正統繼承人）` });
  } else {
    const shown = c.branch === 'provoked' && g.term === 1 ? Math.max(real, 3000) * 2.5 : noisy(s.rng, real, 0.2);
    core(d, `臣${g.name}謹奏：${t.title}${t.name}桀驁不馴，擁土兵約${troops(shown)}，焚掠鄉村，謀逆顯然。伏乞發兵征剿。`, `${t.title}擁兵約${troops(shown)}謀逆，乞征剿`, `巡撫說：土司${t.name}帶著約 ${Math.round(shown / 1000)} 千兵在作亂，請朝廷出兵討伐。`);
    claim(d, `${c.uid}.army`, '土兵', shown, real, { unit: '人', tol: 0.5, fmt: troops });
    if (c.branch === 'provoked' && g.term === 1 && chance(s.rng, 0.35)) clue(d, '土司屢次具揭控訴有司，皆屬刁詞，臣已嚴行駁斥。', '土司屢控有司，巡撫斥為刁詞', { against: c.uid, plain: '他提到土司一直在告地方官的狀，他都當成刁民亂告。（土司在告什麼？）' });
    request(d, { kind: 'campaign', region: c.region, troops: 10000, caseId: c.uid, desc: `發京營一萬征剿${t.title}`, yes: '京營 −10000 人遠征（國庫 −10 萬兩，往後每旬多耗錢糧）。路途遙遠，曠日持久。', no: '不出兵。' });
    d.recommend = advise(s, c.branch === 'ambition', c.uid);
  }
  post(s, d);
}

function tusiMemorial(s: GameState, c: CaseState): void {
  const t = T(s, c);
  if (c.branch === 'succession') {
    for (const i of [0, 1]) {
      const id = i === 0 ? c.actors.heirA : c.actors.heirB;
      const d = cdoc(s, c, 'memorial', id, `${s.chars[id].name}請襲職疏`);
      if (i === c.data.legit) {
        core(d, `臣${s.chars[id].name}謹奏：臣係先臣嫡長，先臣臨終，親以印信付臣，宗支冊籍可查。伏乞准臣承襲。`, '自稱嫡長，持有印信、宗支冊可查', '他說自己是正室所生的長子，父親臨終把官印交給他，族譜可以查證。');
      } else {
        core(d, `臣${s.chars[id].name}謹奏：臣母受先臣寵愛，先臣臨終口授遺命，屬臣承襲。印信為兄所奪，伏乞明察。`, '自稱受先臣口授遺命，印信被奪', '他說父親臨終口頭交代由他繼承，官印是被兄弟搶走的。（口說無憑？）');
        clue(d, '且臣部下土兵數倍於彼，若不得襲，恐部眾不服。', '自誇土兵數倍，暗示不服', { plain: '他暗示自己兵比較多，不讓他繼承的話部下不會服。' });
      }
      post(s, d);
    }
    return;
  }
  const d = cdoc(s, c, 'memorial', t.id, `${t.title}奏辯疏`);
  if (c.branch === 'provoked') {
    core(d, `臣${t.name}謹奏：流官${gov(s, c.region).name}苛索無已，歲責金銀馬匹，臣部不堪，不得已聚眾自保，實無叛心。伏乞天恩。`, '土司稱流官苛索，不得已自保，實無叛心', `土司說：是地方官（流官＝朝廷派去的官）一直勒索他們，他們是被逼的，沒有要造反。`);
  } else {
    core(d, `臣${t.name}謹奏：鄰境諸司素屬臣部，伏乞加臣都督之銜，總轄其地。`, '土司請加都督銜，總轄鄰境', '土司要求朝廷給他更大的官銜，讓他管轄鄰近地區。（野心不小）');
    clue(d, '倘蒙不允，臣部下土兵恐難約束。', '倘不允，土兵恐難約束', { against: c.uid, plain: '他說如果不答應，部下可能會失控。（這是威脅）' });
  }
  post(s, d);
}

export const tusi: CaseDef = {
  id: 'tusi',
  name: '土司叛服',
  regions: ['yungui', 'sichuan', 'liangguang'],
  branches: [
    { id: 'provoked', label: '流官逼反' },
    { id: 'ambition', label: '土司坐大' },
    { id: 'succession', label: '承襲之爭' },
  ],
  question: '西南土司之亂，根源何在？',
  opinions: { provoked: '土司之變，恐由流官苛索激成', ambition: '土司驕橫日甚，非示以兵威不可', succession: '土司內爭，朝廷但擇其正者立之' },

  setup(s, c) {
    const tribe = TRIBES[int(s.rng, 0, TRIBES.length - 1)];
    const t = makeChar(s, `tusi:${c.uid}`, `${tribe}宣慰使`, c.region, 'chieftain', 2);
    c.actors = { tusi: t.id, governor: gov(s, c.region).id };
    if (c.branch === 'provoked') gov(s, c.region).integrity = 0.2;
    if (c.branch === 'succession') {
      c.actors.heirA = makeChar(s, `heirA:${c.uid}`, `${tribe}土舍`, c.region, 'chieftain', 3).id;
      c.actors.heirB = makeChar(s, `heirB:${c.uid}`, `${tribe}土舍`, c.region, 'chieftain', 3).id;
    }
    c.data = { legit: int(s.rng, 0, 1), chosen: -1, split: 0, pacify: 0, campaigns: 0, reformed: 0, warStarted: 0 };
  },

  tick(s, c) {
    const t = T(s, c);
    if (age(s, c) === 0) {
      if (c.branch === 'provoked') spawnArmy(s, { caseId: c.uid, label: `${t.title}土兵`, side: 'rebel', size: 4000, region: c.region, growth: 1.03, evasion: 0.5 });
      if (c.branch === 'ambition') spawnArmy(s, { caseId: c.uid, label: `${t.title}土兵`, side: 'rebel', size: 7000, region: c.region, path: [REGIONS[c.region].toCapital[0]], growth: 1.07, moveIn: 10, evasion: 0.45 });
    }
    if (c.branch === 'succession' && c.data.chosen < 0 && !c.data.split && age(s, c) >= 10 && !c.data.warStarted) {
      c.data.warStarted = 1;
      spawnArmy(s, { caseId: c.uid, label: '爭襲土兵', side: 'rebel', size: 3000, region: c.region, growth: 1.02 });
      event(s, c.uid, '二子爭襲不決，各率土兵相攻，地方糜爛。', true);
    }
    if (c.branch !== 'succession' && age(s, c) > 2 && !armiesOf(s, c.uid).length && !c.resolved) {
      resolve(s, c, c.branch === 'provoked' ? '土司之亂平息。' : '土司兵敗。', true);
      return;
    }
    if (every(s, c, 4)) govReport(s, c);
    if (every(s, c, 6, 2)) tusiMemorial(s, c);
    if (every(s, c, 6, 4)) {
      if (c.branch === 'provoked') rumor(s, c, `${regionName(c.region)}流官索賄土司，歲以千金計，土民怨之入骨。`, '流官索賄土司', '傳說地方官向土司勒索，每年上千兩。');
      else if (c.branch === 'ambition') rumor(s, c, `${t.title}吞併鄰司寨落數十，自稱「王」於其境。`, `${t.title}吞併鄰司，自稱王`, '傳說這位土司吞併了附近幾十個寨子，在自己地盤上稱王。');
      else rumor(s, c, `${t.title}二子爭立，其嫡長者持印，其庶出者擁眾。`, '嫡長持印，庶出擁眾', '傳說兩個兒子爭位：正室長子拿著官印，庶出的那個兵比較多。');
    }
  },

  options(s, c) {
    if (c.resolved) return [];
    if (c.branch === 'succession' || c.data.chosen >= 0) {
      return [
        { kind: 'pick0', label: `立${heirName(s, c, 0)}承襲`, desc: '由他繼承土司之位。立對了，地方安定；立錯了，另一方會起兵。' },
        { kind: 'pick1', label: `立${heirName(s, c, 1)}承襲`, desc: '由他繼承土司之位。立對了，地方安定；立錯了，另一方會起兵。' },
        { kind: 'split', label: '分其地，二子各領', desc: '把地盤一分為二。雙方都不完全滿意，但大多不至於打起來。' },
      ];
    }
    const o = [{ kind: 'pacify', label: '遣官齎賞撫慰', silver: 10, desc: '派官員帶賞賜去安撫土司。若他是被逼反的，多半會罷兵；若他本有野心，只會拿了賞賜繼續擴張。' }];
    if (!armiesOf(s, c.uid).length && c.branch === 'ambition' && !c.data.reformed) o.push({ kind: 'reform', label: '改土歸流', silver: 0, desc: '取消土司世襲，改派朝廷官員治理。朝望 +3。' });
    return o;
  },

  onOrder(s, c, o) {
    const t = T(s, c);
    if (o.kind === 'campaign') c.data.campaigns += 1;
    if (o.kind === 'pacify') {
      c.data.pacify += 1;
      for (const a of armiesOf(s, c.uid)) a.size *= c.branch === 'provoked' ? 0.3 : 1.1;
      event(s, c.uid, c.branch === 'provoked' ? `撫慰之使至，${t.title}感泣，散遣土兵大半。` : `撫慰之使至，${t.title}受賞而驕，擴張如故。`, true);
      return true;
    }
    if (o.kind === 'reform') {
      c.data.reformed = 1;
      addPrestige(s, 3);
      resolve(s, c, '土司兵敗，改土歸流。', true);
      return true;
    }
    if (o.kind === 'pick0' || o.kind === 'pick1') {
      const pick = o.kind === 'pick0' ? 0 : 1;
      c.data.chosen = pick;
      if (pick === c.data.legit) {
        for (const a of armiesOf(s, c.uid)) a.size *= 0.2;
        resolve(s, c, `立嫡長${heirName(s, c, pick)}承襲，土眾帖服。`, true);
      } else {
        spawnArmy(s, { caseId: c.uid, label: `${heirName(s, c, c.data.legit)}土兵`, side: 'rebel', size: 5000, region: c.region, growth: 1.03 });
        event(s, c.uid, `朝廷立庶子${heirName(s, c, pick)}，嫡長${heirName(s, c, c.data.legit)}不服，持印起兵。`, true);
      }
      return true;
    }
    if (o.kind === 'split') {
      c.data.split = 1;
      for (const a of armiesOf(s, c.uid)) a.size *= 0.5;
      addUnrest(s, c.region, 5);
      resolve(s, c, '分地二子，各領其眾，暫得相安。', true);
      return true;
    }
    if (o.kind === 'arrest' && o.person === gov(s, c.region).id) {
      const old = gov(s, c.region).name;
      if (c.branch === 'provoked') {
        for (const a of armiesOf(s, c.uid)) a.size *= 0.3;
        event(s, c.uid, `苛索土司之${old}被逮，土眾聞之，多解甲歸寨。`, true);
      } else {
        s.world.wrongful.push(`${regionName(c.region)}${REGIONS[c.region].gov}${old}`);
        addPrestige(s, -2);
        event(s, c.uid, `${old}無罪被逮。`, true);
      }
      replaceChar(s, gov(s, c.region).id);
      return true;
    }
    return false;
  },

  investigate(s, c, d, mode) {
    const real = armySize(s, c.uid);
    if (real > 0) {
      const seen = noisy(s.rng, real, mode.spy ? 0.25 : 0.12);
      core(d, `訪得土兵約${troops(seen)}。`, `土兵約${troops(seen)}`, `查到土司兵力大約 ${Math.round(seen / 1000)} 千人。`);
      claim(d, `${c.uid}.army`, '土兵', seen, real, { unit: '人', tol: 0.5, fmt: troops });
    }
    if (mode.bribed) return;
    if (c.branch === 'provoked') clue(d, `流官${gov(s, c.region).name}歲索土司金銀馬匹，土民怨憤，乃激成變。`, '流官索賄，激成土司之變', { against: c.uid, plain: '地方官每年向土司勒索財物，才把他們逼反的。' });
    else if (c.branch === 'ambition') clue(d, `${T(s, c).title}吞併鄰司，招納亡命，其志不小。`, '土司吞併鄰司，其志不小', { plain: '土司在吞併鄰近地區，野心很大。' });
    else clue(d, `宗支冊載${heirName(s, c, c.data.legit)}為嫡長，印信亦在其手。`, `宗支冊載${heirName(s, c, c.data.legit)}為嫡長`, { plain: `族譜記載${heirName(s, c, c.data.legit)}才是正室長子，官印也在他手上。` });
    if (mode.fabricate) fluff(d, '番子言語不通，所得多為傳聞。', '密探語言不通，消息多是聽來的。');
  },

  bribe: (s, c) => (c.branch === 'provoked' && gov(s, c.region).term === 1 ? 0.4 : 0),
  guilty: (s, c) => (c.branch === 'provoked' && gov(s, c.region).term === 1 ? [gov(s, c.region).id] : c.branch === 'ambition' ? [c.actors.tusi] : []),

  score(s, c) {
    const left = armySize(s, c.uid);
    let p = 0;
    if (c.branch === 'provoked') p = (gov(s, c.region).term > 1 || c.data.pacify ? 14 : 4) + (c.data.campaigns ? 0 : 6) - (left > 2000 ? 6 : 0);
    else if (c.branch === 'ambition') p = left < 1000 ? (c.data.reformed ? 20 : 16) : left < 5000 ? 8 : 3;
    else p = c.data.chosen === c.data.legit ? 20 : c.data.split ? 10 : c.data.chosen >= 0 ? 3 : 5;
    return { points: Math.max(0, p), outcome: left > 0 ? `局終時土兵尚有約${troops(left)}。` : '西南已靖。' };
  },

  truth(s, c) {
    const t = T(s, c);
    return c.branch === 'provoked'
      ? `${t.title}${t.name}本無反心，乃流官苛索，逼其聚眾自保。`
      : c.branch === 'ambition'
        ? `${t.title}${t.name}坐大驕橫，侵奪鄰境，意圖割據。`
        : `${t.title}病故，嫡長子${heirName(s, c, c.data.legit)}持印為正，${heirName(s, c, 1 - c.data.legit)}恃眾爭襲。`;
  },
};
