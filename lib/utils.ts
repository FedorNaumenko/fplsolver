// Utility functions

import type { Player, Position } from './types';

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
