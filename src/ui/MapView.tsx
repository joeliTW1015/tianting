import { useState } from 'preact/hooks';
import { cn } from '../core/calendar';
import { LABELS, MAP_H, MAP_W, mapGeometry, MOUNTAINS, polyline, proj, REGION_ORDER, REGIONS, RIVERS, WALL } from '../core/geography';
import type { RegionId } from '../core/types';
import type { PlayerView } from '../core/view';
import { ratioColor } from './charts';

interface Props {
  view: PlayerView;
  selected: RegionId;
  onSelect: (r: RegionId) => void;
}

type Mode = 'news' | 'mood' | 'tax';

const MOOD_COLOR: Record<string, string> = { 地方安靜: '#5f8f6a', 民多怨言: '#c9a446', 民情洶洶: '#b5321f' };

/** 認知輿圖：看到的不是現況，而是「最後一次聽說」。 */
export function MapView({ view, selected, onSelect }: Props) {
  const [mode, setMode] = useState<Mode>('news');
  const g = mapGeometry();
  const [cx, cy] = g.cells.jingshi.center;

  const fill = (r: RegionId): { color: string; opacity: number } => {
    const rv = view.regions[r];
    if (mode === 'tax') {
      const hist = view.finance.regionTax[r];
      const last = hist[hist.length - 1];
      if (REGIONS[r].tax <= 0) return { color: '#8e8476', opacity: 0.15 };
      return last ? { color: ratioColor(last.value / REGIONS[r].tax), opacity: 0.8 } : { color: '#8e8476', opacity: 0.2 };
    }
    if (mode === 'mood') {
      const f = rv.facts.find((x) => x.key === `unrest.${r}`);
      return f ? { color: MOOD_COLOR[String(f.value)] ?? '#8e8476', opacity: 0.75 } : { color: '#8e8476', opacity: 0.25 };
    }
    const age = rv.lastNews === null ? 99 : view.turn - rv.lastNews;
    const fresh = r === 'jingshi' ? 1 : Math.max(0.06, 1 - age / 10);
    return { color: '#5a4636', opacity: 0.15 + fresh * 0.6 };
  };

  return (
    <div class="map scroll-map">
      <div class="rod top" />
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="認知輿圖">
        <defs>
          <pattern id="held" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="#b5321f" opacity="0.25" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="#7e231d" stroke-width="4" opacity="0.7" />
          </pattern>
          <pattern id="waves" width="36" height="14" patternUnits="userSpaceOnUse">
            <path d="M0,10 q9,-8 18,0 t18,0" stroke="#8fb0b0" stroke-width="1.2" fill="none" opacity="0.6" />
          </pattern>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="#e4d6b4" />
        <path d={g.sea} fill="#c9d8d2" />
        <path d={g.sea} fill="url(#waves)" />
        {REGION_ORDER.map((r) => {
          const f = fill(r);
          return (
            <path
              key={r}
              d={g.cells[r].path}
              class={`region ${selected === r ? 'on' : ''}`}
              style={{ fill: f.color, fillOpacity: f.opacity }}
              onClick={() => onSelect(r)}
              data-region={r}
            />
          );
        })}
        {REGION_ORDER.filter((r) => view.regions[r].held).map((r) => (
          <path key={`h-${r}`} d={g.cells[r].path} fill="url(#held)" class="held" pointer-events="none" />
        ))}
        <path d={g.outline} fill="none" stroke="#5a4636" stroke-width="2" />
        {RIVERS.map((rv) => (
          <path key={rv.name} d={polyline(rv.pts)} class={`river ${rv.name === '運河' ? 'canal' : ''}`} />
        ))}
        <path d={polyline(WALL)} class="wall" />
        {MOUNTAINS.map((m, i) => {
          const [x, y] = proj(m);
          return <path key={i} d={`M${x - 9},${y + 6} L${x - 3},${y - 5} L${x},${y} L${x + 4},${y - 8} L${x + 10},${y + 6}`} class="mountain" />;
        })}
        {REGION_ORDER.filter((r) => r !== 'jingshi').map((r) => {
          const [x, y] = g.cells[r].center;
          return <line key={r} class="route" x1={cx} y1={cy} x2={x} y2={y} />;
        })}
        {LABELS.map((l) => {
          const [x, y] = proj(l.at);
          return (
            <text key={l.text} x={x} y={y} class="far">
              {l.text}
            </text>
          );
        })}
        {REGION_ORDER.map((r) => {
          const rv = view.regions[r];
          const [x, y] = g.cells[r].center;
          const age = rv.lastNews === null ? null : view.turn - rv.lastNews;
          return (
            <g key={r} class="label" onClick={() => onSelect(r)}>
              {r === 'jingshi' && <rect x={x - 7} y={y - 22} width="14" height="14" fill="#b5321f" stroke="#f3e6c8" stroke-width="1.5" />}
              <text x={x} y={y} class="rname">
                {REGIONS[r].name}
              </text>
              {r !== 'jingshi' && (
                <text x={x} y={y + 16} class="rage">
                  {age === null ? '無消息' : age <= 0 ? '本旬' : `${cn(age)}旬前`}
                </text>
              )}
              {rv.urgent && <path d={`M${x + 22},${y - 4} q-6,-8 0,-16 q6,8 0,16`} class="beacon" />}
              {rv.held && (
                <g class="held-flag">
                  <line x1={x - 6} y1={y - 22} x2={x - 6} y2={y - 46} stroke="#2b1e17" stroke-width="2" />
                  <path d={`M${x - 6},${y - 46} L${x + 22},${y - 41} L${x - 6},${y - 34} Z`} fill="#26221e" />
                  <text x={x + 5} y={y - 37} class="flag-text">
                    {rv.held.slice(0, 2)}
                  </text>
                </g>
              )}
              {!rv.held && rv.foe && (
                <g class="foe">
                  <path d={`M${x - 34},${y + 4} l7,-14 l7,14 Z`} fill="#b5321f" stroke="#fff" stroke-width="1" />
                  <text x={x - 27} y={y + 18} class="foe-text">
                    {Math.round(rv.foe.size / 1000)}千
                  </text>
                </g>
              )}
              {rv.inTransit > 0 && (
                <g>
                  <circle cx={x - 30} cy={y - 7} r="9" class="dot" />
                  <text x={x - 30} y={y - 3} class="dot-n">
                    {rv.inTransit}
                  </text>
                </g>
              )}
              {rv.note && (
                <text x={x + 20} y={y + 12} class="note-mark">
                  記
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div class="rod bottom" />
      <div class="map-legend">
        <span class="modes">
          <button class={mode === 'news' ? 'on' : ''} onClick={() => setMode('news')}>
            消息新舊
          </button>
          <button class={mode === 'mood' ? 'on' : ''} onClick={() => setMode('mood')}>
            所報民情
          </button>
          <button class={mode === 'tax' ? 'on' : ''} onClick={() => setMode('tax')} data-testid="map-tax">
            錢糧實解
          </button>
        </span>
        {mode === 'news' ? (
          <span class="muted">顏色越淡＝越久沒消息</span>
        ) : mode === 'tax' ? (
          <span class="muted">
            <i class="lg" style={{ background: ratioColor(0.9) }} />八成五↑ <i class="lg" style={{ background: ratioColor(0.6) }} />五成五 <i class="lg" style={{ background: ratioColor(0.3) }} />不足四成（最近一期總冊）
          </span>
        ) : (
          <span class="muted">
            <i class="lg" style={{ background: MOOD_COLOR['地方安靜'] }} />安靜 <i class="lg" style={{ background: MOOD_COLOR['民多怨言'] }} />怨言 <i class="lg" style={{ background: MOOD_COLOR['民情洶洶'] }} />洶洶（依你細讀過的最新奏報）
          </span>
        )}
        <span class="muted">
          <i class="lg dotl" />旨意在途 <i class="lg fire" />飛報 <i class="lg held-lg" />陷落 <i class="lg foe-lg" />敵情（據報）
        </span>
      </div>
    </div>
  );
}
