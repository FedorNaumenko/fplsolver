'use client';

// Fills an empty slot on the pitch. This was the "Edit squad" board that sat under the
// pitch; the board is gone, but its search, club filter, sort and per-candidate legality
// verdicts are the same code — only the surface changed to a dialog, and the 15-slot
// strip went because the pitch is the slot list now.
//
// Reuses canAdd for legality, sortPlayers / isPlayerAvailable / getPlayerName /
// getStatusDescription from lib/utils, positionStats for the rate columns, and
// calcExpectedPoints for the ranking.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player, Team, Fixture } from '@/lib/types';
import {
  formatPrice, getPositionName, getPlayerName, getStatusDescription, sortPlayers,
  isPlayerAvailable, positionStats,
} from '@/lib/utils';
import { canAdd, DEFAULT_SETTINGS, type SquadSettings } from '@/lib/calculations/squadRules';
import { calcExpectedPoints } from '@/lib/calculations/xPts';
import { PRESEASON_GAMEWEEKS } from '@/lib/calculations/squadBuilder';

interface Props {
  /** Which position the empty slot needs. */
  elementType: number;
  squad: Player[];
  allPlayers: Player[];
  teams: Team[];
  fixtures: Fixture[];
  bank: number;
  /** Gameweeks each projection sums; shared with the pitch so both print one number. */
  horizon: number;
  gwOffset?: number;
  gameweeksPlayed?: number;
  settings?: SquadSettings;
  /** The gameweek this pick lands in — stated, so planning ahead is not a silent mode. */
  gameweek: number;
  onPick: (player: Player) => void;
  onClose: () => void;
}

type SortKey = 'xpts' | 'points' | 'price' | 'value' | 'form';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'xpts', label: 'Projected' },
  { key: 'points', label: 'Total pts' },
  { key: 'price', label: 'Price' },
  { key: 'value', label: 'Value' },
];

export default function PlayerPickerDialog({
  elementType, squad, allPlayers, teams, fixtures, bank, horizon,
  gwOffset = 0,
  gameweeksPlayed = PRESEASON_GAMEWEEKS,
  settings = DEFAULT_SETTINGS,
  gameweek, onPick, onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('xpts');
  const ref = useRef<HTMLDialogElement>(null);

  // showModal is what gives a <dialog> its role, focus trap, Escape and focus restore.
  useEffect(() => {
    const el = ref.current;
    if (!el?.open) el?.showModal();
  }, []);

  const teamName = useMemo(
    () => Object.fromEntries(teams.map(t => [t.id, t.short_name])) as Record<number, string>,
    [teams]
  );

  /**
   * Every player's projection, computed in one pass. Eager rather than a lazily filled
   * cache — a closure that memoises on call mutates state during render, which the React
   * compiler rejects. 564 players over ~380 fixtures is cheap.
   */
  const xPtsById = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of allPlayers) m.set(p.id, calcExpectedPoints(p, fixtures, gameweeksPlayed, horizon, gwOffset));
    return m;
  }, [allPlayers, fixtures, gameweeksPlayed, horizon, gwOffset]);
  const xPts = (p: Player) => xPtsById.get(p.id) ?? 0;

  /** Per-club counts feed the club filter's labels and canAdd's verdict. */
  const perClub = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of squad) m.set(p.team, (m.get(p.team) ?? 0) + 1);
    return m;
  }, [squad]);

  // Candidates for this position, each carrying its own legality verdict so a blocked
  // option can say why rather than silently vanishing.
  //
  // Not memoised: a filter and sort over the ~130 players of one position, where the
  // expensive part (every projection) is already memoised above. A useMemo here is one
  // the React compiler cannot preserve, for no measurable gain.
  const candidates = (() => {
    const q = query.trim().toLowerCase();
    const pool = allPlayers.filter(p => {
      if (p.element_type !== elementType) return false;
      if (teamFilter !== 'all' && p.team !== teamFilter) return false;
      if (!q) return true;
      return getPlayerName(p).toLowerCase().includes(q) || p.web_name.toLowerCase().includes(q);
    });

    const ordered = sort === 'xpts'
      // sortPlayers has no xPts case — it sorts stored fields, not a computed model.
      ? [...pool].sort((a, b) => (xPtsById.get(b.id) ?? 0) - (xPtsById.get(a.id) ?? 0))
      : sortPlayers(pool, sort as Exclude<SortKey, 'xpts'>, 'desc');

    // Nobody is being sold, so only the bank is available.
    const judged = ordered.map(p => ({
      player: p,
      verdict: canAdd(squad, p, elementType, bank, settings),
    }));

    // Affordable options first, each group keeping the chosen sort. Ranking purely by
    // projection buries every player you can actually sign: with a small bank the whole
    // visible list came back blocked, which is accurate and useless.
    const ok = judged.filter(c => c.verdict.ok);
    const blocked = judged.filter(c => !c.verdict.ok);
    return [...ok, ...blocked].slice(0, 60);
  })();

  const label = { color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' } as const;
  const position = getPositionName(elementType);
  const headerBg = 'linear-gradient(135deg, var(--color-plum), var(--color-indigo))';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) ref.current?.close(); }}
      aria-labelledby="picker-title"
      className="m-auto w-full sm:max-w-md max-h-[92vh] p-0 rounded-t-xl sm:rounded-xl backdrop:bg-black/60"
      style={{ background: 'var(--color-ground)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
    >
      <div className="max-h-[92vh] overflow-y-auto">
        <div className="p-4 sticky top-0" style={{ background: headerBg }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="picker-title" className="font-bold leading-tight" style={{ fontSize: 'var(--text-lg)' }}>
                Add a {position}
              </h2>
              <p className="num" style={label}>
                GW{gameweek} · up to {formatPrice(bank)} · projections over {horizon} gameweek
                {horizon > 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => ref.current?.close()}
              className="shrink-0 w-8 h-8 rounded flex items-center justify-center text-2xl leading-none"
              style={{ color: 'var(--ink-muted)', background: 'var(--fill-1)' }}
              aria-label="Close player picker"
            >
              ×
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${position}s`}
              className="flex-1 min-w-0 rounded-lg px-3 py-2"
              style={{
                backgroundColor: 'var(--fill-2)',
                border: '1px solid var(--rule-strong)',
                color: 'var(--ink)',
                fontSize: 'var(--text-sm)',
              }}
            />
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              aria-label="Filter by club"
              className="select-field rounded-lg px-2 py-2"
              style={{
                // backgroundColor, not background — the shorthand resets the chevron image.
                backgroundColor: 'var(--fill-2)',
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
            {SORTS.map(so => (
              <button
                key={so.key}
                onClick={() => setSort(so.key)}
                aria-pressed={sort === so.key}
                className="font-semibold px-2.5 py-1 rounded-full"
                style={{
                  fontSize: 'var(--text-xs)',
                  transition: 'background-color var(--dur-short) var(--ease-out)',
                  ...(sort === so.key
                    ? { background: 'var(--color-accent)', color: 'var(--color-ground)' }
                    : { background: 'var(--fill-2)', color: 'var(--ink-muted)' }),
                }}
              >
                {so.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="px-4 pb-4">
          {candidates.length === 0 && (
            <li className="py-4" style={label}>No {position}s match that filter.</li>
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
                  {/* isPlayerAvailable is stricter than canAdd's status check — it also
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
                  {xPts(player).toFixed(1)}/{horizon}GW
                  {positionStats(player).map(st => ` · ${st.label} ${st.value}`).join('')}
                </div>
              </div>
              {verdict.ok ? (
                <button
                  onClick={() => { onPick(player); ref.current?.close(); }}
                  className="shrink-0 font-semibold px-3 py-1.5 rounded"
                  style={{
                    background: 'var(--color-accent)',
                    color: 'var(--color-ground)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  Add
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
    </dialog>
  );
}
