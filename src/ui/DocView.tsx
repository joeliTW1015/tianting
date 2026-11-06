import { useContext, useState } from 'preact/hooks';
import { choose, decide, readDoc } from '../core/actions';
import { dateLabel, shortDate } from '../core/calendar';
import type { GameState } from '../core/types';
import type { DocView, PlayerView } from '../core/view';
import { PlainCtx, type Act } from './App';
import { Portrait } from './art/Portrait';
import { HallScene } from './art/Scenery';
import { Gloss } from './glossary';
import { DECISION_TEXT, KIND_SEAL } from './Inbox';
import { oddsText, oddsTier } from '../core/intel';
import { STATUS_DEFS } from '../core/statuses';

const KIND_NAME = {
  memorial: '奏疏',
  secret: '密報',
  envoy: '查覆',
  rumor: '傳聞',
  audience: '奏對',
  notice: '詔示',
  task: '政務',
  digest: '冊報',
} as const;

export function fmtNum(v: number, unit?: string): string {
  if (unit === '萬兩' || unit === '萬石') return `${v} ${unit}`;
  if (v >= 10000) return `約 ${(v / 10000).toFixed(1)} 萬${unit ?? ''}`;
  if (v >= 1000) return `約 ${Math.round(v / 100) * 100}${unit ?? ''}`;
  return `${Math.round(v)}${unit ?? ''}`;
}

export function DocPane({ doc, state, view, act, onBattle, onClose }: { doc: DocView | null; state: GameState; view: PlayerView; act: Act; onBattle?: (id: number) => void; onClose?: () => void }) {
  const plain = useContext(PlainCtx);
  if (!doc) {
    return (
      <div class="docpane empty-pane">
        <div class="placeholder">
          <div class="seal ghost">御覽</div>
          <p>自奏摺匣中擇一文書披閱。</p>
        </div>
      </div>
    );
  }
  const travel = doc.arriveTurn - doc.sentTurn;
  const audience = doc.kind === 'audience';

  return (
    <div class="docpane">
      <article class={`paper doc kind-${doc.kind} ${doc.urgent ? 'urgent' : ''} ${doc.certified ? 'certified' : ''}`} key={doc.id}>
        {onClose && (
          <button class="doc-close" onClick={onClose} title="收起文書" data-testid="doc-close">
            ×
          </button>
        )}
        {doc.certified && <div class="cert-seal">確</div>}
        {audience && doc.fromLook !== undefined && doc.fromKind && (
          <div class="audience-banner">
            <HallScene />
            <div class="audience-figure">
              <Portrait look={doc.fromLook} kind={doc.fromKind} rank={doc.fromRank} size={110} />
            </div>
          </div>
        )}
        <header class="doc-head">
          {!audience && doc.fromLook !== undefined && doc.fromKind ? (
            <Portrait look={doc.fromLook} kind={doc.fromKind} rank={doc.fromRank} size={58} />
          ) : !audience ? (
            <span class="kseal big">{KIND_SEAL[doc.kind]}</span>
          ) : null}
          <div class="doc-head-text">
            <h2>
              {doc.urgent && <em class="fire">急</em>}
              {doc.title}
            </h2>
            <div class="doc-meta">
              <span>
                {KIND_NAME[doc.kind]}・{doc.fromLabel}
              </span>
              <span>
                {dateLabel(doc.sentTurn)}發 → {dateLabel(doc.arriveTurn)}到{travel > 0 && <b class="travel">（在途 {travel} 旬）</b>}
              </span>
              {doc.topicTitle && <span class="topic-chip">{doc.topicTitle}</span>}
            </div>
          </div>
        </header>

        {!doc.free && (
          <div class="slip" data-testid="slip">
            <div class="slip-head">內閣票擬</div>
            <p>
              <Gloss text={doc.summary} />
            </p>
            {doc.recommend && <p class="recommend">{doc.recommend}</p>}
          </div>
        )}

        {!doc.read && (
          <div class="read-cta">
            <p>以上為內閣摘要，全文或有票擬未載之處。</p>
            <button class="btn primary" data-testid="read" disabled={view.energy <= -3} onClick={() => act((s) => readDoc(s, doc.id))}>
              細讀全文（精力 1{view.energy <= 0 ? '・透支' : ''}）
            </button>
          </div>
        )}

        {doc.paras && (
          <div class="doc-body">
            {doc.paras.map((p, i) => (
              <div key={i} class={`para ${p.omitted ? 'missing' : ''} tag-${p.tag}`}>
                <p class="classic">
                  <Gloss text={p.text} />
                  {p.omitted && <span class="missing-tag">票擬未載</span>}
                </p>
                {plain && p.plain && (
                  <p class="plain">
                    <span>白話</span>
                    {p.plain}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {doc.claims && doc.claims.length > 0 && (
          <div class="claims">
            <span class="claims-head">此份所報</span>
            {doc.claims.map((c, i) => (
              <span key={i} class="claim">
                {c.label}：{typeof c.value === 'number' ? fmtNum(c.value, c.unit) : c.value}
              </span>
            ))}
          </div>
        )}

        {doc.battleId !== undefined && onBattle && (
          <div class="battle-cta">
            <button class="btn primary" onClick={() => onBattle(doc.battleId!)} data-testid="watch-battle">
              觀戰報（戰況動畫）
            </button>
          </div>
        )}
        {doc.lot && (
          <div class={`lot-line ${doc.lot.ok ? 'ok' : 'bad'}`}>
            擲籤：<b>{doc.lot.label}</b>（{doc.lot.ok ? '事成' : '不成'}）
          </div>
        )}
        {doc.delegatedBy && <div class="delegated">此奏由{doc.delegatedBy}便宜行事，所請將自行准行。</div>}
        {doc.request && <RequestBox doc={doc} act={act} over={!!state.over} />}
        {doc.task && <TaskBox doc={doc} view={view} act={act} />}
      </article>
    </div>
  );
}

function RequestBox({ doc, act, over }: { doc: DocView; act: Act; over: boolean }) {
  const req = doc.request!;
  const can = (!doc.decision || doc.decision === 'shelve') && !over;
  return (
    <div class="request">
      <div class="req-line">
        <span class="req-head">奏請</span>
        <Gloss text={req.desc} />
      </div>
      <div class="effects">
        <p>
          <b class="yes">准</b>
          {req.yes}
        </p>
        <p>
          <b class="no">駁</b>
          {req.no}
        </p>
      </div>
      {can && (
        <div class="vermilion-row">
          <button class="btn vermilion" data-testid="approve" onClick={() => act((s) => decide(s, doc.id, 'approve'))}>
            准
          </button>
          <button class="btn vermilion ghost" data-testid="reject" onClick={() => act((s) => decide(s, doc.id, 'reject'))}>
            駁
          </button>
          {doc.decision !== 'shelve' && (
            <button class="btn ghost" onClick={() => act((s) => decide(s, doc.id, 'shelve'))}>
              留中不發
            </button>
          )}
          <span class="hint">硃批不耗精力；批覆也要在驛路上走。</span>
        </div>
      )}
      {doc.decision && doc.decision !== 'shelve' && <div class="stamp">{DECISION_TEXT[doc.decision]}</div>}
      {doc.decision === 'shelve' && <div class="hint">此奏已留中，可隨時再批。</div>}
    </div>
  );
}

function TaskBox({ doc, view, act }: { doc: DocView; view: PlayerView; act: Act }) {
  const t = doc.task!;
  const [pick, setPick] = useState<string | null>(null);
  const expired = !t.chosen && view.turn > t.deadline;
  const locked = !doc.read && !doc.free;
  const rec = t.choices.find((c) => c.id === t.recommend);
  const fallback = t.choices.find((c) => c.id === t.fallback);
  const chosen = t.choices.find((c) => c.id === t.chosen);
  return (
    <div class="task">
      <div class="task-head">
        <span class="req-head">聖裁</span>
        {t.chosen ? (
          <span>
            已裁決：<b>{chosen?.label}</b>
          </span>
        ) : expired ? (
          <span>已逾期，依例「{fallback?.label}」。</span>
        ) : (
          <span class="hint">
            限 {shortDate(t.deadline)} 前裁決；逾期依例「{fallback?.label}」。
          </span>
        )}
      </div>
      {t.delegate && !t.chosen && !expired && (
        <div class="delegated">
          <b>{t.delegate.by}</b> 擬：「{t.delegate.label}」（{t.delegate.why}）——本旬退朝時照此辦理。若要駁回改批，{locked ? '請先細讀全文（精力 1），再選別的辦法' : '直接選別的辦法'}。
        </div>
      )}
      {locked && !t.chosen && !expired && (
        <div class="delegate">
          <span>未曾細讀，只能依內閣票擬辦理；要親自裁奪其他辦法，請先細讀全文（精力 1）。</span>
          {rec && (
            <button
              class="btn primary"
              data-testid="follow-advice"
              onClick={() => {
                act((s) => choose(s, doc.id, rec.id));
              }}
            >
              依票擬：{rec.label}
            </button>
          )}
        </div>
      )}
      <div class={`choices ${locked ? 'locked' : ''}`}>
        {t.choices.map((c) => {
          const cost = [c.silver ? `國庫 ${c.silver} 萬兩` : '', c.grain ? `糧 ${c.grain} 萬石` : '', c.privy ? `內帑 ${c.privy} 萬兩` : '', c.energy ? `精力 ${c.energy}` : ''].filter(Boolean).join('・');
          return (
            <button
              key={c.id}
              class={`choice ${pick === c.id ? 'on' : ''} ${t.chosen === c.id ? 'chosen' : ''}`}
              disabled={!!t.chosen || expired || (locked && c.id !== t.recommend)}
              onClick={() => setPick(pick === c.id ? null : c.id)}
              data-choice={c.id}
            >
              <b>
                {c.label}
                {c.id === t.recommend && <small class="rec">票擬</small>}
              </b>
              {cost && <span class="cost">{cost}</span>}
              {c.odds !== undefined && <span class={`odds o${oddsTier(c.odds)}`}>勝算：{oddsText(c.odds)}</span>}
              <span class="note">{c.note}</span>
              {c.status && STATUS_DEFS[c.status] && <span class="status-chip">狀態「{STATUS_DEFS[c.status].name}」{STATUS_DEFS[c.status].turns < 99 ? `${STATUS_DEFS[c.status].turns}旬` : ''}</span>}
            </button>
          );
        })}
      </div>
      {pick && !t.chosen && (
        <div class="vermilion-row">
          <button
            class="btn vermilion"
            data-testid="confirm-choice"
            onClick={() => {
              act((s) => choose(s, doc.id, pick));
              setPick(null);
            }}
          >
            硃筆定奪
          </button>
          <button class="btn ghost" onClick={() => setPick(null)}>
            再想想
          </button>
        </div>
      )}
      {t.chosen && <div class="stamp small">定</div>}
    </div>
  );
}
