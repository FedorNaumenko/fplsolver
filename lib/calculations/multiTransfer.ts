import type { Player, Fixture, MultiTransferPlan, PlannedTransfer } from '../types';
import { calcExpectedPoints as calcXPts } from './xPts';

export function planMultipleTransfers(
  squad: Player[],
  allPlayers: Player[],
  fixtures: Fixture[],
  bankInTenths: number,
  currentGameweek: number,
  freeTransfers: number,
  numTransfers: number,
  numGameweeks: number = 3,
  gwOffset: number = 0
): MultiTransferPlan {
  let currentSquad = [...squad];
  let currentBank = bankInTenths;
  const currentSquadIds = new Set(squad.map(p => p.id));
  const plannedTransfers: PlannedTransfer[] = [];

  for (let i = 0; i < numTransfers; i++) {
    let bestGain = 0;
    let bestTransfer: PlannedTransfer | null = null;
    for (const playerOut of currentSquad) {
      const maxSpend = playerOut.now_cost + currentBank;
      const xPtsOut = calcXPts(playerOut, fixtures, currentGameweek, numGameweeks, gwOffset);
      const best = allPlayers
        .filter(p => !currentSquadIds.has(p.id) && p.element_type === playerOut.element_type && p.now_cost <= maxSpend && p.status === 'a')
        .map(p => ({ player: p, ep: calcXPts(p, fixtures, currentGameweek, numGameweeks, gwOffset) }))
        .sort((a, b) => b.ep - a.ep)[0];
      if (!best) continue;
      const gain = Math.round((best.ep - xPtsOut) * 10) / 10;
      if (gain > bestGain) {
        bestGain = gain;
        bestTransfer = { playerOut, playerIn: best.player, costDiff: best.player.now_cost - playerOut.now_cost, xPtsGain: gain };
      }
    }
    if (!bestTransfer || bestGain <= 0) break;
    currentSquad = currentSquad.filter(p => p.id !== bestTransfer!.playerOut.id).concat([bestTransfer.playerIn]);
    currentBank = currentBank + bestTransfer.playerOut.now_cost - bestTransfer.playerIn.now_cost;
    currentSquadIds.delete(bestTransfer.playerOut.id);
    currentSquadIds.add(bestTransfer.playerIn.id);
    plannedTransfers.push(bestTransfer);
  }

  const totalXPtsGain = Math.round(plannedTransfers.reduce((sum, t) => sum + t.xPtsGain, 0) * 10) / 10;
  const extraTransfers = Math.max(0, plannedTransfers.length - freeTransfers);
  const pointsHit = extraTransfers * 4;
  const netGain = Math.round((totalXPtsGain - pointsHit) * 10) / 10;
  return { transfers: plannedTransfers, totalXPtsGain, pointsHit, netGain };
}
