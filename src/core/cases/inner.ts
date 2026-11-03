// 疑案：內廷壅蔽。司禮監截留奏疏／外廷誣陷司禮監／司禮監與首輔內外勾結。
// 截留是真的會發生：某些奏疏永遠不會送到玩家手上，之後上疏者可能會來追問。

import { shortDate } from '../calendar';
import { claim, clue, core, draft, fluff, local, post, registerInterceptor } from '../docs';
import { PROVINCES } from '../geography';
import { shuffle } from '../rng';
import type { CaseState, Doc, GameState } from '../types';
import { addPrestige, event, replaceChar } from '../util';
import { age, chance, every, int, resolve } from './common';
import type { CaseDef } from './types';

const S = (s: GameState) => s.chars.silijian;

function active(s: GameState): CaseState | undefined {
  return s.cases.find((c) => c.def === 'inner' && !c.resolved && s.turn >= c.startTurn && c.branch !== 'slandered' && !c.data.removed);
}

registerInterceptor((s: GameState, doc: Doc) => {
  const c = active(s);
  if (!c || doc.urgent || doc.free || doc.task) return false;
  if (doc.kind !== 'memorial' && doc.kind !== 'secret' && doc.kind !== 'envoy') return false;
  if (doc.topic === c.uid && doc.from !== 'yushi') return false;
  const warned = s.turn < c.data.warnUntil ? 0.5 : 1;
  let p = 0;
  if (doc.from === 'yushi') p = 0.5;
  else if (typeof doc.from === 'string' && doc.from.startsWith('gov:') && c.flags[`r:${doc.region}`]) p = 0.4;
  if (!chance(s.rng, p * warned)) return false;
  c.data.suppressed += 1;
  if (chance(s.rng, 0.6) && typeof doc.from === 'string' && doc.from !== 'rumor' && doc.from !== 'court') {
    c.memo.push(`${s.turn + int(s.rng, 3, 5)}|${doc.from}|${doc.sentTurn}|${doc.title}|${doc.region}`);
  }
  return true;
});

function complaint(s: GameState, c: CaseState, from: string, sent: number, title: string, region: string, real: boolean): void {
  const who = s.chars[from];
  if (!who) return;
  const d = draft('memorial', from, region as never, c.uid, `${who.title}催問前疏`);
  core(
    d,
    `臣${who.name}謹奏：臣於${shortDate(sent)}具疏〈${title}〉，迄今未蒙批答。事關緊要，臣不勝惶惑，謹再具疏上聞。`,
    `${who.title}稱${shortDate(sent)}所上〈${title}〉未蒙批答`,
    `${who.title}說：他在${shortDate(sent)}送過一份〈${title}〉，到現在都沒有回音，所以再寫一次。（你有收到那份奏疏嗎？可以到案牘裡找找看。）`,
  );
  claim(d, `${c.uid}.lost`, '前疏下落', real ? '未達御前' : '已達御前', real ? '遭截留' : '已達御前');
  post(s, d);
}

export const inner: CaseDef = {
  id: 'inner',
  name: '內廷壅蔽',
  regions: ['jingshi'],
  branches: [
    { id: 'intercept', label: '司禮監截留奏疏' },
    { id: 'slandered', label: '外廷誣陷' },
    { id: 'collusion', label: '內外勾結' },
  ],
  question: '司禮監是否截留了奏疏？',
  opinions: { intercept: '司禮監近來權勢日盛，章奏多有不達', slandered: '外廷諸臣欲借此攻倒司禮監，所言未必盡實', collusion: '司禮監與閣臣往來甚密，內外相為表裡' },

  setup(s, c) {
    c.actors = { silijian: 'silijian' };
    c.data = { power: 0, suppressed: 0, warnUntil: 0, removed: 0, registry: 0, blocked: 0 };
    for (const r of shuffle(s.rng, PROVINCES.slice()).slice(0, 3)) c.flags[`r:${r}`] = true;
    if (c.branch === 'collusion') s.world.shoufu = c.uid;
  },

  tick(s, c) {
    const sj = S(s);
    if (c.branch !== 'slandered' && !c.data.removed) c.data.power += 1;
    // 權勢坐大後，部分旨意被留中
    if (c.branch !== 'slandered' && c.data.power >= 30) {
      for (const o of s.orders) {
        if (o.status === 'transit' && o.issuedTurn === s.turn - 1 && chance(s.rng, 0.2)) {
          o.status = 'done';
          c.data.blocked += 1;
          event(s, c.uid, `司禮監將「${o.label}」之旨留中不發。`);
        }
      }
    }
    // 追問前疏
    const due = c.memo.filter((m) => Number(m.split('|')[0]) <= s.turn);
    c.memo = c.memo.filter((m) => Number(m.split('|')[0]) > s.turn);
    for (const m of due) {
      const [, from, sent, title, region] = m.split('|');
      complaint(s, c, from, Number(sent), title, region, true);
    }
    // 誣陷分支：偶有官員誤稱前疏未達（其實早已送到）
    if (c.branch === 'slandered' && every(s, c, 7, 4)) {
      const real = s.docs.filter((d) => d.kind === 'memorial' && typeof d.from === 'string' && d.from.startsWith('gov:') && d.arriveTurn <= s.turn && d.sentTurn > s.turn - 12);
      if (real.length) {
        const d = real[int(s.rng, 0, real.length - 1)];
        complaint(s, c, d.from as string, d.sentTurn, d.title, d.region, false);
      }
    }

    if (every(s, c, 6)) {
      const d = local(draft('memorial', 'yushi', 'jingshi', c.uid, '御史劾司禮監擅權'), s);
      core(d, `臣${s.chars.yushi.name}謹劾：司禮監掌印${sj.name}，竊弄威福，章奏多有留中不發者，天下之事，壅於上聞。伏乞罷斥。`, `御史劾司禮監${sj.name}截留章奏`, `御史彈劾司禮監（宮內最有權勢的太監衙門）的首領：說他把大臣的奏疏扣下不給你看。`);
      claim(d, `${c.uid}.intercept`, '司禮監截留章奏', '有', c.branch === 'slandered' ? '無' : '有');
      if (c.branch === 'slandered' && chance(s.rng, 0.4)) clue(d, '臣與同官十餘人連名具奏，事在必行。', '言官十餘人連名，事在必行', { plain: '十幾個言官聯名上奏，非要扳倒他不可。（這麼急，是公義還是黨爭？）' });
      post(s, d);
    }
    if (every(s, c, 6, 3)) {
      const d = local(draft('memorial', 'silijian', 'jingshi', c.uid, '司禮監自陳疏'), s);
      core(d, `奴婢${sj.name}謹奏：奴婢職司批紅，凡章奏到監，即刻進呈，不敢稽留片刻。外廷諸臣結黨攻訐，欲去奴婢而專權，伏乞聖明洞鑒。`, '司禮監自陳無截留，反指外廷結黨', '司禮監首領說：他從不扣留奏疏，是外面的大臣結黨要整他。');
      claim(d, `${c.uid}.intercept`, '司禮監截留章奏', '無', c.branch === 'slandered' ? '無' : '有');
      if (c.branch === 'collusion' && chance(s.rng, 0.4)) clue(d, `閣臣${s.chars.shoufu.name}深知奴婢忠謹，可以為證。`, '引首輔為證', { against: c.uid, plain: '他說首輔可以替他作證。（太監和首輔關係這麼好？）' });
      post(s, d);
    }
    if (c.branch === 'slandered' && age(s, c) >= 30) resolve(s, c, '風波漸息，司禮監並無截留之事。', !c.data.removed);
  },

  options(s, c) {
    if (c.data.removed) return [];
    return [
      { kind: 'registry', label: '調閱通政司收疏簿', desc: '核對近六旬各地送到的奏疏數，和你實際看到的數量。若司禮監權勢已大，簿冊可能被竄改。' },
      { kind: 'warn', label: '申飭司禮監', desc: '下旨訓誡司禮監。若他確有截留，會收斂一陣子；若是被誣陷，外廷會更得意。' },
      { kind: 'remove', label: '罷黜司禮監掌印', desc: '撤換司禮監首領。需要朝望 35 以上，否則內廷反撲、朝望下降。冤枉了他，外廷黨爭會更凶。' },
    ];
  },

  onOrder(s, c, o) {
    if (o.kind === 'registry') {
      c.data.registry += 1;
      const window = 6;
      const shown = s.docs.filter((d) => d.kind === 'memorial' && d.sentTurn >= s.turn - window && d.sentTurn < s.turn && d.arriveTurn <= s.turn).length;
      const lost = c.branch === 'slandered' ? 0 : Math.min(c.data.suppressed, Math.round(c.data.suppressed * 0.7 + 1));
      const forged = c.branch !== 'slandered' && c.data.power >= 18 && chance(s.rng, 0.5);
      const total = shown + (forged ? 0 : lost);
      const d = local(draft('notice', 'court', 'jingshi', c.uid, '通政司收疏簿摘錄'), s);
      core(d, `通政司謹奏：近六旬收受內外章奏共${total}件，俱已轉送司禮監。`, `通政司稱近六旬收疏${total}件`, `通政司（收發奏疏的衙門）說：最近六旬一共收到 ${total} 份奏疏，都轉交給司禮監了。你自己這段期間收到的奏疏大約是 ${shown} 份——對得上嗎？`);
      claim(d, `${c.uid}.registry`, '近六旬收疏', total, shown + lost, { tol: 0.05 });
      post(s, d);
      return true;
    }
    if (o.kind === 'warn') {
      c.data.warnUntil = s.turn + 12;
      c.data.power = Math.max(0, c.data.power - 5);
      event(s, c.uid, c.branch === 'slandered' ? '申飭無辜之司禮監，外廷氣燄益張。' : '司禮監受申飭，稍稍收斂。');
      return true;
    }
    if (o.kind === 'remove') {
      if (s.world.prestige < 35) {
        addPrestige(s, -5);
        event(s, c.uid, '欲罷司禮監，內廷群閹環泣御前，太后出面說情，事遂中止。', true);
        return true;
      }
      const old = S(s).name;
      c.data.removed = 1;
      replaceChar(s, 'silijian');
      if (c.branch === 'slandered') {
        s.world.wrongful.push(`司禮監掌印${old}`);
        addPrestige(s, -4);
        resolve(s, c, `無辜之司禮監${old}被黜，外廷一黨遂專朝政。`, false);
      } else resolve(s, c, `擅權之司禮監${old}被黜，言路復通。`, true);
      return true;
    }
    return false;
  },

  investigate(s, c, d, mode) {
    if (c.branch !== 'slandered' && c.data.power >= 18 && mode.spy) {
      fluff(d, '東廠番子回報：司禮監奉公守法，並無可議。', '東廠稱司禮監並無可議（東廠受司禮監節制）');
      return;
    }
    if (c.branch === 'slandered') clue(d, '司禮監收疏即進，並無稽留；劾之者多出同一門戶。', '司禮監並無稽留，劾者多出同門', { plain: '司禮監收到奏疏就送上去，沒有扣留；告他的人都是同一派系的。' });
    else clue(d, '司禮監值房中積壓章奏數十件，皆言內外利弊者。', '司禮監值房積壓章奏數十件', { against: c.uid, plain: '司禮監的辦公房裡堆著幾十份沒送上去的奏疏。' });
  },

  guilty: (_s, c) => (c.branch !== 'slandered' && !c.data.removed ? ['silijian'] : []),

  score(_s, c) {
    let p: number;
    if (c.branch === 'slandered') p = c.data.removed ? 0 : 20;
    else p = c.data.removed ? Math.max(10, 20 - Math.floor(c.data.suppressed / 3)) : Math.max(0, 12 - c.data.suppressed);
    return { points: p, outcome: `被截留的奏疏共${c.data.suppressed}份${c.data.blocked ? `，被留中的旨意${c.data.blocked}道` : ''}。` };
  },

  truth(s, c) {
    return c.branch === 'slandered'
      ? '司禮監並未截留奏疏；外廷一黨借題發揮，意在奪權。'
      : c.branch === 'collusion'
        ? `司禮監截留章奏，且與首輔${s.chars.shoufu.term === 1 ? s.chars.shoufu.name : ''}內外勾結：一個扣奏疏，一個寫票擬。`
        : '司禮監確實截留章奏，凡不利於己及親信者，多留中不發。';
  },
};
