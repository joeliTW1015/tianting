// 推進一旬：精力結算 → 旨意與詔書送達 → 政務（含大臣代辦）→ 事件鏈 → 兵事 → 外藩 → 錢糧民心 → 派系
// → 新奏報 → 內廷（後宮、太后、刺殺、文字獄、兩難）→ 狀態倒數 → 判定終局。

import { decide } from './actions';
import { casesTick } from './cases';
import { watchReport } from './cases/uncle';
import { courtTick } from './court';
import { dipTick, edictTick } from './edicts';
import { economyTick, unrestTick } from './economy';
import { factionTick } from './factions';
import { alive, foreignTick } from './foreign';
import { haremTick } from './harem';
import { assassinTick, dilemmaTick, dowagerTick, literaryTick } from './intrigue';
import { deliver } from './orders';
import { palaceTick, settleEnergy } from './palace';
import { peopleTick } from './people';
import { routineDeadlines, routineTick } from './routine';
import { statusTick } from './statuses';
import type { GameState } from './types';
import { unrestEvents } from './unrest';
import { addUnrest, event } from './util';
import { crownArmies, garrisonRecover, hostileArmies, regionDefense, warTick } from './war';
import { REGION_ORDER, PROVINCES, REGIONS } from './geography';

export function advanceTurn(state: GameState): void {
  if (state.over) return;
  settleEnergy(state);
  state.turn += 1;
  const w = state.world;

  for (const o of state.orders) {
    if (!o.edict && o.status === 'transit' && o.arriveTurn <= state.turn) {
      o.status = 'done';
      deliver(state, o);
      if (state.over) return;
    }
  }
  edictTick(state);
  if (state.over) return;
  dipTick(state);
  routineDeadlines(state);
  // 便宜行事的督撫：所請自行准行
  for (const d of state.docs) {
    if (d.delegatedBy && d.request && !d.decision && d.arriveTurn < state.turn) decide(state, d.id, 'approve');
  }
  peopleTick(state);

  casesTick(state);
  if (state.over) return;
  watchReport(state);
  warTick(state);
  if (state.over) return;
  foreignTick(state);
  unrestEvents(state);
  garrisonRecover(state);
  economyTick(state);
  unrestTick(state);
  if (w.mods.debasedTurn && state.turn === w.mods.debasedTurn) {
    addUnrest(state, 'jingshi', 15);
    event(state, 'routine', '大錢行使既久，物價騰貴，京師小民怨嗟。', true);
  }
  factionTick(state);

  courtTick(state);
  routineTick(state);
  palaceTick(state);
  if (state.over) return;
  haremTick(state);
  dowagerTick(state);
  assassinTick(state);
  if (state.over) return;
  literaryTick(state);
  dilemmaTick(state);
  statusTick(state);

  // 親征結束
  const ca = w.emperor.campaignArmy;
  if (ca !== undefined) {
    const a = w.armies.find((x) => x.id === ca);
    if (!a || !a.active || a.region === w.capital) w.emperor.campaignArmy = undefined;
  }

  // 戶部帳目晚一旬；閹黨戶部會粉飾
  const hb = state.chars.hubu;
  const pad = hb.faction === 'yan' && hb.integrity < 0.45 ? 1.2 : 1;
  state.reportedTreasury = (w.treasuryLog[w.treasuryLog.length - 2] ?? w.treasury) * pad;
  state.reportedGrain = w.grainLog[w.grainLog.length - 2] ?? w.grain;

  checkEnd(state);
}

function checkEnd(state: GameState): void {
  const w = state.world;
  w.negTreasury = w.treasury < 0 ? w.negTreasury + 1 : 0;
  w.negGrain = w.grain < 0 ? w.negGrain + 1 : 0;
  if (w.negTreasury >= 3) {
    event(state, 'court', '國庫空竭，京營欠餉三旬，譁變於京師。', true);
    state.over = { reason: 'mutiny', turn: state.turn };
    return;
  }
  if (w.negGrain >= 3) {
    event(state, 'court', '太倉粒米無存，京師饑民搶糧，禁軍乏食，城中大亂。', true);
    state.over = { reason: 'famine', turn: state.turn };
    return;
  }
  if (w.prestige <= 0) {
    event(state, 'court', '朝望掃地，群臣伏闕，太后下懿旨，廢帝別立。', true);
    state.over = { reason: 'coup', turn: state.turn };
    return;
  }
  // 中興：第七十二旬以後，連續六旬達成
  if (state.turn >= 72) {
    const z = zhongxing(state);
    w.zxStreak = z.every((x) => x.ok) ? w.zxStreak + 1 : 0;
    if (w.zxStreak >= 6) {
      event(state, 'court', '內外肅清，府庫充實，四夷賓服，海內稱中興焉。', true);
      state.over = { reason: 'zhongxing', turn: state.turn };
      return;
    }
  }
  if (state.turn >= state.maxTurn) state.over = { reason: w.capital === 'jingshi' ? 'survived' : 'southern', turn: state.turn };
}

/** 中興條件（介面「大計」也用它，但只顯示據報） */
export function zhongxing(state: GameState): { label: string; ok: boolean }[] {
  const w = state.world;
  const eu = state.cases.find((c) => c.def === 'eunuch');
  const un = state.cases.find((c) => c.def === 'uncle');
  const rebels = hostileArmies(state).filter((a) => (a.side === 'bandit' || a.side === 'rebel') && a.size > 10000 && REGIONS[a.region].kind !== 'outer');
  const jz = w.powers.jianzhou;
  const jzOk = !alive(state, 'jianzhou') || jz.standing === 'truce' || jz.standing === 'vassal' || jz.strength < regionDefense(state, 'liaodong') * 1.5;
  const avg = PROVINCES.reduce((n, p) => n + w.regions[p].unrest, 0) / PROVINCES.length;
  return [
    { label: '權閹之患已除', ok: !eu || !!eu.data.removed || (!!eu.data.coopted && eu.branch === 'greed') },
    { label: '宗室之患已息', ok: !un || !!un.resolved || un.branch === 'content' || !!un.data.inCapital },
    { label: '流寇叛軍盡平（無萬人以上之眾）', ok: rebels.length === 0 },
    { label: '建州或臣服、或議和、或不足為患', ok: jzOk },
    { label: '本朝無陷落之地', ok: REGION_ORDER.every((r) => !w.regions[r].heldBy) },
    { label: '國庫一百二十萬以上', ok: w.treasury >= 120 },
    { label: '朝望「頗孚眾望」以上', ok: w.prestige >= 55 },
    { label: '天下民心安靜', ok: avg < 45 },
  ];
}

export { crownArmies };
