// 詔書（主動）：八類詔書的目錄。每道都有精力、錢糧、送達（驛程）、執行（旬）、勝算、派系反應；
// 違反祖制者可能被首輔封駁。送達＋執行完畢後生效。

import { issueOrder, orderOptions } from './actions';
import { eunuchCase, provoke } from './cases/eunuch';
import { core, draft, local, post, task } from './docs';
import { addClout, addGrievance, clout, react } from './factions';
import { alive, applyDip, foreignActions, POWERS, powerDef } from './foreign';
import { ALL_REGIONS, NORTH, OUTER, PROVINCES, REGION_ORDER, REGIONS, regionName, travelTurns } from './geography';
import { designate, haremAct, makeConsort, RANKS } from './harem';
import { drawLot, exposed, exposeRoll, oddsText, probePerson } from './intel';
import { PROJECTS, spend, startProject } from './palace';
import { allPosts, appoint, candidates, CAPITAL_POSTS, FACTION_NAME, generals, postOf, reserves } from './people';
import { chance, int, pick } from './rng';
import { addStatus } from './statuses';
import type { Army, FactionId, GameState, Order, RegionId } from './types';
import { addMood, addPrestige, addUnrest, clamp, event, flow, replaceChar, troops } from './util';
import { CARDS, CROWN_CARDS, crownArmies, hostileArmies, marchTo, raiseArmy, sendDetachment, UNITS } from './war';

export type EdictCat = 'mil' | 'hr' | 'fin' | 'dip' | 'dc' | 'pal' | 'grand';
export const CAT_NAME: Record<EdictCat, string> = { mil: '軍務', hr: '人事', fin: '財計', dip: '外交', dc: '密偵', pal: '內廷', grand: '大計' };
export type TargetKind = 'none' | 'region' | 'char' | 'army' | 'power' | 'consort' | 'child' | 'faction';

export interface Param {
  id: string;
  label: string;
}

export interface Cost {
  silver?: number;
  privy?: number;
  grain?: number;
}

export interface EdictDef {
  id: string;
  cat: EdictCat;
  name: string;
  desc: string;
  target: TargetKind;
  /** 可選對象 */
  targets?: (s: GameState) => { id: string; label: string }[];
  params?: (s: GameState, target: string) => Param[];
  energy: number | ((s: GameState, t: string, p: string) => number);
  cost?: (s: GameState, t: string, p: string) => Cost;
  /** 執行旬數（送達後） */
  exec: number | ((s: GameState, t: string, p: string) => number);
  /** 送達：預設依對象所在地的驛程 */
  local?: boolean;
  odds?: (s: GameState, t: string, p: string) => number | undefined;
  factions?: Partial<Record<FactionId, number>>;
  ancestral?: boolean;
  check?: (s: GameState, t: string, p: string) => string | null;
  apply: (s: GameState, o: Order, ok: boolean) => void;
  onIssue?: (s: GameState, t: string, p: string, o: Order) => void;
}

const domestic = (s: GameState) => REGION_ORDER.filter((r) => !s.world.regions[r].heldBy).map((r) => ({ id: r, label: regionName(r) }));
const armyTargets = (s: GameState) => crownArmies(s).map((a) => ({ id: String(a.id), label: `${a.label}（${regionName(a.region)}・${troops(a.roll ?? a.size)}）` }));
const armyOf = (s: GameState, id: string): Army | undefined => s.world.armies.find((a) => a.id === Number(id) && a.active && a.side === 'crown');
const n = (p: string) => Number(p) || 0;

function result(s: GameState, title: string, ok: boolean, text: string, plain: string, p?: number): void {
  const d = local(draft('notice', 'court', 'jingshi', 'court', title), s);
  d.free = true;
  d.highlight = ok ? '事　成' : '事　敗';
  if (p !== undefined) d.lot = { tier: 0, ok, label: ok ? (p < 0.4 ? '上上籤' : '上籤') : p >= 0.7 ? '下籤' : '下下籤' };
  core(d, text, title, plain);
  post(s, d);
}

export const EDICTS: EdictDef[] = [
  // ───────── 軍務 ─────────
  {
    id: 'recruit',
    cat: 'mil',
    name: '徵兵',
    desc: '在當地招募募兵，三旬成軍（新兵六旬內戰力只有七成）。該地民心下降；每地十二旬內最多兩萬。',
    target: 'region',
    targets: (s) => domestic(s).filter((x) => x.id !== 'jingshi' || s.world.capital !== 'jingshi' || true),
    params: () => [
      { id: '5000', label: '五千' },
      { id: '10000', label: '一萬' },
    ],
    energy: 1,
    cost: (_s, _t, p) => ({ silver: (n(p) / 5000) * 2 }),
    exec: 3,
    factions: { xun: 1 },
    check: (s, t, p) => {
      const r = s.world.regions[t as RegionId];
      const recent = r.levied.filter((x) => s.turn - x.turn < 12).reduce((a, x) => a + x.n, 0);
      return recent + n(p) > 20000 ? '此地十二旬內已募兩萬，丁口已竭。' : null;
    },
    onIssue: (s, t, p) => s.world.regions[t as RegionId].levied.push({ turn: s.turn, n: n(p) }),
    apply: (s, o) => {
      const r = o.target as RegionId;
      const g = s.chars[`gov:${r}`];
      const a = raiseArmy(s, { region: r, size: n(o.param ?? '5000'), unit: 'mubing', label: `${regionName(r)}新募`, commander: g?.kind === 'military' ? undefined : undefined });
      a.morale = 50;
      addUnrest(s, r, 3);
      event(s, 'crown', `${regionName(r)}募兵${troops(a.size)}成軍。`);
      doneDoc(s, `${regionName(r)}奏：新募${troops(a.size)}成軍`, `${regionName(r)}新募之兵已成軍，由${s.chars[a.commander!]?.name ?? ''}統領。`, '新兵成軍了，可以在輿圖上點它，調去需要的地方。');
    },
  },
  {
    id: 'elite',
    cat: 'mil',
    name: '募精兵',
    desc: '在產地招募精兵（秦兵、關寧鐵騎、白桿兵、浙兵、狼兵、水師、火器營），四旬成軍。',
    target: 'region',
    targets: (s) => domestic(s).filter((x) => REGIONS[x.id as RegionId].elite).map((x) => ({ ...x, label: `${x.label}（${UNITS[REGIONS[x.id as RegionId].elite!].name}）` })),
    params: () => [{ id: '5000', label: '五千' }],
    energy: 1,
    cost: () => ({ silver: 4 }),
    exec: 4,
    factions: { xun: 1 },
    check: (s, t) => {
      const r = s.world.regions[t as RegionId];
      const recent = r.levied.filter((x) => s.turn - x.turn < 12).reduce((a, x) => a + x.n, 0);
      return recent + 5000 > 20000 ? '此地十二旬內已募兩萬，丁口已竭。' : null;
    },
    onIssue: (s, t) => s.world.regions[t as RegionId].levied.push({ turn: s.turn, n: 5000 }),
    apply: (s, o) => {
      const r = o.target as RegionId;
      const unit = REGIONS[r].elite!;
      if (unit === 'shuishi') s.world.navy += 100;
      const a = raiseArmy(s, { region: r, size: 5000, unit, label: UNITS[unit].name });
      a.morale = 65;
      addUnrest(s, r, 2);
      doneDoc(s, `${regionName(r)}奏：${UNITS[unit].name}五千成軍`, `${UNITS[unit].name}五千成軍。`, `精兵成軍：${UNITS[unit].name}。${unit === 'shuishi' ? '水師也添了一百艘船。' : ''}`);
    },
  },
  {
    id: 'sendJingying',
    cat: 'mil',
    name: '發京營出征',
    desc: '從京營抽兵出征某地，敵退三旬後班師。京師兵力隨之減少。',
    target: 'region',
    targets: (s) => ALL_REGIONS.filter((r) => r !== s.world.capital).map((r) => ({ id: r, label: regionName(r) })),
    params: (s) => [5000, 10000, 20000].filter((x) => x <= s.world.jingying - 15000).map((x) => ({ id: String(x), label: troops(x) })),
    energy: 2,
    cost: (_s, t, p) => ({ silver: (n(p) / 10000) * (REGIONS[t as RegionId].kind === 'outer' ? 5 : 3) }),
    exec: 0,
    local: true,
    check: (s, t, p) => (s.world.jingying - n(p) < 15000 ? '兵部奏：京營不可再調，否則京師空虛。' : outerCheck(s, t as RegionId)),
    apply: (s, o) => {
      const a = sendDetachment(s, o.target as RegionId, n(o.param ?? '10000'));
      if (REGIONS[o.target as RegionId].kind === 'outer') a.mission = 'suppress';
    },
  },
  {
    id: 'march',
    cat: 'mil',
    name: '調兵',
    desc: '令某部移防或進剿某地（沿路行軍，每段一至三旬）；原地防務隨之空虛。出塞（境外）每旬折損兵員。',
    target: 'army',
    targets: armyTargets,
    params: (s) => ALL_REGIONS.map((r) => ({ id: r, label: regionName(r) + (REGIONS[r].kind === 'outer' ? `（境外・${s.world.regions[r].owner === 'crown' ? '本朝' : powerName(s.world.regions[r].owner)}）` : '') })),
    energy: (s, _t, p) => (REGIONS[p as RegionId]?.kind === 'outer' ? 2 : 1),
    cost: (s, t, p) => {
      const a = armyOf(s, t);
      return { silver: a ? (a.size / 10000) * (REGIONS[p as RegionId]?.kind === 'outer' ? 5 : 2) : 0 };
    },
    exec: 0,
    check: (s, t, p) => (armyOf(s, t) ? outerCheck(s, p as RegionId) : '無此部。'),
    apply: (s, o) => {
      const a = armyOf(s, o.target!);
      if (!a) return;
      const foe = hostileArmies(s).some((x) => x.region === o.param);
      const err = marchTo(s, a, o.param as RegionId, foe || REGIONS[o.param as RegionId].kind === 'outer' ? 'suppress' : 'hold');
      if (err) doneDoc(s, `兵部奏：${a.label}不能成行`, err, err);
    },
  },
  {
    id: 'stratagem',
    cat: 'mil',
    name: '授方略',
    desc: '指定某部下一場交戰的方略。詔書要走驛路——送到時戰況可能已變，主將或「君命有所不受」。',
    target: 'army',
    targets: armyTargets,
    params: () => CROWN_CARDS.map((c) => ({ id: c.id, label: c.name })),
    energy: 1,
    exec: 0,
    onIssue: (s, t, p, o) => {
      const a = armyOf(s, t);
      const foe = a ? hostileArmies(s).filter((x) => x.region === a.region).reduce((m, x) => m + x.size, 0) : 0;
      o.param = `${p}|${Math.round(foe)}|${a?.region ?? ''}`;
    },
    apply: (s, o) => {
      const a = armyOf(s, o.target!);
      if (!a) return;
      const [card, foe, region] = (o.param ?? '').split('|');
      a.stratagem = { card, from: s.turn, foe: Number(foe), region: region as RegionId };
    },
  },
  {
    id: 'posture',
    cat: 'mil',
    name: '催戰／禁戰',
    desc: '催戰：主將必須出擊（持重者士氣受挫）。禁戰：主將只能固守。',
    target: 'army',
    targets: armyTargets,
    params: () => [
      { id: 'attack', label: '催戰' },
      { id: 'hold', label: '禁戰固守' },
      { id: 'free', label: '聽其便宜' },
    ],
    energy: 1,
    exec: 0,
    apply: (s, o) => {
      const a = armyOf(s, o.target!);
      if (!a) return;
      a.posture = o.param === 'free' ? undefined : (o.param as 'attack' | 'hold');
      const c = a.commander ? s.chars[a.commander] : null;
      if (o.param === 'attack' && c && c.stance !== 'war') a.morale = clamp(a.morale - 12, 0, 100);
    },
  },
  {
    id: 'replace',
    cat: 'mil',
    name: '撤換主將',
    desc: '臨陣換將，士氣下降；擁兵自重的將領可能抗命。',
    target: 'army',
    targets: armyTargets,
    params: (s) => generals(s).map((g) => ({ id: g.id, label: `${g.name}（${g.title}）` })),
    energy: 1,
    exec: 0,
    odds: (s, t) => {
      const a = armyOf(s, t);
      const c = a?.commander ? s.chars[a.commander] : null;
      return c && c.authority === 'free' && c.ambition > 70 ? 0.6 : undefined;
    },
    apply: (s, o, ok) => {
      const a = armyOf(s, o.target!);
      if (!a) return;
      if (!ok) {
        result(s, `${a.label}主將抗命不受代`, false, `${s.chars[a.commander!]?.name}擁兵抗命，不受代。`, '他不肯交出兵權！（野心更大了）');
        if (a.commander) s.chars[a.commander].ambition = clamp(s.chars[a.commander].ambition + 15, 0, 100);
        return;
      }
      const old = a.commander;
      if (old && (old.startsWith('gen:') || old.startsWith('res:'))) s.chars[old].status = 'away';
      a.commander = o.param;
      if (o.param && s.chars[o.param]) s.chars[o.param].status = 'active';
      a.morale = clamp(a.morale - 15, 0, 100);
    },
  },
  {
    id: 'reward',
    cat: 'mil',
    name: '犒軍',
    desc: '發銀犒賞，士氣上升一級。',
    target: 'army',
    targets: armyTargets,
    energy: 1,
    cost: (s, t) => ({ silver: Math.max(1, ((armyOf(s, t)?.size ?? 0) / 10000) * 2) }),
    exec: 0,
    factions: { xun: 1 },
    apply: (s, o) => {
      const a = armyOf(s, o.target!);
      if (a) a.morale = clamp(a.morale + 20, 0, 100);
    },
  },
  {
    id: 'audit',
    cat: 'mil',
    name: '點驗',
    desc: '派員點驗某地駐軍與部隊的實兵數；嚇阻吃空餉（實額率上升），但將領不悅。',
    target: 'region',
    targets: domestic,
    energy: 1,
    cost: () => ({ silver: 1 }),
    exec: 2,
    apply: (s, o) => {
      const r = o.target as RegionId;
      const reg = s.world.regions[r];
      reg.audited = s.turn;
      const lines: string[] = [];
      if (REGIONS[r].kind !== 'outer') lines.push(`駐軍名冊${troops(reg.roll)}，實${troops(reg.garrison)}`);
      for (const a of crownArmies(s).filter((x) => x.region === r)) {
        lines.push(`${a.label}名冊${troops(a.roll ?? a.size)}，實${troops(a.size)}`);
        a.roll = a.size;
        if (a.commander) s.chars[a.commander].loyalty = clamp(s.chars[a.commander].loyalty - 5, 0, 100);
      }
      if (r === s.world.capital) {
        lines.push(`京營名冊${troops(s.world.jingyingRoll)}，實${troops(s.world.jingying)}`);
        s.world.jingyingRoll = Math.round(s.world.jingying * 1.05);
      }
      const g = s.chars[`gov:${r}`];
      if (g) g.loyalty = clamp(g.loyalty - 5, 0, 100);
      const d = local(draft('secret', 'bingbu', r, 'war', `〔確〕${regionName(r)}點驗兵數`), s);
      d.certified = true;
      d.free = true;
      core(d, `〔確〕點驗得：${lines.join('；')}。`, `${regionName(r)}點驗：${lines[0] ?? ''}`, '點驗的數字是確實的。名冊和實數的差，就是被吃掉的空餉。');
      d.claims.push({ key: `troops.${r}`, label: '實兵（點驗）', value: Math.round(reg.garrison), unit: '人' });
      post(s, d);
    },
  },
  {
    id: 'walls',
    cat: 'mil',
    name: '築城',
    desc: '修城、修邊牆：該地守城戰力 +30%。',
    target: 'region',
    targets: domestic,
    energy: 1,
    cost: () => ({ silver: 30 }),
    exec: 6,
    apply: (s, o) => {
      s.world.regions[o.target as RegionId].walls += 0.3;
      doneDoc(s, `${regionName(o.target as RegionId)}城工告竣`, '城工告竣。', '城牆修好了：守城更有利。');
    },
  },
  {
    id: 'ships',
    cat: 'mil',
    name: '造船',
    desc: '於沿海造戰船五十艘。渡海（台灣、東海）須有足夠水師：每五十人一艘。',
    target: 'region',
    targets: (s) => domestic(s).filter((x) => ['fujian', 'zhejiang', 'liangguang', 'shandong', 'nanzhili'].includes(x.id)),
    energy: 1,
    cost: () => ({ silver: 15 }),
    exec: 6,
    apply: (s) => {
      s.world.navy += 50;
      doneDoc(s, '戰船五十艘下水', '戰船五十艘下水。', `水師現有 ${s.world.navy} 艘。`);
    },
  },
  {
    id: 'firearms',
    cat: 'mil',
    name: '購西洋火器',
    desc: '向紅毛或澳門購紅夷大砲、鳥銃：火器營、浙兵、遼兵戰力 +15%，守城 +30%。須先與紅毛互市或優禮西洋教士。清流不滿。',
    target: 'none',
    energy: 1,
    cost: () => ({ silver: 30 }),
    exec: 6,
    factions: { qing: -1 },
    check: (s) => (s.world.mods.firearms ? '已經購置。' : s.world.mods.hongmaoTrade || s.world.westerner ? null : '須先與紅毛互市，或曾優禮西洋教士。'),
    apply: (s) => {
      s.world.mods.firearms = true;
      s.world.buffs.firearms = true;
      addStatus(s, 'cannon');
      doneDoc(s, '紅夷大砲運抵京師', '紅夷大砲、鳥銃運抵京師。', '西洋火器到了：守城 +30%，火器部隊更強。');
    },
  },
  {
    id: 'drill',
    cat: 'mil',
    name: '整頓京營',
    desc: '汰老弱、清空額、勤操練：京營戰力由六成升至九成，名冊縮至實數（省餉）；勳戚怨望 +10。',
    target: 'none',
    energy: 2,
    cost: () => ({ silver: 30 }),
    exec: 6,
    factions: { xun: -5 },
    check: (s) => (s.world.jingyingDrilled ? '京營已整頓過。' : null),
    apply: (s) => {
      s.world.jingyingDrilled = true;
      s.world.jingyingRoll = Math.round(s.world.jingying * 1.05);
      s.world.jingyingMorale = clamp(s.world.jingyingMorale + 0.15, 0.3, 1.2);
      addStatus(s, 'drilled');
      doneDoc(s, '京營整頓告成', '京營汰弱留強，操練一新。', '京營整頓好了：戰力提高、空額清掉（每旬省下不少餉）。');
    },
  },
  {
    id: 'monitor',
    cat: 'mil',
    name: '遣監軍',
    desc: '派監軍到某部：此後戰報不能灌水；但主將忠誠、士氣下降。',
    target: 'army',
    targets: armyTargets,
    energy: 1,
    exec: 0,
    apply: (s, o) => {
      const a = armyOf(s, o.target!);
      if (!a) return;
      s.world.cooldown[`mon:${a.id}`] = 1;
      a.morale = clamp(a.morale - 10, 0, 100);
      if (a.commander) s.chars[a.commander].loyalty = clamp(s.chars[a.commander].loyalty - 5, 0, 100);
    },
  },
  {
    id: 'campaign',
    cat: 'grand',
    name: '御駕親征',
    desc: '天子隨某部出征：前線戰報確實、士氣大振；京師成黑箱，權閹與皇叔加速。戰敗有被俘之險（賭性）。',
    target: 'army',
    targets: armyTargets,
    energy: 3,
    cost: () => ({ silver: 30 }),
    exec: 0,
    local: true,
    ancestral: true,
    factions: { xun: 3, qing: -3 },
    check: (s) => (s.world.emperor.campaignArmy ? '已在親征途中。' : s.world.emperor.illness ? '聖躬違和，不宜親征。' : null),
    apply: (s, o) => {
      const a = armyOf(s, o.target!);
      if (!a) return;
      s.world.emperor.campaignArmy = a.id;
      a.morale = clamp(a.morale + 25, 0, 100);
      event(s, 'court', `天子親征，隨${a.label}出京。`, true);
    },
  },

  // ───────── 人事 ─────────
  {
    id: 'appoint',
    cat: 'hr',
    name: '任免',
    desc: '撤換某職，從吏部會推或在野者中擇人。新官的派系得勢、舊官的派系怨望上升；新官要赴任（驛程）。',
    target: 'char',
    targets: (s) => allPosts(s).filter((id) => id !== 'silijian' && s.chars[id].status === 'active').map((id) => ({ id, label: `${postOf(s, id)?.name}・${s.chars[id].name}` })),
    params: (s, t) => {
      const p = postOf(s, t);
      if (!p) return [];
      const pool = [...candidates(s, t), ...reserves(s).filter((c) => c.status === 'away' && c.kind === (p.kind === 'eunuch' ? 'eunuch' : p.kind === 'military' ? 'military' : 'civil'))];
      const seen = new Set<string>();
      return pool.filter((c) => !seen.has(c.id) && seen.add(c.id)).slice(0, 8).map((c, i) => ({ id: c.id, label: `${i < 3 ? '【會推】' : '【特簡】'}${c.name}・${c.faction ? FACTION_NAME[c.faction] : '無黨'}` }));
    },
    energy: 1,
    exec: 0,
    check: (s, t) => {
      if (t === 'dongchang') {
        const eu = eunuchCase(s);
        if (eu && !eu.data.removed && !(s.world.prestige >= 50 || s.world.dowager >= 70 || clout(s).yan < 0.3 || s.perk === 'spies')) return '東廠在權閹掌握中：須朝望「頗孚眾望」以上、太后出面，或閹黨聲勢降到三成以下，才奪得回來。';
      }
      return null;
    },
    apply: (s, o) => {
      const post = o.target!;
      const old = s.chars[post];
      const oldFaction = old.faction;
      const oldFame = old.fame;
      if (appoint(s, post, o.param!)) return;
      const nw = s.chars[post];
      addClout(s, nw.faction, 2);
      addGrievance(s, oldFaction, 4 + oldFame / 10);
      if (oldFaction === 'yan') provoke(s, 8);
      if (post === 'dongchang') {
        s.world.dongchang = nw.faction === 'yan' ? 'eunuch' : 'crown';
        provoke(s, 15);
      }
      if (old.traits.includes('剛直')) addGrievance(s, 'qing', 5);
      s.log.push({ turn: s.turn, text: `任命${postOf(s, post)?.name}${nw.name}（代${old.name}）` });
    },
  },
  {
    id: 'arrestOfficial',
    cat: 'hr',
    name: '拿問京官',
    desc: '錦衣衛拿問某位京官或督師並抄家：貪者得銀；清白者便是冤獄。派系怨望大增。',
    target: 'char',
    targets: (s) => CAPITAL_POSTS.filter((p) => p.id !== 'silijian' && s.chars[p.id]?.status === 'active').map((p) => ({ id: p.id, label: `${p.name}・${s.chars[p.id].name}` })),
    energy: 1,
    exec: 1,
    odds: (s, t) => (['jinglue', 'sanbian', 'dongjiang'].includes(t) && s.chars[t].ambition > 60 ? clamp(1 - s.chars[t].ambition / 150, 0.2, 0.9) : undefined),
    apply: (s, o, ok) => {
      const id = o.target!;
      const c = s.chars[id];
      if (!ok) {
        result(s, `${c.title}${c.name}抗命`, false, `${c.title}${c.name}擁兵拒捕。`, '他擁兵抗命，拒絕被捕！');
        c.ambition = 100;
        return;
      }
      addGrievance(s, c.faction, 12);
      if (c.faction === 'yan') provoke(s, 10);
      if (c.integrity < 0.45) {
        const silver = int(s.rng, 10, 40);
        flow(s, '抄沒', `抄沒${c.name}`, { silver });
        addPrestige(s, 2);
        event(s, 'court', `拿問${c.title}${c.name}，抄沒銀${silver}萬兩。`, true);
      } else {
        s.world.wrongful.push(`${c.title}${c.name}`);
        addPrestige(s, -4);
        event(s, 'court', `拿問清白之${c.title}${c.name}，朝野稱冤。`, true);
      }
      const fac = c.faction;
      replaceChar(s, id, 0.6);
      s.chars[id].faction = chance(s.rng, 0.5) ? fac : null;
      if (id === 'dongchang') s.world.dongchang = s.chars[id].faction === 'yan' ? 'eunuch' : 'crown';
    },
  },
  {
    id: 'secretMemo',
    cat: 'hr',
    name: '賜密揭',
    desc: '准某人直接密奏（最多三人）：他的奏報不經票擬、不會被截留；他的派系得勢，他派眼紅。',
    target: 'char',
    targets: (s) => allPosts(s).filter((id) => !s.world.cooldown[`mijie:${id}`]).map((id) => ({ id, label: `${postOf(s, id)?.name}・${s.chars[id].name}` })),
    energy: 1,
    exec: 0,
    check: (s) => (Object.keys(s.world.cooldown).filter((k) => k.startsWith('mijie:') && s.world.cooldown[k]).length >= 3 ? '已賜三人。' : null),
    apply: (s, o) => {
      s.world.cooldown[`mijie:${o.target}`] = 1;
      const c = s.chars[o.target!];
      addClout(s, c.faction, 3);
      for (const f of ['yan', 'qing', 'zhe', 'xun'] as FactionId[]) if (f !== c.faction) addGrievance(s, f, 2);
      c.loyalty = clamp(c.loyalty + 10, 0, 100);
    },
  },
  {
    id: 'mediate',
    cat: 'hr',
    name: '調停黨爭',
    desc: '召兩派領袖面議：兩派怨望各降；勝算看兩派積怨。',
    target: 'none',
    params: () => {
      const fs: FactionId[] = ['yan', 'qing', 'zhe', 'xun'];
      const out: Param[] = [];
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push({ id: `${fs[i]}|${fs[j]}`, label: `${FACTION_NAME[fs[i]]}與${FACTION_NAME[fs[j]]}` });
      return out;
    },
    energy: 1,
    exec: 1,
    odds: (s, _t, p) => {
      const [a, b] = (p || 'yan|qing').split('|') as FactionId[];
      const g = s.world.factions;
      return clamp(0.8 - (g[a].grievance + g[b].grievance) / 250 - (a === 'yan' && b === 'qing' ? 0.2 : 0), 0.1, 0.9);
    },
    apply: (s, o, ok) => {
      const [a, b] = (o.param ?? '').split('|') as FactionId[];
      if (ok) {
        addGrievance(s, a, -12);
        addGrievance(s, b, -12);
        addStatus(s, 'harmony');
      } else {
        addGrievance(s, a, 5);
        addGrievance(s, b, 5);
      }
      result(s, ok ? '調停有成' : '調停不歡而散', ok, ok ? `${FACTION_NAME[a]}、${FACTION_NAME[b]}兩派各退一步。` : '兩派當殿爭執，不歡而散。', ok ? '兩派怨望都降了。' : '調停失敗，兩派更不滿。', 0.5);
    },
  },
  {
    id: 'jingcha',
    cat: 'hr',
    name: '京察',
    desc: '考察百官：嚴察罷黜三名貪劣督撫、吏治大改善，但百官怨懟（朝望 −4）；照例則小改善。',
    target: 'none',
    params: () => [
      { id: 'strict', label: '嚴察' },
      { id: 'normal', label: '照例' },
    ],
    energy: (_s, _t, p) => (p === 'strict' ? 2 : 1),
    exec: 3,
    check: (s) => ((s.world.cooldown.jingcha ?? -99) > s.turn ? '京察方畢，不宜再舉。' : null),
    onIssue: (s) => (s.world.cooldown.jingcha = s.turn + 24),
    apply: (s, o) => {
      const w = s.world;
      if (o.param === 'strict') {
        w.corruption = clamp(w.corruption - 15, 0, 100);
        addPrestige(s, -4);
        const bad = PROVINCES.filter((p) => s.chars[`gov:${p}`].integrity < 0.45).slice(0, 3);
        for (const p of bad) {
          addGrievance(s, s.chars[`gov:${p}`].faction, 5);
          const old = replaceChar(s, `gov:${p}`);
          event(s, 'court', `京察黜退${REGIONS[p].gov}${old}。`);
        }
      } else w.corruption = clamp(w.corruption - 6, 0, 100);
    },
  },
  {
    id: 'settle',
    cat: 'hr',
    name: '設官治理',
    desc: '在新附之地設府縣（台灣）或改土歸流：控制度 +30，開始繳錢糧；土司可能反抗。',
    target: 'region',
    targets: (s) => OUTER.filter((r) => s.world.regions[r].owner === 'crown' && s.world.regions[r].control < 90).map((r) => ({ id: r, label: `${regionName(r)}（控制度${Math.round(s.world.regions[r].control)}）` })),
    energy: 1,
    cost: () => ({ silver: 20 }),
    exec: 6,
    apply: (s, o) => {
      const r = s.world.regions[o.target as RegionId];
      r.control = clamp(r.control + 30, 0, 100);
      s.world.cooldown[`county:${o.target}`] = 1;
      if (chance(s.rng, 0.2)) addUnrest(s, o.target as RegionId, 20);
      doneDoc(s, `${regionName(o.target as RegionId)}設官`, `${regionName(o.target as RegionId)}設府縣、置流官。`, '新地設官治理了：開始繳錢糧，控制度上升。');
    },
  },

  // ───────── 財計 ─────────
  {
    id: 'tax',
    cat: 'fin',
    name: '稅則',
    desc: '寬徵：收入少一成五、民心漸好；照常；加派：收入多兩成、民心日壞（清流反對，閹黨歡迎）。',
    target: 'none',
    params: () => [
      { id: 'light', label: '寬徵' },
      { id: 'normal', label: '照常' },
      { id: 'heavy', label: '加派' },
    ],
    energy: 1,
    exec: 0,
    check: (s, _t, p) => (s.world.taxPolicy === p ? '已是此稅則。' : null),
    apply: (s, o) => {
      s.world.taxPolicy = o.param as 'light' | 'normal' | 'heavy';
      if (o.param === 'heavy') {
        addPrestige(s, -3);
        addStatus(s, 'anger');
        react(s, { yan: 2, qing: -4 });
      } else if (o.param === 'light') {
        addPrestige(s, 2);
        react(s, { qing: 2 });
      }
    },
  },
  {
    id: 'relief',
    cat: 'fin',
    name: '賑濟',
    desc: '發帑二十萬兩賑濟：當地民心回升；吏治差時一部分被侵吞。',
    target: 'region',
    targets: (s) => domestic(s).filter((x) => x.id !== 'jingshi'),
    energy: 1,
    cost: () => ({ silver: 20 }),
    exec: 0,
    factions: { qing: 1 },
    apply: (s, o) => {
      const leak = 1 - s.world.corruption / 200;
      const reg = s.world.regions[o.target as RegionId];
      reg.reliefUntil = s.turn + 6;
      addUnrest(s, o.target as RegionId, -12 * leak);
      event(s, 'routine', `賑銀到${regionName(o.target as RegionId)}${leak < 0.8 ? '，然多被胥吏侵漁' : '，饑民稍安'}。`);
    },
  },
  {
    id: 'remit',
    cat: 'fin',
    name: '蠲免',
    desc: '蠲免某省錢糧四月（只繳三成），民心回升。',
    target: 'region',
    targets: (s) => domestic(s).filter((x) => REGIONS[x.id as RegionId].tax > 0),
    energy: 1,
    exec: 0,
    factions: { qing: 1 },
    apply: (s, o) => {
      s.world.regions[o.target as RegionId].remitUntil = s.turn + 12;
      addUnrest(s, o.target as RegionId, -8);
    },
  },
  {
    id: 'mine',
    cat: 'fin',
    name: '開礦稅',
    desc: '遣礦監徵礦稅：內帑每旬 +4 萬，持續三十六旬；山西、河南民心日壞；清流大譁（違祖制，可能被封駁）。',
    target: 'none',
    energy: 1,
    exec: 2,
    ancestral: true,
    factions: { yan: 3, qing: -5 },
    check: (s) => (s.turn < s.world.mods.mineTaxUntil ? '礦稅正行。' : null),
    apply: (s) => (s.world.mods.mineTaxUntil = s.turn + 36),
  },
  {
    id: 'sea',
    cat: 'fin',
    name: '開海',
    desc: '開放海禁：每旬 +3 萬（招撫海商後再 +3）；違祖制，可能被封駁。',
    target: 'none',
    energy: 1,
    exec: 3,
    ancestral: true,
    factions: { zhe: 2, qing: -1 },
    check: (s) => (s.world.mods.seaTrade ? '已開海。' : null),
    apply: (s) => (s.world.mods.seaTrade = true),
  },
  {
    id: 'postcut',
    cat: 'fin',
    name: '裁驛',
    desc: '裁減驛站：每旬省 1.5 萬，但驛程延長兩成；驛卒失業，陝西或有投寇者（賭性）。',
    target: 'none',
    energy: 1,
    exec: 3,
    odds: () => 0.6,
    factions: { zhe: -2 },
    check: (s) => (s.world.mods.postCut ? '已裁驛。' : null),
    apply: (s, o, ok) => {
      s.world.mods.postCut = true;
      if (!ok) {
        const a = s.world.armies.find((x) => x.active && x.caseId === 'chuang');
        if (a) a.size += 3000;
        else addUnrest(s, 'shaanxi', 15);
        result(s, '陝西驛卒失業投寇', false, '裁驛之後，陝西驛卒數千人失業，多投流寇。', '裁驛的副作用：失業的驛卒跑去當流寇了。', 0.6);
      }
      void o;
    },
  },
  {
    id: 'stipend',
    cat: 'fin',
    name: '減宗祿',
    desc: '減宗室祿米：每旬省 1.5 萬；宗室與太后不滿，皇叔怨望（違祖制）。',
    target: 'none',
    energy: 1,
    exec: 0,
    ancestral: true,
    check: (s) => (s.world.mods.stipendCut ? '已減。' : null),
    apply: (s) => {
      s.world.mods.stipendCut = true;
      s.world.dowager = clamp(s.world.dowager - 10, 0, 100);
      const u = s.cases.find((c) => c.def === 'uncle');
      if (u) u.data.progress = Math.min(100, (u.data.progress ?? 0) + 5);
    },
  },
  {
    id: 'sell',
    cat: 'fin',
    name: '開捐納',
    desc: '賣官鬻爵：國庫 +20 萬；吏治變壞。每十二旬一次。',
    target: 'none',
    energy: 1,
    exec: 0,
    factions: { qing: -2 },
    check: (s) => ((s.world.cooldown.sell ?? -99) > s.turn ? '捐納方開，不宜再舉。' : null),
    apply: (s) => {
      s.world.cooldown.sell = s.turn + 12;
      flow(s, '開源', '開捐納', { silver: 20 });
      s.world.corruption = clamp(s.world.corruption + 5, 0, 100);
    },
  },
  {
    id: 'survey',
    cat: 'fin',
    name: '清丈田畝',
    desc: '十二旬後田賦應收永久 +15%；江南豪紳反彈（清流怨望大增、南直隸浙江可能民變）。',
    target: 'none',
    energy: 2,
    cost: () => ({ silver: 10 }),
    exec: 12,
    factions: { qing: -6, zhe: 1 },
    check: (s) => (s.world.mods.surveyed || s.turn < s.world.mods.surveyUntil ? '清丈已行。' : null),
    onIssue: (s) => {
      s.world.mods.surveyUntil = s.turn + 12;
      addStatus(s, 'reform', 12);
      if (chance(s.rng, 0.3)) {
        addUnrest(s, 'nanzhili', 15);
        addUnrest(s, 'zhejiang', 15);
      }
    },
    apply: (s) => {
      if (s.world.mods.surveyUntil === 0) return;
      s.world.mods.surveyed = true;
      doneDoc(s, '清丈告成', '天下田畝清丈告成，隱田盡出。', '清丈完成：田賦應收永久增加一成五。');
    },
  },
  {
    id: 'coin',
    cat: 'fin',
    name: '鑄大錢',
    desc: '鑄當十大錢：國庫 +40 萬；六旬後物價騰貴，京師民心大壞。',
    target: 'none',
    energy: 1,
    exec: 0,
    check: (s) => (s.world.mods.debasedTurn ? '已鑄過。' : null),
    apply: (s) => {
      flow(s, '開源', '鑄當十大錢', { silver: 40 });
      s.world.mods.debasedTurn = s.turn + 6;
    },
  },
  {
    id: 'privy',
    cat: 'fin',
    name: '發內帑',
    desc: '以皇帝私財補國庫；越多越心疼。',
    target: 'none',
    params: () => [
      { id: '10', label: '十萬' },
      { id: '30', label: '三十萬' },
      { id: '60', label: '六十萬' },
    ],
    energy: 0,
    cost: (_s, _t, p) => ({ privy: n(p) }),
    exec: 0,
    factions: { qing: 1 },
    apply: (s, o) => {
      flow(s, '內帑', '發內帑', { silver: n(o.param ?? '10') });
      addMood(s, -n(o.param ?? '10') / 6);
    },
  },
  {
    id: 'build',
    cat: 'fin',
    name: '京師營建',
    desc: '工部營建十項，花錢耗時，完工後永久生效。',
    target: 'none',
    params: (s) => PROJECTS.filter((p) => !s.world.projects.some((x) => x.id === p.id) && (!p.needWest || s.world.westerner)).map((p) => ({ id: p.id, label: `${p.name}（${p.cost}萬・${p.turns}旬）` })),
    energy: 1,
    exec: 0,
    check: (s, _t, p) => (s.world.projects.some((x) => !x.complete) ? '已有工程在建。' : !p ? '請選工程。' : null),
    apply: (s, o) => {
      const err = startProject(s, o.param!, false);
      if (err) doneDoc(s, '工部奏：不能興工', err, err);
    },
  },
  {
    id: 'settlers',
    cat: 'fin',
    name: '移民墾殖台灣',
    desc: '遷福建饑民一萬渡海墾殖：福建民心回升；十二旬後台灣每旬產糧。須控制台灣西岸（海商受撫或紅毛已逐）。',
    target: 'none',
    energy: 1,
    cost: () => ({ silver: 10 }),
    exec: 3,
    check: (s) => (s.world.powers.haishang.standing === 'annexed' || s.world.regions.taiwan.owner === 'crown' ? null : '台灣西岸不在朝廷控制下。'),
    apply: (s) => {
      s.world.mods.settlers += 1;
      addUnrest(s, 'fujian', -8);
      s.world.cooldown[`settle:${s.world.mods.settlers}`] = s.turn;
      doneDoc(s, '饑民渡海墾殖台灣', '福建饑民萬人渡海，墾殖台灣西岸。', '移民到台灣了：福建少了饑民，十二旬後台灣開始產糧。');
    },
  },

  // ───────── 密偵 ─────────
  {
    id: 'probe',
    cat: 'dc',
    name: '密查某人',
    desc: '東廠查某人的真實能力、操守、忠誠與暗中派系。東廠在天子手中時完全確實；有曝光之險，查得越高越危險。',
    target: 'char',
    targets: (s) => Object.values(s.chars).filter((c) => c.status === 'active' && c.id !== 'dongchang').map((c) => ({ id: c.id, label: `${c.title}${c.name}` })),
    energy: 1,
    cost: () => ({ silver: 2 }),
    exec: 1,
    local: true,
    apply: (s, o) => {
      probePerson(s, o.target!);
      exposeRoll(s, o.target!);
    },
  },
  {
    id: 'frame',
    cat: 'dc',
    name: '羅織',
    desc: '東廠捏造罪證，使某人去職。賭性：曝光即最重的後果。被羅織者的派系怨望 +15，史書記為冤獄。',
    target: 'char',
    targets: (s) => allPosts(s).filter((id) => s.chars[id].status === 'active' && id !== 'dongchang').map((id) => ({ id, label: `${postOf(s, id)?.name}・${s.chars[id].name}` })),
    energy: 1,
    cost: () => ({ silver: 5 }),
    exec: 2,
    local: true,
    check: (s) => (s.world.dongchang !== 'crown' ? '東廠不在朕手。' : null),
    odds: (s, t) => {
      const lv = t.startsWith('gov:') ? 1 : ['shoufu', 'cifu', 'silijian'].includes(t) ? 3 : 2;
      return clamp(0.85 - lv * 0.12, 0.3, 0.8);
    },
    apply: (s, o, ok) => {
      const c = s.chars[o.target!];
      if (!ok) {
        exposed(s, o.target!, true);
        return;
      }
      addGrievance(s, c.faction, 15);
      if (c.faction === 'yan') provoke(s, 10);
      s.world.wrongful.push(`${c.title}${c.name}（東廠羅織）`);
      const fac = c.faction;
      replaceChar(s, o.target!, 0.6);
      s.chars[o.target!].faction = chance(s.rng, 0.5) ? fac : null;
      event(s, 'court', `東廠羅織${c.title}${c.name}，下獄去職。`, true);
    },
  },
  {
    id: 'inquisition',
    cat: 'dc',
    name: '興文字獄',
    desc: '指控某派要員文字悖逆：成則一舉重挫該派（聲勢大降）；言路收縮、士林寒心；事洩即羅織之名坐實。',
    target: 'faction',
    targets: () => (['yan', 'qing', 'zhe', 'xun'] as FactionId[]).map((f) => ({ id: f, label: FACTION_NAME[f] })),
    energy: 1,
    cost: () => ({ silver: 5 }),
    exec: 2,
    local: true,
    check: (s) => (s.world.dongchang !== 'crown' ? '東廠不在朕手。' : null),
    odds: () => 0.6,
    apply: (s, o, ok) => {
      const f = o.target as FactionId;
      s.world.speech = clamp(s.world.speech - 15, 0, 100);
      addStatus(s, 'chill');
      if (!ok) {
        exposed(s, null, true);
        addGrievance(s, f, 25);
        return;
      }
      addClout(s, f, -10);
      addGrievance(s, f, 20);
      s.world.wrongful.push(`${FACTION_NAME[f]}諸臣（文字獄）`);
      result(s, `文字獄興，${FACTION_NAME[f]}重挫`, true, `${FACTION_NAME[f]}要員數人以文字悖逆下獄。`, `${FACTION_NAME[f]}聲勢大挫。但言路收縮，以後聽到的真話更少了。`, 0.6);
    },
  },

  // ───────── 內廷 ─────────
  {
    id: 'harem',
    cat: 'pal',
    name: '後宮',
    desc: '賞賜、晉封、冷落、打入冷宮、廢后、立后。晉封會讓她娘家所屬的派系得勢；廢立需太后首肯。',
    target: 'consort',
    targets: (s) => s.consorts.filter((c) => c.status === 'active').map((c) => ({ id: c.id, label: `${s.chars[c.id].name}${RANKS[c.rank]}` })),
    params: () => [
      { id: 'reward', label: '賞賜（內帑三萬）' },
      { id: 'promote', label: '晉封' },
      { id: 'cold', label: '冷落' },
      { id: 'exile', label: '打入冷宮' },
      { id: 'depose', label: '廢后' },
      { id: 'crown', label: '立為皇后' },
    ],
    energy: (_s, _t, p) => (p === 'reward' ? 0 : p === 'depose' || p === 'crown' ? 2 : 1),
    exec: 0,
    local: true,
    check: (s, t, p) => {
      const c = s.consorts.find((x) => x.id === t);
      if (!c) return '無此人。';
      if (p === 'depose' && c.rank !== 6) return '只能廢皇后。';
      if (p === 'crown' && (s.consorts.some((x) => x.rank === 6 && x.status === 'active') || c.rank < 3)) return '中宮未虛，或位分不到妃。';
      return null;
    },
    apply: (s, o) => {
      const err = haremAct(s, o.target!, o.param!);
      if (err) doneDoc(s, '尚宮局奏', err, err);
    },
  },
  {
    id: 'heir',
    cat: 'pal',
    name: '立儲',
    desc: '冊立太子：皇叔的圖謀大挫、國本以定。立非嫡長，清流與太后力爭。',
    target: 'child',
    targets: (s) => s.children.filter((c) => c.son && c.alive && s.heir !== c.id).map((c) => ({ id: c.id, label: c.name })),
    energy: 2,
    exec: 1,
    local: true,
    apply: (s, o) => {
      designate(s, o.target!);
    },
  },
  {
    id: 'select',
    cat: 'pal',
    name: '選秀',
    desc: '廣選淑女入宮（一至三人），家世各屬不同派系。每三十六旬一次。',
    target: 'none',
    energy: 1,
    cost: () => ({ privy: 10 }),
    exec: 3,
    check: (s) => ((s.world.cooldown.select ?? -99) > s.turn ? '近年方選過。' : null),
    onIssue: (s) => (s.world.cooldown.select = s.turn + 36),
    apply: (s) => {
      const k = int(s.rng, 1, 3);
      for (let i = 0; i < k; i++) makeConsort(s, 1, pick(s.rng, ['yan', 'qing', 'zhe', 'xun', null] as (FactionId | null)[]));
      doneDoc(s, `選秀入宮${k}人`, `選得淑女${k}人入宮，俱封貴人。`, '新人入宮了，可以在後宮看到。');
    },
  },
  {
    id: 'guard',
    cat: 'pal',
    name: '加強宿衛',
    desc: '護衛提高一級（十二旬），每旬國庫 −1 萬。',
    target: 'none',
    energy: 1,
    exec: 0,
    local: true,
    apply: (s) => addStatus(s, 'guard'),
  },
  {
    id: 'filial',
    cat: 'pal',
    name: '晨昏定省',
    desc: '往慈寧宮問安：太后好感 +5（六旬內只算一次）。',
    target: 'none',
    energy: 1,
    exec: 0,
    local: true,
    apply: (s) => {
      if ((s.world.once.filial ?? -99) > s.turn - 6) return;
      s.world.once.filial = s.turn;
      s.world.dowager = clamp(s.world.dowager + 5, 0, 100);
    },
  },
  {
    id: 'rest',
    cat: 'pal',
    name: '罷朝靜養',
    desc: '本旬不再下旨、不再細讀：勞損 −3、病中好轉較快；但奏摺全依票擬，權臣更放肆。',
    target: 'none',
    energy: 0,
    exec: 0,
    local: true,
    apply: (s) => {
      s.world.emperor.restUntil = s.turn + 1;
      s.world.cooldown.restTurn = s.turn;
      if (s.world.emperor.illness) s.world.emperor.illness.treat += 0.15;
    },
  },

  // ───────── 大計 ─────────
  {
    id: 'contrition',
    cat: 'grand',
    name: '罪己詔',
    desc: '下詔罪己：朝望 +10、各地民心好轉；龍顏大損。每局兩次，第二次減半。',
    target: 'none',
    energy: 1,
    exec: 0,
    local: true,
    check: (s) => ((s.world.once.contrition ?? 0) >= 2 ? '已下過兩次。' : null),
    apply: (s) => {
      const k = (s.world.once.contrition ?? 0) === 0 ? 1 : 0.5;
      s.world.once.contrition = (s.world.once.contrition ?? 0) + 1;
      addPrestige(s, 10 * k);
      for (const r of PROVINCES) addUnrest(s, r, -5 * k);
      addMood(s, -15);
    },
  },
  {
    id: 'amnesty',
    cat: 'grand',
    name: '大赦天下',
    desc: '民心好轉；冤獄平反（朝望回升）；吏治略壞。每三十六旬一次。',
    target: 'none',
    energy: 1,
    exec: 0,
    local: true,
    check: (s) => ((s.world.once.amnesty ?? -99) > s.turn - 36 ? '赦令方頒。' : null),
    apply: (s) => {
      s.world.once.amnesty = s.turn;
      for (const r of PROVINCES) addUnrest(s, r, -8);
      addPrestige(s, Math.min(8, s.world.wrongful.length * 2));
      s.world.corruption = clamp(s.world.corruption + 5, 0, 100);
    },
  },
  {
    id: 'lecture',
    cat: 'grand',
    name: '開經筵',
    desc: '與儒臣講論經史：狀態「君臣相得」（封駁減半）；清流欣慰。',
    target: 'none',
    energy: 1,
    exec: 0,
    local: true,
    factions: { qing: 2 },
    check: (s) => ((s.world.cooldown.lecture ?? -99) > s.turn ? '經筵方畢。' : null),
    onIssue: (s) => (s.world.cooldown.lecture = s.turn + 12),
    apply: (s) => addStatus(s, 'harmony'),
  },
  {
    id: 'south',
    cat: 'grand',
    name: '南遷',
    desc: '籌劃三旬，遷都南京：帶走國庫七成、太倉三成、京營六成；朝望 −25；北方驛程變長、控制度下降。撐到五年終局為「偏安」。',
    target: 'none',
    energy: 3,
    exec: 3,
    local: true,
    ancestral: true,
    factions: { qing: -5, xun: -3 },
    check: (s) => (s.world.capital !== 'jingshi' ? '已不在北京。' : s.world.relocating ? '遷都正在籌劃。' : null),
    onIssue: (s) => (s.world.relocating = { kind: 'south', until: s.turn + 3 }),
    apply: (s) => relocate(s, 'south'),
  },
  {
    id: 'flee',
    cat: 'grand',
    name: '出奔',
    desc: '京師危急時棄城南走：只帶走內帑一半、京營兩成；成敗看敵軍多近（賭性）。被擒即亡國。',
    target: 'none',
    energy: 0,
    exec: 0,
    local: true,
    check: (s) => {
      if (s.world.capital !== 'jingshi') return '已不在北京。';
      const near = hostileArmies(s).some((a) => a.region === 'jingshi' || (a.path[0] === 'jingshi' && a.size > 8000));
      return near ? null : '京師尚未告急。';
    },
    odds: (s) => (hostileArmies(s).some((a) => a.region === 'jingshi') ? 0.35 : 0.65),
    apply: (s, _o, ok) => {
      if (!ok) {
        event(s, 'court', '天子出奔，為追騎所及。', true);
        s.over = { reason: 'captured', turn: s.turn };
        return;
      }
      relocate(s, 'flee');
    },
  },
  {
    id: 'return',
    cat: 'grand',
    name: '還都北京',
    desc: '收復北京且駐軍五萬以上時，可以還都：籌劃六旬，朝望 +20。',
    target: 'none',
    energy: 3,
    cost: () => ({ silver: 50 }),
    exec: 6,
    local: true,
    check: (s) => {
      if (s.world.capital === 'jingshi') return '京師在北京。';
      const troopsAt = s.world.regions.jingshi.garrison + crownArmies(s).filter((a) => a.region === 'jingshi').reduce((m, a) => m + a.size, 0);
      return s.world.regions.jingshi.heldBy || troopsAt < 50000 ? '北京未復，或駐軍不足五萬。' : null;
    },
    apply: (s) => {
      s.world.capital = 'jingshi';
      addPrestige(s, 20);
      event(s, 'court', '天子還都北京。', true);
    },
  },
];

function powerName(id: string): string {
  return POWERS.find((p) => p.id === id)?.name ?? id;
}

function outerCheck(s: GameState, r: RegionId): string | null {
  if (!REGIONS[r] || REGIONS[r].kind !== 'outer') return null;
  const owner = s.world.regions[r].owner;
  if (owner === 'crown') return null;
  if (hostileArmies(s).some((a) => a.region === r && !a.power?.length)) return null;
  if (hostileArmies(s).some((a) => a.region === r && a.power?.startsWith('warlord'))) return null;
  const ps = s.world.powers[owner];
  if (ps && ps.standing !== 'hostile') return `${powerName(owner)}與本朝${ps.standing === 'truce' ? '停戰中' : '並未交兵'}：須先宣戰。`;
  return null;
}

function doneDoc(s: GameState, title: string, text: string, plain: string): void {
  const d = local(draft('notice', 'court', 'jingshi', 'court', title), s);
  d.free = true;
  core(d, text, title, plain);
  post(s, d);
}

function relocate(s: GameState, kind: 'south' | 'flee'): void {
  const w = s.world;
  const south = kind === 'south';
  const lostSilver = w.treasury * (south ? 0.3 : 0.8);
  flow(s, '遷都', south ? '南遷損耗' : '出奔棄置', { silver: -lostSilver, grain: -w.grain * (south ? 0.7 : 0.9), privy: south ? 0 : -w.privy * 0.5 });
  const move = Math.round(w.jingying * (south ? 0.6 : 0.2));
  w.regions.jingshi.garrison += w.jingying - move;
  w.regions.jingshi.roll += w.jingying - move;
  w.jingying = move;
  w.jingyingRoll = Math.round(move * 1.2);
  w.capital = 'nanzhili';
  w.relocating = undefined;
  addPrestige(s, south ? -25 : -35);
  for (const r of NORTH) w.regions[r].control = Math.max(0, w.regions[r].control - 20);
  for (const id of ['jianzhou', 'chahar', 'khalkha']) if (w.powers[id]) w.powers[id].hostility = clamp(w.powers[id].hostility + 15, 0, 100);
  // 出奔：一部分大臣失散
  if (!south) for (const p of CAPITAL_POSTS) if (chance(s.rng, 0.3) && s.chars[p.id]) replaceChar(s, p.id);
  for (const a of hostileArmies(s)) if (a.path.length) a.path = a.path.filter((x) => x !== 'jingshi').concat([]);
  event(s, 'court', south ? '天子南遷，駐蹕南京。' : '京師危急，天子倉皇出奔，輾轉至南京。', true);
  const d = local(draft('notice', 'court', 'jingshi', 'court', south ? '鑾輿南巡，駐蹕南京' : '天子出奔'), s);
  d.free = true;
  d.highlight = '遷　都';
  core(d, south ? '六軍扈從，鑾輿抵南京，以應天府為行在。' : '倉皇出德勝門，晝夜南奔，百官多散失。', south ? '遷都南京' : '出奔南京', `京師已在南京。北方的奏報會更慢、北方各地控制力下降。撐到第五年年終，結局是「偏安」；若能收復北京並駐軍五萬，可以還都。`);
  post(s, d);
}

// ───────────────────────── 外交（由外藩行動產生） ─────────────────────────

export function dipEdicts(s: GameState, id: string) {
  return foreignActions(s, id);
}

// ───────────────────────── 下旨 ─────────────────────────

export function edictDef(id: string): EdictDef | undefined {
  return EDICTS.find((e) => e.id === id);
}

export function edictEnergy(s: GameState, def: EdictDef, t: string, p: string): number {
  return typeof def.energy === 'function' ? def.energy(s, t, p) : def.energy;
}

export function edictExec(s: GameState, def: EdictDef, t: string, p: string): number {
  return typeof def.exec === 'function' ? def.exec(s, t, p) : def.exec;
}

/** 送達所需旬數 */
export function edictTravel(s: GameState, def: EdictDef, t: string): number {
  if (def.local || !t) return 0;
  switch (def.target) {
    case 'region':
      return REGIONS[t as RegionId] ? travelTurns(s, t as RegionId) : 0;
    case 'army': {
      const a = armyOf(s, t);
      return a ? travelTurns(s, a.region) : 0;
    }
    case 'char': {
      const c = s.chars[t];
      return c ? travelTurns(s, c.region) : 0;
    }
    case 'power':
      return travelTurns(s, powerDef(t).home);
    default:
      return 0;
  }
}

export interface EdictPreview {
  energy: number;
  cost: Cost;
  travel: number;
  exec: number;
  done: number;
  odds?: number;
  oddsText?: string;
  veto: number;
  block: string | null;
}

export function previewEdict(s: GameState, id: string, t: string, p: string): EdictPreview {
  const def = edictDef(id)!;
  const energy = edictEnergy(s, def, t, p);
  const ready = def.target === 'none' || !!t;
  const cost = ready ? def.cost?.(s, t, p) ?? {} : {};
  const travel = edictTravel(s, def, t);
  const exec = edictExec(s, def, t, p);
  const odds = ready ? def.odds?.(s, t, p) : undefined;
  return { energy, cost, travel, exec, done: s.turn + travel + exec, odds, oddsText: odds !== undefined ? oddsText(odds) : undefined, veto: def.ancestral ? vetoRate(s) : 0, block: blockReason(s, def, t, p, energy, cost) };
}

function blockReason(s: GameState, def: EdictDef, t: string, p: string, energy: number, cost: Cost): string | null {
  const w = s.world;
  if (s.over) return '本局已終。';
  if (s.world.cooldown.restTurn === s.turn && def.id !== 'rest') return '本旬罷朝靜養，不再下旨。';
  if (def.target !== 'none' && !t) return '請選對象。';
  if (def.params && !p) return '請選辦法。';
  if (s.energy - energy < -3) return '精力已透支到極限。';
  if ((cost.silver ?? 0) > w.treasury) return `戶部奏：庫銀不足 ${Math.round(cost.silver!)} 萬兩。`;
  if ((cost.privy ?? 0) > w.privy) return '內帑不足。';
  if ((cost.grain ?? 0) > w.grain) return '太倉存糧不足。';
  if (s.orders.some((o) => o.edict === def.id && o.issuedTurn === s.turn && (o.target ?? '') === t)) return '本旬已下過此旨。';
  return def.check?.(s, t, p) ?? null;
}

export function vetoRate(s: GameState): number {
  const sf = s.chars.shoufu;
  let p = sf.traits.includes('剛直') ? 0.3 : sf.traits.includes('迂腐') ? 0.25 : 0.1;
  if (sf.faction === 'qing') p += 0.2;
  if (sf.loyalty >= 75) p -= 0.1;
  p *= 1 + Math.min(0, -0.5 * (s.world.statuses.some((x) => x.id === 'harmony' && x.until > s.turn) ? 1 : 0));
  return clamp(p, 0, 0.7);
}

/** 下旨。bypass：強行頒下或中旨（越過封駁） */
export function issueEdict(s: GameState, id: string, t = '', p = '', bypass = false): string | null {
  const def = edictDef(id);
  if (!def) return '無此詔書。';
  const energy = edictEnergy(s, def, t, p);
  const cost = def.cost?.(s, t, p) ?? {};
  const block = blockReason(s, def, t, p, energy, cost);
  if (block) return block;
  if (def.ancestral && !bypass && chance(s.rng, vetoRate(s))) {
    vetoDoc(s, def, t, p);
    return `首輔${s.chars.shoufu.name}封還詔書，言其有違祖制（見奏摺匣）。`;
  }
  spend(s, energy);
  flow(s, catFlow(def.cat), def.name, { silver: -(cost.silver ?? 0), privy: -(cost.privy ?? 0), grain: -(cost.grain ?? 0) });
  const travel = edictTravel(s, def, t);
  const exec = edictExec(s, def, t, p);
  const o: Order = {
    id: s.nextId++,
    kind: 'edict',
    edict: def.id,
    region: def.target === 'region' ? (t as RegionId) : s.world.capital,
    target: t,
    param: p,
    issuedTurn: s.turn,
    arriveTurn: s.turn + travel,
    doneTurn: s.turn + travel + exec,
    status: 'transit',
    label: edictLabel(s, def, t, p),
  };
  def.onIssue?.(s, t, p, o);
  s.orders.push(o);
  if (def.factions) react(s, def.factions);
  s.stats.edicts += 1;
  s.stats.orders += 1;
  s.log.push({ turn: s.turn, text: `下旨：${o.label}` });
  if (travel + exec === 0) runEdict(s, o);
  return null;
}

function catFlow(c: EdictCat): string {
  return c === 'mil' ? '軍費' : c === 'dip' ? '外交' : c === 'dc' ? '查核' : c === 'pal' ? '宮廷' : c === 'fin' ? '撥款' : '其他';
}

export function edictLabel(s: GameState, def: EdictDef, t: string, p: string): string {
  const tl = def.targets?.(s).find((x) => x.id === t)?.label ?? (t && REGIONS[t as RegionId] ? regionName(t as RegionId) : t && s.chars[t] ? s.chars[t].name : '');
  const pl = def.params?.(s, t).find((x) => x.id === p)?.label ?? (def.id === 'stratagem' ? CARDS[p.split('|')[0]]?.name : '');
  return [def.name, tl.replace(/（.*）/, ''), pl].filter(Boolean).join('・');
}

function runEdict(s: GameState, o: Order): void {
  if (o.applied) return;
  o.applied = true;
  o.status = 'done';
  const def = edictDef(o.edict!);
  if (!def) return;
  const odds = def.odds?.(s, o.target ?? '', o.param ?? '');
  const ok = odds === undefined ? true : drawLot(s, odds).ok;
  def.apply(s, o, ok);
}

/** 每旬：到期的詔書生效 */
export function edictTick(s: GameState): void {
  for (const o of s.orders) {
    if (!o.edict || o.applied) continue;
    if (s.turn >= (o.doneTurn ?? o.arriveTurn)) {
      runEdict(s, o);
      if (s.over) return;
    }
  }
  // 南遷籌劃期間，京師人心浮動
  if (s.world.relocating && s.turn < s.world.relocating.until) addUnrest(s, 'jingshi', 10);
}

function vetoDoc(s: GameState, def: EdictDef, t: string, p: string): void {
  const sf = s.chars.shoufu;
  const d = local(draft('task', 'shoufu', 'jingshi', 'court', `首輔封還〈${def.name}〉之詔`), s);
  d.importance = 3;
  core(d, `臣${sf.name}謹奏：〈${def.name}〉有違祖宗成法，臣不敢奉詔，謹封還原詔。`, `首輔封駁〈${def.name}〉`, `首輔認為這道詔書違反祖制，退回不擬旨。可以收回、強行頒下（朝望 −5、首輔派系怨望 +10），或繞過內閣、由司禮監下「中旨」（朝望 −8，言官大譁）。`);
  task(d, 'edict:veto', [
    { id: 'withdraw', label: '收回成命', note: '照首輔的意思。' },
    { id: 'force', label: '強行頒下', note: '朝望 −5；首輔派系怨望 +10。' },
    { id: 'zhongzhi', label: '改下中旨', note: '朝望 −8；言路 −5；司禮監更得勢。' },
  ], 'withdraw', s.turn + 1, { data: { edict: def.id, target: t, param: p } });
  post(s, d);
}

export function applyVetoChoice(s: GameState, doc: { task?: { data?: Record<string, string | number> } }, id: string): void {
  const data = doc.task?.data ?? {};
  if (id === 'withdraw') return;
  if (id === 'force') {
    addPrestige(s, -5);
    addGrievance(s, s.chars.shoufu.faction, 10);
  } else {
    addPrestige(s, -8);
    s.world.speech = clamp(s.world.speech - 5, 0, 100);
    addClout(s, 'yan', 2);
  }
  const err = issueEdict(s, String(data.edict), String(data.target ?? ''), String(data.param ?? ''), true);
  if (err) s.log.push({ turn: s.turn, text: `詔書未能頒行：${err}` });
}

// ───────────────────────── 外交、地方旨意的包裝 ─────────────────────────

/** 外交行動：送達對方後生效 */
export function issueDip(s: GameState, powerId: string, kind: string): string | null {
  const a = foreignActions(s, powerId).find((x) => x.kind === kind);
  if (!a) return '此策不可行。';
  if (a.block) return a.block;
  if (s.energy - a.energy < -3) return '精力已透支到極限。';
  if (s.world.cooldown.restTurn === s.turn) return '本旬罷朝靜養，不再下旨。';
  if (s.world.treasury < a.silver) return '庫銀不足。';
  if (s.orders.some((o) => o.edict === `dip:${kind}` && o.target === powerId && o.issuedTurn === s.turn)) return '本旬已議過此事。';
  if (!alive(s, powerId)) return '此國已不存。';
  spend(s, a.energy);
  flow(s, '外交', `${powerDef(powerId).name}：${a.label}`, { silver: -a.silver });
  const travel = travelTurns(s, powerDef(powerId).home);
  const o: Order = { id: s.nextId++, kind: 'edict', edict: `dip:${kind}`, region: s.world.capital, target: powerId, param: kind, issuedTurn: s.turn, arriveTurn: s.turn + travel, doneTurn: s.turn + travel, status: 'transit', label: `${powerDef(powerId).name}・${a.label}` };
  (o as Order & { odds?: number }).odds = a.odds;
  s.orders.push(o);
  s.stats.edicts += 1;
  s.log.push({ turn: s.turn, text: `外交：${o.label}` });
  return null;
}

export function dipTick(s: GameState): void {
  for (const o of s.orders) {
    if (!o.edict?.startsWith('dip:') || o.applied || s.turn < (o.doneTurn ?? 0)) continue;
    o.applied = true;
    o.status = 'done';
    const odds = (o as Order & { odds?: number }).odds;
    const ok = odds === undefined ? true : drawLot(s, odds).ok;
    applyDip(s, o.target!, o.param!, ok);
    if (odds !== undefined) result(s, `${o.label}：${ok ? '事成' : '不成'}`, ok, `${o.label}，${ok ? '事成' : '事不成'}。`, ok ? '外交行動成功了。' : '外交行動失敗了。', odds);
  }
}

/** 地方旨意（密查、巡按、召見、拿問地方官……）沿用舊系統 */
export function regionOrders(s: GameState, region: RegionId) {
  return orderOptions(s, region);
}

export function issueRegionOrder(s: GameState, region: RegionId, kind: string, caseId?: string): string | null {
  const opt = orderOptions(s, region).find((o) => o.kind === kind && (!caseId || o.caseId === caseId));
  if (!opt) return '此旨不可行。';
  return issueOrder(s, opt);
}

export { CAT_NAME as EDICT_CATS };
export type { Army };
void sendDetachment;
void pick;
