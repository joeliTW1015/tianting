// 民亂：小亂（搶米、抗稅、毆官）→ 民變起事；邪教暗中滋長 → 教匪起事；招撫與查禁。

import { core, draft, post, task } from './docs';
import { PROVINCES, REGIONS, regionName } from './geography';
import { chance, int, pick } from './rng';
import type { Doc, GameState, RegionId } from './types';
import { addMood, addPrestige, addUnrest, clamp, event, gov } from './util';
import { armiesOf, spawnArmy } from './war';

const NICK = ['闖天王', '混天王', '掃地王', '過天星', '紫金梁', '一條龍', '射塌天', '翻山鷂', '鑽天鷂', '混世王'];
const SUR = '高李張羅馬劉賀王';
const SECTS = ['白蓮教', '聞香教', '羅教', '無為教'];

export function uprisingId(region: RegionId): string {
  return `uprising:${region}`;
}

function leaderName(state: GameState): string {
  return pick(state.rng, SUR.split('')) + pick(state.rng, NICK);
}

export function unrestEvents(state: GameState): void {
  const w = state.world;
  const r = state.rng;
  const t = state.turn;
  for (const id of PROVINCES) {
    const reg = w.regions[id];
    if (reg.heldBy) continue;
    // 邪教滋長
    if (reg.unrest > 50) reg.sect = clamp(reg.sect + 1.5 + (reg.unrest - 50) / 20, 0, 100);
    else reg.sect = clamp(reg.sect - 0.4, 0, 100);
    if (chance(r, 0.008)) reg.sect = clamp(reg.sect + 15, 0, 100);
    if (reg.sect > 30 && chance(r, 0.12) && (w.cooldown[`sect:${id}`] ?? -99) <= t) {
      w.cooldown[`sect:${id}`] = t + 8;
      const d = draft('rumor', 'rumor', 'jingshi', 'routine', `京城傳聞・${regionName(id)}`);
      d.arriveTurn = t + 1;
      const sect = pick(r, SECTS);
      core(d, `坊間傳言：${regionName(id)}有${sect}傳習，夜聚曉散，言「${pick(r, ['彌勒降世', '真空家鄉，無生父母', '紅陽劫盡，白陽當興'])}」。`, `${regionName(id)}有${sect}傳習`, `傳說${regionName(id)}有秘密宗教（${sect}）在傳教，晚上聚會。這類教門在百姓困苦時最容易壯大，壯大了就可能起事。可在該地下旨「查禁邪教」。`);
      post(state, d);
    }
    if (reg.sect >= 100) {
      reg.sect = 20;
      const leader = leaderName(state);
      const sect = pick(r, SECTS);
      rising(state, id, `${sect}${leader}`, 9000 + reg.unrest * 60, 1.035, 0.6, `${sect}教首${leader}聚眾起事，自稱「${pick(r, ['彌勒佛轉世', '中興福烈帝', '大乘天王'])}」`);
      continue;
    }
    // 民變
    const hasRising = armiesOf(state, uprisingId(id)).length > 0;
    if (reg.unrest >= 85 && !hasRising) {
      const leader = leaderName(state);
      rising(state, id, `${regionName(id)}亂民${leader}`, 6000 + (reg.unrest - 85) * 400, 1.03, 0.5, `饑民${leader}聚眾作亂，攻劫州縣`);
      reg.unrest = 70;
      continue;
    }
    // 小亂
    if (reg.unrest >= 55 && (w.cooldown[`riot:${id}`] ?? -99) <= t && chance(r, 0.25)) {
      w.cooldown[`riot:${id}`] = t + 6;
      riot(state, id);
    }
  }
}

function rising(state: GameState, id: RegionId, label: string, size: number, growth: number, evasion: number, text: string): void {
  spawnArmy(state, { caseId: uprisingId(id), label, side: 'bandit', size, region: id, path: REGIONS[id].toCapital, growth, moveIn: 5, evasion });
  event(state, uprisingId(id), `${regionName(id)}：${text}，眾${Math.round(size / 1000)}千。`, true);
  addMood(state, -5);
  addUnrest(state, id, 10);
  const g = gov(state, id);
  const d = draft('memorial', g.id, id, uprisingId(id), `${regionName(id)}飛報：${label.replace(/^.+?亂民/, '')}作亂`);
  d.urgent = true;
  core(d, `臣${g.name}飛報：${text}，眾以萬計，焚掠鄉村，伏乞速發大兵剿撫！`, `${regionName(id)}民變：${label}`, `緊急：${regionName(id)}爆發民變。${text}。可以派兵剿滅，也可以在該地下旨「招撫」——若當地民心已經好轉，招撫比較有效。`);
  post(state, d);
}

const RIOTS = [
  { what: '饑民聚眾搶米', plain: '饑餓的百姓聚集起來搶米店' },
  { what: '鄉民抗糧，毆傷催科差役', plain: '百姓抗拒繳糧，打傷了收稅的差役' },
  { what: '織工、礦夫聚眾罷工，圍攻稅署', plain: '工人罷工，包圍了收稅的衙門' },
  { what: '鄉民圍攻縣衙，縣令越牆而逃', plain: '百姓包圍縣衙門，縣官翻牆逃走' },
];

function riot(state: GameState, id: RegionId): void {
  const r = state.rng;
  const g = gov(state, id);
  const x = pick(r, RIOTS);
  const county = pick(r, ['某縣', '府城', '州城', '某鎮']).replace('某', pick(r, ['東', '西', '南', '北', '清', '永', '安', '平']));
  const d = draft('task', g.id, id, 'routine', `${regionName(id)}奏報${county}民變`);
  core(d, `臣${g.name}謹奏：${county}${x.what}，臣已飭有司彈壓，伏候聖裁。`, `${county}${x.what}`, `${regionName(id)}${county}出事了：${x.plain}。若不處理，民心會更差，可能演變成大規模民變。`);
  task(
    d,
    'riot:local',
    [
      { id: 'soothe', label: '發帑安撫', note: '查明緣由、發銀撫恤：民心明顯好轉。', silver: 8 },
      { id: 'suppress', label: '調兵彈壓', note: '迅速壓下，民心略好轉；但朝望 −1，民心太差時可能激成大亂。' },
      { id: 'punish', label: '嚴懲貪酷官吏', note: '把逼民作亂的地方官治罪：民心好轉，朝望 +1。' },
      { id: 'none', label: '不予理會', note: '民心繼續惡化。' },
    ],
    'none',
    state.turn + int(r, 3, 4),
    { region: id, recommend: 'suppress' },
  );
  d.recommend = '擬：調兵彈壓。';
  post(state, d);
}

export function applyRiotChoice(state: GameState, doc: Doc, id: string): void {
  const p = doc.task!.region as RegionId;
  if (!p) return;
  const reg = state.world.regions[p];
  if (id === 'soothe') addUnrest(state, p, -12);
  else if (id === 'suppress') {
    addUnrest(state, p, -4);
    addPrestige(state, -1);
    if (reg.unrest >= 72 && chance(state.rng, 0.3)) {
      const leader = leaderName(state);
      rising(state, p, `${regionName(p)}亂民${leader}`, 7000, 1.03, 0.5, `官兵彈壓過當，${leader}乘勢聚眾`);
    }
  } else if (id === 'punish') {
    addUnrest(state, p, -8);
    addPrestige(state, 1);
  } else addUnrest(state, p, 5);
}

/** 查禁邪教：教門勢大時可能逼其提前起事 */
export function banSect(state: GameState, id: RegionId): void {
  const reg = state.world.regions[id];
  const before = reg.sect;
  reg.sect = clamp(reg.sect - 45, 0, 100);
  const g = gov(state, id);
  const d = draft('memorial', g.id, id, 'routine', `${regionName(id)}奏報查禁邪教`);
  if (before > 70 && chance(state.rng, 0.4)) {
    const leader = leaderName(state);
    core(d, `臣${g.name}謹奏：奉旨查禁邪教，教眾聞風，竟鋌而走險。`, '查禁邪教，教眾鋌而走險', '查禁太晚，教門已經坐大，一查反而逼他們起事。');
    post(state, d);
    rising(state, id, `白蓮教${leader}`, 8000, 1.035, 0.6, `教首${leader}聞查禁之旨，倉促起事`);
    return;
  }
  core(
    d,
    before > 20 ? `臣${g.name}謹奏：奉旨查禁邪教，拿獲傳頭若干名，搜出經卷、符讖，餘眾解散。` : `臣${g.name}謹奏：奉旨查訪，境內並無邪教傳習。`,
    before > 20 ? '拿獲傳頭若干，餘眾解散' : '境內並無邪教',
    before > 20 ? '查禁成功，抓到傳教的頭目，教門瓦解了。' : '查了一圈，當地並沒有邪教。',
  );
  post(state, d);
  event(state, 'routine', `查禁${regionName(id)}邪教（教勢${Math.round(before)}→${Math.round(reg.sect)}）。`);
}

/** 招撫亂民：民心好轉時較有效 */
export function amnesty(state: GameState, id: RegionId): void {
  const reg = state.world.regions[id];
  const armies = armiesOf(state, uprisingId(id)).concat(state.world.armies.filter((a) => a.active && a.region === id && a.side === 'bandit' && a.caseId !== uprisingId(id)));
  if (!armies.length) {
    event(state, 'routine', `招撫之旨到${regionName(id)}，境內並無成股亂民。`);
    return;
  }
  const k = reg.unrest < 60 ? 0.3 : 0.65;
  for (const a of armies) a.size *= k;
  addPrestige(state, -1);
  event(state, 'routine', `${regionName(id)}招撫亂民，${k < 0.5 ? '大半解散歸農' : '僅少數受撫'}。`, true);
  const g = gov(state, id);
  const d = draft('memorial', g.id, id, 'routine', `${regionName(id)}奏報招撫情形`);
  core(d, `臣${g.name}謹奏：宣布皇恩，亂民${k < 0.5 ? '感泣，解散歸農者十之七' : '受撫者無多，餘眾負隅'}。`, k < 0.5 ? '亂民大半受撫' : '受撫者無多', k < 0.5 ? '招撫很成功，大部分人回家了。' : '只有少數人接受招安，其他人還在作亂（民心太差時招撫效果有限）。');
  post(state, d);
}
