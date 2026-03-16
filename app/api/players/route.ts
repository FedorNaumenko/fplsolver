// API route to fetch and cache player data
import { NextResponse } from 'next/server';
import { FPLApi } from '@/lib/api/fpl';

export async function GET() {
  try {
    const data = await FPLApi.getBootstrapStatic();
    
    return NextResponse.json({
      players: data.elements,
      teams: data.teams,
      gameweeks: data.events,
    });
  } catch (error) {
    console.error('Error fetching FPL data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player data' },
      { status: 500 }
    );
  }
}
