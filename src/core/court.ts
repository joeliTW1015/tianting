// 朝中：言官彈章、各省匯報、召見奏對。（京師事件見 palace.ts）

import { CASE_DEFS } from './cases';
import { claim, clue, core, draft, fluff, local, post, shoufuBias } from './docs';
import { PROVINCES, REGION_ORDER, REGIONS, regionName } from './geography';
import { chance, pick } from './rng';
import type { CharId, GameState } from './types';
import { gov, silver } from './util';

export const SUMMONABLE: CharId[] = ['shoufu', 'cifu', 'silijian', 'dongchang', 'jinyiwei', 'jingying', 'hubu', 'bingbu', 'libu', 'rites', 'gongbu', 'xingbu', 'yushi'];

const mood = (v: number) => (v >= 65 ? '民情洶洶' : v >= 40 ? '民多怨言' : '地方安靜');

export function courtTick(state: GameState): void {
  const t = state.turn;
  if (t % 3 === 0) revenueDigest(state);
  if (t % 4 === 1) provinceDigest(state);
  if (t % 3 === 2) troopDigest(state);
  // 言路越開，彈章越多
  const gap = state.world.speech >= 60 ? 3 : state.world.speech >= 35 ? 5 : state.world.speech >= 20 ? 7 : 10;
  if (t % gap === gap - 2 || (state.perk === 'censors' && t % 5 === 0)) impeachment(state);
}

/** 兵部各鎮兵數冊：據報的是名冊（主將忠誠低時再灌水） */
function troopDigest(state: GameState): void {
  const w = state.world;
  const d = local(draft('digest', 'bingbu', 'jingshi', 'war', '兵部各鎮兵數冊'), state);
  d.free = true;
  const lines: string[] = [];
  for (const p of REGION_ORDER) {
    const r = w.regions[p];
    if (r.heldBy) continue;
    const g = gov(state, p);
    const pad = g && g.loyalty < 45 ? 1 + (60 - g.loyalty) / 100 : 1;
    const v = p === w.capital ? w.jingyingRoll + r.roll : r.roll * pad;
    if (v < 100) continue;
    lines.push(`${regionName(p)}${Math.round(v / 1000)}千`);
    claim(d, `troops.${p}`, '兵數（兵部冊報）', Math.round(v), r.garrison + (p === w.capital ? w.jingying : 0), { unit: '人', tol: 0.3 });
  }
  core(d, `兵部謹奏：各鎮各省見在兵數（名冊）：${lines.join('、')}。`, '各鎮兵數冊', '兵部依名冊報的各地兵數。名冊常常比實際多（吃空餉）：要知道實數，得派員點驗或東廠密查。');
  post(state, d);
}

/** 戶部：各省實解錢糧（據實） */
function revenueDigest(state: GameState): void {
  const w = state.world;
  const d = local(draft('digest', 'hubu', 'jingshi', 'routine', '戶部錢糧總冊'), state);
  // 帳冊公開，免精力即可閱覽
  d.free = true;
  const lines: string[] = [];
  for (const p of [...PROVINCES, 'jingshi' as const]) {
    const v = Math.round(w.regions[p].taxPaid * 10) / 10;
    lines.push(`${regionName(p)}${v}`);
    claim(d, `tax.${p}`, `${regionName(p)}每旬實解`, v, v, { unit: '萬兩' });
  }
  core(d, `戶部謹奏：上旬各省實解錢糧（萬兩）：${lines.join('、')}。鹽課${(w.last.salt).toFixed(1)}。太倉收漕${Math.round(w.last.grainIn)}萬石，支${Math.round(w.last.grainOut)}萬石。`, '各省實解錢糧總冊', '戶部列出各省上一旬實際繳到國庫的錢（單位萬兩）。某省的錢突然變少，可能有災、有亂、或有人截留。');
  core(d, `本旬歲入約${silver(w.last.income)}，歲出約${silver(w.last.expense)}（邊餉另計）。`, `歲入約${silver(w.last.income)}，歲出約${silver(w.last.expense)}`);
  post(state, d);
}

/** 通政司：各省長官自報的地方情形（操守差的會粉飾） */
function provinceDigest(state: GameState): void {
  const w = state.world;
  const d = local(draft('digest', 'court', 'jingshi', 'routine', '通政司各省情形匯錄'), state);
  d.free = true;
  d.fromLabel = '通政司';
  const lines: string[] = [];
  for (const p of REGION_ORDER) {
    if (p === 'jingshi') continue;
    const g = gov(state, p);
    const u = w.regions[p].unrest;
    const shown = g.integrity < (w.speech < 20 ? 0.6 : 0.4) ? Math.max(5, u - 25) : u;
    lines.push(`${regionName(p)}「${mood(shown)}」`);
    claim(d, `unrest.${p}`, `${regionName(p)}民情（自報）`, mood(shown), mood(u));
  }
  core(d, `通政司謹奏：各處長官自陳地方情形：${lines.join('，')}。`, '各省自陳地方情形', '這是各地長官自己報告的地方狀況。注意：自己報的，未必是真的。');
  post(state, d);
}

function impeachment(state: GameState): void {
  const r = state.rng;
  const accurate = chance(r, state.perk === 'censors' ? 0.85 : 0.35 + state.world.speech / 200);
  const guilty: { id: CharId; caseId: string }[] = [];
  for (const c of state.cases) {
    if (state.turn < c.startTurn || c.resolved) continue;
    for (const id of CASE_DEFS[c.def].guilty(state, c)) guilty.push({ id, caseId: c.uid });
  }
  for (const p of PROVINCES) if (gov(state, p).integrity < 0.3) guilty.push({ id: gov(state, p).id, caseId: 'routine' });
  let target: { id: CharId; caseId: string };
  if (accurate && guilty.length) target = pick(r, guilty);
  else {
    const pool = PROVINCES.map((p) => gov(state, p)).filter((g) => g.integrity >= 0.6);
    if (!pool.length) return;
    target = { id: pick(r, pool).id, caseId: 'routine' };
  }
  const c = state.chars[target.id];
  const isTrue = guilty.some((x) => x.id === target.id);
  const d = local(draft('memorial', 'yushi', 'jingshi', target.caseId, `御史劾${c.title}${c.name}`), state);
  core(d, `臣${state.chars.yushi.name}謹劾：${c.title}${c.name}貪縱不法，欺罔朝廷，伏乞立賜罷斥，以正國法。`, `御史劾${c.title}${c.name}`, `御史（專門監察、彈劾官員的言官）告發${c.title}${c.name}貪污欺瞞。言官常「風聞言事」——聽到傳聞就可以上奏，未必有證據。`);
  claim(d, `guilt.${target.id}`, `${c.title}${c.name}有罪`, '有', isTrue ? '有' : '無');
  if (isTrue) clue(d, '臣訪之同鄉官員，所言皆有實據，可覆按也。', '御史稱所言皆有實據', { plain: '御史說他有實際證據，可以查證。' });
  else fluff(d, '臣風聞言事，雖未得實據，然物議沸騰，不可不察。', '御史承認沒有實據，只是聽說。');
  post(state, d);
}

// ───────────────────────── 召見奏對 ─────────────────────────

const ACCURACY: Record<string, number> = { shoufu: 0.65, cifu: 0.55, silijian: 0.5, dongchang: 0.6, jinyiwei: 0.5, jingying: 0.4, hubu: 0.5, bingbu: 0.4, libu: 0.55, rites: 0.45, gongbu: 0.45, xingbu: 0.5, yushi: 0.55 };

export function audience(state: GameState, who: CharId, topic: string): void {
  const r = state.rng;
  const w = state.world;
  const ch = state.chars[who];
  const c = state.cases.find((x) => x.uid === topic);
  const d = local(draft('audience', who, 'jingshi', topic, `召見${ch.title}${ch.name}・問${c ? '此案' : '國事'}`), state);
  d.free = true;
  if (!c) {
    stateAudience(state, who, d);
    post(state, d);
    return;
  }

  const def = CASE_DEFS[c.def];
  const others = def.branches.filter((b) => b.id !== c.branch);
  const opinion = (acc: number) => (chance(r, acc) ? def.opinions[c.branch] : def.opinions[pick(r, others).id]);
  let acc = ACCURACY[who] ?? 0.5;
  if (who === 'rites' && c.def === 'exam') acc = 0.7;
  if (who === 'gongbu' && c.def === 'river') acc = 0.7;
  if (who === 'yushi' && state.perk === 'censors') acc = 0.8;

  if (who === 'shoufu' && shoufuBias(state) === c.uid) {
    const innocent = def.opinions[pick(r, others).id];
    core(d, `臣愚見：${innocent}。言者紛紛，多出嫌隙，不足深信。`, `首輔力言：${innocent}`, `首輔說：「${innocent}」，要你別理會其他人的說法。`);
  } else if (who === 'dongchang' && w.dongchang === 'eunuch' && state.perk !== 'spies') {
    const harsh = def.opinions[def.branches[def.branches.length - 1].id];
    core(d, `奴婢早有風聞：${harsh}。皇上若許奴婢多遣番子，必能查出實據。`, `東廠提督斷言：${harsh}`, `東廠提督很肯定地說：「${harsh}」，還想要更多人手去查。`);
  } else if (who === 'silijian' && c.def === 'eunuch') {
    core(d, '奴婢一片丹心，天日可表。外廷結黨，必欲去奴婢而後快。', '司禮監自陳丹心，指外廷結黨', '司禮監首領說自己忠心耿耿，是外面的大臣結黨要整他。');
  } else {
    const o = opinion(acc);
    core(d, `臣愚見：${o}。然臣所見亦不過奏牘傳聞，未敢必也。`, `${ch.title}以為：${o}`, `${ch.title}的看法：「${o}」。不過他也只是根據公文和傳聞判斷。`);
  }
  if (who === 'hubu' && c.region !== 'jingshi' && REGIONS[c.region].tax > 0) {
    const v = w.regions[c.region].taxPaid;
    clue(d, `${regionName(c.region)}額解每旬${REGIONS[c.region].tax}萬兩，近旬實解${v.toFixed(1)}萬兩。`, `${regionName(c.region)}近旬實解${v.toFixed(1)}萬兩（額${REGIONS[c.region].tax}）`, { plain: `戶部的帳：${regionName(c.region)}應該每旬繳 ${REGIONS[c.region].tax} 萬兩，最近實際繳了 ${v.toFixed(1)} 萬兩。` });
  }
  if (who === 'libu' && c.region !== 'jingshi') {
    const g = gov(state, c.region);
    const fame = chance(r, 0.7) ? g.integrity : 1 - g.integrity;
    clue(d, `${REGIONS[c.region].gov}${g.name}，考語「${fame >= 0.6 ? '廉能' : fame >= 0.4 ? '中平' : '貪劣'}」。`, `${g.name}考語「${fame >= 0.6 ? '廉能' : fame >= 0.4 ? '中平' : '貪劣'}」`, { plain: `吏部對這位地方長官的考核評語是「${fame >= 0.6 ? '廉能（清廉能幹）' : fame >= 0.4 ? '中平（普通）' : '貪劣（貪污差勁）'}」。` });
  }
  post(state, d);
}

function stateAudience(state: GameState, who: CharId, d: ReturnType<typeof draft>): void {
  const w = state.world;
  const top = PROVINCES.slice().sort((a, b) => w.regions[b].unrest - w.regions[a].unrest).slice(0, 3);
  switch (who) {
    case 'hubu':
      core(d, `戶部尚書奏對：太倉見存銀約${silver(w.treasury)}、糧約${Math.round(w.grain)}萬石，內帑另計。每旬歲入約${silver(w.last.income)}，歲出約${silver(w.last.expense)}。`, '戶部奏報見存錢糧', `戶部尚書當面報告最新數字：國庫約 ${Math.round(w.treasury)} 萬兩、存糧約 ${Math.round(w.grain)} 萬石（比奏報上的帳目新一旬）。`);
      break;
    case 'bingbu': {
      const ms = (['jizhen', 'xuanda', 'liaodong', 'gansu'] as const).map((b) => `${regionName(b)}${w.regions[b].morale >= 0.9 ? '士氣可用' : w.regions[b].morale >= 0.65 ? '士氣平平' : '士氣低落'}`);
      core(d, `兵部尚書奏對：${ms.join('，')}。京營名冊${Math.round(w.jingyingRoll / 1000)}千。${w.borderArrears >= 1 ? `邊餉積欠${Math.round(w.borderArrears)}月，軍心浮動。` : ''}`, '兵部奏報四邊士氣', `兵部尚書報告各邊鎮士氣：${ms.join('、')}。`);
      break;
    }
    case 'libu':
      core(d, `吏部尚書奏對：近年吏治${w.corruption > 60 ? '大壞，貪墨成風' : w.corruption > 40 ? '頗有廢弛' : '尚稱整肅'}。`, `吏治${w.corruption > 60 ? '大壞' : w.corruption > 40 ? '頗有廢弛' : '尚稱整肅'}`, `吏部尚書說官場風氣「${w.corruption > 60 ? '很壞' : w.corruption > 40 ? '有點鬆散' : '還算好'}」。吏治越壞，稅收和賑濟被吃掉的越多。`);
      break;
    case 'yushi':
      core(d, `都御史奏對：近日輿論${w.prestige >= 65 ? '頗頌聖德' : w.prestige >= 40 ? '尚屬平和' : '洶洶，頗有怨望'}。`, `輿論${w.prestige >= 65 ? '頌聖' : w.prestige >= 40 ? '平和' : '洶洶'}`, `都御史說朝野輿論「${w.prestige >= 65 ? '很稱讚你' : w.prestige >= 40 ? '還算平和' : '很不滿'}」。（朝望太低時，處置大臣、藩王會遇到阻力）`);
      break;
    default:
      core(d, `${state.chars[who].title}奏對：方今天下，${top.map((p) => regionName(p)).join('、')}三處最為可慮。`, `以${top.map((p) => regionName(p)).join('、')}最為可慮`, `他說目前最讓人擔心的地方是：${top.map((p) => regionName(p)).join('、')}。`);
      fluff(d, '伏願皇上留意。');
  }
}
