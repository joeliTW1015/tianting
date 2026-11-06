import { describe, expect, it } from 'vitest';
import { choose, discoveredCases, issueOrder, orderOptions, readDoc } from '../src/core/actions';
import { CASE_DEFS, CASE_IDS } from '../src/core/cases';
import { issueEdict, previewEdict } from '../src/core/edicts';
import { clout } from '../src/core/factions';
import { travelTurns } from '../src/core/geography';
import { oddsText } from '../src/core/intel';
import { doLeisure, settleEnergy, spend } from '../src/core/palace';
import { setAuthority } from '../src/core/people';
import { chronicle, endingKind } from '../src/core/scoring';
import { newRun } from '../src/core/setup';
import { advanceTurn } from '../src/core/tick';
import type { GameState } from '../src/core/types';
import { playerView } from '../src/core/view';
import { crownArmies } from '../src/core/war';
import { idle, oracle, random, skilled, type Policy } from '../scripts/policies';

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

describe('開局', () => {
  it('三股前朝勢力、四派、後宮、外藩、官軍與闖營都在', () => {
    const s = newRun('開局', 'diligent');
    expect(s.cases.filter((c) => c.def === 'eunuch' || c.def === 'uncle')).toHaveLength(2);
    expect(s.cases).toHaveLength(7);
    expect(s.world.dongchang).toBe('eunuch');
    expect(s.world.treasury).toBe(80);
    expect(s.world.borderArrears).toBe(3);
    const c = clout(s);
    expect(c.yan).toBeGreaterThan(0.35);
    expect(s.consorts.length).toBe(3);
    expect(Object.keys(s.world.powers).length).toBeGreaterThanOrEqual(10);
    expect(s.world.regions.taiwan.owner).toBe('hongmao');
    expect(crownArmies(s).length).toBe(3);
    expect(s.world.armies.some((a) => a.caseId === 'chuang')).toBe(true);
  });

  it('疑案池的每種疑案、每個分支都抽得到', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) for (const c of newRun(`v${i}`, 'diligent').cases) seen.add(`${c.def}:${c.branch}`);
    for (const id of [...CASE_IDS, 'eunuch', 'uncle']) for (const b of CASE_DEFS[id].branches) expect(seen).toContain(`${id}:${b.id}`);
  });
});

describe('精力與勞損', () => {
  it('精力不會回滿；可以透支到 −3，透支累積勞損', () => {
    const s = newRun('精力', 'diligent');
    expect(spend(s, 12)).toBeNull();
    expect(s.energy).toBe(-1);
    expect(spend(s, 3)).not.toBeNull();
    settleEnergy(s);
    expect(s.world.emperor.fatigue).toBeGreaterThanOrEqual(2);
    expect(s.energy).toBeLessThan(s.energyMax);
  });

  it('消遣每旬只能一種，同一種有冷卻', () => {
    const s = newRun('消遣', 'diligent');
    expect(doLeisure(s, 'garden')).toBeNull();
    expect(doLeisure(s, 'calligraphy')).not.toBeNull();
    advanceTurn(s);
    expect(doLeisure(s, 'garden')).not.toBeNull();
    expect(doLeisure(s, 'calligraphy')).toBeNull();
  });
});

describe('詔書', () => {
  it('徵兵要送達與執行三旬，完成後出現部隊', () => {
    const s = newRun('徵兵', 'diligent');
    const pv = previewEdict(s, 'recruit', 'shandong', '5000');
    expect(pv.block).toBeNull();
    expect(pv.exec).toBe(3);
    expect(pv.travel).toBe(travelTurns(s, 'shandong'));
    const before = crownArmies(s).length;
    expect(issueEdict(s, 'recruit', 'shandong', '5000')).toBeNull();
    expect(issueEdict(s, 'recruit', 'shandong', '5000')).not.toBeNull();
    for (let i = 0; i < pv.travel + 3; i++) advanceTurn(s);
    expect(crownArmies(s).length).toBe(before + 1);
  });

  it('勝算只顯示五級描述', () => {
    expect(oddsText(0.95)).toBe('十拿九穩');
    expect(oddsText(0.5)).toBe('五五之數');
    expect(oddsText(0.05)).toBe('九死一生');
  });
});

describe('授權', () => {
  it('常例自專的大臣自行處分例行政務；事事奏請則上呈', () => {
    const s = newRun('授權', 'diligent');
    for (let i = 0; i < 12; i++) advanceTurn(s);
    expect(s.docs.some((d) => d.task?.delegate)).toBe(true);
    expect(setAuthority(s, 'hubu', 'ask')).toBeNull();
    expect(s.chars.hubu.authority).toBe('ask');
  });
});

describe('真相隔離', () => {
  it('playerView 不含真相欄位，未細讀的文書沒有全文', () => {
    const s = newRun('隔離', 'diligent');
    for (let i = 0; i < 20; i++) advanceTurn(s);
    const v = playerView(s);
    const json = JSON.stringify(v);
    for (const key of ['"branch"', 'integrity"', 'competence', '"world"', 'embezzled', 'dormant', 'startTurn', '"lies"', 'loyalty"', 'ambition', '"crisis"', 'jealousy']) expect(json).not.toContain(key);
    for (const d of v.inbox) if (!d.read) expect(d.paras).toBeNull();
    const known = new Set(discoveredCases(s).map((c) => c.uid));
    for (const k of Object.keys(v.beliefs)) if (k !== 'shoufu') expect(known.has(k)).toBe(true);
  });
});

describe('資訊延遲與東廠', () => {
  it('地方文書至少要經過驛路旬數才會送達', () => {
    const s = play('延遲');
    const provincial = s.docs.filter((d) => d.region !== 'jingshi' && d.kind === 'memorial' && !d.battleId && d.sentTurn >= 0 && s.world.capital === 'jingshi');
    expect(provincial.length).toBeGreaterThan(20);
    for (const d of provincial) if (d.arriveTurn > d.sentTurn) expect(d.arriveTurn - d.sentTurn).toBeGreaterThanOrEqual(1);
  });

  it('東廠在權閹手中時密報不標確；奪回後標〔確〕', () => {
    const s = newRun('東廠', 'diligent');
    issueOrder(s, orderOptions(s, 'shandong').find((o) => o.kind === 'spy')!);
    for (let i = 0; i < 4; i++) advanceTurn(s);
    const sd = s.docs.find((d) => d.kind === 'secret' && d.region === 'shandong');
    s.world.dongchang = 'crown';
    issueOrder(s, orderOptions(s, 'henan').find((o) => o.kind === 'spy')!);
    for (let i = 0; i < 5; i++) advanceTurn(s);
    const hn = s.docs.find((d) => d.kind === 'secret' && d.region === 'henan');
    expect(sd).toBeDefined();
    expect(sd?.certified).toBeFalsy();
    expect(hn?.certified).toBe(true);
  });
});

describe('政務', () => {
  it('未細讀的政務只能依票擬；細讀後可以親裁', () => {
    const s = newRun('依擬', 'diligent');
    const d = s.docs.find((x) => x.task?.id === 'tax')!;
    expect(choose(s, d.id, 'heavy')).not.toBeNull();
    expect(readDoc(s, d.id)).toBeNull();
    expect(choose(s, d.id, 'heavy')).toBeNull();
  });
});

describe('難度與結局', () => {
  it('無為、亂按都撐不過五年；結局一定是六種之一', () => {
    for (let i = 0; i < 6; i++) {
      for (const p of [idle, random]) {
        const s = play(`難${i}`, p);
        expect(s.over!.reason).not.toBe('survived');
        expect(['zhongxing', 'shoucheng', 'pianan', 'wangguo', 'jiabeng', 'beifei']).toContain(endingKind(s.over!.reason));
      }
    }
  });

  it('全知策略能跑完整局，史書有評分拆解', () => {
    const s = play('全知', oracle);
    const c = chronicle(s);
    expect(c.breakdown.length).toBe(6);
    expect(c.posthumous.length).toBeGreaterThan(0);
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
