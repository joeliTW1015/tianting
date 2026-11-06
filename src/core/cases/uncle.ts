// 前朝勢力・覬覦大位的皇叔（必出）。先帝寵愛的胞弟瑞王，就藩河南。
// 分支：安分（只是奢侈擾民）／覬覦（結交朝臣與京營，皇帝病重或無子時發動）／被權閹利用（權閹倒台後自然安分）。

import { claim, clue, core, draft, local, post, request } from '../docs';
import { addGrievance } from '../factions';
import { REGIONS, regionName } from '../geography';
import { oddsText } from '../intel';
import type { CaseState, GameState } from '../types';
import { addPrestige, addUnrest, clamp, event, flow, troops } from '../util';
import { armiesOf, spawnArmy } from '../war';
import { age, cdoc, chance, every, noisy, resolve, rumor } from './common';
import { eunuchCase } from './eunuch';
import type { CaseDef } from './types';

const U = (s: GameState) => s.chars.uncle;

export function uncleCase(s: GameState): CaseState | undefined {
  return s.cases.find((c) => c.def === 'uncle');
}

/** 召王入京的勝算 */
export function summonOdds(s: GameState, c: CaseState): number {
  if (c.branch !== 'covet') return 0.92;
  return clamp(0.75 - c.data.progress / 150 + (s.world.dowager - 50) / 200, 0.1, 0.9);
}

function rise(s: GameState, c: CaseState, why: string): void {
  const size = c.data.guards * 3 + 8000;
  c.data.rebelled = 1;
  U(s).status = 'rebel';
  spawnArmy(s, { caseId: c.uid, label: '瑞王叛軍', side: 'rebel', size, region: c.region, path: REGIONS[c.region].toCapital, growth: 1.03, moveIn: 2, power: 'uncle' });
  event(s, c.uid, `瑞王${why}，以「清君側」為名起兵，眾${troops(size)}。`, true);
  const d = cdoc(s, c, 'memorial', `gov:${c.region}`, `${regionName(c.region)}飛報：瑞王反`);
  d.urgent = true;
  core(d, `飛報：瑞王${U(s).name}擁兵${troops(size * 1.4)}反，傳檄州縣，聲言清君側，北指京師！`, `瑞王起兵，號稱${troops(size * 1.4)}`, '皇叔造反了，正往京師打來。要調兵堵截。');
  post(s, d);
}

export const uncle: CaseDef = {
  id: 'uncle',
  name: '皇叔瑞王',
  regions: ['henan'],
  branches: [
    { id: 'content', label: '安分，只是奢侈擾民' },
    { id: 'covet', label: '覬覦大位' },
    { id: 'puppet', label: '被權閹利用' },
  ],
  question: '皇叔瑞王有無覬覦大位之心？',
  opinions: { content: '瑞王耽於聲色，無他志', covet: '瑞王門下多亡命，與京營將領往來，其志不小', puppet: '瑞王懦弱，為宮中某人所挾' },

  setup(s, c) {
    c.actors = { prince: 'uncle' };
    c.data = { progress: c.branch === 'covet' ? 15 : 0, guards: 3000, appeased: 0, watched: 0, rebelled: 0, inCapital: 0, dead: 0 };
  },

  tick(s, c) {
    if (c.data.rebelled || c.data.inCapital || c.data.dead) {
      if (c.data.rebelled && !armiesOf(s, c.uid).length && !c.resolved) resolve(s, c, '瑞王兵敗身死，宗室之亂平定。', true);
      return;
    }
    const e = s.world.emperor;
    const noSon = !s.children.some((x) => x.son && x.alive);
    const eu = eunuchCase(s);
    if (c.branch === 'covet') {
      let d = 0.5;
      if (e.illness && e.illness.severity >= 2) d += 2;
      if (noSon && s.turn > 72) d += 1;
      if (eu && !eu.data.removed && eu.data.progress >= 30) d += 0.5;
      if (s.heir) d -= 1.2;
      if (s.turn < c.data.appeased) d = -0.5;
      c.data.progress = clamp(c.data.progress + d, 0, 100);
      if (c.data.progress >= 30) c.data.guards = Math.min(12000, c.data.guards * 1.01);
    } else if (c.branch === 'puppet') {
      c.data.progress = eu && !eu.data.removed ? eu.data.progress * 0.8 : 0;
      if (eu?.data.removed && !c.resolved && age(s, c) > 6) resolve(s, c, '權閹既倒，瑞王失其所恃，從此安分。', true);
    } else addUnrest(s, c.region, 0.2);

    if (c.branch === 'covet' && c.data.progress >= 100) {
      rise(s, c, e.illness ? '聞天子病篤' : '久蓄異志');
      return;
    }

    // 線索
    if (every(s, c, 7, 2)) {
      const g = `gov:${c.region}`;
      const d = cdoc(s, c, 'memorial', g, `${regionName(c.region)}巡撫奏瑞王府事`);
      const seen = noisy(s.rng, c.data.guards, 0.2);
      if (c.branch === 'content') core(d, `臣謹奏：瑞王府中歌舞無虛日，校尉強買民田，鄉民頗有怨言。護衛約${troops(seen)}。`, `瑞王府奢侈擾民，護衛約${troops(seen)}`, '巡撫說瑞王很奢侈，府裡的人欺壓百姓。');
      else core(d, `臣謹奏：瑞王府中近來賓客雜沓，護衛約${troops(seen)}。`, `瑞王府賓客雜沓，護衛約${troops(seen)}`, `巡撫說瑞王府最近來往的人很多，護衛約 ${Math.round(seen / 100) * 100} 人。（護衛人數的變化是線索）`);
      claim(d, `${c.uid}.guards`, '瑞王府護衛', seen, c.data.guards, { unit: '人', tol: 0.4, fmt: troops });
      if (c.branch === 'covet' && c.data.progress > 30 && chance(s.rng, 0.5)) clue(d, '又聞京營中有將官告假赴汴，私謁王府。', '京營將官私謁王府', { against: c.uid, plain: '有京營的將領請假跑去河南見瑞王。' });
      post(s, d);
    }
    if (every(s, c, 9, 5)) {
      if (c.branch === 'covet') rumor(s, c, '瑞王門下食客言：「天子年少多病，大位終當屬賢王。」', '瑞王門客言大位當屬賢王', '京城有傳言：瑞王的門客到處說「皇帝年輕又多病，皇位遲早是瑞王的」。');
      else if (c.branch === 'puppet') rumor(s, c, '有人見司禮監心腹夜入瑞王京邸。', '司禮監心腹夜入瑞王京邸', '有人看到九千歲的心腹晚上進出瑞王在京城的宅子。');
      else rumor(s, c, '瑞王新納歌姬十數人，又建花園於汴梁。', '瑞王新建花園', '瑞王又在蓋花園、納歌姬。');
    }
    if (every(s, c, 12, 8)) {
      const d = cdoc(s, c, 'memorial', 'uncle', '瑞王請增祿米');
      core(d, `臣${U(s).name}謹奏：臣府宗人日繁，祿米不敷，伏乞增歲祿二萬石。`, '瑞王請增祿米二萬石', '皇叔要求增加俸祿。');
      request(d, { kind: 'uncle:stipend', region: c.region, caseId: c.uid, desc: '增瑞王祿米', yes: '每旬多支約 0.5 萬；瑞王滿意（覬覦略緩）。太后欣慰。', no: '駁回：瑞王不悅。' });
      post(s, d);
    }
  },

  options(s, c) {
    if (c.data.rebelled || c.data.inCapital || c.data.dead) return [];
    const o = [
      { kind: 'uncle:gift', label: '厚賜安撫', desc: '內帑十萬賞賜瑞王：六旬內覬覦之心暫歇；太后欣慰。', silver: 0 },
      { kind: 'uncle:guards', label: '削減王府護衛', desc: '護衛減半；太后不悅。若他真有異心，會更急。' },
      { kind: 'uncle:summon', label: '召瑞王入京', desc: `把他留在京師、放在眼皮底下。勝算「${oddsText(summonOdds(s, c))}」：若他真有異心，可能抗旨起兵。` },
      { kind: 'uncle:death', label: '賜瑞王自盡', desc: '永絕後患。需要太后首肯，否則朝望大降；若他其實安分，便是冤殺骨肉。' },
    ];
    if (s.world.dongchang === 'crown' && !c.data.watched) o.push({ kind: 'uncle:watch', label: '東廠監視王府', desc: '每三旬一份確實的王府動靜；曝光則宗室群起不滿。' });
    return o;
  },

  onOrder(s, c, o) {
    switch (o.kind) {
      case 'uncle:stipend':
        flow(s, '宗祿', '增瑞王祿米', { silver: -5 });
        c.data.progress = Math.max(0, c.data.progress - 8);
        s.world.dowager = clamp(s.world.dowager + 5, 0, 100);
        return true;
      case 'uncle:gift':
        flow(s, '宗祿', '厚賜瑞王', { privy: -10 });
        c.data.appeased = s.turn + 6;
        c.data.progress = Math.max(0, c.data.progress - 15);
        s.world.dowager = clamp(s.world.dowager + 5, 0, 100);
        return true;
      case 'uncle:guards':
        c.data.guards *= 0.5;
        s.world.dowager = clamp(s.world.dowager - 10, 0, 100);
        if (c.branch === 'covet') c.data.progress += 10;
        event(s, c.uid, '削瑞王府護衛之半。');
        return true;
      case 'uncle:watch':
        c.data.watched = 1;
        return true;
      case 'uncle:summon': {
        const ok = chance(s.rng, summonOdds(s, c));
        const d = local(draft('notice', 'rites', 'jingshi', c.uid, ok ? '瑞王奉詔入京' : '瑞王抗旨'), s);
        d.free = true;
        d.lot = { tier: 0, ok, label: ok ? '上籤' : '下下籤' };
        d.highlight = ok ? '宗室入覲' : '宗室生變';
        if (ok) {
          c.data.inCapital = 1;
          core(d, '瑞王奉詔入京，居於十王府，出入有內官隨侍。', '瑞王入京', '瑞王乖乖來了：從此住在京城，翻不了天。');
          post(s, d);
          resolve(s, c, '召瑞王入京，置之左右，宗室之患遂息。', true);
        } else {
          core(d, '瑞王接詔不拜，閉城自守，旬日之間，傳檄起兵。', '瑞王抗旨', '瑞王抗旨了——他真的有異心，現在就要起兵。');
          post(s, d);
          rise(s, c, '抗旨');
        }
        return true;
      }
      case 'uncle:death': {
        if (s.world.dowager < 60) {
          addPrestige(s, -20);
          s.world.dowager = clamp(s.world.dowager - 20, 0, 100);
        } else addPrestige(s, -6);
        addGrievance(s, 'qing', 10);
        c.data.dead = 1;
        U(s).status = 'dead';
        if (c.branch === 'content') {
          s.world.wrongful.push('瑞王（安分無他志，被賜死）');
          resolve(s, c, '賜死無辜之瑞王，宗室寒心。', false);
        } else resolve(s, c, '賜瑞王自盡，宗室之患遂絕。', true);
        return true;
      }
    }
    return false;
  },

  investigate(s, c, d, mode) {
    if (mode.spy && s.world.dongchang !== 'crown' && c.branch === 'puppet') {
      clue(d, '番子回報：瑞王安分守己。', '東廠稱瑞王安分（東廠在權閹手中）');
      return;
    }
    if (c.branch === 'covet') clue(d, `王府私蓄甲士，實數約${troops(c.data.guards)}；京營將官多有往還。`, `王府私蓄甲士約${troops(c.data.guards)}，交通京營`, { against: c.uid, plain: '王府私下養兵，還跟京營將領往來。' });
    else if (c.branch === 'puppet') clue(d, '司禮監心腹常居王府，王事事聽之。', '王府事事聽司禮監心腹', { plain: '九千歲的人常住在王府，瑞王什麼都聽他的。' });
    else clue(d, '王終日歌舞遊獵，府中並無兵甲。', '王府並無兵甲', { plain: '瑞王只顧玩樂，沒有私兵。' });
  },

  guilty: (_s, c) => (c.branch === 'covet' && !c.data.dead ? ['uncle'] : []),

  score(s, c) {
    let p: number;
    if (c.branch === 'content') p = c.data.dead ? 0 : 20;
    else if (c.data.inCapital || (c.data.dead && c.branch === 'covet')) p = 20;
    else if (c.data.rebelled) p = c.resolved ? 10 : 2;
    else p = c.data.progress < 50 ? 14 : 6;
    return { points: p, outcome: `局終時瑞王${c.data.dead ? '已死' : c.data.inCapital ? '在京' : c.data.rebelled ? '已反' : '仍在藩'}。` };
  },

  truth(s, c) {
    return c.branch === 'covet' ? `瑞王${U(s).name}覬覦大位，私蓄甲士，交通京營。` : c.branch === 'puppet' ? `瑞王${U(s).name}懦弱，為權閹所挾，欲立為傀儡。` : `瑞王${U(s).name}並無異志，只是奢侈擾民。`;
  },
};

/** 東廠監視：每三旬一份確報 */
export function watchReport(s: GameState): void {
  const c = uncleCase(s);
  if (!c || !c.data.watched || c.data.rebelled || c.data.dead || c.data.inCapital || s.turn % 3 !== 0) return;
  const d = local(draft('secret', 'dongchang', 'jingshi', c.uid, '〔確〕東廠密報・瑞王府'), s);
  d.certified = true;
  d.free = true;
  const st = c.branch === 'covet' ? (c.data.progress >= 60 ? '日夜部署，似將有變' : '結交朝臣、京營將官') : c.branch === 'puppet' ? '一切聽司禮監心腹' : '耽於聲色，並無他志';
  core(d, `〔確〕番子回報：瑞王${st}；府中甲士${troops(c.data.guards)}。`, `瑞王${st}`, `東廠的確實報告：瑞王「${st}」，私兵約 ${Math.round(c.data.guards / 100) * 100} 人。`);
  claim(d, `${c.uid}.guards`, '瑞王府護衛', c.data.guards, c.data.guards, { unit: '人', fmt: troops });
  post(s, d);
}

export { regionName };
