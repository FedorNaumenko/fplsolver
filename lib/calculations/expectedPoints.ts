// Expected points calculations

import type { Player, Fixture } from '../types';

/**
 * Calculate expected points for a player over the next N gameweeks
 * This is a simplified algorithm - you'll want to enhance this
 */
export function calculateExpectedPoints(
  player: Player,
  upcomingFixtures: Fixture[],
  numGameweeks: number = 3
): number {
  // Base calculation using form and fixture difficulty
  const form = parseFloat(player.form) || 0;
  
  // Average fixture difficulty (lower is easier)
  const avgDifficulty = upcomingFixtures
    .slice(0, numGameweeks)
    .reduce((sum, fixture) => sum + fixture.team_h_difficulty, 0) / numGameweeks;
  
  // Simple formula: form adjusted by fixture difficulty
  // You can make this much more sophisticated
  const difficultyMultiplier = (6 - avgDifficulty) / 3; // Scale: easier = higher
  const expectedPoints = form * numGameweeks * difficultyMultiplier;
  
  return Math.round(expectedPoints * 10) / 10;
}

/**
 * Calculate fixture difficulty rating for upcoming games
 */
export function getFixtureDifficulty(
  fixtures: Fixture[],
  teamId: number,
  numGameweeks: number = 5
): number {
  const upcomingFixtures = fixtures
    .filter(f => !f.finished)
    .slice(0, numGameweeks);
  
  const totalDifficulty = upcomingFixtures.reduce((sum, fixture) => {
    const isHome = fixture.team_h === teamId;
    return sum + (isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty);
  }, 0);
  
  return totalDifficulty / upcomingFixtures.length;
}

/**
 * Calculate value score (points per million)
 */
export function calculateValueScore(player: Player): number {
  const priceInMillions = player.now_cost / 10;
  return player.total_points / priceInMillions;
}

/**
 * Calculate transfer value
 * Positive = good transfer, negative = bad transfer
 */
export function calculateTransferValue(
  playerOut: Player,
  playerIn: Player,
  upcomingFixtures: Fixture[],
  numGameweeks: number = 3
): number {
  const pointsGainedIn = calculateExpectedPoints(playerIn, upcomingFixtures, numGameweeks);
  const pointsLostOut = calculateExpectedPoints(playerOut, upcomingFixtures, numGameweeks);
  
  return pointsGainedIn - pointsLostOut;
}
