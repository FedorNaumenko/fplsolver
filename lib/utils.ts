// Utility functions

import type { Player, Position } from './types';

/**
 * GitHub Pages serves this app from a subpath. Next prefixes basePath onto `Link`
 * and `next/image`, but NOT onto a raw `<img src>` or a `metadata.icons` entry, so
 * anything pointing at /public has to say it explicitly. Verified against the
 * emitted HTML — a dropped prefix 404s silently.
 */
export const BASE_PATH = '/fplsolver';

/**
 * Format price from API (in tenths) to display format
 * @param price - Price in tenths (e.g., 100 = £10.0m)
 */
export function formatPrice(price: number): string {
  return `£${(price / 10).toFixed(1)}m`;
}

/**
 * Get position name from element_type
 */
export function getPositionName(elementType: number): Position {
  const positions: Record<number, Position> = {
    1: 'GK',
    2: 'DEF',
    3: 'MID',
    4: 'FWD',
  };
  return positions[elementType] || 'FWD';
}

/**
 * Get full player name
 */
export function getPlayerName(player: Player): string {
  return `${player.first_name} ${player.second_name}`;
}

/**
 * Get status description
 */
export function getStatusDescription(status: Player['status']): string {
  const statusMap: Record<Player['status'], string> = {
    a: 'Available',
    d: 'Doubtful',
    i: 'Injured',
    s: 'Suspended',
    u: 'Unavailable',
  };
  return statusMap[status];
}

/**
 * Check if player is available for selection
 */
export function isPlayerAvailable(player: Player): boolean {
  return player.status === 'a' && 
         (player.chance_of_playing_this_round === null || player.chance_of_playing_this_round >= 75);
}

/**
 * The rate stats worth showing for a player's position.
 *
 * xGI is meaningless for goalkeepers — `expected_goal_involvements_per_90` is 0.00-0.01
 * for every keeper in the game, so showing it is worse than showing nothing. Keepers are
 * judged on shot-stopping and clean sheets; defenders on clean sheets with a nod to
 * attacking threat; midfielders and forwards on goals and assists.
 *
 * There is no `expected_saves` field in the API; `saves_per_90` is the available rate.
 */
export function positionStats(player: Player): { label: string; value: string }[] {
  const n = (v: unknown) => Number(v) || 0;
  switch (player.element_type) {
    case 1: // GK
      return [
        { label: 'saves/90', value: n(player.saves_per_90).toFixed(2) },
        { label: 'xGC/90', value: n(player.expected_goals_conceded_per_90).toFixed(2) },
        { label: 'CS/90', value: n(player.clean_sheets_per_90).toFixed(2) },
      ];
    case 2: // DEF
      return [
        { label: 'xGC/90', value: n(player.expected_goals_conceded_per_90).toFixed(2) },
        { label: 'CS/90', value: n(player.clean_sheets_per_90).toFixed(2) },
        { label: 'xGI/90', value: n(player.expected_goal_involvements_per_90).toFixed(2) },
      ];
    default: // MID, FWD
      return [
        { label: 'xG/90', value: n(player.expected_goals_per_90).toFixed(2) },
        { label: 'xA/90', value: n(player.expected_assists_per_90).toFixed(2) },
      ];
  }
}

/**
 * Sort players by a specific metric
 */
export function sortPlayers(
  players: Player[],
  sortBy: 'points' | 'form' | 'price' | 'value',
  order: 'asc' | 'desc' = 'desc'
): Player[] {
  const sorted = [...players].sort((a, b) => {
    let aVal: number, bVal: number;
    
    switch (sortBy) {
      case 'points':
        aVal = a.total_points;
        bVal = b.total_points;
        break;
      case 'form':
        aVal = parseFloat(a.form);
        bVal = parseFloat(b.form);
        break;
      case 'price':
        aVal = a.now_cost;
        bVal = b.now_cost;
        break;
      case 'value':
        aVal = a.total_points / a.now_cost;
        bVal = b.total_points / b.now_cost;
        break;
    }
    
    return order === 'desc' ? bVal - aVal : aVal - bVal;
  });
  
  return sorted;
}
