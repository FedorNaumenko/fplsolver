// A multi-gameweek plan: which transfers you intend to make, which chip you intend to
// play, and what that does to your projected score.
//
// Stores transfers per gameweek rather than a full squad per gameweek — the squad for
// any gameweek is derived by replaying transfers over the base squad. The one wrinkle
// is FREE HIT, whose squad applies to its own gameweek only and then reverts; that is
// why replay has to know which entry it is evaluating.
//
// Every chip fact comes from bootstrap-static's `chips` array. Nothing here hardcodes
// how many chips exist, when their windows open, or which half of the season they
// belong to — FPL changed from one of each to two of each, and will change again.

import type { Player, Fixture, PickInfo } from '../types';
import { calcExpectedPoints } from '../calculations/xPts';

export type ChipName = 'wildcard' | 'freehit' | 'bboost' | '3xc';

/** One entry of bootstrap-static's `chips`. */
export interface ChipDef {
  id: number;
  name: string;
  number: number;
  start_event: number;
  stop_event: number;
  /** 'transfer' for wildcard and free hit; 'team' for bench boost and triple captain. */
  chip_type: string;
}

/**
 * One squad change in a gameweek. Both ends are nullable so the same record covers all
 * three moves the pitch can make: a swap (both set), a removal (`inId` null) and filling
 * an empty slot (`outId` null).
 */
export interface PlannedTransfer2 {
  outId: number | null;
  inId: number | null;
}

export interface GameweekEntry {
  gameweek: number;
  transfers: PlannedTransfer2[];
  chip: ChipName | null;
}

/** Versioned so a later model change can migrate rather than misread stored plans. */
export const PLAN_VERSION = 1;

export interface SeasonPlan {
  version: number;
  managerId: string;
  entries: GameweekEntry[];
}

export function emptyPlan(managerId: string): SeasonPlan {
  return { version: PLAN_VERSION, managerId, entries: [] };
}

/** FPL banks one free transfer per gameweek, capped by max_extra_free_transfers + 1. */
export interface TransferRules {
  /** game_settings.max_extra_free_transfers (4) + 1 = 5 in 2026/27. */
  maxFreeTransfers: number;
  /** Points deducted per transfer beyond the free allowance. */
  hitCost: number;
}

export const DEFAULT_TRANSFER_RULES: TransferRules = { maxFreeTransfers: 5, hitCost: 4 };

export function transferRulesFromBootstrap(gameSettings: unknown): TransferRules {
  const g = (gameSettings ?? {}) as Record<string, unknown>;
  const extra = typeof g.max_extra_free_transfers === 'number' ? g.max_extra_free_transfers : 4;
  return { maxFreeTransfers: extra + 1, hitCost: DEFAULT_TRANSFER_RULES.hitCost };
}

/** Which chips may still be played in `gameweek`, given what the plan already spends. */
export function availableChips(
  chips: ChipDef[],
  gameweek: number,
  plan: SeasonPlan
): ChipName[] {
  const out: ChipName[] = [];
  for (const name of ['wildcard', 'freehit', 'bboost', '3xc'] as ChipName[]) {
    // How many of this chip have a window covering this gameweek…
    const inWindow = chips.filter(
      c => c.name === name && gameweek >= c.start_event && gameweek <= c.stop_event
    );
    if (inWindow.length === 0) continue;
    // …minus any already spent inside the same window by another gameweek.
    const spentInWindow = plan.entries.filter(
      e =>
        e.chip === name &&
        e.gameweek !== gameweek &&
        inWindow.some(c => e.gameweek >= c.start_event && e.gameweek <= c.stop_event)
    ).length;
    if (spentInWindow < inWindow.length) out.push(name);
  }
  return out;
}

/**
 * The squad as it stands in `gameweek`, as an array of player ids per slot.
 *
 * Transfers from earlier gameweeks are permanent. A free-hit gameweek's transfers are
 * temporary: they count only while evaluating that gameweek and are skipped by every
 * later one, which is exactly how the chip behaves in FPL.
 */
export function squadAt(basePicks: PickInfo[], plan: SeasonPlan, gameweek: number): (number | null)[] {
  const slots = [...basePicks].sort((a, b) => a.position - b.position).map(p => p.playerId);
  const ordered = [...plan.entries].sort((a, b) => a.gameweek - b.gameweek);

  for (const entry of ordered) {
    if (entry.gameweek > gameweek) break;
    const temporary = entry.chip === 'freehit';
    if (temporary && entry.gameweek !== gameweek) continue;
    for (const t of entry.transfers) {
      if (t.outId === null) {
        // Filling an empty slot: take the first hole.
        const hole = slots.indexOf(null);
        if (hole >= 0) slots[hole] = t.inId;
        continue;
      }
      const i = slots.indexOf(t.outId);
      if (i >= 0) slots[i] = t.inId; // inId null empties the slot
    }
  }
  return slots;
}

/**
 * The full squad for `gameweek` as picks, not bare ids.
 *
 * `squadAt` is enough for scoring, but the pitch needs whole picks so slot position,
 * `elementType` and the armbands survive a transfer. `elementType` follows the incoming
 * player where one is known, since a transfer can only be same-position but a slot
 * emptied and refilled later must still describe itself.
 */
export function picksAt(
  basePicks: PickInfo[],
  plan: SeasonPlan,
  gameweek: number,
  playerById?: Map<number, { element_type: number }>
): PickInfo[] {
  const ordered = [...basePicks].sort((a, b) => a.position - b.position);
  const ids = squadAt(basePicks, plan, gameweek);

  return ordered.map((pick, i) => {
    const playerId = ids[i] ?? null;
    if (playerId === pick.playerId) return pick;
    const incoming = playerId === null ? undefined : playerById?.get(playerId);
    return {
      ...pick,
      playerId,
      elementType: incoming?.element_type ?? pick.elementType,
      // An armband cannot sit on a slot that is now empty.
      isCaptain: playerId === null ? false : pick.isCaptain,
      isViceCaptain: playerId === null ? false : pick.isViceCaptain,
      multiplier: playerId === null ? 0 : pick.multiplier,
    };
  });
}

/**
 * Money in hand at `gameweek`, replaying the plan's changes over the starting bank.
 * A free-hit week's spending applies to that week only, exactly as its squad does.
 */
export function bankAt(
  plan: SeasonPlan,
  gameweek: number,
  priceOf: (playerId: number) => number,
  startingBank: number
): number {
  let bank = startingBank;
  for (const entry of [...plan.entries].sort((a, b) => a.gameweek - b.gameweek)) {
    if (entry.gameweek > gameweek) break;
    if (entry.chip === 'freehit' && entry.gameweek !== gameweek) continue;
    for (const t of entry.transfers) {
      bank += (t.outId === null ? 0 : priceOf(t.outId)) - (t.inId === null ? 0 : priceOf(t.inId));
    }
  }
  return bank;
}

export interface GameweekOutcome {
  gameweek: number;
  chip: ChipName | null;
  transfers: number;
  /** Free transfers available before this gameweek's moves. */
  freeAvailable: number;
  /** Points deducted for exceeding the free allowance. */
  hit: number;
  /** Projected points before the hit. */
  projected: number;
  /** projected − hit. */
  net: number;
}

/**
 * Walk the plan gameweek by gameweek, accumulating free transfers and scoring each one.
 *
 * Chip effects: bench boost scores all 15 rather than the XI, triple captain multiplies
 * the captain by 3 instead of 2, and wildcard and free hit make that week's transfers
 * free without consuming the banked allowance.
 */
export function evaluatePlan(
  plan: SeasonPlan,
  opts: {
    basePicks: PickInfo[];
    playerById: Map<number, Player>;
    fixtures: Fixture[];
    gameweeks: number[];
    gameweeksPlayed: number;
    /** Index of the first planned gameweek within each player's fixture list. */
    baseOffset?: number;
    rules?: TransferRules;
  }
): GameweekOutcome[] {
  const {
    basePicks, playerById, fixtures, gameweeks, gameweeksPlayed,
    baseOffset = 0, rules = DEFAULT_TRANSFER_RULES,
  } = opts;

  const byGw = new Map(plan.entries.map(e => [e.gameweek, e]));
  let banked = 1; // FPL starts you with one free transfer
  const out: GameweekOutcome[] = [];

  gameweeks.forEach((gw, i) => {
    const entry = byGw.get(gw);
    const chip = entry?.chip ?? null;
    // Only a genuine in-and-out consumes a free transfer; a removal or a fill does not.
    const used = entry?.transfers.filter(t => t.outId !== null && t.inId !== null).length ?? 0;
    const freeAvailable = banked;

    const chipMakesFree = chip === 'wildcard' || chip === 'freehit';
    const hit = chipMakesFree ? 0 : Math.max(0, used - freeAvailable) * rules.hitCost;

    // A wildcard or free hit leaves the banked allowance untouched.
    banked = chipMakesFree
      ? Math.min(rules.maxFreeTransfers, banked + 1)
      : Math.min(rules.maxFreeTransfers, Math.max(0, freeAvailable - used) + 1);

    const slots = squadAt(basePicks, plan, gw);
    const sorted = [...basePicks].sort((a, b) => a.position - b.position);
    const captainSlot = sorted.findIndex(p => p.isCaptain);

    // Bench boost pays the whole squad; otherwise only the first eleven slots score.
    const scoring = chip === 'bboost' ? slots : slots.slice(0, 11);
    const captainMultiplier = chip === '3xc' ? 3 : 2;

    let projected = 0;
    scoring.forEach((playerId, slotIndex) => {
      if (playerId === null) return;
      const player = playerById.get(playerId);
      if (!player) return;
      const pts = calcExpectedPoints(player, fixtures, gameweeksPlayed, 1, baseOffset + i);
      projected += pts * (slotIndex === captainSlot ? captainMultiplier : 1);
    });

    out.push({
      gameweek: gw,
      chip,
      transfers: used,
      freeAvailable,
      hit,
      projected: Math.round(projected * 10) / 10,
      net: Math.round((projected - hit) * 10) / 10,
    });
  });

  return out;
}

// ── Persistence ────────────────────────────────────────────────────────────────
// localStorage, keyed by manager id. Device-local by design: GitHub Pages is static,
// so anything cross-device would need a second service.

const KEY_PREFIX = 'fplsolver.plan.v';

export function planKey(managerId: string): string {
  return `${KEY_PREFIX}${PLAN_VERSION}.${managerId}`;
}

export function savePlan(plan: SeasonPlan): void {
  try {
    localStorage.setItem(planKey(plan.managerId), JSON.stringify(plan));
  } catch {
    // Private browsing or a full quota — the plan simply stays in memory.
  }
}

export function loadPlan(managerId: string): SeasonPlan | null {
  try {
    const raw = localStorage.getItem(planKey(managerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SeasonPlan;
    // Refuse anything not written by this version rather than misreading it.
    if (parsed?.version !== PLAN_VERSION || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPlan(managerId: string): void {
  try {
    localStorage.removeItem(planKey(managerId));
  } catch {
    // nothing to do
  }
}
