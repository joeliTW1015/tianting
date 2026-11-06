import { shortDate } from '../core/calendar';
import { issueEdict } from '../core/edicts';
import { FACTION_NAME } from '../core/people';
import type { PlayerView } from '../core/view';
import type { Act } from './App';
import { Portrait } from './art/Portrait';

const ACTS: [string, string][] = [
  ['reward', '賞賜'],
  ['promote', '晉封'],
  ['cold', '冷落'],
  ['exile', '冷宮'],
];

export function HaremModal({ view, act, onClose }: { view: PlayerView; act: Act; onClose: () => void }) {
  const active = view.consorts.filter((c) => c.status === 'active').sort((a, b) => b.rank - a.rank);
  const empress = active.find((c) => c.rank === 6);
  const kids = view.children.filter((c) => c.alive);
  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="modal harem-modal paper" onClick={(e) => e.stopPropagation()} data-testid="harem-modal">
        <header class="modal-head">
          <h2>後　宮</h2>
          <span class="muted">妃嬪的娘家各屬一派：晉封誰，誰的派系就得勢。廢后、立后、立儲需要太后首肯（太后：{view.dowager}）。臨幸在「內廷・消遣」。</span>
          <button class="btn ghost" onClick={onClose}>
            退出
          </button>
        </header>
        <div class="consorts">
          {active.map((c) => (
            <div key={c.id} class={`consort r${c.rank}`} data-consort={c.id}>
              <Portrait look={c.look} kind={c.rank === 6 ? 'empress' : 'consort'} size={70} />
              <div>
                <h4>
                  {c.name}
                  <small>{c.rankName}</small>
                </h4>
                <p class="muted">
                  家世：{c.family ? FACTION_NAME[c.family] : '寒門'}・{c.temper}
                  {c.pregnant ? '・有娠' : ''}
                </p>
                <p>
                  神色：<b>{c.affection}</b>・恩寵 <span class="grace">{'▮'.repeat(Math.round(c.grace / 20))}</span>
                </p>
                <div class="chips">
                  {ACTS.map(([k, l]) => (
                    <button key={k} class="chip" onClick={() => act((s) => issueEdict(s, 'harem', c.id, k))} disabled={(k === 'exile' && c.rank === 6) || (k === 'promote' && c.rank >= 5)}>
                      {l}
                    </button>
                  ))}
                  {c.rank === 6 && (
                    <button class="chip warn" onClick={() => act((s) => issueEdict(s, 'harem', c.id, 'depose'))}>
                      廢后
                    </button>
                  )}
                  {!empress && c.rank >= 3 && c.rank < 6 && (
                    <button class="chip strong" onClick={() => act((s) => issueEdict(s, 'harem', c.id, 'crown'))}>
                      立為皇后
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {view.consorts
            .filter((c) => c.status === 'cold')
            .map((c) => (
              <div key={c.id} class="consort cold">
                <Portrait look={c.look} kind="consort" size={50} muted />
                <span>
                  {c.name}（冷宮）
                </span>
              </div>
            ))}
        </div>
        <h3>皇子皇女</h3>
        {kids.length === 0 && <p class="muted">尚無子嗣。七十二旬內無皇子，「國本未定」：朝望日減、皇叔窺伺。</p>}
        <div class="kids">
          {kids.map((k) => (
            <div key={k.id} class={`kid ${k.heir ? 'heir' : ''}`}>
              <b>{k.name}</b>
              <span class="muted">
                生母{k.mother}・{shortDate(k.born)}生
              </span>
              {k.heir ? (
                <em>皇太子</em>
              ) : (
                k.son && (
                  <button class="chip strong" onClick={() => act((s) => issueEdict(s, 'heir', k.id))}>
                    立為太子
                  </button>
                )
              )}
            </div>
          ))}
        </div>
        <div class="vermilion-row">
          <button class="btn" onClick={() => act((s) => issueEdict(s, 'select'))}>
            選秀（內帑十萬）
          </button>
          <button class="btn" onClick={() => act((s) => issueEdict(s, 'filial'))}>
            往慈寧宮晨昏定省
          </button>
        </div>
      </div>
    </div>
  );
}
