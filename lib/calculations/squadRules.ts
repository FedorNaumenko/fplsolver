// The FPL squad legality rules, in one place.
//
// These three checks — affordable, max 3 per club, not already owned — were
// implemented separately in page.tsx (handleApplyTransfer), TransferPlanner
// (SingleTransferCard) and squadBuilder. Three copies meant three chances to
// disagree about what a legal squad is.
//
// Limits come from bootstrap-static's game_settings rather than being hardcoded,
// so the app follows FPL if a rule changes mid-season.

import type { Player, PickInfo } from '../types';

export interface SquadSettings {
  /** Total budget in tenths — game_settings.squad_total_spend (1000 = £100.0m). */
  totalSpend: number;
  /** game_settings.squad_squadsize (15). */
  squadSize: number;
  /** game_settings.squad_squadplay (11). */
  startingSize: number;
  /** game_settings.squad_team_limit (3). */
  teamLimit: number;
  /** Players per position, keyed by element_type. */
  quota: Record<number, number>;
}

/**
 * FPL does not publish the per-position quota, so that stays fixed while everything
 * else is read from the API.
 */
export const DEFAULT_SETTINGS: SquadSettings = {
  totalSpend: 1000,
  squadSize: 15,
  startingSize: 11,
  teamLimit: 3,
  quota: { 1: 2, 2: 5, 3: 5, 4: 3 },
};

/** Read the squad limits out of a bootstrap-static payload, falling back per field. */
export function settingsFromBootstrap(gameSettings: unknown): SquadSettings {
  const g = (gameSettings ?? {}) as Record<string, unknown>;
  const num = (key: string, fallback: number) =>
    typeof g[key] === 'number' && g[key] as number > 0 ? (g[key] as number) : fallback;
  return {
    totalSpend: num('squad_total_spend', DEFAULT_SETTINGS.totalSpend),
    squadSize: num('squad_squadsize', DEFAULT_SETTINGS.squadSize),
    startingSize: num('squad_squadplay', DEFAULT_SETTINGS.startingSize),
    teamLimit: num('squad_team_limit', DEFAULT_SETTINGS.teamLimit),
    quota: DEFAULT_SETTINGS.quota,
  };
}

export interface SwapVerdict {
  ok: boolean;
  /** Present when ok is false. Written for display — these strings reach the UI. */
  reason?: string;
}

/**
 * Can `playerIn` replace `playerOut` in this squad?
 *
 * `bank` is money in hand in tenths; the outgoing player's price is added to it,
 * which is what makes an apparently unaffordable swap legal.
 */
export function canSwap(
  squad: Player[],
  playerOut: Player,
  playerIn: Player,
  bank: number,
  settings: SquadSettings = DEFAULT_SETTINGS
): SwapVerdict {
  if (playerOut.id === playerIn.id) {
    return { ok: false, reason: 'Same player' };
  }
  if (!squad.some(p => p.id === playerOut.id)) {
    return { ok: false, reason: 'Already transferred' };
  }
  if (squad.some(p => p.id === playerIn.id)) {
    return { ok: false, reason: 'Already in squad' };
  }
  if (playerIn.element_type !== playerOut.element_type) {
    return { ok: false, reason: 'Different position' };
  }
  if (playerIn.status !== 'a') {
    return { ok: false, reason: 'Unavailable' };
  }
  if (playerIn.now_cost > playerOut.now_cost + bank) {
    return { ok: false, reason: 'Over budget' };
  }
  const sameClub = squad.filter(p => p.team === playerIn.team && p.id !== playerOut.id).length;
  if (sameClub >= settings.teamLimit) {
    return { ok: false, reason: `Max ${settings.teamLimit} per club` };
  }
  return { ok: true };
}

/**
 * Can `playerIn` fill an empty slot of `elementType`? Same rules as canSwap minus the
 * outgoing player: nothing is being sold, so only the bank is available.
 */
export function canAdd(
  squad: Player[],
  playerIn: Player,
  elementType: number,
  bank: number,
  settings: SquadSettings = DEFAULT_SETTINGS
): SwapVerdict {
  if (squad.some(p => p.id === playerIn.id)) {
    return { ok: false, reason: 'Already in squad' };
  }
  if (playerIn.element_type !== elementType) {
    return { ok: false, reason: 'Different position' };
  }
  if (playerIn.status !== 'a') {
    return { ok: false, reason: 'Unavailable' };
  }
  const filled = squad.filter(p => p.element_type === elementType).length;
  if (filled >= (settings.quota[elementType] ?? 0)) {
    return { ok: false, reason: 'Position full' };
  }
  if (playerIn.now_cost > bank) {
    return { ok: false, reason: 'Over budget' };
  }
  const sameClub = squad.filter(p => p.team === playerIn.team).length;
  if (sameClub >= settings.teamLimit) {
    return { ok: false, reason: `Max ${settings.teamLimit} per club` };
  }
  return { ok: true };
}

/**
 * Guarantee an armband on a filled starter. Emptying a slot can remove the captain,
 * which would otherwise leave the squad scoring no double.
 *
 * A no-op when both armbands are already on filled starters, so it is safe to call
 * after any squad change without overriding a deliberate choice.
 */
export function ensureArmbands(
  picks: PickInfo[],
  score: (playerId: number) => number
): PickInfo[] {
  const filledStarters = picks.filter(p => p.position <= 11 && p.playerId !== null);
  const capOk = filledStarters.some(p => p.isCaptain);
  const viceOk = filledStarters.some(p => p.isViceCaptain);
  if (capOk && viceOk) return picks;

  const ranked = [...filledStarters].sort((a, b) => score(b.playerId!) - score(a.playerId!));
  const captainId = ranked[0]?.playerId ?? null;
  const viceId = ranked[1]?.playerId ?? null;

  return picks.map(p => {
    const filled = p.playerId !== null;
    const isCaptain = filled && p.playerId === captainId;
    return {
      ...p,
      isCaptain,
      isViceCaptain: filled && p.playerId === viceId,
      multiplier: !filled || p.position > 11 ? 0 : isCaptain ? 2 : 1,
    };
  });
}
