// 推進一旬：旨意送達 → 政務逾期 → 疑案演化 → 兵事 → 錢糧民心 → 新奏報 → 判定終局。

import { casesTick } from './cases';
import { courtTick } from './court';
import { economyTick, unrestTick } from './economy';
import { deliver } from './orders';
import { foreignTick } from './foreign';
import { palaceTick } from './palace';
import { unrestEvents } from './unrest';
import { routineDeadlines, routineTick } from './routine';
import type { GameState } from './types';
import { addUnrest, event } from './util';
import { garrisonRecover, warTick } from './war';

export function advanceTurn(state: GameState): void {
  if (state.over) return;
  state.turn += 1;
  const w = state.world;

  for (const o of state.orders) {
    if (o.status === 'transit' && o.arriveTurn <= state.turn) {
      o.status = 'done';
      deliver(state, o);
      if (state.over) return;
    }
  }
  routineDeadlines(state);

  casesTick(state);
  if (state.over) return;
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

  courtTick(state);
  routineTick(state);
  palaceTick(state);
  if (state.over) return;

  // 戶部帳目晚一旬
  state.reportedTreasury = w.treasuryLog[w.treasuryLog.length - 2] ?? w.treasury;
  state.reportedGrain = w.grainLog[w.grainLog.length - 2] ?? w.grain;

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
  if (state.turn >= state.maxTurn) {
    state.over = { reason: 'survived', turn: state.turn };
    return;
  }
  state.energy = state.energyCap;
}
