// Minimal CORS proxy for the FPL API, which sends no access-control-allow-origin
// header (and cross-origin-resource-policy: same-origin), so a static site cannot
// call it directly from the browser.
//
// Deploy once: https://workers.cloudflare.com -> Create Worker -> paste this -> Deploy.
// Then set the repo variable FPL_PROXY to the worker URL, no trailing slash:
//   https://github.com/FedorNaumenko/fplsolver/settings/variables/actions
//
// Maps https://<worker>/<path> -> https://fantasy.premierleague.com/api/<path>,
// so lib/api/fpl.ts needs no change beyond its base URL.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
};

const handler = {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS });
    }

    const { pathname, search } = new URL(request.url);
    const upstream = await fetch(
      `https://fantasy.premierleague.com/api${pathname}${search}`,
      {
        headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
        // Edge-cache for 5min: bootstrap-static is 1.3MB and every page load wants it.
        cf: { cacheTtl: 300, cacheEverything: true },
      }
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
    });
  },
};

export default handler;
