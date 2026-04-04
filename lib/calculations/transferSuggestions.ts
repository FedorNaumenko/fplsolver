import type { Player, Fixture, TransferSuggestion } from '../types';

function getMinutesMultiplier(player: Player, currentGameweek: number): number {
  if (currentGameweek === 0 || player.minutes === 0) return 0;
  const avgMins = player.minutes / currentGameweek;
  if (avgMins >= 60) return 1.0;
  if (avgMins >= 45) return 0.8;
  if (avgMins >= 30) return 0.5;
  if (avgMins >= 15) return 0.25;
  return 0;
}

function calculatePlayerExpectedPoints(
  player: Player,
  fixtures: Fixture[],
  currentGameweek: number,
  numGW: number = 3,
  gwOffset: number = 0
): number {
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
  const minutesMultiplier = getMinutesMultiplier(player, currentGameweek);
  return Math.round(base * playerFixtures.length * difficultyMultiplier * minutesMultiplier * 10) / 10;
}

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
