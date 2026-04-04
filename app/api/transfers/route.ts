import { NextRequest, NextResponse } from 'next/server';
import { FPLApi } from '@/lib/api/fpl';
import type { Player, Fixture } from '@/lib/types';
import { generateTransferSuggestions } from '@/lib/calculations/transferSuggestions';
import { planMultipleTransfers } from '@/lib/calculations/multiTransfer';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const managerId = searchParams.get('managerId');
  const gwOffset = Math.max(0, Math.min(2, Number(searchParams.get('gwOffset') ?? '0')));

  if (!managerId || isNaN(Number(managerId))) {
    return NextResponse.json({ error: 'Invalid manager ID' }, { status: 400 });
  }

  try {
    const [bootstrap, managerInfo, fixtures] = await Promise.all([
      FPLApi.getBootstrapStatic(),
      FPLApi.getManagerTeam(Number(managerId)),
      FPLApi.getFixtures(),
    ]);
    const currentGameweek: number = managerInfo.current_event;
    if (!currentGameweek) return NextResponse.json({ error: 'No active gameweek found' }, { status: 400 });
    const picks = await FPLApi.getManagerPicks(Number(managerId), currentGameweek);
    const allPlayers: Player[] = bootstrap.elements;
    const typedFixtures: Fixture[] = fixtures;
    const squadIds: number[] = picks.picks.map((p: { element: number }) => p.element);
    const squad = squadIds.map((id: number) => allPlayers.find((p: Player) => p.id === id)).filter((p): p is Player => Boolean(p));
    const bank: number = picks.entry_history.bank;
    const FREE_TRANSFERS = 1;
    const suggestions = generateTransferSuggestions(squad, allPlayers, typedFixtures, bank, currentGameweek, 3, 5, gwOffset);
    const plan2 = planMultipleTransfers(squad, allPlayers, typedFixtures, bank, currentGameweek, FREE_TRANSFERS, 2, 3, gwOffset);
    const plan3 = planMultipleTransfers(squad, allPlayers, typedFixtures, bank, currentGameweek, FREE_TRANSFERS, 3, 3, gwOffset);
    const wildcard = planMultipleTransfers(squad, allPlayers, typedFixtures, bank, currentGameweek, 99, 8, 3, gwOffset);
    return NextResponse.json({ suggestions, plan2, plan3, wildcard });
  } catch (error) {
    console.error('Transfers fetch error:', error);
    return NextResponse.json({ error: 'Failed to generate transfer suggestions.' }, { status: 500 });
  }
}
