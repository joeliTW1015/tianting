// 局末史書：揭露每件疑案的真相、你的判讀、謊言簿、實錄、評分與諡號。

import { caseTitle, CASE_DEFS } from './cases';
import { discoveredCases } from './actions';
import { PROJECTS } from './palace';
import { powerDef } from './foreign';
import type { EndReason, GameState, TruthEvent } from './types';

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
  survived: '國祚延續',
  capital: '京師陷落',
  mutiny: '京營譁變',
  famine: '京師大饑',
  coup: '群臣廢立',
  illness: '病篤駕崩',
};

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
  // 疑案處置折算為 60 分（只計已發生者）
  let score = (caseSum / Math.max(1, started.length * 20)) * 60 + correct * 2 + w.prestige / 10;
  if (over.reason === 'survived') score += 15;
  score -= w.wrongful.length * 5;
  if (w.treasury > 0) score += 3;
  score = Math.max(0, Math.min(100, Math.round(score)));
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

  return {
    reason: over.reason,
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
      { name: '東廠提督', truth: w.dongchang === 'capable' ? '精幹，密報大致可信。' : '好大喜功，約三成密報夾帶羅織之詞。' },
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
  if (reason === 'capital') return ['思', '道德純一曰思。城破之日，帝自縊於煤山。'];
  if (reason === 'mutiny') return ['厲', '殺戮無辜曰厲。府庫空竭，禁軍譁變。'];
  if (reason === 'famine') return ['愍', '在國遭憂曰愍。太倉無粟，京師大饑。'];
  if (reason === 'coup') return ['殤', '短折不成曰殤。朝望掃地，為群臣所廢。'];
  if (reason === 'illness') return ['悼', '年中早夭曰悼。病篤不起，崩於乾清宮。'];
  if (score >= 85) return ['明', '照臨四方曰明。洞燭幽微，群下不敢欺。'];
  if (score >= 72) return ['睿', '深思遠慮曰睿。雖有蔽塞，終能察之。'];
  if (score >= 58) return ['穆', '布德執義曰穆。守成之君，功過參半。'];
  if (score >= 44) return ['熹', '有過能改曰熹。屢為所欺，國勢日蹙。'];
  if (score >= 30) return ['靈', '亂而不損曰靈。天聽多蔽，朝政日非。'];
  return ['哀', '恭仁短折曰哀。天聽壅蔽，國事日非。'];
}
