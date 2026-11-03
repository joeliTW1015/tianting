import { useState } from 'preact/hooks';
import { shortDate } from '../core/calendar';
import type { DocKind } from '../core/types';
import type { CaseView, DocView } from '../core/view';
import { Portrait } from './art/Portrait';

export const KIND_SEAL: Record<DocKind, string> = {
  memorial: '奏',
  secret: '密',
  envoy: '查',
  rumor: '聞',
  audience: '對',
  notice: '示',
  task: '務',
  digest: '冊',
};

export const DECISION_TEXT = { approve: '准', reject: '駁', shelve: '留中' } as const;

type Filter = 'all' | 'todo' | 'unread' | string;

interface Props {
  docs: DocView[];
  cases: CaseView[];
  selected: number | null;
  onSelect: (id: number) => void;
  turn: number;
}

export function isTodo(d: DocView, turn: number): boolean {
  return !!((d.request && (!d.decision || d.decision === 'shelve')) || (d.task && !d.task.chosen && turn <= d.task.deadline));
}

export function Inbox({ docs, cases, selected, onSelect, turn }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [showOld, setShowOld] = useState(false);
  let list = docs;
  if (filter === 'todo') list = docs.filter((d) => isTodo(d, turn));
  else if (filter === 'unread') list = docs.filter((d) => !d.read);
  else if (filter !== 'all') list = docs.filter((d) => d.topic === filter);

  const fresh = list.filter((d) => d.arriveTurn === turn);
  const recent = list.filter((d) => d.arriveTurn < turn && d.arriveTurn >= turn - 3);
  const old = list.filter((d) => d.arriveTurn < turn - 3);
  const todo = docs.filter((d) => isTodo(d, turn)).length;

  return (
    <section class="inbox tray">
      <h2>
        <span>奏摺匣</span>
        <small>
          共 {docs.length} 件・待辦 {todo}
        </small>
      </h2>
      <div class="filters">
        <button class={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          全部
        </button>
        <button class={filter === 'todo' ? 'on' : ''} onClick={() => setFilter('todo')} data-testid="filter-todo">
          待辦{todo ? `（${todo}）` : ''}
        </button>
        <button class={filter === 'unread' ? 'on' : ''} onClick={() => setFilter('unread')}>
          未讀
        </button>
        {cases.length > 0 && (
          <select value={cases.some((c) => c.uid === filter) ? filter : ''} onChange={(e) => setFilter((e.target as HTMLSelectElement).value || 'all')} aria-label="依疑案篩選">
            <option value="">依事件…</option>
            {cases.map((c) => (
              <option key={c.uid} value={c.uid}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </div>
      <div class="inbox-list">
        <div class="group">本旬新到・{fresh.length} 件</div>
        {fresh.map((d) => (
          <Item key={d.id} d={d} on={d.id === selected} onSelect={onSelect} turn={turn} />
        ))}
        {fresh.length === 0 && <div class="empty">本旬無新到文書。</div>}
        {recent.length > 0 && <div class="group">前三旬・{recent.length} 件</div>}
        {recent.map((d) => (
          <Item key={d.id} d={d} on={d.id === selected} onSelect={onSelect} turn={turn} />
        ))}
        {old.length > 0 && (
          <button class="group more" onClick={() => setShowOld(!showOld)}>
            更早・{old.length} 件 {showOld ? '▲' : '▼'}
          </button>
        )}
        {showOld && old.map((d) => <Item key={d.id} d={d} on={d.id === selected} onSelect={onSelect} turn={turn} />)}
      </div>
    </section>
  );
}

function Item({ d, on, onSelect, turn }: { d: DocView; on: boolean; onSelect: (id: number) => void; turn: number }) {
  const todo = isTodo(d, turn);
  return (
    <button class={`item ${on ? 'on' : ''} ${d.read ? 'read' : ''} ${d.urgent ? 'urgent' : ''} kind-${d.kind}`} onClick={() => onSelect(d.id)} data-doc={d.id}>
      <span class="avatar">
        {d.fromLook !== undefined && d.fromKind ? <Portrait look={d.fromLook} kind={d.fromKind} rank={d.fromRank} size={30} /> : <span class="kseal">{KIND_SEAL[d.kind]}</span>}
      </span>
      <span class="item-body">
        <span class="item-title">
          {d.urgent && <em class="fire">急</em>}
          {d.title}
        </span>
        <span class="item-meta">
          {KIND_SEAL[d.kind]}・{d.fromLabel}・{shortDate(d.sentTurn)}發
        </span>
        {d.topicTitle && <span class="item-topic">{d.topicTitle}</span>}
      </span>
      <span class="item-flags">
        {!d.read && <em class="flag unread">未讀</em>}
        {todo && <em class="flag ask">{d.task ? '待裁' : d.decision === 'shelve' ? '留中' : '待批'}</em>}
        {d.decision && d.decision !== 'shelve' && <em class="flag done">{DECISION_TEXT[d.decision]}</em>}
      </span>
    </button>
  );
}
