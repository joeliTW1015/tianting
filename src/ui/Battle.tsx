// 戰鬥動畫：兩軍兵力條、陣線、接戰／鏖戰／決勝三階段，每階段一句原因說明，最後是結果表。
// 數字是「據戰報」：戰報常誇大斬獲、少報傷亡。

import { useEffect, useState } from 'preact/hooks';
import { dateLabel } from '../core/calendar';
import type { BattleRecord } from '../core/types';
import { Portrait } from './art/Portrait';

const PHASE_MS = 2200;

export function BattleModal({ rec, onClose }: { rec: BattleRecord; onClose: () => void }) {
  const [step, setStep] = useState(-1);
  const n = rec.phases.length;
  useEffect(() => {
    if (step >= n) return;
    const t = setTimeout(() => setStep(step + 1), step < 0 ? 900 : PHASE_MS);
    return () => clearTimeout(t);
  }, [step]);
  const shown = rec.phases.slice(0, Math.max(0, step + (step < n ? 1 : 0)));
  const ourLoss = shown.reduce((s, p) => s + p.ourLoss, 0);
  const theirLoss = shown.reduce((s, p) => s + p.theirLoss, 0);
  const ourNow = Math.max(0, rec.ours.before - ourLoss);
  const theirNow = Math.max(0, rec.theirs.before - theirLoss);
  const max = Math.max(rec.ours.before, rec.theirs.before, 1);
  const cur = step >= 0 && step < n ? rec.phases[step] : null;
  const line = cur ? cur.line : step >= n ? rec.phases[n - 1]?.line ?? 0.5 : 0.5;
  const done = step >= n;
  const win = ['大捷', '小勝', '招降'].includes(rec.result);
  const lose = ['大潰', '小挫'].includes(rec.result);

  return (
    <div class="modal-bg battle-bg" onClick={() => (done ? onClose() : setStep(n))} data-testid="battle-modal">
      <div class="battle paper" onClick={(e) => e.stopPropagation()}>
        <header class="battle-head">
          <h2>{rec.title}</h2>
          <span>
            {dateLabel(rec.turn)}・〔據{rec.source}〕
          </span>
        </header>
        <div class="battle-main">
          <Side side={rec.ours} now={ourNow} max={max} us />
          <div class="field">
            <svg viewBox="0 0 400 220" preserveAspectRatio="none">
              <defs>
                <linearGradient id="bground" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#d9c79a" />
                  <stop offset="1" stop-color="#b8a274" />
                </linearGradient>
              </defs>
              <rect width="400" height="220" fill="url(#bground)" />
              {Array.from({ length: 14 }, (_, i) => (
                <path key={i} d={`M${(i * 53) % 400},${(i * 37) % 220} l6,-4 l6,4`} stroke="#8a7a54" fill="none" opacity="0.5" />
              ))}
              <g class="block us" style={{ transform: `translateX(${(line - 0.5) * 300}px)` }}>
                {Array.from({ length: Math.max(1, Math.round((ourNow / max) * 18)) }, (_, i) => (
                  <rect key={i} x={110 - (i % 3) * 28} y={30 + Math.floor(i / 3) * 28} width="22" height="20" fill="#a8322a" stroke="#f3e6c8" />
                ))}
              </g>
              <g class="block them" style={{ transform: `translateX(${(line - 0.5) * 300}px)` }}>
                {Array.from({ length: Math.max(1, Math.round((theirNow / max) * 18)) }, (_, i) => (
                  <rect key={i} x={268 + (i % 3) * 28} y={30 + Math.floor(i / 3) * 28} width="22" height="20" fill="#2b2b3a" stroke="#d9c79a" />
                ))}
              </g>
              <line x1={200 + (line - 0.5) * 300} y1="10" x2={200 + (line - 0.5) * 300} y2="210" stroke="#f7c35a" stroke-width="3" stroke-dasharray="6 4" class="front" />
              {cur && (
                <g class="clash" key={step}>
                  {Array.from({ length: 8 }, (_, i) => (
                    <circle key={i} cx={200 + (line - 0.5) * 300 + ((i * 17) % 30) - 15} cy={40 + i * 20} r="5" fill="#ffd36b" />
                  ))}
                </g>
              )}
            </svg>
            <div class="phases">
              {rec.phases.map((p, i) => (
                <span key={i} class={i === step ? 'on' : i < step ? 'past' : ''}>
                  {i < step || done ? '●' : '○'} {p.name}
                </span>
              ))}
            </div>
            <p class="phase-note">{step < 0 ? `我用「${rec.ours.card}」，敵用「${rec.theirs.card}」` : cur ? cur.note : rec.fate ?? ''}</p>
          </div>
          <Side side={rec.theirs} now={theirNow} max={max} />
        </div>
        {done ? (
          <div class="battle-result">
            <div class={`result-stamp ${win ? 'win' : lose ? 'lose' : ''}`}>{rec.result}</div>
            <table>
              <thead>
                <tr>
                  <th />
                  <th>戰前</th>
                  <th>損失（據報）</th>
                  <th>戰後</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{rec.ours.label}</td>
                  <td>{rec.ours.before.toLocaleString()}</td>
                  <td>{rec.reported.ourLoss.toLocaleString()}</td>
                  <td>{ourNow.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>{rec.theirs.label}</td>
                  <td>{rec.theirs.before.toLocaleString()}</td>
                  <td>{rec.reported.theirLoss.toLocaleString()}</td>
                  <td>{theirNow.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            {rec.fate && <p class="warn">{rec.fate}</p>}
            <p class="hint">戰報常誇大斬獲、少報傷亡。遣監軍或御駕親征時，戰報才確實。</p>
            <button class="btn primary" onClick={onClose} data-testid="battle-close">
              收起戰報
            </button>
          </div>
        ) : (
          <div class="battle-foot">
            <button class="btn ghost" onClick={() => setStep(n)} data-testid="battle-skip">
              略過動畫
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Side({ side, now, max, us }: { side: BattleRecord['ours']; now: number; max: number; us?: boolean }) {
  return (
    <div class={`bside ${us ? 'us' : 'them'}`}>
      <div class="bside-head">
        {side.look !== undefined && <Portrait look={side.look} kind="military" size={46} />}
        <div>
          <b>{side.label}</b>
          {side.commander && <span class="muted">{side.commander}</span>}
        </div>
      </div>
      <p>
        方略：<b>{side.card}</b>
      </p>
      <div class="bar">
        <i style={{ width: `${(now / max) * 100}%` }} />
        <span>{now.toLocaleString()}</span>
      </div>
      <ul>
        {side.units.map((u) => (
          <li key={u.name}>
            {u.name} {u.n.toLocaleString()}
          </li>
        ))}
      </ul>
      <p class="muted">士氣：{side.morale}</p>
    </div>
  );
}
