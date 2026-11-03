// 帳冊用的向量圖表：折線、收支柱、熱力格、小走勢線。全部手寫 SVG。

import { useState } from 'preact/hooks';

export interface Pt {
  x: number;
  y: number;
}

export interface Series {
  name: string;
  color: string;
  points: Pt[];
  dashed?: boolean;
  area?: boolean;
}

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const W = 640;

/** 折線圖：滑過可看各旬數值 */
export function LineChart({ series, xLabel, height = 200, unit = '', minY }: { series: Series[]; xLabel: (x: number) => string; height?: number; unit?: string; minY?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <p class="muted small chart-empty">尚無帳目。</p>;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const x0 = Math.min(...all.map((p) => p.x));
  const x1 = Math.max(...all.map((p) => p.x), x0 + 1);
  const lo = Math.min(minY ?? 0, ...all.map((p) => p.y));
  const yMin = lo < 0 ? -niceMax(-lo) : 0;
  const yMax = niceMax(Math.max(...all.map((p) => p.y), 1));
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => yMin + (yMax - yMin) * k);
  const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const step = Math.max(1, Math.ceil(xs.length / 8));

  const onMove = (e: MouseEvent) => {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = xs[0];
    for (const x of xs) if (Math.abs(sx(x) - px) < Math.abs(sx(best) - px)) best = x;
    setHover(best);
  };

  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${height}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} class={t === 0 ? 'axis zero' : 'grid'} />
            <text x={pad.l - 6} y={sy(t) + 4} class="tick" text-anchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {xs.filter((_, i) => i % step === 0).map((x) => (
          <text key={x} x={sx(x)} y={height - 6} class="tick" text-anchor="middle">
            {xLabel(x)}
          </text>
        ))}
        {series.map((s) => {
          if (!s.points.length) return null;
          const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
          return (
            <g key={s.name}>
              {s.area && <path d={`${d}L${sx(s.points[s.points.length - 1].x)},${sy(Math.max(0, yMin))}L${sx(s.points[0].x)},${sy(Math.max(0, yMin))}Z`} fill={s.color} opacity="0.12" />}
              <path d={d} fill="none" stroke={s.color} stroke-width="2.4" stroke-dasharray={s.dashed ? '6 4' : undefined} />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={height - pad.b} class="guide" />
            {series.map((s) => {
              const p = s.points.find((q) => q.x === hover);
              return p ? <circle key={s.name} cx={sx(p.x)} cy={sy(p.y)} r="4" fill={s.color} stroke="#fff" /> : null;
            })}
          </g>
        )}
      </svg>
      <div class="chart-legend">
        {hover !== null && <b>{xLabel(hover)}：</b>}
        {series.map((s) => {
          const p = hover !== null ? s.points.find((q) => q.x === hover) : s.points[s.points.length - 1];
          return (
            <span key={s.name}>
              <i style={{ background: s.color }} class={s.dashed ? 'dashed' : ''} />
              {s.name}
              {p ? ` ${Math.round(p.y)}${unit}` : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export interface BarPart {
  label: string;
  color: string;
  value: number;
}

export interface BarCol {
  x: number;
  income: BarPart[];
  expense: BarPart[];
}

/** 收支柱狀圖：收入往上、支出往下，折線為結餘 */
export function FlowBars({ cols, xLabel, height = 240, width = 1000 }: { cols: BarCol[]; xLabel: (x: number) => string; height?: number; width?: number }) {
  const W = width;
  const [hover, setHover] = useState<number | null>(null);
  if (!cols.length) return <p class="muted small chart-empty">尚無帳目。</p>;
  const pad = { l: 44, r: 12, t: 10, b: 24 };
  const sum = (ps: BarPart[]) => ps.reduce((n, p) => n + p.value, 0);
  const maxUp = niceMax(Math.max(...cols.map((c) => sum(c.income)), 1));
  const maxDown = niceMax(Math.max(...cols.map((c) => sum(c.expense)), 1));
  const range = maxUp + maxDown;
  const sy = (v: number) => pad.t + ((maxUp - v) / range) * (height - pad.t - pad.b);
  const bw = (W - pad.l - pad.r) / cols.length;
  const zero = sy(0);
  const step = Math.max(1, Math.ceil(cols.length / 8));
  const net = cols.map((c, i) => `${i ? 'L' : 'M'}${(pad.l + bw * (i + 0.5)).toFixed(1)},${sy(sum(c.income) - sum(c.expense)).toFixed(1)}`).join('');
  const hc = hover !== null ? cols[hover] : null;

  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${height}`} onMouseLeave={() => setHover(null)}>
        {[maxUp, maxUp / 2, 0, -maxDown / 2, -maxDown].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} class={t === 0 ? 'axis zero' : 'grid'} />
            <text x={pad.l - 6} y={sy(t) + 4} class="tick" text-anchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {cols.map((c, i) => {
          let up = 0;
          let down = 0;
          const x = pad.l + bw * i + bw * 0.15;
          const w = bw * 0.7;
          return (
            <g key={c.x} onMouseEnter={() => setHover(i)} class={hover === i ? 'bar on' : 'bar'}>
              <rect x={pad.l + bw * i} y={pad.t} width={bw} height={height - pad.t - pad.b} fill="transparent" />
              {c.income.map((p) => {
                const y = sy(up + p.value);
                const h = sy(up) - y;
                up += p.value;
                return h > 0 ? <rect key={p.label} x={x} y={y} width={w} height={h} fill={p.color} /> : null;
              })}
              {c.expense.map((p) => {
                const y = sy(-down);
                const h = sy(-down - p.value) - y;
                down += p.value;
                return h > 0 ? <rect key={p.label} x={x} y={y} width={w} height={h} fill={p.color} /> : null;
              })}
              {i % step === 0 && (
                <text x={x + w / 2} y={height - 6} class="tick" text-anchor="middle">
                  {xLabel(c.x)}
                </text>
              )}
            </g>
          );
        })}
        <path d={net} fill="none" stroke="#26221e" stroke-width="1.8" stroke-dasharray="3 3" />
        <line x1={pad.l} x2={W - pad.r} y1={zero} y2={zero} class="axis zero" />
      </svg>
      <div class="chart-legend tall">
        {hc ? (
          <>
            <b>
              {xLabel(hc.x)}　收 {Math.round(sum(hc.income))}・支 {Math.round(sum(hc.expense))}・結餘 {Math.round(sum(hc.income) - sum(hc.expense))} 萬兩
            </b>
            {[...hc.income, ...hc.expense].filter((p) => p.value >= 0.5).map((p) => (
              <span key={p.label}>
                <i style={{ background: p.color }} />
                {p.label} {Math.round(p.value)}
              </span>
            ))}
          </>
        ) : (
          <span class="muted">滑過柱子看該旬明細。上為收入、下為支出，虛線為結餘。</span>
        )}
      </div>
    </div>
  );
}

/** 小走勢線（可加一條「額」的虛線） */
export function Sparkline({ values, base, width = 120, height = 30, color = '#2f5d7c' }: { values: number[]; base?: number; width?: number; height?: number; color?: string }) {
  if (!values.length) return <svg width={width} height={height} class="spark" />;
  const max = Math.max(...values, base ?? 0, 0.1) * 1.1;
  const sx = (i: number) => (values.length === 1 ? width / 2 : 2 + (i / (values.length - 1)) * (width - 4));
  const sy = (v: number) => height - 2 - (v / max) * (height - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('');
  return (
    <svg width={width} height={height} class="spark" viewBox={`0 0 ${width} ${height}`}>
      {base !== undefined && <line x1="0" x2={width} y1={sy(base)} y2={sy(base)} stroke="#8e8476" stroke-dasharray="3 2" />}
      <path d={d} fill="none" stroke={color} stroke-width="1.8" />
      <circle cx={sx(values.length - 1)} cy={sy(values[values.length - 1])} r="2.6" fill={color} />
    </svg>
  );
}

/** 實解／額 的比例 → 顏色 */
export function ratioColor(r: number | null): string {
  if (r === null) return '#e8dfcc';
  if (r >= 0.85) return '#4f8a5f';
  if (r >= 0.7) return '#8fb06a';
  if (r >= 0.55) return '#d9b866';
  if (r >= 0.4) return '#d98a4a';
  return '#b5321f';
}

/** 色階說明 */
export const RATIO_STEPS: [number, string][] = [
  [0.9, '八成五以上'],
  [0.75, '七成以上'],
  [0.6, '五成五以上'],
  [0.45, '四成以上'],
  [0.3, '不足四成'],
];
