// FPL API client
// Official FPL API endpoints (unofficial but stable)
//
// These now run in the browser (GitHub Pages is static — no server routes), and
// the FPL API sends no CORS headers, so calls must go through a proxy:
//   dev  -> the /fpl rewrite in next.config.ts (server-side, no CORS involved)
//   prod -> NEXT_PUBLIC_FPL_PROXY, a tiny Worker (see worker/fpl-proxy.js)
const FPL_API_BASE = process.env.NEXT_PUBLIC_FPL_PROXY || '/fplsolver/fpl';

// ponytail: bootstrap-static is 1.3MB and three call paths want it per load.
// Dedupes to one request; a rejection clears the cache so a retry can succeed.
// Refresh = page reload, which is how the app was already used.
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => (inFlight ??= fn().catch(err => { inFlight = null; throw err; }));
}

async function getJSON(path: string, errorMessage: string) {
  const response = await fetch(`${FPL_API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return response.json();
}

export class FPLApi {
  /**
   * Get all static game data (players, teams, gameweeks, etc.)
   * This is the main endpoint - fetch once and cache
   */
  static getBootstrapStatic = once(() =>
    getJSON('/bootstrap-static/', 'Failed to fetch bootstrap data')
  );

  /**
   * Get all fixtures
   */
  static getFixtures = once(() => getJSON('/fixtures/', 'Failed to fetch fixtures'));

  /**
   * Get detailed data for a specific player
   * @param playerId - The player's ID
   */
  static async getPlayerDetails(playerId: number) {
    return getJSON(
      `/element-summary/${playerId}/`,
      `Failed to fetch player ${playerId} details`
    );
  }

  /**
   * Get live gameweek data
   * @param gameweek - The gameweek number
   */
  static async getLiveGameweek(gameweek: number) {
    return getJSON(
      `/event/${gameweek}/live/`,
      `Failed to fetch gameweek ${gameweek} live data`
    );
  }

  /**
   * Get a specific manager's team
   * @param managerId - The manager's ID (found in FPL URL)
   */
  static async getManagerTeam(managerId: number) {
    return getJSON(`/entry/${managerId}/`, `Failed to fetch manager ${managerId} data`);
  }

  /**
   * Get a manager's picks for a specific gameweek
   * @param managerId - The manager's ID
   * @param gameweek - The gameweek number
   */
  static async getManagerPicks(managerId: number, gameweek: number) {
    return getJSON(
      `/entry/${managerId}/event/${gameweek}/picks/`,
      `Failed to fetch manager ${managerId} picks for GW${gameweek}`
    );
  }
}
