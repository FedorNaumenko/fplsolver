// FPL API client
// Official FPL API endpoints (unofficial but stable)

const FPL_API_BASE = 'https://fantasy.premierleague.com/api';

export class FPLApi {
  /**
   * Get all static game data (players, teams, gameweeks, etc.)
   * This is the main endpoint - fetch once and cache
   */
  static async getBootstrapStatic() {
    const response = await fetch(`${FPL_API_BASE}/bootstrap-static/`, {
      next: { revalidate: 300 }, // cache for 5 minutes — data rarely changes mid-session
    });
    if (!response.ok) {
      throw new Error('Failed to fetch bootstrap data');
    }
    return response.json();
  }

  /**
   * Get all fixtures
   */
  static async getFixtures() {
    const response = await fetch(`${FPL_API_BASE}/fixtures/`);
    if (!response.ok) {
      throw new Error('Failed to fetch fixtures');
    }
    return response.json();
  }

  /**
   * Get detailed data for a specific player
   * @param playerId - The player's ID
   */
  static async getPlayerDetails(playerId: number) {
    const response = await fetch(`${FPL_API_BASE}/element-summary/${playerId}/`);
    if (!response.ok) {
      throw new Error(`Failed to fetch player ${playerId} details`);
    }
    return response.json();
  }

  /**
   * Get live gameweek data
   * @param gameweek - The gameweek number
   */
  static async getLiveGameweek(gameweek: number) {
    const response = await fetch(`${FPL_API_BASE}/event/${gameweek}/live/`);
    if (!response.ok) {
      throw new Error(`Failed to fetch gameweek ${gameweek} live data`);
    }
    return response.json();
  }

  /**
   * Get a specific manager's team
   * @param managerId - The manager's ID (found in FPL URL)
   */
  static async getManagerTeam(managerId: number) {
    const response = await fetch(`${FPL_API_BASE}/entry/${managerId}/`);
    if (!response.ok) {
      throw new Error(`Failed to fetch manager ${managerId} data`);
    }
    return response.json();
  }

  /**
   * Get a manager's picks for a specific gameweek
   * @param managerId - The manager's ID
   * @param gameweek - The gameweek number
   */
  static async getManagerPicks(managerId: number, gameweek: number) {
    const response = await fetch(`${FPL_API_BASE}/entry/${managerId}/event/${gameweek}/picks/`);
    if (!response.ok) {
      throw new Error(`Failed to fetch manager ${managerId} picks for GW${gameweek}`);
    }
    return response.json();
  }
}
