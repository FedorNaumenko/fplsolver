import type { Player, Fixture, TransferSuggestion } from '../types';

function calculatePlayerExpectedPoints(
  player: Player,
  fixtures: Fixture[],
  numGW: number = 3
): number {
  const playerFixtures = fixtures
    .filter(f => !f.finished && (f.team_h === player.team || f.team_a === player.team))
    .slice(0, numGW);

  if (playerFixtures.length === 0) return 0;

  const form = parseFloat(player.form) || 0;
  const avgDifficulty =
    playerFixtures.reduce((sum, f) => {
      const isHome = f.team_h === player.team;
      return sum + (isHome ? f.team_h_difficulty : f.team_a_difficulty);
    }, 0) / playerFixtures.length;

  const difficultyMultiplier = (6 - avgDifficulty) / 3;
  return Math.round(form * playerFixtures.length * difficultyMultiplier * 10) / 10;
}

export function generateTransferSuggestions(
  squad: Player[],
  allPlayers: Player[],
  fixtures: Fixture[],
  bankInTenths: number,
  numGameweeks: number = 3,
  topN: number = 5
): TransferSuggestion[] {
  const suggestions: TransferSuggestion[] = [];
  const squadIds = new Set(squad.map(p => p.id));

  for (const playerOut of squad) {
    const maxSpend = playerOut.now_cost + bankInTenths;
    const expectedOut = calculatePlayerExpectedPoints(playerOut, fixtures, numGameweeks);

    const best = allPlayers
      .filter(
        p =>
          !squadIds.has(p.id) &&
          p.element_type === playerOut.element_type &&
          p.now_cost <= maxSpend &&
          p.status === 'a'
      )
      .map(p => ({ player: p, ep: calculatePlayerExpectedPoints(p, fixtures, numGameweeks) }))
      .sort((a, b) => b.ep - a.ep)[0];

    if (!best) continue;

    const gain = Math.round((best.ep - expectedOut) * 10) / 10;
    if (gain <= 0) continue;

    const costDiff = best.player.now_cost - playerOut.now_cost;
    const costStr =
      costDiff === 0
        ? 'same price'
        : costDiff > 0
        ? `costs £${(costDiff / 10).toFixed(1)}m more`
        : `saves £${(Math.abs(costDiff) / 10).toFixed(1)}m`;

    suggestions.push({
      playerOut,
      playerIn: best.player,
      cost: costDiff,
      expectedPointsGain: gain,
      reasoning: `${best.player.web_name} (form ${parseFloat(best.player.form).toFixed(1)}, xPts ${best.ep}) replaces ${playerOut.web_name} (form ${parseFloat(playerOut.form).toFixed(1)}, xPts ${expectedOut}) — ${costStr}`,
      priority: gain >= 5 ? 'high' : gain >= 2 ? 'medium' : 'low',
    });
  }

  return suggestions.sort((a, b) => b.expectedPointsGain - a.expectedPointsGain).slice(0, topN);
}
