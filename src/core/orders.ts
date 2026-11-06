// 旨意送達後的處置：先交給疑案，疑案不處理的再走通用處置。

import { caseOrder, CASE_DEFS } from './cases';
import { claim, clue, core, draft, fluff, post, shoufuBias } from './docs';
import { REGIONS, regionName, travelTurns } from './geography';
import { routineArrive } from './routine';
import { amnesty, banSect } from './unrest';
import { chance, noisy, pick } from './rng';
import type { GameState, Order, RegionId } from './types';
import { provoke } from './cases/eunuch';
import { addGrievance } from './factions';
import { exposeRoll } from './intel';
import { range } from './rng';
import { addPrestige, addUnrest, event, gov, replaceChar, troops } from './util';

export function deliver(state: GameState, o: Order): void {
  if (o.kind === 'task') {
    routineArrive(state, o.taskId!, o.choiceId!, o.region);
    return;
  }
  if (caseOrder(state, o)) return;
  generic(state, o);
}

function generic(state: GameState, o: Order): void {
  const w = state.world;
  const reg = w.regions[o.region];
  switch (o.kind) {
    case 'spy':
    case 'envoy':
      investigate(state, o);
      return;
    case 'relief': {
      const leak = 1 - w.corruption / 200;
      reg.reliefUntil = state.turn + 6;
      addUnrest(state, o.region, -12 * leak);
      event(state, 'routine', `賑銀到${regionName(o.region)}${leak < 0.8 ? '，然多被胥吏侵漁' : '，饑民稍安'}。`);
      return;
    }
    case 'remit':
      reg.remitUntil = state.turn + 12;
      addUnrest(state, o.region, -8);
      event(state, 'routine', `蠲免${regionName(o.region)}錢糧之旨到達。`);
      return;
    case 'press':
      reg.pressUntil = state.turn + 9;
      event(state, 'routine', `嚴令${regionName(o.region)}催科之旨到達。`);
      return;
    case 'campaign':
      return;
    case 'impeach': {
      const id = (o.caseId ?? '').slice(8);
      const c = state.chars[id];
      if (!c || c.status !== 'active') return;
      const f = c.faction;
      addGrievance(state, f, 10);
      for (const x of ['yan', 'qing', 'zhe', 'xun'] as const) if (x !== f) addGrievance(state, x, -6);
      if (f === 'yan') provoke(state, 8);
      if (c.integrity >= 0.6) state.world.wrongful.push(`${c.title}${c.name}（黨爭罷黜）`);
      const old = replaceChar(state, id, range(state.rng, 0.4, 0.9));
      state.chars[id].faction = chance(state.rng, 0.5) ? null : f;
      if (id === 'dongchang') state.world.dongchang = state.chars[id].faction === 'yan' ? 'eunuch' : 'crown';
      event(state, 'court', `${c.title}${old}被劾罷官。`, true);
      return;
    }
    case 'recall':
      recallGov(state, o.region);
      return;
    case 'sectBan':
      banSect(state, o.region);
      return;
    case 'amnesty':
      amnesty(state, o.region);
      return;
    case 'arrest':
      arrestGov(state, o.region);
      return;
    default:
      return;
  }
}

function recallGov(state: GameState, region: RegionId): void {
  const g = gov(state, region);
  const d = draft('audience', g.id, 'jingshi', 'routine', `${REGIONS[region].gov}${g.name}陛見奏對`);
  d.arriveTurn = state.turn + travelTurns(state, region);
  d.free = true;
  const u = state.world.regions[region].unrest;
  const shown = g.integrity < 0.4 ? Math.max(5, u - 25) : u;
  const mood = (v: number) => (v >= 65 ? '民情洶洶' : v >= 40 ? '民多怨言' : '地方安靜');
  core(d, `${g.name}伏地奏對：${regionName(region)}${mood(shown)}，錢糧${g.integrity < 0.45 ? '一一如額，皆臣督催之力' : '勉力催徵，然民力已竭'}。`, `奏稱${mood(shown)}`, `地方長官當面報告：當地「${mood(shown)}」。`);
  claim(d, `unrest.${region}`, '民情', mood(shown), mood(u));
  if (g.integrity < 0.4) clue(d, '問以州縣細務，多不能對，惟頌聖恩而已。', '問以細務多不能對', { plain: '問他地方上的細節，他大多答不出來，只會說好話。' });
  else if (g.competence > 0.7) clue(d, '問以州縣細務，條分縷析，了如指掌。', '問以細務，了如指掌', { plain: '問他細節，他答得頭頭是道。是個能幹的人。' });
  post(state, d);
  event(state, 'routine', `${REGIONS[region].gov}${g.name}奉召入京陛見。`);
}

function arrestGov(state: GameState, region: RegionId): void {
  const g = gov(state, region);
  const old = g.name;
  const clean = g.integrity >= 0.6;
  if (clean) {
    state.world.wrongful.push(`${REGIONS[region].gov}${old}`);
    addPrestige(state, -2);
  } else addPrestige(state, 1);
  event(state, 'routine', `${REGIONS[region].gov}${old}被革職拿問${clean ? '（其人素有清譽）' : '（其人貪鄙，罪有應得）'}。`, true);
  replaceChar(state, g.id);
  const d = draft('memorial', g.id, region, 'routine', `新任${REGIONS[region].gov}到任疏`);
  core(d, `臣${g.name}謹奏：臣到任清查前任交代，${clean ? '庫藏錢糧一一相符，前任操守可稱。' : '庫藏虧空甚多，前任侵蝕有據。'}`, clean ? '前任交代清楚，操守可稱' : '前任虧空甚多，侵蝕有據', clean ? '新官說前任的帳目清楚，人很清廉。（你可能抓錯人了）' : '新官說前任虧空很多，確實貪污。');
  post(state, d);
}

/** 東廠密查、巡按查核 */
function investigate(state: GameState, o: Order): void {
  const r = state.rng;
  const w = state.world;
  const spy = o.kind === 'spy';
  const region = o.region;
  const g = gov(state, region);
  const cases = state.cases.filter((c) => state.turn >= c.startTurn && c.region === region);
  const sure = spy && w.dongchang === 'crown';
  const d = draft(spy ? 'secret' : 'envoy', spy ? 'dongchang' : 'yushi', region, cases[0]?.uid ?? 'routine', spy ? `${sure ? '〔確〕' : ''}東廠密報・${regionName(region)}` : `巡按${regionName(region)}御史查覆疏`);
  d.certified = sure;
  if (!spy) {
    d.fromLabel = `巡按${regionName(region)}御史`;
    d.delay = 1;
  }
  // 京中密查：番子當旬回報（旨意下旬送達即回）
  if (region === 'jingshi') d.arriveTurn = state.turn;
  const bribeP = Math.max(0, ...cases.map((c) => CASE_DEFS[c.def].bribe?.(state, c) ?? 0), g && g.integrity < 0.35 ? 0.3 : 0);
  const bribed = !spy && chance(r, bribeP);
  const fabricate = spy && w.dongchang === 'eunuch' && state.perk !== 'spies' && chance(r, 0.35);
  const shield = spy && w.dongchang === 'eunuch' && g?.faction === 'yan';
  const bands = ['貪墨', '平平', '清廉'];
  const band = (v: number) => (v >= 0.65 ? 2 : v >= 0.4 ? 1 : 0);

  if (region === 'jingshi') capitalReport(state, d);
  else if (g) {
    const reg = w.regions[region];
    const u = reg.unrest;
    const seenU = bribed || shield ? Math.max(5, u - 30) : sure ? u : noisy(r, u, spy ? 0.2 : 0.1);
    const mood = seenU >= 65 ? '民情洶洶' : seenU >= 40 ? '民多怨言' : '地方安靜';
    core(d, `訪得${regionName(region)}${mood}。`, mood, `查到當地「${mood}」。`);
    claim(d, `unrest.${region}`, '民情', mood, u >= 65 ? '民情洶洶' : u >= 40 ? '民多怨言' : '地方安靜');

    // 官聲：八成五看得準，否則差一級
    let b = bribed || shield ? 2 : band(g.integrity);
    if (!bribed && !shield && !sure && chance(r, spy ? 0.15 : 0.08)) b = b === 1 ? (chance(r, 0.5) ? 0 : 2) : 1;
    core(d, `${REGIONS[region].gov}${g.name}官聲${bands[b]}。`, `${g.name}官聲${bands[b]}`, `這位地方長官的風評：${bands[b]}。`);
    claim(d, `fame.${region}`, `${g.name}官聲`, bands[b], bands[band(g.integrity)]);
    if (!bribed && !shield && g.integrity < 0.45 && (sure || chance(r, 0.8)))
      clue(d, '州縣解銀至省，撫院衙門多有扣留，冊報與實收不符。', '撫院扣留解銀，冊報與實收不符', { plain: '各縣送到省城的稅銀，被巡撫衙門扣下一部分；帳面和實際收到的對不上。（地方截留錢糧）' });

    if (reg.disaster && state.turn < reg.disaster.until) {
      const relieved = state.turn < reg.reliefUntil;
      core(d, `${reg.disaster.kind}災${reg.disaster.severity > 0.55 ? '甚重' : '未息'}，${relieved ? '賑濟已到，饑民稍安' : '未見賑濟，饑民流離'}。`, `${reg.disaster.kind}災未息，${relieved ? '已有賑濟' : '未見賑濟'}`, `當地的${reg.disaster.kind}災還沒過去，${relieved ? '救濟已經送到。' : '還沒看到救濟，災民到處流浪。'}`);
    }
    if (REGIONS[region].kind === 'border') {
      const seen = sure ? reg.garrison : noisy(r, reg.garrison, spy ? 0.15 : 0.08);
      const morale = reg.morale >= 0.9 ? '士氣可用' : reg.morale >= 0.65 ? '士氣平平' : '士氣低落';
      core(d, `鎮兵見在約${troops(seen)}，${morale}。`, `鎮兵約${troops(seen)}，${morale}`, `邊鎮實際兵力約 ${Math.round(seen / 1000)} 千人，${morale}。`);
    }
    if (sure && REGIONS[region].kind !== 'border') core(d, `駐軍名冊${troops(reg.roll)}，實${troops(reg.garrison)}。`, `駐軍實${troops(reg.garrison)}`, `〔確〕當地駐軍實數。`);
    if (sure) d.claims.push({ key: `troops.${region}`, label: '實兵（東廠）', value: Math.round(reg.garrison), unit: '人' });
    for (const a of w.armies.filter((x) => x.active && x.region === region)) {
      const seen = sure ? a.size : noisy(r, a.size, spy ? 0.25 : 0.12);
      core(d, `境內${a.label}約${troops(seen)}。`, `${a.label}約${troops(seen)}`, `境內有${a.label}大約 ${Math.round(seen / 1000)} 千人。`);
    }
  }
  for (const c of cases) CASE_DEFS[c.def].investigate(state, c, d, { spy, bribed, fabricate });
  if (fabricate && region !== 'jingshi' && g && !cases.length) {
    core(d, `訪得${g.name}侵漁百姓，貪墨有據。`, `訪得${g.name}貪墨`, '密探說這位地方長官貪污。（東廠是否邀功羅織？）');
    claim(d, `fame.${region}`, `${g.name}官聲`, '貪墨', bands[band(g.integrity)]);
  }
  fluff(d, spy ? (region === 'jingshi' ? '番子遍歷六部、內廷、市井，所聞如此，謹密奏。' : '番子扮作行商，往返所見如此，謹密奏。') : '臣奉命按臨，所見如此。', spy ? (sure ? '（東廠已在你手中：以上皆確）' : '（東廠在權閹手中：閹黨的人一律說好話）') : '（巡按的例行收尾）');
  post(state, d);
  if (spy && region !== 'jingshi') exposeRoll(state, g?.id ?? null);
}

/** 京師密查：朝中動靜、京營、米價 */
function capitalReport(state: GameState, d: ReturnType<typeof draft>): void {
  const r = state.rng;
  const w = state.world;
  const u = w.regions.jingshi.unrest;
  const mood = u >= 65 ? '京城人心惶惶' : u >= 40 ? '京城頗有怨言' : '京城市面安靜';
  core(d, `訪得${mood}${w.grain < 70 ? '，米價騰貴' : ''}。`, mood, `京城的民心：${mood}。${w.grain < 70 ? '米價很貴。' : ''}`);
  const drill = w.jingyingMorale >= 0.95 ? '操練整肅' : w.jingyingMorale >= 0.75 ? '操練尚可' : '操練鬆弛，兵多怨言';
  core(d, `京營見兵約${troops(w.jingying)}，${drill}。`, `京營${drill}`, `京營兵力約 ${Math.round(w.jingying / 1000)} 千人，${drill}。`);
  const bias = shoufuBias(state);
  const sf = state.chars.shoufu;
  const truthful = w.dongchang === 'crown' || chance(r, 0.7);
  const partisan = bias !== 'clean';
  const c = state.cases.find((x) => x.uid === bias);
  if (partisan === truthful) {
    const where = c && truthful ? regionName(c.region) : regionName(pick(r, ['nanzhili', 'zhejiang', 'huguang', 'shandong'] as const));
    clue(d, `首輔${sf.name}府中，${where}方面書信、饋遺往來甚密。`, `首輔與${where}方面往來甚密`, { plain: `首輔家裡和${where}那邊的人書信、送禮往來很頻繁。（首輔可能替那邊的人說話）` });
  } else {
    clue(d, `首輔${sf.name}門庭冷落，不受請託。`, '首輔門庭冷落，不受請託', { plain: '首輔家很少有人上門送禮，他不接受關說。' });
  }
}
