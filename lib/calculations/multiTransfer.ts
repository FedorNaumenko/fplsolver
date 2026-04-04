import type { Player, Fixture, MultiTransferPlan, PlannedTransfer } from '../types';

function getMinutesMultiplier(player: Player, currentGameweek: number): number {
  if (currentGameweek === 0 || player.minutes === 0) return 0;
  const avgMins = player.minutes / currentGameweek;
  if (avgMins >= 60) return 1.0;
  if (avgMins >= 45) return 0.8;
  if (avgMins >= 30) return 0.5;
  if (avgMins >= 15) return 0.25;
  return 0;
}

function calcXPts(player: Player, fixtures: Fixture[], currentGW: number, numGW: number, gwOffset: number = 0): number {
  const playerFixtures = fixtures
    .filter(f => !f.finished && (f.team_h === player.team || f.team_a === player.team))
    .slice(gwOffset, gwOffset + numGW);
  if (playerFixtures.length === 0) return 0;
  const form = parseFloat(player.form) || 0;
  const ppg = Number(player.points_per_game) || 0;
  const base = form > 0 ? form : ppg;
  if (base === 0) return 0;
  const avgDifficulty = playerFixtures.reduce((sum, f) => {
    const isHome = f.team_h === player.team;
    return sum + (isHome ? f.team_h_difficulty : f.team_a_difficulty);
  }, 0) / playerFixtures.length;
  const difficultyMultiplier = Math.max(0.2, (6 - avgDifficulty) / 3);
  const minutesMultiplier = getMinutesMultiplier(player, currentGW);
  return Math.round(base * playerFixtures.length * difficultyMultiplier * minutesMultiplier * 10) / 10;
}

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
