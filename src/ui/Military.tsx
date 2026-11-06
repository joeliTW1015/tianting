import { shortDate } from '../core/calendar';
import { issueEdict } from '../core/edicts';
import { REGIONS, regionName, travelTurns } from '../core/geography';
import { oddsText } from '../core/intel';
import type { GameState, RegionId } from '../core/types';
import type { ArmyView, PlayerView } from '../core/view';
import { CARDS, CROWN_CARDS, crownPowerAt, estimateOdds } from '../core/war';
import type { Act } from './App';
import { Portrait } from './art/Portrait';
import type { EdictInit } from './EdictModal';
import { AUTH_TEXT } from '../core/people';

function wan(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}萬` : `${Math.round(n / 100) * 100}`;
}

/** 部隊面板：輿圖上點了某部 */
export function ArmyPanel({ state, view, army, act, onEdict }: { state: GameState; view: PlayerView; army: ArmyView; act: Act; onEdict: (i: EdictInit) => void }) {
  const rv = view.regions[army.region];
  const foe = rv.foe?.size ?? 0;
  const ours = crownPowerAt(state, army.region);
  return (
    <div class="army-panel">
      <div class="panel-head">
        {army.commander ? <Portrait look={army.commander.look} kind={army.commander.kind} size={52} /> : <span class="kseal big">兵</span>}
        <div>
          <h3>
            {army.label}
            {army.campaign && <em class="fire">御駕</em>}
          </h3>
          <span class="muted small">
            {army.unit}・駐{regionName(army.region)}・{army.mission}
            {army.commander && `・主將${army.commander.name}（${army.commander.stance}・${AUTH_TEXT[army.commander.authority]}）`}
          </span>
        </div>
      </div>
      <table class="facts">
        <tbody>
          <tr>
            <td>兵數</td>
            <td>
              名冊 {wan(army.reported)}
              {army.real !== undefined ? <b class="sure">　〔確〕實 {wan(army.real)}</b> : <span class="muted">（實數未點驗）</span>}
            </td>
          </tr>
          <tr>
            <td>士氣</td>
            <td class={`mb${army.moraleBand}`}>{army.morale}</td>
          </tr>
          {army.path.length > 0 && (
            <tr>
              <td>行軍</td>
              <td>
                {army.path.map((r) => regionName(r)).join(' → ')}
                {army.eta !== undefined && `（下一站約 ${shortDate(army.eta)}）`}
              </td>
            </tr>
          )}
          {army.stratagem && (
            <tr>
              <td>所授方略</td>
              <td>{army.stratagem}</td>
            </tr>
          )}
          {army.posture && (
            <tr>
              <td>旨意</td>
              <td>{army.posture}</td>
            </tr>
          )}
          {foe > 0 && (
            <tr>
              <td>當面敵情</td>
              <td>
                據{rv.foe!.source}約 {wan(foe)}・勝算「{oddsText(estimateOdds(ours, foe))}」
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <h4>方略（下一戰）</h4>
      <div class="cards">
        {CROWN_CARDS.map((c) => (
          <button key={c.id} class="card" title={c.desc} onClick={() => act((s) => issueEdict(s, 'stratagem', String(army.id), c.id))} data-card={c.id}>
            <b>{c.name}</b>
            <span>{foe ? oddsText(estimateOdds(ours, foe, c.id)) : '—'}</span>
          </button>
        ))}
      </div>
      <p class="hint">授方略要走驛路：{REGIONS[army.region].kind === 'outer' ? '境外' : regionName(army.region)}約需 {Math.max(0, travel(state, army.region))} 旬送到；送到時戰況若已變，主將可能「君命有所不受」。勝算依據報的敵情估計。</p>
      <h4>軍令</h4>
      <div class="chips">
        <button class="chip strong" onClick={() => onEdict({ edict: 'march', target: String(army.id) })}>
          調兵／進剿
        </button>
        <button class="chip" onClick={() => act((s) => issueEdict(s, 'posture', String(army.id), 'attack'))}>
          催戰
        </button>
        <button class="chip" onClick={() => act((s) => issueEdict(s, 'posture', String(army.id), 'hold'))}>
          禁戰固守
        </button>
        <button class="chip" onClick={() => act((s) => issueEdict(s, 'reward', String(army.id)))}>
          犒軍
        </button>
        <button class="chip" onClick={() => onEdict({ edict: 'replace', target: String(army.id) })}>
          撤換主將
        </button>
        <button class="chip" onClick={() => act((s) => issueEdict(s, 'monitor', String(army.id)))}>
          遣監軍
        </button>
        <button class="chip warn" onClick={() => act((s) => issueEdict(s, 'campaign', String(army.id)))}>
          御駕親征
        </button>
      </div>
    </div>
  );
}

function travel(state: GameState, r: RegionId): number {
  return travelTurns(state, r);
}

export function MilitaryModal({ view, onClose, onArmy, onEdict }: { view: PlayerView; onClose: () => void; onArmy: (id: number) => void; onEdict: (i: EdictInit) => void }) {
  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="modal military-modal paper" onClick={(e) => e.stopPropagation()} data-testid="military-modal">
        <header class="modal-head">
          <h2>軍　務</h2>
          <span class="muted">
            邊餉積欠 {Math.round(view.borderArrears)} 月（四月以上有兵變之虞）・水師 {view.navy} 艘・京營名冊約 {wan(view.jingying)}（在京）
          </span>
          <button class="btn ghost" onClick={onClose}>
            退出
          </button>
        </header>
        <div class="chips">
          <button class="chip strong" onClick={() => onEdict({ edict: 'recruit' })}>
            徵兵
          </button>
          <button class="chip strong" onClick={() => onEdict({ edict: 'elite' })}>
            募精兵
          </button>
          <button class="chip strong" onClick={() => onEdict({ edict: 'sendJingying' })}>
            發京營出征
          </button>
          <button class="chip" onClick={() => onEdict({ edict: 'audit' })}>
            點驗
          </button>
          <button class="chip" onClick={() => onEdict({ edict: 'drill' })}>
            整頓京營
          </button>
          <button class="chip" onClick={() => onEdict({ edict: 'ships' })}>
            造船
          </button>
        </div>
        <table class="army-table">
          <thead>
            <tr>
              <th>部隊</th>
              <th>主將</th>
              <th>駐地</th>
              <th>兵數（名冊）</th>
              <th>士氣</th>
              <th>任務</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {view.armies.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.label}
                  <small class="muted">（{a.unit}）</small>
                </td>
                <td>{a.commander ? `${a.commander.name}・${a.commander.stance}` : '—'}</td>
                <td>{regionName(a.region)}</td>
                <td>
                  {wan(a.reported)}
                  {a.real !== undefined && <b class="sure">（確 {wan(a.real)}）</b>}
                </td>
                <td class={`mb${a.moraleBand}`}>{a.morale}</td>
                <td>
                  {a.mission}
                  {a.path.length ? `→${regionName(a.path[a.path.length - 1])}` : ''}
                </td>
                <td>
                  <button class="chip" onClick={() => onArmy(a.id)}>
                    下令
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>各地據報兵數</h3>
        <div class="troop-grid">
          {Object.values(view.regions)
            .filter((r) => REGIONS[r.id].kind !== 'outer')
            .map((r) => (
              <span key={r.id} class={r.troops?.certified ? 'sure' : ''}>
                {regionName(r.id)} {r.troops ? `${r.troops.certified ? '確' : '報'} ${wan(r.troops.value)}` : '—'}
                {r.held ? '（陷）' : ''}
              </span>
            ))}
        </div>
        <p class="hint">方略相剋：{Object.values(CARDS).filter((c) => c.crown).map((c) => `${c.name}剋${c.beats.map((b) => CARDS[b].name).join('、') || '—'}`).join('；')}。</p>
      </div>
    </div>
  );
}
