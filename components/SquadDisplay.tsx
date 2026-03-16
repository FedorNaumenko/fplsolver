import type { Player, Team, PickInfo } from '@/lib/types';
import { formatPrice } from '@/lib/utils';

interface Props {
  squad: Player[];
  picks: PickInfo[];
  budget: number;
  teamValue: number;
  currentGameweek: number;
  teams: Team[];
  managerName: string;
}

const POSITION_BG: Record<number, string> = {
  1: 'bg-yellow-500',
  2: 'bg-blue-500',
  3: 'bg-emerald-500',
  4: 'bg-red-500',
};

function StatusDot({ status }: { status: Player['status'] }) {
  if (status === 'a') return null;
  const colors: Record<string, string> = {
    d: 'bg-yellow-400',
    i: 'bg-red-500',
    s: 'bg-orange-400',
    u: 'bg-gray-400',
  };
  return (
    <span
      className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${colors[status]}`}
    />
  );
}

function PitchPlayer({
  player,
  isCaptain,
  isViceCaptain,
}: {
  player: Player;
  isCaptain: boolean;
  isViceCaptain: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 w-16">
      <div className="relative">
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-md ${POSITION_BG[player.element_type]}`}
        >
          {player.web_name.slice(0, 3).toUpperCase()}
        </div>
        <StatusDot status={player.status} />
        {isCaptain && (
          <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-yellow-400 text-black text-[9px] font-bold flex items-center justify-center shadow border border-white">
            C
          </span>
        )}
        {isViceCaptain && (
          <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-gray-300 text-black text-[9px] font-bold flex items-center justify-center shadow border border-white">
            V
          </span>
        )}
      </div>
      <div className="bg-white/90 backdrop-blur-sm rounded px-1 py-0.5 shadow text-center w-full">
        <div className="text-[11px] font-semibold text-gray-900 truncate leading-tight">
          {player.web_name}
        </div>
        <div className="text-[10px] text-gray-500 leading-tight">{player.total_points} pts</div>
      </div>
    </div>
  );
}

function BenchPlayer({ player }: { player: Player }) {
  return (
    <div className="flex flex-col items-center gap-1 w-14">
      <div className="relative">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow opacity-80 ${POSITION_BG[player.element_type]}`}
        >
          {player.web_name.slice(0, 3).toUpperCase()}
        </div>
        <StatusDot status={player.status} />
      </div>
      <div className="bg-white/20 rounded px-1 py-0.5 text-center w-full">
        <div className="text-[10px] font-medium text-white truncate leading-tight">
          {player.web_name}
        </div>
        <div className="text-[9px] text-gray-300 leading-tight">{player.total_points} pts</div>
      </div>
    </div>
  );
}

export default function SquadDisplay({
  squad,
  picks,
  budget,
  teamValue,
  currentGameweek,
  managerName,
}: Props) {
  const pickMap = Object.fromEntries(picks.map(p => [p.playerId, p]));

  const starters = picks
    .filter(p => p.position <= 11)
    .sort((a, b) => a.position - b.position)
    .map(p => squad.find(pl => pl.id === p.playerId))
    .filter(Boolean) as Player[];

  const bench = picks
    .filter(p => p.position > 11)
    .sort((a, b) => a.position - b.position)
    .map(p => squad.find(pl => pl.id === p.playerId))
    .filter(Boolean) as Player[];

  // Group starters by position for pitch rows (attack → defence order top to bottom)
  const pitchRows = [
    starters.filter(p => p.element_type === 4), // FWD
    starters.filter(p => p.element_type === 3), // MID
    starters.filter(p => p.element_type === 2), // DEF
    starters.filter(p => p.element_type === 1), // GK
  ];

  return (
    <div className="rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-green-900 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-base">{managerName}</h2>
          <p className="text-green-400 text-xs">Gameweek {currentGameweek}</p>
        </div>
        <div className="flex gap-4 text-sm text-right">
          <div>
            <div className="text-green-400 text-xs">Team Value</div>
            <div className="font-semibold">{formatPrice(teamValue)}</div>
          </div>
          <div>
            <div className="text-green-400 text-xs">Bank</div>
            <div className="font-semibold text-green-300">{formatPrice(budget)}</div>
          </div>
        </div>
      </div>

      {/* Pitch */}
      <div
        className="relative w-full py-5 px-2"
        style={{
          background:
            'repeating-linear-gradient(to bottom, #2d6a2d 0px, #2d6a2d 48px, #327532 48px, #327532 96px)',
        }}
      >
        {/* Centre line */}
        <div className="absolute left-6 right-6 top-1/2 h-px bg-white/20" />
        {/* Centre circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-white/20" />

        <div className="relative z-10 flex flex-col gap-5">
          {pitchRows.map((row, i) => (
            <div key={i} className="flex justify-center gap-2 sm:gap-4">
              {row.map(player => {
                const pick = pickMap[player.id];
                return (
                  <PitchPlayer
                    key={player.id}
                    player={player}
                    isCaptain={pick?.isCaptain ?? false}
                    isViceCaptain={pick?.isViceCaptain ?? false}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Bench */}
      <div className="bg-gray-800 px-4 py-3">
        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-3">
          Bench
        </p>
        <div className="flex justify-center gap-4 sm:gap-8">
          {bench.map((player, i) => (
            <div key={player.id} className="flex flex-col items-center gap-1">
              <span className="text-[9px] text-gray-500 font-semibold">{i + 1}</span>
              <BenchPlayer player={player} />
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-gray-900 px-4 py-2 flex gap-4 flex-wrap">
        {[
          { color: 'bg-yellow-500', label: 'GK' },
          { color: 'bg-blue-500', label: 'DEF' },
          { color: 'bg-emerald-500', label: 'MID' },
          { color: 'bg-red-500', label: 'FWD' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
            <span className="text-gray-400 text-[10px]">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-yellow-400 text-black text-[9px] font-bold flex items-center justify-center">C</span>
          <span className="text-gray-400 text-[10px]">Captain</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />
          <span className="text-gray-400 text-[10px]">Injured/Doubt</span>
        </div>
      </div>
    </div>
  );
}
