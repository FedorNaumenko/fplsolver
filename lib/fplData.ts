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
  TransferSuggestion,
  MultiTransferPlan,
} from '@/lib/types';
import { generateTransferSuggestions } from '@/lib/calculations/transferSuggestions';
import { planMultipleTransfers } from '@/lib/calculations/multiTransfer';

export interface TeamData {
  squad: Player[];
  picks: PickInfo[];
  budget: number;
  teamValue: number;
  currentGameweek: number;
  teams: Team[];
  managerName: string;
  playerFixtures: Record<number, PlayerFixture[]>;
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

/** Squad, picks, budget and upcoming fixtures for a manager. */
export async function fetchTeamData(managerId: string | number): Promise<TeamData> {
  const id = assertManagerId(managerId);

  try {
    const [bootstrap, managerInfo, allFixtures] = await Promise.all([
      FPLApi.getBootstrapStatic(),
      FPLApi.getManagerTeam(id),
      FPLApi.getFixtures(),
    ]);

    const currentGameweek: number = managerInfo.current_event;
    if (!currentGameweek) throw new Error('No active gameweek found');

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
      isCaptain: p.is_captain,
      isViceCaptain: p.is_vice_captain,
      multiplier: p.multiplier,
    }));

    // Compute next 3 upcoming fixtures per squad player
    const upcomingFixtures = allFixtures.filter(
      (f: { finished: boolean }) => !f.finished
    );

    const playerFixtures: Record<number, PlayerFixture[]> = {};
    for (const player of squad) {
      const teamId = player.team;
      playerFixtures[player.id] = upcomingFixtures
        .filter((f: { team_h: number; team_a: number }) => f.team_h === teamId || f.team_a === teamId)
        .sort((a: { event: number }, b: { event: number }) => a.event - b.event)
        .slice(0, 3)
        .map((f: { event: number; team_h: number; team_a: number; team_h_difficulty: number; team_a_difficulty: number; kickoff_time: string }) => {
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

    return {
      squad,
      picks: pickInfos,
      budget: picks.entry_history.bank,
      teamValue: picks.entry_history.value,
      currentGameweek,
      teams,
      managerName: managerInfo.name,
      playerFixtures,
    };
  } catch (error) {
    console.error('Team fetch error:', error);
    throw new Error('Failed to fetch team. Check your Manager ID.');
  }
}

/** Single-transfer suggestions plus 2/3-transfer and wildcard plans. */
export async function fetchTransfers(
  managerId: string | number,
  gwOffsetRaw: number = 0
): Promise<TransfersData> {
  const id = assertManagerId(managerId);
  const gwOffset = Math.max(0, Math.min(2, Number(gwOffsetRaw) || 0));

  try {
    const [bootstrap, managerInfo, fixtures] = await Promise.all([
      FPLApi.getBootstrapStatic(),
      FPLApi.getManagerTeam(id),
      FPLApi.getFixtures(),
    ]);
    const currentGameweek: number = managerInfo.current_event;
    if (!currentGameweek) throw new Error('No active gameweek found');
    const picks = await FPLApi.getManagerPicks(id, currentGameweek);
    const allPlayers: Player[] = bootstrap.elements;
    const typedFixtures: Fixture[] = fixtures;
    const squadIds: number[] = picks.picks.map((p: { element: number }) => p.element);
    const squad = squadIds.map((sid: number) => allPlayers.find((p: Player) => p.id === sid)).filter((p): p is Player => Boolean(p));
    const bank: number = picks.entry_history.bank;
    const FREE_TRANSFERS = 1;
    const suggestions = generateTransferSuggestions(squad, allPlayers, typedFixtures, bank, currentGameweek, 3, 5, gwOffset);
    const plan2 = planMultipleTransfers(squad, allPlayers, typedFixtures, bank, currentGameweek, FREE_TRANSFERS, 2, 3, gwOffset);
    const plan3 = planMultipleTransfers(squad, allPlayers, typedFixtures, bank, currentGameweek, FREE_TRANSFERS, 3, 3, gwOffset);
    const wildcard = planMultipleTransfers(squad, allPlayers, typedFixtures, bank, currentGameweek, 99, 8, 3, gwOffset);
    return { suggestions, plan2, plan3, wildcard };
  } catch (error) {
    console.error('Transfers fetch error:', error);
    throw new Error('Failed to generate transfer suggestions.');
  }
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

    const fixtures: PlayerFixture[] = playerData.fixtures.slice(0, 5).map(
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
