// 疑案：流寇匿報。巡撫奏「已剿平」：確已剿平／匿報坐大／詐降（受撫後伺機復起）。

import { cn } from '../calendar';
import { advise, claim, clue, core, draft, fluff, post, request } from '../docs';
import { REGIONS, regionName } from '../geography';
import type { CaseState, GameState } from '../types';
import { addPrestige, event, gov, replaceChar, silver, troops } from '../util';
import { armiesOf, armySize, regionDefense, spawnArmy } from '../war';
import { age, cdoc, chance, every, int, noisy, resolve, rumor } from './common';
import type { CaseDef } from './types';

const concealing = (s: GameState, c: CaseState) => c.branch === 'hidden' && gov(s, c.region).term === 1;

function size(s: GameState, c: CaseState): number {
  return armySize(s, c.uid) + (c.data.dormant || 0);
}

function roadDelay(s: GameState, c: CaseState): { delay: number; lost: boolean } {
  if (armySize(s, c.uid) < 8000) return { delay: 0, lost: false };
  if (chance(s.rng, 0.15)) return { delay: 0, lost: true };
  return { delay: chance(s.rng, 0.35) ? 1 : 0, lost: false };
}

function govReport(s: GameState, c: CaseState): void {
  const r = s.rng;
  const g = gov(s, c.region);
  const real = size(s, c);
  const d = cdoc(s, c, 'memorial', g.id, age(s, c) === 0 ? `${regionName(c.region)}巡撫奏報剿撫流寇疏` : `${regionName(c.region)}巡撫奏報地方情形`);
  const { delay, lost } = roadDelay(s, c);
  d.delay = delay;
  let claimed: number;
  if (age(s, c) === 0) {
    if (c.branch === 'feigned') {
      core(d, `臣${g.name}謹奏：去冬饑民嘯聚為盜，臣宣布皇仁，賊首率眾六千餘歸順受撫。`, `流寇六千餘受撫歸順`, `巡撫說：去年冬天有饑民聚眾當強盜，他宣揚皇上的恩德，賊首帶了六千多人投降（受撫＝接受招安）。`);
      claimed = 0;
      core(d, '惟降眾無所得食，伏乞發帑銀二十萬兩，以為安插之資。', '乞發安插銀二十萬兩', '他請朝廷撥錢安置這些投降的人。');
      request(d, { kind: 'settle', region: c.region, amount: 20, caseId: c.uid, desc: `發安插銀二十萬兩予${regionName(c.region)}`, yes: '國庫 −20 萬兩，交給降眾安家。若他們真心歸順，可以安定地方；若是詐降，這筆錢會被拿去買兵器。', no: '不給錢。降眾可能生怨。' });
      d.recommend = advise(s, false, c.uid);
    } else {
      const heads = int(r, 600, 900);
      core(d, `臣${g.name}謹奏：去冬饑民嘯聚為盜，臣督官兵分道進剿，斬首${cn(heads)}級，餘眾解散歸農，地方已靖。`, `報流寇已剿平，斬首${cn(heads)}`, `巡撫說：去年冬天的盜匪已經剿平，殺了 ${heads} 人，其餘解散回家種田了。`);
      claimed = int(r, 200, 500);
    }
  } else if (!concealing(s, c)) {
    claimed = noisy(r, real, 0.15);
    if (real <= 0) core(d, `臣${g.name}謹奏：本省地方寧謐，並無嘯聚。`, '地方寧謐', '巡撫說：地方平安，沒有盜匪。');
    else core(d, `臣${g.name}謹奏：本省流寇約${troops(claimed)}，臣督兵防剿。`, `流寇約${troops(claimed)}`, `巡撫說：流寇大約有 ${Math.round(claimed / 1000)} 千人。`);
    if (c.branch === 'feigned' && c.data.dormant > 0 && chance(r, 0.35))
      clue(d, '降眾聚居山中，不肯散處，間有私造器械者，臣已嚴飭約束。', '降眾聚居不散，間有私造器械', { against: c.uid, plain: '投降的人聚在山裡不肯分散，還有人偷偷做兵器。（真心投降嗎？）' });
  } else if (real < 25000) {
    claimed = int(r, 200, 600);
    core(d, `臣${g.name}謹奏：本省零星散匪不過${troops(claimed)}，已責成州縣捕治，地方寧謐。`, `零星散匪不過${troops(claimed)}，地方寧謐`, `巡撫說：只剩幾百個零星盜匪，地方平安。`);
    if (chance(r, 0.4)) clue(d, '惟近因旱魃，饑民間有流移，臣已飭州縣招撫。', '旱災饑民間有流移', { against: c.uid, plain: '他順帶提到因為乾旱，有饑民在逃荒。（饑民多，往往就是流寇的來源）' });
    if (chance(r, 0.25)) clue(d, '又驛路間有阻滯，文報或有稽遲，伏乞鑒原。', '驛路間有阻滯', { against: c.uid, plain: '他說驛路有時不通，公文會遲到。（為什麼路會不通？）' });
  } else {
    claimed = real / 3;
    core(d, `臣${g.name}謹奏：流寇復熾，約${troops(claimed)}，臣兵單力薄，伏乞速發京營進剿。`, `流寇復熾約${troops(claimed)}，乞發兵`, `巡撫終於承認流寇又起，約 ${Math.round(claimed / 1000)} 千人，請朝廷派兵。`);
  }
  if (age(s, c) > 0 || c.branch !== 'feigned') claim(d, `${c.uid}.rebels`, '流寇', claimed, real, { unit: '人', tol: 0.5, fmt: troops });
  if (!d.request && real > 3000 && !concealing(s, c)) {
    core(d, '伏乞發京營進剿，以靖地方。', '乞發京營進剿');
    request(d, { kind: 'campaign', region: c.region, troops: 10000, caseId: c.uid, desc: `發京營一萬進剿${regionName(c.region)}`, yes: '京營 −10000 人出征（國庫 −10 萬兩，往後每旬多耗錢糧），抵達後駐剿六旬。', no: '不派兵；地方自行防禦。' });
    d.recommend = advise(s, true, c.uid);
  }
  if (!d.request && age(s, c) > 0) fluff(d, '臣惟有督率將吏，悉心撫綏。', '（客套話）');
  post(s, d, lost);
}

function neighborReport(s: GameState, c: CaseState): void {
  const r = s.rng;
  const n = REGIONS[c.region].toCapital[0];
  if (!n || n === 'jingshi') return;
  const g = gov(s, n);
  const d = draft('memorial', g.id, n, c.uid, `${regionName(n)}巡撫奏報流民事`);
  const real = armySize(s, c.uid);
  const refugees = real > 0 ? noisy(r, real * 0.5 + 500, 0.3) : int(r, 300, 900);
  core(d, `臣${g.name}謹奏：近旬自${regionName(c.region)}流入本省饑民約${troops(refugees)}，臣已分發安插。`, `${regionName(c.region)}流入饑民約${troops(refugees)}`, `鄰省巡撫說：最近從${regionName(c.region)}逃來大約 ${refugees} 個饑民。`);
  claim(d, `${c.uid}.refugees`, '外流饑民', refugees, refugees, { unit: '人' });
  if (real > 8000 && chance(r, 0.6)) clue(d, `據流民言，${regionName(c.region)}賊眾嘯聚，動以萬計，焚掠村堡，官兵不敢近。`, '流民言賊眾動以萬計', { against: c.uid, plain: '逃來的人說那邊盜匪上萬，到處燒殺搶掠，官兵都不敢靠近。' });
  else if (real <= 0 && chance(r, 0.15)) clue(d, '據流民言，彼處有盜，聲勢頗大。然所言多不可究詰。', '流民言有盜（未可究詰）', { plain: '有流民說那邊有盜匪，但說法查不清楚。' });
  else fluff(d, '本省麥收尚可，流民可以安插。', '（本省還能安置流民）');
  post(s, d);
}

export const bandit: CaseDef = {
  id: 'bandit',
  name: '流寇匿報',
  regions: ['shaanxi', 'shanxi', 'henan', 'sichuan'],
  branches: [
    { id: 'quelled', label: '確已剿平' },
    { id: 'hidden', label: '匿報坐大' },
    { id: 'feigned', label: '詐降待變' },
  ],
  question: '這股流寇真的平了嗎？',
  opinions: { quelled: '其地似已安靖，不必勞師', hidden: '其地奏報過於粉飾，恐賊勢不小', feigned: '降眾聚而不散，恐非真心歸順' },

  setup(s, c) {
    const g = gov(s, c.region);
    g.integrity = c.branch === 'hidden' ? 0.3 : 0.7;
    c.actors = { governor: g.id };
    c.data = { dormant: 0, paid: 0, riseTurn: c.startTurn + int(s.rng, 13, 17), rose: 0, peak: 0, campaigns: 0, killedSurrendered: 0, dispersed: 0 };
  },

  tick(s, c) {
    if (age(s, c) === 0) {
      if (c.branch === 'hidden') spawnArmy(s, { caseId: c.uid, label: `${regionName(c.region)}流寇`, side: 'bandit', size: 4000, region: c.region, path: REGIONS[c.region].toCapital, growth: 1.13, moveIn: 12 });
      if (c.branch === 'feigned') c.data.dormant = 6000;
    }
    // 詐降：伺機復起
    if (c.branch === 'feigned' && c.data.dormant > 0) {
      c.data.dormant *= 1.02;
      if (regionDefense(s, c.region) > s.world.regions[c.region].garrison * 0.6 + 1) {
        const kill = Math.min(c.data.dormant, 4000);
        c.data.dormant -= kill;
        if (!c.data.killedSurrendered) addPrestige(s, -3);
        c.data.killedSurrendered = 1;
        event(s, c.uid, `官軍掩殺降眾約${troops(kill)}，人言殺降不祥。`, true);
      }
      if (c.data.dormant < 1500) {
        c.data.dormant = 0;
        resolve(s, c, '降眾或散或滅，未能復起。', true);
      } else if (s.turn >= c.data.riseTurn) {
        spawnArmy(s, { caseId: c.uid, label: `${regionName(c.region)}叛降流寇`, side: 'bandit', size: c.data.dormant, region: c.region, path: REGIONS[c.region].toCapital, growth: 1.08, moveIn: 4 });
        event(s, c.uid, `受撫之眾${troops(c.data.dormant)}復叛，殺官焚城。`, true);
        c.data.dormant = 0;
        c.data.rose = 1;
        const d = cdoc(s, c, 'memorial', gov(s, c.region).id, `${regionName(c.region)}飛報：降眾復叛`);
        d.urgent = true;
        core(d, '飛報：前受撫之眾忽於夜間鼓譟復叛，殺傷官軍，攻陷縣城。', '受撫之眾復叛，攻陷縣城', '緊急：之前投降的那批人又反了，攻下了縣城。');
        post(s, d);
      }
    }
    c.data.peak = Math.max(c.data.peak, size(s, c));
    if ((c.branch === 'hidden' || c.data.rose) && age(s, c) > 2 && !armiesOf(s, c.uid).length) {
      resolve(s, c, '流寇終被蕩平。', true);
      return;
    }
    if (every(s, c, 3)) govReport(s, c);
    if (every(s, c, 3, 1) && age(s, c) > 0) neighborReport(s, c);
    if (every(s, c, 5, 4)) {
      const alarm = size(s, c) > 5000 ? chance(s.rng, 0.7) : chance(s.rng, 0.2);
      if (alarm) rumor(s, c, `${regionName(c.region)}盜起，聞有眾數萬，官軍閉城不出。`, `${regionName(c.region)}盜起，眾數萬`, '傳說那裡盜匪數萬，官軍躲在城裡不敢出來。');
      else rumor(s, c, `${regionName(c.region)}今歲小旱，米價稍昂，餘無他事。`, `${regionName(c.region)}小旱，餘無他事`, '傳說那裡有點乾旱，米價小漲，其他沒事。');
    }
    if (c.branch === 'quelled' && age(s, c) >= 24) resolve(s, c, '地方確已安靖。', true);
  },

  options(_s, c) {
    return c.data.dispersed ? [] : [{ kind: 'disperse', label: '分散安插降眾', silver: 10, desc: '把投降或解散的人拆散，分送各地安置。若他們是詐降，可以瓦解其勢力；若根本沒有成股降眾，這筆錢白花。' }];
  },

  onOrder(s, c, o) {
    if (o.kind === 'settle') {
      c.data.paid += o.amount ?? 20;
      if (c.branch === 'feigned') {
        c.data.dormant *= 1.3;
        event(s, c.uid, `安插銀${silver(o.amount ?? 20)}到，降眾用以購置刀甲。`);
      }
      return true;
    }
    if (o.kind === 'disperse') {
      c.data.dispersed = 1;
      if (c.branch === 'feigned' && c.data.dormant > 0) {
        c.data.dormant *= 0.2;
        event(s, c.uid, '降眾被分散安插各州縣，勢力瓦解。', true);
        if (c.data.dormant < 2500) {
          c.data.dormant = 0;
          resolve(s, c, '詐降之眾被分散安插，未能復起。', true);
        }
      } else event(s, c.uid, '分散安插之旨到達，然並無成股降眾可散。');
      return true;
    }
    if (o.kind === 'campaign') c.data.campaigns += 1;
    if (o.kind === 'arrest' && o.person === gov(s, c.region).id) {
      const old = gov(s, c.region).name;
      if (c.branch === 'quelled') {
        s.world.wrongful.push(`${regionName(c.region)}巡撫${old}`);
        addPrestige(s, -2);
        event(s, c.uid, `巡撫${old}剿撫有功，無罪被逮。`, true);
      } else event(s, c.uid, `巡撫${old}被逮。`, true);
      replaceChar(s, gov(s, c.region).id);
      const real = size(s, c);
      const d = cdoc(s, c, 'memorial', gov(s, c.region).id, `新任${regionName(c.region)}巡撫到任疏`);
      if (real > 0) {
        core(d, `臣${gov(s, c.region).name}謹奏：臣到任查明，本省${c.data.dormant > 0 ? '降眾' : '流寇'}實有${troops(real)}，前任${c.branch === 'hidden' ? '匿不以聞' : '撫而不散'}。`, `新任巡撫查明實有${troops(real)}`, `新巡撫查明：實際有 ${Math.round(real / 1000)} 千人，前任${c.branch === 'hidden' ? '隱瞞不報' : '招撫了卻沒有解散他們'}。`);
        claim(d, `${c.uid}.rebels`, '流寇', real, real, { unit: '人', fmt: troops });
      } else core(d, `臣${gov(s, c.region).name}謹奏：臣到任查明，地方寧謐，前任剿撫得宜。`, '新任巡撫稱前任剿撫得宜', '新巡撫說前任把事情處理得很好。你可能錯怪了人。');
      post(s, d);
      return true;
    }
    return false;
  },

  investigate(s, c, d, mode) {
    const r = s.rng;
    const real = size(s, c);
    if (mode.bribed) {
      core(d, '隨巡撫周歷各府，地方寧謐，間有小盜，旋即撲滅。', '查稱地方寧謐', '巡按跟著巡撫到處看，說一切平安。（他看到的可能是巡撫安排好的）');
      claim(d, `${c.uid}.rebels`, '流寇', 500, real, { unit: '人', tol: 0.5, fmt: troops });
      return;
    }
    let shown = real > 0 ? noisy(r, real, mode.spy ? 0.25 : 0.12) : 0;
    if (mode.fabricate) shown = Math.max(shown, 5000) * 2.5;
    if (shown > 0) core(d, `訪得${regionName(c.region)}${c.data.dormant > 0 && !mode.fabricate ? '受撫降眾' : '流寇'}約${troops(shown)}${shown > 10000 ? '，焚掠村堡，聲勢甚張' : ''}。`, `訪得${c.data.dormant > 0 ? '降眾' : '流寇'}約${troops(shown)}`, `查到大約有 ${Math.round(shown / 1000)} 千人。`);
    else core(d, `訪得${regionName(c.region)}地方寧謐，並無大股嘯聚。`, '訪得並無大股流寇', '查到地方平靜，沒有成群的盜匪。');
    claim(d, `${c.uid}.rebels`, '流寇', Math.round(shown), real, { unit: '人', tol: 0.5, fmt: troops });
    if (concealing(s, c) && real > 3000) clue(d, '巡撫衙門嚴禁州縣以賊情上聞，違者以擾民論。', '巡撫嚴禁州縣上報賊情', { against: c.uid, plain: '巡撫禁止下面的縣官往上報告盜匪的事。' });
    if (c.data.dormant > 0 && (chance(r, 0.7) || !mode.spy)) clue(d, '降眾聚居山寨，日夜操練，私造刀槍，不似歸農之民。', '降眾日夜操練，私造刀槍', { against: c.uid, plain: '投降的人住在山寨裡每天練兵、造兵器，不像要回家種田。' });
  },

  bribe: (s, c) => (concealing(s, c) ? 0.35 : 0),
  guilty: (s, c) => (concealing(s, c) ? [gov(s, c.region).id] : []),

  score(s, c) {
    let p = 0;
    if (c.branch === 'hidden') p = !armiesOf(s, c.uid).length ? 20 : c.data.peak < 20000 ? 10 : 3;
    else if (c.branch === 'quelled') p = c.data.campaigns === 0 ? 20 : c.data.campaigns === 1 ? 12 : 5;
    else p = !c.data.rose ? (c.data.killedSurrendered ? 14 : 20) : !armiesOf(s, c.uid).length ? 10 : 3;
    if (c.branch === 'feigned' && c.data.paid) p -= 4;
    const out = c.branch === 'quelled' ? (c.data.campaigns ? `出兵${c.data.campaigns}次，撲了個空。` : '未曾勞師。') : `流寇最盛時約${troops(c.data.peak)}；${armiesOf(s, c.uid).length ? '局終仍未平定。' : '終告平定。'}`;
    return { points: Math.max(0, p), outcome: out };
  },

  truth(s, c) {
    return c.branch === 'hidden'
      ? `${regionName(c.region)}流寇並未剿平，巡撫匿報，賊勢逐旬坐大。`
      : c.branch === 'feigned'
        ? `${regionName(c.region)}流寇詐降：表面受撫，實則聚眾操練，約於${Math.max(0, c.data.riseTurn - c.startTurn)}旬後復叛。`
        : `${regionName(c.region)}流寇確已剿平，巡撫所奏屬實。`;
  },
};
