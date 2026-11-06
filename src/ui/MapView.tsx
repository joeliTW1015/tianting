import { useRef, useState } from 'preact/hooks';
import { cn } from '../core/calendar';
import { ALL_REGIONS, LABELS, MAP_H, MAP_W, mapGeometry, MOUNTAINS, OUTER, polyline, proj, REGION_ORDER, REGIONS, RIVERS, WALL } from '../core/geography';
import type { RegionId } from '../core/types';
import type { ArmyView, PlayerView } from '../core/view';
import { ratioColor } from './charts';

export type MapMode = 'power' | 'troops' | 'mood' | 'tax' | 'news';

interface Props {
  view: PlayerView;
  selected: RegionId | null;
  selectedArmy: number | null;
  onSelect: (r: RegionId) => void;
  onSelectArmy: (id: number) => void;
}

const MOOD_COLOR: Record<string, string> = { 地方安靜: '#5f8f6a', 民多怨言: '#c9a446', 民情洶洶: '#b5321f' };
const MODES: [MapMode, string][] = [
  ['power', '勢力'],
  ['troops', '兵力'],
  ['mood', '民情'],
  ['tax', '錢糧'],
  ['news', '消息'],
];

function wan(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}萬` : `${Math.round(n / 1000)}千`;
}

/** 認知輿圖：看到的是「最後一次聽說」與據報的數字。 */
export function MapView({ view, selected, selectedArmy, onSelect, onSelectArmy }: Props) {
  const [mode, setMode] = useState<MapMode>('power');
  const [zoom, setZoom] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; zx: number; zy: number; moved: boolean } | null>(null);
  const g = mapGeometry();
  const cap = g.cells[view.capital].center;

  const fill = (r: RegionId): { color: string; opacity: number } => {
    const rv = view.regions[r];
    if (REGIONS[r].kind === 'outer') return { color: rv.ownerColor, opacity: rv.owner === 'crown' ? 0.55 : 0.42 };
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
    if (mode === 'news') {
      const age = rv.lastNews === null ? 99 : view.turn - rv.lastNews;
      const fresh = r === view.capital ? 1 : Math.max(0.06, 1 - age / 10);
      return { color: '#5a4636', opacity: 0.15 + fresh * 0.6 };
    }
    if (mode === 'troops') return { color: '#c9b48a', opacity: 0.5 };
    return { color: '#d9c38f', opacity: 0.55 + rv.control / 400 };
  };

  const vb = `${zoom.x} ${zoom.y} ${MAP_W / zoom.k} ${MAP_H / zoom.k}`;
  const setK = (k: number, cx = MAP_W / 2, cy = MAP_H / 2) => {
    k = Math.max(1, Math.min(3, k));
    const w = MAP_W / k;
    const h = MAP_H / k;
    setZoom({ k, x: Math.max(0, Math.min(MAP_W - w, cx - w / 2)), y: Math.max(0, Math.min(MAP_H - h, cy - h / 2)) });
  };

  // 部隊依地區堆疊
  const stacks = new Map<RegionId, ArmyView[]>();
  for (const a of view.armies) stacks.set(a.region, [...(stacks.get(a.region) ?? []), a]);

  return (
    <div class="map scroll-map big-map">
      <div class="map-tools">
        <span class="modes">
          {MODES.map(([k, label]) => (
            <button key={k} class={mode === k ? 'on' : ''} onClick={() => setMode(k)} data-testid={`map-${k}`}>
              {label}
            </button>
          ))}
        </span>
        <span class="zoom">
          <button onClick={() => setK(zoom.k + 0.5, zoom.x + MAP_W / zoom.k / 2, zoom.y + MAP_H / zoom.k / 2)}>＋</button>
          <button onClick={() => setK(zoom.k - 0.5, zoom.x + MAP_W / zoom.k / 2, zoom.y + MAP_H / zoom.k / 2)}>－</button>
        </span>
      </div>
      <svg
        viewBox={vb}
        role="img"
        aria-label="輿圖"
        onWheel={(e) => {
          e.preventDefault();
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const cx = zoom.x + ((e.clientX - rect.left) / rect.width) * (MAP_W / zoom.k);
          const cy = zoom.y + ((e.clientY - rect.top) / rect.height) * (MAP_H / zoom.k);
          setK(zoom.k * (e.deltaY < 0 ? 1.2 : 1 / 1.2), cx, cy);
        }}
        onPointerDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, zx: zoom.x, zy: zoom.y, moved: false })}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || zoom.k === 1) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const dx = ((e.clientX - d.x) / rect.width) * (MAP_W / zoom.k);
          const dy = ((e.clientY - d.y) / rect.height) * (MAP_H / zoom.k);
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          const w = MAP_W / zoom.k;
          const h = MAP_H / zoom.k;
          setZoom({ k: zoom.k, x: Math.max(0, Math.min(MAP_W - w, d.zx - dx)), y: Math.max(0, Math.min(MAP_H - h, d.zy - dy)) });
        }}
        onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
      >
        <defs>
          <pattern id="held" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="#b5321f" opacity="0.25" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="#7e231d" stroke-width="4" opacity="0.7" />
          </pattern>
          <pattern id="waves" width="36" height="14" patternUnits="userSpaceOnUse">
            <path d="M0,10 q9,-8 18,0 t18,0" stroke="#8fb0b0" stroke-width="1.2" fill="none" opacity="0.6" />
          </pattern>
          <pattern id="loose" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#5a4636" stroke-width="1.2" opacity="0.35" />
          </pattern>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#2f5d7c" />
          </marker>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="#e4d6b4" />
        <path d={g.sea} fill="#c9d8d2" />
        <path d={g.sea} fill="url(#waves)" />
        {OUTER.map((r) => {
          const f = fill(r);
          return <path key={r} d={g.cells[r].path} class={`region outer ${selected === r ? 'on' : ''} ${r === 'donghai' ? 'sea-zone' : ''}`} style={{ fill: f.color, fillOpacity: f.opacity }} onClick={() => !drag.current?.moved && onSelect(r)} data-region={r} />;
        })}
        {REGION_ORDER.map((r) => {
          const f = fill(r);
          return <path key={r} d={g.cells[r].path} class={`region ${selected === r ? 'on' : ''}`} style={{ fill: f.color, fillOpacity: f.opacity }} onClick={() => !drag.current?.moved && onSelect(r)} data-region={r} />;
        })}
        {mode === 'power' && REGION_ORDER.filter((r) => view.regions[r].control < 50).map((r) => <path key={`l-${r}`} d={g.cells[r].path} fill="url(#loose)" pointer-events="none" />)}
        {ALL_REGIONS.filter((r) => view.regions[r].held).map((r) => (
          <path key={`h-${r}`} d={g.cells[r].path} fill="url(#held)" class="held" pointer-events="none" />
        ))}
        <path d={g.outline} fill="none" stroke="#5a4636" stroke-width="2" pointer-events="none" />
        {RIVERS.map((rv) => (
          <path key={rv.name} d={polyline(rv.pts)} class={`river ${rv.name === '運河' ? 'canal' : ''}`} pointer-events="none" />
        ))}
        <path d={polyline(WALL)} class="wall" pointer-events="none" />
        {MOUNTAINS.map((m, i) => {
          const [x, y] = proj(m);
          return <path key={i} d={`M${x - 9},${y + 6} L${x - 3},${y - 5} L${x},${y} L${x + 4},${y - 8} L${x + 10},${y + 6}`} class="mountain" pointer-events="none" />;
        })}
        {LABELS.map((l) => {
          const [x, y] = proj(l.at);
          return (
            <text key={l.text} x={x} y={y} class="far" pointer-events="none">
              {l.text}
            </text>
          );
        })}
        {/* 旨意在途：京師到各地的驛路 */}
        {ALL_REGIONS.filter((r) => view.regions[r].inTransit > 0 && r !== view.capital).map((r) => {
          const [x, y] = g.cells[r].center;
          return <line key={`c-${r}`} class="courier" x1={cap[0]} y1={cap[1]} x2={x} y2={y} />;
        })}
        {/* 行軍路線 */}
        {view.armies.filter((a) => a.path.length).map((a) => {
          const pts = [a.region, ...a.path].map((r) => g.cells[r].center);
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
          const end = pts[pts.length - 1];
          return (
            <g key={`p-${a.id}`} pointer-events="none">
              <path d={d} class="march" marker-end="url(#arrow)" />
              {a.eta !== undefined && (
                <text x={end[0] + 8} y={end[1] - 8} class="eta">
                  {Math.max(0, a.eta - view.turn + a.path.length - 1)}旬
                </text>
              )}
            </g>
          );
        })}
        {ALL_REGIONS.map((r) => {
          const rv = view.regions[r];
          const [x, y] = g.cells[r].center;
          const outer = REGIONS[r].kind === 'outer';
          const age = rv.lastNews === null ? null : view.turn - rv.lastNews;
          return (
            <g key={r} class="label" onClick={() => onSelect(r)}>
              {r === view.capital && <path d={`M${x},${y - 30} l5,10 l11,1 l-8,7 l3,11 l-11,-6 l-11,6 l3,-11 l-8,-7 l11,-1 Z`} fill="#b5321f" stroke="#f3e6c8" stroke-width="1.5" />}
              <text x={x} y={y} class={`rname ${outer ? 'outer-name' : ''}`}>
                {REGIONS[r].name}
              </text>
              {outer && (
                <text x={x} y={y + 15} class="rage owner-name">
                  {rv.ownerName}
                </text>
              )}
              {!outer && r !== view.capital && mode === 'news' && (
                <text x={x} y={y + 15} class="rage">
                  {age === null ? '無消息' : age <= 0 ? '本旬' : `${cn(age)}旬前`}
                </text>
              )}
              {mode === 'troops' && rv.troops && (
                <text x={x} y={y + 16} class={`troop-label ${rv.troops.certified ? 'sure' : ''}`}>
                  {rv.troops.certified ? '確' : '報'} {wan(rv.troops.value)}
                </text>
              )}
              {rv.urgent && <path d={`M${x + 24},${y - 4} q-6,-8 0,-16 q6,8 0,16`} class="beacon" />}
              {rv.held && (
                <g class="held-flag">
                  <line x1={x - 6} y1={y - 22} x2={x - 6} y2={y - 46} stroke="#2b1e17" stroke-width="2" />
                  <path d={`M${x - 6},${y - 46} L${x + 22},${y - 41} L${x - 6},${y - 34} Z`} fill="#26221e" />
                  <text x={x + 5} y={y - 37} class="flag-text">
                    {rv.held.slice(0, 2)}
                  </text>
                </g>
              )}
              {rv.foe && (
                <g class="foe">
                  <path d={`M${x - 38},${y + 6} l9,-17 l9,17 Z`} fill="#b5321f" stroke="#fff" stroke-width="1" />
                  <text x={x - 29} y={y + 22} class="foe-text">
                    {wan(rv.foe.size)}
                  </text>
                </g>
              )}
              {rv.inTransit > 0 && (
                <g>
                  <circle cx={x + 30} cy={y - 18} r="8" class="dot" />
                  <text x={x + 30} y={y - 14} class="dot-n">
                    {rv.inTransit}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {/* 官軍棋子 */}
        {[...stacks.entries()].map(([r, list]) =>
          list.map((a, i) => {
            const [x, y] = g.cells[r].center;
            const tx = x + 26 + i * 8;
            const ty = y + 8 + i * 22;
            return (
              <g key={a.id} class={`token ${selectedArmy === a.id ? 'on' : ''} ${a.campaign ? 'campaign' : ''}`} onClick={(e) => (e.stopPropagation(), onSelectArmy(a.id))} data-army={a.id}>
                <circle cx={tx} cy={ty} r="13" />
                <text x={tx} y={ty + 4} class="token-unit">
                  {a.unit.slice(0, 1)}
                </text>
                <rect x={tx + 13} y={ty - 8} width="38" height="16" rx="3" class="token-tag" />
                <text x={tx + 32} y={ty + 4} class="token-n">
                  {wan(a.real ?? a.reported)}
                </text>
              </g>
            );
          }),
        )}
      </svg>
      <div class="map-legend">
        <span class="muted">
          <i class="lg tok" />官軍（點選可下令） <i class="lg foe-lg" />敵情（據報） <i class="lg held-lg" />陷落 <i class="lg dotl" />旨意在途 <i class="lg fire" />飛報
        </span>
        {mode === 'power' && (
          <span class="muted">
            {view.powers.filter((p) => p.alive && p.regions.length).map((p) => (
              <span key={p.id} class="lg-power">
                <i class="lg" style={{ background: p.color }} />
                {p.name}
              </span>
            ))}
            <span class="lg-power">
              <i class="lg loose-lg" />控制度不足五成
            </span>
          </span>
        )}
        {mode === 'troops' && <span class="muted">「報」＝兵部名冊（常虛報）；「確」＝點驗或東廠密查。</span>}
        {mode === 'tax' && (
          <span class="muted">
            <i class="lg" style={{ background: ratioColor(0.9) }} />八成五↑ <i class="lg" style={{ background: ratioColor(0.6) }} />五成五 <i class="lg" style={{ background: ratioColor(0.3) }} />不足四成
          </span>
        )}
        {mode === 'mood' && (
          <span class="muted">
            <i class="lg" style={{ background: MOOD_COLOR['地方安靜'] }} />安靜 <i class="lg" style={{ background: MOOD_COLOR['民多怨言'] }} />怨言 <i class="lg" style={{ background: MOOD_COLOR['民情洶洶'] }} />洶洶（依你讀過的奏報）
          </span>
        )}
      </div>
    </div>
  );
}
