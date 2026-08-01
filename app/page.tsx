'use client';

import { useState, useEffect } from 'react';
import TeamInput from '@/components/TeamInput';
import SquadDisplay from '@/components/SquadDisplay';
import TransferPlanner from '@/components/TransferPlanner';
import PlayerPickerDialog from '@/components/PlayerPickerDialog';
import type { Player, PickInfo, PlayerFixture } from '@/lib/types';
import { fetchTeamData, fetchTransfers, fetchPlayerDetail, fetchPreseasonSquad, FplNotice } from '@/lib/fplData';
import { canSwap, canAdd, ensureArmbands } from '@/lib/calculations/squadRules';
import {
  emptyPlan, picksAt, bankAt, evaluatePlan, availableChips, savePlan, loadPlan, clearPlan,
  type SeasonPlan, type ChipName,
} from '@/lib/planning/seasonPlan';
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

  // The squad as it stands before any planned change, plus the plan itself. What the
  // pitch draws is derived from these for whichever gameweek is being viewed — there is
  // no longer a single mutable "current picks" array.
  const [basePicks, setBasePicks] = useState<PickInfo[]>([]);
  const [plan, setPlan] = useState<SeasonPlan>(() => emptyPlan(''));
  const [startingBank, setStartingBank] = useState<number>(0);
  const [localPlayerFixtures, setLocalPlayerFixtures] = useState<Record<number, PlayerFixture[]>>({});
  const [saveState, setSaveState] = useState<'clean' | 'dirty' | 'saved'>('clean');
  /** elementType of the empty slot being filled, or null when the picker is closed. */
  const [fillSlot, setFillSlot] = useState<number | null>(null);

  useEffect(() => {
    if (teamData) {
      setBasePicks(teamData.picks);
      setStartingBank(teamData.budget);
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
      const stored = loadPlan(id);
      setPlan(stored ?? emptyPlan(id));
      setSaveState(stored ? 'saved' : 'clean');
    } catch (err) {
      if (err instanceof FplNotice) {
        setNotice(err.message);
        // Nothing to load yet, so show the squad the model would pick instead. Both
        // FPL fetches it needs are already cached from the attempt that just failed.
        try {
          const built = await fetchPreseasonSquad(0);
          setPreseason(built);
          setTeamData(built);
          const stored = loadPlan(id);
          setPlan(stored ?? emptyPlan(id));
          setSaveState(stored ? 'saved' : 'clean');
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

  // ── Derived view state ────────────────────────────────────────────────────────
  // Everything the pitch shows is computed for the gameweek being viewed. Writing to
  // these would be lost on the next render; see the write targets below.
  const playerById = new Map<number, Player>(
    (preseason?.allPlayers ?? teamData?.squad ?? []).map(p => [p.id, p])
  );
  const gameweekIds = teamData?.upcomingGameweeks ?? [];
  const viewedGameweek = gameweekIds[projGWIndex] ?? teamData?.currentGameweek ?? 1;
  const priceOf = (id: number) => playerById.get(id)?.now_cost ?? 0;

  const viewPicks = teamData ? picksAt(basePicks, plan, viewedGameweek, playerById) : [];
  const viewSquad = viewPicks
    .map(pk => (pk.playerId === null ? null : playerById.get(pk.playerId) ?? null))
    .filter((pl): pl is Player => pl !== null);
  const viewBank = bankAt(plan, viewedGameweek, priceOf, startingBank);

  const outcome = teamData
    ? evaluatePlan(plan, {
        basePicks, playerById, fixtures: teamData.fixtures,
        gameweeks: gameweekIds.length ? gameweekIds : [viewedGameweek],
        gameweeksPlayed: teamData.gameweeksPlayed,
        rules: teamData.transferRules,
      }).find(o => o.gameweek === viewedGameweek) ?? null
    : null;

  /** Record a change against the gameweek being viewed. */
  const recordMove = (outId: number | null, inId: number | null) => {
    setSaveState('dirty');
    setPlan(prev => {
      const entries = [...prev.entries];
      const i = entries.findIndex(e => e.gameweek === viewedGameweek);
      const current = i >= 0 ? entries[i] : { gameweek: viewedGameweek, transfers: [], chip: null };
      const next = { ...current, transfers: [...current.transfers, { outId, inId }] };
      if (i >= 0) entries[i] = next; else entries.push(next);
      return { ...prev, entries: entries.sort((a, b) => a.gameweek - b.gameweek) };
    });
  };

  const setChip = (chip: ChipName | null) => {
    setSaveState('dirty');
    setPlan(prev => {
      const entries = [...prev.entries];
      const i = entries.findIndex(e => e.gameweek === viewedGameweek);
      const current = i >= 0 ? entries[i] : { gameweek: viewedGameweek, transfers: [], chip: null };
      const next = { ...current, chip };
      const empty = next.chip === null && next.transfers.length === 0;
      if (i >= 0) { if (empty) entries.splice(i, 1); else entries[i] = next; }
      else if (!empty) entries.push(next);
      return { ...prev, entries: entries.sort((a, b) => a.gameweek - b.gameweek) };
    });
  };

  /** Ranking used only to re-seat an armband after a removal. */
  const scoreFor = (playerId: number): number => {
    const p = viewSquad.find(x => x.id === playerId);
    if (!p || !teamData) return 0;
    return calcExpectedPoints(p, teamData.fixtures, teamData.gameweeksPlayed, horizon, projGWIndex);
  };

  /**
   * Empty a slot without a replacement. Recorded against the gameweek being viewed, so
   * removing someone while looking at GW4 leaves them in the squad for GW1-3.
   */
  const handleRemovePlayer = (player: Player) => recordMove(player.id, null);

  /** Fill an empty slot of that position, in the gameweek being viewed. */
  const handleAddPlayer = async (elementType: number, playerIn: Player) => {
    if (!canAdd(viewSquad, playerIn, elementType, viewBank).ok) return;
    recordMove(null, playerIn.id);
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
    if (!canSwap(viewSquad, playerOut, playerIn, viewBank).ok) return;
    recordMove(playerOut.id, playerIn.id);
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

  /**
   * Substitutions reorder the squad rather than change who is in it, so they write to
   * `basePicks` and apply to every gameweek. Writing to the derived picks would be lost
   * on the next render — both are PickInfo[], so nothing would flag it.
   */
  const handlePicksChange = (newPicks: PickInfo[]) => {
    setSaveState('dirty');
    setBasePicks(ensureArmbands(newPicks, scoreFor));
  };

  const handleReset = () => {
    if (!teamData) return;
    setBasePicks(teamData.picks);
    setPlan(emptyPlan(managerId));
    setStartingBank(teamData.budget);
    setLocalPlayerFixtures(teamData.playerFixtures);
    setSaveState('clean');
  };

  const hasChanges = teamData !== null && (plan.entries.length > 0 || saveState === 'dirty');

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
              squad={viewSquad}
              picks={viewPicks}
              budget={viewBank}
              playerFixtures={localPlayerFixtures}
              onPicksChange={handlePicksChange}
              projGWIndex={projGWIndex}
              onProjGWIndexChange={handleProjGWIndexChange}
              horizon={horizon}
              onHorizonChange={handleHorizonChange}
              onRemovePlayer={handleRemovePlayer}
              onFillSlot={setFillSlot}
              gameweek={viewedGameweek}
              chip={plan.entries.find(e => e.gameweek === viewedGameweek)?.chip ?? null}
              chipOptions={availableChips(teamData.chips, viewedGameweek, plan)}
              onChipChange={setChip}
              freeTransfers={outcome?.freeAvailable ?? 0}
              hit={outcome?.hit ?? 0}
              saveState={saveState}
              onSavePlan={() => { savePlan(plan); setSaveState('saved'); }}
              onClearPlan={() => { clearPlan(managerId); setPlan(emptyPlan(managerId)); setSaveState('clean'); }}
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
            localSquad={viewSquad}
            localBudget={viewBank}
            onApplyTransfer={handleApplyTransfer}
            transfersLoading={transfersLoading}
          />
        )}
        {fillSlot !== null && teamData && (
          <PlayerPickerDialog
            elementType={fillSlot}
            squad={viewSquad}
            allPlayers={preseason?.allPlayers ?? teamData.squad}
            teams={teamData.teams}
            fixtures={teamData.fixtures}
            bank={viewBank}
            horizon={horizon}
            gwOffset={projGWIndex}
            gameweeksPlayed={teamData.gameweeksPlayed}
            settings={preseason?.settings}
            gameweek={viewedGameweek}
            onPick={player => { void handleAddPlayer(fillSlot, player); setFillSlot(null); }}
            onClose={() => setFillSlot(null)}
          />
        )}
      </main>
    </div>
  );
}
