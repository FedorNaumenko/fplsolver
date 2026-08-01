import type { Player, Fixture, TransferSuggestion } from '../types';
import { calcExpectedPoints as calculatePlayerExpectedPoints } from './xPts';

export function generateTransferSuggestions(
  squad: Player[],
  allPlayers: Player[],
  fixtures: Fixture[],
  bankInTenths: number,
  currentGameweek: number,
  numGameweeks: number = 3,
  topN: number = 5,
  gwOffset: number = 0
): TransferSuggestion[] {
  const suggestions: TransferSuggestion[] = [];
  const squadIds = new Set(squad.map(p => p.id));

  for (const playerOut of squad) {
    const maxSpend = playerOut.now_cost + bankInTenths;
    const expectedOut = calculatePlayerExpectedPoints(playerOut, fixtures, currentGameweek, numGameweeks, gwOffset);
    const best = allPlayers
      .filter(p => !squadIds.has(p.id) && p.element_type === playerOut.element_type && p.now_cost <= maxSpend && p.status === 'a')
      .map(p => ({ player: p, ep: calculatePlayerExpectedPoints(p, fixtures, currentGameweek, numGameweeks, gwOffset) }))
      .sort((a, b) => b.ep - a.ep)[0];
    if (!best) continue;
    const gain = Math.round((best.ep - expectedOut) * 10) / 10;
    if (gain <= 0) continue;
    const costDiff = best.player.now_cost - playerOut.now_cost;
    const costStr = costDiff === 0 ? 'same price' : costDiff > 0 ? `costs £${(costDiff / 10).toFixed(1)}m more` : `saves £${(Math.abs(costDiff) / 10).toFixed(1)}m`;
    const avgMinsIn = currentGameweek > 0 ? Math.round(best.player.minutes / currentGameweek) : 0;
    const avgMinsOut = currentGameweek > 0 ? Math.round(playerOut.minutes / currentGameweek) : 0;
    const ppgIn = Number(best.player.points_per_game).toFixed(1);
    const ppgOut = Number(playerOut.points_per_game).toFixed(1);
    suggestions.push({
      playerOut,
      playerIn: best.player,
      cost: costDiff,
      expectedPointsGain: gain,
      reasoning: `${best.player.web_name} (form ${parseFloat(best.player.form).toFixed(1)}, ppg ${ppgIn}, ~${avgMinsIn} min/GW, xPts ${best.ep}) replaces ${playerOut.web_name} (form ${parseFloat(playerOut.form).toFixed(1)}, ppg ${ppgOut}, ~${avgMinsOut} min/GW, xPts ${expectedOut}) — ${costStr}`,
      priority: gain >= 5 ? 'high' : gain >= 2 ? 'medium' : 'low',
    });
  }
  return suggestions.sort((a, b) => b.expectedPointsGain - a.expectedPointsGain).slice(0, topN);
}
