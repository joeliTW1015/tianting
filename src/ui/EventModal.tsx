import { useContext, useEffect, useState } from 'preact/hooks';
import { choose, readDoc } from '../core/actions';
import { shortDate } from '../core/calendar';
import { oddsText, oddsTier } from '../core/intel';
import { STATUS_DEFS } from '../core/statuses';
import type { CaseView, DocView, PlayerView } from '../core/view';
import { PlainCtx, type Act } from './App';
import { Portrait } from './art/Portrait';
import { HallScene } from './art/Scenery';
import { Gloss } from './glossary';

export type GameEvent =
  | { type: 'battle'; doc: DocView }
  | { type: 'decision'; doc: DocView }
  | { type: 'lot'; doc: DocView }
  | { type: 'urgent'; doc: DocView }
  | { type: 'highlight'; doc: DocView }
  | { type: 'audience'; doc: DocView }
  | { type: 'report'; doc: DocView }
  | { type: 'discover'; c: CaseView }
  | { type: 'due'; docs: DocView[] };

/** 退朝後，依序彈出本旬的大事：飛報、奉召抵京、密報回京、新聞知之事、到期政務 */
export function collectEvents(fresh: DocView[], newCases: CaseView[], due: DocView[]): GameEvent[] {
  const out: GameEvent[] = [];
  const used = new Set<number>();
  const take = (d: DocView) => (used.has(d.id) ? false : (used.add(d.id), true));
  for (const d of fresh.filter((x) => x.lot)) if (take(d)) out.push({ type: 'lot', doc: d });
  for (const d of fresh.filter((x) => x.battleId !== undefined)) if (take(d)) out.push({ type: 'battle', doc: d });
  for (const d of fresh.filter((x) => x.task && !x.task.chosen && !x.task.delegate && x.importance >= 3)) if (take(d)) out.push({ type: 'decision', doc: d });
  for (const d of fresh.filter((x) => x.highlight && !used.has(x.id))) if (take(d)) out.push({ type: 'highlight', doc: d });
  for (const d of fresh.filter((x) => x.urgent && !used.has(x.id))) if (take(d)) out.push({ type: 'urgent', doc: d });
  for (const d of fresh.filter((x) => x.kind === 'audience' && !used.has(x.id))) if (take(d)) out.push({ type: 'audience', doc: d });
  for (const d of fresh.filter((x) => ((x.kind === 'secret' && x.from === 'dongchang') || x.kind === 'envoy') && !used.has(x.id))) if (take(d)) out.push({ type: 'report', doc: d });
  for (const c of newCases) out.push({ type: 'discover', c });
  if (due.length) out.push({ type: 'due', docs: due });
  return out;
}

interface Props {
  events: GameEvent[];
  index: number;
  view: PlayerView;
  act: Act;
  onNext: () => void;
  onSkipAll: () => void;
  onOpen: (docId: number) => void;
  onBattle: (battleId: number) => void;
}

const HEAD = {
  battle: '戰　報',
  decision: '聖　裁',
  lot: '擲　籤',
  highlight: '內　廷',
  urgent: '飛　報',
  audience: '奉召抵京',
  report: '查覆回京',
  discover: '朕始聞之',
  due: '本旬到期',
} as const;

export function EventModal({ events, index, view, act, onNext, onSkipAll, onOpen, onBattle }: Props) {
  const plain = useContext(PlainCtx);
  const ev = events[index];
  if (!ev) return null;
  const last = index === events.length - 1;
  const live = 'doc' in ev ? view.inbox.find((d) => d.id === ev.doc.id) ?? ev.doc : null;

  return (
    <div class="modal-bg event-bg" data-testid="event-modal">
      <div class={`event-modal event-${ev.type}`} onClick={(e) => e.stopPropagation()}>
        <div class="event-ribbon">
          <span>{ev.type === 'highlight' ? ev.doc.highlight : HEAD[ev.type]}</span>
          <small>
            {index + 1} / {events.length}
          </small>
        </div>

        {ev.type === 'audience' && (
          <div class="event-hall">
            <HallScene />
            {ev.doc.fromLook !== undefined && ev.doc.fromKind && (
              <div class="event-figure">
                <Portrait look={ev.doc.fromLook} kind={ev.doc.fromKind} rank={ev.doc.fromRank} size={120} />
              </div>
            )}
          </div>
        )}

        <div class="event-body paper">
          {ev.type === 'discover' ? (
            <>
              <h3>{ev.c.title}</h3>
              <p>{ev.c.question}</p>
              <p class="muted small">
                {shortDate(ev.c.firstSeen)}，此事首次見於奏報。事情的真相，只能從往後的奏報、密查與召見中慢慢拼湊。可以在右側「心證」記下你的判斷；察覺之後，該地的「下旨」會出現針對此事的專屬旨意。
              </p>
            </>
          ) : ev.type === 'due' ? (
            <>
              <h3>以下政務本旬須裁決，逾期依例處置：</h3>
              <ul class="due-list">
                {ev.docs.map((d) => (
                  <li key={d.id}>
                    <button class="linkish" onClick={() => onOpen(d.id)}>
                      {d.title}
                    </button>
                    <span class="muted small">
                      （逾期依例：{d.task?.choices.find((c) => c.id === d.task?.fallback)?.label}）
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : ev.type === 'decision' && live ? (
            <>
              <EventDoc doc={live} plain={plain} />
              <Decision doc={live} view={view} act={act} />
            </>
          ) : ev.type === 'lot' && live?.lot ? (
            <>
              <LotDraw ok={live.lot.ok} label={live.lot.label} />
              <EventDoc doc={live} plain={plain} />
            </>
          ) : (
            <EventDoc doc={live ?? ev.doc} plain={plain} />
          )}
        </div>

        <div class="event-actions">
          {ev.type === 'battle' && ev.doc.battleId !== undefined && (
            <button class="btn vermilion" onClick={() => onBattle(ev.doc.battleId!)} data-testid="event-battle">
              觀戰報
            </button>
          )}
          {ev.type !== 'discover' && ev.type !== 'due' && ev.type !== 'battle' && (
            <button class="btn vermilion" onClick={() => onOpen(ev.doc.id)} data-testid="event-open">
              {ev.doc.task && !ev.doc.task.chosen ? '前往裁決' : ev.doc.read ? '置於案上' : '前往細讀'}
            </button>
          )}
          <button class="btn primary" onClick={onNext} data-testid="event-next">
            {last ? '知道了' : '下一則'}
          </button>
          {!last && (
            <button class="btn ghost" onClick={onSkipAll}>
              全部略過
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EventDoc({ doc, plain }: { doc: DocView; plain: boolean }) {
  return (
    <>
      <div class="event-head">
        {doc.kind !== 'audience' && doc.fromLook !== undefined && doc.fromKind && <Portrait look={doc.fromLook} kind={doc.fromKind} rank={doc.fromRank} size={54} />}
        <div>
          <h3>{doc.title}</h3>
          <p class="muted small">
            {doc.fromLabel}・{shortDate(doc.sentTurn)}發{doc.topicTitle ? `・${doc.topicTitle}` : ''}
          </p>
        </div>
      </div>
      {doc.paras ? (
        doc.paras.map((p, i) => (
          <div key={i} class="para">
            <p class="classic">
              <Gloss text={p.text} />
            </p>
            {plain && p.plain && (
              <p class="plain">
                <span>白話</span>
                {p.plain}
              </p>
            )}
          </div>
        ))
      ) : (
        <div class="slip">
          <div class="slip-head">內閣票擬</div>
          <p>
            <Gloss text={doc.summary} />
          </p>
          <p class="muted small">全文須細讀（精力 1）。</p>
        </div>
      )}
    </>
  );
}

function Decision({ doc, view, act }: { doc: DocView; view: PlayerView; act: Act }) {
  const t = doc.task!;
  const [lot, setLot] = useState<string | null>(null);
  if (t.chosen) {
    const c = t.choices.find((x) => x.id === t.chosen);
    return (
      <div class="decision done">
        {doc.lot && <LotDraw ok={doc.lot.ok} label={doc.lot.label} />}
        已定：<b>{c?.label}</b>
        {lot && null}
      </div>
    );
  }
  return (
    <div class="decision">
      <p class="muted small">{doc.read || doc.free ? '直接裁決。' : '裁決會順帶細讀全文（精力 1）。'}逾期依例「{t.choices.find((c) => c.id === t.fallback)?.label}」。</p>
      <div class="choices">
        {t.choices.map((c) => {
          const cost = [c.silver ? `國庫 ${c.silver} 萬` : '', c.privy ? `內帑 ${c.privy} 萬` : '', c.grain ? `糧 ${c.grain} 萬石` : '', c.energy ? `精力 ${c.energy}` : ''].filter(Boolean).join('・');
          return (
            <button
              key={c.id}
              class="choice"
              data-choice={c.id}
              disabled={view.energy <= -3 && !doc.read && !doc.free}
              onClick={() => {
                act((s) => (doc.read || doc.free ? null : readDoc(s, doc.id)) ?? choose(s, doc.id, c.id));
                setLot(c.id);
              }}
            >
              <b>{c.label}</b>
              {cost && <span class="cost">{cost}</span>}
              {c.odds !== undefined && <span class={`odds o${oddsTier(c.odds)}`}>勝算：{oddsText(c.odds)}</span>}
              <span class="note">{c.note}</span>
              {c.status && STATUS_DEFS[c.status] && <span class="status-chip">狀態「{STATUS_DEFS[c.status].name}」</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 擲籤動畫：籤筒搖動，掉出一支籤 */
export function LotDraw({ ok, label }: { ok: boolean; label: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 1200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div class={`lot ${shown ? 'shown' : ''} ${ok ? 'ok' : 'bad'}`}>
      <svg viewBox="0 0 120 160" class="tube">
        <rect x="30" y="50" width="60" height="100" rx="8" fill="#8e2a22" stroke="#c9a446" stroke-width="3" />
        {[40, 52, 64, 76].map((x, i) => (
          <rect key={x} x={x} y={20 + (i % 2) * 6} width="6" height="60" fill="#e8d3a0" />
        ))}
        <rect class="stick" x="56" y="10" width="8" height="70" fill="#f3e6c8" stroke="#c9a446" />
      </svg>
      {shown && <div class="lot-label">{label}・{ok ? '事成' : '不成'}</div>}
    </div>
  );
}
