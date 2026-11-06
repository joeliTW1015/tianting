import { useState } from 'preact/hooks';
import { issueOrder, orderOptions, setBelief, setNote, setTrust, type OrderOption } from '../core/actions';
import { dateLabel, shortDate } from '../core/calendar';
import { SUMMONABLE } from '../core/court';
import { REGIONS, regionName, travelTurns } from '../core/geography';
import { UNITS } from '../core/war';
import type { EdictInit } from './EdictModal';
import { shoufuOptions } from '../core/scoring';
import type { GameState, RegionId, Trust } from '../core/types';
import type { CharView, KnownFact, PlayerView } from '../core/view';
import type { Act } from './App';
import { Portrait } from './art/Portrait';
import { fmtNum } from './DocView';
import { ratioColor, Sparkline } from './charts';

// ───────────────────────── 地方 ─────────────────────────

interface RegionProps {
  view: PlayerView;
  region: RegionId;
  state: GameState;
  act: Act;
  onOpenDoc: (id: number) => void;
  onOpenBuild: () => void;
  onEdict: (i: EdictInit) => void;
  onArmy: (id: number) => void;
}

export function RegionPanel({ view, region, state, act, onOpenDoc, onOpenBuild, onEdict, onArmy }: RegionProps) {
  const rv = view.regions[region];
  const [pendingOpt, setPendingOpt] = useState<OrderOption | null>(null);
  const options = REGIONS[region].kind === 'outer' ? [] : orderOptions(state, region);
  const here = view.armies.filter((a) => a.region === region);
  const generic = options.filter((o) => !o.caseId);
  const byCase = view.cases.filter((c) => options.some((o) => o.caseId === c.uid));
  const groups = groupFacts(rv.facts);
  const age = rv.lastNews === null ? null : view.turn - rv.lastNews;
  const g = rv.gov;

  const orderBtn = (o: OrderOption) => (
    <button
      key={o.kind + (o.person ?? '') + (o.caseId ?? '')}
      class={`order ${pendingOpt?.label === o.label ? 'on' : ''} ${o.issued ? 'issued' : ''}`}
      disabled={o.issued}
      onClick={() => setPendingOpt(pendingOpt?.label === o.label ? null : o)}
      data-order={o.kind}
    >
      <b>{o.label}</b>
      <span>{o.issued ? '本旬已下旨' : costText(o)}</span>
    </button>
  );

  return (
    <div class="region-panel">
      <div class="panel-head">
        {REGIONS[region].kind !== 'outer' ? <Portrait look={g.look} kind={g.kind} rank={g.rank} size={46} /> : <span class="kseal big">疆</span>}
        <div>
          <h3>
            {regionName(region)}
            <small>
              {REGIONS[region].kind === 'border' ? '邊鎮' : REGIONS[region].kind === 'capital' ? '京畿' : REGIONS[region].kind === 'outer' ? '新附之地' : '行省'}・驛路 {travelTurns(state, region)} 旬・控制度 {rv.control}
            </small>
          </h3>
          <span class="muted small">
            {REGIONS[region].kind === 'outer' ? rv.ownerName : `${REGIONS[region].gov}・${g.name}${g.term > 1 ? '（新任）' : ''}`}
            ｜{region === view.capital ? '天子腳下' : age === null ? '尚無消息' : `最後消息發於${shortDate(rv.lastNews!)}（${age} 旬前）`}
          </span>
        </div>
      </div>

      {rv.troops && (
        <div class={`troops-line ${rv.troops.certified ? 'sure' : ''}`}>
          兵數：{rv.troops.certified ? '〔確〕' : '據報'} {fmtNum(rv.troops.value, '人')}（{rv.troops.source}・{shortDate(rv.troops.turn)}）
          {REGIONS[region].gunit && <span class="muted">・駐軍{UNITS[REGIONS[region].gunit]?.name}</span>}
        </div>
      )}
      {here.length > 0 && (
        <div class="here-armies">
          {here.map((a) => (
            <button key={a.id} class="chip strong" onClick={() => onArmy(a.id)}>
              {a.label}（{fmtNum(a.reported, '')}・{a.morale}）
            </button>
          ))}
        </div>
      )}
      {REGIONS[region].kind !== 'outer' && (
        <div class="quick-edicts">
          <button class="chip" onClick={() => onEdict({ edict: 'recruit', target: region })}>
            徵兵
          </button>
          {REGIONS[region].elite && (
            <button class="chip" onClick={() => onEdict({ edict: 'elite', target: region })}>
              募{UNITS[REGIONS[region].elite!].name}
            </button>
          )}
          <button class="chip" onClick={() => onEdict({ edict: 'sendJingying', target: region })}>
            發京營
          </button>
          <button class="chip" onClick={() => onEdict({ edict: 'relief', target: region })}>
            賑濟
          </button>
          <button class="chip" onClick={() => onEdict({ edict: 'remit', target: region })}>
            蠲免
          </button>
          <button class="chip" onClick={() => onEdict({ edict: 'audit', target: region })}>
            點驗
          </button>
          <button class="chip" onClick={() => onEdict({ edict: 'walls', target: region })}>
            築城
          </button>
          <button class="chip" onClick={() => onEdict({ edict: 'appoint', target: `gov:${region}` })}>
            任免長官
          </button>
        </div>
      )}
      {REGIONS[region].kind === 'outer' && rv.owner === 'crown' && (
        <div class="quick-edicts">
          <button class="chip" onClick={() => onEdict({ edict: 'settle', target: region })}>
            設官治理
          </button>
        </div>
      )}
      {rv.held && (
        <div class="held-banner">
          <b>據報已陷於{rv.held}</b>
          <span>當地不繳錢糧、長官無從上奏。須派兵擊退或殲滅敵軍，方能收復。</span>
        </div>
      )}
      {rv.foe && !rv.held && (
        <div class="foe-banner">
          據{rv.foe.source}（{shortDate(rv.foe.turn)}）：境內或邊外有敵軍約 {Math.round(rv.foe.size / 1000)} 千
        </div>
      )}
      {region === view.capital && (
        <div class="capital-build">
          <span>京師營建</span>
          <span class="muted small">
            已成 {view.palace.projects.filter((p) => p.status === 'done').length} 項
            {view.palace.projects.some((p) => p.status === 'building') ? `・興建中：${view.palace.projects.find((p) => p.status === 'building')!.name}` : ''}
          </span>
          <button class="chip strong" onClick={onOpenBuild} data-testid="open-build">
            工部營建
          </button>
        </div>
      )}
      {REGIONS[region].tax > 0 && (
        <div class="region-fin">
          <span>錢糧實解</span>
          {view.finance.regionTax[region].length ? (
            <>
              <Sparkline values={view.finance.regionTax[region].map((x) => x.value)} base={REGIONS[region].tax} width={150} height={30} color={ratioColor(view.finance.regionTax[region].slice(-1)[0].value / REGIONS[region].tax)} />
              <b>
                {view.finance.regionTax[region].slice(-1)[0].value} / {REGIONS[region].tax} 萬兩
              </b>
              <span class="muted small">（虛線為應解）</span>
            </>
          ) : (
            <span class="muted small">尚無總冊</span>
          )}
        </div>
      )}
      {groups.length > 0 ? (
        <table class="facts">
          <tbody>
            {groups.map((gr) => (
              <tr key={gr.key}>
                <td>
                  {gr.label}
                  {gr.conflict && <span class="conflict">說法不一</span>}
                </td>
                <td>
                  {gr.items.slice(0, 4).map((f, i) => (
                    <button key={i} class="fact" onClick={() => onOpenDoc(f.docId)} title="開啟原文書">
                      <b>{typeof f.value === 'number' ? fmtNum(f.value, f.unit) : f.value}</b>
                      <span>
                        {f.source}・{shortDate(f.sentTurn)}
                      </span>
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="muted small">細讀過的文書中，關於此地的數字與說法會整理在這裡，方便比對。</p>
      )}

      {byCase.map((c) => (
        <div key={c.uid} class="case-orders">
          <h4>{c.title}</h4>
          <div class="orders">{options.filter((o) => o.caseId === c.uid).map(orderBtn)}</div>
        </div>
      ))}
      {generic.length > 0 && <h4>地方旨意</h4>}
      <div class="orders">{generic.map(orderBtn)}</div>
      {pendingOpt && (
        <div class="confirm">
          <p>{pendingOpt.desc}</p>
          <button
            class="btn vermilion"
            data-testid="confirm-order"
            onClick={() => {
              act((s) => issueOrder(s, pendingOpt));
              setPendingOpt(null);
            }}
          >
            用璽下旨
          </button>
          <button class="btn ghost" onClick={() => setPendingOpt(null)}>
            作罷
          </button>
        </div>
      )}

      <h4>御筆札記</h4>
      <textarea class="note" placeholder="記下你對此地的判斷、疑點……（不耗精力）" value={rv.note} onInput={(e) => act((s) => setNote(s, region, (e.target as HTMLTextAreaElement).value))} />
    </div>
  );
}

function costText(o: OrderOption): string {
  const parts = [`精力${o.energy}`];
  if (o.silver) parts.push(`銀${o.silver}萬`);
  if (o.troops) parts.push(`京營${o.troops / 10000}萬`);
  return parts.join('・');
}

interface FactGroup {
  key: string;
  label: string;
  items: KnownFact[];
  conflict: boolean;
}

function groupFacts(facts: KnownFact[]): FactGroup[] {
  const map = new Map<string, FactGroup>();
  for (const f of facts) {
    if (f.key.startsWith('guilt.') || f.key.startsWith('tax.')) continue;
    const g = map.get(f.key) ?? { key: f.key, label: f.label, items: [], conflict: false };
    g.items.push(f);
    map.set(f.key, g);
  }
  // 「說法不一」：三旬之內、不同來源的說法對不上（同一來源隨時間變化不算）
  const differ = (a: KnownFact, b: KnownFact) =>
    typeof a.value === 'number' && typeof b.value === 'number' ? Math.max(a.value, b.value) / Math.max(0.1, Math.min(a.value, b.value)) > 1.4 : a.value !== b.value;
  for (const g of map.values()) {
    const recent = g.items.slice(0, 6);
    g.conflict = recent.some((a, i) => recent.some((b, j) => j > i && a.source !== b.source && Math.abs(a.sentTurn - b.sentTurn) <= 3 && differ(a, b)));
  }
  return [...map.values()];
}

// ───────────────────────── 人物 ─────────────────────────

const TRUST_TEXT: Record<Trust, string> = { trust: '可信', doubt: '存疑', distrust: '不可信' };

export function PeoplePanel({ view, act, onOpenDoc, onSummon }: { view: PlayerView; act: Act; onOpenDoc: (id: number) => void; onSummon: (c: CharView) => void }) {
  const capital = view.chars.filter((c) => SUMMONABLE.includes(c.id));
  const govs = view.chars.filter((c) => c.id.startsWith('gov:'));
  const others = view.chars.filter((c) => !SUMMONABLE.includes(c.id) && !c.id.startsWith('gov:'));

  const card = (c: CharView) => {
    const latest = view.inbox.find((d) => d.from === c.id);
    return (
      <div key={c.id} class={`person trust-${c.trust ?? 'none'}`}>
        <Portrait look={c.look} kind={c.kind} rank={c.rank} size={44} />
        <div class="person-body">
          <div class="person-main">
            <b>{c.name}</b>
            <span class="muted small">
              {c.title}
              {c.term > 1 ? '（新任）' : ''}・來文 {c.docCount}
            </span>
          </div>
          <div class="person-actions">
            {(['trust', 'doubt', 'distrust'] as Trust[]).map((t) => (
              <button key={t} class={`tag t-${t} ${c.trust === t ? 'on' : ''}`} onClick={() => act((s) => setTrust(s, c.id, c.trust === t ? undefined : t))}>
                {TRUST_TEXT[t]}
              </button>
            ))}
            {latest && (
              <button class="chip" onClick={() => onOpenDoc(latest.id)}>
                最近來文
              </button>
            )}
            {SUMMONABLE.includes(c.id) && (
              <button class="chip strong" onClick={() => onSummon(c)} data-summon={c.id}>
                召見
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div class="people">
      <h4>在京大臣（可召見，精力 2）</h4>
      {capital.map(card)}
      {others.length > 0 && <h4>涉事之人</h4>}
      {others.map(card)}
      <h4>各地長官</h4>
      {govs.map(card)}
    </div>
  );
}

// ───────────────────────── 行程 ─────────────────────────

const AGENDA_ICON: Record<string, string> = { order: '旨', report: '報', arrival: '覲', army: '兵', project: '工', deadline: '限', calendar: '曆', palace: '宮' };

export function AgendaPanel({ view, onOpenDoc }: { view: PlayerView; onOpenDoc: (id: number) => void }) {
  const items = view.agenda;
  const turns = [...new Set(items.map((x) => x.turn))];
  const rel = (t: number) => (t === view.turn ? '本旬' : t === view.turn + 1 ? '下旬' : `${t - view.turn} 旬後`);
  return (
    <div class="agenda">
      <p class="muted small">已知會在未來發生、送達的事。標「約」者為估計，可能延誤，也可能根本不來。</p>
      {turns.length === 0 && <p class="empty-note">目前沒有已知的行程。</p>}
      {turns.map((t) => (
        <div key={t} class="agenda-day">
          <div class="agenda-date">
            <b>{rel(t)}</b>
            <span>{shortDate(t)}</span>
          </div>
          <ul>
            {items
              .filter((x) => x.turn === t)
              .map((x, i) => (
                <li key={i} class={`ag-${x.kind}`}>
                  {x.look !== undefined && x.charKind ? <Portrait look={x.look} kind={x.charKind} size={26} /> : <span class="ag-icon">{AGENDA_ICON[x.kind]}</span>}
                  {x.docId ? (
                    <button class="linkish" onClick={() => onOpenDoc(x.docId!)}>
                      {x.text}
                    </button>
                  ) : (
                    <span>{x.text}</span>
                  )}
                  {x.approx && <em>約</em>}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {view.orderLog.length > 0 && (
        <>
          <h4>詔書</h4>
          <ul class="transit">
            {view.orderLog.slice(0, 24).map((o) => (
              <li key={o.id} class={o.applied ? 'done' : ''}>
                <b>{o.label}</b>
                <span>
                  {shortDate(o.issued)}下・{o.applied ? '已生效' : o.arrive > view.turn ? `${shortDate(o.arrive)}送達・${shortDate(o.done)}完成` : `${shortDate(o.done)}完成`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {view.orders.length > 0 && (
        <>
          <h4>地方旨意</h4>
          <TransitPanel view={view} />
        </>
      )}
    </div>
  );
}

function TransitPanel({ view }: { view: PlayerView }) {
  return (
    <ul class="transit">
      {view.orders.slice(0, 20).map((o) => (
        <li key={o.id} class={o.delivered ? 'done' : ''}>
          <b>{o.label}</b>
          <span>
            {regionName(o.region)}・{shortDate(o.issuedTurn)}發・{o.delivered ? '應已送達' : `預計${shortDate(o.arriveTurn)}到`}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────── 心證 ─────────────────────────

export function BeliefPanel({ view, state, act }: { view: PlayerView; state: GameState; act: Act }) {
  const sOpts = shoufuOptions(state);
  return (
    <div class="beliefs">
      <p class="muted small">心證是你自己的判斷，不影響局勢；局終時史官會拿來與真相對照。這裡只列出你已經察覺的事——天下或許還有你不知道的事。</p>
      {view.cases.length === 0 && <p class="empty-note">目前尚未察覺任何大事。留意奏報中反覆出現的人與地。</p>}
      {view.cases.map((c) => (
        <div key={c.uid} class="belief">
          <div class="belief-q">
            <b>{c.title}</b>
            <span class="muted small">（{shortDate(c.firstSeen)}始聞）</span>
            <div>{c.question}</div>
          </div>
          <div class="belief-opts">
            {c.options.map((o) => (
              <button key={o.value} class={`tag ${view.beliefs[c.uid] === o.value ? 'on' : ''}`} onClick={() => act((s) => setBelief(s, c.uid, o.value))} data-belief={`${c.uid}:${o.value}`}>
                {o.label}
              </button>
            ))}
            <button class={`tag ${!view.beliefs[c.uid] ? 'on' : ''}`} onClick={() => act((s) => setBelief(s, c.uid, ''))}>
              未定
            </button>
          </div>
        </div>
      ))}
      <div class="belief">
        <div class="belief-q">
          <b>首輔票擬</b>
          <div>首輔的摘要可信嗎？他袒護誰？</div>
        </div>
        <div class="belief-opts">
          {sOpts.map((o) => (
            <button key={o.value} class={`tag ${view.beliefs.shoufu === o.value ? 'on' : ''}`} onClick={() => act((s) => setBelief(s, 'shoufu', o.value))}>
              {o.label}
            </button>
          ))}
          <button class={`tag ${!view.beliefs.shoufu ? 'on' : ''}`} onClick={() => act((s) => setBelief(s, 'shoufu', ''))}>
            未定
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── 起居注 ─────────────────────────

export function LogPanel({ view }: { view: PlayerView }) {
  if (view.log.length === 0) return <p class="muted small">起居注記錄你的每一道旨意、硃批與裁決。</p>;
  return (
    <ul class="log">
      {[...view.log].reverse().map((l, i) => (
        <li key={i}>
          <span class="muted">{dateLabel(l.turn)}</span> {l.text}
        </li>
      ))}
    </ul>
  );
}
