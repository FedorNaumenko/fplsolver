'use client';

import { useState, useEffect } from 'react';
import TeamInput from '@/components/TeamInput';
import SquadDisplay from '@/components/SquadDisplay';
import TransferPlanner from '@/components/TransferPlanner';
import type { Player, PickInfo, PlayerFixture } from '@/lib/types';
import { fetchTeamData, fetchTransfers, fetchPlayerDetail, fetchPreseasonSquad, FplNotice } from '@/lib/fplData';
import type { TeamData, TransfersData } from '@/lib/fplData';

function LionCrownIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 3-spike crown */}
      <path d="M6 23 L6 17.5 L11.5 21.5 L16 11 L20.5 21.5 L26 17.5 L26 23 Z" fill="var(--color-crest)"/>
      {/* Lion mane / head — overlaps crown base for a seamless silhouette */}
      <circle cx="16" cy="29" r="8" fill="var(--color-crest)"/>
    </svg>
  );
}

export default function Home() {
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [transfersData, setTransfersData] = useState<TransfersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error` so "the season hasn't started" doesn't render as a failure.
  const [notice, setNotice] = useState<string | null>(null);
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
    setNotice(null);
    setTeamData(null);
    setTransfersData(null);
    setManagerId(id);
    setProjGWIndex(0);

    try {
      const [team, transfers] = await Promise.all([
        fetchTeamData(id),
        fetchTransfers(id, 0),
      ]);
      setTeamData(team);
      setTransfersData(transfers);
    } catch (err) {
      if (err instanceof FplNotice) {
        setNotice(err.message);
        // Nothing to load yet, so show the squad the model would pick instead. Both
        // FPL fetches it needs are already cached from the attempt that just failed.
        try {
          setTeamData(await fetchPreseasonSquad(0));
        } catch {
          // notice on its own is still a useful answer
        }
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProjGWIndexChange = async (newIndex: number) => {
    setProjGWIndex(newIndex);
    // No transfers pre-season, and refetching them would just throw again. The
    // projection columns come from playerFixtures, so the toggle still works.
    if (!managerId || !transfersData) return;
    setTransfersLoading(true);
    try {
      setTransfersData(await fetchTransfers(managerId, newIndex));
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
      const { fixtures } = await fetchPlayerDetail(playerIn.id);
      if (Array.isArray(fixtures)) {
        setLocalPlayerFixtures(prev => ({ ...prev, [playerIn.id]: fixtures }));
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
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(160deg, var(--color-plum), var(--color-ground-deep))' }}
    >
      {/* Masthead — the wordmark sits on a rule, not in a centred bar. */}
      <header className="px-4 py-4" style={{ background: 'var(--shade-1)', borderBottom: '1px solid var(--rule)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <LionCrownIcon className="w-10 h-10 flex-shrink-0" />
          <div>
            <h1
              className="font-bold tracking-tight"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--ink)' }}
            >
              FPL Solver
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-accent)' }}>
              Fantasy Premier League transfer advisor
            </p>
          </div>
        </div>
      </header>

      {/* Left-biased column: content is not centred inside its own measure. */}
      <main className="max-w-3xl mx-auto px-4 pb-10 space-y-5">
        <TeamInput onLoad={handleLoad} loading={loading} />

        {error && (
          <div
            className="px-4 py-3 rounded-lg text-sm"
            style={{
              background: 'oklch(71.2% 0.181 22.8 / 0.15)',
              border: '1px solid oklch(71.2% 0.181 22.8 / 0.4)',
              color: 'var(--color-danger-ink)',
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            className="px-4 py-3 rounded-lg text-sm"
            style={{
              background: 'oklch(88.2% 0.15 200.1 / 0.1)',
              border: '1px solid oklch(88.2% 0.15 200.1 / 0.35)',
              color: 'var(--color-accent)',
            }}
            role="status"
          >
            {notice}
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
              <div className="flex mt-2">
                <button
                  onClick={handleReset}
                  className="text-xs px-3 py-1.5 rounded"
                  style={{
                    background: 'var(--fill-2)',
                    color: 'var(--ink-muted)',
                    border: '1px solid var(--rule-strong)',
                    transition: 'color var(--dur-short) var(--ease-out)',
                  }}
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
