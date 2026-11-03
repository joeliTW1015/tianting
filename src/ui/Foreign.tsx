// 四夷：各藩的態度、兵力（皆據報）、朝貢、邊患；遣使、撫賞、互市。

import { shortDate } from '../core/calendar';
import { foreignAct } from '../core/foreign';
import { regionName } from '../core/geography';
import type { PlayerView } from '../core/view';
import type { Act } from './App';
import { Portrait } from './art/Portrait';

const STANCE_CLASS = (v?: string) => (!v ? '' : /恭|順/.test(v) ? 'good' : /倨|大舉|桀|寇|窺/.test(v) ? 'bad' : 'mid');

export function ForeignModal({ view, act, onClose }: { view: PlayerView; act: Act; onClose: () => void }) {
  const enemies = view.foreign.filter((f) => f.kind === 'enemy');
  const vassals = view.foreign.filter((f) => f.kind === 'tributary');
  const card = (f: PlayerView['foreign'][number]) => (
    <div key={f.id} class={`power ${f.kind}`} data-power={f.id}>
      <Portrait look={f.look} kind={f.kind === 'enemy' ? 'chieftain' : 'civil'} rank={3} size={64} />
      <div class="power-body">
        <h3>
          {f.name}
          <small>鄰接：{f.borders.map(regionName).join('、')}</small>
        </h3>
        <p>
          態度：
          {f.stance ? (
            <b class={`stance ${STANCE_CLASS(f.stance.value)}`}>
              {f.stance.value}
              <small>
                （{f.stance.source}・{shortDate(f.stance.turn)}）
              </small>
            </b>
          ) : (
            <span class="muted">未知——可遣使宣諭</span>
          )}
        </p>
        <p>
          兵力：
          {f.strength ? (
            <b>
              約 {Math.round(f.strength.value / 1000)} 千
              <small>
                （{f.strength.source}・{shortDate(f.strength.turn)}）
              </small>
            </b>
          ) : (
            <span class="muted">未知</span>
          )}
        </p>
        <p class="small">
          {f.kind === 'tributary' ? (f.lastTribute !== undefined ? `上次朝貢：${shortDate(f.lastTribute)}` : '本朝尚未來貢') : `本朝犯邊 ${f.raids} 次`}
          {f.trade ? '・已開互市' : ''}
        </p>
        <div class="power-actions">
          {f.actions.map((a) => (
            <button
              key={a.kind}
              class="btn"
              title={a.desc}
              disabled={a.done || view.energy < 1}
              onClick={() => act((s) => foreignAct(s, f.id, a.kind as never))}
              data-faction={`${f.id}:${a.kind}`}
            >
              {a.label}
              {a.silver ? <small>（銀{a.silver}萬）</small> : null}
              {a.done ? <small>（本旬已議）</small> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="foreign paper" onClick={(e) => e.stopPropagation()} data-testid="foreign">
        <header class="finance-head">
          <h2>四　夷</h2>
          <span class="muted small">各藩的態度與兵力都只能「據報」——來自使臣、貢使、邊將與降人，未必準確。每項措置耗精力 1。</span>
          <button class="btn ghost" onClick={onClose}>
            闔上
          </button>
        </header>
        <div class="foreign-body">
          <h4>邊患</h4>
          <div class="powers">{enemies.map(card)}</div>
          <h4>藩屬</h4>
          <div class="powers">{vassals.map(card)}</div>
          <p class="muted small">
            小提醒：邊軍欠餉、士氣低落，最容易招來入寇；秋高馬肥時北虜特別活躍。藩屬「該貢不貢」，往往表示心懷不滿。敵意極高、兵力又強時，可能大舉入寇、直撲京師。
          </p>
        </div>
      </div>
    </div>
  );
}
