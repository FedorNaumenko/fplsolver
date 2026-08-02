// Builds a legal FPL squad from nothing, maximising projected points.
//
// multiTransfer.ts can only improve a squad you already have, and pre-season there
// is no squad to fetch (FPL 404s picks until a deadline passes), so this fills that
// gap: greedy on projected points with a budget-feasibility bound, then hill-climb
// with single swaps.
//
// ponytail: heuristic, not a true optimum — exact 15-of-564 under coupled budget and
// club-cap constraints is an ILP. Upgrade to a proper solver only if the squads it
// returns look visibly wrong.

import type { Player, Fixture, PickInfo } from '../types';
import { calcExpectedPoints } from './xPts';
import { DEFAULT_SETTINGS, type SquadSettings } from './squadRules';

const POSITIONS = [1, 2, 3, 4];
/** Pre-season `minutes` holds last season's total, so average it over a full season. */
export const PRESEASON_GAMEWEEKS = 38;
/** Guard against a pathological swap cycle; real runs converge in well under this. */
const MAX_SWAP_PASSES = 200;

/**
 * How the greedy pass ranks players. The legality machinery and the hill-climb are the
 * same for all three — only the preference order changes, so each is a defensible squad
 * rather than a reshuffle of the same one.
 */
export type BuildStrategy = 'projection' | 'value' | 'differential';

export const STRATEGY_LABEL: Record<BuildStrategy, string> = {
  projection: 'Highest projection',
  value: 'Best value',
  differential: 'Differential',
};

export const STRATEGIES: BuildStrategy[] = ['projection', 'value', 'differential'];

/**
 * Ranking score for the greedy pass.
 *
 * `value` ranks on points per million, which spreads the budget instead of buying two
 * stars and nine cheapest-available bodies. `differential` discounts heavily-owned
 * players so the squad avoids the template. The hill-climb that follows optimises the
 * same quantity, so each strategy converges somewhere genuinely different.
 */
function rankScore(strategy: BuildStrategy, xPts: number, player: Player): number {
  if (strategy === 'value') return xPts / Math.max(1, player.now_cost / 10);
  if (strategy === 'differential') {
    const owned = Math.min(60, Number(player.selected_by_percent) || 0);
    return xPts * (1 - (owned / 100) * 0.8);
  }
  return xPts;
}

export interface BuiltSquad {
  squad: Player[];
  picks: PickInfo[];
  /** Total cost, in tenths, same units as FPL's entry_history.value. */
  teamValue: number;
  /** Budget left over, in tenths, same units as entry_history.bank. */
  bank: number;
  /** Projected points for the starting XI over the window, captain doubled. */
  totalXPts: number;
  strategy: BuildStrategy;
}

interface Scored {
  player: Player;
  /** True projected points — what gets reported, whatever the strategy ranked on. */
  xPts: number;
  /** Strategy-specific ranking score, used only to order and to hill-climb. */
  rank: number;
}

/**
 * Best legal XI out of the 15: exactly 1 GK, then 3-5 DEF, 2-5 MID, 1-3 FWD.
 * Few enough shapes to just try them all.
 */
function chooseStartingXI(picked: Scored[], STARTERS: number): Set<number> {
  const byPos = (pos: number) =>
    picked.filter(s => s.player.element_type === pos).sort((a, b) => b.xPts - a.xPts);
  const [gk, def, mid, fwd] = [byPos(1), byPos(2), byPos(3), byPos(4)];

  let best: Scored[] | null = null;
  let bestPts = -1;
  for (let d = 3; d <= 5; d++) {
    for (let m = 2; m <= 5; m++) {
      const f = STARTERS - 1 - d - m;
      if (f < 1 || f > 3) continue;
      if (!gk.length || d > def.length || m > mid.length || f > fwd.length) continue;
      const xi = [gk[0], ...def.slice(0, d), ...mid.slice(0, m), ...fwd.slice(0, f)];
      const pts = xi.reduce((sum, s) => sum + s.xPts, 0);
      if (pts > bestPts) {
        bestPts = pts;
        best = xi;
      }
    }
  }
  return new Set((best ?? picked.slice(0, STARTERS)).map(s => s.player.id));
}

export function buildOptimalSquad(
  allPlayers: Player[],
  fixtures: Fixture[],
  numGW: number = 3,
  gwOffset: number = 0,
  gameweeksPlayed: number = PRESEASON_GAMEWEEKS,
  settings: SquadSettings = DEFAULT_SETTINGS,
  strategy: BuildStrategy = 'projection'
): BuiltSquad {
  // Destructured to the names the body already used, so the limits became
  // API-driven without touching the algorithm.
  const {
    quota: QUOTA,
    totalSpend: BUDGET,
    teamLimit: MAX_PER_CLUB,
    squadSize: SQUAD_SIZE,
    startingSize: STARTERS,
  } = settings;

  const scored: Scored[] = allPlayers
    .filter(p => p.status === 'a' && QUOTA[p.element_type] !== undefined)
    .map(p => {
      const xPts = calcExpectedPoints(p, fixtures, gameweeksPlayed, numGW, gwOffset);
      return { player: p, xPts, rank: rankScore(strategy, xPts, p) };
    });

  // Cheapest-first per position, for the feasibility bound below.
  const cheapest = new Map<number, Scored[]>(
    POSITIONS.map(pos => [
      pos,
      scored
        .filter(s => s.player.element_type === pos)
        .sort((a, b) => a.player.now_cost - b.player.now_cost),
    ])
  );

  /**
   * Build one squad: greedy from `seedOf`'s ordering, then hill-climb on `objectiveOf`.
   * Separating the two is what makes a multi-start search possible — the same objective
   * reached from different starting squads.
   */
  function attempt(seedOf: (s: Scored) => number, objectiveOf: (s: Scored) => number) {
  const picked: Scored[] = [];
  const pickedIds = new Set<number>();
  const perPos: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const perClub = new Map<number, number>();
  let spend = 0;

  /**
   * Cheapest conceivable cost of the slots still unfilled, treating `alsoTaking` as
   * already picked. Ignores the club cap, so it is a genuine lower bound: it never
   * rejects an affordable pick, it only stops greedy from spending so much on stars
   * that a legal 15 can no longer be completed.
   */
  const reserveFor = (alsoTaking: Scored): number => {
    let total = 0;
    for (const pos of POSITIONS) {
      let need = QUOTA[pos] - perPos[pos] - (alsoTaking.player.element_type === pos ? 1 : 0);
      if (need <= 0) continue;
      for (const s of cheapest.get(pos)!) {
        if (pickedIds.has(s.player.id) || s.player.id === alsoTaking.player.id) continue;
        total += s.player.now_cost;
        if (--need === 0) break;
      }
      if (need > 0) return Infinity; // not enough available players to fill the slot
    }
    return total;
  };

  const take = (s: Scored) => {
    picked.push(s);
    pickedIds.add(s.player.id);
    perPos[s.player.element_type]++;
    perClub.set(s.player.team, (perClub.get(s.player.team) ?? 0) + 1);
    spend += s.player.now_cost;
  };

  // Objective is total points, so work down raw xPts and take whatever still leaves
  // enough budget to finish the squad.
  const byXPts = [...scored].sort(
    (a, b) => seedOf(b) - seedOf(a) || a.player.now_cost - b.player.now_cost
  );
  for (const s of byXPts) {
    if (picked.length === SQUAD_SIZE) break;
    if (perPos[s.player.element_type] >= QUOTA[s.player.element_type]) continue;
    if ((perClub.get(s.player.team) ?? 0) >= MAX_PER_CLUB) continue;
    if (seedOf(s) <= 0) continue; // cheap filler is chosen by the completion pass below
    if (spend + s.player.now_cost + reserveFor(s) > BUDGET) continue;
    take(s);
  }

  // Greedy above skips zero-projection players, so fill any remaining slots with the
  // cheapest legal bodies — a bench that costs nothing is exactly what these are for.
  for (const pos of POSITIONS) {
    while (perPos[pos] < QUOTA[pos]) {
      const filler = cheapest
        .get(pos)!
        .find(
          s =>
            !pickedIds.has(s.player.id) &&
            (perClub.get(s.player.team) ?? 0) < MAX_PER_CLUB &&
            spend + s.player.now_cost + reserveFor(s) <= BUDGET
        );
      if (!filler) break; // cannot complete legally; return what we have
      take(filler);
    }
  }

  // Hill-climb: repeatedly apply the single best affordable swap that raises total
  // projected points. Stops as soon as no improving swap exists.
  for (let pass = 0; pass < MAX_SWAP_PASSES; pass++) {
    let best: { out: Scored; in: Scored; gain: number } | null = null;
    for (const out of picked) {
      for (const cand of scored) {
        if (cand.player.element_type !== out.player.element_type) continue;
        if (pickedIds.has(cand.player.id)) continue;
        const gain = objectiveOf(cand) - objectiveOf(out);
        if (gain <= 0 || (best && gain <= best.gain)) continue;
        if (spend - out.player.now_cost + cand.player.now_cost > BUDGET) continue;
        // The outgoing player frees a slot at his own club.
        const clubCount =
          (perClub.get(cand.player.team) ?? 0) -
          (cand.player.team === out.player.team ? 1 : 0);
        if (clubCount >= MAX_PER_CLUB) continue;
        best = { out, in: cand, gain };
      }
    }
    if (!best) break;

    picked[picked.indexOf(best.out)] = best.in;
    pickedIds.delete(best.out.player.id);
    pickedIds.add(best.in.player.id);
    perClub.set(best.out.player.team, (perClub.get(best.out.player.team) ?? 1) - 1);
    perClub.set(best.in.player.team, (perClub.get(best.in.player.team) ?? 0) + 1);
    spend += best.in.player.now_cost - best.out.player.now_cost;
  }

  return { picked, spend, total: picked.reduce((sum, s) => sum + objectiveOf(s), 0) };
  }

  // The requested strategy is the objective. For the projection build, seed from all
  // three orderings and keep whichever lands highest — a single greedy start is what
  // let another strategy beat it on its own metric.
  const objectiveOf = (s: Scored) => rankScore(strategy, s.xPts, s.player);
  const seeds: BuildStrategy[] = strategy === 'projection' ? STRATEGIES : [strategy];
  let run = attempt(s => rankScore(seeds[0], s.xPts, s.player), objectiveOf);
  for (const seed of seeds.slice(1)) {
    const other = attempt(s => rankScore(seed, s.xPts, s.player), objectiveOf);
    if (other.total > run.total) run = other;
  }
  const { picked, spend } = run;

  const xi = chooseStartingXI(picked, STARTERS);
  const starters = picked
    .filter(s => xi.has(s.player.id))
    .sort((a, b) => a.player.element_type - b.player.element_type || b.xPts - a.xPts);
  // FPL orders the bench with the reserve keeper first, then by preference.
  const bench = picked
    .filter(s => !xi.has(s.player.id))
    .sort(
      (a, b) =>
        Number(b.player.element_type === 1) - Number(a.player.element_type === 1) ||
        b.xPts - a.xPts
    );

  const ranked = [...starters].sort((a, b) => b.xPts - a.xPts);
  const captainId = ranked[0]?.player.id;
  const viceCaptainId = ranked[1]?.player.id;

  const ordered = [...starters, ...bench];
  const picks: PickInfo[] = ordered.map((s, i) => ({
    playerId: s.player.id,
    position: i + 1,
    elementType: s.player.element_type,
    isCaptain: s.player.id === captainId,
    isViceCaptain: s.player.id === viceCaptainId,
    multiplier: i < STARTERS ? (s.player.id === captainId ? 2 : 1) : 0,
  }));

  return {
    squad: ordered.map(s => s.player),
    picks,
    teamValue: spend,
    bank: BUDGET - spend,
    totalXPts:
      Math.round(
        starters.reduce((sum, s) => sum + s.xPts * (s.player.id === captainId ? 2 : 1), 0) * 10
      ) / 10,
    strategy,
  };
}
