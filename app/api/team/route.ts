import { NextRequest, NextResponse } from 'next/server';
import { FPLApi } from '@/lib/api/fpl';
import type { Player, Team, PickInfo } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const managerId = searchParams.get('managerId');

  if (!managerId || isNaN(Number(managerId))) {
    return NextResponse.json({ error: 'Invalid manager ID' }, { status: 400 });
  }

  try {
    const [bootstrap, managerInfo] = await Promise.all([
      FPLApi.getBootstrapStatic(),
      FPLApi.getManagerTeam(Number(managerId)),
    ]);

    const currentGameweek: number = managerInfo.current_event;
    if (!currentGameweek) {
      return NextResponse.json({ error: 'No active gameweek found' }, { status: 400 });
    }

    const picks = await FPLApi.getManagerPicks(Number(managerId), currentGameweek);

    const allPlayers: Player[] = bootstrap.elements;
    const teams: Team[] = bootstrap.teams;

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

    return NextResponse.json({
      squad,
      picks: pickInfos,
      budget: picks.entry_history.bank,
      teamValue: picks.entry_history.value,
      currentGameweek,
      teams,
      managerName: managerInfo.name,
    });
  } catch (error) {
    console.error('Team fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team. Check your Manager ID.' },
      { status: 500 }
    );
  }
}
