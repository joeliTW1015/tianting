// 批次模擬：npm run sim [-- 局數]
// 輸出：各策略存活率與結局、各疑案各分支的平均處置得分、節奏統計、執行錯誤數。

import { CASE_DEFS } from '../src/core/cases';
import { chronicle } from '../src/core/scoring';
import { newRun, perkChoices } from '../src/core/setup';
import { advanceTurn } from '../src/core/tick';
import type { GameState } from '../src/core/types';
import { POLICIES, type Policy } from './policies';

const N = Number(process.argv[2] ?? 300);

export function playOut(seed: string, policy: Policy): GameState {
  const state = newRun(seed, perkChoices(seed)[0]);
  let guard = 0;
  while (!state.over && guard++ < 400) {
    policy(state);
    advanceTurn(state);
  }
  return state;
}

const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(0)}%`;
let errors = 0;
const rows = ['| 策略 | 撐滿五年 | 中興 | 平均分 | 平均在位(旬) | 亡國 | 駕崩 | 被廢 |', '|---|---|---|---|---|---|---|---|'];
const caseStats: Record<string, Record<string, Record<string, { pts: number; n: number }>>> = {};
let docsPerTurn = 0;
let tasksPerTurn = 0;
let discoverDelay = 0;
let discoverN = 0;

for (const [name, policy] of Object.entries(POLICIES)) {
  let survived = 0;
  let score = 0;
  let turns = 0;
  const reasons: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    let s: GameState;
    try {
      s = playOut(`sim${i}`, policy);
    } catch (e) {
      errors++;
      if (errors < 5) console.error(name, i, e);
      continue;
    }
    const c = chronicle(s);
    if (['survived', 'southern', 'zhongxing'].includes(c.reason)) survived++;
    reasons[c.ending] = (reasons[c.ending] ?? 0) + 1;
    score += c.score;
    turns += c.turn;
    for (const v of c.verdicts) {
      const cs = s.cases.find((x) => x.uid === v.key)!;
      if (s.turn < cs.startTurn) continue;
      const slot = ((caseStats[cs.def] ??= {})[cs.branch] ??= {});
      const st = (slot[name] ??= { pts: 0, n: 0 });
      st.pts += v.points;
      st.n += 1;
    }
    if (name === 'idle') {
      docsPerTurn += s.docs.filter((d) => d.arriveTurn <= s.turn).length / Math.max(1, s.turn);
      tasksPerTurn += s.docs.filter((d) => d.task).length / Math.max(1, s.turn);
      for (const cs of s.cases) {
        const first = s.docs.filter((d) => d.topic === cs.uid).map((d) => d.arriveTurn);
        if (first.length) {
          discoverDelay += Math.min(...first) - cs.startTurn;
          discoverN++;
        }
      }
    }
  }
  rows.push(`| ${name} | ${pct(survived, N)} | ${pct(reasons.zhongxing ?? 0, N)} | ${(score / N).toFixed(1)} | ${(turns / N).toFixed(1)} | ${pct(reasons.wangguo ?? 0, N)} | ${pct(reasons.jiabeng ?? 0, N)} | ${pct(reasons.beifei ?? 0, N)} |`);
}

console.log(`\n模擬 ${N} 局 × ${Object.keys(POLICIES).length} 策略（一局最多 180 旬）\n`);
console.log(rows.join('\n'));
console.log('\n各疑案・各分支的平均處置得分（滿分 20）');
const names = Object.keys(POLICIES);
console.log(`| 疑案 | 分支 | ${names.join(' | ')} |`);
console.log(`|---|---|${names.map(() => '---').join('|')}|`);
for (const [def, branches] of Object.entries(caseStats)) {
  for (const [b, per] of Object.entries(branches)) {
    const label = CASE_DEFS[def].branches.find((x) => x.id === b)?.label ?? b;
    console.log(`| ${CASE_DEFS[def].name} | ${label} | ${names.map((n) => (per[n] ? (per[n].pts / per[n].n).toFixed(1) : '-')).join(' | ')} |`);
  }
}
console.log(`\n節奏（idle 局）：每旬到達文書 ${(docsPerTurn / N).toFixed(1)} 份；每旬政務 ${(tasksPerTurn / N).toFixed(2)} 件；疑案開始到第一份文書送達平均 ${(discoverDelay / Math.max(1, discoverN)).toFixed(1)} 旬`);
console.log(`\n執行錯誤：${errors}`);
if (errors) process.exit(1);
