'use client';

import { useState, useEffect } from 'react';
import TeamInput from '@/components/TeamInput';
import SquadDisplay from '@/components/SquadDisplay';
import TransferPlanner from '@/components/TransferPlanner';
import type { Player, Team, PickInfo, TransferSuggestion, MultiTransferPlan, PlayerFixture } from '@/lib/types';

interface TeamData {
  squad: Player[];
  picks: PickInfo[];
  budget: number;
  teamValue: number;
  currentGameweek: number;
  teams: Team[];
  managerName: string;
  playerFixtures: Record<number, PlayerFixture[]>;
}

interface TransfersData {
  suggestions: TransferSuggestion[];
  plan2: MultiTransferPlan;
  plan3: MultiTransferPlan;
  wildcard: MultiTransferPlan;
}

function LionCrownIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 3-spike crown */}
      <path d="M6 23 L6 17.5 L11.5 21.5 L16 11 L20.5 21.5 L26 17.5 L26 23 Z" fill="#FFD700"/>
      {/* Lion mane / head — overlaps crown base for a seamless silhouette */}
      <circle cx="16" cy="29" r="8" fill="#FFD700"/>
    </svg>
  );
}

export default function Home() {
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [transfersData, setTransfersData] = useState<TransfersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managerId, setManagerId] = useState<string>('');
  const [projGWIndex, setProjGWIndex] = useState(0);

  const [localSquad, setLocalSquad] = useState<Player[]>([]);
  const [localPicks, setLocalPicks] = useState<PickInfo[]>([]);
  const [localBudget, setLocalBudget] = useState<number>(0);
  const [localPlayerFixtures, setLocalPlayerFixtures] = useState<Record<number, PlayerFixture[]>>({});

  useEffect(() => {
    if (teamData) {
      setLocalSquad(teamData.squad);
      setLocalPicks(teamData.picks);
      setLocalBudget(teamData.budget);
      setLocalPlayerFixtures(teamData.playerFixtures);
    }
  }, [teamData]);

  const handleLoad = async (id: string) => {
    setLoading(true);
    setError(null);
    setTeamData(null);
    setTransfersData(null);
    setManagerId(id);
    setProjGWIndex(0);

    try {
      const [teamRes, transfersRes] = await Promise.all([
        fetch(`/api/team?managerId=${id}`),
        fetch(`/api/transfers?managerId=${id}&gwOffset=0`),
      ]);
      const teamJson = await teamRes.json();
      if (!teamRes.ok) throw new Error(teamJson.error || 'Failed to load team');
      const transfersJson = await transfersRes.json();
      if (!transfersRes.ok) throw new Error(transfersJson.error || 'Failed to load suggestions');
      setTeamData(teamJson);
      setTransfersData(transfersJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleProjGWIndexChange = async (newIndex: number) => {
    setProjGWIndex(newIndex);
    if (!managerId) return;
    setTransfersLoading(true);
    try {
      const res = await fetch(`/api/transfers?managerId=${managerId}&gwOffset=${newIndex}`);
      const data = await res.json();
      if (res.ok) setTransfersData(data);
    } catch {
      // keep existing data on error
    } finally {
      setTransfersLoading(false);
    }
  };

  const handleApplyTransfer = async (playerOut: Player, playerIn: Player) => {
    if (!teamData) return;
    const costDiff = playerIn.now_cost - playerOut.now_cost;
    if (playerIn.now_cost > playerOut.now_cost + localBudget) return;
    const sameTeamCount = localSquad.filter(p => p.team === playerIn.team && p.id !== playerOut.id).length;
    if (sameTeamCount >= 3) return;
    setLocalSquad(prev => prev.map(p => (p.id === playerOut.id ? playerIn : p)));
    setLocalPicks(prev => prev.map(p => (p.playerId === playerOut.id ? { ...p, playerId: playerIn.id } : p)));
    setLocalBudget(prev => prev - costDiff);
    // Fetch upcoming fixtures for the newly added player so projected pts work
    try {
      const res = await fetch(`/api/player/${playerIn.id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.fixtures)) {
          setLocalPlayerFixtures(prev => ({ ...prev, [playerIn.id]: data.fixtures }));
        }
      }
    } catch {
      // projected pts will show 0 if this fails — acceptable
    }
  };

  const handlePicksChange = (newPicks: PickInfo[]) => setLocalPicks(newPicks);

  const handleReset = () => {
    if (!teamData) return;
    setLocalSquad(teamData.squad);
    setLocalPicks(teamData.picks);
    setLocalBudget(teamData.budget);
    setLocalPlayerFixtures(teamData.playerFixtures);
  };

  const hasChanges =
    teamData !== null &&
    (localBudget !== teamData.budget || localPicks.some((p, i) => teamData.picks[i]?.playerId !== p.playerId));

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #37003c 0%, #0c0e3f 100%)' }}>
      <header className="px-4 py-4" style={{ background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <LionCrownIcon className="w-10 h-10 flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">FPL Solver</h1>
            <p className="text-sm mt-0.5" style={{ color: '#04f5ff' }}>Fantasy Premier League Transfer Advisor</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <TeamInput onLoad={handleLoad} loading={loading} />

        {error && (
          <div className="border px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(220,38,38,0.15)', borderColor: 'rgba(220,38,38,0.4)', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        {teamData && (
          <div>
            <SquadDisplay
              {...teamData}
              squad={localSquad}
              picks={localPicks}
              budget={localBudget}
              playerFixtures={localPlayerFixtures}
              onPicksChange={handlePicksChange}
              projGWIndex={projGWIndex}
              onProjGWIndexChange={handleProjGWIndexChange}
            />
            {hasChanges && (
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleReset}
                  className="text-xs px-3 py-1.5 rounded transition-colors"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  Reset to original
                </button>
              </div>
            )}
          </div>
        )}

        {transfersData && (
          <TransferPlanner
            suggestions={transfersData.suggestions}
            plan2={transfersData.plan2}
            plan3={transfersData.plan3}
            wildcard={transfersData.wildcard}
            localSquad={localSquad}
            localBudget={localBudget}
            onApplyTransfer={handleApplyTransfer}
            transfersLoading={transfersLoading}
          />
        )}
      </main>
    </div>
  );
}
