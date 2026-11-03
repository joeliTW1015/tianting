import { useMemo, useState } from 'preact/hooks';
import { dateLabel } from '../core/calendar';
import { reasonText } from '../core/scoring';
import { PERKS, perkChoices, randomSeed } from '../core/setup';
import type { EndReason, GameState, PerkId } from '../core/types';
import { PalaceDawn } from './art/Scenery';
import { loadHistory } from './storage';

interface Props {
  saved: GameState | null;
  onStart: (seed: string, perk: PerkId) => void;
  onContinue: () => void;
}

export function StartScreen({ saved, onStart, onContinue }: Props) {
  const [seed, setSeed] = useState(randomSeed);
  const choices = useMemo(() => perkChoices(seed), [seed]);
  const [perk, setPerk] = useState<PerkId | null>(null);
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
          <p>大胤崇寧元年，先帝驟崩，新君即位。</p>
          <p>
            你坐在深宮之中，天下十七處的消息，只能從一道道奏摺、密報與市井傳聞得知。邊將說虜騎壓境，巡撫說水災歉收，河督說堤防危急——<b>他們未必說謊，也未必說真話。</b>
          </p>
          <p>
            每一份文書都在驛路上走了十天、二十天，甚至兩個月；每一道旨意送到時，局勢可能早已變了。你的精力有限，國庫、糧倉、兵力、民心與朝望也都有限。
          </p>
          <p>
            兩年之間，天下會陸續發生幾件大事。<b>沒有人會先告訴你是哪幾件。</b>撐過七十二旬，史官會把你所不知道的一切寫下來。
          </p>
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
          <h3>登基恩詔（三選一）</h3>
          <div class="perks">
            {choices.map((p) => (
              <button key={p} class={`perk ${chosen === p ? 'on' : ''}`} onClick={() => setPerk(p)} data-perk={p}>
                <b>{PERKS[p].name}</b>
                <span>{PERKS[p].desc}</span>
              </button>
            ))}
          </div>
          <button class="btn vermilion wide big" disabled={!chosen} onClick={() => chosen && onStart(seed, chosen)} data-testid="ascend">
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
                  <td>{reasonText(h.reason as EndReason)}</td>
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
