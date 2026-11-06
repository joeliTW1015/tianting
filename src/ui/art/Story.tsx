// 開場與結局幻燈片的場景（向量）。每張都是 1600×900，配合幻燈片的緩慢推鏡。

import { Portrait } from './Portrait';
import { Cloud, HallScene, NightPalace, PalaceDawn, Roof } from './Scenery';

export type SceneId =
  | 'palaceNight'
  | 'dawn'
  | 'hall'
  | 'eunuch'
  | 'frontier'
  | 'drought'
  | 'prince'
  | 'throne'
  | 'sea'
  | 'prosper'
  | 'calm'
  | 'south'
  | 'fall'
  | 'death'
  | 'deposed'
  | 'captured'
  | 'scroll';

function Sky({ id, stops }: { id: string; stops: [number, string][] }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        {stops.map(([o, c]) => (
          <stop key={o} offset={o} stop-color={c} />
        ))}
      </linearGradient>
    </defs>
  );
}

function Hills({ y, color, amp = 60, seed = 1, opacity = 1 }: { y: number; color: string; amp?: number; seed?: number; opacity?: number }) {
  const pts: string[] = [`M0,900 L0,${y}`];
  for (let x = 0; x <= 1600; x += 80) {
    const h = Math.sin((x + seed * 137) / 170) * amp + Math.sin((x + seed * 61) / 63) * amp * 0.35;
    pts.push(`L${x},${y - h}`);
  }
  pts.push('L1600,900 Z');
  return <path d={pts.join(' ')} fill={color} opacity={opacity} />;
}

function Particles({ kind, n = 60 }: { kind: 'snow' | 'ember' | 'dust' | 'petal'; n?: number }) {
  const color = { snow: '#ffffff', ember: '#ffb14a', dust: '#d9b77a', petal: '#f5b7c4' }[kind];
  return (
    <g class={`particles p-${kind}`}>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={(i * 263) % 1600} cy={(i * 131) % 900} r={kind === 'snow' ? 2 + (i % 3) : 1.5 + (i % 2)} fill={color} opacity={0.35 + (i % 4) * 0.15} style={{ animationDelay: `${-(i % 17) * 0.7}s` }} />
      ))}
    </g>
  );
}

function City({ y, color, fire = false }: { y: number; color: string; fire?: boolean }) {
  return (
    <g>
      <rect x="0" y={y} width="1600" height={900 - y} fill={color} />
      {Array.from({ length: 22 }, (_, i) => (
        <rect key={i} x={i * 74} y={y - 18} width="44" height="22" fill={color} />
      ))}
      <Roof x={620} y={y - 150} w={360} color={color} eave={fire ? '#ff7a2a' : color} />
      <rect x="660" y={y - 110} width="280" height="112" fill={color} />
      {fire &&
        [300, 520, 1060, 1300].map((x, i) => (
          <g key={x} class="flame" style={{ animationDelay: `${i * 0.3}s` }}>
            <path d={`M${x},${y} q-40,-90 0,-170 q40,80 0,170 Z`} fill="#ff7a2a" opacity="0.8" />
            <path d={`M${x},${y} q-20,-60 0,-110 q20,50 0,110 Z`} fill="#ffd36b" />
          </g>
        ))}
    </g>
  );
}

function Banner({ x, y, color, text, h = 120 }: { x: number; y: number; color: string; text: string; h?: number }) {
  return (
    <g class="banner-sway" style={{ transformOrigin: `${x}px ${y}px` }}>
      <line x1={x} y1={y} x2={x} y2={y + h + 60} stroke="#2a1d17" stroke-width="5" />
      <path d={`M${x},${y} L${x + 70},${y + 10} L${x + 64},${y + h * 0.5} L${x + 70},${y + h} L${x},${y + h - 10} Z`} fill={color} />
      <text x={x + 34} y={y + h * 0.58} text-anchor="middle" fill="#f3e6c8" font-size="40" font-weight="700">
        {text}
      </text>
    </g>
  );
}

function Horsemen({ y, n = 9, color = '#1c140f' }: { y: number; n?: number; color?: string }) {
  return (
    <g fill={color}>
      {Array.from({ length: n }, (_, i) => {
        const x = 120 + i * 160 + (i % 2) * 40;
        const yy = y + (i % 3) * 18;
        return (
          <g key={i} transform={`translate(${x},${yy}) scale(${0.9 + (i % 3) * 0.15})`}>
            <path d="M0,0 q30,-18 70,-10 l20,-20 l8,6 l-14,22 q10,20 -6,34 l-4,30 l-8,0 l2,-28 q-30,6 -54,-2 l-8,30 l-8,0 l4,-34 q-14,-10 -2,-28 Z" />
            <circle cx="40" cy="-34" r="9" />
            <path d="M36,-26 l8,0 l4,22 l-16,0 Z" />
            <line x1="50" y1="-40" x2="80" y2="-90" stroke={color} stroke-width="3" />
          </g>
        );
      })}
    </g>
  );
}

export function StoryScene({ id, look = 7 }: { id: SceneId; look?: number }) {
  switch (id) {
    case 'palaceNight':
      return <NightPalace />;
    case 'dawn':
      return <PalaceDawn />;
    case 'hall':
      return <HallScene />;
    case 'eunuch':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="euSky" stops={[[0, '#120a0c'], [1, '#3a1c22']]} />
          <rect width="1600" height="900" fill="url(#euSky)" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={140 + i * 210} y="120" width="40" height="780" fill="#2a1216" opacity={0.6 + (i % 2) * 0.2} />
          ))}
          <rect x="0" y="760" width="1600" height="140" fill="#1a0b0e" />
          {[340, 1260].map((x) => (
            <g key={x} class="lantern">
              <ellipse cx={x} cy="300" rx="34" ry="46" fill="#a8322a" />
              <ellipse cx={x} cy="300" rx="90" ry="100" fill="#f7b733" opacity="0.12" />
            </g>
          ))}
          <g transform="translate(560,180)">
            <Portrait look={look} kind="eunuch" rank={1} size={480} frame={false} />
          </g>
          <text x="1380" y="640" fill="#c9a446" font-size="64" font-weight="700" writing-mode="tb" opacity="0.8">
            九千歲
          </text>
        </svg>
      );
    case 'frontier':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="frSky" stops={[[0, '#2b1a1a'], [0.6, '#8c3a24'], [1, '#d9894a']]} />
          <rect width="1600" height="900" fill="url(#frSky)" />
          <Hills y={560} color="#4a2a1e" amp={80} seed={3} />
          <path d="M0,600 L220,560 L420,590 L640,540 L860,580 L1080,530 L1300,575 L1600,540 L1600,620 L0,660 Z" fill="#6b4a30" />
          {[220, 640, 1080].map((x, i) => (
            <g key={x}>
              <rect x={x - 30} y={500 + (i % 2) * 20} width="60" height="70" fill="#5a3b26" />
              <g class="flame" style={{ animationDelay: `${i * 0.4}s` }}>
                <path d={`M${x},${500 + (i % 2) * 20} q-26,-70 0,-130 q26,60 0,130 Z`} fill="#ff8a2a" />
              </g>
              <path d={`M${x},${370 + (i % 2) * 20} q60,-120 -20,-260`} stroke="#2a1d17" stroke-width="22" fill="none" opacity="0.35" />
            </g>
          ))}
          <Hills y={760} color="#2a1810" amp={30} seed={7} />
          <Horsemen y={700} n={9} />
          <Particles kind="ember" n={50} />
        </svg>
      );
    case 'drought':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="drSky" stops={[[0, '#d9a45a'], [0.6, '#e8c084'], [1, '#c99a5a']]} />
          <rect width="1600" height="900" fill="url(#drSky)" />
          <circle cx="1180" cy="230" r="110" fill="#c0392b" opacity="0.85" />
          <rect y="560" width="1600" height="340" fill="#a77b48" />
          {Array.from({ length: 40 }, (_, i) => (
            <path key={i} d={`M${(i * 173) % 1600},${600 + ((i * 59) % 280)} l${30 + (i % 4) * 10},${8 - (i % 3) * 6} l${20},${16}`} stroke="#6b4a2a" stroke-width="2" fill="none" />
          ))}
          {[260, 520, 1380].map((x, i) => (
            <g key={x} stroke="#3a2a1a" stroke-width={6 - i} fill="none">
              <path d={`M${x},600 L${x},430 M${x},500 L${x - 50},440 M${x},470 L${x + 40},410 M${x - 50},440 L${x - 70},420`} />
            </g>
          ))}
          <g fill="#3a2a1a" opacity="0.85">
            {Array.from({ length: 7 }, (_, i) => (
              <g key={i} transform={`translate(${640 + i * 70},${650 + (i % 2) * 10})`}>
                <circle cx="0" cy="-60" r="10" />
                <path d="M-10,-50 L10,-50 L14,0 L4,0 L0,-20 L-4,0 L-14,0 Z" />
                <line x1="12" y1="-40" x2="26" y2="0" stroke="#3a2a1a" stroke-width="3" />
              </g>
            ))}
          </g>
          <Particles kind="dust" n={40} />
        </svg>
      );
    case 'prince':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="prSky" stops={[[0, '#3a4a6a'], [1, '#9aa7b8']]} />
          <rect width="1600" height="900" fill="url(#prSky)" />
          <Cloud x={300} y={160} s={2.4} o={0.4} />
          <Hills y={560} color="#5d6a7c" amp={50} seed={2} />
          <rect y="620" width="1600" height="280" fill="#4a5a4a" />
          <Roof x={900} y={420} w={420} color="#2a2a2a" eave="#c9a446" />
          <rect x="940" y="470" width="340" height="150" fill="#7e5a2a" />
          <Banner x={820} y={380} color="#c99a2e" text="瑞" />
          <Banner x={1360} y={400} color="#c99a2e" text="王" />
          <g transform="translate(260,330)">
            <Portrait look={look} kind="prince" rank={1} size={420} frame={false} />
          </g>
        </svg>
      );
    case 'throne':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="thSky" stops={[[0, '#5a1812'], [1, '#2a0c09']]} />
          <rect width="1600" height="900" fill="url(#thSky)" />
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={120 + i * 260} y="0" width="60" height="900" fill="#8e2a22" />
          ))}
          <rect x="420" y="560" width="760" height="340" fill="#c9a446" />
          <rect x="520" y="480" width="560" height="90" fill="#e0b54a" />
          <path d="M560,480 L560,240 Q800,150 1040,240 L1040,480 Z" fill="#a87a12" />
          <g transform="translate(560,220)">
            <Portrait look={look} kind="emperor" rank={1} size={480} frame={false} expression="calm" />
          </g>
          <Particles kind="dust" n={30} />
        </svg>
      );
    case 'sea':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="seaSky" stops={[[0, '#6a8aa6'], [1, '#d9e2e0']]} />
          <rect width="1600" height="900" fill="url(#seaSky)" />
          <Hills y={480} color="#4f6a5a" amp={40} seed={9} />
          <rect y="500" width="1600" height="400" fill="#4a7a8a" />
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d={`M${(i * 151) % 1600},${560 + ((i * 47) % 300)} q30,-12 60,0 t60,0`} stroke="#d9e2e0" stroke-width="3" fill="none" opacity="0.6" />
          ))}
          {[[300, 620, 1], [700, 700, 1.3], [1250, 600, 0.9]].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x},${y}) scale(${s})`}>
              <path d="M-90,0 L90,0 L60,40 L-60,40 Z" fill="#3a2414" />
              <path d="M0,0 L0,-170 L80,-60 Z" fill={i === 1 ? '#b0452e' : '#e8dcc0'} />
              <path d="M-10,0 L-10,-130 L-70,-40 Z" fill="#e8dcc0" opacity="0.8" />
            </g>
          ))}
        </svg>
      );
    case 'prosper':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="psSky" stops={[[0, '#f2c27a'], [0.6, '#f7e2b0'], [1, '#e9d18a']]} />
          <rect width="1600" height="900" fill="url(#psSky)" />
          <circle cx="800" cy="300" r="120" fill="#fbe3a0" />
          <Cloud x={300} y={180} s={2} o={0.5} />
          <Cloud x={1200} y={150} s={2.4} o={0.5} />
          <Hills y={520} color="#7a9a5a" amp={40} seed={4} />
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x="0" y={560 + i * 42} width="1600" height="30" fill={i % 2 ? '#d9b44a' : '#c9a43a'} />
          ))}
          <Roof x={620} y={400} w={360} color="#5c1d16" eave="#c9a446" />
          <rect x="660" y="440" width="280" height="120" fill="#8e2a22" />
          <Banner x={480} y={360} color="#a8322a" text="中" />
          <Banner x={1100} y={360} color="#a8322a" text="興" />
          <Particles kind="petal" n={40} />
        </svg>
      );
    case 'calm':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="caSky" stops={[[0, '#8aa0b8'], [1, '#e8dcc0']]} />
          <rect width="1600" height="900" fill="url(#caSky)" />
          <Hills y={560} color="#8a8a7a" amp={50} seed={5} opacity={0.6} />
          <rect y="640" width="1600" height="260" fill="#5c1d16" />
          <Roof x={300} y={500} w={1000} color="#2c1c12" eave="#c9a446" />
          <rect x="360" y="560" width="880" height="90" fill="#8e2a22" />
          {[[420, 300], [1220, 280]].map(([x, y]) => (
            <g key={x} stroke="#6b3a1a" stroke-width="8" fill="none">
              <path d={`M${x},640 L${x},${y + 120} M${x},${y + 180} L${x + 60},${y + 100}`} />
              <circle cx={x + 10} cy={y + 90} r="70" fill="#c96a2a" stroke="none" opacity="0.8" />
            </g>
          ))}
          <Particles kind="petal" n={30} />
        </svg>
      );
    case 'south':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="soSky" stops={[[0, '#4a3a5a'], [0.55, '#c97a5a'], [1, '#e8b07a']]} />
          <rect width="1600" height="900" fill="url(#soSky)" />
          <circle cx="1150" cy="420" r="90" fill="#f7c35a" opacity="0.9" />
          <Hills y={520} color="#3a3048" amp={60} seed={6} />
          <rect y="540" width="1600" height="360" fill="#6a5a6a" />
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d={`M${(i * 211) % 1600},${600 + ((i * 53) % 260)} q40,-10 80,0`} stroke="#f7c35a" stroke-width="3" fill="none" opacity="0.5" />
          ))}
          {[[500, 680], [760, 720], [1000, 660]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <path d="M-70,0 L70,0 L50,26 L-50,26 Z" fill="#2a1d17" />
              <path d="M0,0 L0,-120 L60,-30 Z" fill="#e8dcc0" opacity="0.85" />
              {i === 1 && <path d="M-6,-120 L-6,-160 L30,-150 L-6,-140 Z" fill="#e0aa22" />}
            </g>
          ))}
          <text x="200" y="300" fill="#2a1d17" font-size="64" opacity="0.4" writing-mode="tb">
            長江
          </text>
        </svg>
      );
    case 'fall':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="faSky" stops={[[0, '#120a0a'], [0.6, '#5a1a0e'], [1, '#c0461e']]} />
          <rect width="1600" height="900" fill="url(#faSky)" />
          <City y={600} color="#120a08" fire />
          <g stroke="#0a0606" stroke-width="10" fill="none">
            <path d="M1380,900 L1380,520 M1380,620 L1300,560 M1380,580 L1460,500 M1300,560 L1260,560" />
          </g>
          <Particles kind="ember" n={80} />
        </svg>
      );
    case 'death':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="deSky" stops={[[0, '#9aa0a8'], [1, '#e8e8e8']]} />
          <rect width="1600" height="900" fill="url(#deSky)" />
          <Hills y={600} color="#c8ccd0" amp={40} seed={8} />
          <rect y="680" width="1600" height="220" fill="#f2f2f2" />
          <Roof x={500} y={440} w={600} color="#3a3a3a" eave="#f2f2f2" />
          <rect x="560" y="500" width="480" height="190" fill="#5a5a5a" />
          {[380, 1220].map((x) => (
            <g key={x}>
              <line x1={x} y1="300" x2={x} y2="700" stroke="#2a2a2a" stroke-width="5" />
              <path d={`M${x},310 L${x + 60},320 L${x + 56},560 L${x},540 Z`} fill="#ffffff" stroke="#bbb" />
            </g>
          ))}
          <Particles kind="snow" n={90} />
        </svg>
      );
    case 'deposed':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="dpSky" stops={[[0, '#0d1222'], [1, '#2a2440']]} />
          <rect width="1600" height="900" fill="url(#dpSky)" />
          <circle cx="1250" cy="200" r="60" fill="#e8e4cf" opacity="0.8" />
          <rect x="300" y="300" width="1000" height="600" fill="#3a1410" />
          <Roof x={260} y={220} w={1080} color="#120808" eave="#120808" />
          <path d="M560,900 L560,520 Q800,420 1040,520 L1040,900 Z" fill="#5a1a12" />
          <line x1="800" y1="500" x2="800" y2="900" stroke="#2a0c08" stroke-width="6" />
          {Array.from({ length: 5 }, (_, r) =>
            Array.from({ length: 4 }, (_, c) => <circle key={`${r}${c}`} cx={620 + c * 50 + (c > 1 ? 80 : 0)} cy={580 + r * 60} r="9" fill="#c9a446" />),
          )}
          <path d="M770,700 L830,700 L830,760 L770,760 Z" fill="none" stroke="#8a8a8a" stroke-width="10" />
          <path d="M780,700 Q800,660 820,700" fill="none" stroke="#8a8a8a" stroke-width="10" />
        </svg>
      );
    case 'captured':
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <Sky id="cpSky" stops={[[0, '#6a7080'], [1, '#c8ccd4']]} />
          <rect width="1600" height="900" fill="url(#cpSky)" />
          <Hills y={560} color="#9aa0aa" amp={30} seed={12} />
          <rect y="620" width="1600" height="280" fill="#e8eaee" />
          <Horsemen y={600} n={8} color="#2a2a30" />
          <Particles kind="snow" n={100} />
        </svg>
      );
    case 'scroll':
    default:
      return (
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="1600" height="900" fill="#e9dcbc" />
          <rect x="120" y="80" width="1360" height="740" fill="#f3e6c8" stroke="#8a6a3a" stroke-width="6" />
          <Hills y={700} color="#bfae88" amp={50} seed={10} opacity={0.5} />
        </svg>
      );
  }
}
