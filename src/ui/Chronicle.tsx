import { useState } from 'preact/hooks';
import { cn, dateLabel, shortDate } from '../core/calendar';
import { reasonText, type Chronicle } from '../core/scoring';
import type { GameState } from '../core/types';
import { Cloud } from './art/Scenery';

/** 局末史書。這是整個 UI 中唯一讀得到真相的地方（遊戲已結束）。 */
export function ChronicleScreen({ state, chron, onMenu }: { state: GameState; chron: Chronicle; onMenu: () => void }) {
  const [onlyMajor, setOnlyMajor] = useState(true);
  const events = chron.events.filter((e) => !onlyMajor || e.major);

  return (
    <div class="chronicle">
      <div class="scroll-rod" />
      <header class="chron-head paper">
        <svg class="chron-clouds" viewBox="0 0 600 120" aria-hidden="true">
          <Cloud x={40} y={70} s={1.2} fill="#e9d6a8" o={0.6} />
          <Cloud x={420} y={50} s={1.5} fill="#e9d6a8" o={0.5} />
        </svg>
        <div class="seal big">{chron.posthumous}</div>
        <div>
          <h1>《胤史・{chron.posthumous}帝本紀》</h1>
          <p class="motto">{chron.meaning}</p>
          <p>
            帝在位{cn(chron.turn)}旬，終於{dateLabel(chron.turn)}。結局：<b>{reasonText(chron.reason)}</b>。史評 <b class="score">{chron.score}</b> 分。
          </p>
        </div>
        <div class="chron-actions">
          <button class="btn primary" onClick={onMenu} data-testid="menu">
            再開一局
          </button>
        </div>
      </header>

      <section class="paper">
        <h2>天下大事・真相</h2>
        <div class="verdicts">
          {chron.verdicts.map((v) => (
            <div key={v.key} class={`verdict ${v.correct ? 'ok' : 'bad'} ${v.discovered ? '' : 'hidden-case'}`}>
              <h3>
                {v.title}
                <span class="mark">{!v.started ? '尚未發生' : v.correct ? '判讀正確' : !v.discovered ? '未曾察覺' : v.belief === '未下判斷' ? '未下判斷' : '判讀錯誤'}</span>
              </h3>
              <p class="truth">
                真相（{v.branchLabel}）：{v.truth}
              </p>
              <p>你的心證：{v.belief}</p>
              <p>結果：{v.outcome}</p>
              {v.started && (
                <p class="muted small">
                  處置得分 {v.points} / {v.maxPoints}
                </p>
              )}
            </div>
          ))}
          <div class={`verdict ${chron.shoufu.correct ? 'ok' : 'bad'}`}>
            <h3>
              首輔票擬<span class="mark">{chron.shoufu.correct ? '判讀正確' : chron.shoufu.belief === '未下判斷' ? '未下判斷' : '判讀錯誤'}</span>
            </h3>
            <p class="truth">真相：{chron.shoufu.truth}</p>
            <p>你的心證：{chron.shoufu.belief}</p>
            {chron.shoufu.outcome && <p>{chron.shoufu.outcome}</p>}
          </div>
        </div>
        {chron.wrongful.length > 0 && <p class="wrongful">冤獄：{chron.wrongful.join('、')}。</p>}
        <div class="roles">
          {chron.roles.map((r) => (
            <p key={r.name}>
              <b>{r.name}</b>：{r.truth}
            </p>
          ))}
        </div>
      </section>

      <section class="paper">
        <h2>謊言簿</h2>
        <p class="muted small">
          你收到的文書中，共有 {chron.stats.lieCount} 則不實陳述；內閣票擬共略去 {chron.stats.omittedClues} 條線索；遭司禮監截留、從未送到你面前的奏疏 {chron.stats.suppressed} 份。
        </p>
        {chron.lies.map((t) => (
          <div key={t.topic}>
            <h3>{t.title}</h3>
            <table class="lies">
              <thead>
                <tr>
                  <th>期間</th>
                  <th>誰說的</th>
                  <th>事項</th>
                  <th>最後一次說</th>
                  <th>當時實情</th>
                  <th>次數</th>
                  <th>你細讀過</th>
                </tr>
              </thead>
              <tbody>
                {t.groups.map((l, i) => (
                  <tr key={i}>
                    <td>{l.firstTurn === l.lastTurn ? shortDate(l.firstTurn) : `${shortDate(l.firstTurn)}～${shortDate(l.lastTurn)}`}</td>
                    <td>{l.from}</td>
                    <td>{l.label}</td>
                    <td>{l.claimed}</td>
                    <td class="ink">{l.truth}</td>
                    <td>{l.count}</td>
                    <td>{l.readCount ? `${l.readCount} 次` : '從未'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section class="paper">
        <h2>
          實錄
          <button class="chip" onClick={() => setOnlyMajor(!onlyMajor)}>
            {onlyMajor ? '顯示全部' : '只看大事'}
          </button>
        </h2>
        <ul class="timeline">
          {events.map((e, i) => (
            <li key={i} class={e.major ? 'major' : ''}>
              <span class="muted">{shortDate(e.turn)}</span>
              <span class="tt">{e.topicTitle}</span>
              {e.text}
            </li>
          ))}
        </ul>
      </section>

      <section class="paper stats">
        <h2>御覽統計</h2>
        <p>
          細讀 {chron.stats.reads} 份・召見 {chron.stats.summons} 次・下旨 {chron.stats.orders} 道（查核 {chron.stats.spies} 道）・裁決政務 {chron.stats.tasks} 件
        </p>
        <p>
          局終國庫 {chron.stats.treasury} 萬兩・太倉 {chron.stats.grain} 萬石・朝望 {chron.stats.prestige}・種子「{state.seed}」
        </p>
        <p>
          京師營建：{chron.stats.projects.length ? chron.stats.projects.join('、') : '無'}・子女 {chron.stats.heirs} 人・染病 {chron.stats.illnesses} 次
        </p>
      </section>
      <div class="scroll-rod" />
    </div>
  );
}
