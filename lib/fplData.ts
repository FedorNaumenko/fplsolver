// Browser-side replacements for what used to be app/api/*/route.ts.
// GitHub Pages is static, so these run in the client instead of on a server;
// the transforms and calculations are unchanged, only the transport moved.
import { FPLApi } from '@/lib/api/fpl';
import type {
  Player,
  Team,
  PickInfo,
  PlayerFixture,
  PlayerHistoryEntry,
  Fixture,
  GameweekData,
  TransferSuggestion,
  MultiTransferPlan,
} from '@/lib/types';
import { generateTransferSuggestions } from '@/lib/calculations/transferSuggestions';
import { planMultipleTransfers } from '@/lib/calculations/multiTransfer';
import { buildOptimalSquad, PRESEASON_GAMEWEEKS } from '@/lib/calculations/squadBuilder';
import { settingsFromBootstrap, type SquadSettings } from '@/lib/calculations/squadRules';
import { transferRulesFromBootstrap, type ChipDef, type TransferRules } from '@/lib/planning/seasonPlan';

export interface TeamData {
  squad: Player[];
  picks: PickInfo[];
  budget: number;
  teamValue: number;
  currentGameweek: number;
  teams: Team[];
  managerName: string;
  playerFixtures: Record<number, PlayerFixture[]>;
  /** The pitch cards project from this; they used to carry their own copy of the model. */
  fixtures: Fixture[];
  /**
   * Divisor for the minutes multiplier — gameweeks the `minutes` total covers. In-season
   * that is the current gameweek; pre-season `minutes` still holds last season's total,
   * so it is a full 38. Carried here so every consumer uses the same value.
   */
  gameweeksPlayed: number;
  /** Chip definitions straight from the API — windows and counts are never hardcoded. */
  chips: ChipDef[];
  /** Free-transfer cap and hit cost, from game_settings. */
  transferRules: TransferRules;
  /** Upcoming gameweek ids the planner can span. */
  upcomingGameweeks: number[];
}

export interface TransfersData {
  suggestions: TransferSuggestion[];
  plan2: MultiTransferPlan;
  plan3: MultiTransferPlan;
  wildcard: MultiTransferPlan;
}

export interface PlayerDetailData {
  fixtures: PlayerFixture[];
  history: PlayerHistoryEntry[];
}

function assertManagerId(managerId: string | number): number {
  const id = Number(managerId);
  if (!managerId || isNaN(id)) throw new Error('Invalid manager ID');
  return id;
}

/**
 * A message already fit to show the user. The catch-alls below deliberately mask
 * internal failures behind "check your Manager ID", which is the wrong advice for
 * conditions no manager ID can fix — so these pass through untouched.
 */
export class FplNotice extends Error {}

/**
 * FPL clears `current_event` between seasons, and per-gameweek picks only exist
 * once that gameweek's deadline has passed. Pre-season there is therefore no squad
 * to fetch for anyone: `entry/<id>/event/1/picks/` 404s and `my-team/<id>/` needs
 * a logged-in session cookie. Say so rather than blaming the manager ID.
 */
function requireGameweek(
  bootstrap: { events: GameweekData[] },
  managerInfo: { current_event: number | null }
): number {
  if (managerInfo.current_event) return managerInfo.current_event;

  const next = bootstrap.events?.find(e => e.is_next);
  if (!next) {
    throw new FplNotice(
      'The season is between gameweeks and the next one is not published yet. Try again later.'
    );
  }

  const deadline = new Date(next.deadline_time);
  const when = isNaN(deadline.valueOf())
    ? ''
    : ` (${deadline.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })})`;
  throw new FplNotice(
    `The season hasn't started yet, so no squads exist to load. ` +
      `Teams become available once the ${next.name} deadline passes${when}.`
  );
}

type RawFixture = {
  event: number;
  finished: boolean;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string;
};

/**
 * How many upcoming fixtures to keep per player. Needs to cover the longest horizon (5)
 * plus room to step the starting gameweek, and it is also what bounds the season
 * planner — six was too shallow to plan around.
 */
const FIXTURE_DEPTH = 10;

/** Next few unplayed fixtures per player, which is what the projected-points toggle reads. */
function upcomingFixturesBySquadPlayer(
  squad: Player[],
  allFixtures: RawFixture[],
  teamMap: Record<number, string>
): Record<number, PlayerFixture[]> {
  const upcoming = allFixtures.filter(f => !f.finished);
  const byPlayer: Record<number, PlayerFixture[]> = {};
  for (const player of squad) {
    const teamId = player.team;
    byPlayer[player.id] = upcoming
      .filter(f => f.team_h === teamId || f.team_a === teamId)
      .sort((a, b) => a.event - b.event)
      .slice(0, FIXTURE_DEPTH)
      .map(f => {
        const isHome = f.team_h === teamId;
        return {
          event: f.event,
          event_name: `GW${f.event}`,
          is_home: isHome,
          difficulty: isHome ? f.team_h_difficulty : f.team_a_difficulty,
          kickoff_time: f.kickoff_time,
          opponent_short_name: teamMap[isHome ? f.team_a : f.team_h] ?? '?',
        };
      });
  }
  return byPlayer;
}

/** The next FIXTURE_DEPTH gameweek ids from `from` inclusive, for the season planner. */
function upcomingGameweekIds(events: GameweekData[], from: number): number[] {
  return events
    .filter(e => e.id >= from && !e.finished)
    .slice(0, FIXTURE_DEPTH)
    .map(e => e.id);
}

/** Squad, picks, budget and upcoming fixtures for a manager. */
export async function fetchTeamData(managerId: string | number): Promise<TeamData> {
  const id = assertManagerId(managerId);

  try {
    const [bootstrap, managerInfo, allFixtures] = await Promise.all([
      FPLApi.getBootstrapStatic(),
      FPLApi.getManagerTeam(id),
      FPLApi.getFixtures(),
    ]);

    const currentGameweek = requireGameweek(bootstrap, managerInfo);

    const picks = await FPLApi.getManagerPicks(id, currentGameweek);

    const allPlayers: Player[] = bootstrap.elements;
    const teams: Team[] = bootstrap.teams;

    const teamMap: Record<number, string> = Object.fromEntries(
      teams.map(t => [t.id, t.short_name])
    );

    const rawPicks: Array<{ element: number; position: number; multiplier: number; is_captain: boolean; is_vice_captain: boolean }> = picks.picks;

    const squad = rawPicks
      .map(p => allPlayers.find((pl: Player) => pl.id === p.element))
      .filter((p): p is Player => Boolean(p));

    const pickInfos: PickInfo[] = rawPicks.map(p => ({
      playerId: p.element,
      position: p.position,
      elementType: allPlayers.find((pl: Player) => pl.id === p.element)?.element_type ?? 0,
      isCaptain: p.is_captain,
      isViceCaptain: p.is_vice_captain,
      multiplier: p.multiplier,
    }));

    const playerFixtures = upcomingFixturesBySquadPlayer(squad, allFixtures, teamMap);

    return {
      squad,
      picks: pickInfos,
      budget: picks.entry_history.bank,
      teamValue: picks.entry_history.value,
      currentGameweek,
      teams,
      managerName: managerInfo.name,
      playerFixtures,
      fixtures: allFixtures as Fixture[],
      gameweeksPlayed: currentGameweek,
      chips: (bootstrap.chips ?? []) as ChipDef[],
      transferRules: transferRulesFromBootstrap(bootstrap.game_settings),
      upcomingGameweeks: upcomingGameweekIds(bootstrap.events as GameweekData[], currentGameweek),
    };
  } catch (error) {
    if (error instanceof FplNotice) throw error;
    console.error('Team fetch error:', error);
    throw new Error('Failed to fetch team. Check your Manager ID.');
  }
}

/** Single-transfer suggestions plus 2/3-transfer and wildcard plans. */
export async function fetchTransfers(
  managerId: string | number,
  gwOffsetRaw: number = 0,
  horizon: number = 3
): Promise<TransfersData> {
  const id = assertManagerId(managerId);
  const gwOffset = Math.max(0, Math.min(FIXTURE_DEPTH - 1, Number(gwOffsetRaw) || 0));

  try {
    const [bootstrap, managerInfo, fixtures] = await Promise.all([
      FPLApi.getBootstrapStatic(),
      FPLApi.getManagerTeam(id),
      FPLApi.getFixtures(),
    ]);
    const currentGameweek = requireGameweek(bootstrap, managerInfo);
    const picks = await FPLApi.getManagerPicks(id, currentGameweek);
    const allPlayers: Player[] = bootstrap.elements;
    const typedFixtures: Fixture[] = fixtures;
    const squadIds: number[] = picks.picks.map((p: { element: number }) => p.element);
    const squad = squadIds.map((sid: number) => allPlayers.find((p: Player) => p.id === sid)).filter((p): p is Player => Boolean(p));
    const bank: number = picks.entry_history.bank;
    const FREE_TRANSFERS = 1;
    const suggestions = generateTransferSuggestions(squad, allPlayers, typedFixtures, bank, currentGameweek, horizon, 5, gwOffset);
    const plan2 = planMultipleTransfers(squad, allPlayers, typedFixtures, bank, currentGameweek, FREE_TRANSFERS, 2, horizon, gwOffset);
    const plan3 = planMultipleTransfers(squad, allPlayers, typedFixtures, bank, currentGameweek, FREE_TRANSFERS, 3, horizon, gwOffset);
    const wildcard = planMultipleTransfers(squad, allPlayers, typedFixtures, bank, currentGameweek, 99, 8, horizon, gwOffset);
    return { suggestions, plan2, plan3, wildcard };
  } catch (error) {
    if (error instanceof FplNotice) throw error;
    console.error('Transfers fetch error:', error);
    throw new Error('Failed to generate transfer suggestions.');
  }
}

/**
 * TeamData plus what the squad editor needs to offer replacements. Kept separate from
 * TeamData so the in-season path doesn't carry a 564-player pool it never reads.
 */
export interface PreseasonData extends TeamData {
  allPlayers: Player[];
  settings: SquadSettings;
}

/**
 * Pre-season stand-in for a real squad: the best legal £100m XV the projection model
 * can find for the upcoming window. Shaped as TeamData so SquadDisplay, the drag-drop
 * subs and the projected-points toggle all work on it unchanged.
 */
export async function fetchPreseasonSquad(gwOffsetRaw: number = 0): Promise<PreseasonData> {
  const gwOffset = Math.max(0, Math.min(FIXTURE_DEPTH - 1, Number(gwOffsetRaw) || 0));
  const [bootstrap, fixtures] = await Promise.all([
    FPLApi.getBootstrapStatic(),
    FPLApi.getFixtures(),
  ]);

  const teams: Team[] = bootstrap.teams;
  const teamMap: Record<number, string> = Object.fromEntries(
    teams.map(t => [t.id, t.short_name])
  );
  // Squad limits come from the API rather than being hardcoded in the builder.
  const settings = settingsFromBootstrap(bootstrap.game_settings);
  const built = buildOptimalSquad(
    bootstrap.elements as Player[],
    fixtures as Fixture[],
    3,
    gwOffset,
    PRESEASON_GAMEWEEKS,
    settings
  );
  const nextGameweek: number =
    (bootstrap.events as GameweekData[]).find(e => e.is_next)?.id ?? 1;

  return {
    squad: built.squad,
    picks: built.picks,
    budget: built.bank,
    teamValue: built.teamValue,
    currentGameweek: nextGameweek,
    teams,
    managerName: `Suggested GW${nextGameweek} squad`,
    playerFixtures: upcomingFixturesBySquadPlayer(built.squad, fixtures, teamMap),
    gameweeksPlayed: PRESEASON_GAMEWEEKS,
    chips: (bootstrap.chips ?? []) as ChipDef[],
    transferRules: transferRulesFromBootstrap(bootstrap.game_settings),
    upcomingGameweeks: upcomingGameweekIds(bootstrap.events as GameweekData[], nextGameweek),
    allPlayers: bootstrap.elements as Player[],
    fixtures: fixtures as Fixture[],
    settings,
  };
}

/** Upcoming fixtures and recent history for one player. */
export async function fetchPlayerDetail(playerId: number): Promise<PlayerDetailData> {
  if (isNaN(playerId)) throw new Error('Invalid player ID');

  try {
    const [playerData, bootstrap] = await Promise.all([
      FPLApi.getPlayerDetails(playerId),
      FPLApi.getBootstrapStatic(),
    ]);

    const teamMap: Record<number, { short_name: string }> = Object.fromEntries(
      bootstrap.teams.map((t: { id: number; short_name: string }) => [t.id, t])
    );

    const fixtures: PlayerFixture[] = playerData.fixtures.slice(0, FIXTURE_DEPTH).map(
      (f: {
        event: number;
        event_name: string;
        is_home: boolean;
        difficulty: number;
        kickoff_time: string;
        team_h: number;
        team_a: number;
      }) => ({
        event: f.event,
        event_name: f.event_name,
        is_home: f.is_home,
        difficulty: f.difficulty,
        kickoff_time: f.kickoff_time,
        opponent_short_name: teamMap[f.is_home ? f.team_a : f.team_h]?.short_name ?? '?',
      })
    );

    const history: PlayerHistoryEntry[] = playerData.history
      .slice(-5)
      .reverse()
      .map(
        (h: {
          round: number;
          opponent_team: number;
          was_home: boolean;
          total_points: number;
          minutes: number;
          goals_scored: number;
          assists: number;
          clean_sheets: number;
          bonus: number;
          yellow_cards: number;
          red_cards: number;
        }) => ({
          round: h.round,
          opponent_short_name: teamMap[h.opponent_team]?.short_name ?? '?',
          was_home: h.was_home,
          total_points: h.total_points,
          minutes: h.minutes,
          goals_scored: h.goals_scored,
          assists: h.assists,
          clean_sheets: h.clean_sheets,
          bonus: h.bonus,
          yellow_cards: h.yellow_cards,
          red_cards: h.red_cards,
        })
      );

    return { fixtures, history };
  } catch (error) {
    console.error('Player detail fetch error:', error);
    throw new Error('Failed to fetch player details.');
  }
}
