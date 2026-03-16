import { NextRequest, NextResponse } from 'next/server';
import { FPLApi } from '@/lib/api/fpl';
import type { Player, Team } from '@/lib/types';

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

    const squadIds: number[] = picks.picks.map((p: { element: number }) => p.element);
    const squad = squadIds
      .map((id: number) => allPlayers.find((p: Player) => p.id === id))
      .filter((p): p is Player => Boolean(p));

    return NextResponse.json({
      squad,
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
