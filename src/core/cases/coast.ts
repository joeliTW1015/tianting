// 疑案：海寇通番。真倭寇入犯／官紳走私、假報寇情／海禁過嚴、逼民為寇。

import { advise, claim, clue, core, post, request } from '../docs';
import { regionName } from '../geography';
import type { CaseState, GameState } from '../types';
import { addPrestige, addUnrest, event, flow, gov, replaceChar, troops } from '../util';
import { armiesOf, armySize, spawnArmy } from '../war';
import { age, cdoc, chance, every, noisy, resolve, rumor } from './common';
import type { CaseDef, CaseOption } from './types';

function govReport(s: GameState, c: CaseState): void {
  const g = gov(s, c.region);
  const real = armySize(s, c.uid);
  const d = cdoc(s, c, 'memorial', g.id, `${regionName(c.region)}巡撫奏報海防`);
  const claimed = c.branch === 'smuggle' && g.term === 1 ? Math.max(real, 2000) * 6 : noisy(s.rng, real, 0.2);
  core(d, `臣${g.name}謹奏：近有海寇約${troops(claimed)}，駕船數百，出沒沿海，劫掠村鎮。`, `海寇約${troops(claimed)}出沒沿海`, `巡撫說：海盜大約 ${Math.round(claimed / 1000)} 千人，駕著幾百艘船在沿海搶劫。`);
  claim(d, `${c.uid}.pirates`, '海寇', claimed, real, { unit: '人', tol: 0.5, fmt: troops });
  if (c.branch === 'banned' && chance(s.rng, 0.45)) clue(d, '臣已嚴申海禁，片板不許下海，違者梟首。然寇勢猶熾，殊不可解。', '已嚴申海禁片板不許下海，寇勢猶熾', { plain: '巡撫說他已經禁止任何船出海、違者斬首，但海盜反而越來越多，他想不通。（會不會正是禁海逼得漁民沒飯吃？）' });
  if (c.branch === 'smuggle' && g.term === 1 && chance(s.rng, 0.35)) clue(d, '寇船來去無常，官兵追之則遁，莫測其巢穴。', '寇船來去無常，莫測其巢', { against: c.uid, plain: '他說海盜來無影去無蹤，找不到據點。（真的有那麼多海盜嗎？）' });
  if (c.branch === 'wokou' && chance(s.rng, 0.4)) clue(d, '所獲寇首，語言不通，髡頭跣足，皆異域之人。', '所獲寇首皆異域之人', { plain: '抓到的海盜頭目語言不通、剃頭赤腳，都是外國人。（是真正的外來海盜）' });
  core(d, '伏乞發帑銀二十五萬兩，增造戰船，召募水兵。', '乞發水師餉二十五萬兩');
  request(d, { kind: 'navy', region: c.region, amount: 25, caseId: c.uid, desc: `發水師餉二十五萬兩予${regionName(c.region)}`, yes: '國庫 −25 萬兩，增建水師。若海寇是真的，可以有效防禦；若是假報，錢會被吞掉。', no: '不撥款。' });
  d.recommend = advise(s, c.branch !== 'smuggle', c.uid);
  post(s, d);
}

export const coast: CaseDef = {
  id: 'coast',
  name: '海寇通番',
  regions: ['fujian', 'zhejiang', 'liangguang'],
  branches: [
    { id: 'wokou', label: '倭寇入犯' },
    { id: 'smuggle', label: '官紳走私' },
    { id: 'banned', label: '禁海逼寇' },
  ],
  question: '沿海寇患的根源是什麼？',
  opinions: { wokou: '寇乃外夷，非剿不可', smuggle: '所謂寇情，恐係地方官紳通番走私，張大其詞', banned: '海禁太嚴，沿海小民失業，乃相聚為寇' },

  setup(s, c) {
    const g = gov(s, c.region);
    g.integrity = c.branch === 'smuggle' ? 0.25 : 0.7;
    c.actors = { governor: g.id };
    c.data = { navy: 0, funds: 0, crackdown: 0, opened: 0, amnesty: 0, embezzled: 0 };
  },

  tick(s, c) {
    if (age(s, c) === 0) {
      if (c.branch === 'wokou') spawnArmy(s, { caseId: c.uid, label: '倭寇', side: 'pirate', size: 4000, region: c.region, growth: 1.07 });
      if (c.branch === 'banned') spawnArmy(s, { caseId: c.uid, label: '海寇', side: 'pirate', size: 2500, region: c.region, growth: 1.06 });
    }
    if (c.branch === 'banned' && c.data.crackdown) for (const a of armiesOf(s, c.uid)) a.growth = 1.1;
    // 禁海逼寇：根源不除，剿滅了還會再起
    if (c.branch === 'banned' && !c.data.opened && !c.data.amnesty && !armiesOf(s, c.uid).length && age(s, c) % 6 === 0 && age(s, c) > 0) {
      spawnArmy(s, { caseId: c.uid, label: '海寇', side: 'pirate', size: 2000, region: c.region, growth: 1.06 });
      event(s, c.uid, '沿海失業漁民又相聚為寇。');
    }
    if (c.branch === 'wokou' && age(s, c) > 2 && !armiesOf(s, c.uid).length) return resolve(s, c, '倭寇被剿滅，沿海肅清。', true);
    if (c.branch === 'banned' && (c.data.opened || c.data.amnesty) && armySize(s, c.uid) < 1500 && age(s, c) > 2) return resolve(s, c, '海禁鬆弛，漁民復業，寇患自息。', true);
    if (c.branch === 'smuggle' && (c.data.opened || c.data.crackdown || gov(s, c.region).term > 1) && age(s, c) > 6) return resolve(s, c, '走私之弊得以整頓。', true);
    if (every(s, c, 3)) govReport(s, c);
    if (every(s, c, 5, 2)) {
      if (c.branch === 'smuggle') rumor(s, c, `${regionName(c.region)}外洋常泊番船，鄉紳家奴夜運絲貨出海，獲利十倍。`, '鄉紳家奴夜運絲貨出海', '傳說當地士紳派人晚上把絲綢運出海賣給外國船，賺很多錢。');
      else if (c.branch === 'banned') rumor(s, c, `${regionName(c.region)}漁民不得下海，衣食無著，多有投海寇者。`, '漁民不得下海，多投海寇', '傳說漁民被禁止出海，生活沒著落，很多人乾脆去當海盜。');
      else rumor(s, c, `倭寇犯${regionName(c.region)}，所過焚掠，人皆走避。`, `倭寇焚掠${regionName(c.region)}`, '傳說外國海盜在沿海燒殺搶掠。');
    }
  },

  options(s, c) {
    if (c.resolved) return [];
    const o: CaseOption[] = [
      { kind: 'crackdown', label: '嚴申海禁', desc: '嚴禁私自出海、查緝走私。若問題是官紳走私，可以壓下來；若是禁海逼民為寇，只會讓海寇更多。' },
      { kind: 'amnesty', label: '招撫海寇', silver: 15, desc: '給錢招安海寇。若海寇多是本地失業漁民，大多會散去；若是外來倭寇，他們拿了錢照搶。' },
    ];
    if (!c.data.opened) o.push({ kind: 'open', label: '開海通商', desc: '開放民間出海貿易，設市舶司收稅：之後每旬國庫 +3 萬兩；漁民有生計、走私變合法；但言官指責違背祖制，朝望 −3。對外來倭寇無效。' });
    return o;
  },

  onOrder(s, c, o) {
    const w = s.world;
    if (o.kind === 'navy') {
      const a = o.amount ?? 25;
      c.data.funds += a;
      if (c.branch === 'smuggle' && gov(s, c.region).term === 1) {
        c.data.embezzled += a * 0.8;
        event(s, c.uid, `水師餉銀${a}萬兩到，多入巡撫私囊。`);
      } else {
        w.regions[c.region].garrison += a * 120;
        event(s, c.uid, `水師餉銀${a}萬兩到，增造戰船、召募水兵約${troops(a * 120)}。`);
      }
      return true;
    }
    if (o.kind === 'crackdown') {
      c.data.crackdown = 1;
      addUnrest(s, c.region, 5);
      event(s, c.uid, c.branch === 'smuggle' ? '嚴申海禁，查獲通番鄉紳數家，所謂寇情頓減。' : c.branch === 'banned' ? '海禁愈嚴，沿海小民失業者愈眾，投寇者日多。' : '嚴申海禁，然倭寇自外而來，無補於事。', true);
      return true;
    }
    if (o.kind === 'amnesty') {
      c.data.amnesty = 1;
      for (const a of armiesOf(s, c.uid)) {
        if (c.branch === 'wokou') a.size *= 1.1;
        else a.size *= 0.2;
      }
      event(s, c.uid, c.branch === 'wokou' ? '招撫之銀為倭寇所得，寇勢反張。' : '海寇多本地漁民，受撫散去者十之八。', true);
      return true;
    }
    if (o.kind === 'open') {
      c.data.opened = 1;
      w.mods.seaTrade = true;
      addPrestige(s, -3);
      if (c.branch === 'banned') for (const a of armiesOf(s, c.uid)) a.size *= 0.3;
      if (c.branch === 'wokou') for (const a of armiesOf(s, c.uid)) a.size *= 1.05;
      event(s, c.uid, `開海通商之詔到${regionName(c.region)}。${c.branch === 'banned' ? '漁民復業，海寇解散大半。' : c.branch === 'smuggle' ? '走私化為正貿，市舶歲有所入。' : '然倭寇非為通商而來，劫掠如故。'}`, true);
      return true;
    }
    if (o.kind === 'arrest' && o.person === gov(s, c.region).id) {
      const old = gov(s, c.region).name;
      if (c.branch === 'smuggle') {
        flow(s, '抄沒', `抄沒巡撫${old}`, { silver: c.data.embezzled * 0.6 });
        event(s, c.uid, `通番巡撫${old}被逮。`, true);
      } else if (c.branch === 'banned') event(s, c.uid, `巡撫${old}被逮。其人過於嚴苛，激變海濱，然並未貪墨。`, true);
      else {
        w.wrongful.push(`${regionName(c.region)}巡撫${old}`);
        addPrestige(s, -2);
        event(s, c.uid, `力禦倭寇之巡撫${old}無罪被逮。`, true);
      }
      replaceChar(s, gov(s, c.region).id);
      return true;
    }
    return false;
  },

  investigate(s, c, d, mode) {
    const r = s.rng;
    const real = armySize(s, c.uid);
    if (mode.bribed) {
      core(d, '寇勢甚張，非增水師不可。', '查稱寇勢甚張', '巡按說海盜很多，必須增加水師。');
      claim(d, `${c.uid}.pirates`, '海寇', Math.max(real, 2000) * 5, real, { unit: '人', tol: 0.5, fmt: troops });
      return;
    }
    const seen = noisy(r, real, mode.spy ? 0.25 : 0.12);
    core(d, `訪得沿海寇眾約${troops(seen)}。`, `訪得寇眾約${troops(seen)}`, `查到海盜大約 ${Math.round(seen / 100) * 100} 人。`);
    claim(d, `${c.uid}.pirates`, '海寇', seen, real, { unit: '人', tol: 0.5, fmt: troops });
    if (chance(r, 0.75) || !mode.spy) {
      if (c.branch === 'smuggle') clue(d, '外洋番船常泊，巡撫家人與鄉紳合夥販運，所謂海寇，十九虛張。', '巡撫家人與鄉紳合夥走私', { against: c.uid, plain: '巡撫的家人和士紳合夥走私，所謂海寇大多是虛報的。' });
      if (c.branch === 'banned') clue(d, '寇眾多本地漁戶，言「不許下海，無以為生」。', '寇眾多本地漁戶，因禁海無以為生', { plain: '海盜多半是本地漁民，說「不准出海就沒法活」。' });
      if (c.branch === 'wokou') clue(d, '寇眾多異域之人，船堅器利，非沿海小民所能為。', '寇眾多異域之人', { plain: '海盜多是外國人，船和武器都很好，不是本地人搞得出來的。' });
    }
    if (mode.fabricate && c.branch !== 'smuggle') {
      core(d, `訪得巡撫${gov(s, c.region).name}與番商往來，暗通寇賊。`, '訪得巡撫暗通寇賊', '密探說巡撫私通海盜。');
      claim(d, `${c.uid}.smuggle`, '巡撫通番', '有', '無');
    }
  },

  bribe: (s, c) => (c.branch === 'smuggle' && gov(s, c.region).term === 1 ? 0.45 : 0),
  guilty: (s, c) => (c.branch === 'smuggle' && gov(s, c.region).term === 1 ? [gov(s, c.region).id] : []),

  score(s, c) {
    const left = armySize(s, c.uid);
    let p = 0;
    if (c.branch === 'wokou') p = left < 1500 ? 20 : left < 5000 ? 10 : 4;
    else if (c.branch === 'smuggle') p = (c.data.opened || c.data.crackdown || gov(s, c.region).term > 1 ? 16 : 4) + (c.data.funds <= 25 ? 4 : 0);
    else p = c.data.opened || c.data.amnesty ? 20 : left < 1500 ? 10 : 3;
    return { points: p, outcome: `局終時海寇約${troops(Math.max(left, 100))}；${c.data.opened ? '已開海通商。' : c.data.crackdown ? '海禁更嚴。' : ''}` };
  },

  truth(_s, c) {
    return c.branch === 'wokou'
      ? `${regionName(c.region)}倭寇是真，船堅器利，非剿不可。`
      : c.branch === 'smuggle'
        ? `${regionName(c.region)}巡撫與鄉紳合夥通番走私，誇大寇情以請餉。`
        : `${regionName(c.region)}海禁過嚴，漁民失業，相聚為寇；越禁越多。`;
  },
};
