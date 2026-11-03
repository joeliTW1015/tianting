// 疑案：科場舞弊。會試放榜後物議沸騰：主考確有舞弊／落第者與言官誣告／房官受賄、主考失察。

import { claim, clue, core, draft, local, post } from '../docs';
import type { CaseState, GameState } from '../types';
import { addPrestige, addUnrest, clamp, event, makeChar } from '../util';
import { age, chance, every, resolve } from './common';
import type { CaseDef } from './types';

const E = (s: GameState, c: CaseState) => s.chars[c.actors.examiner];
const F = (s: GameState, c: CaseState) => s.chars[c.actors.fang];

function rumorLocal(s: GameState, c: CaseState, text: string, brief: string, plain: string): void {
  const d = local(draft('rumor', 'rumor', 'jingshi', c.uid, '京城傳聞・科場'), s);
  d.paras.push({ text: `坊間傳言：${text}`, brief, plain, tag: 'core' });
  post(s, d);
}

function settleIfDone(s: GameState, c: CaseState): void {
  if (c.resolved) return;
  if (c.branch === 'real' && c.data.examiner && c.data.retest) resolve(s, c, '覆試黜落冒濫，主考伏法，士論稱快。', true);
  if (c.branch === 'partial' && c.data.fang && c.data.retest) resolve(s, c, '覆試查出房官受賄，罪止其身。', !c.data.examiner);
  if (c.branch === 'slander' && c.data.retest && !c.data.examiner && !c.data.fang) resolve(s, c, '覆試所取皆真才，流言不攻自破。', true);
}

export const exam: CaseDef = {
  id: 'exam',
  name: '科場舞弊',
  regions: ['jingshi'],
  branches: [
    { id: 'real', label: '主考舞弊' },
    { id: 'slander', label: '落第誣告' },
    { id: 'partial', label: '房官受賄' },
  ],
  question: '會試舞弊案的真相？',
  opinions: { real: '此科取士，物議甚多，恐主考難辭其咎', slander: '落第者怨望，言官借題發揮，未必屬實', partial: '弊恐出於分房之官，主考未必知情' },
  startAt: (slot) => (slot < 30 ? 7 : 43),

  setup(s, c) {
    const e = makeChar(s, `examiner:${c.uid}`, '會試主考', 'jingshi', 'civil', 2, { integrity: c.branch === 'real' ? 0.2 : 0.85 });
    const f = makeChar(s, `fang:${c.uid}`, '同考官', 'jingshi', 'civil', 3, { integrity: c.branch === 'partial' ? 0.2 : 0.75 });
    c.actors = { examiner: e.id, fang: f.id };
    c.data = { protest: 20, riot: 0, retest: 0, retestDue: 0, examiner: 0, fang: 0, silenced: 0, leaked: 0 };
  },

  tick(s, c) {
    const e = E(s, c);
    const f = F(s, c);
    if (!c.data.retest) c.data.protest += (c.branch === 'slander' ? 3 : 6) * (s.world.buffs.academy ? 0.5 : 1);
    if (c.data.silenced) c.data.protest -= 3;
    c.data.protest = clamp(c.data.protest, 0, 100);
    if (c.data.protest >= 60 && !c.data.riot) {
      c.data.riot = 1;
      addUnrest(s, 'jingshi', 20);
      addPrestige(s, -6);
      event(s, c.uid, '落第舉子數百人聚於貢院前，焚燒榜文，京城騷動。', true);
      const d = local(draft('memorial', 'gov:jingshi', 'jingshi', c.uid, '順天府奏舉子聚眾'), s);
      d.urgent = true;
      core(d, '舉子數百人聚於貢院，抬孔子像哭訴，焚燒榜文，五城兵馬不能禁。', '舉子聚眾焚榜，京城騷動', '幾百個考生聚在考場前抗議，燒了錄取名單，官兵也管不住。');
      post(s, d);
    }
    if (c.data.silenced && c.branch !== 'slander' && !c.data.leaked && chance(s.rng, 0.15)) {
      c.data.leaked = 1;
      addPrestige(s, -6);
      event(s, c.uid, '科場舞弊之事終於外洩，天下以為朝廷包庇。', true);
    }
    if (c.data.retestDue && s.turn >= c.data.retestDue) {
      c.data.retestDue = 0;
      const d = local(draft('envoy', 'rites', 'jingshi', c.uid, '覆試結果奏報'), s);
      if (c.branch === 'real') core(d, `覆試已畢，所取之士黜落者十二人，皆出主考${e.name}親閱之卷，關節之跡顯然。`, '覆試黜落十二人，皆主考所取', `重考結果：有 12 個人被刷掉，都是主考官${e.name}親自錄取的，作弊的痕跡很明顯。`);
      else if (c.branch === 'partial') core(d, `覆試已畢，黜落三人，皆出同考官${f.name}之房，主考閱卷尚屬公允。`, `覆試黜落三人，皆出同考官${f.name}之房`, `重考結果：刷掉 3 個人，都是同考官${f.name}負責的那一房，主考官本身沒問題。（「房」＝分組閱卷）`);
      else core(d, '覆試已畢，所取之士文理俱優，並無冒濫。流言實出落第者之口。', '覆試所取皆真才', '重考結果：錄取的人程度都很好，沒有作弊。流言是沒考上的人放出來的。');
      post(s, d);
      settleIfDone(s, c);
    }

    if (age(s, c) === 0) {
      const d = local(draft('memorial', 'yushi', 'jingshi', c.uid, '御史劾會試主考'), s);
      core(d, `臣${s.chars.yushi.name}謹劾：會試主考${e.name}通同關節，所取多富家子弟，寒士落第者號泣於道。伏乞覆試，以正科場。`, `御史劾主考${e.name}通關節`, `御史告發這次科舉考試的主考官${e.name}收錢作弊，錄取的多是有錢人家的子弟。`);
      claim(d, `${c.uid}.cheat`, '主考舞弊', '有', c.branch === 'real' ? '有' : '無');
      if (c.branch === 'slander' && chance(s.rng, 0.5)) clue(d, '臣門下士某某，素有文名，此科竟不得與，尤可痛惜。', '御史提及門下士落第', { plain: '御史順帶說他的學生這次沒考上，很可惜。（他有私心嗎？）' });
      post(s, d);
    }
    if (every(s, c, 4, 1)) {
      const d = local(draft('memorial', e.id, 'jingshi', c.uid, '會試主考自陳疏'), s);
      core(d, `臣${e.name}謹奏：臣典試以來，矢公矢慎，所取皆糊名易書，臣實不知其名姓。伏乞覆試，以明臣心。`, '主考自陳矢公矢慎，請覆試以明心', '主考官說他很公正，請重新考試證明清白。');
      if (c.branch === 'real' && chance(s.rng, 0.5)) clue(d, '至於覆試一節，恐勞動士子，可不必行。', '又稱覆試勞動士子，可不必行', { against: c.uid, plain: '他嘴上說重考沒問題，又說其實不必重考。（前後不一）' });
      post(s, d);
    }
    if (every(s, c, 4, 2)) {
      if (c.branch === 'real') rumorLocal(s, c, '某富商之子以千金購得試題，入場前已遍示親友。', '富商之子千金購題', '傳說有富商的兒子花一千兩買到考題。');
      else if (c.branch === 'partial') rumorLocal(s, c, '此科中式者，某房所出尤多，皆其鄉里。', '某房中式者多其鄉里', '傳說某一房錄取的人特別多，都是同考官的同鄉。');
      else rumorLocal(s, c, '落第舉子結社作揭帖，誣主考受賄，然無指實。', '落第舉子作揭帖誣主考', '傳說落榜的考生寫傳單攻擊主考官，但說不出具體證據。');
    }
    if (age(s, c) >= 20) resolve(s, c, '科場風波漸息。', c.branch === 'slander' ? !c.data.examiner : !!(c.data.examiner || c.data.fang));
  },

  options(_s, c) {
    if (c.resolved) return [];
    return [
      { kind: 'retest', label: '下旨覆試', silver: 3, desc: '重新考一次，兩旬後揭曉，可以看出誰真有才學；考生的不滿會大幅平息。' },
      { kind: 'arrestExaminer', label: '逮問主考', desc: '把主考官下獄。若他真作弊，士林稱快；若無辜，讀書人寒心、朝望下降。' },
      { kind: 'arrestFang', label: '逮問同考官', desc: '把負責分房閱卷的同考官下獄。' },
      { kind: 'silence', label: '申飭言官，禁止妄議', desc: '壓下輿論。若真有舞弊，事後外洩會大損朝望；若是誣告，可以平息風波。' },
    ];
  },

  onOrder(s, c, o) {
    switch (o.kind) {
      case 'retest':
        c.data.retest = 1;
        c.data.retestDue = s.turn + 2;
        c.data.protest -= 50;
        event(s, c.uid, '詔令覆試，舉子稍安。');
        return true;
      case 'arrestExaminer':
        c.data.examiner = 1;
        E(s, c).status = 'arrested';
        if (c.branch === 'real') addPrestige(s, 3);
        else {
          s.world.wrongful.push(`會試主考${E(s, c).name}`);
          addPrestige(s, c.branch === 'slander' ? -5 : -2);
        }
        c.data.protest -= 30;
        settleIfDone(s, c);
        return true;
      case 'arrestFang':
        c.data.fang = 1;
        F(s, c).status = 'arrested';
        if (c.branch !== 'partial') s.world.wrongful.push(`同考官${F(s, c).name}`);
        c.data.protest -= 15;
        settleIfDone(s, c);
        return true;
      case 'silence':
        c.data.silenced = 1;
        if (c.branch === 'slander') addPrestige(s, 2);
        event(s, c.uid, '申飭言官，禁止妄議科場。');
        return true;
    }
    return false;
  },

  investigate(s, c, d) {
    if (c.branch === 'real') clue(d, '主考家人於放榜前收受富商銀兩，有賬簿可據。', '主考家人放榜前收銀，有賬可據', { against: c.uid, plain: '主考官的家人在放榜前收了富商的錢，有帳本為證。' });
    else if (c.branch === 'partial') clue(d, `同考官${F(s, c).name}受鄉人請託，暗通關節；主考並不知情。`, '同考官受請託，主考不知情', { plain: '是同考官收了同鄉的請託，主考官不知道。' });
    else clue(d, '揭帖皆出落第舉子之手，所指受賄之事，查無實據。', '揭帖出自落第舉子，查無實據', { plain: '攻擊傳單都是落榜考生寫的，指控查無實據。' });
  },

  guilty: (s, c) => (c.branch === 'real' ? [c.actors.examiner] : c.branch === 'partial' ? [c.actors.fang] : []),

  score(_s, c) {
    let p = 0;
    if (c.branch === 'real') p = (c.data.examiner ? 12 : 0) + (c.data.retest ? 8 : 0) - (c.data.leaked ? 6 : 0);
    else if (c.branch === 'partial') p = (c.data.fang ? 12 : 0) + (c.data.retest ? 8 : 0) - (c.data.examiner ? 6 : 0);
    else p = 20 - (c.data.examiner ? 14 : 0) - (c.data.fang ? 6 : 0) - (c.data.riot ? 4 : 0);
    if (c.data.riot && c.branch !== 'slander') p -= 4;
    return { points: Math.max(0, p), outcome: `${c.data.retest ? '曾下旨覆試。' : '未曾覆試。'}${c.data.riot ? '舉子曾聚眾鬧事。' : ''}` };
  },

  truth(s, c) {
    return c.branch === 'real'
      ? `主考${E(s, c).name}收受賄賂，通同關節。`
      : c.branch === 'partial'
        ? `同考官${F(s, c).name}受鄉人請託；主考${E(s, c).name}失察，但並未舞弊。`
        : `此科取士並無舞弊；落第舉子與言官借題攻擊主考${E(s, c).name}。`;
  },
};
