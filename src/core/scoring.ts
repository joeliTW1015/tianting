// 局末史書：揭露每件疑案的真相、你的判讀、謊言簿、實錄、評分與諡號。

import { caseTitle, CASE_DEFS } from './cases';
import { discoveredCases } from './actions';
import { PROJECTS } from './palace';
import { powerDef } from './foreign';
import { ALL_REGIONS, PROVINCES } from './geography';
import { allPosts, FACTION_NAME, postOf } from './people';
import type { EndReason, EndingKind, GameState, TruthEvent } from './types';

export interface Verdict {
  key: string;
  title: string;
  truth: string;
  branchLabel: string;
  belief: string;
  correct: boolean;
  discovered: boolean;
  started: boolean;
  outcome: string;
  points: number;
  maxPoints: number;
}

export interface LieGroup {
  from: string;
  label: string;
  firstTurn: number;
  lastTurn: number;
  count: number;
  readCount: number;
  claimed: string;
  truth: string;
}

export interface Chronicle {
  reason: EndReason;
  ending: EndingKind;
  endingName: string;
  breakdown: { label: string; points: number }[];
  officials: { post: string; name: string; truth: string; belief: string; match: boolean | null }[];
  owned: number;
  turn: number;
  score: number;
  posthumous: string;
  meaning: string;
  verdicts: Verdict[];
  shoufu: Verdict;
  lies: { topic: string; title: string; groups: LieGroup[] }[];
  events: (TruthEvent & { topicTitle: string })[];
  roles: { name: string; truth: string }[];
  wrongful: string[];
  stats: GameState['stats'] & { lieCount: number; omittedClues: number; suppressed: number; treasury: number; grain: number; prestige: number; projects: string[]; heirs: number; illnesses: number };
}

const REASON_TEXT: Record<EndReason, string> = {
  zhongxing: '中興',
  survived: '守成',
  southern: '偏安江南',
  capital: '京師陷落',
  mutiny: '京營譁變',
  famine: '京師大饑',
  captured: '天子蒙塵',
  coup: '群臣廢立',
  palace: '宮變被廢',
  illness: '病篤駕崩',
  assassinated: '遇刺駕崩',
};

export const ENDING_NAME: Record<EndingKind, string> = { zhongxing: '中興', shoucheng: '守成', pianan: '偏安', wangguo: '亡國', jiabeng: '駕崩', beifei: '被廢' };

export function endingKind(r: EndReason): EndingKind {
  if (r === 'zhongxing') return 'zhongxing';
  if (r === 'survived') return 'shoucheng';
  if (r === 'southern') return 'pianan';
  if (r === 'illness' || r === 'assassinated') return 'jiabeng';
  if (r === 'coup' || r === 'palace') return 'beifei';
  return 'wangguo';
}

export function reasonText(r: EndReason): string {
  return REASON_TEXT[r];
}

export function shoufuOptions(state: GameState): { value: string; label: string }[] {
  return [{ value: 'clean', label: '清正無私' }, ...discoveredCases(state).map((c) => ({ value: c.uid, label: `袒護「${caseTitle(c)}」相關之人` }))];
}

export function chronicle(state: GameState): Chronicle {
  const w = state.world;
  const over = state.over ?? { reason: 'survived' as const, turn: state.turn };
  const seenCases = new Set(discoveredCases(state).map((c) => c.uid));

  const verdicts: Verdict[] = state.cases.map((c) => {
    const def = CASE_DEFS[c.def];
    const started = state.turn >= c.startTurn;
    const sc = started ? def.score(state, c) : { points: 0, outcome: '此事尚未發生，本局已結束。' };
    const belief = state.beliefs[c.uid];
    return {
      key: c.uid,
      title: caseTitle(c),
      truth: def.truth(state, c),
      branchLabel: def.branches.find((b) => b.id === c.branch)?.label ?? c.branch,
      belief: def.branches.find((b) => b.id === belief)?.label ?? (seenCases.has(c.uid) ? '未下判斷' : '始終未曾察覺'),
      correct: belief === c.branch,
      discovered: seenCases.has(c.uid),
      started,
      outcome: (c.resolved ? c.resolved.text + ' ' : '') + sc.outcome,
      points: sc.points,
      maxPoints: 20,
    };
  });

  const sb = w.shoufu;
  const protectedCase = state.cases.find((c) => c.uid === sb);
  const shoufuVerdict: Verdict = {
    key: 'shoufu',
    title: '首輔票擬',
    truth: sb === 'clean' ? '首輔清正，票擬雖有疏漏，並無私心。' : `首輔袒護「${protectedCase ? caseTitle(protectedCase) : ''}」的相關之人，凡此事的票擬都替他們遮掩。`,
    branchLabel: sb === 'clean' ? '清正無私' : '有所袒護',
    belief: shoufuOptions(state).find((o) => o.value === state.beliefs.shoufu)?.label ?? '未下判斷',
    correct: state.beliefs.shoufu === sb,
    discovered: true,
    started: true,
    outcome: state.chars.shoufu.term > 1 ? '首輔已被罷免。' : '',
    points: 0,
    maxPoints: 0,
  };

  const started = verdicts.filter((v) => v.started);
  const caseSum = started.reduce((n, v) => n + v.points, 0);
  const correct = verdicts.filter((v) => v.correct).length + (shoufuVerdict.correct ? 1 : 0);
  const ending = endingKind(over.reason);
  const owned = ALL_REGIONS.filter((r) => (w.regions[r].owner === 'crown' || !w.regions[r].owner) && !w.regions[r].heldBy).length;
  const avgUnrest = PROVINCES.reduce((n, p) => n + w.regions[p].unrest, 0) / PROVINCES.length;
  const officials = allPosts(state).map((id) => {
    const c = state.chars[id];
    const loyal = c.loyalty >= 60 ? 'trust' : c.loyalty >= 35 ? 'doubt' : 'distrust';
    const b = state.trust[id];
    return {
      post: postOf(state, id)?.name ?? c.title,
      name: c.name,
      truth: `統兵${c.abil.mil}・治政${c.abil.gov}・理財${c.abil.fin}・謀略${c.abil.wit}；操守${c.integrity >= 0.7 ? '廉' : c.integrity >= 0.45 ? '中' : '貪'}；忠誠${Math.round(c.loyalty)}；野心${Math.round(c.ambition)}${c.secretFaction ? `；暗附${FACTION_NAME[c.secretFaction]}` : ''}`,
      belief: b === 'trust' ? '可信' : b === 'doubt' ? '存疑' : b === 'distrust' ? '不可信' : '—',
      match: b ? b === loyal : null,
    };
  });
  const judged = officials.filter((o) => o.match !== null);
  const breakdown = [
    { label: `結局（${ENDING_NAME[ending]}）`, points: { zhongxing: 30, shoucheng: 20, pianan: 12, jiabeng: 8, beifei: 4, wangguo: 0 }[ending] },
    { label: '事件鏈處置', points: Math.round((caseSum / Math.max(1, started.length * 20)) * 30) },
    { label: '疆域', points: Math.max(0, Math.min(10, 5 + (owned - state.startOwned) * 2)) },
    { label: '國力', points: Math.round((w.treasury >= 200 ? 4 : w.treasury >= 80 ? 2 : 0) + (w.grain >= 100 ? 2 : 0) + (w.prestige / 100) * 5 + (avgUnrest < 45 ? 2 : 0) + (w.corruption < 50 ? 2 : 0)) },
    { label: '判讀', points: Math.round(((correct + judged.filter((o) => o.match).length) / Math.max(1, verdicts.length + 1 + judged.length)) * 10) },
    { label: `冤獄 ${w.wrongful.length} 件`, points: -w.wrongful.length * 3 },
  ];
  const score = Math.max(0, Math.min(100, breakdown.reduce((n, b) => n + b.points, 0)));
  const [posthumous, meaning] = title(over.reason, score);

  const topicTitle = (t: string) => {
    const c = state.cases.find((x) => x.uid === t);
    if (c) return caseTitle(c);
    if (t.startsWith('foreign:')) return `外患・${powerDef(t.slice(8))?.name ?? ''}`;
    return t === 'court' ? '朝中' : t.startsWith('uprising:') ? '民變' : '日常政務';
  };
  const delivered = new Map(state.docs.filter((d) => d.arriveTurn <= over.turn).map((d) => [d.id, d]));
  const groups = new Map<string, LieGroup & { topic: string }>();
  let lieCount = 0;
  for (const l of state.lies) {
    const doc = delivered.get(l.docId);
    if (!doc) continue;
    lieCount++;
    const k = `${l.topic}|${l.from}|${l.label}`;
    const g = groups.get(k);
    if (g) {
      g.count++;
      g.lastTurn = l.turn;
      g.claimed = l.claimed;
      g.truth = l.truth;
      if (doc.read) g.readCount++;
    } else groups.set(k, { topic: l.topic, from: l.from, label: l.label, firstTurn: l.turn, lastTurn: l.turn, count: 1, readCount: doc.read ? 1 : 0, claimed: l.claimed, truth: l.truth });
  }
  const byTopic = new Map<string, LieGroup[]>();
  for (const { topic, ...g } of groups.values()) {
    const key = topic.startsWith('uprising:') ? 'routine' : topic;
    byTopic.set(key, [...(byTopic.get(key) ?? []), g]);
  }
  const lies = [...byTopic.entries()].map(([topic, gs]) => ({ topic, title: topicTitle(topic), groups: gs }));

  const omittedClues = [...delivered.values()].reduce((n, d) => n + d.paras.filter((p) => p.tag === 'clue' && p.brief && !p.inSummary).length, 0);

  const eu = state.cases.find((c) => c.def === 'eunuch');
  const un = state.cases.find((c) => c.def === 'uncle');
  return {
    reason: over.reason,
    ending,
    endingName: ENDING_NAME[ending],
    breakdown,
    officials,
    owned,
    turn: over.turn,
    score,
    posthumous,
    meaning,
    verdicts,
    shoufu: shoufuVerdict,
    lies,
    events: w.events.map((e) => ({ ...e, topicTitle: topicTitle(e.topic) })),
    roles: [
      { name: '首輔', truth: shoufuVerdict.truth },
      { name: '東廠', truth: w.dongchang === 'crown' ? '局終時東廠在天子手中，密報確實。' : '局終時東廠仍在權閹手中：閹黨之事一律說好話，約三成密報夾帶羅織。' },
      { name: '九千歲', truth: eu ? CASE_DEFS.eunuch.truth(state, eu) : '' },
      { name: '皇叔瑞王', truth: un ? CASE_DEFS.uncle.truth(state, un) : '' },
      { name: '皇太后', truth: `局終時太后好感${Math.round(w.dowager)}／100。` },
    ],
    wrongful: [...w.wrongful],
    stats: {
      ...state.stats,
      lieCount,
      omittedClues,
      suppressed: w.mods.suppressed,
      treasury: Math.round(w.treasury),
      grain: Math.round(w.grain),
      prestige: Math.round(w.prestige),
      projects: w.projects.filter((p) => p.complete).map((p) => PROJECTS.find((x) => x.id === p.id)?.name ?? p.id),
      heirs: w.emperor.heirs,
      illnesses: w.events.filter((e) => e.text.startsWith('聖躬違和')).length,
    },
  };
}

function title(reason: EndReason, score: number): [string, string] {
  const k = endingKind(reason);
  if (k === 'wangguo') return reason === 'capital' ? ['烈', '秉德遵業曰烈。城破之日，帝自縊於煤山，史稱末帝。'] : reason === 'captured' ? ['愍', '在國遭憂曰愍。王師敗績，天子北狩。'] : reason === 'mutiny' ? ['厲', '殺戮無辜曰厲。府庫空竭，禁軍譁變。'] : ['愍', '在國遭憂曰愍。太倉無粟，京師大饑。'];
  if (k === 'beifei') return ['廢帝', reason === 'palace' ? '權閹矯詔，迎立皇叔；帝幽於南宮，不得廟號。' : '朝望掃地，群臣伏闕，太后下懿旨廢立。'];
  if (k === 'jiabeng') return reason === 'assassinated' ? ['悼', '年中早夭曰悼。宮闈之變，帝崩於非命。'] : ['悼', '年中早夭曰悼。積勞成疾，崩於乾清宮。'];
  if (k === 'pianan') return score >= 50 ? ['安', '好和不爭曰安。南渡偏安，保江左半壁。'] : score >= 30 ? ['哀', '恭仁短折曰哀。倉皇南渡，北土淪胥。'] : ['殤', '短折不成曰殤。播遷江南，國勢日蹙。'];
  if (k === 'zhongxing') return score >= 85 ? ['宣', '聖善周聞曰宣。剷除奸佞，戡定禍亂，海內稱中興。'] : score >= 70 ? ['武', '克定禍亂曰武。內外肅清，國勢復振。'] : ['昭', '容儀恭美曰昭。勵精圖治，國步稍蘇。'];
  if (score >= 70) return ['孝', '慈惠愛親曰孝。守成之君，保有天下。'];
  if (score >= 50) return ['莊', '履正志和曰莊。雖無大功，亦無大過。'];
  if (score >= 30) return ['懷', '慈仁短折曰懷。天聽多蔽，朝政日非。'];
  return ['靈', '亂而不損曰靈。天聽壅蔽，國事日非。'];
}
