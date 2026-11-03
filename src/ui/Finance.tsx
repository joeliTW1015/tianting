// 戶部帳冊：國庫與太倉走勢、每旬收支、各省實解熱力圖、支出明細。
// 全部只用玩家看得到的帳目（戶部帳冊晚一旬；各省數字來自戶部錢糧總冊）。

import { useState } from 'preact/hooks';
import { shortDate } from '../core/calendar';
import { BORDERS, PROVINCES, REGIONS, regionName } from '../core/geography';
import type { RegionId } from '../core/types';
import type { PlayerView } from '../core/view';
import { FlowBars, LineChart, RATIO_STEPS, ratioColor, Sparkline, type BarCol, type BarPart } from './charts';

type Tab = 'overview' | 'regions' | 'outlays';

const CAT_COLOR: Record<string, string> = {
  各省錢糧: '#5f8f6a',
  鹽課: '#8fb0b0',
  市舶: '#2f5d7c',
  開源: '#a9b86a',
  抄沒: '#c9a446',
  常支: '#8e8476',
  京營: '#5a4636',
  出征: '#7e231d',
  邊餉: '#b5321f',
  賑濟: '#d98a4a',
  撥款: '#c4522e',
  軍費: '#9c2a1a',
  查核: '#6a2b3b',
  宮廷: '#c99a2e',
  河漕: '#5f8fa8',
  購糧: '#b38f39',
  其他: '#b9ad99',
};

const MOOD_LEVEL: Record<string, number> = { 地方安靜: 0, 民多怨言: 1, 民情洶洶: 2 };

export function FinanceModal({ view, onClose, onRegion }: { view: PlayerView; onClose: () => void; onRegion: (r: RegionId) => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const label = (t: number) => shortDate(t).replace(/^.年/, '');

  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="finance paper" onClick={(e) => e.stopPropagation()} data-testid="finance">
        <header class="finance-head">
          <h2>戶部帳冊</h2>
          <nav>
            {(
              [
                ['overview', '總覽'],
                ['regions', '各省錢糧'],
                ['outlays', '支出明細'],
              ] as [Tab, string][]
            ).map(([k, t]) => (
              <button key={k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-tab={k}>
                {t}
              </button>
            ))}
          </nav>
          <span class="muted small">戶部帳目晚一旬；各省數字取自每三旬一次的〈戶部錢糧總冊〉。</span>
          <button class="btn ghost" onClick={onClose}>
            闔上
          </button>
        </header>
        <div class="finance-body">
          {tab === 'overview' && <Overview view={view} label={label} />}
          {tab === 'regions' && <Regions view={view} label={label} onRegion={onRegion} />}
          {tab === 'outlays' && <Outlays view={view} />}
        </div>
      </div>
    </div>
  );
}

function Overview({ view, label }: { view: PlayerView; label: (t: number) => string }) {
  const f = view.finance;
  const L = f.ledger;
  const last = L.slice(-6);
  const last12 = L.slice(-12);
  const avg = (fn: (e: (typeof L)[number]) => number) => (last.length ? last.reduce((n, e) => n + fn(e), 0) / last.length : 0);
  const flowsByTurn = new Map<number, { cat: string; silver: number }[]>();
  // 玩家在第 t 旬的支出，記入第 t+1 旬的帳（與戶部帳冊同一節奏）
  for (const x of f.flows) {
    if (!x.silver) continue;
    const k = x.turn + 1;
    flowsByTurn.set(k, [...(flowsByTurn.get(k) ?? []), { cat: x.cat, silver: x.silver }]);
  }
  const income = avg((e) => e.provinces + e.salt + e.trade);
  const regular = avg((e) => e.routine + e.army + e.field);
  const oneOff = last12.reduce((n, e) => n + (flowsByTurn.get(e.turn) ?? []).filter((x) => x.silver < 0).reduce((m, x) => m - x.silver, 0), 0) / Math.max(1, last12.length);
  const grainNet = avg((e) => e.grainIn - e.grainOut);
  const lastE = L[L.length - 1];

  const cols: BarCol[] = L.slice(-30).map((e) => {
    const extra = flowsByTurn.get(e.turn) ?? [];
    const sumCat = (sign: 1 | -1) => {
      const m = new Map<string, number>();
      for (const x of extra) if (Math.sign(x.silver) === sign) m.set(x.cat, (m.get(x.cat) ?? 0) + Math.abs(x.silver));
      return [...m.entries()].map(([cat, v]): BarPart => ({ label: cat, value: v, color: CAT_COLOR[cat] ?? '#999' }));
    };
    return {
      x: e.turn,
      income: [
        { label: '各省錢糧', value: e.provinces, color: CAT_COLOR['各省錢糧'] },
        { label: '鹽課', value: e.salt, color: CAT_COLOR['鹽課'] },
        { label: '市舶', value: e.trade, color: CAT_COLOR['市舶'] },
        ...sumCat(1),
      ],
      expense: [
        { label: '常支', value: e.routine, color: CAT_COLOR['常支'] },
        { label: '京營', value: e.army, color: CAT_COLOR['京營'] },
        { label: '出征', value: e.field, color: CAT_COLOR['出征'] },
        ...sumCat(-1),
      ],
    };
  });

  return (
    <div class="overview">
      <div class="kpis">
        <Kpi title="國庫存銀" value={lastE ? `${Math.round(lastE.treasury)} 萬兩` : '—'} note={L.length >= 7 ? trend(lastE.treasury - L[L.length - 7].treasury, '近六旬') : ''} />
        <Kpi title="每旬常入" value={`${Math.round(income)} 萬兩`} note="各省錢糧、鹽課、市舶（近六旬平均）" />
        <Kpi title="每旬常出" value={`${Math.round(regular)} 萬兩`} note={`另有邊餉、撥款等一次性支出，近十二旬平均每旬 ${Math.round(oneOff)} 萬兩`} />
        <Kpi
          title="太倉存糧"
          value={lastE ? `${Math.round(lastE.grain)} 萬石` : '—'}
          note={grainNet < 0 && lastE ? `每旬淨耗約 ${Math.round(-grainNet)} 萬石，約可支 ${Math.max(0, Math.floor(lastE.grain / -grainNet))} 旬` : '收支大致平衡'}
          warn={!!lastE && grainNet < 0 && lastE.grain / -grainNet < 12}
        />
      </div>
      <div class="chart-row">
        <section>
          <h4>國庫・內帑走勢（萬兩）</h4>
          <LineChart
            series={[
              { name: '國庫', color: '#b5321f', points: L.map((e) => ({ x: e.turn, y: e.treasury })), area: true },
              { name: '內帑', color: '#c99a2e', points: L.map((e) => ({ x: e.turn, y: e.privy })), dashed: true },
            ]}
            xLabel={label}
            unit="萬"
            height={180}
          />
        </section>
        <section>
          <h4>太倉存糧走勢（萬石）</h4>
          <LineChart
            series={[
              { name: '存糧', color: '#b38f39', points: L.map((e) => ({ x: e.turn, y: e.grain })), area: true },
              { name: '每旬漕入×10', color: '#5f8fa8', points: L.map((e) => ({ x: e.turn, y: e.grainIn * 10 })), dashed: true },
            ]}
            xLabel={label}
            unit="萬"
            height={180}
          />
        </section>
      </div>
      <section>
        <h4>每旬收支（近三十旬，萬兩）</h4>
        <FlowBars cols={cols} xLabel={label} />
      </section>
    </div>
  );
}

function trend(d: number, span: string): string {
  return `${span}${d >= 0 ? '增' : '減'} ${Math.abs(Math.round(d))} 萬兩 ${d >= 0 ? '▲' : '▼'}`;
}

function Kpi({ title, value, note, warn }: { title: string; value: string; note: string; warn?: boolean }) {
  return (
    <div class={`kpi ${warn ? 'warn' : ''}`}>
      <small>{title}</small>
      <b>{value}</b>
      <span>{note}</span>
    </div>
  );
}

function Regions({ view, label, onRegion }: { view: PlayerView; label: (t: number) => string; onRegion: (r: RegionId) => void }) {
  const f = view.finance;
  const turns = [...new Set(PROVINCES.concat('jingshi').flatMap((p) => f.regionTax[p].map((x) => x.turn)))].sort((a, b) => a - b).slice(-16);
  const rows = PROVINCES.concat('jingshi').map((p) => {
    const hist = f.regionTax[p];
    const base = REGIONS[p].tax;
    const latest = hist[hist.length - 1];
    const mood = f.regionMood[p];
    return { p, hist, base, latest, ratio: latest ? latest.value / base : null, mood: mood[mood.length - 1] };
  });
  const sorted = rows.slice().sort((a, b) => (a.ratio ?? 9) - (b.ratio ?? 9));

  return (
    <div class="regions-fin">
      <p class="muted small">
        每格是該省某一期〈錢糧總冊〉的「實解 ÷ 應解」：綠色足額，越紅短少越多。短少可能是災荒、民變、蠲免，也可能是有人截留。點一列可以在輿圖上選取該地。
      </p>
      {turns.length === 0 ? (
        <p class="chart-empty">尚未收到戶部錢糧總冊（每三旬一期）。</p>
      ) : (
        <table class="heat">
          <thead>
            <tr>
              <th>地方</th>
              <th>應解</th>
              {turns.map((t) => (
                <th key={t} class="col">
                  {label(t)}
                </th>
              ))}
              <th>走勢</th>
              <th>最近民情</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.p} onClick={() => onRegion(row.p)} data-heat={row.p}>
                <td class="name">{regionName(row.p)}</td>
                <td class="base">{row.base}</td>
                {turns.map((t) => {
                  const cell = row.hist.find((x) => x.turn === t);
                  const r = cell ? cell.value / row.base : null;
                  return (
                    <td key={t} class="cell" style={{ background: ratioColor(r) }} title={cell ? `${label(t)} 實解 ${cell.value} 萬兩（${Math.round((r ?? 0) * 100)}%）` : '無帳'}>
                      {cell ? `${Math.round((r ?? 0) * 100)}` : ''}
                    </td>
                  );
                })}
                <td>
                  <Sparkline values={row.hist.map((x) => x.value)} base={row.base} width={90} height={24} />
                </td>
                <td class={`mood m${row.mood ? MOOD_LEVEL[row.mood.value] ?? 0 : 0}`}>{row.mood ? `${row.mood.value}（${row.mood.source.startsWith('通政司') ? '自報' : row.mood.source.slice(0, 6)}）` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div class="heat-legend">
        {RATIO_STEPS.map(([r, t]) => (
          <span key={r}>
            <i style={{ background: ratioColor(r) }} />
            {t}
          </span>
        ))}
        <span class="muted">平時受吏治、民心影響，多在七、八成之間；明顯低於自己往常，才值得追究。</span>
        <span class="muted">（邊鎮不解錢糧，不列入：{BORDERS.map(regionName).join('、')}）</span>
      </div>
    </div>
  );
}

function Outlays({ view }: { view: PlayerView }) {
  const flows = view.finance.flows;
  const byCat = new Map<string, number>();
  for (const x of flows) if (x.silver < 0) byCat.set(x.cat, (byCat.get(x.cat) ?? 0) - x.silver);
  const gains = flows.filter((x) => x.silver > 0).reduce((n, x) => n + x.silver, 0);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map((c) => c[1]));
  const recent = flows.slice(-40).reverse();
  return (
    <div class="outlays">
      <section>
        <h4>本朝至今各類支出（萬兩）</h4>
        {cats.length === 0 && <p class="chart-empty">尚無一次性支出。</p>}
        {cats.map(([cat, v]) => (
          <div key={cat} class="hbar">
            <span class="hbar-label">{cat}</span>
            <span class="hbar-track">
              <span style={{ width: `${(v / max) * 100}%`, background: CAT_COLOR[cat] ?? '#999' }} />
            </span>
            <b>{Math.round(v)}</b>
          </div>
        ))}
        {gains > 0 && <p class="muted small">另有一次性收入（抄沒、開源）共 {Math.round(gains)} 萬兩。</p>}
      </section>
      <section>
        <h4>近期出入（最新在上）</h4>
        <table class="flows">
          <tbody>
            {recent.map((x, i) => (
              <tr key={i}>
                <td class="muted">{shortDate(x.turn)}</td>
                <td>
                  <i class="dot" style={{ background: CAT_COLOR[x.cat] ?? '#999' }} />
                  {x.cat}
                </td>
                <td>{x.label}</td>
                <td class={x.silver < 0 || x.grain < 0 || x.privy < 0 ? 'neg' : 'pos'}>
                  {[x.silver ? `銀 ${x.silver > 0 ? '+' : ''}${Math.round(x.silver)}` : '', x.grain ? `糧 ${x.grain > 0 ? '+' : ''}${Math.round(x.grain)}` : '', x.privy ? `內帑 ${x.privy > 0 ? '+' : ''}${Math.round(x.privy)}` : ''].filter(Boolean).join('・')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
