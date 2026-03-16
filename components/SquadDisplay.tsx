import type { Player, Team } from '@/lib/types';
import { getPositionName, formatPrice } from '@/lib/utils';

interface Props {
  squad: Player[];
  budget: number;
  teamValue: number;
  currentGameweek: number;
  teams: Team[];
  managerName: string;
}

const POSITION_ORDER = [1, 2, 3, 4];

function StatusBadge({ status }: { status: Player['status'] }) {
  if (status === 'a') return null;
  const styles: Record<string, string> = {
    d: 'bg-yellow-100 text-yellow-700',
    i: 'bg-red-100 text-red-700',
    s: 'bg-orange-100 text-orange-700',
    u: 'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = { d: 'Doubt', i: 'Inj', s: 'Susp', u: 'N/A' };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function PlayerRow({ player, team }: { player: Player; team?: Team }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-bold text-green-700 w-8 shrink-0">
          {getPositionName(player.element_type)}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{player.web_name}</span>
            <StatusBadge status={player.status} />
          </div>
          <span className="text-xs text-gray-400">{team?.short_name ?? ''}</span>
        </div>
      </div>
      <div className="flex gap-4 text-sm shrink-0">
        <div className="text-right">
          <div className="text-xs text-gray-400">Form</div>
          <div className="font-medium">{player.form}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Pts</div>
          <div className="font-medium">{player.total_points}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Price</div>
          <div className="font-medium">{formatPrice(player.now_cost)}</div>
        </div>
      </div>
    </div>
  );
}

export default function SquadDisplay({ squad, budget, teamValue, currentGameweek, teams, managerName }: Props) {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">{managerName}</h2>
          <p className="text-sm text-gray-500">Gameweek {currentGameweek}</p>
        </div>
        <div className="flex gap-4 text-sm text-right">
          <div>
            <div className="text-gray-400 text-xs">Team Value</div>
            <div className="font-semibold">{formatPrice(teamValue)}</div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Bank</div>
            <div className="font-semibold text-green-600">{formatPrice(budget)}</div>
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {POSITION_ORDER.flatMap(pos =>
          squad
            .filter(p => p.element_type === pos)
            .map(player => (
              <PlayerRow key={player.id} player={player} team={teamMap[player.team]} />
            ))
        )}
      </div>
    </div>
  );
}
