import { NextRequest, NextResponse } from 'next/server';
import { FPLApi } from '@/lib/api/fpl';
import type { PlayerFixture, PlayerHistoryEntry } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playerId = Number(id);

  if (isNaN(playerId)) {
    return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 });
  }

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

    return NextResponse.json({ fixtures, history });
  } catch (error) {
    console.error('Player detail fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch player details.' }, { status: 500 });
  }
}
