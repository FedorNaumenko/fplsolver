'use client';

import { useEffect, useState } from 'react';
import type { Player, Team, PlayerFixture, PlayerHistoryEntry } from '@/lib/types';
import { formatPrice, getPositionName } from '@/lib/utils';

interface Props {
  player: Player;
  teams: Team[];
  onClose: () => void;
}

interface PlayerDetail {
  fixtures: PlayerFixture[];
  history: PlayerHistoryEntry[];
}

const DIFFICULTY_STYLE: Record<number, string> = {
  1: 'bg-emerald-500 text-white',
  2: 'bg-green-400 text-white',
  3: 'bg-yellow-400 text-gray-900',
  4: 'bg-orange-500 text-white',
  5: 'bg-red-600 text-white',
};

const STATUS_LABEL: Record<string, string> = {
  d: 'Doubtful',
  i: 'Injured',
  s: 'Suspended',
  u: 'Unavailable',
};

export default function PlayerDetailModal({ player, teams, onClose }: Props) {
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const team = teams.find(t => t.id === player.team);

  useEffect(() => {
    fetch(`/api/player/${player.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setDetail(data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [player.id]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:rounded-xl sm:max-w-md max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-green-900 text-white p-4 sm:rounded-t-xl sticky top-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold leading-tight">{player.web_name}</h2>
              <p className="text-sm text-green-300">{player.first_name} {player.second_name}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-green-200 text-sm">{team?.name ?? '—'}</span>
                <span className="bg-white/20 text-xs px-2 py-0.5 rounded font-semibold">
                  {getPositionName(player.element_type)}
                </span>
                <span className="font-semibold text-sm">{formatPrice(player.now_cost)}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-3xl leading-none ml-2 mt-[-4px]"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {player.status !== 'a' && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-red-500/80 rounded-full px-3 py-1 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              {STATUS_LABEL[player.status] ?? 'Unavailable'}
              {player.chance_of_playing_next_round !== null &&
                ` — ${player.chance_of_playing_next_round}% chance next GW`}
            </div>
          )}
        </div>

        {/* Key stats bar */}
        <div className="grid grid-cols-5 divide-x border-b bg-gray-50">
          {[
            { label: 'Form', value: player.form },
            { label: 'PPG', value: Number(player.points_per_game).toFixed(1) },
            { label: 'ICT', value: Number(player.ict_index).toFixed(0) },
            { label: 'Sel%', value: `${Number(player.selected_by_percent).toFixed(0)}%` },
            { label: 'Total', value: player.total_points },
          ].map(({ label, value }) => (
            <div key={label} className="py-3 text-center">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
              <div className="font-bold text-gray-900 text-sm mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        <div className="p-4 space-y-5">
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm mt-2">Loading player data...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-6 text-red-500 text-sm">{error}</div>
          )}

          {detail && (
            <>
              {/* Upcoming fixtures */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Next Fixtures
                </h3>
                {detail.fixtures.length === 0 ? (
                  <p className="text-sm text-gray-400">No upcoming fixtures</p>
                ) : (
                  <div className="flex gap-2">
                    {detail.fixtures.map((f, i) => (
                      <div key={i} className="flex flex-col items-center gap-1 flex-1">
                        <span className="text-[10px] text-gray-400 font-medium">
                          {f.is_home ? 'H' : 'A'}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-1.5 rounded w-full text-center ${DIFFICULTY_STYLE[f.difficulty]}`}
                        >
                          {f.opponent_short_name}
                        </span>
                        <span className="text-[10px] text-gray-400">{f.event_name.replace('Gameweek ', 'GW')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent form */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Recent Form
                </h3>
                {detail.history.length === 0 ? (
                  <p className="text-sm text-gray-400">No match history yet</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b">
                        <th className="text-left pb-2 font-medium">GW</th>
                        <th className="text-left pb-2 font-medium">vs</th>
                        <th className="text-right pb-2 font-medium">Min</th>
                        <th className="text-right pb-2 font-medium">Pts</th>
                        <th className="text-right pb-2 font-medium">G</th>
                        <th className="text-right pb-2 font-medium">A</th>
                        <th className="text-right pb-2 font-medium">CS</th>
                        <th className="text-right pb-2 font-medium">Bon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detail.history.map((h, i) => (
                        <tr
                          key={i}
                          className={
                            h.total_points >= 9
                              ? 'bg-green-50'
                              : h.total_points <= 1
                              ? 'bg-red-50'
                              : ''
                          }
                        >
                          <td className="py-2 text-gray-400">{h.round}</td>
                          <td className="py-2 font-medium">
                            {h.opponent_short_name}
                            <span className="text-gray-400 ml-1">{h.was_home ? 'H' : 'A'}</span>
                          </td>
                          <td className="py-2 text-right text-gray-500">{h.minutes}</td>
                          <td className="py-2 text-right font-bold">{h.total_points}</td>
                          <td className="py-2 text-right text-gray-600">{h.goals_scored || '—'}</td>
                          <td className="py-2 text-right text-gray-600">{h.assists || '—'}</td>
                          <td className="py-2 text-right text-gray-600">{h.clean_sheets || '—'}</td>
                          <td className="py-2 text-right text-gray-600">{h.bonus || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
