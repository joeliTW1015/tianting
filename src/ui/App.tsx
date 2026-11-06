import { createContext } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { dateLabel } from '../core/calendar';
import { chronicle } from '../core/scoring';
import { newRun } from '../core/setup';
import { advanceTurn } from '../core/tick';
import type { Difficulty, GameState, PerkId } from '../core/types';
import { playerView } from '../core/view';
import { NightPalace } from './art/Scenery';
import { ChronicleScreen } from './Chronicle';
import { GameScreen } from './Game';
import { endingSlides, introSlides, Slideshow } from './Slideshow';
import { StartScreen } from './StartScreen';
import { loadGame, loadPlain, pushHistory, saveGame, savePlain } from './storage';

export type Act = (fn: (s: GameState) => string | null | void) => void;

/** 白話註解開關 */
export const PlainCtx = createContext(true);

interface Transition {
  date: string;
  fresh: number;
  urgent: number;
}

type Phase = 'play' | 'intro' | 'ending' | 'chronicle';

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(() => loadGame());
  const [, setVer] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [plain, setPlain] = useState(loadPlain);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [phase, setPhase] = useState<Phase>('play');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setTransition(null), 1700);
    return () => clearTimeout(t);
  }, [transition]);

  const act: Act = (fn) => {
    if (!state) return;
    const err = fn(state);
    if (err) setToast(err);
    if (state.over) {
      pushHistory(state, chronicle(state));
      setToast(null);
      setPhase('ending');
    }
    saveGame(state.over ? null : state);
    setVer((v) => v + 1);
  };

  const endTurn = () => {
    act((s) => advanceTurn(s));
    if (!state || state.over) return;
    const v = playerView(state);
    const fresh = v.inbox.filter((d) => d.isNew);
    setTransition({ date: dateLabel(v.turn), fresh: fresh.length, urgent: fresh.filter((d) => d.urgent).length });
  };

  const start = (seed: string, perk: PerkId, difficulty: Difficulty, skipIntro: boolean) => {
    const s = newRun(seed, perk, { difficulty });
    saveGame(s);
    setSaved(null);
    setState(s);
    if (skipIntro) {
      setPhase('play');
      setTransition({ date: dateLabel(0), fresh: playerView(s).inbox.length, urgent: 0 });
    } else setPhase('intro');
  };

  const toMenu = () => {
    setSaved(loadGame());
    setState(null);
    setPhase('play');
  };

  const togglePlain = () => {
    savePlain(!plain);
    setPlain(!plain);
  };

  const chron = useMemo(() => (state?.over ? chronicle(state) : null), [state, state?.over]);

  let screen;
  if (!state) screen = <StartScreen saved={saved} onStart={start} onContinue={() => saved && (setState(saved), setPhase('play'))} />;
  else if (phase === 'intro')
    screen = (
      <Slideshow
        kind="intro"
        slides={introSlides(state)}
        onDone={() => {
          setPhase('play');
          setTransition({ date: dateLabel(0), fresh: playerView(state).inbox.length, urgent: 0 });
        }}
      />
    );
  else if (state.over && chron && phase === 'ending') screen = <Slideshow kind="ending" slides={endingSlides(state, chron)} onDone={() => setPhase('chronicle')} />;
  else if (state.over && chron) screen = <ChronicleScreen state={state} chron={chron} onMenu={toMenu} onReplay={() => setPhase('ending')} />;
  else screen = <GameScreen state={state} act={act} onMenu={toMenu} onEndTurn={endTurn} plain={plain} onTogglePlain={togglePlain} />;

  return (
    <PlainCtx.Provider value={plain}>
      {screen}
      {transition && state && !state.over && phase === 'play' && (
        <div class="transition" onClick={() => setTransition(null)} data-testid="transition">
          <NightPalace />
          <div class="transition-text">
            <p class="watch">更深漏盡，天將破曉</p>
            <h2>{transition.date}</h2>
            <p>
              新到文書 {transition.fresh} 件{transition.urgent ? `，其中飛報 ${transition.urgent} 件` : ''}
            </p>
          </div>
        </div>
      )}
      {toast && <div class="toast">{toast}</div>}
    </PlainCtx.Provider>
  );
}
