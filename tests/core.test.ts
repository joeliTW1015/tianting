import { describe, expect, it } from 'vitest';
import { choose, discoveredCases, issueOrder, orderOptions, readDoc } from '../src/core/actions';
import { doLeisure, startProject } from '../src/core/palace';
import { CASE_DEFS, CASE_IDS } from '../src/core/cases';
import { travelTurns } from '../src/core/geography';
import { chronicle } from '../src/core/scoring';
import { newRun } from '../src/core/setup';
import { advanceTurn } from '../src/core/tick';
import type { GameState } from '../src/core/types';
import { playerView } from '../src/core/view';
import { idle, oracle, skilled, type Policy } from '../scripts/policies';

function play(seed: string, policy: Policy = idle, cases?: string[]): GameState {
  const s = newRun(seed, 'diligent', { cases });
  while (!s.over) {
    policy(s);
    advanceTurn(s);
  }
  return s;
}

describe('可重現性', () => {
  it('同一種子與同一策略，整局結果完全相同', () => {
    const a = play('甲子1', skilled);
    const b = play('甲子1', skilled);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('疑案抽選', () => {
  it('每局抽五件不同的疑案，依浮現時間排序', () => {
    for (let i = 0; i < 30; i++) {
      const s = newRun(`d${i}`, 'diligent');
      expect(new Set(s.cases.map((c) => c.def)).size).toBe(5);
      for (let k = 1; k < 5; k++) expect(s.cases[k].startTurn).toBeGreaterThanOrEqual(s.cases[k - 1].startTurn);
    }
  });

  it('十種疑案、每種的所有分支都抽得到', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const c of newRun(`v${i}`, 'diligent').cases) seen.add(`${c.def}:${c.branch}`);
    for (const id of CASE_IDS) for (const b of CASE_DEFS[id].branches) expect(seen).toContain(`${id}:${b.id}`);
  });

  it('疑案在開局時不會透露給玩家；收到相關文書後才算察覺', () => {
    const s = newRun('隱藏', 'diligent');
    expect(playerView(s).cases).toHaveLength(0);
    let discovered = 0;
    for (let t = 0; t < 72 && !s.over; t++) {
      advanceTurn(s);
      discovered = Math.max(discovered, playerView(s).cases.length);
    }
    expect(discovered).toBeGreaterThanOrEqual(3);
  });

  it('每件疑案的所有分支都能跑完整局（全知策略）', () => {
    for (const id of CASE_IDS) {
      const s = play(`smoke-${id}`, oracle, [id, ...CASE_IDS.filter((x) => x !== id).slice(0, 4)]);
      expect(s.over).toBeDefined();
      expect(chronicle(s).verdicts).toHaveLength(5);
    }
  });
});

describe('真相隔離', () => {
  it('playerView 不含任何真相欄位，未細讀的文書沒有全文', () => {
    const s = newRun('隔離', 'diligent');
    for (let i = 0; i < 20; i++) advanceTurn(s);
    const v = playerView(s);
    const json = JSON.stringify(v);
    for (const key of ['"branch"', 'integrity', 'competence', '"world"', 'embezzled', '"plot"', 'dormant', 'startTurn', '"lies"', 'shoufu":"c']) expect(json).not.toContain(key);
    for (const d of v.inbox) if (!d.read) expect(d.paras).toBeNull();
    // 尚未察覺的疑案不會出現在心證
    const known = new Set(discoveredCases(s).map((c) => c.uid));
    for (const k of Object.keys(v.beliefs)) if (k !== 'shoufu') expect(known.has(k)).toBe(true);
  });

  it('細讀耗精力，精力用盡就不能再讀', () => {
    const s = newRun('精力', 'diligent');
    advanceTurn(s);
    const ids = s.docs.filter((d) => !d.read && d.arriveTurn <= s.turn).map((d) => d.id);
    s.energy = 1;
    expect(readDoc(s, ids[0])).toBeNull();
    expect(s.energy).toBe(0);
    expect(readDoc(s, ids[1])).not.toBeNull();
  });
});

describe('資訊延遲', () => {
  it('地方文書至少要經過驛路旬數才會送達', () => {
    const s = play('延遲');
    const provincial = s.docs.filter((d) => d.region !== 'jingshi' && d.sentTurn >= 0 && d.kind !== 'audience');
    expect(provincial.length).toBeGreaterThan(30);
    for (const d of provincial) expect(d.arriveTurn - d.sentTurn).toBeGreaterThanOrEqual(travelTurns(s, d.region));
  });

  it('密探回報在預估的旬數抵京', () => {
    const s = newRun('密探', 'diligent');
    const opt = orderOptions(s, 'yungui').find((o) => o.kind === 'spy')!;
    expect(issueOrder(s, opt)).toBeNull();
    const order = s.orders[0];
    expect(order.returnTurn).toBe(12);
    while (s.turn < order.returnTurn! && !s.over) advanceTurn(s);
    expect(s.docs.some((d) => d.kind === 'secret' && d.region === 'yungui' && d.arriveTurn === order.returnTurn)).toBe(true);
  });
});

describe('旨意', () => {
  it('同一旬不能重複下同一道旨，下一旬就可以', () => {
    const s = newRun('重複', 'diligent');
    const opt = () => orderOptions(s, 'shandong').find((o) => o.kind === 'spy')!;
    expect(opt().issued).toBe(false);
    expect(issueOrder(s, opt())).toBeNull();
    expect(opt().issued).toBe(true);
    expect(issueOrder(s, opt())).not.toBeNull();
    // 同一旬換一個地方可以
    expect(issueOrder(s, orderOptions(s, 'henan').find((o) => o.kind === 'spy')!)).toBeNull();
    advanceTurn(s);
    expect(opt().issued).toBe(false);
  });

  it('密查京師：下一旬回報，內容不是空的', () => {
    const s = newRun('京查', 'diligent');
    issueOrder(s, orderOptions(s, 'jingshi').find((o) => o.kind === 'spy')!);
    expect(s.orders[0].returnTurn).toBe(1);
    advanceTurn(s);
    const d = s.docs.find((x) => x.kind === 'secret' && x.region === 'jingshi');
    expect(d?.arriveTurn).toBe(1);
    expect(d!.paras.filter((p) => p.tag !== 'fluff').length).toBeGreaterThanOrEqual(3);
  });
});

describe('內廷與行程', () => {
  it('未細讀的政務只能依票擬；細讀後可以親裁', () => {
    const s = newRun('依擬', 'diligent');
    const d = s.docs.find((x) => x.task?.id === 'tax')!;
    expect(d.read).toBe(false);
    expect(choose(s, d.id, 'heavy')).not.toBeNull();
    expect(readDoc(s, d.id)).toBeNull();
    expect(choose(s, d.id, 'heavy')).toBeNull();
    const s2 = newRun('依擬', 'diligent');
    const d2 = s2.docs.find((x) => x.task?.id === 'tax')!;
    expect(choose(s2, d2.id, d2.task!.recommend!)).toBeNull();
  });

  it('行程列出奉召赴京的官員與密報回京，到了就消失', () => {
    const s = newRun('行程', 'diligent');
    issueOrder(s, orderOptions(s, 'shandong').find((o) => o.kind === 'recall')!);
    issueOrder(s, orderOptions(s, 'henan').find((o) => o.kind === 'spy')!);
    let v = playerView(s);
    expect(v.agenda.some((a) => a.kind === 'arrival' && a.text.includes('赴京'))).toBe(true);
    expect(v.agenda.some((a) => a.kind === 'report')).toBe(true);
    for (let i = 0; i < 3; i++) advanceTurn(s);
    v = playerView(s);
    expect(v.agenda.some((a) => a.kind === 'arrival')).toBe(false);
    expect(v.agenda.some((a) => a.kind === 'report')).toBe(false);
  });

  it('消遣能改善心情；營建到期告成並生效', () => {
    const s = newRun('內廷', 'diligent');
    s.world.emperor.mood = 30;
    expect(doLeisure(s, 'opera')).toBeNull();
    expect(s.world.emperor.mood).toBeGreaterThan(30);
    s.energy = 5;
    expect(startProject(s, 'walls')).toBeNull();
    expect(startProject(s, 'canal')).not.toBeNull();
    for (let i = 0; i < 5; i++) advanceTurn(s);
    expect(s.world.buffs.walls).toBe(true);
  });

  it('京師不會一直地震', () => {
    let quakes = 0;
    for (let i = 0; i < 20; i++) quakes += play(`q${i}`, skilled).docs.filter((d) => d.title.includes('地震')).length;
    expect(quakes / 20).toBeLessThan(1.5);
  });
});

describe('日常政務', () => {
  it('邊餉每兩月一議，逾期依例處置', () => {
    const s = play('政務');
    const border = s.docs.filter((d) => d.task?.id === 'border');
    expect(border.length).toBe(Math.floor((s.turn - 2) / 6) + 1);
    for (const d of border) if (d.task!.deadline < s.turn) expect(d.task!.chosen).toBeDefined();
  });
});

describe('內廷壅蔽', () => {
  it('截留分支真的會讓奏疏消失，並有官員追問前疏', () => {
    for (let i = 0; i < 60; i++) {
      const s = newRun(`inner${i}`, 'diligent', { cases: ['inner', 'border', 'remit', 'bandit', 'salt'] });
      const c = s.cases.find((x) => x.def === 'inner')!;
      if (c.branch !== 'intercept') continue;
      while (!s.over) advanceTurn(s);
      // 局若在此案浮現後不久就結束（例如病逝），換下一個種子
      if (s.over!.turn < c.startTurn + 15) continue;
      expect(s.world.mods.suppressed).toBeGreaterThan(0);
      expect(s.docs.some((d) => d.title.includes('催問前疏'))).toBe(true);
      return;
    }
    throw new Error('找不到截留分支');
  });
});

describe('白話註解', () => {
  it('絕大多數核心段落附有白話', () => {
    const s = play('白話', skilled);
    const core = s.docs.flatMap((d) => d.paras.filter((p) => p.tag === 'core' && d.kind !== 'digest'));
    const withPlain = core.filter((p) => p.plain).length;
    expect(withPlain / core.length).toBeGreaterThan(0.75);
  });
});

describe('史書', () => {
  it('謊言會被登錄並出現在史書中', () => {
    const s = play('謊言');
    const c = chronicle(s);
    expect(c.stats.lieCount).toBeGreaterThan(0);
    expect(c.posthumous.length).toBe(1);
  });
});
