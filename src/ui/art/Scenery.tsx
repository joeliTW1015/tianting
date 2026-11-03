// 場景美術（向量）：御書房、窗景四季、書案文房、宮門晨曦、殿上、夜色過場、資源圖示。

import type { Season } from '../../core/calendar';

/** 宮殿屋頂（重簷廡殿頂）剪影 */
function Roof({ x, y, w, color = '#2a1d17', eave = '#3a2a20' }: { x: number; y: number; w: number; color?: string; eave?: string }) {
  const h = w * 0.16;
  return (
    <g>
      <path d={`M${x - w * 0.06},${y + h} Q${x + w * 0.1},${y + h * 0.7} ${x + w * 0.18},${y} L${x + w * 0.82},${y} Q${x + w * 0.9},${y + h * 0.7} ${x + w * 1.06},${y + h} Q${x + w * 0.5},${y + h * 0.82} ${x - w * 0.06},${y + h} Z`} fill={color} />
      <rect x={x + w * 0.18} y={y - h * 0.18} width={w * 0.64} height={h * 0.2} fill={eave} />
      <path d={`M${x + w * 0.16},${y - h * 0.18} q-${w * 0.03},-${h * 0.5} ${w * 0.03},-${h * 0.55}`} stroke={color} stroke-width={w * 0.012} fill="none" />
      <path d={`M${x + w * 0.84},${y - h * 0.18} q${w * 0.03},-${h * 0.5} -${w * 0.03},-${h * 0.55}`} stroke={color} stroke-width={w * 0.012} fill="none" />
    </g>
  );
}

function Cloud({ x, y, s = 1, fill = '#f6e7c8', o = 0.6 }: { x: number; y: number; s?: number; fill?: string; o?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} opacity={o}>
      <path d="M0,0 q10,-14 24,-6 q8,-14 24,-4 q14,-6 18,6 q12,0 10,10 l-80,0 q-8,-2 4,-6 Z" fill={fill} />
      <path d="M20,-2 q6,-6 12,0 q-6,2 -12,0" stroke="#d9b57a" stroke-width="1" fill="none" />
    </g>
  );
}

// ───────────────────────── 御書房背景 ─────────────────────────

export function StudyBackdrop() {
  return (
    <svg class="backdrop" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3b2a20" />
          <stop offset="0.6" stop-color="#2b1e17" />
          <stop offset="1" stop-color="#1c1410" />
        </linearGradient>
        <pattern id="lattice" width="28" height="28" patternUnits="userSpaceOnUse">
          <rect width="28" height="28" fill="none" />
          <path d="M0,14 H28 M14,0 V28 M4,4 L10,10 M24,4 L18,10 M4,24 L10,18 M24,24 L18,18" stroke="#4a3427" stroke-width="2" />
        </pattern>
        <linearGradient id="pillar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#6e1d16" />
          <stop offset="0.45" stop-color="#a8322a" />
          <stop offset="1" stop-color="#5c1812" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#wall)" />
      <rect x="0" y="120" width="1600" height="560" fill="url(#lattice)" opacity="0.5" />
      {/* 樑枋彩畫 */}
      <rect x="0" y="0" width="1600" height="64" fill="#2a3b3a" />
      {Array.from({ length: 20 }, (_, i) => (
        <g key={i}>
          <circle cx={40 + i * 80} cy="32" r="18" fill="#2f5d7c" stroke="#c9a446" stroke-width="2" />
          <circle cx={40 + i * 80} cy="32" r="9" fill="#3f7a52" />
          <path d={`M${68 + i * 80},10 l12,22 l-12,22`} stroke="#c9a446" stroke-width="2" fill="none" />
        </g>
      ))}
      <rect x="0" y="62" width="1600" height="6" fill="#c9a446" opacity="0.7" />
      {/* 柱 */}
      <rect x="0" y="64" width="34" height="836" fill="url(#pillar)" />
      <rect x="1566" y="64" width="34" height="836" fill="url(#pillar)" />
      <rect x="0" y="840" width="1600" height="60" fill="#120c09" />
    </svg>
  );
}

// ───────────────────────── 窗景（四季） ─────────────────────────

export function WindowView({ season, night = false }: { season: Season; night?: boolean }) {
  const sky = night ? ['#1b2236', '#2c3550'] : season === 'winter' ? ['#cfd8de', '#eef1f2'] : season === 'autumn' ? ['#f2d29a', '#f7e6c4'] : season === 'summer' ? ['#a9d0d6', '#e3f1ec'] : ['#f3d6d6', '#f8efe2'];
  return (
    <svg class="window-view" viewBox="0 0 600 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`sky-${season}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={sky[0]} />
          <stop offset="1" stop-color={sky[1]} />
        </linearGradient>
      </defs>
      <rect width="600" height="120" fill={`url(#sky-${season})`} />
      {/* 遠山 */}
      <path d="M0,92 Q60,58 120,80 T260,70 T400,82 T600,66 L600,120 L0,120 Z" fill={season === 'winter' ? '#b8c4cc' : '#9fb2a6'} opacity="0.6" />
      {/* 遠處宮牆屋頂 */}
      <rect x="0" y="96" width="600" height="24" fill="#8e2a22" />
      <rect x="0" y="92" width="600" height="6" fill="#c9a446" />
      <Roof x={330} y={62} w={170} color="#5a4520" eave="#c9a446" />
      <rect x="350" y="78" width="130" height="18" fill="#8e2a22" />
      {season === 'spring' && (
        <g>
          <path d="M0,10 Q60,30 120,26 Q170,24 210,44" stroke="#4a3427" stroke-width="4" fill="none" />
          <path d="M80,24 q10,-14 30,-18" stroke="#4a3427" stroke-width="2.5" fill="none" />
          {[[40, 18], [70, 26], [100, 12], [130, 27], [160, 30], [190, 40], [115, 8], [55, 30]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 3} cy={Math.sin((a * Math.PI) / 180) * 3} r="2.6" fill="#f2b8c0" />
              ))}
              <circle r="1.4" fill="#c9a446" />
            </g>
          ))}
        </g>
      )}
      {season === 'summer' && (
        <g stroke="#3f7a52" stroke-width="3">
          {[20, 50, 560, 585].map((x) => (
            <line key={x} x1={x} y1="0" x2={x + 4} y2="120" />
          ))}
          {[20, 50, 560, 585].flatMap((x) => [20, 50, 80].map((y) => <path key={`${x}${y}`} d={`M${x + 2},${y} q16,-6 26,2 q-14,-2 -26,-2`} fill="#4f8a5f" stroke="none" />))}
        </g>
      )}
      {season === 'autumn' && (
        <g>
          <path d="M600,6 Q520,24 470,22 Q430,22 400,40" stroke="#4a3427" stroke-width="4" fill="none" />
          {[[560, 16], [520, 26], [480, 20], [440, 30], [500, 12], [415, 42], [540, 30]].map(([x, y], i) => (
            <path key={i} d={`M${x},${y} l5,-6 l2,6 l6,1 l-6,3 l1,6 l-5,-4 l-5,4 l1,-6 l-6,-3 l6,-1 Z`} fill={i % 2 ? '#c4522e' : '#d98a2b'} />
          ))}
          {[[300, 50], [250, 70], [200, 40]].map(([x, y], i) => (
            <path key={i} d={`M${x},${y} l4,-4 l2,4 l4,1 l-4,2 l1,4 l-4,-3 l-3,3 l1,-4 l-4,-2 l4,-1 Z`} fill="#d98a2b" opacity="0.8" />
          ))}
        </g>
      )}
      {season === 'winter' && (
        <g fill="#ffffff">
          <rect x="0" y="90" width="600" height="4" opacity="0.9" />
          <path d="M330,62 L500,62 Q470,58 415,56 Q360,58 330,62 Z" opacity="0.9" />
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} cx={(i * 97) % 600} cy={(i * 53) % 110} r={1 + (i % 3) * 0.6} opacity="0.85" />
          ))}
          <path d="M0,20 Q50,36 100,30" stroke="#4a3427" stroke-width="3" fill="none" />
          <path d="M0,18 Q50,32 100,27" stroke="#fff" stroke-width="2" fill="none" />
          {[[30, 28], [60, 32], [86, 28]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3" fill="#b5321f" />
          ))}
        </g>
      )}
      {night && (
        <g>
          <circle cx="90" cy="30" r="14" fill="#f6edc9" />
          {Array.from({ length: 16 }, (_, i) => (
            <circle key={i} cx={(i * 131) % 600} cy={(i * 37) % 60} r="1" fill="#fff" opacity="0.7" />
          ))}
        </g>
      )}
      {/* 窗櫺 */}
      <g stroke="#3a281e" stroke-width="5" fill="none">
        <rect x="2" y="2" width="596" height="116" />
        {[100, 200, 300, 400, 500].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="120" />
        ))}
        <line x1="0" y1="60" x2="600" y2="60" stroke-width="3" />
      </g>
      <g stroke="#3a281e" stroke-width="1.5" opacity="0.6">
        {[50, 150, 250, 350, 450, 550].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="120" />
        ))}
        {[30, 90].map((y) => (
          <line key={y} x1="0" y1={y} x2="600" y2={y} />
        ))}
      </g>
    </svg>
  );
}

// ───────────────────────── 書案文房 ─────────────────────────

export function Inkstone() {
  return (
    <svg viewBox="0 0 120 80" class="prop" aria-hidden="true">
      <ellipse cx="60" cy="58" rx="54" ry="16" fill="#000" opacity="0.25" />
      <rect x="10" y="20" width="100" height="44" rx="12" fill="#2b2a2d" />
      <rect x="16" y="24" width="88" height="34" rx="9" fill="#3a393e" />
      <ellipse cx="60" cy="44" rx="30" ry="10" fill="#151416" />
      <ellipse cx="54" cy="42" rx="10" ry="3" fill="#ffffff" opacity="0.08" />
      <rect x="78" y="6" width="12" height="40" rx="3" fill="#1d1c1f" transform="rotate(28 84 26)" />
    </svg>
  );
}

export function BrushRest() {
  return (
    <svg viewBox="0 0 160 90" class="prop" aria-hidden="true">
      <ellipse cx="80" cy="82" rx="70" ry="6" fill="#000" opacity="0.25" />
      <path d="M10,78 L10,60 Q20,40 30,60 Q40,30 50,60 Q60,34 70,60 Q80,24 90,60 Q100,34 110,60 Q120,30 130,60 Q140,40 150,60 L150,78 Z" fill="#6b4a2b" stroke="#3e2a18" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`rotate(-8 80 50) translate(0 ${i * 9})`}>
          <rect x="18" y="40" width="112" height="4.5" rx="2" fill={i === 1 ? '#a8322a' : '#c9a24e'} />
          <path d="M130,40 l18,2 l-18,3 Z" fill={i === 0 ? '#b5321f' : '#1d1a18'} />
          <rect x="14" y="39.5" width="6" height="5.5" fill="#2b1e17" />
        </g>
      ))}
    </svg>
  );
}

export function SealProp() {
  return (
    <svg viewBox="0 0 90 90" class="prop" aria-hidden="true">
      <ellipse cx="45" cy="80" rx="34" ry="7" fill="#000" opacity="0.25" />
      <rect x="16" y="46" width="58" height="32" rx="3" fill="#e8dcc0" stroke="#a89670" />
      <path d="M24,46 Q22,20 45,18 Q68,20 66,46 Z" fill="#c7d6c4" stroke="#8fa68b" />
      <path d="M32,30 q13,-14 26,0 q-6,8 -13,6 q-7,2 -13,-6" fill="#a9bea5" />
      <circle cx="40" cy="28" r="2" fill="#5f7a5b" />
      <rect x="22" y="64" width="46" height="10" fill="#b5321f" opacity="0.85" />
    </svg>
  );
}

export function Candle({ lit = true }: { lit?: boolean }) {
  return (
    <svg viewBox="0 0 60 130" class="prop candle" aria-hidden="true">
      <ellipse cx="30" cy="124" rx="26" ry="5" fill="#000" opacity="0.25" />
      <path d="M8,124 L52,124 L46,112 L14,112 Z" fill="#9a7a3a" />
      <rect x="27" y="80" width="6" height="32" fill="#9a7a3a" />
      <ellipse cx="30" cy="80" rx="16" ry="4" fill="#b8954a" />
      <rect x="22" y="44" width="16" height="36" rx="2" fill="#c0392b" />
      <path d="M22,48 q4,6 0,12" stroke="#e35d4a" stroke-width="2" fill="none" />
      {lit && (
        <g class="flame">
          <ellipse cx="30" cy="30" rx="16" ry="20" fill="#f7c35a" opacity="0.18" />
          <path d="M30,16 Q38,30 30,42 Q22,30 30,16 Z" fill="#f7b733" />
          <path d="M30,24 Q34,32 30,40 Q26,32 30,24 Z" fill="#fff3c4" />
        </g>
      )}
    </svg>
  );
}

export function TeaCup() {
  return (
    <svg viewBox="0 0 80 60" class="prop" aria-hidden="true">
      <ellipse cx="40" cy="54" rx="34" ry="5" fill="#000" opacity="0.2" />
      <ellipse cx="40" cy="50" rx="30" ry="6" fill="#e9eef0" stroke="#9aa9b0" />
      <path d="M18,22 Q20,48 40,48 Q60,48 62,22 Z" fill="#f2f5f6" stroke="#9aa9b0" />
      <ellipse cx="40" cy="22" rx="22" ry="5" fill="#c9b47a" />
      <path d="M26,32 q14,8 28,0" stroke="#2f5d7c" stroke-width="2" fill="none" />
      <path d="M34,12 q-4,-6 2,-10 M44,12 q-4,-6 2,-10" stroke="#aaa" stroke-width="1.2" fill="none" opacity="0.6" />
    </svg>
  );
}

// ───────────────────────── 宮門晨曦（開始畫面） ─────────────────────────

export function PalaceDawn() {
  return (
    <svg class="dawn" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="dawnSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2c3a5a" />
          <stop offset="0.45" stop-color="#c7766a" />
          <stop offset="0.75" stop-color="#f2c27a" />
          <stop offset="1" stop-color="#f7e2b0" />
        </linearGradient>
        <radialGradient id="sun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#fff2c4" />
          <stop offset="0.5" stop-color="#f7c35a" />
          <stop offset="1" stop-color="#f7c35a" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="600" fill="url(#dawnSky)" />
      <circle cx="800" cy="330" r="150" fill="url(#sun)" />
      <circle cx="800" cy="330" r="52" fill="#fbe3a0" />
      <Cloud x={260} y={160} s={2.2} o={0.5} />
      <Cloud x={1150} y={130} s={2.6} o={0.45} />
      <Cloud x={560} y={230} s={1.4} o={0.55} />
      <Cloud x={1300} y={260} s={1.6} o={0.5} />
      {/* 仙鶴 */}
      {[[420, 120, 1], [470, 150, 0.8], [1180, 200, 0.9]].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x},${y}) scale(${s})`} fill="#2a1d17">
          <path d="M0,0 q20,-14 40,-4 q-10,2 -18,6 q14,-2 30,10 q-20,-4 -32,0 q-8,8 -24,6 q10,-4 4,-18 Z" />
        </g>
      ))}
      {/* 遠方宮殿 */}
      <rect x="0" y="430" width="1600" height="170" fill="#5c1d16" />
      <rect x="0" y="420" width="1600" height="14" fill="#c9a446" opacity="0.8" />
      <Roof x={200} y={360} w={260} color="#3a2414" eave="#c9a446" />
      <Roof x={1140} y={360} w={260} color="#3a2414" eave="#c9a446" />
      <rect x="230" y="390" width="200" height="40" fill="#7e231d" />
      <rect x="1170" y="390" width="200" height="40" fill="#7e231d" />
      {/* 午門主樓 */}
      <rect x="560" y="400" width="480" height="200" fill="#8e2a22" />
      {[620, 760, 900].map((x) => (
        <path key={x} d={`M${x},600 L${x},520 Q${x + 40},470 ${x + 80},520 L${x + 80},600 Z`} fill="#2a1612" />
      ))}
      <rect x="600" y="300" width="400" height="100" fill="#7e231d" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={612 + i * 44} y="310" width="12" height="90" fill="#5c1812" />
      ))}
      <Roof x={560} y={250} w={480} color="#2c1c12" eave="#c9a446" />
      <rect x="760" y="270" width="80" height="26" fill="#2f5d7c" stroke="#c9a446" stroke-width="3" />
      <text x="800" y="290" text-anchor="middle" fill="#f3e6c8" font-size="18" font-weight="700">午　門</text>
      <rect x="0" y="580" width="1600" height="20" fill="#e8dcc0" opacity="0.6" />
    </svg>
  );
}

// ───────────────────────── 殿上（召見） ─────────────────────────

export function HallScene() {
  return (
    <svg class="hall" viewBox="0 0 800 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="hallFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3a3530" />
          <stop offset="1" stop-color="#1c1915" />
        </linearGradient>
        <linearGradient id="hallWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4a1f19" />
          <stop offset="1" stop-color="#2a120e" />
        </linearGradient>
      </defs>
      <rect width="800" height="250" fill="url(#hallWall)" />
      <rect y="0" width="800" height="40" fill="#2a3b3a" />
      {Array.from({ length: 11 }, (_, i) => (
        <circle key={i} cx={40 + i * 75} cy="20" r="13" fill="#2f5d7c" stroke="#c9a446" stroke-width="2" />
      ))}
      <rect y="250" width="800" height="170" fill="url(#hallFloor)" />
      {Array.from({ length: 13 }, (_, i) => (
        <line key={i} x1={400} y1={250} x2={-200 + i * 100} y2={420} stroke="#58514a" stroke-width="1" opacity="0.6" />
      ))}
      {[280, 310, 350, 400].map((y) => (
        <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#58514a" stroke-width="1" opacity="0.5" />
      ))}
      {[60, 200, 600, 740].map((x, i) => (
        <g key={x}>
          <rect x={x - (i === 0 || i === 3 ? 26 : 18)} y="40" width={i === 0 || i === 3 ? 52 : 36} height={i === 0 || i === 3 ? 380 : 220} fill="#a8322a" />
          <rect x={x - (i === 0 || i === 3 ? 26 : 18)} y="40" width="8" height={i === 0 || i === 3 ? 380 : 220} fill="#6e1d16" opacity="0.6" />
        </g>
      ))}
      {/* 御座台階 */}
      <rect x="320" y="200" width="160" height="16" fill="#c9a446" />
      <rect x="300" y="216" width="200" height="16" fill="#b38f39" />
      <rect x="280" y="232" width="240" height="18" fill="#9a7a30" />
      <rect x="350" y="120" width="100" height="80" rx="6" fill="#c9a446" opacity="0.85" />
      <path d="M360,120 Q400,96 440,120" stroke="#e6c25a" stroke-width="6" fill="none" />
    </svg>
  );
}

// ───────────────────────── 夜色過場 ─────────────────────────

export function NightPalace() {
  return (
    <svg class="night" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="nightSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0d1222" />
          <stop offset="1" stop-color="#29304a" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#nightSky)" />
      {Array.from({ length: 80 }, (_, i) => (
        <circle key={i} cx={(i * 197) % 1600} cy={(i * 89) % 520} r={0.6 + (i % 3) * 0.5} fill="#fff" opacity={0.3 + (i % 5) * 0.12} />
      ))}
      <circle cx="1200" cy="200" r="60" fill="#f6edc9" />
      <circle cx="1225" cy="185" r="56" fill="#0d1222" opacity="0.15" />
      <Cloud x={1050} y={250} s={2.4} fill="#3a4466" o={0.7} />
      <rect y="640" width="1600" height="260" fill="#0a0c14" />
      <Roof x={300} y={540} w={1000} color="#0a0c14" eave="#0a0c14" />
      <rect x="380" y="600" width="840" height="60" fill="#0a0c14" />
      {[460, 700, 940, 1140].map((x) => (
        <g key={x} class="lantern">
          <line x1={x} y1="600" x2={x} y2="640" stroke="#3a2a20" stroke-width="2" />
          <ellipse cx={x} cy="664" rx="18" ry="24" fill="#c0392b" />
          <ellipse cx={x} cy="664" rx="30" ry="34" fill="#f7b733" opacity="0.15" />
        </g>
      ))}
    </svg>
  );
}

// ───────────────────────── 資源圖示 ─────────────────────────

export function Icon({ name, size = 22 }: { name: 'silver' | 'grain' | 'privy' | 'troops' | 'prestige' | 'energy' | 'tax'; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} class="icon" aria-hidden="true">
      {name === 'silver' && (
        <g>
          <path d="M3,18 Q4,12 10,14 Q12,8 16,8 Q20,8 22,14 Q28,12 29,18 Q24,26 16,26 Q8,26 3,18 Z" fill="#d8dde2" stroke="#7c8790" />
          <ellipse cx="16" cy="14" rx="5" ry="4" fill="#eef1f3" />
        </g>
      )}
      {name === 'grain' && (
        <g>
          <path d="M8,28 Q6,14 12,10 L20,10 Q26,14 24,28 Z" fill="#c9a24e" stroke="#7a5a20" />
          <path d="M11,10 Q16,4 21,10" stroke="#7a5a20" stroke-width="2" fill="none" />
          <path d="M12,18 h8 M12,22 h8" stroke="#7a5a20" stroke-width="1.2" />
        </g>
      )}
      {name === 'privy' && (
        <g>
          <rect x="5" y="12" width="22" height="15" rx="2" fill="#a8322a" stroke="#5c1812" />
          <path d="M5,12 Q16,4 27,12" fill="#c0392b" stroke="#5c1812" />
          <rect x="13" y="16" width="6" height="6" fill="#c9a446" />
        </g>
      )}
      {name === 'troops' && (
        <g>
          <line x1="8" y1="4" x2="8" y2="29" stroke="#5a4520" stroke-width="2" />
          <path d="M9,5 L27,8 L22,12 L27,16 L9,18 Z" fill="#b5321f" />
          <circle cx="16" cy="11" r="2.4" fill="#f3e6c8" />
        </g>
      )}
      {name === 'prestige' && (
        <g>
          <circle cx="16" cy="16" r="11" fill="#7fae8a" stroke="#3f7a52" stroke-width="1.5" />
          <circle cx="16" cy="16" r="4" fill="#f3e6c8" stroke="#3f7a52" />
          <path d="M16,5 L16,1 M16,27 L16,31" stroke="#c9a446" stroke-width="2" />
        </g>
      )}
      {name === 'energy' && (
        <g>
          <rect x="12" y="14" width="8" height="15" fill="#c0392b" />
          <path d="M16,3 Q22,10 16,14 Q10,10 16,3 Z" fill="#f7b733" />
        </g>
      )}
      {name === 'tax' && (
        <g>
          <rect x="6" y="5" width="20" height="23" rx="1" fill="#f3e6c8" stroke="#7a5a20" />
          <path d="M10,11 h12 M10,15 h12 M10,19 h8" stroke="#7a5a20" stroke-width="1.5" />
          <rect x="18" y="20" width="6" height="6" fill="#b5321f" />
        </g>
      )}
    </svg>
  );
}

export { Roof, Cloud };
