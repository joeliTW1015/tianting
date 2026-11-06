import { shortDate } from '../core/calendar';
import { issueDip } from '../core/edicts';
import { regionName } from '../core/geography';
import type { PowerView, PlayerView } from '../core/view';
import type { Act } from './App';
import type { EdictInit } from './EdictModal';

export function PowerPanel({ p, act, onEdict }: { p: PowerView; act: Act; onEdict: (i: EdictInit) => void }) {
  return (
    <div class="power-panel">
      <div class="panel-head">
        <span class="power-flag" style={{ background: p.color }}>
          {p.name.slice(0, 1)}
        </span>
        <div>
          <h3>
            {p.name}
            <small>
              {p.kind}・{p.standing}
            </small>
          </h3>
          <span class="muted small">{p.regions.length ? `領地：${p.regions.map(regionName).join('、')}` : '無領地'}</span>
        </div>
      </div>
      <p class="muted">{p.desc}</p>
      <table class="facts">
        <tbody>
          <tr>
            <td>態度</td>
            <td>{p.stance ? `${p.stance.value}（${p.stance.source}・${shortDate(p.stance.turn)}）` : '不明——可遣使探之'}</td>
          </tr>
          <tr>
            <td>兵力</td>
            <td>{p.strength ? `約 ${Math.round(p.strength.value / 1000)} 千（${p.strength.source}・${shortDate(p.strength.turn)}）` : '不明'}</td>
          </tr>
          <tr>
            <td>往來</td>
            <td>
              {p.trade ? '互市中' : '未互市'}
              {p.tributePay ? `・歲幣每旬 ${p.tributePay} 萬` : ''}
              {p.allyPay ? `・盟餉每旬 ${p.allyPay} 萬` : ''}
              {p.raids ? `・據報犯邊 ${p.raids} 次` : ''}
            </td>
          </tr>
        </tbody>
      </table>
      {p.alive && (
        <div class="dip-actions compact">
          {p.actions.map((a) => (
            <button key={a.kind} class={`chip ${a.block ? 'blocked' : ''}`} title={a.block ?? a.desc} disabled={!!a.block || a.done} onClick={() => act((s) => issueDip(s, p.id, a.kind))} data-dip={a.kind}>
              {a.label}
              {a.odds ? `（${a.odds}）` : ''}
            </button>
          ))}
        </div>
      )}
      <button class="chip" onClick={() => onEdict({ cat: 'dip', power: p.id })}>
        詳細外交…
      </button>
      {p.standing === '敵對' && p.regions.length > 0 && <p class="hint">敵對中：可以從「軍務」調兵進入其領地，駐軍三旬並擊潰其本部即可佔領。台灣、東海須有足夠水師才能渡海。</p>}
    </div>
  );
}

export function ForeignModal({ view, act, onClose, onEdict }: { view: PlayerView; act: Act; onClose: () => void; onEdict: (i: EdictInit) => void }) {
  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="modal foreign-modal paper" onClick={(e) => e.stopPropagation()} data-testid="foreign-modal">
        <header class="modal-head">
          <h2>四夷與海上</h2>
          <span class="muted">態度與兵力都是據報，附來源與日期。可以聯合、招撫、離間、議和、宣戰，或要求內附。</span>
          <button class="btn ghost" onClick={onClose}>
            退出
          </button>
        </header>
        <div class="powers-grid">
          {view.powers.map((p) => (
            <div key={p.id} class={`power-card ${p.alive ? '' : 'gone'}`} style={{ borderTopColor: p.color }}>
              <PowerPanel p={p} act={act} onEdict={onEdict} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
