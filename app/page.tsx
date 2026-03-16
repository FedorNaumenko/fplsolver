'use client';

import { useState } from 'react';
import TeamInput from '@/components/TeamInput';
import SquadDisplay from '@/components/SquadDisplay';
import TransferSuggestions from '@/components/TransferSuggestions';
import type { Player, Team, PickInfo, TransferSuggestion } from '@/lib/types';

interface TeamData {
  squad: Player[];
  picks: PickInfo[];
  budget: number;
  teamValue: number;
  currentGameweek: number;
  teams: Team[];
  managerName: string;
}

export default function Home() {
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [suggestions, setSuggestions] = useState<TransferSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async (id: string) => {
    setLoading(true);
    setError(null);
    setTeamData(null);
    setSuggestions(null);

    try {
      const [teamRes, transfersRes] = await Promise.all([
        fetch(`/api/team?managerId=${id}`),
        fetch(`/api/transfers?managerId=${id}`),
      ]);

      const teamJson = await teamRes.json();
      if (!teamRes.ok) throw new Error(teamJson.error || 'Failed to load team');

      const transfersJson = await transfersRes.json();
      if (!transfersRes.ok) throw new Error(transfersJson.error || 'Failed to load suggestions');

      setTeamData(teamJson);
      setSuggestions(transfersJson.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-700 text-white px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold tracking-tight">FPL Solver</h1>
          <p className="text-green-200 text-sm mt-0.5">Fantasy Premier League Transfer Advisor</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <TeamInput onLoad={handleLoad} loading={loading} />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {teamData && (
          <>
            <SquadDisplay {...teamData} />
            {suggestions && <TransferSuggestions suggestions={suggestions} />}
          </>
        )}
      </main>
    </div>
  );
}
