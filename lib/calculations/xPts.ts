// The expected-points model.
//
// Rebuilt as an explicit sum of the ways FPL actually awards points, rather than the
// previous `(form or PPG) × fixture difficulty × minutes` stack of fudge factors. That
// version ignored availability, bonus, starts, penalties and home advantage entirely,
// and — structurally worse — multiplied a player's *appearance* points by fixture
// difficulty, so a hard fixture reduced the two points you get for turning up.
//
// Everything here comes from bootstrap-static. Opponent strength would be a better
// fixture signal than FPL's 1-5 difficulty rating, but `strength_attack_*` and
// `strength_defence_*` are all zeros pre-season, so difficulty is what there is.

import type { Player, Fixture } from '../types';

/** FPL scoring, by element_type. */
const GOAL_POINTS: Record<number, number> = { 1: 6, 2: 6, 3: 5, 4: 4 };
const CLEAN_SHEET_POINTS: Record<number, number> = { 1: 4, 2: 4, 3: 1, 4: 0 };
const ASSIST_POINTS = 3;
const RED_CARD_POINTS = 3;
/** A goalkeeper or defender loses a point for every two goals conceded. */
const CONCEDED_POINTS_PER_GOAL = 0.5;

// ── Tunables. Each is a knob, kept named so it can be calibrated once real
// gameweek results exist to check the model against. ──

/**
 * How much a fixture swings attacking returns. Difficulty 1 lifts them ~36%, difficulty
 * 5 cuts them ~36%. Deliberately gentler than the old `(6 − fdr) / 3`, which ranged from
 * 0.33 to 1.67 and dominated everything else in the model.
 */
const FIXTURE_ATTACK_SWING = 0.18;
/** How much a fixture swings expected goals conceded, in the opposite direction. */
const FIXTURE_DEFENCE_SWING = 0.22;
/** Home advantage on attacking returns; the inverse is applied to goals conceded. */
const HOME_BONUS = 0.08;
/**
 * First-choice penalty and set-piece duty. Small on purpose: a player's season xG
 * already contains the penalties they took, so a large bump double-counts. It exists to
 * separate two players whose underlying numbers are otherwise alike.
 */
const PENALTY_BUMP = 0.06;
const SET_PIECE_BUMP = 0.03;
/**
 * Weight on points-per-game as a sanity prior. The components are the model; this pulls
 * a player whose parts disagree wildly with their actual scoring back toward reality.
 */
const PRIOR_WEIGHT = 0.25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v)) || 0;

/**
 * Probability the player is available at all, 0–1.
 *
 * `chance_of_playing_next_round` is published for the ~56 players carrying a doubt and
 * was previously ignored outright, so a 25%-to-play player projected as if fully fit.
 * When no percentage is published, an unavailable status means unavailable — writing
 * this as `chance ?? 100` would quietly restore the bug it fixes.
 */
export function availability(player: Player): number {
  const chance = player.chance_of_playing_next_round;
  if (chance !== null && chance !== undefined) return clamp(chance, 0, 100) / 100;
  return player.status === 'a' ? 1 : 0;
}

/**
 * How much of a match this player is expected to play.
 *
 * `share` scales the per-90 rates; `appear` and `full` drive appearance points, which are
 * 1 for playing at all and 2 from 60 minutes. `starts_per_90` separates a starter who is
 * sometimes rotated from a substitute who always gets twenty minutes — the old single
 * step function on minutes could not tell them apart.
 */
function minutesProfile(player: Player, gameweeksPlayed: number) {
  if (gameweeksPlayed <= 0 || player.minutes <= 0) return { share: 0, appear: 0, full: 0 };
  const perGameweek = player.minutes / gameweeksPlayed;
  const startRate = clamp(num(player.starts_per_90), 0, 1);
  return {
    share: clamp(perGameweek / 90, 0, 1),
    appear: clamp(perGameweek / 20, 0, 1),
    // A player who never starts rarely reaches the hour, however many minutes they total.
    full: clamp((perGameweek - 25) / 45, 0, 1) * clamp(0.4 + 0.6 * startRate, 0, 1),
  };
}

/** Per-90 rates derived from season totals the API does not publish as rates. */
function per90(player: Player, total: number): number {
  return player.minutes > 0 ? (total / player.minutes) * 90 : 0;
}

/** Expected points from one fixture, before availability is applied. */
function pointsForFixture(
  player: Player,
  difficulty: number,
  isHome: boolean,
  gameweeksPlayed: number
): number {
  const mins = minutesProfile(player, gameweeksPlayed);
  if (mins.share === 0) return 0;

  const pos = player.element_type;
  const attackMultiplier =
    (1 + (3 - difficulty) * FIXTURE_ATTACK_SWING) * (isHome ? 1 + HOME_BONUS : 1 - HOME_BONUS);
  const duty =
    (player.penalties_order === 1 ? 1 + PENALTY_BUMP : 1) *
    (player.corners_and_indirect_freekicks_order === 1 || player.direct_freekicks_order === 1
      ? 1 + SET_PIECE_BUMP
      : 1);

  // Attacking returns: scaled by the fixture, never by anything else in this function.
  const attacking =
    (num(player.expected_goals_per_90) * (GOAL_POINTS[pos] ?? 4) +
      num(player.expected_assists_per_90) * ASSIST_POINTS) *
    mins.share * attackMultiplier * duty;

  // Goals conceded move the other way: a harder fixture, or being away, means more.
  const xGC =
    num(player.expected_goals_conceded_per_90) *
    (1 + (difficulty - 3) * FIXTURE_DEFENCE_SWING) *
    (isHome ? 1 - HOME_BONUS : 1 + HOME_BONUS);

  // A clean sheet only pays from 60 minutes, so it rides on `full`, not `share`.
  const cleanSheet = xGC > 0 ? Math.exp(-xGC) * (CLEAN_SHEET_POINTS[pos] ?? 0) * mins.full : 0;
  const conceded = pos <= 2 ? -CONCEDED_POINTS_PER_GOAL * xGC * mins.share : 0;
  const saves = pos === 1 ? (num(player.saves_per_90) / 3) * mins.share : 0;

  // Bonus is roughly a tenth of a good player's return and scored zero until now.
  const bonus = per90(player, player.bonus) * mins.share;
  const cards =
    -(per90(player, player.yellow_cards) + RED_CARD_POINTS * per90(player, player.red_cards)) *
    mins.share;

  // Appearance points do not depend on the opponent. The old model multiplied them by
  // fixture difficulty, which is the structural error this rewrite exists to fix.
  const appearance = mins.appear + mins.full;

  const components = appearance + attacking + cleanSheet + conceded + saves + bonus + cards;

  // Points-per-game as a light prior. Ignored when there is nothing to compare against.
  const prior = num(player.points_per_game);
  const blended = prior > 0 ? (1 - PRIOR_WEIGHT) * components + PRIOR_WEIGHT * prior : components;
  return Math.max(0, blended);
}

/**
 * The fixtures a player actually has in the projection window.
 *
 * The window is `numGW` *gameweeks* taken from the season's upcoming events, not `numGW`
 * entries of this player's own fixture list. Slicing the list by index quietly slid the
 * horizon whenever a team had a blank, and counted a double gameweek as two gameweeks.
 * There are no blanks or doubles in the fixture list today, so this is correctness for
 * the moment one appears rather than a visible fix.
 */
function fixturesInWindow(
  player: Player,
  fixtures: Fixture[],
  numGW: number,
  gwOffset: number
): Fixture[] {
  const upcoming = fixtures.filter(f => !f.finished && f.event !== null);
  const events = [...new Set(upcoming.map(f => f.event))].sort((a, b) => a - b);
  const window = new Set(events.slice(gwOffset, gwOffset + numGW));
  return upcoming.filter(
    f => window.has(f.event) && (f.team_h === player.team || f.team_a === player.team)
  );
}

/**
 * Projected points over `numGW` gameweeks starting `gwOffset` ahead.
 *
 * Summed per fixture, so a double gameweek scores twice and a blank scores nothing.
 */
export function calcExpectedPoints(
  player: Player,
  fixtures: Fixture[],
  gameweeksPlayed: number,
  numGW: number = 3,
  gwOffset: number = 0
): number {
  const avail = availability(player);
  if (avail === 0) return 0;

  const window = fixturesInWindow(player, fixtures, numGW, gwOffset);
  if (window.length === 0) return 0;

  const total = window.reduce((sum, f) => {
    const isHome = f.team_h === player.team;
    const difficulty = isHome ? f.team_h_difficulty : f.team_a_difficulty;
    return sum + pointsForFixture(player, difficulty, isHome, gameweeksPlayed);
  }, 0);

  return Math.round(total * avail * 10) / 10;
}

/**
 * A neutral per-90 estimate, kept for callers that want a player's underlying rate with
 * no fixture attached. Same components, difficulty 3, at home.
 */
export function xgPointsPer90(player: Player, gameweeksPlayed: number = 38): number {
  return pointsForFixture(player, 3, true, gameweeksPlayed);
}
