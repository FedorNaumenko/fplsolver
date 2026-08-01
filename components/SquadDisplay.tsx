'use client';

import { useState } from 'react';
import type { Player, Team, PickInfo, PlayerFixture, Fixture } from '@/lib/types';
import { calcExpectedPoints } from '@/lib/calculations/xPts';
import { formatPrice, getPositionName } from '@/lib/utils';
import PlayerDetailModal from './PlayerDetailModal';
import PlayerSilhouette from './PlayerSilhouette';

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
  /** How many gameweeks a projection sums, shared with the editor and the planner. */
  horizon: number;
  onHorizonChange: (h: number) => void;
  /** Needed by calcExpectedPoints; the pitch used to carry its own copy of the model. */
  fixtures: Fixture[];
  /** Minutes-multiplier divisor, shared so the pitch and the editor agree exactly. */
  gameweeksPlayed: number;
}

const POSITION_CARD_GRADIENT: Record<number, string> = {
  1: 'var(--card-gk)',
  2: 'var(--card-def)',
  3: 'var(--card-mid)',
  4: 'var(--card-fwd)',
};

/** Fixture difficulty 1 (easiest) → 5 (hardest). Text colour is paired for contrast. */
const DIFFICULTY_CHIP: Record<number, { bg: string; fg: string }> = {
  1: { bg: 'oklch(62% 0.15 150)', fg: 'oklch(18% 0.04 150)' },
  2: { bg: 'oklch(75% 0.16 145)', fg: 'oklch(20% 0.05 145)' },
  3: { bg: 'oklch(85% 0.15 95)', fg: 'oklch(25% 0.06 95)' },
  4: { bg: 'oklch(70% 0.17 45)', fg: 'oklch(18% 0.05 45)' },
  5: { bg: 'oklch(58% 0.21 27)', fg: 'oklch(97% 0.01 27)' },
};

function describeFixtures(fixtures?: PlayerFixture[]): string {
  if (!fixtures?.length) return 'No upcoming fixtures';
  return fixtures
    .slice(0, 2)
    .map(f => `GW${f.event} ${f.is_home ? 'home to' : 'away at'} ${f.opponent_short_name}, difficulty ${f.difficulty} of 5`)
    .join('. ');
}

/** Opponent chips. Second chip is dropped on narrow viewports rather than shrunk. */
function FixtureChips({ fixtures }: { fixtures?: PlayerFixture[] }) {
  if (!fixtures || fixtures.length === 0) return null;
  return (
    <div className="flex gap-0.5 justify-center mt-0.5" aria-hidden="true">
      {fixtures.slice(0, 2).map((f, i) => {
        const chip = DIFFICULTY_CHIP[f.difficulty] ?? { bg: 'var(--fill-2)', fg: 'var(--ink)' };
        return (
          <span
            key={i}
            className={`font-bold px-1 rounded leading-tight ${i === 1 ? 'hidden sm:inline' : ''}`}
            style={{
              fontSize: 'var(--text-xs)',
              background: chip.bg,
              color: chip.fg,
            }}
          >
            {f.opponent_short_name}
          </span>
        );
      })}
    </div>
  );
}

const STATUS_TINT: Record<string, string> = {
  d: 'oklch(85% 0.15 95)',
  i: 'oklch(58% 0.21 27)',
  s: 'oklch(70% 0.17 45)',
  u: 'oklch(60% 0 0)',
};

function StatusDot({ status }: { status: Player['status'] }) {
  if (status === 'a') return null;
  return (
    <span
      className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full"
      style={{
        zIndex: 'var(--z-badge)',
        background: STATUS_TINT[status] ?? 'var(--ink-faint)',
        border: '1px solid var(--color-ground)',
      }}
    />
  );
}

function Goal() {
  return (
    <div className="flex justify-center mb-1">
      <svg width="96" height="30" viewBox="0 0 96 30" fill="none" aria-hidden="true">
        <rect x="4" y="3" width="88" height="26" rx="1.5" stroke="var(--ink)" strokeWidth="2.5" strokeOpacity="0.85" fill="var(--fill-1)" />
        {[18, 30, 42, 54, 66, 78].map((x, i) => (
          <line key={i} x1={x} y1={4} x2={x} y2={28} stroke="var(--ink)" strokeWidth="0.7" strokeOpacity="0.25" />
        ))}
        {[11, 19].map((y, i) => (
          <line key={i} x1={5} y1={y} x2={91} y2={y} stroke="var(--ink)" strokeWidth="0.7" strokeOpacity="0.25" />
        ))}
      </svg>
    </div>
  );
}

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={dir === 'prev' ? 'M10 3 L5 8 L10 13' : 'M6 3 L11 8 L6 13'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One segmented control rather than three loose boxes, with 40px hit targets —
 * the previous version was a bare arrow glyph in a ~28px padded box.
 */
function GameweekStepper({
  gameweek, canPrev, canNext, onPrev, onNext,
}: {
  gameweek: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const step = 'w-10 h-10 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed';
  return (
    <span
      className="inline-flex items-center ml-1 rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--rule-strong)', background: 'var(--fill-1)' }}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Previous gameweek"
        className={step}
        style={{ color: 'var(--color-accent)', transition: 'background-color var(--dur-short) var(--ease-out)' }}
      >
        <Chevron dir="prev" />
      </button>
      <span
        className="num font-semibold px-1 text-center"
        style={{
          color: 'var(--color-accent)',
          fontSize: 'var(--text-xs)',
          minWidth: '3.25rem',
          borderInline: '1px solid var(--rule-strong)',
          lineHeight: '2.5rem',
        }}
        aria-live="polite"
      >
        GW{gameweek}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label="Next gameweek"
        className={step}
        style={{ color: 'var(--color-accent)', transition: 'background-color var(--dur-short) var(--ease-out)' }}
      >
        <Chevron dir="next" />
      </button>
    </span>
  );
}

/**
 * How many gameweeks a projection sums. One value, read by the pitch cards, the squad
 * editor and the transfer planner — previously the pitch showed 1 gameweek from one
 * formula while the editor showed 3 from another.
 */
function HorizonPicker({
  value, max, onChange,
}: {
  value: number;
  max: number;
  onChange: (h: number) => void;
}) {
  const options = [1, 2, 3, 4, 5].filter(h => h === 1 || h <= max);
  return (
    <span
      className="inline-flex items-center rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--rule-strong)', background: 'var(--fill-1)' }}
      role="group"
      aria-label="Gameweeks to project"
    >
      {options.map((h, i) => (
        <button
          key={h}
          type="button"
          onClick={() => onChange(h)}
          aria-pressed={value === h}
          className="num font-semibold w-8 h-10"
          style={{
            fontSize: 'var(--text-xs)',
            borderLeft: i === 0 ? undefined : '1px solid var(--rule-strong)',
            transition: 'background-color var(--dur-short) var(--ease-out)',
            ...(value === h
              ? { background: 'var(--color-accent)', color: 'var(--color-ground)' }
              : { color: 'var(--ink-muted)' }),
          }}
        >
          {h}
        </button>
      ))}
      <span
        className="px-2 uppercase tracking-wide"
        style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}
      >
        GW
      </span>
    </span>
  );
}

/**
 * A legal starting XI. Empty slots simply do not count toward any position, so a
 * half-built squad reads as an invalid formation — which is correct, and is why
 * removal is never blocked on this; it only gates substitutions.
 */
function isValidFormation(picks: PickInfo[], playerMap: Record<number, Player>): boolean {
  const starters = picks.filter(p => p.position <= 11);
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const pick of starters) {
    if (pick.playerId === null) continue;
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
    // An empty slot is not a substitution target — it is filled from the editor.
    if (pick.playerId === null || pick.playerId === playerId) continue;
    const targetId = pick.playerId;
    const targetPlayer = playerMap[targetId];
    if (!targetPlayer) continue;
    const targetIsStarter = pick.position <= 11;
    // Same zone: always valid (cosmetic reorder)
    if (isStarter === targetIsStarter) { valid.add(targetId); continue; }
    // Cross-zone: GK can only swap with GK
    if (player.element_type === 1 || targetPlayer.element_type === 1) {
      if (player.element_type === targetPlayer.element_type) valid.add(targetId);
      continue;
    }
    // Cross-zone outfield: check formation
    const testPicks = picks.map(p => {
      if (p.playerId === playerId) return { ...p, position: pick.position };
      if (p.playerId === targetId) return { ...p, position: playerPick.position };
      return p;
    });
    if (isValidFormation(testPicks, playerMap)) valid.add(targetId);
  }
  return valid;
}

function PlayerCard({
  player, pts, isCaptain = false, isViceCaptain = false, fixtures, size = 'starter',
  isDragging = false, isTargeted = false, isSelected = false, isValidTarget = false, awaitingTarget = false,
  onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, onClick,
}: {
  player: Player; pts: number; isCaptain?: boolean; isViceCaptain?: boolean;
  fixtures?: PlayerFixture[]; size?: 'starter' | 'bench';
  isDragging?: boolean; isTargeted?: boolean; isSelected?: boolean;
  isValidTarget?: boolean; awaitingTarget?: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void; onDragEnd: () => void; onDragLeave: () => void;
  onClick: () => void;
}) {
  const isStarter = size === 'starter';

  // One signal per state — a border colour change. No glow, no scale: the old
  // card used three simultaneous signals for "valid target" and one for invalid.
  let borderColor = 'var(--rule)';
  if (isSelected) borderColor = 'var(--color-accent)';
  else if (awaitingTarget && isValidTarget) borderColor = 'var(--color-money)';
  else if (isTargeted && !isValidTarget) borderColor = 'var(--color-danger)';

  const action = awaitingTarget
    ? (isValidTarget ? 'swap with' : 'cannot swap with')
    : 'view details for';

  return (
    <button
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
      className="select-none flex-1 min-w-0"
      style={{
        maxWidth: isStarter ? '82px' : '72px',
        opacity: isDragging ? 0.35 : 1,
        // Animate opacity only — the old card also animated transform on hover.
        transition: 'opacity var(--dur-short) var(--ease-out)',
        cursor: 'grab',
      }}
      aria-label={`${player.web_name}, ${getPositionName(player.element_type)}, ${pts} points. ${describeFixtures(fixtures)}. Press to ${action} this player.`}
    >
      <div
        className="rounded-lg overflow-hidden flex flex-col"
        style={{
          background: POSITION_CARD_GRADIENT[player.element_type],
          border: `2px solid ${borderColor}`,
        }}
      >
        {/* Photo, with a silhouette showing through if it fails to load. Initials used
          * to sit here, which read as a broken image rather than a missing photo. */}
        <div className="relative" style={{ aspectRatio: '11 / 10', overflow: 'hidden' }}>
          <div
            className="absolute inset-0 flex items-end justify-center"
            style={{ background: 'var(--shade-1)' }}
          >
            <PlayerSilhouette className="w-full h-full" />
          </div>
          <img
            src={`https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.code}.png`}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'cover', objectPosition: 'center 8%', zIndex: 'var(--z-media)' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-6"
            style={{ zIndex: 'var(--z-scrim)', background: 'linear-gradient(transparent, var(--shade-2))' }}
          />
          <span
            className="num absolute bottom-0.5 left-0.5 font-bold uppercase px-1 rounded"
            style={{
              zIndex: 'var(--z-badge)',
              fontSize: 'var(--text-xs)',
              background: 'var(--shade-3)',
              color: 'var(--ink)',
              lineHeight: 1.3,
            }}
          >
            {getPositionName(player.element_type)}
          </span>
          <StatusDot status={player.status} />
          {(isCaptain || isViceCaptain) && (
            <span
              className="num absolute top-0.5 left-0.5 w-4 h-4 rounded-full font-bold flex items-center justify-center"
              style={{
                zIndex: 'var(--z-badge)',
                fontSize: 'var(--text-xs)',
                background: isCaptain ? 'var(--color-accent)' : 'var(--ink)',
                color: 'var(--color-ground)',
              }}
            >
              {isCaptain ? 'C' : 'V'}
            </span>
          )}
        </div>

        {/* Info strip */}
        <div className="px-1 pt-0.5 pb-1 text-center" style={{ background: 'var(--shade-3)' }}>
          <div
            className="font-semibold truncate leading-tight"
            style={{ color: 'var(--ink)', fontSize: 'var(--text-xs)' }}
          >
            {player.web_name}
          </div>
          <div
            className="num font-bold leading-tight"
            style={{ color: 'var(--color-accent)', fontSize: 'var(--text-xs)' }}
          >
            {pts}
          </div>
          <FixtureChips fixtures={fixtures} />
        </div>
      </div>
    </button>
  );
}

/**
 * A slot whose player has been removed. Holds its place in the formation so the pitch
 * still reads as a shape rather than silently losing a row.
 */
function EmptyCard({ elementType, size = 'starter' }: { elementType: number; size?: 'starter' | 'bench' }) {
  return (
    <div
      className="flex-1 min-w-0"
      style={{ maxWidth: size === 'starter' ? '82px' : '72px' }}
      aria-label={`Empty ${getPositionName(elementType)} slot`}
    >
      <div
        className="rounded-lg overflow-hidden flex flex-col"
        style={{ background: 'var(--shade-2)', border: '2px dashed var(--rule-strong)' }}
      >
        <div className="relative flex items-end justify-center" style={{ aspectRatio: '11 / 10' }}>
          <PlayerSilhouette className="w-full h-full" tone="var(--rule-strong)" />
        </div>
        <div className="px-1 pt-0.5 pb-1 text-center" style={{ background: 'var(--shade-3)' }}>
          <div
            className="num font-semibold uppercase leading-tight"
            style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}
          >
            {getPositionName(elementType)}
          </div>
          <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>empty</div>
        </div>
      </div>
    </div>
  );
}

export default function SquadDisplay({
  squad, picks, budget, teamValue, currentGameweek, teams, managerName,
  playerFixtures, onPicksChange, projGWIndex, onProjGWIndexChange,
  horizon, onHorizonChange, fixtures, gameweeksPlayed,
}: Props) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [pointsMode, setPointsMode] = useState<'total' | 'gw' | 'projected'>('total');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  // Touch and keyboard substitution path: HTML5 drag events never fire on touch,
  // so a pending selection lets a tap (or Enter) choose the player, then the target.
  const [pendingSwapId, setPendingSwapId] = useState<number | null>(null);

  const playerMap = Object.fromEntries(squad.map(p => [p.id, p]));
  // Only filled picks — a null key would collide across every empty slot.
  const pickMap = Object.fromEntries(
    picks.filter(p => p.playerId !== null).map(p => [p.playerId as number, p])
  );

  // Slots rather than players, so a removed pick still holds its place in the formation
  // instead of the pitch quietly losing a card.
  const slots = [...picks]
    .sort((a, b) => a.position - b.position)
    .map(pick => ({
      pick,
      player: pick.playerId === null ? null : playerMap[pick.playerId] ?? null,
    }));

  const starterSlots = slots.filter(s => s.pick.position <= 11);
  const benchSlots = slots.filter(s => s.pick.position > 11);
  const emptyCount = slots.filter(s => s.player === null).length;

  const starters = starterSlots.map(s => s.player).filter(Boolean) as Player[];
  const bench = benchSlots.map(s => s.player).filter(Boolean) as Player[];

  // Grouped on the pick's own elementType, which an empty slot still knows.
  const pitchRows = [1, 2, 3, 4].map(t => starterSlots.filter(s => s.pick.elementType === t));

  const activeSwapId = draggingId ?? pendingSwapId;
  const validSwapTargets = activeSwapId !== null
    ? getValidSwaps(activeSwapId, picks, playerMap)
    : new Set<number>();

  const applySwap = (sourceId: number, targetId: number) => {
    const sourcePick = picks.find(p => p.playerId === sourceId);
    const targetPick = picks.find(p => p.playerId === targetId);
    if (!sourcePick || !targetPick) return;
    onPicksChange(picks.map(p => {
      if (p.playerId === sourceId) return { ...p, position: targetPick.position };
      if (p.playerId === targetId) return { ...p, position: sourcePick.position };
      return p;
    }));
  };

  const getPlayerDisplayPts = (player: Player): number => {
    if (pointsMode === 'total') return player.total_points;
    if (pointsMode === 'gw') return player.event_points;
    // Same function the editor, planner and builder use — the card used to run a
    // separate formula over a different horizon, which is why the two never matched.
    return calcExpectedPoints(player, fixtures, gameweeksPlayed, horizon, projGWIndex);
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
    pointsMode === 'total' ? 'Season total' :
    pointsMode === 'gw' ? `GW${currentGameweek} points` :
    horizon === 1 ? `Projected GW${projGWEvent}` : `Projected GW${projGWEvent}+${horizon - 1}`;

  const canNavLeft = projGWIndex > 0;
  // Furthest start that still leaves `horizon` fixtures to sum.
  const fixtureDepth = Math.max(
    0, ...starters.map(p => playerFixtures[p.id]?.length ?? 0)
  );
  const canNavRight = projGWIndex + horizon < fixtureDepth;

  const pendingPlayer = pendingSwapId !== null ? playerMap[pendingSwapId] : null;

  const handleCardClick = (player: Player) => {
    if (pendingSwapId === null) { setSelectedPlayer(player); return; }
    if (pendingSwapId === player.id) { setPendingSwapId(null); return; }
    if (validSwapTargets.has(player.id)) {
      applySwap(pendingSwapId, player.id);
      setPendingSwapId(null);
    }
  };

  const makeHandlers = (player: Player) => ({
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', String(player.id));
      e.dataTransfer.effectAllowed = 'move';
      setPendingSwapId(null);
      setDraggingId(player.id);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = validSwapTargets.has(player.id) ? 'move' : 'none';
      if (dragOverId !== player.id) setDragOverId(player.id);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const sourceId = Number(e.dataTransfer.getData('text/plain'));
      if (sourceId !== player.id && validSwapTargets.has(player.id)) {
        applySwap(sourceId, player.id);
      }
      setDraggingId(null);
      setDragOverId(null);
    },
    onDragEnd: () => { setDraggingId(null); setDragOverId(null); },
    onDragLeave: () => { if (dragOverId === player.id) setDragOverId(null); },
    onClick: () => handleCardClick(player),
  });

  const cardProps = (player: Player) => ({
    player,
    pts: getPlayerDisplayPts(player),
    fixtures: playerFixtures[player.id],
    isDragging: draggingId === player.id,
    isTargeted: dragOverId === player.id,
    isSelected: pendingSwapId === player.id,
    isValidTarget: validSwapTargets.has(player.id),
    awaitingTarget: activeSwapId !== null,
    ...makeHandlers(player),
  });

  const modeLabel = { total: 'Season', gw: `GW${currentGameweek}`, projected: 'Projected' } as const;

  return (
    <>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--rule)' }}>
        {/* Header — left-biased, not a centred row */}
        <div
          className="px-4 py-3"
          style={{ background: `linear-gradient(135deg, var(--color-plum), var(--color-indigo))` }}
        >
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <div className="num text-4xl font-bold leading-none" style={{ color: 'var(--ink)' }}>
                {displayTotal}
              </div>
              <div
                className="mt-1 font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-accent)', fontSize: 'var(--text-xs)' }}
              >
                {headerLabel}
              </div>
              <h2 className="mt-2 font-semibold" style={{ color: 'var(--ink)', fontSize: 'var(--text-base)' }}>
                {managerName}
              </h2>
            </div>

            <div className="flex gap-5">
              <div>
                <div style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}>Team value</div>
                <div className="num font-semibold" style={{ color: 'var(--ink)' }}>{formatPrice(teamValue)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}>Bank</div>
                <div className="num font-semibold" style={{ color: 'var(--color-money)' }}>{formatPrice(budget)}</div>
              </div>
            </div>
          </div>

          {/* Points mode */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {(['total', 'gw', 'projected'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setPointsMode(mode)}
                aria-pressed={pointsMode === mode}
                className="font-semibold px-2.5 py-1 rounded-full"
                style={{
                  fontSize: 'var(--text-xs)',
                  transition: 'background-color var(--dur-short) var(--ease-out)',
                  ...(pointsMode === mode
                    ? { background: 'var(--color-accent)', color: 'var(--color-ground)' }
                    : { background: 'var(--fill-2)', color: 'var(--ink-muted)' }),
                }}
              >
                {modeLabel[mode]}
              </button>
            ))}

            {pointsMode === 'projected' && (
              <>
                <GameweekStepper
                  gameweek={projGWEvent}
                  canPrev={canNavLeft}
                  canNext={canNavRight}
                  onPrev={() => onProjGWIndexChange(projGWIndex - 1)}
                  onNext={() => onProjGWIndexChange(projGWIndex + 1)}
                />
                <HorizonPicker value={horizon} max={fixtureDepth} onChange={onHorizonChange} />
              </>
            )}
          </div>
        </div>

        {/* Pitch */}
        <div
          className="relative w-full py-4 px-2"
          style={{
            background:
              'repeating-linear-gradient(to bottom, var(--color-pitch-a) 0, var(--color-pitch-a) 48px, var(--color-pitch-b) 48px, var(--color-pitch-b) 96px)',
          }}
        >
          <div className="absolute left-6 right-6 top-1/2" style={{ height: '1px', background: 'var(--rule-strong)' }} aria-hidden="true" />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full"
            style={{ border: '1px solid var(--rule-strong)' }}
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-4" style={{ zIndex: 'var(--z-base)' }}>
            {pitchRows.map((row, i) => (
              <div key={i}>
                {i === 0 && <Goal />}
                <div className="flex justify-center gap-1 sm:gap-2">
                  {row.map(slot => (slot.player
                    ? <PlayerCard key={slot.pick.position} size="starter" {...cardProps(slot.player)} />
                    : <EmptyCard key={slot.pick.position} elementType={slot.pick.elementType} size="starter" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Substitution status — the only place motion or colour shouts */}
        {pendingPlayer && (
          <div
            className="px-4 py-2 flex flex-wrap items-center justify-between gap-2"
            style={{ background: 'var(--fill-2)', fontSize: 'var(--text-xs)' }}
            role="status"
          >
            <span style={{ color: 'var(--ink)' }}>
              Substituting <strong>{pendingPlayer.web_name}</strong> — choose a highlighted player.
            </span>
            <button
              onClick={() => setPendingSwapId(null)}
              className="px-2 py-1 rounded font-semibold"
              style={{ background: 'var(--fill-2)', color: 'var(--ink)', border: '1px solid var(--rule-strong)' }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Bench */}
        <div className="px-4 py-3" style={{ background: 'var(--color-well)' }}>
          <p
            className="font-bold uppercase tracking-widest mb-3"
            style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}
          >
            Bench
          </p>
          <div className="flex justify-center gap-3 sm:gap-6">
            {benchSlots.map((slot, i) => (
              <div key={slot.pick.position} className="flex flex-col items-center gap-1 flex-1" style={{ maxWidth: '72px' }}>
                <span className="num font-semibold" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>
                  {i + 1}
                </span>
                {slot.player
                  ? <PlayerCard size="bench" {...cardProps(slot.player)} />
                  : <EmptyCard elementType={slot.pick.elementType} size="bench" />}
              </div>
            ))}
          </div>
        </div>

        {/* Colour legend removed — every card already prints its own position badge.
          * What remains is the one thing the pitch cannot show: how to act on it. */}
        <p
          className="px-4 py-2"
          style={{ background: 'var(--shade-2)', color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}
        >
          {emptyCount > 0 && (
            <strong style={{ color: 'var(--color-warn)' }}>
              {emptyCount} slot{emptyCount > 1 ? 's' : ''} empty — fill {emptyCount > 1 ? 'them' : 'it'} below.{' '}
            </strong>
          )}
          Select a player for details or to substitute. On a desktop you can also drag one card onto another.
        </p>
      </div>

      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          teams={teams}
          onClose={() => setSelectedPlayer(null)}
          onSubstitute={() => {
            setPendingSwapId(selectedPlayer.id);
            setSelectedPlayer(null);
          }}
        />
      )}
    </>
  );
}
