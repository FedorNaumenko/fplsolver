'use client';

import { useState, useEffect } from 'react';
import TeamInput from '@/components/TeamInput';
import SquadDisplay from '@/components/SquadDisplay';
import TransferPlanner from '@/components/TransferPlanner';
import SquadEditor from '@/components/SquadEditor';
import SeasonPlanner from '@/components/SeasonPlanner';
import type { Player, PickInfo, PlayerFixture } from '@/lib/types';
import { fetchTeamData, fetchTransfers, fetchPlayerDetail, fetchPreseasonSquad, FplNotice } from '@/lib/fplData';
import { canSwap, canAdd, ensureArmbands } from '@/lib/calculations/squadRules';
import { calcExpectedPoints } from '@/lib/calculations/xPts';
import { BASE_PATH } from '@/lib/utils';
import type { TeamData, TransfersData, PreseasonData } from '@/lib/fplData';

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
  // How many gameweeks every projection sums. One value for the pitch, the editor and
  // the planner — they used to disagree, which is what made the numbers look wrong.
  const [horizon, setHorizon] = useState(1);
  // Only set on the pre-season path — carries the player pool the editor needs.
  const [preseason, setPreseason] = useState<PreseasonData | null>(null);

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
    setPreseason(null);
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
          const built = await fetchPreseasonSquad(0);
          setPreseason(built);
          setTeamData(built);
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

  const refreshTransfers = async (offset: number, gws: number) => {
    if (!managerId || !transfersData) return;
    setTransfersLoading(true);
    try {
      setTransfersData(await fetchTransfers(managerId, offset, gws));
    } catch {
      // keep existing data on error
    } finally {
      setTransfersLoading(false);
    }
  };

  const handleHorizonChange = (h: number) => {
    setHorizon(h);
    void refreshTransfers(projGWIndex, h);
  };

  const handleProjGWIndexChange = async (newIndex: number) => {
    setProjGWIndex(newIndex);
    // No transfers pre-season, and refetching them would just throw again. The
    // projection columns come from playerFixtures, so the toggle still works.
    await refreshTransfers(newIndex, horizon);
  };

  /** Ranking used only to re-seat an armband after a removal. */
  const scoreFor = (playerId: number): number => {
    const p = localSquad.find(x => x.id === playerId);
    if (!p || !teamData) return 0;
    return calcExpectedPoints(p, teamData.fixtures, teamData.gameweeksPlayed, horizon, projGWIndex);
  };

  /** Empty a slot without a replacement: the money returns to the bank and the slot
   *  stays open, so a squad can be part-built. */
  const handleRemovePlayer = (player: Player) => {
    setLocalSquad(prev => prev.filter(p => p.id !== player.id));
    setLocalPicks(prev => ensureArmbands(
      prev.map(p => (p.playerId === player.id
        ? { ...p, playerId: null, isCaptain: false, isViceCaptain: false, multiplier: 0 }
        : p)),
      scoreFor
    ));
    setLocalBudget(prev => prev + player.now_cost);
  };

  /** Fill the first empty slot of that position. */
  const handleAddPlayer = async (elementType: number, playerIn: Player) => {
    if (!canAdd(localSquad, playerIn, elementType, localBudget).ok) return;
    const slot = localPicks.find(p => p.playerId === null && p.elementType === elementType);
    if (!slot) return;
    setLocalSquad(prev => [...prev, playerIn]);
    setLocalPicks(prev => ensureArmbands(
      prev.map(p => (p === slot || (p.playerId === null && p.position === slot.position)
        ? { ...p, playerId: playerIn.id }
        : p)),
      scoreFor
    ));
    setLocalBudget(prev => prev - playerIn.now_cost);
    try {
      const { fixtures } = await fetchPlayerDetail(playerIn.id);
      if (Array.isArray(fixtures)) {
        setLocalPlayerFixtures(prev => ({ ...prev, [playerIn.id]: fixtures }));
      }
    } catch {
      // projected pts will show 0 if this fails — acceptable
    }
  };

  const handleApplyTransfer = async (playerOut: Player, playerIn: Player) => {
    if (!teamData) return;
    if (!canSwap(localSquad, playerOut, playerIn, localBudget).ok) return;
    const costDiff = playerIn.now_cost - playerOut.now_cost;
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
    (localBudget !== teamData.budget ||
      localSquad.length !== teamData.squad.length ||
      // Compare occupancy as well as identity: two empty slots are equal by playerId,
      // so emptying a slot used to register as no change at all.
      localPicks.some((p, i) => {
        const was = teamData.picks[i];
        return !was || was.playerId !== p.playerId || (was.playerId === null) !== (p.playerId === null);
      }));

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(160deg, var(--color-plum), var(--color-ground-deep))' }}
    >
      {/* Masthead — the wordmark sits on a rule, not in a centred bar. */}
      <header className="px-4 py-4" style={{ background: 'var(--shade-1)', borderBottom: '1px solid var(--rule)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static export, no optimiser */}
          <img
            src={`${BASE_PATH}/crest.png`}
            alt=""
            width={44}
            height={44}
            className="w-11 h-11 flex-shrink-0"
          />
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
              horizon={horizon}
              onHorizonChange={handleHorizonChange}
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

        {preseason && teamData && (
          <SquadEditor
            squad={localSquad}
            picks={localPicks}
            allPlayers={preseason.allPlayers}
            teams={preseason.teams}
            fixtures={preseason.fixtures}
            bank={localBudget}
            horizon={horizon}
            gwOffset={projGWIndex}
            gameweeksPlayed={preseason.gameweeksPlayed}
            settings={preseason.settings}
            onSwap={handleApplyTransfer}
            onRemove={handleRemovePlayer}
            onAdd={handleAddPlayer}
          />
        )}

        {teamData && managerId && (
          <SeasonPlanner
            key={managerId}
            managerId={managerId}
            basePicks={localPicks}
            allPlayers={preseason?.allPlayers ?? localSquad}
            fixtures={teamData.fixtures}
            chips={teamData.chips}
            rules={teamData.transferRules}
            gameweeks={teamData.upcomingGameweeks}
            gameweeksPlayed={teamData.gameweeksPlayed}
            bank={localBudget}
          />
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
