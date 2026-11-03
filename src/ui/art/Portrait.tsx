// 程序化人物肖像（向量）：依身分決定冠帽與袍服，依種子決定五官、鬍鬚、膚色。

import type { CharKind } from '../../core/types';

export type Expression = 'happy' | 'calm' | 'sad' | 'angry' | 'sick';

interface Props {
  look: number;
  kind: CharKind | 'emperor';
  expression?: Expression;
  rank?: number;
  size?: number;
  /** 去職、下獄者以灰階表示 */
  muted?: boolean;
  frame?: boolean;
}

function picker(seed: number) {
  let s = seed >>> 0 || 1;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

const SKIN = ['#f0d2b0', '#e8c39b', '#dcb084', '#e9caa6'];
const SKIN_SHADE = ['#d9b38e', '#cfa57a', '#c29367', '#d2ad87'];
const ROBE: Record<string, [string, string]> = {
  red: ['#a8322a', '#7e231d'],
  blue: ['#2f5d7c', '#21445c'],
  green: ['#3f7a52', '#2c5a3b'],
  eunuch: ['#6a2b3b', '#4d1e2a'],
  prince: ['#c99a2e', '#9c7420'],
  emperor: ['#e0aa22', '#a87a12'],
  chief: ['#33405e', '#232d44'],
  scholar: ['#5d7f99', '#46647b'],
};

export function Portrait({ look, kind, rank = 2, size = 64, muted, frame = true, expression }: Props) {
  const p = picker(look);
  const skinI = p(SKIN.length);
  const sick = expression === 'sick';
  const skin = sick ? '#e6ddc9' : SKIN[skinI];
  const shade = sick ? '#c9bfa8' : SKIN_SHADE[skinI];
  const faceW = 19 + p(5);
  const faceH = 24 + p(4);
  let brow = p(3);
  let eyes = p(3);
  let mouth = p(3);
  if (expression === 'happy') {
    brow = 1;
    mouth = 1;
    eyes = 2;
  } else if (expression === 'calm') {
    brow = 1;
    mouth = 0;
  } else if (expression === 'sad' || sick) {
    brow = 2;
    mouth = 2;
    eyes = sick ? 0 : eyes;
  } else if (expression === 'angry') {
    brow = 3;
    mouth = 2;
    eyes = 1;
  }
  const age = p(3);
  const beardKind = kind === 'emperor' ? 1 + p(2) : kind === 'eunuch' || kind === 'prince' ? (kind === 'prince' ? p(2) : 0) : p(5);
  const robeKey =
    kind === 'emperor' ? 'emperor' : kind === 'eunuch' ? 'eunuch' : kind === 'prince' ? 'prince' : kind === 'chieftain' ? 'chief' : kind === 'scholar' ? 'scholar' : rank <= 2 ? 'red' : rank === 3 ? 'blue' : 'green';
  const [robe, robeDark] = ROBE[robeKey];
  const bg = kind === 'emperor' ? '#6b4a12' : kind === 'military' ? '#3d4a52' : kind === 'eunuch' ? '#4a3a33' : kind === 'prince' ? '#5b4320' : kind === 'chieftain' ? '#3a4a3c' : '#4b4038';
  const hair = age === 2 ? '#8a8580' : '#1d1a18';
  const id = `p${look}`;
  const cx = 50;
  const fy = 58;

  return (
    <svg class={`portrait ${muted ? 'muted' : ''}`} viewBox="0 0 100 120" width={size} height={(size * 120) / 100} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}bg`} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color={bg} stop-opacity="0.55" />
          <stop offset="100%" stop-color={bg} />
        </radialGradient>
        <clipPath id={`${id}clip`}>
          <rect x="0" y="0" width="100" height="120" rx="8" />
        </clipPath>
      </defs>
      <g clip-path={`url(#${id}clip)`}>
        {frame && <rect width="100" height="120" fill={`url(#${id}bg)`} />}
        {frame && <circle cx="50" cy="52" r="40" fill="#f3e6c8" opacity="0.08" />}

        {/* 袍服／甲冑 */}
        {kind === 'military' ? (
          <g>
            <path d="M8,120 C10,96 26,86 50,84 C74,86 90,96 92,120 Z" fill="#8e2a22" />
            <path d="M18,120 C20,100 32,90 50,89 C68,90 80,100 82,120 Z" fill="#9a8a5c" />
            {[0, 1, 2, 3].map((r) => (
              <path key={r} d={`M24,${97 + r * 6} Q50,${101 + r * 6} 76,${97 + r * 6}`} stroke="#6f6342" stroke-width="1.2" fill="none" />
            ))}
            <circle cx="50" cy="100" r="6" fill="#c9a446" stroke="#6f6342" />
            <path d="M28,90 Q50,84 72,90 L68,95 Q50,90 32,95 Z" fill="#c9a446" />
          </g>
        ) : (
          <g>
            <path d="M6,120 C8,95 26,85 50,83 C74,85 92,95 94,120 Z" fill={robe} />
            <path d="M50,84 L40,96 L50,104 L60,96 Z" fill={robeDark} />
            <path d="M38,86 Q50,96 62,86" stroke="#f1e3c4" stroke-width="2.4" fill="none" />
            {(kind === 'civil' || kind === 'eunuch') && (
              <g>
                <rect x="38" y="100" width="24" height="20" fill={kind === 'eunuch' ? '#b28a3a' : '#c9a446'} stroke="#5a4520" stroke-width="0.8" />
                <path d="M43,112 q7,-10 14,0 q-7,-4 -14,0" fill="#f3e6c8" opacity="0.9" />
                <circle cx="50" cy="106" r="2" fill="#a8322a" />
              </g>
            )}
            {kind === 'emperor' && (
              <g>
                <circle cx="50" cy="106" r="10" fill="#f2cf55" stroke="#8a5a10" />
                <path d="M42,108 q4,-8 8,-2 q4,6 8,-2" stroke="#b5321f" stroke-width="1.6" fill="none" />
                <circle cx="30" cy="96" r="5" fill="#f2cf55" stroke="#8a5a10" stroke-width="0.6" />
                <circle cx="70" cy="96" r="5" fill="#f2cf55" stroke="#8a5a10" stroke-width="0.6" />
              </g>
            )}
            {kind === 'prince' && (
              <g>
                <circle cx="50" cy="108" r="9" fill="#e6c25a" stroke="#7a5a18" />
                <path d="M44,108 q3,-5 6,0 t6,0" stroke="#7a5a18" stroke-width="1.2" fill="none" />
              </g>
            )}
            {kind === 'chieftain' && (
              <g>
                <path d="M30,92 Q50,104 70,92" stroke="#c9c9cf" stroke-width="2.2" fill="none" />
                <circle cx="50" cy="100" r="3" fill="#c9c9cf" />
              </g>
            )}
            <path d="M30,120 Q40,108 50,108 Q60,108 70,120" stroke={robeDark} stroke-width="1.2" fill="none" opacity="0.6" />
          </g>
        )}

        {/* 頸、耳、臉 */}
        <rect x={cx - 7} y={fy + faceH - 8} width="14" height="14" fill={shade} />
        <ellipse cx={cx - faceW + 1} cy={fy + 2} rx="3.4" ry="5.5" fill={shade} />
        <ellipse cx={cx + faceW - 1} cy={fy + 2} rx="3.4" ry="5.5" fill={shade} />
        <ellipse cx={cx} cy={fy} rx={faceW} ry={faceH} fill={skin} />
        <ellipse cx={cx} cy={fy + faceH * 0.55} rx={faceW * 0.75} ry={faceH * 0.35} fill={shade} opacity="0.25" />

        {/* 眉 */}
        {brow === 0 && (
          <g stroke={hair} stroke-width="2.2" stroke-linecap="round">
            <path d={`M${cx - 14},${fy - 9} L${cx - 5},${fy - 7}`} />
            <path d={`M${cx + 14},${fy - 9} L${cx + 5},${fy - 7}`} />
          </g>
        )}
        {brow === 1 && (
          <g stroke={hair} stroke-width="2.2" stroke-linecap="round" fill="none">
            <path d={`M${cx - 14},${fy - 7} Q${cx - 9},${fy - 11} ${cx - 4},${fy - 8}`} />
            <path d={`M${cx + 14},${fy - 7} Q${cx + 9},${fy - 11} ${cx + 4},${fy - 8}`} />
          </g>
        )}
        {brow === 3 && (
          <g stroke={hair} stroke-width="2.6" stroke-linecap="round">
            <path d={`M${cx - 14},${fy - 11} L${cx - 5},${fy - 7}`} />
            <path d={`M${cx + 14},${fy - 11} L${cx + 5},${fy - 7}`} />
          </g>
        )}
        {brow === 2 && (
          <g stroke={hair} stroke-width="2.4" stroke-linecap="round">
            <path d={`M${cx - 14},${fy - 7} L${cx - 5},${fy - 10}`} />
            <path d={`M${cx + 14},${fy - 7} L${cx + 5},${fy - 10}`} />
          </g>
        )}

        {/* 眼 */}
        {eyes === 0 && (
          <g stroke="#2a2420" stroke-width="1.8" stroke-linecap="round">
            <path d={`M${cx - 12},${fy - 2} L${cx - 6},${fy - 2}`} />
            <path d={`M${cx + 12},${fy - 2} L${cx + 6},${fy - 2}`} />
          </g>
        )}
        {eyes === 1 && (
          <g fill="#2a2420">
            <ellipse cx={cx - 9} cy={fy - 2} rx="3" ry="1.6" />
            <ellipse cx={cx + 9} cy={fy - 2} rx="3" ry="1.6" />
          </g>
        )}
        {eyes === 2 && (
          <g fill="none" stroke="#2a2420" stroke-width="1.6" stroke-linecap="round">
            <path d={`M${cx - 12},${fy - 1} Q${cx - 9},${fy - 4} ${cx - 6},${fy - 1}`} />
            <path d={`M${cx + 12},${fy - 1} Q${cx + 9},${fy - 4} ${cx + 6},${fy - 1}`} />
          </g>
        )}

        {/* 鼻、口 */}
        <path d={`M${cx},${fy - 1} L${cx - 2},${fy + 7} L${cx + 1.5},${fy + 7.5}`} stroke={shade} stroke-width="1.5" fill="none" stroke-linecap="round" />
        {mouth === 0 && <path d={`M${cx - 5},${fy + 13} L${cx + 5},${fy + 13}`} stroke="#8a4a3a" stroke-width="1.8" stroke-linecap="round" />}
        {mouth === 1 && <path d={`M${cx - 5},${fy + 12} Q${cx},${fy + 15} ${cx + 5},${fy + 12}`} stroke="#8a4a3a" stroke-width="1.8" fill="none" stroke-linecap="round" />}
        {mouth === 2 && <path d={`M${cx - 5},${fy + 14} Q${cx},${fy + 11} ${cx + 5},${fy + 14}`} stroke="#8a4a3a" stroke-width="1.8" fill="none" stroke-linecap="round" />}

        {/* 皺紋 */}
        {age >= 1 && (
          <g stroke={shade} stroke-width="1" fill="none" opacity="0.8">
            <path d={`M${cx - 15},${fy + 4} q2,4 0,7`} />
            <path d={`M${cx + 15},${fy + 4} q-2,4 0,7`} />
            {age === 2 && <path d={`M${cx - 8},${fy - 14} q8,-2 16,0`} />}
          </g>
        )}

        {/* 鬍鬚 */}
        {beardKind === 1 && <path d={`M${cx - 9},${fy + 10} Q${cx},${fy + 7} ${cx + 9},${fy + 10} Q${cx},${fy + 9} ${cx - 9},${fy + 10}`} fill={hair} stroke={hair} stroke-width="1.6" />}
        {beardKind === 2 && <path d={`M${cx - 3},${fy + 17} Q${cx},${fy + 30} ${cx + 3},${fy + 17} Z`} fill={hair} />}
        {beardKind === 3 && (
          <g fill={hair}>
            <path d={`M${cx - 9},${fy + 10} Q${cx},${fy + 7} ${cx + 9},${fy + 10} Q${cx},${fy + 9} ${cx - 9},${fy + 10}`} stroke={hair} stroke-width="1.4" />
            <path d={`M${cx - 6},${fy + 16} Q${cx},${fy + 42} ${cx + 6},${fy + 16} Q${cx},${fy + 20} ${cx - 6},${fy + 16}`} />
          </g>
        )}
        {beardKind === 4 && (
          <g fill={hair} opacity="0.95">
            <path d={`M${cx - 16},${fy + 6} Q${cx - 12},${fy + 26} ${cx},${fy + 30} Q${cx + 12},${fy + 26} ${cx + 16},${fy + 6} Q${cx + 10},${fy + 18} ${cx},${fy + 18} Q${cx - 10},${fy + 18} ${cx - 16},${fy + 6}`} />
          </g>
        )}

        {sick && <path d={`M${cx + faceW - 4},${fy - 12} q3,5 0,8 q-3,-3 0,-8`} fill="#9ec5e0" />}
        {expression === 'happy' && (
          <g fill="#e88a7a" opacity="0.35">
            <ellipse cx={cx - 11} cy={fy + 6} rx="4" ry="2.4" />
            <ellipse cx={cx + 11} cy={fy + 6} rx="4" ry="2.4" />
          </g>
        )}
        {expression === 'angry' && <path d={`M${cx - 3},${fy - 14} l3,3 l3,-3`} stroke={shade} stroke-width="1.4" fill="none" />}

        {/* 冠帽 */}
        {kind === 'civil' || kind === 'scholar' ? (
          kind === 'scholar' ? (
            <path d={`M${cx - faceW - 1},${fy - 16} L${cx - faceW + 2},${fy - 34} L${cx + faceW - 2},${fy - 34} L${cx + faceW + 1},${fy - 16} Z`} fill="#25211e" />
          ) : (
            <g fill="#1f1c1a">
              <path d={`M${cx - faceW - 1},${fy - 13} Q${cx},${fy - 22} ${cx + faceW + 1},${fy - 13} L${cx + faceW},${fy - 22} Q${cx},${fy - 30} ${cx - faceW},${fy - 22} Z`} />
              <path d={`M${cx - 12},${fy - 24} Q${cx},${fy - 42} ${cx + 12},${fy - 24} Z`} />
              <rect x={cx - faceW - 26} y={fy - 21} width="26" height="3.4" rx="1.6" />
              <rect x={cx + faceW} y={fy - 21} width="26" height="3.4" rx="1.6" />
            </g>
          )
        ) : kind === 'military' ? (
          <g>
            <path d={`M${cx - faceW - 3},${fy - 8} Q${cx - faceW - 2},${fy - 34} ${cx},${fy - 38} Q${cx + faceW + 2},${fy - 34} ${cx + faceW + 3},${fy - 8} L${cx + faceW - 2},${fy - 12} Q${cx},${fy - 30} ${cx - faceW + 2},${fy - 12} Z`} fill="#7a7466" stroke="#3f3a30" stroke-width="0.8" />
            <path d={`M${cx - faceW - 3},${fy - 16} L${cx - faceW - 14},${fy - 26} L${cx - faceW - 1},${fy - 21} Z`} fill="#c9a446" />
            <path d={`M${cx + faceW + 3},${fy - 16} L${cx + faceW + 14},${fy - 26} L${cx + faceW + 1},${fy - 21} Z`} fill="#c9a446" />
            <rect x={cx - 1.5} y={fy - 50} width="3" height="13" fill="#3f3a30" />
            <path d={`M${cx},${fy - 52} q-8,6 -4,14 q4,-6 4,-6 q0,0 4,6 q4,-8 -4,-14`} fill="#b5321f" />
          </g>
        ) : kind === 'eunuch' ? (
          <g fill="#211d1b">
            <path d={`M${cx - faceW - 1},${fy - 12} Q${cx},${fy - 20} ${cx + faceW + 1},${fy - 12} L${cx + faceW - 1},${fy - 30} Q${cx},${fy - 38} ${cx - faceW + 1},${fy - 30} Z`} />
            <path d={`M${cx - faceW + 2},${fy - 28} L${cx - 6},${fy - 42} L${cx},${fy - 32} L${cx + 6},${fy - 42} L${cx + faceW - 2},${fy - 28}`} stroke="#211d1b" stroke-width="3" fill="#211d1b" />
            <rect x={cx - faceW} y={fy - 18} width={faceW * 2} height="2.5" fill="#8a6a2a" />
          </g>
        ) : kind === 'prince' || kind === 'emperor' ? (
          <g>
            <path d={`M${cx - faceW - 1},${fy - 12} Q${cx},${fy - 22} ${cx + faceW + 1},${fy - 12} L${cx + faceW - 2},${fy - 30} Q${cx},${fy - 40} ${cx - faceW + 2},${fy - 30} Z`} fill="#1f1c1a" />
            <path d={`M${cx - 10},${fy - 32} Q${cx - 22},${fy - 48} ${cx - 14},${fy - 50} Q${cx - 10},${fy - 40} ${cx - 4},${fy - 34} Z`} fill="#1f1c1a" />
            <path d={`M${cx + 10},${fy - 32} Q${cx + 22},${fy - 48} ${cx + 14},${fy - 50} Q${cx + 10},${fy - 40} ${cx + 4},${fy - 34} Z`} fill="#1f1c1a" />
            <circle cx={cx} cy={fy - 24} r="2.6" fill="#e6c25a" />
            {kind === 'emperor' && <path d={`M${cx - 8},${fy - 30} q8,-8 16,0`} stroke="#e6c25a" stroke-width="1.6" fill="none" />}
          </g>
        ) : (
          <g>
            <path d={`M${cx - faceW - 3},${fy - 8} Q${cx - faceW - 4},${fy - 30} ${cx},${fy - 32} Q${cx + faceW + 4},${fy - 30} ${cx + faceW + 3},${fy - 8} Q${cx},${fy - 22} ${cx - faceW - 3},${fy - 8} Z`} fill="#2f3b5c" />
            <path d={`M${cx - faceW},${fy - 20} Q${cx},${fy - 28} ${cx + faceW},${fy - 20}`} stroke="#c9c9cf" stroke-width="1.6" fill="none" />
            <path d={`M${cx + 10},${fy - 30} q10,-16 18,-20 q-6,10 -14,22 Z`} fill="#c98b2a" />
          </g>
        )}
      </g>
      {frame && <rect x="1" y="1" width="98" height="118" rx="8" fill="none" stroke="#c9a446" stroke-width="2" opacity="0.7" />}
    </svg>
  );
}
