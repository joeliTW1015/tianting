// 幻燈片：開場交代背景、結局交代下場。自動播放，可點擊下一張，可整段略過。

import { useEffect, useState } from 'preact/hooks';
import { dateLabel } from '../core/calendar';
import type { Chronicle } from '../core/scoring';
import type { GameState } from '../core/types';
import { StoryScene, type SceneId } from './art/Story';

export interface Slide {
  scene: SceneId;
  title?: string;
  lines: string[];
  look?: number;
}

const SLIDE_MS = 6500;

export function Slideshow({ slides, onDone, kind }: { slides: Slide[]; onDone: () => void; kind: 'intro' | 'ending' }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => (i + 1 < slides.length ? setI(i + 1) : onDone()), SLIDE_MS + slides[i].lines.length * 400);
    return () => clearTimeout(t);
  }, [i]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') next();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const next = () => (i + 1 < slides.length ? setI(i + 1) : onDone());
  const s = slides[i];
  return (
    <div class={`slideshow ${kind}`} onClick={next} data-testid="slideshow">
      <div class="slide-art" key={`art-${i}`}>
        <StoryScene id={s.scene} look={s.look} />
      </div>
      <div class="slide-vignette" />
      <div class="slide-text" key={`t-${i}`}>
        {s.title && <h2>{s.title}</h2>}
        {s.lines.map((l, k) => (
          <p key={k} style={{ animationDelay: `${0.4 + k * 0.9}s` }}>
            {l}
          </p>
        ))}
      </div>
      <div class="slide-dots">
        {slides.map((_, k) => (
          <i key={k} class={k === i ? 'on' : k < i ? 'past' : ''} />
        ))}
      </div>
      <button
        class="btn ghost slide-skip"
        data-testid="skip"
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
      >
        略過 ▸▸
      </button>
      <div class="slide-hint">點擊畫面繼續</div>
    </div>
  );
}

export function introSlides(state: GameState): Slide[] {
  const c = state.chars;
  return [
    { scene: 'palaceNight', title: '崇寧元年・正月', lines: ['先帝在位二十餘年，晚年倦於政事，深居西苑，煉丹修道。', '奏章堆積如山，批紅之權，盡歸司禮監。', '去冬臘月，先帝驟崩於乾清宮。'] },
    { scene: 'eunuch', look: c.silijian.look, title: '九千歲', lines: [`司禮監掌印${c.silijian.name}，兼提督東廠。`, '內閣半數、六部三尚書、各省巡撫，皆其門下；天下生祠，稱「九千歲」。', '先帝的每一道旨意，都先經過他的手。'] },
    { scene: 'frontier', title: '遼東烽火', lines: ['建州女直崛起於白山黑水，八旗勁旅，逐年坐大。', '漠南察哈爾秋高馬肥，年年叩關。', `九邊欠餉${Math.round(state.world.borderArrears)}月，士卒嗷嗷待哺。`] },
    { scene: 'drought', title: '陝西大旱', lines: ['陝西連年亢旱，赤地千里，人相食。', '驛卒失業、饑民嘯聚，號為「闖營」。', '而陝西巡撫的奏摺上寫著：小旱，已撫。'] },
    { scene: 'prince', look: c.uncle.look, title: '皇叔', lines: [`先帝最寵愛的胞弟瑞王${c.uncle.name}，就藩河南。`, '當年先帝幾度欲立為太弟，滿朝皆知。', '如今新君無子，王府賓客，日益雜沓。'] },
    { scene: 'sea', title: '海上', lines: ['東南海上，紅毛夷據台灣大員，築城互市；', '閩海海商擁船數百，亦商亦盜，以台灣西岸為巢。'] },
    { scene: 'dawn', title: '新君即位', lines: ['你是先帝的太子，年方十九。', `國庫見存不及百萬，太倉之糧僅支一季；慈寧宮的皇太后、顧命首輔${c.shoufu.name}，都在看著你。`, '你坐在深宮之中，看到的只是報告，不是世界。'] },
    { scene: 'throne', title: '天　聽', lines: ['天視自我民視，天聽自我民聽。', '五年之內：剷除權閹、平定流寇、抵禦外侮——', '或者，成為末代之君。'] },
  ];
}

export function endingSlides(state: GameState, chron: Chronicle): Slide[] {
  const w = state.world;
  const date = dateLabel(chron.turn);
  const name = `${chron.posthumous}${chron.posthumous === '廢帝' ? '' : '帝'}`;
  const look = 7;
  const last: Slide = { scene: 'scroll', title: `史臣曰`, lines: [`諡曰「${name}」。${chron.meaning}`, `在位 ${chron.turn} 旬。評分 ${chron.score}。`, '以下，是你所不知道的歷史。'] };
  switch (chron.ending) {
    case 'zhongxing':
      return [
        { scene: 'throne', look, title: `${date}`, lines: ['內有權閹之禍，外有建州之患，中有流寇之亂——', '你都撐過來了。'] },
        { scene: 'prosper', title: '中　興', lines: ['府庫漸充，倉廩漸實；邊鎮奉命，四夷來朝。', `朝野稱頌：「${chron.posthumous}帝中興」。`] },
        { scene: 'calm', lines: ['史書上說，這是一個王朝最後的光輝。', '至於光輝之後——那是你兒子的事了。'] },
        last,
      ];
    case 'shoucheng':
      return [
        { scene: 'calm', title: '五年之後', lines: [`${date}。王朝還在，京師還在，你也還在。`, '雖然流寇未靖、邊患未息，但大廈未傾。'] },
        { scene: 'dawn', title: '守　成', lines: ['史官說：守成之君，功過參半。', '這未必是最壞的評語。'] },
        last,
      ];
    case 'pianan':
      return [
        { scene: 'south', title: '偏　安', lines: ['鑾輿南渡，駐蹕金陵。長江天塹，一水相隔。', '北方的奏摺，越來越慢，越來越少。'] },
        { scene: 'fall', lines: ['北京城頭，換了旗號。', `${date}，你在南京迎來第五個年終。`] },
        last,
      ];
    case 'wangguo':
      return chron.reason === 'captured'
        ? [
            { scene: 'captured', title: '天子北狩', lines: ['王師敗績，御營潰散。', '你被敵騎擁上馬背，向北而去。'] },
            { scene: 'fall', lines: ['京師無主，百官或降或死。', `${date}，社稷傾覆。`] },
            last,
          ]
        : [
            { scene: 'fall', title: chron.reason === 'capital' ? '城　破' : chron.reason === 'mutiny' ? '京營譁變' : '京師大饑', lines: [chron.reason === 'capital' ? '敵軍攻破城門，火光照徹九門。' : chron.reason === 'mutiny' ? '欠餉的禁軍鼓譟而起，殺入宮門。' : '太倉粒米無存，饑民搶糧，禁軍乏食。', '鐘鼓樓上的鐘，敲了很久，沒有一個大臣來朝。'] },
            { scene: 'palaceNight', lines: ['你換上布衣，走上煤山。', '「朕非亡國之君，諸臣皆亡國之臣。」'] },
            { scene: 'death', lines: [`${date}，國亡。`] },
            last,
          ];
    case 'jiabeng':
      return [
        { scene: 'palaceNight', title: chron.reason === 'assassinated' ? '宮闈之變' : '病篤', lines: chron.reason === 'assassinated' ? ['夜半，乾清宮的燭火忽然熄了。', '史書只記了八個字：「上崩，事秘不得聞。」'] : ['積勞成疾，藥石罔效。', `${w.emperor.fatigue >= 6 ? '你透支了太久。' : '天命如此。'}`] },
        { scene: 'death', title: '駕　崩', lines: [`${date}，${name}崩於乾清宮。`, state.heir ? '太子即位，主少國疑。' : '無子，廷臣迎立皇叔。'] },
        last,
      ];
    case 'beifei':
      return [
        { scene: 'eunuch', look: state.chars.silijian.look, title: chron.reason === 'palace' ? '宮　變' : '廢　立', lines: chron.reason === 'palace' ? ['京營開了宮門，司禮監捧著太后的懿旨。', '「皇帝失德，不堪承宗廟。」'] : ['朝望掃地，群臣伏闕。', '慈寧宮傳出懿旨：廢帝別立。'] },
        { scene: 'deposed', title: '南宮', lines: ['你被送進南宮，宮門上了鎖。', `${date}之後，史書上再沒有你的名字，只有「廢帝」。`] },
        last,
      ];
  }
}
