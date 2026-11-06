import { useState } from 'preact/hooks';
import { setTrust } from '../core/actions';
import { SUMMONABLE } from '../core/court';
import { ABIL_NAME, abilText, AUTH_TEXT, FACTION_NAME, setAuthority } from '../core/people';
import type { Authority, Trust } from '../core/types';
import type { OfficialView, PlayerView } from '../core/view';
import type { Act } from './App';
import { Portrait } from './art/Portrait';
import type { EdictInit } from './EdictModal';

const TRUST_TEXT: Record<Trust, string> = { trust: '可信', doubt: '存疑', distrust: '不信' };

export function FactionBar({ view, compact }: { view: PlayerView; compact?: boolean }) {
  return (
    <div class={`faction-bar ${compact ? 'compact' : ''}`} title="朝局天平：四派聲勢。超過五成即專權；四派都在一成五到四成之間為均衡。">
      {view.factions.map((f) => (
        <span key={f.id} class={`fseg ${f.grievance >= 70 ? 'angry' : ''}`} style={{ width: `${f.clout * 100}%`, background: f.color }}>
          {!compact && f.clout > 0.1 && `${f.name} ${Math.round(f.clout * 100)}%`}
        </span>
      ))}
      <i class="mark m40" />
      <i class="mark m50" />
    </div>
  );
}

export function OfficialCard({ o, act, onSummon, onEdict, compact }: { o: OfficialView; act: Act; onSummon?: (id: string) => void; onEdict: (i: EdictInit) => void; compact?: boolean }) {
  return (
    <div class={`official ${o.certified ? 'sure' : ''} trust-${o.trust ?? 'none'}`} data-official={o.id}>
      <Portrait look={o.look} kind={o.kind} rank={o.rank} size={compact ? 44 : 56} />
      <div class="off-body">
        <div class="off-head">
          <b>{o.name}</b>
          <span class="muted">
            {o.post}
            {o.term > 1 ? '（新任）' : ''}・{o.age}歲
          </span>
          <span class="fac-chip" data-f={o.faction ?? 'none'}>
            {o.faction ? FACTION_NAME[o.faction] : '無黨'}
          </span>
        </div>
        <div class="off-tags">
          <span>{o.stance}</span>
          <span>{o.temper}</span>
          {o.traits.map((t) => (
            <span key={t} class="trait">
              {t}
            </span>
          ))}
          <span class="demeanor">神色：{o.demeanor}</span>
        </div>
        <div class="abil">
          {(Object.keys(ABIL_NAME) as (keyof typeof ABIL_NAME)[]).map((k) => (
            <span key={k} class={`ab a${o.abil[k]}`}>
              {ABIL_NAME[k]}
              <b>{abilText(o.abil[k])}</b>
            </span>
          ))}
          <span class={`src ${o.certified ? 'sure' : ''}`}>{o.certified ? '〔確〕東廠' : o.abilSource}</span>
        </div>
        {o.intel && (
          <div class="intel">
            〔確〕操守{o.intel.integrity}・{o.intel.loyalty}・實屬{o.intel.faction}
          </div>
        )}
        {!compact && (
          <div class="off-actions">
            {o.delegable && (
              <span class="auth">
                授權
                {(['ask', 'normal', 'free'] as Authority[]).map((a) => (
                  <button key={a} class={`tag ${o.authority === a ? 'on' : ''}`} onClick={() => act((s) => setAuthority(s, o.id, a))} data-auth={`${o.id}:${a}`}>
                    {AUTH_TEXT[a]}
                  </button>
                ))}
              </span>
            )}
            <span class="trusts">
              {(['trust', 'doubt', 'distrust'] as Trust[]).map((t) => (
                <button key={t} class={`tag t-${t} ${o.trust === t ? 'on' : ''}`} onClick={() => act((s) => setTrust(s, o.id, o.trust === t ? undefined : t))}>
                  {TRUST_TEXT[t]}
                </button>
              ))}
            </span>
            <button class="chip" onClick={() => onEdict({ edict: 'appoint', target: o.id })}>
              任免
            </button>
            <button class="chip" onClick={() => onEdict({ edict: 'probe', target: o.id })}>
              密查
            </button>
            {onSummon && SUMMONABLE.includes(o.id) && (
              <button class="chip strong" onClick={() => onSummon(o.id)} data-summon={o.id}>
                召見
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CourtModal({ view, act, onClose, onSummon, onEdict }: { view: PlayerView; act: Act; onClose: () => void; onSummon: (id: string) => void; onEdict: (i: EdictInit) => void }) {
  const [group, setGroup] = useState<'capital' | 'field' | 'local' | 'faction'>('capital');
  const capital = view.officials.filter((o) => !o.id.startsWith('gov:') && !['jinglue', 'sanbian', 'dongjiang'].includes(o.id));
  const field = view.officials.filter((o) => ['jinglue', 'sanbian', 'dongjiang'].includes(o.id) || (o.id.startsWith('gov:') && o.kind === 'military'));
  const local = view.officials.filter((o) => o.id.startsWith('gov:') && o.kind !== 'military');
  const list = group === 'capital' ? capital : group === 'field' ? field : local;
  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="modal court-modal paper" onClick={(e) => e.stopPropagation()} data-testid="court-modal">
        <header class="modal-head">
          <h2>朝　局</h2>
          <span class="muted">
            {view.dominant ? `${FACTION_NAME[view.dominant]}專權！` : view.balanced ? '四派均衡：詔書執行快一旬、吏治漸清。' : '朝局失衡。'} 太后：{view.dowager}・宿衛：{view.guard}・東廠：{view.dongchang === 'crown' ? '在朕手中' : '在權閹手中'}
          </span>
          <button class="btn ghost" onClick={onClose}>
            退出
          </button>
        </header>
        <FactionBar view={view} />
        <div class="faction-cards">
          {view.factions.map((f) => (
            <div key={f.id} class="fcard" style={{ borderColor: f.color }}>
              <b style={{ color: f.color }}>{f.name}</b>
              <span>聲勢 {Math.round(f.clout * 100)}%</span>
              <span class={`griev g${f.grievance >= 90 ? 4 : f.grievance >= 80 ? 3 : f.grievance >= 70 ? 2 : f.grievance >= 45 ? 1 : 0}`}>{f.grievance >= 90 ? '即將發難' : f.grievance >= 80 ? '群起乞休' : f.grievance >= 70 ? '交章彈劾' : f.grievance >= 45 ? '頗有怨言' : '尚稱平和'}</span>
            </div>
          ))}
          <button class="btn small" onClick={() => onEdict({ edict: 'mediate' })}>
            調停黨爭
          </button>
        </div>
        <p class="hint">
          授權：事事奏請＝每件小事都上呈（你最累、他不悅）；常例自專＝例行事務自行處理、重要的上呈；便宜行事＝只有大事上呈（反應快，但依他的傾向與私心辦，野心日長）。每旬最多改三個職位。能力評語來自吏部考語，可能有一級的偏差，東廠密查後才確實。
        </p>
        <nav class="tabs">
          {(
            [
              ['capital', '京官'],
              ['field', '督師總兵'],
              ['local', '督撫'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} class={group === k ? 'on' : ''} onClick={() => setGroup(k)}>
              {l}
            </button>
          ))}
        </nav>
        <div class="official-list">
          {list.map((o) => (
            <OfficialCard key={o.id} o={o} act={act} onSummon={onSummon} onEdict={onEdict} />
          ))}
        </div>
      </div>
    </div>
  );
}
