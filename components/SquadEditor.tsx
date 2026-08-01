'use client';

// Lets you change any pick in the squad, which pre-season is the only way to build
// a team at all: FPL 404s picks until a deadline passes, so the suggested XV from
// squadBuilder was previously a fixed answer with no way to disagree with it.
//
// Deliberately reuses what already exists — canSwap for legality, sortPlayers /
// isPlayerAvailable / getPlayerName / getStatusDescription from lib/utils (all four
// had zero call sites before this), and calcExpectedPoints for the ranking.

import { useMemo, useState } from 'react';
import type { Player, Team, Fixture } from '@/lib/types';
import {
  formatPrice, getPositionName, getPlayerName, getStatusDescription, sortPlayers, isPlayerAvailable,
} from '@/lib/utils';
import { canSwap, DEFAULT_SETTINGS, type SquadSettings } from '@/lib/calculations/squadRules';
import { calcExpectedPoints } from '@/lib/calculations/xPts';
import { PRESEASON_GAMEWEEKS } from '@/lib/calculations/squadBuilder';

interface Props {
  squad: Player[];
  allPlayers: Player[];
  teams: Team[];
  fixtures: Fixture[];
  bank: number;
  gameweeksPlayed?: number;
  settings?: SquadSettings;
  onSwap: (playerOut: Player, playerIn: Player) => void;
}

type SortKey = 'xpts' | 'points' | 'price' | 'value' | 'form';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'xpts', label: 'Projected' },
  { key: 'points', label: 'Total pts' },
  { key: 'price', label: 'Price' },
  { key: 'value', label: 'Value' },
];

export default function SquadEditor({
  squad, allPlayers, teams, fixtures, bank,
  gameweeksPlayed = PRESEASON_GAMEWEEKS,
  settings = DEFAULT_SETTINGS,
  onSwap,
}: Props) {
  const [outId, setOutId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('xpts');

  const playerOut = squad.find(p => p.id === outId) ?? null;

  const teamName = useMemo(
    () => Object.fromEntries(teams.map(t => [t.id, t.short_name])) as Record<number, string>,
    [teams]
  );

  /**
   * Every player's projection, computed in one pass. Eager rather than a lazily
   * filled cache — a closure that memoises on call mutates state during render,
   * which the React compiler rejects. 564 players over ~380 fixtures is cheap.
   */
  const xPtsById = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of allPlayers) m.set(p.id, calcExpectedPoints(p, fixtures, gameweeksPlayed, 3, 0));
    return m;
  }, [allPlayers, fixtures, gameweeksPlayed]);
  const xPts = (p: Player) => xPtsById.get(p.id) ?? 0;

  /** Per-club counts drive both the counter strip and canSwap's verdict. */
  const perClub = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of squad) m.set(p.team, (m.get(p.team) ?? 0) + 1);
    return m;
  }, [squad]);

  const spent = squad.reduce((sum, p) => sum + p.now_cost, 0);

  // Candidates for the selected slot, each carrying its own legality verdict so a
  // blocked option can say why rather than silently vanishing.
  //
  // Not memoised: this is a filter and sort over the ~130 players of one position,
  // and the expensive part (every projection) is already memoised above. A useMemo
  // here is one the React compiler cannot preserve, for no measurable gain.
  const candidates = (() => {
    if (!playerOut) return [];
    const q = query.trim().toLowerCase();
    const pool = allPlayers.filter(p => {
      if (p.element_type !== playerOut.element_type) return false;
      if (p.id === playerOut.id) return false;
      if (teamFilter !== 'all' && p.team !== teamFilter) return false;
      if (!q) return true;
      return getPlayerName(p).toLowerCase().includes(q) || p.web_name.toLowerCase().includes(q);
    });

    const ordered = sort === 'xpts'
      // sortPlayers has no xPts case — it sorts stored fields, not a computed model.
      ? [...pool].sort((a, b) => (xPtsById.get(b.id) ?? 0) - (xPtsById.get(a.id) ?? 0))
      : sortPlayers(pool, sort as Exclude<SortKey, 'xpts'>, 'desc');

    return ordered
      .slice(0, 60)
      .map(p => ({ player: p, verdict: canSwap(squad, playerOut, p, bank, settings) }));
  })();

  const label = { color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' } as const;

  return (
    <section style={{ borderTop: '1px solid var(--rule-strong)' }} className="pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-semibold" style={{ color: 'var(--ink)', fontSize: 'var(--text-base)' }}>
          Edit squad
        </h2>
        <p className="num" style={label}>
          {formatPrice(spent)} of {formatPrice(settings.totalSpend)} spent · {formatPrice(bank)} in bank
        </p>
      </div>

      {/* Squad slots — choose the player to replace */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {squad.map(p => {
          const selected = p.id === outId;
          return (
            <button
              key={p.id}
              onClick={() => setOutId(selected ? null : p.id)}
              aria-pressed={selected}
              className="px-2 py-1.5 rounded-lg text-left"
              style={{
                fontSize: 'var(--text-xs)',
                minWidth: '5.5rem',
                background: selected ? 'var(--color-accent)' : 'var(--fill-2)',
                color: selected ? 'var(--color-ground)' : 'var(--ink)',
                border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--rule)'}`,
                transition: 'background-color var(--dur-short) var(--ease-out)',
              }}
            >
              <span className="block truncate font-semibold">{p.web_name}</span>
              <span className="num block" style={{ opacity: 0.75 }}>
                {getPositionName(p.element_type)} {teamName[p.team] ?? '?'} {formatPrice(p.now_cost)}
              </span>
            </button>
          );
        })}
      </div>

      {!playerOut && (
        <p className="mt-3" style={label}>
          Select a player above to see legal replacements. Limits: {settings.squadSize} players,
          max {settings.teamLimit} per club, {formatPrice(settings.totalSpend)} budget.
        </p>
      )}

      {playerOut && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${getPositionName(playerOut.element_type)}s`}
              className="flex-1 min-w-0 rounded-lg px-3 py-2"
              style={{
                background: 'var(--fill-2)',
                border: '1px solid var(--rule-strong)',
                color: 'var(--ink)',
                fontSize: 'var(--text-sm)',
              }}
            />
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              aria-label="Filter by club"
              className="rounded-lg px-2 py-2"
              style={{
                background: 'var(--fill-2)',
                border: '1px solid var(--rule-strong)',
                color: 'var(--ink)',
                fontSize: 'var(--text-sm)',
              }}
            >
              <option value="all">All clubs</option>
              {[...teams].sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                <option key={t.id} value={t.id}>
                  {t.short_name} ({perClub.get(t.id) ?? 0})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {SORTS.map(s => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
                className="font-semibold px-2.5 py-1 rounded-full"
                style={{
                  fontSize: 'var(--text-xs)',
                  transition: 'background-color var(--dur-short) var(--ease-out)',
                  ...(sort === s.key
                    ? { background: 'var(--color-accent)', color: 'var(--color-ground)' }
                    : { background: 'var(--fill-2)', color: 'var(--ink-muted)' }),
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <p className="mt-3" style={label}>
            Replacing <strong style={{ color: 'var(--ink)' }}>{playerOut.web_name}</strong> —{' '}
            up to {formatPrice(playerOut.now_cost + bank)} available.
          </p>

          <ul className="mt-2 divide-y" style={{ borderColor: 'var(--rule)' }}>
            {candidates.length === 0 && (
              <li className="py-3" style={label}>No players match that filter.</li>
            )}
            {candidates.map(({ player, verdict }) => (
              <li
                key={player.id}
                className="flex items-center justify-between gap-3 py-2"
                style={{ borderTop: '1px solid var(--rule)' }}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>
                    {player.web_name}
                    {/* isPlayerAvailable is stricter than canSwap's status check — it also
                      * flags a nominally-available player with a low chance of playing. */}
                    {!isPlayerAvailable(player) && (
                      <span className="ml-1.5" style={{ color: 'var(--color-danger-ink)', fontSize: 'var(--text-xs)' }}>
                        {player.status === 'a'
                          ? `${player.chance_of_playing_this_round ?? 0}% to play`
                          : getStatusDescription(player.status)}
                      </span>
                    )}
                  </div>
                  <div className="num" style={label}>
                    {teamName[player.team] ?? '?'} · {formatPrice(player.now_cost)} ·{' '}
                    {xPts(player).toFixed(1)} proj · xGI/90 {Number(player.expected_goal_involvements_per_90 ?? 0).toFixed(2)}
                  </div>
                </div>
                {verdict.ok ? (
                  <button
                    onClick={() => { onSwap(playerOut, player); setOutId(null); setQuery(''); }}
                    className="shrink-0 font-semibold px-3 py-1.5 rounded"
                    style={{
                      background: 'var(--color-accent)',
                      color: 'var(--color-ground)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    Swap in
                  </button>
                ) : (
                  <span
                    className="shrink-0 px-2 py-1.5 rounded text-center font-medium"
                    style={{
                      background: 'oklch(71.2% 0.181 22.8 / 0.12)',
                      border: '1px solid oklch(71.2% 0.181 22.8 / 0.3)',
                      color: 'var(--color-danger-ink)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    {verdict.reason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
