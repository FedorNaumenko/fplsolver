import { NextRequest, NextResponse } from 'next/server';
import { FPLApi } from '@/lib/api/fpl';
import type { Player, Team, PickInfo, PlayerFixture } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const managerId = searchParams.get('managerId');

  if (!managerId || isNaN(Number(managerId))) {
    return NextResponse.json({ error: 'Invalid manager ID' }, { status: 400 });
  }

  try {
    const [bootstrap, managerInfo, allFixtures] = await Promise.all([
      FPLApi.getBootstrapStatic(),
      FPLApi.getManagerTeam(Number(managerId)),
      FPLApi.getFixtures(),
    ]);

    const currentGameweek: number = managerInfo.current_event;
    if (!currentGameweek) {
      return NextResponse.json({ error: 'No active gameweek found' }, { status: 400 });
    }

    const picks = await FPLApi.getManagerPicks(Number(managerId), currentGameweek);

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

    return NextResponse.json({
      squad,
      picks: pickInfos,
      budget: picks.entry_history.bank,
      teamValue: picks.entry_history.value,
      currentGameweek,
      teams,
      managerName: managerInfo.name,
      playerFixtures,
    });
  } catch (error) {
    console.error('Team fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team. Check your Manager ID.' },
      { status: 500 }
    );
  }
}
