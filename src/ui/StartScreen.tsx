import { useMemo, useState } from 'preact/hooks';
import { dateLabel } from '../core/calendar';
import { reasonText } from '../core/scoring';
import { DIFFICULTY_NAME, PERKS, perkChoices, randomSeed } from '../core/setup';
import type { Difficulty, EndReason, GameState, PerkId } from '../core/types';
import { PalaceDawn } from './art/Scenery';
import { loadHistory } from './storage';

interface Props {
  saved: GameState | null;
  onStart: (seed: string, perk: PerkId, difficulty: Difficulty, skipIntro: boolean) => void;
  onContinue: () => void;
}

export function StartScreen({ saved, onStart, onContinue }: Props) {
  const [seed, setSeed] = useState(randomSeed);
  const choices = useMemo(() => perkChoices(seed), [seed]);
  const [perk, setPerk] = useState<PerkId | null>(null);
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [skip, setSkip] = useState(false);
  const history = useMemo(loadHistory, []);
  const chosen = perk && choices.includes(perk) ? perk : null;

  return (
    <div class="start">
      <div class="start-hero">
        <PalaceDawn />
        <div class="hero-title">
          <div class="seal big">天聽</div>
          <div>
            <h1>天　聽</h1>
            <p class="motto">天視自我民視，天聽自我民聽。——《尚書・泰誓》</p>
          </div>
        </div>
      </div>

      <div class="start-body">
        <section class="paper intro scroll">
          <p>大胤崇寧元年，先帝驟崩，十九歲的太子即位。國庫將盡，九邊欠餉，陝西大旱，闖營已起，建州坐大。</p>
          <p>
            先帝留下三股勢力：<b>掌司禮監與東廠的「九千歲」</b>、<b>覬覦大位的皇叔瑞王</b>、<b>以祖制約束你的太后與顧命老臣</b>。朝中閹黨、清流、齊楚浙、勳戚四派相爭。
          </p>
          <p>
            你讀奏摺（被動）、下詔書（主動）、任免大臣、設定授權、調兵遣將、與四夷周旋。每道詔書都要在驛路上走、要時間執行；每個數字都只是「據報」。<b>只有奪回東廠之後，密報才是確實的——但查得越多，越容易曝光。</b>
          </p>
          <p>精力不會回滿，可以透支，但會積勞成疾。五年（一百八十旬）之內：中興、守成、偏安、亡國、駕崩或被廢。</p>
          <p class="hint">提示：文書中加了虛線底的字詞可以點開白話解釋；右上角可以開關「白話」翻譯。</p>
        </section>

        <section class="setup paper">
          {saved && !saved.over && (
            <button class="btn primary wide" onClick={onContinue} data-testid="continue">
              繼續上一局（{dateLabel(saved.turn)}）
            </button>
          )}
          <h3>本局種子</h3>
          <div class="seed-row">
            <input value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value || '天聽')} aria-label="種子" />
            <button class="btn" onClick={() => setSeed(randomSeed())}>
              另擲
            </button>
          </div>
          <p class="hint">同一種子，天下大事與真相相同，可以和朋友比較結果。</p>
          <h3>難度</h3>
          <div class="perks diffs">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} class={`perk ${diff === d ? 'on' : ''}`} onClick={() => setDiff(d)} data-diff={d}>
                <b>{DIFFICULTY_NAME[d].name}</b>
                <span>{DIFFICULTY_NAME[d].desc}</span>
              </button>
            ))}
          </div>
          <h3>登基恩詔（三選一）</h3>
          <div class="perks">
            {choices.map((p) => (
              <button key={p} class={`perk ${chosen === p ? 'on' : ''}`} onClick={() => setPerk(p)} data-perk={p}>
                <b>{PERKS[p].name}</b>
                <span>{PERKS[p].desc}</span>
              </button>
            ))}
          </div>
          <label class="skip-intro">
            <input type="checkbox" checked={skip} onChange={() => setSkip(!skip)} /> 略過序章動畫
          </label>
          <button class="btn vermilion wide big" disabled={!chosen} onClick={() => chosen && onStart(seed, chosen, diff, skip)} data-testid="ascend">
            {chosen ? '登　基' : '請先選擇恩詔'}
          </button>
        </section>
      </div>

      {history.length > 0 && (
        <section class="history paper">
          <h3>史館・歷代帝王</h3>
          <table>
            <thead>
              <tr>
                <th>諡號</th>
                <th>結局</th>
                <th>在位</th>
                <th>判讀</th>
                <th>評分</th>
                <th>種子</th>
                <th>日期</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td class="ink">{h.posthumous}帝</td>
                  <td>
                    {h.ending ?? ''}・{reasonText(h.reason as EndReason)}
                  </td>
                  <td>{h.turn} 旬</td>
                  <td>
                    {h.correct}/{h.total ?? 5}
                  </td>
                  <td>{h.score}</td>
                  <td>{h.seed}</td>
                  <td>{h.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
