import { useState } from 'preact/hooks';
import { issueOrder, orderOptions } from '../core/actions';
import { shortDate } from '../core/calendar';
import { CAT_NAME, EDICTS, edictDef, issueDip, issueEdict, previewEdict, type EdictCat } from '../core/edicts';
import { ALL_REGIONS, REGIONS, regionName, travelTurns } from '../core/geography';
import { FACTION_NAME } from '../core/people';
import type { FactionId, GameState, RegionId } from '../core/types';
import type { PlayerView } from '../core/view';
import type { Act } from './App';

export type EdictTab = EdictCat | 'local';

export interface EdictInit {
  cat?: EdictTab;
  edict?: string;
  target?: string;
  power?: string;
  region?: RegionId;
}

const TABS: [EdictTab, string, string][] = [
  ['mil', '軍務', '虎'],
  ['hr', '人事', '吏'],
  ['fin', '財計', '算'],
  ['dip', '外交', '節'],
  ['dc', '密偵', '廠'],
  ['pal', '內廷', '鳳'],
  ['grand', '大計', '璽'],
  ['local', '地方', '方'],
];

export function EdictModal({ state, view, act, init, onClose }: { state: GameState; view: PlayerView; act: Act; init?: EdictInit; onClose: () => void }) {
  const [tab, setTab] = useState<EdictTab>(init?.cat ?? (init?.edict ? edictDef(init.edict)!.cat : 'mil'));
  const [eid, setEid] = useState<string | null>(init?.edict ?? null);
  const [target, setTarget] = useState(init?.target ?? '');
  const [param, setParam] = useState('');
  const [power, setPower] = useState(init?.power ?? view.powers.find((p) => p.alive)?.id ?? '');
  const [region, setRegion] = useState<RegionId>(init?.region ?? 'shaanxi');
  const list = EDICTS.filter((e) => e.cat === tab);
  const def = eid ? edictDef(eid) : null;
  const targets = def?.targets?.(state) ?? [];
  const params = def?.params?.(state, target) ?? [];
  const pv = def ? previewEdict(state, def.id, target, param) : null;

  const pickEdict = (id: string) => {
    setEid(id);
    setTarget('');
    setParam('');
  };

  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="modal edict-modal paper" onClick={(e) => e.stopPropagation()} data-testid="edict-modal">
        <header class="modal-head">
          <h2>擬　旨</h2>
          <span class="muted">
            精力 {view.energy}／{view.energyMax}（可透支到 −3）・國庫約 {Math.round(view.treasury)} 萬・內帑 {Math.round(view.privy)} 萬
          </span>
          <button class="btn ghost" onClick={onClose}>
            退出
          </button>
        </header>
        <div class="edict-body">
          <nav class="edict-cats">
            {TABS.map(([k, label, seal]) => (
              <button
                key={k}
                class={tab === k ? 'on' : ''}
                onClick={() => {
                  setTab(k);
                  setEid(null);
                }}
                data-cat={k}
              >
                <span class="cat-seal">{seal}</span>
                {label}
              </button>
            ))}
          </nav>

          {tab === 'dip' ? (
            <DipPane state={state} view={view} act={act} power={power} setPower={setPower} />
          ) : tab === 'local' ? (
            <LocalPane state={state} act={act} region={region} setRegion={setRegion} />
          ) : (
            <>
              <ul class="edict-list">
                {list.map((e) => (
                  <li key={e.id}>
                    <button class={eid === e.id ? 'on' : ''} onClick={() => pickEdict(e.id)} data-edict={e.id}>
                      <b>{e.name}</b>
                      <span>{typeof e.energy === 'number' ? `精力${e.energy}` : '精力依規模'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <section class="edict-detail">
                {!def && <p class="muted">選一道詔書。每道詔書都要「送達」（驛程）與「執行」（旬數），完成後才生效。</p>}
                {def && (
                  <>
                    <h3>{def.name}</h3>
                    <p>{def.desc}</p>
                    {def.ancestral && <p class="warn">違祖制：首輔可能封駁（約{Math.round((pv?.veto ?? 0) * 100) > 40 ? '多半' : Math.round((pv?.veto ?? 0) * 100) > 15 ? '有時' : '偶爾'}會）。</p>}
                    {def.target !== 'none' && (
                      <div class="pick">
                        <label>對象</label>
                        {targets.length > 12 ? (
                          <select value={target} onChange={(e) => (setTarget((e.target as HTMLSelectElement).value), setParam(''))} data-testid="edict-target">
                            <option value="">— 請選 —</option>
                            {targets.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div class="chips">
                            {targets.map((t) => (
                              <button key={t.id} class={`chip ${target === t.id ? 'on' : ''}`} onClick={() => (setTarget(t.id), setParam(''))} data-target={t.id}>
                                {t.label}
                              </button>
                            ))}
                            {!targets.length && <span class="muted">目前沒有可選的對象。</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {def.params && (def.target === 'none' || target) && (
                      <div class="pick">
                        <label>辦法</label>
                        {params.length > 12 ? (
                          <select value={param} onChange={(e) => setParam((e.target as HTMLSelectElement).value)} data-testid="edict-param">
                            <option value="">— 請選 —</option>
                            {params.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div class="chips">
                            {params.map((p) => (
                              <button key={p.id} class={`chip ${param === p.id ? 'on' : ''}`} onClick={() => setParam(p.id)} data-param={p.id}>
                                {p.label}
                              </button>
                            ))}
                            {!params.length && <span class="muted">沒有可選的辦法。</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {pv && <Preview pv={pv} turn={view.turn} factions={def.factions} />}
                    <div class="vermilion-row">
                      <button
                        class="btn vermilion"
                        data-testid="issue-edict"
                        disabled={!!pv?.block}
                        onClick={() => {
                          act((s) => issueEdict(s, def.id, target, param));
                          setParam('');
                        }}
                      >
                        用　璽
                      </button>
                      {pv?.block && <span class="hint warn">{pv.block}</span>}
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Preview({ pv, turn, factions }: { pv: ReturnType<typeof previewEdict>; turn: number; factions?: Partial<Record<FactionId, number>> }) {
  const cost = [pv.cost.silver ? `國庫 ${Math.round(pv.cost.silver)} 萬兩` : '', pv.cost.privy ? `內帑 ${pv.cost.privy} 萬兩` : '', pv.cost.grain ? `糧 ${pv.cost.grain} 萬石` : ''].filter(Boolean).join('・');
  return (
    <table class="preview">
      <tbody>
        <tr>
          <th>精力</th>
          <td>{pv.energy}</td>
        </tr>
        <tr>
          <th>花費</th>
          <td>{cost || '—'}</td>
        </tr>
        <tr>
          <th>時間</th>
          <td>
            送達 {pv.travel} 旬・執行 {pv.exec} 旬 → <b>{pv.done <= turn ? '即刻生效' : `${shortDate(pv.done)}完成`}</b>
          </td>
        </tr>
        {pv.oddsText && (
          <tr>
            <th>勝算</th>
            <td>
              <span class={`odds o${['九死一生', '凶多吉少', '五五之數', '勝算頗高', '十拿九穩'].indexOf(pv.oddsText)}`}>{pv.oddsText}</span>
            </td>
          </tr>
        )}
        {factions && (
          <tr>
            <th>派系</th>
            <td>
              {Object.entries(factions).map(([f, v]) => (
                <span key={f} class={`fx ${v! > 0 ? 'up' : 'down'}`}>
                  {FACTION_NAME[f as FactionId]}
                  {v! > 0 ? '喜' : '怨'}
                </span>
              ))}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function DipPane({ state, view, act, power, setPower }: { state: GameState; view: PlayerView; act: Act; power: string; setPower: (p: string) => void }) {
  const pv = view.powers.find((p) => p.id === power);
  return (
    <>
      <ul class="edict-list">
        {view.powers.map((p) => (
          <li key={p.id}>
            <button class={power === p.id ? 'on' : ''} onClick={() => setPower(p.id)} disabled={!p.alive} data-power={p.id}>
              <b>
                <i class="lg" style={{ background: p.color }} /> {p.name}
              </b>
              <span>{p.standing}</span>
            </button>
          </li>
        ))}
      </ul>
      <section class="edict-detail">
        {pv && (
          <>
            <h3>
              {pv.name}
              <small>
                {pv.kind}・{pv.standing}
              </small>
            </h3>
            <p class="muted">{pv.desc}</p>
            <p>
              態度：{pv.stance ? `${pv.stance.value}（${pv.stance.source}・${shortDate(pv.stance.turn)}）` : '不明'}；兵力：{pv.strength ? `約 ${Math.round(pv.strength.value / 1000)} 千（${pv.strength.source}・${shortDate(pv.strength.turn)}）` : '不明'}
            </p>
            <p class="muted">外交使節往返：單程約 {travelTurns(state, REGIONS[pv.home] ? pv.home : 'jingshi')} 旬。</p>
            <div class="dip-actions">
              {pv.actions.map((a) => (
                <div key={a.kind} class={`dip-act ${a.block ? 'blocked' : ''}`}>
                  <div>
                    <b>{a.label}</b>
                    <span class="muted">
                      精力{a.energy}
                      {a.silver ? `・銀${a.silver}萬` : ''}
                      {a.odds ? `・勝算「${a.odds}」` : ''}
                    </span>
                  </div>
                  <p>{a.block ?? a.desc}</p>
                  <button class="btn vermilion small" disabled={!!a.block || a.done} onClick={() => act((s) => issueDip(s, pv.id, a.kind))} data-dip={a.kind}>
                    {a.done ? '本旬已議' : '遣使宣諭'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}

function LocalPane({ state, act, region, setRegion }: { state: GameState; act: Act; region: RegionId; setRegion: (r: RegionId) => void }) {
  const opts = REGIONS[region].kind === 'outer' ? [] : orderOptions(state, region);
  return (
    <>
      <ul class="edict-list">
        {ALL_REGIONS.filter((r) => REGIONS[r].kind !== 'outer').map((r) => (
          <li key={r}>
            <button class={region === r ? 'on' : ''} onClick={() => setRegion(r)}>
              <b>{regionName(r)}</b>
              <span>{travelTurns(state, r)} 旬</span>
            </button>
          </li>
        ))}
      </ul>
      <section class="edict-detail">
        <h3>{regionName(region)}・地方旨意</h3>
        <p class="muted">密查、巡按、召見與拿問地方長官、催科、查禁邪教、招撫亂民，以及針對已察覺之事的專屬旨意。</p>
        <div class="dip-actions">
          {opts.map((o) => (
            <div key={o.kind + (o.caseId ?? '') + (o.person ?? '')} class="dip-act">
              <div>
                <b>{o.label}</b>
                <span class="muted">
                  精力{o.energy}
                  {o.silver ? `・銀${o.silver}萬` : ''}
                </span>
              </div>
              <p>{o.desc}</p>
              <button class="btn vermilion small" disabled={o.issued} onClick={() => act((s) => issueOrderSafe(s, region, o.kind, o.caseId, o.person))} data-order={o.kind}>
                {o.issued ? '本旬已下旨' : '用璽'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function issueOrderSafe(s: GameState, region: RegionId, kind: string, caseId?: string, person?: string): string | null {
  const opt = orderOptions(s, region).find((o) => o.kind === kind && (o.caseId ?? '') === (caseId ?? '') && (o.person ?? '') === (person ?? ''));
  return opt ? issueOrder(s, opt) : '此旨不可行。';
}

export { CAT_NAME };
