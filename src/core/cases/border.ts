// 疑案：邊將疑雲。忠勇實邊／虛冒軍餉／擁兵通敵；忠將可能遭監軍誣陷。

import { cn, shortDate } from '../calendar';
import { advise, claim, clue, core, fluff, post, request } from '../docs';
import { REGIONS, regionName } from '../geography';
import type { CaseState, GameState } from '../types';
import { addPrestige, clamp, event, flow, gov, makeChar, replaceChar, silver, troops } from '../util';
import { regionDefense, spawnArmy, armiesOf } from '../war';
import { age, cdoc, chance, every, int, noisy, range, resolve, rumor } from './common';
import type { CaseDef } from './types';

const honest = (s: GameState, c: CaseState) => gov(s, c.region).term > 1 || c.branch === 'loyal';

function claimedEnemy(s: GameState, c: CaseState): number {
  const e = c.data.enemy;
  if (honest(s, c)) return noisy(s.rng, e, 0.15);
  return c.branch === 'greedy' ? e * range(s.rng, 3, 4.5) : e * range(s.rng, 1.4, 1.8);
}

function rebel(s: GameState, c: CaseState, why: string): void {
  const w = s.world;
  const r = w.regions[c.region];
  let size = r.garrison + c.data.enemy * 0.8;
  for (const d of w.detachments) {
    if (d.region === c.region && !d.returned && d.arriveTurn <= s.turn) {
      size += d.troops;
      d.troops = 0;
      d.returned = true;
    }
  }
  r.garrison = 0;
  c.data.rebelled = 1;
  c.data.lost = 1;
  gov(s, c.region).status = 'rebel';
  spawnArmy(s, { caseId: c.uid, label: `${regionName(c.region)}叛軍`, side: 'rebel', size, region: c.region, path: REGIONS[c.region].toCapital, moveIn: 2 });
  event(s, c.uid, `${REGIONS[c.region].gov}${gov(s, c.region).name}${why}，舉鎮叛降，引虜騎合兵${troops(size)}。`, true);
  const next = REGIONS[c.region].toCapital[0];
  const d = cdoc(s, c, 'memorial', 'court', `飛報：${regionName(c.region)}變起`);
  d.region = next === 'jingshi' ? 'jingshi' : next;
  d.fromLabel = next === 'jingshi' ? '兵部' : REGIONS[next].gov;
  d.urgent = true;
  core(
    d,
    `飛報：${regionName(c.region)}總兵${gov(s, c.region).name}叛降虜酋，開關延敵，合兵號稱${troops(size * 1.5)}，前鋒已出塞南下！`,
    `${regionName(c.region)}總兵叛降，合兵號稱${troops(size * 1.5)}南下`,
    `緊急軍情：${regionName(c.region)}的總兵投降了敵人，帶兵往京城方向打過來。應立刻加強沿路與京師的守備。`,
  );
  post(s, d);
}

function generalReport(s: GameState, c: CaseState): void {
  const r = s.rng;
  const g = gov(s, c.region);
  const h = honest(s, c);
  const region = s.world.regions[c.region];
  const d = cdoc(s, c, 'memorial', g.id, `${regionName(c.region)}總兵塘報`);
  const enemy = claimedEnemy(s, c);
  const shownGarrison = h ? noisy(r, region.garrison, 0.05) : c.branch === 'greedy' ? c.data.rosters : noisy(r, region.garrison, 0.05);
  core(
    d,
    `臣${g.name}謹奏：${shortDate(s.turn)}以來，虜酋所部約${troops(enemy)}，出沒邊外。臣所部見兵${troops(shownGarrison)}，各堡謹守。`,
    `虜騎約${troops(enemy)}，見兵${troops(shownGarrison)}`,
    `總兵報告：塞外敵騎大約 ${Math.round(enemy / 1000)} 千，我方在營士兵約 ${Math.round(shownGarrison / 1000)} 千人。`,
  );
  claim(d, `${c.uid}.enemy`, '虜騎', enemy, c.data.enemy, { unit: '騎', tol: 0.3, fmt: troops });
  claim(d, `${c.uid}.garrison`, '實兵', shownGarrison, region.garrison, { unit: '人', tol: 0.15, fmt: troops });

  if (!h && chance(r, 0.4)) {
    const heads = int(r, 150, 450);
    core(d, `前者虜騎犯堡，臣親督將士血戰，斬首${cn(heads)}級。`, `報斬首${cn(heads)}`, `總兵說打了勝仗，殺敵 ${heads} 人。`);
    claim(d, `${c.uid}.heads`, '斬首', heads, c.data.lastHeads || 0, { unit: '級' });
  } else if (c.data.lastRaidTurn && s.turn - c.data.lastRaidTurn <= 2) {
    const won = c.data.lastRaidWon === 1;
    core(d, won ? `前者虜騎犯堡，守軍擊退之，斬首${cn(c.data.lastHeads)}級。` : '前者虜騎犯堡，守軍小挫，損兵千餘。', won ? '擊退擾邊虜騎' : '守軍小挫，損兵千餘');
  } else fluff(d, '邊外雪深草枯，虜騎暫未大舉，臣不敢稍懈。', '邊境暫時平靜。');

  if (g.term === 1) {
    if (c.branch === 'greedy' && chance(r, 0.4))
      clue(d, '又臣新募家丁一千二百名，俱已造冊報部，月糧尚無著落，併乞敕部照數給發。', '另稱新募家丁千二百，乞給月糧', { against: c.uid, plain: '他又說新招了一千二百人，要朝廷另外發糧。（新兵是否真有其人？）' });
    if (c.branch === 'traitor' && chance(r, 0.4))
      clue(d, '近有虜使款關，言願議互市，臣已暫令羈留邊外，聽候朝命。', '虜使款關求互市，已暫羈留', { against: c.uid, plain: '他提到敵方派使者來談貿易，他先把人留在邊外。（總兵私下與敵方接觸？）' });
    if (c.branch === 'traitor' && chance(r, 0.25))
      clue(d, '臣營中將士多臣家丁舊部，頗知用命，可保無虞。', '營中多總兵家丁舊部', { against: c.uid, plain: '他說軍中多是他的私人部屬，只聽他的。' });
    if (c.branch === 'loyal' && chance(r, 0.3)) clue(d, '臣已捐俸三千兩，犒賞守堡士卒，以安眾心。', '總兵自捐俸銀犒軍', { plain: '總兵自掏腰包犒賞士兵。' });
    if (chance(r, c.branch === 'loyal' ? 0.3 : 0.12)) clue(d, '臣所部冊實相符，聖明如有疑慮，可遣員點驗。', '自稱冊實相符，請遣員點驗', { plain: '他說兵員名冊和實際人數相符，歡迎派人來查。' });
  }

  const warn = c.branch === 'loyal' && !c.data.raidDone && s.turn >= c.data.bigRaid - 4;
  const cry = !h && c.branch === 'greedy' && chance(r, 0.35);
  if (warn || cry) {
    const size = warn ? noisy(r, c.data.enemy * 1.45, 0.15) : c.data.enemy * range(r, 4, 6);
    core(d, `近據夜不收哨探，虜酋聚眾約${troops(size)}，秋高馬肥，恐將大舉。`, `哨探稱虜酋聚眾${troops(size)}，恐將大舉`, `偵察兵回報：敵人集結約 ${Math.round(size / 1000)} 千騎，可能要大舉進攻。（夜不收＝邊境偵察兵）`);
    claim(d, `${c.uid}.raid`, '虜酋聚眾', size, warn ? c.data.enemy * 1.45 : c.data.enemy, { unit: '騎', tol: 0.35, fmt: troops });
  }

  const ask = g.term > 1 ? (age(s, c) % 8 === 0 ? 20 : 0) : c.branch === 'loyal' ? (warn ? 30 : age(s, c) % 8 === 4 ? 20 : 0) : c.branch === 'greedy' ? (age(s, c) % 4 === 0 || chance(r, 0.25) ? int(r, 3, 4) * 10 : 0) : age(s, c) % 6 === 4 ? 30 : 0;
  if (ask > 0) {
    core(d, `伏乞發帑銀${silver(ask)}，以為${c.branch === 'traitor' && g.term === 1 ? '修築城堡、打造器械' : '補給月糧、修整器械'}之用。`, `請銀${silver(ask)}`);
    const legit = honest(s, c);
    request(d, {
      kind: 'funds',
      region: c.region,
      amount: ask,
      caseId: c.uid,
      desc: `發帑銀${silver(ask)}予${regionName(c.region)}`,
      yes: `國庫 −${ask} 萬兩，送到後交總兵支用。若總兵可靠，邊軍士氣上升；若不可靠，銀子可能被吞沒或被用來收買人心。`,
      no: '不撥款。若外患是真的，邊防可能吃緊。',
    });
    d.recommend = advise(s, legit, c.uid);
  }
  post(s, d);
}

function jianjunReport(s: GameState, c: CaseState): void {
  const r = s.rng;
  const j = s.chars[c.actors.jianjun];
  const g = gov(s, c.region);
  const garrison = s.world.regions[c.region].garrison;
  const d = cdoc(s, c, 'secret', j.id, `${regionName(c.region)}監軍密奏`);
  if (c.flags.slander && g.term === 1) {
    const e = noisy(r, c.data.enemy, 0.4);
    core(d, `奴婢謹奏：虜騎約${troops(e)}。`, `監軍稱虜騎約${troops(e)}`);
    core(d, `總兵${g.name}驕恣不法，聞與虜酋書信往來，恐有異志，伏乞聖明早為之計。`, '監軍劾總兵與虜酋書信往來，恐有異志', `監軍（朝廷派去監督軍隊的太監）告發總兵和敵人有書信來往，可能要造反。`);
    claim(d, `${c.uid}.contact`, '總兵私通虜酋', '有', '無');
  } else if (c.flags.bribed && g.term === 1) {
    core(d, `奴婢謹奏：邊境寧謐，總兵${g.name}調度有方，將士用命。`, '監軍稱邊境寧謐，總兵調度有方', '監軍說邊境平靜，總兵很能幹。');
    claim(d, `${c.uid}.contact`, '總兵私通虜酋', '無', '有');
  } else {
    const seen = noisy(r, garrison, 0.1);
    const e = noisy(r, c.data.enemy, 0.25);
    core(d, `奴婢謹奏：邊外虜騎約${troops(e)}。`, `監軍稱虜騎約${troops(e)}`, `監軍估計敵騎約 ${Math.round(e / 1000)} 千。`);
    claim(d, `${c.uid}.enemy`, '虜騎', e, c.data.enemy, { unit: '騎', tol: 0.3, fmt: troops });
    if (g.term === 1 && c.branch === 'greedy')
      clue(d, `奴婢親赴各堡點閱，冊額${troops(c.data.rosters)}，實兵不過${troops(seen)}，多有虛名冒餉。`, `監軍點閱實兵僅${troops(seen)}，疑有冒餉`, { against: c.uid, plain: `監軍親自去點名：名冊上 ${Math.round(c.data.rosters / 1000)} 千人，實際只有約 ${Math.round(seen / 1000)} 千。多出來的是假名字，用來多領軍餉（冒餉）。` });
    else core(d, `奴婢點閱各堡，實兵約${troops(seen)}。`, `監軍點閱實兵約${troops(seen)}`);
    claim(d, `${c.uid}.garrison`, '實兵', seen, garrison, { unit: '人', tol: 0.15, fmt: troops });
    if (g.term === 1 && c.branch === 'traitor' && chance(r, 0.6)) {
      clue(d, `總兵${g.name}屢遣家丁出塞，夜歸不報，所為何事，奴婢未得其詳。`, '總兵屢遣家丁私出塞外', { against: c.uid, plain: '總兵常派親信偷偷出塞，晚上回來也不報告，不知道在做什麼。' });
    }
  }
  post(s, d);
}

function recall(s: GameState, c: CaseState): void {
  const g = gov(s, c.region);
  c.data.recall += 1;
  if (honest(s, c) || c.branch === 'greedy') {
    const delay = c.branch === 'greedy' && g.term === 1 ? 1 : 0;
    c.data.awayUntil = s.turn + 4 + delay;
    g.status = 'away';
    event(s, c.uid, delay ? `總兵${g.name}奉詔後遷延一旬，藏匿帳冊，方啟程入京。` : `總兵${g.name}奉詔即日啟程入京。`);
    const d = cdoc(s, c, 'audience', g.id, `${regionName(c.region)}總兵陛見奏對`);
    d.arriveTurn = s.turn + 2 + delay;
    d.region = 'jingshi';
    d.free = true;
    if (honest(s, c)) {
      core(d, `總兵${g.name}伏地奏對：虜騎實有${troops(noisy(s.rng, c.data.enemy, 0.1))}，臣所部實兵${troops(s.world.regions[c.region].garrison)}。餉缺則軍心浮動，臣但求糧餉接濟，不敢有他。`, '總兵奏對坦率，所陳兵數與哨報相近', '總兵直接報出兵數，跟其他來源大致一致。');
      clue(d, '問以邊務細節，總兵對答如流，各堡兵數、器械皆有簿冊可稽。', '總兵對答如流，簿冊可稽', { plain: '問他細節，他都答得出來，也有紀錄可查。' });
    } else {
      core(d, `總兵${g.name}伏地奏對：虜勢甚張，非增餉不可。臣所部${troops(c.data.rosters)}，日夜枕戈。`, `總兵力陳虜勢甚張，所部${troops(c.data.rosters)}`, '總兵一直強調敵人很強、需要加錢。');
      clue(d, '問以各堡實兵細數，總兵言語支吾，但稱「容臣回鎮查明具奏」。', '問各堡細數，總兵支吾', { against: c.uid, plain: '問他每個堡壘實際有多少兵，他答不出來，只說回去查。' });
    }
    post(s, d);
  } else {
    c.data.plot += 10;
    if (c.data.recall >= 2) return rebel(s, c, '再奉召詔，自知事洩');
    event(s, c.uid, `總兵${g.name}奉召不至，託言虜騎壓境，暗中加緊佈置。`, true);
    const d = cdoc(s, c, 'memorial', g.id, `${regionName(c.region)}總兵辭召疏`);
    core(d, `臣${g.name}奉詔入覲，本當星夜就道。奈虜騎壓境，臣一離鎮，各堡必潰，不敢以一身之榮，誤封疆之重。伏乞收回成命。`, '辭召：虜騎壓境，不敢離鎮', '總兵拒絕進京，理由是敵人壓境、他走不開。');
    clue(d, '且臣之部曲，非臣不能約束，倘易他將，恐生變故。', '稱部曲非總兵不能約束，易將恐生變', { against: c.uid, plain: '他暗示：如果換掉他，軍隊可能會出事。（這是威脅嗎？）' });
    post(s, d);
  }
}

function arrest(s: GameState, c: CaseState): void {
  const w = s.world;
  const g = gov(s, c.region);
  const old = g.name;
  if (g.term === 1 && c.branch === 'traitor') {
    const p = clamp(1.25 - c.data.plot / 100, 0.2, 0.9) * (c.flags.bribed ? 0.75 : 1);
    if (!chance(s.rng, p)) return rebel(s, c, '聞拿問之旨');
    event(s, c.uid, `緹騎至${regionName(c.region)}，副將奉詔擒總兵${old}，搜得與虜酋往來書信。`, true);
    resolve(s, c, `叛謀未發，總兵${old}伏法。`, true);
  } else if (g.term === 1 && c.branch === 'greedy') {
    const back = c.data.embezzled * 0.6;
    flow(s, '抄沒', `抄沒總兵${old}`, { silver: back });
    event(s, c.uid, `總兵${old}被拿問，抄沒贓銀約${silver(back)}。`, true);
    resolve(s, c, `貪將${old}伏法，追回贓銀${silver(back)}。`, true);
  } else {
    w.wrongful.push(`${regionName(c.region)}總兵${old}`);
    w.regions[c.region].morale = 0.55;
    addPrestige(s, -3);
    c.data.wrong = 1;
    event(s, c.uid, `忠勇之將${old}無罪被逮，邊軍寒心。`, true);
  }
  const oldRosters = c.data.rosters;
  replaceChar(s, g.id);
  c.data.rosters = w.regions[c.region].garrison;
  c.data.plot = 0;
  const d = cdoc(s, c, 'memorial', g.id, `新任${regionName(c.region)}總兵到任點驗疏`);
  core(d, `臣${g.name}謹奏：臣到任點驗，實兵${troops(w.regions[c.region].garrison)}。`, `新任總兵點驗實兵${troops(w.regions[c.region].garrison)}`);
  if (c.branch === 'greedy') clue(d, `查前任冊額${troops(oldRosters)}，虛冒甚多。`, '查得前任虛冒兵額', { plain: '新總兵查出前任謊報兵額、冒領軍餉。' });
  else if (c.branch === 'traitor') clue(d, '查前任密室，得虜酋往來書信數封，謀逆有據。', '查得前任通虜書信', { plain: '新總兵找到前任和敵人來往的信，證實他要造反。' });
  else clue(d, '前任治軍嚴整，所謂通虜之說，查無實據。將士頗為前任不平。', '前任治軍嚴整，通虜之說查無實據', { plain: '新總兵說前任治軍很好，通敵的指控查無實據。你可能抓錯人了。' });
  post(s, d);
}

export const border: CaseDef = {
  id: 'border',
  name: '邊將疑雲',
  regions: ['liaodong', 'xuanda', 'gansu'],
  branches: [
    { id: 'loyal', label: '忠勇實邊' },
    { id: 'greedy', label: '虛冒軍餉' },
    { id: 'traitor', label: '擁兵通敵' },
  ],
  question: '這位邊將是哪一種人？',
  opinions: {
    loyal: '此將似屬可用，所請或可量予',
    greedy: '其冊籍恐有虛冒，宜加覆核',
    traitor: '此將擁兵日久，宜防其變',
  },

  setup(s, c) {
    const g = gov(s, c.region);
    g.integrity = c.branch === 'loyal' ? 0.85 : c.branch === 'greedy' ? 0.2 : 0.4;
    const j = makeChar(s, `jianjun:${c.uid}`, `${regionName(c.region)}監軍`, c.region, 'eunuch', 2);
    c.actors = { general: g.id, jianjun: j.id };
    const base = REGIONS[c.region].garrison;
    c.data = {
      enemy: c.branch === 'loyal' ? 26000 : c.branch === 'greedy' ? 8000 : 20000,
      rosters: base,
      embezzled: 0,
      funds: 0,
      plot: c.branch === 'traitor' ? 25 : 0,
      bigRaid: c.startTurn + int(s.rng, 8, 12),
      raidDone: 0,
      held: 0,
      recall: 0,
      awayUntil: 0,
      rebelled: 0,
      lost: 0,
      wrong: 0,
      lastRaidTurn: 0,
      lastRaidWon: 0,
      lastHeads: 0,
    };
    if (c.branch === 'greedy') s.world.regions[c.region].garrison = Math.round(base * 0.65);
    c.flags.slander = c.branch !== 'traitor' && chance(s.rng, 0.5);
    c.flags.bribed = c.branch === 'traitor' && chance(s.rng, 0.5);
  },

  tick(s, c) {
    const w = s.world;
    const g = gov(s, c.region);
    if (c.data.lost) {
      if (!armiesOf(s, c.uid).length) resolve(s, c, c.data.rebelled ? '叛軍終被剿滅。' : '入寇之虜飽掠而去。', !!c.data.rebelled);
      return;
    }
    if (g.status === 'away' && s.turn >= c.data.awayUntil) g.status = 'active';
    if (c.branch === 'loyal') c.data.enemy += 700;
    if (c.branch === 'greedy' && g.term === 1) w.regions[c.region].morale = clamp(w.regions[c.region].morale - 0.01, 0.3, 1.2);

    if (c.branch === 'traitor' && g.term === 1) {
      c.data.plot += 4;
      if (c.data.plot >= 100) return rebel(s, c, '經營既久，羽翼已成');
    }

    if (c.branch === 'loyal' && !c.data.raidDone && s.turn >= c.data.bigRaid) {
      c.data.raidDone = 1;
      const strength = c.data.enemy * 1.45 * range(s.rng, 0.95, 1.05);
      const def = regionDefense(s, c.region) * (s.turn < c.data.awayUntil ? 0.6 : 1);
      if (def >= strength * 0.85) {
        c.data.held = 1;
        w.regions[c.region].garrison -= int(s.rng, 2000, 4000);
        event(s, c.uid, `虜酋率${troops(strength)}騎大舉入寇，${regionName(c.region)}守軍${troops(def)}力戰擊退。`, true);
        const d = cdoc(s, c, 'memorial', g.id, `${regionName(c.region)}大捷疏`);
        core(d, `臣${g.name}謹奏：虜酋糾眾${troops(strength)}大舉入犯，臣督將士死戰三晝夜，虜大敗遁去。`, `虜酋大舉入犯，守軍死戰擊退`, '敵人大舉進攻，被邊軍打退了。');
        post(s, d);
        resolve(s, c, `虜酋大舉入寇，邊將力戰退敵。`, !c.data.wrong);
      } else {
        c.data.lost = 1;
        w.regions[c.region].garrison = Math.round(w.regions[c.region].garrison * 0.3);
        spawnArmy(s, { caseId: c.uid, label: '入寇虜騎', side: 'invader', size: strength * 0.6, region: c.region, path: REGIONS[c.region].toCapital, moveIn: 2 });
        event(s, c.uid, `虜酋率${troops(strength)}騎大舉入寇，守軍僅${troops(def)}可戰，${regionName(c.region)}淪陷。`, true);
        const d = cdoc(s, c, 'memorial', g.id, `${regionName(c.region)}總兵請罪疏`);
        d.urgent = true;
        core(d, `臣${g.name}萬死：虜酋大舉入寇，眾寡不敵，城堡相繼失陷。乞速發援兵，並治臣之罪。`, `${regionName(c.region)}失陷，總兵請罪乞援`, '敵人大舉進攻，邊鎮守不住，城堡陸續被攻破了。');
        post(s, d);
      }
      return;
    }

    if (c.branch !== 'traitor' && chance(s.rng, c.branch === 'loyal' ? 0.35 : 0.2)) {
      const size = c.data.enemy * range(s.rng, 0.15, 0.35);
      const won = regionDefense(s, c.region) * 0.6 > size;
      w.regions[c.region].garrison -= won ? int(s.rng, 200, 600) : int(s.rng, 1000, 2000);
      c.data.lastRaidTurn = s.turn;
      c.data.lastRaidWon = won ? 1 : 0;
      c.data.lastHeads = won ? int(s.rng, 60, 180) : 0;
      event(s, c.uid, `虜騎約${troops(size)}擾邊，${won ? '守軍擊退' : '守軍小挫'}。`);
    }

    if (every(s, c, 2) && s.turn >= c.data.awayUntil) generalReport(s, c);
    if (every(s, c, 3, 1)) jianjunReport(s, c);
    if (every(s, c, 5, 3)) {
      let v = g.term > 1 ? 'loyal' : c.branch;
      if (chance(s.rng, 0.25)) v = ['loyal', 'greedy', 'traitor'][int(s.rng, 0, 2)];
      if (v === 'greedy') rumor(s, c, `${regionName(c.region)}總兵${g.name}家人在京購宅，值銀數萬。`, `${regionName(c.region)}總兵家人在京購宅`, '傳說這位總兵的家人在京城買了很貴的房子。');
      else if (v === 'traitor') rumor(s, c, `${regionName(c.region)}軍中只知有總兵，不知有朝廷。`, `${regionName(c.region)}軍中只知有總兵`, '傳說那邊的士兵只聽總兵的，不聽朝廷的。');
      else rumor(s, c, `${regionName(c.region)}將士苦寒，餉銀多有拖欠。`, `${regionName(c.region)}將士苦寒欠餉`, '傳說邊軍生活很苦，軍餉常常拖欠。');
    }
  },

  options(s, c) {
    if (c.data.lost) return [];
    return [{ kind: 'funds', label: '撥餉三十萬兩', silver: 30, desc: '直接撥銀給總兵。用在哪裡由總兵決定：可靠的人會用來提升士氣，不可靠的會吞掉或拿去收買人心。' }];
  },

  onOrder(s, c, o) {
    if (c.data.rebelled) return false;
    const g = gov(s, c.region);
    if (o.kind === 'funds') {
      const a = o.amount ?? 30;
      c.data.funds += a;
      if (honest(s, c)) {
        s.world.regions[c.region].morale = Math.min(1.2, s.world.regions[c.region].morale + a / 100);
        event(s, c.uid, `帑銀${silver(a)}到${regionName(c.region)}，散給將士，軍心稍振。`);
      } else if (c.branch === 'greedy') {
        c.data.embezzled += a * 0.8;
        event(s, c.uid, `帑銀${silver(a)}到${regionName(c.region)}，總兵侵吞約${silver(a * 0.8)}。`);
      } else {
        c.data.plot += a / 3;
        event(s, c.uid, `帑銀${silver(a)}到${regionName(c.region)}，總兵用以收買部曲、囤積器械。`);
      }
      return true;
    }
    if (o.kind === 'recall' && o.person === g.id) {
      recall(s, c);
      return true;
    }
    if (o.kind === 'arrest' && o.person === g.id) {
      arrest(s, c);
      return true;
    }
    return false;
  },

  investigate(s, c, d, mode) {
    const r = s.rng;
    const g = gov(s, c.region);
    const guilty = g.term === 1 && c.branch !== 'loyal';
    const garrison = s.world.regions[c.region].garrison;
    if (mode.bribed) {
      core(d, `${regionName(c.region)}各堡兵馬齊整，冊實相符，總兵${g.name}忠勤可嘉。`, '查稱冊實相符，總兵忠勤', '巡按說這位總兵沒有問題。');
      claim(d, `${c.uid}.garrison`, '實兵', c.data.rosters, garrison, { unit: '人', tol: 0.15, fmt: troops });
      return;
    }
    const seen = noisy(r, garrison, mode.spy ? 0.15 : 0.08);
    core(d, `點得${regionName(c.region)}實兵約${troops(seen)}，邊外虜騎約${troops(noisy(r, c.data.enemy, 0.25))}。`, `實兵約${troops(seen)}`, `查到實際兵力約 ${Math.round(seen / 1000)} 千人。`);
    claim(d, `${c.uid}.garrison`, '實兵', seen, garrison, { unit: '人', tol: 0.15, fmt: troops });
    if (guilty && c.branch === 'greedy' && (chance(r, 0.75) || !mode.spy))
      clue(d, `冊額${troops(c.data.rosters)}，實兵遠不及數，空餉盡入總兵私囊。`, '冊多虛名，空餉入總兵私囊', { against: c.uid, plain: '名冊上的人數遠多於實際人數，多領的軍餉進了總兵口袋。' });
    if (guilty && c.branch === 'traitor' && (chance(r, 0.75) || !mode.spy))
      clue(d, '總兵家丁夜出塞外，與虜酋使者往還，形跡可疑。', '總兵家丁與虜使往還', { against: c.uid, plain: '總兵的親信晚上偷偷出塞，跟敵方使者見面。' });
    if (!guilty && chance(r, 0.6)) clue(d, '將士用命，冊實大致相符，未見通虜形跡。', '將士用命，未見通虜形跡', { plain: '士兵用心，名冊和實際相符，沒看到通敵的跡象。' });
    if (mode.fabricate && !guilty) {
      core(d, `訪得總兵${g.name}私受虜酋金帛，陰懷二心。`, '訪得總兵私受虜酋金帛', '密探說總兵收了敵人的財物、心懷二意。');
      claim(d, `${c.uid}.contact`, '總兵私通虜酋', '有', '無');
    }
  },

  bribe: (s, c) => (gov(s, c.region).term === 1 && c.branch !== 'loyal' ? (c.branch === 'greedy' ? 0.45 : 0.3) : 0),

  guilty(s, c) {
    const g = gov(s, c.region);
    return g.term === 1 && c.branch !== 'loyal' && !c.data.rebelled ? [g.id] : [];
  },

  score(s, c) {
    const g = gov(s, c.region);
    let p = 0;
    let out = '';
    if (c.branch === 'loyal') {
      if (!c.data.lost) p += 12;
      if (!c.data.wrong) p += 8;
      out = c.data.lost ? '虜酋大舉入寇，邊鎮失陷。' : c.data.held ? '虜酋大舉入寇，邊鎮守住了。' : '大戰尚未發生。';
    } else if (c.branch === 'greedy') {
      p += g.term > 1 ? 14 : c.data.funds <= 40 ? 10 : 3;
      if (!c.data.lost) p += 6;
      out = `共撥餉${silver(c.data.funds)}，約${silver(c.data.embezzled)}入了總兵私囊。${g.term > 1 ? '貪將已被拿問。' : '貪將安然在任。'}`;
    } else {
      if (c.resolved?.good && !c.data.rebelled) p = 20;
      else if (c.data.rebelled) p = armiesOf(s, c.uid).length ? 3 : 10;
      out = c.data.rebelled ? `總兵叛變，${armiesOf(s, c.uid).length ? '叛軍未平' : '叛軍終被剿滅'}。` : g.term > 1 ? '叛謀未發，總兵已被拿下。' : '總兵叛謀尚未發動。';
    }
    return { points: p, outcome: out };
  },

  truth(s, c) {
    const name = s.chars[c.actors.general].term === 1 ? s.chars[c.actors.general].name : '原任總兵';
    const base =
      c.branch === 'loyal'
        ? `總兵${name}忠勇實邊，虜患屬實。`
        : c.branch === 'greedy'
          ? `總兵${name}虛冒軍餉：冊額${troops(c.data.rosters)}，實兵僅六成，虜勢被誇大三四倍。`
          : `總兵${name}擁兵自重，私通虜酋，陰謀叛降。`;
    return base + (c.flags.slander ? '監軍與總兵有隙，屢奏誣陷其通虜。' : c.flags.bribed ? '監軍已被總兵收買，替其遮掩。' : '');
  },
};

