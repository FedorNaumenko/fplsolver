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

/** FPL scoring by position: goal, clean sheet. Index is element_type. */
const GOAL_POINTS: Record<number, number> = { 1: 6, 2: 6, 3: 5, 4: 4 };
const CLEAN_SHEET_POINTS: Record<number, number> = { 1: 4, 2: 4, 3: 1, 4: 0 };
const ASSIST_POINTS = 3;
const APPEARANCE_POINTS = 2;

/**
 * How much of the per-game estimate is drawn from xG rather than form/points-per-game.
 *
 * Two weights, not one, because the term being blended against changes meaning:
 * pre-season it is last season's points-per-game (same period as the xG, so they
 * sit on equal footing), in-season it is a 4-game rolling form average (a fresher
 * signal than season-to-date xG, so lean on xG slightly less). These are the
 * calibration knobs — tune them here.
 */
export const XG_WEIGHT_PRESEASON = 0.45;
export const XG_WEIGHT_IN_SEASON = 0.35;

/**
 * Expected points per 90 built from FPL's own scoring rules applied to the xG rates
 * in bootstrap-static. Clean-sheet probability is the Poisson zero for the player's
 * expected goals conceded — one line, and honest about being an estimate.
 *
 * Returns 0 when the player has no xG signal at all (no minutes: new signings,
 * youth). Callers must treat 0 as "no signal" and fall back, not as a real forecast.
 */
export function xgPointsPer90(player: Player): number {
  const xG90 = Number(player.expected_goals_per_90) || 0;
  const xA90 = Number(player.expected_assists_per_90) || 0;
  const xGC90 = Number(player.expected_goals_conceded_per_90) || 0;
  if (xG90 === 0 && xA90 === 0 && xGC90 === 0) return 0;

  const attacking = xG90 * (GOAL_POINTS[player.element_type] ?? 4) + xA90 * ASSIST_POINTS;

  const cleanSheetPoints = CLEAN_SHEET_POINTS[player.element_type] ?? 0;
  // P(0 goals conceded) under Poisson. xGC90 of 0 would imply a certain clean sheet,
  // which is a data gap rather than a prediction — score no defensive points for it.
  const defending = xGC90 > 0 ? Math.exp(-xGC90) * cleanSheetPoints : 0;

  // Keepers earn 1 point per 3 saves; approximate the rate over minutes played.
  const saves90 = player.minutes > 0 ? (player.saves / player.minutes) * 90 : 0;
  const saving = player.element_type === 1 ? saves90 / 3 : 0;

  return APPEARANCE_POINTS + attacking + defending + saving;
}

/**
 * Projected points over `numGW` upcoming fixtures starting `gwOffset` ahead.
 *
 * Blends an xG-derived per-90 estimate with form (or points-per-game pre-season,
 * when form is 0 for every player), then scales by fixture difficulty and expected
 * minutes. A player with no xG signal falls back to form/PPG alone rather than
 * being penalised for missing data.
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
  const historic = form > 0 ? form : ppg;

  const xg = xgPointsPer90(player);
  // No xG signal → the blend would only drag the estimate toward zero, so skip it.
  const weight = xg === 0 ? 0 : form > 0 ? XG_WEIGHT_IN_SEASON : XG_WEIGHT_PRESEASON;
  const base = weight * xg + (1 - weight) * historic;
  if (base === 0) return 0;
  const avgDifficulty = playerFixtures.reduce((sum, f) => {
    const isHome = f.team_h === player.team;
    return sum + (isHome ? f.team_h_difficulty : f.team_a_difficulty);
  }, 0) / playerFixtures.length;
  const difficultyMultiplier = Math.max(0.2, (6 - avgDifficulty) / 3);
  const minutesMultiplier = getMinutesMultiplier(player, gameweeksPlayed);
  return Math.round(base * playerFixtures.length * difficultyMultiplier * minutesMultiplier * 10) / 10;
}
