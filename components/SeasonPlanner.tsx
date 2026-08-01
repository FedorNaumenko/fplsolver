'use client';

// Plan several gameweeks ahead: pick a chip, decide how many transfers to make, and see
// what each choice does to the projected score after any points hit.
//
// The plan holds transfers per gameweek, not a squad per gameweek — squadAt replays them.
// Chip legality, windows and the free-transfer cap all come from bootstrap-static via
// lib/planning/seasonPlan.ts, which has its own check script because this is scoring
// logic and a plausible-looking wrong number is worse than an obvious error.

import { useState } from 'react';
import type { Player, Fixture, PickInfo } from '@/lib/types';
import { planMultipleTransfers } from '@/lib/calculations/multiTransfer';
import {
  emptyPlan, evaluatePlan, availableChips, squadAt, savePlan, loadPlan, clearPlan,
  type SeasonPlan, type ChipName, type ChipDef, type TransferRules,
} from '@/lib/planning/seasonPlan';

interface Props {
  managerId: string;
  basePicks: PickInfo[];
  allPlayers: Player[];
  fixtures: Fixture[];
  chips: ChipDef[];
  rules: TransferRules;
  /** Absolute gameweek ids to plan, in order. */
  gameweeks: number[];
  gameweeksPlayed: number;
  bank: number;
}

const CHIP_LABEL: Record<ChipName, string> = {
  wildcard: 'Wildcard',
  freehit: 'Free hit',
  bboost: 'Bench boost',
  '3xc': 'Triple captain',
};

const MAX_PLANNED_TRANSFERS = 3;

export default function SeasonPlanner({
  managerId, basePicks, allPlayers, fixtures, chips, rules,
  gameweeks, gameweeksPlayed, bank,
}: Props) {
  // Read any stored plan in the initialiser rather than a mount effect: setState inside
  // an effect triggers cascading renders (and the React compiler rejects it). Safe here
  // because the caller passes key={managerId}, so switching manager remounts and this
  // runs again — and because the planner only renders after a team is loaded, it never
  // executes during the static export where localStorage does not exist.
  const [plan, setPlan] = useState<SeasonPlan>(() => loadPlan(managerId) ?? emptyPlan(managerId));
  const [saved, setSaved] = useState<string | null>(() => (loadPlan(managerId) ? 'loaded' : null));

  const playerById = new Map(allPlayers.map(p => [p.id, p]));
  const outcomes = evaluatePlan(plan, {
    basePicks, playerById, fixtures, gameweeks, gameweeksPlayed,
    baseOffset: 0, rules,
  });

  const totalNet = Math.round(outcomes.reduce((s, o) => s + o.net, 0) * 10) / 10;
  const totalHit = outcomes.reduce((s, o) => s + o.hit, 0);

  const upsert = (gameweek: number, patch: Partial<{ chip: ChipName | null; transfers: { outId: number; inId: number }[] }>) => {
    setSaved(null);
    setPlan(prev => {
      const entries = [...prev.entries];
      const i = entries.findIndex(e => e.gameweek === gameweek);
      const current = i >= 0 ? entries[i] : { gameweek, transfers: [], chip: null };
      const next = { ...current, ...patch };
      // Drop entries that say nothing, so the stored plan stays small.
      const empty = next.chip === null && next.transfers.length === 0;
      if (i >= 0) {
        if (empty) entries.splice(i, 1);
        else entries[i] = next;
      } else if (!empty) {
        entries.push(next);
      }
      return { ...prev, entries: entries.sort((a, b) => a.gameweek - b.gameweek) };
    });
  };

  /**
   * Fill a gameweek with its best N transfers. Computed once on change and stored as
   * concrete pairs, rather than recomputed on every render — the greedy planner is a
   * few million operations.
   */
  const setTransferCount = (gameweek: number, gwIndex: number, count: number) => {
    if (count === 0) { upsert(gameweek, { transfers: [] }); return; }
    const slotIds = squadAt(basePicks, plan, gameweek);
    const squadThen = slotIds
      .map(id => (id === null ? null : playerById.get(id) ?? null))
      .filter((p): p is Player => p !== null);
    const found = planMultipleTransfers(
      squadThen, allPlayers, fixtures, bank, gameweeksPlayed,
      rules.maxFreeTransfers, count, 1, gwIndex
    );
    upsert(gameweek, {
      transfers: found.transfers.map(t => ({ outId: t.playerOut.id, inId: t.playerIn.id })),
    });
  };

  const cell = { padding: '0.5rem 0.5rem', borderTop: '1px solid var(--rule)' } as const;
  const head = { color: 'var(--ink-muted)', fontSize: 'var(--text-xs)', textAlign: 'left' as const, paddingBottom: '0.5rem' };

  return (
    <section style={{ borderTop: '1px solid var(--rule-strong)' }} className="pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-semibold" style={{ color: 'var(--ink)', fontSize: 'var(--text-base)' }}>
          Plan ahead
        </h2>
        <p className="num" style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}>
          {gameweeks.length} gameweeks · net {totalNet} pts
          {totalHit > 0 && ` after −${totalHit} in hits`}
        </p>
      </div>

      <div className="overflow-x-auto mt-3">
        <table className="w-full num" style={{ fontSize: 'var(--text-xs)' }}>
          <thead>
            <tr>
              <th scope="col" style={head}>GW</th>
              <th scope="col" style={head}>Chip</th>
              <th scope="col" style={head}>Transfers</th>
              <th scope="col" style={{ ...head, textAlign: 'right' }}>FT</th>
              <th scope="col" style={{ ...head, textAlign: 'right' }}>Hit</th>
              <th scope="col" style={{ ...head, textAlign: 'right' }} title="Projected points for that gameweek alone">
                Proj/GW
              </th>
              <th scope="col" style={{ ...head, textAlign: 'right' }}>Net</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o, i) => {
              const offered = availableChips(chips, o.gameweek, plan);
              return (
                <tr key={o.gameweek}>
                  <td style={cell}>GW{o.gameweek}</td>
                  <td style={cell}>
                    <select
                      value={o.chip ?? ''}
                      onChange={e => upsert(o.gameweek, { chip: (e.target.value || null) as ChipName | null })}
                      aria-label={`Chip for gameweek ${o.gameweek}`}
                      className="select-field"
                      style={{
                        // backgroundColor, not background: the shorthand would reset the
                        // background-image that draws .select-field's chevron.
                        backgroundColor: o.chip ? 'var(--color-chip)' : 'var(--fill-2)',
                        color: o.chip ? 'var(--color-ground)' : 'var(--ink)',
                        border: '1px solid var(--rule-strong)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.25rem',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <option value="" style={{ background: 'var(--color-ground)', color: 'var(--ink)' }}>
                        No chip
                      </option>
                      {/* The chip already on this row stays selectable even though it is spent. */}
                      {[...new Set([...(o.chip ? [o.chip] : []), ...offered])].map(c => (
                        <option key={c} value={c} style={{ background: 'var(--color-ground)', color: 'var(--ink)' }}>
                          {CHIP_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={cell}>
                    <span className="inline-flex items-center gap-1">
                      {Array.from({ length: MAX_PLANNED_TRANSFERS + 1 }, (_, n) => (
                        <button
                          key={n}
                          onClick={() => setTransferCount(o.gameweek, i, n)}
                          aria-pressed={o.transfers === n}
                          aria-label={`${n} transfers in gameweek ${o.gameweek}`}
                          className="w-6 h-6 rounded"
                          style={{
                            fontSize: 'var(--text-xs)',
                            ...(o.transfers === n
                              ? { background: 'var(--color-accent)', color: 'var(--color-ground)' }
                              : { background: 'var(--fill-2)', color: 'var(--ink-muted)' }),
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </span>
                  </td>
                  <td style={{ ...cell, textAlign: 'right', color: 'var(--ink-muted)' }}>{o.freeAvailable}</td>
                  <td style={{ ...cell, textAlign: 'right', color: o.hit ? 'var(--color-danger)' : 'var(--ink-muted)' }}>
                    {o.hit ? `−${o.hit}` : '—'}
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>{o.projected}</td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: 'var(--color-money)' }}>{o.net}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          onClick={() => { savePlan(plan); setSaved('saved'); }}
          className="px-3 py-1.5 rounded font-semibold"
          style={{ background: 'var(--color-accent)', color: 'var(--color-ground)', fontSize: 'var(--text-xs)' }}
        >
          Save plan
        </button>
        <button
          onClick={() => { clearPlan(managerId); setPlan(emptyPlan(managerId)); setSaved('cleared'); }}
          className="px-3 py-1.5 rounded"
          style={{
            background: 'var(--fill-2)', color: 'var(--ink-muted)',
            border: '1px solid var(--rule-strong)', fontSize: 'var(--text-xs)',
          }}
        >
          Clear
        </button>
        <span role="status" style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}>
          {saved === 'saved' && 'Saved to this browser.'}
          {saved === 'loaded' && 'Loaded a saved plan.'}
          {saved === 'cleared' && 'Cleared.'}
          {saved === null && 'Unsaved changes — stored on this device only.'}
        </span>
      </div>
    </section>
  );
}
