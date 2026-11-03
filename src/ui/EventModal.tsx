import { useContext } from 'preact/hooks';
import { shortDate } from '../core/calendar';
import type { CaseView, DocView } from '../core/view';
import { PlainCtx } from './App';
import { Portrait } from './art/Portrait';
import { HallScene } from './art/Scenery';
import { Gloss } from './glossary';

export type GameEvent =
  | { type: 'urgent'; doc: DocView }
  | { type: 'highlight'; doc: DocView }
  | { type: 'audience'; doc: DocView }
  | { type: 'report'; doc: DocView }
  | { type: 'discover'; c: CaseView }
  | { type: 'due'; docs: DocView[] };

/** 退朝後，依序彈出本旬的大事：飛報、奉召抵京、密報回京、新聞知之事、到期政務 */
export function collectEvents(fresh: DocView[], newCases: CaseView[], due: DocView[]): GameEvent[] {
  const out: GameEvent[] = [];
  for (const d of fresh.filter((x) => x.highlight)) out.push({ type: 'highlight', doc: d });
  for (const d of fresh.filter((x) => x.urgent)) out.push({ type: 'urgent', doc: d });
  for (const d of fresh.filter((x) => x.kind === 'audience')) out.push({ type: 'audience', doc: d });
  for (const d of fresh.filter((x) => (x.kind === 'secret' && x.from === 'dongchang') || x.kind === 'envoy')) out.push({ type: 'report', doc: d });
  for (const c of newCases) out.push({ type: 'discover', c });
  if (due.length) out.push({ type: 'due', docs: due });
  return out;
}

interface Props {
  events: GameEvent[];
  index: number;
  onNext: () => void;
  onSkipAll: () => void;
  onOpen: (docId: number) => void;
}

const HEAD = {
  highlight: '內　廷',
  urgent: '飛　報',
  audience: '奉召抵京',
  report: '查覆回京',
  discover: '朕始聞之',
  due: '本旬到期',
} as const;

export function EventModal({ events, index, onNext, onSkipAll, onOpen }: Props) {
  const plain = useContext(PlainCtx);
  const ev = events[index];
  if (!ev) return null;
  const last = index === events.length - 1;

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
          ) : (
            <EventDoc doc={ev.doc} plain={plain} />
          )}
        </div>

        <div class="event-actions">
          {ev.type !== 'discover' && ev.type !== 'due' && (
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
