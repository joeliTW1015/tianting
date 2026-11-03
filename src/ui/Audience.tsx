import { useContext, useState } from 'preact/hooks';
import type { CharId } from '../core/types';
import type { CaseView, CharView, DocView } from '../core/view';
import { PlainCtx } from './App';
import { Portrait } from './art/Portrait';
import { HallScene } from './art/Scenery';
import { Gloss } from './glossary';

interface Props {
  who: CharView;
  cases: CaseView[];
  energy: number;
  onAsk: (who: CharId, topic: string) => number | null;
  getDoc: (id: number) => DocView | null;
  onClose: () => void;
}

/** 召見：殿上奏對 */
export function AudienceModal({ who, cases, energy, onAsk, getDoc, onClose }: Props) {
  const plain = useContext(PlainCtx);
  const [answerId, setAnswerId] = useState<number | null>(null);
  const answer = answerId ? getDoc(answerId) : null;
  const topics: [string, string][] = [['state', '問天下大勢'], ...cases.map((c): [string, string] => [c.uid, `問「${c.title}」`])];

  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="audience-modal" onClick={(e) => e.stopPropagation()}>
        <HallScene />
        <div class="audience-stage">
          <div class="figure">
            <Portrait look={who.look} kind={who.kind} rank={who.rank} size={150} />
            <div class="nameplate">
              {who.title}・{who.name}
            </div>
          </div>
          <div class="speech paper">
            {!answer ? (
              <>
                <p class="lead">{who.title}{who.name}趨入殿中，跪拜候旨。</p>
                <p class="muted small">召見耗精力 2。奏對立即呈上，但所言未必中肯——每個人都有自己的立場。</p>
                <div class="topics">
                  {topics.map(([t, label]) => (
                    <button
                      key={t}
                      class="btn"
                      disabled={energy < 2}
                      onClick={() => {
                        const id = onAsk(who.id, t);
                        if (id) setAnswerId(id);
                      }}
                      data-topic={t}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {energy < 2 && <p class="ink small">今旬精力不足，不能召見。</p>}
              </>
            ) : (
              <>
                {(answer.paras ?? []).map((p, i) => (
                  <div key={i} class={`para ${p.tag}`}>
                    <p class="classic">
                      <Gloss text={p.text} />
                    </p>
                    {plain && p.plain && (
                      <p class="plain">
                        <span>白話</span>
                        {p.plain}
                      </p>
                    )}
                  </div>
                ))}
                <p class="muted small">（此奏對已收入奏摺匣。）</p>
              </>
            )}
            <button class="btn ghost close" onClick={onClose}>
              {answer ? '退下' : '作罷'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
