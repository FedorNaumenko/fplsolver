'use client';

import { useEffect, useRef, useState } from 'react';
import type { Player, Team, PlayerFixture, PlayerHistoryEntry } from '@/lib/types';
import { formatPrice, getPositionName } from '@/lib/utils';
import { fetchPlayerDetail } from '@/lib/fplData';

interface Props {
  player: Player;
  teams: Team[];
  onClose: () => void;
  onSubstitute?: () => void;
}

interface PlayerDetail {
  fixtures: PlayerFixture[];
  history: PlayerHistoryEntry[];
}

/** Fixture difficulty 1 (easiest) → 5 (hardest). */
const DIFFICULTY_CHIP: Record<number, { bg: string; fg: string }> = {
  1: { bg: 'oklch(62% 0.15 150)', fg: 'oklch(18% 0.04 150)' },
  2: { bg: 'oklch(75% 0.16 145)', fg: 'oklch(20% 0.05 145)' },
  3: { bg: 'oklch(85% 0.15 95)', fg: 'oklch(25% 0.06 95)' },
  4: { bg: 'oklch(70% 0.17 45)', fg: 'oklch(18% 0.05 45)' },
  5: { bg: 'oklch(58% 0.21 27)', fg: 'oklch(97% 0.01 27)' },
};

const STATUS_LABEL: Record<string, string> = {
  d: 'Doubtful',
  i: 'Injured',
  s: 'Suspended',
  u: 'Unavailable',
};

export default function PlayerDetailModal({ player, teams, onClose, onSubstitute }: Props) {
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const team = teams.find(t => t.id === player.team);

  useEffect(() => {
    fetchPlayerDetail(player.id)
      .then(setDetail)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [player.id]);

  // showModal() is what makes <dialog> a real dialog: it applies role="dialog" and
  // aria-modal, traps Tab inside, closes on Escape, and restores focus on close —
  // all things the previous hand-rolled div had to fake and didn't.
  useEffect(() => {
    const el = ref.current;
    if (!el?.open) el?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) ref.current?.close(); }}
      aria-labelledby="player-detail-name"
      className="w-full sm:max-w-md max-h-[92vh] p-0 rounded-t-xl sm:rounded-xl backdrop:bg-black/60"
      style={{ background: 'var(--color-ground)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
    >
      <div className="max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div
          className="p-4 sticky top-0"
          style={{ background: `linear-gradient(135deg, var(--color-plum), var(--color-indigo))` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="player-detail-name"
                className="font-bold leading-tight"
                style={{ fontSize: 'var(--text-xl)', overflowWrap: 'anywhere' }}
              >
                {player.web_name}
              </h2>
              <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
                {player.first_name} {player.second_name}
              </p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap" style={{ fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--color-accent)' }}>{team?.name ?? '—'}</span>
                <span
                  className="num px-2 py-0.5 rounded font-semibold"
                  style={{ background: 'var(--fill-2)', fontSize: 'var(--text-xs)' }}
                >
                  {getPositionName(player.element_type)}
                </span>
                <span className="num font-semibold">{formatPrice(player.now_cost)}</span>
              </div>
            </div>
            <button
              onClick={() => ref.current?.close()}
              className="shrink-0 w-8 h-8 rounded flex items-center justify-center text-2xl leading-none"
              style={{ color: 'var(--ink-muted)', background: 'var(--fill-1)' }}
              aria-label="Close player details"
            >
              ×
            </button>
          </div>

          {player.status !== 'a' && (
            <div
              className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium"
              style={{ background: 'var(--color-danger)', color: 'var(--color-ground)', fontSize: 'var(--text-xs)' }}
            >
              {STATUS_LABEL[player.status] ?? 'Unavailable'}
              {player.chance_of_playing_next_round !== null &&
                ` — ${player.chance_of_playing_next_round}% chance next GW`}
            </div>
          )}

          {/* The touch- and keyboard-reachable route into a substitution. */}
          {onSubstitute && (
            <button
              onClick={() => { onSubstitute(); ref.current?.close(); }}
              className="mt-3 w-full py-2 rounded-lg font-semibold"
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-ground)',
                fontSize: 'var(--text-sm)',
                transition: 'opacity var(--dur-short) var(--ease-out)',
              }}
            >
              Substitute this player
            </button>
          )}
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-5" style={{ background: 'var(--fill-1)' }}>
          {[
            { label: 'Form', value: player.form },
            { label: 'PPG', value: Number(player.points_per_game).toFixed(1) },
            { label: 'ICT', value: Number(player.ict_index).toFixed(0) },
            { label: 'Sel%', value: `${Number(player.selected_by_percent).toFixed(0)}%` },
            { label: 'Total', value: player.total_points },
          ].map(({ label, value }) => (
            <div key={label} className="py-3 text-center" style={{ borderLeft: '1px solid var(--rule)' }}>
              <div
                className="uppercase tracking-wide"
                style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}
              >
                {label}
              </div>
              <div className="num font-bold mt-0.5" style={{ fontSize: 'var(--text-sm)' }}>{value}</div>
            </div>
          ))}
        </div>

        <div className="p-4 space-y-5">
          {loading && (
            <p className="text-center py-8" style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
              Loading player data…
            </p>
          )}

          {error && (
            <div
              className="text-center py-6"
              style={{ color: 'var(--color-danger-ink)', fontSize: 'var(--text-sm)' }}
            >
              {error}
            </div>
          )}

          {detail && (
            <>
              {/* Upcoming fixtures */}
              <div>
                <h3
                  className="font-bold uppercase tracking-widest mb-3"
                  style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}
                >
                  Next fixtures
                </h3>
                {detail.fixtures.length === 0 ? (
                  <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>No upcoming fixtures</p>
                ) : (
                  <div className="flex gap-2">
                    {detail.fixtures.map((f, i) => {
                      const chip = DIFFICULTY_CHIP[f.difficulty] ?? { bg: 'var(--fill-2)', fg: 'var(--ink)' };
                      return (
                        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                          <span
                            className="num font-medium"
                            style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}
                          >
                            {f.is_home ? 'H' : 'A'}
                          </span>
                          <span
                            className="font-bold px-2 py-1.5 rounded w-full text-center truncate"
                            style={{ background: chip.bg, color: chip.fg, fontSize: 'var(--text-xs)' }}
                          >
                            {f.opponent_short_name}
                          </span>
                          <span
                            className="num"
                            style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}
                          >
                            {f.event_name.replace('Gameweek ', 'GW')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent form */}
              <div>
                <h3
                  className="font-bold uppercase tracking-widest mb-3"
                  style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}
                >
                  Recent form
                </h3>
                {detail.history.length === 0 ? (
                  <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>No match history yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full num" style={{ fontSize: 'var(--text-xs)' }}>
                      <thead>
                        <tr style={{ color: 'var(--ink-muted)', borderBottom: '1px solid var(--rule)' }}>
                          <th scope="col" className="text-left pb-2 font-medium">GW</th>
                          <th scope="col" className="text-left pb-2 font-medium">vs</th>
                          <th scope="col" className="text-right pb-2 font-medium">Min</th>
                          <th scope="col" className="text-right pb-2 font-medium">Pts</th>
                          <th scope="col" className="text-right pb-2 font-medium">G</th>
                          <th scope="col" className="text-right pb-2 font-medium">A</th>
                          <th scope="col" className="text-right pb-2 font-medium">CS</th>
                          <th scope="col" className="text-right pb-2 font-medium">Bon</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.history.map((h, i) => (
                          <tr
                            key={i}
                            style={{
                              borderTop: i === 0 ? undefined : '1px solid var(--rule)',
                              // Haul at 9+, blank at 1 or less — a tint, not a full row colour.
                              background:
                                h.total_points >= 9
                                  ? 'oklch(62% 0.15 150 / 0.18)'
                                  : h.total_points <= 1
                                  ? 'oklch(58% 0.21 27 / 0.16)'
                                  : undefined,
                            }}
                          >
                            <td className="py-2" style={{ color: 'var(--ink-muted)' }}>{h.round}</td>
                            <td className="py-2 font-medium">
                              {h.opponent_short_name}
                              <span className="ml-1" style={{ color: 'var(--ink-muted)' }}>
                                {h.was_home ? 'H' : 'A'}
                              </span>
                            </td>
                            <td className="py-2 text-right" style={{ color: 'var(--ink-muted)' }}>{h.minutes}</td>
                            <td className="py-2 text-right font-bold">{h.total_points}</td>
                            <td className="py-2 text-right" style={{ color: 'var(--ink-muted)' }}>{h.goals_scored || '—'}</td>
                            <td className="py-2 text-right" style={{ color: 'var(--ink-muted)' }}>{h.assists || '—'}</td>
                            <td className="py-2 text-right" style={{ color: 'var(--ink-muted)' }}>{h.clean_sheets || '—'}</td>
                            <td className="py-2 text-right" style={{ color: 'var(--ink-muted)' }}>{h.bonus || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
