import { useState } from 'preact/hooks';
import { dateLabel, seasonOf, shortDate } from '../core/calendar';
import { summon } from '../core/actions';
import { REGIONS } from '../core/geography';
import type { CharId, GameState, RegionId } from '../core/types';
import { playerView, PRESTIGE_TEXT, SPEECH_TEXT, type CharView, type PlayerView } from '../core/view';
import type { Act } from './App';
import { Icon, StudyBackdrop } from './art/Scenery';
import { AudienceModal } from './Audience';
import { BattleModal } from './Battle';
import { CourtModal, FactionBar, OfficialCard } from './Court';
import { DocPane } from './DocView';
import { EdictModal, type EdictInit } from './EdictModal';
import { collectEvents, EventModal, type GameEvent } from './EventModal';
import { FinanceModal } from './Finance';
import { ForeignModal, PowerPanel } from './Foreign';
import { HaremModal } from './Harem';
import { Help } from './Help';
import { Inbox, isTodo } from './Inbox';
import { MapView } from './MapView';
import { ArmyPanel, MilitaryModal } from './Military';
import { EmperorFace, PalaceModal } from './Palace';
import { AgendaPanel, BeliefPanel, LogPanel, RegionPanel } from './Panels';

type Tab = 'region' | 'army' | 'people' | 'transit' | 'beliefs' | 'log';
const TABS: [Tab, string][] = [
  ['region', '地方'],
  ['army', '部隊'],
  ['people', '人物'],
  ['transit', '行程'],
  ['beliefs', '心證'],
  ['log', '起居注'],
];
const SEASON_TEXT = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' } as const;
type Modal = null | 'court' | 'military' | 'foreign' | 'harem' | 'palace' | 'build' | 'finance' | 'grand' | 'help';

const BAR: [EdictInit['cat'], string, string][] = [
  ['mil', '軍務', '虎'],
  ['hr', '人事', '吏'],
  ['fin', '財計', '算'],
  ['dip', '外交', '節'],
  ['dc', '密偵', '廠'],
  ['pal', '內廷', '鳳'],
  ['grand', '大計', '璽'],
  ['local', '地方', '方'],
];

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
  const [armyId, setArmyId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('region');
  const [modal, setModal] = useState<Modal>(null);
  const [edict, setEdict] = useState<EdictInit | null>(null);
  const [battle, setBattle] = useState<number | null>(null);
  const [asking, setAsking] = useState<CharView | null>(null);
  const [lastTurn, setLastTurn] = useState(view.turn);
  const [known, setKnown] = useState<string[]>(() => view.cases.map((c) => c.uid));
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [eventIdx, setEventIdx] = useState(0);

  if (lastTurn !== view.turn) {
    setLastTurn(view.turn);
    const fresh = view.inbox.filter((d) => d.isNew);
    setDocId(null);
    const newCases = view.cases.filter((c) => !known.includes(c.uid));
    setKnown(view.cases.map((c) => c.uid));
    const due = view.inbox.filter((d) => d.task && !d.task.chosen && !d.task.delegate && d.task.deadline === view.turn && !d.isNew);
    setEvents(collectEvents(fresh, newCases, due));
    setEventIdx(0);
  }

  const doc = view.inbox.find((d) => d.id === docId) ?? null;
  const pending = view.inbox.filter((d) => isTodo(d, view.turn)).length;
  const season = seasonOf(view.turn);
  const army = view.armies.find((a) => a.id === armyId) ?? null;
  const battleRec = battle !== null ? view.battles.find((b) => b.id === battle) ?? null : null;

  const pickRegion = (r: RegionId) => {
    setRegion(r);
    setTab('region');
  };
  const pickArmy = (id: number) => {
    setArmyId(id);
    setTab('army');
    setModal(null);
  };
  const openEdict = (i: EdictInit) => {
    setEdict(i);
    setModal(null);
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
  const askChar = (id: string) => {
    const c = view.chars.find((x) => x.id === id);
    if (c) setAsking(c);
  };

  const candles = [];
  for (let i = -3; i < view.energyMax; i++) {
    const lit = i < view.energy;
    candles.push(<i key={i} class={`${i < 0 ? 'debt' : ''} ${lit ? 'on' : ''} ${i < 0 && view.energy <= i ? 'burnt' : ''}`} />);
  }

  return (
    <div class={`game v1 season-${season}`}>
      <StudyBackdrop />
      <header class="topbar">
        <div class="seal">天聽</div>
        <div class="date">
          <b>{dateLabel(view.turn)}</b>
          <span>
            {SEASON_TEXT[season]}・第 {view.turn + 1} / {view.maxTurn} 旬{view.capital !== 'jingshi' ? '・行在南京' : ''}
          </span>
        </div>
        <button class="emperor-btn" onClick={() => setModal('palace')} title="內廷：龍顏、聖躬、勞損、消遣" data-testid="open-palace">
          <EmperorFace view={view} size={34} />
          <span>
            <small>龍顏</small>
            <b class={`mood-text b${view.palace.moodBand}`}>{view.palace.ill ? view.palace.ill.text : view.palace.moodText}</b>
          </span>
        </button>
        <div class="res energy" title={`精力：細讀 1、小詔 1、大詔 2、召見 2；每旬只回復約 ${view.regen}，可透支到 −3（紅燭），透支會累積勞損。勞損：${view.fatigue.text}`}>
          <Icon name="energy" />
          <span class="candles v1c">{candles}</span>
          <span class={`fatigue f${view.fatigue.band}`}>{view.fatigue.text}</span>
        </div>
        <div class="res clickable" title="戶部奏報的國庫存銀（晚一旬；閹黨戶部會灌水）" onClick={() => setModal('finance')}>
          <Icon name="silver" />
          <span>
            <small>國庫</small>
            <span class="num">
              <b>{Math.round(view.treasury)}</b>萬
            </span>
          </span>
        </div>
        <div class="res clickable" title="太倉存糧（晚一旬）" onClick={() => setModal('finance')}>
          <Icon name="grain" />
          <span>
            <small>太倉</small>
            <span class="num">
              <b>{Math.round(view.grain)}</b>萬石
            </span>
          </span>
        </div>
        <div class="res" title="內帑：皇帝私財（準確）">
          <Icon name="privy" />
          <span>
            <small>內帑</small>
            <span class="num">
              <b>{Math.round(view.privy)}</b>萬
            </span>
          </span>
        </div>
        <div class="res" title="朝望：太低時處置權臣、藩王會受阻；歸零被廢。言路：越閉塞，彈章越少、地方越敢粉飾。">
          <Icon name="prestige" />
          <span>
            <b class={`band b${view.prestigeBand}`}>{PRESTIGE_TEXT[view.prestigeBand]}</b>
            <small class={`band b${view.speechBand}`}>{SPEECH_TEXT[view.speechBand]}</small>
          </span>
        </div>
        <button class="res faction-res clickable" onClick={() => setModal('court')} title="朝局天平（點開朝局）" data-testid="open-court">
          <small>朝局</small>
          <FactionBar view={view} compact />
        </button>
        <div class="spacer" />
        <button class={`btn ghost toggle ${plain ? 'on' : ''}`} onClick={onTogglePlain} data-testid="plain" title="白話翻譯開關">
          白
        </button>
        <button class="btn ghost" onClick={() => setModal('grand')} data-testid="open-grand">
          大計
        </button>
        <button class="btn ghost" onClick={() => setModal('help')}>
          玩法
        </button>
        <button class="btn ghost" onClick={onMenu}>
          選單
        </button>
        <button class="btn gong" onClick={onEndTurn} data-testid="end-turn">
          退朝{pending ? <small>（{pending} 件待辦）</small> : null}
        </button>
      </header>
      {view.statuses.length > 0 && (
        <div class="status-row">
          {view.statuses.map((s) => (
            <span key={s.id} class={`status ${s.good ? 'good' : 'bad'}`} title={s.desc}>
              {s.name}
              {s.left < 99 && <small>{s.left}旬</small>}
            </span>
          ))}
        </div>
      )}

      <main class="layout v1l">
        <Inbox docs={view.inbox} cases={view.cases} selected={docId} onSelect={setDocId} turn={view.turn} />

        <section class="center">
          <MapView view={view} selected={region} selectedArmy={armyId} onSelect={pickRegion} onSelectArmy={pickArmy} />
          {doc && (
            <div class="doc-overlay">
              <DocPane doc={doc} state={state} view={view} act={act} onBattle={setBattle} onClose={() => setDocId(null)} />
            </div>
          )}
        </section>

        <aside class="side">
          <nav class="tabs">
            {TABS.map(([k, label]) => (
              <button key={k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-tab={k}>
                {label}
                {k === 'beliefs' && view.cases.some((c) => !view.beliefs[c.uid]) ? <i class="dot-badge" /> : null}
                {k === 'transit' && view.agenda.some((a) => a.turn <= view.turn + 1 && a.kind !== 'calendar') ? <i class="dot-badge blue" /> : null}
              </button>
            ))}
          </nav>
          <div class="panel">
            {tab === 'region' &&
              (REGIONS[region].kind === 'outer' && view.regions[region].owner !== 'crown' ? (
                <PowerPanel p={view.powers.find((p) => p.id === view.regions[region].owner)!} act={act} onEdict={openEdict} />
              ) : (
                <RegionPanel key={region} view={view} region={region} state={state} act={act} onOpenDoc={setDocId} onOpenBuild={() => setModal('build')} onEdict={openEdict} onArmy={pickArmy} />
              ))}
            {tab === 'army' &&
              (army ? (
                <ArmyPanel state={state} view={view} army={army} act={act} onEdict={openEdict} />
              ) : (
                <div class="army-list">
                  <p class="muted small">點輿圖上的官軍棋子，或從下列部隊中選一支。</p>
                  {view.armies.map((a) => (
                    <button key={a.id} class="chip" onClick={() => pickArmy(a.id)}>
                      {a.label}・{REGIONS[a.region].name}
                    </button>
                  ))}
                </div>
              ))}
            {tab === 'people' && (
              <div class="people">
                <button class="btn small" onClick={() => setModal('court')}>
                  打開朝局（授權、任免）
                </button>
                {view.officials
                  .filter((o) => !o.id.startsWith('gov:'))
                  .map((o) => (
                    <OfficialCard key={o.id} o={o} act={act} onSummon={askChar} onEdict={openEdict} />
                  ))}
              </div>
            )}
            {tab === 'transit' && <AgendaPanel view={view} onOpenDoc={setDocId} />}
            {tab === 'beliefs' && <BeliefPanel view={view} state={state} act={act} />}
            {tab === 'log' && <LogPanel view={view} />}
          </div>
        </aside>
      </main>

      <footer class="edict-bar">
        <span class="bar-title">詔書</span>
        {BAR.map(([cat, label, seal]) => (
          <button key={cat} class="bar-btn" onClick={() => openEdict({ cat })} data-bar={cat}>
            <span class="cat-seal">{seal}</span>
            {label}
          </button>
        ))}
        <span class="bar-sep" />
        <button class="bar-btn" onClick={() => setModal('military')} data-testid="open-military">
          軍務總覽
        </button>
        <button class="bar-btn" onClick={() => setModal('foreign')} data-testid="open-foreign">
          四夷
        </button>
        <button class="bar-btn" onClick={() => setModal('harem')} data-testid="open-harem">
          後宮
        </button>
        <span class="spacer" />
        <button class="bar-btn" onClick={() => setTab('transit')}>
          在途詔書 {view.orderLog.filter((o) => !o.applied).length + view.orders.filter((o) => !o.delivered).length} 道
        </button>
      </footer>

      {modal === 'help' && <Help onClose={() => setModal(null)} />}
      {modal === 'court' && <CourtModal view={view} act={act} onClose={() => setModal(null)} onSummon={askChar} onEdict={openEdict} />}
      {modal === 'military' && <MilitaryModal view={view} onClose={() => setModal(null)} onArmy={pickArmy} onEdict={openEdict} />}
      {modal === 'foreign' && <ForeignModal view={view} act={act} onClose={() => setModal(null)} onEdict={openEdict} />}
      {modal === 'harem' && <HaremModal view={view} act={act} onClose={() => setModal(null)} />}
      {(modal === 'palace' || modal === 'build') && <PalaceModal view={view} act={act} initial={modal === 'build' ? 'build' : 'life'} onClose={() => setModal(null)} />}
      {modal === 'grand' && <GrandModal view={view} onClose={() => setModal(null)} onEdict={openEdict} />}
      {modal === 'finance' && (
        <FinanceModal
          view={view}
          onClose={() => setModal(null)}
          onRegion={(r) => {
            pickRegion(r);
            setModal(null);
          }}
        />
      )}
      {edict && <EdictModal state={state} view={view} act={act} init={edict} onClose={() => setEdict(null)} />}
      {eventIdx < events.length && !battleRec && (
        <EventModal
          events={events}
          index={eventIdx}
          view={view}
          act={act}
          onNext={() => setEventIdx(eventIdx + 1)}
          onSkipAll={() => setEventIdx(events.length)}
          onOpen={(id) => {
            setDocId(id);
            setEventIdx(eventIdx + 1);
          }}
          onBattle={(id) => setBattle(id)}
        />
      )}
      {battleRec && <BattleModal rec={battleRec} onClose={() => setBattle(null)} />}
      {asking && (
        <AudienceModal
          who={asking}
          cases={view.cases}
          energy={view.energy + 3}
          onAsk={doSummon}
          getDoc={(id) => playerView(state).inbox.find((d) => d.id === id) ?? null}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  );
}

function GrandModal({ view, onClose, onEdict }: { view: PlayerView; onClose: () => void; onEdict: (i: EdictInit) => void }) {
  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="modal grand-modal paper" onClick={(e) => e.stopPropagation()} data-testid="grand-modal">
        <header class="modal-head">
          <h2>大　計</h2>
          <span class="muted">
            第 {view.turn + 1} / {view.maxTurn} 旬・{shortDate(view.turn)}
          </span>
          <button class="btn ghost" onClick={onClose}>
            退出
          </button>
        </header>
        <section>
          <h3>開局三問</h3>
          <ol class="three">
            <li class={view.dongchang === 'crown' ? 'done' : ''}>東廠不在朕手：{view.dongchang === 'crown' ? '已奪回，密報確實。' : '奪回之前，密報都可能被過濾。（罷黜或扳倒權閹，或在朝望高時任命自己的人為東廠提督）'}</li>
            <li class={view.treasury >= 150 ? 'done' : ''}>國庫將盡：據報國庫約 {Math.round(view.treasury)} 萬。開源（抄家、礦稅、開海、清丈……）或節流（點驗京營空額、裁驛、減宗祿）。</li>
            <li>陝西不靖：闖營是否已平？看輿圖上陝西一帶的敵情與奏報。</li>
          </ol>
        </section>
        <section>
          <h3>中興之路</h3>
          <p class="muted small">第七十二旬以後，下列各項連續六旬都達成，即為「中興」。以下是你所知的情況（「？」表示只能依奏報判斷）。</p>
          <ul class="zx">
            {view.zhongxing.map((z) => (
              <li key={z.label} class={z.ok === null ? 'unk' : z.ok ? 'done' : ''}>
                <b>{z.ok === null ? '？' : z.ok ? '✓' : '✗'}</b> {z.label}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>結局</h3>
          <p class="small">中興（提前結束）・守成（撐滿五年）・偏安（南遷後撐滿五年）・亡國（京師陷落、京營譁變、京師大饑、天子被擒）・駕崩（病篤、遇刺）・被廢（宮變、朝望歸零）。</p>
          <div class="chips">
            <button class="chip" onClick={() => onEdict({ edict: 'contrition' })}>
              罪己詔
            </button>
            <button class="chip" onClick={() => onEdict({ edict: 'amnesty' })}>
              大赦
            </button>
            <button class="chip" onClick={() => onEdict({ edict: 'lecture' })}>
              經筵
            </button>
            <button class="chip warn" onClick={() => onEdict({ edict: 'south' })}>
              南遷…
            </button>
            <button class="chip warn" onClick={() => onEdict({ edict: 'flee' })}>
              出奔…
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

