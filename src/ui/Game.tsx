import { useState } from 'preact/hooks';
import { dateLabel, seasonOf } from '../core/calendar';
import { summon } from '../core/actions';
import type { CharId, GameState, RegionId } from '../core/types';
import { playerView, PRESTIGE_TEXT, type CharView } from '../core/view';
import type { Act } from './App';
import { BrushRest, Candle, Icon, Inkstone, SealProp, StudyBackdrop, TeaCup, WindowView } from './art/Scenery';
import { AudienceModal } from './Audience';
import { DocPane } from './DocView';
import { collectEvents, EventModal, type GameEvent } from './EventModal';
import { FinanceModal } from './Finance';
import { ForeignModal } from './Foreign';
import { EmperorFace, PalaceModal } from './Palace';
import { Help } from './Help';
import { Inbox } from './Inbox';
import { MapView } from './MapView';
import { AgendaPanel, BeliefPanel, LogPanel, PeoplePanel, RegionPanel } from './Panels';

type Tab = 'region' | 'people' | 'transit' | 'beliefs' | 'log';
const TABS: [Tab, string][] = [
  ['region', '地方'],
  ['people', '人物'],
  ['transit', '行程'],
  ['beliefs', '心證'],
  ['log', '起居注'],
];
const SEASON_TEXT = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' } as const;
const TAX_TEXT = { light: '寬徵', normal: '照常', heavy: '加派' } as const;

interface Props {
  state: GameState;
  act: Act;
  onMenu: () => void;
  onEndTurn: () => void;
  plain: boolean;
  onTogglePlain: () => void;
}

export function GameScreen({ state, act, onMenu, onEndTurn, plain, onTogglePlain }: Props) {
  const view = playerView(state);
  const [docId, setDocId] = useState<number | null>(() => view.inbox.find((d) => d.kind === 'notice')?.id ?? null);
  const [region, setRegion] = useState<RegionId>('jingshi');
  const [tab, setTab] = useState<Tab>('region');
  const [help, setHelp] = useState(false);
  const [finance, setFinance] = useState(false);
  const [foreign, setForeign] = useState(false);
  const [palace, setPalace] = useState<null | 'life' | 'build'>(null);
  const [asking, setAsking] = useState<CharView | null>(null);
  const [lastTurn, setLastTurn] = useState(view.turn);
  const [known, setKnown] = useState<string[]>(() => view.cases.map((c) => c.uid));
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [eventIdx, setEventIdx] = useState(0);

  // 新的一旬：自動打開最緊急或第一份新文書，並把本旬大事做成彈窗
  if (lastTurn !== view.turn) {
    setLastTurn(view.turn);
    const fresh = view.inbox.filter((d) => d.isNew);
    setDocId((fresh.find((d) => d.urgent) ?? fresh[0])?.id ?? docId);
    const newCases = view.cases.filter((c) => !known.includes(c.uid));
    setKnown(view.cases.map((c) => c.uid));
    const due = view.inbox.filter((d) => d.task && !d.task.chosen && d.task.deadline === view.turn);
    setEvents(collectEvents(fresh, newCases, due));
    setEventIdx(0);
  }

  const doc = view.inbox.find((d) => d.id === docId) ?? null;
  const pending = view.inbox.filter((d) => (d.request && (!d.decision || d.decision === 'shelve')) || (d.task && !d.task.chosen && view.turn <= d.task.deadline)).length;
  const season = seasonOf(view.turn);

  const pickRegion = (r: RegionId) => {
    setRegion(r);
    setTab('region');
  };

  const doSummon = (who: CharId, topic: string): number | null => {
    let id: number | null = null;
    act((s) => {
      const err = summon(s, who, topic);
      if (!err) id = s.docs[s.docs.length - 1]?.id ?? null;
      return err;
    });
    return id;
  };

  return (
    <div class={`game season-${season}`}>
      <StudyBackdrop />
      <header class="topbar">
        <div class="seal">天聽</div>
        <div class="date">
          <b>{dateLabel(view.turn)}</b>
          <span>
            {SEASON_TEXT[season]}・第 {view.turn + 1} / {view.maxTurn} 旬
          </span>
        </div>
        <button class="emperor-btn" onClick={() => setPalace('life')} title="內廷：龍顏、聖躬、消遣、營建" data-testid="open-palace">
          <EmperorFace view={view} size={34} />
          <span>
            <small>龍顏</small>
            <b class={`mood-text b${view.palace.moodBand}`}>{view.palace.ill ? view.palace.ill.text : view.palace.moodText}</b>
          </span>
        </button>
        <div class="res energy" title={`精力：細讀 1、下旨 1、召見 2；每旬恢復。${view.palace.capReasons.length ? '本旬：' + view.palace.capReasons.join('；') : ''}`}>
          <Icon name="energy" />
          <span class="candles">
            {Array.from({ length: view.energyMax }, (_, i) => (
              <i key={i} class={i < view.energy ? 'on' : ''} />
            ))}
          </span>
        </div>
        <div class="res clickable" title="戶部奏報的國庫存銀（帳目晚一旬）。點擊開啟戶部帳冊" onClick={() => setFinance(true)}>
          <Icon name="silver" />
          <span>
            <small>國庫</small>
            <span class="num"><b>{Math.round(view.treasury)}</b>萬兩</span>
          </span>
        </div>
        <div class="res clickable" title="戶部奏報的太倉存糧（帳目晚一旬）。點擊開啟戶部帳冊" onClick={() => setFinance(true)}>
          <Icon name="grain" />
          <span>
            <small>太倉糧</small>
            <span class="num"><b>{Math.round(view.grain)}</b>萬石</span>
          </span>
        </div>
        <div class="res" title="皇帝私人的錢（內承運庫），數字是準確的">
          <Icon name="privy" />
          <span>
            <small>內帑</small>
            <span class="num"><b>{Math.round(view.privy)}</b>萬兩</span>
          </span>
        </div>
        <div class="res" title="在京兵力（出征者另計）">
          <Icon name="troops" />
          <span>
            <small>京營</small>
            <span class="num"><b>{(view.jingying / 10000).toFixed(1)}</b>萬</span>{view.inField ? <em>（出征{(view.inField / 10000).toFixed(1)}萬）</em> : null}
          </span>
        </div>
        <div class="res" title="朝野對你的信服。太低時處置權臣、藩王會受阻；歸零會被廢。">
          <Icon name="prestige" />
          <span>
            <small>朝望</small>
            <b class={`band b${view.prestigeBand}`}>{PRESTIGE_TEXT[view.prestigeBand]}</b>
          </span>
        </div>
        <div class="res" title="本期稅則">
          <Icon name="tax" />
          <span>
            <small>稅則</small>
            <b>{TAX_TEXT[view.taxPolicy]}</b>
            {view.borderArrears >= 1 ? <em>邊餉積欠</em> : null}
          </span>
        </div>
        <div class="spacer" />
        <button class={`btn ghost toggle ${plain ? 'on' : ''}`} onClick={onTogglePlain} data-testid="plain">
          白話{plain ? '：開' : '：關'}
        </button>
        <button class="btn ghost" onClick={() => setFinance(true)} data-testid="open-finance">
          帳冊
        </button>
        <button class="btn ghost" onClick={() => setForeign(true)} data-testid="open-foreign">
          四夷
        </button>
        <button class="btn ghost" onClick={() => setHelp(true)}>
          玩法
        </button>
        <button class="btn ghost" onClick={onMenu}>
          主選單
        </button>
        <button class="btn gong" onClick={onEndTurn} data-testid="end-turn">
          退朝{pending ? <small>（{pending} 件待辦）</small> : null}
        </button>
      </header>

      <main class="layout">
        <Inbox docs={view.inbox} cases={view.cases} selected={docId} onSelect={setDocId} turn={view.turn} />

        <section class="desk">
          <div class="desk-window">
            <WindowView season={season} />
            <div class="plaque">勤政親賢</div>
          </div>
          <div class="desk-surface">
            <div class="props">
              <div class="p-candle">
                <Candle lit={view.energy > 0} />
              </div>
              <div class="p-ink">
                <Inkstone />
              </div>
              <div class="p-tea">
                <TeaCup />
              </div>
              <div class="p-brush">
                <BrushRest />
              </div>
              <div class="p-seal">
                <SealProp />
              </div>
            </div>
            <DocPane doc={doc} state={state} view={view} act={act} />
          </div>
        </section>

        <aside class="side">
          <MapView view={view} selected={region} onSelect={pickRegion} />
          <nav class="tabs">
            {TABS.map(([k, label]) => (
              <button key={k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {label}
                {k === 'beliefs' && view.cases.some((c) => !view.beliefs[c.uid]) ? <i class="dot-badge" /> : null}
                {k === 'transit' && view.agenda.some((a) => a.turn <= view.turn + 1 && a.kind !== 'calendar') ? <i class="dot-badge blue" /> : null}
              </button>
            ))}
          </nav>
          <div class="panel">
            {tab === 'region' && <RegionPanel key={region} view={view} region={region} state={state} act={act} onOpenDoc={setDocId} onOpenBuild={() => setPalace('build')} />}
            {tab === 'people' && <PeoplePanel view={view} act={act} onOpenDoc={setDocId} onSummon={setAsking} />}
            {tab === 'transit' && <AgendaPanel view={view} onOpenDoc={setDocId} />}
            {tab === 'beliefs' && <BeliefPanel view={view} state={state} act={act} />}
            {tab === 'log' && <LogPanel view={view} />}
          </div>
        </aside>
      </main>
      {help && <Help onClose={() => setHelp(false)} />}
      {foreign && <ForeignModal view={view} act={act} onClose={() => setForeign(false)} />}
      {palace && <PalaceModal view={view} act={act} initial={palace} onClose={() => setPalace(null)} />}
      {finance && (
        <FinanceModal
          view={view}
          onClose={() => setFinance(false)}
          onRegion={(r) => {
            pickRegion(r);
            setFinance(false);
          }}
        />
      )}
      {eventIdx < events.length && (
        <EventModal
          events={events}
          index={eventIdx}
          onNext={() => setEventIdx(eventIdx + 1)}
          onSkipAll={() => setEventIdx(events.length)}
          onOpen={(id) => {
            setDocId(id);
            setEventIdx(eventIdx + 1);
          }}
        />
      )}
      {asking && (
        <AudienceModal
          who={asking}
          cases={view.cases}
          energy={view.energy}
          onAsk={doSummon}
          getDoc={(id) => playerView(state).inbox.find((d) => d.id === id) ?? null}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  );
}
