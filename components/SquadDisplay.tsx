'use client';

import { useState } from 'react';
import type { Player, Team, PickInfo, PlayerFixture } from '@/lib/types';
import { formatPrice, getPositionName } from '@/lib/utils';
import PlayerDetailModal from './PlayerDetailModal';

interface Props {
  squad: Player[];
  picks: PickInfo[];
  budget: number;
  teamValue: number;
  currentGameweek: number;
  teams: Team[];
  managerName: string;
  playerFixtures: Record<number, PlayerFixture[]>;
  onPicksChange: (picks: PickInfo[]) => void;
  projGWIndex: number;
  onProjGWIndexChange: (index: number) => void;
}

const POSITION_CARD_GRADIENT: Record<number, string> = {
  1: 'linear-gradient(170deg, #d97706 0%, #92400e 100%)',
  2: 'linear-gradient(170deg, #2563eb 0%, #1e3a8a 100%)',
  3: 'linear-gradient(170deg, #059669 0%, #064e3b 100%)',
  4: 'linear-gradient(170deg, #dc2626 0%, #7f1d1d 100%)',
};

const DIFFICULTY_CHIP: Record<number, string> = {
  1: 'bg-emerald-600 text-white',
  2: 'bg-green-400 text-white',
  3: 'bg-yellow-300 text-gray-900',
  4: 'bg-orange-500 text-white',
  5: 'bg-red-600 text-white',
};

function FixtureChips({ fixtures }: { fixtures?: PlayerFixture[] }) {
  if (!fixtures || fixtures.length === 0) return null;
  return (
    <div className="flex gap-0.5 justify-center mt-0.5">
      {fixtures.slice(0, 2).map((f, i) => (
        <span
          key={i}
          className={`text-[6px] font-bold px-0.5 py-px rounded leading-none ${DIFFICULTY_CHIP[f.difficulty] ?? 'bg-gray-400 text-white'}`}
          title={`GW${f.event}: ${f.opponent_short_name} (${f.is_home ? 'H' : 'A'})`}
        >
          {f.opponent_short_name}
        </span>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: Player['status'] }) {
  if (status === 'a') return null;
  const colors: Record<string, string> = { d: 'bg-yellow-400', i: 'bg-red-500', s: 'bg-orange-400', u: 'bg-gray-400' };
  return <span className={`absolute top-0.5 right-0.5 z-30 w-2.5 h-2.5 rounded-full border border-white ${colors[status]}`} />;
}

function Goal() {
  return (
    <div className="flex justify-center mb-1">
      <svg width="96" height="30" viewBox="0 0 96 30" fill="none">
        <rect x="4" y="3" width="88" height="26" rx="1.5" stroke="white" strokeWidth="2.5" strokeOpacity="0.85" fill="rgba(255,255,255,0.07)" />
        {[18, 30, 42, 54, 66, 78].map((x, i) => (
          <line key={i} x1={x} y1={4} x2={x} y2={28} stroke="white" strokeWidth="0.7" strokeOpacity="0.25" />
        ))}
        {[11, 19].map((y, i) => (
          <line key={i} x1={5} y1={y} x2={91} y2={y} stroke="white" strokeWidth="0.7" strokeOpacity="0.25" />
        ))}
      </svg>
    </div>
  );
}

function isValidFormation(picks: PickInfo[], playerMap: Record<number, Player>): boolean {
  const starters = picks.filter(p => p.position <= 11);
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const pick of starters) {
    const pos = playerMap[pick.playerId]?.element_type;
    if (pos) counts[pos] = (counts[pos] ?? 0) + 1;
  }
  return counts[1] === 1 && counts[2] >= 3 && counts[3] >= 2 && counts[4] >= 1;
}

function getValidSwaps(playerId: number, picks: PickInfo[], playerMap: Record<number, Player>): Set<number> {
  const player = playerMap[playerId];
  if (!player) return new Set();
  const playerPick = picks.find(p => p.playerId === playerId);
  if (!playerPick) return new Set();
  const isStarter = playerPick.position <= 11;
  const valid = new Set<number>();
  for (const pick of picks) {
    if (pick.playerId === playerId) continue;
    const targetPlayer = playerMap[pick.playerId];
    if (!targetPlayer) continue;
    const targetIsStarter = pick.position <= 11;
    // Same zone: always valid (cosmetic reorder)
    if (isStarter === targetIsStarter) { valid.add(pick.playerId); continue; }
    // Cross-zone: GK can only swap with GK
    if (player.element_type === 1 || targetPlayer.element_type === 1) {
      if (player.element_type === targetPlayer.element_type) valid.add(pick.playerId);
      continue;
    }
    // Cross-zone outfield: check formation
    const testPicks = picks.map(p => {
      if (p.playerId === playerId) return { ...p, position: pick.position };
      if (p.playerId === pick.playerId) return { ...p, position: playerPick.position };
      return p;
    });
    if (isValidFormation(testPicks, playerMap)) valid.add(pick.playerId);
  }
  return valid;
}

function projectPoints(player: Player, fixture?: PlayerFixture, currentGameweek: number = 38): number {
  if (!fixture) return 0;
  const form = parseFloat(player.form) || 0;
  const ppg = Number(player.points_per_game) || 0;
  const base = form > 0 ? (form * 0.6 + ppg * 0.4) : ppg;
  if (base === 0) return 0;
  const diffMultiplier = Math.max(0.2, (6 - fixture.difficulty) / 3);
  const avgMins = currentGameweek > 0 ? player.minutes / currentGameweek : 60;
  const minsMult = avgMins >= 60 ? 1.0 : avgMins >= 45 ? 0.8 : avgMins >= 30 ? 0.5 : avgMins >= 15 ? 0.25 : 0.2;
  return Math.round(base * diffMultiplier * minsMult * 10) / 10;
}

function PlayerCard({
  player, pts, isCaptain = false, isViceCaptain = false, fixtures, size = 'starter',
  isDragging = false, isDragOver = false, isValidDrop = false,
  onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, onClick,
}: {
  player: Player; pts: number; isCaptain?: boolean; isViceCaptain?: boolean;
  fixtures?: PlayerFixture[]; size?: 'starter' | 'bench';
  isDragging?: boolean; isDragOver?: boolean; isValidDrop?: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void; onDragEnd: () => void; onDragLeave: () => void;
  onClick: () => void;
}) {
  const isStarter = size === 'starter';
  const cardWidth = isStarter ? 62 : 52;
  const imgHeight = isStarter ? 58 : 48;

  let borderColor = 'rgba(255,255,255,0.12)';
  let boxShadow = 'none';
  if (isDragOver && isValidDrop) { borderColor = '#04f5ff'; boxShadow = '0 0 14px rgba(4,245,255,0.55)'; }
  else if (isDragOver && !isValidDrop) { borderColor = '#ff6b6b'; }

  return (
    <button
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
      className="focus:outline-none select-none"
      style={{
        width: `${cardWidth}px`,
        opacity: isDragging ? 0.35 : 1,
        transform: isDragOver && isValidDrop ? 'scale(1.07)' : 'scale(1)',
        transition: 'transform 0.1s ease, opacity 0.1s ease',
        cursor: 'grab',
      }}
      title={`${player.web_name} — drag to substitute, tap for details`}
    >
      <div
        className="rounded-lg overflow-hidden flex flex-col"
        style={{
          background: POSITION_CARD_GRADIENT[player.element_type],
          border: `2px solid ${borderColor}`,
          boxShadow,
        }}
      >
        {/* Image section */}
        <div className="relative" style={{ height: `${imgHeight}px`, overflow: 'hidden' }}>
          {/* Initials fallback (shown when photo fails) */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.25)' }}>
            <div
              className="rounded-full flex items-center justify-center font-black"
              style={{
                width: isStarter ? '38px' : '32px',
                height: isStarter ? '38px' : '32px',
                background: 'rgba(0,0,0,0.45)',
                color: 'rgba(255,255,255,0.85)',
                fontSize: isStarter ? '12px' : '10px',
                letterSpacing: '0.5px',
              }}
            >
              {player.web_name.slice(0, 3).toUpperCase()}
            </div>
          </div>
          {/* Player photo */}
          <img
            src={`https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.code}.png`}
            alt={player.web_name}
            draggable={false}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'cover', objectPosition: 'center 8%', zIndex: 1 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          {/* Bottom gradient */}
          <div className="absolute inset-x-0 bottom-0 h-6 z-10" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.55))' }} />
          {/* Position badge */}
          <span
            className="absolute bottom-0.5 left-0.5 z-20 font-black uppercase"
            style={{ fontSize: '6px', background: 'rgba(0,0,0,0.7)', color: 'rgba(255,255,255,0.9)', padding: '1px 3px', borderRadius: '2px', lineHeight: 1.4 }}
          >
            {getPositionName(player.element_type)}
          </span>
          {/* Status dot */}
          <StatusDot status={player.status} />
          {/* Captain/VC badge */}
          {isCaptain && (
            <span className="absolute top-0.5 right-0.5 z-20 w-4 h-4 rounded-full bg-yellow-400 text-black font-bold flex items-center justify-center" style={{ fontSize: '8px' }}>C</span>
          )}
          {isViceCaptain && (
            <span className="absolute top-0.5 right-0.5 z-20 w-4 h-4 rounded-full bg-gray-200 text-black font-bold flex items-center justify-center" style={{ fontSize: '8px' }}>V</span>
          )}
        </div>
        {/* Info strip */}
        <div className="px-1 pt-0.5 pb-1 text-center" style={{ background: 'rgba(0,0,0,0.82)' }}>
          <div className="text-white font-semibold truncate leading-tight" style={{ fontSize: isStarter ? '9px' : '8px' }}>{player.web_name}</div>
          <div className="font-bold leading-tight" style={{ color: '#04f5ff', fontSize: isStarter ? '9px' : '8px' }}>{pts} pts</div>
          <FixtureChips fixtures={fixtures} />
        </div>
      </div>
    </button>
  );
}

export default function SquadDisplay({
  squad, picks, budget, teamValue, currentGameweek, teams, managerName,
  playerFixtures, onPicksChange, projGWIndex, onProjGWIndexChange,
}: Props) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [pointsMode, setPointsMode] = useState<'total' | 'gw' | 'projected'>('total');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const playerMap = Object.fromEntries(squad.map(p => [p.id, p]));
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

  const pitchRows = [
    starters.filter(p => p.element_type === 1),
    starters.filter(p => p.element_type === 2),
    starters.filter(p => p.element_type === 3),
    starters.filter(p => p.element_type === 4),
  ];

  const validDropTargets = draggingId !== null ? getValidSwaps(draggingId, picks, playerMap) : new Set<number>();

  const getPlayerDisplayPts = (player: Player): number => {
    if (pointsMode === 'total') return player.total_points;
    if (pointsMode === 'gw') return player.event_points;
    return projectPoints(player, playerFixtures[player.id]?.[projGWIndex], currentGameweek);
  };

  const projGWEvent = (() => {
    for (const p of starters) {
      const f = playerFixtures[p.id]?.[projGWIndex];
      if (f) return f.event;
    }
    return currentGameweek + projGWIndex + 1;
  })();

  const teamTotal = starters.reduce((sum, p) => {
    const pick = pickMap[p.id];
    const mult = pick?.isCaptain ? 2 : 1;
    return sum + getPlayerDisplayPts(p) * mult;
  }, 0);

  const displayTotal = pointsMode === 'projected' ? Math.round(teamTotal * 10) / 10 : Math.round(teamTotal);

  const headerLabel =
    pointsMode === 'total' ? 'Season Total' :
    pointsMode === 'gw' ? `GW${currentGameweek} Points` :
    `Proj GW${projGWEvent}`;

  const canNavLeft = projGWIndex > 0;
  const canNavRight = projGWIndex < 2 && starters.some(p => playerFixtures[p.id]?.[projGWIndex + 1]);

  const makeHandlers = (player: Player) => ({
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', String(player.id));
      e.dataTransfer.effectAllowed = 'move';
      setDraggingId(player.id);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = validDropTargets.has(player.id) ? 'move' : 'none';
      if (dragOverId !== player.id) setDragOverId(player.id);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const sourceId = Number(e.dataTransfer.getData('text/plain'));
      if (sourceId === player.id || !validDropTargets.has(player.id)) {
        setDraggingId(null); setDragOverId(null); return;
      }
      const sourcePick = picks.find(p => p.playerId === sourceId);
      const targetPick = picks.find(p => p.playerId === player.id);
      if (!sourcePick || !targetPick) return;
      const newPicks = picks.map(p => {
        if (p.playerId === sourceId) return { ...p, position: targetPick.position };
        if (p.playerId === player.id) return { ...p, position: sourcePick.position };
        return p;
      });
      onPicksChange(newPicks);
      setDraggingId(null); setDragOverId(null);
    },
    onDragEnd: () => { setDraggingId(null); setDragOverId(null); },
    onDragLeave: () => { if (dragOverId === player.id) setDragOverId(null); },
    onClick: () => setSelectedPlayer(player),
  });

  return (
    <>
      <div className="rounded-xl shadow-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
        {/* Header */}
        <div className="px-4 py-3" style={{ background: 'linear-gradient(135deg, #37003c 0%, #1a0070 100%)' }}>
          <div className="flex items-start justify-between gap-3">
            {/* Left: name + GW + mode toggles */}
            <div className="flex flex-col gap-1.5">
              <div>
                <h2 className="font-bold text-base text-white">{managerName}</h2>
                <p className="text-xs" style={{ color: '#04f5ff' }}>Gameweek {currentGameweek}</p>
              </div>
              <div className="flex gap-1">
                {(['total', 'gw', 'projected'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setPointsMode(mode)}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors"
                    style={pointsMode === mode
                      ? { background: '#04f5ff', color: '#1a0025' }
                      : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}
                  >
                    {mode === 'total' ? 'Season' : mode === 'gw' ? `GW${currentGameweek}` : 'Projected'}
                  </button>
                ))}
              </div>
              {pointsMode === 'projected' && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <button
                    onClick={() => canNavLeft && onProjGWIndexChange(projGWIndex - 1)}
                    disabled={!canNavLeft}
                    className="text-[11px] px-1.5 py-0.5 rounded transition-colors"
                    style={{ color: canNavLeft ? '#04f5ff' : 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)' }}
                  >←</button>
                  <span className="text-[11px] font-semibold" style={{ color: '#04f5ff' }}>GW{projGWEvent}</span>
                  <button
                    onClick={() => canNavRight && onProjGWIndexChange(projGWIndex + 1)}
                    disabled={!canNavRight}
                    className="text-[11px] px-1.5 py-0.5 rounded transition-colors"
                    style={{ color: canNavRight ? '#04f5ff' : 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)' }}
                  >→</button>
                </div>
              )}
            </div>

            {/* Center: team total */}
            <div className="flex flex-col items-center justify-center flex-1">
              <div className="text-3xl font-black text-white leading-none">{displayTotal}</div>
              <div className="text-[10px] mt-0.5 font-semibold uppercase tracking-wide" style={{ color: '#04f5ff' }}>{headerLabel}</div>
            </div>

            {/* Right: value + bank */}
            <div className="flex gap-3 text-sm text-right">
              <div>
                <div className="text-xs" style={{ color: '#04f5ff' }}>Team Value</div>
                <div className="font-semibold text-white">{formatPrice(teamValue)}</div>
              </div>
              <div>
                <div className="text-xs" style={{ color: '#04f5ff' }}>Bank</div>
                <div className="font-semibold" style={{ color: '#00ff87' }}>{formatPrice(budget)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Pitch */}
        <div
          className="relative w-full py-4 px-2"
          style={{ background: 'repeating-linear-gradient(to bottom, #2d6a2d 0px, #2d6a2d 48px, #327532 48px, #327532 96px)' }}
        >
          <div className="absolute left-6 right-6 top-1/2 h-px bg-white/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-white/20" />
          <div className="relative z-10 flex flex-col gap-4">
            {pitchRows.map((row, i) => (
              <div key={i}>
                {i === 0 && <Goal />}
                <div className="flex justify-center gap-1 sm:gap-2">
                  {row.map(player => {
                    const pick = pickMap[player.id];
                    const h = makeHandlers(player);
                    return (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        pts={getPlayerDisplayPts(player)}
                        isCaptain={pick?.isCaptain ?? false}
                        isViceCaptain={pick?.isViceCaptain ?? false}
                        fixtures={playerFixtures[player.id]}
                        size="starter"
                        isDragging={draggingId === player.id}
                        isDragOver={dragOverId === player.id}
                        isValidDrop={validDropTargets.has(player.id)}
                        onDragStart={h.onDragStart}
                        onDragOver={h.onDragOver}
                        onDrop={h.onDrop}
                        onDragEnd={h.onDragEnd}
                        onDragLeave={h.onDragLeave}
                        onClick={h.onClick}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bench */}
        <div className="px-4 py-3" style={{ background: 'rgba(10,0,20,0.7)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Bench</p>
            <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Drag cards to substitute</p>
          </div>
          <div className="flex justify-center gap-3 sm:gap-6">
            {bench.map((player, i) => {
              const h = makeHandlers(player);
              return (
                <div key={player.id} className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>{i + 1}</span>
                  <PlayerCard
                    player={player}
                    pts={getPlayerDisplayPts(player)}
                    fixtures={playerFixtures[player.id]}
                    size="bench"
                    isDragging={draggingId === player.id}
                    isDragOver={dragOverId === player.id}
                    isValidDrop={validDropTargets.has(player.id)}
                    onDragStart={h.onDragStart}
                    onDragOver={h.onDragOver}
                    onDrop={h.onDrop}
                    onDragEnd={h.onDragEnd}
                    onDragLeave={h.onDragLeave}
                    onClick={h.onClick}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 py-2 flex gap-3 flex-wrap items-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          {[
            { color: 'bg-yellow-500', label: 'GK' },
            { color: 'bg-blue-500', label: 'DEF' },
            { color: 'bg-emerald-500', label: 'MID' },
            { color: 'bg-red-500', label: 'FWD' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-sm ${color}`} />
              <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-yellow-400 text-black text-[8px] font-bold flex items-center justify-center">C</span>
            <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Captain</span>
          </div>
          <div className="ml-auto text-[9px] italic" style={{ color: 'rgba(255,255,255,0.3)' }}>Tap for details</div>
        </div>
      </div>

      {selectedPlayer && (
        <PlayerDetailModal player={selectedPlayer} teams={teams} onClose={() => setSelectedPlayer(null)} />
      )}
    </>
  );
}
