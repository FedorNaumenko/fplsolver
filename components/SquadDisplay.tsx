'use client';

import { useState } from 'react';
import type { Player, Team, PickInfo, PlayerFixture, Fixture } from '@/lib/types';
import type { ChipName } from '@/lib/planning/seasonPlan';
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

  // ── Planning, driven from this view rather than a table below it ──
  /** Absolute gameweek being viewed and planned. */
  gameweek: number;
  /** Every planned gameweek, with the chip and hit already worked out for each. */
  railWeeks: { gameweek: number; chip: ChipName | null; hit: number }[];
  chip: ChipName | null;
  chipOptions: ChipName[];
  onChipChange: (chip: ChipName | null) => void;
  freeTransfers: number;
  hit: number;
  saveState: 'clean' | 'dirty' | 'saved';
  onSavePlan: () => void;
  onClearPlan: () => void;
  /** Remove a player from the viewed gameweek, banking the money. */
  onRemovePlayer: (player: Player) => void;
  /** Open the picker for an empty slot of this position. */
  onFillSlot: (elementType: number) => void;
}

const CHIP_LABEL: Record<ChipName, string> = {
  wildcard: 'Wildcard',
  freehit: 'Free hit',
  bboost: 'Bench boost',
  '3xc': 'Triple captain',
};

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

/**
 * Opponent chips for exactly the gameweeks being projected — one at the default horizon,
 * not two. Capped at three so a five-gameweek window does not overflow an 82px card.
 */
function FixtureChips({
  fixtures, from = 0, count = 1,
}: {
  fixtures?: PlayerFixture[];
  from?: number;
  count?: number;
}) {
  if (!fixtures || fixtures.length === 0) return null;
  const shown = fixtures.slice(from, from + Math.min(count, 3));
  if (shown.length === 0) return null;
  return (
    <div className="flex gap-0.5 justify-center mt-0.5" aria-hidden="true">
      {shown.map((f, i) => {
        const chip = DIFFICULTY_CHIP[f.difficulty] ?? { bg: 'var(--fill-2)', fg: 'var(--ink)' };
        return (
          <span
            key={i}
            className={`font-bold px-1 rounded leading-tight ${i > 0 ? 'hidden sm:inline' : ''}`}
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
      // Bottom-right: the top-right corner is the remove control now.
      className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full"
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

const CHIP_SHORT: Record<ChipName, string> = {
  wildcard: 'WC',
  freehit: 'FH',
  bboost: 'BB',
  '3xc': 'TC',
};

/**
 * Difficulty as a continuous colour rather than five buckets.
 *
 * The rail averages eleven fixtures, and averages cluster: rounding sent nearly every
 * week to bucket 3 and the whole strip came out one flat yellow. Interpolating between
 * the two neighbouring buckets keeps the game's own colour language while restoring the
 * variation that makes the strip worth looking at.
 */
function blendDifficulty(d: number): { bg: string; fg: string } {
  const clamped = Math.min(5, Math.max(1, d));
  const lo = Math.floor(clamped);
  const hi = Math.min(5, lo + 1);
  const t = clamped - lo;
  const a = DIFFICULTY_CHIP[lo] ?? DIFFICULTY_CHIP[3];
  const b = DIFFICULTY_CHIP[hi] ?? a;
  return {
    bg: t === 0 ? a.bg : `color-mix(in oklab, ${b.bg} ${Math.round(t * 100)}%, ${a.bg})`,
    fg: (t < 0.5 ? a : b).fg,
  };
}

export interface RailWeek {
  gameweek: number;
  /** Mean fixture difficulty across the starting XI, or null when nobody plays. */
  difficulty: number | null;
  /** Starters with no fixture that week — a blank is the thing you plan around. */
  blanks: number;
  chip: ChipName | null;
  hit: number;
}

/**
 * The signature of this app: the season as a strip you can read.
 *
 * FPL is a schedule game — the thing managers actually stare at is the run of fixtures,
 * and it was buried in three-letter chips too small to scan. Each cell is one gameweek,
 * tinted by how hard that week is for the XI you currently field, marked with any chip
 * you have assigned and any points hit you would take. It replaced a ‹ GW1 › stepper,
 * so it is navigation as well as the plan at a glance rather than decoration.
 */
function GameweekRail({
  weeks, selected, onSelect,
}: {
  weeks: RailWeek[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      className="overflow-x-auto"
      role="group"
      aria-label="Gameweeks — pick one to plan"
    >
      <div className="flex gap-1 pb-1" style={{ minWidth: 'min-content' }}>
        {weeks.map((w, i) => {
          const isNow = i === selected;
          const tint = w.difficulty === null
            ? { bg: 'var(--fill-2)', fg: 'var(--ink-faint)' }
            : blendDifficulty(w.difficulty);
          const detail = [
            w.difficulty === null ? 'blank gameweek' : `average difficulty ${w.difficulty.toFixed(1)} of 5`,
            w.blanks > 0 && w.difficulty !== null ? `${w.blanks} without a fixture` : '',
            w.chip ? `${CHIP_SHORT[w.chip]} chip` : '',
            w.hit > 0 ? `${w.hit} point hit` : '',
          ].filter(Boolean).join(', ');
          return (
            <button
              key={w.gameweek}
              type="button"
              onClick={() => onSelect(i)}
              aria-current={isNow ? 'true' : undefined}
              aria-label={`Gameweek ${w.gameweek}: ${detail}`}
              className="num shrink-0 rounded-md flex flex-col items-center justify-center"
              style={{
                width: '2.75rem',
                height: '3rem',
                background: tint.bg,
                color: tint.fg,
                // The selected week is the only one that gets a ring; everything else
                // stays flat so the difficulty gradient is what you read first.
                outline: isNow ? '2px solid var(--ink)' : 'none',
                outlineOffset: '1px',
                // A hit is money lost — flag it on the cell that costs it.
                borderBottom: w.hit > 0 ? '3px solid var(--color-danger)' : '3px solid transparent',
                transition: 'outline-color var(--dur-short) var(--ease-out)',
              }}
            >
              <span className="font-bold leading-none" style={{ fontSize: 'var(--text-xs)' }}>
                {w.gameweek}
              </span>
              <span className="font-bold leading-none mt-0.5" style={{ fontSize: '0.625rem', minHeight: '0.7rem' }}>
                {w.chip ? CHIP_SHORT[w.chip] : w.difficulty === null ? '—' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
          className="num font-semibold w-7 h-7"
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
        className="px-1.5 uppercase tracking-wide"
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
  chipFrom = 0, chipCount = 1,
  isDragging = false, isTargeted = false, isSelected = false, isValidTarget = false, awaitingTarget = false,
  onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, onClick, onRemove,
}: {
  player: Player; pts: number; isCaptain?: boolean; isViceCaptain?: boolean;
  fixtures?: PlayerFixture[]; size?: 'starter' | 'bench';
  chipFrom?: number; chipCount?: number;
  isDragging?: boolean; isTargeted?: boolean; isSelected?: boolean;
  isValidTarget?: boolean; awaitingTarget?: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void; onDragEnd: () => void; onDragLeave: () => void;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const isStarter = size === 'starter';
  const [photoFailed, setPhotoFailed] = useState(false);

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
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
      className="relative select-none flex-1 w-full min-w-0"
      style={{
        maxWidth: isStarter ? '82px' : '72px',
        opacity: isDragging ? 0.35 : 1,
        // Animate opacity only — the old card also animated transform on hover.
        transition: 'opacity var(--dur-short) var(--ease-out)',
        cursor: 'grab',
      }}
    >
      {/* Remove sits above the main button rather than inside it — a button nested in a
        * button is invalid HTML. Deliberately low contrast until hovered or focused. */}
      {onRemove && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          aria-label={`Remove ${player.web_name}`}
          title="Remove without replacing"
          className="card-remove absolute w-5 h-5 rounded-full flex items-center justify-center leading-none"
          style={{
            top: '-2px',
            right: '-2px',
            zIndex: 'var(--z-sticky)',
            fontSize: 'var(--text-xs)',
            background: 'var(--shade-3)',
            color: 'var(--ink-faint)',
          }}
        >
          ×
        </button>
      )}
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
        aria-label={`${player.web_name}, ${getPositionName(player.element_type)}, ${pts} points. ${describeFixtures(fixtures)}. Press to ${action} this player.`}
      >
      <div
        className="rounded-lg overflow-hidden flex flex-col"
        style={{
          background: POSITION_CARD_GRADIENT[player.element_type],
          border: `2px solid ${borderColor}`,
        }}
      >
        {/* Photo. The silhouette is only drawn when the photo fails — FPL head shots are
          * RGBA cut-outs (about 39% transparent), so a permanent silhouette underneath
          * showed through every one of them. */}
        <div className="relative" style={{ aspectRatio: '11 / 10', overflow: 'hidden' }}>
          {photoFailed && (
            <div
              className="absolute inset-0 flex items-end justify-center"
              style={{ background: 'var(--shade-1)' }}
            >
              <PlayerSilhouette className="w-full h-full" />
            </div>
          )}
          <img
            src={`https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.code}.png`}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: 'cover',
              objectPosition: 'center 8%',
              zIndex: 'var(--z-media)',
              display: photoFailed ? 'none' : undefined,
            }}
            onError={() => setPhotoFailed(true)}
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
          <FixtureChips fixtures={fixtures} from={chipFrom} count={chipCount} />
        </div>
      </div>
      </button>
    </div>
  );
}

/**
 * A slot whose player has been removed. Holds its place in the formation so the pitch
 * still reads as a shape rather than silently losing a row.
 */
function EmptyCard({
  elementType, size = 'starter', onFill,
}: {
  elementType: number;
  size?: 'starter' | 'bench';
  onFill?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onFill}
      className="flex-1 w-full min-w-0"
      style={{ maxWidth: size === 'starter' ? '82px' : '72px' }}
      aria-label={`Empty ${getPositionName(elementType)} slot — press to add a player`}
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
          <div style={{ color: 'var(--color-accent)', fontSize: 'var(--text-xs)' }}>+ add</div>
        </div>
      </div>
    </button>
  );
}

export default function SquadDisplay({
  squad, picks, budget, teamValue, currentGameweek, teams, managerName,
  playerFixtures, onPicksChange, projGWIndex, onProjGWIndexChange,
  horizon, onHorizonChange, fixtures, gameweeksPlayed,
  gameweek, railWeeks, chip, chipOptions, onChipChange, freeTransfers, hit,
  saveState, onSavePlan, onClearPlan, onRemovePlayer, onFillSlot,
}: Props) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  // Projected by default: this is a planning tool, so the biggest number on the page
  // should be the projection you are deciding against, not last season's total.
  const [pointsMode, setPointsMode] = useState<'total' | 'gw' | 'projected'>('projected');
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
    horizon === 1
      ? `Projected GW${projGWEvent}`
      : `Projected GW${projGWEvent}–GW${projGWEvent + horizon - 1}`;

  /**
   * One cell per planned gameweek. Difficulty is the mean across starters who actually
   * have a fixture that week; a week where nobody plays is a blank, which in FPL is the
   * thing you plan around rather than an absence of data.
   */
  const rail: RailWeek[] = railWeeks.map(w => {
    let total = 0, played = 0;
    for (const p of starters) {
      const f = playerFixtures[p.id]?.find(x => x.event === w.gameweek);
      if (f) { total += f.difficulty; played++; }
    }
    return {
      gameweek: w.gameweek,
      difficulty: played ? total / played : null,
      blanks: starters.length - played,
      chip: w.chip,
      hit: w.hit,
    };
  });


  /** Longest fixture list any starter has — the ceiling on the projection horizon. */
  const fixtureDepth = Math.max(0, ...starters.map(p => playerFixtures[p.id]?.length ?? 0));

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
    chipFrom: projGWIndex,
    chipCount: horizon,
    isDragging: draggingId === player.id,
    isTargeted: dragOverId === player.id,
    isSelected: pendingSwapId === player.id,
    isValidTarget: validSwapTargets.has(player.id),
    awaitingTarget: activeSwapId !== null,
    onRemove: () => onRemovePlayer(player),
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


          </div>
        </div>

        {/* The season as a strip — difficulty, chips and hits, and the navigation. */}
        <div className="px-4 pt-3" style={{ background: 'var(--fill-1)' }}>
          <GameweekRail weeks={rail} selected={projGWIndex} onSelect={onProjGWIndexChange} />
        </div>

        {/* Planning strip — this is the planner now; there is no table below the pitch.
          * Everything here applies to the gameweek the arrows are pointing at. */}
        <div
          className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-2"
          style={{ background: 'var(--fill-1)', borderTop: '1px solid var(--rule)' }}
        >
          <label className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
            Chip
            <select
              value={chip ?? ''}
              onChange={e => onChipChange((e.target.value || null) as ChipName | null)}
              aria-label={`Chip for gameweek ${gameweek}`}
              className="select-field rounded px-2 py-1"
              style={{
                // backgroundColor, not background — the shorthand resets the chevron image.
                backgroundColor: chip ? 'var(--color-chip)' : 'var(--fill-2)',
                color: chip ? 'var(--color-ground)' : 'var(--ink)',
                border: '1px solid var(--rule-strong)',
                fontSize: 'var(--text-xs)',
              }}
            >
              <option value="">No chip</option>
              {[...new Set([...(chip ? [chip] : []), ...chipOptions])].map(c => (
                <option key={c} value={c}>{CHIP_LABEL[c]}</option>
              ))}
            </select>
          </label>

          {pointsMode === 'projected' && (
            <span className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
              Projecting
              <HorizonPicker value={horizon} max={fixtureDepth} onChange={onHorizonChange} />
            </span>
          )}

          <span className="num" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
            {freeTransfers} free transfer{freeTransfers === 1 ? '' : 's'}
          </span>
          {hit > 0 && (
            <span className="num font-semibold" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
              −{hit} pts hit
            </span>
          )}

          <span className="ml-auto flex items-center gap-2">
            <span role="status" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
              {saveState === 'saved' && 'Saved on this device'}
              {saveState === 'dirty' && 'Unsaved'}
            </span>
            <button
              onClick={onSavePlan}
              className="px-2.5 py-1 rounded font-semibold"
              style={{ background: 'var(--color-accent)', color: 'var(--color-ground)', fontSize: 'var(--text-xs)' }}
            >
              Save plan
            </button>
            <button
              onClick={onClearPlan}
              className="px-2.5 py-1 rounded"
              style={{
                background: 'var(--fill-2)', color: 'var(--ink-muted)',
                border: '1px solid var(--rule-strong)', fontSize: 'var(--text-xs)',
              }}
            >
              Clear
            </button>
          </span>
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
                    : <EmptyCard
                        key={slot.pick.position}
                        elementType={slot.pick.elementType}
                        size="starter"
                        onFill={() => onFillSlot(slot.pick.elementType)}
                      />
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
              // items-stretch, not items-center: in a column container items-center
              // aligns horizontally, which shrank every bench card to its own name width.
              <div key={slot.pick.position} className="flex flex-col items-stretch gap-1 flex-1 min-w-0" style={{ maxWidth: '72px' }}>
                <span className="num font-semibold text-center" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>
                  {i + 1}
                </span>
                {slot.player
                  ? <PlayerCard size="bench" {...cardProps(slot.player)} />
                  : <EmptyCard
                      elementType={slot.pick.elementType}
                      size="bench"
                      onFill={() => onFillSlot(slot.pick.elementType)}
                    />}
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
          onRemove={() => {
            onRemovePlayer(selectedPlayer);
            setSelectedPlayer(null);
          }}
        />
      )}
    </>
  );
}
