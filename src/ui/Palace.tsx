// 內廷：龍顏、聖躬、精力、娛樂；京師營建。

import { useState } from 'preact/hooks';
import { shortDate } from '../core/calendar';
import { hashSeed } from '../core/rng';
import { issueEdict } from '../core/edicts';
import { doLeisure, startProject } from '../core/palace';
import type { PlayerView } from '../core/view';
import type { Act } from './App';
import { Portrait, type Expression } from './art/Portrait';
import { HallScene } from './art/Scenery';

export function emperorExpression(view: PlayerView): Expression {
  if (view.palace.ill) return 'sick';
  return (['angry', 'sad', 'calm', 'calm', 'happy'] as Expression[])[view.palace.moodBand];
}

export function EmperorFace({ view, size = 40 }: { view: PlayerView; size?: number }) {
  return <Portrait look={hashSeed(view.seed + '#emperor')} kind="emperor" size={size} expression={emperorExpression(view)} />;
}

const MOOD_NOTE = [
  '聖心煩躁，容易遷怒臣下。精力減少，也比較容易生病。宜稍事休息、娛樂。',
  '鬱鬱寡歡，精力難以集中，也容易生病。',
  '略感煩悶。',
  '心緒平和。',
  '龍心大悅，精神奕奕，精力 +1。',
];

type Tab = 'life' | 'build';

export function PalaceModal({ view, act, onClose, initial = 'life' }: { view: PlayerView; act: Act; onClose: () => void; initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  const [fei, setFei] = useState(view.consorts.find((c) => c.status === 'active' && c.rank === 6)?.id ?? view.consorts[0]?.id ?? '');
  const pv = view.palace;
  const building = pv.projects.find((p) => p.status === 'building');

  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="palace paper" onClick={(e) => e.stopPropagation()} data-testid="palace">
        <header class="finance-head">
          <h2>內　廷</h2>
          <nav>
            <button class={tab === 'life' ? 'on' : ''} onClick={() => setTab('life')} data-tab="life">
              起居
            </button>
            <button class={tab === 'build' ? 'on' : ''} onClick={() => setTab('build')} data-tab="build">
              京師營建
            </button>
          </nav>
          <span class="muted small">
            精力 {view.energy}／{view.energyMax}（可透支到 −3）・勞損：{view.fatigue.text}・下旬回復 {view.regen}
          </span>
          <button class="btn ghost" onClick={onClose}>
            退出
          </button>
        </header>

        {tab === 'life' && (
          <div class="palace-life">
            <div class="throne">
              <HallScene />
              <div class="throne-figure">
                <EmperorFace view={view} size={150} />
              </div>
            </div>
            <div class="life-side">
              <section class="status-card">
                <h3>
                  龍顏：<span class={`mood-text b${pv.moodBand}`}>{pv.moodText}</span>
                </h3>
                <p class="small">{MOOD_NOTE[pv.moodBand]}</p>
                <h3>
                  聖躬：{pv.ill ? <span class="ink">{pv.ill.kind}・{pv.ill.text}</span> : <span class="ok">安和</span>}
                </h3>
                {pv.ill && <p class="small">病中精力減少、心情變差。可在太醫院的奏報中選擇療法，或禮佛問道、靜養。</p>}
                <h3>
                  勞損：<span class={`fat f${view.fatigue.band}`}>{view.fatigue.text}</span>
                </h3>
                <p class="small">精力每旬只回復約四點，不會回滿。透支（低於 0）會累積勞損，一旬花掉七點以上也會；勞損越重越容易生病。休養（一旬只花一點以下）多回兩點；「罷朝靜養」一旬可大減勞損。</p>
                <button class="btn small" onClick={() => act((s) => issueEdict(s, 'rest'))} data-testid="rest">
                  罷朝靜養本旬
                </button>
                <h4>下旬精力的回復</h4>
                {pv.capReasons.length ? (
                  <ul class="small">
                    {pv.capReasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p class="small muted">無增減。</p>
                )}
                <p class="muted small">心情隨朝望起伏；勞損重時心情變差。大捷、祥瑞、朝貢、皇子誕生令人開心；兵敗、決堤、民變、言官批評令人不快。</p>
              </section>
              <section>
                <h4>消遣（每旬一種；同一種冷卻三旬，常玩效果遞減）{view.leisureUsed && <em class="warn">　本旬已消遣</em>}</h4>
                <div class="fei-pick">
                  臨幸：
                  <select value={fei} onChange={(e) => setFei((e.target as HTMLSelectElement).value)}>
                    {view.consorts
                      .filter((c) => c.status === 'active')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.rankName}（{c.affection}）
                        </option>
                      ))}
                  </select>
                </div>
                <div class="leisure">
                  {pv.leisure.map((l) => (
                    <button key={l.id} class="leisure-card" disabled={!!l.block || view.energy - l.energy < -3} title={l.block ?? ''} onClick={() => act((s) => doLeisure(s, l.id, fei))} data-leisure={l.id}>
                      <b>{l.name}</b>
                      <span class="cost">
                        精力{l.energy}
                        {l.silver ? `・銀${l.silver}萬` : ''}
                        {l.privy ? `・內帑${l.privy}萬` : ''}
                      </span>
                      <span class="note">{l.desc}</span>
                      <em>{l.block ?? l.hint}</em>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {tab === 'build' && (
          <div class="palace-build">
            <p class="muted small">
              京師營建由工部主持，一次只能興辦一項。每項要花錢、耗時數旬（下旨耗精力 1），完工後永久生效。
              {building ? `目前正在興建：${building.name}（預計${shortDate(building.doneTurn!)}告成）。` : ''}
            </p>
            <div class="projects">
              {pv.projects.map((p) => (
                <div key={p.id} class={`project ${p.status} ${p.locked ? 'locked' : ''}`} data-project={p.id}>
                  <div class="project-icon">{p.status === 'done' ? '成' : p.status === 'building' ? '建' : p.locked ? '鎖' : '議'}</div>
                  <div class="project-body">
                    <b>{p.name}</b>
                    <span class="cost">
                      銀 {p.cost} 萬兩・{p.turns} 旬{p.privy ? '・可動用內帑' : ''}
                    </span>
                    <span class="note">{p.effect}</span>
                    {p.status === 'done' && <em class="ok">已告成，效果生效中</em>}
                    {p.status === 'building' && <em>興建中，預計{shortDate(p.doneTurn!)}告成</em>}
                    {p.status === 'idle' && !p.locked && (
                      <span class="project-actions">
                        <button class="btn vermilion" disabled={!!building || view.energy < -2} onClick={() => act((s) => startProject(s, p.id))} data-start={p.id}>
                          興工（國庫）
                        </button>
                        {p.privy && (
                          <button class="btn ghost" disabled={!!building || view.energy < -2} onClick={() => act((s) => startProject(s, p.id, true))}>
                            動用內帑
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
