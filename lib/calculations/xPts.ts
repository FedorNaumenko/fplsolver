// Shared expected-points model.
//
// This was copy-pasted verbatim into multiTransfer.ts and transferSuggestions.ts
// (identical bodies, only the parameter name differed). squadBuilder.ts needs it
// too, so it lives in one place now.

import type { Player, Fixture } from '../types';

/**
 * How much of a match the player is expected to feature for, derived from minutes
 * played per gameweek.
 *
 * `gameweeksPlayed` is the divisor, not the gameweek being projected. In-season
 * that is the current gameweek. Pre-season FPL still reports *last* season's
 * minutes total, so pass 38 to turn it back into a per-game average — which also
 * correctly zeroes players whose high points-per-game comes from one cameo.
 */
export function getMinutesMultiplier(player: Player, gameweeksPlayed: number): number {
  if (gameweeksPlayed === 0 || player.minutes === 0) return 0;
  const avgMins = player.minutes / gameweeksPlayed;
  if (avgMins >= 60) return 1.0;
  if (avgMins >= 45) return 0.8;
  if (avgMins >= 30) return 0.5;
  if (avgMins >= 15) return 0.25;
  return 0;
}

/**
 * Projected points over `numGW` upcoming fixtures starting `gwOffset` ahead.
 * Falls back to points-per-game when form is 0, which is every player pre-season.
 */
export function calcExpectedPoints(
  player: Player,
  fixtures: Fixture[],
  gameweeksPlayed: number,
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
  const minutesMultiplier = getMinutesMultiplier(player, gameweeksPlayed);
  return Math.round(base * playerFixtures.length * difficultyMultiplier * minutesMultiplier * 10) / 10;
}
