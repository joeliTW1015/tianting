// 疑案：藩王異動。被誣（巡撫與王府交惡）／貪婪擾民／陰謀起兵。

import { advise, claim, clue, core, post, request } from '../docs';
import { REGIONS, regionName } from '../geography';
import { fiefName, royalName } from '../names';
import type { CaseState, GameState } from '../types';
import { addPrestige, addUnrest, clamp, event, gov, makeChar, troops } from '../util';
import { armiesOf, spawnArmy } from '../war';
import { age, cdoc, chance, every, noisy, resolve, rumor } from './common';
import type { CaseDef } from './types';

const P = (s: GameState, c: CaseState) => s.chars[c.actors.prince];

function rebel(s: GameState, c: CaseState, why: string): void {
  const size = c.data.guards * 2.2 + 4000;
  c.data.rebelled = 1;
  P(s, c).status = 'rebel';
  spawnArmy(s, { caseId: c.uid, label: `${P(s, c).title}叛軍`, side: 'rebel', size, region: c.region, path: REGIONS[c.region].toCapital, growth: 1.03, moveIn: 2 });
  event(s, c.uid, `${P(s, c).title}${why}，以「清君側」為名起兵，眾${troops(size)}。`, true);
  const d = cdoc(s, c, 'memorial', gov(s, c.region).id, `${regionName(c.region)}飛報：${P(s, c).title}反`);
  d.urgent = true;
  core(d, `飛報：${P(s, c).title}${P(s, c).name}擁兵${troops(size * 1.4)}反，傳檄州縣，聲言清君側，省城危急！`, `${P(s, c).title}起兵反，號稱${troops(size * 1.4)}`, `緊急：藩王（皇族分封在地方的王）起兵造反了。「清君側」是說要清除皇帝身邊的奸臣，其實就是造反。`);
  post(s, d);
}

function princeMemorial(s: GameState, c: CaseState): void {
  const p = P(s, c);
  const d = cdoc(s, c, 'memorial', p.id, `${p.title}奏疏`);
  if (c.branch === 'slandered') {
    core(d, `臣${p.name}謹奏：臣謹守藩規，閉門讀書。近聞有司誣臣私造兵甲，臣惶恐無地，伏乞聖明垂察。`, `${p.title}自陳謹守藩規，遭有司誣陷`, '藩王說他很安分，是地方官誣告他。');
  } else if (c.branch === 'greedy') {
    core(d, `臣${p.name}謹奏：臣府中祿米不敷，宗人日繁，伏乞賜臣近府田土三千頃，及淮鹽引一萬，以贍宗支。`, `${p.title}請賜田三千頃、鹽引一萬`, '藩王說家族開銷大，請朝廷再賜他田地和賣鹽的許可（鹽引）。');
    request(d, { kind: 'grant', region: c.region, caseId: c.uid, desc: `賜${p.title}田土鹽引`, yes: '當地錢糧減少約一成（田地歸王府，不再繳稅），百姓不滿；但藩王滿意。', no: '不賜；藩王可能有怨言。' });
    d.recommend = advise(s, false, c.uid);
  } else {
    core(d, `臣${p.name}謹奏：近年盜賊竊發，王府單弱，伏乞准臣增設護衛三千，以資防禦。`, `${p.title}請增護衛三千以防盜`, '藩王說盜匪多，請准他增加三千名護衛（王府私兵）。');
    if (chance(s.rng, 0.4)) clue(d, '臣已先行召募鄉勇，訓練有方，惟候明旨。', '已先行召募鄉勇', { against: c.uid, plain: '他說已經先招了人在訓練，只等你批准。（先斬後奏？）' });
    request(d, { kind: 'guards', region: c.region, caseId: c.uid, desc: `准${p.title}增設護衛三千`, yes: '藩王的私兵增加三千人。若他沒有異心則無妨；若有，等於替他擴軍。', no: '不准；藩王可能不滿。' });
    d.recommend = advise(s, false, c.uid);
  }
  post(s, d);
}

function govReport(s: GameState, c: CaseState): void {
  const g = gov(s, c.region);
  const p = P(s, c);
  const d = cdoc(s, c, 'memorial', g.id, `${regionName(c.region)}巡撫奏王府事`);
  if (c.branch === 'slandered') {
    core(d, `臣${g.name}謹奏：${p.title}府中私造兵甲，夜聞操練之聲，恐有不軌。`, `巡撫劾${p.title}私造兵甲`, '巡撫告發藩王私造兵器、晚上練兵，可能要造反。');
    claim(d, `${c.uid}.guards`, '王府護衛', noisy(s.rng, c.data.guards * 3, 0.2), c.data.guards, { unit: '人', tol: 0.4, fmt: troops });
    if (chance(s.rng, 0.35)) clue(d, '又王府屢與臣爭地界，臣以法裁之，王頗銜恨。', '王府與巡撫爭地界，素有嫌隙', { plain: '巡撫順帶提到：他和王府因為土地糾紛結過怨。（所以這份告發可能有私心）' });
  } else if (c.branch === 'greedy') {
    core(d, `臣${g.name}謹奏：${p.title}府中校尉四出，強佔民田，鄉民控訴者日以百計。`, `${p.title}府中強佔民田，民怨日深`, '巡撫報告：王府的人到處強佔百姓的田地，告狀的人很多。');
    claim(d, `${c.uid}.guards`, '王府護衛', noisy(s.rng, c.data.guards, 0.15), c.data.guards, { unit: '人', tol: 0.4, fmt: troops });
  } else if (c.flags.bribed) {
    core(d, `臣${g.name}謹奏：${p.title}恪守藩規，府中安靜，地方無事。`, `${p.title}恪守藩規，地方無事`, '巡撫說藩王很安分。');
    claim(d, `${c.uid}.guards`, '王府護衛', c.data.guards * 0.5, c.data.guards, { unit: '人', tol: 0.4, fmt: troops });
  } else {
    core(d, `臣${g.name}謹奏：${p.title}府中近來招納亡命，護衛約${troops(noisy(s.rng, c.data.guards, 0.2))}，往來江湖術士甚眾。臣竊憂之。`, `${p.title}招納亡命，護衛漸多`, '巡撫報告：藩王最近收留了很多來歷不明的人，私兵越來越多。');
    claim(d, `${c.uid}.guards`, '王府護衛', noisy(s.rng, c.data.guards, 0.2), c.data.guards, { unit: '人', tol: 0.4, fmt: troops });
  }
  post(s, d);
}

export const prince: CaseDef = {
  id: 'prince',
  name: '藩王異動',
  regions: ['huguang', 'jiangxi', 'sichuan', 'shanxi'],
  branches: [
    { id: 'slandered', label: '遭人誣陷' },
    { id: 'greedy', label: '貪婪擾民' },
    { id: 'plot', label: '陰謀起兵' },
  ],
  question: '這位藩王是哪一種人？',
  opinions: { slandered: '王府之事，恐係地方官挾嫌誣告', greedy: '藩王貪得無厭，擾害地方', plot: '藩王招兵買馬，其志不小' },

  setup(s, c) {
    const p = makeChar(s, `prince:${c.uid}`, fiefName(s.rng), c.region, 'prince', 1, { name: royalName(s.rng) });
    c.actors = { prince: p.id, governor: gov(s, c.region).id };
    c.data = { guards: 3000, plot: c.branch === 'plot' ? 20 : 0, grants: 0, harass: c.branch === 'greedy' ? 1 : 0, reprimand: 0, cut: 0, summon: 0, rebelled: 0, deposed: 0, wrong: 0 };
    c.flags.bribed = c.branch === 'plot' && chance(s.rng, 0.5);
    if (c.flags.bribed) gov(s, c.region).integrity = 0.25;
  },

  tick(s, c) {
    if (c.data.rebelled) {
      if (!armiesOf(s, c.uid).length) resolve(s, c, '藩王叛軍被剿滅。', true);
      return;
    }
    if (c.data.deposed) return;
    if (c.branch === 'plot') {
      c.data.guards += c.data.cut ? 150 : 350;
      c.data.plot += c.data.cut ? 1.5 : 4;
      if (c.data.plot >= 100) return rebel(s, c, '密謀既久');
    }
    if (c.data.harass && s.turn > c.data.reprimand) addUnrest(s, c.region, 1.2);

    if (every(s, c, 5)) princeMemorial(s, c);
    if (every(s, c, 4, 2)) govReport(s, c);
    if (every(s, c, 6, 4)) {
      if (c.branch === 'plot' && chance(s.rng, 0.7)) rumor(s, c, `${P(s, c).title}府中夜聞操練之聲，又遣人遍訪天下奇士。`, `${P(s, c).title}府中夜有操練`, '傳說王府晚上有人在練兵，還到處招攬能人。');
      else if (c.branch === 'greedy') rumor(s, c, `${P(s, c).title}府中校尉橫行鄉里，百姓呼為「王老虎」。`, `${P(s, c).title}府中校尉橫行`, '傳說王府的人在地方上橫行霸道。');
      else rumor(s, c, `${P(s, c).title}好讀書，與文士唱和，頗有賢名。`, `${P(s, c).title}好讀書，頗有賢名`, '傳說這位藩王喜歡讀書，名聲不錯。');
    }
    if (c.branch !== 'plot' && age(s, c) >= 30) resolve(s, c, c.branch === 'greedy' ? '藩王貪婪如故，然終無大變。' : '藩王安分守己，流言漸息。', !c.data.wrong);
  },

  options(s, c) {
    if (c.data.rebelled || c.data.deposed) return [];
    const p = P(s, c);
    return [
      { kind: 'reprimand', label: `申飭${p.title}`, desc: '下詔訓誡藩王。貪婪擾民的會收斂一陣子；心懷異志的會更加警覺；無辜的會惶恐，宗室略有不安。' },
      { kind: 'cut', label: '削減王府護衛', desc: '把王府私兵減半。若藩王謀反已深，可能逼他提前起兵；若他無辜，宗室寒心、朝望下降。' },
      { kind: 'summon', label: `召${p.title}入覲`, desc: '召藩王進京。心中無鬼的會來；心懷異志的多半託病不來（再召一次可能直接造反）。' },
      { kind: 'depose', label: '廢為庶人', desc: '最嚴厲的處置，需要朝望 40 以上才壓得住宗室與輿論。冤枉了會大失人心；對謀反已深者可能激變。' },
    ];
  },

  onOrder(s, c, o) {
    const p = P(s, c);
    if (c.data.rebelled) return false;
    switch (o.kind) {
      case 'grant':
        c.data.grants += 1;
        s.world.regions[c.region].caseTaxMod = clamp(s.world.regions[c.region].caseTaxMod - 0.1, 0.5, 1);
        addUnrest(s, c.region, 6);
        event(s, c.uid, `賜${p.title}田土鹽引，當地小民失業者眾。`);
        return true;
      case 'guards':
        c.data.guards += 3000;
        if (c.branch === 'plot') c.data.plot += 15;
        event(s, c.uid, `准${p.title}增設護衛三千。`);
        return true;
      case 'reprimand':
        c.data.reprimand = s.turn + 12;
        if (c.branch === 'plot') c.data.plot += 5;
        if (c.branch === 'slandered') addPrestige(s, -1);
        event(s, c.uid, `申飭${p.title}之詔到達。${c.branch === 'greedy' ? '王府稍加收斂。' : c.branch === 'plot' ? '王府表面恭順，暗中加緊佈置。' : '藩王惶恐上表謝罪。'}`);
        return true;
      case 'cut':
        c.data.cut = 1;
        if (c.branch === 'plot') {
          if (c.data.plot >= 70) {
            rebel(s, c, '聞削護衛之詔');
            return true;
          }
          c.data.guards *= 0.5;
          c.data.plot -= 40;
          event(s, c.uid, `${p.title}護衛被削減一半，叛謀受挫。`, true);
        } else {
          c.data.guards *= 0.5;
          if (c.branch === 'slandered') {
            addPrestige(s, -3);
            c.data.wrong = 1;
          }
          event(s, c.uid, `${p.title}護衛被削減一半。${c.branch === 'slandered' ? '宗室寒心，以為朝廷猜忌骨肉。' : ''}`);
        }
        return true;
      case 'summon':
        c.data.summon += 1;
        if (c.branch === 'plot') {
          c.data.plot += 10;
          if (c.data.summon >= 2) {
            rebel(s, c, '再被召入京，自知事洩');
            return true;
          }
          const d = cdoc(s, c, 'memorial', p.id, `${p.title}辭召疏`);
          core(d, `臣${p.name}奉詔入覲，本當星馳，奈臣舊疾復作，臥床不起，伏乞寬限。`, `${p.title}託病辭召`, '藩王說他生病了，不能進京。（真病還是不敢來？）');
          post(s, d);
          event(s, c.uid, `${p.title}託病不至。`, true);
        } else {
          const d = cdoc(s, c, 'audience', p.id, `${p.title}入覲奏對`);
          d.arriveTurn = s.turn + 2;
          d.region = 'jingshi';
          d.free = true;
          if (c.branch === 'greedy') core(d, `${p.title}入覲，言語之間屢及田土鹽引，又訴祿米不敷。`, '藩王入覲，屢請田土', '藩王進京了，一直在要田要錢。看起來貪心，但沒什麼野心。');
          else core(d, `${p.title}入覲，進退有禮，談吐儒雅，於地方官員之誣，但伏地垂泣而已。`, '藩王入覲，進退有禮', '藩王進京了，態度恭敬，對被告發的事只是哭訴冤枉。');
          post(s, d);
        }
        return true;
      case 'depose':
        if (s.world.prestige < 40) {
          addPrestige(s, -5);
          event(s, c.uid, `廢${p.title}之詔下，宗室群起抗疏，言官交章論諫，詔令不行。`, true);
          return true;
        }
        if (c.branch === 'plot' && c.data.plot >= 80) {
          rebel(s, c, '聞廢黜之詔');
          return true;
        }
        c.data.deposed = 1;
        p.status = 'arrested';
        if (c.branch === 'slandered') {
          s.world.wrongful.push(`${p.title}${p.name}`);
          addPrestige(s, -8);
          c.data.wrong = 1;
          resolve(s, c, `無辜之${p.title}被廢，天下以為寡恩。`, false);
        } else if (c.branch === 'greedy') {
          addPrestige(s, -3);
          addUnrest(s, c.region, -10);
          resolve(s, c, `貪暴之${p.title}被廢，地方稱快，然宗室側目。`, true);
        } else resolve(s, c, `${p.title}謀逆未發，被廢為庶人。`, true);
        return true;
    }
    return false;
  },

  investigate(s, c, d, mode) {
    const r = s.rng;
    const p = P(s, c);
    if (mode.bribed) {
      core(d, `${p.title}恪守藩規，府中安靜。`, '查稱王府安靜', '巡按說王府一切正常。');
      claim(d, `${c.uid}.guards`, '王府護衛', 3000, c.data.guards, { unit: '人', tol: 0.4, fmt: troops });
      return;
    }
    const g = noisy(r, c.data.guards, mode.spy ? 0.2 : 0.1);
    core(d, `訪得${p.title}府中護衛約${troops(g)}。`, `王府護衛約${troops(g)}`, `查到王府私兵約 ${Math.round(g / 100) * 100} 人。（王府原本規定的護衛約三千）`);
    claim(d, `${c.uid}.guards`, '王府護衛', g, c.data.guards, { unit: '人', tol: 0.4, fmt: troops });
    if (chance(r, 0.75) || !mode.spy) {
      if (c.branch === 'plot') clue(d, '王府密購硝磺鐵料，又與江湖豪傑歃血為盟。', '王府密購硝磺，與豪傑結盟', { against: c.uid, plain: '王府偷偷買火藥原料和鐵，還跟江湖人物結盟。' });
      else if (c.branch === 'greedy') clue(d, '王府校尉強佔民田，鄉民怨聲載道，然無兵甲之事。', '王府強佔民田，然無兵甲之事', { plain: '王府的人強佔民田，但沒看到私造兵器。' });
      else clue(d, `所謂私造兵甲，查無實據；巡撫與王府爭地，素有嫌隙。`, '私造兵甲查無實據，巡撫與王府有隙', { plain: '告發的事查無證據，巡撫和王府本來就有過節。' });
    }
    if (mode.fabricate && c.branch !== 'plot') {
      core(d, `訪得${p.title}陰蓄死士，圖謀不軌。`, '訪得藩王陰蓄死士', '密探說藩王偷偷養了敢死隊。');
      claim(d, `${c.uid}.plot`, '藩王謀逆', '有', '無');
    }
  },

  bribe: (_s, c) => (c.branch === 'plot' ? 0.35 : 0),
  guilty: (s, c) => (c.branch === 'plot' && !c.data.deposed && !c.data.rebelled ? [c.actors.prince] : c.branch === 'slandered' ? [gov(s, c.region).id] : []),

  score(s, c) {
    let p = 0;
    if (c.branch === 'slandered') p = c.data.deposed ? 0 : c.data.cut ? 10 : 20;
    else if (c.branch === 'greedy') p = (c.data.grants <= 1 ? 8 : 2) + (c.data.reprimand || c.data.deposed ? 8 : 0) + (c.data.deposed ? 0 : 4);
    else p = c.data.rebelled ? (armiesOf(s, c.uid).length ? 3 : 10) : c.data.deposed || c.data.plot < 60 ? 20 : 6;
    const out = c.data.rebelled ? `藩王起兵，${armiesOf(s, c.uid).length ? '戰事未息' : '終被平定'}。` : c.data.deposed ? '藩王被廢。' : `局終時王府護衛約${troops(c.data.guards)}。`;
    return { points: p, outcome: out };
  },

  truth(s, c) {
    const p = P(s, c);
    return c.branch === 'slandered'
      ? `${p.title}${p.name}安分守己；巡撫與王府爭地結怨，挾嫌誣告。`
      : c.branch === 'greedy'
        ? `${p.title}${p.name}貪得無厭，強佔民田，然無反心。`
        : `${p.title}${p.name}陰謀起兵，暗中擴充護衛、結交豪傑${c.flags.bribed ? '，並收買了巡撫替其遮掩' : ''}。`;
  },
};
