// 疑案：報災請蠲。真災／豪紳隱田（巡撫勾結）／巡撫貪墨。

import { cn } from '../calendar';
import { advise, claim, clue, core, fluff, post, request } from '../docs';
import { REGIONS, regionName } from '../geography';
import type { CaseState, GameState } from '../types';
import { addPrestige, addUnrest, event, flow, gov, replaceChar, silver } from '../util';
import { age, cdoc, chance, every, noisy, resolve, rumor } from './common';
import type { CaseDef } from './types';

const fen = (c: CaseState) => (c.branch === 'disaster' ? 5 : 10);
const newGov = (s: GameState, c: CaseState) => gov(s, c.region).term > 1;

function govReport(s: GameState, c: CaseState): void {
  const r = s.rng;
  const g = gov(s, c.region);
  const honest = c.branch === 'disaster' || newGov(s, c);
  const reg = s.world.regions[c.region];
  const d = cdoc(s, c, 'memorial', g.id, age(s, c) === 0 ? `${regionName(c.region)}巡撫為災傷請蠲疏` : `${regionName(c.region)}巡撫奏報地方情形`);
  const claimed = honest ? fen(c) : 5;
  if (age(s, c) === 0) {
    core(d, `臣${g.name}謹奏：本省去秋霪雨連旬，田禾淹沒，收成不及五分。民間嗷嗷，賦役難完。`, `${regionName(c.region)}水災，收成不及五分`, `巡撫說：去年秋天大雨，田地被淹，收成不到五成。百姓繳不起稅。（「五分」＝五成）`);
  } else {
    core(d, `臣${g.name}謹奏：本省今歲收成約${cn(claimed)}分。`, `收成約${cn(claimed)}分`, `巡撫說：今年收成大約${claimed}成。`);
  }
  claim(d, `${c.uid}.harvest`, '收成', `${cn(claimed)}分`, `${cn(fen(c))}分`);
  const mood = reg.unrest >= 65 ? '民情洶洶，恐生事端' : reg.unrest >= 40 ? '民多怨言' : '地方尚稱安靜';
  const shownMood = honest ? mood : s.turn < reg.pressUntil ? '民情洶洶，恐生事端' : mood;
  core(d, `${s.turn < reg.pressUntil ? '自奉嚴旨催科，' : ''}${shownMood}。`, shownMood);
  claim(d, `${c.uid}.mood`, '民情', shownMood, mood);

  if (!newGov(s, c)) {
    if (c.branch === 'disaster' && chance(r, 0.45)) clue(d, '米價騰貴，每石至二兩有奇，饑民流徙道路。臣已開常平倉平糶。', '米價每石二兩，已開倉平糶', { plain: '米價漲到一石二兩多（平常約一兩），災民四處流浪。（這是真有災荒的跡象）' });
    if (c.branch === 'gentry' && chance(r, 0.4)) clue(d, '鄉紳亦多報田地被水，臣已飭有司勘實。', '鄉紳多報田地被水', { against: c.uid, plain: '他說地方上的士紳也紛紛報災。（為什麼報災的都是有田的士紳？）' });
    if (c.branch === 'gentry' && chance(r, 0.25)) clue(d, '查各縣田冊，舊額日減，皆因民田多有寄莊、詭寄之弊，然積習已久，未可驟更。', '田冊舊額日減，有詭寄之弊', { against: c.uid, plain: '各縣登記的田地越來越少，因為很多人把田掛在有免稅特權的士紳名下逃稅（詭寄）。' });
    if (c.branch === 'embezzle' && chance(r, 0.35)) clue(d, '本年解部銀兩，沿途耗損甚多，所解或不足額，伏乞寬限。', '解部銀兩沿途耗損，或不足額', { plain: '他說送到京城的稅銀「路上損耗」很多，可能不足額。（銀子會在路上損耗那麼多嗎？）' });
  }

  if (s.turn >= reg.remitUntil && !honest && chance(r, 0.6)) {
    core(d, '伏乞將本省錢糧蠲免，以甦民困。', '乞蠲免錢糧');
    request(d, { kind: 'remit', region: c.region, caseId: c.uid, desc: `蠲免${regionName(c.region)}錢糧四月`, yes: `該省未來四個月只繳三成錢糧（國庫每旬少收約 ${Math.round(REGIONS[c.region].tax * 0.7)} 萬兩）。若真有災，民心會好轉；若沒有，少收的錢落入豪紳或官員手中。`, no: '照常徵收。若真有災，民心會惡化。' });
    d.recommend = advise(s, false, c.uid);
  } else if (c.branch === 'disaster' && s.turn >= reg.remitUntil && age(s, c) === 0) {
    core(d, '伏乞將本省錢糧蠲免，以甦民困。', '乞蠲免錢糧');
    request(d, { kind: 'remit', region: c.region, caseId: c.uid, desc: `蠲免${regionName(c.region)}錢糧四月`, yes: '該省未來四個月只繳三成錢糧；災民負擔減輕，民心好轉。', no: '照常徵收；災區民心會繼續惡化。' });
    d.recommend = advise(s, true, c.uid);
  } else if (c.branch === 'disaster' && reg.unrest >= 35 && s.turn >= reg.reliefUntil && chance(r, 0.6)) {
    core(d, '饑民日眾，伏乞發帑銀二十萬兩賑濟。', '乞發帑二十萬兩賑濟');
    request(d, { kind: 'relief', region: c.region, amount: 20, caseId: c.uid, desc: `發帑銀二十萬兩賑濟${regionName(c.region)}`, yes: '國庫 −20 萬兩；送達後災民得救，民心回升。', no: '不發；民心持續惡化。' });
    d.recommend = advise(s, true, c.uid);
  } else fluff(d, '臣惟有督率有司，悉心撫綏，以副聖懷。', '（客套話）');
  post(s, d);
}

export const remit: CaseDef = {
  id: 'remit',
  name: '報災請蠲',
  regions: ['nanzhili', 'zhejiang', 'huguang', 'jiangxi', 'shandong'],
  branches: [
    { id: 'disaster', label: '確有災傷' },
    { id: 'gentry', label: '豪紳隱田' },
    { id: 'embezzle', label: '巡撫貪墨' },
  ],
  question: '此省錢糧短少的真正原因？',
  opinions: { disaster: '其地災情恐非虛報', gentry: '短解恐係豪紳詭寄田畝', embezzle: '短解恐係巡撫侵蝕' },

  setup(s, c) {
    const g = gov(s, c.region);
    g.integrity = c.branch === 'disaster' ? 0.85 : c.branch === 'gentry' ? 0.35 : 0.15;
    c.actors = { governor: g.id };
    c.data = { surveyStart: -1, surveyed: 0, skimmed: 0, pressed: 0, remitted: 0, relief: 0, startUnrest: 0, delivered: 0 };
  },

  tick(s, c) {
    const w = s.world;
    const reg = w.regions[c.region];
    if (age(s, c) === 0 && c.branch === 'disaster') {
      reg.disaster = { kind: '水', until: s.turn + 15, severity: 0.6 };
      reg.unrest = Math.max(reg.unrest, 40);
    }
    if (c.data.surveyStart >= 0 && !c.data.surveyed && s.turn >= c.data.surveyStart + 3) {
      c.data.surveyed = 1;
      addUnrest(s, c.region, c.branch === 'disaster' ? 18 : 8);
      addPrestige(s, -2);
      event(s, c.uid, c.branch === 'gentry' ? '清丈田畝告成，查出隱田甚多，豪紳怨望。' : c.branch === 'disaster' ? '災後強行清丈，擾民甚劇，所得無多。' : '清丈田畝告成，田額略有增加。', true);
      if (c.branch === 'gentry') resolve(s, c, '清丈查出隱田，賦額恢復。', true);
    }
    // 真相對錢糧的影響
    if (c.branch === 'gentry') reg.caseTaxMod = c.data.surveyed ? 1 : newGov(s, c) ? 0.75 : 0.6;
    else if (c.branch === 'embezzle') {
      reg.caseTaxMod = newGov(s, c) ? 1 : 0.65;
      if (!newGov(s, c)) c.data.skimmed += REGIONS[c.region].tax * 0.35;
    }
    if (s.turn < reg.pressUntil) c.data.pressed = 1;
    if (s.turn < reg.remitUntil) c.data.remitted = 1;
    c.data.delivered += reg.taxPaid;

    if (every(s, c, 4)) govReport(s, c);
    if (every(s, c, 5, 2)) {
      const price = c.branch === 'disaster' ? 190 : 100;
      const p = chance(s.rng, 0.2) ? (price > 140 ? 100 : 190) : noisy(s.rng, price, 0.15);
      rumor(s, c, `南來商人言：${regionName(c.region)}米價每石${p >= 150 ? '近二兩' : '一兩上下，與常年無異'}。`, `${regionName(c.region)}米價${p >= 150 ? '騰貴' : '如常'}`, `商人說那裡的米價${p >= 150 ? '很貴（有饑荒的跡象）' : '和平常一樣（不像有大災）'}。`);
    }
    if (every(s, c, 7, 5) && c.branch === 'gentry') rumor(s, c, `${regionName(c.region)}大戶多將田畝寄於鄉宦名下，以避賦役。`, '大戶詭寄田畝避賦', '有錢人把田地掛在士紳名下逃稅。');
    if (every(s, c, 7, 5) && c.branch === 'embezzle' && !newGov(s, c)) rumor(s, c, `${regionName(c.region)}巡撫衙門新起花園，極其壯麗。`, '巡撫新起花園', '巡撫最近蓋了很豪華的花園。');
  },

  options(s, c) {
    return c.data.surveyStart < 0 ? [{ kind: 'survey', label: '清丈田畝', silver: 10, desc: '重新丈量田地，三旬後見效：查出隱匿的田地，錢糧恢復；但會激怒士紳、地方不安（真有災時更糟）。' }] : [];
  },

  onOrder(s, c, o) {
    const w = s.world;
    if (o.kind === 'survey') {
      c.data.surveyStart = s.turn;
      event(s, c.uid, `清丈田畝之旨到${regionName(c.region)}，有司開始丈量。`);
      return true;
    }
    if (o.kind === 'remit') {
      c.data.remitted = 1;
      event(s, c.uid, c.branch === 'disaster' ? '蠲免之旨到達，災民稍安。' : '蠲免之旨到達，然豪紳官吏坐享其利，小民未沾實惠。', true);
      return false; // 仍走通用處置（設定蠲免）
    }
    if (o.kind === 'relief') {
      c.data.relief = 1;
      if (c.branch === 'embezzle' && !newGov(s, c)) {
        c.data.skimmed += (o.amount ?? 20) * 0.6;
        event(s, c.uid, '賑銀到達，巡撫剋扣過半。');
      }
      return false;
    }
    if (o.kind === 'arrest' && o.person === gov(s, c.region).id) {
      const old = gov(s, c.region).name;
      if (c.branch === 'disaster') {
        w.wrongful.push(`${regionName(c.region)}巡撫${old}`);
        addUnrest(s, c.region, 10);
        addPrestige(s, -3);
        event(s, c.uid, `清廉之巡撫${old}因如實報災被逮，士民不平。`, true);
      } else if (c.branch === 'embezzle') {
        const back = c.data.skimmed * 0.6;
        flow(s, '抄沒', `抄沒巡撫${old}`, { silver: back });
        event(s, c.uid, `巡撫${old}被逮，抄沒贓銀約${silver(back)}。`, true);
        resolve(s, c, `貪撫${old}伏法，追回贓銀${silver(back)}。`, true);
      } else event(s, c.uid, `巡撫${old}被逮。其人庇護豪紳，罪有應得，然隱田之弊仍在。`, true);
      replaceChar(s, gov(s, c.region).id);
      const d = cdoc(s, c, 'memorial', gov(s, c.region).id, `新任${regionName(c.region)}巡撫到任疏`);
      core(d, `臣${gov(s, c.region).name}謹奏：臣到任周歷各府，今歲收成約${cn(fen(c))}分。`, `新任巡撫稱收成約${cn(fen(c))}分`);
      claim(d, `${c.uid}.harvest`, '收成', `${cn(fen(c))}分`, `${cn(fen(c))}分`);
      if (c.branch === 'disaster') clue(d, '前任所報災傷屬實，臣沿途所見，饑民塞道。', '前任所報災傷屬實', { plain: '新巡撫說前任報的災情是真的。你可能錯怪了好官。' });
      else if (c.branch === 'gentry') clue(d, '查得豪紳隱匿田畝甚多，非清丈不能復額。', '豪紳隱田甚多，非清丈不能復額', { plain: '新巡撫說：問題是士紳藏了很多田地不報，要重新丈量才能解決。' });
      else clue(d, '查前任庫冊，收數與解數相差懸殊，侵蝕有據。', '前任收數與解數懸殊，侵蝕有據', { plain: '新巡撫查帳：前任收到的稅和上繳的差很多，確實貪污。' });
      post(s, d);
      return true;
    }
    return false;
  },

  investigate(s, c, d, mode) {
    const r = s.rng;
    const guilty = c.branch !== 'disaster' && !newGov(s, c);
    if (mode.bribed) {
      core(d, '查勘災傷屬實，所請蠲免，實出不得已。', '查稱災傷屬實，宜准蠲免', '巡按說災情是真的，應該免稅。');
      claim(d, `${c.uid}.harvest`, '收成', '五分', `${cn(fen(c))}分`);
      return;
    }
    const seen = Math.min(10, Math.round(noisy(r, fen(c), mode.spy ? 0.15 : 0.08)));
    core(d, `訪得${regionName(c.region)}今歲收成約${cn(seen)}分。`, `訪得收成約${cn(seen)}分`, `查到那裡今年收成大約${seen}成。`);
    claim(d, `${c.uid}.harvest`, '收成', `${cn(seen)}分`, `${cn(fen(c))}分`);
    if (chance(r, 0.75) || !mode.spy) {
      if (c.branch === 'gentry') clue(d, '鄉紳田畝多詭寄他戶，冊籍不實，賦役盡歸小民。', '鄉紳詭寄田畝，冊籍不實', { against: c.uid, plain: '士紳把田地掛在別人名下逃稅，稅都落在小老百姓身上。' });
      else if (c.branch === 'embezzle' && guilty) clue(d, '巡撫衙門解銀多有剋扣，私宅新起，奢靡逾制。', '巡撫剋扣解銀，私宅新起', { against: c.uid, plain: '巡撫把要上繳的錢扣下來，自己蓋了豪宅。' });
      else if (c.branch === 'disaster') clue(d, '沿途饑民甚眾，賣兒鬻女者有之，災情非虛。', '沿途饑民甚眾，災情非虛', { plain: '路上到處是災民，有人賣兒賣女，災情是真的。' });
    }
    if (mode.fabricate && c.branch === 'disaster') {
      core(d, `訪得巡撫${gov(s, c.region).name}侵蝕賑銀，中飽私囊。`, '訪得巡撫侵蝕賑銀', '密探說巡撫貪污賑災銀。');
      claim(d, `${c.uid}.embezzle`, '巡撫貪墨', '有', '無');
    }
  },

  bribe: (s, c) => (c.branch !== 'disaster' && !newGov(s, c) ? 0.45 : 0),
  guilty: (s, c) => (c.branch !== 'disaster' && !newGov(s, c) ? [gov(s, c.region).id] : []),

  score(s, c) {
    let p = 0;
    const revolt = s.world.events.some((e) => e.text.includes(`${regionName(c.region)}民不聊生`));
    if (c.branch === 'disaster') {
      if (c.data.remitted || c.data.relief) p += 10;
      if (!revolt) p += 10;
      if (s.world.wrongful.some((x) => x.startsWith(`${regionName(c.region)}巡撫`))) p -= 6;
    } else if (c.branch === 'gentry') {
      p += c.data.surveyed ? 14 : c.data.pressed ? 8 : 0;
      if (!c.data.remitted) p += 6;
    } else {
      if (newGov(s, c)) p += 14;
      if (!c.data.remitted) p += 6;
    }
    return { points: Math.max(0, p), outcome: `此案期間該省共解錢糧約${silver(c.data.delivered)}。${revolt ? '其間曾激起民變。' : ''}` };
  },

  truth(s, c) {
    return c.branch === 'disaster'
      ? `${regionName(c.region)}確遭水災，收成僅五分，巡撫所奏屬實。`
      : c.branch === 'gentry'
        ? `${regionName(c.region)}收成如常。豪紳詭寄隱田，與巡撫勾結，假報災傷以求蠲免。`
        : `${regionName(c.region)}收成如常。巡撫照額徵收，卻剋扣三成五入私囊，再以報災掩飾短解。`;
  },
};
